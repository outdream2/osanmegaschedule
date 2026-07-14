import {
  cleanCellValues,
  mergeAdjacentHeaders,
  fixDateInAmountColumns,
  normalizeInvoiceCols,
  applyPositionalHints,
  extractSpecFromName,
  validateCellTypes,
  mergeSplitProductRows,
  mergeAdjacentSplitRows,
  sanitizeOcrMeta,
  detectHeaderLineInRawText,
  stripRecipientName,
} from "../../parse";
import type { Stage } from "../types";

const STD_HEADERS = new Set(["품명", "규격", "수량", "단가", "금액", "유통기한", "비고", "번호", "세액", "단위", "일자"]);

// Stage 05: 셀·헤더 정규화 + 행 병합
//   - cleanCellValues → mergeAdjacentHeaders → fixDateInAmountColumns
//   - normalizeInvoiceCols (컬럼 데이터 지문 포함)
//   - applyPositionalHints → extractSpecFromName → validateCellTypes
//   - mergeSplitProductRows + mergeAdjacentSplitRows
export const normalizeStage: Stage = {
  name: "normalize",
  run(ctx) {
    let headers = ctx.headers;
    let rows = ctx.rows;

    const cleaned = cleanCellValues(headers, rows);
    headers = cleaned.headers;
    rows = cleaned.rows;

    const pre = mergeAdjacentHeaders(headers, rows);
    headers = pre.headers;
    rows = pre.rows;

    // 유통기한(YYYYMMDD)이 단가/금액에 오배정된 경우 복구
    const dateFixed = fixDateInAmountColumns(headers, rows);
    if (dateFixed.fixedCount > 0) {
      console.log(`[normalize/dateFix] page ${ctx.page}: 유통기한 오배정 ${dateFixed.fixedCount}셀 복구`);
    }
    rows = dateFixed.rows;

    const normalized = normalizeInvoiceCols(headers, rows);
    headers = normalized.headers;
    rows = normalized.rows;

    // Phase 6a (2026-07-14): 정규화 후에도 표준 헤더 < 3개면 rawText 에서 헤더 라인 감지
    //   OCR 이 셀 단위 헤더를 못 뽑았지만 rawText 에는 "품명 규격 수량 단가 금액" 같은
    //   원본 헤더 라인이 있을 때 · 이걸 감지해서 diagnostic 및 후속 stage 활용
    const stdCount = headers.filter(h => STD_HEADERS.has(h)).length;
    if (stdCount < 3 && ctx.rawText && ctx.rawText.length > 20) {
      const detected = detectHeaderLineInRawText(ctx.rawText);
      if (detected && detected.headers.length >= 3) {
        console.log(`[normalize/rawTextHeaders] page ${ctx.page}: 원본 헤더 부실(${stdCount}개) · rawText 라인 ${detected.linePosition} 에서 ${detected.headers.length}개 표준 헤더 감지: ${JSON.stringify(detected.headers)}`);
        // headers 가 비었으면 감지된 것 그대로 사용 (fallback stage 가 rows 채움)
        if (headers.length === 0 || rows.length === 0) {
          headers = detected.headers;
        }
      }
    }

    const hinted = applyPositionalHints(headers, rows);
    headers = hinted.headers;
    rows = hinted.rows;

    const spec = extractSpecFromName(headers, rows);
    headers = spec.headers;
    rows = spec.rows;

    const validated = validateCellTypes(headers, rows);
    if (validated.issues.length > 0) {
      console.log(`[normalize/validate] ${validated.issues.length}개 셀 보정`);
    }
    headers = validated.headers;
    rows = validated.rows;

    // 분리된 상품 행 병합
    const beforeMerge = rows.length;
    rows = mergeSplitProductRows(headers, rows);
    if (rows.length < beforeMerge) {
      console.log(`[normalize/mergeSplit] page ${ctx.page}: ${beforeMerge - rows.length}개 행 병합`);
    }
    // 인접 2행 병합 (품명만 있는 행 + 값만 있는 행)
    const adjMerged = mergeAdjacentSplitRows(headers, rows);
    if (adjMerged.mergedCount > 0) {
      console.log(`[normalize/mergeAdj] page ${ctx.page}: 인접 2행 ${adjMerged.mergedCount}쌍 병합`);
    }
    rows = adjMerged.rows;

    // 메타 정리
    const meta = sanitizeOcrMeta(ctx.meta);

    // 수신처 이름(코스트팜 등) 이 품명·공급사에 붙어있으면 제거 (2026-07-14 Phase 9)
    //   예: "코스트팜 광동원탕" → "광동원탕"
    //   env OCR_RECIPIENT_NAMES 로 추가 가능
    const nameIdx = headers.indexOf("품명");
    if (nameIdx >= 0) {
      let stripped = 0;
      rows = rows.map(r => {
        if (!Array.isArray(r)) return r;
        const raw = String(r[nameIdx] ?? "");
        if (!raw) return r;
        const cleaned = stripRecipientName(raw);
        if (cleaned !== raw) {
          stripped++;
          const next = [...r];
          next[nameIdx] = cleaned || raw;   // 전체 제거되면 원본 유지
          return next;
        }
        return r;
      });
      if (stripped > 0) console.log(`[normalize/recipientStrip] page ${ctx.page}: 품명 ${stripped}건 수신처 이름 제거`);
    }
    // 공급사에도 수신처 이름 붙어있으면 제거
    if (meta.supplier) {
      const cleanedSup = stripRecipientName(meta.supplier);
      if (cleanedSup && cleanedSup !== meta.supplier) {
        console.log(`[normalize/recipientStrip] page ${ctx.page}: 공급사 "${meta.supplier}" → "${cleanedSup}"`);
        meta.supplier = cleanedSup;
      } else if (!cleanedSup) {
        console.log(`[normalize/recipientStrip] page ${ctx.page}: 공급사 "${meta.supplier}" 전체가 수신처 → null 처리`);
        meta.supplier = undefined;
      }
    }

    return { headers, rows, meta };
  },
};
