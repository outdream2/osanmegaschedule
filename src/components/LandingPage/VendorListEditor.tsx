// src/components/LandingPage/VendorListEditor.tsx
// 공급사관리 · 한 줄 테이블 리스트 + 상세 모달 (2026-07-30 UI 리디자인)
// 2026-08-17 · apiClient 마이그레이션
//   리스트: shadcn data-table 스타일 · 그룹 컬러 헤더 · h-8 툴바
//   모달:   헤더 gradient · 폼 h-9 · 매입이력 shadcn 스타일 · 하단 저장/닫기 통일

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { api } from "../../lib/apiClient";
import { useConfirm } from "../../hooks/useConfirm";
import { useVendors } from "../../hooks/useVendors";
import {
  Search, Check, X, Building2, Package, Calendar,
  DollarSign, TrendingUp, RefreshCw, ChevronRight, ChevronDown, ChevronUp,
  Wallet, Plus, Trash2, CircleDollarSign, User2, Phone,
} from "lucide-react";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
// 2026-08-03 · 공급사명 표시 정제 · 법인접두어("(주)"·"주식회사"·"㈜") 및 vat 부가정보 제거
import { displayVendorName } from "../../utils/vendorNameNormalize";
// 2026-08-04 · 매입이력 공통 리스트 컴포넌트
import { PurchaseHistoryList, type PurchaseHistoryRow } from "../common/PurchaseHistoryList";
import { PeriodSelector, PERIOD_MONTHS_PRESET } from "../common/PeriodSelector";
import { CategoryChips, type ChipTone } from "../common/CategoryChips";
import { StatusPill } from "../common/StatusPill";
import { fmtWonCompact } from "../../lib/format";
// 2026-08-09 · 신규 공급사 등록 모달 (사용자 요청)
import { NewVendorModal } from "../common/features/NewVendorModal";
import { IconTile } from "../common/IconTile";
import { Spinner } from "../common/Spinner";

interface VendorListEditorProps {
  // 기존 API 호환용 · 무시됨 (모달 방식으로 통일)
  mode?: "dashboard" | "raw";
  initialSelectedId?: number | null;
  onEditRequest?: (vendorId: number) => void;
  /** 2026-07-16 · 좌우 split 좌측용 컴팩트 모드 · 공급사명·사업자번호·담당자 3컬럼만 */
  compact?: boolean;
}

// 2026-08-21 · Framework Phase 4 · large-file 분리 · types + utils
import type { Vendor, EditDraft, CompactSortKey } from "./VendorListEditor.types";
import {
  detectVatIncluded, vatDraftVal, emptyDraft, normalizeBizNum, formatBizNum,
  fmtWon, CATEGORY_LEFT_BORDER, CATEGORY_LEFT_BG, normalizeSupplierKey, inputCls,
  METHOD_LABEL,
} from "./VendorListEditor.utils";
// 2026-08-21 · Framework Phase 4 · PaymentRegisterModal 별도 파일 이관
import { PaymentRegisterModal } from "./PaymentRegisterModal";
// 2026-08-22 · Framework Phase 4 · VendorDetailModal 별도 파일 이관 · re-export (하위호환)
import { VendorDetailModal } from "./VendorDetailModal";
export { VendorDetailModal };
// 하위호환 · 기존 외부 참조 유지
export type { Vendor };
export { detectVatIncluded };

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
        const { data: j } = await api.get<any>(`/api/stock-manage/supplier-purchases?months=${aggregateMonths}&limit=50000`);
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
        <div className="flex flex-col gap-1.5 bg-white rounded-xl border border-line shadow-sm px-3 py-2">
          {/* 검색 + 새로고침 */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="회사명 · 담당자 · 전화"
                className="h-7 pl-7 pr-2 text-[12px] border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep w-full transition"
              />
            </div>
            {/* 건수 */}
            <span className="text-[11px] text-zinc-400 tabular-nums whitespace-nowrap shrink-0">
              {loading
                ? <Spinner size={10} tone="zinc" />
                : `${filtered.length}건`}
            </span>
            <button
              onClick={loadVendors}
              disabled={loading}
              className="inline-flex items-center justify-center h-7 w-7 shrink-0 border border-line rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 transition-colors cursor-pointer"
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
                className={`h-6 px-2 rounded-md text-[10px] font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  categoryFilter === cat
                    ? "bg-brand-deep text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md"
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
        <div className="flex items-center gap-2 flex-wrap bg-white rounded-xl border border-line shadow-sm px-3 py-2">
          <div className="relative flex-1 min-w-[200px] sm:min-w-[260px] sm:flex-none">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="회사명 · 사업자번호 · 담당자 · 전화 · 이메일"
              className="h-8 pl-8 pr-3 text-[12px] border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep w-full sm:w-80 transition"
            />
          </div>
          {/* 2026-08-17 · CategoryChips 프레임워크 통일 · status dot per identity */}
          <CategoryChips
            value={categoryFilter}
            onChange={(v) => setCategoryFilter(String(v))}
            size="sm"
            ariaLabel="공급사 카테고리 필터"
            options={(["전체", "위탁", "선결제", "60회전", "90회전", "기타"] as const).map(cat => ({
              value: cat,
              label: cat,
              tone: (cat === "전체"    ? "zinc"
                   : cat === "위탁"    ? "violet"
                   : cat === "선결제"  ? "rose"
                   : cat === "60회전" ? "emerald"
                   : cat === "90회전" ? "teal"
                   : "zinc") as ChipTone,
            }))}
          />
          {/* 2026-08-09 · 사업자번호 미등록 필터 · 사용자 요청 · 제거 */}
          <span className="text-[12px] text-zinc-400 tabular-nums">
            {loading
              ? <Spinner size={11} tone="zinc" label="로딩..." labelSize={12} />
              : `${filtered.length} / ${vendors.length}건`}
          </span>
          {/* 2026-08-09 · 신규 공급사 등록 · 사용자 요청 · dashboard/일반 모드 */}
          <button
            onClick={() => setShowNewVendor(true)}
            className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[12px] font-bold shadow-sm transition cursor-pointer"
            title="신규 공급사 등록"
          >
            <Plus size={12} strokeWidth={2.5} />
            신규 공급사
          </button>
          <button
            onClick={loadVendors}
            disabled={loading}
            className="inline-flex items-center justify-center h-8 w-8 border border-line rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 transition-colors cursor-pointer"
            title="새로고침"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      )}

      {/* ── compact 모드: 표 형식 리스트 (헤더 정렬 · 결제/공급사 컬럼) ── */}
      {/* 2026-08-04 · #101 · 컬럼 재정비 · 5개 (공급사·총잔고·총재고자산·총판매액·최근매입) */}
      {compact ? (
        <div className="flex-1 min-h-0 overflow-auto bg-white rounded-xl border border-line shadow-sm">
          <table className="w-full min-w-[420px] text-xs border-collapse">
            <thead>
              <tr>
                {/* 공급사 헤더 (분류+이름 stacked) · 2026-08-04 #68 · 활성 컬럼 subtle 배경 */}
                <th
                  onClick={() => toggleCompactSort("company_name")}
                  className={[
                    "sticky top-0 z-10 border-b border-line",
                    "text-[11px] font-bold uppercase tracking-wide whitespace-nowrap",
                    "select-none cursor-pointer hover:bg-zinc-100 transition-colors duration-100",
                    "py-1.5 text-left pl-2 pr-1 w-[140px]",
                    compactSortKey === "company_name" ? "text-indigo-600 bg-indigo-50/70" : "text-zinc-500 bg-zinc-50",
                  ].join(" ")}
                >
                  <span className="inline-flex items-center gap-0.5">
                    공급사
                    {compactSortKey === "company_name"
                      ? (compactSortDir === "asc"
                          ? <ChevronUp size={9} className="text-indigo-500 ml-0.5 shrink-0" />
                          : <ChevronDown size={9} className="text-indigo-500 ml-0.5 shrink-0" />)
                      : <ChevronUp size={9} className="text-zinc-300 ml-0.5 shrink-0" />}
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
                    "sticky top-0 z-10 border-b border-line",
                    "text-[11px] font-bold uppercase tracking-wide whitespace-nowrap",
                    "select-none cursor-pointer hover:bg-zinc-100 transition-colors duration-100",
                    "py-1.5 text-right pr-2 pl-1 w-20",
                    compactSortKey === "balance" ? "text-indigo-600 bg-indigo-50/70" : "text-zinc-500 bg-zinc-50",
                  ].join(" ")}
                  title="공급사별 최근 청구 잔고"
                >
                  <span className="inline-flex items-center flex-row-reverse gap-0.5">
                    총잔고
                    {compactSortKey === "balance"
                      ? (compactSortDir === "asc" ? <ChevronUp size={9} className="text-indigo-500 mr-0.5 shrink-0" /> : <ChevronDown size={9} className="text-indigo-500 mr-0.5 shrink-0" />)
                      : <ChevronDown size={9} className="text-zinc-300 mr-0.5 shrink-0" />}
                  </span>
                </th>
                {/* 총재고자산 · 우측 정렬 · 최근 3개월 · totalStockAmount */}
                <th
                  onClick={() => toggleCompactSort("stock_value")}
                  className={[
                    "sticky top-0 z-10 border-b border-line",
                    "text-[11px] font-bold uppercase tracking-wide whitespace-nowrap",
                    "select-none cursor-pointer hover:bg-zinc-100 transition-colors duration-100",
                    "py-1.5 text-right pr-2 pl-1 w-20",
                    compactSortKey === "stock_value" ? "text-indigo-600 bg-indigo-50/70" : "text-zinc-500 bg-zinc-50",
                  ].join(" ")}
                  title="공급사 상품 재고 총액 · 최근 3개월 stock_history 합계"
                >
                  <span className="inline-flex items-center flex-row-reverse gap-0.5">
                    총재고자산
                    {compactSortKey === "stock_value"
                      ? (compactSortDir === "asc" ? <ChevronUp size={9} className="text-indigo-500 mr-0.5 shrink-0" /> : <ChevronDown size={9} className="text-indigo-500 mr-0.5 shrink-0" />)
                      : <ChevronDown size={9} className="text-zinc-300 mr-0.5 shrink-0" />}
                  </span>
                </th>
                {/* 총판매액 · 우측 정렬 · 최근 3개월 · saleAmount proxy */}
                <th
                  onClick={() => toggleCompactSort("sales_total")}
                  className={[
                    "sticky top-0 z-10 border-b border-line",
                    "text-[11px] font-bold uppercase tracking-wide whitespace-nowrap",
                    "select-none cursor-pointer hover:bg-zinc-100 transition-colors duration-100",
                    "py-1.5 text-right pr-2 pl-1 w-20",
                    compactSortKey === "sales_total" ? "text-indigo-600 bg-indigo-50/70" : "text-zinc-500 bg-zinc-50",
                  ].join(" ")}
                  title="공급사 상품 판매 총액 · 최근 3개월"
                >
                  <span className="inline-flex items-center flex-row-reverse gap-0.5">
                    총판매액
                    {compactSortKey === "sales_total"
                      ? (compactSortDir === "asc" ? <ChevronUp size={9} className="text-indigo-500 mr-0.5 shrink-0" /> : <ChevronDown size={9} className="text-indigo-500 mr-0.5 shrink-0" />)
                      : <ChevronDown size={9} className="text-zinc-300 mr-0.5 shrink-0" />}
                  </span>
                </th>
                {/* 최근매입 */}
                <th
                  onClick={() => toggleCompactSort("invoice_date")}
                  className={[
                    "sticky top-0 z-10 border-b border-line",
                    "text-[11px] font-bold uppercase tracking-wide whitespace-nowrap",
                    "select-none cursor-pointer hover:bg-zinc-100 transition-colors duration-100",
                    "py-1.5 text-left px-2 w-16",
                    compactSortKey === "invoice_date" ? "text-indigo-600 bg-indigo-50/70" : "text-zinc-500 bg-zinc-50",
                  ].join(" ")}
                >
                  <span className="inline-flex items-center gap-0.5">
                    최근매입
                    {compactSortKey === "invoice_date"
                      ? (compactSortDir === "asc" ? <ChevronUp size={9} className="text-indigo-500 ml-0.5 shrink-0" /> : <ChevronDown size={9} className="text-indigo-500 ml-0.5 shrink-0" />)
                      : <ChevronUp size={9} className="text-zinc-300 ml-0.5 shrink-0" />}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {compactSorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-zinc-400">
                      <Building2 size={28} className="opacity-25" />
                      <span className="text-[13px] font-semibold">
                        {loading ? "로딩 중..." : search ? "검색 결과 없음" : "공급사 없음"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : compactSorted.map((v) => {
                const isActive  = activeId === v.id;
                const catBorder = v.category ? (CATEGORY_LEFT_BORDER[v.category] ?? "border-l-zinc-200") : "border-l-zinc-200";
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
                        : `${catBorder} ${catBg} hover:bg-zinc-50/80 active:bg-zinc-100`,
                    ].join(" ")}
                  >
                    {/* 공급사: 분류(위·색상) + 이름(아래·bold) */}
                    <td className="pl-2 pr-1 py-1.5 min-w-[120px] max-w-[160px]">
                      <div className="leading-tight">
                        <VendorCategoryBadge category={v.category} className="text-[10px] mb-0.5" />
                        <div className={`text-[13px] font-bold break-keep leading-snug ${isActive ? "text-indigo-900" : "text-zinc-800"}`}
                          title={v.company_name}>
                          {displayVendorName(v.company_name) || v.company_name}
                        </div>
                      </div>
                    </td>
                    {/* 총잔고 · 우측 정렬 */}
                    <td className="pr-2 pl-1 py-1.5 text-right whitespace-nowrap">
                      {hasBal
                        ? (
                          <span className={`text-[12px] font-bold tabular-nums ${v.latestBalance!.balance > 0 ? "text-emerald-600" : "text-zinc-400"}`}>
                            {fmtWon(v.latestBalance!.balance)}
                          </span>
                        )
                        : <span className="text-[10px] text-zinc-300">-</span>}
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
                        : <span className="text-[10px] text-zinc-300">-</span>}
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
                        : <span className="text-[10px] text-zinc-300">-</span>}
                    </td>
                    {/* 최근매입 */}
                    <td className="px-2 py-1.5 text-[11px] text-zinc-500 tabular-nums whitespace-nowrap">
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
        <div className="flex-1 min-h-0 overflow-auto bg-white rounded-xl border border-line shadow-sm">

          {/* 모바일(< md): 카드 · compactSorted 사용 (헤더 정렬이 mobile 에도 적용되도록 · 2026-08-04 #68) */}
          <div className="md:hidden divide-y divide-zinc-100">
            {compactSorted.length === 0 ? (
              <div className="text-center py-10 text-zinc-400 text-sm font-semibold">
                {loading ? "로딩 중..." : search ? "검색 결과 없음" : "공급사 데이터 없음"}
              </div>
            ) : compactSorted.map((v, i) => (
              <button
                key={v.id}
                onClick={() => handleVendorClick(v.id)}
                className="w-full text-left px-3 py-2.5 hover:bg-teal-50/60 active:bg-teal-100 transition"
              >
                <div className="flex items-start gap-2">
                  <span className="text-[11px] text-zinc-400 mt-0.5 w-6 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                      <Building2 size={11} className="text-teal-500 shrink-0" />
                      <span className="text-[13px] font-bold text-zinc-800 break-words">{v.company_name}</span>
                      <VendorCategoryBadge category={v.category} />
                    </div>
                    <div className="text-[11px] text-zinc-500 flex items-center gap-1.5 flex-wrap">
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
            <thead className="sticky top-0 bg-white z-10 border-b border-line">
              {/* 그룹 컬러 헤더 */}
              <tr className="text-[10px] font-bold uppercase tracking-wider border-b border-zinc-100">
                <th colSpan={4} className="text-center py-1.5 bg-sky-50 text-sky-700 border-r border-zinc-100">
                  기본 정보
                </th>
                {/* 연락처 (amber) · 클릭 접기 */}
                <th colSpan={isVendorGroupCollapsed("contact") ? 1 : 2}
                  className="text-center py-1.5 bg-amber-50 text-amber-700 border-r border-zinc-100 cursor-pointer select-none hover:bg-amber-100 transition"
                  onClick={() => toggleVendorGroup("contact")}
                  title={isVendorGroupCollapsed("contact") ? "연락처 펼치기" : "연락처 접기"}>
                  <span className="inline-flex items-center gap-1">
                    {isVendorGroupCollapsed("contact") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}연락처
                  </span>
                </th>
                {/* 잔고 (emerald) · 클릭 접기 */}
                <th colSpan={1}
                  className="text-center py-1.5 bg-emerald-50 text-emerald-700 border-r border-zinc-100 cursor-pointer select-none hover:bg-emerald-100 transition"
                  onClick={() => toggleVendorGroup("balance")}
                  title={isVendorGroupCollapsed("balance") ? "잔고 펼치기" : "잔고 접기"}>
                  <span className="inline-flex items-center gap-1">
                    {isVendorGroupCollapsed("balance") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}잔고
                  </span>
                </th>
                {/* 기타 (slate) · 클릭 접기 */}
                <th colSpan={isVendorGroupCollapsed("etc") ? 1 : 2}
                  className="text-center py-1.5 bg-zinc-50 text-zinc-500 cursor-pointer select-none hover:bg-zinc-100 transition"
                  onClick={() => toggleVendorGroup("etc")}
                  title={isVendorGroupCollapsed("etc") ? "기타 펼치기" : "기타 접기"}>
                  <span className="inline-flex items-center gap-1">
                    {isVendorGroupCollapsed("etc") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}기타
                  </span>
                </th>
              </tr>
              {/* 서브 헤더 · 2026-08-04 · A-2 · 모든 컬럼 헤더 클릭 정렬 · 화살표 표시 */}
              <tr className="text-[11px] text-zinc-500 uppercase tracking-wider">
                <th className="text-left px-2 py-1.5 w-8 bg-sky-50/30">#</th>
                {(() => {
                  const arrow = (k: CompactSortKey) => compactSortKey !== k
                    ? <ChevronUp size={9} className="text-zinc-300 ml-0.5 inline shrink-0" />
                    : compactSortDir === "asc"
                      ? <ChevronUp size={9} className="text-teal-600 ml-0.5 inline shrink-0" />
                      : <ChevronDown size={9} className="text-teal-600 ml-0.5 inline shrink-0" />;
                  const sortableCls = (k: CompactSortKey, base: string) =>
                    `${base} cursor-pointer select-none hover:bg-zinc-100 transition ${compactSortKey === k ? "text-teal-700" : ""}`;
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
                      <th className="bg-zinc-50/20 w-4"></th>
                    ) : (
                      <>
                        <th onClick={() => toggleCompactSort("category")}
                          className={sortableCls("category", "text-left px-3 py-1.5 w-20 hidden xl:table-cell bg-zinc-50/40")}>
                          분류{arrow("category")}
                        </th>
                        <th onClick={() => toggleCompactSort("created_at")}
                          className={sortableCls("created_at", "text-left px-3 py-1.5 w-24 hidden lg:table-cell bg-zinc-50/40")}>
                          등록일{arrow("created_at")}
                        </th>
                      </>
                    )}
                  </>;
                })()}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {compactSorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-zinc-400 font-semibold">
                    {loading ? "로딩 중..." : search ? "검색 결과 없음" : "공급사 데이터 없음"}
                  </td>
                </tr>
              ) : compactSorted.map((v, i) => (
                <tr
                  key={v.id}
                  onClick={() => handleVendorClick(v.id)}
                  className="hover:bg-zinc-50/60 cursor-pointer transition"
                  title="클릭하여 상세 · 편집"
                >
                  <td className="px-2 py-1 text-[11px] text-zinc-400 tabular-nums">{i + 1}</td>
                  <td className="px-2 py-1 text-[13px] font-semibold text-zinc-800">
                    <span className="inline-flex items-center gap-1 flex-wrap">
                      <Building2 size={11} className="text-teal-500 shrink-0" />
                      <span className="underline decoration-dotted decoration-teal-300 underline-offset-2 break-words">{v.company_name}</span>
                      <VendorCategoryBadge category={v.category} />
                    </span>
                  </td>
                  <td className="px-2 py-1 text-[11px] text-zinc-600 whitespace-nowrap">
                    {v.business_number
                      ? formatBizNum(v.business_number)
                      : <span className="text-rose-400 italic text-[10px]">없음</span>}
                  </td>
                  <td className="px-2 py-1 text-[11px] text-zinc-700 break-words whitespace-normal">{v.contact_name ?? "-"}</td>
                  {/* 연락처 그룹 */}
                  {isVendorGroupCollapsed("contact") ? (
                    <td className="bg-amber-50/10 w-4"></td>
                  ) : (
                    <>
                      <td className="px-3 py-1.5 text-[11px] text-zinc-600 whitespace-nowrap">{v.phone ?? "-"}</td>
                      <td className="px-3 py-1.5 text-[11px] text-zinc-600 break-words whitespace-normal hidden lg:table-cell">{v.email ?? "-"}</td>
                    </>
                  )}
                  {/* 잔고 그룹 */}
                  {isVendorGroupCollapsed("balance") ? (
                    <td className="bg-emerald-50/10 w-4"></td>
                  ) : (
                    <td className="px-3 py-1.5 text-right text-[11px] font-bold text-emerald-700 whitespace-nowrap">
                      {v.latestBalance?.balance != null ? fmtWon(v.latestBalance.balance) : <span className="text-zinc-300">-</span>}
                    </td>
                  )}
                  {/* 기타 그룹 */}
                  {isVendorGroupCollapsed("etc") ? (
                    <td className="bg-zinc-50/10 w-4"></td>
                  ) : (
                    <>
                      <td className="px-3 py-1.5 hidden xl:table-cell">
                        <VendorCategoryBadge category={v.category} />
                        {!v.category && <span className="text-zinc-300">-</span>}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-zinc-400 hidden lg:table-cell">
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
