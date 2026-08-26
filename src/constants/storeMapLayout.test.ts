// 2026-08-20 · storeMapLayout · 매장 구역도 레이아웃 상수
import { describe, it, expect } from "vitest";
import {
  STORE_TOP_WALL,
  STORE_AISLE_CENTER,
  STORE_AISLE_PAIRS,
  STORE_BOTTOM_WALL,
  STORE_VERTICAL_WING,
  CAT_A_COLORS,
  CAT_B_COLORS,
} from "./storeMapLayout";

describe("STORE_TOP_WALL · 상단 벽면 (13셀)", () => {
  it("13개 · 21→9 좌→우 감소", () => {
    expect(STORE_TOP_WALL).toHaveLength(13);
    expect(STORE_TOP_WALL[0]).toBe(21);
    expect(STORE_TOP_WALL[STORE_TOP_WALL.length - 1]).toBe(9);
  });

  it("각 항목 · 감소 순서", () => {
    for (let i = 1; i < STORE_TOP_WALL.length; i++) {
      expect(STORE_TOP_WALL[i]).toBeLessThan(STORE_TOP_WALL[i - 1]);
    }
  });
});

describe("STORE_AISLE_CENTER · 22번 단독", () => {
  it("22", () => {
    expect(STORE_AISLE_CENTER).toBe(22);
  });
});

describe("STORE_AISLE_PAIRS · 진열대 8→1", () => {
  it("8개 · 8→1", () => {
    expect(STORE_AISLE_PAIRS).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
  });
});

describe("STORE_BOTTOM_WALL · 하단 벽면 (12셀)", () => {
  it("12개 · 23→34 좌→우 증가", () => {
    expect(STORE_BOTTOM_WALL).toHaveLength(12);
    expect(STORE_BOTTOM_WALL[0]).toBe(23);
    expect(STORE_BOTTOM_WALL[STORE_BOTTOM_WALL.length - 1]).toBe(34);
  });

  it("각 항목 · 증가 순서", () => {
    for (let i = 1; i < STORE_BOTTOM_WALL.length; i++) {
      expect(STORE_BOTTOM_WALL[i]).toBeGreaterThan(STORE_BOTTOM_WALL[i - 1]);
    }
  });
});

describe("STORE_VERTICAL_WING · 수직윙 (12셀)", () => {
  // 2026-08-26 · 사용자 지시 · 카운터테마존 확장 · 43-46 추가 · 총 12셀
  it("12개 · 35→46", () => {
    expect(STORE_VERTICAL_WING).toEqual([35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46]);
  });
});

describe("CAT_A_COLORS · 진열대 A (진한 톤)", () => {
  it("1~8번 정의 · 각 색상세트", () => {
    for (let i = 1; i <= 8; i++) {
      expect(CAT_A_COLORS[i]).toBeDefined();
      expect(CAT_A_COLORS[i].bg).toContain("bg-");
      expect(CAT_A_COLORS[i].border).toContain("border-");
      expect(CAT_A_COLORS[i].text).toContain("text-");
      expect(CAT_A_COLORS[i].labelBg).toContain("bg-");
    }
  });

  it("Tailwind class · 500/700/800 형태 (진한 톤)", () => {
    expect(CAT_A_COLORS[1].bg).toContain("500");
    expect(CAT_A_COLORS[1].labelBg).toContain("800");
  });
});

describe("CAT_B_COLORS · 진열대 B (연한 톤)", () => {
  it("1~8번 정의 · 각 색상세트", () => {
    for (let i = 1; i <= 8; i++) {
      expect(CAT_B_COLORS[i]).toBeDefined();
    }
  });

  it("Tailwind class · 100/300/400/900 형태 (연한 톤)", () => {
    expect(CAT_B_COLORS[1].bg).toContain("100");
    expect(CAT_B_COLORS[1].border).toContain("300");
    expect(CAT_B_COLORS[1].labelBg).toContain("400");
    expect(CAT_B_COLORS[1].text).toContain("900");
  });
});

describe("CAT_A_COLORS · CAT_B_COLORS 색상 동일 계열", () => {
  it("1번 · A=blue-500, B=blue-100 (동일 blue 계열)", () => {
    expect(CAT_A_COLORS[1].bg).toContain("blue");
    expect(CAT_B_COLORS[1].bg).toContain("blue");
  });

  it("2번 · A/B 모두 yellow", () => {
    expect(CAT_A_COLORS[2].bg).toContain("yellow");
    expect(CAT_B_COLORS[2].bg).toContain("yellow");
  });

  it("8번 · A/B 모두 purple", () => {
    expect(CAT_A_COLORS[8].bg).toContain("purple");
    expect(CAT_B_COLORS[8].bg).toContain("purple");
  });
});

describe("총 셀 수 검증", () => {
  // 2026-08-26 · 카운터테마존 확장 · 수직윙 8 → 12 (43-46 추가) · 총 50 → 54
  it("상단 13 + 중앙 22 (1) + 진열대 pair 8 * 2 (16) + 하단 12 + 수직윙 12 = 54", () => {
    const total =
      STORE_TOP_WALL.length +
      1 + // STORE_AISLE_CENTER 22
      STORE_AISLE_PAIRS.length * 2 + // A + B
      STORE_BOTTOM_WALL.length +
      STORE_VERTICAL_WING.length;
    expect(total).toBe(54);
  });
});
