package com.whispernet.service;

import org.bouncycastle.crypto.generators.SCrypt;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HexFormat;

@Service
public class CryptoService {

    private static final String CIPHER_ALGO = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH_BITS = 128; // 16 bytes
    private static final int GCM_TAG_LENGTH_BYTES = 16;
    private static final int SCRYPT_N = 16384;
    private static final int SCRYPT_R = 8;
    private static final int SCRYPT_P = 1;
    private static final int KEY_LENGTH_BYTES = 32;

    private final SecureRandom secureRandom = new SecureRandom();
    private final HexFormat hexFormat = HexFormat.of();

    public byte[] generateRandomBytes(int length) {
        byte[] bytes = new byte[length];
        secureRandom.nextBytes(bytes);
        return bytes;
    }

    public String generateId() {
        return toHex(generateRandomBytes(16));
    }

    public String generateAdminToken() {
        return toHex(generateRandomBytes(24));
    }

    public String generateToken() {
        byte[] p1 = generateRandomBytes(4);
        byte[] p2 = generateRandomBytes(4);
        byte[] p3 = generateRandomBytes(4);
        byte[] p4 = generateRandomBytes(4);
        return String.format(
                "WNET-%s-%s-%s-%s",
                toHex(p1).toUpperCase(),
                toHex(p2).toUpperCase(),
                toHex(p3).toUpperCase(),
                toHex(p4).toUpperCase()
        );
    }

    public String toHex(byte[] bytes) {
        return hexFormat.formatHex(bytes);
    }

    public byte[] fromHex(String hex) {
        return hexFormat.parseHex(hex);
    }

    public byte[] deriveKey(String password, byte[] salt) {
        byte[] passwordBytes = password.getBytes(StandardCharsets.UTF_8);
        return SCrypt.generate(passwordBytes, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, KEY_LENGTH_BYTES);
    }

    public EncryptionResult encrypt(String plainText, byte[] key, byte[] iv) throws Exception {
        Cipher cipher = Cipher.getInstance(CIPHER_ALGO);
        SecretKeySpec keySpec = new SecretKeySpec(key, "AES");
        GCMParameterSpec parameterSpec = new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv);

        cipher.init(Cipher.ENCRYPT_MODE, keySpec, parameterSpec);
        byte[] cipherTextWithTag = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));

        int cipherTextLength = cipherTextWithTag.length - GCM_TAG_LENGTH_BYTES;
        byte[] cipherText = new byte[cipherTextLength];
        byte[] authTag = new byte[GCM_TAG_LENGTH_BYTES];

        System.arraycopy(cipherTextWithTag, 0, cipherText, 0, cipherTextLength);
        System.arraycopy(cipherTextWithTag, cipherTextLength, authTag, 0, GCM_TAG_LENGTH_BYTES);

        return new EncryptionResult(toHex(cipherText), toHex(authTag));
    }

    public String decrypt(String encryptedHex, String authTagHex, byte[] key, byte[] iv) throws Exception {
        byte[] cipherText = fromHex(encryptedHex);
        byte[] authTag = fromHex(authTagHex);

        byte[] cipherTextWithTag = new byte[cipherText.length + authTag.length];
        System.arraycopy(cipherText, 0, cipherTextWithTag, 0, cipherText.length);
        System.arraycopy(authTag, 0, cipherTextWithTag, cipherText.length, authTag.length);

        Cipher cipher = Cipher.getInstance(CIPHER_ALGO);
        SecretKeySpec keySpec = new SecretKeySpec(key, "AES");
        GCMParameterSpec parameterSpec = new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv);

        cipher.init(Cipher.DECRYPT_MODE, keySpec, parameterSpec);
        byte[] decryptedBytes = cipher.doFinal(cipherTextWithTag);

        return new String(decryptedBytes, StandardCharsets.UTF_8);
    }

    public static class EncryptionResult {
        private final String encrypted;
        private final String authTag;

        public EncryptionResult(String encrypted, String authTag) {
            this.encrypted = encrypted;
            this.authTag = authTag;
        }

        public String getEncrypted() {
            return encrypted;
        }

        public String getAuthTag() {
            return authTag;
        }
    }
}
