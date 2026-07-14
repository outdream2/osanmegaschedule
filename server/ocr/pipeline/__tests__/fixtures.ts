// server/ocr/pipeline/__tests__/fixtures.ts
// 실제 OCR 결과를 모사한 fixture 데이터 (Phase 5 · 2026-07-14)
// 각 fixture 는 OCR 엔진이 반환할 만한 raw 데이터 + 기대되는 최종 결과 쌍

import type { RawOcrResult } from "../types";

export interface PipelineFixture {
  name: string;
  supplier: string;              // 기대 공급사
  raw: RawOcrResult;             // OCR 엔진 반환 시뮬레이션
  expected: {
    productCount: number;
    supplier?: string;
    total?: number;
    subtotal?: number;
    supplyAmount?: number;
    vat?: number;
    discount?: number;
    vatSeparate?: boolean;
    firstProductName?: string;   // 최소한 이 상품이 포함되어야 함
    firstProductQty?: number;
    firstProductPrice?: number;
    firstProductAmt?: number;
  };
}

// 페이지 1 · 경방신약 · 회사명/인명/주소 노이즈 필터 검증
export const 경방신약: PipelineFixture = {
  name: "경방신약 · 노이즈 필터",
  supplier: "경방신약(주)",
  raw: {
    headers: ["품명", "수량", "단가", "금액", "규격", "유통기한", "비고"],
    rows: [
      ["경방신약(주)", 11, 14182, 156000, null, null, null],
      ["김충환", 11, 14182, 156000, null, null, null],
      ["코스트팜약국", 5, 31200, 156000, "90p", null, null],
      ["인천남동구남동대로394", 5, 31200, 156000, "90p", null, null],
      ["진경안신엑스과립(가미귀비탕엑스과립)", 5, 31200, 156000, "90p", null, null],
      ["한태호", 31200, 5, 156000, null, null, null],
    ],
    meta: {
      supplier: "경방신약(주)",
      total: 156000,
      subtotal: 156000,
      supplyAmount: 141818,
      vat: 14182,
      date: "2026-05-19",
    },
    rawText: `거래명세표
경방신약(주)
김충환
코스트팜약국
인천남동구남동대로394
품명 규격 수량 단가 금액 비고
진경안신엑스과립(가미귀비탕엑스과립) 90p 5 31,200 156,000
한태호
공급가액 141,818 부가세 14,182 합계금액 156,000`,
  },
  expected: {
    productCount: 1,
    supplier: "경방신약(주)",
    total: 156000,
    firstProductName: "진경안신엑스과립(가미귀비탕엑스과립)",
    firstProductQty: 5,
    firstProductPrice: 31200,
    firstProductAmt: 156000,
  },
};

// 페이지 4 · 유한양행 · 인접 2행 병합 + 유통기한 오배정 복구
export const 유한양행: PipelineFixture = {
  name: "유한양행 · 인접 행 병합 + 유통기한 복구",
  supplier: "유한양행",
  raw: {
    headers: ["품명", "수량", "단가", "금액", "규격", "유통기한"],
    rows: [
      ["라라올라액 20mL 30V (N)", null, null, null, "30V", null],
      [null, 36, 55000, 20281130, null, null],  // 20281130 = 유통기한 오배정
    ],
    meta: {
      supplier: "유한양행",
      total: 1980000,
      date: "2026-04-15",
    },
    rawText: `유한양행
품명 규격 수량 단가 금액 유통기한
라라올라액 20mL 30V (N) 30V 36 55,000 1,980,000 2028-11-30
공급가액 1,800,000 부가세 180,000 합계 1,980,000`,
  },
  expected: {
    productCount: 1,
    supplier: "유한양행",
    firstProductName: "라라올라액 20mL 30V (N)",
    firstProductQty: 36,
    firstProductPrice: 55000,
    firstProductAmt: 1980000,
  },
};

// 페이지 5 · 케이제이디바이오 · 부가세 별도 감지
export const 케이제이디바이오: PipelineFixture = {
  name: "케이제이디바이오 · 부가세 별도 감지",
  supplier: "케이제이디바이오",
  raw: {
    headers: ["품명", "수량", "단가", "금액", "규격", "비고"],
    rows: [
      ["프리미엄 글루패스 [30포]", 1, 1636364, 1636364, "30포", null],
    ],
    meta: {
      supplier: "케이제이디바이오",
      total: 1800000,     // 부가세 포함
      supplyAmount: 1636364,
      vat: 163636,
    },
    rawText: `케이제이디바이오
프리미엄 글루패스 [30포] 1 1,636,364 1,636,364
공급가액 1,636,364 부가세 163,636 합계 1,800,000`,
  },
  expected: {
    productCount: 1,
    supplier: "케이제이디바이오",
    total: 1800000,
    vatSeparate: true,   // 자동 감지되어야 함
    firstProductName: "프리미엄 글루패스",
  },
};

// 페이지 7 · 댕기머리 · 잔액 오염 방지
export const 댕기머리: PipelineFixture = {
  name: "댕기머리 · 잔액 오염 방지",
  supplier: "미상",
  raw: {
    headers: ["품명", "수량", "단가", "금액", "규격"],
    rows: [
      ["댕기머리한방칼라크림5호(진갈색/약국전용)", 10, 4634, 46340, "1EA"],
      ["댕기머리한방칼라크림4호(자연갈색/약국전용)", 10, 4635, 46350, "1EA"],
      ["댕기머리포르테한방칼라크림7호/혹색", 10, 5790, 57900, "1EA"],
    ],
    meta: {
      // 잔액이 total로 오분류
      total: 53411540,  // 실제로는 이월잔액
      subtotal: 150590,  // 실제 상품 합
    },
    rawText: `댕기머리한방칼라크림5호 10 4,634 46,340
댕기머리한방칼라크림4호 10 4,635 46,350
댕기머리포르테한방칼라크림7호 10 5,790 57,900
소계 150,590
잔액 53,411,540`,
  },
  expected: {
    productCount: 3,
    // total 은 무효화되어야 함 (잔액 오염)
    subtotal: 150590,
  },
};

// 광동 · 부분 OCR 실패 + rawText 폴백 파서 (2행 감지)
export const 광동제약: PipelineFixture = {
  name: "광동제약 · rawText 폴백 (2행 감지)",
  supplier: "광동제약",
  raw: {
    headers: [],
    rows: [],  // SLANet 실패
    meta: {
      supplier: "광동제약",
    },
    rawText: `광동제약
No 번호 제 품 명 규 격 수량 Batch.No 소비/사용기한 단 가 금 액 비 고
10024 광동원탕 100ML 1.000 25044 2028. 12.21 508 508,000
10053 광동쌍화탕(신형) 100ML 2.000 25036 2027.12.29 454 908,000
합계 1,416,000`,
  },
  expected: {
    productCount: 2,
    supplier: "광동제약",
    firstProductName: "광동원탕",
    firstProductQty: 1000,
    firstProductPrice: 508,
    firstProductAmt: 508000,
  },
};

// 할인·에누리 명세서
export const 할인명세서: PipelineFixture = {
  name: "할인 · 에누리 명세서",
  supplier: "테스트공급사",
  raw: {
    headers: ["품명", "수량", "단가", "금액"],
    rows: [
      ["상품A", 10, 5000, 50000],
      ["상품B", 5, 10000, 50000],
    ],
    meta: {
      supplier: "테스트공급사",
      total: 95000,   // 100000 - 5000 에누리
      subtotal: 100000,
    },
    rawText: `테스트공급사
상품A 10 5,000 50,000
상품B 5 10,000 50,000
소계 100,000
에누리액 5,000
합계 95,000`,
  },
  expected: {
    productCount: 2,
    supplier: "테스트공급사",
    total: 95000,
    subtotal: 100000,
    discount: 5000,
  },
};

export const ALL_FIXTURES: PipelineFixture[] = [
  경방신약,
  유한양행,
  케이제이디바이오,
  댕기머리,
  광동제약,
  할인명세서,
];
