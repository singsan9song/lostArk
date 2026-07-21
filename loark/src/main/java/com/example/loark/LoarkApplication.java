package com.example.loark;

import io.github.cdimascio.dotenv.Dotenv;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class LoarkApplication {

    public static void main(String[] args) {
        Dotenv.configure().ignoreIfMissing().load().entries().forEach(entry ->
                System.setProperty(entry.getKey(), System.getProperty(entry.getKey(), entry.getValue()))
        );
        SpringApplication.run(LoarkApplication.class, args);
    }

}
