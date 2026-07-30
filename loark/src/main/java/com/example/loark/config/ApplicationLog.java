package com.example.loark.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class ApplicationLog {
    private static final Logger LOGGER = LoggerFactory.getLogger("loark.application");

    private ApplicationLog() {}

    public static void info(String message) {
        if (!LOGGER.isInfoEnabled()) return;
        LOGGER.info(message);
    }

    public static void infof(String format, Object... arguments) {
        if (!LOGGER.isInfoEnabled()) return;
        LOGGER.info(String.format(format, arguments).stripTrailing());
    }
}
