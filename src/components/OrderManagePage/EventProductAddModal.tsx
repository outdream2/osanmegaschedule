// src/components/OrderManagePage/EventProductAddModal.tsx
// 2026-09-23 · #348-2 · #349 · 사용자 지시
//   · 이벤트 상품 다중 선택 · 발주필요 추가 모달
//   · SalesRecommendationPanel 에서 파일 사이즈 관리 목적으로 분리 (framework audit)
//   · 이벤트 옆 [상품추가] 버튼 클릭 시 · fixed overlay 로 렌더
//   · 다중 체크박스 · 확인 → 각 상품 · onRequestProduct 호출 · 발주필요 리스트 추가
//   · 이미 발주요청된 상품 · 회색 · 선택 불가 · "요청됨" 표시
//   · 판매중지·숨김 상품 · 제외

import React from "react";
import { Sparkles, X, Check } from "lucide-react";
import { StatusPill } from "../common/StatusPill";

interface EventProduct {
  product_code: string;
  product_name: string;
  current_stock: number | null;
  optimal_stock: number | null;
  supplier: string | null;
  sale_status?: string | null;
}
interface EventLike {
  id: number;
  name: string;
  products?: EventProduct[];
}

interface Props {
  event: EventLike;
  requestedCodes?: Set<string>;
  selected: Set<string>;
  onToggle: (code: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  submitting: boolean;
}

export const EventProductAddModal: React.FC<Props> = ({
  event, requestedCodes, selected, onToggle, onConfirm, onClose, submitting,
}) => {
  const products = event.products ?? [];
  const eligible = products.filter(p => p.sale_status !== "판매중지" && p.sale_status !== "숨김");
  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-line flex items-center gap-2">
          <Sparkles size={16} className="text-brand-deep shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-bold text-ink truncate">{event.name} · 상품 추가</div>
            <div className="text-[14px] text-zinc-500 mt-0.5">발주필요 리스트에 추가할 상품 선택</div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-zinc-100 cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-1.5">
          {eligible.length === 0 && (
            <div className="text-center text-[16px] text-zinc-400 py-8">등록된 상품 없음 · 판매중 상품 없음</div>
          )}
          {eligible.map(p => {
            const already = requestedCodes?.has(p.product_code) ?? false;
            const isSel = selected.has(p.product_code);
            const disabled = already;
            return (
              <label key={p.product_code} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${disabled ? "bg-zinc-50 border-line opacity-60 cursor-not-allowed" : isSel ? "bg-brand-tint/40 border-brand-deep cursor-pointer" : "bg-white border-line hover:border-brand-tint cursor-pointer"} transition`}>
                <input
                  type="checkbox"
                  checked={isSel}
                  disabled={disabled}
                  onChange={() => onToggle(p.product_code)}
                  className="w-4 h-4 accent-brand-deep cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-bold text-ink truncate">{p.product_name || p.product_code}</div>
                  <div className="text-[14px] text-ink-soft tabular-nums mt-0.5">
                    재고 {Number(p.current_stock ?? 0)} / 적정 {Number(p.optimal_stock ?? 0)}
                    {p.supplier && <span className="ml-2 truncate">· {p.supplier}</span>}
                  </div>
                </div>
                {already && <StatusPill tone="emerald" size="xs" dot>요청됨</StatusPill>}
              </label>
            );
          })}
        </div>
        <div className="px-4 py-3 border-t border-line flex items-center gap-2">
          <div className="text-[15px] text-zinc-500 font-semibold">{selected.size}건 선택</div>
          <button type="button" onClick={onClose} disabled={submitting}
            className="ml-auto h-9 px-3 rounded-md text-[16px] font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 cursor-pointer disabled:opacity-40">
            취소
          </button>
          <button type="button" onClick={onConfirm} disabled={submitting || selected.size === 0}
            className="h-9 px-4 rounded-md text-[16px] font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
            <Check size={13} strokeWidth={2.5} />
            {submitting ? "추가 중..." : `${selected.size}건 발주필요 추가`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EventProductAddModal;
