// src/components/LandingPage/VendorOrderHistoryPage.tsx
// 2026-09-24 · #352 · 거래처 로그인 · 자기 발주이력 확인 페이지 (신규)
//   · 사용자 지시 · OrderHistoryTab 스타일 재사용 · 날짜별 그룹핑 · 아코디언
//   · 매입확인 버튼 제거 (약국 측 기능 · vendor 는 조회 전용)
//   · PDF 다운로드 유지 (vendor 도 자기 발주서 다운 가능)
//   · 담당자·연락처 · "약국 담당자" 로 라벨 (헷갈리지 않게)
//   · 반응형 · md 이하 · OrderHistoryPoCard 카드형 재사용 (hideMatchAction=true)
//
// 프레임워크 준수:
//   · api client · Card · Spinner · StatusPill · PageToolbar · PeriodSelector · GradientAccent · InlineLabel
//   · AppNavHeader · PAGE_CONTAINER_CLS
//   · html2canvas-pro + jsPDF · 발주서 PDF 프리뷰 (OrderHistoryTab 와 동일 헬퍼)

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Package, ChevronDown, ChevronRight, FileDown, Truck } from "lucide-react";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { PAGE_CONTAINER_CLS } from "../../styles/tokens";
import { PageToolbar } from "../common/PageToolbar";
import { MonthToggleSelector } from "../common/MonthToggleSelector";
import { useMonthFilter } from "../../hooks/useMonthFilter";
import { InlineLabel } from "../common/InlineLabel";
import { StatusPill } from "../common/StatusPill";
import { Card } from "../common/Card";
import { GradientAccent } from "../common/GradientAccent";
import { Spinner } from "../common/Spinner";
import { OrderHistoryPoCard, type OrderHistoryPoCardOrder } from "../OrderManagePage/OrderHistoryPoCard";
import { OrderPdfPreview } from "../OrderManagePage/OrderPdfPreview";
import type { OrderModalState } from "../OrderManagePage/OrderModal";
import { displayVendorName } from "../../utils/vendorNameNormalize";
import { shortDate } from "../../lib/dateFormat";
import { api, ApiError } from "../../lib/apiClient";
import { getErrorMessage } from "../../lib/errorMessage";
import { useToast, toastClass } from "../../hooks/useToast";
import { useCompanyInfo } from "../../hooks/useCompanyInfo";
// 2026-09-08 · 발주서 PDF 다운 · html2canvas + jsPDF (OrderHistoryTab 동일)
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";
import type { AuthSession } from "../../types";

// ─── 타입 · OrderHistoryTab 응답 구조와 동일 ────────────────────────────
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
  status?: "ordered" | "matched";
  items: OrderHistoryItem[];
  total_qty: number;
  total_amount: number;
}

interface VendorOrderHistoryPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

/** 발주일 → 희망일 축약 */
function dateRange(orderDate: string | null, arrival: string | null): string {
  const od = shortDate(orderDate);
  const ar = shortDate(arrival);
  if (!od && !ar) return "—";
  if (!ar) return od;
  if (!od) return ar;
  return `${od}→${ar}`;
}

// ─── 페이지 컴포넌트 ──────────────────────────────────────────────────
export const VendorOrderHistoryPage: React.FC<VendorOrderHistoryPageProps> = ({
  authSession, onBack, onNavigate, onLogout,
}) => {
  const { toast, showError } = useToast();
  const { info: companyInfo } = useCompanyInfo();

  const [orders, setOrders] = useState<OrderHistoryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 2026-10-06 · 사용자 지시 · 월 멀티선택 통일 (STANDARD · useMonthFilter + MonthToggleSelector)
  //   · default · 현재 월 1개 · 비연속 월 지원 · sent_at 축
  const { selectedMonths, setSelectedMonths, monthsList } = useMonthFilter();

  // PO 접기 · 기본 open · 클릭 시 collapse
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // 날짜 그룹 접기 · 최신 날짜만 open
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [datesInitialized, setDatesInitialized] = useState(false);

  // PDF · 오프스크린 프리뷰
  const pdfRef = useRef<HTMLDivElement | null>(null);
  const [pdfTarget, setPdfTarget] = useState<OrderModalState | null>(null);
  const [pdfSavingKey, setPdfSavingKey] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setNotice(null);
    const url = monthsList
      ? `/api/vendor/order-history?months_list=${encodeURIComponent(monthsList)}`
      : `/api/vendor/order-history`;
    api.get<{ orders?: OrderHistoryOrder[]; notice?: string }>(url)
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
  }, [monthsList, showError]);

  useEffect(() => {
    load();
  }, [load]);

  const togglePo = (k: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });

  const fmtWon = (n: number) => n.toLocaleString() + "원";

  const totalAmount = orders.reduce((s, o) => s + (o.total_amount ?? 0), 0);
  const totalItems = orders.reduce((s, o) => s + o.items.length, 0);

  // 날짜별 그룹핑 (최신 순)
  const groupedByDate = React.useMemo(() => {
    const map = new Map<string, OrderHistoryOrder[]>();
    for (const o of orders) {
      const dateKey = String(o.order_date ?? o.sent_at?.slice(0, 10) ?? "unknown");
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(o);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [orders]);

  // 첫 로드 · 최신 날짜 자동 open
  useEffect(() => {
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

  function groupSummary(grpOrders: OrderHistoryOrder[]) {
    let totalAmt = 0, totalItm = 0, totalQty = 0;
    for (const o of grpOrders) {
      totalAmt += Number(o.total_amount ?? 0);
      totalItm += o.items.length;
      totalQty += Number(o.total_qty ?? 0);
    }
    return { count: grpOrders.length, totalAmount: totalAmt, totalItems: totalItm, totalQty };
  }

  // ─── PDF 다운 ────────────────────────────────────────────────────────
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

  // ─── 약국 담당자 라벨 (헷갈리지 않게) ────────────────────────────────
  //   · 발주서를 발행한 약국 · company_info · 담당자·전화·이메일
  //   · 발주 단위(order)의 supplier_contact/email/phone 은 · vendor 담당자 (본인) 라 표시 X
  //   · 대신 · 상세 영역 상단에 "약국 담당자 · {companyInfo.name} · {companyInfo.phone}" 표기
  const pharmacyName = companyInfo?.name || "약국";
  const pharmacyPhone = companyInfo?.phone || "";

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <AppNavHeader
        activePage="vendor-order-history"
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
        rightSlot={
          <div className="flex items-center gap-2">
            <StatusPill tone="brand" size="md" icon={<Truck size={12} />}>
              <span className="hidden sm:inline">{authSession?.employeeName || "공급사"}</span>
            </StatusPill>
          </div>
        }
      />

      <div className={`${PAGE_CONTAINER_CLS} max-w-[1400px] flex-1 flex flex-col px-4 sm:px-6 py-4 gap-3 min-h-0`}>
        {toast && (
          <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
        )}

        {/* 상단 툴바 */}
        <PageToolbar
          icon={<Package size={18} strokeWidth={2.2} />}
          title="발주이력 확인"
          count={orders.length}
          leftSlot={
            <span className="text-[15px] font-medium text-ink-soft tracking-tight tabular-nums">
              {totalItems}종 · {fmtWon(totalAmount)}
            </span>
          }
          right={
            <div className="flex items-center gap-2 flex-wrap">
              <InlineLabel size="sm">기간</InlineLabel>
              {/* 2026-10-06 · 월 멀티선택 통일 (매입이력 STANDARD) · 비연속 월 지원 */}
              <MonthToggleSelector
                selectedMonths={selectedMonths}
                onChange={setSelectedMonths}
                maxMonths={6}
                minOne
                ariaLabel="발주이력 조회기간"
              />
              {selectedMonths.length > 0 && (
                <span className="text-[13px] text-ink-soft tabular-nums">{selectedMonths.length}개월 선택</span>
              )}
            </div>
          }
        />

        {/* 안내 배너 · 약국 정보 */}
        <Card variant="flat" bg="bg-sky-50/60" borderColor="border-sky-200" padding="sm" className="text-[14px]">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[13px] text-sky-600 font-semibold">발주 약국</span>
            <span className="text-[15px] font-bold text-sky-900">{pharmacyName}</span>
            {pharmacyPhone && (
              <>
                <span className="w-1 h-1 rounded-full bg-sky-300" />
                <span className="text-[14px] text-sky-700 tabular-nums">{pharmacyPhone}</span>
              </>
            )}
            <span className="ml-auto text-[13px] text-sky-600">조회 전용 · 자기 회사 발주만 표시</span>
          </div>
        </Card>

        {/* 마이그레이션 안내 */}
        {notice && (
          <Card variant="flat" bg="bg-amber-50" borderColor="border-amber-200" padding="sm" className="text-[14px] text-amber-800">
            <div className="font-bold mb-0.5">알림</div>
            <div className="text-[15px] font-medium">{notice}</div>
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
          ) : orders.length === 0 ? (
            <div className="p-12 text-center text-zinc-400 text-[17px]">
              발주 이력 없음 · 선택 월에 발주 없음
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {groupedByDate.map(([dateKey, ordersOfDate]) => {
                const summary = groupSummary(ordersOfDate);
                const displayDate = dateKey === "unknown" ? "날짜 없음" : dateKey;
                const isDateOpen = expandedDates.has(dateKey);

                return (
                  <React.Fragment key={`date-group-${dateKey}`}>
                    {/* 날짜 그룹 헤더 */}
                    <button
                      type="button"
                      onClick={() => toggleDate(dateKey)}
                      className="sticky top-0 z-[9] w-full bg-zinc-50 hover:bg-zinc-100/80 border-b border-zinc-200 px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-colors"
                    >
                      <span className="text-zinc-400 shrink-0">
                        {isDateOpen
                          ? <ChevronDown size={15} strokeWidth={2.4} />
                          : <ChevronRight size={15} strokeWidth={2.4} />}
                      </span>
                      <span className="text-[16px] font-bold text-zinc-700 tabular-nums tracking-tight">
                        {displayDate}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-zinc-300 shrink-0" />
                      <span className="text-[14px] font-medium text-zinc-500 tabular-nums">
                        {summary.count}건 · {summary.totalItems}종 · {summary.totalQty.toLocaleString()}개
                      </span>
                      <span className="ml-auto text-[16px] font-bold text-zinc-700 tabular-nums">
                        {fmtWon(summary.totalAmount)}
                      </span>
                    </button>

                    {isDateOpen && (
                      <>
                        {/* PC (md+) · 테이블 */}
                        <div className="hidden md:block">
                          <table className="w-full text-[15px]">
                            <colgroup>
                              <col className="w-8" />
                              <col className="min-w-[180px]" />
                              <col className="w-[110px]" />
                              <col className="w-[88px]" />
                              <col className="w-[110px]" />
                              <col className="w-[130px]" />
                              <col className="w-[68px]" />
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
                                      <td className="py-0 w-8">
                                        <div className="flex items-stretch h-full">
                                          <div className={`w-1 self-stretch ${isMatched ? "bg-emerald-400" : "bg-sky-400"}`} />
                                          <div className="flex items-center justify-center w-7">
                                            {isOpen
                                              ? <ChevronDown size={14} className="text-zinc-400" strokeWidth={2.4} />
                                              : <ChevronRight size={14} className="text-zinc-300 group-hover:text-zinc-400" strokeWidth={2.4} />}
                                          </div>
                                        </div>
                                      </td>
                                      <td className="py-2.5 pl-1 pr-3">
                                        <div className="text-[12px] text-zinc-400 tabular-nums font-medium leading-none mb-0.5">
                                          #{o.order_number ?? "—"}
                                        </div>
                                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 leading-snug">
                                          <span className="inline-flex items-baseline gap-1.5">
                                            <span className="text-[13px] text-zinc-400 font-semibold">공급사</span>
                                            <span className="text-[16px] font-bold text-zinc-800 whitespace-normal break-words">
                                              {displayVendorName(o.supplier) || o.supplier || "(공급사 미지정)"}
                                            </span>
                                          </span>
                                        </div>
                                      </td>
                                      <td className="py-2.5 px-2 text-[14px] font-medium text-zinc-500 tabular-nums whitespace-nowrap">
                                        {dateRange(o.order_date, o.desired_arrival)}
                                      </td>
                                      <td className="py-2.5 px-2 text-[14px] font-medium text-zinc-600 tabular-nums text-right">
                                        {o.items.length}종 · {o.total_qty}개
                                      </td>
                                      <td className="py-2.5 px-2 text-right">
                                        <span className="text-[16px] font-bold text-emerald-700 tabular-nums">
                                          {fmtWon(o.total_amount)}
                                        </span>
                                      </td>
                                      {/* 상태 배지 · 매입확인 버튼 없음 */}
                                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                                        {isMatched
                                          ? <StatusPill tone="emerald" size="sm" dot>매입완료</StatusPill>
                                          : <StatusPill tone="sky" size="sm" dot>발주완료</StatusPill>}
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
                                    </tr>

                                    {/* 상세 행 */}
                                    {isOpen && (
                                      <tr>
                                        <td className="py-0">
                                          <div className={`w-1 h-full min-h-[1px] ${isMatched ? "bg-emerald-400" : "bg-sky-400"}`} />
                                        </td>
                                        <td colSpan={6} className="py-0 pl-1 pr-3">
                                          <div className={`bg-zinc-50/70 border-l-2 ${isMatched ? "border-emerald-300" : "border-sky-300"} ml-0.5 mb-2 mt-0 rounded-r-lg overflow-hidden`}>
                                            {/* 약국 담당자 정보 · #352 · 사용자 지시 · "약국 담당자" 라벨 (헷갈리지 않게) */}
                                            <div className="px-4 py-2 border-b border-zinc-100 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[13px] text-zinc-600">
                                              <span className="inline-flex items-baseline gap-1.5">
                                                <span className="text-[12px] text-sky-600 font-semibold">약국 담당자</span>
                                                <span className="text-[14px] font-bold text-zinc-800">{pharmacyName}</span>
                                              </span>
                                              {pharmacyPhone && (
                                                <span className="inline-flex items-baseline gap-1.5">
                                                  <span className="text-[12px] text-zinc-400 font-semibold">연락처</span>
                                                  <span className="text-[13px] text-zinc-600 tabular-nums">{pharmacyPhone}</span>
                                                </span>
                                              )}
                                            </div>
                                            {o.memo && (
                                              <div className="px-4 py-2 border-b border-zinc-100 text-[13px] text-zinc-500 italic">
                                                메모 · {o.memo}
                                              </div>
                                            )}
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

                        {/* 모바일 · 카드형 (OrderHistoryPoCard 재사용 · hideMatchAction=true) */}
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
                                pdfLoading={pdfSavingKey === String(o.order_number ?? o.sent_at)}
                                fmtWon={fmtWon}
                                hideMatchAction
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
    </div>
  );
};

export default VendorOrderHistoryPage;
