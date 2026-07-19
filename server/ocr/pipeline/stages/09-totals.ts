import {
  auditRowSumVsTotal,
  inferMissingTotals,
  sanitizeBalanceContamination,
  detectSuspiciousEqualPriceAmount,
  extractDiscount,
} from "../../parse";
import type { Stage } from "../types";

// Stage 09: 총계·잔액 감사·추정·오염 방지
//   auditRowSumVsTotal: 행합 vs meta.total 대조 (진단만)
//   detectSuspiciousEqualPriceAmount: 단가=금액 · 페이지 통계 벗어남 (진단만)
//   inferMissingTotals: 라벨 없는 총계 추정
//   sanitizeBalanceContamination: 잔액이 total로 오분류 감지 · total 무효화
export const totalsStage: Stage = {
  name: "totals",
  run(ctx) {
    const headers = ctx.headers;
    const rows = ctx.rows;

    // 감사 (진단만)
    const audit = auditRowSumVsTotal(headers, rows, ctx.rawText ?? "", ctx.meta?.total ?? null);
    if (audit.stated != null && !audit.withinTolerance) {
      console.log(`[totals/audit] page ${ctx.page}: 행합(${audit.rowSum.toLocaleString()}) vs 총계(${audit.stated.toLocaleString()}) 불일치 · Δ=${audit.delta.toLocaleString()}`);
    }

    const suspicious = detectSuspiciousEqualPriceAmount(headers, rows);
    if (suspicious.length > 0) {
      console.log(`[totals/suspicious] page ${ctx.page}: ${suspicious.length}개 의심 행 감지`);
    }

    // 라벨 없는 소계·공급가액·부가세·합계 추정
    const aI = headers.indexOf("금액");
    const rowsSum = aI >= 0
      ? rows.reduce((s, r) => s + (typeof r[aI] === "number" ? (r[aI] as number) : 0), 0)
      : 0;
    const inferred = inferMissingTotals(ctx.rawText ?? "", rowsSum, {
      subtotal: ctx.meta?.subtotal,
      supplyAmount: ctx.meta?.supplyAmount,
      vat: ctx.meta?.vat,
      total: ctx.meta?.total,
    });
    const meta = { ...ctx.meta };
    if (inferred.inferred.length > 0) {
      console.log(`[totals/inferred] page ${ctx.page}: ${inferred.inferred.join(", ")}`);
      if (inferred.subtotal != null && meta.subtotal == null) meta.subtotal = inferred.subtotal;
      if (inferred.supplyAmount != null && meta.supplyAmount == null) meta.supplyAmount = inferred.supplyAmount;
      if (inferred.vat != null && meta.vat == null) meta.vat = inferred.vat;
      if (inferred.total != null && meta.total == null) meta.total = inferred.total;
    }

    // 잔액 오염 방지 (진단 로그 강화 · 2026-07-14)
    const balCheck = sanitizeBalanceContamination(meta, rowsSum);
    const ref = (typeof meta.subtotal === "number" && meta.subtotal > 0) ? meta.subtotal : rowsSum;
    if (balCheck.contaminated) {
      console.log(`[totals/balance] page ${ctx.page}: ✓ 오염 판정 · total(${meta.total?.toLocaleString()}) ≥ 참조값(${ref.toLocaleString()}) × 20 → 무효화`);
      Object.assign(meta, balCheck.meta);
    } else if (typeof meta.total === "number" && ref > 0 && meta.total >= ref * 10) {
      // 20배 미만이지만 10배 이상 → 진단만 (안전한 값이라 보고 유지)
      console.log(`[totals/balance] page ${ctx.page}: ⚠ 의심 · total(${meta.total.toLocaleString()}) 이 참조값(${ref.toLocaleString()}) 의 ${(meta.total / ref).toFixed(1)}배 · 20배 미만이라 유지`);
    }

    // 2026-07-16 Fix: "소계 라벨 없는 명세서" subtotal → total 승격
    //   클라이언트 getPageDisplayTotal 은 meta.total 만 stated 로 참조함.
    //   extractMeta 가 "소계/합계" 라벨을 못 찾으면 meta.total = null 로 남아
    //   클라이언트가 computed(행합) 으로 폴백하는데, OCR 이 행 금액도 잘못 읽으면 0 표시됨.
    //   → meta.total 이 없고 meta.subtotal 이 rowsSum 으로 채워졌으면 total 로도 올림.
    //   안전 조건: total 이 이미 있거나 · subtotal ≤ 0 이면 건드리지 않음.
    if (meta.total == null && typeof meta.subtotal === "number" && meta.subtotal > 0) {
      meta.total = meta.subtotal;
      console.log(`[totals/subtotal-promote] page ${ctx.page}: subtotal(${meta.subtotal.toLocaleString()}) → total 으로 승격 (라벨 없는 명세서 소계 보장)`);
    }

    // 할인·에누리·차액·반품·부가세별도 자동 감지 (2026-07-14 Phase 1a)
    const disc = extractDiscount(ctx.rawText ?? "", rowsSum, meta);
    if (disc.inferred.length > 0) {
      console.log(`[totals/discount] page ${ctx.page}: ${disc.inferred.join(", ")}`);
      if (disc.discount != null) {
        meta.discount = disc.discount;
        meta.discountLabel = disc.discountLabel;
      }
      if (disc.return_ != null) meta.returnAmount = disc.return_;
      if (disc.vatSeparate) meta.vatSeparate = true;
    }

    // 교차 검증: supplyAmount - discount = total - vat (정상 관계)
    //   공식: supplyAmount = total + vat - discount  (에누리 없으면 discount=0)
    //   대웅제약 케이스: supplyAmount(2,310,000) · total(1,900,000) · vat(오독=2,310,000)
    //     → vat 이 supplyAmount 와 같으면 OCR 오독 의심 (실제 세액은 total × 1/11 ≈)
    //     → discount 역산: supplyAmount - total + vat_corrected
    //
    //   조건: supplyAmount · total 모두 있고, discount 가 아직 없는 경우에만 시도
    const A = typeof meta.supplyAmount === "number" ? meta.supplyAmount : null;
    const T = typeof meta.total === "number" ? meta.total : null;
    const V = typeof meta.vat === "number" ? meta.vat : null;
    // A > T 조건: T < A 이면 에누리 갭 존재 가능. T >= A 이면 VAT 포함 합계일 수 있어 스킵
    if (A != null && T != null && A > T && meta.discount == null) {
      // Case 1: vat 이 supplyAmount 와 같으면 OCR 오독 (세액 → 공급가액으로 잘못 읽음)
      //   세액 보정: (A - D) × 0.1 = (T) × 0.1 (에누리 차감 후 금액의 10%)
      //   에누리 역산: D = A - T  (합계 = 공급가액 - 에누리)
      if (V != null && Math.abs(V - A) < 1) {
        const discEst = A - T;
        if (discEst > 0 && discEst < A * 0.5) {
          const vatCorrected = Math.round(T * 0.1);
          meta.discount = discEst;
          meta.discountLabel = "에누리(역산)";
          meta.vat = vatCorrected;   // 세액 보정: 합계의 10%
          meta.discountCrossCheck = { supplyAmount: A, total: T, vatOriginal: V, vatCorrected, discEst };
          console.log(`[totals/crosscheck] page ${ctx.page}: 세액 오독 의심 · 세액(${V.toLocaleString()}) = 공급가액 → 에누리 역산(${discEst.toLocaleString()}) · 세액 보정(${vatCorrected.toLocaleString()})`);
        }
      } else {
        // Case 2: vat 정상 · 합계(T) = 공급가액(A) - 에누리(D) 관계식에서 역산
        //   한국 거래명세서: 합계 = 공급가액 - 에누리  (세액은 별도 항목)
        //   ∴ D = A - T
        const discEst = A - T;
        const tolerance = A * 0.01;      // 1% 오차 허용 (OCR 자릿수 오독 방어)
        if (discEst > tolerance && discEst < A * 0.5) {
          meta.discount = discEst;
          meta.discountLabel = "에누리(역산)";
          meta.discountCrossCheck = { supplyAmount: A, total: T, discEst };
          console.log(`[totals/crosscheck] page ${ctx.page}: 공급가액(${A.toLocaleString()}) - 합계(${T.toLocaleString()}) = 에누리 역산(${discEst.toLocaleString()})`);
        }
      }
    }

    // summary_rows 빌드: meta 의 각 숫자 필드를 라벨·금액 페어로 변환
    //   - 프론트 getPageDiscount 가 summary_rows 를 읽으므로 여기서 반드시 채워야 함
    //   - meta.discount 가 역산이든 직접 감지든 항상 포함
    const summaryRows: Array<{ label: string; amount: number }> = [];
    if (typeof meta.supplyAmount === "number" && meta.supplyAmount > 0)
      summaryRows.push({ label: "공급가액", amount: meta.supplyAmount });
    if (typeof meta.vat === "number" && meta.vat > 0)
      summaryRows.push({ label: "부가세", amount: meta.vat });
    if (typeof meta.discount === "number" && meta.discount > 0)
      summaryRows.push({ label: meta.discountLabel ?? "에누리", amount: meta.discount });
    if (typeof meta.returnAmount === "number" && meta.returnAmount > 0)
      summaryRows.push({ label: "반품", amount: meta.returnAmount });
    if (typeof meta.subtotal === "number" && meta.subtotal > 0)
      summaryRows.push({ label: "소계", amount: meta.subtotal });
    if (typeof meta.total === "number" && meta.total > 0)
      summaryRows.push({ label: "합계", amount: meta.total });
    if (summaryRows.length > 0) meta.summary_rows = summaryRows;

    return { meta };
  },
};
