package com.whispernet.controller;

import com.whispernet.dto.*;
import com.whispernet.service.SecretService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/secrets")
public class SecretController {

    private final SecretService secretService;

    public SecretController(SecretService secretService) {
        this.secretService = secretService;
    }

    @PostMapping
    public ResponseEntity<CreateSecretResponse> createSecret(@Valid @RequestBody CreateSecretRequest request) {
        CreateSecretResponse response = secretService.createSecret(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    public ResponseEntity<SecretMetadataResponse> getMetadata(@PathVariable("id") String id) {
        SecretMetadataResponse response = secretService.getMetadata(id);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{id}/decrypt")
    public ResponseEntity<DecryptResponse> decryptSecret(
            @PathVariable("id") String id,
            @Valid @RequestBody DecryptRequest request) {
        DecryptResponse response = secretService.decryptSecret(id, request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{id}/manage")
    public ResponseEntity<ManageResponse> manageSecret(
            @PathVariable("id") String id,
            @Valid @RequestBody ManageRequest request) {
        ManageResponse response = secretService.manageSecret(id, request);
        return ResponseEntity.ok(response);
    }
}
