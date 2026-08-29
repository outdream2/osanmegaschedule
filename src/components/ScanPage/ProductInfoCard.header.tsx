// ProductInfoCard.header.tsx
// 2026-08-29 · 분리 · 상품명 헤더 + 숨기기 버튼 + 판매중지/숨김 배지

import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { StatusPill } from "../common/StatusPill";
import type { ProductInfo } from "../../lib/productsCache";

interface ProductInfoHeaderProps {
  product: ProductInfo;
  hideSaving: boolean;
  hideError: string | null;
  isHidden: boolean;
  onToggleHidden: () => void;
}

export const ProductInfoHeader: React.FC<ProductInfoHeaderProps> = ({
  product, hideSaving, hideError, isHidden, onToggleHidden,
}) => {
  const saleStatus = String((product as any).sale_status ?? "").trim();
  const isSuspended = saleStatus !== "" && saleStatus !== "판매중";

  return (
    <>
      {/* 상품명 + 숨기기 버튼 · 좁은 화면에서 버튼이 아래로 내려가도록 flex-wrap */}
      <div className="flex items-start gap-2 mb-1 flex-wrap">
        <p className="text-[15px] font-bold text-zinc-800 whitespace-normal leading-snug flex-1 min-w-0 break-keep">
          {product.name}
        </p>
        <button
          type="button"
          onClick={onToggleHidden}
          disabled={hideSaving}
          title={isHidden ? "숨김 해제 · 검색·발주 리스트에 다시 표시" : "이 상품 숨김 · 검색·발주 리스트에서 제외"}
          className={`shrink-0 inline-flex items-center gap-1 text-[13px] font-semibold px-2.5 py-1 rounded-lg border transition cursor-pointer ${
            isHidden
              ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
              : "bg-white border-line text-zinc-400 hover:bg-zinc-50 hover:border-zinc-300 hover:text-zinc-600"
          } ${hideSaving ? "opacity-60 cursor-wait" : ""}`}
        >
          {hideSaving ? <Spinner size={11} /> : (isHidden ? <Eye size={11} /> : <EyeOff size={11} />)}
          {isHidden ? "숨김 해제" : "숨기기"}
        </button>
      </div>
      {/* 2026-08-29 · 판매중지 상품 즉시 표시 */}
      {isSuspended && (
        <span className="mb-1.5 inline-flex">
          <StatusPill tone="rose" size="xs" dot>⚠ 판매중지 · {saleStatus}</StatusPill>
        </span>
      )}
      {isHidden && (
        <span className="mb-1.5 inline-flex">
          <StatusPill tone="amber" size="xs" dot>숨김 처리됨</StatusPill>
        </span>
      )}
      {hideError && <p className="text-[13px] text-rose-600 mb-1.5">{hideError}</p>}
    </>
  );
};
