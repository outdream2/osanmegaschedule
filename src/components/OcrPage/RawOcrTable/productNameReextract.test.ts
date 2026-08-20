// 2026-08-20 · productNameReextract · 품명 재추출 순수 헬퍼 함수
//   · findNameHeaderIdx · 품명 헤더 위치
//   · findRowPositionInRawText · rawText 에서 (qty, amt) 정확 매치
//   · computeScanText · 스캔 영역 확정 (local > header > anchor > full)
//   · collectNameCandidates · 한글 토큰 후보 필터
//   · scoreProductNameToken · 후보 스코어링
//   · koreanJaccardSimilarity · 한글 문자 Jaccard
import { describe, it, expect } from "vitest";
import {
  findNameHeaderIdx,
  findRowPositionInRawText,
  computeScanText,
  collectNameCandidates,
  scoreProductNameToken,
  koreanJaccardSimilarity,
} from "./productNameReextract";

describe("findNameHeaderIdx · 품명 헤더 탐색", () => {
  it("품명 헤더 · 위치 반환", () => {
    expect(findNameHeaderIdx("공급처: A · 품명 · 수량 · 금액")).toBeGreaterThan(0);
  });

  it("상품명 헤더 · 매치 (구현: '품명' 우선순위)", () => {
    // NAME_HEADER_VARIANTS 순서 · "품명" 이 "상품명" 앞 · "상품명" 안의 "품명" 이 먼저 매치됨
    const t = "코드 상품명 수량 단가";
    // "품명" 은 "상품명" 안에서 index=4 · 반환값 4
    expect(findNameHeaderIdx(t)).toBe(t.indexOf("품명"));
  });

  it("상품명 단독 · '품명' 부분매치로 반환", () => {
    // 상품명 만 있는 raw text
    const t = "abc 상품명 xyz";
    expect(findNameHeaderIdx(t)).toBe(t.indexOf("품명"));
  });

  it("품 명 (공백) · 매치", () => {
    const t = "번호 품 명 수량";
    expect(findNameHeaderIdx(t)).toBe(t.indexOf("품 명"));
  });

  it("제품명 매치", () => {
    expect(findNameHeaderIdx("코드 제품명 단가")).toBeGreaterThan(0);
  });

  it("명칭 매치", () => {
    expect(findNameHeaderIdx("코드 명칭 단가")).toBeGreaterThan(0);
  });

  it("헤더 없음 · -1", () => {
    expect(findNameHeaderIdx("코드 수량 단가")).toBe(-1);
  });

  it("빈 문자열 · -1", () => {
    expect(findNameHeaderIdx("")).toBe(-1);
  });
});

describe("findRowPositionInRawText · qty + amt 정확 매치", () => {
  it("qty + amt · 유일 · 위치 반환", () => {
    // qty=5, amt=1500 → rawText 에 유일하게 있으면 매치
    const rawText = "품명 수량 금액\n타이레놀 5 1,500";
    const r = findRowPositionInRawText(rawText, 5, 1500, rawText.indexOf("품명"));
    expect(r).not.toBeNull();
    expect(r!.pos).toBeGreaterThan(0);
    expect(r!.localScanText).toContain("타이레놀");
  });

  it("qty 두 곳 매치 · null (모호)", () => {
    // qty=5 두 번 · amt 두 번 근처 · null
    const rawText = "타이레놀 5 1,500\n게보린 5 1,500";
    const r = findRowPositionInRawText(rawText, 5, 1500, 0);
    // 두 곳 매치 · length !== 1 → null
    expect(r).toBeNull();
  });

  it("qty 0 · null", () => {
    expect(findRowPositionInRawText("A 5", 0, 0, 0)).toBeNull();
  });

  it("amt 0 (both 0) · null", () => {
    expect(findRowPositionInRawText("A 5 1500", 5, 0, 0)).toBeNull();
  });

  it("qty 앞뒤 다른 숫자 있음 · lookbehind/lookahead 처리 (55 는 5 매치 X)", () => {
    // qty=5 · rawText 에 "55" 만 있음 · 매치 X
    const rawText = "A 55 1,500";
    const r = findRowPositionInRawText(rawText, 5, 1500, 0);
    expect(r).toBeNull();
  });

  it("headerIdx -1 · 전체 rawText 스캔", () => {
    const rawText = "타이레놀 5 1,500";
    const r = findRowPositionInRawText(rawText, 5, 1500, -1);
    expect(r).not.toBeNull();
  });

  it("amt plain (콤마 없음) 매치", () => {
    const rawText = "A 5 1500";
    const r = findRowPositionInRawText(rawText, 5, 1500, 0);
    expect(r).not.toBeNull();
  });
});

describe("computeScanText · 스캔 영역 우선순위", () => {
  it("localScanText 있으면 최우선", () => {
    const r = computeScanText("full text", 5, "current", "local");
    expect(r).toBe("local");
  });

  it("localScanText 없으면 header 이후", () => {
    const raw = "prefix 품명 후속내용";
    const headerIdx = raw.indexOf("품명");
    const r = computeScanText(raw, headerIdx, "current", "");
    expect(r).toBe("품명 후속내용");
  });

  it("localScanText/header 없음 · anchor 로 스캔 (한글 3자 이상)", () => {
    const raw = "prefix ... 타이레놀 등장 · 근처 데이터 ...";
    const r = computeScanText(raw, -1, "타이레놀", "");
    // "타이" 앵커 · idx±100~300 슬라이스
    expect(r).toContain("타이레놀");
  });

  it("anchor 도 없음 · 전체 rawText", () => {
    const raw = "ABC 123";
    const r = computeScanText(raw, -1, "AB", "");  // currentName 은 한글 미포함
    expect(r).toBe(raw);
  });

  it("currentName 은 한글 있지만 rawText 에 없음 · 전체", () => {
    const raw = "ABC 123";
    const r = computeScanText(raw, -1, "가나다", "");
    expect(r).toBe(raw);
  });
});

describe("collectNameCandidates · 한글 토큰 필터", () => {
  // isValidProductName · 사람이름 배제 로직 (한글 2-4자 without 약품 접미어 → 배제)
  // 5자 이상이거나 약품 접미어(정·캡·액·포·시럽 등) 포함해야 상품명 통과
  it("한글 5자+ 토큰 · 포함", () => {
    const r = collectNameCandidates("타이레놀정 게보린정 A", "");
    expect(r).toEqual(expect.arrayContaining(["타이레놀정", "게보린정"]));
  });

  it("한글 1자 · 제외", () => {
    const r = collectNameCandidates("A 가 나 다 라", "");
    // 각각 1자 · 제외
    expect(r).toEqual([]);
  });

  it("금액형 · 제외 (콤마 숫자 포함)", () => {
    // NAME_RE 는 첫글자 한글 · 콤마 넘어 매치는 안 됨
    const r = collectNameCandidates("타이레놀정 12,345 게보린정", "");
    expect(r).toEqual(expect.arrayContaining(["타이레놀정", "게보린정"]));
  });

  it("currentName · 유효하면 포함 (없으면 추가)", () => {
    const r = collectNameCandidates("게보린정", "타이레놀정");
    expect(r).toEqual(expect.arrayContaining(["타이레놀정", "게보린정"]));
  });

  it("currentName · 이미 있으면 중복 X", () => {
    const r = collectNameCandidates("타이레놀정 게보린정", "타이레놀정");
    expect(r.filter(v => v === "타이레놀정").length).toBe(1);
  });

  it("중복 토큰 · 제거", () => {
    const r = collectNameCandidates("타이레놀정 타이레놀정 타이레놀정", "");
    expect(r).toEqual(["타이레놀정"]);
  });

  it("한글 2자만 (약품접미어 없음) · isValidProductName 배제 · 결과 없음", () => {
    // "가나" · 사람이름 패턴 · 배제
    const r = collectNameCandidates("가나 다라 마바", "");
    expect(r).toEqual([]);
  });
});

describe("scoreProductNameToken · 후보 스코어링", () => {
  it("길이 · 8 * length", () => {
    // "가나" (2자) · 한글 2자 · 근처 숫자 없음
    const s = scoreProductNameToken("가나", "가나 x");
    // 8*2 + 4*2 = 24
    expect(s).toBe(24);
  });

  it("근처 숫자 1개 · +5", () => {
    // 60자 이내에 숫자 1개 (2-7 digits)
    const s = scoreProductNameToken("가나", "가나 100");
    // 8*2 + 4*2 + 5 = 29
    expect(s).toBe(29);
  });

  it("근처 숫자 2개 · +15", () => {
    const s = scoreProductNameToken("가나", "가나 100 200");
    // 8*2 + 4*2 + 15 = 39
    expect(s).toBe(39);
  });

  it("한글 없음 · 4*0 = 0", () => {
    const s = scoreProductNameToken("abc", "abc");
    // 8*3 = 24
    expect(s).toBe(24);
  });

  it("token 없음 (scanText 에 없음) · 숫자 보너스 없음", () => {
    const s = scoreProductNameToken("가나다", "다른내용");
    // idx=-1 → 숫자 보너스 없음 · 8*3 + 4*3 = 36
    expect(s).toBe(36);
  });
});

describe("koreanJaccardSimilarity · 한글 문자 Jaccard", () => {
  it("동일 문자열 · 1", () => {
    expect(koreanJaccardSimilarity("타이레놀", "타이레놀")).toBe(1);
  });

  it("완전 다른 문자열 · 0", () => {
    expect(koreanJaccardSimilarity("타이", "게보")).toBe(0);
  });

  it("부분 교집합 · 0.5", () => {
    // "가나" · "가다" · 교집합 {가} · 합집합 {가,나,다} · 1/3
    expect(koreanJaccardSimilarity("가나", "가다")).toBeCloseTo(1 / 3, 5);
  });

  it("한글 없음 · 0", () => {
    expect(koreanJaccardSimilarity("ABC", "XYZ")).toBe(0);
    expect(koreanJaccardSimilarity("가나", "XYZ")).toBe(0);
  });

  it("빈 문자열 · 0", () => {
    expect(koreanJaccardSimilarity("", "가")).toBe(0);
    expect(koreanJaccardSimilarity("가", "")).toBe(0);
  });

  it("2/3 일치", () => {
    // "가나다" · "가나라" · 교집합 {가,나} · 합집합 {가,나,다,라} · 2/4 = 0.5
    expect(koreanJaccardSimilarity("가나다", "가나라")).toBeCloseTo(0.5, 5);
  });
});
