// 2026-09-25 · #1 · 발주매입 대조 · 이상목록 탭 (사용자 지시)
//   · exception_type 별 그룹핑 (qty_short · qty_over · price_diff · no_purchase)
//   · 각 이상 · 원인 · 발주 · 매입 요약 · 처리 이력 · 담당자 · 메모
//   · 액션 · [매입완료로 변경] (undo → matched)
//
//   대원칙:
//     · 프레임워크 재사용 (Card · StatusPill · Spinner · EmptyState · useToast · useConfirm)
//     · Linear/Vercel/Notion 2026 톤 · 이모지·파스텔 X
//     · 반응형 · md 이하 · 카드 stack
//     · 폰트 +2 default · 말줄임표 X · KO_INPUT_PROPS 불필요 (search 없음)
//     · 캐시 X · apiClient 통합 no-store

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "../common/Card";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { PeriodSelector } from "../common/PeriodSelector";
import { InlineLabel } from "../common/InlineLabel";
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

const fmtWon = (n: number | null | undefined): string =>
  n == null ? "—" : `${Math.round(Number(n)).toLocaleString()}원`;
const fmtQty = (n: number | null | undefined): string =>
  n == null ? "—" : `${Number(n).toLocaleString()}`;

const EXCEPTION_LABEL: Record<string, string> = {
  qty_short: "수량 부족",
  qty_over: "수량 초과",
  price_diff: "단가 상이",
  no_purchase: "매입 없음",
};

const EXCEPTION_HINT: Record<string, string> = {
  qty_short: "발주 수량보다 적게 입고됨 · 매칭 기간 초과",
  qty_over: "발주 수량보다 많이 입고됨",
  price_diff: "매입 단가가 발주 단가 대비 ±1% 초과",
  no_purchase: "매입 이력이 없음 · 매칭 기간 초과",
};

const EXCEPTION_ORDER = ["qty_short", "qty_over", "price_diff", "no_purchase"] as const;

function effectiveExceptionType(r: OrderMatchRow): string | null {
  return r.exception_type ?? r.auto_exception_type ?? null;
}

function isException(r: OrderMatchRow): boolean {
  if (r.match_status === "matched") return false;
  if (r.match_status === "exception") return true;
  if (r.match_status === "unmatched") return false;
  return r.auto_status === "exception";
}

export const OrderPurchaseExceptionTab: React.FC = () => {
  const { toast, showError, showSuccess } = useToast();
  const confirm = useConfirm();

  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<OrderPurchaseMatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await getOrderPurchaseMatchList(days);
      setData(r);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : getErrorMessage(e, "이상목록 조회 실패");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  // 이상 라인만 필터링 · exception_type 별 그룹핑
  const grouped = useMemo(() => {
    if (!data) return new Map<string, OrderMatchRow[]>();
    const rows = [...data.exceptions, ...data.matched, ...data.unmatched].filter(isException);
    const map = new Map<string, OrderMatchRow[]>();
    for (const r of rows) {
      const t = effectiveExceptionType(r) ?? "unknown";
      const arr = map.get(t) ?? [];
      arr.push(r);
      map.set(t, arr);
    }
    return map;
  }, [data]);

  const totalCount = useMemo(
    () => Array.from(grouped.values()).reduce((s, arr) => s + arr.length, 0),
    [grouped],
  );

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);

  const changeToMatched = useCallback(
    async (row: OrderMatchRow) => {
      const ok = await confirm({
        title: "매입완료로 변경",
        message: `${row.product_name ?? row.product_code}\n공급사 ${displayVendorName(row.supplier ?? "") || "—"}\n\n이상표시를 해제하고 매입완료 처리할까요?`,
        confirmLabel: "매입완료로 변경",
      });
      if (!ok) return;
      setBusyId(row.id);
      try {
        await confirmOrderPurchaseMatch(row.id, {
          action: "matched",
          exception_type: null,
          note: null,
        });
        showSuccess("매입완료로 변경 완료");
        await load();
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : getErrorMessage(e, "처리 실패");
        showError(msg);
      } finally {
        setBusyId(null);
      }
    },
    [confirm, load, showError, showSuccess],
  );

  const orderedGroups = useMemo(() => {
    const keys = Array.from(grouped.keys());
    const preferred = EXCEPTION_ORDER.filter((k) => keys.includes(k));
    const rest = keys.filter((k) => !EXCEPTION_ORDER.includes(k as any));
    return [...preferred, ...rest];
  }, [grouped]);

  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}

      <div className="flex flex-col gap-3 min-h-0 flex-1">
        {/* 상단 · 기간 + KPI */}
        <Card className="p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600" strokeWidth={2.2} />
            <span className="text-[16px] font-semibold text-ink tracking-tight">이상 목록</span>
            <StatusPill tone="amber" dot>{totalCount}건</StatusPill>
          </div>
          <div className="flex items-center gap-2">
            <InlineLabel size="sm">매칭 기간</InlineLabel>
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
              ariaLabel="이상 목록 매칭 기간"
            />
          </div>
        </Card>

        {error && (
          <Card className="p-3 border-rose-200 bg-rose-50 text-rose-700 text-[14px]">
            {error}
          </Card>
        )}

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Spinner size={16} tone="zinc" label="불러오는 중..." labelSize={13} />
          </div>
        )}

        {!loading && totalCount === 0 && !error && (
          <Card className="p-8">
            <EmptyState
              icon={CheckCircle2}
              title="이상 항목이 없습니다"
              hint="발주-매입 매칭이 모두 정상입니다"
            />
          </Card>
        )}

        {/* 그룹별 리스트 */}
        {!loading && totalCount > 0 && (
          <div className="flex flex-col gap-3">
            {orderedGroups.map((key) => {
              const rows = grouped.get(key) ?? [];
              const isCollapsed = collapsedGroups.has(key);
              return (
                <Card key={key} className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleGroup(key)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      <AlertTriangle size={16} className="text-amber-600" strokeWidth={2.2} />
                      <span className="text-[15px] font-semibold text-ink">
                        {EXCEPTION_LABEL[key] ?? key}
                      </span>
                      <StatusPill tone="amber" size="xs">
                        {rows.length}건
                      </StatusPill>
                    </div>
                    <span className="text-[13px] text-ink-soft whitespace-normal break-keep">
                      {EXCEPTION_HINT[key] ?? ""}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="border-t border-line flex flex-col divide-y divide-line">
                      {rows.map((r) => (
                        <ExceptionRow
                          key={String(r.id)}
                          row={r}
                          busy={busyId === r.id}
                          onChangeToMatched={changeToMatched}
                        />
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

// ═════════════════════════════════════════════════════════════════
// 이상 라인 카드
// ═════════════════════════════════════════════════════════════════
interface ExceptionRowProps {
  row: OrderMatchRow;
  busy: boolean;
  onChangeToMatched: (row: OrderMatchRow) => void | Promise<void>;
}

const ExceptionRow: React.FC<ExceptionRowProps> = ({ row, busy, onChangeToMatched }) => {
  const orderAmount = Number(row.order_qty ?? 0) * Number(row.unit_price ?? 0);
  const purchaseAmount = row.purchase_matches.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const qtyDiff = Number(row.purchase_total_qty ?? 0) - Number(row.order_qty ?? 0);

  return (
    <div className="px-3 py-3 flex flex-col md:flex-row md:items-center gap-3">
      {/* 상품 · 공급사 */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          {row.order_number && (
            <span className="text-[12px] text-ink-soft tabular-nums font-mono">#{row.order_number}</span>
          )}
          {row.match_status === "exception" && (
            <StatusPill tone="indigo" size="xs">사용자 판정</StatusPill>
          )}
          <span className="text-[12px] text-ink-mute tabular-nums">
            발주 {shortDate(row.sent_at ?? row.order_date) || "—"}
          </span>
        </div>
        <div className="text-[15px] font-semibold text-ink whitespace-normal break-keep">
          {row.product_name ?? row.product_code}
        </div>
        <div className="text-[13px] text-ink-soft whitespace-normal break-keep">
          <span className="font-mono">{row.product_code}</span>
          <span className="mx-1.5 text-line">|</span>
          {displayVendorName(row.supplier ?? "") || "공급사 미지정"}
        </div>
      </div>

      {/* 발주 vs 매입 요약 */}
      <div className="flex-shrink-0 grid grid-cols-2 gap-3 text-[13px] tabular-nums">
        <div className="rounded-lg border border-line bg-white px-3 py-2 min-w-[140px]">
          <div className="text-ink-soft text-[12px]">발주</div>
          <div className="text-ink font-semibold">
            {fmtQty(row.order_qty)} × {fmtWon(row.unit_price)}
          </div>
          <div className="text-ink-soft text-[12px]">{fmtWon(orderAmount)}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 min-w-[140px]">
          <div className="text-ink-soft text-[12px]">매입</div>
          <div className={`font-semibold ${qtyDiff === 0 ? "text-ink" : qtyDiff < 0 ? "text-amber-700" : "text-rose-700"}`}>
            {fmtQty(row.purchase_total_qty)} × {fmtWon(row.purchase_avg_price)}
          </div>
          <div className="text-ink-soft text-[12px]">{fmtWon(purchaseAmount)}</div>
        </div>
      </div>

      {/* 처리 이력 + 액션 */}
      <div className="flex-shrink-0 flex flex-col gap-1.5 items-end">
        {row.matched_at && (
          <div className="text-[12px] text-ink-mute tabular-nums whitespace-normal">
            판정 · {shortDate(row.matched_at)}
            {row.matched_by ? ` · 담당자 #${row.matched_by}` : ""}
          </div>
        )}
        {row.exception_note && (
          <div className="text-[12px] text-ink-soft whitespace-normal break-keep max-w-[240px] text-right">
            {row.exception_note}
          </div>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => onChangeToMatched(row)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[14px] font-semibold shadow-sm disabled:opacity-50 transition-colors"
        >
          <CheckCircle2 size={15} strokeWidth={2.4} />
          매입완료로 변경
          {busy && <Spinner size={12} tone="white" />}
        </button>
      </div>
    </div>
  );
};

export default OrderPurchaseExceptionTab;
