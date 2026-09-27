// 2026-09-27 · 사용자 지시 · 발주매입 대조 · 이상목록 탭 · 좌우 SplitPanel 재구성
//   · 사용자 지시:
//     1. "이상목록은 추려서 담당자에게 내용을 보내야 해"
//     2. "발주요청 페이지 참고해서 같은 구조로"
//     3. "선택해서 공급사별로 메일 보낼 수 있게"
//     4. "발주요청보내듯이 해당 담당자에게 발주이상 요청서를 보내야 해"
//     5. "좌우로 나누어서 오른쪽에 발주이상요청내역이 항상 표시"
//     6. "왼쪽 공급사클릭하면 해당공급사것만 보이게"
//
// 아키텍처:
//   · 상단 · 툴바 · KPI · exception_type 필터 · 기간
//   · 좌우 리사이저블 · useResizablePanel (storageKey: "resize.order-purchase-exception")
//     · 왼쪽 · 공급사 리스트 카드 (담당자·이메일·전화·이상 라인 수)
//     · 오른쪽 · 선택 공급사의 이상 라인 (체크박스 · 상품 · 발주 · 매입 · Diff · 사유 · 메모)
//   · 발송 · [이상요청서 발송] · ExceptionRequestModal · POST bulk-send
//   · 세션 발송 완료 · sentOrderIds set · 배지 표시 (localStorage X)
//
// 대원칙:
//   · 프레임워크 재사용 (Card · StatusPill · Spinner · EmptyState · SegmentedControl · Button · PeriodSelector · Modal · useToast · useConfirm · useVendors · useResizablePanel)
//   · Linear/Vercel/Notion 2026 톤 · 이모지·파스텔 X
//   · 반응형 · lg 미만 스택 (useResizablePanel isDesktop)
//   · 폰트 +2 · 말줄임표 X
//   · 캐시 X · apiClient 통합 no-store
//   · 첫 진입 default · selectedSupplier=null · empty state
//   · localStorage 복원 X (리사이저블 폭만 UI preference)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Info, Send, Users2, Mail, Phone,
} from "lucide-react";
import { Card } from "../common/Card";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { PeriodSelector } from "../common/PeriodSelector";
import { InlineLabel } from "../common/InlineLabel";
import { SegmentedControl } from "../common/SegmentedControl";
import { Button } from "../common/Button";
import { useToast, toastClass } from "../../hooks/useToast";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import { useVendors } from "../../hooks/useVendors";
import { ApiError } from "../../lib/apiClient";
import { getErrorMessage } from "../../lib/errorMessage";
import { shortDate } from "../../lib/dateFormat";
import { displayVendorName } from "../../utils/vendorNameNormalize";
import {
  getOrderPurchaseMatchList,
  type OrderMatchRow,
  type OrderPurchaseMatchResponse,
} from "../../lib/api/orderPurchaseMatchApi";
import { useExceptionRequestModal } from "./useExceptionRequestModal";
import { ExceptionRequestModal } from "./ExceptionRequestModal";

// ═══════════════════════════════════════════════════════════════
// 상수 · 유틸
// ═══════════════════════════════════════════════════════════════
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

type FilterKey = "all" | "qty_short" | "qty_over" | "price_diff" | "no_purchase";

function effectiveExceptionType(r: OrderMatchRow): string | null {
  return r.exception_type ?? r.auto_exception_type ?? null;
}

function isException(r: OrderMatchRow): boolean {
  if (r.match_status === "matched") return false;
  if (r.match_status === "exception") return true;
  if (r.match_status === "unmatched") return false;
  return r.auto_status === "exception";
}

// ═══════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════════
export const OrderPurchaseExceptionTab: React.FC = () => {
  const { toast } = useToast();
  const { findVendorByName } = useVendors();

  const [days, setDays] = useState<number>(7);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [data, setData] = useState<OrderPurchaseMatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 첫 진입 default · null · empty state (대원칙 · 사용자 명시 클릭 대기)
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  // 오른쪽 · 선택된 order_ids · Set<string>
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  // 리사이저블 좌우 패널
  const { width: leftWidth, startResize, isDesktop } = useResizablePanel({
    storageKey: "resize.order-purchase-exception",
    defaultRatio: 0.35,
    minWidth: 320,
    maxWidth: 9999,
    detectDesktop: true,
    desktopBreakpoint: 1024,
  });

  // ─── 이상 요청 모달 훅 ─────────────────────────────────────────
  const {
    exceptionModal,
    sendingBulk,
    sentOrderIds,
    openExceptionRequestModal,
    closeExceptionRequestModal,
    toggleChannel,
    setMemo,
    submitExceptionRequestModal,
  } = useExceptionRequestModal({
    findVendorByName,
    onSent: () => {
      // 발송 후 · 선택 해제 · 데이터 재조회
      setSelectedOrderIds(new Set());
      void load();
    },
  });

  // ─── 데이터 로드 ─────────────────────────────────────────
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

  // ─── 이상 라인 필터 + 공급사별 그룹핑 ─────────────────────────────
  const exceptionRows = useMemo((): OrderMatchRow[] => {
    if (!data) return [];
    const rows = [...data.exceptions, ...data.matched, ...data.unmatched].filter(isException);
    if (filter === "all") return rows;
    return rows.filter((r) => effectiveExceptionType(r) === filter);
  }, [data, filter]);

  // 공급사별 그룹핑 (왼쪽 리스트용)
  interface SupplierGroup {
    supplierKey: string;
    supplierDisplay: string;
    supplierRaw: string;
    contact: string | null;
    email: string | null;
    phone: string | null;
    rows: OrderMatchRow[];
    hasSent: boolean;
  }
  const supplierGroups = useMemo((): SupplierGroup[] => {
    const map = new Map<string, SupplierGroup>();
    for (const r of exceptionRows) {
      const supRaw = (r.supplier ?? "").trim() || "(공급사 미지정)";
      const supKey = supRaw;
      if (!map.has(supKey)) {
        const vendor = findVendorByName(supRaw);
        map.set(supKey, {
          supplierKey: supKey,
          supplierDisplay: displayVendorName(supRaw) || supRaw,
          supplierRaw: supRaw,
          contact: vendor?.contact_name ?? null,
          email: vendor?.email ?? null,
          phone: vendor?.phone ?? null,
          rows: [],
          hasSent: false,
        });
      }
      const g = map.get(supKey)!;
      g.rows.push(r);
      if (sentOrderIds.has(String(r.id))) g.hasSent = true;
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.rows.length !== b.rows.length) return b.rows.length - a.rows.length;
      return a.supplierDisplay.localeCompare(b.supplierDisplay, "ko");
    });
  }, [exceptionRows, findVendorByName, sentOrderIds]);

  // 선택 공급사 없을 때 · selectedSupplier 자동 클리어 (필터 변경 시)
  useEffect(() => {
    if (selectedSupplier && !supplierGroups.some((g) => g.supplierKey === selectedSupplier)) {
      setSelectedSupplier(null);
      setSelectedOrderIds(new Set());
    }
  }, [supplierGroups, selectedSupplier]);

  // 오른쪽 · 선택 공급사의 이상 라인
  const selectedGroup = useMemo(
    () => supplierGroups.find((g) => g.supplierKey === selectedSupplier) ?? null,
    [supplierGroups, selectedSupplier],
  );
  const rightRows = selectedGroup?.rows ?? [];

  // 전체 선택 상태
  const allChecked =
    rightRows.length > 0 && rightRows.every((r) => selectedOrderIds.has(String(r.id)));
  const someChecked = rightRows.some((r) => selectedOrderIds.has(String(r.id)));

  const toggleAll = useCallback(() => {
    setSelectedOrderIds((prev) => {
      if (allChecked) {
        const n = new Set(prev);
        for (const r of rightRows) n.delete(String(r.id));
        return n;
      }
      const n = new Set(prev);
      for (const r of rightRows) n.add(String(r.id));
      return n;
    });
  }, [allChecked, rightRows]);

  const toggleOne = useCallback((id: string) => {
    setSelectedOrderIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  // 발송 클릭
  const handleSend = useCallback(() => {
    const selectedRows = rightRows.filter((r) => selectedOrderIds.has(String(r.id)));
    if (selectedRows.length === 0) return;
    openExceptionRequestModal(selectedRows);
  }, [rightRows, selectedOrderIds, openExceptionRequestModal]);

  const selectSupplier = useCallback((key: string) => {
    setSelectedSupplier(key);
    setSelectedOrderIds(new Set()); // 새 공급사 선택 시 · 선택 초기화
  }, []);

  const totalCount = exceptionRows.length;
  const totalSuppliers = supplierGroups.length;
  const selectedCount = selectedOrderIds.size;

  // ═══════════════════════════════════════════════════════════════
  // 렌더
  // ═══════════════════════════════════════════════════════════════
  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>
          {toast.message}
        </div>
      )}

      <div className="flex flex-col gap-3 min-h-0 flex-1">
        {/* 상단 · 툴바 · KPI · 필터 · 기간 */}
        <Card className="p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600" strokeWidth={2.2} />
            <span className="text-[16px] font-semibold text-ink tracking-tight">이상 목록</span>
            <StatusPill tone="amber" dot>
              {totalCount}건
            </StatusPill>
            <StatusPill tone="zinc" size="xs">
              {totalSuppliers}개 공급사
            </StatusPill>
          </div>
          <div className="flex items-center gap-2">
            <InlineLabel size="sm">사유</InlineLabel>
            <SegmentedControl<FilterKey>
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "전체" },
                { value: "qty_short", label: "수량 부족" },
                { value: "qty_over", label: "수량 초과" },
                { value: "price_diff", label: "단가 상이" },
                { value: "no_purchase", label: "매입 없음" },
              ]}
              size="sm"
              wrap
              ariaLabel="이상 사유 필터"
            />
          </div>
          <div className="flex items-center gap-2">
            <InlineLabel size="sm">기간</InlineLabel>
            <PeriodSelector<number>
              options={[
                { value: 7, label: "7일" },
                { value: 14, label: "14일" },
                { value: 30, label: "30일" },
                { value: 60, label: "60일" },
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

        {/* 좌우 SplitPanel · 데스크탑 리사이저블 · 모바일 스택 */}
        {!loading && totalCount > 0 && (
          <div className={`min-h-0 ${isDesktop ? "flex items-stretch gap-0" : "flex flex-col gap-4"}`}>
            {/* ─── 왼쪽 · 공급사 리스트 ─── */}
            <div
              className={isDesktop ? "shrink-0 min-h-0 flex flex-col" : "min-h-0 flex flex-col"}
              style={isDesktop ? { width: `${leftWidth}px` } : undefined}
            >
              <Card className="flex flex-col overflow-hidden min-h-[520px] max-h-[calc(100vh-220px)]">
                <div className="shrink-0 px-3 py-2.5 border-b border-line bg-zinc-50/60 flex items-center gap-2">
                  <Users2 size={16} className="text-brand-deep" strokeWidth={2.2} />
                  <span className="text-[15px] font-semibold text-ink">공급사</span>
                  <StatusPill tone="zinc" size="xs">
                    {totalSuppliers}
                  </StatusPill>
                </div>
                <div className="overflow-auto flex-1 min-h-0 flex flex-col divide-y divide-line">
                  {supplierGroups.map((g) => {
                    const isSelected = g.supplierKey === selectedSupplier;
                    return (
                      <button
                        type="button"
                        key={`sup-${g.supplierKey}`}
                        onClick={() => selectSupplier(g.supplierKey)}
                        className={`text-left px-3 py-2.5 transition-colors ${
                          isSelected
                            ? "bg-brand-deep/5 border-l-4 border-brand-deep"
                            : "hover:bg-zinc-50 border-l-4 border-transparent"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                          <span className="text-[15px] font-semibold text-ink whitespace-normal break-keep">
                            {g.supplierDisplay}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <StatusPill tone="amber" size="xs" dot>
                              {g.rows.length}건
                            </StatusPill>
                            {g.hasSent && (
                              <StatusPill tone="emerald" size="xs">
                                발송
                              </StatusPill>
                            )}
                          </div>
                        </div>
                        <div className="text-[13px] text-ink-soft flex items-center gap-x-2 gap-y-0.5 flex-wrap whitespace-normal break-keep">
                          {g.contact && (
                            <span className="font-semibold text-ink">{g.contact}</span>
                          )}
                          {g.phone && (
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Phone size={11} strokeWidth={2.2} />
                              {g.phone}
                            </span>
                          )}
                          {g.email && (
                            <span className="inline-flex items-center gap-1">
                              <Mail size={11} strokeWidth={2.2} />
                              {g.email}
                            </span>
                          )}
                          {!g.contact && !g.phone && !g.email && (
                            <span className="text-rose-600 font-semibold">연락처 미등록</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Card>
            </div>

            {/* ─── 리사이저 gutter ─── */}
            {isDesktop && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="좌우 패널 폭 조절"
                onMouseDown={startResize}
                className="w-1.5 mx-1 shrink-0 rounded-full bg-line/60 hover:bg-amber-400/70 active:bg-amber-500 cursor-col-resize transition-colors"
                title="드래그로 폭 조절"
              />
            )}

            {/* ─── 오른쪽 · 이상 라인 상세 ─── */}
            <div
              className={`min-w-0 rounded-2xl border border-zinc-200/70 bg-white overflow-hidden flex flex-col min-h-[520px] max-h-[calc(100vh-220px)] ${
                isDesktop ? "flex-1" : ""
              }`}
            >
              {/* 상단 · 액션바 */}
              <div className="shrink-0 px-4 py-3 border-b border-line bg-zinc-50/60 flex items-center gap-2 flex-wrap">
                <span className="text-[15px] font-semibold text-ink">
                  이상 라인 상세
                </span>
                {selectedGroup && (
                  <StatusPill tone="amber" size="xs" dot>
                    {selectedGroup.rows.length}건
                  </StatusPill>
                )}
                <div className="flex-1" />
                {selectedGroup && rightRows.length > 0 && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={toggleAll}
                    >
                      {allChecked ? "전체 해제" : "전체 선택"}
                    </Button>
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={selectedCount === 0 || sendingBulk}
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[15px] font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      {sendingBulk && <Spinner size={12} tone="white" />}
                      <Send size={14} strokeWidth={2.4} />
                      이상요청서 발송 {selectedCount > 0 && `(${selectedCount})`}
                    </button>
                  </>
                )}
              </div>

              {/* 리스트 상태 분기 */}
              {!selectedGroup ? (
                <div className="flex-1 flex items-center justify-center py-10">
                  <EmptyState
                    icon={Info}
                    title="왼쪽에서 공급사를 선택하세요"
                    hint="공급사 카드를 클릭하면 해당 공급사의 이상 라인이 표시됩니다"
                  />
                </div>
              ) : rightRows.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-10">
                  <EmptyState
                    title="이 공급사에 표시할 이상 라인이 없습니다"
                    hint="다른 사유·기간 필터로 다시 확인하세요"
                  />
                </div>
              ) : (
                <div className="overflow-auto flex-1 min-h-0">
                  <table className="w-full text-[14px] border-collapse">
                    <thead className="sticky top-0 bg-zinc-50 z-10 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
                      <tr className="text-[13px] text-ink-soft">
                        <th className="text-center px-3 py-2.5 font-medium w-[44px]">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            ref={(el) => {
                              if (el) el.indeterminate = !allChecked && someChecked;
                            }}
                            onChange={toggleAll}
                            className="w-4 h-4 accent-amber-500 cursor-pointer"
                          />
                        </th>
                        <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">상품</th>
                        <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">발주</th>
                        <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">매입</th>
                        <th className="text-center px-3 py-2.5 font-medium whitespace-nowrap">사유</th>
                        <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">메모</th>
                        <th className="text-center px-3 py-2.5 font-medium whitespace-nowrap">발주일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rightRows.map((r) => {
                        const id = String(r.id);
                        const checked = selectedOrderIds.has(id);
                        const alreadySent = sentOrderIds.has(id);
                        const exType = effectiveExceptionType(r) ?? "";
                        const exLabel = EXCEPTION_LABEL[exType] ?? "이상";
                        const orderAmount = Number(r.order_qty ?? 0) * Number(r.unit_price ?? 0);
                        const purchaseAmount = (r.purchase_matches ?? []).reduce(
                          (s, p) => s + Number(p.amount ?? 0),
                          0,
                        );
                        const qtyDiff = Number(r.purchase_total_qty ?? 0) - Number(r.order_qty ?? 0);
                        return (
                          <tr
                            key={`ex-row-${id}`}
                            className={`border-b border-zinc-100 ${
                              checked ? "bg-amber-50/50" : "hover:bg-zinc-50/40"
                            }`}
                          >
                            <td className="px-3 py-2.5 text-center align-top">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleOne(id)}
                                className="w-4 h-4 accent-amber-500 cursor-pointer"
                              />
                            </td>
                            <td className="px-3 py-2.5 whitespace-normal break-keep align-top">
                              <div className="flex flex-col leading-snug gap-0.5">
                                <span className="text-[12px] text-ink-mute font-mono tabular-nums">
                                  {r.product_code}
                                </span>
                                <span className="text-[15px] font-semibold text-ink">
                                  {r.product_name || "—"}
                                </span>
                                {alreadySent && (
                                  <span className="inline-flex items-center gap-1 mt-0.5">
                                    <StatusPill tone="emerald" size="xs" dot>
                                      요청 발송됨
                                    </StatusPill>
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums align-top">
                              <div className="text-[14px] font-semibold text-ink">
                                {fmtQty(r.order_qty)}개
                              </div>
                              <div className="text-[12px] text-ink-soft">
                                {fmtWon(r.unit_price)} = {fmtWon(orderAmount)}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums align-top">
                              <div
                                className={`text-[14px] font-semibold ${
                                  qtyDiff === 0
                                    ? "text-ink"
                                    : qtyDiff < 0
                                      ? "text-amber-700"
                                      : "text-rose-700"
                                }`}
                              >
                                {r.purchase_total_qty > 0 ? `${fmtQty(r.purchase_total_qty)}개` : "—"}
                              </div>
                              <div className="text-[12px] text-ink-soft">
                                {r.purchase_avg_price
                                  ? `${fmtWon(r.purchase_avg_price)} = ${fmtWon(purchaseAmount)}`
                                  : "매입 없음"}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center align-top">
                              <StatusPill tone="amber" size="xs">
                                {exLabel}
                              </StatusPill>
                            </td>
                            <td className="px-3 py-2.5 align-top text-[13px] text-ink-soft whitespace-normal break-keep max-w-[220px]">
                              {r.exception_note || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-center align-top text-[12px] text-ink-soft tabular-nums whitespace-nowrap">
                              {shortDate(r.sent_at ?? r.order_date) || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 이상 요청서 모달 */}
      <ExceptionRequestModal
        state={exceptionModal}
        sendingBulk={sendingBulk}
        onClose={closeExceptionRequestModal}
        onToggleChannel={toggleChannel}
        onMemoChange={setMemo}
        onSubmit={submitExceptionRequestModal}
      />
    </>
  );
};

export default OrderPurchaseExceptionTab;
