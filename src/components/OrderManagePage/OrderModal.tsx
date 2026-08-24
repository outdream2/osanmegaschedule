// src/components/OrderManagePage/OrderModal.tsx
// 2026-08-22 · Framework Phase 4 · 발주서 모달 분리
// 2026-08-23 · Modal primitive 마이그레이션 (#191)
import React from "react";
import { ShoppingCart, MessageSquare, Mail } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { Modal } from "../common/Modal";
import { Card } from "../common/Card";
// 2026-08-24 · v3 리스트 UI 프레임워크
import { tableHeadCls, tableThCls } from "../common";

export interface OrderModalItem {
  order_request_id: string;
  product_code: string;
  product_name: string;
  current_stock: number | null;
  optimal_stock: number | null;
  warehouse_stock?: number | null;
  store_stock?: number | null;
  order_qty: number;
  unit_price?: number | null;
  prev_unit_price?: number | null;
  memo?: string;
}
export interface OrderModalSupplier {
  supplier: string;
  order_number: string;
  supplier_contact?: string | null;
  supplier_email?: string | null;
  supplier_phone?: string | null;
  memo?: string;
  balance?: number | null;
  ocr_balance?: number | null;
  ocr_statements?: Array<{
    id: string | number;
    saved_at: string;
    supplier: string;
    total_amount: number | null;
    balance: number | null;
  }>;
  ocr_loading?: boolean;
  items: OrderModalItem[];
}
export interface OrderModalState {
  orderNumber: string;
  orderDate: string;
  desiredArrival: string;
  memo: string;
  channels: { email: boolean; sms: boolean; kakao: boolean };
  suppliers: OrderModalSupplier[];
}

interface OrderModalProps {
  orderModal: OrderModalState;
  sendingBulk: boolean;
  notifyLogisticsLeader: boolean;
  setNotifyLogisticsLeader: (v: boolean) => void;
  onClose: () => void;
  onSubmit: () => void;
  onUpdateModalItem: (supIdx: number, itemIdx: number, patch: Partial<OrderModalItem>) => void;
  onDateChange: (field: "orderDate" | "desiredArrival", value: string) => void;
  onChannelChange: (ch: "email" | "sms" | "kakao", value: boolean) => void;
}

export const OrderModal: React.FC<OrderModalProps> = ({
  orderModal,
  sendingBulk,
  notifyLogisticsLeader,
  setNotifyLogisticsLeader,
  onClose,
  onSubmit,
  onUpdateModalItem,
  onDateChange,
  onChannelChange,
}) => (
  <Modal
    open
    onClose={() => !sendingBulk && onClose()}
    size="lg"
    closeOnBackdrop={!sendingBulk}
    closeOnEsc={!sendingBulk}
    showClose={false}
    titleAccent
    icon={
      <div className="w-10 h-10 rounded-xl bg-brand-deep flex items-center justify-center shadow-sm shrink-0">
        <ShoppingCart size={18} className="text-white" />
      </div>
    }
    title={
      <div className="min-w-0">
        <div className="text-[17px] font-bold text-ink tracking-tight flex items-center gap-1.5 flex-wrap">
          발주서 {orderModal.suppliers.length > 1 && <span className="text-[13px] font-semibold text-ink-soft">· 공급사별 {orderModal.suppliers.length}건 개별 발주</span>}
        </div>
        <div className="text-[13px] font-mono text-ink-soft mt-0.5 truncate">
          {orderModal.suppliers.length > 1 ? "일괄 발송 · 각 공급사별 고유 번호" : `#${orderModal.suppliers[0]?.order_number ?? orderModal.orderNumber}`}
        </div>
      </div>
    }
    headerRight={
      <button
        onClick={() => !sendingBulk && onClose()}
        disabled={sendingBulk}
        className="w-9 h-9 rounded-lg bg-white border border-line hover:border-brand-deep hover:bg-brand-tint flex items-center justify-center text-ink-soft hover:text-brand-deep cursor-pointer disabled:opacity-40 shrink-0 transition-colors"
        aria-label="닫기"
        title="닫기 (ESC)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    }
    className="overflow-y-auto"
  >
    <div className="flex flex-col overflow-hidden">
      {/* 발주 기본 정보 */}
      <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/50 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[15px]">
        <div>
          <label className="text-zinc-500 font-bold block mb-1">발주일자</label>
          <input type="date" value={orderModal.orderDate} onChange={e => onDateChange("orderDate", e.target.value)}
            className="w-full border border-line rounded px-2 py-1 focus:outline-none focus:border-brand-deep font-mono"/>
        </div>
        <div>
          <label className="text-zinc-500 font-bold block mb-1">희망 입고일</label>
          <input type="date" value={orderModal.desiredArrival} onChange={e => onDateChange("desiredArrival", e.target.value)}
            className="w-full border border-line rounded px-2 py-1 focus:outline-none focus:border-brand-deep font-mono"/>
        </div>
        <div className="col-span-2">
          <label className="text-zinc-500 font-bold block mb-1">수신처</label>
          <div className="border border-line rounded px-2 py-1 bg-white text-zinc-700 font-semibold">🏪 오산 메가타운 약국</div>
        </div>
      </div>

      {/* 발주 아이템 테이블 */}
      <div className="flex-1 overflow-y-auto max-h-[45vh] px-6 py-4 bg-zinc-50/30">
        <Card clip padding="none" className="relative">
          {/* 2026-08-24 · v3 · 상단 gradient accent */}
          <span aria-hidden className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep opacity-90 z-30 rounded-t-md" />
          <table className="w-full text-[17px]">
            {/* 2026-08-24 · v3 · tableHeadCls 헬퍼 */}
            <thead className={tableHeadCls()}>
              <tr>
                <th className={tableThCls("center", "w-8")}>#</th>
                <th className={tableThCls("left", "w-56")}>상품</th>
                <th className={tableThCls("num", "w-20 bg-sky-50/60")}>발주수량</th>
                <th className={tableThCls("num", "w-24")}><div className="leading-tight">이전<br/>사입가</div></th>
                <th className={tableThCls("num", "w-28 bg-brand-tint/50")}>금액</th>
                <th className={tableThCls("left")}>비고 (메모)</th>
              </tr>
            </thead>
            <tbody>
              {orderModal.suppliers.map((s, sIdx) => {
                const totalQty = s.items.reduce((n, it) => n + it.order_qty, 0);
                const totalAmount = s.items.reduce((n, it) => n + (it.order_qty * (it.unit_price ?? 0)), 0);
                return (
                  <React.Fragment key={`${s.supplier}-${sIdx}`}>
                    <tr className="bg-sky-50 border-y border-sky-200">
                      <td colSpan={6} className="px-3 py-2">
                        <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
                          <span className="text-[15px] font-bold text-sky-600 bg-white border border-sky-200 rounded-full px-2 py-0.5 shrink-0">공급사</span>
                          <span className="text-[16px] font-bold text-zinc-900">{s.supplier}</span>
                          <span className="text-[15px] font-mono text-indigo-600 bg-white border border-indigo-200 rounded px-1.5 py-0.5 shrink-0">#{s.order_number}</span>
                          {s.supplier_contact && (
                            <span className="text-[15px] font-semibold text-zinc-700">👤 {s.supplier_contact}</span>
                          )}
                          {s.supplier_phone && (
                            <a href={`tel:${String(s.supplier_phone).replace(/[^0-9+]/g, "")}`} className="text-[15px] font-semibold text-zinc-700 tabular-nums hover:text-emerald-700 hover:underline inline-flex items-center gap-1">
                              <MessageSquare size={12}/>{s.supplier_phone}
                            </a>
                          )}
                          {s.supplier_email && (
                            <a href={`mailto:${s.supplier_email}`} className="text-[15px] font-semibold text-zinc-700 hover:text-emerald-700 hover:underline inline-flex items-center gap-1">
                              <Mail size={12}/>{s.supplier_email}
                            </a>
                          )}
                          <span className="ml-auto text-[15px] font-bold text-zinc-500 tabular-nums">{s.items.length}개 상품</span>
                        </div>
                      </td>
                    </tr>
                    {s.items.map((it, iIdx) => (
                      <tr key={it.order_request_id} className="hover:bg-zinc-50/70 border-b border-zinc-100">
                        <td className="p-2 text-center text-zinc-400 font-bold">{iIdx + 1}</td>
                        <td className="p-2 leading-tight">
                          <div className="font-mono text-[14px] text-zinc-400">{it.product_code}</div>
                          <div className="font-bold text-zinc-800 break-words whitespace-normal">{it.product_name}</div>
                        </td>
                        <td className="p-2 text-right">
                          <input type="number" min={1} value={it.order_qty}
                            onChange={e => onUpdateModalItem(sIdx, iIdx, { order_qty: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-16 border border-line rounded px-1.5 py-0.5 text-right font-mono font-bold text-red-600 focus:outline-none focus:border-brand-deep"/>
                        </td>
                        <td className="p-2 text-right">
                          <input type="number" min={0} value={it.unit_price ?? ""}
                            onChange={e => onUpdateModalItem(sIdx, iIdx, { unit_price: e.target.value === "" ? null : Number(e.target.value) })}
                            placeholder={it.prev_unit_price != null ? String(it.prev_unit_price) : "0"}
                            className="w-24 border border-line rounded px-1.5 py-0.5 text-right font-mono focus:outline-none focus:border-brand-deep"/>
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-emerald-700">
                          {it.unit_price ? (it.order_qty * it.unit_price).toLocaleString() + "원" : "-"}
                        </td>
                        <td className="p-2">
                          <input type="text" value={it.memo ?? ""}
                            onChange={e => onUpdateModalItem(sIdx, iIdx, { memo: e.target.value })}
                            placeholder="(선택)"
                            className="w-full border border-line rounded px-1.5 py-0.5 text-[14px] focus:outline-none focus:border-brand-deep"/>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-zinc-50 border-b-2 border-zinc-300 font-bold text-[15px]">
                      <td colSpan={3} className="p-2 text-right text-zinc-500 uppercase">{s.supplier} 소계</td>
                      <td className="p-2 text-right text-red-600 font-mono">{totalQty}개</td>
                      <td></td>
                      <td className="p-2 text-right text-emerald-700 font-mono">{totalAmount > 0 ? totalAmount.toLocaleString() + "원" : "-"}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      {/* 발송 채널 */}
      <div className="px-6 py-3 border-t border-zinc-100 bg-zinc-50/50">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-center">
          <div className="text-[15px] text-zinc-400">
            각 상품 비고 컬럼에 개별 메모 입력 가능
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[15px] text-zinc-500 font-bold block">발송 채널</label>
            <div className="flex items-center gap-1.5 flex-wrap">
              <label className={`text-[15px] font-bold border rounded-lg px-2 py-1 cursor-pointer flex items-center gap-1 ${notifyLogisticsLeader ? "bg-indigo-50 text-indigo-700 border-indigo-300" : "bg-white text-zinc-400 border-line"}`} title="체크 시 · 관리자(물류팀장)에게 발주서 PDF 카톡 전송">
                <input type="checkbox" checked={notifyLogisticsLeader} onChange={e => setNotifyLogisticsLeader(e.target.checked)} className="w-3 h-3"/>
                📋 물류팀장 발송 (PDF)
              </label>
              <label className={`text-[15px] font-bold border rounded-lg px-2 py-1 cursor-pointer flex items-center gap-1 ${orderModal.channels.kakao ? "bg-yellow-50 text-yellow-700 border-yellow-300" : "bg-white text-zinc-400 border-line"}`} title="SolAPI 알림톡">
                <input type="checkbox" checked={orderModal.channels.kakao} onChange={e => onChannelChange("kakao", e.target.checked)} className="w-3 h-3"/>
                💬 카카오톡
              </label>
              <label className={`text-[15px] font-bold border rounded-lg px-2 py-1 cursor-pointer flex items-center gap-1 ${orderModal.channels.email ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-white text-zinc-400 border-line"}`}>
                <input type="checkbox" checked={orderModal.channels.email} onChange={e => onChannelChange("email", e.target.checked)} className="w-3 h-3"/>
                <Mail size={11}/> 이메일
              </label>
              <label className={`text-[15px] font-bold border rounded-lg px-2 py-1 cursor-pointer flex items-center gap-1 ${orderModal.channels.sms ? "bg-sky-50 text-sky-700 border-sky-300" : "bg-white text-zinc-400 border-line"}`}>
                <input type="checkbox" checked={orderModal.channels.sms} onChange={e => onChannelChange("sms", e.target.checked)} className="w-3 h-3"/>
                <MessageSquare size={11}/> 문자
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* 통합 요약 + 액션 */}
      <div className="px-6 py-4 border-t border-line bg-white flex flex-col gap-3">
        {(() => {
          const totalSuppliers = orderModal.suppliers.length;
          const totalItems = orderModal.suppliers.reduce((n, s) => n + s.items.length, 0);
          const totalQty = orderModal.suppliers.reduce((n, s) => n + s.items.reduce((m, it) => m + (it.order_qty || 0), 0), 0);
          const totalAmt = orderModal.suppliers.reduce((n, s) => n + s.items.reduce((m, it) => m + (it.order_qty || 0) * (it.unit_price ?? 0), 0), 0);
          return (
            <div className="flex items-baseline gap-x-4 gap-y-1 flex-wrap text-[17px]">
              <span className="inline-flex items-baseline gap-1"><span className="text-zinc-400">총 공급사</span><span className="font-bold text-zinc-800 tabular-nums">{totalSuppliers}</span></span>
              <span className="inline-flex items-baseline gap-1"><span className="text-zinc-400">상품</span><span className="font-bold text-zinc-800 tabular-nums">{totalItems}</span></span>
              <span className="inline-flex items-baseline gap-1"><span className="text-zinc-400">수량</span><span className="font-bold text-rose-700 tabular-nums">{totalQty}</span></span>
              <span className="inline-flex items-baseline gap-1"><span className="text-zinc-400">금액</span><span className="font-bold text-emerald-700 tabular-nums">{totalAmt > 0 ? totalAmt.toLocaleString() + "원" : "-"}</span></span>
            </div>
          );
        })()}
        {/* 2026-08-24 · 최신 트렌드 · Linear/Vercel · gradient primary · scale-active · shadow */}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <button onClick={onClose} disabled={sendingBulk}
            className="h-9 px-4 rounded-lg text-[15px] font-semibold text-ink-soft bg-white border border-line hover:border-brand-deep/40 hover:bg-brand-tint/20 hover:text-brand-deep active:scale-[0.98] transition-all duration-150 cursor-pointer disabled:opacity-40">
            취소
          </button>
          <button onClick={onSubmit} disabled={sendingBulk}
            className="inline-flex items-center gap-1.5 h-9 px-5 rounded-lg text-[15px] font-bold text-white bg-gradient-to-br from-brand-deep to-[#0d3a5c] shadow-sm hover:shadow-md hover:from-[#0d3a5c] hover:to-[#08253a] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:shadow-none transition-all duration-150 cursor-pointer ring-1 ring-brand-deep/30">
            {sendingBulk && <Spinner size={13} tone="white" />}
            {sendingBulk ? "발송 중..." : "발주 발송"}
          </button>
        </div>
      </div>
    </div>
  </Modal>
);
