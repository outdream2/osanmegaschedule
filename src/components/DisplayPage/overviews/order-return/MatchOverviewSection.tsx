// src/components/DisplayPage/overviews/order-return/MatchOverviewSection.tsx
// 2026-10-09 · 사용자 지시 · 발주·매입 대조 · 좌(발주) / 우(매입) / 끝(판정+처리상태) 심플 매칭
//   · 한 행 = 좌반 발주정보 / 우반 매입정보 / 판정 액션 + 처리상태
//   · 매입 금액 불일치 → 우측 rose 톤 하이라이트
//   · 행 클릭 → 아래 inline expand · 좌(품목 상세) + 우(매칭 상세) 2-grid
//   · 기존 10cols 테이블 제거 (사용자 "너무 복잡해") · 기능 유지 (UI만 변경)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  GitDiff, CaretRight, MagnifyingGlass, EnvelopeSimple,
  Check as PhCheck, Warning as PhWarning, ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { useConfirm } from "../../../../hooks/useConfirm";
import { useToast } from "../../../../hooks/useToast";
import {
  getOrderPurchaseMatchList,
  confirmOrderPurchaseMatch,
  type OrderMatchRow,
  type OrderPurchaseMatchResponse,
} from "../../../../lib/api/orderPurchaseMatchApi";
import {
  fmtQty, fmtWon, effectiveStatus, effectiveExceptionType,
  groupBySupplierAndOrder, buildPurchaseGroup,
  type OrderGroup, type FilterKey,
} from "../../../OrderManagePage/OrderPurchaseMatchTab.types";
import { ExceptionNoteModal } from "../../../OrderManagePage/ExceptionNoteModal";
import { ApiError } from "../../../../lib/apiClient";
import { getErrorMessage } from "../../../../lib/errorMessage";
import { shortDate } from "../../../../lib/dateFormat";
import { displayVendorName } from "../../../../utils/vendorNameNormalize";

// 홈 CARD 톤 inline (OrderReturnOverview 공용 상수와 동일)
const CARD = "bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]";

const PO_STATUS_LABEL = {
  matched: "확인완료", exception: "이상", unmatched: "미판정", mixed: "부분",
} as const;

const PO_STATUS_PILL: Record<"matched" | "exception" | "unmatched" | "mixed",
  { bg: string; text: string; border: string }> = {
  matched:    { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  exception:  { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200"   },
  unmatched:  { bg: "bg-zinc-50",    text: "text-zinc-700",    border: "border-zinc-200"    },
  mixed:      { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200"     },
};

// 매입 이상품목 · 공급사 담당자 이메일 재조정 요청 · supplier_email 없으면 null (버튼 숨김)
function buildMatchMailto(order: OrderGroup): string | null {
  const email = (order.rows[0] as any)?.supplier_email as string | undefined;
  if (!email) return null;
  const supplier = displayVendorName(order.supplierRaw ?? "") || order.supplier;
  const orderNo = order.orderNumber ?? "";
  const orderDate = (order.sentAt ?? order.orderDate ?? "").slice(0, 10);
  const subject = `[매입 이상품목 · 재조정 요청] ${supplier} / ${orderNo}`;
  const lines: string[] = [
    "안녕하세요.", "",
    "아래 발주의 매입 내역에 수량 · 단가 이상이 있어 재조정 요청드립니다.", "",
    `발주번호: ${orderNo || "-"}`,
    `공급사: ${supplier || "-"}`,
    `발주일: ${orderDate || "-"}`, "",
    "— 품목별 차이 —",
  ];
  for (const r of order.rows) {
    const oQty = Number((r as any).order_qty ?? 0);
    const pQty = Number((r as any).purchase_qty ?? 0);
    const oPrice = Number((r as any).order_unit_price ?? 0);
    const pPrice = Number((r as any).purchase_unit_price ?? 0);
    const qtyDiff = pQty - oQty;
    const priceDiff = oPrice > 0 ? ((pPrice - oPrice) / oPrice) * 100 : 0;
    const parts: string[] = [];
    if (qtyDiff !== 0) parts.push(`수량 ${oQty}→${pQty} (${qtyDiff > 0 ? "+" : ""}${qtyDiff})`);
    if (Math.abs(priceDiff) > 1) parts.push(`단가 ${oPrice.toLocaleString()}원→${pPrice.toLocaleString()}원 (${priceDiff > 0 ? "+" : ""}${priceDiff.toFixed(1)}%)`);
    if (parts.length === 0) continue;
    lines.push(`• ${r.product_name ?? "-"} [${r.product_code}] · ${parts.join(" · ")}`);
  }
  lines.push("", "확인 후 재조정 처리 부탁드립니다.");
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

function matchDiffPill(orderQty: number, orderPrice: number | null, purchaseQty: number, purchasePrice: number): React.ReactNode {
  const qtyDiff = purchaseQty - orderQty;
  if (qtyDiff !== 0) {
    return (
      <span className="inline-flex items-center h-[20px] px-1.5 rounded border bg-rose-50 text-rose-700 border-rose-200 text-[11px] font-semibold tabular-nums">
        {qtyDiff > 0 ? "+" : ""}{qtyDiff}
      </span>
    );
  }
  if (orderPrice && orderPrice > 0 && purchasePrice > 0) {
    const pct = (purchasePrice - orderPrice) / orderPrice;
    if (Math.abs(pct) >= 0.01) {
      return (
        <span className={`inline-flex items-center h-[20px] px-1.5 rounded border text-[11px] font-semibold tabular-nums ${pct < 0 ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
          {pct > 0 ? "+" : ""}{(pct * 100).toFixed(1)}%
        </span>
      );
    }
  }
  return (
    <span className="inline-flex items-center h-[20px] px-1.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] font-semibold">
      일치
    </span>
  );
}

// 매입 라인에서 날짜 범위 추출
function purchaseDateRange(order: OrderGroup): { from: string | null; to: string | null } {
  const dates: string[] = [];
  for (const r of order.rows) {
    for (const m of r.purchase_matches ?? []) {
      if (m.purchase_date) dates.push(String(m.purchase_date));
    }
  }
  if (dates.length === 0) return { from: null, to: null };
  dates.sort();
  return { from: dates[0]!, to: dates[dates.length - 1]! };
}

export const MatchOverviewSection: React.FC = () => {
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();

  const [days, setDays] = useState<number>(7);
  const [statusFilter, setStatusFilter] = useState<FilterKey>("all");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const [matchData, setMatchData] = useState<OrderPurchaseMatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exOpen, setExOpen] = useState(false);
  const [exTargetRow, setExTargetRow] = useState<OrderMatchRow | null>(null);

  const loadMatch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await getOrderPurchaseMatchList(days);
      setMatchData(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : getErrorMessage(e, "매칭 조회 실패"));
      setMatchData(null);
    } finally { setLoading(false); }
  }, [days]);

  useEffect(() => { void loadMatch(); }, [loadMatch]);

  const allRows = useMemo((): OrderMatchRow[] => {
    if (!matchData) return [];
    return [...matchData.matched, ...matchData.exceptions, ...matchData.unmatched];
  }, [matchData]);

  const supplierGroups = useMemo(() => groupBySupplierAndOrder(allRows), [allRows]);

  const filteredOrders = useMemo((): OrderGroup[] => {
    const result: OrderGroup[] = [];
    const supQ = supplierSearch.trim().toLowerCase();
    const prodQ = productSearch.trim().toLowerCase();
    for (const sg of supplierGroups) {
      for (const og of sg.orders) {
        if (statusFilter === "pending" && og.pendingCount === 0) continue;
        if (statusFilter === "matched" && og.status !== "matched") continue;
        if (statusFilter === "exception" && og.status !== "exception") continue;
        if (supQ) {
          const nameMatch = sg.supplierDisplay.toLowerCase().includes(supQ)
            || (og.supplierRaw ?? "").toLowerCase().includes(supQ);
          if (!nameMatch) continue;
        }
        if (prodQ) {
          const hit = og.rows.some(r =>
            (r.product_name ?? "").toLowerCase().includes(prodQ)
            || r.product_code.toLowerCase().includes(prodQ)
          );
          if (!hit) continue;
        }
        result.push(og);
      }
    }
    result.sort((a, b) => (b.sentAt ?? b.orderDate ?? "").localeCompare(a.sentAt ?? a.orderDate ?? ""));
    return result;
  }, [supplierGroups, statusFilter, supplierSearch, productSearch]);

  const runConfirm = useCallback(async (rows: OrderMatchRow[]) => {
    if (rows.length === 0) return;
    const ok = await confirm({ title: "매입 확인", message: `이 발주 ${rows.length}개 라인을 매입 확인 처리하시겠습니까?`, confirmLabel: "매입확인" });
    if (!ok) return;
    setBusy(true);
    try {
      for (const r of rows) await confirmOrderPurchaseMatch(r.id, { action: "matched", exception_type: null, note: null });
      showSuccess("매입 확인 완료"); await loadMatch();
    } catch (e) { showError(e instanceof ApiError ? e.message : getErrorMessage(e, "처리 실패")); }
    finally { setBusy(false); }
  }, [confirm, loadMatch, showError, showSuccess]);

  const runUndo = useCallback(async (rows: OrderMatchRow[]) => {
    const decided = rows.filter(r => r.match_status === "matched" || r.match_status === "exception");
    if (decided.length === 0) return;
    const ok = await confirm({ title: "판정 취소", message: `이 발주의 판정(${decided.length}건)을 취소하시겠습니까?`, confirmLabel: "Undo", danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      for (const r of decided) await confirmOrderPurchaseMatch(r.id, { action: "undo", exception_type: null, note: null });
      showSuccess("판정 취소 완료"); await loadMatch();
    } catch (e) { showError(e instanceof ApiError ? e.message : getErrorMessage(e, "처리 실패")); }
    finally { setBusy(false); }
  }, [confirm, loadMatch, showError, showSuccess]);

  const openException = useCallback((row: OrderMatchRow | null) => {
    setExTargetRow(row); setExOpen(true);
  }, []);

  const toggleOpen = useCallback((key: string) => {
    setOpenKey(prev => prev === key ? null : key);
  }, []);

  const totalMatched = matchData?.counts.matched ?? 0;
  const totalExceptions = matchData?.counts.exceptions ?? 0;
  const totalUnmatched = matchData?.counts.unmatched ?? 0;
  const totalCount = filteredOrders.length;

  return (
    <section className={`${CARD} overflow-hidden relative`}>
      <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100">
        <span className="w-[3px] h-[16px] bg-violet-500 rounded-full shrink-0" aria-hidden />
        <GitDiff size={18} weight="fill" className="text-slate-500 shrink-0" />
        <div className="flex items-baseline gap-2 flex-wrap flex-1 min-w-0">
          <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">발주·매입 대조</h3>
          <span className="text-[15px] md:text-[16px] font-semibold tabular-nums text-ink leading-none">
            {totalCount.toLocaleString()}
          </span>
          <span className="text-[13px] md:text-[14px] font-medium text-slate-500">건</span>
          <span className="text-[13px] md:text-[14px] text-slate-500 font-medium truncate">· 자동 매칭 결과</span>
        </div>
        {matchData && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="inline-flex items-center h-[22px] px-2 rounded border bg-emerald-50 text-emerald-700 border-emerald-200 text-[12px] font-semibold tabular-nums">확인 {totalMatched}</span>
            {totalExceptions > 0 && (
              <span className="inline-flex items-center h-[22px] px-2 rounded border bg-amber-50 text-amber-700 border-amber-200 text-[12px] font-semibold tabular-nums">이상 {totalExceptions}</span>
            )}
            {totalUnmatched > 0 && (
              <span className="inline-flex items-center h-[22px] px-2 rounded border bg-zinc-50 text-zinc-700 border-zinc-200 text-[12px] font-semibold tabular-nums">미판정 {totalUnmatched}</span>
            )}
          </div>
        )}
      </header>

      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-slate-100 bg-slate-50/40">
        <div className="inline-flex rounded-md bg-white border border-slate-200 overflow-hidden">
          {[3, 7, 14, 30].map(d => (
            <button key={d} type="button" onClick={() => setDays(d)}
              className={`h-9 px-3 text-[13px] font-semibold tabular-nums transition-colors cursor-pointer ${days === d ? "bg-violet-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
              {d}일
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-md bg-white border border-slate-200 overflow-hidden">
          {([
            { k: "all" as const, label: "전체" },
            { k: "pending" as const, label: "미판정" },
            { k: "exception" as const, label: "이상" },
            { k: "matched" as const, label: "확인완료" },
          ]).map(o => (
            <button key={o.k} type="button" onClick={() => setStatusFilter(o.k)}
              className={`h-9 px-3 text-[13px] font-semibold transition-colors cursor-pointer ${statusFilter === o.k ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} placeholder="공급사"
            className="h-9 pl-8 pr-2.5 text-[13px] rounded-md border border-slate-200 bg-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-200 w-36" />
        </div>
        <div className="relative">
          <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="상품/코드"
            className="h-9 pl-8 pr-2.5 text-[13px] rounded-md border border-slate-200 bg-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-200 w-36" />
        </div>
      </div>

      {/* 리스트 · 좌(발주) / 우(매입) / 끝(판정+처리상태) */}
      {loading ? (
        <div className="py-16 text-center text-[14px] text-slate-500">자동 매칭 조회 중...</div>
      ) : error ? (
        <div className="m-5 p-4 rounded-md border border-rose-200 bg-rose-50 text-rose-700 text-[14px]">{error}</div>
      ) : filteredOrders.length === 0 ? (
        <div className="py-16 text-center">
          <GitDiff size={32} weight="duotone" className="mx-auto mb-2 text-slate-300" />
          <div className="text-[14px] text-slate-500">
            {allRows.length === 0 ? "기간 내 발주가 없거나 매칭 결과가 비어 있습니다" : "조건에 맞는 발주 없음"}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {/* 컬럼 헤더 (좌/우/끝) */}
          <div className="grid grid-cols-[1fr_1fr_220px] bg-slate-50/60 text-[11.5px] font-semibold text-slate-500 uppercase tracking-wide">
            <div className="px-4 py-2 border-r border-slate-200">발주정보</div>
            <div className="px-4 py-2 border-r border-slate-200">매입정보</div>
            <div className="px-4 py-2 text-right">판정 · 처리상태</div>
          </div>
          {filteredOrders.map((og) => (
            <MatchOrderRow key={og.orderKey} order={og}
              isOpen={openKey === og.orderKey} onToggle={() => toggleOpen(og.orderKey)}
              busy={busy} onConfirm={runConfirm} onUndo={runUndo} onException={openException} />
          ))}
        </div>
      )}

      {exOpen && (
        <ExceptionNoteModal open={exOpen}
          onClose={() => { setExOpen(false); setExTargetRow(null); }}
          orderId={exTargetRow?.id ?? null}
          orderNumber={exTargetRow?.order_number ?? null}
          defaultExceptionType={effectiveExceptionType(exTargetRow)}
          defaultNote={exTargetRow?.exception_note ?? null}
          onSaved={async () => { setExTargetRow(null); await loadMatch(); }}
        />
      )}
    </section>
  );
};

// ─────────────────────────────────────────────────────────────────
// MatchOrderRow · 좌(발주) / 우(매입) / 끝(판정+처리상태) 한 행
//   · 매입 불일치 (금액 또는 수량 차이) → 우측 rose 톤
//   · 클릭 → 아래 좌(품목 상세) + 우(매칭 상세) 2-grid inline expand
// ─────────────────────────────────────────────────────────────────
interface MatchOrderRowProps {
  order: OrderGroup;
  isOpen: boolean;
  onToggle: () => void;
  busy: boolean;
  onConfirm: (rows: OrderMatchRow[]) => Promise<void>;
  onUndo: (rows: OrderMatchRow[]) => Promise<void>;
  onException: (row: OrderMatchRow | null) => void;
}

const MatchOrderRow: React.FC<MatchOrderRowProps> = ({ order, isOpen, onToggle, busy, onConfirm, onUndo, onException }) => {
  const purchaseGroup = useMemo(() => buildPurchaseGroup(order), [order]);
  const supplierDisplay = displayVendorName(order.supplierRaw ?? "") || order.supplier;
  const totalOrderQty = order.rows.reduce((s, r) => s + Number(r.order_qty ?? 0), 0);
  const totalOrderAmount = order.totalOrderAmount;
  const totalPurchaseAmount = purchaseGroup.totalPurchaseAmount;
  const totalPurchaseQty = purchaseGroup.totalPurchaseQty;
  const purchaseKinds = useMemo(() => {
    const codes = new Set<string>();
    for (const l of purchaseGroup.lines) if (l.match) codes.add(l.productCode);
    return codes.size;
  }, [purchaseGroup]);
  const anyPending = order.rows.some(r => !r.match_status && r.auto_status !== "matched");
  const decidedCount = order.rows.filter(r => r.match_status === "matched" || r.match_status === "exception").length;
  const pDates = useMemo(() => purchaseDateRange(order), [order]);

  // 매입 불일치 판정: 매입 없음 OR 금액 차이 OR 수량 차이
  const isMismatch = useMemo(() => {
    if (totalPurchaseAmount <= 0) return true;
    if (totalOrderAmount > 0 && Math.abs(totalPurchaseAmount - totalOrderAmount) / totalOrderAmount > 0.01) return true;
    if (totalOrderQty > 0 && totalPurchaseQty !== totalOrderQty) return true;
    return false;
  }, [totalOrderAmount, totalPurchaseAmount, totalOrderQty, totalPurchaseQty]);

  const pill = PO_STATUS_PILL[order.status];
  const pillLabel = PO_STATUS_LABEL[order.status];

  return (
    <div>
      {/* 메인 행 · 좌/우/끝 3-column grid */}
      <div onClick={onToggle}
        className="grid grid-cols-[1fr_1fr_220px] cursor-pointer hover:bg-slate-50/40 transition-colors">
        {/* 좌 · 발주정보 */}
        <div className="px-4 py-3 border-r border-slate-200 flex gap-2">
          <CaretRight size={13} weight="bold"
            className={`shrink-0 text-slate-400 transition-transform mt-0.5 ${isOpen ? "rotate-90" : ""}`} />
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="text-[13px] text-slate-500 font-mono truncate">#{order.orderNumber ?? "—"}</div>
            <div className="text-[14px] font-semibold text-ink truncate">{supplierDisplay || "공급사 미지정"}</div>
            <div className="text-[12.5px] text-slate-600">{shortDate(order.sentAt ?? order.orderDate) || "—"}</div>
            <div className="text-[12.5px] text-slate-600 tabular-nums">{order.distinctProducts}종 · {fmtQty(totalOrderQty)}</div>
            <div className="text-[14px] font-semibold text-emerald-700 tabular-nums">{fmtWon(totalOrderAmount)}</div>
          </div>
        </div>
        {/* 우 · 매입정보 (불일치 시 rose 톤) */}
        <div className={`px-4 py-3 border-r border-slate-200 space-y-0.5 ${isMismatch ? "bg-rose-50/60" : ""}`}>
          <div className="text-[13px] text-slate-500 truncate">
            {pDates.from ? (pDates.from === pDates.to ? shortDate(pDates.from) : `${shortDate(pDates.from)} ~ ${shortDate(pDates.to)}`) : "—"}
          </div>
          <div className="text-[14px] font-semibold text-ink truncate">{supplierDisplay || "—"}</div>
          <div className="text-[12.5px] text-slate-600 tabular-nums">
            {purchaseGroup.matchedCount > 0 ? `${purchaseKinds}종 · ${fmtQty(totalPurchaseQty)}` : "—"}
          </div>
          <div className="text-[12.5px] text-slate-600 tabular-nums">
            매칭 {purchaseGroup.matchedCount} · 미매칭 {purchaseGroup.missingCount}
          </div>
          {totalPurchaseAmount > 0 ? (
            <div className={`text-[14px] font-semibold tabular-nums ${isMismatch ? "text-rose-700" : "text-sky-700"}`}>
              {fmtWon(totalPurchaseAmount)}
            </div>
          ) : (
            <div className="inline-flex items-center h-[20px] px-1.5 rounded border bg-rose-50 text-rose-700 border-rose-200 text-[11.5px] font-semibold">
              매입 없음
            </div>
          )}
        </div>
        {/* 끝 · 판정 액션 + 처리상태 */}
        <div className="px-3 py-3 flex flex-col items-end gap-1.5" onClick={e => e.stopPropagation()}>
          <span className={`inline-flex items-center h-[22px] px-2 rounded border text-[12px] font-semibold ${pill.bg} ${pill.text} ${pill.border}`}>
            {pillLabel}
            {order.hasUserDecision && <span className="ml-1 text-[10px] opacity-70">판정</span>}
          </span>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {anyPending ? (
              <>
                <button type="button" onClick={() => { void onConfirm(order.rows); }} disabled={busy}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 text-[11.5px] font-semibold hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer">
                  <PhCheck size={11} weight="bold" />매입확인
                </button>
                <button type="button" onClick={() => onException(order.rows[0] ?? null)} disabled={busy}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded border border-amber-200 bg-amber-50 text-amber-700 text-[11.5px] font-semibold hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer">
                  <PhWarning size={11} weight="bold" />이상
                </button>
                {(() => {
                  const mailto = buildMatchMailto(order);
                  if (!mailto) return null;
                  return (
                    <a href={mailto} onClick={e => e.stopPropagation()}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded border border-sky-200 bg-sky-50 text-sky-700 text-[11.5px] font-semibold hover:bg-sky-100 transition-colors cursor-pointer"
                      title="공급사 담당자에게 재조정 이메일 발송">
                      <EnvelopeSimple size={11} weight="fill" />이메일
                    </a>
                  );
                })()}
              </>
            ) : decidedCount > 0 ? (
              <button type="button" onClick={() => { void onUndo(order.rows); }} disabled={busy}
                className="inline-flex items-center gap-1 h-7 px-2 rounded border border-slate-200 bg-white text-slate-600 text-[11.5px] font-semibold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer">
                <ArrowCounterClockwise size={11} weight="bold" />판정취소
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* 펼침 상세 · 좌(품목) / 우(매칭) 2-grid */}
      {isOpen && (
        <div className="grid grid-cols-2 bg-slate-50/40 border-t border-slate-100">
          {/* 좌 · 품목 상세 */}
          <div className="p-3 border-r border-slate-200">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-[12px] font-semibold text-slate-700">품목 상세</span>
              <span className="text-[11px] text-slate-400">·</span>
              <span className="text-[12px] text-slate-500 tabular-nums">{order.distinctProducts}종 · {fmtQty(totalOrderQty)}</span>
            </div>
            <div className="rounded border border-slate-200 bg-white overflow-hidden">
              <table className="w-full text-[12px] tabular-nums">
                <thead>
                  <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide bg-slate-50/60 border-b border-slate-200">
                    <th className="text-center px-2 py-1.5 w-9">No</th>
                    <th className="text-left px-2 py-1.5 min-w-[160px]">상품</th>
                    <th className="text-right px-2 py-1.5 w-16">발주량</th>
                    <th className="text-right px-2 py-1.5 w-20">단가</th>
                    <th className="text-right px-2 py-1.5 w-24">금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.rows.map((r, i) => {
                    const qty = Number(r.order_qty ?? 0);
                    const price = r.unit_price != null ? Number(r.unit_price) : 0;
                    const amt = qty * price;
                    return (
                      <tr key={`${order.orderKey}-o-${i}`} className="hover:bg-slate-50/40">
                        <td className="text-center px-2 py-1.5 text-slate-400 text-[11px]">{String(i + 1).padStart(2, "0")}</td>
                        <td className="text-left px-2 py-1.5">
                          <div className="flex flex-col leading-tight">
                            <span className="font-semibold text-ink text-[12px]">{r.product_name && String(r.product_name).trim() !== "" ? r.product_name : "-"}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{r.product_code}</span>
                          </div>
                        </td>
                        <td className="text-right px-2 py-1.5 font-semibold text-emerald-700">{qty.toLocaleString()}</td>
                        <td className="text-right px-2 py-1.5 text-slate-500">{price > 0 ? fmtWon(price) : "—"}</td>
                        <td className="text-right px-2 py-1.5 font-semibold text-ink">{amt > 0 ? fmtWon(amt) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {/* 우 · 매칭 상세 */}
          <div className={`p-3 ${isMismatch ? "bg-rose-50/30" : ""}`}>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-[12px] font-semibold text-slate-700">매칭 상세</span>
              <span className="text-[11px] text-slate-400">·</span>
              <span className="text-[12px] text-slate-500 tabular-nums">{purchaseKinds}종 · {fmtQty(totalPurchaseQty)}</span>
            </div>
            <div className="rounded border border-slate-200 bg-white overflow-hidden">
              <table className="w-full text-[12px] tabular-nums">
                <thead>
                  <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide bg-slate-50/60 border-b border-slate-200">
                    <th className="text-center px-2 py-1.5 w-9">No</th>
                    <th className="text-left px-2 py-1.5 min-w-[160px]">상품</th>
                    <th className="text-right px-2 py-1.5 w-16">매입량</th>
                    <th className="text-right px-2 py-1.5 w-20">단가</th>
                    <th className="text-right px-2 py-1.5 w-24">금액</th>
                    <th className="text-center px-2 py-1.5 w-14">Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {purchaseGroup.lines.map((l, i) => (
                    <tr key={`${order.orderKey}-p-${i}`} className="hover:bg-slate-50/40">
                      <td className="text-center px-2 py-1.5 text-slate-400 text-[11px]">{String(i + 1).padStart(2, "0")}</td>
                      <td className="text-left px-2 py-1.5">
                        <div className="flex flex-col leading-tight">
                          <span className="font-semibold text-ink text-[12px]">{l.productName && String(l.productName).trim() !== "" ? l.productName : "-"}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{l.productCode}</span>
                        </div>
                      </td>
                      <td className="text-right px-2 py-1.5">
                        {l.match ? <span className="font-semibold text-sky-700">{Number(l.match.quantity).toLocaleString()}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="text-right px-2 py-1.5 text-slate-500">{l.match ? fmtWon(l.match.unit_price) : "—"}</td>
                      <td className="text-right px-2 py-1.5">
                        {l.match ? <span className="font-semibold text-sky-700">{fmtWon(l.match.amount)}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="text-center px-2 py-1.5">
                        {l.match
                          ? matchDiffPill(l.orderQty, l.orderUnitPrice, Number(l.match.quantity), Number(l.match.unit_price))
                          : <span className="inline-flex items-center h-[20px] px-1.5 rounded border bg-zinc-50 text-zinc-600 border-zinc-200 text-[11px] font-semibold">매입 없음</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {order.rows[0] && effectiveStatus(order.rows[0]) === "exception" && order.rows[0].exception_note && (
              <div className="mt-2 text-[12px] text-slate-500 italic truncate">메모 · {order.rows[0].exception_note}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
