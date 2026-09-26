// 2026-09-25 · #1 · 발주매입 대조 · v4 재구성 (사용자 정정)
//   · 사용자 재지시 · "발주매입대조 왼쪽에는 발주이력의 데이터가 나와야지"
//   · "발주이력화면 그대로 가져와"
//   · 즉 · OrderHistoryTab 그대로 왼쪽 · 오른쪽 · 선택 발주의 매입 매칭 상세
//
// 아키텍처:
//   · 왼쪽 · <OrderHistoryTab onSelectOrder selectedOrderNumber /> · 발주이력 컴포넌트 재사용 (Props 확장 · BC 유지)
//   · 오른쪽 · 선택 발주의 매입 매칭 · 상품 라인 · 매입 매칭 · Diff · 매입확인/이상/Undo 액션
//   · 서버 endpoint · GET /api/order-purchase-match/order/:order_number?days=N · 신규 (단일 발주 상세)
//   · Cache-Control · no-store (발주 대원칙)
//
// 대원칙:
//   · 프레임워크 · Card · StatusPill · Button · Spinner · Modal · InlineLabel · PeriodSelector · SegmentedControl
//   · ExceptionNoteModal 재사용
//   · 이모지 X · 파스텔 X · Linear/Vercel/Notion 2026 톤
//   · 반응형 · lg 미만 스택 배치 (왼쪽 위·오른쪽 아래)
//   · 첫 진입 default · selectedOrderNumber = null · 오른쪽 empty state
//   · localStorage 복원 X · 첫 발주 자동 선택 X
//   · 매입이력 페이지 (OrderHistoryTab 원 사용처) 무변경 · BC 유지

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck, Info, CheckCircle2, AlertTriangle, RotateCcw,
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
  getOrderPurchaseMatchByOrder,
  confirmOrderPurchaseMatch,
  type OrderMatchRow,
  type OrderPurchaseMatchByOrderResponse,
} from "../../lib/api/orderPurchaseMatchApi";
import {
  fmtQty, fmtWon, STATUS_LABEL,
  effectiveStatus,
  effectiveExceptionType,
} from "./OrderPurchaseMatchTab.types";
import { OrderHistoryTab } from "./OrderHistoryTab";
import { ExceptionNoteModal } from "./ExceptionNoteModal";

// ═════════════════════════════════════════════════════════════════
// Diff 표시 · 수량 우선 · 단가 차이
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
        <StatusPill tone="amber" size="xs">
          {pct > 0 ? "+" : ""}{(pct * 100).toFixed(1)}%
        </StatusPill>
      );
    }
  }
  return <StatusPill tone="emerald" size="xs" dot>일치</StatusPill>;
}

// ═════════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═════════════════════════════════════════════════════════════════
export const OrderPurchaseMatchTab: React.FC = () => {
  const { toast, showError, showSuccess } = useToast();
  const confirm = useConfirm();

  const [days, setDays] = useState<number>(7);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderPurchaseMatchByOrderResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exOpen, setExOpen] = useState(false);

  // ─── 오른쪽 · 선택 발주 매입 매칭 로드 ─────────────────────────
  const loadDetail = useCallback(async () => {
    if (!selectedOrderNumber) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await getOrderPurchaseMatchByOrder(selectedOrderNumber, days);
      setDetail(r);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : getErrorMessage(e, "매칭 조회 실패");
      setError(msg);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [selectedOrderNumber, days]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);

  // ─── 액션 · 매입확인 (rows 전체 confirm) ─────────────────────────
  const runConfirm = useCallback(
    async (rows: OrderMatchRow[]) => {
      if (rows.length === 0) return;
      const ok = await confirm({
        title: "매입 확인",
        message: `이 발주 ${rows.length}개 라인을 매입 확인 처리하시겠습니까?`,
        confirmLabel: "매입확인",
      });
      if (!ok) return;
      setBusy(true);
      try {
        for (const r of rows) {
          await confirmOrderPurchaseMatch(r.id, {
            action: "matched", exception_type: null, note: null,
          });
        }
        showSuccess("매입 확인 완료");
        await loadDetail();
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : getErrorMessage(e, "처리 실패");
        showError(msg);
      } finally { setBusy(false); }
    },
    [confirm, loadDetail, showError, showSuccess],
  );

  const runUndo = useCallback(
    async (rows: OrderMatchRow[]) => {
      const decided = rows.filter(
        (r) => r.match_status === "matched" || r.match_status === "exception",
      );
      if (decided.length === 0) return;
      const ok = await confirm({
        title: "판정 취소",
        message: `이 발주의 판정(${decided.length}건)을 취소하시겠습니까?`,
        confirmLabel: "Undo",
        danger: true,
      });
      if (!ok) return;
      setBusy(true);
      try {
        for (const r of decided) {
          await confirmOrderPurchaseMatch(r.id, {
            action: "undo", exception_type: null, note: null,
          });
        }
        showSuccess("판정 취소 완료");
        await loadDetail();
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : getErrorMessage(e, "처리 실패");
        showError(msg);
      } finally { setBusy(false); }
    },
    [confirm, loadDetail, showError, showSuccess],
  );

  // ─── 오른쪽 상태 요약 ─────────────────────────
  const rows = detail?.rows ?? [];
  const anyPending = rows.some((r) => !r.match_status && r.auto_status !== "matched");
  const decidedCount = rows.filter(
    (r) => r.match_status === "matched" || r.match_status === "exception",
  ).length;
  // 판정 통합 · 전체 라인 status 요약
  const overallStatus: "matched" | "exception" | "unmatched" = useMemo(() => {
    if (rows.length === 0) return "unmatched";
    let m = 0, ex = 0, un = 0;
    for (const r of rows) {
      const s = effectiveStatus(r);
      if (s === "matched") m++;
      else if (s === "exception") ex++;
      else un++;
    }
    if (un > 0) return "unmatched";
    if (ex > 0) return "exception";
    if (m > 0) return "matched";
    return "unmatched";
  }, [rows]);
  const overallTone = overallStatus === "matched"
    ? "emerald" : overallStatus === "exception" ? "amber" : "zinc";

  // 발주 총액
  const totalOrderAmount = useMemo(
    () => rows.reduce((s, r) => s + Number(r.order_qty ?? 0) * Number(r.unit_price ?? 0), 0),
    [rows],
  );
  const totalPurchaseAmount = useMemo(
    () => rows.reduce((s, r) => s + (r.purchase_matches ?? []).reduce((a, m) => a + Number(m.amount ?? 0), 0), 0),
    [rows],
  );

  // ─── 렌더 ───────────────────────────────────────────
  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}

      <div className="flex flex-col gap-3 min-h-0 flex-1">
        {/* 상단 · 타이틀 + 기간 */}
        <Card className="p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} className="text-brand-deep" strokeWidth={2.2} />
            <span className="text-[16px] font-semibold text-ink tracking-tight">발주매입 대조</span>
          </div>
          <div className="flex items-center gap-2">
            <InlineLabel size="sm">매입 매칭 기간</InlineLabel>
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
          <div className="flex-1" />
          <span className="text-[13px] text-ink-soft whitespace-normal break-keep">
            왼쪽 · 발주이력 · 카드 클릭 → 오른쪽 · 매입 매칭 상세
          </span>
        </Card>

        {/* 좌·우 · 한눈에 비교 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
          {/* ─── 왼쪽 · OrderHistoryTab 그대로 (Props 확장) ─── */}
          <div className="min-h-0">
            <OrderHistoryTab
              onSelectOrder={setSelectedOrderNumber}
              selectedOrderNumber={selectedOrderNumber}
            />
          </div>

          {/* ─── 오른쪽 · 매입 매칭 상세 ─── */}
          <div className="rounded-2xl border border-zinc-200/70 bg-white overflow-hidden flex flex-col min-h-[520px] max-h-[calc(100vh-180px)]">
            {/* 상단 요약 */}
            <div className="shrink-0 px-4 py-3 border-b border-line bg-zinc-50/40">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[15px] font-semibold text-ink tracking-tight">매입 매칭</span>
                {selectedOrderNumber && (
                  <>
                    <StatusPill tone="zinc" size="xs">
                      {detail?.counts.matched ?? 0}건 확인
                    </StatusPill>
                    {(detail?.counts.exceptions ?? 0) > 0 && (
                      <StatusPill tone="amber" size="xs">
                        {detail!.counts.exceptions}건 이상
                      </StatusPill>
                    )}
                    {(detail?.counts.unmatched ?? 0) > 0 && (
                      <StatusPill tone="zinc" size="xs">
                        {detail!.counts.unmatched}건 미판정
                      </StatusPill>
                    )}
                  </>
                )}
                <div className="flex-1" />
                {selectedOrderNumber && detail && (
                  <StatusPill tone={overallTone} dot>
                    {STATUS_LABEL[overallStatus]}
                  </StatusPill>
                )}
              </div>
              {detail && (
                <div className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-[13px] text-ink-soft tabular-nums whitespace-normal break-keep">
                  <span className="font-mono font-semibold text-ink">
                    {detail.order_number ? `#${detail.order_number}` : "발주번호 미지정"}
                  </span>
                  <span className="text-line">|</span>
                  <span>{displayVendorName(detail.supplier ?? "") || "공급사 미지정"}</span>
                  <span className="text-line">|</span>
                  <span>{shortDate(detail.sent_at ?? detail.order_date) || "—"}</span>
                  <span className="text-line">|</span>
                  <span>발주 {fmtWon(totalOrderAmount)}</span>
                  <span className="text-line">|</span>
                  <span>매입 {fmtWon(totalPurchaseAmount)}</span>
                </div>
              )}
            </div>

            {/* 리스트 · 상태 분기 */}
            {!selectedOrderNumber ? (
              <div className="flex-1 flex items-center justify-center py-10">
                <EmptyState
                  icon={Info}
                  title="발주를 선택하세요"
                  hint="왼쪽 발주이력에서 발주 카드를 클릭하면 해당 발주의 매입 매칭 결과가 표시됩니다"
                />
              </div>
            ) : loading ? (
              <div className="flex-1 flex items-center justify-center py-10">
                <Spinner size={14} tone="zinc" label="불러오는 중..." labelSize={12} />
              </div>
            ) : error ? (
              <div className="p-6">
                <Card className="p-3 border-rose-200 bg-rose-50 text-rose-700 text-[14px]">
                  {error}
                </Card>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-10">
                <EmptyState
                  title="발주 라인이 없습니다"
                  hint="선택한 발주에 매칭 대상 라인이 없거나 발주가 삭제되었습니다"
                />
              </div>
            ) : (
              <div className="overflow-auto flex-1 min-h-0">
                <table className="w-full text-[14px] border-collapse">
                  <thead className="sticky top-0 bg-zinc-50 z-10 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
                    <tr className="text-[13px] text-ink-soft">
                      <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">상품</th>
                      <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">발주</th>
                      <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">매입</th>
                      <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">단가</th>
                      <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">금액</th>
                      <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">매입일</th>
                      <th className="text-center px-3 py-2.5 font-medium whitespace-nowrap">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const matches = r.purchase_matches ?? [];
                      const rowStatus = effectiveStatus(r);
                      // Product row highlight · exception → amber tint · matched → emerald tint
                      const rowTintCls = rowStatus === "matched"
                        ? "bg-emerald-50/30"
                        : rowStatus === "exception"
                          ? "bg-amber-50/30"
                          : "";
                      if (matches.length === 0) {
                        // 매입 없음 placeholder
                        return (
                          <tr key={`row-${String(r.id)}`} className={`border-b border-zinc-100 ${rowTintCls}`}>
                            <td className="px-3 py-2.5 whitespace-normal break-keep align-top">
                              <div className="flex flex-col leading-snug">
                                <span className="text-[13px] text-zinc-400 tabular-nums font-medium">
                                  {r.product_code}
                                </span>
                                <span className="text-[15px] font-semibold text-ink">
                                  {r.product_name || "—"}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums align-top">
                              <span className="text-[14px] font-bold text-rose-600">
                                {fmtQty(r.order_qty)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums align-top text-ink-mute">
                              —
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums align-top text-ink-soft">
                              {r.unit_price ? fmtWon(r.unit_price) : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums align-top text-ink-mute">
                              —
                            </td>
                            <td className="px-3 py-2.5 tabular-nums align-top text-ink-mute">
                              —
                            </td>
                            <td className="px-3 py-2.5 text-center align-top">
                              <StatusPill tone="zinc" size="xs">매입 없음</StatusPill>
                            </td>
                          </tr>
                        );
                      }
                      // 매입 있음 · matches 배열 각각 한 줄
                      return matches.map((m, mi) => {
                        const isFirst = mi === 0;
                        return (
                          <tr
                            key={`row-${String(r.id)}-m-${String(m.purchase_id)}`}
                            className={`border-b border-zinc-100 ${rowTintCls}`}
                          >
                            <td className="px-3 py-2.5 whitespace-normal break-keep align-top">
                              {isFirst ? (
                                <div className="flex flex-col leading-snug">
                                  <span className="text-[13px] text-zinc-400 tabular-nums font-medium">
                                    {r.product_code}
                                  </span>
                                  <span className="text-[15px] font-semibold text-ink">
                                    {r.product_name || "—"}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[12px] text-ink-mute pl-3">↳ 부분 배송</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums align-top">
                              {isFirst ? (
                                <span className="text-[14px] font-bold text-rose-600">
                                  {fmtQty(r.order_qty)}
                                </span>
                              ) : (
                                <span className="text-ink-mute text-[13px]">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums align-top">
                              <span className="text-[14px] font-bold text-sky-700">
                                {fmtQty(m.quantity)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums align-top text-ink-soft">
                              {fmtWon(m.unit_price)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums align-top">
                              <span className="text-[14px] font-semibold text-emerald-700">
                                {fmtWon(m.amount)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 tabular-nums align-top text-ink-soft">
                              {shortDate(m.purchase_date) || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-center align-top">
                              {renderDiff(Number(r.order_qty ?? 0), r.unit_price, Number(m.quantity ?? 0), Number(m.unit_price ?? 0))}
                            </td>
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* 하단 액션 바 · sticky · 선택 발주 있을 때만 */}
            {selectedOrderNumber && detail && rows.length > 0 && (
              <div className="shrink-0 border-t border-line bg-white px-4 py-3 flex items-center gap-2 flex-wrap">
                {anyPending ? (
                  <>
                    <Button
                      variant="primary"
                      size="md"
                      icon={<CheckCircle2 size={15} strokeWidth={2.4} />}
                      onClick={() => runConfirm(rows)}
                      disabled={busy}
                      className="!bg-emerald-600 hover:!bg-emerald-700 !border-emerald-600"
                    >
                      매입확인
                    </Button>
                    <Button
                      variant="primary"
                      size="md"
                      icon={<AlertTriangle size={15} strokeWidth={2.4} />}
                      onClick={() => setExOpen(true)}
                      disabled={busy}
                      className="!bg-amber-500 hover:!bg-amber-600 !border-amber-500"
                    >
                      매입이상
                    </Button>
                  </>
                ) : (
                  <>
                    <StatusPill tone={overallTone} dot>
                      {STATUS_LABEL[overallStatus]}
                      {rows.some((r) => r.match_status) && " · 사용자 판정"}
                    </StatusPill>
                    {decidedCount > 0 && (
                      <Button
                        variant="secondary"
                        size="md"
                        icon={<RotateCcw size={15} strokeWidth={2.2} />}
                        onClick={() => runUndo(rows)}
                        disabled={busy}
                      >
                        Undo
                      </Button>
                    )}
                  </>
                )}
                {busy && <Spinner size={14} tone="zinc" />}
                <div className="flex-1" />
                {rows[0]?.matched_at && (
                  <span className="text-[12px] text-ink-mute tabular-nums">
                    처리 · {shortDate(rows[0].matched_at)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 이상 판정 · 메모 모달 · 재사용 */}
      {selectedOrderNumber && rows.length > 0 && (
        <ExceptionNoteModal
          open={exOpen}
          onClose={() => setExOpen(false)}
          orderId={rows[0]?.id ?? null}
          orderNumber={detail?.order_number ?? selectedOrderNumber}
          defaultExceptionType={effectiveExceptionType(rows[0])}
          defaultNote={rows[0]?.exception_note ?? null}
          onSaved={async () => {
            // 발주 내 나머지 라인도 동일 사유·메모로 exception 처리 (판정 단위 · 발주)
            const first = rows[0];
            const others = rows.slice(1);
            const exType = effectiveExceptionType(first) ?? "no_purchase";
            const note = first?.exception_note ?? null;
            try {
              for (const r of others) {
                await confirmOrderPurchaseMatch(r.id, {
                  action: "exception",
                  exception_type: exType,
                  note,
                });
              }
            } catch {
              // 첫 라인은 이미 저장 · 나머지 실패는 재조회로 반영
            }
            await loadDetail();
          }}
        />
      )}
    </>
  );
};

export default OrderPurchaseMatchTab;
