// src/components/LandingPage/VendorListEditor.utils.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · VendorListEditor 유틸/상수 이관
import { fmtWonCompact } from "../../lib/format";
import type { Vendor, EditDraft } from "./VendorListEditor.types";

export const fmtWon = fmtWonCompact;

// VAT 포함 여부 판정 · vendor.vat_included 우선 · null 이면 company_name 문자열에서 유추
export function detectVatIncluded(v: Pick<Vendor, "vat_included" | "company_name" | "note">): boolean | null {
  if (v.vat_included === true) return true;
  if (v.vat_included === false) return false;
  const text = `${v.company_name ?? ""} ${v.note ?? ""}`;
  if (/vat\s*미포함|부가세\s*미포함|부가가치세\s*미포함/i.test(text)) return false;
  if (/vat\s*포함|부가세\s*포함|부가가치세\s*포함/i.test(text)) return true;
  return null;
}

export const vatDraftVal = (v: Vendor | null | undefined): "included" | "excluded" | "unset" => {
  // 2026-08-10 · 사용자 요청 · VAT 포함 기본 · 미설정 제거
  if (!v) return "included";
  if (v.vat_included === true) return "included";
  if (v.vat_included === false) return "excluded";
  return "included";
};

export const emptyDraft = (v: Vendor): EditDraft => ({
  company_name: v.company_name ?? "",
  business_number: v.business_number ?? "",
  contact_name: v.contact_name ?? "",
  phone: v.phone ?? "",
  email: v.email ?? "",
  category: v.category ?? "",
  note: v.note ?? "",
  vat_included: vatDraftVal(v),
  team_leader_name:  v.team_leader_name  ?? "",
  team_leader_phone: v.team_leader_phone ?? "",
  emergency_contact: v.emergency_contact ?? "",
});

export const normalizeBizNum = (s: string): string => s.replace(/[^0-9]/g, "").slice(0, 10);

export const formatBizNum = (s: string | null): string => {
  if (!s) return "";
  const d = normalizeBizNum(s);
  if (d.length !== 10) return d;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
};

// compact 모드 전용 · 분류별 좌측 컬러 바
export const CATEGORY_LEFT_BORDER: Record<string, string> = {
  위탁:       "border-l-violet-400",
  선결제:     "border-l-rose-400",
  "60회전": "border-l-emerald-400",
  "90회전": "border-l-teal-400",
  기타:       "border-l-zinc-300",
};

export const CATEGORY_LEFT_BG: Record<string, string> = {
  위탁:       "bg-violet-50/40",
  선결제:     "bg-rose-50/40",
  "60회전": "bg-emerald-50/40",
  "90회전": "bg-teal-50/40",
  기타:       "bg-zinc-50/30",
};

// 공급사명 정규화 · vendors.company_name ↔ stock_history.supplier_name 매칭용
// PurchaseHistoryTab.tsx 의 normalizeName 과 동일 규칙 (법인접두어/괄호/공백 제거)
export const normalizeSupplierKey = (s: string | null | undefined): string =>
  String(s ?? "")
    .replace(/[\s()㈜㈐]/g, "")
    .replace(/^\(주\)/g, "")
    .replace(/주식회사/g, "")
    .replace(/\(주\)$/g, "")
    .toLowerCase();

// 결제 방법 라벨 매핑
export const METHOD_LABEL: Record<string, string> = {
  card: "카드",
  transfer: "이체",
  cash: "현금",
  check: "어음",
  offset: "상계",
  etc: "기타",
};

// 결제 방법 옵션 (모달 셀렉트박스)
export const METHOD_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "card",     label: "카드" },
  { key: "transfer", label: "이체" },
  { key: "cash",     label: "현금" },
  { key: "check",    label: "어음" },
  { key: "offset",   label: "상계" },
  { key: "etc",      label: "기타" },
];
