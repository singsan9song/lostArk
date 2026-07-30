package com.example.loark.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

@Configuration
public class SchedulingConfig {
    // Only responsible for firing @Scheduled trigger methods on time - every trigger below
    // hands its actual work off to backgroundJobExecutor instead of running inline, so this
    // small pool is never blocked by a long-running collector and the 250ms rate-limit tick
    // (LostArkApiRequestCounter) keeps firing on schedule regardless of collector load.
    @Bean
    ThreadPoolTaskScheduler taskScheduler(
            @Value("${app.scheduler-pool-size:5}") int poolSize
    ) {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(Math.max(3, poolSize));
        scheduler.setThreadNamePrefix("loark-scheduler-");
        scheduler.setWaitForTasksToCompleteOnShutdown(false);
        scheduler.setRemoveOnCancelPolicy(true);
        return scheduler;
    }

    // Where the actual long-running collectors (market/bracelet/ability-stone/accessory
    // auction/character-daily-refresh) do their real work, separate from the scheduler pool
    // above so they can run as long as they need without delaying other scheduled triggers.
    @Bean(destroyMethod = "shutdownNow")
    ExecutorService backgroundJobExecutor(
            @Value("${app.background-job-pool-size:6}") int poolSize
    ) {
        AtomicInteger threadNumber = new AtomicInteger();
        return Executors.newFixedThreadPool(Math.max(1, poolSize), runnable -> {
            Thread thread = new Thread(runnable, "loark-background-job-" + threadNumber.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        });
    }
}
