// src/components/LandingPage/VendorOrderHistorySection.tsx
// 2026-09-13 · #112 · VendorDetailModal · info 뷰 하단 · 발주이력 컴팩트 섹션 통합
//   · 공급사별 발주이력 · GET /api/order-history?supplier=X&days=180
//   · 최근 5건 · order_number · 발주일 · 상품수 · 금액 · 상태 (ordered/matched)

import React, { useEffect, useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";
import { api } from "../../lib/apiClient";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";

interface OrderHistoryItem {
  order_number: string | null;
  order_date: string | null;
  sent_at: string | null;
  supplier: string;
  total_qty: number;
  total_amount: number;
  status?: "ordered" | "matched";
  items: Array<{ product_name: string; order_qty: number }>;
}

interface Props {
  supplierName: string;
}

const fmtWon = (n: number): string => `₩${Number(n ?? 0).toLocaleString()}`;

export const VendorOrderHistorySection: React.FC<Props> = ({ supplierName }) => {
  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ orders?: OrderHistoryItem[] }>(
        `/api/order-history?days=365&supplier=${encodeURIComponent(supplierName)}`,
      );
      setOrders(Array.isArray(data?.orders) ? data.orders : []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [supplierName]);

  useEffect(() => { void load(); }, [load]);

  const visible = expanded ? orders : orders.slice(0, 5);

  return (
    <section className="mt-4 pt-4 border-t border-line/60">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ClipboardList size={14} className="text-brand-deep" />
          <span className="text-[16px] font-bold text-ink">발주이력</span>
          <span className="text-[13px] tabular-nums text-zinc-400 font-medium">
            {orders.length}건 (최근 1년)
          </span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all duration-150 cursor-pointer"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading && orders.length === 0 ? (
        <div className="flex items-center justify-center py-4">
          <Spinner tone="zinc" label="발주이력 로딩..." labelSize={12} />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-[13px] text-zinc-400 text-center py-4 bg-zinc-50/60 rounded-lg">
          발주이력 없음
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {visible.map((o) => {
            const tone = o.status === "matched" ? "emerald" : "sky";
            return (
              <div
                key={String(o.order_number ?? o.sent_at)}
                className="flex items-center gap-2 flex-wrap px-3 py-2 rounded-lg border border-zinc-100 bg-white hover:border-zinc-200 hover:bg-zinc-50/40 transition-all"
              >
                <span className="text-[13px] font-bold text-sky-700 tabular-nums shrink-0">
                  #{o.order_number ?? "—"}
                </span>
                <span className="text-[12px] text-zinc-500 tabular-nums shrink-0">
                  {o.order_date ?? o.sent_at?.slice(0, 10) ?? "-"}
                </span>
                <span className="text-[12px] text-zinc-500 shrink-0">
                  {o.items?.length ?? 0}종 · {o.total_qty}개
                </span>
                <span className="ml-auto text-[14px] font-bold text-emerald-700 tabular-nums shrink-0">
                  {fmtWon(o.total_amount)}
                </span>
                <StatusPill tone={tone} size="sm" dot>
                  {o.status === "matched" ? "매입확인" : "발주완료"}
                </StatusPill>
              </div>
            );
          })}
          {orders.length > 5 && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="mt-1 text-[12px] font-semibold text-brand-deep hover:underline cursor-pointer text-center py-1"
            >
              {expanded ? `접기` : `더 보기 (${orders.length - 5}건)`}
            </button>
          )}
        </div>
      )}
    </section>
  );
};

export default VendorOrderHistorySection;
