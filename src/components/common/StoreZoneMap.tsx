// src/components/common/StoreZoneMap.tsx
// 매장 구역도 공용 컴포넌트 · 2026-08-03 (사용자 요청 · DisplayPage · SalesTrendPage 통합)
//
// 하나의 구역도 컴포넌트를 · 두 곳에서 공용:
//   1. SalesTrendPage · CategoryTab · 판매순위 rank ★BEST 배지 표시
//   2. DisplayPage · 모바일 fullscreen 매장 구역도 (읽기 전용)
//
// 기본 구조는 SalesTrendPage 의 기존 MiniStoreZoneMap 을 기준 (사용자 요청 · "구역도의 구역도가 기준"):
//   상단 벽면 (STORE_TOP_WALL · 21→9)
//   중앙 진열대 (22 단독 + 8B/8A → 1B/1A pair · 17셀)
//   하단 벽면 (STORE_BOTTOM_WALL · 23→34)
//   동측 wing (STORE_VERTICAL_WING · 35→42)
//
// 카테고리 페이지 전용 기능 (BEST 배지) 를 옵션으로 추가.
// DisplayPage 편집·드래그드롭 map 은 이 컴포넌트가 아니라 별도 유지 (편집 UI 는 원본 코드 그대로).

import React, { useEffect, useState } from "react";
import {
  STORE_TOP_WALL, STORE_AISLE_CENTER, STORE_AISLE_PAIRS, STORE_BOTTOM_WALL, STORE_VERTICAL_WING,
  CAT_A_COLORS, CAT_B_COLORS,
} from "../../constants/storeMapLayout";
import { ZONE_DEFS } from "../../constants/displayZones";
import { getZoneLabel, getZoneSubLabel } from "../../constants/zoneLabels";

export interface StoreZoneMapProps {
  /** 구역별 상품 수 · key = zone id (예: "1A", "9B", "22") · 카테고리 페이지에서 사용 */
  zoneItemCounts?: Record<string, number>;
  /** 구역별 판매순위 rank (1부터 · 낮을수록 상위) · Top 10 만 ★BEST 배지 표시 · 옵션 */
  zoneRankMap?: Record<string, number>;
  /** BEST 배지 표시 여부 · default false · 카테고리 페이지에서 true */
  showBestBadges?: boolean;
  /** 셀 클릭 시 콜백 · DisplayPage 는 상품 조회 모달 오픈 · SalesTrendPage 는 미사용 · 옵션 */
  onZoneClick?: (zoneId: string) => void;
  /** 컴팩트 모드 · default false · true 면 셀 크기·폰트 축소 (DisplayPage fullscreen 모달 등) */
  compact?: boolean;
  /** 접기/펴기 지원 · default false · true 면 헤더 클릭으로 토글 */
  collapsible?: boolean;
  /** 초기 접힘 상태 · collapsible=true 일 때만 · default true */
  defaultCollapsed?: boolean;
  /** 헤더 타이틀 · collapsible=true 일 때만 표시 · default "🗺️ 매장 구역도" */
  title?: string;
}

/**
 * BEST rank 배지 색상 (사용자 요청 · 순위별 확실히 구분):
 *   1·2위 · rose·red (강조)
 *   3·4위 · sky·blue
 *   5·6위 · emerald·green
 *   7·8위 · violet·purple
 *   9·10위 · slate
 */
function rankBadgeClass(rank: number): string {
  if (rank <= 2)
    return "bg-gradient-to-r from-rose-500 to-red-600 text-white border-red-700 shadow-md";
  if (rank <= 4)
    return "bg-gradient-to-r from-sky-500 to-blue-600 text-white border-blue-700 shadow-md";
  if (rank <= 6)
    return "bg-gradient-to-r from-emerald-500 to-green-600 text-white border-green-700 shadow-md";
  if (rank <= 8)
    return "bg-gradient-to-r from-violet-500 to-purple-600 text-white border-purple-700 shadow-md";
  return "bg-gradient-to-r from-slate-400 to-slate-500 text-white border-slate-600 shadow-sm";
}

const StoreZoneMap: React.FC<StoreZoneMapProps> = ({
  zoneItemCounts,
  zoneRankMap,
  showBestBadges = false,
  onZoneClick,
  compact = false,
  collapsible = false,
  defaultCollapsed = true,
  title = "🗺️ 매장 구역도",
}) => {
  // 2026-07-31 · zone-labels-changed 수신 → 강제 리렌더 (라벨 편집 반영)
  const [, setZoneLabelVersion] = useState(0);
  useEffect(() => {
    const handler = () => setZoneLabelVersion(v => v + 1);
    window.addEventListener("zone-labels-changed", handler);
    return () => window.removeEventListener("zone-labels-changed", handler);
  }, []);

  const [collapsed, setCollapsed] = useState(collapsible ? defaultCollapsed : false);

  // compact 모드 · 셀 min-height 조정
  const wallMin = compact ? "min-h-[72px]" : "min-h-[92px]";
  const cellMin = compact ? "min-h-[60px]" : "min-h-[76px]";
  const centerMin = compact ? "min-h-[110px]" : "min-h-[140px]";

  // BEST 배지 (Top 10 만) · showBestBadges=true 이고 rank<=10 있을 때만
  const rankBadge = (zoneId: string) => {
    if (!showBestBadges) return null;
    const rank = zoneRankMap?.[zoneId];
    if (!rank || rank > 10) return null;
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-[10px] font-black border rounded px-1.5 py-0.5 leading-none tabular-nums ${rankBadgeClass(rank)}`}
        title={`판매 BEST ${rank}위`}
      >
        ★ BEST{rank}
      </span>
    );
  };

  // 셀 클릭 핸들러 · onZoneClick 있을 때만 button 처럼 동작
  const cellClickable = typeof onZoneClick === "function";
  const cellInteractive = cellClickable
    ? "cursor-pointer hover:brightness-95 transition"
    : "";

  // 벽면·수직윙 셀 · aspect ratio 1:1.6 · 라벨 + 카테고리
  const wallCell = (num: number) => {
    const zd = ZONE_DEFS.find(z => z.num === num);
    const cat = getZoneSubLabel(num) || (zd?.category ?? "");
    const count = zoneItemCounts?.[String(num)] ?? 0;
    const zoneId = String(num);
    const handleClick = cellClickable ? () => onZoneClick!(zoneId) : undefined;
    const Tag: any = cellClickable ? "button" : "div";
    const extra = cellClickable ? { type: "button" as const, onClick: handleClick } : {};
    return (
      <Tag
        key={num}
        {...extra}
        className={`rounded-md overflow-hidden border border-stone-300 bg-white shadow-sm flex flex-col items-center ${wallMin} ${cellInteractive}`}
        title={`${zd?.label ?? num} · ${cat}${count > 0 ? ` · ${count}개 상품` : ""}`}
      >
        {/* 상단 · ★BEST 배지 (옵션) · 배지 없어도 line 은 유지 (레이아웃 안정) */}
        {showBestBadges && (
          <div className="w-full min-h-[18px] flex items-center justify-center pt-0.5">
            {rankBadge(zoneId)}
          </div>
        )}
        <div className="w-full bg-stone-50 px-1 py-1 flex flex-col items-center gap-0.5 flex-1 justify-center">
          <div className="flex items-center justify-center">
            <span className="text-[10px] font-black text-white bg-amber-700 rounded px-1.5 leading-none">{getZoneLabel(num)}</span>
          </div>
          <span className="text-[10px] font-bold text-stone-800 leading-tight text-center line-clamp-2 break-all">{cat}</span>
        </div>
      </Tag>
    );
  };

  // 중앙 진열대 B|A pair 셀 · B (좌) | A (우) 가로 배치
  const pairCell = (num: number) => {
    const ca = CAT_A_COLORS[num];
    const cb = CAT_B_COLORS[num];
    const zd = ZONE_DEFS.find(z => z.num === num);
    const subB = getZoneSubLabel(`${num}B`) || (zd?.subB ?? "");
    const subA = getZoneSubLabel(`${num}A`) || (zd?.subA ?? "");
    const countB = zoneItemCounts?.[`${num}B`] ?? 0;
    const countA = zoneItemCounts?.[`${num}A`] ?? 0;

    const renderSide = (
      side: "A" | "B",
      colors: typeof ca,
      sub: string,
      count: number,
    ) => {
      const zoneId = `${num}${side}`;
      const handleClick = cellClickable ? () => onZoneClick!(zoneId) : undefined;
      const Tag: any = cellClickable ? "button" : "div";
      const extra = cellClickable ? { type: "button" as const, onClick: handleClick } : {};
      return (
        <div className="flex flex-col items-stretch gap-0.5 flex-1 min-w-[44px]">
          {showBestBadges && (
            <div className="min-h-[18px] flex items-center justify-center">{rankBadge(zoneId)}</div>
          )}
          <Tag
            {...extra}
            className={`w-full font-black ${colors.text} ${colors.bg} border-2 ${colors.border} rounded px-0.5 py-1 leading-tight text-center ${cellMin} flex flex-col items-center justify-center overflow-hidden ${cellInteractive}`}
            title={`${zoneId} · ${sub}${count > 0 ? ` · ${count}개 상품` : ""}`}
          >
            <div className="flex items-center justify-center mb-0.5">
              <span className={`text-[10px] font-black text-white ${colors.labelBg} rounded px-1.5 leading-none`}>{getZoneLabel(zoneId)}</span>
            </div>
            <span className="line-clamp-3 text-[10px] break-all">{sub}</span>
          </Tag>
        </div>
      );
    };

    return (
      <div key={`pair-${num}`} className="flex flex-row items-stretch gap-0.5 flex-1 min-w-[92px]">
        {renderSide("B", cb, subB, countB)}
        {renderSide("A", ca, subA, countA)}
      </div>
    );
  };

  // 중앙 22 단독 셀 · ★BEST 배지 + 카테고리 + 라벨 + 상품수 배지
  const centerCell = () => {
    const zd = ZONE_DEFS.find(z => z.num === STORE_AISLE_CENTER);
    const centerLabel = getZoneSubLabel("22") || (zd?.category ?? "");
    const count = zoneItemCounts?.["22"] ?? 0;
    const handleClick = cellClickable ? () => onZoneClick!("22") : undefined;
    const Tag: any = cellClickable ? "button" : "div";
    const extra = cellClickable ? { type: "button" as const, onClick: handleClick } : {};
    return (
      <div className="flex flex-col items-center gap-0.5 flex-none w-[54px] min-w-[54px]">
        {showBestBadges && (
          <div className="min-h-[18px] flex items-center justify-center">{rankBadge("22")}</div>
        )}
        <Tag
          {...extra}
          className={`w-full text-[10px] font-bold text-slate-700 bg-white border border-slate-300 rounded px-0.5 py-1 leading-tight text-center ${centerMin} flex items-center justify-center overflow-hidden ${cellInteractive}`}
          title={`${STORE_AISLE_CENTER} · ${centerLabel}${count > 0 ? ` · ${count}개 상품` : ""}`}
        >
          <span className="line-clamp-6">{centerLabel}</span>
        </Tag>
        <div className="w-full flex items-center justify-center gap-0.5 flex-wrap mt-0.5">
          <span className="text-[10px] font-black text-white bg-slate-600 rounded px-1 leading-none py-0.5">{getZoneLabel(STORE_AISLE_CENTER)}</span>
          {count > 0 && (
            <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 border border-emerald-300 rounded px-1 leading-none tabular-nums">{count}</span>
          )}
        </div>
      </div>
    );
  };

  // ── 매장 배치 · 상단벽 · 중앙진열대 · 하단벽 · 동측 wing ───────────────
  const body = (
    <div className="flex flex-col gap-1.5 min-w-[720px]">
      {/* 상단 · main map (상단벽 · 중앙 22+8B/8A→1B/1A · 하단벽) */}
      <div className="flex flex-col gap-1.5">
        {/* 상단 벽면 */}
        <div>
          <div className="text-[8px] font-black text-emerald-600 uppercase tracking-wider mb-0.5 px-0.5">상단 벽면 (21→9)</div>
          <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
            {STORE_TOP_WALL.map(n => wallCell(n))}
          </div>
        </div>
        {/* 중앙 진열대 · 22 + 8B/8A→1B/1A (17셀) */}
        <div>
          <div className="text-[8px] font-black text-blue-600 uppercase tracking-wider mb-0.5 px-0.5">중앙 진열대 (22 · 8B|8A → 1B|1A · 17구역)</div>
          <div className="flex items-stretch justify-start gap-1.5 bg-slate-100 border border-slate-200 py-1.5 px-1.5 rounded-lg">
            {centerCell()}
            {STORE_AISLE_PAIRS.map(n => pairCell(n))}
          </div>
        </div>
        {/* 하단 벽면 */}
        <div>
          <div className="text-[8px] font-black text-amber-600 uppercase tracking-wider mb-0.5 px-0.5">하단 벽면 (23→34)</div>
          <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))" }}>
            {STORE_BOTTOM_WALL.map(n => wallCell(n))}
          </div>
        </div>
      </div>

      {/* 하단 · 동측 wing · 수평 8셀 */}
      <div className="border-t border-violet-200 pt-1.5">
        <div className="text-[8px] font-black text-violet-600 uppercase tracking-wider mb-0.5 px-0.5">동측 wing (35→42) · 이벤트 · 카운터 · 조제실</div>
        <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(8, minmax(0, 1fr))" }}>
          {STORE_VERTICAL_WING.map(n => wallCell(n))}
        </div>
      </div>
    </div>
  );

  // ── 렌더링 · collapsible 옵션에 따라 헤더/컨테이너 스타일 분기 ─────────
  if (collapsible) {
    return (
      <div className="mb-3 border border-violet-100 rounded-xl bg-violet-50/30 overflow-hidden">
        <button
          type="button"
          onClick={() => setCollapsed(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-violet-100/40 transition cursor-pointer"
        >
          <span className="text-[11px] font-black text-violet-700 inline-flex items-center gap-1">{title}</span>
          <span className="text-[10px] font-black text-violet-600">{collapsed ? "펼치기 ▼" : "접기 ▲"}</span>
        </button>
        {!collapsed && <div className="p-2 overflow-x-auto">{body}</div>}
      </div>
    );
  }

  // 비접이식 · 심플 컨테이너
  return (
    <div className="p-2 overflow-x-auto">{body}</div>
  );
};

export default StoreZoneMap;
export { StoreZoneMap };
