// 2026-08-20 · fieldMatchLog · computeFieldMatchSummary
import { describe, it, expect, vi } from "vitest";
import { computeFieldMatchSummary, logFieldMatchSummary } from "./fieldMatchLog";

const HEADERS_ALL = ["품명", "수량", "단가", "금액", "유통기한"];

describe("computeFieldMatchSummary · 헤더 분석", () => {
  it("표준 헤더 5개 · 모두 인식", () => {
    const s = computeFieldMatchSummary(1, HEADERS_ALL, [], {});
    expect(s.headers.canonicalCount).toBe(5);
    expect(s.headers.hasProductName).toBe(true);
    expect(s.headers.hasQuantity).toBe(true);
    expect(s.headers.hasUnitPrice).toBe(true);
    expect(s.headers.hasAmount).toBe(true);
    expect(s.headers.hasExpiry).toBe(true);
    expect(s.headers.duplicateCount).toBe(0);
  });

  it("헤더 중복 · duplicateCount 계산", () => {
    const s = computeFieldMatchSummary(1, ["품명", "수량", "품명"], [], {});
    expect(s.headers.duplicateCount).toBe(1);
  });

  it("표준 아닌 헤더 · canonicalCount 낮음", () => {
    const s = computeFieldMatchSummary(1, ["코드", "제품", "기타"], [], {});
    expect(s.headers.canonicalCount).toBe(0);
    expect(s.headers.hasProductName).toBe(false);
  });
});

describe("computeFieldMatchSummary · 행 필드 채움", () => {
  const rows = [
    ["타이레놀", 10, 500, 5000, "2027-12-31"],
    ["아스피린", 5, null, 5000, ""],
    ["부루펜", null, null, null, null],
  ];

  it("filled 카운트 정확", () => {
    const s = computeFieldMatchSummary(1, HEADERS_ALL, rows, {});
    expect(s.rows.total).toBe(3);
    expect(s.rows.filledByField.품명).toBe(3);
    expect(s.rows.filledByField.수량).toBe(2);
    expect(s.rows.filledByField.단가).toBe(1);
    expect(s.rows.filledByField.금액).toBe(2);
    expect(s.rows.filledByField.유통기한).toBe(1);
  });
});

describe("computeFieldMatchSummary · Q×P=A 검증", () => {
  it("정확 · 모두 pass", () => {
    const rows = [
      ["a", 10, 500, 5000],
      ["b", 2, 300, 600],
    ];
    const s = computeFieldMatchSummary(1, ["품명", "수량", "단가", "금액"], rows, {});
    expect(s.qpaValidation.validRows).toBe(2);
    expect(s.qpaValidation.mathOkRows).toBe(2);
    expect(s.qpaValidation.passRate).toBe(1);
  });

  it("불일치 행 · mathOkRows 낮음", () => {
    const rows = [
      ["a", 10, 500, 5000],
      ["b", 10, 500, 999], // 불일치
    ];
    const s = computeFieldMatchSummary(1, ["품명", "수량", "단가", "금액"], rows, {});
    expect(s.qpaValidation.validRows).toBe(2);
    expect(s.qpaValidation.mathOkRows).toBe(1);
    expect(s.qpaValidation.passRate).toBe(0.5);
  });

  it("Q/P/A 컬럼 없음 · 0/0", () => {
    const s = computeFieldMatchSummary(1, ["품명"], [["a"]], {});
    expect(s.qpaValidation.validRows).toBe(0);
    expect(s.qpaValidation.mathOkRows).toBe(0);
  });
});

describe("computeFieldMatchSummary · totalsCheck", () => {
  it("metaTotal · rowsSum · diff", () => {
    const rows = [
      ["a", 10, 500, 5000],
      ["b", 5, 300, 1500],
    ];
    const s = computeFieldMatchSummary(1, ["품명", "수량", "단가", "금액"], rows, { total: 6500 });
    expect(s.totalsCheck.metaTotal).toBe(6500);
    expect(s.totalsCheck.rowsSum).toBe(6500);
    expect(s.totalsCheck.diff).toBe(0);
  });

  it("metaTotal 없음 · null", () => {
    const s = computeFieldMatchSummary(1, HEADERS_ALL, [], {});
    expect(s.totalsCheck.metaTotal).toBeNull();
    expect(s.totalsCheck.diff).toBe(0);
  });

  it("vatSeparate meta · 반영", () => {
    const s = computeFieldMatchSummary(1, HEADERS_ALL, [], { vatSeparate: true });
    expect(s.totalsCheck.vatSeparate).toBe(true);
  });
});

describe("computeFieldMatchSummary · 등급 산정", () => {
  it("완벽 매칭 · 90점 이상 · A+", () => {
    const rows = [
      ["a", 10, 500, 5000, "2027-12-31"],
      ["b", 2, 300, 600, "2028-01-01"],
    ];
    const s = computeFieldMatchSummary(1, HEADERS_ALL, rows, {
      supplier: "대웅",
      date: "2026-08-20",
      total: 5600,
    });
    expect(s.overallGrade).toBe("A+");
    expect(s.overallScore).toBeGreaterThanOrEqual(90);
  });

  it("supplier 없음 · missingFields 에 공급사", () => {
    const s = computeFieldMatchSummary(1, HEADERS_ALL, [], {});
    expect(s.missingFields).toContain("공급사");
    expect(s.missingFields).toContain("거래날짜");
  });

  it("행 없음 · 낮은 등급", () => {
    const s = computeFieldMatchSummary(1, HEADERS_ALL, [], {});
    expect(["F", "D", "C"]).toContain(s.overallGrade);
  });
});

describe("computeFieldMatchSummary · supplier/date 소스 반영", () => {
  it("supplier_inference.source · 반영", () => {
    const s = computeFieldMatchSummary(1, HEADERS_ALL, [], {
      supplier: "대웅",
      supplier_inference: { source: "biznum", confidence: 0.99 },
    });
    expect(s.supplier.value).toBe("대웅");
    expect(s.supplier.source).toBe("biznum");
    expect(s.supplier.confidence).toBe(0.99);
  });

  it("date · source=extractMeta", () => {
    const s = computeFieldMatchSummary(1, HEADERS_ALL, [], { date: "2026-08-20" });
    expect(s.date.value).toBe("2026-08-20");
    expect(s.date.source).toBe("extractMeta");
  });
});

describe("computeFieldMatchSummary · discount", () => {
  it("discount 값 · label 반영", () => {
    const s = computeFieldMatchSummary(1, HEADERS_ALL, [], {
      discount: 1000,
      discountLabel: "에누리",
    });
    expect(s.discount.value).toBe(1000);
    expect(s.discount.label).toBe("에누리");
  });

  it("discount 없음 · null", () => {
    const s = computeFieldMatchSummary(1, HEADERS_ALL, [], {});
    expect(s.discount.value).toBeNull();
    expect(s.discount.label).toBeNull();
  });
});

describe("logFieldMatchSummary · console 출력", () => {
  it("console.log 두 번 · 사람용 + JSON 구조화", () => {
    const s = computeFieldMatchSummary(1, HEADERS_ALL, [], { supplier: "대웅" });
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logFieldMatchSummary(s);
    expect(spy).toHaveBeenCalledTimes(2);
    // 두번째 호출 · [fieldMatch/json] prefix
    expect(spy.mock.calls[1][0]).toContain("[fieldMatch/json]");
    spy.mockRestore();
  });
});
