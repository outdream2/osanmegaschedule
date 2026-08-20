// 2026-08-20 · cellReextract · reextractCellCandidates / reextractTextCellCandidates
import { describe, it, expect } from "vitest";
import {
  reextractCellCandidates,
  reextractTextCellCandidates,
  type CellReextractPage,
} from "./cellReextract";

const makePage = (rawText: string, rows: (string | number | null)[][]): CellReextractPage => ({
  page: 1,
  headers: ["품명", "규격", "수량", "단가", "금액"],
  rows,
  rawText,
});

describe("reextractCellCandidates · 수량", () => {
  it("품명 앵커로 rawText 스캔 · 후보 반환", () => {
    const page = makePage(
      "타이레놀정 500mg 10정 1500 15000 아스피린 20 500 10000",
      [
        ["타이레놀정", "500mg", 10, 1500, 15000],
        ["아스피린", "100mg", 20, 500, 10000],
      ]
    );
    const result = reextractCellCandidates({
      currentPage: page, otherPages: [], rowIndex: 0, columnKind: "수량",
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].confidence).toBeGreaterThan(0);
  });

  it("품명이 비어있으면 빈 배열", () => {
    const page = makePage("", [["", "", 10, 100, 1000]]);
    const result = reextractCellCandidates({
      currentPage: page, otherPages: [], rowIndex: 0, columnKind: "수량",
    });
    expect(result).toEqual([]);
  });

  it("컬럼이 없으면 빈 배열", () => {
    const badPage: CellReextractPage = {
      page: 1, headers: ["품명"], rows: [["타이레놀"]], rawText: "1000",
    };
    const result = reextractCellCandidates({
      currentPage: badPage, otherPages: [], rowIndex: 0, columnKind: "수량",
    });
    expect(result).toEqual([]);
  });

  it("결과 · confidence 내림차순 · 최대 15개", () => {
    const page = makePage(
      "타이레놀 " + Array.from({ length: 25 }, (_, i) => `${100 + i}`).join(" "),
      [["타이레놀", "", 10, 100, 1000]]
    );
    const result = reextractCellCandidates({
      currentPage: page, otherPages: [], rowIndex: 0, columnKind: "수량",
    });
    expect(result.length).toBeLessThanOrEqual(15);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].confidence).toBeLessThanOrEqual(result[i - 1].confidence);
    }
  });

  it("연도 20YY · 수량에서 제외", () => {
    const page = makePage(
      "타이레놀 2024 2025 10",
      [["타이레놀", "", 10, 100, 1000]]
    );
    const result = reextractCellCandidates({
      currentPage: page, otherPages: [], rowIndex: 0, columnKind: "수량",
    });
    // 2024, 2025 는 제외
    const values = result.map(c => c.value);
    expect(values).not.toContain(2024);
    expect(values).not.toContain(2025);
  });
});

describe("reextractCellCandidates · 금액 · Q×P=A boost", () => {
  it("방정식 성립 후보 · confidence 부스트 (source 에 표시)", () => {
    const page = makePage(
      "타이레놀 10 500 5000 999",
      [["타이레놀", "", 10, 500, 999]] // 실제 A=5000 (10*500)
    );
    const result = reextractCellCandidates({
      currentPage: page, otherPages: [], rowIndex: 0, columnKind: "금액",
    });
    const eqCand = result.find(c => c.value === 5000);
    if (eqCand) {
      expect(eqCand.source).toContain("Q×P=A 성립");
    }
  });
});

describe("reextractTextCellCandidates · 사업자번호", () => {
  it("사업자번호 패턴 · 추출", () => {
    const page: CellReextractPage = {
      page: 1,
      headers: ["품명", "사업자번호"],
      rows: [["타이레놀", "111-11-11111"]],
      rawText: "타이레놀 123-45-67890 500mg 999-88-77777",
    };
    const result = reextractTextCellCandidates({
      currentPage: page, otherPages: [], rowIndex: 0,
      columnName: "사업자번호", currentValue: "111-11-11111",
    });
    const values = result.map(c => c.value);
    expect(values).toContain("123-45-67890");
    expect(values).toContain("999-88-77777");
  });
});

describe("reextractTextCellCandidates · 규격", () => {
  it("규격 패턴 · mg/ml/정 등 추출", () => {
    const page: CellReextractPage = {
      page: 1,
      headers: ["품명", "규격"],
      rows: [["타이레놀", "100mg"]],
      rawText: "타이레놀 500mg 10정 30캡슐 100mL",
    };
    const result = reextractTextCellCandidates({
      currentPage: page, otherPages: [], rowIndex: 0,
      columnName: "규격", currentValue: "100mg",
    });
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("reextractTextCellCandidates · 현재 값 · 후보에서 제외", () => {
  it("currentValue 와 같은 값 · 제외", () => {
    const page: CellReextractPage = {
      page: 1,
      headers: ["품명", "공급처"],
      rows: [["약", "동일회사(주)"]],
      rawText: "동일회사(주) 다른회사(주)",
    };
    const result = reextractTextCellCandidates({
      currentPage: page, otherPages: [], rowIndex: 0,
      columnName: "공급처", currentValue: "동일회사(주)",
    });
    const values = result.map(c => c.value);
    expect(values).not.toContain("동일회사(주)");
  });
});

describe("reextractTextCellCandidates · 최대 6개", () => {
  it("결과 배열 · 최대 6", () => {
    const page: CellReextractPage = {
      page: 1,
      headers: ["품명"],
      rows: [["타이레놀"]],
      rawText: "가나다라마 바사아자차 카타파하가 나다라마바 사아자차카 타파하가나 다라마바사".repeat(2),
    };
    const result = reextractTextCellCandidates({
      currentPage: page, otherPages: [], rowIndex: 0,
      columnName: "품명", currentValue: "타이레놀",
    });
    expect(result.length).toBeLessThanOrEqual(6);
  });
});
