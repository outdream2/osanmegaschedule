// 2026-08-20 · tableStructure · assignToCell 순수 함수
import { describe, it, expect } from "vitest";
import { assignToCell, type TableStructure } from "./tableStructure";

const bbox = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2, score: 0.9 });

describe("assignToCell · 텍스트 좌표 → row/col 인덱스", () => {
  const structure: TableStructure = {
    rows: [bbox(0, 0, 500, 50), bbox(0, 50, 500, 100), bbox(0, 100, 500, 150)],
    cols: [bbox(0, 0, 200, 500), bbox(200, 0, 400, 500), bbox(400, 0, 500, 500)],
    cells: [], headers: [], tables: [],
  };

  it("첫 셀 (0,0)", () => {
    const r = assignToCell(100, 25, structure);
    expect(r).toEqual({ rowIdx: 0, colIdx: 0 });
  });

  it("두번째 행 첫 열 · (1,0)", () => {
    const r = assignToCell(50, 75, structure);
    expect(r).toEqual({ rowIdx: 1, colIdx: 0 });
  });

  it("세번째 행 두번째 열 · (2,1)", () => {
    const r = assignToCell(300, 125, structure);
    expect(r).toEqual({ rowIdx: 2, colIdx: 1 });
  });

  it("표 밖 (y > 마지막 row) · null", () => {
    const r = assignToCell(100, 200, structure);
    expect(r).toBeNull();
  });

  it("표 밖 (x > 마지막 col) · null", () => {
    const r = assignToCell(600, 25, structure);
    expect(r).toBeNull();
  });

  it("경계값 · 정확히 x2/y2 · 포함", () => {
    const r = assignToCell(500, 50, structure);
    // findIndex · <= 이므로 첫 row/col 매치
    expect(r).not.toBeNull();
  });

  it("빈 rows/cols · null", () => {
    const empty: TableStructure = { rows: [], cols: [], cells: [], headers: [], tables: [] };
    expect(assignToCell(100, 100, empty)).toBeNull();
  });
});
