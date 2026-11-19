package com.whispernet.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class SecretMetadataResponse {

    private boolean exists;
    private Long expiresAt;
    private boolean burnOnRead;

    @JsonProperty("isPaused")
    private boolean isPaused;

    @JsonProperty("clientEncrypted")
    private boolean clientEncrypted;

    private String salt;

    public SecretMetadataResponse() {
    }

    public SecretMetadataResponse(boolean exists, Long expiresAt, boolean burnOnRead, boolean isPaused, boolean clientEncrypted, String salt) {
        this.exists = exists;
        this.expiresAt = expiresAt;
        this.burnOnRead = burnOnRead;
        this.isPaused = isPaused;
        this.clientEncrypted = clientEncrypted;
        this.salt = salt;
    }

    public boolean isExists() {
        return exists;
    }

    public void setExists(boolean exists) {
        this.exists = exists;
    }

    public Long getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Long expiresAt) {
        this.expiresAt = expiresAt;
    }

    public boolean isBurnOnRead() {
        return burnOnRead;
    }

    public void setBurnOnRead(boolean burnOnRead) {
        this.burnOnRead = burnOnRead;
    }

    @JsonProperty("isPaused")
    public boolean isPaused() {
        return isPaused;
    }

    @JsonProperty("isPaused")
    public void setPaused(boolean paused) {
        isPaused = paused;
    }

    @JsonProperty("clientEncrypted")
    public boolean isClientEncrypted() {
        return clientEncrypted;
    }

    @JsonProperty("clientEncrypted")
    public void setClientEncrypted(boolean clientEncrypted) {
        this.clientEncrypted = clientEncrypted;
    }

    public String getSalt() {
        return salt;
    }

    public void setSalt(String salt) {
        this.salt = salt;
    }
}
