// src/components/OrderManagePage/PurchaseHistoryTab/PriceVarianceTab.tsx
// 2026-10-06 · 매입 단가변동 관리 Tab
//   사용자 지시 (24+ 섹션 핵심):
//   · AUTO: PRICE_INCREASE / PRICE_DECREASE (read-only · 수동 수정 금지)
//   · MANUAL: PENDING / CONFIRMED_CHANGE / NEEDS_CHECK / RESOLVED (사용자 처리)
//   · 두 축 완전 분리 · 처리완료 눌러도 8,000→8,500 사실은 사라지지 않음
//   · 상승/하락 색만으로 의미 전달 금지 (text/icon 함께)
//   · N+1 금지 (expand history 는 row 단위 1회 batch)
//   · 월 멀티선택 (useMonthFilter · months_list) 재사용
//   · badge: 현재 months_list 내 effective_review_status=PENDING 건수

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ChevronDown, ChevronRight, Filter, X } from "lucide-react";
import { api } from "../../../lib/apiClient";
import { Spinner } from "../../common/Spinner";
import { useToast, toastClass } from "../../../hooks/useToast";
import { fmtWonNoUnit } from "../../../lib/format";
import type {
  PriceVarianceRow,
  PriceVarianceListResponse,
  PriceChangeType,
  PriceReviewStatus,
  PriceVarianceSort,
  PriceHistoryResponse,
  PriceHistoryRow,
} from "../../../shared/schemas/priceVariance";

interface Props {
  /** 상위 PurchaseHistoryTab 이 전달하는 months_list (예: "2026-09,2026-10") */
  monthsListParamStr?: string;
}

const STATUS_LABEL: Record<PriceReviewStatus, string> = {
  PENDING:          "미확인",
  CONFIRMED_CHANGE: "정상변동",
  NEEDS_CHECK:      "확인요청",
  RESOLVED:         "처리완료",
};

const STATUS_COLOR: Record<PriceReviewStatus, string> = {
  PENDING:          "text-rose-700 bg-rose-50 border-rose-200",
  CONFIRMED_CHANGE: "text-sky-700 bg-sky-50 border-sky-200",
  NEEDS_CHECK:      "text-amber-700 bg-amber-50 border-amber-200",
  RESOLVED:         "text-zinc-500 bg-zinc-50 border-zinc-200",
};

const CHANGE_LABEL: Record<PriceChangeType, string> = {
  PRICE_INCREASE: "단가상승",
  PRICE_DECREASE: "단가하락",
};

export const PriceVarianceTab: React.FC<Props> = ({ monthsListParamStr }) => {
  const { toast, showError, showSuccess } = useToast();
  const [rows, setRows] = useState<PriceVarianceRow[]>([]);
  const [total, setTotal] = useState(0);
  // 2026-10-06 · 사용자 섹션 13 · badge SSOT · 서버 전체 filter 결과의 PENDING count
  //   현재 page rows.filter(PENDING).length 사용 금지
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [changeType, setChangeType] = useState<PriceChangeType | "all">("all");
  const [reviewFilter, setReviewFilter] = useState<PriceReviewStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<PriceVarianceSort>("recent");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [historyCache, setHistoryCache] = useState<Record<number, PriceHistoryRow[]>>({});
  const [historyLoading, setHistoryLoading] = useState<number | null>(null);
  const [reviewingId, setReviewingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (monthsListParamStr) params.set("months_list", monthsListParamStr);
      if (changeType !== "all") params.set("change_type", changeType);
      if (reviewFilter !== "all") params.set("review_status", reviewFilter);
      if (search.trim()) {
        // 상품/공급사 통합 검색 · 2개 param
        params.set("product_search", search.trim());
        params.set("supplier_search", search.trim());
      }
      params.set("sort", sort);
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      const { data } = await api.get<PriceVarianceListResponse>(
        `/api/purchases/price-variance?${params}`,
      );
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setPendingCount(data.pendingCount ?? 0);
    } catch (err: unknown) {
      setRows([]);
      setTotal(0);
      setPendingCount(0);
      showError(`단가변동 로드 실패 · ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [monthsListParamStr, changeType, reviewFilter, search, sort, page, pageSize, showError]);

  useEffect(() => { void load(); }, [load]);

  // 필터 변경 시 1페이지로 리셋 (page 변경 시엔 유지)
  useEffect(() => { setPage(1); }, [monthsListParamStr, changeType, reviewFilter, search, sort]);

  const toggleExpand = async (row: PriceVarianceRow) => {
    if (expandedId === row.purchase_detail_id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.purchase_detail_id);
    if (historyCache[row.purchase_detail_id]) return;
    setHistoryLoading(row.purchase_detail_id);
    try {
      const { data } = await api.get<PriceHistoryResponse>(
        `/api/purchases/price-variance/${row.purchase_detail_id}/history?limit=10`,
      );
      setHistoryCache((prev) => ({ ...prev, [row.purchase_detail_id]: data.rows ?? [] }));
    } catch (err: unknown) {
      showError(`매입 이력 로드 실패 · ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setHistoryLoading(null);
    }
  };

  const changeReviewStatus = async (row: PriceVarianceRow, next: PriceReviewStatus) => {
    const current = row.effective_review_status;
    if (next === current) return; // no-op · 사용자 섹션 21
    setReviewingId(row.purchase_detail_id);
    try {
      await api.patch(`/api/purchases/price-variance/${row.purchase_detail_id}/review`, {
        status: next,
        reviewed_previous_purchase_detail_id: row.previous_purchase_detail_id,
        reviewed_previous_price: row.previous_price,
        reviewed_current_price: row.current_price,
      });
      showSuccess(`${STATUS_LABEL[next]} 처리됨`);
      // 로컬 즉시 반영 + 서버 fresh refetch
      setRows((prev) => prev.map((r) => r.purchase_detail_id === row.purchase_detail_id
        ? { ...r, effective_review_status: next, review_status: next }
        : r,
      ));
      void load();
    } catch (err: unknown) {
      showError(`상태 변경 실패 · ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setReviewingId(null);
    }
  };

  // 2026-10-06 · 사용자 섹션 13 · pendingCount 는 서버 응답 (전체 filtered scope)
  //   아래 increase/decrease 는 현재 page summary 전용 (badge 아님)
  const pageIncreaseCount = useMemo(() => rows.filter((r) => r.change_type === "PRICE_INCREASE").length, [rows]);
  const pageDecreaseCount = useMemo(() => rows.filter((r) => r.change_type === "PRICE_DECREASE").length, [rows]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col min-h-0 flex-1 bg-white">
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}

      {/* 상단 요약 · 필터 */}
      <div className="px-4 py-3 border-b border-line bg-zinc-50/60 flex flex-wrap items-center gap-2 text-[14px]">
        <span className="font-bold text-zinc-700">단가변동</span>
        <span className="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-md font-semibold tabular-nums">
          전체 {total.toLocaleString()}
        </span>
        <span className="px-2 py-0.5 bg-rose-100 border border-rose-300 text-rose-800 rounded-md font-bold tabular-nums"
              title="현재 filter 범위 전체 미확인 (page 와 무관 · badge SSOT)">
          미확인 {pendingCount}
        </span>
        <span className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-md tabular-nums"
              title="현재 page 상승 건수">
          <ArrowUp size={11} className="inline" /> {pageIncreaseCount}
        </span>
        <span className="px-2 py-0.5 bg-sky-50 border border-sky-200 text-sky-700 rounded-md tabular-nums"
              title="현재 page 하락 건수">
          <ArrowDown size={11} className="inline" /> {pageDecreaseCount}
        </span>

        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          <Filter size={12} className="text-zinc-400" />
          {/* change_type */}
          <select
            value={changeType}
            onChange={(e) => setChangeType(e.target.value as PriceChangeType | "all")}
            className="h-7 px-2 text-[13px] border border-line rounded-md bg-white"
          >
            <option value="all">전체 변동</option>
            <option value="PRICE_INCREASE">단가상승</option>
            <option value="PRICE_DECREASE">단가하락</option>
          </select>
          {/* review_status */}
          <select
            value={reviewFilter}
            onChange={(e) => setReviewFilter(e.target.value as PriceReviewStatus | "all")}
            className="h-7 px-2 text-[13px] border border-line rounded-md bg-white"
          >
            <option value="all">전체 처리상태</option>
            <option value="PENDING">미확인</option>
            <option value="CONFIRMED_CHANGE">정상변동</option>
            <option value="NEEDS_CHECK">확인요청</option>
            <option value="RESOLVED">처리완료</option>
          </select>
          {/* search */}
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="상품/공급사"
              className="h-7 w-40 pl-2 pr-6 text-[13px] border border-line rounded-md"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                aria-label="검색 지우기"
              ><X size={12} /></button>
            )}
          </div>
          {/* sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as PriceVarianceSort)}
            className="h-7 px-2 text-[13px] border border-line rounded-md bg-white"
          >
            <option value="recent">최근변동순</option>
            <option value="amount">변동금액 큰순</option>
            <option value="rate">변동률 큰순</option>
          </select>
        </div>
      </div>

      {/* 콘텐츠 */}
      {loading && rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <Spinner label="단가변동 조회 중..." size={13} tone="zinc" labelSize={11} />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-12 text-[14px] text-zinc-400">
          해당 조건에 변동 없음
        </div>
      ) : (
        <>
          {/* Desktop table (md+) */}
          <div className="hidden md:block flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[14px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead className="sticky top-0 bg-zinc-100/70 z-10">
                <tr className="text-[13px] font-bold text-zinc-500 uppercase tracking-wider">
                  <th className="text-left px-2 py-2 w-6"></th>
                  <th className="text-left px-3 py-2">상품</th>
                  <th className="text-left px-3 py-2">공급사</th>
                  <th className="text-right px-3 py-2 w-20">이전단가</th>
                  <th className="text-right px-3 py-2 w-20">이번단가</th>
                  <th className="text-right px-3 py-2 w-20">차이</th>
                  <th className="text-right px-3 py-2 w-16">변동률</th>
                  <th className="text-left px-3 py-2 w-20">매입일</th>
                  <th className="text-left px-3 py-2 w-32">처리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((r) => {
                  const expanded = expandedId === r.purchase_detail_id;
                  const isIncrease = r.change_type === "PRICE_INCREASE";
                  const diff = r.price_difference ?? 0;
                  const rate = r.change_rate ?? 0;
                  return (
                    <React.Fragment key={r.purchase_detail_id}>
                      <tr
                        onClick={() => toggleExpand(r)}
                        className="cursor-pointer hover:bg-zinc-50/60 align-top"
                      >
                        <td className="text-center py-2">
                          {expanded ? <ChevronDown size={13} className="text-zinc-500 mx-auto" /> : <ChevronRight size={13} className="text-zinc-400 mx-auto" />}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-semibold text-zinc-800">{r.product_name ?? "-"}</div>
                          <div className="text-[12px] text-zinc-400 font-mono tabular-nums">{r.product_code}</div>
                        </td>
                        <td className="px-3 py-2 text-zinc-700">
                          <div>{r.supplier_name ?? "-"}</div>
                          <div className="text-[12px] text-zinc-400 font-mono tabular-nums">{r.supplier_code}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                          {r.previous_price != null ? fmtWonNoUnit(r.previous_price) : "-"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-zinc-800">
                          {fmtWonNoUnit(r.current_price)}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums font-bold ${isIncrease ? "text-rose-600" : "text-sky-600"}`}>
                          <span className="inline-flex items-center gap-1">
                            {isIncrease ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                            {isIncrease ? "+" : ""}{diff.toLocaleString()}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${isIncrease ? "text-rose-600" : "text-sky-600"}`}>
                          {isIncrease ? "+" : ""}{rate.toFixed(2)}%
                        </td>
                        <td className="px-3 py-2 text-zinc-600 tabular-nums text-[13px]">
                          {r.purchase_date}
                        </td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={r.effective_review_status}
                            disabled={reviewingId === r.purchase_detail_id}
                            onChange={(e) => void changeReviewStatus(r, e.target.value as PriceReviewStatus)}
                            className={`h-7 px-2 text-[13px] border rounded-md font-semibold ${STATUS_COLOR[r.effective_review_status]}`}
                          >
                            {(["PENDING", "CONFIRMED_CHANGE", "NEEDS_CHECK", "RESOLVED"] as PriceReviewStatus[]).map((s) => (
                              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-zinc-50/40">
                          <td></td>
                          <td colSpan={8} className="px-4 py-3">
                            <ExpandedHistory
                              row={r}
                              history={historyCache[r.purchase_detail_id]}
                              loading={historyLoading === r.purchase_detail_id}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card */}
          <div className="md:hidden flex-1 min-h-0 overflow-auto divide-y divide-zinc-100">
            {rows.map((r) => {
              const expanded = expandedId === r.purchase_detail_id;
              const isIncrease = r.change_type === "PRICE_INCREASE";
              return (
                <div key={r.purchase_detail_id} className="p-3">
                  <div onClick={() => toggleExpand(r)} className="cursor-pointer">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-zinc-800 text-[14px]">{r.product_name ?? "-"}</div>
                        <div className="text-[12px] text-zinc-500">{r.supplier_name ?? "-"}</div>
                      </div>
                      <span className={`shrink-0 px-2 py-0.5 text-[11px] font-bold rounded ${isIncrease ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"}`}>
                        {isIncrease ? "↑" : "↓"} {CHANGE_LABEL[r.change_type]}
                      </span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-1 text-[13px]">
                      <div className="text-zinc-500">이번 <span className="font-bold text-zinc-800 tabular-nums">{fmtWonNoUnit(r.current_price)}원</span></div>
                      <div className="text-zinc-500">이전 <span className="text-zinc-600 tabular-nums">{r.previous_price != null ? `${fmtWonNoUnit(r.previous_price)}원` : "-"}</span></div>
                    </div>
                    <div className={`mt-1 text-[13px] font-bold tabular-nums ${isIncrease ? "text-rose-600" : "text-sky-600"}`}>
                      {isIncrease ? "+" : ""}{(r.price_difference ?? 0).toLocaleString()}원 · {isIncrease ? "+" : ""}{(r.change_rate ?? 0).toFixed(2)}%
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-400 tabular-nums">{r.purchase_date}</div>
                  </div>
                  <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={r.effective_review_status}
                      disabled={reviewingId === r.purchase_detail_id}
                      onChange={(e) => void changeReviewStatus(r, e.target.value as PriceReviewStatus)}
                      className={`h-7 w-full px-2 text-[13px] border rounded-md font-semibold ${STATUS_COLOR[r.effective_review_status]}`}
                    >
                      {(["PENDING", "CONFIRMED_CHANGE", "NEEDS_CHECK", "RESOLVED"] as PriceReviewStatus[]).map((s) => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </div>
                  {expanded && (
                    <div className="mt-2 p-2 bg-zinc-50 rounded">
                      <ExpandedHistory
                        row={r}
                        history={historyCache[r.purchase_detail_id]}
                        loading={historyLoading === r.purchase_detail_id}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-3 py-2 border-t border-line flex items-center justify-between text-[13px] bg-zinc-50/40">
              <span className="text-zinc-500 tabular-nums">페이지 {page} / {totalPages} · 총 {total.toLocaleString()}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="h-7 px-3 border border-line rounded-md disabled:opacity-40 hover:bg-zinc-100 cursor-pointer"
                >‹ 이전</button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="h-7 px-3 border border-line rounded-md disabled:opacity-40 hover:bg-zinc-100 cursor-pointer"
                >다음 ›</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const ExpandedHistory: React.FC<{
  row: PriceVarianceRow;
  history: PriceHistoryRow[] | undefined;
  loading: boolean;
}> = ({ row, history, loading }) => {
  if (loading) {
    return <div className="py-2"><Spinner label="이력 로드 중..." size={10} tone="zinc" labelSize={11} /></div>;
  }
  if (!history || history.length === 0) {
    return <div className="text-[13px] text-zinc-400">최근 매입 이력 없음</div>;
  }
  return (
    <div>
      <div className="text-[12px] font-bold text-zinc-600 mb-1 uppercase tracking-wider">
        최근 매입 (같은 상품 · 같은 공급사)
      </div>
      <div className="space-y-1 text-[13px]">
        {history.map((h) => {
          const isCurrent = h.purchase_detail_id === row.purchase_detail_id;
          const isPrev    = h.purchase_detail_id === row.previous_purchase_detail_id;
          return (
            <div
              key={h.purchase_detail_id}
              className={`flex items-center gap-3 px-2 py-1 rounded ${isCurrent ? "bg-amber-50 border border-amber-200" : isPrev ? "bg-sky-50 border border-sky-200" : ""}`}
            >
              <span className="text-zinc-500 tabular-nums w-20">{h.purchase_date}</span>
              <span className="font-bold text-zinc-800 tabular-nums w-20 text-right">{fmtWonNoUnit(h.unit_price)}원</span>
              <span className="text-zinc-400 tabular-nums text-[12px]">× {h.quantity}</span>
              {isCurrent && <span className="ml-auto text-[11px] font-bold text-amber-700">← 현재 변동 row</span>}
              {isPrev    && <span className="ml-auto text-[11px] font-bold text-sky-700">← 직전 비교 row</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PriceVarianceTab;
