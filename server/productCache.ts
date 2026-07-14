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
    const { data: existing } = await supabase
      .from("vendors")
      .select("id, company_name, business_number")
      .ilike("company_name", `%${cleaned}%`)
      .limit(1)
      .maybeSingle();
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
