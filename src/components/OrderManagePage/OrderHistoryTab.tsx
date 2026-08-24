// 2026-08-10 · #16 · 발주이력 탭 · status='ordered' · order_number GROUP
// 마이그레이션 add_order_dispatch_columns_2026-08-10.sql 실행 후 실제 데이터 노출
// 컬럼 없으면 · 서버가 empty + notice 반환 · UI 는 안내 메시지 표시
// 2026-08-12 · UI 리디자인 · 폰트 +2 · 굵기 완화 · 발주일·희망입고일 · 헤더 · 상품수 옆

import React, { useEffect, useState } from "react";
import { Package, ChevronDown, ChevronRight, Mail, Phone, User, Calendar, CalendarCheck } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { displayVendorName } from "../../utils/vendorNameNormalize";
import { PageToolbar } from "../common/PageToolbar";
// 2026-08-23 · #180 · 공급사·상품 검색 SearchBar
import { SearchBar } from "../common/SearchBar";
import { AccentBar } from "../common/AccentBar";
import { InlineLabel } from "../common/InlineLabel";
import { PeriodSelector, PERIOD_DAYS_PRESET } from "../common/PeriodSelector";
import { StatusPill } from "../common/StatusPill";
import { Card } from "../common/Card";
// 2026-08-24 · v3 리스트 UI 프레임워크 · 사용자 지시
import { tableHeadCls, tableThCls, tableTdCls } from "../common";
// 2026-08-21 · Framework Phase 3 · fetch → apiClient
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";

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
  const { toast, showError } = useToast();
  const [orders, setOrders] = useState<OrderHistoryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [days, setDays] = useState(90);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // 2026-08-23 · #180 · A안 · 공급사·상품 별도 검색창 2개 · 클라 filter (AND)
  const [supplierSearch, setSupplierSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    setNotice(null);
    // 2026-08-21 · Framework Phase 3 · fetch → apiClient
    api.get<{ orders?: OrderHistoryOrder[]; notice?: string }>(`/api/order-history?days=${days}`)
      .then(({ data }) => {
        setOrders(Array.isArray(data?.orders) ? data.orders : []);
        if (data?.notice) setNotice(String(data.notice));
      })
      .catch((e: unknown) => {
        const msg = e instanceof ApiError ? e.message : (e as any)?.message ?? "조회 실패";
        setError(msg);
        showError(`발주이력 조회 실패: ${msg}`);
      })
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
  // 2026-08-23 · #180 · A안 · 공급사·상품 별도 필터 (AND 조건 · 각 검색어 입력 시 교집합)
  const filteredOrders = React.useMemo(() => {
    const qS = supplierSearch.trim().toLowerCase();
    const qP = productSearch.trim().toLowerCase();
    if (!qS && !qP) return orders;
    return orders.filter(o => {
      const supplierMatch = !qS || String(displayVendorName(o.supplier ?? "")).toLowerCase().includes(qS);
      const productMatch = !qP || o.items.some(it => String(it.product_name ?? "").toLowerCase().includes(qP));
      return supplierMatch && productMatch;
    });
  }, [orders, supplierSearch, productSearch]);
  const totalAmount = filteredOrders.reduce((s, o) => s + (o.total_amount ?? 0), 0);
  const totalItems = filteredOrders.reduce((s, o) => s + o.items.length, 0);

  return (
    <>
    {toast && (
      <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
    )}
    <div className="flex flex-col gap-2">
      {/* 상단 툴바 · 2026-08-17 · PageToolbar 프레임워크 · PeriodSelector 공통 · 조회기간 통일 */}
      <PageToolbar
        icon={<Package size={18} strokeWidth={2.2} />}
        title="발주이력"
        count={filteredOrders.length}
        leftSlot={
          <span className="text-[13px] font-medium text-ink-soft tracking-tight tabular-nums">
            {totalItems}종 · {fmtWon(totalAmount)}
          </span>
        }
        right={
          <div className="flex items-center gap-2">
            <InlineLabel size="sm">기간</InlineLabel>
            <PeriodSelector
              options={[
                { value: 7,   label: "7일",   title: "최근 7일" },
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
      />

      {/* 2026-08-23 · #180 · A안 · 공급사·상품 별도 검색창 2개 · AND filter */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <SearchBar
          value={supplierSearch}
          onChange={setSupplierSearch}
          placeholder="공급사 검색"
        />
        <SearchBar
          value={productSearch}
          onChange={setProductSearch}
          placeholder="상품명 검색"
        />
      </div>

      {/* 마이그레이션 안내 · 폰트 +2 */}
      {notice && (
        <Card variant="flat" bg="bg-amber-50" borderColor="border-amber-200" padding="sm" className="text-[14px] text-amber-800">
          <div className="font-bold mb-0.5">📌 마이그레이션 필요</div>
          <div className="font-mono text-[13px]">{notice}</div>
          <div className="text-[13px] mt-1">Supabase SQL Editor 에서 실행 후 · 발주 완료 시 자동 저장 시작</div>
        </Card>
      )}

      {/* 리스트 · 2026-08-24 · v3 리스트 프레임워크 · 상단 gradient accent */}
      <Card clip padding="none" className="relative">
        <span aria-hidden className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep opacity-90 z-20 rounded-t-md" />
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size={16} tone="zinc" label="불러오는 중..." labelSize={15} />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 text-[15px] font-bold">⚠ {error}</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-zinc-400 text-[15px]">
            {(supplierSearch.trim() || productSearch.trim()) ? "검색 결과 없음 · 다른 검색어로 시도하세요" : "발주 이력 없음 · 발주 완료 시 여기에 표시"}
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {filteredOrders.map((o) => {
              const key = String(o.order_number ?? o.sent_at);
              const isOpen = expanded.has(key);
              return (
                <div key={key} className="hover:bg-zinc-50/40 transition">
                  {/* 헤더 · 클릭 확장 · 폰트 +2 · 발주일·희망입고일 헤더로 이동 · 상품수 옆 · 굵기 완화 */}
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    className="w-full flex items-center gap-2.5 px-4 py-3 cursor-pointer text-left flex-wrap"
                  >
                    {isOpen ? (
                      <ChevronDown size={16} className="text-indigo-400 shrink-0" />
                    ) : (
                      <ChevronRight size={16} className="text-zinc-300 shrink-0" />
                    )}
                    {/* 발주번호 */}
                    <span className="text-[14px] font-mono font-bold text-sky-700 tabular-nums shrink-0">
                      #{o.order_number ?? "—"}
                    </span>
                    {/* 공급사 · 2026-08-24 · v3 · sky-800 톤 통일 · truncate 제거 */}
                    <span className="text-[15px] font-bold text-sky-800 whitespace-normal break-words">
                      {displayVendorName(o.supplier) || o.supplier || "(공급사 미지정)"}
                    </span>
                    {/* 상품 종·수량 · 2026-08-17 · StatusPill 통일 */}
                    <StatusPill tone="zinc" size="sm">{o.items.length}종 · {o.total_qty}개</StatusPill>
                    {/* 2026-08-12 · 발주일 · 헤더로 이동 · 상품수 옆 */}
                    {o.order_date && (
                      <span className="inline-flex items-center gap-1 text-[13px] font-medium text-zinc-500 tabular-nums shrink-0">
                        <Calendar size={13} className="text-zinc-400" />발주 {o.order_date}
                      </span>
                    )}
                    {/* 2026-08-12 · 희망입고일 · 헤더로 이동 · 상품수 옆 */}
                    {o.desired_arrival && (
                      <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-rose-600 tabular-nums shrink-0">
                        <CalendarCheck size={13} />희망 {o.desired_arrival}
                      </span>
                    )}
                    {/* 총액 · 오른쪽 */}
                    <span className="ml-auto text-[15px] font-bold text-emerald-700 tabular-nums shrink-0">
                      {fmtWon(o.total_amount)}
                    </span>
                    {/* 발송 시각 */}
                    <span className="text-[13px] text-zinc-400 tabular-nums shrink-0 min-w-[90px] text-right">
                      {o.sent_at?.slice(0, 10) ?? "-"}
                    </span>
                  </button>

                  {/* 확장 내용 · 아이템 리스트 + 수신처 · 폰트 +2 */}
                  {isOpen && (
                    <div className="px-4 pb-3 space-y-2">
                      {/* 수신처 정보 · 발주일·희망입고일 은 헤더로 이동했으므로 · 여기서는 담당자·연락처·메모만 */}
                      <div className="flex items-center gap-3 flex-wrap text-[13px] text-zinc-500 bg-zinc-50/60 border border-zinc-100 rounded-lg px-3 py-2">
                        {o.supplier_contact && (
                          <span className="inline-flex items-center gap-1"><User size={13} />{o.supplier_contact}</span>
                        )}
                        {o.supplier_email && (
                          <span className="inline-flex items-center gap-1"><Mail size={13} />{o.supplier_email}</span>
                        )}
                        {o.supplier_phone && (
                          <span className="inline-flex items-center gap-1 tabular-nums"><Phone size={13} />{o.supplier_phone}</span>
                        )}
                        {o.memo && (
                          <span className="italic text-zinc-600 border-l border-line pl-2">{o.memo}</span>
                        )}
                        {!o.supplier_contact && !o.supplier_email && !o.supplier_phone && !o.memo && (
                          <span className="text-zinc-300">수신처·메모 정보 없음</span>
                        )}
                      </div>
                      {/* 아이템 테이블 · 2026-08-24 · v3 · 헬퍼 · 줄바꿈 우선 */}
                      <table className="w-full text-[14px] tabular-nums">
                        <thead className={tableHeadCls()}>
                          <tr>
                            <th className={tableThCls("center", "w-8")}>#</th>
                            <th className={tableThCls("left", "w-28")}>코드</th>
                            <th className={tableThCls("left", "min-w-[220px]")}>상품명</th>
                            <th className={tableThCls("num", "w-16 bg-sky-50/60")}>수량</th>
                            <th className={tableThCls("num", "w-24")}>단가</th>
                            <th className={tableThCls("num", "w-28 bg-brand-tint/50")}>금액</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {o.items.map((it, i) => (
                            <tr key={it.id} className="hover:bg-sky-50/30">
                              <td className={tableTdCls("center", "text-zinc-400")}>{i + 1}</td>
                              <td className={tableTdCls("left", "font-mono text-zinc-500")}>{it.product_code}</td>
                              <td className={tableTdCls("left", "text-zinc-800 font-semibold whitespace-normal break-words")}>{it.product_name}</td>
                              <td className={tableTdCls("num", "font-bold text-rose-600 bg-sky-50/60")}>{it.order_qty}</td>
                              <td className={tableTdCls("num", "text-zinc-600")}>{it.unit_price > 0 ? fmtWon(it.unit_price) : "-"}</td>
                              <td className={tableTdCls("num", "font-bold text-emerald-700 bg-brand-tint/50")}>{it.line_amount > 0 ? fmtWon(it.line_amount) : "-"}</td>
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
      </Card>
    </div>
    </>
  );
};

export default OrderHistoryTab;
