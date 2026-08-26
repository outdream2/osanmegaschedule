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

// 2026-08-26 · 사용자 지시 · 창고1/창고2 실제 구역 · storage*_description.png 반영
//   · 창고1 · 24·25·26·27 (파스류) + 7B (한방제제) + 8A (경옥고/공진단 등)
const WAREHOUSE_1_ZONES = [
  { code: "24", label: "파스",              hint: "제일·녹십자·한독" },
  { code: "25", label: "파스",              hint: "신신·지오영" },
  { code: "26", label: "뿌리는/바르는 파스", hint: "지오영" },
  { code: "27", label: "파스",              hint: "일동·조아" },
  { code: "7B", label: "한방제제모음",       hint: "경방·한풍·원광·한국신약·한솔" },
  { code: "8A", label: "경옥고/공진단/태반/우황청심원/안정액/수면유도제", hint: "광동·유수·인풍·원광·동화·한국신약·일양·경남·녹십자" },
];

// 창고2 · 왼쪽측면 (창고2 + 위탁 혼합 · 28~40)
const WAREHOUSE_2_INNER = [
  { num: "28",  tag: "창고2", label: "의료기기/혈당/혈압/체온계" },
  { num: "28*", tag: "위탁",  label: "보호대/스포츠테이핑 (관절/모기물림)" },
  { num: "29",  tag: "창고2", label: "반창고/거즈/붕대" },
  { num: "29*", tag: "창고2", label: "응급/구급/소독약/살충제" },
  { num: "30",  tag: "창고2", label: "화상/습윤밴드" },
  { num: "30*", tag: "창고2", label: "화상/습윤밴드" },
  { num: "31",  tag: "창고2", label: "염색약/제모기/립케어/생지시트" },
  { num: "34",  tag: "위탁",  label: "반려동물 용품/의약품/영양제/간식/사료" },
  { num: "35",  tag: "위탁",  label: "반려동물 용품/의약품/영양제/간식/사료" },
  { num: "35*", tag: "위탁",  label: "반려동물 용품/의약품/영양제/간식/사료" },
  { num: "36",  tag: "위탁",  label: "동물의약품" },
  { num: "36*", tag: "창고2", label: "기타건강식품" },
  { num: "37",  tag: "창고2", label: "기타건강식품" },
  { num: "37*", tag: "창고2", label: "기타건강식품" },
  { num: "38",  tag: "창고2", label: "기타건강식품" },
  { num: "38*", tag: "창고2", label: "기타건강식품" },
  { num: "39",  tag: "창고2", label: "브랜드관 (뉴케어)" },
  { num: "39*", tag: "창고2", label: "해외식품관" },
  { num: "40",  tag: "창고2", label: "이벤트존" },
  { num: "40*", tag: "창고1/2", label: "드림크냉장고" },
];

// 창고2 · 화장품 섹션 (32·33)
const WAREHOUSE_2_COSMETICS = [
  { num: "32",  label: "기미/미백/잡티 · 여드름/트러블 케어" },
  { num: "33",  label: "기초케어 · 클린징케어" },
  { num: "33*", label: "마스크팩/집중팩 · 여행용 화장품 · 약통/커터/복약" },
  { num: "32*", label: "진정/민감케어 · 탄력/주름 · 모공피부 케어" },
];

// 창고2 · 중앙 (1A~8B) · 약국 진열대 · 감기약/소화제/연고/피부 등
const WAREHOUSE_2_CENTER = [
  { code: "1A", label: "1·2차 감기약 · 코감기 · 인후염" },
  { code: "1B", label: "1·2차 감기약 · 코감기 · 스레알레약 · 씨감기약" },
  { code: "2A", label: "한방 감기약 · 종합감기약 · 시럽" },
  { code: "2B", label: "혼합 감기약 · 시럽" },
  { code: "3A", label: "소화제 · 상비약 · 위장약" },
  { code: "3B", label: "소화제/위장약 · 항산제" },
  { code: "4A", label: "지사·정장약 · 속쓰림약" },
  { code: "4B", label: "해열진통 · 소염제" },
  { code: "5A", label: "칫솔/치약/구강용품 · 눈 관련" },
  { code: "5B", label: "연고 (외피/피부)" },
  { code: "6A", label: "연고 (설퍼/피부·양평)" },
  { code: "6B", label: "피부관련 (여름/두피/누기·양기)" },
  { code: "7A", label: "정형/양장 · PMS/생리통 · 근육통" },
];

// 창고2 · 오른쪽측면 (10~23 · 건강기능)
const WAREHOUSE_2_RIGHT = [
  { num: "10",  label: "피로회복" },
  { num: "10*", label: "피로회복" },
  { num: "11",  label: "피로회복" },
  { num: "11*", label: "피로회복" },
  { num: "12",  label: "어린이 영양" },
  { num: "12*", label: "피로회복" },
  { num: "13",  label: "철분/엽산" },
  { num: "13*", label: "임산영양" },
  { num: "14",  label: "유산균" },
  { num: "14*", label: "냉장 유산균 (180센티)" },
  { num: "15",  label: "혈행건강" },
  { num: "15*", label: "위건강" },
  { num: "16",  label: "오메가3·6·7" },
  { num: "16*", label: "뇌기능 개선" },
  { num: "17",  label: "잇몸건강" },
  { num: "17*", label: "눈건강" },
  { num: "18",  label: "항산화" },
  { num: "18*", label: "면역조절제" },
  { num: "19",  label: "비타민C" },
  { num: "19*", label: "항산화" },
  { num: "20",  label: "여성라이프케어 (생리기간)" },
  { num: "20*", label: "콜라겐" },
  { num: "21",  label: "운동전후/체중관리/수제보충" },
  { num: "21*", label: "남성 라이프케어 (활력/근력)" },
  { num: "22",  label: "피로회복" },
  { num: "22*", label: "마그네슘/수면" },
  { num: "23",  label: "혈관건강" },
  { num: "23*", label: "관절건강" },
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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-1.5">
                {WAREHOUSE_2_CENTER.map((z, i) => (
                  <ZoneBox key={i} num={z.code} label={z.label} tone="teal" size="sm" />
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
                  <ZoneBox key={i} num={z.num} label={z.label} tone="teal" size="sm" />
                ))}
              </div>
            </div>
          </div>

          {/* 화장품 섹션 (32·33) */}
          <div className="mt-4 pt-3 border-t border-teal-100">
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <Package size={12} className="text-pink-600" />
              <span className="text-[13px] font-bold text-pink-700 uppercase tracking-wider">화장품</span>
              <span className="text-[11px] text-ink-soft ml-auto">{WAREHOUSE_2_COSMETICS.length}구역</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {WAREHOUSE_2_COSMETICS.map((z, i) => (
                <ZoneBox key={i} num={z.num} label={z.label} tone="teal" size="sm" />
              ))}
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
