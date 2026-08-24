// src/components/OrderManagePage/OrderHistorySupplierModal.tsx
// 2026-08-23 · #182 · 발주요청 · 공급사 클릭 → 공급사별 발주이력 모달
//   · /api/order-history 재사용 (OrderHistoryTab 동일 데이터)
//   · 서버 필터 없음 · 클라이언트에서 supplier 매칭 (한글 초성 지원)
//   · 90일 기본 · 기간 선택 (7 · 30 · 90 · 180 · 365)

import React, { useEffect, useMemo, useState } from "react";
import { Package, Calendar, CalendarCheck, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { Modal } from "../common/Modal";
import { Spinner } from "../common/Spinner";
import { StatusPill } from "../common/StatusPill";
import { PeriodSelector } from "../common/PeriodSelector";
import { InlineLabel } from "../common/InlineLabel";
import { EmptyState } from "../common/EmptyState";
import { Card } from "../common/Card";
// 2026-08-24 · v3 리스트 UI 프레임워크 · 헬퍼
import { tableHeadCls, tableThCls, tableTdCls } from "../common";
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
// 2026-08-23 · #178 Phase F · 공급사 special_notes 경고 배너
import { useVendors } from "../../hooks/useVendors";
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
  order_number: string | number;
  sent_at: string;
  supplier: string;
  supplier_contact: string | null;
  supplier_email: string | null;
  supplier_phone: string | null;
  hope_arrival_date: string | null;
  total_amount: number;
  items: OrderHistoryItem[];
}

interface Props {
  supplier: string;
  onClose: () => void;
}

const fmtWon = (n: number) => n.toLocaleString() + "원";
const fmtDate = (iso: string): string => {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return "-";
  }
};

export const OrderHistorySupplierModal: React.FC<Props> = ({ supplier, onClose }) => {
  const { toast, showError } = useToast();
  const [orders, setOrders] = useState<OrderHistoryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(90);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // 2026-08-23 · #178 Phase F · 공급사 special_notes · 발주 특이사항 경고 배너
  const { vendors: allVendors } = useVendors();
  const matchedVendor = useMemo(() => {
    const target = String(supplier ?? "").trim().toLowerCase();
    if (!target) return null;
    return allVendors.find(v => {
      const name = String((v as { company_name?: string }).company_name ?? "").trim().toLowerCase();
      const displayName = String(displayVendorName(name) ?? "").toLowerCase();
      return name === target || displayName === target || name.includes(target) || target.includes(name);
    }) ?? null;
  }, [allVendors, supplier]);
  const specialNotes = String((matchedVendor as { special_notes?: string | null } | null)?.special_notes ?? "").trim();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get<{ orders?: OrderHistoryOrder[] }>(`/api/order-history?days=${days}`)
      .then(({ data }) => {
        if (!alive) return;
        setOrders(Array.isArray(data?.orders) ? data.orders : []);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const msg = e instanceof ApiError ? e.message : (e as any)?.message ?? "조회 실패";
        showError(`발주이력 조회 실패: ${msg}`);
        setOrders([]);
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [days, showError]);

  // 공급사 필터 · 서버가 필터 안 하므로 클라이언트 filter
  const filtered = useMemo(() => {
    const target = String(supplier ?? "").trim().toLowerCase();
    if (!target) return [];
    return orders.filter(o => String(displayVendorName(o.supplier ?? "")).toLowerCase().includes(target) || String(o.supplier ?? "").toLowerCase().includes(target));
  }, [orders, supplier]);

  const totalAmount = filtered.reduce((s, o) => s + (o.total_amount ?? 0), 0);
  const totalItems = filtered.reduce((s, o) => s + o.items.length, 0);

  const toggleOrder = (k: string) => setExpanded((prev) => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={
          <span className="flex items-center gap-2">
            <Package size={16} className="text-brand-deep" />
            <span>발주이력 · {displayVendorName(supplier) || supplier}</span>
            {!loading && filtered.length > 0 && (
              <StatusPill tone="brand" size="sm">{filtered.length}건</StatusPill>
            )}
          </span>
        }
        size="lg"
        headerRight={
          <div className="flex items-center gap-2 shrink-0">
            <InlineLabel size="sm">기간</InlineLabel>
            <PeriodSelector
              options={[
                { value: 30,  label: "30일",  title: "최근 30일" },
                { value: 90,  label: "90일",  title: "최근 90일" },
                { value: 180, label: "180일", title: "최근 180일" },
                { value: 365, label: "1년",   title: "최근 1년" },
              ]}
              value={days}
              onChange={(v) => setDays(v)}
              size="sm"
              ariaLabel="발주이력 조회기간"
            />
          </div>
        }
      >
        {/* 2026-08-23 · #178 Phase F · 발주 특이사항 경고 배너 · special_notes 있을 시 노출 */}
        {specialNotes && (
          <Card
            variant="flat"
            padding="md"
            rounded="lg"
            bg="bg-amber-50"
            borderColor="border-amber-200"
            className="mb-3 flex items-start gap-2"
          >
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-amber-800 leading-tight mb-1">발주 특이사항</div>
              <div className="text-[13px] text-amber-900 leading-relaxed whitespace-pre-wrap break-words">
                {specialNotes}
              </div>
            </div>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner label="불러오는 중..." size={20} tone="brand" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title="발주 이력 없음" hint={`최근 ${days}일 이내 · ${displayVendorName(supplier) || supplier} 공급사 발주 없음`} />
        ) : (
          <div className="flex flex-col gap-2">
            <div className="text-[14px] text-ink-soft font-medium tabular-nums">
              총 {filtered.length}회 발주 · {totalItems}종 상품 · <b className="text-brand-deep">{fmtWon(totalAmount)}</b>
            </div>
            <div className="divide-y divide-zinc-100 border border-line rounded-lg overflow-hidden bg-white">
              {filtered.map((o) => {
                const key = String(o.order_number ?? o.sent_at);
                const isOpen = expanded.has(key);
                return (
                  <div key={key} className="hover:bg-zinc-50/40 transition">
                    <button
                      type="button"
                      onClick={() => toggleOrder(key)}
                      className="w-full text-left flex items-center gap-2 px-3 py-2.5 cursor-pointer"
                    >
                      {isOpen ? <ChevronDown size={14} className="text-zinc-400 shrink-0" /> : <ChevronRight size={14} className="text-zinc-400 shrink-0" />}
                      <div className="flex-1 min-w-0 grid grid-cols-[auto_1fr_auto] gap-2 items-center">
                        <span className="text-[14px] font-semibold text-ink flex items-center gap-1">
                          <Calendar size={12} className="text-zinc-400" />
                          {fmtDate(o.sent_at)}
                        </span>
                        <span className="text-[13px] text-ink-soft">
                          {o.hope_arrival_date && (
                            <span className="inline-flex items-center gap-1 text-[13px] text-emerald-700">
                              <CalendarCheck size={12} />희망입고 {fmtDate(o.hope_arrival_date)}
                            </span>
                          )}
                        </span>
                        <span className="text-[14px] font-bold text-brand-deep tabular-nums">
                          {o.items.length}종 · {fmtWon(o.total_amount)}
                        </span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3">
                        {/* 2026-08-24 · v3 · 헬퍼 · 줄바꿈 우선 */}
                        <table className="w-full text-[14px]">
                          <thead className={tableHeadCls()}>
                            <tr>
                              <th className={tableThCls("left", "min-w-[200px]")}>상품</th>
                              <th className={tableThCls("num", "w-20 bg-sky-50/60")}>수량</th>
                              <th className={tableThCls("num", "w-24")}>단가</th>
                              <th className={tableThCls("num", "w-24 bg-brand-tint/50")}>금액</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-50">
                            {o.items.map((it, i) => (
                              <tr key={`${key}-${it.product_code}-${i}`} className="hover:bg-sky-50/30">
                                <td className={tableTdCls("left", "text-ink whitespace-normal break-words")}>{it.product_name}</td>
                                <td className={tableTdCls("num", "text-ink font-bold bg-sky-50/60")}>{it.order_qty}</td>
                                <td className={tableTdCls("num", "text-ink-soft")}>{fmtWon(it.unit_price)}</td>
                                <td className={tableTdCls("num", "font-bold text-brand-deep bg-brand-tint/50")}>{fmtWon(it.line_amount)}</td>
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
          </div>
        )}
      </Modal>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
    </>
  );
};

export default OrderHistorySupplierModal;
