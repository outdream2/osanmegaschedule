// 2026-08-10 · #16 · 발주이력 탭 · status='ordered' · order_number GROUP
// 마이그레이션 add_order_dispatch_columns_2026-08-10.sql 실행 후 실제 데이터 노출
// 컬럼 없으면 · 서버가 empty + notice 반환 · UI 는 안내 메시지 표시

import React, { useEffect, useState } from "react";
import { Package, Loader2, ChevronDown, ChevronRight, Mail, Phone, User, Calendar } from "lucide-react";
import { displayVendorName } from "../../utils/vendorNameNormalize";

interface OrderHistoryItem {
  id: string | number;
  product_code: string;
  product_name: string;
  order_qty: number;
  unit_price: number;
  line_amount: number;
  current_stock: number | null;
  optimal_stock: number | null;
}

interface OrderHistoryOrder {
  order_number: string | null;
  order_date: string | null;
  desired_arrival: string | null;
  supplier: string;
  supplier_contact: string | null;
  supplier_email: string | null;
  supplier_phone: string | null;
  memo: string | null;
  sent_at: string;
  items: OrderHistoryItem[];
  total_qty: number;
  total_amount: number;
}

export const OrderHistoryTab: React.FC = () => {
  const [orders, setOrders] = useState<OrderHistoryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [days, setDays] = useState(90);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    setNotice(null);
    fetch(`/api/order-history?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        setOrders(Array.isArray(d?.orders) ? d.orders : []);
        if (d?.notice) setNotice(String(d.notice));
      })
      .catch((e: Error) => setError(e?.message ?? "조회 실패"))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (k: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const fmtWon = (n: number) => n.toLocaleString() + "원";
  const totalAmount = orders.reduce((s, o) => s + (o.total_amount ?? 0), 0);
  const totalItems = orders.reduce((s, o) => s + o.items.length, 0);

  return (
    <div className="flex flex-col gap-2">
      {/* 상단 툴바 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Package size={14} className="text-indigo-500" />
          <span className="text-[13px] font-black text-slate-800">발주이력</span>
          <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5 border border-indigo-200 tabular-nums">
            {orders.length}건 · {totalItems}상품 · {fmtWon(totalAmount)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[11px] font-semibold text-slate-500">기간</span>
          {[7, 30, 90, 180, 365].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`h-7 px-2.5 text-[11px] font-semibold rounded transition cursor-pointer ${
                days === d
                  ? "bg-indigo-500 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-slate-200"
              }`}
            >
              {d}일
            </button>
          ))}
        </div>
      </div>

      {/* 마이그레이션 안내 */}
      {notice && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-[12px] text-amber-800">
          <div className="font-black mb-0.5">📌 마이그레이션 필요</div>
          <div className="font-mono text-[11px]">{notice}</div>
          <div className="text-[11px] mt-1">Supabase SQL Editor 에서 실행 후 · 발주 완료 시 자동 저장 시작</div>
        </div>
      )}

      {/* 리스트 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
            <Loader2 size={16} className="animate-spin" />
            불러오는 중...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 text-sm font-bold">⚠ {error}</div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">발주 이력 없음 · 발주 완료 시 여기에 표시</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {orders.map((o) => {
              const key = String(o.order_number ?? o.sent_at);
              const isOpen = expanded.has(key);
              return (
                <div key={key} className="hover:bg-slate-50/40 transition">
                  {/* 헤더 · 클릭 확장 */}
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 cursor-pointer text-left"
                  >
                    {isOpen ? (
                      <ChevronDown size={14} className="text-indigo-400 shrink-0" />
                    ) : (
                      <ChevronRight size={14} className="text-slate-300 shrink-0" />
                    )}
                    <span className="text-[12px] font-mono font-black text-indigo-700 tabular-nums shrink-0">
                      #{o.order_number ?? "—"}
                    </span>
                    <span className="text-[13px] font-black text-slate-800 truncate">
                      {displayVendorName(o.supplier) || o.supplier || "(공급사 미지정)"}
                    </span>
                    <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                      {o.items.length}상품 · {o.total_qty}개
                    </span>
                    <span className="ml-auto text-[12px] font-black text-emerald-700 tabular-nums shrink-0">
                      {fmtWon(o.total_amount)}
                    </span>
                    <span className="text-[11px] text-slate-400 tabular-nums shrink-0 min-w-[80px] text-right">
                      {o.sent_at?.slice(0, 10) ?? "-"}
                    </span>
                  </button>

                  {/* 확장 내용 · 아이템 리스트 + 수신처 */}
                  {isOpen && (
                    <div className="px-4 pb-3 space-y-2">
                      {/* 수신처 정보 */}
                      <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-500 bg-slate-50/60 border border-slate-100 rounded-lg px-3 py-1.5">
                        {o.supplier_contact && (
                          <span className="inline-flex items-center gap-1"><User size={11} />{o.supplier_contact}</span>
                        )}
                        {o.supplier_email && (
                          <span className="inline-flex items-center gap-1"><Mail size={11} />{o.supplier_email}</span>
                        )}
                        {o.supplier_phone && (
                          <span className="inline-flex items-center gap-1 tabular-nums"><Phone size={11} />{o.supplier_phone}</span>
                        )}
                        {o.order_date && (
                          <span className="inline-flex items-center gap-1 tabular-nums"><Calendar size={11} />발주 {o.order_date}</span>
                        )}
                        {o.desired_arrival && (
                          <span className="inline-flex items-center gap-1 tabular-nums text-rose-600"><Calendar size={11} />희망 입고 {o.desired_arrival}</span>
                        )}
                        {o.memo && (
                          <span className="italic text-slate-600 border-l border-slate-200 pl-2">{o.memo}</span>
                        )}
                      </div>
                      {/* 아이템 테이블 */}
                      <table className="w-full text-[11px] tabular-nums">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 font-black uppercase tracking-wide text-[10px] border-b border-slate-200">
                            <th className="text-center px-2 py-1.5 w-8">#</th>
                            <th className="text-left px-3 py-1.5 w-24">코드</th>
                            <th className="text-left px-3 py-1.5">상품명</th>
                            <th className="text-right px-3 py-1.5 w-16">수량</th>
                            <th className="text-right px-3 py-1.5 w-20">단가</th>
                            <th className="text-right px-3 py-1.5 w-24">금액</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {o.items.map((it, i) => (
                            <tr key={it.id} className="hover:bg-indigo-50/30">
                              <td className="text-center px-2 py-1 text-slate-400">{i + 1}</td>
                              <td className="px-3 py-1 font-mono text-slate-500">{it.product_code}</td>
                              <td className="px-3 py-1 text-slate-800 font-semibold truncate max-w-[280px]">{it.product_name}</td>
                              <td className="text-right px-3 py-1 font-black text-rose-600">{it.order_qty}</td>
                              <td className="text-right px-3 py-1 text-slate-600">{it.unit_price > 0 ? fmtWon(it.unit_price) : "-"}</td>
                              <td className="text-right px-3 py-1 font-black text-emerald-700">{it.line_amount > 0 ? fmtWon(it.line_amount) : "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderHistoryTab;
