// 2026-10-06 · 발주매입대조 v6 · 단일 7-column row · 대조결과 ↔ 처리 분리 · 액션바 제거

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, ChevronDown, ChevronRight, Search } from "lucide-react";
import { Card } from "../common/Card";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { InlineLabel } from "../common/InlineLabel";
import { PeriodSelector } from "../common/PeriodSelector";
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
  fmtWon,
  effectiveStatus, effectiveExceptionType,
  groupBySupplierAndOrder, buildPurchaseGroup,
  type OrderGroup, type FilterKey,
} from "./OrderPurchaseMatchTab.types";
import { ExceptionNoteModal } from "./ExceptionNoteModal";

// ═════════════════════════════════════════════════════════════════
// 1 · 대조결과 (자동 매칭 결과 집계 · 읽기전용)
// ═════════════════════════════════════════════════════════════════
type AutoTone = "emerald" | "amber" | "rose" | "zinc";
interface AutoResult { label: string; tone: AutoTone; }

function deriveAutoResult(order: OrderGroup): AutoResult {
  const rows = order.rows;
  if (rows.length === 0) return { label: "—", tone: "zinc" };
  if (rows.every(r => r.auto_status === "matched")) return { label: "정상", tone: "emerald" };
  const types: Record<string, number> = { qty_short: 0, qty_over: 0, price_diff: 0, no_purchase: 0 };
  let abnormal = 0;
  for (const r of rows) {
    if (r.auto_status === "matched") continue;
    abnormal++;
    const t = r.auto_exception_type;
    if (t && t in types) types[t]++;
  }
  const nonZero = Object.entries(types).filter(([, v]) => v > 0);
  if (nonZero.length === 1) {
    const [type] = nonZero[0];
    if (type === "qty_short" || type === "qty_over") {
      let diffMag = 0;
      for (const r of rows) {
        if (r.auto_exception_type !== type) continue;
        const purch = (r.purchase_matches ?? []).reduce((a, m) => a + Number(m.quantity ?? 0), 0);
        diffMag += Math.abs(purch - Number(r.order_qty ?? 0));
      }
      return {
        label: type === "qty_short" ? `수량부족 ${diffMag}` : `수량초과 ${diffMag}`,
        tone: type === "qty_short" ? "rose" : "amber",
      };
    }
    if (type === "price_diff") return { label: "단가차이", tone: "amber" };
    if (type === "no_purchase") return { label: "미매입", tone: "zinc" };
  }
  return { label: `이상 ${abnormal}건`, tone: "amber" };
}

// ═════════════════════════════════════════════════════════════════
// 2 · 처리 상태 (수동 workflow · 사용자 결정)
// ═════════════════════════════════════════════════════════════════
type ProcessingStatus = "pending" | "matched" | "exception" | "resolved";

const PROC_LABEL: Record<ProcessingStatus, string> = {
  pending: "미판정",
  matched: "정상확인",
  exception: "이상",
  resolved: "처리완료",
};
const PROC_DOT: Record<ProcessingStatus, string> = {
  pending: "bg-zinc-300",
  matched: "bg-emerald-500",
  exception: "bg-amber-500",
  resolved: "bg-indigo-500",
};
const PROC_TEXT: Record<ProcessingStatus, string> = {
  pending: "text-zinc-600",
  matched: "text-emerald-700",
  exception: "text-amber-700",
  resolved: "text-indigo-700",
};

function deriveProcessingStatus(order: OrderGroup): ProcessingStatus {
  const rows = order.rows;
  if (rows.length === 0) return "pending";
  const anyResolved = rows.some(r => r.resolution_status === "resolved");
  const anyUnresolvedAbnormal = rows.some(r =>
    r.resolution_status !== "resolved" &&
    (r.match_status === "exception" || r.match_status === "unmatched"
      || (!r.match_status && r.auto_status !== "matched"))
  );
  if (anyUnresolvedAbnormal) {
    const hasExceptionDecision = rows.some(r => r.match_status === "exception" && r.resolution_status !== "resolved");
    return hasExceptionDecision ? "exception" : "pending";
  }
  if (anyResolved) return "resolved";
  if (rows.every(r => r.match_status === "matched" || r.auto_status === "matched")) {
    const allUserConfirmed = rows.every(r => r.match_status === "matched");
    const allAutoMatched = rows.every(r => r.auto_status === "matched" && !r.match_status);
    if (allUserConfirmed) return "matched";
    if (allAutoMatched) return "pending";
    return "matched";
  }
  return "pending";
}

// ═════════════════════════════════════════════════════════════════
// 3 · 처리 Selector · compact select
// ═════════════════════════════════════════════════════════════════
interface ProcessingSelectorProps {
  current: ProcessingStatus;
  onChange: (next: ProcessingStatus) => void;
  disabled?: boolean;
}

const ProcessingSelector: React.FC<ProcessingSelectorProps> = ({ current, onChange, disabled }) => {
  return (
    <div
      className="relative inline-flex items-center"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <span className={`absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${PROC_DOT[current]} pointer-events-none`} />
      <select
        value={current}
        onChange={(e) => onChange(e.target.value as ProcessingStatus)}
        disabled={disabled}
        aria-label="처리 상태"
        className={`appearance-none text-[14px] font-semibold pl-5 pr-6 py-1 border border-zinc-200 rounded-md bg-white hover:bg-zinc-50 cursor-pointer focus:outline-none focus:border-brand-deep disabled:opacity-50 disabled:cursor-not-allowed ${PROC_TEXT[current]}`}
      >
        <option value="pending">{PROC_LABEL.pending}</option>
        <option value="matched">{PROC_LABEL.matched}</option>
        <option value="exception">{PROC_LABEL.exception}</option>
        <option value="resolved">{PROC_LABEL.resolved}</option>
      </select>
      <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════
// 4 · 메인 컴포넌트
// ═════════════════════════════════════════════════════════════════
export const OrderPurchaseMatchTab: React.FC = () => {
  const { toast, showError, showSuccess } = useToast();
  const confirm = useConfirm();

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
        if (statusFilter === "exception" && og.unresolvedAbnormalCount === 0) continue;
        if (statusFilter === "resolved" && og.resolvedCount === 0) continue;
        if (supQ) {
          const hit = sg.supplierDisplay.toLowerCase().includes(supQ) || (og.supplierRaw ?? "").toLowerCase().includes(supQ);
          if (!hit) continue;
        }
        if (prodQ) {
          const hit = og.rows.some(r => (r.product_name ?? "").toLowerCase().includes(prodQ) || r.product_code.toLowerCase().includes(prodQ));
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
    setBusy(true);
    try {
      for (const r of rows) await confirmOrderPurchaseMatch(r.id, { action: "matched", exception_type: null, note: null });
      showSuccess("정상확인 처리"); await loadMatch();
    } catch (e) { showError(e instanceof ApiError ? e.message : getErrorMessage(e, "처리 실패")); }
    finally { setBusy(false); }
  }, [loadMatch, showError, showSuccess]);

  const runUndo = useCallback(async (rows: OrderMatchRow[]) => {
    const decided = rows.filter(r => r.match_status === "matched" || r.match_status === "exception");
    const resolved = rows.filter(r => r.resolution_status === "resolved");
    if (decided.length === 0 && resolved.length === 0) return;
    setBusy(true);
    try {
      for (const r of resolved) await confirmOrderPurchaseMatch(r.id, { action: "unresolve", exception_type: null, note: null });
      for (const r of decided) await confirmOrderPurchaseMatch(r.id, { action: "undo", exception_type: null, note: null });
      showSuccess("미판정 처리"); await loadMatch();
    } catch (e) { showError(e instanceof ApiError ? e.message : getErrorMessage(e, "처리 실패")); }
    finally { setBusy(false); }
  }, [loadMatch, showError, showSuccess]);

  const runResolve = useCallback(async (rows: OrderMatchRow[]) => {
    const targets = rows.filter(r => effectiveStatus(r) !== "matched" && r.resolution_status !== "resolved");
    if (targets.length === 0) return;
    const note = window.prompt(`${targets.length}개 라인 처리완료 · 처리 내용 (예: "거래처 품절")`, "");
    if (note === null) return;
    setBusy(true);
    try {
      for (const r of targets) await confirmOrderPurchaseMatch(r.id, { action: "resolve", exception_type: null, note: note || null });
      showSuccess("처리완료"); await loadMatch();
    } catch (e) { showError(e instanceof ApiError ? e.message : getErrorMessage(e, "처리 실패")); }
    finally { setBusy(false); }
  }, [loadMatch, showError, showSuccess]);

  const openException = useCallback((row: OrderMatchRow | null) => {
    setExTargetRow(row); setExOpen(true);
  }, []);

  const handleProcessingChange = useCallback(async (order: OrderGroup, next: ProcessingStatus) => {
    const current = deriveProcessingStatus(order);
    if (current === next) return;
    // resolved → matched/exception · resolution_* 선행 clear (혼재 상태 방지)
    //   · auto_status / auto_exception_type 은 서버 런타임 계산 · 보존 보장
    if (current === "resolved" && (next === "matched" || next === "exception")) {
      setBusy(true);
      try {
        for (const r of order.rows) {
          if (r.resolution_status === "resolved") {
            await confirmOrderPurchaseMatch(r.id, { action: "unresolve", exception_type: null, note: null });
          }
        }
      } catch (e) {
        showError(e instanceof ApiError ? e.message : getErrorMessage(e, "처리 실패"));
        setBusy(false);
        return;
      } finally { setBusy(false); }
    }
    if (next === "pending") {
      const ok = await confirm({ title: "미판정으로 되돌리기", message: "이 발주의 모든 판정·처리완료를 취소합니다.", confirmLabel: "되돌리기", danger: true });
      if (ok) await runUndo(order.rows);
    } else if (next === "matched") {
      await runConfirm(order.rows);
    } else if (next === "exception") {
      openException(order.rows[0] ?? null);
    } else if (next === "resolved") {
      await runResolve(order.rows);
    }
  }, [confirm, runUndo, runConfirm, runResolve, openException, showError]);

  const toggleOpen = useCallback((key: string) => {
    setOpenKey(prev => prev === key ? null : key);
  }, []);

  const totalMatched = matchData?.counts.matched ?? 0;
  const totalExceptions = matchData?.counts.exceptions ?? 0;
  const totalUnmatched = matchData?.counts.unmatched ?? 0;

  return (
    <>
      {toast && (<div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>)}

      <div className="flex flex-col gap-3">
        <Card className="p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} className="text-brand-deep" strokeWidth={2.2} />
            <span className="text-[18px] font-semibold text-ink tracking-tight">발주매입 대조</span>
          </div>
          <div className="flex items-center gap-2">
            <InlineLabel size="sm">기간</InlineLabel>
            <PeriodSelector<number>
              options={[{ value: 3, label: "3일" }, { value: 7, label: "7일" }, { value: 14, label: "14일" }, { value: 30, label: "30일" }]}
              value={days} onChange={setDays} size="sm" ariaLabel="발주-매입 매칭 기간"
            />
          </div>
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
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input type="text" value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)}
              placeholder="공급사"
              className="h-7 pl-7 pr-2 text-[15px] rounded-md border border-line bg-white focus:border-brand-deep focus:outline-none w-32" />
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
              placeholder="상품/코드"
              className="h-7 pl-7 pr-2 text-[15px] rounded-md border border-line bg-white focus:border-brand-deep focus:outline-none w-32" />
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

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size={16} tone="zinc" label="자동 매칭 조회 중..." labelSize={14} />
          </div>
        ) : error ? (
          <Card className="p-6 border-rose-200 bg-rose-50 text-rose-700 text-[16px]">{error}</Card>
        ) : filteredOrders.length === 0 ? (
          <Card className="p-12">
            <EmptyState icon={ClipboardCheck} title="조건에 맞는 발주 없음"
              hint={allRows.length === 0 ? "기간 내 발주가 없거나 매칭 결과가 비어 있습니다" : "필터를 조정해 보세요"} />
          </Card>
        ) : (
          <Card clip padding="none" className="overflow-hidden">
            {/* sticky COLUMN HEADER · lg+ 단일 7-column */}
            <div className="hidden lg:grid sticky top-0 z-20 bg-white border-b border-zinc-200/80 shadow-[0_1px_0_rgba(0,0,0,0.03)] text-[13px] font-semibold text-zinc-500 uppercase tracking-wide
              grid-cols-[28px_minmax(0,1.4fr)_72px_minmax(0,1fr)_72px_minmax(0,1fr)_120px_140px] gap-x-2 px-3 py-2.5">
              <span />
              <span>발주번호 · 공급사</span>
              <span>발주일</span>
              <span className="text-right">발주 (수량·금액)</span>
              <span>매입일</span>
              <span className="text-right">매입 (수량·금액)</span>
              <span className="text-center">대조결과</span>
              <span className="text-center">처리</span>
            </div>
            {/* 모바일 */}
            <div className="lg:hidden px-3 py-2 bg-zinc-50 border-b border-zinc-200/80 text-[14px] text-zinc-500">
              발주 ↔ 매입 매칭 (좁은 화면: 카드)
            </div>

            <div className="divide-y divide-zinc-100">
              {filteredOrders.map((og) => (
                <PairedRow key={og.orderKey} order={og}
                  isOpen={openKey === og.orderKey}
                  onToggle={() => toggleOpen(og.orderKey)}
                  busy={busy}
                  onProcessingChange={handleProcessingChange}
                />
              ))}
            </div>
          </Card>
        )}
      </div>

      {exOpen && (
        <ExceptionNoteModal
          open={exOpen}
          onClose={() => { setExOpen(false); setExTargetRow(null); }}
          orderId={exTargetRow?.id ?? null}
          orderNumber={exTargetRow?.order_number ?? null}
          defaultExceptionType={exTargetRow ? effectiveExceptionType(exTargetRow) : null}
          defaultNote={exTargetRow?.exception_note ?? null}
          onSaved={async () => { setExTargetRow(null); await loadMatch(); }}
        />
      )}
    </>
  );
};

// ═════════════════════════════════════════════════════════════════
// 5 · PairedRow · 단일 wide row + expanded 상세표
// ═════════════════════════════════════════════════════════════════
interface PairedRowProps {
  order: OrderGroup;
  isOpen: boolean;
  onToggle: () => void;
  busy: boolean;
  onProcessingChange: (order: OrderGroup, next: ProcessingStatus) => void | Promise<void>;
}

const PairedRow: React.FC<PairedRowProps> = ({ order, isOpen, onToggle, busy, onProcessingChange }) => {
  const purchaseGroup = useMemo(() => buildPurchaseGroup(order), [order]);
  const supplierDisplay = displayVendorName(order.supplierRaw ?? "") || order.supplier;
  const autoResult = useMemo(() => deriveAutoResult(order), [order]);
  const procStatus = useMemo(() => deriveProcessingStatus(order), [order]);

  const accentColor = procStatus === "resolved" ? "bg-indigo-400"
    : procStatus === "matched" ? "bg-emerald-400"
    : procStatus === "exception" ? "bg-amber-400"
    : "bg-zinc-300";

  const totalOrderQty = order.rows.reduce((s, r) => s + Number(r.order_qty ?? 0), 0);
  const totalPurchaseQty = purchaseGroup.totalPurchaseQty;
  const totalPurchaseAmount = purchaseGroup.totalPurchaseAmount;
  const matchedProducts = purchaseGroup.lines.filter(l => l.match !== null).length;

  const purchaseDates = purchaseGroup.lines.map(l => l.match?.purchase_date).filter((d): d is string => !!d).sort();
  const purchaseFirst = purchaseDates[0] ?? null;
  const purchaseLast = purchaseDates[purchaseDates.length - 1] ?? null;
  const purchaseDateLabel = purchaseFirst
    ? (purchaseFirst === purchaseLast ? shortDate(purchaseFirst) : `${shortDate(purchaseFirst)}~${shortDate(purchaseLast)}`)
    : "—";

  const hasQtyDiff = matchedProducts > 0 && totalPurchaseQty !== totalOrderQty;
  const hasAmountDiff = matchedProducts > 0 && totalPurchaseAmount !== order.totalOrderAmount;

  return (
    <div className="hover:bg-zinc-50/40 transition-colors">
      {/* lg+ : 단일 wide row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left hidden lg:grid items-center cursor-pointer
          grid-cols-[28px_minmax(0,1.4fr)_72px_minmax(0,1fr)_72px_minmax(0,1fr)_120px_140px] gap-x-2 px-3 py-3 hover:bg-zinc-50/60 transition-colors"
      >
        {/* accent + chevron */}
        <div className="flex items-stretch">
          <div className={`w-1 self-stretch ${accentColor}`} />
          <span className="flex items-center justify-center w-7 shrink-0">
            {isOpen
              ? <ChevronDown size={14} className="text-zinc-400" strokeWidth={2.4} />
              : <ChevronRight size={14} className="text-zinc-300" strokeWidth={2.4} />}
          </span>
        </div>
        {/* 발주번호·공급사 */}
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-[13px] text-zinc-400 tabular-nums font-medium truncate">#{order.orderNumber ?? "—"}</span>
          <span className="text-[16px] font-bold text-ink truncate">{supplierDisplay || "공급사 미지정"}</span>
        </div>
        {/* 발주일 */}
        <div className="text-[14px] text-zinc-500 tabular-nums">{shortDate(order.sentAt ?? order.orderDate) || "—"}</div>
        {/* 발주 (수량·금액) */}
        <div className="flex flex-col items-end leading-tight tabular-nums">
          <span className="text-[14px] text-zinc-600">{order.distinctProducts}종 · {totalOrderQty.toLocaleString()}개</span>
          <span className="text-[15px] font-bold text-emerald-700">{fmtWon(order.totalOrderAmount)}</span>
        </div>
        {/* 매입일 */}
        <div className="text-[14px] text-zinc-500 tabular-nums truncate">{purchaseDateLabel}</div>
        {/* 매입 (수량·금액) · diff 중복 제거 */}
        <div className="flex flex-col items-end leading-tight tabular-nums">
          <span className={`text-[14px] ${hasQtyDiff ? "text-rose-600 font-semibold" : "text-zinc-600"}`}>
            {matchedProducts > 0 ? `${matchedProducts}종 · ${totalPurchaseQty.toLocaleString()}개` : "—"}
          </span>
          <span className={`text-[15px] font-bold ${hasAmountDiff ? "text-rose-600" : "text-sky-700"}`}>
            {totalPurchaseAmount > 0 ? fmtWon(totalPurchaseAmount) : "—"}
          </span>
        </div>
        {/* 대조결과 · 자동 · 읽기전용 */}
        <div className="flex justify-center">
          <StatusPill tone={autoResult.tone} size="xs" dot>{autoResult.label}</StatusPill>
        </div>
        {/* 처리 · 수동 selector */}
        <div className="flex justify-center">
          <ProcessingSelector current={procStatus} onChange={(next) => onProcessingChange(order, next)} disabled={busy} />
        </div>
      </button>

      {/* 모바일 카드 */}
      <div className="lg:hidden">
        <button type="button" onClick={onToggle}
          className="w-full text-left flex items-stretch px-3 py-3 gap-2 hover:bg-zinc-50/60 cursor-pointer">
          <div className={`w-1 self-stretch rounded ${accentColor}`} />
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col leading-tight min-w-0">
                <span className="text-[13px] text-zinc-400 tabular-nums font-medium">#{order.orderNumber ?? "—"}</span>
                <span className="text-[16px] font-bold text-ink truncate">{supplierDisplay || "공급사 미지정"}</span>
              </div>
              {isOpen
                ? <ChevronDown size={14} className="text-zinc-400 shrink-0 mt-1" />
                : <ChevronRight size={14} className="text-zinc-300 shrink-0 mt-1" />}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[13px] tabular-nums">
              <div className="flex flex-col">
                <span className="text-zinc-400 text-[12px]">발주 · {shortDate(order.sentAt ?? order.orderDate) || "—"}</span>
                <span className="text-zinc-600">{order.distinctProducts}종 · {totalOrderQty.toLocaleString()}개</span>
                <span className="font-bold text-emerald-700">{fmtWon(order.totalOrderAmount)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-zinc-400 text-[12px]">매입 · {purchaseDateLabel}</span>
                <span className={hasQtyDiff ? "text-rose-600 font-semibold" : "text-zinc-600"}>
                  {matchedProducts > 0 ? `${matchedProducts}종 · ${totalPurchaseQty.toLocaleString()}개` : "매입 없음"}
                </span>
                <span className={`font-bold ${hasAmountDiff ? "text-rose-600" : "text-sky-700"}`}>
                  {totalPurchaseAmount > 0 ? fmtWon(totalPurchaseAmount) : "—"}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <StatusPill tone={autoResult.tone} size="xs" dot>{autoResult.label}</StatusPill>
              <ProcessingSelector current={procStatus} onChange={(next) => onProcessingChange(order, next)} disabled={busy} />
            </div>
          </div>
        </button>
      </div>

      {/* 상세 · 펼침 */}
      {isOpen && <UnifiedDetail order={order} />}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════
// 6 · UnifiedDetail · 상품별 비교표 (액션바 없음)
// ═════════════════════════════════════════════════════════════════
interface UnifiedDetailProps { order: OrderGroup; }

const UnifiedDetail: React.FC<UnifiedDetailProps> = ({ order }) => {
  const lines = useMemo(() => order.rows.map(r => {
    const matches = r.purchase_matches ?? [];
    const purchaseQty = matches.reduce((s, m) => s + Number(m.quantity ?? 0), 0);
    const purchaseAmount = matches.reduce((s, m) => s + Number(m.amount ?? 0), 0);
    const purchaseAvgPrice = purchaseQty > 0 ? purchaseAmount / purchaseQty : null;
    const orderQty = Number(r.order_qty ?? 0);
    const orderUnitPrice = r.unit_price != null ? Number(r.unit_price) : null;
    const orderAmount = orderQty * (orderUnitPrice ?? 0);
    const qtyDiff = purchaseQty - orderQty;
    const amountDiff = purchaseAmount - orderAmount;
    const priceDiff = purchaseAvgPrice != null && orderUnitPrice != null ? purchaseAvgPrice - orderUnitPrice : null;
    const resolved = r.resolution_status === "resolved";
    const excType = r.exception_type ?? r.auto_exception_type ?? null;
    const status = effectiveStatus(r);
    let statusLabel = "일치";
    let statusTone: "emerald" | "amber" | "rose" | "zinc" | "indigo" = "emerald";
    if (status === "matched") { statusLabel = "일치"; statusTone = "emerald"; }
    else if (excType === "qty_short") { statusLabel = "수량 부족"; statusTone = "rose"; }
    else if (excType === "qty_over") { statusLabel = "수량 초과"; statusTone = "amber"; }
    else if (excType === "price_diff") { statusLabel = "단가 상이"; statusTone = "amber"; }
    else if (excType === "no_purchase" || status === "unmatched") { statusLabel = "매입 없음"; statusTone = "zinc"; }
    if (resolved) { statusLabel = `${statusLabel} · 처리완료`; statusTone = "indigo"; }
    return {
      productCode: r.product_code, productName: r.product_name,
      orderQty, orderUnitPrice, orderAmount,
      purchaseQty, purchaseAvgPrice, purchaseAmount,
      qtyDiff, priceDiff, amountDiff,
      statusLabel, statusTone,
      resolved, resolutionNote: r.resolution_note,
    };
  }), [order.rows]);

  return (
    <div className="border-t border-zinc-200 bg-zinc-50/40">
      {/* PC 테이블 */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[14px] tabular-nums">
          <thead>
            <tr className="text-[13px] font-semibold text-zinc-500 border-b border-zinc-200 uppercase tracking-wide">
              <th className="text-left px-4 py-2.5">상품</th>
              <th className="text-right px-3 py-2.5 w-[140px]">수량</th>
              <th className="text-right px-3 py-2.5 w-[150px]">단가</th>
              <th className="text-right px-3 py-2.5 w-[170px]">금액</th>
              <th className="text-center px-3 py-2.5 w-[140px]">상태</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={`u-${l.productCode}`} className="border-b border-zinc-100 align-top hover:bg-white/60 transition-colors">
                <td className="text-left px-4 py-2.5">
                  <div className="flex flex-col leading-tight">
                    <span className="text-[15px] font-semibold text-ink">{l.productName || "-"}</span>
                    <span className="text-[12px] text-zinc-400 font-medium">{l.productCode}</span>
                    {l.resolved && l.resolutionNote && (<span className="mt-1 text-[12px] text-zinc-500 italic">↳ {l.resolutionNote}</span>)}
                  </div>
                </td>
                <td className="text-right px-3 py-2.5">
                  <div className="flex flex-col leading-tight">
                    <span className="text-[12px] text-zinc-500">발주 {l.orderQty.toLocaleString()}</span>
                    <span className="text-[12px] text-zinc-500">매입 {l.purchaseQty.toLocaleString()}</span>
                    <span className={`text-[13px] font-bold ${l.qtyDiff !== 0 ? "text-rose-600" : "text-zinc-400"}`}>
                      {l.qtyDiff === 0 ? "일치" : `${l.qtyDiff > 0 ? "+" : ""}${l.qtyDiff.toLocaleString()}`}
                    </span>
                  </div>
                </td>
                <td className="text-right px-3 py-2.5">
                  <div className="flex flex-col leading-tight">
                    <span className="text-[12px] text-zinc-500">{l.orderUnitPrice != null ? fmtWon(l.orderUnitPrice) : "—"}</span>
                    <span className="text-[12px] text-zinc-500">{l.purchaseAvgPrice != null ? fmtWon(l.purchaseAvgPrice) : "—"}</span>
                    <span className={`text-[13px] font-bold ${l.priceDiff != null && Math.abs(l.priceDiff) > 0.5 ? "text-rose-600" : "text-zinc-400"}`}>
                      {l.priceDiff == null ? "—" : Math.abs(l.priceDiff) < 0.5 ? "일치" : `${l.priceDiff > 0 ? "+" : ""}${fmtWon(l.priceDiff)}`}
                    </span>
                  </div>
                </td>
                <td className="text-right px-3 py-2.5">
                  <div className="flex flex-col leading-tight">
                    <span className="text-[12px] text-zinc-500">{l.orderAmount > 0 ? fmtWon(l.orderAmount) : "—"}</span>
                    <span className="text-[12px] text-zinc-500">{l.purchaseAmount > 0 ? fmtWon(l.purchaseAmount) : "—"}</span>
                    <span className={`text-[13px] font-bold ${l.amountDiff !== 0 ? "text-rose-600" : "text-zinc-400"}`}>
                      {l.amountDiff === 0 ? "일치" : `${l.amountDiff > 0 ? "+" : ""}${fmtWon(l.amountDiff)}`}
                    </span>
                  </div>
                </td>
                <td className="text-center px-3 py-2.5">
                  <StatusPill tone={l.statusTone} size="xs" dot>{l.statusLabel}</StatusPill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일 */}
      <div className="md:hidden divide-y divide-zinc-100">
        {lines.map((l) => (
          <div key={`m-${l.productCode}`} className="p-3 flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col leading-tight min-w-0">
                <span className="text-[15px] font-semibold text-ink truncate">{l.productName || "-"}</span>
                <span className="text-[12px] text-zinc-400 font-medium">{l.productCode}</span>
              </div>
              <StatusPill tone={l.statusTone} size="xs" dot>{l.statusLabel}</StatusPill>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[13px] tabular-nums">
              <div className="flex flex-col"><span className="text-zinc-400 text-[12px]">수량</span>
                <span>발주 {l.orderQty} · 매입 {l.purchaseQty}</span>
                {l.qtyDiff !== 0 && <span className="text-rose-600 font-bold">{l.qtyDiff > 0 ? "+" : ""}{l.qtyDiff}</span>}
              </div>
              <div className="flex flex-col"><span className="text-zinc-400 text-[12px]">단가</span>
                <span>{l.orderUnitPrice != null ? fmtWon(l.orderUnitPrice) : "—"}</span>
                <span>{l.purchaseAvgPrice != null ? fmtWon(l.purchaseAvgPrice) : "—"}</span>
              </div>
              <div className="flex flex-col"><span className="text-zinc-400 text-[12px]">금액</span>
                <span>{l.orderAmount > 0 ? fmtWon(l.orderAmount) : "—"}</span>
                <span>{l.purchaseAmount > 0 ? fmtWon(l.purchaseAmount) : "—"}</span>
                {l.amountDiff !== 0 && <span className="text-rose-600 font-bold">{l.amountDiff > 0 ? "+" : ""}{fmtWon(l.amountDiff)}</span>}
              </div>
            </div>
            {l.resolved && l.resolutionNote && (<div className="text-[12px] text-zinc-500 italic">↳ {l.resolutionNote}</div>)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default OrderPurchaseMatchTab;
