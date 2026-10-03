// src/shared/erp/erpLocationTransform.ts
// 2026-10-03 저녁 · Phase 2 · ERP LocationName → products.display_location 변환
//   · 사용자 확정 업무 규칙 (ERP "로케이션 상품 등록" 화면 기반):
//
//     벽    + Middle  →  normalized Middle           예: "벽>21>전체>전체" → "21"
//     N매대 + Middle  →  N + normalized Middle       예: "6매대>Ａ>7열>전체" → "6A"
//
//     전각 Ａ/Ｂ/Ｃ/Ｄ → 반각 A/B/C/D 정규화 (주로 2~9매대)
//
//     뷰티·냉장고·매대+뒤앞 → review 상태 반환 (자동 결정 안 함 · Preview 에서 사용자 선택)
//
//     ERP empty → derived=null · reason="empty" · KEEP EXISTING 정책
//
//   · pure function · side effect 없음 · Node + Browser 공통 사용
//   · DB WRITE 책임 없음 · 변환 결과만 반환

export type LocationTransformReason =
  | "ok_wall"               // "벽" + Middle
  | "ok_madae"              // "N매대" + Middle (뒤/앞 아님)
  | "review_beauty"         // "뷰티" + N번 · USER DECISION
  | "review_fridge"         // "냉장고" + Middle · USER DECISION
  | "review_rear_front"     // "N매대" + 뒤/앞 · USER DECISION
  | "empty"                 // ERP LocationName null/empty
  | "no_middle"             // "대분류>" 형태 (parts 1개)
  | "empty_middle"          // "대분류>" 또는 공백만
  | "unknown";              // 그 외 대분류 (방어)

export type LocationReviewFlag =
  | "LOCATION_REVIEW_BEAUTY"
  | "LOCATION_REVIEW_FRIDGE"
  | "LOCATION_REVIEW_REAR_FRONT";

export interface LocationTransformResult {
  /** 변환된 display_location 값 (ok_* 일 때만 non-null) */
  readonly derived: string | null;
  /** 변환 결과 분류 */
  readonly reason: LocationTransformReason;
  /** REVIEW 상품인 경우 flag · Preview UI 에서 그룹핑용 */
  readonly reviewFlag?: LocationReviewFlag;
  /** 파싱된 대분류 (diagnostic) */
  readonly major: string | null;
  /** 파싱된 중분류 raw (diagnostic · 정규화 전 값) */
  readonly middleRaw: string | null;
  /** 정규화된 중분류 (전각→반각) */
  readonly middleNormalized: string | null;
}

/** 전각 A/B/C/D → 반각 정규화 · 영문자 외는 유지 */
export function normalizeFullWidthLetters(s: string): string {
  return s
    .replace(/Ａ/g, "A")
    .replace(/Ｂ/g, "B")
    .replace(/Ｃ/g, "C")
    .replace(/Ｄ/g, "D");
}

/** 매대 번호 추출 · "6매대" → "6" · 매칭 안 되면 null */
function extractMadaeNumber(major: string): string | null {
  const m = major.match(/^([0-9]+)매대$/);
  return m ? m[1] : null;
}

/**
 * ERP LocationName (대분류>중분류>소분류>세분류) 를 products.display_location 으로 변환.
 *
 * @param locationName ERP Product_List.LocationName 원본 값 (또는 null/undefined)
 * @returns 변환 결과 · derived 는 벽/매대 규칙 통과 시만 non-null
 *
 * @example
 *   transformErpLocation("벽>21>전체>전체")        // { derived: "21", reason: "ok_wall", ... }
 *   transformErpLocation("6매대>Ａ>7열>전체")      // { derived: "6A", reason: "ok_madae", ... }
 *   transformErpLocation("뷰티>2번>전체>전체")      // { derived: null, reason: "review_beauty", reviewFlag: "LOCATION_REVIEW_BEAUTY", ... }
 *   transformErpLocation("")                       // { derived: null, reason: "empty", ... }
 */
export function transformErpLocation(locationName: string | null | undefined): LocationTransformResult {
  const empty: LocationTransformResult = { derived: null, reason: "empty", major: null, middleRaw: null, middleNormalized: null };
  if (locationName == null) return empty;
  const trimmed = String(locationName).trim();
  if (!trimmed) return empty;

  const parts = trimmed.split(">").map((p) => p.trim());
  const major = parts[0] || "";
  const middleRaw = parts[1] ?? "";

  if (parts.length < 2) {
    return { derived: null, reason: "no_middle", major: major || null, middleRaw: null, middleNormalized: null };
  }
  if (!middleRaw) {
    return { derived: null, reason: "empty_middle", major, middleRaw: "", middleNormalized: "" };
  }

  const middleNormalized = normalizeFullWidthLetters(middleRaw);

  // 벽 + Middle
  if (major === "벽") {
    return { derived: middleNormalized, reason: "ok_wall", major, middleRaw, middleNormalized };
  }

  // N매대 + Middle
  const madaeN = extractMadaeNumber(major);
  if (madaeN != null) {
    // 매대+뒤/앞 은 REVIEW (한글 포함 · isValidZoneCode 통과 못함 · 사용자 결정 필요)
    if (middleNormalized === "뒤" || middleNormalized === "앞") {
      return {
        derived: null,
        reason: "review_rear_front",
        reviewFlag: "LOCATION_REVIEW_REAR_FRONT",
        major, middleRaw, middleNormalized,
      };
    }
    return { derived: madaeN + middleNormalized, reason: "ok_madae", major, middleRaw, middleNormalized };
  }

  // 뷰티 → REVIEW
  if (major === "뷰티") {
    return {
      derived: null,
      reason: "review_beauty",
      reviewFlag: "LOCATION_REVIEW_BEAUTY",
      major, middleRaw, middleNormalized,
    };
  }

  // 냉장고 → REVIEW
  if (major === "냉장고") {
    return {
      derived: null,
      reason: "review_fridge",
      reviewFlag: "LOCATION_REVIEW_FRIDGE",
      major, middleRaw, middleNormalized,
    };
  }

  // 그 외 대분류 (방어)
  return { derived: null, reason: "unknown", major, middleRaw, middleNormalized };
}

/**
 * ERP 변환 결과를 토대로 "변경 가능 여부" 결정.
 *
 * ERP empty + DB has (73건) · ERP unspec (REVIEW) + DB has (43건) · 둘 다 KEEP EXISTING.
 *
 * @param erpResult transformErpLocation 결과
 * @param currentDbValue DB 의 현재 display_location (null/undefined 가능)
 * @returns "apply" (ERP 값 적용) · "keep" (DB 값 유지) · "review" (사용자 결정 대기)
 */
export function decideLocationApply(
  erpResult: LocationTransformResult,
  currentDbValue: string | null | undefined,
): "apply" | "keep" | "review" {
  const dbHas = currentDbValue != null && String(currentDbValue).trim() !== "";

  // ERP 가 자동 변환 성공한 경우 → apply (DB has 여부와 무관하게 ERP authoritative)
  if (erpResult.derived != null) return "apply";

  // ERP empty · DB has → KEEP (NULL overwrite 금지)
  if (erpResult.reason === "empty" || erpResult.reason === "no_middle" || erpResult.reason === "empty_middle") {
    return "keep";
  }

  // ERP review (뷰티·냉장고·앞뒤) → 사용자 결정 대기 · 현재는 KEEP
  if (erpResult.reviewFlag) return "review";

  // 그 외 unknown · 방어적으로 KEEP
  return "keep";
}
