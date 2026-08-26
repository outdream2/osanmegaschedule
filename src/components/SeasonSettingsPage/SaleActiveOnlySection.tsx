// src/components/SeasonSettingsPage/SaleActiveOnlySection.tsx
// 2026-08-26 · #118 · 통계설정 · 판매중 상품만 필터 전역 토글
//   · 모든 상품 검색·통계에 반영 · KV setting 기반 (자동 저장)

import React from "react";
import { PackageCheck, Package } from "lucide-react";
import { CARD_BASE } from "../../styles/tokens";
import { useSaleActiveOnly } from "../../hooks/useSaleActiveOnly";
import { StatusPill } from "../common/StatusPill";
import { IconTile } from "../common/IconTile";

export const SaleActiveOnlySection: React.FC = () => {
  const { saleActiveOnly, setSaleActiveOnly, loaded } = useSaleActiveOnly();

  return (
    <div className={`${CARD_BASE} p-5`}>
      <div className="flex items-start gap-3 mb-4">
        <IconTile icon={<PackageCheck size={16} />} tone="emerald" size="md" />
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-bold text-ink tracking-tight leading-tight">판매중 상품만 표시</div>
          <div className="text-[14px] text-ink-soft mt-1 leading-relaxed">
            켜면 · 모든 상품 검색·통계에 <b className="text-emerald-700">판매중</b> 상품만 반영됩니다.
            <br />
            <span className="text-[13px] text-zinc-500">끄면 · 단종·미판매 상품도 검색/통계에 포함</span>
          </div>
        </div>
        <StatusPill tone={saleActiveOnly ? "emerald" : "zinc"} size="sm">
          {saleActiveOnly ? "판매중만" : "전체"}
        </StatusPill>
      </div>

      <label className="flex items-center gap-3 p-3 rounded-xl border border-line bg-zinc-50/60 hover:bg-zinc-50 cursor-pointer transition">
        <input
          type="checkbox"
          checked={saleActiveOnly}
          onChange={(e) => setSaleActiveOnly(e.target.checked)}
          disabled={!loaded}
          className="w-5 h-5 accent-emerald-600 cursor-pointer"
        />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-ink">판매중 상품만 반영</div>
          <div className="text-[13px] text-ink-soft mt-0.5">
            상품 리스트·매입이력·발주 검색·통계 등 모든 리스트에 적용
          </div>
        </div>
        {saleActiveOnly ? (
          <PackageCheck size={20} className="text-emerald-600" />
        ) : (
          <Package size={20} className="text-zinc-400" />
        )}
      </label>
    </div>
  );
};
