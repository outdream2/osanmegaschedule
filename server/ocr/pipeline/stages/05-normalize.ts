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
import { normSupplier } from "../../match";
import type { Stage } from "../types";

const STD_HEADERS = new Set(["품명", "규격", "수량", "단가", "금액", "유통기한", "비고", "번호", "세액", "단위", "일자"]);

// Stage 05: 셀·헤더 정규화 + 행 병합
//   - cleanCellValues → mergeAdjacentHeaders → fixDateInAmountColumns
//   - normalizeInvoiceCols (컬럼 데이터 지문 포함)
//   - applyPositionalHints → extractSpecFromName → validateCellTypes
//   - mergeSplitProductRows + mergeAdjacentSplitRows
export const normalizeStage: Stage = {
  name: "normalize",
  async run(ctx) {
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

    // 2026-07-21: 품명 컬럼 안전망 (longest-cell + row-structure signature 결합)
    //   사용자 통찰 A: "각 행에서 가장 긴 셀 = 상품명일 확률 매우 높음"
    //   사용자 통찰 B: "같은 구조인 행이 여러개면 상품명 행으로 인식"
    //     → 각 행의 셀 타입 시퀀스 (T=한글텍스트, N=숫자, D=날짜, _=빈셀) signature 생성
    //     → 가장 많이 나오는 signature = product row pattern
    //     → 그 pattern 안에서 T 컬럼 중 최장 = 품명
    if (headers.length > 0 && !headers.includes("품명") && rows.length > 0) {
      const isPureCode = (s: string) => /^\d{4,}$/.test(s) || /^[A-Z]\d{3,}$/i.test(s);
      const isDate = (s: string) => /^\s*(?:20\d{2}|\d{2})[-.\/\s]\d{1,2}[-.\/\s]\d{1,2}\s*$/.test(s);
      const cellType = (v: any): "_" | "T" | "N" | "D" => {
        if (v == null || v === "") return "_";
        const s = typeof v === "number" ? String(v) : String(v).trim();
        if (!s) return "_";
        if (isDate(s)) return "D";
        if (/^\-?\d{1,3}(?:[,.]\d{3})+(?:\.\d+)?$/.test(s) || /^\-?\d+(?:\.\d+)?$/.test(s)) return "N";
        return "T";
      };
      // 각 행 signature 생성
      const rowSignatures: string[] = rows.map(r => {
        if (!Array.isArray(r)) return "";
        return r.slice(0, headers.length).map(cellType).join("");
      });
      // signature 빈도 카운트
      const sigCount = new Map<string, number>();
      for (const sig of rowSignatures) {
        if (!sig || sig === "_".repeat(sig.length)) continue;
        sigCount.set(sig, (sigCount.get(sig) ?? 0) + 1);
      }
      // 최빈 signature 확인
      let dominantSig = "";
      let dominantCount = 0;
      for (const [sig, cnt] of sigCount) {
        if (cnt > dominantCount) { dominantSig = sig; dominantCount = cnt; }
      }
      const dominantRatio = rows.length > 0 ? dominantCount / rows.length : 0;
      // 60% 이상이 같은 signature = product row pattern 확정
      const useDominant = dominantRatio >= 0.6 && dominantCount >= 2;
      const targetRows = useDominant
        ? rows.filter((_, i) => rowSignatures[i] === dominantSig)
        : rows;
      if (useDominant) {
        console.log(`[normalize/row-sig] page ${ctx.page}: dominant signature "${dominantSig}" · ${dominantCount}/${rows.length}행 (${Math.round(dominantRatio*100)}%)`);
      }
      // 최장 셀 heuristic (product rows 내에서만)
      const winsPerCol = new Array(headers.length).fill(0);
      const koreanRatioPerCol = new Array(headers.length).fill(0);
      const lenSumPerCol = new Array(headers.length).fill(0);
      const cntPerCol = new Array(headers.length).fill(0);
      for (const row of targetRows) {
        if (!Array.isArray(row)) continue;
        let maxLen = 0, maxIdx = -1;
        for (let c = 0; c < headers.length; c++) {
          const v = row[c];
          if (v == null || v === "") continue;
          const s = typeof v === "number" ? String(v) : String(v).trim();
          if (isPureCode(s)) continue;
          cntPerCol[c]++;
          lenSumPerCol[c] += s.length;
          if (/[가-힣]/.test(s)) koreanRatioPerCol[c]++;
          if (s.length > maxLen) { maxLen = s.length; maxIdx = c; }
        }
        if (maxIdx >= 0 && maxLen >= 3) winsPerCol[maxIdx]++;
      }
      let bestCol = -1;
      let bestScore = 0;
      for (let c = 0; c < headers.length; c++) {
        if (cntPerCol[c] === 0) continue;
        const winRatio = winsPerCol[c] / Math.max(1, targetRows.length);
        const korRatio = koreanRatioPerCol[c] / cntPerCol[c];
        const avgLen = lenSumPerCol[c] / cntPerCol[c];
        if (winRatio < 0.5 || korRatio < 0.3 || avgLen < 3) continue;
        if (STD_HEADERS.has(headers[c]) && headers[c] !== "품명") continue;
        const score = winRatio * 100 + korRatio * 50 + Math.min(avgLen, 20) * 3;
        if (score > bestScore) { bestScore = score; bestCol = c; }
      }
      if (bestCol >= 0) {
        console.log(`[normalize/longest-cell-name] page ${ctx.page}: "${headers[bestCol]}" (col ${bestCol}) → "품명" (win ${Math.round(winsPerCol[bestCol]/Math.max(1,targetRows.length)*100)}% · score ${Math.round(bestScore)}${useDominant ? " · sig-filtered" : ""})`);
        headers = headers.map((h, i) => i === bestCol ? "품명" : h);
      }
    }

    // 2026-07-21: 동의어 DB 적용 · 사용자 저장 별칭 → canonical 상품명 자동 교체
    //   ocr_synonyms 테이블: prod_name_old(별칭) → product_code(canonical)
    //   → 코드로 products 테이블에서 canonical name 조회 → 자동 교체
    //   dynamic import: supabase 초기화가 module load 시 하지 않도록 (테스트 env 대응)
    try {
      const nameIdxSyn = headers.indexOf("품명");
      if (nameIdxSyn >= 0 && rows.length > 0) {
        const { getSynonymMap, getProductMap } = await import("../../../productCache");
        const [synMap, prodMap] = await Promise.all([getSynonymMap(), getProductMap()]);
        const supSup = String(ctx.meta?.supplier ?? "").trim();
        const supNorm = supSup ? normSupplier(supSup) : "";
        let replaced = 0;
        rows = rows.map(row => {
          if (!Array.isArray(row)) return row;
          const raw = String(row[nameIdxSyn] ?? "").trim();
          if (!raw || raw.length < 2) return row;
          const alias = raw.toLowerCase();
          // 공급사 특화 alias 우선 → 일반 alias 폴백
          const code = (supNorm && synMap.get(`${supNorm}|${alias}`)) || synMap.get(alias);
          if (!code) return row;
          const canonicalName = prodMap[code]?.name?.trim();
          if (!canonicalName || canonicalName === raw) return row;
          const next = [...row];
          next[nameIdxSyn] = canonicalName;
          replaced++;
          return next;
        });
        if (replaced > 0) {
          console.log(`[normalize/synonym] page ${ctx.page}: 동의어 DB 로 ${replaced}행 품명 canonical 교체`);
        }
      }
    } catch (e: any) {
      console.warn(`[normalize/synonym] 예외:`, e?.message);
    }

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
