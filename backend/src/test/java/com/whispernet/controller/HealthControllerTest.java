package com.whispernet.controller;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class HealthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("Health Check: GET /api/health returns 200 OK with UP status")
    void testHealthEndpointReturnsUp() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.service").value("whispernet-backend"));
    }

    @Test
    @DisplayName("Root Health Check: GET / and HEAD / return 200 OK (for Cloud PaaS probes)")
    void testRootEndpointReturnsUp() throws Exception {
        mockMvc.perform(get("/"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.service").value("whispernet-backend"));

        mockMvc.perform(head("/"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("Non-existent resource returns 404 cleanly without 500 unhandled exception")
    void testNonExistentResourceReturns404() throws Exception {
        mockMvc.perform(get("/non-existent-resource-path"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Resource not found"));
    }
}
