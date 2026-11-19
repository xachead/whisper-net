package com.whispernet.service;

import com.whispernet.dto.*;
import com.whispernet.model.SecretEntity;
import com.whispernet.repository.SecretRepository;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Service
public class SecretService {

    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final int MAX_ENCRYPTED_HEX_LENGTH = 200000;
    private static final java.util.regex.Pattern HEX_PATTERN = java.util.regex.Pattern.compile("^[0-9a-fA-F]+$");

    private final SecretRepository secretRepository;
    private final CryptoService cryptoService;

    public SecretService(SecretRepository secretRepository, CryptoService cryptoService) {
        this.secretRepository = secretRepository;
        this.cryptoService = cryptoService;
    }

    private boolean isValidHex(String value, Integer expectedLength) {
        if (value == null || value.isEmpty() || value.length() % 2 != 0) {
            return false;
        }
        if (expectedLength != null && value.length() != expectedLength) {
            return false;
        }
        return HEX_PATTERN.matcher(value).matches();
    }

    @Transactional
    public CreateSecretResponse createSecret(CreateSecretRequest request) {
        long now = System.currentTimeMillis();
        long expiresAt = now + (request.getExpirationSeconds() * 1000L);
        String id = cryptoService.generateId();
        String adminToken = cryptoService.generateAdminToken();

        // Reject any attempt to transmit raw plaintext or bypass client-side encryption
        if (request.getSecret() != null && !request.getSecret().trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Server-side encryption is disabled. Secrets must be encrypted client-side using WebCrypto before transmission.");
        }

        if (!request.getClientEncrypted() || request.getEncrypted() == null || request.getIv() == null
                || request.getSalt() == null || request.getAuthTag() == null || request.getTokenVerifier() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Missing required client-side encryption parameters. True zero-knowledge client-side encryption is strictly enforced.");
        }

        if (!isValidHex(request.getEncrypted(), null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Encrypted ciphertext must be valid hex");
        }
        if (request.getEncrypted().length() > MAX_ENCRYPTED_HEX_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Payload exceeds maximum limit");
        }
        if (!isValidHex(request.getIv(), 24)
                || !isValidHex(request.getSalt(), 64)
                || !isValidHex(request.getAuthTag(), 32)
                || !isValidHex(request.getTokenVerifier(), 64)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing or invalid cryptographic parameters");
        }

        SecretEntity entity = new SecretEntity(
                id,
                request.getEncrypted(),
                request.getIv(),
                request.getSalt(),
                request.getAuthTag(),
                expiresAt,
                request.getBurnOnRead(),
                adminToken,
                false,
                now,
                true,
                request.getTokenVerifier()
        );

        secretRepository.save(entity);
        return new CreateSecretResponse(id, null, expiresAt, adminToken, true);
    }

    @Transactional(noRollbackFor = ResponseStatusException.class)
    public SecretMetadataResponse getMetadata(String id) {
        SecretEntity entity = secretRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found"));

        if (entity.getExpiresAt() < System.currentTimeMillis()) {
            secretRepository.delete(entity);
            throw new ResponseStatusException(HttpStatus.GONE, "Expired");
        }

        return new SecretMetadataResponse(
                true,
                entity.getExpiresAt(),
                entity.isBurnOnRead(),
                entity.isPaused(),
                entity.isClientEncrypted(),
                entity.isClientEncrypted() ? entity.getSalt() : null
        );
    }

    @Transactional(noRollbackFor = ResponseStatusException.class)
    public DecryptResponse decryptSecret(String id, DecryptRequest request) {
        // Use pessimistic write lock to prevent TOCTOU race conditions on attempts and burn-on-read
        SecretEntity entity = secretRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Secret not found or already destroyed"));

        if (entity.isPaused()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This secret is currently paused by the sender");
        }

        if (entity.getExpiresAt() < System.currentTimeMillis()) {
            secretRepository.delete(entity);
            throw new ResponseStatusException(HttpStatus.GONE, "Secret expired");
        }

        if (entity.getFailedAttempts() >= MAX_FAILED_ATTEMPTS) {
            if (entity.isBurnOnRead()) {
                secretRepository.delete(entity);
            }
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Secret is locked due to too many failed decryption attempts");
        }

        if (!entity.isClientEncrypted()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Legacy server-side encrypted secrets are deprecated and cannot be decrypted.");
        }

        String candidateVerifier = request.getTokenVerifier() != null ? request.getTokenVerifier().trim() : null;
        if (candidateVerifier == null || candidateVerifier.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Token verifier is required");
        }

        boolean isMatch = false;
        if (entity.getTokenVerifier() != null) {
            isMatch = MessageDigest.isEqual(
                    entity.getTokenVerifier().toLowerCase().getBytes(StandardCharsets.UTF_8),
                    candidateVerifier.toLowerCase().getBytes(StandardCharsets.UTF_8)
            );
        }

        if (!isMatch) {
            throw handleFailedAttempt(entity);
        }

        // Valid verifier: delete if burn-on-read, and return ciphertext for browser decryption
        if (entity.isBurnOnRead()) {
            secretRepository.delete(entity);
        }

        return DecryptResponse.clientEncrypted(
                entity.getEncrypted(),
                entity.getIv(),
                entity.getSalt(),
                entity.getAuthTag()
        );
    }

    private ResponseStatusException handleFailedAttempt(SecretEntity entity) {
        entity.setFailedAttempts(entity.getFailedAttempts() + 1);
        int remaining = MAX_FAILED_ATTEMPTS - entity.getFailedAttempts();
        if (entity.isBurnOnRead() && remaining <= 0) {
            secretRepository.delete(entity);
            return new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Invalid token or passphrase. Maximum attempts exceeded; secret destroyed."
            );
        }
        secretRepository.save(entity);
        if (remaining <= 0) {
            return new ResponseStatusException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "Maximum attempts exceeded. Secret is now locked."
            );
        }
        return new ResponseStatusException(
                HttpStatus.UNAUTHORIZED,
                "Invalid token or passphrase (" + remaining + " attempts remaining)"
        );
    }

    @Transactional(noRollbackFor = ResponseStatusException.class)
    public ManageResponse manageSecret(String id, ManageRequest request) {
        if (request.getAdminToken() == null || request.getAdminToken().trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Admin token required");
        }

        SecretEntity entity = secretRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Secret not found or expired"));

        if (entity.getExpiresAt() < System.currentTimeMillis()) {
            secretRepository.delete(entity);
            throw new ResponseStatusException(HttpStatus.GONE, "Secret expired");
        }

        // Constant-time comparison to prevent timing attacks
        boolean isAuthorized = MessageDigest.isEqual(
                entity.getAdminToken().getBytes(StandardCharsets.UTF_8),
                request.getAdminToken().trim().getBytes(StandardCharsets.UTF_8)
        );

        if (!isAuthorized) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Unauthorized");
        }

        String action = request.getAction() != null ? request.getAction().trim().toLowerCase() : "";
        switch (action) {
            case "pause":
                entity.setPaused(true);
                secretRepository.save(entity);
                return ManageResponse.pauseResult(true);
            case "resume":
                entity.setPaused(false);
                secretRepository.save(entity);
                return ManageResponse.pauseResult(false);
            case "delete":
                secretRepository.delete(entity);
                return ManageResponse.deleteResult();
            default:
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid action");
        }
    }

    @Scheduled(fixedRate = 60000)
    @Transactional
    public void cleanExpiredSecrets() {
        secretRepository.deleteByExpiresAtLessThan(System.currentTimeMillis());
    }
}
