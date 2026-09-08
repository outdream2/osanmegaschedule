// src/constants/storeMapLayout.ts
// 2026-09-08 · 사용자 지시 · 14×8 직사각형 그리드 레이아웃으로 전면 재설계
//   참조: src/sample/zonecategory.png
//
// 구조 (horizontal grid · 14col × 8row):
//   Row 0 (top wall)    : 32·32·33·34·35·36·37·38·39·40·41·42·43·44  (14셀 · 32 두번)
//   Row 1-6 (aisles)    : 좌측벽(31→26) · 중앙 aisle 칼럼 4개 · 빈 칸
//     Col 0  (left wall): 31·30·29·28·27·26
//     Col 2  (aisle)    : 9B/9A · 10B/10A · 11B/11A
//     Col 5  (aisle)    : 8B/8A · 이벤트/이벤트 · 7B/7A
//     Col 8  (aisle)    : 4B/4A · 5B/5A · 6B/6A
//     Col 12 (aisle)    : 3B/3A · 2B/2A · 1B/1A
//   Row 7 (bottom wall) : 25·24·23·22·21·20·19·18·17·16·15·14·13·12  (14셀)

/** 상단 벽면 · 좌→우 · 14셀 (32 두번 포함) */
export const STORE_TOP_WALL: Array<number | string> = [32, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44];

/** 하단 벽면 · 좌→우 · 25→12 (14셀) */
export const STORE_BOTTOM_WALL: number[] = [25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12];

/** 좌측 벽면 · 위→아래 · 31→26 (6셀) */
export const STORE_LEFT_WALL: number[] = [31, 30, 29, 28, 27, 26];

export interface AisleColorSet {
  bg: string;
  border: string;
  text: string;
  labelBg: string;
}

/** aisle 칼럼 정의 · col: CSS grid column index (0-based) · pairs: B (위) / A (아래) */
export interface AisleColumn {
  col: number;
  pairs: Array<{ b: number | string; a: number | string }>;
}

export const STORE_AISLE_COLUMNS: AisleColumn[] = [
  // Col 2 · 9B/9A · 10B/10A · 11B/11A
  { col: 2, pairs: [{ b: 9, a: 9 }, { b: 10, a: 10 }, { b: 11, a: 11 }] },
  // Col 5 · 8B/8A · 이벤트/이벤트 · 7B/7A
  { col: 5, pairs: [{ b: 8, a: 8 }, { b: "이벤트", a: "이벤트" }, { b: 7, a: 7 }] },
  // Col 8 · 4B/4A · 5B/5A · 6B/6A
  { col: 8, pairs: [{ b: 4, a: 4 }, { b: 5, a: 5 }, { b: 6, a: 6 }] },
  // Col 12 · 3B/3A · 2B/2A · 1B/1A
  { col: 12, pairs: [{ b: 3, a: 3 }, { b: 2, a: 2 }, { b: 1, a: 1 }] },
];

/**
 * 중앙 진열대 A (진한 톤) 색상 팔레트 · 1~11
 */
export const CAT_A_COLORS: Record<number, AisleColorSet> = {
  1:  { bg: "bg-blue-500",    border: "border-blue-700",    text: "text-white",        labelBg: "bg-blue-800"    },
  2:  { bg: "bg-yellow-400",  border: "border-yellow-700",  text: "text-yellow-950",   labelBg: "bg-yellow-700"  },
  3:  { bg: "bg-red-500",     border: "border-red-700",     text: "text-white",        labelBg: "bg-red-800"     },
  4:  { bg: "bg-pink-500",    border: "border-pink-700",    text: "text-white",        labelBg: "bg-pink-800"    },
  5:  { bg: "bg-lime-500",    border: "border-lime-700",    text: "text-lime-950",     labelBg: "bg-lime-800"    },
  6:  { bg: "bg-sky-500",     border: "border-sky-700",     text: "text-white",        labelBg: "bg-sky-800"     },
  7:  { bg: "bg-indigo-500",  border: "border-indigo-700",  text: "text-white",        labelBg: "bg-indigo-800"  },
  8:  { bg: "bg-purple-500",  border: "border-purple-700",  text: "text-white",        labelBg: "bg-purple-800"  },
  9:  { bg: "bg-teal-500",    border: "border-teal-700",    text: "text-white",        labelBg: "bg-teal-800"    },
  10: { bg: "bg-orange-500",  border: "border-orange-700",  text: "text-white",        labelBg: "bg-orange-800"  },
  11: { bg: "bg-cyan-500",    border: "border-cyan-700",    text: "text-white",        labelBg: "bg-cyan-800"    },
};

/** 중앙 진열대 B (연한 톤) 색상 팔레트 · 1~11 */
export const CAT_B_COLORS: Record<number, AisleColorSet> = {
  1:  { bg: "bg-blue-100",    border: "border-blue-300",    text: "text-blue-900",    labelBg: "bg-blue-400"    },
  2:  { bg: "bg-yellow-100",  border: "border-yellow-300",  text: "text-yellow-900",  labelBg: "bg-yellow-400"  },
  3:  { bg: "bg-red-100",     border: "border-red-300",     text: "text-red-900",     labelBg: "bg-red-400"     },
  4:  { bg: "bg-pink-100",    border: "border-pink-300",    text: "text-pink-900",    labelBg: "bg-pink-400"    },
  5:  { bg: "bg-lime-100",    border: "border-lime-300",    text: "text-lime-900",    labelBg: "bg-lime-400"    },
  6:  { bg: "bg-sky-100",     border: "border-sky-300",     text: "text-sky-900",     labelBg: "bg-sky-400"     },
  7:  { bg: "bg-indigo-100",  border: "border-indigo-300",  text: "text-indigo-900",  labelBg: "bg-indigo-400"  },
  8:  { bg: "bg-purple-100",  border: "border-purple-300",  text: "text-purple-900",  labelBg: "bg-purple-400"  },
  9:  { bg: "bg-teal-100",    border: "border-teal-300",    text: "text-teal-900",    labelBg: "bg-teal-400"    },
  10: { bg: "bg-orange-100",  border: "border-orange-300",  text: "text-orange-900",  labelBg: "bg-orange-400"  },
  11: { bg: "bg-cyan-100",    border: "border-cyan-300",    text: "text-cyan-900",    labelBg: "bg-cyan-400"    },
};

/** 이벤트 존 색상 · 금색 앰버 팔레트 */
export const EVENT_ZONE_COLOR: AisleColorSet = {
  bg: "bg-amber-400",
  border: "border-amber-600",
  text: "text-amber-950",
  labelBg: "bg-amber-700",
};

/**
 * 벽면 셀 색상 · 구역 번호 → AisleColorSet
 * 참조: 제품존정보.jpg
 * 32→44: 상단 벽면 · 각 구역 특성에 맞는 컬러
 * 12→25: 하단 벽면
 * 26→31: 좌측 벽면
 */
export function getWallCellColor(zoneNum: number): AisleColorSet {
  // 상단 벽면 (32-44)
  if (zoneNum >= 32 && zoneNum <= 44) {
    const idx = zoneNum - 31; // 1~13
    const palette: AisleColorSet[] = [
      { bg: "bg-stone-200",   border: "border-stone-400",   text: "text-stone-800",  labelBg: "bg-stone-500"  }, // 32
      { bg: "bg-slate-200",   border: "border-slate-400",   text: "text-slate-800",  labelBg: "bg-slate-500"  }, // 33
      { bg: "bg-zinc-200",    border: "border-zinc-400",    text: "text-zinc-800",   labelBg: "bg-zinc-500"   }, // 34
      { bg: "bg-rose-100",    border: "border-rose-300",    text: "text-rose-800",   labelBg: "bg-rose-500"   }, // 35
      { bg: "bg-rose-100",    border: "border-rose-300",    text: "text-rose-800",   labelBg: "bg-rose-500"   }, // 36
      { bg: "bg-rose-100",    border: "border-rose-300",    text: "text-rose-800",   labelBg: "bg-rose-500"   }, // 37
      { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-800",labelBg: "bg-emerald-500"}, // 38
      { bg: "bg-zinc-100",    border: "border-zinc-300",    text: "text-zinc-800",   labelBg: "bg-zinc-500"   }, // 39
      { bg: "bg-brand-tint",  border: "border-sky-300",     text: "text-sky-900",    labelBg: "bg-sky-500"    }, // 40
      { bg: "bg-zinc-100",    border: "border-zinc-300",    text: "text-zinc-800",   labelBg: "bg-zinc-500"   }, // 41
      { bg: "bg-zinc-100",    border: "border-zinc-300",    text: "text-zinc-800",   labelBg: "bg-zinc-500"   }, // 42
      { bg: "bg-violet-100",  border: "border-violet-300",  text: "text-violet-800", labelBg: "bg-violet-500" }, // 43
      { bg: "bg-violet-100",  border: "border-violet-300",  text: "text-violet-800", labelBg: "bg-violet-500" }, // 44
    ];
    return palette[Math.min(idx - 1, palette.length - 1)];
  }
  // 하단 벽면 (12-25)
  if (zoneNum >= 12 && zoneNum <= 25) {
    const hues = ["bg-blue-100", "bg-sky-100", "bg-cyan-100", "bg-teal-100", "bg-emerald-100", "bg-green-100", "bg-lime-100", "bg-yellow-100", "bg-amber-100", "bg-orange-100", "bg-red-100", "bg-rose-100", "bg-pink-100", "bg-fuchsia-100"];
    const borders = ["border-blue-300", "border-sky-300", "border-cyan-300", "border-teal-300", "border-emerald-300", "border-green-300", "border-lime-300", "border-yellow-300", "border-amber-300", "border-orange-300", "border-red-300", "border-rose-300", "border-pink-300", "border-fuchsia-300"];
    const texts = ["text-blue-900", "text-sky-900", "text-cyan-900", "text-teal-900", "text-emerald-900", "text-green-900", "text-lime-900", "text-yellow-900", "text-amber-900", "text-orange-900", "text-red-900", "text-rose-900", "text-pink-900", "text-fuchsia-900"];
    const labels = ["bg-blue-400", "bg-sky-400", "bg-cyan-400", "bg-teal-400", "bg-emerald-400", "bg-green-400", "bg-lime-400", "bg-yellow-400", "bg-amber-400", "bg-orange-400", "bg-red-400", "bg-rose-400", "bg-pink-400", "bg-fuchsia-400"];
    // 25→12 순서 (bottom wall renders 25 first)
    const idx = 25 - zoneNum; // 0=25, 13=12
    const i = Math.min(idx, hues.length - 1);
    return { bg: hues[i], border: borders[i], text: texts[i], labelBg: labels[i] };
  }
  // 좌측 벽면 (26-31)
  if (zoneNum >= 26 && zoneNum <= 31) {
    const palette: AisleColorSet[] = [
      { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-900", labelBg: "bg-indigo-500" }, // 26
      { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-900", labelBg: "bg-indigo-500" }, // 27
      { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-900", labelBg: "bg-indigo-500" }, // 28
      { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-900", labelBg: "bg-indigo-500" }, // 29
      { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-900", labelBg: "bg-indigo-500" }, // 30
      { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-900", labelBg: "bg-indigo-500" }, // 31
    ];
    return palette[zoneNum - 26];
  }
  // fallback
  return { bg: "bg-stone-100", border: "border-stone-300", text: "text-stone-800", labelBg: "bg-stone-500" };
}

// ─── 하위 호환 export (기존 코드 import 파괴 방지) ───────────────────────────
/** @deprecated 새 레이아웃에서는 STORE_TOP_WALL (14셀) 사용 */
export const STORE_AISLE_CENTER: number = 22;

/** @deprecated 새 레이아웃에서는 STORE_AISLE_COLUMNS 사용 */
export const STORE_AISLE_PAIRS: number[] = [8, 7, 6, 5, 4, 3, 2, 1];

/** @deprecated 새 레이아웃에서는 STORE_AISLE_COLUMNS 에 통합 */
export const STORE_VERTICAL_WING: number[] = [];
