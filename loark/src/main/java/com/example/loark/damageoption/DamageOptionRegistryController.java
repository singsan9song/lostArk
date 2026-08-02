package com.example.loark.damageoption;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

@RestController
@RequestMapping("/api/damage-option-registry")
public class DamageOptionRegistryController {
    private final ObjectMapper objectMapper;
    private final Path registryPath;
    private final Path ignoredRegistryPath;
    private final Object fileLock = new Object();

    public DamageOptionRegistryController(
            ObjectMapper objectMapper,
            @Value("${app.damage-option-registry.path:./data/damage-option-registry.json}") String registryPath,
            @Value("${app.damage-option-registry.ignored-path:./data/damage-option-ignored.json}")
            String ignoredRegistryPath) {
        this.objectMapper = objectMapper;
        this.registryPath = Path.of(registryPath).toAbsolutePath().normalize();
        this.ignoredRegistryPath = Path.of(ignoredRegistryPath).toAbsolutePath().normalize();
    }

    @GetMapping
    public JsonNode getRegistry() {
        synchronized (fileLock) {
            try {
                return combineRegistries(
                        readRegistry(registryPath),
                        readRegistry(ignoredRegistryPath));
            } catch (RuntimeException exception) {
                throw new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR,
                        "데미지 옵션 JSON 파일을 읽지 못했습니다.",
                        exception);
            }
        }
    }

    @PutMapping
    public JsonNode saveRegistry(@RequestBody JsonNode registry) {
        if (registry == null
                || registry.path("version").asInt() != 1
                || !registry.path("records").isArray()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "올바른 옵션 데이터가 아닙니다.");
        }
        for (JsonNode record : registry.path("records")) {
            boolean ignored = record.path("ignored").asBoolean(false);
            JsonNode effects = record.path("effects");
            if (!ignored && (!effects.isArray() || effects.isEmpty())) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "매핑 완료 또는 매핑 불필요 데이터만 저장할 수 있습니다.");
            }
        }
        JsonNode persistentRegistry = registry.deepCopy();
        for (JsonNode record : persistentRegistry.path("records")) {
            if (record instanceof ObjectNode objectRecord) {
                objectRecord.remove("_draft");
            }
        }
        ObjectNode mappedRegistry = emptyRegistry();
        ObjectNode ignoredRegistry = emptyRegistry();
        ArrayNode mappedRecords = (ArrayNode) mappedRegistry.path("records");
        ArrayNode ignoredRecords = (ArrayNode) ignoredRegistry.path("records");
        for (JsonNode record : persistentRegistry.path("records")) {
            if (record.path("ignored").asBoolean(false)) {
                ignoredRecords.add(record);
            } else {
                mappedRecords.add(record);
            }
        }
        synchronized (fileLock) {
            try {
                writeRegistry(registryPath, mappedRegistry, "damage-option-registry-");
                writeRegistry(ignoredRegistryPath, ignoredRegistry, "damage-option-ignored-");
                return combineRegistries(mappedRegistry, ignoredRegistry);
            } catch (IOException exception) {
                throw new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR,
                        "데미지 옵션 JSON 파일을 저장하지 못했습니다.",
                        exception);
            }
        }
    }

    private ObjectNode readRegistry(Path path) {
        if (!Files.exists(path)) return emptyRegistry();
        JsonNode stored = objectMapper.readTree(path.toFile());
        if (stored == null || !stored.path("records").isArray()) return emptyRegistry();
        ObjectNode registry = emptyRegistry();
        ArrayNode records = (ArrayNode) registry.path("records");
        stored.path("records").forEach(records::add);
        return registry;
    }

    private ObjectNode emptyRegistry() {
        ObjectNode registry = objectMapper.createObjectNode();
        registry.put("version", 1);
        registry.putArray("records");
        return registry;
    }

    private ObjectNode combineRegistries(JsonNode mappedRegistry, JsonNode ignoredRegistry) {
        ObjectNode combined = emptyRegistry();
        ArrayNode records = (ArrayNode) combined.path("records");
        mappedRegistry.path("records").forEach(records::add);
        ignoredRegistry.path("records").forEach(records::add);
        return combined;
    }

    private void writeRegistry(Path path, JsonNode registry, String temporaryPrefix)
            throws IOException {
        Path parent = path.getParent();
        if (parent != null) Files.createDirectories(parent);
        Path temporary = Files.createTempFile(parent, temporaryPrefix, ".json.tmp");
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(temporary.toFile(), registry);
        try {
            Files.move(
                    temporary,
                    path,
                    StandardCopyOption.REPLACE_EXISTING,
                    StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException atomicMoveFailure) {
            Files.move(temporary, path, StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
