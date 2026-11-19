package com.whispernet.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class DecryptResponse {

    private String secret;
    private Boolean clientEncrypted;
    private String encrypted;
    private String iv;
    private String salt;
    private String authTag;

    public DecryptResponse() {
    }

    public static DecryptResponse serverDecrypted(String secret) {
        DecryptResponse response = new DecryptResponse();
        response.setSecret(secret);
        response.setClientEncrypted(false);
        return response;
    }

    public static DecryptResponse clientEncrypted(String encrypted, String iv, String salt, String authTag) {
        DecryptResponse response = new DecryptResponse();
        response.setClientEncrypted(true);
        response.setEncrypted(encrypted);
        response.setIv(iv);
        response.setSalt(salt);
        response.setAuthTag(authTag);
        return response;
    }

    public String getSecret() {
        return secret;
    }

    public void setSecret(String secret) {
        this.secret = secret;
    }

    public Boolean getClientEncrypted() {
        return clientEncrypted;
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
}
