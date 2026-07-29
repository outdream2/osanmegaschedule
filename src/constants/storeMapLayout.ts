// src/constants/storeMapLayout.ts
// 매장 구역도 공용 레이아웃 상수 · 2026-07-29 (사용자 요청 · 상위/미니 map 통합)
//   DisplayPage 매장 구역도 + SalesTrendPage MiniStoreZoneMap 이 공유
//   레이아웃 변경 시 두 곳 자동 반영
//
// 구조 (L-shape · 실제 매장 배치):
//   상단 벽면 (13셀 · 21→9 좌→우)
//   중앙 진열대 (22 단독 + 8B/8A → 1B/1A pair · 총 17셀)
//   하단 벽면 (12셀 · 23→34 좌→우)
//   우측 수직윙 (8셀 · 35→42 위→아래)

/** 상단 벽면 · 좌→우 · 21번부터 9번까지 (13개) */
export const STORE_TOP_WALL: number[] = [21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9];

/** 중앙 진열대 · 왼쪽 단독 22번 */
export const STORE_AISLE_CENTER: number = 22;

/** 중앙 진열대 · 8→1 (각 B|A pair · 좌→우 · 8pair = 16셀) */
export const STORE_AISLE_PAIRS: number[] = [8, 7, 6, 5, 4, 3, 2, 1];

/** 하단 벽면 · 좌→우 · 23번부터 34번까지 (12개) */
export const STORE_BOTTOM_WALL: number[] = [23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];

/** 우측 수직윙 · 위→아래 · 35번부터 42번까지 (8개) */
export const STORE_VERTICAL_WING: number[] = [35, 36, 37, 38, 39, 40, 41, 42];

/**
 * 중앙 진열대 A (진한 톤) 색상 팔레트
 * 1~8번 진열대별 · 카테고리 시각 구분
 */
export interface AisleColorSet {
  bg: string;
  border: string;
  text: string;
  labelBg: string;
}
export const CAT_A_COLORS: Record<number, AisleColorSet> = {
  1: { bg: "bg-blue-500",   border: "border-blue-700",   text: "text-white",       labelBg: "bg-blue-800"   },
  2: { bg: "bg-yellow-400", border: "border-yellow-700", text: "text-yellow-950",  labelBg: "bg-yellow-700" },
  3: { bg: "bg-red-500",    border: "border-red-700",    text: "text-white",       labelBg: "bg-red-800"    },
  4: { bg: "bg-pink-500",   border: "border-pink-700",   text: "text-white",       labelBg: "bg-pink-800"   },
  5: { bg: "bg-lime-500",   border: "border-lime-700",   text: "text-lime-950",    labelBg: "bg-lime-800"   },
  6: { bg: "bg-sky-500",    border: "border-sky-700",    text: "text-white",       labelBg: "bg-sky-800"    },
  7: { bg: "bg-indigo-500", border: "border-indigo-700", text: "text-white",       labelBg: "bg-indigo-800" },
  8: { bg: "bg-purple-500", border: "border-purple-700", text: "text-white",       labelBg: "bg-purple-800" },
};

/** 중앙 진열대 B (연한 톤) 색상 팔레트 */
export const CAT_B_COLORS: Record<number, AisleColorSet> = {
  1: { bg: "bg-blue-100",   border: "border-blue-300",   text: "text-blue-900",   labelBg: "bg-blue-400"   },
  2: { bg: "bg-yellow-100", border: "border-yellow-300", text: "text-yellow-900", labelBg: "bg-yellow-400" },
  3: { bg: "bg-red-100",    border: "border-red-300",    text: "text-red-900",    labelBg: "bg-red-400"    },
  4: { bg: "bg-pink-100",   border: "border-pink-300",   text: "text-pink-900",   labelBg: "bg-pink-400"   },
  5: { bg: "bg-lime-100",   border: "border-lime-300",   text: "text-lime-900",   labelBg: "bg-lime-400"   },
  6: { bg: "bg-sky-100",    border: "border-sky-300",    text: "text-sky-900",    labelBg: "bg-sky-400"    },
  7: { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-900", labelBg: "bg-indigo-400" },
  8: { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-900", labelBg: "bg-purple-400" },
};
