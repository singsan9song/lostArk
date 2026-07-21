package com.example.loark.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;

@Configuration
public class DatabaseMaintenanceConfig {
    @Bean
    ApplicationRunner dropLegacyTables(DataSource dataSource,
                                       @Value("${app.drop-legacy-tables:false}") boolean enabled) {
        return args -> {
            if (!enabled) return;
            try (var connection = dataSource.getConnection(); var statement = connection.createStatement()) {
                statement.executeUpdate("DROP TABLE IF EXISTS mari_shop_snapshot");
                statement.executeUpdate("DROP TABLE IF EXISTS mari_shop_product_history");
                statement.executeUpdate("DROP TABLE IF EXISTS user_roster_discoveries");
                String database = connection.getMetaData().getDatabaseProductName().toLowerCase();
                if (database.contains("mysql") || database.contains("mariadb")) {
                    for (String column : new String[]{"character_name", "server_name", "class_name", "item_level", "combat_power", "character_image"}) {
                        try (var columns = connection.getMetaData().getColumns(connection.getCatalog(), null, "user_favorite_characters", column)) {
                            if (columns.next()) statement.executeUpdate("ALTER TABLE user_favorite_characters DROP COLUMN " + column);
                        }
                    }
                }
            }
            System.out.println("[DATABASE] Legacy payload tables removed.");
        };
    }
}
