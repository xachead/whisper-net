import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateToken,
  computeTokenVerifier,
  encryptZeroKnowledge,
  decryptZeroKnowledge,
  fromHex,
  toHex,
} from '../lib/client-crypto.ts';

describe('client-crypto (Zero-Knowledge WebCrypto)', () => {
  it('generates 128-bit tokens in WNET-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX format', () => {
    const token1 = generateToken();
    const token2 = generateToken();
    assert.match(token1, /^WNET-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}$/);
    assert.notEqual(token1, token2);
  });

  it('round-trips hex encoding and rejects malformed hex', () => {
    const bytes = new Uint8Array([0, 15, 16, 255]);
    const hex = toHex(bytes);
    assert.equal(hex, '000f10ff');
    assert.deepEqual(fromHex(hex), bytes);
    assert.throws(() => fromHex('abc'), /Invalid hexadecimal/);
    assert.throws(() => fromHex('zzzz'), /Invalid hexadecimal/);
  });

  it('encrypts and decrypts plaintext with and without passphrase', async () => {
    const plainText = 'DB_PASSWORD=s3cr3t!\nline2: 🔐 unicode';

    const noPass = await encryptZeroKnowledge(plainText);
    assert.equal(noPass.iv.length, 24);
    assert.equal(noPass.salt.length, 64);
    assert.equal(noPass.authTag.length, 32);
    assert.equal(noPass.tokenVerifier.length, 64);

    const decryptedNoPass = await decryptZeroKnowledge(
      noPass.encrypted,
      noPass.authTag,
      noPass.iv,
      noPass.salt,
      noPass.token
    );
    assert.equal(decryptedNoPass, plainText);

    const withPass = await encryptZeroKnowledge(plainText, undefined, 'correct-horse');
    const decryptedWithPass = await decryptZeroKnowledge(
      withPass.encrypted,
      withPass.authTag,
      withPass.iv,
      withPass.salt,
      withPass.token,
      'correct-horse'
    );
    assert.equal(decryptedWithPass, plainText);
  });

  it('changes tokenVerifier when passphrase is wrong (prevents premature burn-on-read)', async () => {
    const encrypted = await encryptZeroKnowledge('Top secret', undefined, 'my-passphrase');

    const matchingVerifier = await computeTokenVerifier(
      encrypted.token.toLowerCase(),
      encrypted.salt,
      'my-passphrase'
    );
    assert.equal(matchingVerifier, encrypted.tokenVerifier);

    const wrongPassVerifier = await computeTokenVerifier(
      encrypted.token,
      encrypted.salt,
      'wrong-passphrase'
    );
    assert.notEqual(wrongPassVerifier, encrypted.tokenVerifier);

    const missingPassVerifier = await computeTokenVerifier(encrypted.token, encrypted.salt);
    assert.notEqual(missingPassVerifier, encrypted.tokenVerifier);
  });

  it('rejects decryption when token, passphrase, or authTag is invalid', async () => {
    const encrypted = await encryptZeroKnowledge('Integrity check', undefined, 'secret-pass');

    await assert.rejects(() =>
      decryptZeroKnowledge(
        encrypted.encrypted,
        encrypted.authTag,
        encrypted.iv,
        encrypted.salt,
        encrypted.token,
        'wrong-pass'
      )
    );

    const tamperedTag = (encrypted.authTag.startsWith('00') ? 'ff' : '00') + encrypted.authTag.slice(2);
    await assert.rejects(() =>
      decryptZeroKnowledge(
        encrypted.encrypted,
        tamperedTag,
        encrypted.iv,
        encrypted.salt,
        encrypted.token,
        'secret-pass'
      )
    );
  });
});
