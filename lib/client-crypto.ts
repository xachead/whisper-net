/**
 * Client-Side Zero-Knowledge Cryptography Module for WhisperNet
 * Uses standard W3C WebCrypto API (crypto.subtle)
 * All encryption and decryption occurs locally inside the browser.
 * The server never receives plaintext secrets, raw tokens, derived AES keys, or user passphrases.
 */

const PBKDF2_ITERATIONS = 600_000;
const HKDF_ENC_INFO = 'whispernet-aes-gcm-key-v1';
const HKDF_VERIFIER_INFO = 'whispernet-auth-verifier-v1';

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function fromHex(hex: string): Uint8Array {
  const cleanHex = hex.trim();
  if (cleanHex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new Error('Invalid hexadecimal input');
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

function getCrypto(): Crypto {
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto;
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto;
  }
  throw new Error('WebCrypto API is not supported in this runtime environment');
}

/**
 * Generates a 128-bit (16-byte) cryptographically random uppercase token
 * formatted as WNET-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX.
 */
export function generateToken(): string {
  const crypto = getCrypto();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const parts = [
    toHex(bytes.subarray(0, 4)).toUpperCase(),
    toHex(bytes.subarray(4, 8)).toUpperCase(),
    toHex(bytes.subarray(8, 12)).toUpperCase(),
    toHex(bytes.subarray(12, 16)).toUpperCase(),
  ];
  return `WNET-${parts.join('-')}`;
}

function buildKeyMaterial(token: string, passphrase?: string): string {
  const normalized = token.trim().toUpperCase();
  return passphrase ? `${normalized}:${passphrase}` : normalized;
}

/**
 * Derives a non-extractable HKDF base key from token (+ optional passphrase) and salt
 * using PBKDF2-HMAC-SHA256 (600,000 iterations).
 */
async function deriveMasterHkdfKey(
  token: string,
  salt: Uint8Array,
  passphrase?: string
): Promise<CryptoKey> {
  const crypto = getCrypto();
  const encoder = new TextEncoder();
  const keyMaterial = buildKeyMaterial(token, passphrase);

  const pbkdf2Key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(keyMaterial),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const masterBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    pbkdf2Key,
    256
  );

  return crypto.subtle.importKey(
    'raw',
    masterBits,
    { name: 'HKDF' },
    false,
    ['deriveKey', 'deriveBits']
  );
}

async function deriveAesKeyFromMaster(hkdfKey: CryptoKey, salt: Uint8Array): Promise<CryptoKey> {
  const crypto = getCrypto();
  const encoder = new TextEncoder();
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      info: encoder.encode(HKDF_ENC_INFO),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function deriveVerifierFromMaster(hkdfKey: CryptoKey, salt: Uint8Array): Promise<string> {
  const crypto = getCrypto();
  const encoder = new TextEncoder();
  const verifierBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      info: encoder.encode(HKDF_VERIFIER_INFO),
    },
    hkdfKey,
    256
  );
  return toHex(new Uint8Array(verifierBits));
}

/**
 * Computes a salted, domain-separated authentication verifier from token (+ optional passphrase)
 * using PBKDF2-HMAC-SHA256 (600,000 iterations) + HKDF-SHA-256.
 * Sent to the server so it can verify both token and passphrase validity before burning/returning
 * ciphertext without ever learning the token, passphrase, or derived AES encryption key.
 */
export async function computeTokenVerifier(
  token: string,
  saltHex: string,
  passphrase?: string
): Promise<string> {
  const salt = fromHex(saltHex);
  const hkdfKey = await deriveMasterHkdfKey(token, salt, passphrase);
  return deriveVerifierFromMaster(hkdfKey, salt);
}

export interface ClientEncryptionResult {
  encrypted: string;     // Hex ciphertext
  authTag: string;       // 16-byte hex authentication tag
  iv: string;            // 12-byte hex initialization vector
  salt: string;          // 32-byte hex salt
  tokenVerifier: string; // HKDF-derived verifier for zero-knowledge server authentication
  token: string;         // 128-bit secret token (kept client-side in URL hash)
}

/**
 * Encrypts a secret client-side using WebCrypto AES-256-GCM with PBKDF2 + HKDF key derivation.
 */
export async function encryptZeroKnowledge(
  plainText: string,
  token?: string,
  passphrase?: string
): Promise<ClientEncryptionResult> {
  const crypto = getCrypto();
  const secretToken = token ? token.trim().toUpperCase() : generateToken();
  const salt = new Uint8Array(32);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(salt);
  crypto.getRandomValues(iv);

  const hkdfKey = await deriveMasterHkdfKey(secretToken, salt, passphrase);
  const [key, tokenVerifier] = await Promise.all([
    deriveAesKeyFromMaster(hkdfKey, salt),
    deriveVerifierFromMaster(hkdfKey, salt),
  ]);

  const encoder = new TextEncoder();
  const plainTextBytes = encoder.encode(plainText);

  // In WebCrypto AES-GCM, the returned ArrayBuffer contains [ciphertext + 16-byte authTag]
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, tagLength: 128 },
    key,
    plainTextBytes
  );

  const cipherBytes = new Uint8Array(cipherBuffer);
  const tagLength = 16;
  const cipherTextLength = cipherBytes.length - tagLength;

  const cipherOnly = cipherBytes.subarray(0, cipherTextLength);
  const authTag = cipherBytes.subarray(cipherTextLength);

  return {
    encrypted: toHex(cipherOnly),
    authTag: toHex(authTag),
    iv: toHex(iv),
    salt: toHex(salt),
    tokenVerifier,
    token: secretToken,
  };
}

/**
 * Decrypts a client-encrypted secret locally in the browser using WebCrypto AES-256-GCM.
 */
export async function decryptZeroKnowledge(
  encryptedHex: string,
  authTagHex: string,
  ivHex: string,
  saltHex: string,
  token: string,
  passphrase?: string
): Promise<string> {
  const crypto = getCrypto();
  const cipherBytes = fromHex(encryptedHex);
  const authTagBytes = fromHex(authTagHex);
  const iv = fromHex(ivHex);
  const salt = fromHex(saltHex);

  const combined = new Uint8Array(cipherBytes.length + authTagBytes.length);
  combined.set(cipherBytes, 0);
  combined.set(authTagBytes, cipherBytes.length);

  const hkdfKey = await deriveMasterHkdfKey(token, salt, passphrase);
  const key = await deriveAesKeyFromMaster(hkdfKey, salt);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, tagLength: 128 },
    key,
    combined as BufferSource
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}
