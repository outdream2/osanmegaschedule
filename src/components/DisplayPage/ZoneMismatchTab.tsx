// src/components/DisplayPage/ZoneMismatchTab.tsx
// 2026-08-25 · 사용자 지시 · 매장구역 안 배치구역 불일치 탭 (RequestsPage 에서 이관)
//   · /api/zone-mismatches · GET · DELETE
//   · 상품별 · 전산 spec_zone vs 실제 real_zone · 불일치 목록

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { api, ApiError } from "../../lib/apiClient";
import { Card } from "../common/Card";
import { EmptyState } from "../common/EmptyState";
import { Spinner } from "../common/Spinner";
import { TableListWrap, tableHeadCls, tableThCls, tableTdCls } from "../common/TableList";
import { useToast, toastClass } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";

interface ZoneMismatch {
  id: string;
  product_code: string;
  product_name: string;
  spec_zone: string;
  real_zone: string;
  registered_at: string;
}

function fmtDate(s: string): string {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const ZoneMismatchTab: React.FC = () => {
  const [rows, setRows] = useState<ZoneMismatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast, showError, showSuccess } = useToast();
  const confirm = useConfirm();

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    api.get<{ rows?: ZoneMismatch[] } | ZoneMismatch[]>("/api/zone-mismatches")
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : (data?.rows ?? []);
        setRows(list);
      })
      .catch((e: unknown) => {
        const msg = e instanceof ApiError ? e.message : (e as any)?.message ?? "네트워크 오류";
        setError(msg);
        showError(`배치구역 불일치 조회 실패: ${msg}`);
      })
      .finally(() => setLoading(false));
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const deleteOne = async (id: string) => {
    const target = rows.find(r => r.id === id);
    const label = target ? target.product_name : `#${id}`;
    if (!await confirm({ message: `${label} · 배치구역 불일치 기록 삭제?`, danger: true })) return;
    try {
      await api.del(`/api/zone-mismatches/${id}`);
      setRows(prev => prev.filter(r => r.id !== id));
      showSuccess("삭제되었습니다");
    } catch (e: any) {
      showError(`삭제 실패: ${e?.message ?? "네트워크 오류"}`);
    }
  };

  const deleteAll = async () => {
    if (rows.length === 0) return;
    if (!await confirm({ message: `전체 ${rows.length}건 삭제할까요?`, danger: true })) return;
    try {
      await Promise.all(rows.map(r => api.del(`/api/zone-mismatches/${r.id}`)));
      setRows([]);
      showSuccess(`${rows.length}건 삭제되었습니다`);
    } catch (e: any) {
      showError(`일괄 삭제 실패: ${e?.message ?? "네트워크 오류"}`);
      load();
    }
  };

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => (b.registered_at ?? "").localeCompare(a.registered_at ?? ""));
  }, [rows]);

  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
      <div className="flex flex-col gap-3">
        {/* 헤더 툴바 */}
        <div className="flex items-center gap-2 flex-wrap px-1">
          <AlertTriangle size={18} className="text-rose-500 shrink-0" />
          <span className="text-[17px] font-bold text-ink tracking-tight">배치구역 불일치</span>
          <span className="text-[15px] tabular-nums font-semibold text-ink-soft">
            {loading ? <Spinner size={12} tone="rose" className="inline" /> : `${rows.length}건`}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-white border border-line text-[13px] font-bold text-ink-soft hover:bg-zinc-50 hover:border-brand-deep hover:text-brand-deep transition cursor-pointer disabled:opacity-40"
              title="새로고침"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> 새로고침
            </button>
            {rows.length > 0 && (
              <button
                type="button"
                onClick={deleteAll}
                disabled={loading}
                className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-rose-500 text-white text-[13px] font-bold hover:bg-rose-600 shadow-sm transition cursor-pointer disabled:opacity-40"
                title="전체 삭제"
              >
                <Trash2 size={12} /> 전체 삭제
              </button>
            )}
          </div>
        </div>

        {/* 리스트 */}
        {loading && rows.length === 0 ? (
          <Card padding="none" className="flex items-center justify-center py-12">
            <Spinner size={16} tone="rose" label="배치구역 불일치 로딩 중..." labelSize={14} />
          </Card>
        ) : error ? (
          <Card variant="flat" bg="bg-rose-50" borderColor="border-rose-200" padding="md" className="text-[14px] text-rose-700 font-semibold">
            ⚠ {error}
            <button onClick={load} className="ml-2 underline cursor-pointer">다시 시도</button>
          </Card>
        ) : rows.length === 0 ? (
          <Card padding="none" className="py-12">
            <EmptyState
              icon={AlertTriangle}
              title="배치구역 불일치 없음"
              hint="전산 구역과 실제 배치가 모두 일치합니다"
              size="normal"
            />
          </Card>
        ) : (
          <TableListWrap>
            <table className="w-full border-collapse">
              <thead className={tableHeadCls()}>
                <tr>
                  <th className={tableThCls("left")} style={{ width: "34%" }}>상품명</th>
                  <th className={tableThCls("left")} style={{ width: "18%" }}>상품코드</th>
                  <th className={tableThCls("center")} style={{ width: "14%" }}>전산 구역</th>
                  <th className={tableThCls("center")} style={{ width: "14%" }}>실제 구역</th>
                  <th className={tableThCls("center")} style={{ width: "12%" }}>등록일</th>
                  <th className={tableThCls("center")} style={{ width: "8%" }}>삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {sorted.map(m => (
                  <tr key={m.id} className="hover:bg-zinc-50/60 transition text-[14px]">
                    <td className={tableTdCls("left", "font-bold text-zinc-800 break-keep")}>{m.product_name}</td>
                    <td className={tableTdCls("left", "font-mono text-[13px] text-zinc-500")}>{m.product_code}</td>
                    <td className={tableTdCls("center", "font-semibold text-zinc-700")}>{m.spec_zone || <span className="text-zinc-400">미지정</span>}</td>
                    <td className={tableTdCls("center", "font-bold text-rose-600")}>{m.real_zone}</td>
                    <td className={tableTdCls("center", "text-[13px] text-zinc-500 tabular-nums")}>{fmtDate(m.registered_at)}</td>
                    <td className={tableTdCls("center")}>
                      <button
                        type="button"
                        onClick={() => deleteOne(m.id)}
                        className="inline-flex w-7 h-7 items-center justify-center rounded-lg text-zinc-300 hover:text-rose-500 hover:bg-rose-50 transition cursor-pointer"
                        title="삭제"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableListWrap>
        )}
      </div>
    </>
  );
};

export default ZoneMismatchTab;
