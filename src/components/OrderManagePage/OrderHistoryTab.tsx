// 2026-08-10 · #16 · 발주이력 탭 · status='ordered' · order_number GROUP
// 마이그레이션 add_order_dispatch_columns_2026-08-10.sql 실행 후 실제 데이터 노출
// 컬럼 없으면 · 서버가 empty + notice 반환 · UI 는 안내 메시지 표시
// 2026-08-12 · UI 리디자인 · 폰트 +2 · 굵기 완화 · 발주일·희망입고일 · 헤더 · 상품수 옆
// 2026-09-17 · 사용자 지시 · 헤더 한 줄 재정리 · 발주번호(위)+공급사(아래) · 발주일/희망 간단 (26/9/11) · 금액 · PDF · 매입확인
//   · 상단 헤더 + 자동 정렬 (useSortableTable) · 상세내역 시각 구분 강화

import React, { useEffect, useRef, useState } from "react";
import { Package, ChevronDown, ChevronRight, Mail, Phone, User, Calendar, CalendarCheck, FileDown, ListTree } from "lucide-react";
import { useSortableTable, type Comparator } from "../../hooks/useSortableTable";
import { shortDate } from "../../lib/dateFormat";
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
import { AccentBar } from "../common/AccentBar";
import { SortHeader } from "../common/SortHeader";
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
import { Tags, CheckCircle2 } from "lucide-react";
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // 2026-09-24 · 사용자 지시 · 날짜별 그룹핑 · 날짜 헤더 클릭 시 · 그 날의 모든 발주 상세 한꺼번에 노출
  //   · 최신 날짜 · default 자동 open (첫 로드 후)
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
    // React 다음 프레임에서 프리뷰가 마운트된 후 캡처
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
  //   · 초기: 공급사명 dropdown → 재수정 (v2): 공급사 분류 (위탁·선결제·60회전·90회전·기타) dropdown
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const { getVendorCategory } = useVendors();
  const { vendorCategories: dbVendorCategories } = useReferenceValues();

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    setNotice(null);
    // 2026-08-21 · Framework Phase 3 · fetch → apiClient
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

  const toggle = (k: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const fmtWon = (n: number) => n.toLocaleString() + "원";
  // 2026-08-23 · #180 · A안 · 공급사·상품 별도 필터 (AND 조건 · 각 검색어 입력 시 교집합)
  // 2026-08-25 · 사용자 지시 · 공급사 분류 (vendor category) 필터 · 검색과 AND
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
      // 2026-08-30 · 공급사 검색 통일 · matchesSupplierQuery (초성·정제명·부분일치)
      const supplierMatch = matchesSupplierQuery({ supplier: o.supplier ?? undefined }, supplierSearch);
      // 2026-08-29 · 통일 로직 · matchesProductQuery (초성 + 부분 + 코드 + 바코드)
      const productMatch = !productSearch.trim() || o.items.some(it => matchesProductQuery(it, productSearch));
      const categoryMatch = categoryFilter === "all" || orderCategory(o) === categoryFilter;
      return supplierMatch && productMatch && categoryMatch;
    });
  }, [orders, supplierSearch, productSearch, categoryFilter, orderCategory]);

  // 2026-08-25 · 공급사 분류별 건수 (검색 반영 · 분류 필터 자체는 제외)
  const categoryCounts = React.useMemo(() => {
    const qS = supplierSearch.trim().toLowerCase();
    const qP = productSearch.trim().toLowerCase();
    const base = (qS || qP)
      ? orders.filter(o => {
          // 2026-09-18 · 사용자 지시 · matchesSupplierQuery 통일 · "(주)" 무시 양방향
          const supplierMatch = matchesSupplierQuery({ supplier: o.supplier ?? undefined }, supplierSearch);
          // 2026-08-29 · 통일 로직 · matchesProductQuery (초성 + 부분 + 코드 + 바코드)
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

  // 2026-09-17 · 사용자 지시 · 자동 정렬 · 헤더 클릭 시 asc/desc 토글
  //   · 기본 · 발송일 최신순 (sent_at desc)
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

  // 2026-09-24 · 사용자 지시 · 최신 트렌드 · 발주이력 날짜별 그룹핑
  //   · 이전 · flat list · PO 마다 개별 행
  //   · 이후 · 날짜별 헤더 아래 · 그 날짜의 여러 PO (여러 공급사) · 한꺼번에 상세내역
  //   · SaaS 표준 (Odoo · NetSuite · QuickBooks) 참조 · 세션·batch 시각화
  const groupedByDate = React.useMemo(() => {
    const map = new Map<string, OrderHistoryOrder[]>();
    for (const o of sortedOrders) {
      // 그룹 키 · order_date 우선 · 없으면 sent_at slice(0,10) · 둘 다 없으면 '(날짜 없음)'
      const dateKey = String(o.order_date ?? o.sent_at?.slice(0, 10) ?? "unknown");
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(o);
    }
    // 날짜 desc 정렬 (최신 날짜 위)
    const sortedEntries = Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
    return sortedEntries;
  }, [sortedOrders]);

  // 첫 로드 · 최신 날짜 자동 open
  React.useEffect(() => {
    if (!datesInitialized && groupedByDate.length > 0) {
      const latest = groupedByDate[0][0];
      setExpandedDates(new Set([latest]));
      setDatesInitialized(true);
    }
  }, [groupedByDate, datesInitialized]);

  const toggleDate = (dateKey: string) => setExpandedDates(prev => {
    const next = new Set(prev);
    if (next.has(dateKey)) next.delete(dateKey);
    else next.add(dateKey);
    return next;
  });

  // 그룹별 요약 (건수 · 총 금액 · 총 종·수량)
  function groupSummary(orders: OrderHistoryOrder[]): { count: number; totalAmount: number; totalItems: number; totalQty: number } {
    let totalAmount = 0, totalItems = 0, totalQty = 0;
    for (const o of orders) {
      totalAmount += Number(o.total_amount ?? 0);
      totalItems += o.items.length;
      totalQty += Number(o.total_qty ?? 0);
    }
    return { count: orders.length, totalAmount, totalItems, totalQty };
  }

  // 2026-09-17 · 짧은 날짜 포맷 (2026-09-18 · lib/dateFormat.ts 로 추출 · 재사용·테스트 지원)

  return (
    <>
    {toast && (
      <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
    )}
    <div className="flex flex-col gap-2">
      {/* 상단 툴바 · 2026-08-17 · PageToolbar 프레임워크 · PeriodSelector 공통 · 조회기간 통일 */}
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

      {/* 2026-08-23 · #180 · A안 · 공급사·상품 별도 검색창 2개 · AND filter */}
      {/* 2026-08-25 · 사용자 지시 · 공급사 분류 필터 (dropdown · 건수 병기) 추가 · 3열 grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="relative inline-flex items-center">
          <Tags size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full h-9 pl-9 pr-8 rounded-lg bg-white border border-line text-[14px] font-semibold text-ink hover:border-brand-deep/60 focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition-colors cursor-pointer"
            title="공급사 분류 필터 (위탁·선결제·60회전·90회전·기타)"
          >
            <option value="all">전체 분류</option>
            {categoryCounts.map(([cat, n]) => (
              <option key={cat} value={cat}>{cat} ({n})</option>
            ))}
          </select>
        </div>
        <SearchBar
          value={supplierSearch}
          onChange={setSupplierSearch}
          placeholder="공급사 검색"
        />
        <SearchBar
          value={productSearch}
          onChange={setProductSearch}
          placeholder="상품명 검색"
        />
      </div>

      {/* 마이그레이션 안내 · 폰트 +2 */}
      {notice && (
        <Card variant="flat" bg="bg-amber-50" borderColor="border-amber-200" padding="sm" className="text-[14px] text-amber-800">
          <div className="font-bold mb-0.5">📌 마이그레이션 필요</div>
          <div className="font-mono text-[15px]">{notice}</div>
          <div className="text-[15px] mt-1">Supabase SQL Editor 에서 실행 후 · 발주 완료 시 자동 저장 시작</div>
        </Card>
      )}

      {/* 리스트 · 2026-08-24 · v3 리스트 프레임워크 · 상단 gradient accent */}
      <Card clip padding="none" className="relative">
        <GradientAccent className="z-20 rounded-t-md" />
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size={16} tone="zinc" label="불러오는 중..." labelSize={15} />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 text-[17px] font-bold">⚠ {error}</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-zinc-400 text-[17px]">
            {(supplierSearch.trim() || productSearch.trim()) ? "검색 결과 없음 · 다른 검색어로 시도하세요" : "발주 이력 없음 · 발주 완료 시 여기에 표시"}
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {/* 2026-09-17 · 사용자 지시 · 상단 헤더 + 자동 정렬 · 헤더 클릭 asc/desc 토글 */}
            <div className="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur-sm border-b-2 border-line px-4 py-2 flex items-center gap-2.5 text-[13px] font-bold tracking-tight text-zinc-600 uppercase">
              <span className="w-4 shrink-0" aria-hidden />
              <SortHeader label="발주번호 · 공급사" columnKey="order_number" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort} arrowStyle="arrow" activeColor="brand" className="flex-1 min-w-[130px] justify-start shrink-0" />
              <SortHeader label="발주일" columnKey="order_date" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort} arrowStyle="arrow" activeColor="brand" className="w-[74px] justify-start shrink-0" />
              <SortHeader label="희망" columnKey="desired_arrival" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort} arrowStyle="arrow" activeColor="brand" className="w-[74px] justify-start shrink-0" />
              <SortHeader label="종·개" columnKey="items" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort} arrowStyle="arrow" activeColor="brand" className="w-[86px] justify-start shrink-0" />
              <SortHeader label="총금액" columnKey="total_amount" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort} arrowStyle="arrow" activeColor="brand" className="ml-auto w-[100px] justify-end shrink-0" />
              <span className="w-[60px] text-right shrink-0" aria-hidden>PDF</span>
              <span className="w-[104px] text-right shrink-0" aria-hidden>매입확인</span>
            </div>
            {/* 2026-09-24 · 사용자 지시 · 최신 트렌드 · 발주이력 날짜별 그룹핑
                · 날짜 헤더 클릭 → 그 날의 모든 공급사 발주 · 상세내역 한꺼번에 노출 */}
            {groupedByDate.map(([dateKey, ordersOfDate]) => {
              const summary = groupSummary(ordersOfDate);
              const displayDate = dateKey === "unknown" ? "날짜 없음" : dateKey;
              const isDateOpen = expandedDates.has(dateKey);
              return (
                <React.Fragment key={`date-group-${dateKey}`}>
                  {/* 날짜 그룹 헤더 · 클릭 토글 · 세션 요약 */}
                  <button
                    type="button"
                    onClick={() => toggleDate(dateKey)}
                    className="sticky top-[41px] z-[9] w-full bg-brand-tint/50 hover:bg-brand-tint/70 backdrop-blur-sm border-y border-brand-deep/25 px-4 py-2.5 flex items-center gap-3 text-[15px] font-bold text-brand-deep cursor-pointer transition"
                  >
                    {isDateOpen
                      ? <ChevronDown size={16} strokeWidth={2.4} />
                      : <ChevronRight size={16} strokeWidth={2.4} />
                    }
                    <Calendar size={15} strokeWidth={2.4} />
                    <span className="text-[16px]">#PO-{displayDate}</span>
                    <StatusPill tone="brand" size="sm">{summary.count}건</StatusPill>
                    <span className="text-[14px] text-zinc-600 font-semibold">
                      {summary.totalItems}종 · {summary.totalQty.toLocaleString()}개
                    </span>
                    <span className="ml-auto text-[16px] font-bold text-emerald-700 tabular-nums">
                      {fmtWon(summary.totalAmount)}
                    </span>
                  </button>
                  {isDateOpen && ordersOfDate.map((o) => {
                    const key = String(o.order_number ?? o.sent_at);
                    // 2026-09-24 · 사용자 지시 · 날짜 그룹 안 · 모든 PO · 상세내역 자동 노출 (한꺼번에)
                    //   · isOpen 개별 토글 · 유지 · but default true (사용자 명시적 접기 가능)
                    const isOpen = !expanded.has(`__collapsed:${key}`);
                    return (
                      <div key={key} className="hover:bg-zinc-50/40 transition">
                  {/* 2026-09-17 · 사용자 지시 · 한 줄 헤더 · 발주번호(위)+공급사(아래) · 발주일 26/9/11 · 희망 · 총금액 · PDF · 매입확인 */}
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    className="w-full flex items-center gap-2.5 px-4 py-3 cursor-pointer text-left"
                  >
                    {isOpen ? (
                      <ChevronDown size={16} className="text-indigo-400 shrink-0" />
                    ) : (
                      <ChevronRight size={16} className="text-zinc-300 shrink-0" />
                    )}
                    {/* 발주번호 (위) + 공급사 (아래) · 2줄 블록 · flex-1 · 폭 축소 (사용자 지시 #322) */}
                    <div className="flex-1 min-w-[130px] min-w-0 flex flex-col leading-tight">
                      <span className="text-[15px] font-bold text-sky-700 tabular-nums">
                        #{o.order_number ?? "—"}
                      </span>
                      <span className="text-[16px] font-bold text-sky-800 whitespace-normal break-words">
                        {displayVendorName(o.supplier) || o.supplier || "(공급사 미지정)"}
                      </span>
                    </div>
                    {/* 발주일 · 짧은 포맷 26/9/11 */}
                    <span className="w-[74px] shrink-0 inline-flex items-center gap-1 text-[14px] font-semibold text-zinc-600 tabular-nums">
                      <Calendar size={12} className="text-zinc-400" />
                      {shortDate(o.order_date) || <span className="text-zinc-300">-</span>}
                    </span>
                    {/* 희망일 · 짧은 포맷 */}
                    <span className="w-[74px] shrink-0 inline-flex items-center gap-1 text-[14px] font-semibold text-rose-600 tabular-nums">
                      <CalendarCheck size={12} />
                      {shortDate(o.desired_arrival) || <span className="text-zinc-300">-</span>}
                    </span>
                    {/* 종·수량 */}
                    <span className="w-[86px] shrink-0 text-[14px] font-semibold text-zinc-600 tabular-nums">
                      {o.items.length}종 · {o.total_qty}개
                    </span>
                    {/* 총금액 · 오른쪽 */}
                    <span className="ml-auto w-[100px] shrink-0 text-right text-[16px] font-bold text-emerald-700 tabular-nums">
                      {fmtWon(o.total_amount)}
                    </span>
                    {/* PDF 다운 */}
                    <span className="w-[60px] shrink-0 flex justify-end">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void handleDownloadPdf(o); }}
                        disabled={pdfSavingKey === String(o.order_number ?? o.sent_at)}
                        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-white border border-line text-[13px] font-bold text-ink-soft hover:border-brand-deep hover:text-brand-deep hover:bg-brand-tint/20 shadow-sm active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                        title="발주서 PDF 다운로드"
                      >
                        {pdfSavingKey === String(o.order_number ?? o.sent_at)
                          ? <Spinner size={12} tone="brand" />
                          : <FileDown size={12} strokeWidth={2.4} />}
                        PDF
                      </button>
                    </span>
                    {/* 매입확인 · 2026-09-21 · #322 · 사용자 지시 · 한 줄 · 예쁘게 */}
                    <span className="w-[104px] shrink-0 flex justify-end">
                      {o.status === "matched" ? (
                        <StatusPill tone="emerald" size="sm" dot>완료</StatusPill>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void handleMatch(o); }}
                          disabled={matchingKey === String(o.order_number)}
                          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[13px] font-bold text-emerald-700 whitespace-nowrap hover:bg-emerald-100 hover:border-emerald-300 shadow-sm active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                          title="발주-매입 매칭 확인 · status=matched"
                        >
                          {matchingKey === String(o.order_number)
                            ? <Spinner size={12} tone="brand" />
                            : <CheckCircle2 size={12} strokeWidth={2.4} />}
                          매입확인
                        </button>
                      )}
                    </span>
                  </button>

                  {/* 2026-09-17 · 사용자 지시 · 상세내역 · 시각 구분 포인트 · 좌측 accent bar (sky) + bg tint + 아이콘 */}
                  {isOpen && (
                    <div className="border-l-4 border-sky-400 bg-gradient-to-r from-sky-50/60 to-transparent px-4 py-3 space-y-2 mx-2 mb-2 rounded-r-lg shadow-inner">
                      {/* 수신처 정보 · 발주일·희망입고일 은 헤더로 이동했으므로 · 여기서는 담당자·연락처·메모만 */}
                      <div className="flex items-center gap-3 flex-wrap text-[15px] text-zinc-500 bg-white/70 border border-sky-100 rounded-lg px-3 py-2">
                        <span className="inline-flex items-center gap-1 text-sky-700 font-bold shrink-0">
                          <ListTree size={13} />상세내역
                        </span>
                        {o.supplier_contact && (
                          <span className="inline-flex items-center gap-1"><User size={13} />{o.supplier_contact}</span>
                        )}
                        {o.supplier_email && (
                          <span className="inline-flex items-center gap-1"><Mail size={13} />{o.supplier_email}</span>
                        )}
                        {o.supplier_phone && (
                          <span className="inline-flex items-center gap-1 tabular-nums"><Phone size={13} />{o.supplier_phone}</span>
                        )}
                        {o.memo && (
                          <span className="italic text-zinc-600 border-l border-sky-200 pl-2">{o.memo}</span>
                        )}
                        {!o.supplier_contact && !o.supplier_email && !o.supplier_phone && !o.memo && (
                          <span className="text-zinc-300">수신처·메모 정보 없음</span>
                        )}
                      </div>
                      {/* 아이템 테이블 · 2026-08-24 · v3 · 헬퍼 · 줄바꿈 우선 */}
                      <table className="w-full text-[16px] tabular-nums">
                        <thead className={tableHeadCls()}>
                          <tr>
                            <th className={tableThCls("center", "w-8")}>#</th>
                            <th className={tableThCls("left", "w-28")}>코드</th>
                            <th className={tableThCls("left", "min-w-[220px]")}>상품명</th>
                            <th className={tableThCls("num", "w-16 bg-sky-50/60")}>수량</th>
                            <th className={tableThCls("num", "w-24")}>단가</th>
                            <th className={tableThCls("num", "w-28 bg-brand-tint/50")}>금액</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {o.items.map((it, i) => (
                            <tr key={it.id} className="hover:bg-sky-50/30">
                              <td className={tableTdCls("center", "text-zinc-400")}>{i + 1}</td>
                              <td className={tableTdCls("left", "font-mono text-zinc-500")}>{it.product_code}</td>
                              <td className={tableTdCls("left", "text-zinc-800 font-semibold whitespace-normal break-words")}>{it.product_name}</td>
                              <td className={tableTdCls("num", "font-bold text-rose-600 bg-sky-50/60")}>{it.order_qty}</td>
                              <td className={tableTdCls("num", "text-zinc-600")}>{it.unit_price > 0 ? fmtWon(it.unit_price) : "-"}</td>
                              <td className={tableTdCls("num", "font-bold text-emerald-700 bg-brand-tint/50")}>{it.line_amount > 0 ? fmtWon(it.line_amount) : "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
              })}
              </React.Fragment>
              );
            })}
          </div>
        )}
      </Card>
    </div>
    {/* 2026-09-08 · 사용자 지시 · 오프스크린 PDF 프리뷰 · 캡처 대상 (visually hidden) */}
    {pdfTarget && (
      <div style={{ position: "fixed", left: "-99999px", top: 0, zIndex: -1 }} aria-hidden>
        <OrderPdfPreview ref={pdfRef} orderModal={pdfTarget} />
      </div>
    )}
    </>
  );
};

export default OrderHistoryTab;
