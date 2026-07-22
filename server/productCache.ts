import { supabase } from "../src/supabase/client";
import { normSupplier } from "./ocr/match";

export interface ProductInfo {
  code: string;
  name: string;
  spec: string;
  [key: string]: any;
}

let productMapCache: Record<string, ProductInfo> | null = null;
let productMapPromise: Promise<Record<string, ProductInfo>> | null = null;
let synonymMapCache: Map<string, string> | null = null;
let synonymMapPromise: Promise<Map<string, string>> | null = null;
let supplierAliasCache: Map<string, string> | null = null;
let supplierAliasPromise: Promise<Map<string, string>> | null = null;
let vendorNamesCache: string[] | null = null;
let vendorNamesPromise: Promise<string[]> | null = null;
// 상품명 → 공급사 후보 역인덱스 캐시 (Task #50)
let productToSuppliersCache: Map<string, { supplier: string; count: number }[]> | null = null;
let productToSuppliersPromise: Promise<Map<string, { supplier: string; count: number }[]>> | null = null;

export function resetProductCache(): void {
  productMapCache = null;
  productMapPromise = null;
}

export function resetSynonymCache(): void {
  synonymMapCache = null;
  synonymMapPromise = null;
}

export function resetSupplierAliasCache(): void {
  supplierAliasCache = null;
  supplierAliasPromise = null;
}

export function resetVendorNamesCache(): void {
  vendorNamesCache = null;
  vendorNamesPromise = null;
}

export function resetProductToSuppliersCache(): void {
  productToSuppliersCache = null;
  productToSuppliersPromise = null;
}

/**
 * vendors 테이블의 모든 company_name 리스트 (캐싱)
 * OCR 로 뽑은 supplier 를 이 리스트와 fuzzy 매칭해서 정규화된 공급사명 반환
 */
export async function getVendorNames(): Promise<string[]> {
  if (vendorNamesCache) return vendorNamesCache;
  if (vendorNamesPromise) return vendorNamesPromise;
  vendorNamesPromise = (async () => {
    try {
      const { data, error } = await supabase.from("vendors").select("company_name");
      if (error) { vendorNamesPromise = null; return []; }
      const names = (data ?? [])
        .map((r: any) => String(r.company_name ?? "").trim())
        .filter(Boolean);
      vendorNamesCache = names;
      return names;
    } catch {
      vendorNamesPromise = null;
      return [];
    }
  })();
  return vendorNamesPromise;
}

// 사업자번호 → 공급사명 매핑 캐시 (Phase 7 · 2026-07-14)
let vendorBizNumMapCache: Map<string, string> | null = null;
let vendorBizNumMapPromise: Promise<Map<string, string>> | null = null;

export function resetVendorBizNumMapCache(): void {
  vendorBizNumMapCache = null;
  vendorBizNumMapPromise = null;
}

/**
 * 사업자번호 → 공급사명 매핑 (캐싱)
 *   OCR rawText 에서 사업자번호 감지 → DB 조회 → 정확한 공급사명 반환
 */
export async function getVendorBizNumMap(): Promise<Map<string, string>> {
  if (vendorBizNumMapCache) return vendorBizNumMapCache;
  if (vendorBizNumMapPromise) return vendorBizNumMapPromise;
  vendorBizNumMapPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from("vendors")
        .select("company_name, business_number")
        .not("business_number", "is", null);
      if (error) { vendorBizNumMapPromise = null; return new Map(); }
      const map = new Map<string, string>();
      for (const r of (data ?? []) as any[]) {
        const bn = String(r.business_number ?? "").trim();
        const nm = String(r.company_name ?? "").trim();
        if (bn && nm) map.set(bn, nm);
      }
      vendorBizNumMapCache = map;
      return map;
    } catch {
      vendorBizNumMapPromise = null;
      return new Map();
    }
  })();
  return vendorBizNumMapPromise;
}

/**
 * 사업자번호 학습 저장 (Phase 7 Option C · 2026-07-14)
 *   OCR 처리 중 (사업자번호, 공급사명) 페어 감지 시 vendors DB 에 자동 저장.
 *   - 이미 그 이름의 vendor 있으면 business_number 필드만 업데이트
 *   - 없으면 새 vendor 생성
 *   - 캐시 무효화
 */
export async function learnVendorBusinessNumber(supplierName: string, bizNum: string): Promise<{ action: "updated" | "created" | "skipped"; reason?: string }> {
  if (!supplierName || !bizNum || bizNum.length !== 10) return { action: "skipped", reason: "invalid input" };
  try {
    const cleaned = supplierName.trim();
    // 2026-07-22 · exact match 우선 · ilike 부분문자열은 오학습 유발
    //   예전: ilike '%앤바이오%' → "엘앤바이오랩" 이 실제인데 "앤바이오" 로 오학습됨
    //   지금: eq 우선 · 없으면 정확히 (주) 접두 유무만 다른 case 만 fallback (신중한 매칭)
    let existing: { id: any; company_name: string; business_number: string | null } | null = null;
    // 1) exact match
    {
      const { data } = await supabase
        .from("vendors")
        .select("id, company_name, business_number")
        .eq("company_name", cleaned)
        .limit(1)
        .maybeSingle();
      if (data) existing = data as any;
    }
    // 2) (주) prefix 유무만 다른 정확 매칭 (예: "(주)대웅제약" ↔ "대웅제약")
    if (!existing) {
      const noPrefix = cleaned.replace(/^\(주\)|^\(株\)|^주식회사\s*/, "").trim();
      const withPrefix = `(주)${noPrefix}`;
      const alt = cleaned === noPrefix ? withPrefix : noPrefix;
      if (alt && alt !== cleaned) {
        const { data } = await supabase
          .from("vendors")
          .select("id, company_name, business_number")
          .eq("company_name", alt)
          .limit(1)
          .maybeSingle();
        if (data) existing = data as any;
      }
    }
    if (existing) {
      if (existing.business_number === bizNum) return { action: "skipped", reason: "already set" };
      if (existing.business_number && existing.business_number !== bizNum) {
        return { action: "skipped", reason: `DB has different biz_num: ${existing.business_number}` };
      }
      const { error } = await supabase.from("vendors").update({ business_number: bizNum }).eq("id", existing.id);
      if (error) return { action: "skipped", reason: error.message };
      resetVendorBizNumMapCache();
      return { action: "updated" };
    }
    // 새 공급사 생성
    const { error } = await supabase.from("vendors").insert({ company_name: cleaned, business_number: bizNum, category: "OCR학습" });
    if (error) return { action: "skipped", reason: error.message };
    resetVendorBizNumMapCache();
    return { action: "created" };
  } catch (e: any) {
    return { action: "skipped", reason: e?.message ?? "unknown" };
  }
}

export async function getProductMap(): Promise<Record<string, ProductInfo>> {
  if (productMapCache) return productMapCache;
  if (productMapPromise) return productMapPromise;
  productMapPromise = (async () => {
    const PAGE = 1000;
    const map: Record<string, ProductInfo> = {};
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from("products").select("*").range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      for (const row of data) {
        const code = String(row.product_code ?? "").trim();
        if (!code) continue;
        const info: ProductInfo = { code, name: row.product_name ?? "", spec: row.spec ?? "", ...row, realMap: row.real_map ?? null };
        map[code] = info;
        const stripped = code.replace(/^0+/, "");
        if (stripped && stripped !== code && !map[stripped]) map[stripped] = info;
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
    productMapCache = map;
    return map;
  })();
  return productMapPromise;
}

// OCR 이 추출한 원본 이름 ↔ DB canonical 매핑 저장
//   다음 스캔 시 즉시 매칭 (fuzzy 매칭 안 거치고 alias 로 바로 해결)
export async function learnSupplierAlias(rawName: string, canonicalName: string): Promise<{ action: "created" | "updated" | "skipped"; reason?: string }> {
  if (!rawName || !canonicalName) return { action: "skipped", reason: "empty input" };
  const alias = rawName.trim();
  const name = canonicalName.trim();
  if (alias === name) return { action: "skipped", reason: "identical" };
  if (alias.length < 2 || name.length < 2) return { action: "skipped", reason: "too short" };
  try {
    const { data: existing } = await supabase
      .from("ocr_supplier_aliases")
      .select("id, supplier_name")
      .eq("alias", alias)
      .limit(1)
      .maybeSingle();
    if (existing) {
      if (existing.supplier_name === name) return { action: "skipped", reason: "already same" };
      const { error } = await supabase.from("ocr_supplier_aliases").update({ supplier_name: name }).eq("id", existing.id);
      if (error) return { action: "skipped", reason: error.message };
      supplierAliasCache = null;
      supplierAliasPromise = null;
      return { action: "updated" };
    }
    const { error } = await supabase.from("ocr_supplier_aliases").insert({ alias, supplier_name: name });
    if (error) return { action: "skipped", reason: error.message };
    supplierAliasCache = null;
    supplierAliasPromise = null;
    return { action: "created" };
  } catch (e: any) {
    return { action: "skipped", reason: e?.message ?? "unknown" };
  }
}

export async function getSupplierAliasMap(): Promise<Map<string, string>> {
  if (supplierAliasCache) return supplierAliasCache;
  if (supplierAliasPromise) return supplierAliasPromise;
  supplierAliasPromise = (async () => {
    const { data, error } = await supabase.from("ocr_supplier_aliases").select("alias,supplier_name");
    if (error) { supplierAliasPromise = null; return new Map(); }
    const map = new Map<string, string>();
    for (const row of (data ?? [])) {
      const alias = normSupplier(String(row.alias ?? "").trim());
      const name  = String(row.supplier_name ?? "").trim();
      if (alias && name) map.set(alias, name);
    }
    supplierAliasCache = map;
    return map;
  })();
  return supplierAliasPromise;
}

/**
 * 상품명 → 공급사 후보 역인덱스 (Task #50 · 2026-07-19)
 *   데이터 소스 ①: ocr_synonyms.prod_name_old + supplier_new (동의어 우선)
 *   데이터 소스 ②: products.product_name + supplier (실제 DB · 보조)
 *   같은 상품명에 여러 공급사 → count 순 정렬
 */
export async function getProductToSuppliersMap(): Promise<Map<string, { supplier: string; count: number }[]>> {
  if (productToSuppliersCache) return productToSuppliersCache;
  if (productToSuppliersPromise) return productToSuppliersPromise;
  productToSuppliersPromise = (async () => {
    // raw accumulator: normKey → { supplier → count }
    const acc = new Map<string, Map<string, number>>();
    const addEntry = (rawName: string, supplier: string) => {
      const key = rawName.trim().toLowerCase();
      const sup = supplier.trim();
      if (!key || !sup || key.length < 2) return;
      if (!acc.has(key)) acc.set(key, new Map());
      const m = acc.get(key)!;
      m.set(sup, (m.get(sup) ?? 0) + 1);
    };

    try {
      // ① ocr_synonyms (동의어 우선 · supplier_new 있는 행만)
      const { data: synRows } = await supabase
        .from("ocr_synonyms")
        .select("prod_name_old,supplier_new,cancelled");
      for (const row of (synRows ?? []) as any[]) {
        if (row.cancelled === true) continue;
        const name = String(row.prod_name_old ?? "").trim();
        const sup  = String(row.supplier_new ?? "").trim();
        if (name && sup) addEntry(name, sup);
      }
    } catch {
      // 조회 실패 시 무시 · 다음 소스 계속
    }

    try {
      // ② products (보조 · supplier 컬럼 있는 행만)
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("product_name,supplier")
          .not("supplier", "is", null)
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        for (const row of data as any[]) {
          const name = String(row.product_name ?? "").trim();
          const sup  = String(row.supplier ?? "").trim();
          if (name && sup) addEntry(name, sup);
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
    } catch {
      // 조회 실패 시 무시
    }

    // Map<normKey, {supplier,count}[] sorted by count desc> 로 변환
    const result = new Map<string, { supplier: string; count: number }[]>();
    for (const [key, supplierMap] of acc) {
      const sorted = Array.from(supplierMap.entries())
        .map(([supplier, count]) => ({ supplier, count }))
        .sort((a, b) => b.count - a.count);
      result.set(key, sorted);
    }
    productToSuppliersCache = result;
    return result;
  })();
  return productToSuppliersPromise;
}

export async function getSynonymMap(): Promise<Map<string, string>> {
  if (synonymMapCache) return synonymMapCache;
  if (synonymMapPromise) return synonymMapPromise;
  synonymMapPromise = (async () => {
    // 안전한 조회: 서버 필터 없이 전체 가져와서 코드에서 cancelled 걸러냄 (하위 호환).
    // 이렇게 하면 마이그레이션 미적용 DB에서도 잘 동작.
    let data: any[] | null = null;
    const first = await supabase
      .from("ocr_synonyms")
      .select("prod_name_old,product_code,supplier_new,cancelled");
    if (first.error) {
      // cancelled 컬럼이 없는 구 DB
      const fallback = await supabase.from("ocr_synonyms").select("prod_name_old,product_code,supplier_new");
      if (fallback.error) { synonymMapPromise = null; return new Map(); }
      data = fallback.data;
    } else {
      data = first.data;
    }
    const map = new Map<string, string>();
    for (const row of (data ?? [])) {
      const alias = String(row.prod_name_old ?? "").trim().toLowerCase();
      const code  = String(row.product_code ?? "").trim();
      if (!alias || !code) continue;
      // 취소된 항목 스킵 (컬럼 없으면 undefined → 스킵 안 함)
      if ((row as any).cancelled === true) continue;
      // sentinel 코드 스킵
      if (code === "__cancelled__") continue;
      if (row.supplier_new) {
        map.set(`${normSupplier(String(row.supplier_new))}|${alias}`, code);
      }
      if (!map.has(alias)) map.set(alias, code);
    }
    synonymMapCache = map;
    return map;
  })();
  return synonymMapPromise;
}
