// src/utils/productClassify.ts
// 상비약 / 일반약 / 뷰티 / 냉장고 / 물약 / 미분류 · 공용 분류 유틸
// 2026-08-03 · 통계 메뉴 상비약/일반약/전체 필터 도입
// 2026-10-07 v3 · 사용자 지시 · includes 기반 유연 매칭 + 라벨 "뷰티" 로 변경
// 2026-10-08 v4 · 사용자 지시 · "냉장고" / "물약" 신규 분류 추가 (미분류에서 분리)
//
// 규칙 (2026-10-08 v4):
//   · "뷰티" 포함 (어디든)          → 뷰티 (cosmetics)
//     예: "뷰티>2번>전체>전체" · "뷰티1" · "프리미엄뷰티"
//   · "냉장고" 포함                  → 냉장고 (fridge)
//     예: "냉장고>전체>전체>전체"
//   · "물약" 포함                    → 물약 (liquid)
//     예: "물약"
//   · "벽" 포함 (어디든)            → 일반약 (general)
//     사용자 지시 "위치에 벽 들어가면 일반약"
//     예: "벽" · "벽>21>전체>전체" · "A매대/벽7"
//   · N매대 (N=1~9, 섹터 무관)       → 상비약 (stationery)
//   · N매대 (N≥10, 섹터 무관)        → 일반약 (general)
//   · Transformed 숫자단독           → N≥10 일반약 · 1-9 상비약
//   · 그 외                          → 미분류 (unknown)
//
// 우선순위: 뷰티 > 냉장고 > 물약 > 벽 > 매대 > 숫자단독

export type ProductClass = "stationery" | "general" | "cosmetics" | "fridge" | "liquid" | "unknown";
// 2026-10-08 · fridge / liquid 추가 · 전체·상비약·일반약·뷰티·냉장고·물약·미분류 7-tab
export type ClassFilter = "all" | "stationery" | "general" | "cosmetics" | "fridge" | "liquid" | "unknown";

export const REAL_MAP_ZONE_REGEX = /^(\d+)/;
const PRIMARY_SPLIT_REGEX = /[\/\-_\s]/;

/** 전각 Ａ/Ｂ/Ｃ/Ｄ → 반각 A/B/C/D 정규화 */
function normalizeFullWidthLetters(s: string): string {
  return s
    .replace(/Ａ/g, "A")
    .replace(/Ｂ/g, "B")
    .replace(/Ｃ/g, "C")
    .replace(/Ｄ/g, "D");
}

export function classifyProduct(location: string | null | undefined): ProductClass {
  if (!location) return "unknown";
  const s = String(location).trim();
  if (!s) return "unknown";

  // 1) "뷰티" 포함 → 뷰티 (어디에 나와도 최우선)
  if (s.includes("뷰티")) return "cosmetics";

  // 2026-10-08 · 사용자 지시 · "냉장고" / "물약" 신규 분류 추가
  if (s.includes("냉장고")) return "fridge";
  if (s.includes("물약")) return "liquid";

  // 2) "벽" 포함 → 일반약 (사용자 지시 "위치에 벽 들어가면 일반약")
  if (s.includes("벽")) return "general";

  // 3) 10+매대 먼저 체크 (double-digit 매대가 single-digit 매칭 전에 처리되어야 함)
  //    예: "10매대" 가 "1매대" 패턴보다 우선 매칭
  const madae10 = s.match(/(\d{2,})매대/);
  if (madae10) {
    const n = parseInt(madae10[1], 10);
    if (Number.isFinite(n) && n >= 10) return "general";
  }

  // 4) 1-9매대 포함 (어디든 · 섹터 무관 · A/B 제한 완화)
  //    word boundary · 앞 글자가 숫자 아님 (10매대 등 제외)
  if (/(?:^|[^0-9])[1-9]매대/.test(s)) return "stationery";

  // 5) Transformed 숫자단독 (예: "21", "9") · 전각 letter 정규화
  const normalized = normalizeFullWidthLetters(s);
  const first = normalized.split(PRIMARY_SPLIT_REGEX)[0]?.trim() ?? normalized;

  //    "NA" / "NB" / "NC" 등 N=1~9 → 상비약 (섹터 무관)
  if (/^[1-9][A-Z]/.test(first)) return "stationery";

  //    숫자단독
  if (/^\d+$/.test(first)) {
    const n = parseInt(first, 10);
    if (Number.isFinite(n)) {
      if (n >= 10) return "general";
      if (n >= 1) return "stationery";
    }
  }

  return "unknown";
}

export function matchClassFilter(location: string | null | undefined, filter: ClassFilter): boolean {
  if (filter === "all") return true;
  return classifyProduct(location) === filter;
}

// 라벨/색상 매핑 (UI 공용)
// 2026-10-07 v3 · 사용자 지시 · "화장품" → "뷰티" 라벨 변경 (타입 ID cosmetics 유지)
export const CLASS_FILTER_LABEL: Record<ClassFilter, string> = {
  all: "전체",
  stationery: "상비약",
  general: "일반약",
  cosmetics: "뷰티",
  fridge: "냉장고",
  liquid: "물약",
  unknown: "미분류",
};

// 라벨 옆 구역 범위 표시 (2026-08-04 · 사용자 요청)
import { getZoneMappings } from "../constants/zoneLabels";
export function getClassFilterRange(cls: ClassFilter): string {
  if (cls === "all") return "";
  if (cls === "stationery") return "(1-9매대)";
  if (cls === "cosmetics") return "";
  if (cls === "fridge") return "";
  if (cls === "liquid") return "";
  if (cls === "unknown") return "";
  // general · 벽/10+매대
  const maps = getZoneMappings();
  const nums = maps.map(m => Number(m.number)).filter(n => Number.isFinite(n) && n >= 10);
  if (nums.length === 0) return "(벽/10+)";
  const max = Math.max(...nums);
  return `(벽/10-${max})`;
}
// 하위 호환
export const CLASS_FILTER_RANGE: Record<ClassFilter, string> = {
  all: "",
  stationery: "(1-9매대)",
  general: "(벽/10+)",
  cosmetics: "",
  fridge: "",
  liquid: "",
  unknown: "",
};
