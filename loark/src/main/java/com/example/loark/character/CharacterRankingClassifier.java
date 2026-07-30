package com.example.loark.character;

import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
public class CharacterRankingClassifier {
    private static final Map<String, List<String>> CLASS_ENGRAVINGS = Map.ofEntries(
            Map.entry("디스트로이어", List.of("분노의 망치", "중력 수련")),
            Map.entry("발키리", List.of("빛의 기사", "해방자")),
            Map.entry("버서커", List.of("광기", "광전사의 비기")),
            Map.entry("슬레이어", List.of("포식자", "처단자")),
            Map.entry("워로드", List.of("고독한 기사", "전투 태세")),
            Map.entry("홀리나이트", List.of("축복의 오라", "심판자")),
            Map.entry("기공사", List.of("역천지체", "무상신공")),
            Map.entry("배틀마스터", List.of("초심", "오의 강화")),
            Map.entry("브레이커", List.of("수라의 길", "권왕파천무")),
            Map.entry("스트라이커", List.of("오의난무", "일격필살")),
            Map.entry("인파이터", List.of("극의 : 체술", "충격 단련")),
            Map.entry("창술사", List.of("절정", "절제")),
            Map.entry("건슬링어", List.of("피스메이커", "사냥의 시간")),
            Map.entry("데빌헌터", List.of("전술 탄환", "핸드거너")),
            Map.entry("블래스터", List.of("포격 강화", "화력 강화")),
            Map.entry("스카우터", List.of("진화의 유산", "아르데타인의 기술")),
            Map.entry("호크아이", List.of("죽음의 습격", "두 번째 동료")),
            Map.entry("바드", List.of("절실한 구원", "진실된 용맹")),
            Map.entry("서머너", List.of("상급 소환사", "넘치는 교감")),
            Map.entry("소서리스", List.of("점화", "환류")),
            Map.entry("아르카나", List.of("황후의 은총", "황제의 칙령")),
            Map.entry("데모닉", List.of("멈출 수 없는 충동", "완벽한 억제")),
            Map.entry("리퍼", List.of("달의 소리", "갈증")),
            Map.entry("블레이드", List.of("버스트", "잔재된 기운")),
            Map.entry("소울이터", List.of("만월의 집행자", "그믐의 경계")),
            Map.entry("기상술사", List.of("질풍노도", "이슬비")),
            Map.entry("도화가", List.of("만개", "회귀")),
            Map.entry("환수사", List.of("야성", "환수 각성")),
            Map.entry("가디언나이트", List.of("드레드 로어", "업화의 계승자")),
            Map.entry("차원술사", List.of("시간 관리자", "공간 검사"))
    );
    private static final Set<String> SUPPORT_ENGRAVINGS =
            Set.of("절실한 구원", "축복의 오라", "만개", "빛의 기사");

    public Classification classify(JsonNode armory, String className) {
        String engraving = representativeEngraving(armory, className);
        String role = SUPPORT_ENGRAVINGS.contains(engraving) ? "SUPPORT" : "DEALER";
        return new Classification(engraving, role);
    }

    private String representativeEngraving(JsonNode armory, String className) {
        List<String> candidates = CLASS_ENGRAVINGS.getOrDefault(className, List.of());
        if (armory == null || candidates.isEmpty()) return "";

        StringBuilder enlightenment = new StringBuilder();
        armory.path("ArkPassive").path("Effects").forEach(effect -> {
            if (!effect.path("Name").asText("").contains("깨달음")) return;
            append(enlightenment, effect, "Name", "Description", "ToolTip", "Tooltip");
        });
        for (String candidate : candidates) {
            if (enlightenment.indexOf(candidate) >= 0) return candidate;
        }

        StringBuilder engravingText = new StringBuilder();
        armory.path("ArmoryEngraving").path("ArkPassiveEffects")
                .forEach(effect -> append(engravingText, effect, "Name", "Description"));
        armory.path("ArmoryEngraving").path("Effects")
                .forEach(effect -> append(engravingText, effect, "Name", "Description"));
        for (String candidate : candidates) {
            if (engravingText.indexOf(candidate) >= 0) return candidate;
        }
        return "";
    }

    private void append(StringBuilder target, JsonNode source, String... fields) {
        for (String field : fields) {
            String value = source.path(field).asText("");
            if (!value.isBlank()) target.append(' ').append(value);
        }
    }

    public record Classification(String engraving, String role) {}
}
