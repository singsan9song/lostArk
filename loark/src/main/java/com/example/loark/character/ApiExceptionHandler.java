package com.example.loark.character;

import jakarta.validation.ConstraintViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.RestClientResponseException;

import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(LostArkApiException.class)
    ResponseEntity<Map<String, String>> lostArkApiError(LostArkApiException error) {
        return ResponseEntity.status(error.status()).body(Map.of("message", error.getMessage()));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<Map<String, String>> invalidName() {
        return ResponseEntity.badRequest().body(Map.of("message", "올바른 캐릭터명을 입력해 주세요."));
    }

    @ExceptionHandler(RestClientResponseException.class)
    ResponseEntity<Map<String, String>> lostArkResponseError(RestClientResponseException error) {
        String message = error.getStatusCode().value() == 429
                ? "로스트아크 API 요청 한도가 갱신될 때까지 기다리는 중입니다. 다음 자동 갱신에서 다시 시도합니다."
                : "로스트아크 API 응답 오류 (" + error.getStatusCode().value() + ")";
        System.out.printf("[LOSTARK API WAIT] HTTP %d | failed response was not cached%n", error.getStatusCode().value());
        return ResponseEntity.status(error.getStatusCode()).body(Map.of("message", message, "retryable", "true"));
    }
}
