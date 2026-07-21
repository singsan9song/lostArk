package com.example.loark.character;

import org.springframework.http.HttpStatusCode;

public class LostArkApiException extends RuntimeException {
    private final HttpStatusCode status;

    LostArkApiException(HttpStatusCode status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatusCode status() { return status; }
}
