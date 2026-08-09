// 2026-08-09 · purchase_details 공용 조회 헬퍼
//   · supplier_name NULL 인 raw 매입행 회수 로직 · vendors.note (code) → company_name 매핑
//   · products.supplier 로 fallback (원칙 준수 · 있는 테이블 조회 · 파생컬럼 X)
//   · 사용처: stockManage.ts (suppliers, top-products), supplierPayments.ts (balance, ledger, summary, detail)
//   · 원칙: "매입이력은 매입이력만" · OCR fallback 없음
import { supabase } from "../../src/supabase/client";

export interface PdRow {
  id: number | null;
  supplier: string;              // 해결된 supplier_name (fallback 포함)
  purchase_date: string;         // YYYY-MM-DD
  product_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  amount: number;
  vat_amount: number;
  supply_amount: number;
}

export interface PdQueryOptions {
  /** YYYY-MM-DD · purchase_date >= sinceYmd */
  sinceYmd?: string;
  /** 특정 supplier 만 필터 · undefined 이면 전체 */
  supplier?: string;
  /** VAT 컬럼 포함 여부 · 기본 true */
  includeVat?: boolean;
}

interface PdInternalRow {
  id?: number;
  supplier_name?: string | null;
  supplier_code?: string | null;
  purchase_date?: string | null;
  product_code?: string | null;
  product_name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  amount?: number | null;
  total?: number | null;
  vat_amount?: number | null;
  supply_amount?: number | null;
}

/** vendors.note (code) → company_name 매핑 로드 · 실패 시 빈 맵 */
async function loadVendorCodeMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { data: vdata, error: verr } = await supabase
      .from("vendors")
      .select("company_name, note");
    if (!verr) {
      for (const v of vdata ?? []) {
        const code = String(v.note ?? "").trim();
        const name = String(v.company_name ?? "").trim();
        // note 는 자유형식 · 숫자 3~5자리 code 만 매핑 (오탐 방지)
        if (code && name && /^\d{1,5}$/.test(code)) map.set(code, name);
      }
    }
    // supplier_code 컬럼도 있으면 병행 (없으면 무해)
    try {
      const { data: sdata, error: serr } = await supabase
        .from("vendors")
        .select("company_name, supplier_code");
      if (!serr) {
        for (const v of sdata ?? []) {
          const code = String(v.supplier_code ?? "").trim();
          const name = String(v.company_name ?? "").trim();
          if (code && name) map.set(code, name);
        }
      }
    } catch { /* silent · 컬럼 없음 */ }
  } catch { /* silent · vendors 없어도 무관 */ }
  return map;
}

/** products.product_code → supplier 매핑 로드 · 실패 시 빈 맵 */
async function loadProductSupplierMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const PPAGE = 1000;
    let pfrom = 0;
    while (true) {
      const { data, error } = await supabase
        .from("products")
        .select("product_code, supplier")
        .range(pfrom, pfrom + PPAGE - 1);
      if (error) break;
      if (!data || data.length === 0) break;
      for (const p of data) {
        const pc = String(p.product_code ?? "").trim();
        const sup = String(p.supplier ?? "").trim();
        if (pc && sup) map.set(pc, sup);
      }
      if (data.length < PPAGE) break;
      pfrom += PPAGE;
    }
  } catch { /* silent · products 없어도 무관 */ }
  return map;
}

/** raw purchase_details 행 → PdRow · supplier 해결 (name → code → product_code) */
function resolveSupplier(
  r: PdInternalRow,
  vendorCodeMap: Map<string, string>,
  productSupplierMap: Map<string, string>
): string {
  let supplier = String(r.supplier_name ?? "").trim();
  if (!supplier) {
    const code = String(r.supplier_code ?? "").trim();
    if (code && vendorCodeMap.has(code)) supplier = vendorCodeMap.get(code)!;
  }
  if (!supplier) {
    const pcode = String(r.product_code ?? "").trim();
    if (pcode && productSupplierMap.has(pcode)) supplier = productSupplierMap.get(pcode)!;
  }
  return supplier;
}

/**
 * purchase_details 조회 · supplier NULL 은 vendors/products 로 fallback 해결
 * · 페이지네이션 1000행 씩 · 전체 회수
 * · vat_amount/supply_amount 컬럼 없는 DB 는 0으로 채움
 * · relation missing 이면 빈배열 반환 (throw X)
 */
export async function queryPurchaseDetails(opts: PdQueryOptions): Promise<PdRow[]> {
  const sinceYmd = opts.sinceYmd;
  const supplierFilter = opts.supplier?.trim();
  const includeVat = opts.includeVat !== false;

  // NULL supplier_name fallback 매핑 로드 (병렬)
  const [vendorCodeMap, productSupplierMap] = await Promise.all([
    loadVendorCodeMap(),
    loadProductSupplierMap(),
  ]);

  // supplier 필터가 있으면 · code 도 추출해서 병행 조회 (name/code 모두)
  let supplierCode: string | null = null;
  if (supplierFilter) {
    // vendorCodeMap 은 code→name · 역방향 찾기
    for (const [code, name] of vendorCodeMap.entries()) {
      if (name === supplierFilter) { supplierCode = code; break; }
    }
  }

  const rows: PdRow[] = [];
  const seen = new Set<number>();
  const fullCols = includeVat
    ? "id, supplier_name, supplier_code, purchase_date, product_code, product_name, quantity, unit_price, amount, total, vat_amount, supply_amount"
    : "id, supplier_name, supplier_code, purchase_date, product_code, product_name, quantity, unit_price, amount, total";

  // 헬퍼 · 특정 조건 (name/code/productCodes) 으로 페이징 조회
  const fetchByFilter = async (
    filterFn: (q: any) => any
  ): Promise<{ data: PdInternalRow[]; relationMissing: boolean; vatColMissing: boolean }> => {
    const merged: PdInternalRow[] = [];
    let vatColMissing = false;
    const PAGE = 1000;
    let from = 0;
    while (true) {
      let query = supabase.from("purchase_details").select(vatColMissing
        ? "id, supplier_name, supplier_code, purchase_date, product_code, product_name, quantity, unit_price, amount, total"
        : fullCols);
      if (sinceYmd) query = query.gte("purchase_date", sinceYmd);
      query = filterFn(query);
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error) {
        if (/relation .* does not exist/i.test(error.message)) return { data: [], relationMissing: true, vatColMissing };
        if (/vat_amount|supply_amount/i.test(error.message) && !vatColMissing) {
          // 재시도 · vat/supply 컬럼 제외
          vatColMissing = true;
          from = 0;
          merged.length = 0;
          continue;
        }
        throw new Error(error.message);
      }
      if (!data || data.length === 0) break;
      merged.push(...(data as unknown as PdInternalRow[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return { data: merged, relationMissing: false, vatColMissing };
  };

  // 조회 실행: supplier 필터 있으면 name+code 병행 · 없으면 전체
  const results: PdInternalRow[] = [];
  if (supplierFilter) {
    const r1 = await fetchByFilter(q => q.eq("supplier_name", supplierFilter));
    if (r1.relationMissing) return [];
    results.push(...r1.data);
    if (supplierCode) {
      const r2 = await fetchByFilter(q => q.eq("supplier_code", supplierCode));
      results.push(...r2.data);
    }
    // product_code fallback · supplier 필터 대응
    const productCodesForSupplier: string[] = [];
    for (const [pc, sup] of productSupplierMap.entries()) {
      if (sup === supplierFilter) productCodesForSupplier.push(pc);
    }
    if (productCodesForSupplier.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < productCodesForSupplier.length; i += CHUNK) {
        const chunk = productCodesForSupplier.slice(i, i + CHUNK);
        const r3 = await fetchByFilter(q => q.in("product_code", chunk));
        results.push(...r3.data);
      }
    }
  } else {
    const r = await fetchByFilter(q => q);
    if (r.relationMissing) return [];
    results.push(...r.data);
  }

  // 정규화 + dedup (by id)
  for (const r of results) {
    const id = Number(r.id);
    if (Number.isFinite(id) && seen.has(id)) continue;
    if (Number.isFinite(id)) seen.add(id);
    const supplier = resolveSupplier(r, vendorCodeMap, productSupplierMap);
    if (!supplier) continue;
    // supplier 필터 있으면 · 해결된 이름과 일치해야 함
    if (supplierFilter && supplier !== supplierFilter) continue;
    const date = r.purchase_date ? String(r.purchase_date).slice(0, 10) : "";
    if (!date) continue;
    rows.push({
      id: Number.isFinite(id) ? id : null,
      supplier,
      purchase_date: date,
      product_code: String(r.product_code ?? "").trim(),
      product_name: String(r.product_name ?? ""),
      quantity: Number(r.quantity) || 0,
      unit_price: Number(r.unit_price) || 0,
      // amount 우선 · total fallback (xlsx total 은 신뢰 낮음)
      amount: Number(r.amount ?? r.total ?? 0) || 0,
      vat_amount: Number(r.vat_amount) || 0,
      supply_amount: Number(r.supply_amount) || 0,
    });
  }

  return rows;
}
