// src/components/common/StoreZoneMap.tsx
// 매장 구역도 공용 컴포넌트 · 2026-08-03 (사용자 요청 · DisplayPage · SalesTrendPage 통합)
// 2026-08-05 · 수평윙 여백 추가 · 모바일 테이블 구조 추가
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

import React, { useEffect, useRef, useState } from "react";
import {
  STORE_TOP_WALL, STORE_AISLE_CENTER, STORE_AISLE_PAIRS, STORE_BOTTOM_WALL, STORE_VERTICAL_WING,
  CAT_A_COLORS, CAT_B_COLORS,
} from "../../constants/storeMapLayout";
// 2026-08-17 · 프레임워크 · useZoneDefs 훅 사용 · 설정 편집 시 자동 반영
import { useZoneDefs } from "../../hooks/useZoneDefs";
import { getZoneLabel, getZoneSubLabel } from "../../constants/zoneLabels";
import { StatusPill } from "./StatusPill";
import { MapPin, User, GripVertical } from "lucide-react";
// 2026-08-23 · #181 Phase 2 · 드래그 재정렬 long-press 타이밍 상수
import { TIMING } from "../../constants/timing";

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
  /**
   * 모바일 테이블 모드 · default false
   * true 이면 sm 미만 화면에서 지도 대신 구역 목록 테이블을 표시
   * 열: 번호 · 이름 · 담당자 · 상태
   * sm 이상에서는 항상 지도 표시
   */
  mobileTable?: boolean;
  /** 모바일 테이블에 표시할 구역별 담당자 · key=zoneId, value=담당자명 */
  zoneMobileStaffMap?: Record<string, string>;
  /** 모바일 테이블에 표시할 구역별 pending 건수 · key=zoneId, value=건수 */
  zonePendingMap?: Record<string, number>;
  /**
   * 2026-08-23 · #181 Phase 2 · 편집 모드 (관리자 전용)
   * true 이면 셀 long-press (500ms) → 드래그 활성 · 다른 셀로 drop 시 num 스왑
   * default false · 기존 소비자 안전 (readonly)
   */
  editing?: boolean;
  /** 편집 모드 · 드래그 스왑 콜백 · (fromNum → toNum) · 부모가 useZoneDefs 로 label/category 교환 */
  onZoneReorder?: (fromNum: number, toNum: number) => void;
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
    return "bg-rose-600 text-white border-red-700 shadow-md";
  if (rank <= 4)
    return "bg-sky-500 text-white border-blue-700 shadow-md";
  if (rank <= 6)
    return "bg-emerald-500 text-white border-green-700 shadow-md";
  if (rank <= 8)
    return "bg-violet-500 text-white border-purple-700 shadow-md";
  return "bg-zinc-400 text-white border-zinc-600 shadow-sm";
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
  mobileTable = false,
  zoneMobileStaffMap,
  zonePendingMap,
  editing = false,
  onZoneReorder,
}) => {
  // ── 2026-08-23 · #181 Phase 2 · 드래그 재정렬 · long-press (mobile) + HTML5 drag (desktop) ──
  const [draggingNum, setDraggingNum] = useState<number | null>(null);
  const [dropTargetNum, setDropTargetNum] = useState<number | null>(null);
  const [armedNum, setArmedNum] = useState<number | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPressTimer = () => {
    if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
  };
  useEffect(() => clearPressTimer, []);

  const enableDrag = editing && typeof onZoneReorder === "function";

  const dragHandlers = (num: number): React.HTMLAttributes<HTMLElement> & { draggable?: boolean } => {
    if (!enableDrag) return {};
    return {
      draggable: armedNum === num || (draggingNum !== null),
      onDragStart: (e) => {
        setDraggingNum(num);
        try { e.dataTransfer?.setData("text/plain", String(num)); } catch { /* noop */ }
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      },
      onDragOver: (e) => {
        if (draggingNum === null || draggingNum === num) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        if (dropTargetNum !== num) setDropTargetNum(num);
      },
      onDragLeave: () => {
        if (dropTargetNum === num) setDropTargetNum(null);
      },
      onDrop: (e) => {
        e.preventDefault();
        const from = draggingNum;
        setDraggingNum(null); setDropTargetNum(null); setArmedNum(null);
        if (from !== null && from !== num) onZoneReorder!(from, num);
      },
      onDragEnd: () => { setDraggingNum(null); setDropTargetNum(null); setArmedNum(null); },
      // long-press (mobile) · 500ms 유지 시 draggable 활성 후 native drag 유도
      onTouchStart: () => {
        clearPressTimer();
        pressTimerRef.current = setTimeout(() => { setArmedNum(num); }, TIMING.PRESS_LONG);
      },
      onTouchEnd: () => { clearPressTimer(); if (draggingNum === null) setArmedNum(null); },
      onTouchCancel: () => { clearPressTimer(); setArmedNum(null); },
    };
  };

  const cellStateClass = (num: number): string => {
    if (!enableDrag) return "";
    const parts: string[] = [];
    if (draggingNum === num) parts.push("opacity-50");
    if (dropTargetNum === num) parts.push("ring-2 ring-emerald-500 ring-offset-1");
    if (armedNum === num && draggingNum === null) parts.push("ring-2 ring-amber-400 animate-pulse");
    return parts.join(" ");
  };
  // 2026-07-31 · zone-labels-changed 수신 → 강제 리렌더 (라벨 편집 반영)
  const [, setZoneLabelVersion] = useState(0);
  useEffect(() => {
    const handler = () => setZoneLabelVersion(v => v + 1);
    window.addEventListener("zone-labels-changed", handler);
    return () => window.removeEventListener("zone-labels-changed", handler);
  }, []);

  // 2026-08-17 · 프레임워크 · 공통 zone defs 훅 · 설정 편집 시 자동 반영
  const { zones: ZONE_DEFS } = useZoneDefs();

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
        className={`inline-flex items-center gap-0.5 text-[10px] font-bold border rounded px-1.5 py-0.5 leading-none tabular-nums ${rankBadgeClass(rank)}`}
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
    const dragProps = dragHandlers(num);
    const dragClass = cellStateClass(num);
    return (
      <Tag
        key={num}
        {...extra}
        {...dragProps}
        className={`rounded-md overflow-hidden border border-stone-300 bg-white shadow-sm flex flex-col items-center ${wallMin} ${cellInteractive} ${dragClass}`}
        title={`${zd?.label ?? num} · ${cat}${count > 0 ? ` · ${count}개 상품` : ""}${zd?.description ? `\n\n[상세]\n${zd.description}` : ""}${enableDrag ? "\n\n(길게 눌러 드래그)" : ""}`}
      >
        {/* 상단 · ★BEST 배지 (옵션) · 배지 없어도 line 은 유지 (레이아웃 안정) */}
        {showBestBadges && (
          <div className="w-full min-h-[18px] flex items-center justify-center pt-0.5">
            {rankBadge(zoneId)}
          </div>
        )}
        <div className="w-full bg-stone-50 px-1 py-1 flex flex-col items-center gap-0.5 flex-1 justify-center relative">
          {enableDrag && (
            <span className="absolute top-0.5 right-0.5 text-zinc-400" aria-hidden><GripVertical size={10} /></span>
          )}
          <div className="flex items-center justify-center">
            <span className="text-[10px] font-bold text-white bg-amber-700 rounded px-1.5 leading-none">{getZoneLabel(num)}</span>
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
      // 2026-08-23 · #181 Phase 2 · pair 셀은 num 단위 드래그 (A/B 동시 이동 · 데이터가 num 에 묶여있음)
      const dragProps = dragHandlers(num);
      const dragClass = cellStateClass(num);
      return (
        <div className="flex flex-col items-stretch gap-0.5 flex-1 min-w-[44px]">
          {showBestBadges && (
            <div className="min-h-[18px] flex items-center justify-center">{rankBadge(zoneId)}</div>
          )}
          <Tag
            {...extra}
            {...dragProps}
            className={`w-full font-bold ${colors.text} ${colors.bg} border-2 ${colors.border} rounded px-0.5 py-1 leading-tight text-center ${cellMin} flex flex-col items-center justify-center overflow-hidden ${cellInteractive} ${dragClass}`}
            title={`${zoneId} · ${sub}${count > 0 ? ` · ${count}개 상품` : ""}${enableDrag ? " · 길게 눌러 드래그" : ""}`}
          >
            <div className="flex items-center justify-center mb-0.5">
              <span className={`text-[10px] font-bold text-white ${colors.labelBg} rounded px-1.5 leading-none`}>{getZoneLabel(zoneId)}</span>
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
    const dragProps = dragHandlers(STORE_AISLE_CENTER);
    const dragClass = cellStateClass(STORE_AISLE_CENTER);
    return (
      <div className="flex flex-col items-center gap-0.5 flex-none w-[54px] min-w-[54px]">
        {showBestBadges && (
          <div className="min-h-[18px] flex items-center justify-center">{rankBadge("22")}</div>
        )}
        <Tag
          {...extra}
          {...dragProps}
          className={`w-full text-[10px] font-bold text-zinc-700 bg-white border border-zinc-300 rounded px-0.5 py-1 leading-tight text-center ${centerMin} flex items-center justify-center overflow-hidden ${cellInteractive} ${dragClass}`}
          title={`${STORE_AISLE_CENTER} · ${centerLabel}${count > 0 ? ` · ${count}개 상품` : ""}${enableDrag ? " · 길게 눌러 드래그" : ""}`}
        >
          <span className="line-clamp-6">{centerLabel}</span>
        </Tag>
        <div className="w-full flex items-center justify-center gap-0.5 flex-wrap mt-0.5">
          <span className="text-[10px] font-bold text-white bg-zinc-600 rounded px-1 leading-none py-0.5">{getZoneLabel(STORE_AISLE_CENTER)}</span>
          {count > 0 && (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 rounded px-1 leading-none tabular-nums">{count}</span>
          )}
        </div>
      </div>
    );
  };

  // ── 모바일 테이블 · mobileTable=true · sm 미만 에서 구역 목록 테이블 표시 ──
  // 구역 순서: 상단벽 → 중앙(A/B 두 개) → 하단벽 → 동측 wing
  const allZoneIds: string[] = [
    ...STORE_TOP_WALL.map(n => String(n)),
    ...STORE_AISLE_PAIRS.flatMap(n => [`${n}B`, `${n}A`]),
    String(STORE_AISLE_CENTER),
    ...STORE_BOTTOM_WALL.map(n => String(n)),
    ...STORE_VERTICAL_WING.map(n => String(n)),
  ];

  const mobileTableEl = mobileTable ? (
    <div className="sm:hidden">
      <table className="w-full text-left border-collapse text-[11px]">
        <thead>
          <tr className="bg-zinc-50 text-zinc-500 font-bold uppercase tracking-wide">
            <th className="px-2 py-1.5 w-[20%]">번호</th>
            <th className="px-2 py-1.5 w-[35%]">이름</th>
            <th className="px-2 py-1.5 w-[25%]">담당자</th>
            <th className="px-2 py-1.5 w-[20%] text-right">상황</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {allZoneIds.map(zoneId => {
            const numPart = parseInt(zoneId, 10);
            const zd = ZONE_DEFS.find(z => z.num === numPart);
            const label = getZoneLabel(zoneId);
            const sub   = getZoneSubLabel(zoneId) || (zd?.category ?? "");
            const staff = zoneMobileStaffMap?.[zoneId] ?? "";
            const pending = zonePendingMap?.[zoneId] ?? 0;
            const count = zoneItemCounts?.[zoneId] ?? 0;
            return (
              <tr
                key={zoneId}
                className={`hover:bg-zinc-50/60 transition ${onZoneClick ? "cursor-pointer" : ""}`}
                onClick={onZoneClick ? () => onZoneClick(zoneId) : undefined}
              >
                <td className="px-2 py-1.5 align-middle">
                  <span className="font-bold text-zinc-700 tabular-nums">{label}</span>
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <span className="text-zinc-600 leading-tight break-words whitespace-normal">{sub || "-"}</span>
                  {count > 0 && (
                    <span className="ml-1 text-[10px] text-emerald-600 tabular-nums font-semibold">({count})</span>
                  )}
                </td>
                <td className="px-2 py-1.5 align-middle">
                  {staff ? (
                    <span className="text-zinc-600 inline-flex items-center gap-0.5">
                      <User size={9} className="text-zinc-400" />{staff}
                    </span>
                  ) : (
                    <span className="text-zinc-300">-</span>
                  )}
                </td>
                <td className="px-2 py-1.5 align-middle text-right">
                  {/* 2026-08-17 · StatusPill 프레임워크 통일 */}
                  {pending > 0 ? (
                    <StatusPill tone="amber" size="xs" icon={<MapPin size={8} />}>
                      대기 {pending}
                    </StatusPill>
                  ) : (
                    <span className="text-[10px] text-zinc-300">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : null;

  // ── 매장 배치 · 상단벽 · 중앙진열대 · 하단벽 · 동측 wing ───────────────
  const body = (
    <div className="flex flex-col gap-1.5 min-w-[720px]">
      {/* 상단 · main map (상단벽 · 중앙 22+8B/8A→1B/1A · 하단벽) */}
      <div className="flex flex-col gap-1.5">
        {/* 상단 벽면 */}
        <div>
          <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-0.5 px-0.5">상단 벽면 (21→9)</div>
          <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
            {STORE_TOP_WALL.map(n => wallCell(n))}
          </div>
        </div>
        {/* 중앙 진열대 · 22 + 8B/8A→1B/1A (17셀) */}
        <div>
          <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-0.5 px-0.5">중앙 진열대 (22 · 8B|8A → 1B|1A · 17구역)</div>
          <div className="flex items-stretch justify-start gap-1.5 bg-zinc-100 border border-line py-1.5 px-1.5 rounded-lg">
            {centerCell()}
            {STORE_AISLE_PAIRS.map(n => pairCell(n))}
          </div>
        </div>
        {/* 하단 벽면 */}
        <div>
          <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-0.5 px-0.5">하단 벽면 (23→34)</div>
          <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))" }}>
            {STORE_BOTTOM_WALL.map(n => wallCell(n))}
          </div>
        </div>
      </div>

      {/* 하단 · 동측 wing · 수평 8셀 · 2026-08-05 · 상하 여백 추가 (겹침 방지) */}
      <div className="border-t border-violet-200 pt-3 mt-1.5">
        <div className="text-[10px] font-bold text-violet-600 uppercase tracking-wider mb-1 px-0.5">동측 wing (35→42) · 이벤트 · 카운터 · 조제실</div>
        <div className="grid gap-0.5 pb-1" style={{ gridTemplateColumns: "repeat(8, minmax(0, 1fr))" }}>
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
          <span className="text-[11px] font-bold text-violet-700 inline-flex items-center gap-1">{title}</span>
          <span className="text-[10px] font-bold text-violet-600">{collapsed ? "펼치기 ▼" : "접기 ▲"}</span>
        </button>
        {!collapsed && (
          <>
            {/* 모바일 테이블 (sm 미만) */}
            {mobileTableEl}
            {/* 지도 (sm 이상 · mobileTable=false 이면 전체) */}
            <div className={`p-2 overflow-x-auto${mobileTable ? " hidden sm:block" : ""}`}>{body}</div>
          </>
        )}
      </div>
    );
  }

  // 비접이식 · 심플 컨테이너
  return (
    <>
      {/* 모바일 테이블 (sm 미만) */}
      {mobileTableEl}
      {/* 지도 (sm 이상 · mobileTable=false 이면 전체) */}
      <div className={`p-2 overflow-x-auto${mobileTable ? " hidden sm:block" : ""}`}>{body}</div>
    </>
  );
};

export default StoreZoneMap;
export { StoreZoneMap };
