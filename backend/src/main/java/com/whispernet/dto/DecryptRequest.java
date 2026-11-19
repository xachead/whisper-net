package com.whispernet.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class DecryptRequest {

    private String token;
    private String passphrase;
    private String tokenVerifier;

    public DecryptRequest() {
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public String getPassphrase() {
        return passphrase;
    }

    public void setPassphrase(String passphrase) {
        this.passphrase = passphrase;
    }

    public String getTokenVerifier() {
        return tokenVerifier;
    }

    public void setTokenVerifier(String tokenVerifier) {
        this.tokenVerifier = tokenVerifier;
    }
}
