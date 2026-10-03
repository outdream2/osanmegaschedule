// src/shared/erp/erpValidationEngine.ts
// 2026-10-03 저녁 · Phase 2 · ERP snapshot Validation Engine
//
// 역할:
//   · ERP → Mapping 직전/직후 데이터 품질 검증
//   · 결과를 NORMAL / REVIEW / ERROR 로 분류
//   · ERROR 가 하나라도 있으면 자동 Sync 차단 (호출부 책임)
//   · REVIEW 는 해당 field 또는 상품만 KEEP · 전체 Sync 는 계속 가능
//
// 호출 책임:
//   · Electron sync-agent (main process) 또는 server runner
//   · pure function · side effect 없음 · DB WRITE 없음

import { transformErpLocation, type LocationReviewFlag } from "./erpLocationTransform";

// ─────────────────────────────────────────────────────────────────────────────
// 1. 코드/카테고리
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationSeverity = "ERROR" | "REVIEW" | "NORMAL";

export type ValidationCode =
  // Row-level · 특정 상품
  | "BARCODE_MISSING"
  | "BARCODE_DUPLICATE"
  | "PCODE_MISSING"
  | "PCODE_DUPLICATE"
  | "PCODE_BARCODE_CONFLICT"
  | "PRODUCT_NAME_MISSING"
  | "INVALID_NOW_STOCK"
  | "INVALID_REQUIRED_TYPE"
  | "LOCATION_REVIEW"            // 뷰티·냉장고·N매대+뒤앞
  | "STOCK_SPIKE"                // DB current_stock vs ERP NowStock 차이 비정상
  | "UNKNOWN_UNIT"
  | "UNKNOWN_SALE_STATUS"
  | "UNKNOWN_LOCATION_PATTERN"
  // Snapshot-level · 전체
  | "ROW_COUNT_CRITICAL_DROP"
  | "BARCODE_MATCH_RATE_CRITICAL_DROP";

/** 개별 상품(또는 snapshot) 수준 issue 하나 */
export interface ValidationIssue {
  readonly code: ValidationCode;
  readonly severity: ValidationSeverity;
  readonly message: string;
  /** 상품 수준 issue 라면 ERP Barcode (또는 PCode fallback) */
  readonly barcode?: string;
  readonly pcode?: string;
  readonly productName?: string;
  /** 참고 field (optional · 세부값) */
  readonly erpValue?: unknown;
  readonly dbValue?: unknown;
  /** LOCATION_REVIEW 세분화 */
  readonly reviewFlag?: LocationReviewFlag;
}

/** Snapshot 전체 요약 결과 */
export interface ValidationReport {
  readonly totalRows: number;
  readonly normal: number;
  readonly review: number;
  readonly error: number;
  readonly byCode: Record<ValidationCode, number>;
  readonly issues: readonly ValidationIssue[];
  /** ERROR 가 하나라도 있으면 true · 호출부가 Sync 차단해야 함 */
  readonly blockingErrors: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 설정 (threshold · known sets)
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationConfig {
  /** 직전 정상 snapshot 의 ERP row count (ROW_COUNT_CRITICAL_DROP 비교용) · undefined 면 skip */
  readonly previousRowCount?: number;
  /** 직전 Barcode non-empty 비율 (0~1) · undefined 면 skip */
  readonly previousBarcodeNonEmptyRate?: number;
  /** row count drop 임계값 · default 0.3 (30% 이상 급감 → ERROR) */
  readonly rowCountDropThreshold?: number;
  /** barcode match rate drop 임계값 · default 0.2 */
  readonly barcodeMatchRateDropThreshold?: number;
  /** stock spike absolute (DB current_stock=0 등 비율 계산 불가 시) · default 100 */
  readonly stockSpikeAbsolute?: number;
  /** stock spike percentage (0~1) · default 10 (= 1000%) */
  readonly stockSpikePercentage?: number;
  /** 알려진 UnitCode 집합 · 비어있으면 unknown unit 검사 skip */
  readonly knownUnits?: ReadonlySet<string>;
  /** 알려진 SaleStatusName 집합 · 비어있으면 skip */
  readonly knownSaleStatus?: ReadonlySet<string>;
}

const DEFAULT_CONFIG: Required<Omit<ValidationConfig, "previousRowCount" | "previousBarcodeNonEmptyRate" | "knownUnits" | "knownSaleStatus">> = {
  rowCountDropThreshold: 0.3,
  barcodeMatchRateDropThreshold: 0.2,
  stockSpikeAbsolute: 100,
  stockSpikePercentage: 10,
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. ERP row 입력 (최소 필드 interface)
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationErpRow {
  readonly BarCode?: unknown;
  readonly PCode?: unknown;
  readonly ProductName?: unknown;
  readonly NowStock?: unknown;
  readonly UnitCode?: unknown;
  readonly SaleStatusName?: unknown;
  readonly LocationName?: unknown;
}

/** DB 비교용 · Barcode → current_stock lookup 사전 */
export interface ValidationDbSnapshot {
  readonly currentStockByBarcode: ReadonlyMap<string, number | null>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. 검증 메인
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_BY_CODE: Record<ValidationCode, number> = {
  BARCODE_MISSING: 0,
  BARCODE_DUPLICATE: 0,
  PCODE_MISSING: 0,
  PCODE_DUPLICATE: 0,
  PCODE_BARCODE_CONFLICT: 0,
  PRODUCT_NAME_MISSING: 0,
  INVALID_NOW_STOCK: 0,
  INVALID_REQUIRED_TYPE: 0,
  LOCATION_REVIEW: 0,
  STOCK_SPIKE: 0,
  UNKNOWN_UNIT: 0,
  UNKNOWN_SALE_STATUS: 0,
  UNKNOWN_LOCATION_PATTERN: 0,
  ROW_COUNT_CRITICAL_DROP: 0,
  BARCODE_MATCH_RATE_CRITICAL_DROP: 0,
};

/** 숫자 cast 가능한지 · ERP NowStock 등 */
function isValidNumber(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string") {
    if (v.trim() === "") return false;
    const n = Number(v);
    return Number.isFinite(n);
  }
  return false;
}

/** empty string / null / undefined 통합 체크 */
function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

/**
 * ERP snapshot 전수 검증.
 *
 * @param rows ERP Product_List rows (snapshot)
 * @param dbSnapshot DB 비교용 (stock spike 등) · 없어도 됨
 * @param config optional (threshold · known units)
 */
export function validateErpSnapshot(
  rows: readonly ValidationErpRow[],
  dbSnapshot: ValidationDbSnapshot | null,
  config: ValidationConfig = {},
): ValidationReport {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const issues: ValidationIssue[] = [];
  const byCode: Record<ValidationCode, number> = { ...EMPTY_BY_CODE };

  // ── 1-pass: Barcode / PCode 중복 체크용 사전 구축 ────────────────────────
  const barcodeToPCodes = new Map<string, Set<string>>();
  const pcodeToBarcodes = new Map<string, Set<string>>();
  for (const r of rows) {
    const bc = String(r.BarCode ?? "").trim();
    const pc = String(r.PCode ?? "").trim();
    if (bc) {
      if (!barcodeToPCodes.has(bc)) barcodeToPCodes.set(bc, new Set());
      if (pc) barcodeToPCodes.get(bc)!.add(pc);
    }
    if (pc) {
      if (!pcodeToBarcodes.has(pc)) pcodeToBarcodes.set(pc, new Set());
      if (bc) pcodeToBarcodes.get(pc)!.add(bc);
    }
  }

  // ── 2-pass: row-level 검증 ───────────────────────────────────────────────
  // 중복은 한 Barcode 당 1회만 보고 (전체 등장 row 모두 보고하면 결과가 과도)
  const reportedDupBarcode = new Set<string>();
  const reportedDupPCode = new Set<string>();
  const reportedConflict = new Set<string>();
  const seenBarcodeFirst = new Set<string>();

  let barcodeNonEmpty = 0;

  for (const r of rows) {
    const bc = String(r.BarCode ?? "").trim();
    const pc = String(r.PCode ?? "").trim();
    const name = String(r.ProductName ?? "").trim();

    // ERP row context
    const ctx = { barcode: bc || undefined, pcode: pc || undefined, productName: name || undefined };

    // Barcode missing
    if (!bc) {
      issues.push({ code: "BARCODE_MISSING", severity: "ERROR", message: "Barcode 없음", ...ctx });
      byCode.BARCODE_MISSING++;
    } else {
      barcodeNonEmpty++;
      // Barcode duplicate (한 Barcode 가 여러 상품에 등장)
      if ((barcodeToPCodes.get(bc)?.size ?? 0) > 1 && !reportedDupBarcode.has(bc)) {
        issues.push({
          code: "BARCODE_DUPLICATE", severity: "ERROR",
          message: `동일 Barcode 가 ${barcodeToPCodes.get(bc)!.size}개 PCode 에 걸쳐 등장`,
          ...ctx,
        });
        byCode.BARCODE_DUPLICATE++;
        reportedDupBarcode.add(bc);
      }
      seenBarcodeFirst.add(bc);
    }

    // PCode missing
    if (!pc) {
      issues.push({ code: "PCODE_MISSING", severity: "ERROR", message: "PCode 없음", ...ctx });
      byCode.PCODE_MISSING++;
    } else {
      // PCode duplicate (한 PCode 가 여러 Barcode 에)
      if ((pcodeToBarcodes.get(pc)?.size ?? 0) > 1 && !reportedDupPCode.has(pc)) {
        issues.push({
          code: "PCODE_DUPLICATE", severity: "ERROR",
          message: `동일 PCode 가 ${pcodeToBarcodes.get(pc)!.size}개 Barcode 에 등장`,
          ...ctx,
        });
        byCode.PCODE_DUPLICATE++;
        reportedDupPCode.add(pc);
      }
    }

    // PCode↔Barcode conflict (1:1 가정 위반) · 중복 체크와 겹칠 수 있지만 별도 분류 보존
    if (bc && pc) {
      const otherBarcodes = pcodeToBarcodes.get(pc);
      const otherPCodes = barcodeToPCodes.get(bc);
      if ((otherBarcodes && otherBarcodes.size > 1) || (otherPCodes && otherPCodes.size > 1)) {
        const key = `${pc}|${bc}`;
        if (!reportedConflict.has(key)) {
          issues.push({
            code: "PCODE_BARCODE_CONFLICT", severity: "ERROR",
            message: "PCode↔Barcode 1:1 관계 깨짐",
            ...ctx,
          });
          byCode.PCODE_BARCODE_CONFLICT++;
          reportedConflict.add(key);
        }
      }
    }

    // ProductName missing
    if (!name) {
      issues.push({ code: "PRODUCT_NAME_MISSING", severity: "ERROR", message: "상품명 없음", ...ctx });
      byCode.PRODUCT_NAME_MISSING++;
    }

    // Invalid NowStock
    if (!isEmpty(r.NowStock) && !isValidNumber(r.NowStock)) {
      issues.push({
        code: "INVALID_NOW_STOCK", severity: "ERROR",
        message: `NowStock 숫자 변환 불가 · ${JSON.stringify(r.NowStock)}`,
        erpValue: r.NowStock, ...ctx,
      });
      byCode.INVALID_NOW_STOCK++;
    }

    // Invalid required type (PCode · BarCode · ProductName 이 string 이 아닌 경우)
    if (r.PCode != null && typeof r.PCode !== "string" && typeof r.PCode !== "number") {
      issues.push({ code: "INVALID_REQUIRED_TYPE", severity: "ERROR", message: `PCode type invalid (${typeof r.PCode})`, ...ctx });
      byCode.INVALID_REQUIRED_TYPE++;
    }
    if (r.BarCode != null && typeof r.BarCode !== "string" && typeof r.BarCode !== "number") {
      issues.push({ code: "INVALID_REQUIRED_TYPE", severity: "ERROR", message: `BarCode type invalid (${typeof r.BarCode})`, ...ctx });
      byCode.INVALID_REQUIRED_TYPE++;
    }

    // Location transform
    const loc = transformErpLocation(r.LocationName as any);
    if (loc.reviewFlag) {
      issues.push({
        code: "LOCATION_REVIEW", severity: "REVIEW",
        message: `위치 REVIEW · ${loc.reviewFlag}`,
        reviewFlag: loc.reviewFlag,
        erpValue: r.LocationName, ...ctx,
      });
      byCode.LOCATION_REVIEW++;
    } else if (loc.reason === "unknown" || loc.reason === "no_middle") {
      issues.push({
        code: "UNKNOWN_LOCATION_PATTERN", severity: "REVIEW",
        message: `알 수 없는 LocationName 패턴 (reason=${loc.reason})`,
        erpValue: r.LocationName, ...ctx,
      });
      byCode.UNKNOWN_LOCATION_PATTERN++;
    }

    // Stock spike (DB vs ERP)
    if (bc && dbSnapshot && isValidNumber(r.NowStock)) {
      const erpStock = Number(r.NowStock);
      const dbStock = dbSnapshot.currentStockByBarcode.get(bc);
      if (dbStock != null && Number.isFinite(dbStock)) {
        const delta = Math.abs(erpStock - dbStock);
        const base = Math.max(Math.abs(dbStock), 1);
        const pct = delta / base;
        if (delta >= cfg.stockSpikeAbsolute && pct >= cfg.stockSpikePercentage) {
          issues.push({
            code: "STOCK_SPIKE", severity: "REVIEW",
            message: `재고 급변 · DB=${dbStock} · ERP=${erpStock} · |Δ|=${delta} (×${pct.toFixed(1)})`,
            erpValue: erpStock, dbValue: dbStock, ...ctx,
          });
          byCode.STOCK_SPIKE++;
        }
      }
    }

    // Unknown Unit
    if (cfg.knownUnits && cfg.knownUnits.size > 0) {
      const unit = String(r.UnitCode ?? "").trim();
      if (unit && !cfg.knownUnits.has(unit)) {
        issues.push({
          code: "UNKNOWN_UNIT", severity: "REVIEW",
          message: `알 수 없는 UnitCode · ${unit}`,
          erpValue: unit, ...ctx,
        });
        byCode.UNKNOWN_UNIT++;
      }
    }

    // Unknown SaleStatus
    if (cfg.knownSaleStatus && cfg.knownSaleStatus.size > 0) {
      const st = String(r.SaleStatusName ?? "").trim();
      if (st && !cfg.knownSaleStatus.has(st)) {
        issues.push({
          code: "UNKNOWN_SALE_STATUS", severity: "REVIEW",
          message: `알 수 없는 SaleStatusName · ${st}`,
          erpValue: st, ...ctx,
        });
        byCode.UNKNOWN_SALE_STATUS++;
      }
    }
  }

  // ── 3-pass: snapshot-level 검증 ──────────────────────────────────────────
  if (config.previousRowCount != null && config.previousRowCount > 0) {
    const dropPct = (config.previousRowCount - rows.length) / config.previousRowCount;
    if (dropPct >= cfg.rowCountDropThreshold) {
      issues.push({
        code: "ROW_COUNT_CRITICAL_DROP", severity: "ERROR",
        message: `ERP row count 급감 · ${config.previousRowCount} → ${rows.length} (${Math.round(dropPct * 100)}% ↓)`,
        erpValue: rows.length, dbValue: config.previousRowCount,
      });
      byCode.ROW_COUNT_CRITICAL_DROP++;
    }
  }

  if (config.previousBarcodeNonEmptyRate != null && rows.length > 0) {
    const currentRate = barcodeNonEmpty / rows.length;
    const dropAbs = config.previousBarcodeNonEmptyRate - currentRate;
    if (dropAbs >= cfg.barcodeMatchRateDropThreshold) {
      issues.push({
        code: "BARCODE_MATCH_RATE_CRITICAL_DROP", severity: "ERROR",
        message: `Barcode non-empty 비율 급감 · ${(config.previousBarcodeNonEmptyRate * 100).toFixed(1)}% → ${(currentRate * 100).toFixed(1)}%`,
        erpValue: currentRate, dbValue: config.previousBarcodeNonEmptyRate,
      });
      byCode.BARCODE_MATCH_RATE_CRITICAL_DROP++;
    }
  }

  // ── 4-pass: 집계 ─────────────────────────────────────────────────────────
  const errorBarcodes = new Set<string>();
  const reviewBarcodes = new Set<string>();
  for (const i of issues) {
    const key = i.barcode ?? i.pcode ?? `__snapshot_${i.code}`;
    if (i.severity === "ERROR") errorBarcodes.add(key);
    else if (i.severity === "REVIEW" && !errorBarcodes.has(key)) reviewBarcodes.add(key);
  }
  const errorCount = errorBarcodes.size;
  const reviewCount = reviewBarcodes.size;
  const normalCount = Math.max(0, rows.length - errorCount - reviewCount);

  const blockingErrors = issues.some((i) => i.severity === "ERROR");

  return {
    totalRows: rows.length,
    normal: normalCount,
    review: reviewCount,
    error: errorCount,
    byCode,
    issues,
    blockingErrors,
  };
}
