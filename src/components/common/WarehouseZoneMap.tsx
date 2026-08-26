// src/components/common/WarehouseZoneMap.tsx
// 2026-08-26 · 사용자 지시 · 창고1 · 창고2 구역도 · storage.webp 기반 · 매장구역도 옆 탭 추가
//   · Phase 1 · 이미지 기반 · 창고 레이아웃 시각화 (참고용)
//   · Phase 2 (선택) · 인터랙티브 구역 오버레이 · 클릭 시 구역별 상품 조회

import React, { useState } from "react";
import { Warehouse, Package, ZoomIn, ZoomOut } from "lucide-react";
import warehouseImg from "../../images/warehouse_layout.webp";
// 2026-08-26 · 사용자 지시 · 창고1/창고2 각각 실사진 이미지
import storage1Img from "../../images/storage1.png";
import storage2Img from "../../images/storage2.png";
import { Card } from "./Card";
import { IconTile } from "./IconTile";

interface WarehouseZoneMapProps {
  /** 창고 필터 · both · 1 · 2 · 기본 both */
  filter?: "both" | "1" | "2";
}

// 2026-08-26 · 사용자 지시 · 창고1 실제 구역 · 24·25·26·27·7B·8A
const WAREHOUSE_1_ZONES = [
  { code: "24", label: "24" },
  { code: "25", label: "25" },
  { code: "26", label: "26" },
  { code: "27", label: "27" },
  { code: "7B", label: "7B" },
  { code: "8A", label: "8A" },
];

const WAREHOUSE_2_INNER = [
  { num: 28, label: "샴푸/린스" },
  { num: 29, label: "바디워시" },
  { num: 30, label: "치약/구강" },
  { num: 31, label: "여성용품" },
  { num: 32, label: "종합영양제" },
  { num: 33, label: "비타민" },
  { num: 34, label: "홍삼/건강식품" },
  { num: 35, label: "성인/노인" },
  { num: 36, label: "다이어트" },
  { num: 37, label: "밴드/드레싱" },
  { num: 38, label: "안약/눈" },
  { num: 39, label: "일반의약품" },
  { num: 40, label: "감기약" },
];

const WAREHOUSE_2_CENTER = [
  "1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B", "5A", "5B", "6A", "6B", "7A",
];

const WAREHOUSE_2_RIGHT = [
  { num: 8,  label: "구강청결" },
  { num: 9,  label: "치약" },
  { num: 10, label: "구강용품" },
  { num: 11, label: "칫솔" },
  { num: 12, label: "가글" },
  { num: 13, label: "구강스프레이" },
  { num: 14, label: "건강기능" },
  { num: 15, label: "비타민B" },
  { num: 16, label: "비타민C" },
  { num: 17, label: "종합비타민" },
  { num: 18, label: "오메가3" },
  { num: 19, label: "칼슘" },
  { num: 20, label: "루테인" },
  { num: 21, label: "프로바이오틱스" },
  { num: 22, label: "홍삼" },
  { num: 23, label: "건강식품" },
];

export const WarehouseZoneMap: React.FC<WarehouseZoneMapProps> = ({ filter = "both" }) => {
  const [imgOpen, setImgOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {/* 헤더 · 실사진 참조 안내 */}
      <Card padding="md" topAccent>
        <div className="flex items-start gap-3">
          <IconTile icon={<Warehouse size={16} />} tone="amber" size="md" />
          <div className="flex-1 min-w-0">
            <div className="text-[17px] font-bold text-ink tracking-tight leading-tight">창고 구역도</div>
            <div className="text-[13px] text-ink-soft mt-0.5">
              창고1 (좌측 6구역) · 창고2 (안쪽 13구역 · 중앙 13섹션 · 오른쪽 16구역)
            </div>
          </div>
          <button
            type="button"
            onClick={() => setImgOpen(v => !v)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-semibold text-ink-soft bg-white border border-line hover:border-brand-deep/40 hover:text-brand-deep transition cursor-pointer"
            title="원본 이미지 참조"
          >
            {imgOpen ? <ZoomOut size={13} /> : <ZoomIn size={13} />}
            원본 이미지
          </button>
        </div>
      </Card>

      {/* 원본 이미지 · 접기/펼치기 */}
      {imgOpen && (
        <Card padding="sm">
          <img
            src={warehouseImg}
            alt="창고 구역도 원본 (참조용)"
            className="w-full max-w-[900px] mx-auto rounded-lg border border-line"
            loading="lazy"
          />
        </Card>
      )}

      {/* 창고1 */}
      {(filter === "both" || filter === "1") && (
        <Card padding="md">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-line">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-[15px] font-bold text-orange-700 tracking-tight">창고 1</span>
            <span className="text-[12px] text-ink-soft ml-auto">6 구역</span>
          </div>
          {/* 2026-08-26 · 사용자 지시 · 창고1 실사진 */}
          <img
            src={storage1Img}
            alt="창고 1 실사진"
            className="w-full max-w-[720px] mx-auto rounded-lg border border-orange-200 mb-3"
            loading="lazy"
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {WAREHOUSE_1_ZONES.map((z, i) => (
              <ZoneBox key={i} num={z.code} label={z.label} tone="orange" />
            ))}
          </div>
        </Card>
      )}

      {/* 창고2 · 3 섹션 */}
      {(filter === "both" || filter === "2") && (
        <Card padding="md">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-line">
            <span className="w-2 h-2 rounded-full bg-teal-500" />
            <span className="text-[15px] font-bold text-teal-700 tracking-tight">창고 2</span>
            <span className="text-[12px] text-ink-soft ml-auto">안쪽 · 중앙 · 오른쪽 3섹션 · 총 42 구역</span>
          </div>
          {/* 2026-08-26 · 사용자 지시 · 창고2 실사진 */}
          <img
            src={storage2Img}
            alt="창고 2 실사진"
            className="w-full max-w-[720px] mx-auto rounded-lg border border-teal-200 mb-3"
            loading="lazy"
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* 안쪽 */}
            <div>
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <Package size={12} className="text-teal-600" />
                <span className="text-[13px] font-bold text-teal-700 uppercase tracking-wider">안쪽</span>
                <span className="text-[11px] text-ink-soft ml-auto">{WAREHOUSE_2_INNER.length}구역</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-1.5">
                {WAREHOUSE_2_INNER.map((z, i) => (
                  <ZoneBox key={i} num={String(z.num)} label={z.label} tone="teal" size="sm" />
                ))}
              </div>
            </div>

            {/* 중앙 */}
            <div>
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <Package size={12} className="text-teal-600" />
                <span className="text-[13px] font-bold text-teal-700 uppercase tracking-wider">중앙</span>
                <span className="text-[11px] text-ink-soft ml-auto">{WAREHOUSE_2_CENTER.length}섹션</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-1.5">
                {WAREHOUSE_2_CENTER.map((code, i) => (
                  <ZoneBox key={i} num={code} label="" tone="teal" size="sm" />
                ))}
              </div>
            </div>

            {/* 오른쪽 */}
            <div>
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <Package size={12} className="text-teal-600" />
                <span className="text-[13px] font-bold text-teal-700 uppercase tracking-wider">오른쪽</span>
                <span className="text-[11px] text-ink-soft ml-auto">{WAREHOUSE_2_RIGHT.length}구역</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-1.5">
                {WAREHOUSE_2_RIGHT.map((z, i) => (
                  <ZoneBox key={i} num={String(z.num)} label={z.label} tone="teal" size="sm" />
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

// ─── Zone Box ───────────────────────────────────────────────────────────
const TONE: Record<"orange" | "teal", { bg: string; border: string; num: string; label: string }> = {
  orange: { bg: "bg-orange-50", border: "border-orange-300", num: "text-orange-800", label: "text-orange-700" },
  teal:   { bg: "bg-teal-50",   border: "border-teal-300",   num: "text-teal-800",   label: "text-teal-700" },
};

const ZoneBox: React.FC<{ num: string; label: string; tone: "orange" | "teal"; size?: "sm" | "md" }> = ({
  num, label, tone, size = "md",
}) => {
  const t = TONE[tone];
  const isSm = size === "sm";
  return (
    <div className={`${t.bg} ${t.border} border rounded-lg ${isSm ? "px-2 py-1.5" : "px-3 py-2"} flex flex-col items-center justify-center gap-0.5 hover:shadow-sm transition-shadow`}>
      <span className={`${t.num} font-bold ${isSm ? "text-[14px]" : "text-[16px]"} tabular-nums leading-none`}>{num}</span>
      {label && <span className={`${t.label} ${isSm ? "text-[11px]" : "text-[12px]"} font-semibold text-center leading-tight truncate w-full`}>{label}</span>}
    </div>
  );
};

export default WarehouseZoneMap;
