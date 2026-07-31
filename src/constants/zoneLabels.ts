// src/constants/zoneLabels.ts
// 매장 구역 라벨 매핑 · 2026-07-31
//
// 목적:
//   내부 zone id (예: "1A", "1B", "9", "22", "35") 는 그대로 유지하되
//   UI 표시 번호(1~60) 는 이 파일 편집만으로 일괄 변경 가능.
//   DB(real_map) · 배정 로직 · 매핑 등은 원본 zone id 사용 → 안전.
//
// 편집 방법:
//   아래 ZONE_MAPPINGS 배열의 { number, zoneId } 를 조정하세요.
//   number = UI 표시 번호 (1~60)
//   zoneId = 내부 원본 id (건드리지 마세요)
//   dev 서버 재시작(또는 hot reload) 후 즉시 반영.
//
// 매장 실제 구조 (참고 · storeMapLayout.ts):
//   - 진열대 A/B pair 1~8 (16셀) · 1A, 1B, 2A, 2B, ..., 8A, 8B
//   - 상단 벽면 9~21 (13셀)
//   - 중앙 단독 22
//   - 하단 벽면 23~34 (12셀)
//   - 수직윙 35~42 (8셀)
//   총 50 셀. 아래 매핑은 1~50 순차 재넘버링 기본값 (여유 슬롯 있음 · 60 미만).
//
// TODO(B단계): 관리 UI 페이지 → DB 저장 · 사용자가 브라우저에서 편집 · 이 파일은 fallback.

export interface ZoneMapping {
  /** UI 표시 번호 (1~60) */
  number: number;
  /** 내부 원본 zone id · DB/로직에서 사용 (수정 금지) */
  zoneId: string;
  /** 선택적 · UI 상 표시할 부제 (없으면 storeMapLayout ZONE_DEFS 참조) */
  subLabel?: string;
}

export const ZONE_MAPPINGS: ZoneMapping[] = [
  // ── 진열대 (1~8 pair) · 1~16 ────────────────────────
  { number: 1,  zoneId: "1A" },
  { number: 2,  zoneId: "1B" },
  { number: 3,  zoneId: "2A" },
  { number: 4,  zoneId: "2B" },
  { number: 5,  zoneId: "3A" },
  { number: 6,  zoneId: "3B" },
  { number: 7,  zoneId: "4A" },
  { number: 8,  zoneId: "4B" },
  { number: 9,  zoneId: "5A" },
  { number: 10, zoneId: "5B" },
  { number: 11, zoneId: "6A" },
  { number: 12, zoneId: "6B" },
  { number: 13, zoneId: "7A" },
  { number: 14, zoneId: "7B" },
  { number: 15, zoneId: "8A" },
  { number: 16, zoneId: "8B" },

  // ── 상단 벽면 (9~21) · 17~29 ────────────────────────
  { number: 17, zoneId: "9"  },
  { number: 18, zoneId: "10" },
  { number: 19, zoneId: "11" },
  { number: 20, zoneId: "12" },
  { number: 21, zoneId: "13" },
  { number: 22, zoneId: "14" },
  { number: 23, zoneId: "15" },
  { number: 24, zoneId: "16" },
  { number: 25, zoneId: "17" },
  { number: 26, zoneId: "18" },
  { number: 27, zoneId: "19" },
  { number: 28, zoneId: "20" },
  { number: 29, zoneId: "21" },

  // ── 중앙 단독 (22) · 30 ─────────────────────────────
  { number: 30, zoneId: "22" },

  // ── 하단 벽면 (23~34) · 31~42 ───────────────────────
  { number: 31, zoneId: "23" },
  { number: 32, zoneId: "24" },
  { number: 33, zoneId: "25" },
  { number: 34, zoneId: "26" },
  { number: 35, zoneId: "27" },
  { number: 36, zoneId: "28" },
  { number: 37, zoneId: "29" },
  { number: 38, zoneId: "30" },
  { number: 39, zoneId: "31" },
  { number: 40, zoneId: "32" },
  { number: 41, zoneId: "33" },
  { number: 42, zoneId: "34" },

  // ── 수직윙 (35~42) · 43~50 ──────────────────────────
  { number: 43, zoneId: "35" },
  { number: 44, zoneId: "36" },
  { number: 45, zoneId: "37" },
  { number: 46, zoneId: "38" },
  { number: 47, zoneId: "39" },
  { number: 48, zoneId: "40" },
  { number: 49, zoneId: "41" },
  { number: 50, zoneId: "42" },

  // ── 여유 슬롯 (51~60) · 매장 확장 시 여기에 { number: 51, zoneId: "43" } 형태로 추가 ──
];

// ─────────────────────────────────────────────────────────────
// derived 조회 · O(1) 룩업
// ─────────────────────────────────────────────────────────────
export const ZONE_LABEL_MAP: Record<string, string> = Object.fromEntries(
  ZONE_MAPPINGS.map(m => [m.zoneId, String(m.number)])
);
const NUMBER_TO_ZONE: Record<string, string> = Object.fromEntries(
  ZONE_MAPPINGS.map(m => [String(m.number), m.zoneId])
);

/**
 * zone id 를 UI 표시 라벨(번호)로 변환.
 * 매핑 없으면 원본 id 그대로 반환 (안전 fallback).
 *
 * 사용 예:
 *   <span>{getZoneLabel("1A")}</span>          // "1"
 *   <span>{getZoneLabel(String(num))}</span>   // 숫자형 num 은 String() 캐스팅
 *   <span>{getZoneLabel(`${num}B`)}</span>     // pair B 셀
 */
export function getZoneLabel(zoneId: string | number | null | undefined): string {
  if (zoneId === null || zoneId === undefined) return "";
  const key = String(zoneId).trim();
  if (!key) return "";
  return ZONE_LABEL_MAP[key] ?? key;
}

/**
 * UI 번호로 원본 zone id 조회 (역방향).
 * 예: getZoneIdByNumber(1) → "1A"
 */
export function getZoneIdByNumber(num: number | string | null | undefined): string | null {
  if (num === null || num === undefined) return null;
  return NUMBER_TO_ZONE[String(num)] ?? null;
}
