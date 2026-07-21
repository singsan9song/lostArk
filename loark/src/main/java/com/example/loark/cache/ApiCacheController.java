package com.example.loark.cache;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/cache")
public class ApiCacheController {
    private final ApiCacheState state;

    public ApiCacheController(ApiCacheState state) {
        this.state = state;
    }

    @GetMapping("/status")
    public ApiCacheState.Status status() {
        return state.status();
    }
}
