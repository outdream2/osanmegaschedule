import {
  filterCodeOnlyRows,
  filterMetadataBleedRows,
} from "../../parse";
import type { Stage } from "../types";

// Stage 07: 노이즈 · 메타 필터
//   filterCodeOnlyRows (상품코드만 있는 행 제거)
//   filterMetadataBleedRows (스코어링 방식 · 회사명/주소/인명/수신처 제거)
export const filterStage: Stage = {
  name: "filter",
  run(ctx) {
    let rows = ctx.rows;
    const headers = ctx.headers;

    rows = filterCodeOnlyRows(headers, rows);
    const beforeMeta = rows.length;
    rows = filterMetadataBleedRows(headers, rows, ctx.meta);
    if (rows.length < beforeMeta) {
      console.log(`[filter] page ${ctx.page}: 메타 노이즈 ${beforeMeta - rows.length}행 제거`);
    }
    return { rows };
  },
};
