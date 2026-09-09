// src/components/common/StoreZoneMap.tsx
// 2026-09-08 · 14×8 직사각형 그리드 레이아웃으로 전면 재설계
//   참조: src/sample/zonecategory.png
//
// 하나의 구역도 컴포넌트를 두 곳에서 공용:
//   1. SalesTrendPage · CategoryTab · 판매순위 rank ★BEST 배지 표시
//   2. DisplayPage · 모바일 fullscreen 매장 구역도 (읽기 전용)
//   3. ZoneEditPanel · 편집 모드 (drag-reorder · ZoneCellPicker)

import React, { useEffect, useRef, useState } from "react";
import {
  STORE_TOP_WALL, STORE_BOTTOM_WALL, STORE_LEFT_WALL,
  STORE_AISLE_COLUMNS, CAT_A_COLORS, CAT_B_COLORS,
  EVENT_ZONE_COLOR, getWallCellColor,
  // 2026-09-09 · 카운터존 45~50 · DisplayStoreMap 과 동일 렌더
  COUNTER_ZONE_CELLS,
} from "../../constants/storeMapLayout";
import { useZoneDefs } from "../../hooks/useZoneDefs";
import { getZoneSubLabel } from "../../constants/zoneLabels";
import { StatusPill } from "./StatusPill";
import { MapPin, User, GripVertical } from "lucide-react";
import { ZoneCellPicker } from "./ZoneCellPicker";
import { TIMING } from "../../constants/timing";

export interface StoreZoneMapProps {
  /** 구역별 상품 수 · key = zone id (예: "1A", "9B", "22") */
  zoneItemCounts?: Record<string, number>;
  /** 구역별 판매순위 rank (1부터 · Top 10 만 ★BEST 배지 표시) */
  zoneRankMap?: Record<string, number>;
  /** BEST 배지 표시 여부 · default false */
  showBestBadges?: boolean;
  /** 셀 클릭 시 콜백 */
  onZoneClick?: (zoneId: string) => void;
  /** 셀 클릭 시 ZoneCellPicker popover 오픈 · true 면 onZoneClick 무시하고 popover 우선 */
  enableCellPicker?: boolean;
  /** 편집 권한 (lv≥9) · enableCellPicker=true 일 때만 유효 */
  cellPickerCanEdit?: boolean;
  /** 컴팩트 모드 · true 면 셀 크기·폰트 축소 */
  compact?: boolean;
  /** 접기/펴기 지원 */
  collapsible?: boolean;
  /** 초기 접힘 상태 · collapsible=true 일 때만 */
  defaultCollapsed?: boolean;
  /** 헤더 타이틀 · collapsible=true 일 때만 표시 */
  title?: string;
  /**
   * 모바일 테이블 모드
   * true 이면 sm 미만 화면에서 지도 대신 구역 목록 테이블을 표시
   */
  mobileTable?: boolean;
  /** 모바일 테이블에 표시할 구역별 담당자 */
  zoneMobileStaffMap?: Record<string, string>;
  /** 모바일 테이블에 표시할 구역별 pending 건수 */
  zonePendingMap?: Record<string, number>;
  /**
   * 편집 모드 (관리자 전용) · true 이면 long-press → 드래그 활성
   */
  editing?: boolean;
  /** 편집 모드 · 드래그 스왑 콜백 */
  onZoneReorder?: (fromNum: number, toNum: number) => void;
}

function rankBadgeClass(rank: number): string {
  if (rank <= 2)  return "bg-rose-600 text-white border-red-700 shadow-md";
  if (rank <= 4)  return "bg-sky-500 text-white border-blue-700 shadow-md";
  if (rank <= 6)  return "bg-emerald-500 text-white border-green-700 shadow-md";
  if (rank <= 8)  return "bg-violet-500 text-white border-purple-700 shadow-md";
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
  // ── 드래그 재정렬 state ──────────────────────────────────────────────────
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
      onDragLeave: () => { if (dropTargetNum === num) setDropTargetNum(null); },
      onDrop: (e) => {
        e.preventDefault();
        const from = draggingNum;
        setDraggingNum(null); setDropTargetNum(null); setArmedNum(null);
        if (from !== null && from !== num) onZoneReorder!(from, num);
      },
      onDragEnd: () => { setDraggingNum(null); setDropTargetNum(null); setArmedNum(null); },
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
    if (draggingNum === num)                          parts.push("opacity-50");
    if (dropTargetNum === num)                        parts.push("ring-2 ring-emerald-500 ring-offset-1");
    if (armedNum === num && draggingNum === null)     parts.push("ring-2 ring-amber-400 animate-pulse");
    return parts.join(" ");
  };

  // zone-labels-changed → 강제 리렌더
  const [, setZoneLabelVersion] = useState(0);
  useEffect(() => {
    const handler = () => setZoneLabelVersion(v => v + 1);
    window.addEventListener("zone-labels-changed", handler);
    return () => window.removeEventListener("zone-labels-changed", handler);
  }, []);

  const { zones: ZONE_DEFS, zonesRaw } = useZoneDefs();

  const cellIdByNumSide = (num: number, side: "A" | "B" | null): number | null => {
    const zd = ZONE_DEFS.find(z => z.num === num) as any;
    if (!zd) return null;
    const rowId = side === "A" ? zd.__rowIdA : side === "B" ? zd.__rowIdB : zd.__rowId;
    if (!rowId) return null;
    return zonesRaw.find(r => r.id === rowId)?.cellId ?? null;
  };

  const [collapsed, setCollapsed] = useState(collapsible ? defaultCollapsed : false);

  const cellClickable = typeof onZoneClick === "function";
  const cellInteractive = cellClickable ? "cursor-pointer hover:brightness-95 transition" : "";

  // 셀 높이 클래스
  const wallCellH  = compact ? "min-h-[120px]" : "min-h-[160px]";
  const aisleCellH = compact ? "min-h-[100px]" : "min-h-[140px]";

  // BEST 배지
  const rankBadge = (zoneId: string) => {
    if (!showBestBadges) return null;
    const rank = zoneRankMap?.[zoneId];
    if (!rank || rank > 10) return null;
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-[12px] font-bold border rounded px-1.5 py-0.5 leading-none tabular-nums ${rankBadgeClass(rank)}`}
        title={`판매 BEST ${rank}위`}
      >
        ★ BEST{rank}
      </span>
    );
  };

  // hover 상세카테고리 팝업
  const HoverDetail: React.FC<{ title: string; desc: string; align?: "center" | "left" | "right" }> = ({ title: t, desc, align = "center" }) => {
    const alignCls = align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";
    return (
      <div
        className={`absolute top-full mt-1 ${alignCls} z-50 min-w-[240px] max-w-[360px] p-2.5 bg-white border-2 border-brand-deep rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 whitespace-normal break-keep`}
        role="tooltip"
      >
        <div className="text-[13px] font-bold text-brand-deep uppercase tracking-wider mb-1 pb-1 border-b border-line">{t}</div>
        <div className="text-[14px] text-ink leading-relaxed whitespace-pre-wrap">{desc}</div>
      </div>
    );
  };

  // ─── 벽면 셀 ────────────────────────────────────────────────────────────
  const wallCell = (num: number, position?: "top" | "bottom" | "left") => {
    const c = getWallCellColor(num);
    const zd = ZONE_DEFS.find(z => z.num === num);
    const cat = getZoneSubLabel(num) || (zd?.category ?? "");
    const count = zoneItemCounts?.[String(num)] ?? 0;
    const zoneId = String(num);
    const handleClick = cellClickable ? () => onZoneClick!(zoneId) : undefined;
    const usePicker = enableCellPicker;
    const Tag: any = (cellClickable && !usePicker) ? "button" : "div";
    const extra = (cellClickable && !usePicker) ? { type: "button" as const, onClick: handleClick } : {};
    const dragProps = dragHandlers(num);
    const dragClass = cellStateClass(num);
    const cid = cellIdByNumSide(num, null);

    const cellContent = (
      <Tag
        key={num}
        {...extra}
        {...dragProps}
        className={`relative group rounded-md overflow-visible border ${c.border} ${c.bg} shadow-sm flex flex-col items-stretch ${wallCellH} w-full ${usePicker ? "cursor-pointer hover:ring-2 hover:ring-brand-tint hover:border-brand-deep/40 transition" : cellInteractive} ${dragClass}`}
        title={`${zd?.label ?? num} · ${cat}${usePicker ? " · 클릭하여 편집" : enableDrag ? " · 길게 눌러 드래그" : ""}`}
      >
        {showBestBadges && (
          <div className="w-full min-h-[18px] flex items-center justify-center pt-0.5">
            {rankBadge(zoneId)}
          </div>
        )}
        <div className="w-full px-1.5 pt-6 pb-2 flex flex-col items-center gap-1.5 flex-1 relative rounded-md overflow-hidden">
          {enableDrag && (
            <span className="absolute top-0.5 right-0.5 text-zinc-400" aria-hidden><GripVertical size={10} /></span>
          )}
          {cid != null && (
            <span className="absolute top-0.5 left-0.5 text-[12px] font-bold text-brand-deep bg-brand-tint/70 border border-brand-deep/20 rounded px-1 py-px leading-none tabular-nums" title={`셀번호 ${cid}`}>
              #{cid}
            </span>
          )}
          <div className="flex items-center justify-center shrink-0">
            <span className={`text-[13px] font-bold text-white ${c.labelBg} rounded px-1.5 py-0.5 leading-none`}>{num}</span>
          </div>
          <div className="flex-1 w-full flex items-start justify-center pt-1">
            <span className={`text-[15px] font-bold ${c.text} leading-snug text-center break-keep whitespace-normal`}>{cat}</span>
          </div>
        </div>
        {!usePicker && zd?.description && (
          <HoverDetail
            title={`${zoneId} · 상세카테고리${count > 0 ? ` · ${count}개 상품` : ""}`}
            desc={zd.description}
          />
        )}
      </Tag>
    );

    if (usePicker && cid != null) {
      return <ZoneCellPicker key={num} cellId={cid} canEdit={cellPickerCanEdit} trigger={cellContent} />;
    }
    return cellContent;
  };

  // ─── aisle pair 셀 (B 위 / A 아래 · 세로 배치) ───────────────────────────
  const aisleCell = (num: number, side: "A" | "B") => {
    const isA = side === "A";
    const colors = isA ? (CAT_A_COLORS[num] ?? CAT_A_COLORS[1]) : (CAT_B_COLORS[num] ?? CAT_B_COLORS[1]);
    const zd = ZONE_DEFS.find(z => z.num === num);
    const sub = isA
      ? (getZoneSubLabel(`${num}A`) || (zd?.subA ?? ""))
      : (getZoneSubLabel(`${num}B`) || (zd?.subB ?? ""));
    const descSide = isA ? zd?.descriptionA : zd?.descriptionB;
    const count = zoneItemCounts?.[`${num}${side}`] ?? 0;
    const zoneId = `${num}${side}`;
    const usePicker = enableCellPicker;
    const handleClick = cellClickable ? () => onZoneClick!(zoneId) : undefined;
    const Tag: any = (cellClickable && !usePicker) ? "button" : "div";
    const extra = (cellClickable && !usePicker) ? { type: "button" as const, onClick: handleClick } : {};
    const dragProps = dragHandlers(num);
    const dragClass = cellStateClass(num);
    const cid = cellIdByNumSide(num, side);
    const raw = cid != null ? zonesRaw.find(r => r.cellId === cid) : null;
    const zoneLabel = raw?.zone ?? zoneId;

    const sideContent = (
      <Tag
        {...extra}
        {...dragProps}
        className={`relative w-full font-bold ${colors.text} ${colors.bg} border-2 ${colors.border} rounded px-1 pt-2 pb-2 leading-tight text-center ${aisleCellH} flex flex-col items-stretch gap-1.5 ${usePicker ? "cursor-pointer hover:ring-2 hover:ring-brand-tint transition" : cellInteractive} ${dragClass}`}
        title={`${zoneLabel} · ${sub}${usePicker ? " · 클릭하여 편집" : enableDrag ? " · 길게 눌러 드래그" : ""}`}
      >
        <div className="flex items-center justify-center shrink-0">
          <span className={`text-[13px] font-bold text-white ${colors.labelBg} rounded px-1.5 py-0.5 leading-none`}>{zoneId}</span>
        </div>
        <div className="flex-1 w-full flex items-start justify-center pt-1">
          <span className="text-[15px] leading-snug break-keep whitespace-normal">{sub}</span>
        </div>
      </Tag>
    );

    return (
      <div className="flex flex-col items-stretch gap-0.5 flex-1 min-w-[52px] relative group">
        {showBestBadges && (
          <div className="min-h-[18px] flex items-center justify-center">{rankBadge(zoneId)}</div>
        )}
        {usePicker
          ? (() => {
              const pickerCid = cellIdByNumSide(num, side);
              return pickerCid != null
                ? <ZoneCellPicker cellId={pickerCid} canEdit={cellPickerCanEdit} trigger={sideContent} align={side === "B" ? "start" : "end"} />
                : sideContent;
            })()
          : sideContent
        }
        {!usePicker && descSide && (
          <HoverDetail
            title={`${zoneId} · 상세카테고리${count > 0 ? ` · ${count}개 상품` : ""}`}
            desc={descSide}
            align={side === "B" ? "left" : "right"}
          />
        )}
      </div>
    );
  };

  // ─── 이벤트 셀 ──────────────────────────────────────────────────────────
  const eventCell = (side: "B" | "A") => {
    const c = EVENT_ZONE_COLOR;
    const zoneId = `이벤트${side}`;
    return (
      <div
        key={zoneId}
        className={`${c.bg} border ${c.border} rounded flex flex-col items-center justify-center px-1 py-2 gap-1 ${aisleCellH} w-full`}
      >
        <span className={`text-[13px] font-bold text-white ${c.labelBg} rounded px-1.5 py-0.5 leading-none`}>이벤트</span>
        <span className={`text-[14px] font-semibold ${c.text} text-center leading-tight`}>이벤트존</span>
        {showBestBadges && <div>{rankBadge("이벤트")}</div>}
      </div>
    );
  };

  // ─── aisle 칼럼 pair 렌더 (B/A 세로 배치 · 한 그리드셀 내부) ─────────────
  const renderAisleColPair = (b: number | string, a: number | string, aci: number, pairIdx: number) => {
    const isEvent = typeof b === "string";
    return (
      <div key={`ac-${aci}-p${pairIdx}`} className="flex flex-col gap-0.5 w-full h-full">
        {isEvent
          ? <>
              {eventCell("B")}
              {eventCell("A")}
            </>
          : <>
              {aisleCell(b as number, "B")}
              {aisleCell(a as number, "A")}
            </>
        }
      </div>
    );
  };

  // ─── 모바일 테이블 ────────────────────────────────────────────────────────
  const allZoneIds: string[] = [
    ...STORE_TOP_WALL.map((n, i) => i === 0 ? "32_top" : String(n)),   // 32 두번 중 두번째는 그냥 String
    ...STORE_LEFT_WALL.map(n => String(n)),
    ...STORE_AISLE_COLUMNS.flatMap(col => col.pairs.flatMap(({ b, a }) => [
      typeof b === "string" ? "이벤트B" : `${b}B`,
      typeof a === "string" ? "이벤트A" : `${a}A`,
    ])),
    ...STORE_BOTTOM_WALL.map(n => String(n)),
  ];

  // deduplicate 32 for mobile table
  const allZoneIdsDeduped = [
    ...STORE_TOP_WALL.filter((_, i) => i !== 0 || true).map(n => String(n)),
    ...STORE_LEFT_WALL.map(n => String(n)),
    ...STORE_AISLE_COLUMNS.flatMap(col => col.pairs.flatMap(({ b, a }) => [
      typeof b === "string" ? "이벤트B" : `${b}B`,
      typeof a === "string" ? "이벤트A" : `${a}A`,
    ])),
    ...STORE_BOTTOM_WALL.map(n => String(n)),
  ];
  // remove duplicate "32" entry
  const uniqueZoneIds = Array.from(new Set(allZoneIdsDeduped));

  const mobileTableEl = mobileTable ? (
    <div className="sm:hidden">
      <table className="w-full text-left border-collapse text-[13px]">
        <thead>
          <tr className="bg-zinc-50 text-zinc-500 font-bold uppercase tracking-wide">
            <th className="px-2 py-1.5 w-[20%]">번호</th>
            <th className="px-2 py-1.5 w-[35%]">이름</th>
            <th className="px-2 py-1.5 w-[25%]">담당자</th>
            <th className="px-2 py-1.5 w-[20%] text-right">상황</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {uniqueZoneIds.map(zoneId => {
            const numPart = parseInt(zoneId, 10);
            const zd = ZONE_DEFS.find(z => z.num === numPart);
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
                    <span className="ml-1 text-[12px] text-emerald-600 tabular-nums font-semibold">({count})</span>
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
                  {pending > 0 ? (
                    <StatusPill tone="amber" size="xs" icon={<MapPin size={8} />}>
                      대기 {pending}
                    </StatusPill>
                  ) : (
                    <span className="text-[12px] text-zinc-300">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : null;

  // ─── 2026-09-09 · 5×8 격자 재구성 · DisplayStoreMap 과 동일 · 공통 모듈화 ─────
  const body = (
    <div style={{ minWidth: compact ? "500px" : "620px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gridTemplateRows: "auto repeat(6, auto) auto",
          gap: "3px",
        }}
      >
        {/* Row 0: 상단 벽 · col-span-5 · 내부 grid 14셀 · 균등 크기 · row 최대 셀 기준 stretch */}
        <div style={{
          gridColumn: "1 / -1",
          gridRow: 1,
          display: "grid",
          gridTemplateColumns: `repeat(${STORE_TOP_WALL.length}, minmax(0, 1fr))`,
          gridAutoRows: "1fr",
          alignItems: "stretch",
        }}>
          {STORE_TOP_WALL.map((num, i) => (
            <div key={`tw-${i}`} className="min-w-0 px-1.5 py-1 relative group h-full">
              {typeof num === "number"
                ? wallCell(num, "top")
                : <div className="bg-zinc-100 border border-zinc-200 rounded text-[13px] font-bold text-zinc-400 flex items-center justify-center h-full min-h-[76px]">{num}</div>
              }
            </div>
          ))}
        </div>

        {/* Rows 1-6: 좌측 벽 (Col 1) */}
        {STORE_LEFT_WALL.map((num, i) => (
          <div key={`lw-${num}`} style={{ gridColumn: 1, gridRow: i + 2 }} className="relative group">
            {wallCell(num, "left")}
          </div>
        ))}

        {/* Rows 1-6: aisle · 각 pair · B (홀수 row) / A (짝수 row) 개별 셀 · 좌우 여백 */}
        {STORE_AISLE_COLUMNS.map((aisleCol, aci) => (
          aisleCol.pairs.map(({ b, a }, pairIdx) => (
            <React.Fragment key={`aisle-${aci}-${pairIdx}`}>
              <div style={{ gridColumn: aisleCol.col + 1, gridRow: pairIdx * 2 + 2 }} className="px-1.5 py-1 relative group">
                {typeof b === "string" ? eventCell("B") : aisleCell(b as number, "B")}
              </div>
              <div style={{ gridColumn: aisleCol.col + 1, gridRow: pairIdx * 2 + 3 }} className="px-1.5 py-1 relative group">
                {typeof a === "string" ? eventCell("A") : aisleCell(a as number, "A")}
              </div>
            </React.Fragment>
          ))
        ))}

        {/* Row 7: 하단 벽 · col-span-5 · 내부 grid 14셀 · 균등 크기 · row 최대 셀 기준 stretch */}
        <div style={{
          gridColumn: "1 / -1",
          gridRow: 8,
          display: "grid",
          gridTemplateColumns: `repeat(${STORE_BOTTOM_WALL.length}, minmax(0, 1fr))`,
          gridAutoRows: "1fr",
          alignItems: "stretch",
        }}>
          {STORE_BOTTOM_WALL.map((num, i) => (
            <div key={`bw-${i}`} className="min-w-0 px-1.5 py-1 relative group h-full">
              {wallCell(num, "bottom")}
            </div>
          ))}
        </div>
      </div>

      {/* 2026-09-09 · 카운터존 45~50 · 하단 별도 카드 · DisplayStoreMap 과 동일 */}
      <div className="mt-2 p-3 bg-white border border-line rounded-2xl flex flex-col gap-3 shadow-sm">
        <div className="flex items-center gap-2 pb-2 border-b border-zinc-100">
          <div className="w-6 h-6 rounded-lg bg-zinc-900 flex items-center justify-center shadow-sm">
            <span className="text-[15px]">🛒</span>
          </div>
          <span className="text-[15px] font-bold text-zinc-900 leading-none">카운터존</span>
          <span className="text-[13px] font-semibold text-zinc-400 leading-none uppercase tracking-wider">45 ~ 50</span>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {COUNTER_ZONE_CELLS.map((cell) => (
            <div key={`cz-${cell.num}`} className="flex flex-col items-center gap-1.5">
              <span className={`text-[12px] font-bold uppercase tracking-wider ${cell.kind === "event" ? "text-amber-700" : "text-brand-deep"}`}>
                {cell.label}
              </span>
              <span className="text-[13px] font-bold text-zinc-500 tabular-nums">{cell.num}</span>
              <div className={`w-full h-full min-h-[76px] rounded border ${cell.kind === "event" ? "bg-amber-50 border-amber-200" : "bg-brand-tint/40 border-brand-tint"} flex items-center justify-center px-1 py-1`}>
                <span className="text-[12px] font-semibold text-brand-deep tabular-nums">{cell.num}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── 렌더링 · collapsible 분기 ─────────────────────────────────────────────
  if (collapsible) {
    return (
      <div className="mb-3 border border-violet-100 rounded-xl bg-violet-50/30 overflow-hidden">
        <button
          type="button"
          onClick={() => setCollapsed(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-violet-100/40 transition cursor-pointer"
        >
          <span className="text-[13px] font-bold text-violet-700 inline-flex items-center gap-1">{title}</span>
          <span className="text-[12px] font-bold text-violet-600">{collapsed ? "펼치기 ▼" : "접기 ▲"}</span>
        </button>
        {!collapsed && (
          <>
            {mobileTableEl}
            <div className={`p-2 overflow-x-auto${mobileTable ? " hidden sm:block" : ""}`}>{body}</div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {mobileTableEl}
      <div className={`p-2 overflow-x-auto${mobileTable ? " hidden sm:block" : ""}`}>{body}</div>
    </>
  );
};

export default StoreZoneMap;
export { StoreZoneMap };
