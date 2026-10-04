// src/shared/erp/datasetHash.ts
// 2026-10-04 · Phase 2 · Dataset Content Hash + Row Fingerprint
//
// 원칙:
//   · deterministic · 같은 데이터 → 같은 hash (순서 차이 무시)
//   · identity 기준 정렬 후 stable serialize
//   · Node (sync-agent main) + Browser (test) 양쪽 동작 가능하도록 sha256 Web Crypto 폴백 X
//     Node 환경 전용 (crypto 모듈)
//   · 민감정보 없음 · 공개 식별자만 포함

import { createHash } from "crypto";

/** 안정적 JSON 직렬화 · key 정렬 */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify((v as Record<string, unknown>)[k])).join(",") + "}";
}

/** sha256 hex */
function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Dataset 전체 content hash (identity 기준 정렬 후).
 *
 * @param rows ERP rows
 * @param identityOf row → identity string (예: BarCode or BmCode|ROWNUM)
 * @param fingerprintOf row → fingerprint subset (hash 대상 field 만 추출)
 */
export function datasetHash<T>(
  rows: readonly T[],
  identityOf: (row: T) => string,
  fingerprintOf: (row: T) => Record<string, unknown>,
): string {
  const sorted = rows
    .map((r) => ({ id: identityOf(r), fp: fingerprintOf(r) }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const h = createHash("sha256");
  h.update(String(sorted.length));
  h.update("\n");
  for (const { id, fp } of sorted) {
    h.update(id);
    h.update("|");
    h.update(stableStringify(fp));
    h.update("\n");
  }
  return h.digest("hex");
}

/** Product_List row fingerprint · Sync 관련 field 만 */
export interface ProductFingerprintRow {
  BarCode?: unknown;
  ProductName?: unknown;
  NowStock?: unknown;
  LocationName?: unknown;
  CorpNameView?: unknown;
  CtCode?: unknown;
  UnitCode?: unknown;
  SaleStatusName?: unknown;
  Brand?: unknown;
  Maker?: unknown;
  LastBuyDate?: unknown;
  LastSaleDate?: unknown;
}

function norm(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const s = v.trim();
    return s === "" ? null : s;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return String(v);
}

export function productIdentity(row: ProductFingerprintRow): string {
  return String(row.BarCode ?? "").trim();
}

export function productFingerprint(row: ProductFingerprintRow): Record<string, string | null> {
  return {
    ProductName: norm(row.ProductName),
    NowStock: norm(row.NowStock),
    LocationName: norm(row.LocationName),
    CorpNameView: norm(row.CorpNameView),
    CtCode: norm(row.CtCode),
    UnitCode: norm(row.UnitCode),
    SaleStatusName: norm(row.SaleStatusName),
    Brand: norm(row.Brand),
    Maker: norm(row.Maker),
    LastBuyDate: norm(row.LastBuyDate),
    LastSaleDate: norm(row.LastSaleDate),
  };
}

/** 단일 row fingerprint hash · 변경 감지용 (quick compare) */
export function productFingerprintHash(row: ProductFingerprintRow): string {
  return sha256Hex(stableStringify(productFingerprint(row)));
}

/** Buy row identity · (BmCode, ROWNUM) */
export interface BuyFingerprintRow {
  BmCode?: unknown;
  ROWNUM?: unknown;
  PCode?: unknown;
  StockCnt?: unknown;
  UnitCost?: unknown;
  BuyPrice?: unknown;
  BuyTax?: unknown;
  BuyTotal?: unknown;
  BuyDate?: unknown;
  CtCode?: unknown;
}

export function buyIdentity(row: BuyFingerprintRow): string {
  return `${String(row.BmCode ?? "").trim()}|${String(row.ROWNUM ?? "").trim()}`;
}

export function buyFingerprint(row: BuyFingerprintRow): Record<string, string | null> {
  return {
    PCode: norm(row.PCode),
    StockCnt: norm(row.StockCnt),
    UnitCost: norm(row.UnitCost),
    BuyPrice: norm(row.BuyPrice),
    BuyTax: norm(row.BuyTax),
    BuyTotal: norm(row.BuyTotal),
    BuyDate: norm(row.BuyDate),
    CtCode: norm(row.CtCode),
  };
}

export function datasetHashProducts(rows: readonly ProductFingerprintRow[]): string {
  return datasetHash(rows, productIdentity, productFingerprint);
}
export function datasetHashBuys(rows: readonly BuyFingerprintRow[]): string {
  return datasetHash(rows, buyIdentity, buyFingerprint);
}
