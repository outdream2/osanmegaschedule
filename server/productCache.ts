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
    const { data, error } = await supabase.from("ocr_synonyms").select("prod_name_old,product_code,supplier_new");
    if (error) { synonymMapPromise = null; return new Map(); }
    const map = new Map<string, string>();
    for (const row of (data ?? [])) {
      const alias = String(row.prod_name_old).trim().toLowerCase();
      const code  = String(row.product_code).trim();
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
