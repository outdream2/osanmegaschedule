// src/components/LandingPage/VendorListEditor.tsx
// 공급사관리 · 한 줄 테이블 리스트 + 상세 모달 (2026-07-30 UI 리디자인)
//   리스트: shadcn data-table 스타일 · 그룹 컬러 헤더 · h-8 툴바
//   모달:   헤더 gradient · 폼 h-9 · 매입이력 shadcn 스타일 · 하단 저장/닫기 통일

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useConfirm } from "../../hooks/useConfirm";
import { useVendors } from "../../hooks/useVendors";
import {
  Search, Check, X, Loader2, Building2, Package, Calendar,
  DollarSign, TrendingUp, RefreshCw, ChevronRight, ChevronDown, ChevronUp,
  Wallet, Plus, Trash2, CircleDollarSign, User2, Phone,
} from "lucide-react";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
// 2026-08-03 · 공급사명 표시 정제 · 법인접두어("(주)"·"주식회사"·"㈜") 및 vat 부가정보 제거
import { displayVendorName } from "../../utils/vendorNameNormalize";
// 2026-08-04 · 매입이력 공통 리스트 컴포넌트
import { PurchaseHistoryList, type PurchaseHistoryRow } from "../common/PurchaseHistoryList";
import { PeriodSelector, PERIOD_MONTHS_PRESET } from "../common/PeriodSelector";
import { fmtWonCompact } from "../../lib/format";
// 2026-08-09 · 신규 공급사 등록 모달 (사용자 요청)
import { NewVendorModal } from "../common/NewVendorModal";

interface VendorListEditorProps {
  // 기존 API 호환용 · 무시됨 (모달 방식으로 통일)
  mode?: "dashboard" | "raw";
  initialSelectedId?: number | null;
  onEditRequest?: (vendorId: number) => void;
  /** 2026-07-16 · 좌우 split 좌측용 컴팩트 모드 · 공급사명·사업자번호·담당자 3컬럼만 */
  compact?: boolean;
}

export interface Vendor {
  id: number;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  note: string | null;
  business_number: string | null;
  vat_included?: boolean | null;   // 부가세 포함/미포함 (VAT 통합 · #193)
  // 2026-08-10 · #21 · 팀장·긴급연락처 (마이그레이션 add_vendor_extra_contacts_2026-08-10.sql)
  team_leader_name?: string | null;
  team_leader_phone?: string | null;
  emergency_contact?: string | null;
  created_at?: string | null;
  latestBalance?: { balance: number; invoice_date: string | null; created_at: string } | null;
  balanceConfig?: { balance_field: string; updated_at: string } | null;
}

// VAT 포함 여부 판정 · vendor.vat_included 우선 · null 이면 company_name 문자열에서 유추
export function detectVatIncluded(v: Pick<Vendor, "vat_included" | "company_name" | "note">): boolean | null {
  if (v.vat_included === true) return true;
  if (v.vat_included === false) return false;
  const text = `${v.company_name ?? ""} ${v.note ?? ""}`;
  if (/vat\s*미포함|부가세\s*미포함|부가가치세\s*미포함/i.test(text)) return false;
  if (/vat\s*포함|부가세\s*포함|부가가치세\s*포함/i.test(text)) return true;
  return null;
}

interface EditDraft {
  company_name: string;
  business_number: string;
  contact_name: string;
  phone: string;
  email: string;
  category: string;
  note: string;
  // 2026-08-03 · #193 · VAT 포함 여부 · "included"|"excluded"|"unset"
  vat_included: "included" | "excluded" | "unset";
  // 2026-08-10 · #21 · 팀장·긴급연락처
  team_leader_name: string;
  team_leader_phone: string;
  emergency_contact: string;
}

const vatDraftVal = (v: Vendor | null | undefined): "included" | "excluded" | "unset" => {
  // 2026-08-10 · 사용자 요청 · VAT 별도 기본 · 미설정 제거
  if (!v) return "excluded";
  if (v.vat_included === true) return "included";
  if (v.vat_included === false) return "excluded";
  return "excluded";
};

const emptyDraft = (v: Vendor): EditDraft => ({
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

const normalizeBizNum = (s: string): string => s.replace(/[^0-9]/g, "").slice(0, 10);
const formatBizNum = (s: string | null): string => {
  if (!s) return "";
  const d = normalizeBizNum(s);
  if (d.length !== 10) return d;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
};
const fmtWon = fmtWonCompact;

// compact 모드 전용 · 분류별 좌측 컬러 바
const CATEGORY_LEFT_BORDER: Record<string, string> = {
  위탁:       "border-l-violet-400",
  선결제:     "border-l-rose-400",
  "60회전": "border-l-emerald-400",
  "90회전": "border-l-teal-400",
  기타:       "border-l-slate-300",
};
const CATEGORY_LEFT_BG: Record<string, string> = {
  위탁:       "bg-violet-50/40",
  선결제:     "bg-rose-50/40",
  "60회전": "bg-emerald-50/40",
  "90회전": "bg-teal-50/40",
  기타:       "bg-slate-50/30",
};

// compact 테이블 정렬 키 타입 (모듈 레벨 · IIFE SortIcon 에서 참조)
// 2026-08-04 · 일반 모드(non-compact) 에서도 재사용 · email/created_at 추가 (A-2 모든 헤더 정렬)
// 2026-08-04 · #101 · 결제/공급사관리 리스트 · 총재고자산·총판매액 컬럼 추가
type CompactSortKey =
  | "company_name" | "category" | "business_number" | "contact_name" | "phone" | "email" | "vat"
  | "balance" | "invoice_date" | "created_at"
  | "stock_value" | "sales_total";

// 공급사명 정규화 · vendors.company_name ↔ stock_history.supplier_name 매칭용
// PurchaseHistoryTab.tsx 의 normalizeName 과 동일 규칙 (법인접두어/괄호/공백 제거)
const normalizeSupplierKey = (s: string | null | undefined): string =>
  String(s ?? "")
    .replace(/[\s()㈜㈐]/g, "")
    .replace(/^\(주\)/g, "")
    .replace(/주식회사/g, "")
    .replace(/\(주\)$/g, "")
    .toLowerCase();

export const VendorListEditor: React.FC<VendorListEditorProps> = ({
  initialSelectedId,
  onEditRequest,
  compact = false,
}) => {
  const confirm = useConfirm();

  const { vendors: _rawVendors, loading, refresh: loadVendors } = useVendors();
  // 로컬 Vendor 타입으로 캐스팅 (latestBalance 등 추가 필드 접근용)
  const vendors = _rawVendors as unknown as Vendor[];
  const [search, setSearch] = useState("");
  const [filterMissingBiz, setFilterMissingBiz] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("전체");
  const [modalVendorId, setModalVendorId] = useState<number | null>(null);
  // 2026-08-09 · 신규 공급사 등록 모달 표시 여부 (사용자 요청)
  const [showNewVendor, setShowNewVendor] = useState(false);
  // compact 모드 · 선택된 항목 강조용
  const [activeId, setActiveId] = useState<number | null>(null);
  // compact 모드 · 테이블 정렬
  // 2026-08-04 · #101 · compact 모드 default = 잔고 내림차순 (사용자 요청)
  //   non-compact 는 기존과 동일하게 company_name asc 로 시작
  const [compactSortKey, setCompactSortKey] = useState<CompactSortKey>(compact ? "balance" : "company_name");
  const [compactSortDir, setCompactSortDir] = useState<"asc" | "desc">(compact ? "desc" : "asc");
  // 2026-08-04 · #101 · 공급사별 재고자산·판매액 (총 3개월 · /api/stock-manage/supplier-purchases)
  //   key = normalizeSupplierKey(supplier_name) · value = { stockValue, salesTotal }
  const [supplierAggMap, setSupplierAggMap] = useState<Map<string, { stockValue: number; salesTotal: number }>>(new Map());
  // 2026-08-09 · 기간 조회 · 1개월/3개월/6개월/12개월 (default 3)
  const [aggregateMonths, setAggregateMonths] = useState<number>(3);
  const toggleCompactSort = (key: CompactSortKey) => {
    if (compactSortKey === key) {
      setCompactSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setCompactSortKey(key);
      setCompactSortDir("asc");
    }
  };
  // 그룹 헤더 클릭 접기 · flow 탭 동일 방식
  type VendorGroup = "basic" | "contact" | "balance" | "etc";
  const [vendorGroupCollapsed, setVendorGroupCollapsed] = useState<Set<VendorGroup>>(new Set());
  const toggleVendorGroup = (g: VendorGroup) => setVendorGroupCollapsed(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const isVendorGroupCollapsed = (g: VendorGroup) => vendorGroupCollapsed.has(g);

  const handleVendorClick = (id: number) => {
    setActiveId(id);
    if (onEditRequest) { onEditRequest(id); } else { setModalVendorId(id); }
  };

  // 2026-08-04 · #101 · 공급사별 재고자산·판매액 집계 로드 (compact 모드 · aggregateMonths)
  //   stock_history 기반 · 이름 정규화 매칭 · 실패 시 빈 map (컬럼은 "-" 로 표기)
  //   2026-08-09 · 기간 조회 · aggregateMonths 파라미터화
  useEffect(() => {
    if (!compact) return; // compact 모드에서만 사용
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/stock-manage/supplier-purchases?months=${aggregateMonths}&limit=50000`);
        if (!res.ok) return;
        const j = await res.json();
        const rows: any[] = Array.isArray(j?.rows) ? j.rows : [];
        const m = new Map<string, { stockValue: number; salesTotal: number }>();
        for (const r of rows) {
          const nm = String(r.supplier ?? "").trim();
          if (!nm) continue;
          const key = normalizeSupplierKey(nm);
          if (!key) continue;
          const cur = m.get(key) ?? { stockValue: 0, salesTotal: 0 };
          cur.stockValue += Number(r.totalStockAmount ?? 0) || 0;
          cur.salesTotal += Number(r.saleAmount ?? 0) || 0;
          m.set(key, cur);
        }
        if (!cancelled) setSupplierAggMap(m);
      } catch { /* 조회 실패 시 빈 map · 컬럼 "-" 표기 */ }
    })();
    return () => { cancelled = true; };
  }, [compact, aggregateMonths]);

  useEffect(() => {
    if (initialSelectedId != null && vendors.find(v => v.id === initialSelectedId)) {
      setModalVendorId(initialSelectedId);
    }
  }, [initialSelectedId, vendors]);

  const filtered = useMemo(() => {
    let list = vendors;
    if (filterMissingBiz) list = list.filter(v => !v.business_number);
    if (categoryFilter !== "전체") list = list.filter(v => v.category === categoryFilter);
    const q = search.trim().toLowerCase().replace(/[^0-9가-힣a-z]/g, "");
    if (q) {
      list = list.filter(v => {
        const name    = (v.company_name ?? "").toLowerCase().replace(/[^0-9가-힣a-z]/g, "");
        const bn      = (v.business_number ?? "").replace(/[^0-9]/g, "");
        const contact = (v.contact_name ?? "").toLowerCase().replace(/[^0-9가-힣a-z]/g, "");
        const phone   = (v.phone ?? "").replace(/[^0-9]/g, "");
        const email   = (v.email ?? "").toLowerCase();
        return name.includes(q) || bn.includes(q) || contact.includes(q) || phone.includes(q) || email.includes(q);
      });
    }
    return list.slice().sort((a, b) => (a.company_name ?? "").localeCompare(b.company_name ?? "", "ko"));
  }, [vendors, search, filterMissingBiz, categoryFilter]);

  const missingCount = vendors.filter(v => !v.business_number).length;
  const modalVendor = useMemo(() => vendors.find(v => v.id === modalVendorId) ?? null, [vendors, modalVendorId]);

  // compact / 일반 테이블 정렬 결과 (compactSortKey/compactSortDir 공용)
  // 2026-08-04 · email / created_at 추가 (일반 모드용 · A-2 모든 헤더 정렬)
  const compactSorted = useMemo(() => {
    return filtered.slice().sort((a, b) => {
      let cmp = 0;
      switch (compactSortKey) {
        case "company_name":
          cmp = (a.company_name ?? "").localeCompare(b.company_name ?? "", "ko"); break;
        case "category":
          cmp = (a.category ?? "").localeCompare(b.category ?? "", "ko"); break;
        case "business_number":
          cmp = (a.business_number ?? "").localeCompare(b.business_number ?? ""); break;
        case "contact_name":
          cmp = (a.contact_name ?? "").localeCompare(b.contact_name ?? "", "ko"); break;
        case "phone":
          cmp = (a.phone ?? "").localeCompare(b.phone ?? ""); break;
        case "email":
          cmp = (a.email ?? "").localeCompare(b.email ?? ""); break;
        case "vat": {
          const va = detectVatIncluded(a); const vb = detectVatIncluded(b);
          const toNum = (x: boolean | null) => x === true ? 1 : x === false ? 0 : -1;
          cmp = toNum(va) - toNum(vb); break;
        }
        case "balance":
          cmp = (a.latestBalance?.balance ?? -Infinity) - (b.latestBalance?.balance ?? -Infinity); break;
        case "invoice_date": {
          const da = a.latestBalance?.invoice_date ?? "";
          const db = b.latestBalance?.invoice_date ?? "";
          cmp = da < db ? -1 : da > db ? 1 : 0; break;
        }
        case "created_at": {
          const da = a.created_at ?? "";
          const db = b.created_at ?? "";
          cmp = da < db ? -1 : da > db ? 1 : 0; break;
        }
        // 2026-08-04 · #101 · 총재고자산 · 총판매액 정렬 (supplierAggMap 참조)
        case "stock_value": {
          const va = supplierAggMap.get(normalizeSupplierKey(a.company_name))?.stockValue ?? -Infinity;
          const vb = supplierAggMap.get(normalizeSupplierKey(b.company_name))?.stockValue ?? -Infinity;
          cmp = va - vb; break;
        }
        case "sales_total": {
          const va = supplierAggMap.get(normalizeSupplierKey(a.company_name))?.salesTotal ?? -Infinity;
          const vb = supplierAggMap.get(normalizeSupplierKey(b.company_name))?.salesTotal ?? -Infinity;
          cmp = va - vb; break;
        }
        default: cmp = 0;
      }
      return compactSortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, compactSortKey, compactSortDir, supplierAggMap]);

  return (
    <div className="flex flex-col gap-2 min-h-0 flex-1">

      {/* ── compact 툴바 ── */}
      {compact ? (
        <div className="flex flex-col gap-1.5 bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2">
          {/* 검색 + 새로고침 */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="회사명 · 담당자 · 전화"
                className="h-7 pl-7 pr-2 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 w-full transition"
              />
            </div>
            {/* 건수 */}
            <span className="text-[11px] text-slate-400 tabular-nums whitespace-nowrap shrink-0">
              {loading
                ? <span className="inline-flex items-center gap-1"><Loader2 size={10} className="animate-spin" /></span>
                : `${filtered.length}건`}
            </span>
            <button
              onClick={loadVendors}
              disabled={loading}
              className="inline-flex items-center justify-center h-7 w-7 shrink-0 border border-slate-200 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer"
              title="새로고침"
            >
              <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
          {/* 분류 필터 · 가로 스크롤 */}
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none pb-0.5">
            {(["전체", "위탁", "선결제", "60회전", "90회전", "기타"] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`h-6 px-2 rounded-md text-[10px] font-black transition cursor-pointer whitespace-nowrap shrink-0 ${
                  categoryFilter === cat
                    ? cat === "전체"    ? "bg-slate-700 text-white shadow-sm"
                    : cat === "위탁"    ? "bg-violet-500 text-white shadow-sm"
                    : cat === "선결제"  ? "bg-rose-500 text-white shadow-sm"
                    : cat === "60회전" ? "bg-emerald-500 text-white shadow-sm"
                    : cat === "90회전" ? "bg-teal-500 text-white shadow-sm"
                    :                    "bg-slate-500 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md"
                }`}
              >
                {cat}
              </button>
            ))}
            {/* 기간 조회 · 공용 PeriodSelector (2026-08-09) */}
            <PeriodSelector<number>
              options={PERIOD_MONTHS_PRESET}
              value={aggregateMonths}
              onChange={(v) => setAggregateMonths(v)}
              accent="teal"
              className="ml-auto"
              ariaLabel="재고자산·판매액 집계 기간"
            />
          </div>
        </div>
      ) : (
        /* ── 일반 모드 툴바 (기존) ── */
        <div className="flex items-center gap-2 flex-wrap bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2">
          <div className="relative flex-1 min-w-[200px] sm:min-w-[260px] sm:flex-none">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="회사명 · 사업자번호 · 담당자 · 전화 · 이메일"
              className="h-8 pl-8 pr-3 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400 focus:border-teal-400 w-full sm:w-80 transition"
            />
          </div>
          <div className="inline-flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5 gap-0.5 flex-wrap">
            {(["전체", "위탁", "선결제", "60회전", "90회전", "기타"] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`h-7 px-2.5 rounded-md text-[11px] font-black transition cursor-pointer whitespace-nowrap ${
                  categoryFilter === cat
                    ? cat === "전체"    ? "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200"
                    : cat === "위탁"    ? "bg-violet-500 text-white shadow-sm"
                    : cat === "선결제"  ? "bg-rose-500 text-white shadow-sm"
                    : cat === "60회전" ? "bg-emerald-500 text-white shadow-sm"
                    : cat === "90회전" ? "bg-teal-500 text-white shadow-sm"
                    :                    "bg-slate-500 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700 hover:bg-white/60"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          {/* 2026-08-09 · 사업자번호 미등록 필터 · 사용자 요청 · 제거 */}
          <span className="text-[12px] text-slate-400 tabular-nums">
            {loading
              ? <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" />로딩...</span>
              : `${filtered.length} / ${vendors.length}건`}
          </span>
          {/* 2026-08-09 · 신규 공급사 등록 · 사용자 요청 · dashboard/일반 모드 */}
          <button
            onClick={() => setShowNewVendor(true)}
            className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[12px] font-black shadow-sm transition cursor-pointer"
            title="신규 공급사 등록"
          >
            <Plus size={12} strokeWidth={2.5} />
            신규 공급사
          </button>
          <button
            onClick={loadVendors}
            disabled={loading}
            className="inline-flex items-center justify-center h-8 w-8 border border-slate-200 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer"
            title="새로고침"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      )}

      {/* ── compact 모드: 표 형식 리스트 (헤더 정렬 · 결제/공급사 컬럼) ── */}
      {/* 2026-08-04 · #101 · 컬럼 재정비 · 5개 (공급사·총잔고·총재고자산·총판매액·최근매입) */}
      {compact ? (
        <div className="flex-1 min-h-0 overflow-auto bg-white rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full min-w-[420px] text-xs border-collapse">
            <thead>
              <tr>
                {/* 공급사 헤더 (분류+이름 stacked) · 2026-08-04 #68 · 활성 컬럼 subtle 배경 */}
                <th
                  onClick={() => toggleCompactSort("company_name")}
                  className={[
                    "sticky top-0 z-10 border-b border-slate-200",
                    "text-[11px] font-black uppercase tracking-wide whitespace-nowrap",
                    "select-none cursor-pointer hover:bg-slate-100 transition-colors duration-100",
                    "py-1.5 text-left pl-2 pr-1 w-[140px]",
                    compactSortKey === "company_name" ? "text-indigo-600 bg-indigo-50/70" : "text-slate-500 bg-slate-50",
                  ].join(" ")}
                >
                  <span className="inline-flex items-center gap-0.5">
                    공급사
                    {compactSortKey === "company_name"
                      ? (compactSortDir === "asc"
                          ? <ChevronUp size={9} className="text-indigo-500 ml-0.5 shrink-0" />
                          : <ChevronDown size={9} className="text-indigo-500 ml-0.5 shrink-0" />)
                      : <ChevronUp size={9} className="text-slate-300 ml-0.5 shrink-0" />}
                  </span>
                </th>
                {/* 2026-08-04 · #101 · 결제/공급사관리 리스트 재정비
                     · 제거: 사업자번호·담당자·전화·VAT (상세 우측 상단으로 이동)
                     · 유지: 공급사·총잔고·최근매입
                     · 추가: 총재고자산·총판매액 (최근 3개월)  */}
                {/* 총잔고 · 우측 정렬 */}
                <th
                  onClick={() => toggleCompactSort("balance")}
                  className={[
                    "sticky top-0 z-10 border-b border-slate-200",
                    "text-[11px] font-black uppercase tracking-wide whitespace-nowrap",
                    "select-none cursor-pointer hover:bg-slate-100 transition-colors duration-100",
                    "py-1.5 text-right pr-2 pl-1 w-20",
                    compactSortKey === "balance" ? "text-indigo-600 bg-indigo-50/70" : "text-slate-500 bg-slate-50",
                  ].join(" ")}
                  title="공급사별 최근 청구 잔고"
                >
                  <span className="inline-flex items-center flex-row-reverse gap-0.5">
                    총잔고
                    {compactSortKey === "balance"
                      ? (compactSortDir === "asc" ? <ChevronUp size={9} className="text-indigo-500 mr-0.5 shrink-0" /> : <ChevronDown size={9} className="text-indigo-500 mr-0.5 shrink-0" />)
                      : <ChevronDown size={9} className="text-slate-300 mr-0.5 shrink-0" />}
                  </span>
                </th>
                {/* 총재고자산 · 우측 정렬 · 최근 3개월 · totalStockAmount */}
                <th
                  onClick={() => toggleCompactSort("stock_value")}
                  className={[
                    "sticky top-0 z-10 border-b border-slate-200",
                    "text-[11px] font-black uppercase tracking-wide whitespace-nowrap",
                    "select-none cursor-pointer hover:bg-slate-100 transition-colors duration-100",
                    "py-1.5 text-right pr-2 pl-1 w-20",
                    compactSortKey === "stock_value" ? "text-indigo-600 bg-indigo-50/70" : "text-slate-500 bg-slate-50",
                  ].join(" ")}
                  title="공급사 상품 재고 총액 · 최근 3개월 stock_history 합계"
                >
                  <span className="inline-flex items-center flex-row-reverse gap-0.5">
                    총재고자산
                    {compactSortKey === "stock_value"
                      ? (compactSortDir === "asc" ? <ChevronUp size={9} className="text-indigo-500 mr-0.5 shrink-0" /> : <ChevronDown size={9} className="text-indigo-500 mr-0.5 shrink-0" />)
                      : <ChevronDown size={9} className="text-slate-300 mr-0.5 shrink-0" />}
                  </span>
                </th>
                {/* 총판매액 · 우측 정렬 · 최근 3개월 · saleAmount proxy */}
                <th
                  onClick={() => toggleCompactSort("sales_total")}
                  className={[
                    "sticky top-0 z-10 border-b border-slate-200",
                    "text-[11px] font-black uppercase tracking-wide whitespace-nowrap",
                    "select-none cursor-pointer hover:bg-slate-100 transition-colors duration-100",
                    "py-1.5 text-right pr-2 pl-1 w-20",
                    compactSortKey === "sales_total" ? "text-indigo-600 bg-indigo-50/70" : "text-slate-500 bg-slate-50",
                  ].join(" ")}
                  title="공급사 상품 판매 총액 · 최근 3개월"
                >
                  <span className="inline-flex items-center flex-row-reverse gap-0.5">
                    총판매액
                    {compactSortKey === "sales_total"
                      ? (compactSortDir === "asc" ? <ChevronUp size={9} className="text-indigo-500 mr-0.5 shrink-0" /> : <ChevronDown size={9} className="text-indigo-500 mr-0.5 shrink-0" />)
                      : <ChevronDown size={9} className="text-slate-300 mr-0.5 shrink-0" />}
                  </span>
                </th>
                {/* 최근매입 */}
                <th
                  onClick={() => toggleCompactSort("invoice_date")}
                  className={[
                    "sticky top-0 z-10 border-b border-slate-200",
                    "text-[11px] font-black uppercase tracking-wide whitespace-nowrap",
                    "select-none cursor-pointer hover:bg-slate-100 transition-colors duration-100",
                    "py-1.5 text-left px-2 w-16",
                    compactSortKey === "invoice_date" ? "text-indigo-600 bg-indigo-50/70" : "text-slate-500 bg-slate-50",
                  ].join(" ")}
                >
                  <span className="inline-flex items-center gap-0.5">
                    최근매입
                    {compactSortKey === "invoice_date"
                      ? (compactSortDir === "asc" ? <ChevronUp size={9} className="text-indigo-500 ml-0.5 shrink-0" /> : <ChevronDown size={9} className="text-indigo-500 ml-0.5 shrink-0" />)
                      : <ChevronUp size={9} className="text-slate-300 ml-0.5 shrink-0" />}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {compactSorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Building2 size={28} className="opacity-25" />
                      <span className="text-[13px] font-semibold">
                        {loading ? "로딩 중..." : search ? "검색 결과 없음" : "공급사 없음"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : compactSorted.map((v) => {
                const isActive  = activeId === v.id;
                const catBorder = v.category ? (CATEGORY_LEFT_BORDER[v.category] ?? "border-l-slate-200") : "border-l-slate-200";
                const catBg     = v.category ? (CATEGORY_LEFT_BG[v.category] ?? "") : "";
                const hasBal    = v.latestBalance?.balance != null;
                const invDate   = v.latestBalance?.invoice_date;
                // 2026-08-04 · #101 · 재고자산·판매액 (최근 3개월 · supplierAggMap)
                const agg = supplierAggMap.get(normalizeSupplierKey(v.company_name));
                const stockValue = agg?.stockValue ?? null;
                const salesTotal = agg?.salesTotal ?? null;
                const fmtDate   = (d: string | null | undefined): string => {
                  if (!d) return "-";
                  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
                  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : d.slice(0, 10);
                };
                return (
                  <tr
                    key={v.id}
                    onClick={() => handleVendorClick(v.id)}
                    title="클릭하여 상세 · 편집"
                    className={[
                      "cursor-pointer transition-all duration-150 border-l-[3px]",
                      isActive
                        ? "border-l-indigo-500 bg-indigo-50/60"
                        : `${catBorder} ${catBg} hover:bg-slate-50/80 active:bg-slate-100`,
                    ].join(" ")}
                  >
                    {/* 공급사: 분류(위·색상) + 이름(아래·bold) */}
                    <td className="pl-2 pr-1 py-1.5 min-w-[120px] max-w-[160px]">
                      <div className="leading-tight">
                        <VendorCategoryBadge category={v.category} className="text-[10px] mb-0.5" />
                        <div className={`text-[13px] font-bold break-keep leading-snug ${isActive ? "text-indigo-900" : "text-slate-800"}`}
                          title={v.company_name}>
                          {displayVendorName(v.company_name) || v.company_name}
                        </div>
                      </div>
                    </td>
                    {/* 총잔고 · 우측 정렬 */}
                    <td className="pr-2 pl-1 py-1.5 text-right whitespace-nowrap">
                      {hasBal
                        ? (
                          <span className={`text-[12px] font-bold tabular-nums ${v.latestBalance!.balance > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                            {fmtWon(v.latestBalance!.balance)}
                          </span>
                        )
                        : <span className="text-[10px] text-slate-300">-</span>}
                    </td>
                    {/* 총재고자산 · 우측 정렬 · 최근 3개월 */}
                    <td className="pr-2 pl-1 py-1.5 text-right whitespace-nowrap">
                      {stockValue != null && stockValue > 0
                        ? (
                          <span className="text-[12px] font-bold tabular-nums text-sky-700"
                            title={`${stockValue.toLocaleString()}원 · 최근 3개월 재고금액 합`}>
                            {fmtWon(stockValue)}
                          </span>
                        )
                        : <span className="text-[10px] text-slate-300">-</span>}
                    </td>
                    {/* 총판매액 · 우측 정렬 · 최근 3개월 */}
                    <td className="pr-2 pl-1 py-1.5 text-right whitespace-nowrap">
                      {salesTotal != null && salesTotal > 0
                        ? (
                          <span className="text-[12px] font-bold tabular-nums text-violet-700"
                            title={`${Math.round(salesTotal).toLocaleString()}원 · 최근 3개월 판매액`}>
                            {fmtWon(salesTotal)}
                          </span>
                        )
                        : <span className="text-[10px] text-slate-300">-</span>}
                    </td>
                    {/* 최근매입 */}
                    <td className="px-2 py-1.5 text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                      {fmtDate(invDate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── 일반 모드: 기존 반응형 테이블 ── */
        <div className="flex-1 min-h-0 overflow-auto bg-white rounded-xl border border-slate-200 shadow-sm">

          {/* 모바일(< md): 카드 · compactSorted 사용 (헤더 정렬이 mobile 에도 적용되도록 · 2026-08-04 #68) */}
          <div className="md:hidden divide-y divide-slate-100">
            {compactSorted.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm font-semibold">
                {loading ? "로딩 중..." : search ? "검색 결과 없음" : "공급사 데이터 없음"}
              </div>
            ) : compactSorted.map((v, i) => (
              <button
                key={v.id}
                onClick={() => handleVendorClick(v.id)}
                className="w-full text-left px-3 py-2.5 hover:bg-teal-50/60 active:bg-teal-100 transition"
              >
                <div className="flex items-start gap-2">
                  <span className="text-[11px] text-slate-400 mt-0.5 w-6 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                      <Building2 size={11} className="text-teal-500 shrink-0" />
                      <span className="text-[13px] font-bold text-slate-800 break-words">{v.company_name}</span>
                      <VendorCategoryBadge category={v.category} />
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                      {v.business_number
                        ? <span>{formatBizNum(v.business_number)}</span>
                        : <span className="text-rose-500 font-semibold italic">사번없음</span>}
                      {v.category && <span>· {v.category}</span>}
                      {v.contact_name && <span>· {v.contact_name}</span>}
                      {v.phone && <span>· {v.phone}</span>}
                      {v.latestBalance?.balance != null && (
                        <span className="font-bold text-emerald-700">· 잔고 {fmtWon(v.latestBalance.balance)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* 태블릿·데스크탑(md+): shadcn data-table 스타일 */}
          <table className="hidden md:table w-full text-xs">
            <thead className="sticky top-0 bg-white z-10 border-b border-slate-200">
              {/* 그룹 컬러 헤더 */}
              <tr className="text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
                <th colSpan={4} className="text-center py-1.5 bg-sky-50 text-sky-700 border-r border-slate-100">
                  기본 정보
                </th>
                {/* 연락처 (amber) · 클릭 접기 */}
                <th colSpan={isVendorGroupCollapsed("contact") ? 1 : 2}
                  className="text-center py-1.5 bg-amber-50 text-amber-700 border-r border-slate-100 cursor-pointer select-none hover:bg-amber-100 transition"
                  onClick={() => toggleVendorGroup("contact")}
                  title={isVendorGroupCollapsed("contact") ? "연락처 펼치기" : "연락처 접기"}>
                  <span className="inline-flex items-center gap-1">
                    {isVendorGroupCollapsed("contact") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}연락처
                  </span>
                </th>
                {/* 잔고 (emerald) · 클릭 접기 */}
                <th colSpan={1}
                  className="text-center py-1.5 bg-emerald-50 text-emerald-700 border-r border-slate-100 cursor-pointer select-none hover:bg-emerald-100 transition"
                  onClick={() => toggleVendorGroup("balance")}
                  title={isVendorGroupCollapsed("balance") ? "잔고 펼치기" : "잔고 접기"}>
                  <span className="inline-flex items-center gap-1">
                    {isVendorGroupCollapsed("balance") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}잔고
                  </span>
                </th>
                {/* 기타 (slate) · 클릭 접기 */}
                <th colSpan={isVendorGroupCollapsed("etc") ? 1 : 2}
                  className="text-center py-1.5 bg-slate-50 text-slate-500 cursor-pointer select-none hover:bg-slate-100 transition"
                  onClick={() => toggleVendorGroup("etc")}
                  title={isVendorGroupCollapsed("etc") ? "기타 펼치기" : "기타 접기"}>
                  <span className="inline-flex items-center gap-1">
                    {isVendorGroupCollapsed("etc") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}기타
                  </span>
                </th>
              </tr>
              {/* 서브 헤더 · 2026-08-04 · A-2 · 모든 컬럼 헤더 클릭 정렬 · 화살표 표시 */}
              <tr className="text-[11px] text-slate-500 uppercase tracking-wider">
                <th className="text-left px-2 py-1.5 w-8 bg-sky-50/30">#</th>
                {(() => {
                  const arrow = (k: CompactSortKey) => compactSortKey !== k
                    ? <ChevronUp size={9} className="text-slate-300 ml-0.5 inline shrink-0" />
                    : compactSortDir === "asc"
                      ? <ChevronUp size={9} className="text-teal-600 ml-0.5 inline shrink-0" />
                      : <ChevronDown size={9} className="text-teal-600 ml-0.5 inline shrink-0" />;
                  const sortableCls = (k: CompactSortKey, base: string) =>
                    `${base} cursor-pointer select-none hover:bg-slate-100 transition ${compactSortKey === k ? "text-teal-700" : ""}`;
                  return <>
                    <th onClick={() => toggleCompactSort("company_name")}
                      className={sortableCls("company_name", "text-left px-3 py-1.5 min-w-[160px] bg-sky-50/30")}>
                      회사명{arrow("company_name")}
                    </th>
                    <th onClick={() => toggleCompactSort("business_number")}
                      className={sortableCls("business_number", "text-left px-3 py-1.5 w-28 bg-sky-50/30")}>
                      사업자번호{arrow("business_number")}
                    </th>
                    <th onClick={() => toggleCompactSort("contact_name")}
                      className={sortableCls("contact_name", "text-left px-3 py-1.5 w-20 bg-sky-50/30")}>
                      담당자{arrow("contact_name")}
                    </th>
                    {/* 연락처 그룹 */}
                    {isVendorGroupCollapsed("contact") ? (
                      <th className="bg-amber-50/20 w-4"></th>
                    ) : (
                      <>
                        <th onClick={() => toggleCompactSort("phone")}
                          className={sortableCls("phone", "text-left px-3 py-1.5 w-28 bg-amber-50/30")}>
                          전화{arrow("phone")}
                        </th>
                        <th onClick={() => toggleCompactSort("email")}
                          className={sortableCls("email", "text-left px-3 py-1.5 w-36 hidden lg:table-cell bg-amber-50/30")}>
                          이메일{arrow("email")}
                        </th>
                      </>
                    )}
                    {/* 잔고 그룹 */}
                    {isVendorGroupCollapsed("balance") ? (
                      <th className="bg-emerald-50/20 w-4"></th>
                    ) : (
                      <th onClick={() => toggleCompactSort("balance")}
                        className={sortableCls("balance", "text-right px-3 py-1.5 w-24 bg-emerald-50/30")}>
                        잔고{arrow("balance")}
                      </th>
                    )}
                    {/* 기타 그룹 */}
                    {isVendorGroupCollapsed("etc") ? (
                      <th className="bg-slate-50/20 w-4"></th>
                    ) : (
                      <>
                        <th onClick={() => toggleCompactSort("category")}
                          className={sortableCls("category", "text-left px-3 py-1.5 w-20 hidden xl:table-cell bg-slate-50/40")}>
                          분류{arrow("category")}
                        </th>
                        <th onClick={() => toggleCompactSort("created_at")}
                          className={sortableCls("created_at", "text-left px-3 py-1.5 w-24 hidden lg:table-cell bg-slate-50/40")}>
                          등록일{arrow("created_at")}
                        </th>
                      </>
                    )}
                  </>;
                })()}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {compactSorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400 font-semibold">
                    {loading ? "로딩 중..." : search ? "검색 결과 없음" : "공급사 데이터 없음"}
                  </td>
                </tr>
              ) : compactSorted.map((v, i) => (
                <tr
                  key={v.id}
                  onClick={() => handleVendorClick(v.id)}
                  className="hover:bg-slate-50/60 cursor-pointer transition"
                  title="클릭하여 상세 · 편집"
                >
                  <td className="px-2 py-1 text-[11px] text-slate-400 tabular-nums">{i + 1}</td>
                  <td className="px-2 py-1 text-[13px] font-semibold text-slate-800">
                    <span className="inline-flex items-center gap-1 flex-wrap">
                      <Building2 size={11} className="text-teal-500 shrink-0" />
                      <span className="underline decoration-dotted decoration-teal-300 underline-offset-2 break-words">{v.company_name}</span>
                      <VendorCategoryBadge category={v.category} />
                    </span>
                  </td>
                  <td className="px-2 py-1 text-[11px] text-slate-600 whitespace-nowrap">
                    {v.business_number
                      ? formatBizNum(v.business_number)
                      : <span className="text-rose-400 italic text-[10px]">없음</span>}
                  </td>
                  <td className="px-2 py-1 text-[11px] text-slate-700 truncate">{v.contact_name ?? "-"}</td>
                  {/* 연락처 그룹 */}
                  {isVendorGroupCollapsed("contact") ? (
                    <td className="bg-amber-50/10 w-4"></td>
                  ) : (
                    <>
                      <td className="px-3 py-1.5 text-[11px] text-slate-600 whitespace-nowrap">{v.phone ?? "-"}</td>
                      <td className="px-3 py-1.5 text-[11px] text-slate-600 truncate hidden lg:table-cell" title={v.email ?? undefined}>{v.email ?? "-"}</td>
                    </>
                  )}
                  {/* 잔고 그룹 */}
                  {isVendorGroupCollapsed("balance") ? (
                    <td className="bg-emerald-50/10 w-4"></td>
                  ) : (
                    <td className="px-3 py-1.5 text-right text-[11px] font-bold text-emerald-700 whitespace-nowrap">
                      {v.latestBalance?.balance != null ? fmtWon(v.latestBalance.balance) : <span className="text-slate-300">-</span>}
                    </td>
                  )}
                  {/* 기타 그룹 */}
                  {isVendorGroupCollapsed("etc") ? (
                    <td className="bg-slate-50/10 w-4"></td>
                  ) : (
                    <>
                      <td className="px-3 py-1.5 hidden xl:table-cell">
                        <VendorCategoryBadge category={v.category} />
                        {!v.category && <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-slate-400 hidden lg:table-cell">
                        {v.created_at ? String(v.created_at).slice(0, 10) : "-"}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 상세 모달 · 기존 vendor 편집·조회 */}
      {modalVendor && (
        <VendorDetailModal
          vendor={modalVendor}
          onClose={() => setModalVendorId(null)}
          onSaved={loadVendors}
        />
      )}
      {/* 2026-08-09 · 신규 공급사 등록 모달 (사용자 요청) */}
      {showNewVendor && (
        <NewVendorModal
          onClose={() => setShowNewVendor(false)}
          onSaved={() => { setShowNewVendor(false); loadVendors(); }}
        />
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// 공급사 상세 모달 · 편집 필드 + 잔고 · 매입 통계 · 최근 매입 이력
// ═══════════════════════════════════════════════════════════════════
interface PurchaseRow {
  id: number;
  purchase_date: string;
  product_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  amount: number;
  total: number;
}
interface VendorSummary {
  totalAmount: number;
  totalQty: number;
  uniqueProducts: number;
  latestDate: string | null;
  earliestDate: string | null;
  count: number;
}

// ── 결제·잔고 관련 타입 (2026-07-31) ─────────────────────────────
interface SupplierBalanceInfo {
  supplier: string;
  total_purchase: number;
  total_payment: number;
  balance: number;
  purchase_count: number;
  payment_count: number;
}
interface PaymentAllocation {
  id: number;
  payment_id: number;
  ocr_confirmed_item_id: number | null;
  allocated_amount: number;
}
interface PaymentRow {
  id: number;
  supplier_name: string;
  payment_date: string;
  amount: number;
  method: string;
  memo: string | null;
  created_at: string;
  allocations?: PaymentAllocation[];
}
interface LedgerRow {
  type: "purchase" | "payment";
  id: number;
  date: string;
  amount: number;
  method: string | null;
  memo: string | null;
  running_balance: number;
}
interface OpenInvoiceRow {
  id: number;
  date: string;
  product_name: string;
  amount: number;
  allocated: number;
  remaining: number;
  status: "open" | "partial" | "paid";
}

const METHOD_LABEL: Record<string, string> = {
  transfer: "이체",
  cash: "현금",
  card: "카드",
  check: "수표",
  offset: "상계",
  etc: "기타",
};

type DetailTab = "info" | "payment" | "purchase";

export const VendorDetailModal: React.FC<{
  vendor: Vendor;
  onClose: () => void;
  onSaved: () => void;
  panel?: boolean;
}> = ({ vendor, onClose, onSaved, panel }) => {
  const confirm = useConfirm();

  const [draft, setDraft] = useState<EditDraft>(emptyDraft(vendor));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [purchLoading, setPurchLoading] = useState(false);
  const [summary, setSummary] = useState<VendorSummary | null>(null);
  // 2026-08-10 · 사용자 요청 · 총재고 현황 · fetch API 대기 (현재 stock 합계)
  const [vendorTotalStock, setVendorTotalStock] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    if (!vendor?.company_name) return;
    fetch(`/api/products-search?supplier=${encodeURIComponent(vendor.company_name)}&limit=2000`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => {
        if (!alive) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        // 총재고 = 각 상품 current_stock * unit_price (없으면 0)
        const total = items.reduce((s: number, p: any) => s + (Number(p.current_stock ?? 0) * Number(p.unit_price ?? 0)), 0);
        setVendorTotalStock(total);
      })
      .catch(() => { if (alive) setVendorTotalStock(null); });
    return () => { alive = false; };
  }, [vendor?.company_name]);
  const [activeTab, setActiveTab] = useState<DetailTab>("info");
  // 결제·잔고 데이터
  const [balanceInfo, setBalanceInfo] = useState<SupplierBalanceInfo | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [payMsg, setPayMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);

  // ESC · 배경 클릭 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 결제·잔고 로드 (payment 탭 · info 탭 KPI 용도)
  const loadPaymentData = useCallback(async () => {
    setPaymentLoading(true);
    try {
      const supplierEnc = encodeURIComponent(vendor.company_name);
      const [balRes, payRes, ledgerRes] = await Promise.all([
        fetch(`/api/supplier-balance/${supplierEnc}`),
        fetch(`/api/supplier-payments?supplier=${supplierEnc}&days=3650`),
        fetch(`/api/supplier-ledger?supplier=${supplierEnc}&days=3650`),
      ]);
      if (balRes.ok) setBalanceInfo(await balRes.json());
      if (payRes.ok) {
        const j = await payRes.json();
        setPayments(Array.isArray(j.rows) ? j.rows : []);
      }
      if (ledgerRes.ok) {
        const j = await ledgerRes.json();
        setLedgerRows(Array.isArray(j.rows) ? j.rows : []);
      }
    } catch (e) {
      console.error("결제·잔고 로드 실패:", e);
    } finally {
      setPaymentLoading(false);
    }
  }, [vendor.company_name]);

  useEffect(() => { loadPaymentData(); }, [loadPaymentData]);

  // 결제 삭제
  const handleDeletePayment = async (id: number) => {
    if (!await confirm({ message: "결제 기록을 삭제하시겠습니까? 배분(allocations) 도 함께 삭제됩니다.", danger: true })) return;
    try {
      const res = await fetch(`/api/supplier-payments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `서버 ${res.status}`);
      }
      setPayMsg({ type: "ok", text: "삭제 완료" });
      await loadPaymentData();
    } catch (e: any) {
      setPayMsg({ type: "err", text: `삭제 실패: ${e?.message ?? e}` });
    }
  };

  // 매입 이력 · 통계 로드
  useEffect(() => {
    setPurchLoading(true);
    fetch(`/api/purchase-details?supplier=${encodeURIComponent(vendor.company_name)}&limit=1000`)
      .then(r => r.ok ? r.json() : { rows: [] })
      .then(j => {
        const rows: PurchaseRow[] = Array.isArray(j.rows) ? j.rows : [];
        setPurchases(rows.slice(0, 30));
        const totalAmount = rows.reduce((s, r) => s + (Number(r.total ?? r.amount) || 0), 0);
        const totalQty    = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
        const uniqueCodes = new Set(rows.map(r => String(r.product_code)));
        const dates       = rows.map(r => String(r.purchase_date)).filter(Boolean).sort();
        setSummary({
          totalAmount, totalQty,
          uniqueProducts: uniqueCodes.size,
          latestDate:   dates[dates.length - 1] ?? null,
          earliestDate: dates[0] ?? null,
          count: rows.length,
        });
      })
      .catch(() => { setPurchases([]); setSummary(null); })
      .finally(() => setPurchLoading(false));
  }, [vendor.id, vendor.company_name]);

  const isDirty = useMemo(() => (
    draft.company_name    !== (vendor.company_name    ?? "") ||
    draft.business_number !== (vendor.business_number ?? "") ||
    draft.contact_name    !== (vendor.contact_name    ?? "") ||
    draft.phone           !== (vendor.phone           ?? "") ||
    draft.email           !== (vendor.email           ?? "") ||
    draft.category        !== (vendor.category        ?? "") ||
    draft.note            !== (vendor.note            ?? "") ||
    draft.vat_included    !== vatDraftVal(vendor)
  ), [vendor, draft]);

  const handleSave = async () => {
    const bnDigits = normalizeBizNum(draft.business_number);
    if (bnDigits && bnDigits.length !== 10) {
      setSaveMsg({ type: "err", text: "사업자번호는 10자리 숫자여야 합니다" });
      return;
    }
    if (!draft.company_name.trim()) {
      setSaveMsg({ type: "err", text: "회사명은 필수입니다" });
      return;
    }
    setSaving(true); setSaveMsg(null);
    try {
      const res = await fetch(`/api/vendors/${vendor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // 2026-07-22: 'email' 컬럼이 Supabase vendors 스키마에 없어 저장 실패 · 페이로드에서 제외
        //   (UI 는 유지 · 나중에 DB 마이그레이션 시 다시 활성)
        body: JSON.stringify({
          company_name:    draft.company_name.trim(),
          business_number: bnDigits || null,
          contact_name:    draft.contact_name.trim() || null,
          phone:           draft.phone.trim() || null,
          category:        draft.category.trim() || null,
          note:            draft.note.trim() || null,
          // 2026-08-03 · #193 · VAT 포함 여부 (unset → null)
          vat_included:    draft.vat_included === "included" ? true : draft.vat_included === "excluded" ? false : null,
          // 2026-08-10 · #21 · 팀장·긴급연락처 (마이그레이션 실행 전엔 서버 저장 실패해도 프론트 정상)
          team_leader_name:  draft.team_leader_name.trim()  || null,
          team_leader_phone: draft.team_leader_phone.trim() || null,
          emergency_contact: draft.emergency_contact.trim() || null,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error ?? `서버 ${res.status}`);
      }
      setSaveMsg({ type: "ok", text: "저장 완료" });
      // 2026-07-30 · 사용자 요청 · 분류(category) 저장 시 · 리스트 배지 즉시 반영 이벤트
      try { window.dispatchEvent(new CustomEvent("vendors-changed")); } catch { /* ignore */ }
      onSaved();
    } catch (e: any) {
      setSaveMsg({ type: "err", text: `저장 실패: ${e?.message ?? e}` });
    } finally {
      setSaving(false);
    }
  };

  // ── 래퍼: panel 모드는 인라인 · 기본은 backdrop 모달 ──
  const backdropCls = panel
    ? "relative bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-h-0 flex-1"
    : "fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4";

  const innerCls = panel
    ? "relative flex flex-col flex-1 min-h-0 overflow-hidden"
    : "relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[95vh] md:h-auto md:min-h-[85vh] md:max-h-[92vh] flex flex-col overflow-hidden";

  return (
    <div className={backdropCls} onClick={panel ? undefined : onClose}>
      <div
        className={innerCls}
        onClick={panel ? undefined : (e => e.stopPropagation())}
      >
        {/* ── 헤더 · 2026-08-10 · 아이콘 제거 · 텍스트 위주 · 폰트 +2 */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-br from-sky-50 via-indigo-50/60 to-emerald-50/40 shrink-0 gap-3">
          {/* 2026-08-10 · 사용자 요청 · 한 줄 컴팩트 · 아이콘 제거 · 공급사명 +1 (17→18) */}
          <div className="min-w-0 flex-1 flex items-baseline gap-x-4 gap-y-1 flex-wrap text-[15px]">
            <div className="flex items-baseline gap-2 shrink-0">
              <div className="text-[18px] font-black text-slate-900 leading-tight break-words">{vendor.company_name}</div>
              <VendorCategoryBadge category={vendor.category} />
            </div>
            <span className="inline-flex items-baseline gap-1.5">
              <span className="text-slate-400 font-semibold">사업자</span>
              {vendor.business_number
                ? <span className="font-black text-slate-800 tabular-nums font-mono">{formatBizNum(vendor.business_number)}</span>
                : <span className="text-slate-300 italic">미등록</span>}
            </span>
            <span className="text-slate-200">·</span>
            <span className="inline-flex items-baseline gap-1.5">
              <span className="text-slate-400 font-semibold">담당</span>
              {vendor.contact_name
                ? <span className="font-black text-slate-800">{vendor.contact_name}</span>
                : <span className="text-slate-300 italic">미등록</span>}
            </span>
            <span className="text-slate-200">·</span>
            <span className="inline-flex items-baseline gap-1.5">
              <span className="text-slate-400 font-semibold">전화</span>
              {vendor.phone
                ? (
                  <a
                    href={`tel:${String(vendor.phone).replace(/[^0-9+]/g, "")}`}
                    onClick={e => e.stopPropagation()}
                    className="font-black text-slate-800 hover:text-emerald-700 hover:underline tabular-nums"
                  >
                    {vendor.phone}
                  </a>
                )
                : <span className="text-slate-300 italic">미등록</span>}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0 ml-3 transition"
            title="닫기 (ESC)"
          >
            <X size={15} />
          </button>
        </div>

        {/* 2026-08-09 · 사용자 요청 · 결제·잔고 · 매입이력 탭 제거 · 정보 한 장으로만 */}
        {/* 서브탭 UI 제거됨 · 정보 필드만 렌더 */}

        {/* ── 본문 ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">

          {/* ─── 정보 (탭 제거 · 한 장) ─── */}
          {(() => { void activeTab; return null; })()}
          {(true) && (
          <>
          {/* 2026-08-10 · 사용자 요청 · 안내 문구 위 · 공급요약 · PC 항상 노출 (한줄) · 모바일 details 접기 (2줄) */}
          <div className="mb-1 text-[12px] text-slate-400 leading-relaxed px-1">
            💡 자세한 내용은 <span className="font-bold text-amber-700">매입 &gt; 매입이력 &gt; 공급사 관리</span> 에서 확인
          </div>
          {/* PC: 제목 옆 나란히 · 한줄 */}
          <div className="hidden sm:block mb-4 pb-1.5 border-b border-slate-100">
            <div className="flex items-center gap-x-5 gap-y-1 flex-wrap">
              <div className="flex items-center gap-2 shrink-0">
                <span className="w-1 h-4 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-[15px] font-black text-emerald-700">공급 요약</span>
              </div>
              <span className="inline-flex items-baseline gap-1.5 text-[14px] leading-tight">
                <span className="text-slate-400 font-semibold">총재고금액</span>
                <span className="tabular-nums font-black text-sky-700">{vendorTotalStock != null ? fmtWon(vendorTotalStock) : "-"}</span>
              </span>
              <span className="text-slate-200">·</span>
              <span className="inline-flex items-baseline gap-1.5 text-[14px] leading-tight">
                <span className="text-slate-400 font-semibold">총 상품갯수</span>
                <span className="tabular-nums font-black text-violet-700">{summary ? `${summary.uniqueProducts.toLocaleString()}종` : "-"}</span>
              </span>
              <span className="text-slate-200">·</span>
              <span className="inline-flex items-baseline gap-1.5 text-[14px] leading-tight">
                <span className="text-slate-400 font-semibold">현재 총매입금액</span>
                <span className="tabular-nums font-black text-indigo-700">{summary ? fmtWon(summary.totalAmount) : "-"}</span>
              </span>
            </div>
          </div>
          {/* 모바일: details 접기 · 2줄 grid · 기본 닫힘 */}
          <details className="sm:hidden mb-4 group [&[open]>summary_.chevron]:rotate-90">
            <summary className="flex items-center gap-2 cursor-pointer select-none list-none pb-1.5 border-b border-slate-100">
              <ChevronRight size={14} className="chevron text-emerald-500 shrink-0 transition-transform" />
              <span className="w-1 h-4 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-[15px] font-black text-emerald-700">공급 요약</span>
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[14px] leading-tight px-2">
              <span className="inline-flex flex-col">
                <span className="text-slate-400 font-semibold text-[11px]">총재고금액</span>
                <span className="tabular-nums font-black text-sky-700">{vendorTotalStock != null ? fmtWon(vendorTotalStock) : "-"}</span>
              </span>
              <span className="inline-flex flex-col">
                <span className="text-slate-400 font-semibold text-[11px]">총 상품갯수</span>
                <span className="tabular-nums font-black text-violet-700">{summary ? `${summary.uniqueProducts.toLocaleString()}종` : "-"}</span>
              </span>
              <span className="inline-flex flex-col col-span-2">
                <span className="text-slate-400 font-semibold text-[11px]">현재 총매입금액</span>
                <span className="tabular-nums font-black text-indigo-700">{summary ? fmtWon(summary.totalAmount) : "-"}</span>
              </span>
            </div>
          </details>

          {/* 2026-08-10 · 사용자 요청 · 결제정보 · VAT 포함/별도 · 2체크박스 (하나만 활성) */}
          <div className="mb-4 pb-1.5 border-b border-slate-100">
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
              <div className="flex items-center gap-2 shrink-0">
                <span className="w-1 h-4 rounded-full bg-amber-500 shrink-0" />
                <span className="text-[15px] font-black text-amber-700">결제 정보</span>
              </div>
              <span className="text-[12px] text-slate-400 shrink-0">거래명세서 금액</span>
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={draft.vat_included === "included"}
                  onChange={() => setDraft({ ...draft, vat_included: "included" })}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
                <span className={`text-[14px] font-semibold ${draft.vat_included === "included" ? "text-emerald-700" : "text-slate-500"}`}>부가세 포함</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={draft.vat_included === "excluded"}
                  onChange={() => setDraft({ ...draft, vat_included: "excluded" })}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
                <span className={`text-[14px] font-semibold ${draft.vat_included === "excluded" ? "text-amber-700" : "text-slate-500"}`}>부가세 별도</span>
              </label>
            </div>
          </div>

          {/* 2026-08-10 · 기본정보 단일 컬럼 · 공급요약 위로 이동됨 */}
          <div className="space-y-4">

            {/* Left · 기본 정보 편집 */}
            <div className="space-y-3">
              <SectionTitle icon={<Building2 size={13} />} title="기본 정보" color="sky" />

              {/* 2026-07-30 · 사용자 요청 · 회사명 + 분류 + 사업자번호 · 한 줄 (3열 grid) */}
              <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)] gap-3">
                <Field label="회사명 *">
                  <input
                    type="text"
                    value={draft.company_name}
                    onChange={e => setDraft({ ...draft, company_name: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="분류">
                  <select
                    value={draft.category}
                    onChange={e => setDraft({ ...draft, category: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">(없음)</option>
                    <option value="위탁">위탁</option>
                    <option value="선결제">선결제</option>
                    <option value="60회전">60회전</option>
                    <option value="90회전">90회전</option>
                    <option value="기타">기타</option>
                  </select>
                </Field>
                <Field label="사업자번호 (10자리)">
                  {/* 2026-08-10 · #30 · 입력 시 자동 하이픈 포맷 (123-45-67890) · 저장은 숫자만 (normalizeBizNum) */}
                  <input
                    type="text"
                    value={formatBizNum(draft.business_number) || draft.business_number}
                    onChange={e => setDraft({ ...draft, business_number: normalizeBizNum(e.target.value) })}
                    placeholder="000-00-00000"
                    className={`${inputCls} font-mono tracking-wider`}
                    maxLength={12}
                  />
                </Field>
              </div>

              {/* 2026-08-10 · 사용자 요청 · 담당자 → 팀장 → 긴급연락처 세로 배치 (담당자·전화 → 팀장·전화 → 긴급) */}
              {/* 담당자 · 전화 (2열) */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="담당자 이름">
                  <input type="text" value={draft.contact_name} onChange={e => setDraft({ ...draft, contact_name: e.target.value })} className={inputCls} />
                </Field>
                <Field label="담당자 연락처">
                  <input type="text" value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })}
                    placeholder="010-0000-0000"
                    className={inputCls} />
                </Field>
              </div>

              {/* 팀장 이름 · 팀장 전화 (2열) */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="팀장 이름">
                  <input type="text" value={draft.team_leader_name}
                    onChange={e => setDraft({ ...draft, team_leader_name: e.target.value })}
                    placeholder="담당자와 별개"
                    className={inputCls} />
                </Field>
                <Field label="팀장 연락처">
                  <input type="text" value={draft.team_leader_phone}
                    onChange={e => setDraft({ ...draft, team_leader_phone: e.target.value })}
                    placeholder="010-0000-0000"
                    className={inputCls} />
                </Field>
              </div>

              {/* 긴급 연락처 (single row) */}
              <Field label="긴급 연락처">
                <input type="text" value={draft.emergency_contact}
                  onChange={e => setDraft({ ...draft, emergency_contact: e.target.value })}
                  placeholder="야간·주말·비상 연락처"
                  className={inputCls} />
              </Field>

              {/* 이메일 (single row) */}
              <Field label="이메일">
                <input
                  type="email"
                  value={draft.email}
                  onChange={e => setDraft({ ...draft, email: e.target.value })}
                  placeholder="example@company.com"
                  className={inputCls}
                />
              </Field>

              {/* 2026-08-10 · 사용자 요청 · VAT 처리 · 결제정보 세션으로 이동됨 */}

              {/* 비고 (single row) */}
              <Field label="비고">
                <textarea
                  value={draft.note}
                  onChange={e => setDraft({ ...draft, note: e.target.value })}
                  className={`${inputCls} h-[72px] resize-none`}
                />
              </Field>

              {/* 2026-08-09 · 거래처 로그인 비밀번호 · 자동 규칙 (전화번호 + "00") · 수동 저장 필드 제거 (사용자 정책) */}
            </div>

            {/* 2026-08-10 · 공급요약 상단으로 이동됨 · 아래는 안내만 유지 */}
            <div className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-100 pt-2">
              <div className="text-[11px] text-slate-500 leading-relaxed">
                <span className="text-slate-400">💡 </span>
                결제·잔고 관리는 <span className="font-bold text-emerald-700">결제·잔고</span> 탭 · 매입 이력은 <span className="font-bold text-amber-700">매입이력</span> 탭
              </div>
            </div>
          </div>
          </>
          )}

          {/* ─── 결제·잔고 탭 ─── */}
          {activeTab === "payment" && (
          <div className="space-y-4">
            {/* KPI 3카드 */}
            <div className="grid grid-cols-3 gap-2.5">
              <StatCard
                icon={<TrendingUp size={12} />} color="indigo" label="총 매입"
                value={balanceInfo ? fmtWon(balanceInfo.total_purchase) : "-"}
                sub={balanceInfo ? `${balanceInfo.purchase_count.toLocaleString()}건` : undefined}
              />
              <StatCard
                icon={<Wallet size={12} />} color="emerald" label="총 결제"
                value={balanceInfo ? fmtWon(balanceInfo.total_payment) : "-"}
                sub={balanceInfo ? `${balanceInfo.payment_count.toLocaleString()}건` : undefined}
              />
              <StatCard
                icon={<CircleDollarSign size={12} />} color="rose" label="현재 잔액"
                value={balanceInfo ? fmtWon(balanceInfo.balance) : "-"}
                sub={balanceInfo && balanceInfo.balance > 0 ? "미결제" : balanceInfo && balanceInfo.balance < 0 ? "선지급" : undefined}
              />
            </div>

            {/* 결제 등록 버튼 + 상태 메시지 */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowPayModal(true)}
                className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold shadow-sm transition cursor-pointer"
              >
                <Plus size={13} strokeWidth={2.5} />
                결제 등록
              </button>
              <button
                onClick={loadPaymentData}
                disabled={paymentLoading}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-[12px] font-semibold transition cursor-pointer disabled:opacity-50"
                title="새로고침"
              >
                <RefreshCw size={12} className={paymentLoading ? "animate-spin" : ""} />
                새로고침
              </button>
              {payMsg && (
                <span className={`inline-flex items-center gap-1 text-[12px] font-bold ${payMsg.type === "ok" ? "text-emerald-600" : "text-rose-600"}`}>
                  {payMsg.type === "ok" ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}
                  {payMsg.text}
                </span>
              )}
              <span className="ml-auto text-[11px] text-slate-400 font-mono tabular-nums">
                {ledgerRows.length} 원장 항목
              </span>
            </div>

            {/* 원장 테이블 · 시간순 desc */}
            <div className="rounded-lg border border-slate-200 overflow-auto max-h-[420px] bg-white">
              {paymentLoading ? (
                <div className="flex items-center justify-center gap-1.5 py-8 text-slate-400 text-[12px]">
                  <Loader2 size={14} className="animate-spin" />로딩중...
                </div>
              ) : ledgerRows.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-[12px]">거래 내역 없음</div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                    <tr className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                      <th className="text-left px-3 py-2 w-20">날짜</th>
                      <th className="text-left px-3 py-2 w-16">유형</th>
                      <th className="text-right px-3 py-2 w-24">금액</th>
                      <th className="text-left px-3 py-2 w-16">방법</th>
                      <th className="text-left px-3 py-2">메모 / 상품</th>
                      <th className="text-right px-3 py-2 w-24">잔액</th>
                      <th className="text-center px-2 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {ledgerRows.slice().reverse().map((r) => {
                      const isPay = r.type === "payment";
                      const paymentRow = isPay ? payments.find(p => p.id === r.id) : null;
                      return (
                        <tr key={`${r.type}-${r.id}`} className="hover:bg-slate-50/60 transition">
                          <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500 whitespace-nowrap tabular-nums">
                            {String(r.date).slice(2)}
                          </td>
                          <td className="px-3 py-1.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              isPay ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                            }`}>
                              {isPay ? "결제" : "매입"}
                            </span>
                          </td>
                          <td className={`text-right px-3 py-1.5 font-mono font-bold whitespace-nowrap tabular-nums ${
                            isPay ? "text-emerald-700" : "text-indigo-700"
                          }`}>
                            {isPay ? "-" : "+"}{Number(r.amount).toLocaleString()}
                          </td>
                          <td className="px-3 py-1.5 text-[11px] text-slate-600">
                            {r.method ? (METHOD_LABEL[r.method] ?? r.method) : "-"}
                          </td>
                          <td className="px-3 py-1.5 text-slate-700 break-words leading-snug text-[11px]">
                            {r.memo ?? "-"}
                            {paymentRow?.allocations && paymentRow.allocations.length > 0 && (
                              <span className="ml-1 text-[10px] font-bold text-emerald-600">· {paymentRow.allocations.length}건 매칭</span>
                            )}
                          </td>
                          <td className={`text-right px-3 py-1.5 font-mono font-bold whitespace-nowrap tabular-nums ${
                            r.running_balance > 0 ? "text-rose-700" : r.running_balance < 0 ? "text-emerald-700" : "text-slate-500"
                          }`}>
                            {Number(r.running_balance).toLocaleString()}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {isPay && (
                              <button
                                onClick={() => handleDeletePayment(r.id)}
                                className="w-6 h-6 rounded hover:bg-rose-50 text-rose-500 hover:text-rose-700 inline-flex items-center justify-center transition"
                                title="결제 삭제"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          )}

          {/* ─── 매입이력 탭 · 2026-08-04 공통 PurchaseHistoryList 사용 ─── */}
          {activeTab === "purchase" && (
          <div className="space-y-3">
            <SectionTitle
              icon={<Package size={13} />}
              title="최근 매입 이력"
              color="amber"
              hint={purchLoading ? "로딩..." : `${purchases.length}건`}
            />
            <div className="rounded-lg border border-slate-200 overflow-hidden bg-white flex flex-col" style={{ maxHeight: 520 }}>
              <PurchaseHistoryList
                rows={purchases as unknown as PurchaseHistoryRow[]}
                loading={purchLoading}
                showSupplier={false}
                showProduct
                showRowNumber
                showFooterSum
                emptyText="매입 이력 없음"
              />
            </div>
          </div>
          )}

        </div>

        {/* ── 푸터 · 저장/닫기 ── */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/80 flex items-center gap-2 flex-wrap shrink-0">
          {saveMsg && (
            <span className={`inline-flex items-center gap-1 text-[12px] font-bold ${saveMsg.type === "ok" ? "text-emerald-600" : "text-rose-600"}`}>
              {saveMsg.type === "ok"
                ? <Check size={13} strokeWidth={3} />
                : <X size={13} strokeWidth={3} />}
              {saveMsg.text}
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="h-8 px-4 text-[12px] font-semibold bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-slate-700 transition cursor-pointer"
          >
            닫기
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="inline-flex items-center gap-1.5 h-8 px-5 text-[12px] font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition shadow-sm cursor-pointer"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={2.5} />}
            저장
          </button>
        </div>

        {/* 결제 등록 모달 (2026-07-31) */}
        {showPayModal && (
          <PaymentRegisterModal
            supplierName={vendor.company_name}
            onClose={() => setShowPayModal(false)}
            onSaved={async () => {
              setShowPayModal(false);
              setPayMsg({ type: "ok", text: "결제 등록 완료" });
              await loadPaymentData();
            }}
          />
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// 결제 등록 모달 · Odoo 스타일 · 매입건 체크박스 매칭 · unallocated 허용
// 2026-07-31 · 사용자 요청 · 결제·잔고 관리 시스템
// ═══════════════════════════════════════════════════════════════════
const METHOD_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "transfer", label: "이체" },
  { key: "cash",     label: "현금" },
  { key: "card",     label: "카드" },
  { key: "check",    label: "수표" },
  { key: "offset",   label: "상계" },
  { key: "etc",      label: "기타" },
];

const todayYmd = (): string => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

const PaymentRegisterModal: React.FC<{
  supplierName: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ supplierName, onClose, onSaved }) => {
  const [paymentDate, setPaymentDate] = useState<string>(todayYmd());
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("transfer");
  const [memo, setMemo] = useState<string>("");
  const [invoices, setInvoices] = useState<OpenInvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  // invoice_id → { checked, allocated_amount(string) }
  const [allocMap, setAllocMap] = useState<Map<number, { checked: boolean; alloc: string }>>(new Map());

  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 미결제 매입건 로드
  useEffect(() => {
    setLoading(true);
    fetch(`/api/supplier-open-invoices?supplier=${encodeURIComponent(supplierName)}`)
      .then(r => r.ok ? r.json() : { rows: [] })
      .then(j => {
        const rows: OpenInvoiceRow[] = Array.isArray(j.rows) ? j.rows : [];
        // paid 는 아래로 · open/partial 상단
        rows.sort((a, b) => {
          const sw = (s: string) => s === "open" ? 0 : s === "partial" ? 1 : 2;
          const d = sw(a.status) - sw(b.status);
          return d !== 0 ? d : String(b.date).localeCompare(String(a.date));
        });
        setInvoices(rows);
        const m = new Map<number, { checked: boolean; alloc: string }>();
        rows.forEach(r => m.set(r.id, { checked: false, alloc: String(Math.max(0, Math.round(r.remaining))) }));
        setAllocMap(m);
      })
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  }, [supplierName]);

  const amountNum = Number(String(amount).replace(/[^0-9.-]/g, "")) || 0;
  const allocSum = useMemo(() => {
    let s = 0;
    for (const [, v] of allocMap) {
      if (v.checked) s += Number(v.alloc) || 0;
    }
    return s;
  }, [allocMap]);
  const diff = amountNum - allocSum;

  const toggleCheck = (id: number) => {
    setAllocMap(prev => {
      const n = new Map<number, { checked: boolean; alloc: string }>(prev);
      const v = n.get(id);
      if (v) n.set(id, { ...v, checked: !v.checked });
      return n;
    });
  };

  const updateAlloc = (id: number, val: string) => {
    setAllocMap(prev => {
      const n = new Map<number, { checked: boolean; alloc: string }>(prev);
      const v = n.get(id);
      if (v) n.set(id, { ...v, alloc: val });
      return n;
    });
  };

  const autoAllocate = () => {
    // 결제금액을 위에서부터 잔여금액만큼 자동 배분
    let remainingBudget = amountNum;
    setAllocMap(prev => {
      const n = new Map<number, { checked: boolean; alloc: string }>(prev);
      for (const inv of invoices) {
        if (inv.status === "paid" || inv.remaining <= 0) continue;
        if (remainingBudget <= 0) {
          const v = n.get(inv.id);
          if (v) n.set(inv.id, { ...v, checked: false, alloc: String(Math.round(inv.remaining)) });
          continue;
        }
        const take = Math.min(remainingBudget, inv.remaining);
        n.set(inv.id, { checked: true, alloc: String(Math.round(take)) });
        remainingBudget -= take;
      }
      return n;
    });
  };

  const handleSubmit = async () => {
    setErrMsg(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      setErrMsg("날짜는 YYYY-MM-DD 형식이어야 합니다");
      return;
    }
    if (amountNum <= 0) {
      setErrMsg("결제 금액은 양수여야 합니다");
      return;
    }
    if (diff < -0.5) {
      setErrMsg(`배분 총액이 결제 금액을 초과합니다 (차이 ${diff.toLocaleString()})`);
      return;
    }
    const allocations: Array<{ ocr_confirmed_item_id: number; allocated_amount: number }> = [];
    for (const [id, v] of allocMap) {
      if (v.checked) {
        const a = Number(v.alloc) || 0;
        if (a > 0) allocations.push({ ocr_confirmed_item_id: id, allocated_amount: a });
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/supplier-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_name: supplierName,
          payment_date: paymentDate,
          amount: amountNum,
          method,
          memo: memo.trim() || null,
          allocations,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `서버 ${res.status}`);
      }
      onSaved();
    } catch (e: any) {
      setErrMsg(`저장 실패: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl h-[92vh] md:h-auto md:max-h-[88vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <Wallet size={18} className="text-emerald-700" />
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-black text-slate-800 truncate leading-tight">결제 등록</div>
              <div className="text-[11px] text-slate-500 truncate">{supplierName}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0 ml-3 transition"
            title="닫기 (ESC)"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* 결제 정보 */}
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-3">
            <Field label="결제 날짜 *">
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="결제 금액 (원) *">
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0"
                className={`${inputCls} text-right font-mono tabular-nums font-bold`}
              />
              {amountNum > 0 && (
                <p className="text-[11px] text-slate-400 mt-1 text-right font-mono">{fmtWon(amountNum)}</p>
              )}
            </Field>
            <Field label="결제 방법">
              <select
                value={method}
                onChange={e => setMethod(e.target.value)}
                className={inputCls}
              >
                {METHOD_OPTIONS.map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="메모">
            <input
              type="text"
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="예: 6월분 결제 · 상계 처리 · 세금계산서 매칭 등"
              className={inputCls}
            />
          </Field>

          {/* 매입건 매칭 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <SectionTitle
                icon={<Package size={13} />}
                title="매입건 매칭 (선택)"
                color="amber"
                hint={loading ? "로딩..." : `${invoices.filter(i => i.status !== "paid").length}건 미결제`}
              />
              <button
                onClick={autoAllocate}
                disabled={amountNum <= 0 || loading}
                className="inline-flex items-center gap-1 h-7 px-3 text-[11px] font-bold rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition cursor-pointer shadow-sm"
                title="상단부터 결제금액만큼 자동 배분"
              >
                <TrendingUp size={11} strokeWidth={2.5} />
                자동 배분
              </button>
            </div>

            <div className="rounded-lg border border-slate-200 overflow-auto max-h-[300px] bg-white">
              {loading ? (
                <div className="flex items-center justify-center gap-1.5 py-8 text-slate-400 text-[12px]">
                  <Loader2 size={14} className="animate-spin" />로딩중...
                </div>
              ) : invoices.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-[12px]">
                  매입건 없음 · 결제만 등록 (unallocated payment)
                </div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                    <tr className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                      <th className="px-2 py-2 w-8"></th>
                      <th className="text-left px-3 py-2 w-20">일자</th>
                      <th className="text-left px-3 py-2">상품</th>
                      <th className="text-right px-3 py-2 w-20">매입액</th>
                      <th className="text-right px-3 py-2 w-20">잔액</th>
                      <th className="text-right px-3 py-2 w-24">배분</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {invoices.map(inv => {
                      const v = allocMap.get(inv.id);
                      const disabled = inv.status === "paid";
                      return (
                        <tr key={inv.id} className={`transition ${disabled ? "bg-slate-50/50 opacity-50" : "hover:bg-teal-50/40"}`}>
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={v?.checked ?? false}
                              disabled={disabled}
                              onChange={() => toggleCheck(inv.id)}
                              className="w-4 h-4 accent-teal-600 cursor-pointer disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500 whitespace-nowrap tabular-nums">
                            {String(inv.date).slice(2)}
                          </td>
                          <td className="px-3 py-1.5 text-slate-700 break-words leading-snug text-[11px]">
                            {inv.product_name}
                            {inv.status === "partial" && <span className="ml-1 text-[10px] font-bold text-amber-600">· 부분</span>}
                            {inv.status === "paid" && <span className="ml-1 text-[10px] font-bold text-slate-400">· 완납</span>}
                          </td>
                          <td className="text-right px-3 py-1.5 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            {Number(inv.amount).toLocaleString()}
                          </td>
                          <td className={`text-right px-3 py-1.5 font-mono font-bold tabular-nums whitespace-nowrap ${
                            inv.remaining > 0 ? "text-rose-700" : "text-slate-400"
                          }`}>
                            {Number(inv.remaining).toLocaleString()}
                          </td>
                          <td className="text-right px-2 py-1">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={v?.alloc ?? ""}
                              disabled={disabled || !v?.checked}
                              onChange={e => updateAlloc(inv.id, e.target.value.replace(/[^0-9]/g, ""))}
                              className="w-full h-7 px-2 text-right text-[11px] font-mono tabular-nums border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-teal-400 focus:border-teal-400 disabled:bg-slate-50 disabled:text-slate-400"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* 합계 요약 */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
              <div className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">결제 금액</div>
              <div className="text-sm font-black font-mono tabular-nums text-emerald-800 mt-0.5">{amountNum.toLocaleString()}</div>
            </div>
            <div className="rounded-lg bg-teal-50 border border-teal-200 px-3 py-2">
              <div className="text-[10px] font-black uppercase text-teal-600 tracking-wider">배분 총액</div>
              <div className="text-sm font-black font-mono tabular-nums text-teal-800 mt-0.5">{allocSum.toLocaleString()}</div>
            </div>
            <div className={`rounded-lg border px-3 py-2 ${
              Math.abs(diff) < 0.5 ? "bg-emerald-50 border-emerald-200"
              : diff > 0            ? "bg-amber-50 border-amber-200"
              :                       "bg-rose-50 border-rose-200"
            }`}>
              <div className={`text-[10px] font-black uppercase tracking-wider ${
                Math.abs(diff) < 0.5 ? "text-emerald-600" : diff > 0 ? "text-amber-600" : "text-rose-600"
              }`}>
                {Math.abs(diff) < 0.5 ? "일치" : diff > 0 ? "미배분" : "초과"}
              </div>
              <div className={`text-sm font-black font-mono tabular-nums mt-0.5 ${
                Math.abs(diff) < 0.5 ? "text-emerald-800" : diff > 0 ? "text-amber-800" : "text-rose-800"
              }`}>
                {diff.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/80 flex items-center gap-2 flex-wrap shrink-0">
          {errMsg && (
            <span className="inline-flex items-center gap-1 text-[12px] font-bold text-rose-600">
              <X size={13} strokeWidth={3} />
              {errMsg}
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="h-8 px-4 text-[12px] font-semibold bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-slate-700 transition cursor-pointer"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || amountNum <= 0}
            className="inline-flex items-center gap-1.5 h-8 px-5 text-[12px] font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition shadow-sm cursor-pointer"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={2.5} />}
            결제 등록
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── 공용 UI 헬퍼 ────────────────────────────────────────────────

/** shadcn form input · h-9 · focus ring teal */
const inputCls =
  "w-full h-9 px-3 text-[13px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 bg-white transition placeholder:text-slate-300";

// 2026-08-10 · 사용자 요청 · Field 라벨 크기 +1 (14→15) · 살짝 굵게 (medium → semibold)
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block space-y-1">
    <span className="text-[15px] font-semibold text-slate-600 tracking-tight">{label}</span>
    {children}
  </label>
);

// 2026-08-09 · 거래처 로그인 비밀번호 필드 제거 · 자동 규칙으로 대체 (전화번호 + "00")
//   · vendors.password_hash 컬럼 사용 안 함 (auth.ts vendor-login 에서 규칙 기반 비교)

const colorMap = {
  sky:     { bar: "bg-sky-500",     text: "text-sky-700",     icon: "text-sky-600"     },
  emerald: { bar: "bg-emerald-500", text: "text-emerald-700", icon: "text-emerald-600" },
  amber:   { bar: "bg-amber-500",   text: "text-amber-700",   icon: "text-amber-600"   },
  rose:    { bar: "bg-rose-500",    text: "text-rose-700",    icon: "text-rose-600"    },
  teal:    { bar: "bg-teal-500",    text: "text-teal-700",    icon: "text-teal-600"    },
  indigo:  { bar: "bg-indigo-500",  text: "text-indigo-700",  icon: "text-indigo-600"  },
  violet:  { bar: "bg-violet-500",  text: "text-violet-700",  icon: "text-violet-600"  },
} as const;

type ColorKey = keyof typeof colorMap;

// 2026-08-10 · 사용자 요청 · 아이콘 제거 · 제목 폰트 +2 (13→15)
const SectionTitle: React.FC<{
  icon?: React.ReactNode;
  title: string;
  color: ColorKey;
  hint?: string;
}> = ({ title, color, hint }) => {
  const c = colorMap[color];
  return (
    <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100">
      <span className={`w-1 h-4 rounded-full ${c.bar} shrink-0`} />
      <span className={`text-[15px] font-black ${c.text}`}>{title}</span>
      {hint && <span className="ml-auto text-[12px] text-slate-400 font-mono tabular-nums">{hint}</span>}
    </div>
  );
};

const statColorMap: Record<string, string> = {
  emerald: "from-emerald-50 to-emerald-100/50 border-emerald-200 text-emerald-800",
  indigo:  "from-indigo-50 to-indigo-100/50 border-indigo-200 text-indigo-800",
  violet:  "from-violet-50 to-violet-100/50 border-violet-200 text-violet-800",
  rose:    "from-rose-50 to-rose-100/50 border-rose-200 text-rose-800",
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  color: "emerald" | "indigo" | "violet" | "rose";
  label: string;
  value: string;
  sub?: string;
}> = ({ icon, color, label, value, sub }) => (
  <div className={`bg-gradient-to-br ${statColorMap[color]} border rounded-xl px-3 py-2.5 shadow-sm`}>
    <div className="flex items-center gap-1 text-[10px] font-black opacity-70 uppercase tracking-wider mb-1">
      {icon}<span>{label}</span>
    </div>
    <div className="text-sm font-black font-mono truncate" title={value}>{value}</div>
    {sub && <div className="text-[10px] font-semibold opacity-60 mt-0.5 truncate" title={sub}>{sub}</div>}
  </div>
);
