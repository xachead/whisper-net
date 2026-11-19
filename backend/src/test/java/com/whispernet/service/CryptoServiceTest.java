package com.whispernet.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.crypto.AEADBadTagException;

import static org.junit.jupiter.api.Assertions.*;

class CryptoServiceTest {

    private CryptoService cryptoService;

    @BeforeEach
    void setUp() {
        cryptoService = new CryptoService();
    }

    @Test
    @DisplayName("Should successfully encrypt and decrypt text with AES-256-GCM and Scrypt")
    void testEncryptDecryptSuccess() throws Exception {
        String originalSecret = "Top-Secret-Message-12345!@#";
        String token = cryptoService.generateToken();
        String passphrase = "my-strong-password";
        byte[] salt = cryptoService.generateRandomBytes(32);

        byte[] key = cryptoService.deriveKey(token + passphrase, salt);
        byte[] iv = cryptoService.generateRandomBytes(12);

        CryptoService.EncryptionResult result = cryptoService.encrypt(originalSecret, key, iv);

        assertNotNull(result.getEncrypted());
        assertNotNull(result.getAuthTag());

        String decrypted = cryptoService.decrypt(result.getEncrypted(), result.getAuthTag(), key, iv);
        assertEquals(originalSecret, decrypted);
    }

    @Test
    @DisplayName("Should fail decryption when wrong key is provided")
    void testDecryptionFailsWithWrongKey() throws Exception {
        String originalSecret = "Sensitive Information";
        byte[] salt = cryptoService.generateRandomBytes(32);
        byte[] key1 = cryptoService.deriveKey("correct-key", salt);
        byte[] key2 = cryptoService.deriveKey("wrong-key", salt);
        byte[] iv = cryptoService.generateRandomBytes(12);

        CryptoService.EncryptionResult result = cryptoService.encrypt(originalSecret, key1, iv);

        assertThrows(AEADBadTagException.class, () ->
                cryptoService.decrypt(result.getEncrypted(), result.getAuthTag(), key2, iv)
        );
    }

    @Test
    @DisplayName("Should fail decryption when ciphertext or authTag is tampered with")
    void testDecryptionFailsOnTamperedCiphertext() throws Exception {
        byte[] salt = cryptoService.generateRandomBytes(32);
        byte[] key = cryptoService.deriveKey("valid-key", salt);
        byte[] iv = cryptoService.generateRandomBytes(12);

        CryptoService.EncryptionResult result = cryptoService.encrypt("Integrity Protected", key, iv);
        String tamperedTag = (result.getAuthTag().startsWith("00") ? "ff" : "00") + result.getAuthTag().substring(2);

        assertThrows(AEADBadTagException.class, () ->
                cryptoService.decrypt(result.getEncrypted(), tamperedTag, key, iv)
        );
    }

    @Test
    @DisplayName("Should generate 128-bit token in WNET-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX format")
    void testTokenFormat() {
        String token = cryptoService.generateToken();
        assertNotNull(token);
        assertTrue(
                token.matches("^WNET-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}$"),
                "Token should match 128-bit WNET-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX format"
        );
    }
}
