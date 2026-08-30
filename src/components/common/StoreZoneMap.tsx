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
import { getZoneSubLabel } from "../../constants/zoneLabels";
import { StatusPill } from "./StatusPill";
import { MapPin, User, GripVertical } from "lucide-react";
// 2026-08-30 · 사용자 지시 · 셀 클릭 popover picker · zone_defs 편집
import { ZoneCellPicker } from "./ZoneCellPicker";
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
  /** 2026-08-30 · 사용자 지시 · 셀 클릭 시 ZoneCellPicker popover 오픈 · zone_defs 카테고리·상세 편집 · true 면 onZoneClick 무시하고 popover 우선 */
  enableCellPicker?: boolean;
  /** 편집 권한 (lv≥9) · enableCellPicker=true 일 때만 유효 · 없으면 조회만 */
  cellPickerCanEdit?: boolean;
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
  enableCellPicker = false,
  cellPickerCanEdit = false,
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

  // 2026-08-26 · 사용자 지시 · 글씨 완전 표시 · 셀 높이 대폭 확장 · 카테고리 텍스트 안 잘림
  //   · auto-rows-fr 로 grid 내 모든 셀 높이 통일 (제일 긴 셀 기준)
  // 2026-08-29 · 사용자 지시 · 모든 셀 높이 통일 · 가장 큰 셀 (centerMin) 기준
  //   · 카테고리 텍스트 100% 표시 · 셀별 높이 편차 제거 · 시각적 통일
  const wallMin   = compact ? "min-h-[180px]" : "min-h-[240px]";
  const cellMin   = compact ? "min-h-[180px]" : "min-h-[240px]";
  const centerMin = compact ? "min-h-[180px]" : "min-h-[240px]";

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

  // 2026-08-26 · 사용자 지시 · hover 시 상세카테고리 (description) 커스텀 팝업
  //   · 네이티브 title tooltip 은 지연 · 못생김 · 커스텀 오버레이로 즉시 표시
  //   · group-hover · z-50 · pointer-events-none · 다른 셀 위 렌더
  const HoverDetail: React.FC<{ title: string; desc: string; align?: "center" | "left" | "right" }> = ({ title, desc, align = "center" }) => {
    const alignCls = align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";
    return (
      <div
        className={`absolute top-full mt-1 ${alignCls} z-50 min-w-[240px] max-w-[360px] p-2.5 bg-white border-2 border-brand-deep rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 whitespace-normal break-keep`}
        role="tooltip"
      >
        <div className="text-[11px] font-bold text-brand-deep uppercase tracking-wider mb-1 pb-1 border-b border-line">{title}</div>
        <div className="text-[12px] text-ink leading-relaxed whitespace-pre-wrap">{desc}</div>
      </div>
    );
  };

  // 벽면·수직윙 셀 · aspect ratio 1:1.6 · 라벨 + 카테고리
  const wallCell = (num: number) => {
    const zd = ZONE_DEFS.find(z => z.num === num);
    const cat = getZoneSubLabel(num) || (zd?.category ?? "");
    const count = zoneItemCounts?.[String(num)] ?? 0;
    const zoneId = String(num);
    const handleClick = cellClickable ? () => onZoneClick!(zoneId) : undefined;
    // 2026-08-30 · picker 모드 · onZoneClick 무시 · popover 우선
    const usePicker = enableCellPicker;
    const Tag: any = (cellClickable && !usePicker) ? "button" : "div";
    const extra = (cellClickable && !usePicker) ? { type: "button" as const, onClick: handleClick } : {};
    const dragProps = dragHandlers(num);
    const dragClass = cellStateClass(num);
    const cellContent = (
      <Tag
        key={num}
        {...extra}
        {...dragProps}
        className={`relative group rounded-md overflow-visible border border-stone-300 bg-white shadow-sm flex flex-col items-center ${wallMin} ${usePicker ? "cursor-pointer hover:ring-2 hover:ring-brand-tint hover:border-brand-deep/40 transition" : cellInteractive} ${dragClass}`}
        title={`${zd?.label ?? num} · ${cat}${usePicker ? " · 클릭하여 편집" : enableDrag ? " · 길게 눌러 드래그" : ""}`}
      >
        {/* 상단 · ★BEST 배지 (옵션) · 배지 없어도 line 은 유지 (레이아웃 안정) */}
        {showBestBadges && (
          <div className="w-full min-h-[18px] flex items-center justify-center pt-0.5">
            {rankBadge(zoneId)}
          </div>
        )}
        <div className="w-full bg-stone-50 px-1.5 py-1.5 flex flex-col items-center gap-1 flex-1 justify-center relative rounded-md overflow-hidden">
          {enableDrag && (
            <span className="absolute top-0.5 right-0.5 text-zinc-400" aria-hidden><GripVertical size={10} /></span>
          )}
          <div className="flex items-center justify-center">
            {/* 2026-08-26 · 사용자 지시 · 원본 num 직접 표시 · getZoneLabel 매핑 우회 (서버 1-16 순차 라벨 무시) */}
            <span className="text-[11px] font-bold text-white bg-amber-700 rounded px-1.5 py-0.5 leading-none">{num}</span>
          </div>
          {/* 2026-08-26 · 사용자 지시 · line-clamp 제거 · 글씨 크기에 맞춰 셀 자동 성장 · break-keep 로 단어 안 짤림 */}
          <span className="text-[13px] font-bold text-stone-800 leading-snug text-center break-keep whitespace-normal">{cat}</span>
        </div>
        {/* 2026-08-26 · 사용자 지시 · hover · 상세카테고리 커스텀 팝업 · picker 모드에선 안 표시 (popover 와 충돌 방지) */}
        {!usePicker && zd?.description && <HoverDetail title={`${zoneId} · 상세카테고리${count > 0 ? ` · ${count}개 상품` : ""}`} desc={zd.description} />}
      </Tag>
    );
    if (usePicker) {
      return (
        <ZoneCellPicker key={num} zoneNum={num} subKey={null} canEdit={cellPickerCanEdit} trigger={cellContent} />
      );
    }
    return cellContent;
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

    // 2026-08-26 · 사용자 지시 · 서브별 상세카테고리 (descriptionA/B) tooltip
    const descA = zd?.descriptionA;
    const descB = zd?.descriptionB;
    const renderSide = (
      side: "A" | "B",
      colors: typeof ca,
      sub: string,
      count: number,
      subDesc: string | undefined,
    ) => {
      const zoneId = `${num}${side}`;
      const usePicker = enableCellPicker;
      const handleClick = cellClickable ? () => onZoneClick!(zoneId) : undefined;
      const Tag: any = (cellClickable && !usePicker) ? "button" : "div";
      const extra = (cellClickable && !usePicker) ? { type: "button" as const, onClick: handleClick } : {};
      // 2026-08-23 · #181 Phase 2 · pair 셀은 num 단위 드래그 (A/B 동시 이동 · 데이터가 num 에 묶여있음)
      const dragProps = dragHandlers(num);
      const dragClass = cellStateClass(num);
      const sideContent = (
        <Tag
          {...extra}
          {...dragProps}
          className={`w-full font-bold ${colors.text} ${colors.bg} border-2 ${colors.border} rounded px-1 py-1.5 leading-tight text-center ${cellMin} flex flex-col items-center justify-center gap-1 ${usePicker ? "cursor-pointer hover:ring-2 hover:ring-brand-tint transition" : cellInteractive} ${dragClass}`}
          title={`${zoneId} · ${sub}${usePicker ? " · 클릭하여 편집" : enableDrag ? " · 길게 눌러 드래그" : ""}`}
        >
          <div className="flex items-center justify-center">
            {/* 2026-08-26 · 사용자 지시 · zoneId ("1A"/"1B") 그대로 표시 · getZoneLabel 매핑 우회 */}
            <span className={`text-[11px] font-bold text-white ${colors.labelBg} rounded px-1.5 py-0.5 leading-none`}>{zoneId}</span>
          </div>
          {/* 2026-08-26 · line-clamp 제거 · break-keep · 자동 확장 */}
          <span className="text-[13px] leading-snug break-keep whitespace-normal">{sub}</span>
        </Tag>
      );
      return (
        <div className="flex flex-col items-stretch gap-0.5 flex-1 min-w-[52px] relative group">
          {showBestBadges && (
            <div className="min-h-[18px] flex items-center justify-center">{rankBadge(zoneId)}</div>
          )}
          {usePicker
            ? <ZoneCellPicker zoneNum={num} subKey={side} canEdit={cellPickerCanEdit} trigger={sideContent} align={side === "B" ? "start" : "end"} />
            : sideContent
          }
          {/* 2026-08-26 · 사용자 지시 · hover · 서브별 상세카테고리 커스텀 팝업 · picker 모드에선 안 표시 */}
          {!usePicker && subDesc && <HoverDetail title={`${zoneId} · 상세카테고리${count > 0 ? ` · ${count}개 상품` : ""}`} desc={subDesc} align={side === "B" ? "left" : "right"} />}
        </div>
      );
    };

    return (
      <div key={`pair-${num}`} className="flex flex-row items-stretch gap-0.5 flex-1 min-w-[108px]">
        {renderSide("B", cb, subB, countB, descB)}
        {renderSide("A", ca, subA, countA, descA)}
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
          className={`w-full text-[11px] font-bold text-zinc-700 bg-white border border-zinc-300 rounded px-1 py-1.5 leading-snug text-center ${centerMin} flex items-center justify-center ${cellInteractive} ${dragClass}`}
          title={`${STORE_AISLE_CENTER} · ${centerLabel}${count > 0 ? ` · ${count}개 상품` : ""}${zd?.description ? `\n\n[상세]\n${zd.description}` : ""}${enableDrag ? "\n\n(길게 눌러 드래그)" : ""}`}
        >
          <span className="break-keep whitespace-normal">{centerLabel}</span>
        </Tag>
        <div className="w-full flex items-center justify-center gap-0.5 flex-wrap mt-0.5">
          {/* 2026-08-26 · 사용자 지시 · 원본 num 직접 표시 */}
          <span className="text-[10px] font-bold text-white bg-zinc-600 rounded px-1 leading-none py-0.5">{STORE_AISLE_CENTER}</span>
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
            // 2026-08-26 · 사용자 지시 · zoneId 그대로 · getZoneLabel 매핑 우회
            const label = zoneId;
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
          <div className="grid gap-0.5 items-stretch auto-rows-fr" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
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
          <div className="grid gap-0.5 items-stretch auto-rows-fr" style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))" }}>
            {STORE_BOTTOM_WALL.map(n => wallCell(n))}
          </div>
        </div>
      </div>

      {/* 하단 · 동측 wing · 수평 8셀 · 2026-08-26 · 상하 여백 강화 (겹침 방지 · 사용자 지시) */}
      <div className="border-t-2 border-violet-200 pt-5 mt-4 pb-3">
        <div className="text-[11px] font-bold text-violet-600 uppercase tracking-wider mb-2 px-0.5">동측 wing (35→42) · 이벤트 · 카운터 · 조제실</div>
        <div className="grid gap-1 pb-2 items-stretch auto-rows-fr" style={{ gridTemplateColumns: "repeat(8, minmax(0, 1fr))" }}>
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
