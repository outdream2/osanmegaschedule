// src/lib/zoneClassification.ts
// 2026-10-11 · 사용자 지시 · ERP 위치 → zone 분류 공통 함수
//   · 전제: ERP products.display_location (예: "벽>21>전체>전체") 에서 매대 번호 추출
//   · 매대 번호 → zone_defs.category → 상비약/뷰티/미분류 분류
//   · 공통 모듈 · 여러 곳에서 재사용 (ERP sync · overview · sales 집계)
//
// 재사용 지점:
//   · InventoryDisplayOverview · 매장 매대 그룹핑 (상비약·뷰티·미분류 3 탭)
//   · RevenuePage.SalesStatus · 구역별 판매 집계
//   · ProductInfoCard · 상품 상세 패널 category 표시
//   · ERP sync pipeline (apps/sync-agent) · 상품 import 시 분류 미리 저장
//
// 대원칙 준수:
//   · "공통 기능 = 단일 Endpoint" · 신규 전 grep 필수 (여기 함수가 SSOT)
//   · "데이터 임의 연결·생성 금지" · ERP 위치 + zone_defs 결합만 · 추측 X

import type { ZoneDef } from "../constants/displayZones";

/** 상품 분류 결과 · 상비약 / 뷰티 / 미분류 */
export type ZoneClass = "상비약" | "뷰티" | "미분류";

/**
 * ERP display_location 문자열에서 **매대 번호** 추출.
 *
 * 입력 포맷 예시:
 *   · "벽>21>전체>전체" → 21
 *   · "중앙>1>종합감기약>전체" → 1
 *   · "1A" → 1
 *   · "22" → 22
 *   · "" | null → null
 */
export function extractZoneNumFromLocation(loc: string | null | undefined): number | null {
  if (loc == null) return null;
  const s = String(loc).trim();
  if (!s) return null;
  const m = s.match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  if (!Number.isFinite(n) || n < 1 || n > 999) return null;
  return n;
}

/**
 * ERP display_location → ZoneClass 분류 (zone_defs 매핑 기반)
 *
 * flow:
 *   1. loc 문자열에서 매대 번호 추출
 *   2. storeZones 에서 매대 번호 매칭 (zone.num === num)
 *   3. zone.category 를 확인 → "상비약" or "뷰티" 포함 여부
 *   4. 둘 다 아니면 "미분류"
 *
 * 사용자 통제:
 *   · 매장구역 편집 UI (StoreZoneTextEditor) 에서 각 매대의 category 를
 *     "상비약" / "뷰티" / "미분류" / 자유 입력 가능
 *   · 이 함수는 category 문자열에 "상비약" 또는 "뷰티" **포함 여부** 만 체크
 *   · 완전 일치 X · 부분 매칭 (사용자 입력 유연성)
 */
export function classifyByZoneDefs(
  loc: string | null | undefined,
  storeZones: readonly ZoneDef[],
): ZoneClass {
  const num = extractZoneNumFromLocation(loc);
  if (num == null) return "미분류";
  // 2026-10-11 · 사용자 선언 "1-9까지 상비약" · 매대 번호 1~9 (A/B/subA/subB 무관) 는 항상 상비약
  // · zone_defs.category 문자열 "상비약" 포함 여부와 무관하게 고정 분류
  if (num >= 1 && num <= 9) return "상비약";
  const zone = storeZones.find((z) => z.num === num);
  if (!zone) return "미분류";
  const cat = String(zone.category ?? "").trim();
  if (!cat) return "미분류";
  if (cat.includes("상비약")) return "상비약";
  if (cat.includes("뷰티")) return "뷰티";
  return "미분류";
}

/**
 * 상품 리스트 일괄 분류 · product_code → ZoneClass Map 반환
 *
 * 성능: O(n × m) · n=products.length · m=storeZones.length
 *   · storeZones 가 50개 이내 · n 수천 상품 · 수용 가능
 *   · 더 최적화 필요 시 · storeZones 를 Map<num, ZoneDef> 로 pre-index
 */
export function classifyProducts<T extends { code: string; display_location?: string | null; location?: string | null }>(
  products: readonly T[],
  storeZones: readonly ZoneDef[],
): Map<string, ZoneClass> {
  // num → category pre-index (O(m) · 한 번만)
  const zoneByNum = new Map<number, ZoneDef>();
  for (const z of storeZones) zoneByNum.set(z.num, z);

  const result = new Map<string, ZoneClass>();
  for (const p of products) {
    const loc = p.display_location ?? p.location ?? null;
    const num = extractZoneNumFromLocation(loc);
    if (num == null) { result.set(p.code, "미분류"); continue; }
    // 2026-10-11 · 사용자 선언 "1-9까지 상비약" · 매대 번호 1~9 는 항상 상비약 (A/B 무관)
    if (num >= 1 && num <= 9) { result.set(p.code, "상비약"); continue; }
    const zone = zoneByNum.get(num);
    const cat = String(zone?.category ?? "").trim();
    if (cat.includes("상비약")) result.set(p.code, "상비약");
    else if (cat.includes("뷰티")) result.set(p.code, "뷰티");
    else result.set(p.code, "미분류");
  }
  return result;
}

/**
 * ERP display_location 또는 UI 포맷 (예: "벽 10", "1A", "22") → zone_defs 매대 label 조회.
 *
 * flow:
 *   1. loc 에서 매대 번호 추출 (extractZoneNumFromLocation)
 *   2. storeZones 에서 매대 번호 매칭
 *   3. **category > subA/subB > label** 우선순위로 라벨 반환
 *   4. A/B 분리 매대 (1A·1B 등) 는 side 로 subA/subB 중 선택
 *
 * 포맷 무관 매칭 보장 (fmtLoc 포맷 "벽 10" 과 raw "10" 양쪽 작동)
 */
export function getZoneLabelByLocation(
  loc: string | null | undefined,
  storeZones: readonly ZoneDef[],
): string {
  const num = extractZoneNumFromLocation(loc);
  if (num == null) return "";
  const zone = storeZones.find((z) => z.num === num);
  if (!zone) return "";
  // A/B 분리 매대 처리 · loc 에 "A" 또는 "B" 포함 여부
  const upper = String(loc).toUpperCase();
  if (upper.includes("A") && zone.subA) return zone.subA;
  if (upper.includes("B") && zone.subB) return zone.subB;
  // category 우선 · label fallback
  return String(zone.category ?? zone.label ?? "").trim();
}

/**
 * ERP display_location 문자열 정제 · ">전체" 토큰 제거.
 *
 * 입력:  "벽>21>전체>전체"
 * 출력:  "벽 21"
 *
 * 입력:  "중앙>1>종합감기약>전체"
 * 출력:  "중앙 1 종합감기약"
 *
 * UI 표시용 · raw 는 tooltip 등에 보존 권장.
 */
export function cleanLocationString(loc: string | null | undefined): string {
  if (!loc) return "";
  return String(loc)
    .split(">")
    .map((s) => s.trim())
    .filter((s) => s && s !== "전체")
    .join(" ");
}

/**
 * ZoneClass 별 Tone (CSS class · HomeDashboard 톤 체계)
 * UI 에서 공통 사용 · tone registry
 */
export const ZONE_CLASS_TONE: Record<ZoneClass, {
  bg: string;
  text: string;
  strip: string;
  label: string;
}> = {
  상비약: { bg: "bg-rose-50",   text: "text-rose-700",   strip: "bg-rose-500",   label: "상비약" },
  뷰티:   { bg: "bg-pink-50",   text: "text-pink-700",   strip: "bg-pink-500",   label: "뷰티"  },
  미분류: { bg: "bg-slate-50",  text: "text-slate-600",  strip: "bg-slate-400",  label: "미분류" },
};
