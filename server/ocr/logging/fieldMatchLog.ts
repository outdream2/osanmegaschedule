// server/ocr/fieldMatchLog.ts
// 필드별 매칭 진단 로그 (2026-07-21)
//
// 목적: 각 페이지 파이프라인 종료 후, 필드별 매칭 성공/실패/근거를 구조화 로그로 남겨
//       추후 매칭율 최대화 튜닝의 데이터 소스로 활용.
//
// 출력 형식:
//   [fieldMatch/page N] {json summary}
//   → jq · rg 로 필터·집계 가능

export interface FieldMatchSummary {
  page: number;
  supplier: {
    value: string | null;
    source: string | null;       // "biznum" · "alias" · "exact" · "fuzzy" · "product-based" · "reverse-lookup" · "extract-raw"
    confidence?: number;
  };
  date: {
    value: string | null;
    source: string | null;       // "meta.date" · "extractMeta" · "kv-pair"
  };
  headers: {
    list: string[];
    canonicalCount: number;       // 표준 헤더(품명·수량·단가·금액·유통기한 등) 개수
    duplicateCount: number;
    hasProductName: boolean;
    hasQuantity: boolean;
    hasUnitPrice: boolean;
    hasAmount: boolean;
    hasExpiry: boolean;
  };
  rows: {
    total: number;
    filledByField: {
      품명: number;
      수량: number;
      단가: number;
      금액: number;
      유통기한: number;
    };
  };
  qpaValidation: {
    validRows: number;            // Q, P, A 모두 존재하는 행 수
    mathOkRows: number;           // Q * P ≈ A 성립 행 수
    passRate: number;             // mathOkRows / validRows (0~1)
  };
  totalsCheck: {
    metaTotal: number | null;
    rowsSum: number;
    diff: number;                 // rowsSum - metaTotal
    vatSeparate: boolean;
  };
  discount: {
    value: number | null;
    label: string | null;
  };
  overallGrade: "A+" | "A" | "B" | "C" | "D" | "F";
  overallScore: number;           // 0-100
  missingFields: string[];        // 미매칭 필드 목록
}

/**
 * 매칭 요약 계산 (헤더/행/메타 입력)
 */
export function computeFieldMatchSummary(
  page: number,
  headers: string[],
  rows: (string | number | null)[][],
  meta: any,
): FieldMatchSummary {
  const STD = ["품명", "수량", "단가", "금액", "유통기한", "번호", "세액", "규격", "비고", "단위", "일자"];
  const canonicalCount = headers.filter(h => STD.includes(h)).length;
  const duplicateCount = headers.length - new Set(headers).size;

  const idx = (n: string) => headers.indexOf(n);
  const nameIdx = idx("품명");
  const qIdx = idx("수량");
  const pIdx = idx("단가");
  const aIdx = idx("금액");
  const eIdx = idx("유통기한");

  const isFilled = (v: any): boolean => v != null && String(v).trim().length > 0;
  const parseN = (v: any): number => {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    const clean = String(v).replace(/[^0-9.-]/g, "");
    const n = parseFloat(clean);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const filled = {
    품명: nameIdx >= 0 ? rows.filter(r => Array.isArray(r) && isFilled(r[nameIdx])).length : 0,
    수량: qIdx >= 0 ? rows.filter(r => Array.isArray(r) && isFilled(r[qIdx])).length : 0,
    단가: pIdx >= 0 ? rows.filter(r => Array.isArray(r) && isFilled(r[pIdx])).length : 0,
    금액: aIdx >= 0 ? rows.filter(r => Array.isArray(r) && isFilled(r[aIdx])).length : 0,
    유통기한: eIdx >= 0 ? rows.filter(r => Array.isArray(r) && isFilled(r[eIdx])).length : 0,
  };

  // Q×P=A 검증
  let qpaValid = 0;
  let qpaOk = 0;
  if (qIdx >= 0 && pIdx >= 0 && aIdx >= 0) {
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const q = parseN(row[qIdx]);
      const p = parseN(row[pIdx]);
      const a = parseN(row[aIdx]);
      if (q > 0 && p > 0 && a > 0) {
        qpaValid++;
        if (Math.abs(q * p - a) <= Math.max(1, a * 0.02)) qpaOk++;
      }
    }
  }

  // 총합계 검증
  const metaTotal: number | null = typeof meta?.total === "number" ? meta.total : null;
  let rowsSum = 0;
  if (aIdx >= 0) {
    for (const row of rows) {
      if (Array.isArray(row)) rowsSum += parseN(row[aIdx]);
    }
  }
  const totalDiff = metaTotal != null ? rowsSum - metaTotal : 0;
  const vatSeparate = Boolean(meta?.vatSeparate);

  // 등급 산정 (0-100 점)
  let score = 0;
  const missing: string[] = [];
  // 공급사 (20점)
  if (meta?.supplier) score += 20;
  else missing.push("공급사");
  // 거래날짜 (10점)
  if (meta?.date) score += 10;
  else missing.push("거래날짜");
  // 헤더 표준화 (15점)
  score += Math.min(15, canonicalCount * 3);
  // 상품행 필드 채움 (30점)
  const rowFillScore =
    rows.length > 0
      ? Math.round(
          ((filled.품명 + filled.수량 + filled.단가 + filled.금액) / (4 * rows.length)) * 30,
        )
      : 0;
  score += rowFillScore;
  // Q×P=A 검증 통과율 (15점)
  const qpaScore = qpaValid > 0 ? Math.round((qpaOk / qpaValid) * 15) : 0;
  score += qpaScore;
  // 유통기한 (5점)
  if (rows.length > 0 && filled.유통기한 / rows.length >= 0.5) score += 5;
  else if (filled.유통기한 > 0) score += 2;
  // 총합계 매칭 (5점)
  if (metaTotal != null && Math.abs(totalDiff) < Math.max(10, rowsSum * 0.02)) score += 5;
  else if (metaTotal != null) missing.push("총합계-불일치");

  const grade: FieldMatchSummary["overallGrade"] =
    score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";

  // 미매칭 필드 상세
  if (filled.품명 < rows.length * 0.8) missing.push(`품명-${rows.length - filled.품명}/${rows.length}`);
  if (filled.수량 < rows.length * 0.8) missing.push(`수량-${rows.length - filled.수량}/${rows.length}`);
  if (filled.단가 < rows.length * 0.8) missing.push(`단가-${rows.length - filled.단가}/${rows.length}`);
  if (filled.금액 < rows.length * 0.8) missing.push(`금액-${rows.length - filled.금액}/${rows.length}`);
  if (qpaValid > 0 && qpaOk / qpaValid < 0.7) missing.push(`Q×P검증-${qpaOk}/${qpaValid}`);

  return {
    page,
    supplier: {
      value: meta?.supplier ?? null,
      source: meta?.supplier_inference?.source ?? null,
      confidence: meta?.supplier_inference?.confidence,
    },
    date: {
      value: meta?.date ?? null,
      source: meta?.date ? "extractMeta" : null,
    },
    headers: {
      list: headers,
      canonicalCount,
      duplicateCount,
      hasProductName: nameIdx >= 0,
      hasQuantity: qIdx >= 0,
      hasUnitPrice: pIdx >= 0,
      hasAmount: aIdx >= 0,
      hasExpiry: eIdx >= 0,
    },
    rows: {
      total: rows.length,
      filledByField: filled,
    },
    qpaValidation: {
      validRows: qpaValid,
      mathOkRows: qpaOk,
      passRate: qpaValid > 0 ? qpaOk / qpaValid : 0,
    },
    totalsCheck: {
      metaTotal,
      rowsSum,
      diff: totalDiff,
      vatSeparate,
    },
    discount: {
      value: typeof meta?.discount === "number" ? meta.discount : null,
      label: meta?.discountLabel ?? null,
    },
    overallGrade: grade,
    overallScore: score,
    missingFields: missing,
  };
}

/**
 * 콘솔에 요약 출력 (구조화 JSON 형식 · jq 로 파싱 가능)
 */
export function logFieldMatchSummary(summary: FieldMatchSummary): void {
  // 사람 친화적 한줄 요약
  console.log(
    `[fieldMatch/page ${summary.page}] ${summary.overallGrade}(${summary.overallScore}점) · ` +
    `공급="${summary.supplier.value ?? "미상"}"(${summary.supplier.source ?? "-"}) · ` +
    `헤더=${summary.headers.canonicalCount}표준${summary.headers.duplicateCount > 0 ? `·중복${summary.headers.duplicateCount}` : ""} · ` +
    `행 ${summary.rows.total} (품명 ${summary.rows.filledByField.품명}·수량 ${summary.rows.filledByField.수량}·단가 ${summary.rows.filledByField.단가}·금액 ${summary.rows.filledByField.금액}·유통 ${summary.rows.filledByField.유통기한}) · ` +
    `Q×P=${summary.qpaValidation.mathOkRows}/${summary.qpaValidation.validRows}(${Math.round(summary.qpaValidation.passRate * 100)}%) · ` +
    `총계${summary.totalsCheck.metaTotal != null ? `diff${summary.totalsCheck.diff}` : "미상"}${summary.totalsCheck.vatSeparate ? "·VAT별도" : ""} · ` +
    `${summary.discount.value != null ? `할인 ${summary.discount.value.toLocaleString()} (${summary.discount.label})` : ""} · ` +
    `${summary.missingFields.length > 0 ? `미매칭[${summary.missingFields.join(",")}]` : "완전매칭"}`
  );
  // 구조화 로그 (jq -r 로 필터/집계 가능)
  console.log(`[fieldMatch/json] ${JSON.stringify(summary)}`);
}
