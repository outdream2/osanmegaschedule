// supplierPayments/helpers.ts — VAT 유틸 · 공통 상수
import { supabase } from "../../../../src/supabase/client";

export const VALID_METHODS = new Set(["transfer", "cash", "card", "check", "offset", "etc"]);

export const toNumOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const isYmd = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ─────────────────────────────────────────────────────────────────────────────
// VAT 유틸 (2026-08-03 · #193 · 2026-08-06 개선 · null → true 기본)
//   splitVat(amount, vat_included)
//     · vat_included=true  → vat = amount/11 · supply = amount - vat
//     · vat_included=false → vat = amount*0.1 · supply = amount
//     · vat_included=null  → true 로 기본 처리
// ─────────────────────────────────────────────────────────────────────────────
export function splitVat(amount: number, vatIncluded: boolean | null): { vat: number; supply: number } {
  if (!Number.isFinite(amount) || amount <= 0) return { vat: 0, supply: 0 };
  const eff = vatIncluded === false ? false : true; // null → true (default)
  if (eff) {
    const vat = Math.round(amount / 11);
    return { vat, supply: amount - vat };
  }
  const vat = Math.round(amount * 0.1);
  return { vat, supply: amount };
}

/** 공급사명에서 vat 별도 힌트 감지 */
function inferVatFromName(name: string | null | undefined): boolean | null {
  if (!name) return null;
  return /vat\s*(미포함|별도|없음)/i.test(String(name)) ? false : null;
}

/** 공급사명으로 vat_included lookup · 실패해도 null 반환 */
export async function fetchVatIncluded(supplier: string): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from("vendors")
      .select("vat_included, company_name")
      .eq("company_name", supplier)
      .maybeSingle();
    if (error) return inferVatFromName(supplier);
    const v = data?.vat_included;
    if (v === true || v === false) return v;
    return inferVatFromName(data?.company_name ?? supplier);
  } catch {
    return inferVatFromName(supplier);
  }
}
