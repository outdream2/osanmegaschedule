// 2026-08-20 · metadataKV · 상품 표 검출 · KV 페어링 · 라벨 매핑 · 값 파싱
import { describe, it, expect } from "vitest";
import {
  detectProductTableRegion,
  extractKeyValuePairs,
  mapLabelToField,
  parseFieldValue,
  extractInvoiceMetadata,
  type Cell,
} from "./metadataKV";

const makeCell = (text: string, x: number, y: number, width = 100, height = 30): Cell => ({
  text,
  box: { x, y, width, height },
});

describe("detectProductTableRegion · 헤더 검출", () => {
  it("품명·수량·단가·금액 4개 헤더 · 표 영역 반환", () => {
    const cells: Cell[] = [
      makeCell("품명", 100, 200),
      makeCell("수량", 200, 200),
      makeCell("단가", 300, 200),
      makeCell("금액", 400, 200),
      makeCell("타이레놀", 100, 250),
      makeCell("합계", 100, 400),
    ];
    const r = detectProductTableRegion(cells, 800);
    expect(r).not.toBeNull();
    expect(r!.y1).toBeLessThanOrEqual(200);
    // 합계 만나면 tableBottom
    expect(r!.y2).toBeLessThanOrEqual(400);
  });

  it("헤더 부족 (2개) · null 반환", () => {
    const cells: Cell[] = [
      makeCell("품명", 100, 200),
      makeCell("수량", 200, 200),
    ];
    expect(detectProductTableRegion(cells)).toBeNull();
  });

  it("빈 배열 · null", () => {
    expect(detectProductTableRegion([])).toBeNull();
    expect(detectProductTableRegion([] as any)).toBeNull();
  });

  it("종결 어휘 없음 · imageHeight 로 fallback", () => {
    const cells: Cell[] = [
      makeCell("품명", 100, 200),
      makeCell("수량", 200, 200),
      makeCell("단가", 300, 200),
    ];
    const r = detectProductTableRegion(cells, 1000);
    expect(r).not.toBeNull();
    expect(r!.y2).toBe(1000);
  });
});

describe("extractKeyValuePairs · 좌우 페어링", () => {
  it("2셀 · label|value 페어", () => {
    const cells: Cell[] = [
      makeCell("공급자", 100, 100),
      makeCell("대웅제약", 220, 100),
    ];
    const pairs = extractKeyValuePairs(cells, null);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].label).toBe("공급자");
    expect(pairs[0].value).toBe("대웅제약");
  });

  it("한 셀 안 · 콜론 구분 · label:value", () => {
    const cells: Cell[] = [makeCell("공급자: 대웅제약", 100, 100)];
    const pairs = extractKeyValuePairs(cells, null);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].label).toBe("공급자");
    expect(pairs[0].value).toBe("대웅제약");
  });

  it("표 영역 · 셀 제외", () => {
    const cells: Cell[] = [
      makeCell("공급자", 100, 100),
      makeCell("대웅", 220, 100),
      makeCell("품명", 100, 300),
      makeCell("타이레놀", 220, 300),
    ];
    const pairs = extractKeyValuePairs(cells, { y1: 250, y2: 500 });
    // 표 영역 밖 (y=100) 만 페어
    expect(pairs).toHaveLength(1);
    expect(pairs[0].label).toBe("공급자");
  });

  it("빈 셀 배열 · 빈 페어", () => {
    expect(extractKeyValuePairs([], null)).toEqual([]);
  });

  it("한 셀 · 콜론 없음 · 페어 없음", () => {
    const cells: Cell[] = [makeCell("그냥 텍스트", 100, 100)];
    expect(extractKeyValuePairs(cells, null)).toEqual([]);
  });
});

describe("mapLabelToField · 라벨 → 표준 필드", () => {
  it("supplier · 공급자·판매자·거래처·상호", () => {
    expect(mapLabelToField("공급자")).toBe("supplier");
    expect(mapLabelToField("판매자")).toBe("supplier");
    expect(mapLabelToField("거래처")).toBe("supplier");
    expect(mapLabelToField("상 호")).toBe("supplier");
  });

  it("recipient · 공급받는자 · supplier 보다 먼저", () => {
    expect(mapLabelToField("공급받는자")).toBe("recipient");
    expect(mapLabelToField("수신처")).toBe("recipient");
  });

  it("total 계열 · 합계 · 총액", () => {
    expect(mapLabelToField("합계")).toBe("total");
    expect(mapLabelToField("총액")).toBe("total");
    expect(mapLabelToField("총합계")).toBe("total");
  });

  it("subtotal · 소계", () => {
    expect(mapLabelToField("소계")).toBe("subtotal");
  });

  it("vat · 부가세·세액·VAT", () => {
    expect(mapLabelToField("부가세")).toBe("vat");
    expect(mapLabelToField("세액")).toBe("vat");
    expect(mapLabelToField("VAT")).toBe("vat");
  });

  it("supplierBalance vs balancePrev vs balanceAfter · 특정성 우선", () => {
    expect(mapLabelToField("전잔액")).toBe("balancePrev");
    expect(mapLabelToField("이월잔액")).toBe("balancePrev");
    expect(mapLabelToField("누적잔액")).toBe("balanceAfter");
    expect(mapLabelToField("잔액")).toBe("supplierBalance");
    expect(mapLabelToField("미수금")).toBe("supplierBalance");
  });

  it("date · 발행일·거래일자", () => {
    expect(mapLabelToField("발행일")).toBe("date");
    expect(mapLabelToField("거래일자")).toBe("date");
  });

  it("salesRep · 담당자·영업담당", () => {
    expect(mapLabelToField("담당자")).toBe("salesRep");
    expect(mapLabelToField("영업담당")).toBe("salesRep");
  });

  it("매칭 실패 · null", () => {
    expect(mapLabelToField("전화번호")).toBeNull();
    expect(mapLabelToField("주소")).toBeNull();
    expect(mapLabelToField("")).toBeNull();
  });
});

describe("parseFieldValue · 필드 타입별 파싱", () => {
  it("숫자 필드 · 쉼표 있는 숫자", () => {
    expect(parseFieldValue("total", "1,234,567")).toBe(1234567);
    expect(parseFieldValue("subtotal", "1,000")).toBe(1000);
  });

  it("숫자 필드 · 원 접미사 제거", () => {
    expect(parseFieldValue("total", "12,345원")).toBe(12345);
  });

  it("숫자 필드 · 최소 4자리 (쉼표 없음)", () => {
    expect(parseFieldValue("total", "50000")).toBe(50000);
    expect(parseFieldValue("total", "999")).toBeNull(); // 3자리 · reject
    expect(parseFieldValue("total", "5")).toBeNull();
  });

  it("date 필드 · YYYY-MM-DD", () => {
    expect(parseFieldValue("date", "2026-08-20")).toBe("2026-08-20");
    expect(parseFieldValue("date", "2026년 8월 5일")).toBe("2026-08-05");
    expect(parseFieldValue("date", "2026.08.20")).toBe("2026-08-20");
  });

  it("date 필드 · 매칭 실패 · null", () => {
    expect(parseFieldValue("date", "안녕하세요")).toBeNull();
  });

  it("문자 필드 · 앞뒤 특수문자 제거", () => {
    expect(parseFieldValue("supplier", ": 대웅제약")).toBe("대웅제약");
    expect(parseFieldValue("supplier", "  대웅  ")).toBe("대웅");
  });
});

describe("extractInvoiceMetadata · 통합 흐름", () => {
  it("supplier + total 추출", () => {
    const cells: Cell[] = [
      makeCell("공급자", 100, 100),
      makeCell("대웅제약", 220, 100),
      makeCell("합계", 100, 500),
      makeCell("1,234,567", 220, 500),
    ];
    const meta = extractInvoiceMetadata(cells);
    expect(meta.supplier).toBe("대웅제약");
    expect(meta.total).toBe(1234567);
  });

  it("기존 meta · 병합 · KV 로 보완", () => {
    const cells: Cell[] = [
      makeCell("공급자", 100, 100),
      makeCell("대웅제약", 220, 100),
    ];
    const meta = extractInvoiceMetadata(cells, undefined, { date: "2026-08-01" });
    expect(meta.date).toBe("2026-08-01");
    expect(meta.supplier).toBe("대웅제약");
  });

  it("supplierBalance fallback · balanceAfter → supplierBalance", () => {
    const cells: Cell[] = [
      makeCell("누적잔액", 100, 100),
      makeCell("500,000", 220, 100),
    ];
    const meta = extractInvoiceMetadata(cells);
    expect(meta.balanceAfter).toBe(500000);
    expect(meta.supplierBalance).toBe(500000);
  });

  it("total 이 supplierBalance 와 동일 · total 삭제", () => {
    const cells: Cell[] = [
      makeCell("잔액", 100, 100),
      makeCell("1,000,000", 220, 100),
      makeCell("합계", 100, 200),
      makeCell("1,000,000", 220, 200),
    ];
    const meta = extractInvoiceMetadata(cells);
    expect(meta.supplierBalance).toBe(1000000);
    expect(meta.total).toBeUndefined();
  });

  it("매칭 안 된 페어 · extraPairs 에 담김", () => {
    const cells: Cell[] = [
      makeCell("전화번호", 100, 100),
      makeCell("010-1234", 220, 100),
    ];
    const meta = extractInvoiceMetadata(cells);
    expect(meta.extraPairs).toBeDefined();
    expect(meta.extraPairs![0].label).toBe("전화번호");
  });

  it("기존 total 값이 크면 · KV 값 100배 이상 작을 시 무시 (오탐 방지)", () => {
    const cells: Cell[] = [
      makeCell("합계", 100, 100),
      makeCell("1,000", 220, 100), // KV 1000
    ];
    const meta = extractInvoiceMetadata(cells, undefined, { total: 500000 });
    // 500000 → KV 1000 은 500000/100 = 5000 초과 → parseAmount 는 1000 <5000 → skip
    expect(meta.total).toBe(500000);
  });
});
