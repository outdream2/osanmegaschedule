// 2026-08-17 · apiClient 마이그레이션
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVendors } from "../../hooks/useVendors";
import {
  Building2, Loader2, Wallet, CalendarDays, CreditCard, Banknote,
  FileText, Check, X, RefreshCw, Landmark, Coins, ScrollText, Layers,
  ReceiptText, ArrowRight, Plus, Calendar, Package2,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
// T-COMMON-VendorInfo · 공급사 헤더 공통 컴포넌트 (2026-08-06)
import { VendorInfoHeader } from "../common/VendorInfoHeader";
import { useVendorInfoModal } from "../common/VendorInfoModal";
import { SplitPanel } from "../common/SplitPanel";
import { useSortableTable, type Comparator } from "../../hooks/useSortableTable";
// T-CSS Phase 2 · 2026-08-06
import { CARD_BASE } from "../../styles/tokens";
import { EmptyState } from "../common/EmptyState";
import { PeriodSelector, PERIOD_DAYS_PRESET, PERIOD_MONTHS_PRESET } from "../common/PeriodSelector";
import { CategoryChips, type ChipTone } from "../common/CategoryChips";
import { IconTile } from "../common/IconTile";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";
import { useReferenceValues } from "../../hooks/useReferenceValues";
import { api, ApiError } from "../../lib/apiClient";

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
  // 결제 직후 잔고 (누적 매입 - 누적 결제, 이 결제까지 반영)
  // · Task #104 · /api/supplier-ledger 의 running_balance 사용
  // · 양수 = 미결 · 0 = 완납 · 음수 = 초과결제
  running_balance?: number | null;
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

// 2026-08-09 · 판매/실재고 월별 breakdown · 7행 표 아래쪽 3행 (판매정보)
//   /api/supplier-monthly-breakdown 응답 · stock_history 소스
//   실재고액: stockValueCurrent (현재값 · 실재고 × 매입단가 합계 · 월별 스냅샷 아님)
interface SalesStockBreakdown {
  months: string[];                       // 오래된순
  purchases: Record<string, number>;     // 매입 (동일 데이터 · 표 아래쪽 재사용)
  payments: Record<string, number>;      // 결제
  sales: Record<string, number>;         // 판매액 (프록시)
  stockValue: Record<string, number>;   // (deprecated · 하위호환) 월별 실재고
  stockValueCurrent: number;             // 현재 실재고액 · 실재고 × 매입단가 합계
  totals: {
    purchases: number;
    payments: number;
    balance: number;
    sales: number;
    stockValue: number;
  };
}

// ─── Period Filter · Task #103 (2026-08-04) ─────────────────────────────────
//   좌측 리스트 상단 · 매입·결제 집계 기간 chip · 10d/1M/2M/3M · default 1M
//   localStorage: megatown_payment_period · 다음 방문 시 복원

type PeriodDays = 10 | 30 | 60 | 90;
const PERIOD_STORAGE_KEY = "megatown_payment_period";
const PERIOD_OPTIONS: Array<{ days: PeriodDays; label: string }> = [
  { days: 10, label: "10일" },
  { days: 30, label: "1개월" },
  { days: 60, label: "2개월" },
  { days: 90, label: "3개월" },
];
const DEFAULT_PERIOD: PeriodDays = 30;

function loadPeriodPref(): PeriodDays {
  try {
    const raw = window.localStorage.getItem(PERIOD_STORAGE_KEY);
    const n = Number(raw);
    if ([10, 30, 60, 90].includes(n)) return n as PeriodDays;
  } catch { /* SSR safe */ }
  return DEFAULT_PERIOD;
}

// ─── Sort · 좌측 리스트 헤더 정렬 · Task #103 ─────────────────────────────
//   default · 잔고 desc (많은 순 · Task #101 확장)
//   name = 공급사명 · balance = 총잔고 · payment = 총결제 · sales = 총판매 · stockValue = 총재고자산
//   2026-08-09 · 사용자 요청 재구성 · 4컬럼 (총재고자산·총판매액·총결제액·총잔고)
type VendorSortKey = "name" | "balance" | "payment" | "sales" | "stockValue";
type SortDir = "asc" | "desc";

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
  "60회전": "bg-emerald-500 text-white",
  "90회전": "bg-teal-500 text-white",
  "기타":     "bg-zinc-500 text-white",
  "전체":     "bg-zinc-700 text-white",
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
    default:         return { bg: "bg-zinc-50",   text: "text-zinc-600",   ring: "ring-zinc-200" };
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
  // DB + 하드코딩 병합 reference 값
  const { vendorCategories: dbVendorCategories } = useReferenceValues();

  // 공급사 상세 모달 (T-COMMON-VendorInfoModal · 2026-08-06)
  const { openVendorInfo, modalElement: vendorModalElement } = useVendorInfoModal();

  // 공급사 목록 · useVendors 캐시 (inline fetch 제거)
  const { vendors: rawVendors, loading: vendorsLoading, refresh: reloadVendors } = useVendors();
  // latestBalance.balance 파싱 · VendorItem 형태로 변환
  const vendors = useMemo<VendorItem[]>(() => rawVendors.map(v => {
    const rawBal = (v as any)?.latestBalance?.balance;
    const bal = Number.isFinite(Number(rawBal)) ? Number(rawBal) : null;
    return {
      id: v.id,
      company_name: String(v.company_name ?? ""),
      category: v.category ?? null,
      contact_name: v.contact_name ?? null,
      phone: v.phone ?? null,
      email: v.email ?? null,
      business_number: (v.business_number ?? null) as string | null,
      created_at: ((v as any).created_at ?? null) as string | null,
      payment_terms: ((v as any).payment_terms ?? null) as string | null,
      active: ((v as any).active ?? null) as boolean | null,
      vat_included: ((v as any).vat_included ?? null) as boolean | null,
      balance: bal,
    };
  }), [rawVendors]);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState<string>("전체");

  // 기간 필터 · Task #103 (2026-08-04) · 매입·결제 집계 기간
  const [periodDays, setPeriodDaysState] = useState<PeriodDays>(() => loadPeriodPref());
  const setPeriodDays = useCallback((d: PeriodDays) => {
    setPeriodDaysState(d);
    try { window.localStorage.setItem(PERIOD_STORAGE_KEY, String(d)); } catch { /* ignore */ }
  }, []);

  // 좌측 리스트 · 매입·결제 aggregate (기간 내 벤더별 합계) · Task #103
  //   /api/supplier-purchase-summary?days=N + /api/supplier-payments?days=N
  //   벤더명 (company_name) → 금액 · 매칭 실패 시 0
  const [purchaseByVendor, setPurchaseByVendor] = useState<Map<string, number>>(new Map());
  const [paymentByVendor, setPaymentByVendor] = useState<Map<string, number>>(new Map());
  // 2026-08-09 · 최근매입일 · /api/supplier-purchase-summary suppliers[].last_purchase_date (purchase_details)
  const [lastPurchaseDateByVendor, setLastPurchaseDateByVendor] = useState<Map<string, string>>(new Map());
  // 2026-08-09 · 총판매액 + 총재고자산 · /api/stock-manage/supplier-purchases (stock_history · 최근 3개월)
  const [salesByVendor, setSalesByVendor] = useState<Map<string, number>>(new Map());
  const [stockValueByVendor, setStockValueByVendor] = useState<Map<string, number>>(new Map());
  const [salesLoading, setSalesLoading] = useState(true);
  const [aggregatesLoading, setAggregatesLoading] = useState(false);

  // T-TEST-공급사리스트-최근결제 (2026-08-06) · 각 공급사 최근 결제 (KPI 상단·모달용)
  const [latestPaymentByVendor, setLatestPaymentByVendor] = useState<Map<string, { date: string; amount: number }>>(new Map());

  // 정렬 상태 · Task #103 · default 잔고 desc
  const [sortKey, setSortKey] = useState<VendorSortKey>("balance");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const handleSort = useCallback((key: VendorSortKey) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      // 신규 컬럼 · 숫자는 desc(큰것 우선) · 이름은 asc(가나다) 로 초기화
      setSortDir(key === "name" ? "asc" : "desc");
      return key;
    });
  }, []);

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
  // 2026-08-09 · 7행 표 · 판매·실재고 월별 데이터 + 기간 선택
  const [breakdownMonths, setBreakdownMonths] = useState<number>(3);
  const [salesStockBreakdown, setSalesStockBreakdown] = useState<SalesStockBreakdown | null>(null);
  const [salesStockLoading, setSalesStockLoading] = useState(false);
  // T11 · 상품별 매입 그루핑 (supplier-purchase-detail rows 를 product_code 로 aggregate)
  interface ProductPurchaseSummary {
    product_code: string;
    product_name: string;
    totalAmount: number;
    totalQty: number;
    invoiceCount: number;
    latestDate: string;
  }
  const [productSummary, setProductSummary] = useState<ProductPurchaseSummary[]>([]);
  const [showProductGroup, setShowProductGroup] = useState(false);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  // 상품매입 상세 표 · 헤더 자동 정렬 (2026-08-05 · UI #7)
  type ProdSortKey = "product_name" | "product_code" | "totalQty" | "totalAmount" | "invoiceCount" | "latestDate";
  const productSortComparators = useMemo<Record<ProdSortKey, Comparator<ProductPurchaseSummary>>>(() => ({
    product_name: (a, b) => a.product_name.localeCompare(b.product_name, "ko"),
    product_code: (a, b) => a.product_code.localeCompare(b.product_code, "ko"),
    totalQty:     (a, b) => a.totalQty - b.totalQty,
    totalAmount:  (a, b) => a.totalAmount - b.totalAmount,
    invoiceCount: (a, b) => a.invoiceCount - b.invoiceCount,
    latestDate:   (a, b) => a.latestDate.localeCompare(b.latestDate),
  }), []);
  const {
    sorted: sortedProductSummary,
    sortKey: prodSortKey,
    sortDir: prodSortDir,
    toggleSort: toggleProdSort,
  } = useSortableTable<ProductPurchaseSummary, ProdSortKey>(productSummary, "totalAmount", productSortComparators, "desc");
  const { getWidth: pw, resizerProps: pr } = useColumnResize("paymentProdSummary", {
    name:     { default: 200, min: 100, max: 400 },
    code:     { default: 80,  min: 60, max: 160  },
    qty:      { default: 64,  min: 48, max: 100  },
    amount:   { default: 80,  min: 56, max: 140  },
    count:    { default: 48,  min: 40, max: 80   },
    last_date:{ default: 80,  min: 60, max: 140  },
  });

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

  // 결제일 date input ref · 캘린더 아이콘 클릭 시 native picker 트리거 (2026-08-04 · #74)
  const paymentDateRef = useRef<HTMLInputElement | null>(null);
  const openDatePicker = useCallback(() => {
    const el = paymentDateRef.current;
    if (!el) return;
    // showPicker 는 Chrome 99+/Safari 16+/Firefox 101+ 지원 · 미지원 시 focus fallback
    if (typeof (el as any).showPicker === "function") {
      try { (el as any).showPicker(); return; } catch { /* fallthrough */ }
    }
    el.focus();
    try { el.click(); } catch { /* ignore */ }
  }, []);

  // supplier-payment-added 이벤트 · 결제 등록 후 공급사 캐시 재fetch (vendors-changed 는 useVendors 내부에서 이미 구독)
  useEffect(() => {
    const onPaymentAdded = () => reloadVendors();
    window.addEventListener("supplier-payment-added", onPaymentAdded);
    return () => window.removeEventListener("supplier-payment-added", onPaymentAdded);
  }, [reloadVendors]);

  // 공급사 목록 refresh 후 선택 동기화
  useEffect(() => {
    if (!selectedVendor) return;
    const found = vendors.find(v => v.id === selectedVendor.id);
    if (found) setSelectedVendor(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendors]);

  // ── 좌측 리스트 · 벤더별 매입·결제 aggregate 로드 · Task #103 (2026-08-04) ─
  //   기간(periodDays) 변경 시 · 결제 등록 시 · 초기 로드 시 자동 재조회
  //   /api/supplier-purchase-summary → suppliers[].total_amount (기간 내 매입 합)
  //   /api/supplier-payments → rows[] 를 supplier_name 별 sum (기간 내 결제 합)
  //   벤더명 = supplier_name (raw) · vendors.company_name 과 완전일치 매칭
  const loadAggregates = useCallback(async (days: PeriodDays) => {
    setAggregatesLoading(true);
    try {
      const [purResult, payResult] = await Promise.allSettled([
        api.get<any>(`/api/supplier-purchase-summary?days=${days}`),
        api.get<any>(`/api/supplier-payments?days=${days}`),
      ]);
      const purMap = new Map<string, number>();
      const payMap = new Map<string, number>();
      const lastDateMap = new Map<string, string>();
      if (purResult.status === "fulfilled") {
        const j = purResult.value.data;
        const list: any[] = Array.isArray(j?.suppliers) ? j.suppliers : [];
        for (const s of list) {
          const name = String(s?.supplier ?? "").trim();
          if (!name) continue;
          const amt = Number(s?.total_amount) || 0;
          purMap.set(name, (purMap.get(name) ?? 0) + amt);
          // 2026-08-09 · 최근매입일 · supplier-purchase-summary suppliers[].last_purchase_date (purchase_details)
          const lastDate = String(s?.last_purchase_date ?? "").trim();
          if (lastDate) {
            const prev = lastDateMap.get(name) ?? "";
            if (!prev || lastDate > prev) lastDateMap.set(name, lastDate);
          }
        }
      }
      if (payResult.status === "fulfilled") {
        const j = payResult.value.data;
        const rows: any[] = Array.isArray(j?.rows) ? j.rows : [];
        for (const r of rows) {
          const name = String(r?.supplier_name ?? "").trim();
          if (!name) continue;
          const amt = Number(r?.amount) || 0;
          payMap.set(name, (payMap.get(name) ?? 0) + amt);
        }
      }
      setPurchaseByVendor(purMap);
      setPaymentByVendor(payMap);
      setLastPurchaseDateByVendor(lastDateMap);
    } catch {
      setPurchaseByVendor(new Map());
      setPaymentByVendor(new Map());
    } finally {
      setAggregatesLoading(false);
    }
  }, []);

  // 기간 변경 · 초기 로드 · 결제 등록 후 재조회
  useEffect(() => {
    loadAggregates(periodDays);
    const reload = () => loadAggregates(periodDays);
    window.addEventListener("supplier-payment-added", reload);
    return () => {
      window.removeEventListener("supplier-payment-added", reload);
    };
  }, [periodDays, loadAggregates]);

  // 2026-08-09 · 총판매액 로드 · /api/stock-manage/supplier-purchases (stock_history · 최근 3개월)
  //   supplier 이름 정규화 매칭 (LandingPage VendorListEditor 와 동일 패턴)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSalesLoading(true);
      try {
        const { data: j } = await api.get<any>(`/api/stock-manage/supplier-purchases?months=3&limit=50000`);
        const rows: any[] = Array.isArray(j?.rows) ? j.rows : [];
        const sMap = new Map<string, number>();
        const svMap = new Map<string, number>();
        for (const r of rows) {
          const nm = String(r.supplier ?? "").trim();
          if (!nm) continue;
          sMap.set(nm, (sMap.get(nm) ?? 0) + (Number(r.saleAmount ?? 0) || 0));
          svMap.set(nm, (svMap.get(nm) ?? 0) + (Number(r.totalStockAmount ?? 0) || 0));
        }
        if (!cancelled) {
          setSalesByVendor(sMap);
          setStockValueByVendor(svMap);
        }
      } catch { /* silent · 실패 시 - 표시 */ }
      finally { if (!cancelled) setSalesLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // T-TEST-공급사리스트-최근결제 (2026-08-06) · 최근 결제일·결제액 배치 로드
  //   /api/supplier-payments/latest-per-supplier · 한번에 모든 공급사 최근 결제 fetch
  //   마운트 시 + 결제 등록 이벤트 시 재조회 · 기간 필터 무관 (전체 이력 중 최근)
  const loadLatestPayments = useCallback(async () => {
    try {
      const { data: j } = await api.get<any>("/api/supplier-payments/latest-per-supplier");
      const rows: any[] = Array.isArray(j?.rows) ? j.rows : [];
      const m = new Map<string, { date: string; amount: number }>();
      for (const r of rows) {
        const name = String(r?.supplier_name ?? "").trim();
        if (!name) continue;
        m.set(name, {
          date: String(r?.latest_payment_date ?? ""),
          amount: Number(r?.latest_payment_amount) || 0,
        });
      }
      setLatestPaymentByVendor(m);
    } catch {
      setLatestPaymentByVendor(new Map());
    }
  }, []);

  useEffect(() => {
    loadLatestPayments();
    const reload = () => loadLatestPayments();
    window.addEventListener("supplier-payment-added", reload);
    return () => window.removeEventListener("supplier-payment-added", reload);
  }, [loadLatestPayments]);

  // ── 잔고 · 최근결제 로드 ─────────────────────────────────────
  const loadBalance = useCallback(async (supplierName: string) => {
    setBalanceLoading(true);
    try {
      const { data: j } = await api.get<BalanceResp>(`/api/supplier-balance/${encodeURIComponent(supplierName)}`);
      setBalance(j);
    } catch { setBalance(null); }
    finally { setBalanceLoading(false); }
  }, []);

  const loadRecentPayments = useCallback(async (supplierName: string) => {
    setRecentLoading(true);
    try {
      // Task #104 · 결제 후 잔고 컬럼용으로 supplier-ledger 사용
      //   · ledger 는 매입+결제 시간순 merge 후 각 row 에 running_balance 계산 (서버측)
      //   · 여기서는 payment type 만 필터 · 결제 시점의 running_balance = "결제 후 잔고"
      //   · 넉넉히 3650일(10년) fetch · 누적 정합성 보장 (짧게 자르면 오래된 미결제 매입 누락 위험)
      const { data: j } = await api.get<any>(`/api/supplier-ledger?supplier=${encodeURIComponent(supplierName)}&days=3650`);
      const allRows: any[] = Array.isArray(j?.rows) ? j.rows : [];
      // payment type 만 · 최근순 (desc) 정렬 후 상위 8건
      const paymentRows = allRows
        .filter(r => r?.type === "payment")
        .sort((a, b) => {
          const dCmp = String(b?.date ?? "").localeCompare(String(a?.date ?? ""));
          if (dCmp !== 0) return dCmp;
          return (Number(b?.id) || 0) - (Number(a?.id) || 0);
        })
        .slice(0, 8);
      const decoded: PaymentRow[] = paymentRows.map(r => {
        const { meta, note: n } = decodeMemo(r.memo);
        return {
          id: Number(r.id),
          supplier_name: supplierName,
          payment_date: String(r.date ?? ""),
          amount: Number(r.amount) || 0,
          method: r.method ?? null,
          memo: n,
          created_at: null,
          running_balance: Number.isFinite(Number(r.running_balance)) ? Number(r.running_balance) : null,
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
      const [detailResult, paysResult] = await Promise.allSettled([
        api.get<any>(`/api/supplier-purchase-detail?supplier=${encodeURIComponent(supplierName)}&days=${FETCH_DAYS}`),
        api.get<any>(`/api/supplier-payments?supplier=${encodeURIComponent(supplierName)}&days=${FETCH_DAYS}`),
      ]);
      const purchase: Record<string, number> = {};
      const payment: Record<string, number> = {};
      let totalPurchase = 0;
      let totalPayment = 0;
      // T11 · 상품별 그루핑 (raw rows 를 product_code 로 집계)
      const productMap = new Map<string, ProductPurchaseSummary>();
      if (detailResult.status === "fulfilled") {
        const j = detailResult.value.data;
        for (const r of (Array.isArray(j?.rows) ? j.rows : [])) {
          const date = String(r?.date ?? "");
          if (!/^\d{4}-\d{2}/.test(date)) continue;
          const key = date.slice(0, 7);
          const amt = Number(r?.amount) || 0;
          purchase[key] = (purchase[key] ?? 0) + amt;
          totalPurchase += amt;
          // 상품별 집계
          const code = String(r?.product_code ?? "").trim();
          const pname = String(r?.product_name ?? "").trim();
          const groupKey = code || pname || "(미상)";
          const existing = productMap.get(groupKey);
          const qty = Number(r?.quantity) || 0;
          if (existing) {
            existing.totalAmount += amt;
            existing.totalQty += qty;
            existing.invoiceCount += 1;
            if (date > existing.latestDate) existing.latestDate = date;
          } else {
            productMap.set(groupKey, {
              product_code: code, product_name: pname || code || "(미상)",
              totalAmount: amt, totalQty: qty, invoiceCount: 1, latestDate: date,
            });
          }
        }
      }
      setProductSummary([...productMap.values()].sort((a, b) => b.totalAmount - a.totalAmount));
      if (paysResult.status === "fulfilled") {
        const j = paysResult.value.data;
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
      setProductSummary([]);
    } finally {
      setMonthlyLoading(false);
    }
  }, []);

  // 2026-08-09 · 판매·실재고 월별 로드 · /api/supplier-monthly-breakdown
  const loadSalesStockBreakdown = useCallback(async (supplierName: string, months: number) => {
    setSalesStockLoading(true);
    try {
      const { data: j } = await api.get<any>(`/api/supplier-monthly-breakdown?supplier=${encodeURIComponent(supplierName)}&months=${months}`);
      setSalesStockBreakdown(j);
    } catch {
      setSalesStockBreakdown(null);
    } finally {
      setSalesStockLoading(false);
    }
  }, []);

  // 공급사 선택 시 · 잔고 + 최근결제 로드 · 폼 리셋
  useEffect(() => {
    if (!selectedVendor) {
      setBalance(null);
      setRecentPayments([]);
      setMonthlyBreakdown(null);
      setProductSummary([]);
      setSalesStockBreakdown(null);
      return;
    }
    loadBalance(selectedVendor.company_name);
    loadRecentPayments(selectedVendor.company_name);
    loadMonthlyBreakdown(selectedVendor.company_name);
    loadSalesStockBreakdown(selectedVendor.company_name, breakdownMonths);
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
  }, [selectedVendor, loadBalance, loadRecentPayments, loadMonthlyBreakdown, loadSalesStockBreakdown, breakdownMonths]);

  // 2026-08-09 · breakdownMonths 변경 시 재조회
  useEffect(() => {
    if (!selectedVendor) return;
    loadSalesStockBreakdown(selectedVendor.company_name, breakdownMonths);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdownMonths]);

  // ── 필터링·정렬된 공급사 · Task #103 (2026-08-04) ─────────────
  //   필터 · 검색어 + 카테고리
  //   정렬 · sortKey (name/balance/purchase/payment) + sortDir (asc/desc)
  //     · 숫자 컬럼 · 값 없으면 0 취급 (내림차순 시 하단으로)
  //     · 이름 · localeCompare("ko") · 한글 가나다 순
  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    const filtered = vendors.filter(v => {
      if (q && !v.company_name.toLowerCase().includes(q)) return false;
      if (vendorCategoryFilter !== "전체" && v.category !== vendorCategoryFilter) return false;
      return true;
    });
    const dirMul = sortDir === "asc" ? 1 : -1;
    // 2026-08-09 · 4컬럼 재구성 · 총재고자산·총판매액·총결제액·총잔고
    const getBal = (v: any): number => Number(v?.latestBalance?.balance ?? 0);
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.company_name.localeCompare(b.company_name, "ko"); break;
        case "balance":
          cmp = getBal(a) - getBal(b); break;
        case "payment":
          cmp = (paymentByVendor.get(a.company_name) ?? 0) - (paymentByVendor.get(b.company_name) ?? 0); break;
        case "sales":
          cmp = (salesByVendor.get(a.company_name) ?? 0) - (salesByVendor.get(b.company_name) ?? 0); break;
        case "stockValue":
          cmp = (stockValueByVendor.get(a.company_name) ?? 0) - (stockValueByVendor.get(b.company_name) ?? 0); break;
      }
      if (cmp === 0) return a.company_name.localeCompare(b.company_name, "ko");
      return cmp * dirMul;
    });
  }, [vendors, vendorSearch, vendorCategoryFilter, sortKey, sortDir, paymentByVendor, salesByVendor, stockValueByVendor]);

  // ── VAT 자동 계산 (2026-08-06 · null 기본 true · 이름 힌트 반영) ─
  const amountNum = Number(String(amount).replace(/[^0-9]/g, "")) || 0;
  const vatIncluded = useMemo(() => {
    if (!selectedVendor) return true;
    if (selectedVendor.vat_included === true) return true;
    if (selectedVendor.vat_included === false) return false;
    // null · 이름 힌트로 추론 · 없으면 true 기본
    const nm = selectedVendor.company_name ?? "";
    return /vat\s*(미포함|별도|없음)/i.test(nm) ? false : true;
  }, [selectedVendor]);
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
      await api.post("/api/supplier-payments", {
        supplier_name: selectedVendor.company_name,
        payment_date: paymentDate,
        amount: amountNum,
        method,
        memo: finalMemo || null,
      });
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
      setMsg({ type: "err", text: `저장 실패: ${e instanceof ApiError ? e.message : (e?.message ?? String(e))}` });
    } finally {
      setSaving(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  return (
    <>
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
          <div className={`${CARD_BASE} px-3 py-2.5 flex flex-col gap-2 shrink-0`}>
            <input
              type="text"
              value={vendorSearch}
              onChange={e => setVendorSearch(e.target.value)}
              placeholder="공급사명 검색"
              className="w-full h-7 px-2.5 text-[15px] border border-line rounded-lg outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition"
            />
            <CategoryChips
              value={vendorCategoryFilter}
              onChange={setVendorCategoryFilter}
              size="sm"
              ariaLabel="공급사 카테고리 필터"
              options={(["전체", ...dbVendorCategories] as string[]).map(cat => ({
                value: cat,
                label: cat,
                tone: (cat === "전체"   ? "zinc"
                     : cat === "위탁"   ? "violet"
                     : cat === "선결제" ? "rose"
                     : cat === "60회전" ? "emerald"
                     : cat === "90회전" ? "teal"
                     : "zinc") as ChipTone,
              }))}
            />
            {/* 기간 필터 · 공용 PeriodSelector (2026-08-09) · 매입·결제 집계 기간
                · localStorage megatown_payment_period 유지 */}
            <div className="flex items-center gap-2 pt-1 border-t border-zinc-100">
              <span className="text-[15px] font-bold text-zinc-400 uppercase tracking-wider shrink-0" title="매입·결제 집계 기간">기간</span>
              <PeriodSelector
                options={PERIOD_DAYS_PRESET}
                value={periodDays}
                onChange={(d) => setPeriodDays(d as PeriodDays)}
                accent="sky"
                className="flex-1"
                ariaLabel="매입·결제 집계 기간"
              />
              {aggregatesLoading && (
                <Loader2 size={11} className="animate-spin text-sky-400 shrink-0" />
              )}
            </div>
          </div>

          {/* ── KPI 텍스트 한 줄 (2026-08-06 · T-PAYMENT-Enhance #3) ───────────
               총 잔고 · 최근 결제일 · 최근 결제액 · 텍스트 inline 형태
               라벨: text-zinc-400 / 값: text-emerald-700 or text-sky-700 */}
          {(() => {
            const totalBalance = vendors.reduce((s, v) => s + (Number(v.balance ?? 0)), 0);
            // latestPaymentByVendor 전체 중 가장 최근 결제 찾기
            let latestDate = "";
            let latestAmount = 0;
            for (const [, v] of latestPaymentByVendor) {
              if (!latestDate || v.date > latestDate) {
                latestDate = v.date;
                latestAmount = v.amount;
              }
            }
            const latestDateShort = latestDate && /^\d{4}-\d{2}-\d{2}$/.test(latestDate)
              ? latestDate.slice(2) // "YY-MM-DD"
              : latestDate || "-";
            return (
              <div className="flex items-center gap-3 px-1 py-0.5 text-[14px] shrink-0 flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="text-zinc-400 font-semibold">총 잔고</span>
                  <span className={`font-bold tabular-nums ${totalBalance > 0 ? "text-amber-700" : totalBalance < 0 ? "text-rose-700" : "text-zinc-400"}`}>
                    {totalBalance === 0 ? "-" : fmtWonShort(Math.abs(totalBalance))}
                  </span>
                </span>
                <span className="text-zinc-200 select-none">·</span>
                <span className="flex items-center gap-1">
                  <span className="text-zinc-400 font-semibold">최근 결제일</span>
                  <span className="font-bold text-zinc-600 tabular-nums">{latestDateShort}</span>
                </span>
                <span className="text-zinc-200 select-none">·</span>
                <span className="flex items-center gap-1">
                  <span className="text-zinc-400 font-semibold">최근 결제액</span>
                  <span className={`font-bold tabular-nums ${latestAmount > 0 ? "text-sky-700" : "text-zinc-400"}`}>
                    {latestAmount > 0 ? fmtWonShort(latestAmount) : "-"}
                  </span>
                </span>
              </div>
            );
          })()}

          <div className={`${CARD_BASE} flex-1 min-h-0 max-h-[42vh] lg:max-h-none flex flex-col overflow-hidden`}>
            {/* 헤더 · 자동 정렬 (Task #103 · 2026-08-04)
                · 컬럼: 분류 / 공급사명 / 매입 / 결제 / 잔고
                · 클릭 시 asc/desc 토글 · 활성 컬럼 화살표 표시 */}
            <VendorListHeader
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              count={filteredVendors.length}
              loading={vendorsLoading || aggregatesLoading || salesLoading}
            />
            <div className="flex-1 min-h-0 overflow-y-auto">
            {vendorsLoading ? (
              <div className="flex items-center justify-center py-10 text-zinc-400 gap-2 text-[14px]">
                <Loader2 size={13} className="animate-spin" />불러오는 중...
              </div>
            ) : filteredVendors.length === 0 ? (
              <div className="py-10 text-center text-[15px] text-zinc-300">공급사 없음</div>
            ) : (
              <div className="divide-y divide-zinc-50">
                {filteredVendors.map(v => {
                  // 2026-08-09 · 4컬럼 재구성 · 총재고자산·총판매액·총결제액·총잔고
                  const lb = (v as any).latestBalance as { balance: number; total_purchase?: number; total_payment?: number; invoice_date?: string | null } | null | undefined;
                  const bal = Number(lb?.balance ?? 0);
                  const hasBal = lb != null && bal !== 0;
                  const payAmt = paymentByVendor.get(v.company_name) ?? 0;
                  const salesAmt = salesByVendor.get(v.company_name) ?? 0;
                  const stockAmt = stockValueByVendor.get(v.company_name) ?? 0;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVendor(prev => prev?.id === v.id ? null : v)}
                      className={`w-full text-left px-2 py-2.5 flex items-center gap-1.5 transition cursor-pointer ${
                        selectedVendor?.id === v.id
                          ? "bg-sky-50 border-l-2 border-sky-500"
                          : "hover:bg-zinc-50 border-l-2 border-transparent"
                      }`}
                    >
                      <span className="w-[42px] shrink-0"><VendorCategoryBadge category={v.category} /></span>
                      {/* VAT · 텍스트 · 2026-08-06 · 배지 → 깔끔한 텍스트 */}
                      <span className="w-[42px] shrink-0 text-center">
                        {(() => {
                          const nm = v.company_name ?? "";
                          const hint = /vat\s*(미포함|별도|없음)/i.test(nm);
                          const eff = v.vat_included === false ? false : v.vat_included === true ? true : hint ? false : true;
                          return eff
                            ? <span className="text-[14px] font-semibold text-emerald-700">포함</span>
                            : <span className="text-[14px] font-semibold text-zinc-500">별도</span>;
                        })()}
                      </span>
                      <span className={`text-[14px] font-semibold break-words whitespace-normal leading-tight flex-1 min-w-0 ${
                        selectedVendor?.id === v.id ? "text-sky-800" : "text-zinc-700"
                      }`}>
                        {v.company_name}
                      </span>
                      {/* 2026-08-09 · 4컬럼 재구성 (사용자 요청) · 총재고자산·총판매액·총결제액·총잔고 */}
                      <span className={`w-[62px] text-right text-[15px] font-bold tabular-nums shrink-0 ${
                        stockAmt > 0 ? "text-teal-700" : "text-zinc-300"
                      }`} title={stockAmt > 0 ? `총재고자산 · 최근 3개월 ${stockAmt.toLocaleString()}원` : "재고 없음"}>
                        {stockAmt > 0 ? fmtWonShort(stockAmt) : "-"}
                      </span>
                      <span className={`w-[58px] text-right text-[15px] font-bold tabular-nums shrink-0 ${
                        salesAmt > 0 ? "text-indigo-700" : "text-zinc-300"
                      }`} title={salesAmt > 0 ? `최근 3개월 총판매 ${salesAmt.toLocaleString()}원` : "판매 없음"}>
                        {salesAmt > 0 ? fmtWonShort(salesAmt) : "-"}
                      </span>
                      <span className={`w-[58px] text-right text-[15px] font-bold tabular-nums shrink-0 ${
                        payAmt > 0 ? "text-sky-700" : "text-zinc-300"
                      }`} title={payAmt > 0 ? `최근 ${periodDays}일 총결제 ${payAmt.toLocaleString()}원` : "결제 없음"}>
                        {payAmt > 0 ? fmtWonShort(payAmt) : "-"}
                      </span>
                      <span className={`w-[58px] text-right text-[15px] font-bold tabular-nums shrink-0 ${
                        hasBal
                          ? bal > 0 ? "text-amber-700" : "text-rose-700"
                          : "text-zinc-300"
                      }`} title={hasBal ? `${bal > 0 ? "미결제" : "초과결제"} ${Math.abs(bal).toLocaleString()}원` : "잔고 없음"}>
                        {hasBal ? fmtWonShort(Math.abs(bal)) : "-"}
                      </span>
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
          /* 2026-08-09 · 모바일 모달 세로 스크롤 fix · 우측 컨텐츠 자체 overflow 제거 · SplitPanel 모달바디가 처리
             기존 overflow-y-auto lg:overflow-hidden → nested scroll 로 모달 스크롤 안 됨 */
          <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2 lg:overflow-hidden">
          {!selectedVendor ? (
            <div className={`${CARD_BASE} flex-1 min-h-[400px]`}>
              <EmptyState icon={Wallet} title="결제 등록 · 공급사를 선택하세요" hint="좌측 공급사 리스트에서 대상 선택 후 결제 정보를 입력합니다" />
            </div>
          ) : (
            <>
              {/* ── 공급사 요약 카드 (T-COMMON-VendorInfo · VendorInfoHeader 위임) ── */}
              <div className="bg-white rounded-2xl border border-line shadow-sm p-4 flex flex-col gap-2.5">
                <VendorInfoHeader
                  vendor={selectedVendor}
                  onEdit={() => openVendorInfo(selectedVendor as any)}
                />

                {/* 2026-08-09 · 7행 표 (사용자 요청) · 헤더 + 6데이터 (공급사정보 3 · 판매정보 3) + 행합계
                    · 공급사정보: 매입 / 결제 / 잔고 (purchase_details − supplier_payments)
                    · 판매정보: 매입 / 판매액 / 실재고액 (stock_history · 프록시)
                    · 컬럼: 월별 (breakdownMonths) + 맨 오른쪽 행합계
                    · 상단 PeriodSelector · 3/6/12개월 */}
                {(() => {
                  const months = salesStockBreakdown?.months ?? recentMonthKeys(breakdownMonths);
                  const purMap = salesStockBreakdown?.purchases ?? {};
                  const payMap = salesStockBreakdown?.payments ?? {};
                  const salesMap = salesStockBreakdown?.sales ?? {};
                  const stockMap = salesStockBreakdown?.stockValue ?? {};
                  // 월별 잔고 = 월별 매입 - 월별 결제
                  const balMap: Record<string, number> = {};
                  for (const k of months) balMap[k] = (purMap[k] ?? 0) - (payMap[k] ?? 0);
                  const totals = salesStockBreakdown?.totals ?? { purchases: 0, payments: 0, balance: 0, sales: 0, stockValue: 0 };
                  const fmt = (n: number) => n === 0 ? "-" : fmtWonShort(n);
                  const showLoading = salesStockLoading || balanceLoading;
                  return (
                    <div className="overflow-hidden rounded-lg border border-line shadow-xs">
                      {/* 상단 · 제목 + PeriodSelector */}
                      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50/80 border-b border-line">
                        <span className="text-[15px] font-bold text-zinc-700">월별 요약</span>
                        <PeriodSelector
                          options={PERIOD_MONTHS_PRESET}
                          value={breakdownMonths}
                          onChange={(v) => setBreakdownMonths(v as number)}
                          accent="teal"
                          size="sm"
                          className="ml-auto"
                          ariaLabel="월별 요약 기간 선택"
                        />
                        {showLoading && <Loader2 size={11} className="animate-spin text-zinc-400" />}
                      </div>
                      <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-[14px] tabular-nums">
                        <thead className="bg-zinc-50/80 text-[15px] font-bold uppercase tracking-wider text-zinc-500">
                          <tr>
                            <th className="text-center px-2 py-1.5 w-[56px] border-r border-line">카테고리</th>
                            <th className="text-left px-2 py-1.5 w-[64px]">항목</th>
                            {months.map(k => (
                              <th key={k} className="text-right px-2 py-1.5 whitespace-nowrap">
                                <span className="inline-flex flex-col items-end leading-tight">
                                  <span className="text-zinc-400 text-[15px]">{k.slice(0, 4)}</span>
                                  <span>{fmtMonthShort(k)}</span>
                                </span>
                              </th>
                            ))}
                            <th className="text-right px-2 py-1.5 whitespace-nowrap text-zinc-700 border-l border-line bg-zinc-50/40">
                              <span className="inline-flex items-center gap-1 justify-end"><Layers size={11} />합계</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {/* ── 공급사 카테고리 · 매입/결제/실잔고 (원복 · 사용자 요청) ── */}
                          <tr className="bg-white">
                            <td rowSpan={3} className="text-center px-2 py-1.5 font-bold text-zinc-600 bg-emerald-50/40 border-r border-line align-middle">
                              공급사
                            </td>
                            <td className="px-2 py-1.5 font-bold text-emerald-700 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1"><ReceiptText size={11} />매입</span>
                            </td>
                            {months.map(k => (
                              <td key={k} className={`px-2 py-1.5 text-right font-bold ${(purMap[k] ?? 0) === 0 ? "text-zinc-300" : "text-emerald-800"}`}>
                                {fmt(purMap[k] ?? 0)}
                              </td>
                            ))}
                            <td className="px-2 py-1.5 text-right font-bold text-emerald-800 border-l border-line bg-zinc-50/40">{fmt(totals.purchases)}</td>
                          </tr>
                          <tr className="bg-zinc-50/40">
                            <td className="px-2 py-1.5 font-bold text-sky-700 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1"><Wallet size={11} />결제</span>
                            </td>
                            {months.map(k => (
                              <td key={k} className={`px-2 py-1.5 text-right font-bold ${(payMap[k] ?? 0) === 0 ? "text-zinc-300" : "text-sky-800"}`}>
                                {fmt(payMap[k] ?? 0)}
                              </td>
                            ))}
                            <td className="px-2 py-1.5 text-right font-bold text-sky-800 border-l border-line bg-zinc-50/40">{fmt(totals.payments)}</td>
                          </tr>
                          <tr className="bg-white">
                            <td className="px-2 py-1.5 font-bold text-amber-700 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1"><Coins size={11} />실잔고</span>
                            </td>
                            {months.map(k => {
                              const v = balMap[k] ?? 0;
                              return (
                                <td key={k} className={`px-2 py-1.5 text-right font-bold ${
                                  v === 0 ? "text-zinc-300" : v > 0 ? "text-amber-700" : "text-rose-700"
                                }`}>
                                  {v === 0 ? "-" : (v > 0 ? "" : "-") + fmtWonShort(Math.abs(v))}
                                </td>
                              );
                            })}
                            <td className={`px-2 py-1.5 text-right font-bold border-l border-line bg-amber-50/60 ${
                              totals.balance > 0 ? "text-amber-700" : totals.balance < 0 ? "text-rose-700" : "text-zinc-500"
                            }`}>
                              {totals.balance === 0 ? "0" : (totals.balance > 0 ? "" : "-") + fmtWonShort(Math.abs(totals.balance))}
                            </td>
                          </tr>
                          {/* ── 판매 카테고리 · 매입/판매액/실재고액 · 구분선 (border-t 강조) ── */}
                          <tr className="bg-white border-t-2 border-zinc-300">
                            <td rowSpan={3} className="text-center px-2 py-1.5 font-bold text-zinc-600 bg-indigo-50/40 border-r border-line align-middle">
                              판매
                            </td>
                            <td className="px-2 py-1.5 font-bold text-emerald-700 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1"><ReceiptText size={11} />매입</span>
                            </td>
                            {months.map(k => (
                              <td key={k} className={`px-2 py-1.5 text-right font-bold ${(purMap[k] ?? 0) === 0 ? "text-zinc-300" : "text-emerald-800"}`}>
                                {fmt(purMap[k] ?? 0)}
                              </td>
                            ))}
                            <td className="px-2 py-1.5 text-right font-bold text-emerald-800 border-l border-line bg-zinc-50/40">{fmt(totals.purchases)}</td>
                          </tr>
                          <tr className="bg-zinc-50/40">
                            <td className="px-2 py-1.5 font-bold text-indigo-700 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1"><Package2 size={11} />판매액</span>
                            </td>
                            {months.map(k => (
                              <td key={k} className={`px-2 py-1.5 text-right font-bold ${(salesMap[k] ?? 0) === 0 ? "text-zinc-300" : "text-indigo-800"}`}>
                                {fmt(salesMap[k] ?? 0)}
                              </td>
                            ))}
                            <td className="px-2 py-1.5 text-right font-bold text-indigo-800 border-l border-line bg-zinc-50/40">{fmt(totals.sales)}</td>
                          </tr>
                          <tr className="bg-white">
                            <td className="px-2 py-1.5 font-bold text-rose-700 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1"><Layers size={11} />실재고액</span>
                            </td>
                            {/* 2026-08-09 · 사용자 지시 · 실재고액 = 실재고 × 매입단가 합계 (현재값 · 붉은색 톤)
                                월별 스냅샷 아님 · 각 월 컬럼 dash · 합계 컬럼에 현재값 표시 */}
                            {months.map(k => (
                              <td key={k} className="px-2 py-1.5 text-right text-zinc-300">-</td>
                            ))}
                            <td className={`px-2 py-1.5 text-right font-bold border-l border-line bg-rose-50/60 ${
                              totals.stockValue > 0 ? "text-rose-700" : "text-zinc-400"
                            }`}>
                              {totals.stockValue === 0 ? "-" : fmtWonShort(totals.stockValue)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* 결제 입력 + 최근 결제 내역 · 좌우 분할 · 반응형 stack (2026-08-04 · xl 이상만 2열) */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">

              {/* ── 결제 입력 폼 (리디자인 · 깔끔·세련 · 2026-08-04) ── */}
              <div className="bg-white rounded-2xl border border-line shadow-sm overflow-hidden flex flex-col">

                {/* 폼 헤더 */}
                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-zinc-100 bg-emerald-50/60 shrink-0">
                  <div className="w-7 h-7 rounded-xl bg-emerald-100 flex items-center justify-center ring-1 ring-emerald-200 shrink-0">
                    <Plus size={14} className="text-emerald-700" strokeWidth={2.5} />
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="text-[15px] font-bold text-zinc-800">결제 등록</span>
                    <span className="text-[14px] text-zinc-400">{selectedVendor?.company_name}</span>
                  </div>
                  {vatIncluded && (
                    <span className="ml-auto text-[14px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 shrink-0">
                      VAT 포함가
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-0 divide-y divide-zinc-50">

                  {/* ── 그룹 A · 날짜 + 결제방법 ──────────────────── */}
                  <div className="px-4 py-3 flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      {/* 결제일 */}
                      <FieldLabel label="결제일" icon={<CalendarDays size={11} />} required>
                        <div className="flex items-center gap-1.5">
                          <input
                            ref={paymentDateRef}
                            type="date"
                            value={paymentDate}
                            onChange={e => setPaymentDate(e.target.value)}
                            className={`${inputCls} flex-1 min-w-0 px-2 [&::-webkit-calendar-picker-indicator]:hidden`}
                          />
                          <button
                            type="button"
                            onClick={openDatePicker}
                            title="달력 열기"
                            aria-label="달력 열기"
                            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-white hover:bg-emerald-50 hover:border-emerald-400 text-zinc-400 hover:text-emerald-600 transition cursor-pointer shrink-0"
                          >
                            <Calendar size={13} strokeWidth={2.25} />
                          </button>
                        </div>
                      </FieldLabel>

                      {/* 결제방법 */}
                      <FieldLabel label="결제 방법" required>
                        <div className="flex items-center gap-1.5">
                          {METHOD_OPTIONS.map(opt => (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => setMethod(opt.key)}
                              className={`flex-1 h-9 rounded-lg text-[15px] font-bold border transition cursor-pointer ${
                                method === opt.key
                                  ? opt.key === "card"
                                    ? "bg-brand-deep border-indigo-600 text-white shadow-sm"
                                    : opt.key === "cash"
                                    ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                                    : "bg-zinc-600 border-zinc-600 text-white shadow-sm"
                                  : "bg-white border-line text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </FieldLabel>
                    </div>

                    {/* sub-option + 결제금액 · 같은 줄 flex row (2026-08-04 · #102)
                        · card/cash/etc 각각 좌측(flex-1) · 결제금액 우측(flex-1)
                        · sub-option 없을 때(etc 텍스트 포함) 결제금액 full width */}
                    {/* card: 카드사 선택 (좌) + 결제금액 (우) */}
                    {method === "card" && (
                      <div className="flex items-end gap-3">
                        <div className="flex-1 min-w-0">
                          {cardIssuer === "직접입력" ? (
                            <FieldLabel label="카드사명 직접입력">
                              <input
                                type="text"
                                value={cardIssuerCustom}
                                onChange={e => setCardIssuerCustom(e.target.value)}
                                placeholder="카드사 이름"
                                className={inputCls}
                              />
                            </FieldLabel>
                          ) : (
                            <FieldLabel label="카드사">
                              <select
                                value={cardIssuer}
                                onChange={e => setCardIssuer(e.target.value)}
                                className={inputCls}
                              >
                                <option value="">카드사 선택...</option>
                                {CARD_ISSUERS.map(c => <option key={c} value={c}>{c}</option>)}
                                <option value="직접입력">직접 입력...</option>
                              </select>
                            </FieldLabel>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <AmountField
                            amount={amount}
                            setAmount={setAmount}
                            inputCls={inputCls}
                            overBalance={overBalance}
                            currentBalance={currentBalance}
                          />
                        </div>
                      </div>
                    )}
                    {/* cash: 은행 선택 (좌) + 결제금액 (우) */}
                    {method === "cash" && (
                      <div className="flex items-end gap-3">
                        <div className="flex-1 min-w-0">
                          {bankName === "직접입력" ? (
                            <FieldLabel label="은행명 직접입력">
                              <input
                                type="text"
                                value={bankNameCustom}
                                onChange={e => setBankNameCustom(e.target.value)}
                                placeholder="은행 이름"
                                className={inputCls}
                              />
                            </FieldLabel>
                          ) : (
                            <FieldLabel label="은행">
                              <select
                                value={bankName}
                                onChange={e => setBankName(e.target.value)}
                                className={inputCls}
                              >
                                <option value="">은행 선택...</option>
                                {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                                <option value="직접입력">직접 입력...</option>
                              </select>
                            </FieldLabel>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <AmountField
                            amount={amount}
                            setAmount={setAmount}
                            inputCls={inputCls}
                            overBalance={overBalance}
                            currentBalance={currentBalance}
                          />
                        </div>
                      </div>
                    )}
                    {/* etc: 결제방법 설명 (좌) + 결제금액 (우) */}
                    {method === "etc" && (
                      <div className="flex items-end gap-3">
                        <div className="flex-1 min-w-0">
                          <FieldLabel label="결제 방법 설명">
                            <input
                              type="text"
                              value={etcNote}
                              onChange={e => setEtcNote(e.target.value)}
                              placeholder="예: 페이코 · 카카오페이 · 상계 · 어음 등"
                              className={inputCls}
                            />
                          </FieldLabel>
                        </div>
                        <div className="flex-1 min-w-0">
                          <AmountField
                            amount={amount}
                            setAmount={setAmount}
                            inputCls={inputCls}
                            overBalance={overBalance}
                            currentBalance={currentBalance}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── 그룹 B · VAT 분리 표시 + 초과 경고 ────────────── */}
                  {(amountNum > 0 || overBalance) && (
                  <div className="px-4 pb-3 -mt-1">
                    <div className={`rounded-lg px-3 py-2 flex flex-col gap-1 ${overBalance ? "bg-amber-50 border border-amber-200" : "bg-zinc-50 border border-zinc-100"}`}>
                      {amountNum > 0 && taxInvoiceIssued && (
                        <div className="flex items-center justify-between text-[15px] tabular-nums">
                          <span className="text-zinc-500">공급가액</span>
                          <span className="font-bold text-zinc-700">{supplyAmt.toLocaleString()}원</span>
                        </div>
                      )}
                      {amountNum > 0 && taxInvoiceIssued && (
                        <div className="flex items-center justify-between text-[15px] tabular-nums">
                          <span className="text-zinc-500">부가세 (10%)</span>
                          <span className="font-bold text-teal-700">{vatAmt.toLocaleString()}원</span>
                        </div>
                      )}
                      {amountNum > 0 && !taxInvoiceIssued && (
                        <div className="text-[14px] text-zinc-400">세금계산서 체크 시 VAT 자동 분리</div>
                      )}
                      {overBalance && (
                        <div className="flex items-center gap-1 text-[15px] font-bold text-amber-700">
                          <span>잔고 초과</span>
                          <span className="tabular-nums text-amber-600">({fmtWonShort(currentBalance)} 잔고)</span>
                        </div>
                      )}
                    </div>
                  </div>
                  )}

                  {/* ── 그룹 C · 세금계산서 (접이식 토글) ────────────── */}
                  <div className="px-4 py-3">
                    <label className={`flex items-center gap-2.5 cursor-pointer group`}>
                      <div className={`relative w-8 h-4.5 rounded-full transition-colors shrink-0 ${taxInvoiceIssued ? "bg-teal-500" : "bg-zinc-200"}`}
                        style={{ height: "18px" }}>
                        <input
                          type="checkbox"
                          checked={taxInvoiceIssued}
                          onChange={e => setTaxInvoiceIssued(e.target.checked)}
                          className="sr-only"
                        />
                        <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${taxInvoiceIssued ? "translate-x-4" : "translate-x-0.5"}`} />
                      </div>
                      <div className="flex flex-col leading-tight">
                        <span className={`text-[14px] font-bold transition ${taxInvoiceIssued ? "text-teal-700" : "text-zinc-600 group-hover:text-zinc-800"}`}>
                          세금계산서 발행
                        </span>
                        {!taxInvoiceIssued && (
                          <span className="text-[14px] text-zinc-400">활성화 시 공급가액·VAT 자동 계산</span>
                        )}
                      </div>
                      {taxInvoiceIssued && amountNum > 0 && (
                        <span className="ml-auto text-[14px] font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-md px-2 py-0.5 tabular-nums shrink-0">
                          VAT {vatAmt.toLocaleString()}원
                        </span>
                      )}
                    </label>
                  </div>

                  {/* ── 그룹 D · 메모 ──────────────────────────────── */}
                  <div className="px-4 py-3">
                    <FieldLabel label="메모 (선택)">
                      <textarea
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        placeholder="6월분 결제 · 부분 결제 · 특이사항 등"
                        rows={2}
                        className={`${inputCls} py-2 resize-none leading-snug`}
                      />
                    </FieldLabel>
                  </div>

                </div>{/* divide-y wrapper close */}

                {/* ── 상태 메시지 + 저장 버튼 ────────────────────── */}
                <div className="px-4 py-3 border-t border-zinc-100 bg-zinc-50/50 flex items-center gap-2 shrink-0">
                  {msg && (
                    <span className={`inline-flex items-center gap-1 text-[14px] font-bold ${
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
                    className="inline-flex items-center gap-1.5 h-9 px-6 rounded-xl bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] active:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[14px] font-bold shadow-sm hover:shadow-md transition-all cursor-pointer"
                  >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
                    {saving ? "등록 중..." : "결제 등록"}
                  </button>
                </div>
              </div>

              {/* ── 최근 결제 내역 ───────────────────────────── */}
              <div className="bg-white rounded-2xl border border-line shadow-sm p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 pb-1 border-b border-zinc-100">
                  {/* 2026-08-18 · IconTile 확산 */}
                  <IconTile icon={<ReceiptText size={13} strokeWidth={2.5} />} tone="sky" size="sm" />

                  <div className="text-[15px] font-bold text-zinc-800">최근 결제 내역</div>
                  <span className="ml-auto text-[15px] text-zinc-400 tabular-nums">
                    {recentLoading ? "로딩..." : `${recentPayments.length}건 (최근)`}
                  </span>
                  <button
                    type="button"
                    onClick={() => selectedVendor && loadRecentPayments(selectedVendor.company_name)}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-line hover:bg-zinc-50 text-zinc-500 transition"
                    title="새로고침"
                  >
                    <RefreshCw size={12} className={recentLoading ? "animate-spin" : ""} />
                  </button>
                </div>

                {recentLoading ? (
                  <div className="flex items-center justify-center py-8 text-zinc-400 gap-2 text-[14px]">
                    <Loader2 size={13} className="animate-spin" />불러오는 중...
                  </div>
                ) : recentPayments.length === 0 ? (
                  <div className="py-8 text-center text-[15px] text-zinc-300">결제 이력 없음</div>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {recentPayments.map(p => {
                      const tone = methodTone(p.method);
                      const meta = p.meta ?? {};
                      const subLabel =
                        meta.card_issuer ? meta.card_issuer :
                        meta.bank_name   ? meta.bank_name :
                        null;
                      return (
                        <div key={p.id} className="py-2 flex items-center gap-3 hover:bg-zinc-50/60 -mx-2 px-2 rounded transition">
                          <span className={`inline-flex items-center justify-center w-14 h-8 rounded-lg text-[14px] font-bold ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}>
                            {methodLabel(p.method)}
                          </span>
                          <div className="flex-1 min-w-0 flex flex-col leading-tight gap-0.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[15px] font-bold text-zinc-700 tabular-nums shrink-0">
                                {p.payment_date}
                              </span>
                              {subLabel && (
                                <span className="text-[14px] font-semibold text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-50 border border-line truncate">
                                  {subLabel}
                                </span>
                              )}
                              {meta.tax_invoice_issued && (
                                <span className="text-[15px] font-bold text-teal-700 px-1 py-0.5 rounded bg-teal-50 border border-teal-200 shrink-0">
                                  세금계산서
                                </span>
                              )}
                            </div>
                            {(p.memo || meta.reference_no) && (
                              <div className="text-[14px] text-zinc-500 truncate flex items-center gap-1">
                                {meta.reference_no && (
                                  <span className="inline-flex items-center gap-0.5 text-zinc-400 tabular-nums">
                                    <ArrowRight size={9} />{meta.reference_no}
                                  </span>
                                )}
                                {p.memo && <span className="truncate">{p.memo}</span>}
                              </div>
                            )}
                          </div>
                          <span className="text-[15px] font-bold text-emerald-700 tabular-nums shrink-0">
                            -{p.amount.toLocaleString()}
                          </span>
                          {/* 결제 후 잔고 · Task #104 (2026-08-04)
                              · ledger running_balance · 양수=미결(amber) · 0=완납(slate) · 음수=초과(rose)
                              · feedback_ui_principles B-2-2 · 12px · tabular-nums */}
                          {p.running_balance != null && (
                            <span
                              className={`text-[14px] font-bold tabular-nums shrink-0 min-w-[64px] text-right ${
                                p.running_balance > 0
                                  ? "text-amber-700"
                                  : p.running_balance < 0
                                  ? "text-rose-700"
                                  : "text-zinc-400"
                              }`}
                              title={`결제 후 잔고 · ${p.running_balance.toLocaleString()}원`}
                            >
                              {p.running_balance === 0
                                ? "완납"
                                : (p.running_balance > 0 ? "" : "-") + fmtWonShort(Math.abs(p.running_balance))}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              </div>{/* 결제입력+최근결제내역 grid wrapper close */}

              {/* T11 · 상품별 매입 요약 (2026-08-04 · 이 공급사에서 매입한 상품별 집계) */}
              {productSummary.length > 0 && (
                <div className="bg-white rounded-2xl border border-line shadow-sm">
                  <button
                    type="button"
                    onClick={() => setShowProductGroup(v => !v)}
                    className="w-full flex items-center gap-2 p-4 pb-2 border-b border-zinc-100 hover:bg-zinc-50/50 transition cursor-pointer"
                  >
                    {/* 2026-08-18 · IconTile 확산 */}
                    <IconTile icon={<Layers size={13} strokeWidth={2.5} />} tone="emerald" size="sm" />

                    <div className="text-[15px] font-bold text-zinc-800">상품별 매입 요약</div>
                    <span className="text-[15px] font-semibold text-zinc-400 tabular-nums">
                      · {productSummary.length}개 상품 · 최근 1년
                    </span>
                    <span className="ml-auto text-[14px] font-bold text-zinc-400">{showProductGroup ? "접기 ▲" : "펼치기 ▼"}</span>
                  </button>
                  {showProductGroup && (
                    <div className="p-2 overflow-x-auto">
                      <table className="w-full text-[14px] tabular-nums" style={{ tableLayout: "fixed" }}>
                        <thead className="bg-zinc-50 text-[14px] font-bold uppercase tracking-wider text-zinc-500">
                          <tr>
                            <th
                              onClick={() => toggleProdSort("product_name")}
                              title="상품명 정렬"
                              className="relative text-left px-2 py-1.5 cursor-pointer select-none hover:bg-emerald-50/60 transition"
                              style={{ width: pw("name"), minWidth: pw("name") }}
                            >
                              상품명
                              {prodSortKey === "product_name"
                                ? (prodSortDir === "asc"
                                    ? <ChevronUp size={9} strokeWidth={3} className="inline-block align-middle ml-0.5 text-emerald-600" />
                                    : <ChevronDown size={9} strokeWidth={3} className="inline-block align-middle ml-0.5 text-emerald-600" />)
                                : <ChevronsUpDown size={9} strokeWidth={2.25} className="inline-block align-middle ml-0.5 text-zinc-300" />}
                              <span {...pr("name")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                            </th>
                            <th
                              onClick={() => toggleProdSort("product_code")}
                              title="코드 정렬"
                              className="relative text-left px-2 py-1.5 cursor-pointer select-none hover:bg-emerald-50/60 transition"
                              style={{ width: pw("code"), minWidth: pw("code") }}
                            >
                              코드
                              {prodSortKey === "product_code"
                                ? (prodSortDir === "asc"
                                    ? <ChevronUp size={9} strokeWidth={3} className="inline-block align-middle ml-0.5 text-emerald-600" />
                                    : <ChevronDown size={9} strokeWidth={3} className="inline-block align-middle ml-0.5 text-emerald-600" />)
                                : <ChevronsUpDown size={9} strokeWidth={2.25} className="inline-block align-middle ml-0.5 text-zinc-300" />}
                              <span {...pr("code")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                            </th>
                            <th
                              onClick={() => toggleProdSort("totalQty")}
                              title="총 수량 정렬"
                              className="relative text-right px-2 py-1.5 cursor-pointer select-none hover:bg-emerald-50/60 transition"
                              style={{ width: pw("qty"), minWidth: pw("qty") }}
                            >
                              총 수량
                              {prodSortKey === "totalQty"
                                ? (prodSortDir === "asc"
                                    ? <ChevronUp size={9} strokeWidth={3} className="inline-block align-middle ml-0.5 text-emerald-600" />
                                    : <ChevronDown size={9} strokeWidth={3} className="inline-block align-middle ml-0.5 text-emerald-600" />)
                                : <ChevronsUpDown size={9} strokeWidth={2.25} className="inline-block align-middle ml-0.5 text-zinc-300" />}
                              <span {...pr("qty")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                            </th>
                            <th
                              onClick={() => toggleProdSort("totalAmount")}
                              title="총 매입액 정렬"
                              className="relative text-right px-2 py-1.5 cursor-pointer select-none hover:bg-emerald-50/60 transition"
                              style={{ width: pw("amount"), minWidth: pw("amount") }}
                            >
                              총 매입액
                              {prodSortKey === "totalAmount"
                                ? (prodSortDir === "asc"
                                    ? <ChevronUp size={9} strokeWidth={3} className="inline-block align-middle ml-0.5 text-emerald-600" />
                                    : <ChevronDown size={9} strokeWidth={3} className="inline-block align-middle ml-0.5 text-emerald-600" />)
                                : <ChevronsUpDown size={9} strokeWidth={2.25} className="inline-block align-middle ml-0.5 text-zinc-300" />}
                              <span {...pr("amount")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                            </th>
                            <th
                              onClick={() => toggleProdSort("invoiceCount")}
                              title="건수 정렬"
                              className="relative text-center px-2 py-1.5 cursor-pointer select-none hover:bg-emerald-50/60 transition"
                              style={{ width: pw("count"), minWidth: pw("count") }}
                            >
                              건수
                              {prodSortKey === "invoiceCount"
                                ? (prodSortDir === "asc"
                                    ? <ChevronUp size={9} strokeWidth={3} className="inline-block align-middle ml-0.5 text-emerald-600" />
                                    : <ChevronDown size={9} strokeWidth={3} className="inline-block align-middle ml-0.5 text-emerald-600" />)
                                : <ChevronsUpDown size={9} strokeWidth={2.25} className="inline-block align-middle ml-0.5 text-zinc-300" />}
                              <span {...pr("count")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                            </th>
                            <th
                              onClick={() => toggleProdSort("latestDate")}
                              title="최근 매입일 정렬"
                              className="relative text-right px-2 py-1.5 cursor-pointer select-none hover:bg-emerald-50/60 transition"
                              style={{ width: pw("last_date"), minWidth: pw("last_date") }}
                            >
                              최근 매입일
                              {prodSortKey === "latestDate"
                                ? (prodSortDir === "asc"
                                    ? <ChevronUp size={9} strokeWidth={3} className="inline-block align-middle ml-0.5 text-emerald-600" />
                                    : <ChevronDown size={9} strokeWidth={3} className="inline-block align-middle ml-0.5 text-emerald-600" />)
                                : <ChevronsUpDown size={9} strokeWidth={2.25} className="inline-block align-middle ml-0.5 text-zinc-300" />}
                              <span {...pr("last_date")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {sortedProductSummary.slice(0, 100).map((p) => (
                            <tr key={p.product_code || p.product_name} className="hover:bg-emerald-50/40">
                              <td className="px-2 py-1.5 font-semibold text-zinc-700 truncate max-w-[220px]" title={p.product_name}>{p.product_name}</td>
                              <td className="px-2 py-1.5 text-zinc-400 font-mono text-[15px]">{p.product_code || "-"}</td>
                              <td className="px-2 py-1.5 text-right font-bold text-zinc-700">{p.totalQty.toLocaleString()}</td>
                              <td className="px-2 py-1.5 text-right font-bold text-emerald-700">{fmtWonShort(p.totalAmount)}</td>
                              <td className="px-2 py-1.5 text-center text-zinc-500">{p.invoiceCount}</td>
                              <td className="px-2 py-1.5 text-right text-zinc-500 whitespace-nowrap">{p.latestDate}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {productSummary.length > 100 && (
                        <div className="text-[14px] text-zinc-400 text-center py-1.5">
                          상위 100개 표시 (전체 {productSummary.length}개)
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          </div>
        }
      />
    </div>
    {/* 공급사 상세 모달 (T-COMMON-VendorInfoModal) */}
    {vendorModalElement}
    </>
  );
};

// ─── UI Helpers ─────────────────────────────────────────────────────────────

// 결제 금액 입력 필드 · 재사용 헬퍼 (2026-08-04 · #102)
// · value: 숫자 string → toLocaleString 쉼표 표시 (e.g. "1500000" → "1,500,000")
// · onChange: 비숫자 제거 후 숫자 string 저장
// · 쉼표 자동입력 검증: onChange에서 replace(/[^0-9]/g,"") 처리 후 amount는 항상 순수 숫자
//   → Number(amount)는 절대 NaN이 될 수 없음 · amount === "" 시 조건문으로 빈 문자열 유지
const AmountField: React.FC<{
  amount: string;
  setAmount: (v: string) => void;
  inputCls: string;
  overBalance: boolean;
  currentBalance: number;
}> = ({ amount, setAmount, inputCls, overBalance, currentBalance }) => (
  <FieldLabel label="결제 금액" icon={<Wallet size={11} />} required>
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[15px] font-bold text-zinc-400 select-none">₩</span>
      <input
        type="text"
        inputMode="numeric"
        value={amount ? Number(amount).toLocaleString() : ""}
        onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder="0"
        className={`${inputCls} pl-7 pr-[52px] text-right tabular-nums font-bold text-[14px] ${overBalance ? "border-amber-400 focus:ring-brand-tint focus:border-brand-deep" : ""}`}
      />
      {currentBalance > 0 && !amount && (
        <button
          type="button"
          onClick={() => setAmount(String(Math.round(currentBalance)))}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 px-2 text-[14px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition cursor-pointer"
          title="현재 잔고 전액"
        >
          전액
        </button>
      )}
    </div>
  </FieldLabel>
);

// ─── 좌측 리스트 헤더 · 자동 정렬 · Task #103 (2026-08-04) ─────────────────
//   커스텀 header (div 기반 · 리스트 row 도 div/button 이라 일관성 유지)
//   feedback_ui_principles A-2 · 자동 정렬 · B-2-2 · 12px+
//   컬럼 폭 · row 와 정확 일치 (분류 42 · 이름 flex · 매입 52 · 결제 52 · 잔고 56)
const SortHeaderBtn: React.FC<{
  label: string;
  columnKey: VendorSortKey;
  activeKey: VendorSortKey;
  activeDir: SortDir;
  onSort: (k: VendorSortKey) => void;
  className?: string;
  align?: "left" | "right";
  title?: string;
}> = ({ label, columnKey, activeKey, activeDir, onSort, className = "", align = "right", title }) => {
  const active = columnKey === activeKey;
  const alignCls = align === "right" ? "justify-end text-right" : "justify-start text-left";
  return (
    <button
      type="button"
      onClick={() => onSort(columnKey)}
      title={title ?? `${label} · 클릭하여 정렬`}
      className={`inline-flex items-center gap-0.5 ${alignCls} h-full transition cursor-pointer select-none ${
        active ? "text-zinc-800" : "text-zinc-500 hover:text-zinc-700"
      } ${className}`}
    >
      <span>{label}</span>
      {active
        ? (activeDir === "asc"
            ? <ChevronUp size={11} strokeWidth={3} className="shrink-0" />
            : <ChevronDown size={11} strokeWidth={3} className="shrink-0" />)
        : <ChevronsUpDown size={10} strokeWidth={2.25} className="opacity-30 shrink-0" />
      }
    </button>
  );
};

const VendorListHeader: React.FC<{
  sortKey: VendorSortKey;
  sortDir: SortDir;
  onSort: (k: VendorSortKey) => void;
  count: number;
  loading?: boolean;
}> = ({ sortKey, sortDir, onSort, count, loading = false }) => (
  <div className="px-2 py-1.5 border-b border-line bg-zinc-50/70 shrink-0 flex items-center gap-1.5 text-[15px] font-bold uppercase tracking-wider">
    {/* 분류 · 정렬 X (badge column) */}
    <span className="w-[42px] shrink-0 text-zinc-400">분류</span>
    {/* VAT · 포함/불포함 · 2026-08-06 · 사용자 요청 */}
    <span className="w-[36px] shrink-0 text-zinc-400 text-center">VAT</span>
    {/* 공급사명 · flex · 로딩 시 · "로딩중" 표시 (2026-08-09) */}
    <span className="flex-1 min-w-0 flex items-center gap-1.5">
      <SortHeaderBtn label={`공급사 (${count})`} columnKey="name" activeKey={sortKey} activeDir={sortDir} onSort={onSort} align="left" />
      {loading && (
        <span className="inline-flex items-center gap-1 text-[14px] font-bold text-sky-600 normal-case shrink-0">
          <Loader2 size={10} className="animate-spin" />로딩중
        </span>
      )}
    </span>
    {/* 2026-08-09 · 4컬럼 재구성 (사용자 요청 · 총재고자산·총판매액·총결제액·총잔고) */}
    <span className="w-[62px] shrink-0">
      <SortHeaderBtn label="총재고자산" columnKey="stockValue" activeKey={sortKey} activeDir={sortDir} onSort={onSort} align="right" className="w-full text-teal-700" title="총재고자산 · stock_history 최근 3개월 · 클릭하여 정렬" />
    </span>
    <span className="w-[58px] shrink-0">
      <SortHeaderBtn label="총판매액" columnKey="sales" activeKey={sortKey} activeDir={sortDir} onSort={onSort} align="right" className="w-full text-indigo-700" title="최근 3개월 총판매 · stock_history · 클릭하여 정렬" />
    </span>
    <span className="w-[58px] shrink-0">
      <SortHeaderBtn label="총결제액" columnKey="payment" activeKey={sortKey} activeDir={sortDir} onSort={onSort} align="right" className="w-full text-sky-700" title="선택 기간 내 총결제 · supplier_payments · 클릭하여 정렬" />
    </span>
    <span className="w-[58px] shrink-0">
      <SortHeaderBtn label="총잔고" columnKey="balance" activeKey={sortKey} activeDir={sortDir} onSort={onSort} align="right" className="w-full text-amber-700" title="총잔고 (전체 매입-결제) · 클릭하여 정렬" />
    </span>
  </div>
);

const inputCls =
  "w-full h-9 px-3 text-[14px] border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep bg-white transition placeholder:text-zinc-300";

const FieldLabel: React.FC<{
  label: string;
  icon?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}> = ({ label, icon, required, children }) => (
  <label className="block space-y-1">
    <span className="inline-flex items-center gap-1 text-[14px] font-bold text-zinc-500 uppercase tracking-wider">
      {icon && <span className="text-zinc-400">{icon}</span>}
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
    slate:   { text: "text-zinc-600",   badge: "bg-zinc-50 text-zinc-500 border-line" },
  } as const;
  const t = map[tone];
  return (
    <div className="bg-white rounded-lg border border-line shadow-xs px-2.5 py-2 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 min-w-0">
        {icon && (
          <span className={`w-5 h-5 flex items-center justify-center rounded border ${t.badge} shrink-0`}>
            {icon}
          </span>
        )}
        <span className="text-[15px] font-bold text-zinc-400 uppercase tracking-wider leading-none">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        {loading ? (
          <Loader2 size={12} className="animate-spin text-zinc-300" />
        ) : (
          <span className={`text-[14px] font-bold tabular-nums leading-none ${t.text}`}>{value}</span>
        )}
      </div>
      {hint && <div className="text-[15px] font-semibold text-zinc-400 leading-none">{hint}</div>}
    </div>
  );
};

export default PaymentInfoTab;
