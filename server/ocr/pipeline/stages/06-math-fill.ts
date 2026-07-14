import {
  autoFillMissingMathField,
  fixAmountsBySubtotal,
  repairColumnShift,
  crossValidateIntraPage,
} from "../../parse";
import type { Stage } from "../types";

// Stage 06: 수식 채움 + 컬럼 밀림 복구 + 페이지 내 크로스 검증
//   조기 autoFill (수량·단가 있는데 금액 없음)
//   fixAmountsBySubtotal (meta.total 기준 밀림 복구)
//   repairColumnShift → crossValidateIntraPage
export const mathFillStage: Stage = {
  name: "math-fill",
  run(ctx) {
    let rows = ctx.rows;
    const headers = ctx.headers;

    // 조기 자동 계산 (수량 × 단가 = 금액 · 금액 없는 케이스 우선)
    const early = autoFillMissingMathField(headers, rows, ctx.rawText ?? "");
    if (early.filledCount > 0) {
      console.log(`[math-fill/early] page ${ctx.page}: 조기 자동 계산 ${early.filledCount}개`);
    }
    rows = early.rows;

    // meta.total 기준 컬럼 밀림 복구
    rows = fixAmountsBySubtotal(headers, rows, ctx.meta?.total ?? null);
    rows = repairColumnShift(headers, rows);
    rows = crossValidateIntraPage(headers, rows);

    return { rows };
  },
};
