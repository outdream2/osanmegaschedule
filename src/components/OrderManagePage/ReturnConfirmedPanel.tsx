// src/components/OrderManagePage/ReturnConfirmedPanel.tsx
// 2026-08-25 · 사용자 지시 · 반품확정 페이지 · return_requests.status='done' 리스트
//   · 반품필요 리스트에서 [반품확정] 버튼 클릭 시 · 여기로 이관
//   · 표형식 · TableListWrap · 검색 (공급사·상품·코드) · 기간 필터
//   · 각 row · [해제] 버튼 · status='done' → 'pending' 복구 (실수 대응)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
// 2026-08-29 · #165 A · SearchBar 프리미티브
import { SearchBar } from "../common/SearchBar";
// 2026-08-29 · 상품명 검색 · 통일 로직
import { matchesProductQuery } from "../../lib/productMatch";
import { api, ApiError } from "../../lib/apiClient";
import { Card } from "../common/Card";
import { EmptyState } from "../common/EmptyState";
import { Spinner } from "../common/Spinner";
import { TableListWrap, tableHeadCls, tableThCls, tableTdCls } from "../common/TableList";
import { StatusPill } from "../common/StatusPill";
import { useToast, toastClass } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { PeriodSelector, PERIOD_DAYS_PRESET } from "../common/PeriodSelector";
import { InlineLabel } from "../common/InlineLabel";

interface ReturnRow {
  id: number;
  created_at: string;
  product_code: string;
  product_name: string | null;
  supplier: string | null;
  qty: number;
  current_stock: number | null;
  purchase_price: number | null;
  reason: string | null;
  requested_by: string | null;
  status: string;
}

const fmtDate = (s: string): string => {
  if (!s) return "-";
  return String(s).slice(0, 10);
};
const fmtWon = (n: number): string => (n > 0 ? n.toLocaleString() + "원" : "-");

export const ReturnConfirmedPanel: React.FC = () => {
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(90);
  const [q, setQ] = useState("");
  const { toast, showError, showSuccess } = useToast();
  const confirm = useConfirm();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get<{ rows?: ReturnRow[] } | ReturnRow[]>(`/api/return-requests?status=done&days=${days}&limit=500`)
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : (data?.rows ?? []);
        setRows(list);
      })
      .catch((e: unknown) => {
        const msg = e instanceof ApiError ? e.message : (e as any)?.message ?? "네트워크 오류";
        setError(msg);
        showError(`반품확정 조회 실패: ${msg}`);
      })
      .finally(() => setLoading(false));
  }, [days, showError]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    // 2026-08-29 · 통일 로직 · matchesProductQuery
    return rows.filter(r => matchesProductQuery(r, q));
  }, [rows, q]);

  const totals = useMemo(() => {
    const totalQty = filtered.reduce((s, r) => s + (r.qty ?? 0), 0);
    const totalAmount = filtered.reduce((s, r) => s + (r.qty ?? 0) * (r.purchase_price ?? 0), 0);
    return { totalQty, totalAmount };
  }, [filtered]);

  const revertOne = async (row: ReturnRow) => {
    if (!await confirm({ message: `${row.product_name ?? row.product_code} · 반품확정 해제 (대기 상태로 복구)?` })) return;
    try {
      await api.patch(`/api/return-requests/${row.id}`, { status: "pending" });
      setRows(prev => prev.filter(r => r.id !== row.id));
      showSuccess("반품확정 해제 완료 (반품필요로 복귀)");
    } catch (e: any) {
      showError(`해제 실패: ${e?.message ?? "네트워크 오류"}`);
    }
  };

  const deleteOne = async (row: ReturnRow) => {
    if (!await confirm({ message: `${row.product_name ?? row.product_code} · 반품 기록 완전 삭제?`, danger: true })) return;
    try {
      await api.del(`/api/return-requests/${row.id}`);
      setRows(prev => prev.filter(r => r.id !== row.id));
      showSuccess("삭제 완료");
    } catch (e: any) {
      showError(`삭제 실패: ${e?.message ?? "네트워크 오류"}`);
    }
  };

  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        {/* 헤더 툴바 */}
        <div className="flex items-center gap-2 flex-wrap px-1">
          <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
          <span className="text-[18px] font-bold text-ink tracking-tight">반품확정</span>
          <StatusPill tone="emerald" size="md">
            {loading ? <Spinner size={12} tone="emerald" className="inline" /> : `${filtered.length}건`}
          </StatusPill>
          {totals.totalAmount > 0 && (
            <span className="text-[14px] font-semibold text-ink-soft tabular-nums">
              · 수량 {totals.totalQty.toLocaleString()}개 · 금액 {fmtWon(totals.totalAmount)}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <InlineLabel size="sm">기간</InlineLabel>
            <PeriodSelector
              options={PERIOD_DAYS_PRESET}
              value={days}
              onChange={(v) => setDays(Number(v) || 90)}
              size="sm"
            />
            {/* 2026-08-29 · #165 A · SearchBar 프리미티브 */}
            <SearchBar
              value={q}
              onChange={setQ}
              placeholder="공급사·상품·코드 검색"
              resultCount={filtered.length}
              historyKey="megatown_returnConfirmed_search"
              accent="emerald"
            />
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-white border border-line text-[14px] font-bold text-ink-soft hover:bg-zinc-50 hover:border-brand-deep hover:text-brand-deep transition cursor-pointer disabled:opacity-40"
              title="새로고침"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> 새로고침
            </button>
          </div>
        </div>

        {/* 리스트 */}
        {loading && rows.length === 0 ? (
          <Card padding="none" className="flex items-center justify-center py-12">
            <Spinner size={16} tone="emerald" label="반품확정 로딩 중..." labelSize={15} />
          </Card>
        ) : error ? (
          <Card variant="flat" bg="bg-rose-50" borderColor="border-rose-200" padding="md" className="text-[15px] text-rose-700 font-semibold">
            ⚠ {error}
            <button onClick={load} className="ml-2 underline cursor-pointer">다시 시도</button>
          </Card>
        ) : filtered.length === 0 ? (
          <Card padding="none" className="py-12">
            <EmptyState
              icon={CheckCircle2}
              title={q ? "검색 결과 없음" : "반품확정 건 없음"}
              hint={q ? "다른 검색어로 시도하세요" : "반품필요 리스트에서 [반품확정] 버튼으로 이관하세요"}
              size="normal"
            />
          </Card>
        ) : (
          <TableListWrap>
            <table className="w-full border-collapse">
              <thead className={tableHeadCls()}>
                <tr>
                  <th className={tableThCls("center")} style={{ width: "10%" }}>확정일</th>
                  <th className={tableThCls("left")}   style={{ width: "16%" }}>공급사</th>
                  <th className={tableThCls("left")}   style={{ width: "30%" }}>상품명</th>
                  <th className={tableThCls("num")}    style={{ width: "8%" }}>수량</th>
                  <th className={tableThCls("num")}    style={{ width: "11%" }}>매입가</th>
                  <th className={tableThCls("num")}    style={{ width: "12%" }}>금액</th>
                  <th className={tableThCls("left")}   style={{ width: "8%" }}>사유</th>
                  <th className={tableThCls("center")} style={{ width: "5%" }}>액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map(r => {
                  const amount = (r.qty ?? 0) * (r.purchase_price ?? 0);
                  return (
                    <tr key={r.id} className="hover:bg-zinc-50/60 transition text-[14px]">
                      <td className={tableTdCls("center", "text-zinc-500 tabular-nums")}>{fmtDate(r.created_at)}</td>
                      <td className={tableTdCls("left", "font-semibold text-sky-700 break-keep")}>{r.supplier ?? <span className="text-zinc-400">-</span>}</td>
                      <td className={tableTdCls("left", "font-bold text-zinc-800 break-keep")}>
                        {r.product_name ?? "-"}
                        <div className="text-[12px] tabular-nums text-zinc-400 mt-0.5">{r.product_code}</div>
                      </td>
                      <td className={tableTdCls("num", "font-bold text-rose-600")}>{(r.qty ?? 0).toLocaleString()}</td>
                      <td className={tableTdCls("num", "text-zinc-600")}>{r.purchase_price ? r.purchase_price.toLocaleString() : "-"}</td>
                      <td className={tableTdCls("num", "font-bold text-emerald-700")}>{fmtWon(amount)}</td>
                      <td className={tableTdCls("left", "text-[13px] text-zinc-500")}>{r.reason ?? <span className="text-zinc-300">-</span>}</td>
                      <td className={tableTdCls("center")}>
                        <div className="inline-flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => revertOne(r)}
                            className="inline-flex w-7 h-7 items-center justify-center rounded-lg text-zinc-300 hover:text-amber-600 hover:bg-amber-50 transition cursor-pointer"
                            title="반품확정 해제 (반품필요로 복귀)"
                          >
                            <RotateCcw size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteOne(r)}
                            className="inline-flex w-7 h-7 items-center justify-center rounded-lg text-zinc-300 hover:text-rose-500 hover:bg-rose-50 transition cursor-pointer"
                            title="완전 삭제"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableListWrap>
        )}
      </div>
    </>
  );
};

export default ReturnConfirmedPanel;
