package com.whispernet.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class CreateSecretResponse {

    private String id;
    private String token;
    private Long expiresAt;
    private String adminToken;
    private Boolean clientEncrypted;

    public CreateSecretResponse() {
    }

    public CreateSecretResponse(String id, String token, Long expiresAt, String adminToken, Boolean clientEncrypted) {
        this.id = id;
        this.token = token;
        this.expiresAt = expiresAt;
        this.adminToken = adminToken;
        this.clientEncrypted = clientEncrypted;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public Long getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Long expiresAt) {
        this.expiresAt = expiresAt;
    }

    public String getAdminToken() {
        return adminToken;
    }

    public void setAdminToken(String adminToken) {
        this.adminToken = adminToken;
    }

    public Boolean getClientEncrypted() {
        return clientEncrypted;
    }

    public void setClientEncrypted(Boolean clientEncrypted) {
        this.clientEncrypted = clientEncrypted;
    }
}
