// @vitest-environment jsdom
// 2026-08-20 · RawOcrTable/utils · 순수 헬퍼 + 아이콘/텍스트 렌더 검증
//   · SCHEMA_ORDER · HIDDEN_COLS · NUM_COLS 상수
//   · fmt · 숫자 포맷
//   · normalizeExpiryDate · 다양한 날짜 입력 → YYYY-MM-DD
//   · isFallback · fallback 페이지 판별
//   · buildMasterHeaders · 페이지들의 헤더 통합
//   · alignRow · row 를 destination header 순으로 재정렬
//   · scoreColor · 점수 → color class
//   · ScoreIcon · React 아이콘 렌더
//   · parseNumber · 문자열 → 숫자
//   · renderTextWithBreaks · ... → <br /> 분해
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  SCHEMA_ORDER,
  HIDDEN_COLS,
  NUM_COLS,
  fmt,
  normalizeExpiryDate,
  isFallback,
  buildMasterHeaders,
  alignRow,
  scoreColor,
  ScoreIcon,
  parseNumber,
  renderTextWithBreaks,
} from "./utils";
import type { RawPage } from "./types";

describe("상수 · SCHEMA_ORDER / HIDDEN_COLS / NUM_COLS", () => {
  it("SCHEMA_ORDER · 11개 컬럼 순서", () => {
    expect(SCHEMA_ORDER).toEqual([
      "공급처", "일자", "품명", "수량", "단가", "금액", "세액", "규격", "유통기한", "단위", "비고",
    ]);
  });

  it("HIDDEN_COLS · 번호·배치번호·보험코드 포함", () => {
    expect(HIDDEN_COLS.has("번호")).toBe(true);
    expect(HIDDEN_COLS.has("배치번호")).toBe(true);
    expect(HIDDEN_COLS.has("보험코드")).toBe(true);
    expect(HIDDEN_COLS.has("소비기한")).toBe(true);
  });

  it("HIDDEN_COLS · 에누리는 제외 (계산에 사용)", () => {
    expect(HIDDEN_COLS.has("에누리")).toBe(false);
    expect(HIDDEN_COLS.has("에누리액")).toBe(false);
  });

  it("HIDDEN_COLS · 유통기한 제외 (SCHEMA_ORDER 포함)", () => {
    expect(HIDDEN_COLS.has("유통기한")).toBe(false);
  });

  it("NUM_COLS · 4개 (수량/단가/금액/세액)", () => {
    expect(NUM_COLS.has("수량")).toBe(true);
    expect(NUM_COLS.has("단가")).toBe(true);
    expect(NUM_COLS.has("금액")).toBe(true);
    expect(NUM_COLS.has("세액")).toBe(true);
    expect(NUM_COLS.has("품명")).toBe(false);
  });
});

describe("fmt · 숫자 포맷 (ko-KR)", () => {
  it("정수 · 콤마", () => {
    expect(fmt(1000)).toBe("1,000");
    expect(fmt(1234567)).toBe("1,234,567");
  });

  it("0 · 그대로", () => {
    expect(fmt(0)).toBe("0");
  });

  it("음수 · - 유지", () => {
    expect(fmt(-1500)).toBe("-1,500");
  });

  it("소수 · 그대로", () => {
    expect(fmt(1234.5)).toBe("1,234.5");
  });
});

describe("normalizeExpiryDate · 다양한 형식 → YYYY-MM-DD", () => {
  it("YYYYMMDD (8자리) · YYYY-MM-DD", () => {
    expect(normalizeExpiryDate("20261212")).toBe("2026-12-12");
    expect(normalizeExpiryDate("20261231")).toBe("2026-12-31");
  });

  it("YYMMDD (6자리) · 20YY 가정", () => {
    expect(normalizeExpiryDate("261212")).toBe("2026-12-12");
    expect(normalizeExpiryDate("991231")).toBe("2099-12-31");
  });

  it("YYYY.MM.DD · YYYY-MM-DD", () => {
    expect(normalizeExpiryDate("2026.12.31")).toBe("2026-12-31");
    expect(normalizeExpiryDate("2026.1.5")).toBe("2026-01-05");
  });

  it("YYYY/MM/DD · YYYY-MM-DD", () => {
    expect(normalizeExpiryDate("2026/12/31")).toBe("2026-12-31");
  });

  it("YYYY-M-D · zero pad", () => {
    expect(normalizeExpiryDate("2026-1-5")).toBe("2026-01-05");
  });

  it("YYYY-MM-DD · 그대로 (이미 정규화됨)", () => {
    expect(normalizeExpiryDate("2026-12-31")).toBe("2026-12-31");
  });

  it("빈 문자열 · 빈 문자열", () => {
    expect(normalizeExpiryDate("")).toBe("");
  });

  it("공백 trim", () => {
    expect(normalizeExpiryDate("  20261212  ")).toBe("2026-12-12");
  });

  it("매칭 안 되는 형식 · 원문 유지", () => {
    expect(normalizeExpiryDate("2026년 12월")).toBe("2026년 12월");
  });
});

describe("isFallback · fallback 페이지 판별", () => {
  it("원문 텍스트 헤더 · true", () => {
    expect(isFallback(["원문 텍스트"])).toBe(true);
  });

  it("원문 응답 헤더 · true", () => {
    expect(isFallback(["원문 응답"])).toBe(true);
  });

  it("빈 headers · true", () => {
    expect(isFallback([])).toBe(true);
  });

  it("정상 헤더 (여러 개) · false", () => {
    expect(isFallback(["품명", "수량", "단가"])).toBe(false);
  });

  it("단일 헤더 · 원문 아님 · false", () => {
    expect(isFallback(["품명"])).toBe(false);
  });
});

describe("buildMasterHeaders · 페이지 헤더 통합", () => {
  const mkPage = (headers: string[], meta: any = {}): RawPage => ({
    page: 1,
    headers,
    rows: [],
    meta,
  });

  it("SCHEMA_ORDER 순서로 정렬", () => {
    const pages = [mkPage(["금액", "단가", "품명"])];
    const r = buildMasterHeaders(pages);
    // 순서: 품명 < 단가 < 금액 · SCHEMA_ORDER 순
    expect(r.indexOf("품명")).toBeLessThan(r.indexOf("단가"));
    expect(r.indexOf("단가")).toBeLessThan(r.indexOf("금액"));
  });

  it("공급처 · meta.supplier 있으면 포함", () => {
    const pages = [mkPage(["품명"], { supplier: "A사" })];
    const r = buildMasterHeaders(pages);
    expect(r).toContain("공급처");
  });

  it("공급처 · meta.supplier 없으면 제외", () => {
    const pages = [mkPage(["품명"])];
    const r = buildMasterHeaders(pages);
    expect(r).not.toContain("공급처");
  });

  it("HIDDEN 헤더 · 통합 시 제외", () => {
    const pages = [mkPage(["품명", "번호", "보험코드"])];
    const r = buildMasterHeaders(pages);
    expect(r).not.toContain("번호");
    expect(r).not.toContain("보험코드");
    expect(r).toContain("품명");
  });

  it("여러 페이지 · union", () => {
    const pages = [
      mkPage(["품명", "수량"]),
      mkPage(["단가", "금액"]),
    ];
    const r = buildMasterHeaders(pages);
    expect(r).toEqual(expect.arrayContaining(["품명", "수량", "단가", "금액"]));
  });

  it("SCHEMA 밖 커스텀 헤더 · 뒤에 추가", () => {
    const pages = [mkPage(["품명", "특수컬럼"])];
    const r = buildMasterHeaders(pages);
    expect(r.indexOf("품명")).toBeLessThan(r.indexOf("특수컬럼"));
    expect(r).toContain("특수컬럼");
  });
});

describe("alignRow · 행 재정렬", () => {
  it("src → dst 순서로 재배치", () => {
    const src = ["a", "b", "c"];
    const dst = ["c", "a", "b"];
    const row = [1, 2, 3];
    expect(alignRow(row, src, dst)).toEqual([3, 1, 2]);
  });

  it("dst 에 있는데 src 에 없는 컬럼 · null", () => {
    const src = ["a", "b"];
    const dst = ["a", "c"];
    const row = [1, 2];
    expect(alignRow(row, src, dst)).toEqual([1, null]);
  });

  it("dst 가 src subset · 필요한 값만", () => {
    const src = ["a", "b", "c"];
    const dst = ["b"];
    const row = [1, 2, 3];
    expect(alignRow(row, src, dst)).toEqual([2]);
  });

  it("dst 빈 배열 · 빈 배열", () => {
    expect(alignRow([1, 2], ["a", "b"], [])).toEqual([]);
  });
});

describe("scoreColor · 점수 → tailwind 클래스", () => {
  it("80 이상 · emerald", () => {
    expect(scoreColor(80)).toBe("text-emerald-600");
    expect(scoreColor(100)).toBe("text-emerald-600");
  });

  it("50-79 · amber", () => {
    expect(scoreColor(50)).toBe("text-amber-500");
    expect(scoreColor(79)).toBe("text-amber-500");
  });

  it("50 미만 · rose", () => {
    expect(scoreColor(49)).toBe("text-rose-500");
    expect(scoreColor(0)).toBe("text-rose-500");
  });
});

describe("ScoreIcon · 점수별 아이콘", () => {
  it("80 이상 · CheckCircle · emerald", () => {
    const { container } = render(<ScoreIcon score={90} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class") ?? "").toContain("text-emerald-500");
  });

  it("50-79 · AlertTriangle · amber", () => {
    const { container } = render(<ScoreIcon score={60} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class") ?? "").toContain("text-amber-400");
  });

  it("50 미만 · XCircle · rose", () => {
    const { container } = render(<ScoreIcon score={30} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class") ?? "").toContain("text-rose-400");
  });
});

describe("parseNumber · 문자열/숫자 → 숫자", () => {
  it("숫자 그대로", () => {
    expect(parseNumber(1234)).toBe(1234);
    expect(parseNumber(0)).toBe(0);
  });

  it("문자열 숫자", () => {
    expect(parseNumber("1234")).toBe(1234);
  });

  it("콤마 · 콤마 제거", () => {
    expect(parseNumber("1,234,567")).toBe(1234567);
  });

  it("원화 · ₩ 등 제거", () => {
    expect(parseNumber("₩1,000")).toBe(1000);
    expect(parseNumber("1,000원")).toBe(1000);
  });

  it("null · 0", () => {
    expect(parseNumber(null)).toBe(0);
    expect(parseNumber(undefined)).toBe(0);
  });

  it("빈 문자열 · 0", () => {
    expect(parseNumber("")).toBe(0);
  });

  it("음수 · 유지", () => {
    expect(parseNumber("-500")).toBe(-500);
    expect(parseNumber("-1,500")).toBe(-1500);
  });

  it("소수 · 유지", () => {
    expect(parseNumber("1.5")).toBe(1.5);
    expect(parseNumber("1,000.50")).toBe(1000.5);
  });

  it("숫자 아님 · 0", () => {
    expect(parseNumber("abc")).toBe(0);
  });
});

describe("renderTextWithBreaks · ... 자리에서 <br /> 분해", () => {
  it("... 없음 · 원문 그대로", () => {
    const r = renderTextWithBreaks("Hello");
    expect(r).toBe("Hello");
  });

  it("... 포함 · React 조각으로 분할", () => {
    const { container } = render(<>{renderTextWithBreaks("A...B")}</>);
    expect(container.querySelectorAll("br").length).toBe(1);
    expect(container.textContent).toBe("AB");
  });

  it("… (single char) 포함 · 분할", () => {
    const { container } = render(<>{renderTextWithBreaks("A…B")}</>);
    expect(container.querySelectorAll("br").length).toBe(1);
    expect(container.textContent).toBe("AB");
  });

  it("복수 ... · 여러 <br />", () => {
    const { container } = render(<>{renderTextWithBreaks("A...B...C")}</>);
    expect(container.querySelectorAll("br").length).toBe(2);
    expect(container.textContent).toBe("ABC");
  });

  it("빈 문자열 · 빈 문자열", () => {
    const r = renderTextWithBreaks("");
    expect(r).toBe("");
  });
});
