package com.whispernet.controller;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.whispernet.model.SecretEntity;
import com.whispernet.repository.SecretRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class SecretControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SecretRepository secretRepository;

    private static RequestPostProcessor withClientIp(String ip) {
        return request -> {
            request.setRemoteAddr(ip);
            return request;
        };
    }

    private String createValidClientPayload(boolean burnOnRead, String verifier) {
        String mockCiphertext = "4a8b1c2d3e4f5a6b7c8d";
        String mockIv = "0102030405060708090a0b0c";
        String mockSalt = "11".repeat(32);
        String mockAuthTag = "22".repeat(16);
        return String.format("""
            {
                "clientEncrypted": true,
                "encrypted": "%s",
                "iv": "%s",
                "salt": "%s",
                "authTag": "%s",
                "tokenVerifier": "%s",
                "expiration": "3600",
                "burnOnRead": %b
            }
            """, mockCiphertext, mockIv, mockSalt, mockAuthTag, verifier, burnOnRead);
    }

    @Test
    @DisplayName("Plaintext Rejection: Attempting to send raw secret is rejected with 400 Bad Request")
    void testPlaintextSecretRejected() throws Exception {
        String payload = """
            {
                "secret": "MySuperSecretValue123",
                "expiration": "3600",
                "burnOnRead": true
            }
            """;

        mockMvc.perform(post("/api/secrets")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Server-side encryption is disabled. Secrets must be encrypted client-side using WebCrypto before transmission."));
    }

    @Test
    @DisplayName("Complete Lifecycle: Create secret -> check metadata -> decrypt -> verify burnOnRead")
    void testCompleteSecretLifecycle() throws Exception {
        String validVerifier = "33".repeat(32);
        String createPayload = createValidClientPayload(true, validVerifier);

        MvcResult createResult = mockMvc.perform(post("/api/secrets")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createPayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.adminToken").exists())
                .andExpect(jsonPath("$.clientEncrypted").value(true))
                .andReturn();

        JsonNode createNode = objectMapper.readTree(createResult.getResponse().getContentAsString());
        String id = createNode.get("id").asText();

        // 2. Metadata check
        mockMvc.perform(get("/api/secrets/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.exists").value(true))
                .andExpect(jsonPath("$.clientEncrypted").value(true));

        // 3. Decrypt Secret
        String decryptPayload = String.format("""
            {
                "tokenVerifier": "%s"
            }
            """, validVerifier);

        mockMvc.perform(post("/api/secrets/" + id + "/decrypt")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(decryptPayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clientEncrypted").value(true))
                .andExpect(jsonPath("$.encrypted").value("4a8b1c2d3e4f5a6b7c8d"));

        // 4. Since burnOnRead is true, subsequent metadata or decrypt should return 404
        mockMvc.perform(get("/api/secrets/" + id))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Manage Secret: Pause and Resume secret decryption")
    void testPauseAndResume() throws Exception {
        String validVerifier = "44".repeat(32);
        String createPayload = createValidClientPayload(false, validVerifier);

        MvcResult createResult = mockMvc.perform(post("/api/secrets")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createPayload))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode createNode = objectMapper.readTree(createResult.getResponse().getContentAsString());
        String id = createNode.get("id").asText();
        String adminToken = createNode.get("adminToken").asText();

        // 2. Pause secret
        String pausePayload = String.format("""
            {
                "adminToken": "%s",
                "action": "pause"
            }
            """, adminToken);

        mockMvc.perform(post("/api/secrets/" + id + "/manage")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pausePayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isPaused").value(true));

        // 3. Attempt to decrypt while paused -> Expect 403
        String decryptPayload = String.format("""
            {
                "tokenVerifier": "%s"
            }
            """, validVerifier);

        mockMvc.perform(post("/api/secrets/" + id + "/decrypt")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(decryptPayload))
                .andExpect(status().isForbidden());

        // 4. Resume secret
        String resumePayload = String.format("""
            {
                "adminToken": "%s",
                "action": "resume"
            }
            """, adminToken);

        mockMvc.perform(post("/api/secrets/" + id + "/manage")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(resumePayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isPaused").value(false));

        // 5. Attempt decrypt again -> Expect 200
        mockMvc.perform(post("/api/secrets/" + id + "/decrypt")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(decryptPayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clientEncrypted").value(true));
    }

    @Test
    @DisplayName("Metadata Check: Exposes burnOnRead and isPaused states")
    void testMetadataExposesBurnOnReadAndPausedState() throws Exception {
        String validVerifier = "55".repeat(32);
        String createPayload = createValidClientPayload(true, validVerifier);

        MvcResult createResult = mockMvc.perform(post("/api/secrets")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createPayload))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode createNode = objectMapper.readTree(createResult.getResponse().getContentAsString());
        String id = createNode.get("id").asText();
        String adminToken = createNode.get("adminToken").asText();

        // 1. Initial metadata check
        mockMvc.perform(get("/api/secrets/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.exists").value(true))
                .andExpect(jsonPath("$.burnOnRead").value(true))
                .andExpect(jsonPath("$.isPaused").value(false));

        // 2. Pause secret and verify metadata reflects paused state
        String pausePayload = String.format("""
            {
                "adminToken": "%s",
                "action": "pause"
            }
            """, adminToken);

        mockMvc.perform(post("/api/secrets/" + id + "/manage")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pausePayload))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/secrets/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isPaused").value(true));
    }

    @Test
    @DisplayName("Brute Force Defense: Consecutive wrong token attempts decrement remaining and destroy burnOnRead secret")
    void testBruteForceProtectionAndAttemptLimit() throws Exception {
        String validVerifier = "66".repeat(32);
        String createPayload = createValidClientPayload(true, validVerifier);

        MvcResult createResult = mockMvc.perform(post("/api/secrets")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createPayload))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode createNode = objectMapper.readTree(createResult.getResponse().getContentAsString());
        String id = createNode.get("id").asText();

        String wrongTokenPayload = """
            {
                "tokenVerifier": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
            }
            """;

        // Attempts 1 to 4 should return 401 with remaining attempts message
        for (int i = 1; i <= 4; i++) {
            mockMvc.perform(post("/api/secrets/" + id + "/decrypt")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(wrongTokenPayload))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("attempts remaining")));
        }

        // 5th failed attempt should exceed max attempts and destroy the burn-on-read secret
        mockMvc.perform(post("/api/secrets/" + id + "/decrypt")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(wrongTokenPayload))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("Maximum attempts exceeded")));

        // Subsequent check should return 404 Not Found as secret was permanently destroyed
        mockMvc.perform(get("/api/secrets/" + id))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Zero-Knowledge Lifecycle: Client-side encrypted payload stored and retrieved with burn-on-read")
    void testZeroKnowledgeClientEncryptedLifecycle() throws Exception {
        String mockCiphertext = "4a8b1c2d3e4f5a6b7c8d";
        String mockIv = "0102030405060708090a0b0c";
        String mockSalt = "11".repeat(32);
        String mockAuthTag = "22".repeat(16);
        String validToken = "WNET-AAAA-BBBB";
        
        java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
        byte[] hash = md.digest(("WHISPERNET-AUTH:" + validToken).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        for (byte b : hash) sb.append(String.format("%02x", b));
        String validVerifier = sb.toString();

        String createPayload = String.format("""
            {
                "clientEncrypted": true,
                "encrypted": "%s",
                "iv": "%s",
                "salt": "%s",
                "authTag": "%s",
                "tokenVerifier": "%s",
                "expiration": "3600",
                "burnOnRead": true
            }
            """, mockCiphertext, mockIv, mockSalt, mockAuthTag, validVerifier);

        // 1. Create client-encrypted secret
        MvcResult createResult = mockMvc.perform(post("/api/secrets")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createPayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.clientEncrypted").value(true))
                .andReturn();

        JsonNode createNode = objectMapper.readTree(createResult.getResponse().getContentAsString());
        String id = createNode.get("id").asText();

        // 2. Metadata check (must expose salt for client-side verifier derivation)
        mockMvc.perform(get("/api/secrets/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clientEncrypted").value(true))
                .andExpect(jsonPath("$.burnOnRead").value(true))
                .andExpect(jsonPath("$.isPaused").value(false))
                .andExpect(jsonPath("$.salt").value(mockSalt));

        // 3. Failed attempt with invalid verifier (wrong token or passphrase must NOT burn secret)
        String wrongDecryptPayload = """
            {
                "tokenVerifier": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
            }
            """;
        mockMvc.perform(post("/api/secrets/" + id + "/decrypt")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(wrongDecryptPayload))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("attempts remaining")));

        // 4. Successful attempt with valid verifier returns ciphertext for client decryption
        String validDecryptPayload = String.format("""
            {
                "tokenVerifier": "%s"
            }
            """, validVerifier);
        mockMvc.perform(post("/api/secrets/" + id + "/decrypt")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validDecryptPayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clientEncrypted").value(true))
                .andExpect(jsonPath("$.encrypted").value(mockCiphertext))
                .andExpect(jsonPath("$.iv").value(mockIv))
                .andExpect(jsonPath("$.authTag").value(mockAuthTag));

        // 5. Burn-on-read verified: secret no longer exists
        mockMvc.perform(get("/api/secrets/" + id))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Manage Secret: Wrong adminToken returns 403 and valid delete removes secret")
    void testManageForbiddenAndDelete() throws Exception {
        String validVerifier = "77".repeat(32);
        String createPayload = createValidClientPayload(false, validVerifier);

        MvcResult createResult = mockMvc.perform(post("/api/secrets")
                        .with(withClientIp("10.0.0.10"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createPayload))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode node = objectMapper.readTree(createResult.getResponse().getContentAsString());
        String id = node.get("id").asText();
        String adminToken = node.get("adminToken").asText();

        // Wrong adminToken -> 403 Forbidden
        mockMvc.perform(post("/api/secrets/" + id + "/manage")
                        .with(withClientIp("10.0.0.10"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "adminToken": "wrong-admin-token",
                                "action": "delete"
                            }
                            """))
                .andExpect(status().isForbidden());

        // Valid adminToken delete -> 200 OK and removed
        mockMvc.perform(post("/api/secrets/" + id + "/manage")
                        .with(withClientIp("10.0.0.10"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(String.format("""
                            {
                                "adminToken": "%s",
                                "action": "delete"
                            }
                            """, adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.deleted").value(true));

        mockMvc.perform(get("/api/secrets/" + id))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Expiration Handling: Expired secret returns 410 Gone and commits deletion")
    void testExpiredSecretReturnsGoneAndDeletesRow() throws Exception {
        String expiredId = "expired0123456789abcdef012345678";
        SecretEntity expired = new SecretEntity(
                expiredId,
                "4a8b1c2d",
                "0102030405060708090a0b0c",
                "11".repeat(32),
                "22".repeat(16),
                System.currentTimeMillis() - 10_000L,
                false,
                "adminTokenValue0123456789abcdef0123456789abcdef",
                false,
                System.currentTimeMillis() - 20_000L,
                true,
                "33".repeat(32)
        );
        secretRepository.save(expired);

        mockMvc.perform(get("/api/secrets/" + expiredId))
                .andExpect(status().isGone());

        // Verify delete was NOT rolled back by @Transactional
        assertTrue(secretRepository.findById(expiredId).isEmpty());
    }

    @Test
    @DisplayName("Multi-Use Brute Force Lockout: 5 failed attempts lock secret with 429 without deleting it")
    void testMultiUseSecretLockoutAfterFiveFailedAttempts() throws Exception {
        String validVerifier = "88".repeat(32);
        String createPayload = createValidClientPayload(false, validVerifier);

        MvcResult createResult = mockMvc.perform(post("/api/secrets")
                        .with(withClientIp("10.0.0.11"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createPayload))
                .andExpect(status().isOk())
                .andReturn();

        String id = objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asText();
        String wrongPayload = """
            {
                "tokenVerifier": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
            }
            """;

        for (int i = 1; i <= 4; i++) {
            mockMvc.perform(post("/api/secrets/" + id + "/decrypt")
                            .with(withClientIp("10.0.0.11"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(wrongPayload))
                    .andExpect(status().isUnauthorized());
        }

        // 5th failed attempt locks multi-use secret with 429
        mockMvc.perform(post("/api/secrets/" + id + "/decrypt")
                        .with(withClientIp("10.0.0.11"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(wrongPayload))
                .andExpect(status().isTooManyRequests());

        // Secret metadata still exists (not deleted)
        mockMvc.perform(get("/api/secrets/" + id))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("Client-Encrypted Input Validation: Invalid hex parameters rejected with 400 Bad Request")
    void testInvalidClientEncryptedParametersRejected() throws Exception {
        String badPayload = """
            {
                "clientEncrypted": true,
                "encrypted": "not-valid-hex!",
                "iv": "short",
                "salt": "short",
                "authTag": "short",
                "tokenVerifier": "short",
                "expiration": "3600"
            }
            """;

        mockMvc.perform(post("/api/secrets")
                        .with(withClientIp("10.0.0.12"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(badPayload))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Rate Limiting: Exceeding 30 requests/min from same IP returns 429 with Retry-After header")
    void testRateLimitingEnforced() throws Exception {
        String invalidPayload = """
            {
                "clientEncrypted": false
            }
            """;

        for (int i = 0; i < 30; i++) {
            mockMvc.perform(post("/api/secrets")
                            .with(withClientIp("10.0.0.99"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(invalidPayload))
                    .andExpect(status().isBadRequest());
        }

        mockMvc.perform(post("/api/secrets")
                        .with(withClientIp("10.0.0.99"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidPayload))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"));
    }
}
