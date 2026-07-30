package com.example.loark.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import javax.sql.DataSource;

@Configuration
public class DatabaseMaintenanceConfig {
    @Bean
    ApplicationRunner widenAccessoryAuctionOptionsJson(DataSource dataSource) {
        return args -> {
            try (var connection = dataSource.getConnection()) {
                String database = connection.getMetaData().getDatabaseProductName().toLowerCase();
                if (!database.contains("mysql") && !database.contains("mariadb")) return;
                String typeName = columnType(
                        connection, "accessory_auction_listings", "options_json");
                if (typeName == null || "longtext".equalsIgnoreCase(typeName)) return;
                try (var statement = connection.createStatement()) {
                    statement.executeUpdate(
                            "ALTER TABLE accessory_auction_listings "
                                    + "MODIFY COLUMN options_json LONGTEXT NOT NULL");
                }
                ApplicationLog.info(
                        "[DATABASE] accessory_auction_listings.options_json expanded to LONGTEXT.");
            }
        };
    }

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
                    // Superseded by uk_user_favorite_character_v2 (discord_id, character_id); left behind
                    // by an earlier schema, it still enforces uniqueness on discord_id+character_name,
                    // which real data now legitimately violates (e.g. same character name on different
                    // servers) and which blocks the column drops below via a full-table rebuild.
                    dropIndexIfExists(connection, statement, "user_favorite_characters", "uk_user_favorite_character");
                    for (String column : new String[]{"character_name", "server_name", "class_name", "item_level", "combat_power", "character_image"}) {
                        try (var columns = connection.getMetaData().getColumns(connection.getCatalog(), null, "user_favorite_characters", column)) {
                            if (columns.next()) statement.executeUpdate("ALTER TABLE user_favorite_characters DROP COLUMN " + column);
                        }
                    }
                }
            }
            ApplicationLog.info("[DATABASE] Legacy payload tables removed.");
        };
    }

    private void dropIndexIfExists(Connection connection, Statement statement, String table, String indexName) throws java.sql.SQLException {
        try (var indexes = connection.getMetaData().getIndexInfo(connection.getCatalog(), null, table, false, false)) {
            while (indexes.next()) {
                if (indexName.equalsIgnoreCase(indexes.getString("INDEX_NAME"))) {
                    statement.executeUpdate("ALTER TABLE " + table + " DROP INDEX " + indexName);
                    return;
                }
            }
        }
    }

    private String columnType(Connection connection, String table, String column)
            throws java.sql.SQLException {
        try (ResultSet columns = connection.getMetaData().getColumns(
                connection.getCatalog(), null, "%", "%")) {
            while (columns.next()) {
                if (table.equalsIgnoreCase(columns.getString("TABLE_NAME"))
                        && column.equalsIgnoreCase(columns.getString("COLUMN_NAME"))) {
                    return columns.getString("TYPE_NAME");
                }
            }
        }
        return null;
    }
}
