// server/ocr/__tests__/parse.fallback.test.ts
// rawText 폴백 파서 · 헤더 감지 회귀 방지 테스트 (Phase 4 · 2026-07-14)

import { describe, it, expect } from "vitest";
import {
  fallbackParseRowsFromRawText,
  detectHeaderLineInRawText,
  extractCommonMetadataLines,
} from "../parse";

describe("fallbackParseRowsFromRawText", () => {
  it("페이지 2 광동 · 2행 감지 · X×Y=Z 스캔", () => {
    const rt = `10024 광동원탕 100ML 1.000 25044 2028. 12.21 508 508,000
10053 광동쌍화탕(신형) 100ML 2.000 25036 2027.12.29 454 908,000`;
    const r = fallbackParseRowsFromRawText(rt);
    expect(r.rows.length).toBe(2);
    expect(r.rows[0][0]).toBe("광동원탕");
    expect(r.rows[0][1]).toBe(1000);
    expect(r.rows[0][2]).toBe(508);
    expect(r.rows[0][3]).toBe(508000);
    expect(r.rows[1][0]).toBe("광동쌍화탕(신형)");
  });

  it("페이지 3 대웅 · 헤더 오독 케이스도 감지", () => {
    const rt = `NO 제 품 명 보험코드 수량량 가 콤약백
1 모바렌캡슬 180C(90C*2EA)(익산공장) 7302378 100 23,100 2,310,000`;
    const r = fallbackParseRowsFromRawText(rt);
    expect(r.rows.length).toBe(1);
    expect(String(r.rows[0][0])).toContain("모바렌캡슬");
    expect(r.rows[0][1]).toBe(100);
    expect(r.rows[0][2]).toBe(23100);
    expect(r.rows[0][3]).toBe(2310000);
  });

  it("페이지 6 앤바이오 · 여러 줄 상품명 병합 (Phase 2c)", () => {
    const rt = `아래와 같이 게산합니다.
월 품목 규격 수량 단가 합계 비고
더리를스 비타D부스터 200이IU활성형비타
5 27 민D3 칼슘골다공증뼈건강1BOX2개월 30 7,000 210,000`;
    const r = fallbackParseRowsFromRawText(rt);
    expect(r.rows.length).toBe(1);
    // 이전 라인 (더리를스...) 이 병합되어야 함
    expect(String(r.rows[0][0])).toContain("더리를스");
    expect(r.rows[0][3]).toBe(210000);
  });

  it("8자리 유통기한 감지 (Fix 4 회귀 방지)", () => {
    const rt = "비타민C 500mg 10 1,500 15,000 20281130";
    const r = fallbackParseRowsFromRawText(rt);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0][5]).toBe("2028-11-30");
  });

  it("잘못된 8자리 (배치번호 등) 은 날짜로 오탐 안 됨", () => {
    const rt = "테스트품목 25000000 10 5,000 50,000";  // 25000000 = 2500년 (범위 밖)
    const r = fallbackParseRowsFromRawText(rt);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0][5]).toBeNull();
  });

  it("한글 없는 라인 스킵", () => {
    const rt = "10024 100ML 508 508,000";  // 한글 없음
    const r = fallbackParseRowsFromRawText(rt);
    expect(r.rows.length).toBe(0);
  });

  it("마침표만 있는 큰 숫자는 금액 후보에서 제외 (사용자 통찰)", () => {
    // "5.790" 이 실수로 5,790 원으로 잡히는 것 방지
    const rt = "테스트 5.790 100 500 5000";  // 5.790 은 수량 아님
    const r = fallbackParseRowsFromRawText(rt);
    // 5.790 이 금액으로 잡히면 안 됨
    for (const row of r.rows) {
      expect(row[3]).not.toBe(5790);
    }
  });
});

describe("detectHeaderLineInRawText", () => {
  it("표준 헤더 라인 감지 · 8개 필드", () => {
    const rt = `거래명세표
No 번호 제 품 명 규 격 수량 Batch.No 소비/사용기한 단 가 금 액 비 고
10024 광동원탕 100ML`;
    const r = detectHeaderLineInRawText(rt);
    expect(r).not.toBeNull();
    expect(r!.headers.length).toBeGreaterThanOrEqual(6);
    expect(r!.headers).toContain("품명");
    expect(r!.headers).toContain("수량");
    expect(r!.headers).toContain("금액");
  });

  it("헤더 오독 (수강 등) 도 표준으로 매핑", () => {
    const rt = `NO 제 품 명 보험코드 수량량 가 콤약백
1 모바렌캡슬`;
    const r = detectHeaderLineInRawText(rt);
    expect(r).not.toBeNull();
    expect(r!.headers).toContain("수량");   // 수량량 → 수량
  });

  it("헤더 없는 라인 · null 반환", () => {
    const rt = "광동원탕 10 508 5080\n갈근탕 5 1000 5000";
    const r = detectHeaderLineInRawText(rt);
    expect(r).toBeNull();
  });
});

describe("extractCommonMetadataLines", () => {
  it("여러 페이지 공통 라인 감지 (수신처 · 담당자)", () => {
    const pages = [
      "거래명세표\n경방신약(주)\n코스트팜약국(직/최)\n담당자 차인대\n제품A 10 500 5000",
      "거래명세표\n유한양행\n코스트팜약국(직/최)\n담당자 차인대\n제품B 5 1000 5000",
      "거래명세표\n대웅제약\n코스트팜약국(직/최)\n담당자 차인대\n제품C 3 2000 6000",
    ];
    const common = extractCommonMetadataLines(pages, 0.5);
    const compact = common.join("|");
    expect(compact).toContain("거래명세표");
    expect(compact).toMatch(/코스트팜약국/);
  });

  it("페이지 1개면 빈 배열", () => {
    const common = extractCommonMetadataLines(["단일 페이지"], 0.5);
    expect(common).toEqual([]);
  });
});
