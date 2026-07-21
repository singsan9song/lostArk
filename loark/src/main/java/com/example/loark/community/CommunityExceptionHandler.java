package com.example.loark.community;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class CommunityExceptionHandler {
    @ExceptionHandler(CommunityException.class)
    ResponseEntity<Map<String, String>> communityError(CommunityException error) {
        return ResponseEntity.status(error.status()).body(Map.of("message", error.getMessage()));
    }
}
