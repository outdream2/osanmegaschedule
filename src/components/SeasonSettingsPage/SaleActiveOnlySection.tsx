// src/components/SeasonSettingsPage/SaleActiveOnlySection.tsx
// 2026-08-26 · #118 · 통계설정 · 판매중 상품만 필터 전역 토글
//   · 모든 상품 검색·통계에 반영 · KV setting 기반 (자동 저장)
// 2026-08-26 v2 · 사용자 지시 · 목업 트렌드 · 폰트 대형화 · Linear/Vercel/Notion 톤

import React from "react";
import { PackageCheck, Package } from "lucide-react";
import { useSaleActiveOnly } from "../../hooks/useSaleActiveOnly";
import { StatusPill } from "../common/StatusPill";
import { IconTile } from "../common/IconTile";

export const SaleActiveOnlySection: React.FC = () => {
  const { saleActiveOnly, setSaleActiveOnly, loaded } = useSaleActiveOnly();

  return (
    // Linear·Vercel 톤 · 카드 · gradient border top · shadow-sm · rounded-2xl
    <section
      className="bg-white rounded-2xl border border-line overflow-hidden"
      style={{ boxShadow: "0 1px 2px rgba(10,46,74,0.04), 0 4px 12px -4px rgba(10,46,74,0.06)" }}
    >
      {/* accent gradient top bar */}
      <div className="h-1 bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500" />

      <div className="p-7">
        {/* 헤더 · 아이콘 + 제목 + 설명 + 상태 배지 */}
        <div className="flex items-start gap-4 mb-6">
          <IconTile icon={<PackageCheck size={22} />} tone="emerald" size="lg" />
          <div className="flex-1 min-w-0">
            <h3 className="text-[24px] font-extrabold text-ink tracking-tight leading-tight">판매중 상품만 표시</h3>
            <p className="text-[19px] text-ink-soft mt-2 leading-relaxed">
              활성 시 · 모든 상품 검색·통계에 <b className="text-emerald-700">판매중</b> 상품만 반영
              <br />
              <span className="text-[17px] text-zinc-500">비활성 시 · 단종·미판매 상품도 포함</span>
            </p>
          </div>
          <StatusPill tone={saleActiveOnly ? "emerald" : "zinc"} size="md">
            {saleActiveOnly ? "판매중만" : "전체 표시"}
          </StatusPill>
        </div>

        {/* 토글 카드 · large clickable · 상태 시각화 */}
        <label
          className={`flex items-center gap-4 p-5 rounded-xl border-2 cursor-pointer transition-all duration-150 active:scale-[0.995] ${
            saleActiveOnly
              ? "border-emerald-300 bg-gradient-to-br from-emerald-50/70 to-white shadow-inner"
              : "border-line bg-zinc-50/40 hover:bg-zinc-50 hover:border-zinc-300"
          }`}
        >
          <input
            type="checkbox"
            checked={saleActiveOnly}
            onChange={(e) => setSaleActiveOnly(e.target.checked)}
            disabled={!loaded}
            className="w-6 h-6 accent-emerald-600 cursor-pointer"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[21px] font-bold text-ink leading-tight">판매중 상품만 반영</div>
            <div className="text-[17px] text-ink-soft mt-1 leading-relaxed">
              상품 리스트 · 매입이력 · 발주 검색 · 통계 등 모든 리스트에 즉시 적용
            </div>
          </div>
          {saleActiveOnly ? (
            <PackageCheck size={28} className="text-emerald-600 shrink-0" strokeWidth={2.4} />
          ) : (
            <Package size={28} className="text-zinc-400 shrink-0" strokeWidth={2} />
          )}
        </label>
      </div>
    </section>
  );
};
