// 2026-10-06 · 발주매입대조 v5 · 좌우 2열 GRID 비교 · 자동매칭 · 처리완료 workflow (resolution_status)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck, CheckCircle2, AlertTriangle, RotateCcw,
  ChevronDown, ChevronRight, Search,
} from "lucide-react";
import { Card } from "../common/Card";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { InlineLabel } from "../common/InlineLabel";
import { PeriodSelector } from "../common/PeriodSelector";
import { Button } from "../common/Button";
import { useToast, toastClass } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { ApiError } from "../../lib/apiClient";
import { getErrorMessage } from "../../lib/errorMessage";
import { shortDate } from "../../lib/dateFormat";
import { displayVendorName } from "../../utils/vendorNameNormalize";
import {
  getOrderPurchaseMatchList,
  confirmOrderPurchaseMatch,
  type OrderMatchRow,
  type OrderPurchaseMatchResponse,
} from "../../lib/api/orderPurchaseMatchApi";
import {
  fmtQty, fmtWon,
  effectiveStatus, effectiveExceptionType,
  groupBySupplierAndOrder, buildPurchaseGroup,
  type OrderGroup, type FilterKey,
} from "./OrderPurchaseMatchTab.types";
import { ExceptionNoteModal } from "./ExceptionNoteModal";

// ═════════════════════════════════════════════════════════════════
// Diff pill · 수량·단가 차이
// ═════════════════════════════════════════════════════════════════
function renderDiff(orderQty: number, orderPrice: number | null, purchaseQty: number, purchasePrice: number): React.ReactNode {
  const qtyDiff = purchaseQty - orderQty;
  if (qtyDiff !== 0) {
    return (
      <StatusPill tone={qtyDiff < 0 ? "rose" : "amber"} size="xs">
        {qtyDiff > 0 ? "+" : ""}{qtyDiff}
      </StatusPill>
    );
  }
  if (orderPrice && orderPrice > 0) {
    const pct = (purchasePrice - orderPrice) / orderPrice;
    if (Math.abs(pct) > 0.01) {
      return (
        <StatusPill tone="amber" size="xs">{pct > 0 ? "+" : ""}{(pct * 100).toFixed(1)}%</StatusPill>
      );
    }
  }
  return <StatusPill tone="emerald" size="xs" dot>일치</StatusPill>;
}

// PO-level status label · MATCHED / PARTIAL / UNMATCHED
const PO_STATUS_LABEL: Record<"matched" | "exception" | "unmatched" | "mixed" | "resolved", string> = {
  matched: "완료",
  exception: "이상",
  unmatched: "미매입",
  mixed: "부분",
  resolved: "처리완료",
};
const PO_STATUS_TONE: Record<"matched" | "exception" | "unmatched" | "mixed" | "resolved", "emerald" | "amber" | "zinc" | "sky" | "indigo"> = {
  matched: "emerald",
  exception: "amber",
  unmatched: "zinc",
  mixed: "sky",
  resolved: "indigo",
};

// ═════════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═════════════════════════════════════════════════════════════════
export const OrderPurchaseMatchTab: React.FC = () => {
  const { toast, showError, showSuccess } = useToast();
  const confirm = useConfirm();

  // ─── 필터 state ─────────────────────────────────────
  const [days, setDays] = useState<number>(7);
  const [statusFilter, setStatusFilter] = useState<FilterKey>("all");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  // ─── 데이터 state ─────────────────────────────────────
  const [matchData, setMatchData] = useState<OrderPurchaseMatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exOpen, setExOpen] = useState(false);
  const [exTargetRow, setExTargetRow] = useState<OrderMatchRow | null>(null);

  // ─── 자동 매칭 fetch · days 변경 시 재조회 ─────────────────────
  const loadMatch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await getOrderPurchaseMatchList(days);
      setMatchData(r);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : getErrorMessage(e, "매칭 조회 실패");
      setError(msg);
      setMatchData(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void loadMatch(); }, [loadMatch]);

  // ─── 그룹핑 · supplier → order · 자동 ─────────────────────────
  const allRows = useMemo((): OrderMatchRow[] => {
    if (!matchData) return [];
    return [...matchData.matched, ...matchData.exceptions, ...matchData.unmatched];
  }, [matchData]);

  const supplierGroups = useMemo(() => groupBySupplierAndOrder(allRows), [allRows]);

  // ─── 필터 적용 · flat orders ────────────────────────────────
  const filteredOrders = useMemo((): OrderGroup[] => {
    const result: OrderGroup[] = [];
    const supQ = supplierSearch.trim().toLowerCase();
    const prodQ = productSearch.trim().toLowerCase();
    for (const sg of supplierGroups) {
      for (const og of sg.orders) {
        if (statusFilter === "pending" && og.pendingCount === 0) continue;
        if (statusFilter === "matched" && og.status !== "matched") continue;
        if (statusFilter === "exception" && og.status !== "exception" && og.status !== "unmatched" && og.status !== "mixed") continue;
        if (statusFilter === "exception" && og.unresolvedAbnormalCount === 0) continue;
        if (statusFilter === "resolved" && og.resolvedCount === 0) continue;
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
    // 최신 발주일 desc 정렬
    result.sort((a, b) => (b.sentAt ?? b.orderDate ?? "").localeCompare(a.sentAt ?? a.orderDate ?? ""));
    return result;
  }, [supplierGroups, statusFilter, supplierSearch, productSearch]);

  // ─── 액션 핸들러 (기존 business logic 그대로) ─────────────────
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

  const runResolve = useCallback(async (rows: OrderMatchRow[]) => {
    const targets = rows.filter(r => effectiveStatus(r) !== "matched" && r.resolution_status !== "resolved");
    if (targets.length === 0) return;
    const note = window.prompt(`${targets.length}개 라인 처리완료 · 처리 내용 (예: "거래처 품절 10개, 추가입고 없음 확인")`, "");
    if (note === null) return;
    setBusy(true);
    try {
      for (const r of targets) await confirmOrderPurchaseMatch(r.id, { action: "resolve", exception_type: null, note: note || null });
      showSuccess("처리완료"); await loadMatch();
    } catch (e) { showError(e instanceof ApiError ? e.message : getErrorMessage(e, "처리 실패")); }
    finally { setBusy(false); }
  }, [loadMatch, showError, showSuccess]);

  const runUnresolve = useCallback(async (rows: OrderMatchRow[]) => {
    const targets = rows.filter(r => r.resolution_status === "resolved");
    if (targets.length === 0) return;
    const ok = await confirm({ title: "처리완료 취소", message: `${targets.length}개 라인의 처리완료를 취소하시겠습니까?`, confirmLabel: "처리완료 취소", danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      for (const r of targets) await confirmOrderPurchaseMatch(r.id, { action: "unresolve", exception_type: null, note: null });
      showSuccess("처리완료 취소됨"); await loadMatch();
    } catch (e) { showError(e instanceof ApiError ? e.message : getErrorMessage(e, "처리 실패")); }
    finally { setBusy(false); }
  }, [confirm, loadMatch, showError, showSuccess]);

  const openException = useCallback((row: OrderMatchRow | null) => {
    setExTargetRow(row);
    setExOpen(true);
  }, []);

  const toggleOpen = useCallback((key: string) => {
    setOpenKey(prev => prev === key ? null : key);
  }, []);

  // ─── 렌더 ─────────────────────────────────────────────
  const totalMatched = matchData?.counts.matched ?? 0;
  const totalExceptions = matchData?.counts.exceptions ?? 0;
  const totalUnmatched = matchData?.counts.unmatched ?? 0;

  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}

      <div className="flex flex-col gap-3">
        {/* ═══ 상단 툴바 · 기간·필터·검색 ═══ */}
        <Card className="p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} className="text-brand-deep" strokeWidth={2.2} />
            <span className="text-[18px] font-semibold text-ink tracking-tight">발주매입 대조</span>
          </div>
          <div className="flex items-center gap-2">
            <InlineLabel size="sm">기간</InlineLabel>
            <PeriodSelector<number>
              options={[
                { value: 3, label: "3일" },
                { value: 7, label: "7일" },
                { value: 14, label: "14일" },
                { value: 30, label: "30일" },
              ]}
              value={days}
              onChange={setDays}
              size="sm"
              ariaLabel="발주-매입 매칭 기간"
            />
          </div>
          {/* 상태 필터 */}
          <div className="inline-flex bg-zinc-100 border border-line rounded-lg p-1 gap-0.5">
            {([
              { k: "all" as const,       label: "전체" },
              { k: "pending" as const,   label: "미판정" },
              { k: "matched" as const,   label: "정상확인" },
              { k: "exception" as const, label: "이상" },
              { k: "resolved" as const,  label: "처리완료" },
            ]).map(o => (
              <button key={o.k} type="button" onClick={() => setStatusFilter(o.k)}
                className={`h-7 px-2.5 text-[15px] font-semibold rounded-md transition-colors cursor-pointer ${statusFilter === o.k ? "bg-brand-deep text-white shadow-sm" : "text-ink hover:text-brand-deep hover:bg-white"}`}>
                {o.label}
              </button>
            ))}
          </div>
          {/* 공급사 search */}
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              placeholder="공급사"
              className="h-7 pl-7 pr-2 text-[15px] rounded-md border border-line bg-white focus:border-brand-deep focus:outline-none w-32"
            />
          </div>
          {/* 상품 search */}
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="상품/코드"
              className="h-7 pl-7 pr-2 text-[15px] rounded-md border border-line bg-white focus:border-brand-deep focus:outline-none w-32"
            />
          </div>
          <div className="flex-1" />
          {matchData && (
            <div className="flex items-center gap-1.5">
              <StatusPill tone="emerald" size="xs">{totalMatched} 확인</StatusPill>
              {totalExceptions > 0 && <StatusPill tone="amber" size="xs">{totalExceptions} 이상</StatusPill>}
              {totalUnmatched > 0 && <StatusPill tone="zinc" size="xs">{totalUnmatched} 미판정</StatusPill>}
            </div>
          )}
        </Card>

        {/* ═══ 비교 영역 ═══ */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size={16} tone="zinc" label="자동 매칭 조회 중..." labelSize={14} />
          </div>
        ) : error ? (
          <Card className="p-6 border-rose-200 bg-rose-50 text-rose-700 text-[16px]">{error}</Card>
        ) : filteredOrders.length === 0 ? (
          <Card className="p-12">
            <EmptyState
              icon={ClipboardCheck}
              title="조건에 맞는 발주 없음"
              hint={allRows.length === 0 ? "기간 내 발주가 없거나 매칭 결과가 비어 있습니다" : "필터를 조정해 보세요"}
            />
          </Card>
        ) : (
          <Card clip padding="none" className="overflow-hidden">
            {/* ─── sticky COLUMN HEADER · lg+ 2열 ─── */}
            <div className="hidden lg:grid lg:grid-cols-2 sticky top-0 z-20 bg-white border-b border-zinc-200/80 shadow-[0_1px_0_rgba(0,0,0,0.03)] text-[14px] font-semibold text-zinc-500 uppercase tracking-wide">
              <div className="grid grid-cols-[28px_minmax(0,1fr)_76px_72px_84px_52px] gap-x-2 px-3 py-2.5 border-r border-zinc-200/80">
                <span />
                <span>발주번호 · 공급사</span>
                <span>발주기간</span>
                <span className="text-right">품목·수량</span>
                <span className="text-right">발주금액</span>
                <span className="text-center">문서</span>
              </div>
              <div className="grid grid-cols-[28px_minmax(0,1fr)_76px_72px_84px_80px] gap-x-2 px-3 py-2.5">
                <span />
                <span>매입일 · 공급사</span>
                <span>매입기간</span>
                <span className="text-right">품목·수량</span>
                <span className="text-right">매입금액</span>
                <span className="text-center">상태</span>
              </div>
            </div>

            {/* ─── 모바일 (lg 미만) · 스택 설명 ─── */}
            <div className="lg:hidden px-3 py-2 bg-zinc-50 border-b border-zinc-200/80 text-[14px] text-zinc-500">
              발주 ↓ 매입 매칭 (좁은 화면: 세로 스택)
            </div>

            {/* ─── 페어 ROWS · lg+ 2열 grid · 전체 페이지 scroll ─── */}
            <div className="divide-y divide-zinc-100">
              {filteredOrders.map((og) => (
                <PairedRow
                  key={og.orderKey}
                  order={og}
                  isOpen={openKey === og.orderKey}
                  onToggle={() => toggleOpen(og.orderKey)}
                  busy={busy}
                  onConfirm={runConfirm}
                  onUndo={runUndo}
                  onException={openException}
                  onResolve={runResolve}
                  onUnresolve={runUnresolve}
                />
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* 이상 판정 메모 모달 */}
      {exOpen && (
        <ExceptionNoteModal
          open={exOpen}
          onClose={() => { setExOpen(false); setExTargetRow(null); }}
          orderId={exTargetRow?.id ?? null}
          orderNumber={exTargetRow?.order_number ?? null}
          defaultExceptionType={effectiveExceptionType(exTargetRow)}
          defaultNote={exTargetRow?.exception_note ?? null}
          onSaved={async () => {
            setExTargetRow(null);
            await loadMatch();
          }}
        />
      )}
    </>
  );
};

// ═════════════════════════════════════════════════════════════════
// PairedRow · 한 발주 + 매칭 매입 = 2열 grid row
// ═════════════════════════════════════════════════════════════════
interface PairedRowProps {
  order: OrderGroup;
  isOpen: boolean;
  onToggle: () => void;
  busy: boolean;
  onConfirm: (rows: OrderMatchRow[]) => Promise<void>;
  onUndo: (rows: OrderMatchRow[]) => Promise<void>;
  onException: (row: OrderMatchRow | null) => void;
  onResolve: (rows: OrderMatchRow[]) => Promise<void>;
  onUnresolve: (rows: OrderMatchRow[]) => Promise<void>;
}

const PairedRow: React.FC<PairedRowProps> = ({ order, isOpen, onToggle, busy, onConfirm, onUndo, onException, onResolve, onUnresolve }) => {
  const purchaseGroup = useMemo(() => buildPurchaseGroup(order), [order]);
  const supplierDisplay = displayVendorName(order.supplierRaw ?? "") || order.supplier;
  const poStatus = order.status;
  const totalPurchaseQty = purchaseGroup.totalPurchaseQty;
  const anyPending = order.rows.some(r => !r.match_status && r.auto_status !== "matched");
  const decidedCount = order.rows.filter(r => r.match_status === "matched" || r.match_status === "exception").length;

  const accentColor = poStatus === "matched" ? "bg-emerald-400"
    : poStatus === "exception" ? "bg-amber-400"
    : poStatus === "unmatched" ? "bg-zinc-300"
    : "bg-sky-400";

  return (
    <div className="grid lg:grid-cols-2 items-start hover:bg-zinc-50/40 transition-colors">
      {/* ═══ 좌 · 발주 ═══ */}
      <div className="lg:border-r border-zinc-200/60 min-w-0">
        <OrderCell
          order={order}
          supplierDisplay={supplierDisplay}
          isOpen={isOpen}
          onToggle={onToggle}
          accentColor={accentColor}
        />
      </div>

      {/* ═══ 우 · 매입 ═══ */}
      <div className="min-w-0 border-t lg:border-t-0 border-zinc-200/60">
        <PurchaseCell
          order={order}
          purchaseGroup={purchaseGroup}
          supplierDisplay={supplierDisplay}
          totalPurchaseQty={totalPurchaseQty}
          poStatus={poStatus}
          anyPending={anyPending}
          decidedCount={decidedCount}
          isOpen={isOpen}
          busy={busy}
          onConfirm={onConfirm}
          onUndo={onUndo}
          onException={onException}
          onResolve={onResolve}
          onUnresolve={onUnresolve}
        />
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════
// OrderCell · 좌측 발주
// ═════════════════════════════════════════════════════════════════
interface OrderCellProps {
  order: OrderGroup;
  supplierDisplay: string;
  isOpen: boolean;
  onToggle: () => void;
  accentColor: string;
}

const OrderCell: React.FC<OrderCellProps> = ({ order, supplierDisplay, isOpen, onToggle, accentColor }) => {
  const totalQty = order.rows.reduce((s, r) => s + Number(r.order_qty ?? 0), 0);
  return (
    <>
      {/* 요약 ROW · 클릭 → one-at-a-time toggle */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left grid lg:grid-cols-[28px_minmax(0,1fr)_76px_72px_84px_52px] grid-cols-[32px_1fr] gap-x-2 px-3 py-3 hover:bg-zinc-50/60 transition-colors cursor-pointer"
      >
        <div className="flex items-stretch">
          <div className={`w-1 self-stretch ${accentColor}`} />
          <span className="flex items-center justify-center w-7 shrink-0">
            {isOpen
              ? <ChevronDown size={14} className="text-zinc-400" strokeWidth={2.4} />
              : <ChevronRight size={14} className="text-zinc-300" strokeWidth={2.4} />}
          </span>
        </div>
        {/* 발주번호 + 공급사 */}
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-[14px] text-zinc-400 tabular-nums font-medium">#{order.orderNumber ?? "—"}</span>
          <span className="text-[17px] font-bold text-ink whitespace-normal break-words">{supplierDisplay || "공급사 미지정"}</span>
        </div>
        {/* 발주기간 */}
        <div className="hidden lg:block text-[15px] text-zinc-500 tabular-nums self-center">
          {shortDate(order.sentAt ?? order.orderDate) || "—"}
        </div>
        {/* 품목·수량 */}
        <div className="hidden lg:block text-right text-[15px] text-zinc-600 tabular-nums self-center">
          {order.distinctProducts}종 · {totalQty.toLocaleString()}개
        </div>
        {/* 발주금액 */}
        <div className="hidden lg:block text-right self-center">
          <span className="text-[16px] font-bold text-emerald-700 tabular-nums">{fmtWon(order.totalOrderAmount)}</span>
        </div>
        {/* 문서 (PDF button placeholder · 기존 OrderHistoryTab 핸들러는 별도 · 이 뷰에서는 미제공) */}
        <div className="hidden lg:block self-center text-center text-[14px] text-zinc-300">—</div>
      </button>

      {/* 모바일 요약 2줄 */}
      <div className="lg:hidden px-3 pb-2 text-[14px] text-zinc-500 tabular-nums flex flex-wrap gap-x-3 gap-y-0.5">
        <span>{shortDate(order.sentAt ?? order.orderDate) || "—"}</span>
        <span>{order.distinctProducts}종 · {totalQty.toLocaleString()}개</span>
        <span className="font-bold text-emerald-700">{fmtWon(order.totalOrderAmount)}</span>
      </div>

      {/* 상세 · 품목 리스트 */}
      {isOpen && (
        <div className="px-3 pb-3">
          <div className={`border-l-2 pl-2 ${accentColor.replace("bg-", "border-")}`}>
            {/* label header */}
            <div className="py-1.5 flex items-baseline gap-2 flex-wrap">
              <span className="text-[14px] font-bold text-zinc-700 tracking-tight">품목 상세</span>
              <span className="text-[13px] text-zinc-400">·</span>
              <span className="text-[14px] font-medium text-zinc-500 tabular-nums">{order.distinctProducts}종 · {totalQty.toLocaleString()}개</span>
            </div>
            <table className="w-full text-[15px] tabular-nums table-fixed">
              <colgroup>
                <col className="w-9" /><col className="min-w-[160px]" /><col className="w-16" /><col className="w-20" /><col className="w-24" />
              </colgroup>
              <thead>
                <tr className="text-[13px] font-semibold text-zinc-500 border-b border-zinc-200">
                  <th className="text-center px-2 py-1.5">No</th>
                  <th className="text-left px-2 py-1.5">상품</th>
                  <th className="text-right px-2 py-1.5">발주수량</th>
                  <th className="text-right px-2 py-1.5">단가</th>
                  <th className="text-right px-2 py-1.5">금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {order.rows.map((r, i) => (
                  <tr key={`o-${String(r.id)}`}>
                    <td className="text-center px-2 py-1.5 text-zinc-400 text-[14px]">{String(i + 1).padStart(2, "0")}</td>
                    <td className="text-left px-2 py-1.5">
                      <div className="flex flex-col leading-tight">
                        <span className="font-semibold text-ink text-[15px]">{r.product_name && String(r.product_name).trim() !== "" ? r.product_name : "-"}</span>
                        <span className="text-[13px] text-zinc-400 font-medium">{r.product_code}</span>
                      </div>
                    </td>
                    <td className="text-right px-2 py-1.5 font-bold text-rose-600">{Number(r.order_qty).toLocaleString()}</td>
                    <td className="text-right px-2 py-1.5 text-zinc-500">{r.unit_price && r.unit_price > 0 ? fmtWon(r.unit_price) : "—"}</td>
                    <td className="text-right px-2 py-1.5 font-bold text-emerald-700">{r.unit_price && r.unit_price > 0 ? fmtWon(Number(r.order_qty) * Number(r.unit_price)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
};

// ═════════════════════════════════════════════════════════════════
// PurchaseCell · 우측 매입
// ═════════════════════════════════════════════════════════════════
interface PurchaseCellProps {
  order: OrderGroup;
  purchaseGroup: ReturnType<typeof buildPurchaseGroup>;
  supplierDisplay: string;
  totalPurchaseQty: number;
  poStatus: "matched" | "exception" | "unmatched" | "mixed" | "resolved";
  anyPending: boolean;
  decidedCount: number;
  isOpen: boolean;
  busy: boolean;
  onConfirm: (rows: OrderMatchRow[]) => Promise<void>;
  onUndo: (rows: OrderMatchRow[]) => Promise<void>;
  onException: (row: OrderMatchRow | null) => void;
  onResolve: (rows: OrderMatchRow[]) => Promise<void>;
  onUnresolve: (rows: OrderMatchRow[]) => Promise<void>;
}

const PurchaseCell: React.FC<PurchaseCellProps> = ({
  order, purchaseGroup, supplierDisplay, totalPurchaseQty, poStatus,
  anyPending, decidedCount, isOpen, busy, onConfirm, onUndo, onException, onResolve, onUnresolve,
}) => {
  // 매입 날짜 범위
  const purchaseDates = purchaseGroup.lines.map(l => l.match?.purchase_date).filter((d): d is string => !!d).sort();
  const purchaseFirst = purchaseDates[0] ?? null;
  const purchaseLast = purchaseDates[purchaseDates.length - 1] ?? null;
  const purchaseRangeLabel = purchaseFirst
    ? (purchaseFirst === purchaseLast ? shortDate(purchaseFirst) : `${shortDate(purchaseFirst)}~${shortDate(purchaseLast)}`)
    : "—";
  const matchedProducts = purchaseGroup.lines.filter(l => l.match !== null).length;
  // Diff: 수량·단가·금액 전부 체크 · 차이 시 rose
  const totalOrderQty = order.rows.reduce((s, r) => s + Number(r.order_qty ?? 0), 0);
  const totalOrderAmount = order.totalOrderAmount;
  const totalPurchaseAmount = purchaseGroup.totalPurchaseAmount;
  const qtyDiff = totalPurchaseQty - totalOrderQty;
  const amountDiff = totalPurchaseAmount - totalOrderAmount;
  const hasQtyDiff = qtyDiff !== 0 && matchedProducts > 0;
  const hasAmountDiff = amountDiff !== 0 && matchedProducts > 0;
  const anyDiff = hasQtyDiff || hasAmountDiff;
  // 발주 ≠ 매입 (수량·단가·금액 중 하나라도) → 전부 rose 통일 · "다름" 강조
  const diffTone = "text-rose-600";
  const diffLabel = qtyDiff > 0 ? `+${qtyDiff.toLocaleString()}` : qtyDiff.toLocaleString();
  const amountDiffLabel = amountDiff > 0 ? `+${fmtWon(amountDiff)}` : fmtWon(amountDiff);

  return (
    <>
      {/* 요약 ROW */}
      <div className="grid lg:grid-cols-[28px_minmax(0,1fr)_76px_72px_84px_80px] grid-cols-[32px_1fr] gap-x-2 px-3 py-3">
        <div /* placeholder accent · 좌측 발주와 수평 align */ />
        <div className="flex items-center min-w-0 overflow-hidden">
          <span className="text-[16px] font-semibold text-zinc-700 truncate">{supplierDisplay || "공급사 미지정"}</span>
        </div>
        <div className="hidden lg:block text-[15px] text-zinc-500 tabular-nums self-center truncate">{purchaseRangeLabel}</div>
        <div className="hidden lg:flex flex-col items-end text-[17px] tabular-nums self-center leading-tight">
          <span className={hasQtyDiff ? "text-rose-600 font-semibold" : "text-zinc-600"}>
            {matchedProducts > 0 ? `${matchedProducts}종 · ${totalPurchaseQty.toLocaleString()}개` : "—"}
          </span>
          {hasQtyDiff && (
            <span className="text-[15px] font-bold text-rose-600" title={`발주 ${totalOrderQty.toLocaleString()}개 vs 매입 ${totalPurchaseQty.toLocaleString()}개`}>
              {diffLabel}
            </span>
          )}
        </div>
        <div className="hidden lg:flex flex-col items-end text-right self-center leading-tight">
          <span className={`text-[18px] font-bold tabular-nums ${hasAmountDiff ? "text-rose-600" : "text-sky-700"}`}>
            {purchaseGroup.totalPurchaseAmount > 0 ? fmtWon(purchaseGroup.totalPurchaseAmount) : "—"}
          </span>
          {hasAmountDiff && (
            <span className="text-[15px] font-bold text-rose-600 tabular-nums" title={`발주 ${fmtWon(totalOrderAmount)} vs 매입 ${fmtWon(totalPurchaseAmount)}`}>
              {amountDiffLabel}
            </span>
          )}
        </div>
        <div className="hidden lg:flex self-center justify-center items-center min-w-0 overflow-hidden">
          <StatusPill tone={PO_STATUS_TONE[poStatus]} size="xs" dot>{PO_STATUS_LABEL[poStatus]}</StatusPill>
        </div>
      </div>

      {/* 모바일 요약 */}
      <div className="lg:hidden px-3 pb-2 text-[14px] text-zinc-500 tabular-nums flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span>{purchaseRangeLabel}</span>
        <span>{matchedProducts > 0 ? `${matchedProducts}종 · ${totalPurchaseQty.toLocaleString()}개` : "매입 없음"}</span>
        {hasQtyDiff && (<span className={`font-bold ${diffTone}`}>({diffLabel})</span>)}
        <span className="font-bold text-sky-700">{purchaseGroup.totalPurchaseAmount > 0 ? fmtWon(purchaseGroup.totalPurchaseAmount) : "—"}</span>
        <StatusPill tone={PO_STATUS_TONE[poStatus]} size="xs" dot>{PO_STATUS_LABEL[poStatus]}</StatusPill>
      </div>

      {/* 상세 · 매칭 라인 */}
      {isOpen && (
        <div className="px-3 pb-3">
          <div className="border-l-2 pl-2 border-zinc-200">
            <div className="py-1.5 flex items-baseline gap-2 flex-wrap">
              <span className="text-[14px] font-bold text-zinc-700 tracking-tight">매칭 상세</span>
              <span className="text-[13px] text-zinc-400">·</span>
              <span className="text-[14px] font-medium text-zinc-500 tabular-nums">{matchedProducts}종 · {totalPurchaseQty.toLocaleString()}개</span>
              {hasQtyDiff && (
                <>
                  <span className="text-[13px] text-zinc-400">·</span>
                  <span className={`text-[14px] font-bold tabular-nums ${diffTone}`} title={`발주 ${totalOrderQty.toLocaleString()}개 vs 매입 ${totalPurchaseQty.toLocaleString()}개`}>
                    차이 {diffLabel}개
                  </span>
                </>
              )}
            </div>
            {purchaseGroup.lines.length === 0 ? (
              <div className="py-6 text-center text-[14px] text-zinc-400">매입 없음</div>
            ) : (
              <table className="w-full text-[15px] tabular-nums table-fixed">
                <colgroup>
                  <col className="w-9" /><col className="min-w-[160px]" /><col className="w-16" /><col className="w-20" /><col className="w-24" /><col className="w-16" />
                </colgroup>
                <thead>
                  <tr className="text-[13px] font-semibold text-zinc-500 border-b border-zinc-200">
                    <th className="text-center px-2 py-1.5">No</th>
                    <th className="text-left px-2 py-1.5">상품</th>
                    <th className="text-right px-2 py-1.5">매입수량</th>
                    <th className="text-right px-2 py-1.5">단가</th>
                    <th className="text-right px-2 py-1.5">금액</th>
                    <th className="text-center px-2 py-1.5">Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {purchaseGroup.lines.map((l, i) => {
                    const matchedOrderRow = order.rows.find(r => r.product_code === l.productCode) ?? null;
                    const excType = matchedOrderRow ? (matchedOrderRow.exception_type ?? matchedOrderRow.auto_exception_type ?? null) : null;
                    const isResolved = matchedOrderRow?.resolution_status === "resolved";
                    const excLabel = excType === "qty_short" ? "수량 부족"
                      : excType === "qty_over" ? "수량 초과"
                      : excType === "price_diff" ? "단가 상이"
                      : excType === "no_purchase" ? "매입 없음"
                      : null;
                    return (
                      <React.Fragment key={`p-${purchaseGroup.orderKey}-${i}`}>
                        <tr>
                          <td className="text-center px-2 py-1.5 text-zinc-400 text-[14px]">{String(i + 1).padStart(2, "0")}</td>
                          <td className="text-left px-2 py-1.5">
                            <div className="flex flex-col leading-tight">
                              <span className="font-semibold text-ink text-[15px]">{l.productName && String(l.productName).trim() !== "" ? l.productName : "-"}</span>
                              <span className="text-[13px] text-zinc-400 font-medium">{l.productCode}</span>
                            </div>
                          </td>
                          <td className="text-right px-2 py-1.5">
                            {l.match ? <span className="font-bold text-sky-700">{Number(l.match.quantity).toLocaleString()}</span> : <span className="text-zinc-300">—</span>}
                          </td>
                          <td className="text-right px-2 py-1.5 text-zinc-500">{l.match ? fmtWon(l.match.unit_price) : "—"}</td>
                          <td className="text-right px-2 py-1.5">{l.match ? <span className="font-bold text-emerald-700">{fmtWon(l.match.amount)}</span> : <span className="text-zinc-300">—</span>}</td>
                          <td className="text-center px-2 py-1.5">
                            <div className="flex flex-col items-center gap-0.5">
                              {l.match
                                ? renderDiff(l.orderQty, l.orderUnitPrice, Number(l.match.quantity), Number(l.match.unit_price))
                                : <StatusPill tone="zinc" size="xs">매입 없음</StatusPill>
                              }
                              {excLabel && isResolved && (
                                <StatusPill tone="indigo" size="xs" dot>{excLabel} · 처리완료</StatusPill>
                              )}
                              {excLabel && !isResolved && !l.match && (
                                null  /* 매입 없음 pill 이 이미 노출 */
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* 처리완료된 라인 · 처리내용 + 처리자/일시 서브 행 */}
                        {isResolved && matchedOrderRow && (matchedOrderRow.resolution_note || matchedOrderRow.resolved_at) && (
                          <tr className="bg-indigo-50/40">
                            <td className="px-2 py-1.5" />
                            <td colSpan={5} className="px-2 py-1.5 text-[13px] text-zinc-600">
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                {matchedOrderRow.resolution_note && (
                                  <span><span className="text-zinc-400 font-semibold">처리내용</span> {matchedOrderRow.resolution_note}</span>
                                )}
                                {matchedOrderRow.resolved_at && (
                                  <span className="text-zinc-400 tabular-nums">· {shortDate(matchedOrderRow.resolved_at)}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
            {/* 액션 · 하단 bar · 2026-10-06 · 처리완료 workflow */}
            <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-zinc-200">
              {order.unresolvedAbnormalCount > 0 ? (
                <>
                  <Button
                    variant="primary" size="sm"
                    icon={<CheckCircle2 size={13} strokeWidth={2.4} />}
                    onClick={() => onConfirm(order.rows)}
                    disabled={busy}
                    className="!bg-emerald-600 hover:!bg-emerald-700 !border-emerald-600"
                  >매입확인</Button>
                  <Button
                    variant="primary" size="sm"
                    icon={<AlertTriangle size={13} strokeWidth={2.4} />}
                    onClick={() => onException(order.rows[0] ?? null)}
                    disabled={busy}
                    className="!bg-amber-500 hover:!bg-amber-600 !border-amber-500"
                  >매입이상</Button>
                  <Button
                    variant="primary" size="sm"
                    icon={<CheckCircle2 size={13} strokeWidth={2.4} />}
                    onClick={() => onResolve(order.rows)}
                    disabled={busy}
                    className="!bg-indigo-600 hover:!bg-indigo-700 !border-indigo-600"
                    title="이상/미매입 라인 전부 업무 처리완료 마킹 (match_status 는 유지)"
                  >처리완료</Button>
                </>
              ) : (
                <>
                  <StatusPill tone={PO_STATUS_TONE[poStatus]} size="xs" dot>
                    {PO_STATUS_LABEL[poStatus]}{order.hasUserDecision && " · 사용자 판정"}
                  </StatusPill>
                  {order.resolvedCount > 0 && (
                    <Button
                      variant="secondary" size="sm"
                      icon={<RotateCcw size={12} strokeWidth={2.2} />}
                      onClick={() => onUnresolve(order.rows)}
                      disabled={busy}
                      title="처리완료 취소 · resolution_status NULL 복원"
                    >처리완료 취소</Button>
                  )}
                  {decidedCount > 0 && order.resolvedCount === 0 && (
                    <Button
                      variant="secondary" size="sm"
                      icon={<RotateCcw size={12} strokeWidth={2.2} />}
                      onClick={() => onUndo(order.rows)}
                      disabled={busy}
                    >Undo</Button>
                  )}
                </>
              )}
              {busy && <Spinner size={12} tone="zinc" />}
            </div>
          </div>
        </div>
      )}

      {/* UNMATCHED · 접힌 상태 · 매입 없음 안내 */}
      {!isOpen && purchaseGroup.lines.every(l => l.match === null) && (
        <div className="lg:hidden px-3 pb-2">
          <span className="text-[13px] text-zinc-400">매입 없음</span>
        </div>
      )}
    </>
  );
};

export default OrderPurchaseMatchTab;
