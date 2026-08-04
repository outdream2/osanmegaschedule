// src/components/OrderManagePage/PaymentInfoTab.tsx
// 결제 탭 > 결제정보 서브탭 (2026-08-03 재설계 · #196)
// 좌측 · 공급사 리스트 (잔고 정렬)
// 우측 · [결제 입력 폼] + [최근 결제 내역]
//   · 결제 방법 · 카드/이체/현금/어음/상계/기타 (segmented)
//   · 카드 선택 시 · 카드사 selectOrCustom (10 대 카드사 + 자유입력)
//   · 이체 선택 시 · 은행 selectOrCustom
//   · 세금계산서 발행 · 참조번호 · VAT 별도 계산 (vat_included 반영)
//   · 확장 필드는 memo prefix (JSON) 로 저장 · 백엔드 DDL 변경 없음
//
// 리서치 (2026-08 · 최신)
//   · Korean B2B 표준 · 사업자번호 · 공급가액 · VAT(10%) 별도 · 전자세금계산서
//   · U-pharm/Cresoty/Platpharm/Baropharm · 유팜 · 크레소티 등 벤치마크
//   · Zoho/QuickBooks · payment_method + reference_number + tax_invoice_no

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2, Loader2, Wallet, CalendarDays, CreditCard, Banknote,
  FileText, Check, X, RefreshCw, Landmark, Coins, ScrollText, Layers,
  Phone, User2, ReceiptText, ArrowRight, Plus,
} from "lucide-react";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { SplitPanel } from "../common/SplitPanel";

// ─── Types ───────────────────────────────────────────────────────────────────

interface VendorItem {
  id: number;
  company_name: string;
  category: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  business_number?: string | null;
  created_at?: string | null;
  payment_terms?: string | null;
  active?: boolean | null;
  vat_included?: boolean | null;
  // 2026-08-04 · 좌측 리스트에 총 잔고 표시 (withBalances=1 응답)
  balance?: number | null;
}

type PayMethod = "card" | "transfer" | "cash" | "check" | "offset" | "etc";

interface PaymentRow {
  id: number;
  supplier_name: string;
  payment_date: string;
  amount: number;
  method: PayMethod | string | null;
  memo: string | null;
  created_at?: string | null;
  // decoded from memo prefix
  meta?: {
    card_issuer?: string;
    bank_name?: string;
    reference_no?: string;
    tax_invoice_issued?: boolean;
    tax_invoice_no?: string;
    vat_amount?: number;
    note?: string;
  };
}

interface BalanceResp {
  supplier: string;
  total_purchase: number;
  total_payment: number;
  balance: number;
  purchase_count: number;
  payment_count: number;
}

// 월별 매입/결제 breakdown · 2026-08-04 · #58 · 상단 요약 표용
// key = "YYYY-MM" · purchase/payment 는 해당 월 합계
interface MonthlyBreakdown {
  months: string[];               // 오래된순 · 최근 N개월 · e.g. ["2026-06","2026-07","2026-08"]
  purchase: Record<string, number>; // "YYYY-MM" → 매입 합계
  payment: Record<string, number>;  // "YYYY-MM" → 결제 합계
  total_purchase: number;          // 전체 (fetch 기간 내) 매입 합계
  total_payment: number;           // 전체 (fetch 기간 내) 결제 합계
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CARD_ISSUERS = [
  "신한카드", "삼성카드", "현대카드", "KB국민카드", "롯데카드",
  "NH농협카드", "하나카드", "우리카드", "BC카드", "씨티카드", "카카오뱅크카드",
];

const BANKS = [
  "KB국민은행", "신한은행", "우리은행", "하나은행", "IBK기업은행",
  "NH농협은행", "SC제일은행", "씨티은행", "카카오뱅크", "토스뱅크", "케이뱅크",
  "SH수협은행", "우체국",
];

// 2026-08-03 · #225 · 결제방법 단순화 · 카드 · 현금 · 기타 3가지
// 기존 저장 데이터(transfer/check/offset) 는 methodLabel 로 표시만 됨 · 새 저장은 3개만
const METHOD_OPTIONS: Array<{
  key: PayMethod;
  label: string;
}> = [
  { key: "card", label: "카드" },
  { key: "cash", label: "현금" },
  { key: "etc",  label: "기타" },
];

const CATEGORY_COLORS: Record<string, string> = {
  "위탁":     "bg-violet-500 text-white",
  "선결제":   "bg-rose-500 text-white",
  "60일회전": "bg-emerald-500 text-white",
  "90일회전": "bg-teal-500 text-white",
  "기타":     "bg-slate-500 text-white",
  "전체":     "bg-slate-700 text-white",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const todayYmd = (): string => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

// 최근 N개월 · 오래된순 · "YYYY-MM" · 2026-08-04 · #58
// e.g. now=2026-08-04, n=3 → ["2026-06","2026-07","2026-08"]
function recentMonthKeys(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    out.push(`${d.getFullYear()}-${m}`);
  }
  return out;
}

// "YYYY-MM" → "M월" · 2026-08-04 · #58 · 표 헤더용
function fmtMonthShort(key: string): string {
  const [_y, m] = key.split("-");
  return `${Number(m)}월`;
}

function fmtWonShort(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (abs >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString();
}

function fmtBizNum(n: string | null | undefined): string {
  if (!n) return "-";
  const d = String(n).replace(/\D/g, "");
  if (d.length !== 10) return String(n);
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

function fmtPhone(n: string | null | undefined): string {
  if (!n) return "-";
  const d = String(n).replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return String(n);
}

function methodLabel(m: string | null | undefined): string {
  const map: Record<string, string> = {
    card: "카드", transfer: "이체", cash: "현금",
    check: "어음", offset: "상계", etc: "기타",
  };
  return map[String(m ?? "").toLowerCase()] ?? "-";
}

function methodTone(m: string | null | undefined): { bg: string; text: string; ring: string } {
  switch (String(m ?? "").toLowerCase()) {
    case "card":     return { bg: "bg-indigo-50",  text: "text-indigo-700",  ring: "ring-indigo-100" };
    case "transfer": return { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-100" };
    case "cash":     return { bg: "bg-amber-50",   text: "text-amber-700",   ring: "ring-amber-100" };
    case "check":    return { bg: "bg-violet-50",  text: "text-violet-700",  ring: "ring-violet-100" };
    case "offset":   return { bg: "bg-teal-50",    text: "text-teal-700",    ring: "ring-teal-100" };
    default:         return { bg: "bg-slate-50",   text: "text-slate-600",   ring: "ring-slate-200" };
  }
}

// memo <-> meta 인코딩 · 백엔드 DDL 변경 없이 확장 필드 저장
// 형식 · "[meta]{"card_issuer":"신한카드",...}[/meta] 사용자메모"
const META_RE = /^\[meta\](\{[\s\S]*?\})\[\/meta\]\s?/;

function encodeMemo(meta: NonNullable<PaymentRow["meta"]>, note: string): string {
  const cleanMeta: Record<string, any> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null || v === "" || v === false || (typeof v === "number" && v === 0)) continue;
    cleanMeta[k] = v;
  }
  const hasMeta = Object.keys(cleanMeta).length > 0;
  const trimmedNote = note.trim();
  if (!hasMeta) return trimmedNote;
  return `[meta]${JSON.stringify(cleanMeta)}[/meta]${trimmedNote ? " " + trimmedNote : ""}`;
}

function decodeMemo(memo: string | null | undefined): { meta: PaymentRow["meta"]; note: string } {
  if (!memo) return { meta: undefined, note: "" };
  const s = String(memo);
  const m = s.match(META_RE);
  if (!m) return { meta: undefined, note: s };
  try {
    const meta = JSON.parse(m[1]) as PaymentRow["meta"];
    const note = s.replace(META_RE, "").trim();
    return { meta, note };
  } catch {
    return { meta: undefined, note: s };
  }
}

// VAT 10% 분리 · vat_included 이면 amount 안에 부가세 포함 → 분리 계산
function computeVat(amount: number, vatIncluded: boolean): { supply: number; vat: number } {
  if (!Number.isFinite(amount) || amount <= 0) return { supply: 0, vat: 0 };
  if (vatIncluded) {
    const supply = Math.round(amount / 1.1);
    return { supply, vat: amount - supply };
  }
  const vat = Math.round(amount * 0.1);
  return { supply: amount, vat };
}

// ─── PaymentInfoTab ──────────────────────────────────────────────────────────

export const PaymentInfoTab: React.FC = () => {
  // 공급사 목록
  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorCategoryFilter, setVendorCategoryFilter] =
    useState<"전체" | "위탁" | "선결제" | "60일회전" | "90일회전" | "기타">("전체");

  // 선택 공급사
  const [selectedVendor, setSelectedVendor] = useState<VendorItem | null>(null);

  // 잔고
  const [balance, setBalance] = useState<BalanceResp | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // 최근 결제 이력
  const [recentPayments, setRecentPayments] = useState<PaymentRow[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  // 월별 매입/결제 breakdown · 2026-08-04 · #58 · 상단 요약 표
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<MonthlyBreakdown | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  // 폼 상태
  const [paymentDate, setPaymentDate] = useState<string>(todayYmd());
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<PayMethod>("card");
  const [cardIssuer, setCardIssuer] = useState<string>("");
  const [cardIssuerCustom, setCardIssuerCustom] = useState<string>("");
  const [bankName, setBankName] = useState<string>("");
  const [bankNameCustom, setBankNameCustom] = useState<string>("");
  // #225 · 기타(etc) 옵션 자유 텍스트 · 저장 시 memo prefix 또는 payload method_note
  const [etcNote, setEtcNote] = useState<string>("");
  const [referenceNo, setReferenceNo] = useState<string>("");
  const [taxInvoiceIssued, setTaxInvoiceIssued] = useState<boolean>(false);
  const [taxInvoiceNo, setTaxInvoiceNo] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // ── 공급사 목록 로드 ────────────────────────────────────────
  const loadVendors = useCallback(async () => {
    setVendorsLoading(true);
    try {
      const res = await fetch("/api/vendors?withBalances=1");
      if (!res.ok) throw new Error(String(res.status));
      const list: any[] = await res.json();
      setVendors(list.map(v => ({
        id: v.id,
        company_name: String(v.company_name ?? ""),
        category: v.category ?? null,
        contact_name: v.contact_name ?? null,
        phone: v.phone ?? null,
        email: v.email ?? null,
        business_number: v.business_number ?? null,
        created_at: v.created_at ?? null,
        payment_terms: v.payment_terms ?? null,
        active: v.active ?? null,
        vat_included: v.vat_included ?? null,
        balance: Number.isFinite(Number(v.balance)) ? Number(v.balance) : null,
      })));
    } catch { setVendors([]); }
    finally { setVendorsLoading(false); }
  }, []);

  useEffect(() => {
    loadVendors();
    const reload = () => loadVendors();
    window.addEventListener("vendors-changed", reload);
    window.addEventListener("supplier-payment-added", reload);
    return () => {
      window.removeEventListener("vendors-changed", reload);
      window.removeEventListener("supplier-payment-added", reload);
    };
  }, [loadVendors]);

  // 공급사 목록 refresh 후 선택 동기화
  useEffect(() => {
    if (!selectedVendor) return;
    const found = vendors.find(v => v.id === selectedVendor.id);
    if (found) setSelectedVendor(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendors]);

  // ── 잔고 · 최근결제 로드 ─────────────────────────────────────
  const loadBalance = useCallback(async (supplierName: string) => {
    setBalanceLoading(true);
    try {
      const res = await fetch(`/api/supplier-balance/${encodeURIComponent(supplierName)}`);
      if (!res.ok) throw new Error(String(res.status));
      const j: BalanceResp = await res.json();
      setBalance(j);
    } catch { setBalance(null); }
    finally { setBalanceLoading(false); }
  }, []);

  const loadRecentPayments = useCallback(async (supplierName: string) => {
    setRecentLoading(true);
    try {
      const res = await fetch(`/api/supplier-payments?supplier=${encodeURIComponent(supplierName)}&days=365`);
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      const rows: any[] = Array.isArray(j?.rows) ? j.rows : [];
      const decoded: PaymentRow[] = rows.slice(0, 8).map(r => {
        const { meta, note: n } = decodeMemo(r.memo);
        return {
          id: r.id,
          supplier_name: r.supplier_name,
          payment_date: r.payment_date,
          amount: Number(r.amount) || 0,
          method: r.method ?? null,
          memo: n,
          created_at: r.created_at ?? null,
          meta,
        };
      });
      setRecentPayments(decoded);
    } catch { setRecentPayments([]); }
    finally { setRecentLoading(false); }
  }, []);

  // 월별 매입·결제 breakdown 로드 · 2026-08-04 · #58
  //   · /api/supplier-purchase-detail (매입 raw) + /api/supplier-payments (결제 raw)
  //   · 클라이언트에서 YYYY-MM key 로 sum · 최근 N개월 표시
  //   · 파생컬럼 X · 기존 API 조합 · 서버 신규 없음 (feedback_no_derived_columns)
  const MONTHS_TO_SHOW = 3;
  const FETCH_DAYS = 365; // 1년치 fetch · 누적 컬럼 정합성 위해 넉넉히
  const loadMonthlyBreakdown = useCallback(async (supplierName: string) => {
    setMonthlyLoading(true);
    try {
      const [detailRes, paysRes] = await Promise.all([
        fetch(`/api/supplier-purchase-detail?supplier=${encodeURIComponent(supplierName)}&days=${FETCH_DAYS}`),
        fetch(`/api/supplier-payments?supplier=${encodeURIComponent(supplierName)}&days=${FETCH_DAYS}`),
      ]);
      const purchase: Record<string, number> = {};
      const payment: Record<string, number> = {};
      let totalPurchase = 0;
      let totalPayment = 0;
      if (detailRes.ok) {
        const j = await detailRes.json();
        for (const r of (Array.isArray(j?.rows) ? j.rows : [])) {
          const date = String(r?.date ?? "");
          if (!/^\d{4}-\d{2}/.test(date)) continue;
          const key = date.slice(0, 7);
          const amt = Number(r?.amount) || 0;
          purchase[key] = (purchase[key] ?? 0) + amt;
          totalPurchase += amt;
        }
      }
      if (paysRes.ok) {
        const j = await paysRes.json();
        for (const r of (Array.isArray(j?.rows) ? j.rows : [])) {
          const date = String(r?.payment_date ?? "");
          if (!/^\d{4}-\d{2}/.test(date)) continue;
          const key = date.slice(0, 7);
          const amt = Number(r?.amount) || 0;
          payment[key] = (payment[key] ?? 0) + amt;
          totalPayment += amt;
        }
      }
      setMonthlyBreakdown({
        months: recentMonthKeys(MONTHS_TO_SHOW),
        purchase,
        payment,
        total_purchase: totalPurchase,
        total_payment: totalPayment,
      });
    } catch {
      setMonthlyBreakdown(null);
    } finally {
      setMonthlyLoading(false);
    }
  }, []);

  // 공급사 선택 시 · 잔고 + 최근결제 로드 · 폼 리셋
  useEffect(() => {
    if (!selectedVendor) {
      setBalance(null);
      setRecentPayments([]);
      setMonthlyBreakdown(null);
      return;
    }
    loadBalance(selectedVendor.company_name);
    loadRecentPayments(selectedVendor.company_name);
    loadMonthlyBreakdown(selectedVendor.company_name);
    // 폼 리셋
    setPaymentDate(todayYmd());
    setAmount("");
    setMethod("card");
    setCardIssuer("");
    setCardIssuerCustom("");
    setBankName("");
    setBankNameCustom("");
    setEtcNote("");
    setReferenceNo("");
    setTaxInvoiceIssued(false);
    setTaxInvoiceNo("");
    setNote("");
    setMsg(null);
  }, [selectedVendor, loadBalance, loadRecentPayments, loadMonthlyBreakdown]);

  // ── 필터링된 공급사 ─────────────────────────────────────────
  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    return vendors.filter(v => {
      if (q && !v.company_name.toLowerCase().includes(q)) return false;
      if (vendorCategoryFilter !== "전체" && v.category !== vendorCategoryFilter) return false;
      return true;
    });
  }, [vendors, vendorSearch, vendorCategoryFilter]);

  // ── VAT 자동 계산 ────────────────────────────────────────────
  const amountNum = Number(String(amount).replace(/[^0-9]/g, "")) || 0;
  const vatIncluded = selectedVendor?.vat_included === true;
  const { supply: supplyAmt, vat: vatAmt } = useMemo(
    () => computeVat(amountNum, vatIncluded),
    [amountNum, vatIncluded]
  );

  // ── 최대치 (현재 잔고) ──────────────────────────────────────
  const currentBalance = balance?.balance ?? 0;
  const overBalance = amountNum > 0 && currentBalance > 0 && amountNum > currentBalance;

  // ── 저장 ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!selectedVendor) return;
    setMsg(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      setMsg({ type: "err", text: "결제일 형식 오류 (YYYY-MM-DD)" });
      return;
    }
    if (amountNum <= 0) {
      setMsg({ type: "err", text: "결제 금액은 양수여야 합니다" });
      return;
    }

    const resolvedCard = method === "card"
      ? (cardIssuer === "직접입력" ? cardIssuerCustom.trim() : cardIssuer)
      : "";
    const resolvedBank = method === "transfer"
      ? (bankName === "직접입력" ? bankNameCustom.trim() : bankName)
      : "";

    if (method === "card" && !resolvedCard) {
      setMsg({ type: "err", text: "카드사를 선택하세요" });
      return;
    }
    if (method === "transfer" && !resolvedBank) {
      setMsg({ type: "err", text: "은행을 선택하세요" });
      return;
    }

    const meta: NonNullable<PaymentRow["meta"]> = {
      card_issuer: resolvedCard || undefined,
      bank_name: resolvedBank || undefined,
      reference_no: referenceNo.trim() || undefined,
      tax_invoice_issued: taxInvoiceIssued || undefined,
      tax_invoice_no: taxInvoiceIssued ? (taxInvoiceNo.trim() || undefined) : undefined,
      vat_amount: taxInvoiceIssued ? vatAmt : undefined,
    };
    const finalMemo = encodeMemo(meta, note);

    setSaving(true);
    try {
      const res = await fetch("/api/supplier-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_name: selectedVendor.company_name,
          payment_date: paymentDate,
          amount: amountNum,
          method,
          memo: finalMemo || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `서버 ${res.status}`);
      }
      setMsg({ type: "ok", text: "결제 등록 완료" });
      // 리셋
      setAmount("");
      setReferenceNo("");
      setTaxInvoiceNo("");
      setNote("");
      setTaxInvoiceIssued(false);
      // 리로드
      await Promise.all([
        loadBalance(selectedVendor.company_name),
        loadRecentPayments(selectedVendor.company_name),
        loadMonthlyBreakdown(selectedVendor.company_name),
      ]);
      window.dispatchEvent(new CustomEvent("supplier-payment-added", {
        detail: { supplier: selectedVendor.company_name },
      }));
    } catch (e: any) {
      setMsg({ type: "err", text: `저장 실패: ${e?.message ?? e}` });
    } finally {
      setSaving(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <SplitPanel
        storageKey="paymentInfo.leftWidth"
        defaultWidth={256}
        minWidth={200}
        maxWidth={400}
        dividerColor="sky"
        wrapLeft={false}
        wrapRight={false}
        mobileRightAsModal={true}
        mobileModalTitle={selectedVendor?.company_name ?? "결제 정보"}
        mobileOpen={!!selectedVendor}
        onMobileClose={() => setSelectedVendor(null)}
        className="flex-1 min-h-0"
        left={
          /* ── 좌측 · 공급사 리스트 ─────────────────────────────── */
          <div className="w-full lg:flex-col shrink-0 flex flex-col gap-2 h-full min-h-0">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2.5 flex flex-col gap-2 shrink-0">
            <input
              type="text"
              value={vendorSearch}
              onChange={e => setVendorSearch(e.target.value)}
              placeholder="공급사명 검색"
              className="w-full h-7 px-2.5 text-[11px] border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-sky-400 focus:border-sky-400 transition"
            />
            <div className="flex flex-wrap gap-0.5">
              {(["전체", "위탁", "선결제", "60일회전", "90일회전", "기타"] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setVendorCategoryFilter(cat)}
                  className={`h-6 px-2 text-[10px] font-semibold rounded-lg transition cursor-pointer ${
                    vendorCategoryFilter === cat
                      ? CATEGORY_COLORS[cat]
                      : "bg-slate-50 text-slate-500 border border-slate-200 hover:text-slate-700"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 min-h-0 max-h-[42vh] lg:max-h-none flex flex-col overflow-hidden">
            {/* 헤더 · 컬럼 라벨 (2026-08-04 · 사용자 지적 · 헤더 없어서 추가) */}
            <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50/60 shrink-0 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-500">
              <span className="w-[42px] shrink-0">분류</span>
              <span className="flex-1">공급사명</span>
              <span className="w-[72px] text-right text-amber-700" title="총 잔고 (미결제)">잔고</span>
              <span className="text-slate-400 tabular-nums w-[36px] text-right">{filteredVendors.length}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
            {vendorsLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-400 gap-2 text-[12px]">
                <Loader2 size={13} className="animate-spin" />불러오는 중...
              </div>
            ) : filteredVendors.length === 0 ? (
              <div className="py-10 text-center text-[11px] text-slate-300">공급사 없음</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredVendors.map(v => {
                  const bal = Number(v.balance ?? 0);
                  const hasBal = v.balance != null && bal !== 0;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVendor(prev => prev?.id === v.id ? null : v)}
                      className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition cursor-pointer ${
                        selectedVendor?.id === v.id
                          ? "bg-sky-50 border-l-2 border-sky-500"
                          : "hover:bg-slate-50 border-l-2 border-transparent"
                      }`}
                    >
                      <span className="w-[42px] shrink-0"><VendorCategoryBadge category={v.category} /></span>
                      <span className={`text-[12px] font-semibold break-words whitespace-normal leading-tight flex-1 ${
                        selectedVendor?.id === v.id ? "text-sky-800" : "text-slate-700"
                      }`}>
                        {v.company_name}
                      </span>
                      <span className={`w-[72px] text-right text-[11px] font-black tabular-nums shrink-0 ${
                        hasBal
                          ? bal > 0 ? "text-amber-700" : "text-rose-700"
                          : "text-slate-300"
                      }`} title={hasBal ? `${bal > 0 ? "미결제" : "초과결제"} ${Math.abs(bal).toLocaleString()}원` : "잔고 없음"}>
                        {hasBal ? fmtWonShort(Math.abs(bal)) : "-"}
                      </span>
                      <span className="w-[36px]"></span>
                    </button>
                  );
                })}
              </div>
            )}
            </div>
          </div>
          </div>
        }
        right={
          /* ── 우측 · 결제 입력 · 최근 결제 ─────────────────────── */
          <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2 overflow-y-auto lg:overflow-hidden">
          {!selectedVendor ? (
            <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
              <Wallet size={44} className="mb-3 opacity-30" />
              <div className="text-[13px] font-black">결제 등록 · 공급사를 선택하세요</div>
              <div className="text-[11px] mt-1">좌측 공급사 리스트에서 대상 선택 후 결제 정보를 입력합니다</div>
            </div>
          ) : (
            <>
              {/* ── 공급사 요약 카드 ──────────────────────────── */}
              <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col gap-2.5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center shrink-0 ring-1 ring-sky-200">
                    <Building2 size={18} className="text-sky-600" />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-[15px] font-black text-slate-800 leading-tight break-words">
                        {selectedVendor.company_name}
                      </h2>
                      <VendorCategoryBadge category={selectedVendor.category} />
                      {vatIncluded && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">
                          VAT포함
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-500">
                      {selectedVendor.business_number && (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <span className="text-slate-400 text-[9px] font-black uppercase tracking-wider">사업자</span>
                          {fmtBizNum(selectedVendor.business_number)}
                        </span>
                      )}
                      {selectedVendor.contact_name && (
                        <span className="inline-flex items-center gap-1">
                          <User2 size={10} className="text-slate-400" />
                          {selectedVendor.contact_name}
                        </span>
                      )}
                      {selectedVendor.phone && (
                        <a href={`tel:${selectedVendor.phone.replace(/\D/g, "")}`}
                          className="inline-flex items-center gap-1 tabular-nums hover:text-sky-600 transition">
                          <Phone size={10} className="text-slate-400" />
                          {fmtPhone(selectedVendor.phone)}
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* 월별 매입·결제·잔고 표 (2026-08-04 · #58 · 사용자 요청)
                    · 최근 3개월 + 누적 + 잔고 컬럼 · 3행 (총매입/총결제/잔고)
                    · 데이터: monthlyBreakdown (supplier-purchase-detail + supplier-payments)
                    · 누적: balance.total_purchase/total_payment (전체 기간 · 서버 sum) 우선
                    · 잔고: currentBalance (누적매입 - 누적결제)
                    · 모바일 반응형 · 가로 스크롤 */}
                {(() => {
                  const months = monthlyBreakdown?.months ?? recentMonthKeys(MONTHS_TO_SHOW);
                  const purMap = monthlyBreakdown?.purchase ?? {};
                  const payMap = monthlyBreakdown?.payment ?? {};
                  // 누적 · balance 응답 (전체 기간) 우선 · monthlyBreakdown 은 1년치라 부정확할 수 있음
                  const totalPurchase = balance?.total_purchase ?? monthlyBreakdown?.total_purchase ?? 0;
                  const totalPayment  = balance?.total_payment  ?? monthlyBreakdown?.total_payment  ?? 0;
                  const totalBalance  = currentBalance;
                  const fmt = (n: number) => n === 0 ? "-" : fmtWonShort(n);
                  const dash = <span className="text-slate-300">-</span>;
                  const showLoading = monthlyLoading || balanceLoading;
                  return (
                    <div className="overflow-hidden rounded-lg border border-slate-200 shadow-xs">
                      <div className="overflow-x-auto">
                      <table className="w-full min-w-[420px] text-[12px] tabular-nums">
                        <thead className="bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="text-left px-3 py-1.5 w-[64px]">구분</th>
                            {months.map(k => (
                              <th key={k} className="text-right px-2.5 py-1.5 whitespace-nowrap">
                                <span className="inline-flex flex-col items-end leading-tight">
                                  <span className="text-slate-400 text-[9px]">{k.slice(0, 4)}</span>
                                  <span>{fmtMonthShort(k)}</span>
                                </span>
                              </th>
                            ))}
                            <th className="text-right px-2.5 py-1.5 whitespace-nowrap text-slate-700 border-l border-slate-200">
                              <span className="inline-flex items-center gap-1 justify-end"><Layers size={11} />누적</span>
                            </th>
                            <th className="text-right px-2.5 py-1.5 whitespace-nowrap text-amber-700 bg-amber-50/40">
                              <span className="inline-flex items-center gap-1 justify-end"><Coins size={11} />잔고</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {/* Row 1 · 총 매입 */}
                          <tr className="bg-white">
                            <td className="px-3 py-1.5 font-black text-emerald-700">
                              <span className="inline-flex items-center gap-1"><ReceiptText size={11} />매입</span>
                            </td>
                            {months.map(k => (
                              <td key={k} className={`px-2.5 py-1.5 text-right font-black ${(purMap[k] ?? 0) === 0 ? "text-slate-300" : "text-emerald-800"}`}>
                                {fmt(purMap[k] ?? 0)}
                              </td>
                            ))}
                            <td className="px-2.5 py-1.5 text-right font-black text-emerald-800 border-l border-slate-200">{fmt(totalPurchase)}</td>
                            <td className="px-2.5 py-1.5 text-right text-slate-300 bg-amber-50/30">{dash}</td>
                          </tr>
                          {/* Row 2 · 총 결제 */}
                          <tr className="bg-slate-50/40">
                            <td className="px-3 py-1.5 font-black text-sky-700">
                              <span className="inline-flex items-center gap-1"><Wallet size={11} />결제</span>
                            </td>
                            {months.map(k => (
                              <td key={k} className={`px-2.5 py-1.5 text-right font-black ${(payMap[k] ?? 0) === 0 ? "text-slate-300" : "text-sky-800"}`}>
                                {fmt(payMap[k] ?? 0)}
                              </td>
                            ))}
                            <td className="px-2.5 py-1.5 text-right font-black text-sky-800 border-l border-slate-200">{fmt(totalPayment)}</td>
                            <td className="px-2.5 py-1.5 text-right text-slate-300 bg-amber-50/30">{dash}</td>
                          </tr>
                          {/* Row 3 · 잔고 */}
                          <tr className="bg-white">
                            <td className="px-3 py-1.5 font-black text-amber-700">
                              <span className="inline-flex items-center gap-1"><Coins size={11} />잔고</span>
                            </td>
                            {months.map(k => (
                              <td key={k} className="px-2.5 py-1.5 text-right text-slate-300">{dash}</td>
                            ))}
                            <td className="px-2.5 py-1.5 text-right text-slate-300 border-l border-slate-200">{dash}</td>
                            <td className={`px-2.5 py-1.5 text-right font-black bg-amber-50/60 ${
                              totalBalance > 0 ? "text-amber-700" : totalBalance < 0 ? "text-rose-700" : "text-slate-500"
                            }`}>
                              {totalBalance === 0 ? "0" : fmtWonShort(Math.abs(totalBalance))}
                              {totalBalance !== 0 && (
                                <span className="text-[9px] font-semibold text-slate-400 ml-1">
                                  {totalBalance > 0 ? "미결" : "초과"}
                                </span>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      </div>
                      {showLoading && (
                        <div className="px-3 py-1 bg-slate-50 text-[10px] text-slate-400 flex items-center gap-1">
                          <Loader2 size={10} className="animate-spin" />로딩중
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* 결제 입력 + 최근 결제 내역 · 좌우 분할 · 반응형 stack (2026-08-04 · 사용자 요청) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">

              {/* ── 결제 입력 폼 ─────────────────────────────── */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                  <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <Plus size={13} className="text-emerald-700" strokeWidth={2.5} />
                  </div>
                  <div className="text-[13px] font-black text-slate-800">결제 정보 입력</div>
                  {vatIncluded && (
                    <span className="ml-auto text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">
                      부가세 별도 자동계산
                    </span>
                  )}
                </div>

                {/* Row 1 · 결제일 · [결제방법+카드사 nowrap 그룹] (2026-08-04 · 사용자 요청) */}
                <div className="flex flex-wrap items-end gap-2">
                  <FieldLabel label="결제일" icon={<CalendarDays size={11} />}>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={e => setPaymentDate(e.target.value)}
                      className={`${inputCls} w-[122px]`}
                    />
                  </FieldLabel>
                  {/* 결제방법 + sub-option · 하나의 flex-nowrap 그룹 · 항상 같은 줄 */}
                  <div className="flex items-end gap-2 flex-1 min-w-0">
                  <FieldLabel label="결제 방법" required>
                    <select
                      value={method}
                      onChange={e => setMethod(e.target.value as PayMethod)}
                      className={`${inputCls} w-[100px]`}
                    >
                      {METHOD_OPTIONS.map(opt => (
                        <option key={opt.key} value={opt.key}>{opt.label}</option>
                      ))}
                    </select>
                  </FieldLabel>
                  {/* 결제방법 sub-option · 나란히 · 카드사/은행/입력 */}
                  {method === "card" && (
                    <FieldLabel label="카드사">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={cardIssuer}
                          onChange={e => setCardIssuer(e.target.value)}
                          className={`${inputCls} w-[140px]`}
                        >
                          <option value="">선택...</option>
                          {CARD_ISSUERS.map(c => <option key={c} value={c}>{c}</option>)}
                          <option value="직접입력">직접 입력...</option>
                        </select>
                        {cardIssuer === "직접입력" && (
                          <input
                            type="text"
                            value={cardIssuerCustom}
                            onChange={e => setCardIssuerCustom(e.target.value)}
                            placeholder="카드사 이름"
                            className={`${inputCls} w-[140px]`}
                          />
                        )}
                      </div>
                    </FieldLabel>
                  )}
                  {method === "cash" && (
                    <FieldLabel label="은행">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={bankName}
                          onChange={e => setBankName(e.target.value)}
                          className={`${inputCls} w-[140px]`}
                        >
                          <option value="">선택...</option>
                          {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                          <option value="직접입력">직접 입력...</option>
                        </select>
                        {bankName === "직접입력" && (
                          <input
                            type="text"
                            value={bankNameCustom}
                            onChange={e => setBankNameCustom(e.target.value)}
                            placeholder="은행 이름"
                            className={`${inputCls} w-[140px]`}
                          />
                        )}
                      </div>
                    </FieldLabel>
                  )}
                  {method === "etc" && (
                    <FieldLabel label="기타 결제방법">
                      <input
                        type="text"
                        value={etcNote}
                        onChange={e => setEtcNote(e.target.value)}
                        placeholder="예: 페이코 · 카카오페이 · 상계 · 어음 등"
                        className={`${inputCls} w-[220px]`}
                      />
                    </FieldLabel>
                  )}
                  </div>{/* 결제방법+sub-option nowrap 그룹 close */}
                </div>
                {/* Row 2 · 결제금액 + 부가세포함 체크박스 · 같은 줄 (2026-08-04 · 사용자 요청 통합) */}
                <div className="flex items-end gap-2">
                  {/* 결제금액 · flex-1 */}
                  <div className="flex-1 min-w-0">
                    <FieldLabel label="결제 금액 (원)" icon={<Wallet size={11} />} required>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={amount ? Number(amount).toLocaleString() : ""}
                          onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                          placeholder="0"
                          className={`${inputCls} text-right tabular-nums font-black ${overBalance ? "border-amber-400 focus:ring-amber-400 focus:border-amber-400" : ""}`}
                        />
                        {currentBalance > 0 && !amount && (
                          <button
                            type="button"
                            onClick={() => setAmount(String(Math.round(currentBalance)))}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 px-2 text-[10px] font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition"
                            title="현재 잔고 전액"
                          >
                            전액 {fmtWonShort(currentBalance)}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[10px] mt-1 min-h-[14px]">
                        {amountNum > 0 && (
                          <>
                            <span className="text-slate-400 tabular-nums">₩{amountNum.toLocaleString()}</span>
                            {taxInvoiceIssued && (
                              <span className="text-slate-500 tabular-nums">
                                공급 {supplyAmt.toLocaleString()} · VAT {vatAmt.toLocaleString()}
                              </span>
                            )}
                          </>
                        )}
                        {overBalance && (
                          <span className="text-amber-600 font-bold ml-auto">
                            잔고({fmtWonShort(currentBalance)}) 초과
                          </span>
                        )}
                      </div>
                    </FieldLabel>
                  </div>
                  {/* 부가세포함 체크박스 · shrink-0 · 결제금액 오른쪽 · 인풋 높이 기준 정렬 */}
                  <div className="shrink-0 pb-[18px]">
                    <label className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border cursor-pointer text-[12px] font-semibold transition ${
                      taxInvoiceIssued
                        ? "bg-teal-50 border-teal-300 text-teal-700"
                        : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}>
                      <input
                        type="checkbox"
                        checked={taxInvoiceIssued}
                        onChange={e => setTaxInvoiceIssued(e.target.checked)}
                        className="w-3.5 h-3.5 accent-teal-600"
                      />
                      부가세 포함
                    </label>
                  </div>
                </div>
                {/* 참조번호 · 세금계산서번호 필드 · 2026-08-04 · 사용자 요청으로 제거 */}

                {/* Row 5 · 메모 */}
                <FieldLabel label="메모 (선택)">
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="예: 6월분 결제 · 부분 결제 · 특이사항 등"
                    rows={2}
                    className={`${inputCls} py-2 resize-none leading-snug`}
                  />
                </FieldLabel>

                {/* 상태 메시지 + 저장 버튼 */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                  {msg && (
                    <span className={`inline-flex items-center gap-1 text-[12px] font-bold ${
                      msg.type === "ok" ? "text-emerald-600" : "text-rose-600"
                    }`}>
                      {msg.type === "ok" ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}
                      {msg.text}
                    </span>
                  )}
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={saving || amountNum <= 0}
                    className="inline-flex items-center gap-1.5 h-9 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[12px] font-black shadow-sm transition cursor-pointer"
                  >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
                    결제 등록
                  </button>
                </div>
              </div>

              {/* ── 최근 결제 내역 ───────────────────────────── */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                  <div className="w-6 h-6 rounded-lg bg-sky-100 flex items-center justify-center">
                    <ReceiptText size={13} className="text-sky-700" strokeWidth={2.5} />
                  </div>
                  <div className="text-[13px] font-black text-slate-800">최근 결제 내역</div>
                  <span className="ml-auto text-[11px] text-slate-400 tabular-nums">
                    {recentLoading ? "로딩..." : `${recentPayments.length}건 (최근)`}
                  </span>
                  <button
                    type="button"
                    onClick={() => selectedVendor && loadRecentPayments(selectedVendor.company_name)}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 transition"
                    title="새로고침"
                  >
                    <RefreshCw size={12} className={recentLoading ? "animate-spin" : ""} />
                  </button>
                </div>

                {recentLoading ? (
                  <div className="flex items-center justify-center py-8 text-slate-400 gap-2 text-[12px]">
                    <Loader2 size={13} className="animate-spin" />불러오는 중...
                  </div>
                ) : recentPayments.length === 0 ? (
                  <div className="py-8 text-center text-[11px] text-slate-300">결제 이력 없음</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {recentPayments.map(p => {
                      const tone = methodTone(p.method);
                      const meta = p.meta ?? {};
                      const subLabel =
                        meta.card_issuer ? meta.card_issuer :
                        meta.bank_name   ? meta.bank_name :
                        null;
                      return (
                        <div key={p.id} className="py-2 flex items-center gap-3 hover:bg-slate-50/60 -mx-2 px-2 rounded transition">
                          <span className={`inline-flex items-center justify-center w-14 h-8 rounded-lg text-[10px] font-black ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}>
                            {methodLabel(p.method)}
                          </span>
                          <div className="flex-1 min-w-0 flex flex-col leading-tight gap-0.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[11px] font-black text-slate-700 tabular-nums shrink-0">
                                {p.payment_date}
                              </span>
                              {subLabel && (
                                <span className="text-[10px] font-semibold text-slate-500 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 truncate">
                                  {subLabel}
                                </span>
                              )}
                              {meta.tax_invoice_issued && (
                                <span className="text-[9px] font-black text-teal-700 px-1 py-0.5 rounded bg-teal-50 border border-teal-200 shrink-0">
                                  세금계산서
                                </span>
                              )}
                            </div>
                            {(p.memo || meta.reference_no) && (
                              <div className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                                {meta.reference_no && (
                                  <span className="inline-flex items-center gap-0.5 text-slate-400 tabular-nums">
                                    <ArrowRight size={9} />{meta.reference_no}
                                  </span>
                                )}
                                {p.memo && <span className="truncate">{p.memo}</span>}
                              </div>
                            )}
                          </div>
                          <span className="text-[13px] font-black text-emerald-700 tabular-nums shrink-0">
                            -{p.amount.toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              </div>{/* 결제입력+최근결제내역 grid wrapper close */}
            </>
          )}
          </div>
        }
      />
    </div>
  );
};

// ─── UI Helpers ─────────────────────────────────────────────────────────────

const inputCls =
  "w-full h-9 px-3 text-[12px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 bg-white transition placeholder:text-slate-300";

const FieldLabel: React.FC<{
  label: string;
  icon?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}> = ({ label, icon, required, children }) => (
  <label className="block space-y-1">
    <span className="inline-flex items-center gap-1 text-[10px] font-black text-slate-500 uppercase tracking-wider">
      {icon && <span className="text-slate-400">{icon}</span>}
      {label}
      {required && <span className="text-rose-500">*</span>}
    </span>
    {children}
  </label>
);

const KpiMini: React.FC<{
  label: string;
  value: string;
  tone: "emerald" | "sky" | "amber" | "rose" | "slate";
  loading?: boolean;
  icon?: React.ReactNode;
  hint?: string;
}> = ({ label, value, tone, loading, icon, hint }) => {
  const map = {
    emerald: { text: "text-emerald-700", badge: "bg-emerald-50 text-emerald-600 border-emerald-100" },
    sky:     { text: "text-sky-700",     badge: "bg-sky-50 text-sky-600 border-sky-100" },
    amber:   { text: "text-amber-700",   badge: "bg-amber-50 text-amber-600 border-amber-100" },
    rose:    { text: "text-rose-700",    badge: "bg-rose-50 text-rose-600 border-rose-100" },
    slate:   { text: "text-slate-600",   badge: "bg-slate-50 text-slate-500 border-slate-200" },
  } as const;
  const t = map[tone];
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-xs px-2.5 py-2 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 min-w-0">
        {icon && (
          <span className={`w-5 h-5 flex items-center justify-center rounded border ${t.badge} shrink-0`}>
            {icon}
          </span>
        )}
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider leading-none">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        {loading ? (
          <Loader2 size={12} className="animate-spin text-slate-300" />
        ) : (
          <span className={`text-[14px] font-black tabular-nums leading-none ${t.text}`}>{value}</span>
        )}
      </div>
      {hint && <div className="text-[9px] font-semibold text-slate-400 leading-none">{hint}</div>}
    </div>
  );
};

export default PaymentInfoTab;
