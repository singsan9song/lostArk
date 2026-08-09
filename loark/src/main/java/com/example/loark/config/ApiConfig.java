package com.example.loark.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

@Configuration
public class ApiConfig {
    private final AtomicLong lostArkRequestSequence = new AtomicLong();

    @Bean("auctionLostArkRestClient")
    RestClient auctionLostArkRestClient(
            @Value("${lostark.api.base-url}") String baseUrl,
            @Value("${lostark.api.auction-key}") String apiKey,
            @Value("${lostark.api.connect-timeout-ms:5000}") int connectTimeoutMs,
            @Value("${lostark.api.read-timeout-ms:15000}") int readTimeoutMs,
            LostArkApiRequestCounter requestCounter
    ) {
        return lostArkRestClient("auction", baseUrl, apiKey, connectTimeoutMs, readTimeoutMs, requestCounter);
    }

    @Bean("marketLostArkRestClient")
    RestClient marketLostArkRestClient(
            @Value("${lostark.api.base-url}") String baseUrl,
            @Value("${lostark.api.market-key}") String apiKey,
            @Value("${lostark.api.connect-timeout-ms:5000}") int connectTimeoutMs,
            @Value("${lostark.api.read-timeout-ms:15000}") int readTimeoutMs,
            LostArkApiRequestCounter requestCounter
    ) {
        return lostArkRestClient("market", baseUrl, apiKey, connectTimeoutMs, readTimeoutMs, requestCounter);
    }

    @Bean("contentLostArkRestClient")
    RestClient contentLostArkRestClient(
            @Value("${lostark.api.base-url}") String baseUrl,
            @Value("${lostark.api.content-key}") String apiKey,
            @Value("${lostark.api.connect-timeout-ms:5000}") int connectTimeoutMs,
            @Value("${lostark.api.read-timeout-ms:15000}") int readTimeoutMs,
            LostArkApiRequestCounter requestCounter
    ) {
        return lostArkRestClient("content", baseUrl, apiKey, connectTimeoutMs, readTimeoutMs, requestCounter);
    }

    private RestClient lostArkRestClient(
            String apiGroup,
            String baseUrl,
            String apiKey,
            int connectTimeoutMs,
            int readTimeoutMs,
            LostArkApiRequestCounter requestCounter
    ) {
        requestCounter.registerGroup(apiGroup, apiKey);
        // Without an explicit timeout, a stalled Lost Ark API response leaves the calling
        // request thread (and, for character lookups, the user's request) waiting forever.
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(connectTimeoutMs);
        requestFactory.setReadTimeout(readTimeoutMs);
        return RestClient.builder().baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .defaultHeader("Accept", "application/json")
                .defaultHeader("Authorization", "bearer " + apiKey)
                .requestInterceptor((request, body, execution) -> {
                    requestCounter.increment(apiGroup);
                    long requestId = lostArkRequestSequence.incrementAndGet();
                    Instant requestedAt = Instant.now();
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
                        requestCounter.completeRequest(
                                apiGroup,
                                requestedAt, request.getMethod().name(), target, description,
                                response.getStatusCode().value(), elapsedMs, limit, remaining, reset, null
                        );
                        ApplicationLog.infof(
                                "[LOSTARK API:%s #%d] %s %s | request=%s -> HTTP %d | %d ms | rate-limit=%s remaining=%s reset=%s%n",
                                apiGroup, requestId, request.getMethod(), target, description, response.getStatusCode().value(), elapsedMs,
                                limit, remaining, reset
                        );
                        return response;
                    } catch (Exception error) {
                        long elapsedMs = (System.nanoTime() - startedAt) / 1_000_000;
                        requestCounter.completeRequest(
                                apiGroup,
                                requestedAt, request.getMethod().name(), target, description,
                                0, elapsedMs, null, null, null,
                                error.getClass().getSimpleName() + ": " + error.getMessage()
                        );
                        ApplicationLog.infof(
                                "[LOSTARK API:%s #%d] %s %s | request=%s -> REQUEST ERROR | %d ms | %s: %s%n",
                                apiGroup, requestId, request.getMethod(), target, description, elapsedMs,
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
        config.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return new CorsFilter(source);
    }
}
