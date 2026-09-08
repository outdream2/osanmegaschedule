// src/constants/storeMapLayout.ts
// 매장 구역도 공용 레이아웃 상수
// 2026-09-08 · 사용자 지시 · zonecategory.png 참고 · 가로 배열 · 수평윙 존
//   · 이전 · L-shape (STORE_TOP_WALL 21→9 · VERTICAL_WING 35→46)
//   · 이후 · 수평 rectangular grid · 상단·하단 벽면 가로 배열 · 좌측 세로벽 · 중앙 aisle
//
// 새 구조 (14 col × 8 row grid):
//   Row 0 (top wall)    · 32·32·33·34·35·36·37·38·39·40·41·42·43·44 (14 cells)
//   Rows 1-6 (aisles)   · 좌측 col 0 = 31→26 · 중앙 4개 aisle 열 (col 2·5·8·12)
//     · aisle 열별 pair · (9-10-11) · (8-이벤트-7) · (4-5-6) · (3-2-1)
//   Row 7 (bottom wall) · 25·24·23·22·21·20·19·18·17·16·15·14·13·12 (14 cells)
//
// 카운터존 · 45번 이상 · 별도 컴포넌트 (미구현)

export const GRID_COLS = 14;
export const GRID_ROWS = 8;

/** 상단 벽면 · 좌→우 · 14셀 (32 두 개로 시작) */
export const STORE_TOP_WALL: number[] = [32, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44];

/** @deprecated 2026-09-08 · 신규 레이아웃 · 사용 X · 컴포넌트 rewrite 시 제거 · backward-compat */
export const STORE_AISLE_CENTER: number = 22;
/** @deprecated 2026-09-08 · 신규 레이아웃 · STORE_AISLE_COLUMNS 사용 */
export const STORE_AISLE_PAIRS: number[] = [8, 7, 6, 5, 4, 3, 2, 1];
/** @deprecated 2026-09-08 · 신규 레이아웃 · 상단 벽으로 이동 (35-44) · 45-46 카운터존 별도 */
export const STORE_VERTICAL_WING: number[] = [];

/** 하단 벽면 · 좌→우 · 14셀 (25 → 12) */
export const STORE_BOTTOM_WALL: number[] = [25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12];

/** 좌측 세로벽 · 위→아래 · 6셀 (31 → 26) · Row 1~6 · Col 0 */
export const STORE_LEFT_WALL: number[] = [31, 30, 29, 28, 27, 26];

/**
 * 중앙 aisle 셀 · 각 aisle 는 4행 세로 열 (rows 1-6 · 3 sub-pair)
 * 각 항목: { col: 그리드 열 인덱스, pairs: [B/A · B/A · B/A] · 각 pair 는 B 위·A 아래
 * "이벤트" 는 문자열 aisle · 숫자 대체
 */
export interface AisleColumn {
  col: number;                 // 그리드 열 인덱스 (0~13)
  pairs: Array<{ b: number | string; a: number | string }>;  // 3쌍
}

export const STORE_AISLE_COLUMNS: AisleColumn[] = [
  // 1번째 aisle 열 · col 2 · 9-10-11 (숫자 B/A pair)
  { col: 2, pairs: [{ b: "9B", a: "9A" }, { b: "10B", a: "10A" }, { b: "11B", a: "11A" }] },
  // 2번째 aisle 열 · col 5 · 8-이벤트-7
  { col: 5, pairs: [{ b: "8B", a: "8A" }, { b: "이벤트", a: "이벤트" }, { b: "7B", a: "7A" }] },
  // 3번째 aisle 열 · col 8 · 4-5-6
  { col: 8, pairs: [{ b: "4B", a: "4A" }, { b: "5B", a: "5A" }, { b: "6B", a: "6A" }] },
  // 4번째 aisle 열 · col 12 · 3-2-1
  { col: 12, pairs: [{ b: "3B", a: "3A" }, { b: "2B", a: "2A" }, { b: "1B", a: "1A" }] },
];

/**
 * 중앙 진열대 A (진한 톤) 색상 팔레트
 * 1~11번 진열대별 · 카테고리 시각 구분
 * 2026-09-08 · 9·10·11 확장 · TBD (사용자 색상 확정 필요)
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
  // 2026-09-08 · 확장 · TBD (색상 확정 후 조정)
  9:  { bg: "bg-teal-500",    border: "border-teal-700",    text: "text-white",       labelBg: "bg-teal-800"    },
  10: { bg: "bg-emerald-500", border: "border-emerald-700", text: "text-white",       labelBg: "bg-emerald-800" },
  11: { bg: "bg-cyan-500",    border: "border-cyan-700",    text: "text-white",       labelBg: "bg-cyan-800"    },
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
  9:  { bg: "bg-teal-100",    border: "border-teal-300",    text: "text-teal-900",    labelBg: "bg-teal-400"    },
  10: { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-900", labelBg: "bg-emerald-400" },
  11: { bg: "bg-cyan-100",    border: "border-cyan-300",    text: "text-cyan-900",    labelBg: "bg-cyan-400"    },
};

/**
 * 이벤트 존 색상 (특별 · gold)
 */
export const EVENT_ZONE_COLOR: AisleColorSet = {
  bg: "bg-amber-400",
  border: "border-amber-600",
  text: "text-amber-950",
  labelBg: "bg-amber-700",
};

/**
 * 벽면 셀 색상 (제품존정보.jpg 참고 · 잠정)
 *   · 12-16 · 감기·알러지·안약 (빨강)
 *   · 17-19 · 위장약·해열·진통제 (주황)
 *   · 20-25 · 반려동물·활력강장제 (노랑)
 *   · 26-31 · 팩킹중요매입 (연두)
 *   · 32-36 · 여성위생·유아기저귀 (하늘)
 *   · 37-39 · 여성위생 서브 (진한 파랑)
 *   · 40    · 팩킹 확장 (연두)
 *   · 41-44 · 화장품·스킨 (핑크)
 * 사용자 확정 시 조정
 */
export function getWallCellColor(zoneNum: number): AisleColorSet {
  if (zoneNum >= 12 && zoneNum <= 16) return { bg: "bg-rose-400",    border: "border-rose-600",    text: "text-white",      labelBg: "bg-rose-700"    };
  if (zoneNum >= 17 && zoneNum <= 19) return { bg: "bg-orange-400",  border: "border-orange-600",  text: "text-white",      labelBg: "bg-orange-700"  };
  if (zoneNum >= 20 && zoneNum <= 25) return { bg: "bg-yellow-300",  border: "border-yellow-500",  text: "text-yellow-950", labelBg: "bg-yellow-600"  };
  if (zoneNum >= 26 && zoneNum <= 31) return { bg: "bg-lime-300",    border: "border-lime-500",    text: "text-lime-950",   labelBg: "bg-lime-600"    };
  if (zoneNum >= 32 && zoneNum <= 36) return { bg: "bg-sky-200",     border: "border-sky-400",     text: "text-sky-900",    labelBg: "bg-sky-500"     };
  if (zoneNum >= 37 && zoneNum <= 39) return { bg: "bg-blue-500",    border: "border-blue-700",    text: "text-white",      labelBg: "bg-blue-800"    };
  if (zoneNum === 40)                 return { bg: "bg-lime-400",    border: "border-lime-600",    text: "text-lime-950",   labelBg: "bg-lime-700"    };
  if (zoneNum >= 41 && zoneNum <= 44) return { bg: "bg-pink-400",    border: "border-pink-600",    text: "text-white",      labelBg: "bg-pink-700"    };
  return { bg: "bg-zinc-200", border: "border-zinc-400", text: "text-zinc-700", labelBg: "bg-zinc-500" };
}
