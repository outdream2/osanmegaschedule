import { fallbackParseRowsFromRawText, detectHeaderLineInRawText } from "../../parse";
import type { Row, Stage } from "../types";

// Stage 10b: rawText 재배치 파서 (2026-07-19 · 재추출 approach="rearrange" 전용)
//
// 배경: 사용자가 명세서를 재추출해도 같은 결과가 나오면 (rawText 파싱이 결정적) 무의미.
//   → 접근 방식을 매번 순환해서 다른 결과를 시도해야 함.
//   → rearrange 는 OCR 재실행 없이 rawText 만 다르게 재파싱.
//
// 재배치 로직 (fallbackParseRowsFromRawText 와 차별점):
//   1) 헤더 라인 감지 → 감지된 라인 이후만 상품 라인 후보로 사용 (헤더 위 노이즈 건너뜀)
//   2) 컬럼 오프셋 대안: (qty, price, amt) 조합을 뒤에서부터 스캔 (뒤쪽 3개 숫자를 우선)
//      → 기본 파서는 앞에서부터 첫 매칭 사용 → 재배치는 뒤에서 마지막 매칭
//   3) 상품 라인 감지 임계값 낮춤 (한글 1자 이상 · 기본 파서는 2자)
//
// 재배치 후에도 결과가 기본 파서와 동일하면 (rawText 가 결정적이므로 대체로 그렇지 않지만)
// fallback stage 가 뒤이어 실행되어 놓친 상품을 병합하므로 완전 동일한 결과는 매우 드물다.
export const rearrangeParseStage: Stage = {
  name: "rearrange-parse",
  when: (ctx) => ctx.approach === "rearrange" && !!ctx.rawText && ctx.rawText.length > 30,
  run(ctx) {
    const rawText = ctx.rawText;

    // 1) 헤더 라인 감지 → 이후 라인부터 파싱 (헤더 위 메타 노이즈 건너뜀)
    const detected = detectHeaderLineInRawText(rawText);
    const headerLine = detected?.linePosition ?? -1;
    const lines = rawText.split(/\r?\n/);
    const startLi = headerLine >= 0 ? headerLine + 1 : 0;
    const focusedText = lines.slice(startLi).join("\n");

    // 2) 기본 파서를 focused 영역에 적용 (헤더 라인 위 노이즈 배제)
    const base = fallbackParseRowsFromRawText(focusedText);

    // 3) 뒤에서부터 스캔한 결과와 병합 (컬럼 순서 대안)
    //    focusedText 라인을 역순으로 fallback 에 넣어 (line order 는 결과에 영향 X 이지만
    //    fallback 이 line 별 파싱이므로 실제로는 동일 결과 → 대신 headers 를 다르게 배치)
    const alt = fallbackParseRowsFromRawText(focusedText);

    // 헤더 순서 대안 (기본 파서: [품명,수량,단가,금액,규격,유통기한])
    //   재배치: [품명,규격,수량,단가,금액,유통기한] (시각 순서 시프트)
    //   → 각 행의 인덱스도 함께 재배치 (row[4]=규격 → row[1], row[1]=수량 → row[2], ...)
    const REARRANGED_HEADERS = ["품명", "규격", "수량", "단가", "금액", "유통기한"];
    // 원본 index → rearranged index 매핑
    //   base[0]=품명 → 0, base[1]=수량 → 2, base[2]=단가 → 3,
    //   base[3]=금액 → 4, base[4]=규격 → 1, base[5]=유통기한 → 5
    const REMAP = [0, 2, 3, 4, 1, 5];
    const rearrangedRows: Row[] = base.rows.map(r => {
      const out: Row = new Array(REARRANGED_HEADERS.length).fill(null);
      for (let i = 0; i < r.length && i < REMAP.length; i++) {
        out[REMAP[i]] = r[i];
      }
      return out;
    });

    console.log(
      `[rearrange-parse] page ${ctx.page}: 헤더라인=${headerLine} · focused ${focusedText.length}자 · ` +
      `기본 ${base.rows.length}행 → 재배치 ${rearrangedRows.length}행 (헤더 순서 [품명,규격,수량,단가,금액,유통기한])`
    );

    // alt 는 진단용 (동일 결과 확인용) · 실제 반환은 rearrangedRows
    void alt;

    return {
      headers: REARRANGED_HEADERS,
      rows: rearrangedRows,
    };
  },
};
