// ProductInfoCard.order.tsx
// 2026-08-29 · 분리 · 발주요청 버튼 섹션

import React from "react";
import { ShoppingCart, CheckCircle2 } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";

type OrderStatus = "idle" | "loading" | "done" | "error";

interface ProductInfoOrderProps {
  isLow: boolean;
  orderStatus: OrderStatus;
  orderConfirm: boolean;
  existingOrder: { current_stock: number | null; requested_at: string } | null;
  onOrderRequest: () => void;
  onSubmitOrder: () => void;
  onCancelConfirm: () => void;
}

export const ProductInfoOrder: React.FC<ProductInfoOrderProps> = ({
  isLow, orderStatus, orderConfirm, existingOrder,
  onOrderRequest, onSubmitOrder, onCancelConfirm,
}) => (
  <div className="mb-2.5">
    {existingOrder && orderStatus !== "done" && (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 mb-1.5 bg-orange-50 border border-orange-200 rounded-xl text-[14px] text-orange-700 font-bold">
        <ShoppingCart size={11} className="shrink-0" />
        <span>기존 발주요청 있음 — 현재고 {existingOrder.current_stock ?? "—"} ({new Date(existingOrder.requested_at).toLocaleDateString("ko-KR")} 요청)</span>
      </div>
    )}
    {orderConfirm ? (
      <div className="flex items-center gap-2">
        <span className="text-[14px] text-zinc-700 font-bold flex-1">기존 요청을 덮어쓸까요?</span>
        <button onClick={onSubmitOrder} className="text-[14px] font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 min-h-9 rounded-lg transition cursor-pointer">덮어쓰기</button>
        <button onClick={onCancelConfirm} className="text-[14px] font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 min-h-9 rounded-lg transition cursor-pointer">취소</button>
      </div>
    ) : orderStatus === "done" ? (
      <Card variant="flat" bg="bg-emerald-50" borderColor="border-emerald-200" padding="none" className="flex items-center justify-center gap-2 py-2 text-emerald-700 text-[14px] font-bold">
        <CheckCircle2 size={14} />
        발주 요청이 등록되었습니다
      </Card>
    ) : (
      <button
        onClick={onOrderRequest}
        disabled={orderStatus === "loading"}
        className={`w-full flex items-center justify-center gap-2 min-h-9 py-2 rounded-xl text-[14px] font-bold transition cursor-pointer disabled:opacity-60 ${
          isLow
            ? "bg-red-500 hover:bg-red-600 text-white shadow-sm shadow-red-200"
            : "bg-white border border-zinc-300 hover:border-indigo-400 hover:text-indigo-600 text-zinc-600"
        }`}
      >
        {orderStatus === "loading" ? <Spinner size={14} /> : <ShoppingCart size={14} />}
        {orderStatus === "loading" ? "요청 중..." : orderStatus === "error" ? "재시도" : existingOrder ? "발주요청 리스트 업데이트" : "발주요청 리스트에 추가"}
      </button>
    )}
    {orderStatus === "error" && (
      <p className="text-[14px] text-red-500 text-center mt-1">요청 실패 — 다시 시도해주세요</p>
    )}
  </div>
);
