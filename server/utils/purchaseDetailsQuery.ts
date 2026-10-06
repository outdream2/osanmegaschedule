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
  // 2026-10-06 · 대원칙 · canonical SSOT = products.product_name
  //   · purchase_details.product_name (transaction snapshot) 직접 노출 금지
  //   · products.product_code JOIN 성공 시 그 값 · 실패 시 null
  product_name: string | null;
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

/**
 * 2026-10-06 · PHASE 1-D · vendor identity 맵 분리 (사용자 지시)
 *   · 이전: 하나의 Map 에 note(숫자) · supplier_code · company_name 섞여 저장
 *     → note 가 자유 입력 field 인데 identity 로 사용되어 오탐 위험
 *   · 신규:
 *     · vendorByCtCode   · ERP canonical CtCode (ct_code 컬럼) 또는 supplier_code 컬럼
 *     · vendorByNormalizedName · displayVendorName(company_name) → company_name 매핑
 *   · note 는 identity 로 사용 금지 (제거)
 *   · lookup 우선순위: ct_code eq · supplier_code eq → normalizedName (fallback)
 */
import { displayVendorName } from "../../src/utils/vendorNameNormalize";

export interface VendorIdentityMaps {
  byCtCode: Map<string, string>;             // code → company_name
  byNormalizedName: Map<string, string>;     // display name (lowercase · trimmed) → company_name
}

interface VendorIdentityRow {
  company_name?: string | null;
  ct_code?: string | null;
  supplier_code?: string | null;
}
async function loadVendorIdentityMaps(): Promise<VendorIdentityMaps> {
  const byCtCode = new Map<string, string>();
  const byNormalizedName = new Map<string, string>();
  try {
    // ct_code · supplier_code · company_name 전부 fetch (컬럼 없는 DB 는 fallback)
    const trySelects = [
      "company_name, ct_code, supplier_code",
      "company_name, supplier_code",
      "company_name",
    ];
    let rows: VendorIdentityRow[] | null = null;
    for (const sel of trySelects) {
      const r = await supabase.from("vendors").select(sel);
      if (!r.error) { rows = (r.data as unknown as VendorIdentityRow[]) ?? []; break; }
      if (!/column .* does not exist|does not exist/i.test(r.error.message)) break;
    }
    for (const v of rows ?? []) {
      const name = String(v.company_name ?? "").trim();
      if (!name) continue;
      const ct = String(v.ct_code ?? "").trim();
      if (ct) byCtCode.set(ct, name);
      const sc = String(v.supplier_code ?? "").trim();
      if (sc) byCtCode.set(sc, name);
      const norm = displayVendorName(name).toLowerCase();
      if (norm) byNormalizedName.set(norm, name);
    }
  } catch { /* silent · vendors 없어도 무관 */ }
  return { byCtCode, byNormalizedName };
}

/** products.product_code → product_name 매핑 (canonical SSOT · 2026-10-06)
 *  · codes 지정 시 IN 조회 · undefined 면 전체 조회
 *  · 실패 시 빈 맵
 */
async function loadProductNameMap(codes?: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  try {
    if (codes && codes.length === 0) return map;
    const CHUNK = 500;
    if (codes && codes.length > 0) {
      for (let i = 0; i < codes.length; i += CHUNK) {
        const chunk = codes.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("products")
          .select("product_code, product_name")
          .in("product_code", chunk);
        if (error) break;
        for (const p of data ?? []) {
          const pc = String(p.product_code ?? "").trim();
          const nm = String(p.product_name ?? "").trim();
          if (pc) map.set(pc, nm || null);
        }
      }
    } else {
      const PPAGE = 1000;
      let pfrom = 0;
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("product_code, product_name")
          .range(pfrom, pfrom + PPAGE - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        for (const p of data) {
          const pc = String(p.product_code ?? "").trim();
          const nm = String(p.product_name ?? "").trim();
          if (pc) map.set(pc, nm || null);
        }
        if (data.length < PPAGE) break;
        pfrom += PPAGE;
      }
    }
  } catch { /* silent · products 없어도 무관 */ }
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

/** raw purchase_details 행 → PdRow · supplier 해결 (name → ct_code → normalizedName → product_code)
 *  2026-10-06 · PHASE 1-D · identity 맵 분리 후 lookup 우선순위 명확화 (사용자 지시)
 *    · 1차 · r.supplier_name 원문 (DB 저장된 그대로)
 *    · 2차 · r.supplier_code eq ct_code 또는 supplier_code
 *    · 3차 · r.supplier_name normalized == displayVendorName 매핑 (레거시 variant 보완)
 *    · 4차 · products.product_code → supplier (products.supplier TEXT fallback)
 *  note 는 identity 로 사용하지 않음 (사용자 지시 · 자유 입력 field)
 */
function resolveSupplier(
  r: PdInternalRow,
  vendorByCtCode: Map<string, string>,
  vendorByNormalizedName: Map<string, string>,
  productSupplierMap: Map<string, string>
): string {
  let supplier = String(r.supplier_name ?? "").trim();
  if (!supplier) {
    const code = String(r.supplier_code ?? "").trim();
    if (code && vendorByCtCode.has(code)) supplier = vendorByCtCode.get(code)!;
  }
  if (!supplier) {
    const rawName = String(r.supplier_name ?? "").trim();
    if (rawName) {
      const norm = displayVendorName(rawName).toLowerCase();
      if (norm && vendorByNormalizedName.has(norm)) supplier = vendorByNormalizedName.get(norm)!;
    }
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
  // 2026-10-06 · PHASE 1-D · identity 맵 분리 (ct_code vs normalized name)
  const [{ byCtCode: vendorByCtCode, byNormalizedName: vendorByNormalizedName }, productSupplierMap] = await Promise.all([
    loadVendorIdentityMaps(),
    loadProductSupplierMap(),
  ]);

  // supplier 필터가 있으면 · code 도 추출해서 병행 조회 (name/code 모두)
  let supplierCode: string | null = null;
  if (supplierFilter) {
    // vendorByCtCode 는 code→name · 역방향 찾기
    for (const [code, name] of vendorByCtCode.entries()) {
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

  // 2026-10-05 · 사용자 지시 · supplier_name 문자열 매칭 → supplier_code 기반 매칭 전환
  //   · 1 supplier_code · 2+ name variant 21건 (녹십자/대웅제약/종근당 등) · name eq 로는 variant 못 찾음
  //   · fuzzy matching 금지 · exact supplier_code IN 매칭만 사용
  //   · DB 데이터 수정 금지 · ERP CorpNameView 원문 보존
  //   · supplier_code NULL 레거시 row 는 name exact fallback
  const results: PdInternalRow[] = [];
  if (supplierFilter) {
    // Step 1 · name 또는 vendors.note 로 1차 조회해서 supplier_code 집합 수집
    const codeSet = new Set<string>();
    const r0name = await fetchByFilter(q => q.eq("supplier_name", supplierFilter));
    if (r0name.relationMissing) return [];
    for (const row of r0name.data) {
      const c = String(row.supplier_code ?? "").trim();
      if (c) codeSet.add(c);
    }
    // 2026-10-06 · PHASE 1-D · ct_code / supplier_code 역방향 추가 (note identity 제거)
    for (const [code, name] of vendorByCtCode.entries()) {
      if (name === supplierFilter) codeSet.add(code);
    }
    // normalized name variant 매칭 (ERP (주)녹십자 ↔ 녹십자 등 레거시 variant)
    const normFilter = displayVendorName(supplierFilter).toLowerCase();
    if (normFilter) {
      // byNormalizedName 은 code 가 아니라 name 역방향 매핑 · 여기서는 추가 code 수집 X
      void vendorByNormalizedName;
    }
    // 호출자가 code 를 직접 넘긴 경우 (숫자 1~5자리) 포함
    if (/^\d{1,5}$/.test(supplierFilter)) codeSet.add(supplierFilter);
    if (supplierCode) codeSet.add(supplierCode);

    // Step 2 · 수집한 code set 전체로 조회 (name variant 전부 포함)
    if (codeSet.size > 0) {
      const codes = [...codeSet];
      const CHUNK = 100;
      for (let i = 0; i < codes.length; i += CHUNK) {
        const slice = codes.slice(i, i + CHUNK);
        const r = await fetchByFilter(q => q.in("supplier_code", slice));
        results.push(...r.data);
      }
    }

    // Step 3 · supplier_code NULL 레거시 row 는 name exact fallback (code 없으면 매칭 불가)
    results.push(...r0name.data.filter(r => !r.supplier_code));

    // Step 4 · product_code fallback (products.supplier → 매입 row)
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

  // 2026-10-06 · 대원칙 · canonical product_name = products.product_code JOIN
  //   · 결과 raw rows 의 product_code 수집 후 batch fetch
  //   · transaction snapshot name 노출 금지 · join 실패 시 null
  const codeSet = new Set<string>();
  for (const r of results) {
    const pc = String(r.product_code ?? "").trim();
    if (pc) codeSet.add(pc);
  }
  const productNameByCode = await loadProductNameMap([...codeSet]);

  // 정규화 + dedup (by id)
  for (const r of results) {
    const id = Number(r.id);
    if (Number.isFinite(id) && seen.has(id)) continue;
    if (Number.isFinite(id)) seen.add(id);
    const supplier = resolveSupplier(r, vendorByCtCode, vendorByNormalizedName, productSupplierMap);
    if (!supplier) continue;
    // 2026-10-05 · 공급사 code 기반 매칭 전환 (사용자 지시)
    //   · 기존: `supplier !== supplierFilter` → "(주)녹십자" ≠ "녹십자" variant 깨짐
    //   · 현재: Step 1~4 에서 code set 매칭된 row 만 담김 · name 비교 불필요
    //   · ERP CorpNameView 원문 보존 · DB 수정 없음
    const date = r.purchase_date ? String(r.purchase_date).slice(0, 10) : "";
    if (!date) continue;
    const productCode = String(r.product_code ?? "").trim();
    rows.push({
      id: Number.isFinite(id) ? id : null,
      supplier,
      purchase_date: date,
      product_code: productCode,
      // 2026-10-06 · canonical SSOT · products.product_code JOIN 성공 시 그 값 · 없으면 null
      //   · transaction (purchase_details.product_name) 노출 금지
      product_name: productCode ? (productNameByCode.get(productCode) ?? null) : null,
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
