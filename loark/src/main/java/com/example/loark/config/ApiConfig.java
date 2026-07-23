package com.example.loark.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.web.client.RestClient;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

@Configuration
public class ApiConfig {
    private final AtomicLong lostArkRequestSequence = new AtomicLong();

    @Bean
    RestClient lostArkRestClient(
            @Value("${lostark.api.base-url}") String baseUrl,
            @Value("${lostark.api.key}") String apiKey
    ) {
        return RestClient.builder().baseUrl(baseUrl)
                .defaultHeader("Accept", "application/json")
                .defaultHeader("Authorization", "bearer " + apiKey)
                .requestInterceptor((request, body, execution) -> {
                    long requestId = lostArkRequestSequence.incrementAndGet();
                    long startedAt = System.nanoTime();
                    String path = request.getURI().getRawPath();
                    String query = request.getURI().getRawQuery();
                    String target = query == null ? path : path + "?" + query;
                    String description = LostArkRequestContext.current();

                    try {
                        ClientHttpResponse response = execution.execute(request, body);
                        long elapsedMs = (System.nanoTime() - startedAt) / 1_000_000;
                        String limit = header(response, "X-RateLimit-Limit");
                        String remaining = header(response, "X-RateLimit-Remaining");
                        String reset = header(response, "X-RateLimit-Reset");
                        System.out.printf(
                                "[LOSTARK API #%d] %s %s | request=%s -> HTTP %d | %d ms | rate-limit=%s remaining=%s reset=%s%n",
                                requestId, request.getMethod(), target, description, response.getStatusCode().value(), elapsedMs,
                                limit, remaining, reset
                        );
                        return response;
                    } catch (Exception error) {
                        long elapsedMs = (System.nanoTime() - startedAt) / 1_000_000;
                        System.out.printf(
                                "[LOSTARK API #%d] %s %s | request=%s -> REQUEST ERROR | %d ms | %s: %s%n",
                                requestId, request.getMethod(), target, description, elapsedMs,
                                error.getClass().getSimpleName(), error.getMessage()
                        );
                        throw error;
                    }
                })
                .build();
    }

    private String header(ClientHttpResponse response, String name) {
        String value = response.getHeaders().getFirst(name);
        return value == null || value.isBlank() ? "-" : value;
    }

    @Bean
    CorsFilter corsFilter(@Value("${app.frontend-origin}") String frontendOrigin) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(frontendOrigin));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Content-Type"));
        config.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return new CorsFilter(source);
    }
}
