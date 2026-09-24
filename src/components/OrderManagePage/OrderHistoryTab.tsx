// 2026-08-10 · #16 · 발주이력 탭 · status='ordered' · order_number GROUP
// 마이그레이션 add_order_dispatch_columns_2026-08-10.sql 실행 후 실제 데이터 노출
// 컬럼 없으면 · 서버가 empty + notice 반환 · UI 는 안내 메시지 표시
// 2026-08-12 · UI 리디자인 · 폰트 +2 · 굵기 완화 · 발주일·희망입고일 · 헤더 · 상품수 옆
// 2026-09-17 · 사용자 지시 · 헤더 한 줄 재정리 · 발주번호(위)+공급사(아래) · 발주일/희망 간단 (26/9/11) · 금액 · PDF · 매입확인
//   · 상단 헤더 + 자동 정렬 (useSortableTable) · 상세내역 시각 구분 강화
// 2026-09-24 · UI 개선 · 한눈에 들어오는 3-level 계층 · 정보 압축 · 반응형 카드 전환

import React, { useEffect, useRef, useState } from "react";
import {
  Package, ChevronDown, ChevronRight,
  Mail, Phone, User, FileDown,
  CheckCircle2, Tags,
} from "lucide-react";
// Mail/Phone/User/FileDown/CheckCircle2 → PC 테이블 상세 행에서 직접 사용
import { useSortableTable, type Comparator } from "../../hooks/useSortableTable";
import { shortDate } from "../../lib/dateFormat";
import { OrderHistoryPoCard } from "./OrderHistoryPoCard";
import type { OrderHistoryPoCardOrder } from "./OrderHistoryPoCard";
// 2026-09-08 · 사용자 지시 · 발주이력 각 행 PDF 다운 · html2canvas + jsPDF
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";
import { OrderPdfPreview } from "./OrderPdfPreview";
import type { OrderModalState } from "./OrderModal";
import { Spinner } from "../common/Spinner";
import { displayVendorName } from "../../utils/vendorNameNormalize";
import { PageToolbar } from "../common/PageToolbar";
// 2026-08-23 · #180 · 공급사·상품 검색 SearchBar
import { SearchBar } from "../common/SearchBar";
// 2026-08-29 · 상품명 검색 · 통일 로직
import { matchesProductQuery } from "../../lib/productMatch";
// 2026-08-30 · 사용자 지시 · 공급사명 검색 프로젝트 전체 endpoint 통합 · matchesSupplierQuery 프리미티브
import { matchesSupplierQuery } from "../../lib/supplierMatch";
import { GradientAccent } from "../common/GradientAccent";
import { InlineLabel } from "../common/InlineLabel";
import { PeriodSelector, PERIOD_DAYS_PRESET } from "../common/PeriodSelector";
import { StatusPill } from "../common/StatusPill";
import { Card } from "../common/Card";
// 2026-08-24 · v3 리스트 UI 프레임워크 · 사용자 지시
import { tableHeadCls, tableThCls, tableTdCls } from "../common";
// 2026-08-21 · Framework Phase 3 · fetch → apiClient
import { api, ApiError } from "../../lib/apiClient";
import { getErrorMessage } from "../../lib/errorMessage";
import { useToast, toastClass } from "../../hooks/useToast";
// 2026-08-25 · 사용자 지시 · 공급사 분류 필터 · vendors 훅 재사용
import { useVendors } from "../../hooks/useVendors";
import { useReferenceValues } from "../../hooks/useReferenceValues";
// 2026-09-13 · #117 · 매입확인 버튼 · confirm
import { useConfirm } from "../../hooks/useConfirm";


interface OrderHistoryItem {
  id: string | number;
  product_code: string;
  product_name: string;
  order_qty: number;
  unit_price: number;
  line_amount: number;
  current_stock: number | null;
  optimal_stock: number | null;
}

interface OrderHistoryOrder {
  order_number: string | null;
  order_date: string | null;
  desired_arrival: string | null;
  supplier: string;
  supplier_contact: string | null;
  supplier_email: string | null;
  supplier_phone: string | null;
  memo: string | null;
  sent_at: string;
  // 2026-09-13 · #117 · order_number 그룹의 상태 · 'ordered' (미매칭) | 'matched' (매입확인)
  status?: "ordered" | "matched";
  items: OrderHistoryItem[];
  total_qty: number;
  total_amount: number;
}

/** 발주일 → 희망일 축약 (예: "9/23→9/26") · 한 칸에 표현 */
function dateRange(orderDate: string | null, arrival: string | null): string {
  const od = shortDate(orderDate);
  const ar = shortDate(arrival);
  if (!od && !ar) return "—";
  if (!ar) return od;
  if (!od) return ar;
  return `${od}→${ar}`;
}

/** 상품 코드 뒤 4자리만 (title 로 전체 노출) */
function shortCode(code: string): string {
  if (!code) return "—";
  return code.length > 4 ? `…${code.slice(-4)}` : code;
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export const OrderHistoryTab: React.FC = () => {
  const { toast, showError, showSuccess } = useToast();
  const confirm = useConfirm();
  const [matchingKey, setMatchingKey] = useState<string | null>(null);
  // 2026-09-13 · #117 · 매입확인 · order_number 단위 · status='matched'
  const handleMatch = async (o: OrderHistoryOrder) => {
    if (!o.order_number) { showError("발주번호 없음"); return; }
    const ok = await confirm({
      message: `발주 #${o.order_number} · ${o.supplier} · ${o.items.length}종 · ${o.total_qty}개 · 매입확인 완료 처리할까요?\n\n이후 이력에 '매입확인' 배지로 표시됩니다.`,
    });
    if (!ok) return;
    const key = String(o.order_number);
    setMatchingKey(key);
    try {
      await api.patch(`/api/order-history/${encodeURIComponent(o.order_number)}/match`, {});
      setOrders(prev => prev.map(x => x.order_number === o.order_number ? { ...x, status: "matched" } : x));
      showSuccess("매입확인 완료");
    } catch (e) {
      showError(`매입확인 실패: ${getErrorMessage(e)}`);
    } finally {
      setMatchingKey(null);
    }
  };
  const [orders, setOrders] = useState<OrderHistoryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [days, setDays] = useState(90);
  // 2026-09-24 · collapsed set · 기본 open (열림이 기본) · 클릭 시 추가 = 접힘
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // 2026-09-24 · 날짜별 그룹핑 · 날짜 헤더 클릭 시 그룹 접기/펼치기
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [datesInitialized, setDatesInitialized] = useState(false);
  // 2026-09-08 · 사용자 지시 · 각 행 PDF 다운 · 오프스크린 프리뷰 + html2canvas + jsPDF
  const pdfRef = useRef<HTMLDivElement | null>(null);
  const [pdfTarget, setPdfTarget] = useState<OrderModalState | null>(null);
  const [pdfSavingKey, setPdfSavingKey] = useState<string | null>(null);
  const orderToModalState = (o: OrderHistoryOrder): OrderModalState => ({
    orderDate: o.order_date ?? o.sent_at?.slice(0, 10) ?? "",
    desiredArrival: o.desired_arrival ?? "",
    memo: o.memo ?? "",
    channels: { email: false, sms: false, kakao: false },
    suppliers: [{
      supplier: o.supplier,
      supplier_contact: o.supplier_contact,
      supplier_email: o.supplier_email,
      supplier_phone: o.supplier_phone,
      memo: o.memo ?? null,
      order_number: o.order_number ?? "",
      items: o.items.map(it => ({
        order_request_id: null,
        product_code: (it as any).product_code ?? "",
        product_name: (it as any).product_name ?? "",
        current_stock: (it as any).current_stock ?? null,
        optimal_stock: (it as any).optimal_stock ?? null,
        order_qty: (it as any).order_qty ?? 0,
        unit_price: (it as any).unit_price ?? null,
        memo: null,
      })),
    }],
  }) as unknown as OrderModalState;
  const handleDownloadPdf = async (o: OrderHistoryOrder) => {
    const key = String(o.order_number ?? o.sent_at);
    setPdfSavingKey(key);
    setPdfTarget(orderToModalState(o));
    await new Promise(r => setTimeout(r, 100));
    try {
      const node = pdfRef.current;
      if (!node) throw new Error("PDF 프리뷰를 찾을 수 없습니다");
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: node.scrollWidth });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pdfW) / canvas.width;
      if (imgH <= pdfH) {
        pdf.addImage(imgData, "PNG", 0, 0, pdfW, imgH, undefined, "FAST");
      } else {
        let yOffset = 0; let remaining = imgH;
        while (remaining > 0) {
          pdf.addImage(imgData, "PNG", 0, -yOffset, pdfW, imgH, undefined, "FAST");
          remaining -= pdfH; yOffset += pdfH;
          if (remaining > 0) pdf.addPage();
        }
      }
      const ymd = (o.sent_at ?? new Date().toISOString()).slice(0, 10).replace(/-/g, "");
      const supName = (o.supplier ?? "발주서").replace(/[\\/:*?"<>|]/g, "_");
      pdf.save(`발주서_${ymd}_${supName}_${o.order_number ?? ""}.pdf`);
    } catch (e: any) {
      showError(`PDF 다운 실패: ${e?.message ?? "오류"}`);
    } finally {
      setPdfSavingKey(null);
      setPdfTarget(null);
    }
  };
  // 2026-08-23 · #180 · A안 · 공급사·상품 별도 검색창 2개 · 클라 filter (AND)
  const [supplierSearch, setSupplierSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  // 2026-08-25 · 사용자 지시 · 공급사 분류 필터 (dropdown · 카테고리 매칭 · 건수 병기)
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const { getVendorCategory } = useVendors();
  const { vendorCategories: dbVendorCategories } = useReferenceValues();

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    setNotice(null);
    api.get<{ orders?: OrderHistoryOrder[]; notice?: string }>(`/api/order-history?days=${days}`)
      .then(({ data }) => {
        setOrders(Array.isArray(data?.orders) ? data.orders : []);
        if (data?.notice) setNotice(String(data.notice));
      })
      .catch((e: unknown) => {
        const msg = e instanceof ApiError ? e.message : getErrorMessage(e, "조회 실패");
        setError(msg);
        showError(`발주이력 조회 실패: ${msg}`);
      })
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  // 2026-09-24 · 정비 · collapsed set 기반 토글 (기본 open · 클릭 시 collapse)
  const togglePo = (k: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const fmtWon = (n: number) => n.toLocaleString() + "원";

  const orderCategory = React.useCallback((o: OrderHistoryOrder): string => {
    const s = String(displayVendorName(o.supplier ?? "")).trim();
    if (!s) return "미지정";
    return getVendorCategory(s) ?? "미지정";
  }, [getVendorCategory]);

  const filteredOrders = React.useMemo(() => {
    const qS = supplierSearch.trim().toLowerCase();
    const qP = productSearch.trim().toLowerCase();
    if (!qS && !qP && categoryFilter === "all") return orders;
    return orders.filter(o => {
      const supplierMatch = matchesSupplierQuery({ supplier: o.supplier ?? undefined }, supplierSearch);
      const productMatch = !productSearch.trim() || o.items.some(it => matchesProductQuery(it, productSearch));
      const categoryMatch = categoryFilter === "all" || orderCategory(o) === categoryFilter;
      return supplierMatch && productMatch && categoryMatch;
    });
  }, [orders, supplierSearch, productSearch, categoryFilter, orderCategory]);

  // 2026-08-25 · 공급사 분류별 건수 (검색 반영 · 분류 필터 자체는 제외)
  const categoryCounts = React.useMemo(() => {
    const base = (supplierSearch.trim() || productSearch.trim())
      ? orders.filter(o => {
          const supplierMatch = matchesSupplierQuery({ supplier: o.supplier ?? undefined }, supplierSearch);
          const productMatch = !productSearch.trim() || o.items.some(it => matchesProductQuery(it, productSearch));
          return supplierMatch && productMatch;
        })
      : orders;
    const map = new Map<string, number>();
    for (const o of base) {
      const cat = orderCategory(o);
      map.set(cat, (map.get(cat) ?? 0) + 1);
    }
    const preferred = [...dbVendorCategories, "기타", "미지정"];
    const seen = new Set<string>();
    const ordered: [string, number][] = [];
    for (const c of preferred) {
      if (map.has(c) && !seen.has(c)) { ordered.push([c, map.get(c)!]); seen.add(c); }
    }
    for (const [k, v] of map) {
      if (!seen.has(k)) { ordered.push([k, v]); seen.add(k); }
    }
    return ordered;
  }, [orders, supplierSearch, productSearch, orderCategory, dbVendorCategories]);

  const totalAmount = filteredOrders.reduce((s, o) => s + (o.total_amount ?? 0), 0);
  const totalItems = filteredOrders.reduce((s, o) => s + o.items.length, 0);

  // 2026-09-17 · 자동 정렬
  type OrderSortKey = "order_number" | "supplier" | "order_date" | "desired_arrival" | "total_amount" | "sent_at" | "items";
  const comparators = React.useMemo<Record<OrderSortKey, Comparator<OrderHistoryOrder>>>(() => ({
    order_number: (a, b) => String(a.order_number ?? "").localeCompare(String(b.order_number ?? ""), "ko", { numeric: true }),
    supplier:     (a, b) => String(displayVendorName(a.supplier) ?? "").localeCompare(String(displayVendorName(b.supplier) ?? ""), "ko"),
    order_date:   (a, b) => String(a.order_date ?? "").localeCompare(String(b.order_date ?? "")),
    desired_arrival: (a, b) => String(a.desired_arrival ?? "").localeCompare(String(b.desired_arrival ?? "")),
    total_amount: (a, b) => (a.total_amount ?? 0) - (b.total_amount ?? 0),
    sent_at:      (a, b) => String(a.sent_at ?? "").localeCompare(String(b.sent_at ?? "")),
    items:        (a, b) => a.items.length - b.items.length,
  }), []);
  const { sorted: sortedOrders, sortKey, sortDir, toggleSort } = useSortableTable<OrderHistoryOrder, OrderSortKey>(
    filteredOrders,
    "sent_at",
    comparators,
    "desc",
  );

  // 2026-09-24 · 날짜별 그룹핑
  const groupedByDate = React.useMemo(() => {
    const map = new Map<string, OrderHistoryOrder[]>();
    for (const o of sortedOrders) {
      const dateKey = String(o.order_date ?? o.sent_at?.slice(0, 10) ?? "unknown");
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(o);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [sortedOrders]);

  // 첫 로드 · 최신 날짜 자동 open
  React.useEffect(() => {
    if (!datesInitialized && groupedByDate.length > 0) {
      setExpandedDates(new Set([groupedByDate[0][0]]));
      setDatesInitialized(true);
    }
  }, [groupedByDate, datesInitialized]);

  const toggleDate = (dateKey: string) => setExpandedDates(prev => {
    const next = new Set(prev);
    if (next.has(dateKey)) next.delete(dateKey);
    else next.add(dateKey);
    return next;
  });

  // 그룹별 요약
  function groupSummary(grpOrders: OrderHistoryOrder[]) {
    let totalAmt = 0, totalItm = 0, totalQty = 0;
    for (const o of grpOrders) {
      totalAmt += Number(o.total_amount ?? 0);
      totalItm += o.items.length;
      totalQty += Number(o.total_qty ?? 0);
    }
    return { count: grpOrders.length, totalAmount: totalAmt, totalItems: totalItm, totalQty };
  }

  // ─── 정렬 헤더 헬퍼 ──────────────────────────────────────────────────────────
  const SortTh: React.FC<{
    label: string;
    col: OrderSortKey;
    className?: string;
  }> = ({ label, col, className = "" }) => (
    <th
      className={`${tableThCls("left")} cursor-pointer select-none whitespace-nowrap ${className}`}
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="text-[11px] text-zinc-400">
          {sortKey === col ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </span>
    </th>
  );

  const SortThNum: React.FC<{
    label: string;
    col: OrderSortKey;
    className?: string;
  }> = ({ label, col, className = "" }) => (
    <th
      className={`${tableThCls("num")} cursor-pointer select-none whitespace-nowrap ${className}`}
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center justify-end gap-1 w-full">
        {label}
        <span className="text-[11px] text-zinc-400">
          {sortKey === col ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </span>
    </th>
  );

  // ─── 렌더 ─────────────────────────────────────────────────────────────────────

  return (
    <>
    {toast && (
      <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
    )}
    <div className="flex flex-col gap-2">
      {/* 상단 툴바 */}
      <PageToolbar
        icon={<Package size={18} strokeWidth={2.2} />}
        title="발주이력"
        count={filteredOrders.length}
        leftSlot={
          <span className="text-[15px] font-medium text-ink-soft tracking-tight tabular-nums">
            {totalItems}종 · {fmtWon(totalAmount)}
          </span>
        }
        right={
          <div className="flex items-center gap-2">
            <InlineLabel size="sm">기간</InlineLabel>
            <PeriodSelector
              options={[
                { value: 7,   label: "7일",   title: "최근 7일" },
                { value: 30,  label: "30일",  title: "최근 30일" },
                { value: 90,  label: "90일",  title: "최근 90일" },
                { value: 180, label: "180일", title: "최근 180일" },
                { value: 365, label: "1년",   title: "최근 1년" },
              ]}
              value={days}
              onChange={(v) => setDays(v)}
              size="sm"
              ariaLabel="발주이력 조회기간"
            />
          </div>
        }
      />

      {/* 필터 바 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="relative inline-flex items-center">
          <Tags size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full h-9 pl-9 pr-8 rounded-lg bg-white border border-line text-[14px] font-semibold text-ink hover:border-brand-deep/60 focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition-colors cursor-pointer"
            title="공급사 분류 필터"
          >
            <option value="all">전체 분류</option>
            {categoryCounts.map(([cat, n]) => (
              <option key={cat} value={cat}>{cat} ({n})</option>
            ))}
          </select>
        </div>
        <SearchBar value={supplierSearch} onChange={setSupplierSearch} placeholder="공급사 검색" />
        <SearchBar value={productSearch} onChange={setProductSearch} placeholder="상품명 검색" />
      </div>

      {/* 마이그레이션 안내 */}
      {notice && (
        <Card variant="flat" bg="bg-amber-50" borderColor="border-amber-200" padding="sm" className="text-[14px] text-amber-800">
          <div className="font-bold mb-0.5">마이그레이션 필요</div>
          <div className="text-[15px] font-medium">{notice}</div>
          <div className="text-[15px] mt-1">Supabase SQL Editor 에서 실행 후 · 발주 완료 시 자동 저장 시작</div>
        </Card>
      )}

      {/* 리스트 */}
      <Card clip padding="none" className="relative">
        <GradientAccent className="z-20 rounded-t-md" />
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size={16} tone="zinc" label="불러오는 중..." labelSize={15} />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 text-[17px] font-bold">{error}</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-zinc-400 text-[17px]">
            {(supplierSearch.trim() || productSearch.trim())
              ? "검색 결과 없음 · 다른 검색어로 시도하세요"
              : "발주 이력 없음 · 발주 완료 시 여기에 표시"}
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">

            {groupedByDate.map(([dateKey, ordersOfDate]) => {
              const summary = groupSummary(ordersOfDate);
              const displayDate = dateKey === "unknown" ? "날짜 없음" : dateKey;
              const isDateOpen = expandedDates.has(dateKey);

              return (
                <React.Fragment key={`date-group-${dateKey}`}>

                  {/* ── 날짜 그룹 헤더 ─────────────────────────────────────── */}
                  <button
                    type="button"
                    onClick={() => toggleDate(dateKey)}
                    className="sticky top-0 z-[9] w-full bg-zinc-50 hover:bg-zinc-100/80 border-b border-zinc-200 px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-colors"
                  >
                    {/* chevron */}
                    <span className="text-zinc-400 shrink-0">
                      {isDateOpen
                        ? <ChevronDown size={15} strokeWidth={2.4} />
                        : <ChevronRight size={15} strokeWidth={2.4} />}
                    </span>
                    {/* 날짜 · 크고 굵게 */}
                    <span className="text-[16px] font-bold text-zinc-700 tabular-nums tracking-tight">
                      {displayDate}
                    </span>
                    {/* 구분 dot */}
                    <span className="w-1 h-1 rounded-full bg-zinc-300 shrink-0" />
                    {/* 건수 · 종수 · 수량 */}
                    <span className="text-[14px] font-medium text-zinc-500 tabular-nums">
                      {summary.count}건 · {summary.totalItems}종 · {summary.totalQty.toLocaleString()}개
                    </span>
                    {/* 금액 · 오른쪽 정렬 */}
                    <span className="ml-auto text-[16px] font-bold text-zinc-700 tabular-nums">
                      {fmtWon(summary.totalAmount)}
                    </span>
                  </button>

                  {isDateOpen && (
                    <>
                      {/* ── PC (md+) · 테이블 형태 ─────────────────────────── */}
                      <div className="hidden md:block">
                        {/* 날짜 그룹 내 컬럼 헤더 (그룹마다 반복 필요 없으나 sticky 처리 위해) */}
                        <table className="w-full text-[15px]">
                          <colgroup>
                            {/* toggle / accent bar */}
                            <col className="w-8" />
                            {/* 발주번호·공급사 */}
                            <col className="min-w-[160px]" />
                            {/* 발주→희망 */}
                            <col className="w-[110px]" />
                            {/* 종·개 */}
                            <col className="w-[88px]" />
                            {/* 총금액 */}
                            <col className="w-[110px]" />
                            {/* PDF */}
                            <col className="w-[68px]" />
                            {/* 매입확인 · 줄바꿈·말줄임표 방지 · 폭 확보 */}
                            <col className="w-[120px]" />
                          </colgroup>
                          <tbody className="divide-y divide-zinc-100">
                            {ordersOfDate.map((o) => {
                              const key = String(o.order_number ?? o.sent_at);
                              const isOpen = !collapsed.has(key);
                              const isMatched = o.status === "matched";
                              return (
                                <React.Fragment key={key}>
                                  {/* PO 행 */}
                                  <tr
                                    className={`hover:bg-zinc-50/60 transition-colors cursor-pointer group ${isMatched ? "bg-emerald-50/20" : ""}`}
                                    onClick={() => togglePo(key)}
                                  >
                                    {/* 상태 accent bar + chevron */}
                                    <td className="py-0 w-8">
                                      <div className="flex items-stretch h-full">
                                        {/* 세로 accent bar */}
                                        <div className={`w-1 self-stretch ${isMatched ? "bg-emerald-400" : "bg-sky-400"}`} />
                                        <div className="flex items-center justify-center w-7">
                                          {isOpen
                                            ? <ChevronDown size={14} className="text-zinc-400" strokeWidth={2.4} />
                                            : <ChevronRight size={14} className="text-zinc-300 group-hover:text-zinc-400" strokeWidth={2.4} />}
                                        </div>
                                      </div>
                                    </td>
                                    {/* 발주번호 (위) + 공급사 (아래) */}
                                    <td className="py-2.5 pl-1 pr-3">
                                      <div className="text-[12px] text-zinc-400 tabular-nums font-medium leading-none mb-0.5">
                                        #{o.order_number ?? "—"}
                                      </div>
                                      {/* 2026-09-24 · 사용자 지시 · 공급사 옆 · 담당자·전화·이메일 인라인 · 라벨 폰트 +2 */}
                                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 leading-snug">
                                        <span className="inline-flex items-baseline gap-1.5">
                                          <span className="text-[13px] text-zinc-400 font-semibold">공급사</span>
                                          <span className="text-[16px] font-bold text-zinc-800 whitespace-normal break-words">
                                            {displayVendorName(o.supplier) || o.supplier || "(공급사 미지정)"}
                                          </span>
                                        </span>
                                        {o.supplier_contact && (
                                          <span className="inline-flex items-center gap-1.5 text-[15px] text-zinc-600">
                                            <span className="text-[13px] text-zinc-400 font-semibold">담당자</span>{o.supplier_contact}
                                          </span>
                                        )}
                                        {o.supplier_phone && (
                                          <span className="inline-flex items-center gap-1.5 text-[15px] text-zinc-600 tabular-nums">
                                            <span className="text-[13px] text-zinc-400 font-semibold">연락처</span>{o.supplier_phone}
                                          </span>
                                        )}
                                        {o.supplier_email && (
                                          <span className="inline-flex items-center gap-1.5 text-[15px] text-zinc-600 truncate max-w-[260px]">
                                            <span className="text-[13px] text-zinc-400 font-semibold">이메일</span>{o.supplier_email}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    {/* 발주일→희망일 한 칸으로 압축 */}
                                    <td className="py-2.5 px-2 text-[14px] font-medium text-zinc-500 tabular-nums whitespace-nowrap">
                                      {dateRange(o.order_date, o.desired_arrival)}
                                    </td>
                                    {/* 종·개 */}
                                    <td className="py-2.5 px-2 text-[14px] font-medium text-zinc-600 tabular-nums text-right">
                                      {o.items.length}종 · {o.total_qty}개
                                    </td>
                                    {/* 총금액 */}
                                    <td className="py-2.5 px-2 text-right">
                                      <span className="text-[16px] font-bold text-emerald-700 tabular-nums">
                                        {fmtWon(o.total_amount)}
                                      </span>
                                    </td>
                                    {/* PDF */}
                                    <td className="py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        onClick={() => void handleDownloadPdf(o)}
                                        disabled={pdfSavingKey === String(o.order_number ?? o.sent_at)}
                                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-white border border-zinc-200 text-[13px] font-bold text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 shadow-sm active:scale-[0.98] disabled:opacity-40 transition cursor-pointer"
                                        title="발주서 PDF 다운로드"
                                      >
                                        {pdfSavingKey === String(o.order_number ?? o.sent_at)
                                          ? <Spinner size={12} tone="brand" />
                                          : <FileDown size={12} strokeWidth={2.4} />}
                                        PDF
                                      </button>
                                    </td>
                                    {/* 매입확인 · 2026-09-24 · 사용자 지시 · 줄바꿈 X · 말줄임표 X · 세련 · 최소 폭 확보 */}
                                    <td className="py-2.5 pl-2 pr-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                      {isMatched ? (
                                        <StatusPill tone="emerald" size="sm" dot>완료</StatusPill>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => void handleMatch(o)}
                                          disabled={matchingKey === String(o.order_number)}
                                          className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-gradient-to-b from-emerald-50 to-emerald-100 border border-emerald-200 text-[13px] font-bold text-emerald-700 whitespace-nowrap shadow-sm hover:from-emerald-100 hover:to-emerald-150 hover:border-emerald-300 hover:shadow active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                                        >
                                          {matchingKey === String(o.order_number)
                                            ? <Spinner size={12} tone="brand" />
                                            : <CheckCircle2 size={13} strokeWidth={2.4} />}
                                          매입확인
                                        </button>
                                      )}
                                    </td>
                                  </tr>

                                  {/* 상세 행 · 2026-09-24 · 사용자 지시 · accent bar · PO 헤더와 동일 색상 (하위내용 시각 연결) */}
                                  {isOpen && (
                                    <tr>
                                      {/* accent bar 연속 · 헤더와 동일 톤 */}
                                      <td className="py-0">
                                        <div className={`w-1 h-full min-h-[1px] ${isMatched ? "bg-emerald-400" : "bg-sky-400"}`} />
                                      </td>
                                      <td colSpan={6} className="py-0 pl-1 pr-3">
                                        <div className={`bg-zinc-50/70 border-l-2 ${isMatched ? "border-emerald-300" : "border-sky-300"} ml-0.5 mb-2 mt-0 rounded-r-lg overflow-hidden`}>
                                          {/* 2026-09-24 · 사용자 지시 · 담당자·이메일·전화 · 공급사 옆으로 이동 · 상세에서 제거
                                              · 메모만 · 있을 때 · 상세 상단 유지 */}
                                          {o.memo && (
                                            <div className="px-4 py-2 border-b border-zinc-100 text-[13px] text-zinc-500 italic">
                                              메모 · {o.memo}
                                            </div>
                                          )}
                                          {/* 2026-09-24 · 사용자 지시 · 하위구조 · 헤더 있는 테이블 · 세련되게
                                              · 상품 코드 · 상품명 위 (2줄) · 헤더 · Linear/Notion 얇은 톤 · 라벨 +2 */}
                                          <table className="w-full text-[15px] tabular-nums">
                                            <thead>
                                              <tr className="text-[13px] font-semibold text-zinc-500 border-b border-zinc-200 bg-zinc-50/50">
                                                <th className="text-center px-3 py-2 w-10">#</th>
                                                <th className="text-left px-3 py-2 min-w-[220px]">상품</th>
                                                <th className="text-right px-3 py-2 w-16">수량</th>
                                                <th className="text-right px-3 py-2 w-28">단가</th>
                                                <th className="text-right px-3 py-2 w-32">금액</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-100">
                                              {o.items.map((it, i) => (
                                                <tr key={it.id} className="hover:bg-white/60">
                                                  <td className="text-center px-3 py-2.5 text-[14px] text-zinc-400 tabular-nums font-medium align-middle">
                                                    {String(i + 1).padStart(2, "0")}
                                                  </td>
                                                  <td className="text-left px-3 py-2.5 align-middle">
                                                    {/* 2026-09-24 · 사용자 지시 · 코드 · md+ 상품명 앞 · md 이하 (반응형) 위 */}
                                                    <div className="flex flex-col md:flex-row md:items-baseline md:gap-2 leading-snug">
                                                      <span className="text-[13px] text-zinc-400 tabular-nums font-medium shrink-0">
                                                        {it.product_code}
                                                      </span>
                                                      <span className="text-[16px] font-bold text-zinc-800 whitespace-normal break-words">
                                                        {it.product_name}
                                                      </span>
                                                    </div>
                                                  </td>
                                                  <td className="text-right px-3 py-2.5 align-middle text-[15px] font-bold text-rose-600 tabular-nums">
                                                    {Number(it.order_qty).toLocaleString()}
                                                  </td>
                                                  <td className="text-right px-3 py-2.5 align-middle text-[15px] text-zinc-500 tabular-nums">
                                                    {it.unit_price > 0 ? fmtWon(it.unit_price) : "—"}
                                                  </td>
                                                  <td className="text-right px-3 py-2.5 align-middle text-[16px] font-bold text-emerald-700 tabular-nums">
                                                    {it.line_amount > 0 ? fmtWon(it.line_amount) : "—"}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* ── 모바일 (md 이하) · 카드형 ─────────────────────── */}
                      <div className="md:hidden px-3 py-2 space-y-2">
                        {ordersOfDate.map((o) => {
                          const key = String(o.order_number ?? o.sent_at);
                          const isOpen = !collapsed.has(key);
                          return (
                            <OrderHistoryPoCard
                              key={key}
                              o={o as OrderHistoryPoCardOrder}
                              isOpen={isOpen}
                              onToggle={() => togglePo(key)}
                              onPdf={() => void handleDownloadPdf(o)}
                              onMatch={() => void handleMatch(o)}
                              pdfLoading={pdfSavingKey === String(o.order_number ?? o.sent_at)}
                              matchLoading={matchingKey === String(o.order_number)}
                              fmtWon={fmtWon}
                            />
                          );
                        })}
                      </div>
                    </>
                  )}

                </React.Fragment>
              );
            })}

          </div>
        )}
      </Card>
    </div>
    {/* 오프스크린 PDF 프리뷰 */}
    {pdfTarget && (
      <div style={{ position: "fixed", left: "-99999px", top: 0, zIndex: -1 }} aria-hidden>
        <OrderPdfPreview ref={pdfRef} orderModal={pdfTarget} />
      </div>
    )}
    </>
  );
};

export default OrderHistoryTab;
