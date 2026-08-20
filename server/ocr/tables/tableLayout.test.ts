// 2026-08-20 · tableLayout · filterCellsByTables 순수 함수
import { describe, it, expect } from "vitest";
import { filterCellsByTables, type LayoutBox } from "./tableLayout";

const makeCell = (x: number, y: number, width = 100, height = 30) => ({
  box: { x, y, width, height },
});

const makeTable = (x1: number, y1: number, x2: number, y2: number): LayoutBox => ({
  x1, y1, x2, y2, confidence: 0.9, class_name: "table",
});

describe("filterCellsByTables · 표 안 셀 필터링", () => {
  const IMG_W = 1000;
  const IMG_H = 1000;

  it("표 없음 · 원본 셀 그대로 반환", () => {
    const cells = [makeCell(100, 100), makeCell(500, 500)];
    const r = filterCellsByTables(cells, [], IMG_W, IMG_H);
    expect(r).toHaveLength(2);
    expect(r).toBe(cells);
  });

  it("표 영역 안 셀만 유지", () => {
    // table (0.1~0.5, 0.2~0.7) · 픽셀 (100~500, 200~700)
    const table = makeTable(0.1, 0.2, 0.5, 0.7);
    const cells = [
      makeCell(150, 250, 100, 30), // 중심 (200, 265) → 정규화 (0.2, 0.265) · 안
      makeCell(600, 800, 100, 30), // 중심 (650, 815) → (0.65, 0.815) · 밖
      makeCell(200, 300, 100, 30), // 안
    ];
    const r = filterCellsByTables(cells, [table], IMG_W, IMG_H);
    expect(r).toHaveLength(2);
    expect(r).not.toContain(cells[1]);
  });

  it("여러 표 영역 · OR 조건 (어떤 표든 안)", () => {
    const tables = [
      makeTable(0.0, 0.0, 0.3, 0.3),
      makeTable(0.7, 0.7, 1.0, 1.0),
    ];
    const cells = [
      makeCell(50, 50),        // 첫 표 안
      makeCell(800, 800),      // 두번째 표 안
      makeCell(500, 500),      // 밖
    ];
    const r = filterCellsByTables(cells, tables, IMG_W, IMG_H);
    expect(r).toHaveLength(2);
  });

  it("빈 셀 배열 · 빈 결과", () => {
    const r = filterCellsByTables([], [makeTable(0, 0, 1, 1)], IMG_W, IMG_H);
    expect(r).toEqual([]);
  });

  it("모든 셀이 표 안 · 전부 반환", () => {
    const table = makeTable(0, 0, 1, 1); // 전체 영역
    const cells = [makeCell(100, 100), makeCell(500, 500)];
    const r = filterCellsByTables(cells, [table], IMG_W, IMG_H);
    expect(r).toHaveLength(2);
  });

  it("경계 셀 · 중심점 기준 판정", () => {
    const table = makeTable(0.5, 0.5, 1.0, 1.0); // 우하 절반
    const cells = [
      makeCell(400, 400, 200, 200), // 중심 (500, 500) · x=0.5, y=0.5 → 경계
      makeCell(900, 900),           // 중심 (950, 915) · 안
    ];
    const r = filterCellsByTables(cells, [table], IMG_W, IMG_H);
    // 첫셀 중심 (0.5,0.5) · 조건 >= x1 && <= x2 → 통과
    expect(r).toHaveLength(2);
  });
});
