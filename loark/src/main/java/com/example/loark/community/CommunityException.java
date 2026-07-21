package com.example.loark.community;

import org.springframework.http.HttpStatus;

public class CommunityException extends RuntimeException {
    private final HttpStatus status;

    public CommunityException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus status() { return status; }
}
