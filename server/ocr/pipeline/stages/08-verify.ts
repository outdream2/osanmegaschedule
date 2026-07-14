import {
  verifyRowsAgainstRawText,
  autoFillMissingMathField,
} from "../../parse";
import type { Stage } from "../types";

// Stage 08: rawText 검증 + 최종 수식 채움
//   verifyRowsAgainstRawText: 셀 값 오독 → rawText 정답으로 교정
//   autoFillMissingMathField (final): 마지막 누락 필드 채움 + 수식 오독 교체
export const verifyStage: Stage = {
  name: "verify",
  run(ctx) {
    let rows = ctx.rows;
    const headers = ctx.headers;

    const verified = verifyRowsAgainstRawText(headers, rows, ctx.rawText ?? "");
    if (verified.correctedCount > 0) {
      console.log(`[verify/rawText] page ${ctx.page}: 숫자 셀 ${verified.correctedCount}개 자동 보정`);
    }
    rows = verified.rows;

    const autoFill = autoFillMissingMathField(headers, rows, ctx.rawText ?? "");
    if (autoFill.filledCount > 0) {
      console.log(`[verify/autoFill] page ${ctx.page}: 누락 필드 ${autoFill.filledCount}개 자동 계산`);
    }
    if (autoFill.fixedCount > 0) {
      console.log(`[verify/autoFill] page ${ctx.page}: 수식 오독 ${autoFill.fixedCount}개 rawText로 교체`);
    }
    rows = autoFill.rows;

    return { rows };
  },
};
