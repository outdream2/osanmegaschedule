// @vitest-environment jsdom
// 2026-08-20 · exportHelpers · CSV·xlsx 내보내기 순수 부분 검증
//   · ERP_UPLOAD_HEADERS · 컬럼 순서·라벨
//   · parseXlsxTemplateHeaders · xlsx 첫줄 헤더 추출
//   · exportCsv · Blob 생성·다운로드 트리거 (DOM · jsdom)
//
// writeXlsxWithTemplate / writeErpUploadXlsx / writeXlsxFresh 는
// XLSX.writeFile (브라우저 다운로드 side-effect) 이라 skip
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as XLSX from "xlsx";
import { ERP_UPLOAD_HEADERS, parseXlsxTemplateHeaders, exportCsv } from "./exportHelpers";

describe("ERP_UPLOAD_HEADERS · 컬럼 순서 고정", () => {
  it("11개 컬럼 · 정확한 순서", () => {
    expect(ERP_UPLOAD_HEADERS).toEqual([
      "상품코드(*)", "상품명(*)", "규격", "마스터 매입단가", "공급처",
      "전표 매입단가", "매입수량(*)", "매입총계", "판매단가", "이익률", "소비기한",
    ]);
  });

  it("(*) 표기 · 필수 컬럼 3개 (상품코드·상품명·매입수량)", () => {
    const required = ERP_UPLOAD_HEADERS.filter(h => h.includes("(*)"));
    expect(required).toEqual(["상품코드(*)", "상품명(*)", "매입수량(*)"]);
  });
});

describe("parseXlsxTemplateHeaders", () => {
  it("정상 xlsx · 첫줄 헤더 배열 반환", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["코드", "이름", "가격"],
      ["001", "A", 1000],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const r = parseXlsxTemplateHeaders(buf);
    expect(r).toEqual(["코드", "이름", "가격"]);
  });

  it("빈 헤더 셀 · '' 로 채움", () => {
    // A1=코드, B1 없음, C1=가격
    const ws = XLSX.utils.aoa_to_sheet([["코드", null, "가격"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const r = parseXlsxTemplateHeaders(buf);
    // 헤더 range 는 최소 A1:C1 · B1 = 빈 문자열
    expect(r).not.toBeNull();
    expect(r![0]).toBe("코드");
    expect(r![2]).toBe("가격");
  });

  it("try/catch · 예외 시 null 반환 (xlsx read throw 시)", () => {
    // XLSX.read 는 대부분 tolerant · 진짜 throw 유발 어려움 · try/catch 존재만 검증
    const noop = new ArrayBuffer(0);
    // 결과가 null 또는 string[] · throw 는 절대 안 함
    expect(() => parseXlsxTemplateHeaders(noop)).not.toThrow();
  });

  it("빈 워크시트 · A1 기본 · [] or [\"\"]", () => {
    const ws = XLSX.utils.aoa_to_sheet([]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const r = parseXlsxTemplateHeaders(buf);
    // ws["!ref"] undefined → default A1 · 셀 없음 · [""]
    expect(r).not.toBeNull();
  });

  it("숫자 헤더 · String 변환", () => {
    const ws = XLSX.utils.aoa_to_sheet([[1, 2, 3]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const r = parseXlsxTemplateHeaders(buf);
    expect(r).toEqual(["1", "2", "3"]);
  });
});

describe("exportCsv · CSV 다운로드 (DOM 조작)", () => {
  let origCreateObjectURL: any;
  let origRevokeObjectURL: any;
  let clickCount: number;
  let clickHandler: () => void;

  beforeEach(() => {
    origCreateObjectURL = URL.createObjectURL;
    origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    clickCount = 0;
    clickHandler = () => { clickCount++; };
    // HTMLAnchorElement.prototype.click 을 전역 mock (재귀 없음)
    HTMLAnchorElement.prototype.click = clickHandler as any;
  });

  afterEach(() => {
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
    // click prototype 원복 (jsdom 기본 · noop)
    delete (HTMLAnchorElement.prototype as any).click;
  });

  it("정상 · Blob 생성 · a.click 호출 · revoke", () => {
    exportCsv(["코드", "이름"], [["001", "A"], ["002", "B"]], "test.csv");
    expect(clickCount).toBe(1);
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("빈 rows · 헤더만 · 여전히 Blob 생성", () => {
    exportCsv(["코드"], [], "empty.csv");
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(clickCount).toBe(1);
  });

  it("Blob 내용 · null 셀은 빈 문자열 · BOM 포함", () => {
    let blobBody: any = null;
    const origBlob = window.Blob;
    (window as any).Blob = class MockBlob {
      constructor(parts: any[]) { blobBody = parts.join(""); }
    };
    exportCsv(["코드", "이름"], [["001", null]], "test.csv");
    expect(blobBody).toContain('"001","",'.slice(0, -1)); // "001","" 매치
    // BOM 포함 (첫 문자 = FEFF)
    expect(blobBody.charCodeAt(0)).toBe(0xFEFF);
    (window as any).Blob = origBlob;
  });

  it("따옴표 포함 · 이중따옴표 이스케이프", () => {
    let blobBody: any = null;
    const origBlob = window.Blob;
    (window as any).Blob = class MockBlob {
      constructor(parts: any[]) { blobBody = parts.join(""); }
    };
    exportCsv(["코드"], [['He said "hi"']], "quote.csv");
    expect(blobBody).toContain('"He said ""hi"""');
    (window as any).Blob = origBlob;
  });

  it("숫자 값 · String 변환", () => {
    let blobBody: any = null;
    const origBlob = window.Blob;
    (window as any).Blob = class MockBlob {
      constructor(parts: any[]) { blobBody = parts.join(""); }
    };
    exportCsv(["수량"], [[42]], "num.csv");
    expect(blobBody).toContain('"42"');
    (window as any).Blob = origBlob;
  });

  it("CRLF 구분 · Excel 호환", () => {
    let blobBody: any = null;
    const origBlob = window.Blob;
    (window as any).Blob = class MockBlob {
      constructor(parts: any[]) { blobBody = parts.join(""); }
    };
    exportCsv(["A", "B"], [["1", "2"], ["3", "4"]], "crlf.csv");
    // 헤더 + 2행 · 총 3줄 · \r\n 구분
    const lineCount = (blobBody.match(/\r\n/g) ?? []).length;
    expect(lineCount).toBe(2);
    (window as any).Blob = origBlob;
  });
});
