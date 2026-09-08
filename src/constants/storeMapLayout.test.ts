// 2026-09-08 · storeMapLayout · 매장 구역도 레이아웃 상수 (14×8 직사각형 그리드)
import { describe, it, expect } from "vitest";
import {
  STORE_TOP_WALL,
  STORE_AISLE_CENTER,
  STORE_AISLE_PAIRS,
  STORE_BOTTOM_WALL,
  STORE_LEFT_WALL,
  STORE_VERTICAL_WING,
  STORE_AISLE_COLUMNS,
  CAT_A_COLORS,
  CAT_B_COLORS,
  EVENT_ZONE_COLOR,
  getWallCellColor,
} from "./storeMapLayout";

describe("STORE_TOP_WALL · 상단 벽면 (14셀 · 32 두번)", () => {
  it("14개", () => {
    expect(STORE_TOP_WALL).toHaveLength(14);
  });
  it("첫 번째·두 번째 모두 32 (duplication)", () => {
    expect(STORE_TOP_WALL[0]).toBe(32);
    expect(STORE_TOP_WALL[1]).toBe(32);
  });
  it("마지막 셀 44", () => {
    expect(STORE_TOP_WALL[STORE_TOP_WALL.length - 1]).toBe(44);
  });
});

describe("STORE_BOTTOM_WALL · 하단 벽면 (14셀 · 25→12)", () => {
  it("14개", () => {
    expect(STORE_BOTTOM_WALL).toHaveLength(14);
  });
  it("25로 시작 · 12로 끝", () => {
    expect(STORE_BOTTOM_WALL[0]).toBe(25);
    expect(STORE_BOTTOM_WALL[STORE_BOTTOM_WALL.length - 1]).toBe(12);
  });
});

describe("STORE_LEFT_WALL · 좌측 벽면 (6셀 · 31→26)", () => {
  it("6개", () => {
    expect(STORE_LEFT_WALL).toHaveLength(6);
  });
  it("31로 시작 · 26으로 끝", () => {
    expect(STORE_LEFT_WALL[0]).toBe(31);
    expect(STORE_LEFT_WALL[STORE_LEFT_WALL.length - 1]).toBe(26);
  });
});

describe("STORE_AISLE_COLUMNS · aisle 칼럼 정의", () => {
  it("4개 칼럼 (col 2·5·8·12)", () => {
    expect(STORE_AISLE_COLUMNS).toHaveLength(4);
    expect(STORE_AISLE_COLUMNS.map(c => c.col)).toEqual([2, 5, 8, 12]);
  });
  it("각 칼럼 · 3 pair", () => {
    for (const col of STORE_AISLE_COLUMNS) {
      expect(col.pairs).toHaveLength(3);
    }
  });
  it("col 5 · EVENT pair 포함 · 2026-09-08 · 이벤트 → EVENT 정정", () => {
    const col5 = STORE_AISLE_COLUMNS.find(c => c.col === 5)!;
    expect(col5.pairs[1].b).toBe("EVENT");
    expect(col5.pairs[1].a).toBe("EVENT");
  });
  it("col 12 · 1B/1A pair 포함", () => {
    const col12 = STORE_AISLE_COLUMNS.find(c => c.col === 12)!;
    expect(col12.pairs[2].b).toBe(1);
    expect(col12.pairs[2].a).toBe(1);
  });
});

describe("STORE_AISLE_CENTER · 하위호환 deprecated", () => {
  it("22 유지", () => {
    expect(STORE_AISLE_CENTER).toBe(22);
  });
});

describe("STORE_AISLE_PAIRS · 하위호환 deprecated", () => {
  it("[8,7,6,5,4,3,2,1] 유지", () => {
    expect(STORE_AISLE_PAIRS).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
  });
});

describe("STORE_VERTICAL_WING · 하위호환 deprecated · 빈 배열", () => {
  it("빈 배열 (새 레이아웃에서 STORE_AISLE_COLUMNS 로 이관)", () => {
    expect(STORE_VERTICAL_WING).toEqual([]);
  });
});

describe("CAT_A_COLORS · 진열대 A (진한 톤) · 1~11", () => {
  it("1~11번 정의", () => {
    for (let i = 1; i <= 11; i++) {
      expect(CAT_A_COLORS[i]).toBeDefined();
      expect(CAT_A_COLORS[i].bg).toContain("bg-");
      expect(CAT_A_COLORS[i].border).toContain("border-");
      expect(CAT_A_COLORS[i].text).toContain("text-");
      expect(CAT_A_COLORS[i].labelBg).toContain("bg-");
    }
  });
  it("1번 blue 계열 (500/700/800 진한 톤)", () => {
    expect(CAT_A_COLORS[1].bg).toContain("blue");
    expect(CAT_A_COLORS[1].labelBg).toContain("800");
  });
});

describe("CAT_B_COLORS · 진열대 B (연한 톤) · 1~11", () => {
  it("1~11번 정의", () => {
    for (let i = 1; i <= 11; i++) {
      expect(CAT_B_COLORS[i]).toBeDefined();
    }
  });
  it("1번 blue 계열 (100/300/400/900 연한 톤)", () => {
    expect(CAT_B_COLORS[1].bg).toContain("100");
    expect(CAT_B_COLORS[1].border).toContain("300");
    expect(CAT_B_COLORS[1].labelBg).toContain("400");
    expect(CAT_B_COLORS[1].text).toContain("900");
  });
  it("A/B 동일 계열 · 1~8번", () => {
    const checkPairs: Array<[number, string]> = [
      [1, "blue"], [2, "yellow"], [3, "red"], [4, "pink"],
      [5, "lime"], [6, "sky"], [7, "indigo"], [8, "purple"],
    ];
    for (const [num, hue] of checkPairs) {
      expect(CAT_A_COLORS[num].bg).toContain(hue);
      expect(CAT_B_COLORS[num].bg).toContain(hue);
    }
  });
});

describe("EVENT_ZONE_COLOR · 이벤트 존 · 앰버 팔레트", () => {
  it("amber 계열", () => {
    expect(EVENT_ZONE_COLOR.bg).toContain("amber");
    expect(EVENT_ZONE_COLOR.border).toContain("amber");
  });
});

describe("getWallCellColor · 벽면 셀 색상", () => {
  it("상단 벽면 32 · AisleColorSet 반환", () => {
    const c = getWallCellColor(32);
    expect(c.bg).toContain("bg-");
    expect(c.border).toContain("border-");
  });
  it("하단 벽면 12 · AisleColorSet 반환", () => {
    const c = getWallCellColor(12);
    expect(c.bg).toContain("bg-");
  });
  it("좌측 벽면 31 · AisleColorSet 반환", () => {
    const c = getWallCellColor(31);
    expect(c.bg).toContain("bg-");
  });
  it("범위 밖 숫자 · fallback 반환", () => {
    const c = getWallCellColor(99);
    expect(c.bg).toBeDefined();
  });
});
