package com.whispernet.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class ManageResponse {

    private Boolean success;
    private Boolean isPaused;
    private Boolean deleted;

    public ManageResponse() {
    }

    public static ManageResponse pauseResult(boolean isPaused) {
        ManageResponse res = new ManageResponse();
        res.setSuccess(true);
        res.setIsPaused(isPaused);
        return res;
    }

    public static ManageResponse deleteResult() {
        ManageResponse res = new ManageResponse();
        res.setSuccess(true);
        res.setDeleted(true);
        return res;
    }

    public Boolean getSuccess() {
        return success;
    }

    public void setSuccess(Boolean success) {
        this.success = success;
    }

    public Boolean getIsPaused() {
        return isPaused;
    }

    public void setIsPaused(Boolean isPaused) {
        this.isPaused = isPaused;
    }

    public Boolean getDeleted() {
        return deleted;
    }

    public void setDeleted(Boolean deleted) {
        this.deleted = deleted;
    }
}
