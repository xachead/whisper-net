package com.whispernet.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.Size;

@JsonIgnoreProperties(ignoreUnknown = true)
public class CreateSecretRequest {

    @Size(max = 65536, message = "Secret exceeds maximum size limit of 64 KB")
    private String secret;

    private Object expiration; // handles both String ("3600") and Number (3600)

    @Size(max = 256, message = "Passphrase exceeds maximum limit of 256 characters")
    private String passphrase;
    private Boolean burnOnRead;

    // Zero-knowledge client-side encryption fields
    private Boolean clientEncrypted;

    @Size(max = 200000, message = "Payload exceeds maximum limit")
    private String encrypted;

    @Size(max = 64, message = "IV exceeds maximum length")
    private String iv;

    @Size(max = 128, message = "Salt exceeds maximum length")
    private String salt;

    @Size(max = 64, message = "Auth tag exceeds maximum length")
    private String authTag;

    @Size(max = 128, message = "Token verifier exceeds maximum length")
    private String tokenVerifier;

    public CreateSecretRequest() {
    }

    public String getSecret() {
        return secret;
    }

    public void setSecret(String secret) {
        this.secret = secret;
    }

    public Object getExpiration() {
        return expiration;
    }

    public void setExpiration(Object expiration) {
        this.expiration = expiration;
    }

    public long getExpirationSeconds() {
        long val = 3600L;
        if (expiration != null) {
            try {
                val = Long.parseLong(expiration.toString().trim());
            } catch (NumberFormatException ignored) {
                val = 3600L;
            }
        }
        if (val < 60L) return 60L;
        if (val > 604800L) return 604800L;
        return val;
    }

    public String getPassphrase() {
        return passphrase;
    }

    public void setPassphrase(String passphrase) {
        this.passphrase = passphrase;
    }

    public Boolean getBurnOnRead() {
        return burnOnRead != null && burnOnRead;
    }

    public void setBurnOnRead(Boolean burnOnRead) {
        this.burnOnRead = burnOnRead;
    }

    public Boolean getClientEncrypted() {
        return clientEncrypted != null && clientEncrypted;
    }

    public void setClientEncrypted(Boolean clientEncrypted) {
        this.clientEncrypted = clientEncrypted;
    }

    public String getEncrypted() {
        return encrypted;
    }

    public void setEncrypted(String encrypted) {
        this.encrypted = encrypted;
    }

    public String getIv() {
        return iv;
    }

    public void setIv(String iv) {
        this.iv = iv;
    }

    public String getSalt() {
        return salt;
    }

    public void setSalt(String salt) {
        this.salt = salt;
    }

    public String getAuthTag() {
        return authTag;
    }

    public void setAuthTag(String authTag) {
        this.authTag = authTag;
    }

    public String getTokenVerifier() {
        return tokenVerifier;
    }

    public void setTokenVerifier(String tokenVerifier) {
        this.tokenVerifier = tokenVerifier;
    }
}
