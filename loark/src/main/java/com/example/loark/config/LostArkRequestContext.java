package com.example.loark.config;

import java.util.function.Supplier;

public final class LostArkRequestContext {
    private static final ThreadLocal<String> DESCRIPTION = new ThreadLocal<>();

    private LostArkRequestContext() {}

    public static String current() {
        String description = DESCRIPTION.get();
        return description == null || description.isBlank() ? "상세 정보 없음" : description;
    }

    public static <T> T call(String description, Supplier<T> action) {
        String previous = DESCRIPTION.get();
        DESCRIPTION.set(description);
        try {
            return action.get();
        } finally {
            if (previous == null) DESCRIPTION.remove();
            else DESCRIPTION.set(previous);
        }
    }
}
