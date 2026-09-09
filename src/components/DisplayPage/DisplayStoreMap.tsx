// src/components/DisplayPage/DisplayStoreMap.tsx
// 2026-09-08 · 14×8 직사각형 그리드 레이아웃으로 전면 재설계
//   참조: src/sample/zonecategory.png
//   Row 0: 상단벽 (32·32·33·44) 14셀
//   Row 1-6: 좌측벽 col0 (31→26) · aisle 4개 (col 2/5/8/12)
//   Row 7: 하단벽 (25→12) 14셀
import React from "react";
import { Bell } from "lucide-react";
import {
  STORE_TOP_WALL, STORE_BOTTOM_WALL, STORE_LEFT_WALL,
  STORE_AISLE_COLUMNS, CAT_A_COLORS, CAT_B_COLORS,
  EVENT_ZONE_COLOR, getWallCellColor,
  // 2026-09-08 · 사용자 지시 · 카운터존 45~50 (제품존과 별도)
  COUNTER_ZONE_CELLS,
} from "../../constants/storeMapLayout";
import { getZoneSubLabel } from "../../constants/zoneLabels";
import { Card } from "../common/Card";
import { SHIFT_BADGE } from "./DisplayPage.helpers";
import type { DisplayZone } from "../../utils/zoneUtils";
import type { TodayStaff } from "./DisplayPage.types";

interface DisplayStoreMapProps {
  ZONE_DEFS: any[];
  /** zone_defs 원본 rows · 셀 라벨 (zone) 조회용 · cellId 매칭 */
  zonesRaw?: Array<{ id: number; cellId: number; location?: string; zone?: string; category?: string; detailedCategory?: string }>;
  zones: DisplayZone[];
  todayStaff: TodayStaff[];
  staffColorMap: Map<number, number>;
  pendingAutoAssign: null | { prevZones: DisplayZone[]; assignedList: Array<{ zoneId: string; name: string; id: number }> };
  dragStaff: TodayStaff | null;
  dragStaffRef: React.MutableRefObject<TodayStaff | null>;
  setDragStaff: (s: TodayStaff | null) => void;
  setDragOverZoneId: (id: string | null) => void;
  setActiveStaffInfo: (s: TodayStaff | null) => void;
  onAutoAssign: () => void;
  onConfirmAutoAssign: () => void;
  onCancelAutoAssign: () => void;
  onZoneProductsOpen: (args: { zoneId: string; zoneNum: number; zoneLabel: string; category: string }) => void;
  renderZoneCellById: (id: string, classes?: string, wrapperClass?: string, hideRequest?: boolean) => React.ReactNode;
  renderZoneCell: (num: number, classes?: string, wrapperClass?: string, hideRequest?: boolean) => React.ReactNode;
  renderWallZoneCard: (num: number, position: "top" | "bottom") => React.ReactNode;
  renderRequestButton: (num: number, id?: string) => React.ReactNode;
}

export const DisplayStoreMap: React.FC<DisplayStoreMapProps> = ({
  ZONE_DEFS,
  zonesRaw = [],
  zones,
  todayStaff,
  staffColorMap,
  pendingAutoAssign,
  dragStaff,
  dragStaffRef,
  setDragStaff,
  setDragOverZoneId,
  setActiveStaffInfo,
  onAutoAssign,
  onConfirmAutoAssign,
  onCancelAutoAssign,
  onZoneProductsOpen,
  renderZoneCellById,
  renderZoneCell,
  renderWallZoneCard,
  renderRequestButton,
}) => {
  const STAFF_COLORS_LOCAL = [
    "bg-blue-100 text-blue-800 border-blue-300",
    "bg-violet-100 text-violet-800 border-violet-300",
    "bg-rose-100 text-rose-800 border-rose-300",
    "bg-amber-100 text-amber-800 border-amber-300",
    "bg-emerald-100 text-emerald-800 border-emerald-300",
    "bg-sky-100 text-sky-800 border-sky-300",
    "bg-pink-100 text-pink-800 border-pink-300",
    "bg-lime-100 text-lime-800 border-lime-300",
  ];

  // ─── 상단 벽면 셀 렌더 ────────────────────────────────────────────────────
  // 2026-09-09 · #14 · 사용자 지시 · 숫자구역 · AB구역과 동일 스타일 · WallZoneCard 담당자 카드 제거
  //   · 셀 · label + category 만 · 심플 · 담당자는 향후 팝오버로 (#23)
  //   · min-h · flex-1 · 표 격자 느낌 · AB 셀과 통일
  const renderTopWallCell = (num: number | string, key: string) => {
    if (typeof num !== "number") {
      return <div key={key} className="bg-zinc-100 border border-zinc-200 rounded text-[13px] font-bold text-zinc-400 flex items-center justify-center h-full min-h-[64px]">{num}</div>;
    }
    const c = getWallCellColor(num);
    const zd = ZONE_DEFS.find((z: any) => z.num === num);
    const cat = getZoneSubLabel(num) || (zd?.category ?? "");
    return (
      <button
        key={key}
        type="button"
        onClick={() => onZoneProductsOpen({ zoneId: String(num), zoneNum: num, zoneLabel: String(num), category: cat })}
        title={`${num} · ${cat} · 클릭 → 상품 조회`}
        className={`${c.bg} border ${c.border} rounded flex flex-col items-center justify-center min-h-[64px] px-1 py-1.5 gap-1 cursor-pointer hover:brightness-95 transition overflow-hidden`}
      >
        <span className={`text-[11px] font-bold text-white ${c.labelBg} rounded px-1.5 py-0.5 leading-none tabular-nums`}>{num}</span>
        <span className={`text-[11px] font-semibold ${c.text} text-center leading-tight break-keep whitespace-normal`}>{cat}</span>
      </button>
    );
  };

  // ─── 하단 벽면 셀 렌더 ────────────────────────────────────────────────────
  const renderBottomWallCell = (num: number, key: string) => {
    const c = getWallCellColor(num);
    const zd = ZONE_DEFS.find((z: any) => z.num === num);
    const cat = getZoneSubLabel(num) || (zd?.category ?? "");
    return (
      <button
        key={key}
        type="button"
        onClick={() => onZoneProductsOpen({ zoneId: String(num), zoneNum: num, zoneLabel: String(num), category: cat })}
        title={`${num} · ${cat} · 클릭 → 상품 조회`}
        className={`${c.bg} border ${c.border} rounded flex flex-col items-center justify-center min-h-[64px] px-1 py-1.5 gap-1 cursor-pointer hover:brightness-95 transition overflow-hidden`}
      >
        <span className={`text-[11px] font-bold text-white ${c.labelBg} rounded px-1.5 py-0.5 leading-none tabular-nums`}>{num}</span>
        <span className={`text-[11px] font-semibold ${c.text} text-center leading-tight break-keep whitespace-normal`}>{cat}</span>
      </button>
    );
  };

  // ─── 좌측 벽면 셀 렌더 ────────────────────────────────────────────────────
  const renderLeftWallCell = (num: number) => {
    const c = getWallCellColor(num);
    const zd = ZONE_DEFS.find((z: any) => z.num === num);
    const cat = getZoneSubLabel(num) || (zd?.category ?? "");
    return (
      <button
        key={`lw-${num}`}
        type="button"
        onClick={() => onZoneProductsOpen({ zoneId: String(num), zoneNum: num, zoneLabel: String(num), category: cat })}
        title={`${num} · ${cat} · 클릭 → 상품 조회`}
        className={`${c.bg} border ${c.border} rounded flex flex-col items-center justify-between px-0.5 py-1 gap-0.5 cursor-pointer hover:brightness-95 transition overflow-hidden w-full h-full`}
      >
        <span className={`text-[11px] font-bold text-white ${c.labelBg} rounded px-1 py-px leading-none tabular-nums`}>{num}</span>
        <span className={`text-[11px] font-semibold ${c.text} text-center leading-tight break-keep whitespace-normal`}>{cat}</span>
      </button>
    );
  };

  // ─── aisle pair 셀 렌더 (B 위 / A 아래) ───────────────────────────────────
  const renderAislePair = (b: number | string, a: number | string, aisleColIdx: number, pairIdx: number) => {
    const isEvent = typeof b === "string";

    const renderSide = (val: number | string, side: "B" | "A") => {
      if (isEvent) {
        const c = EVENT_ZONE_COLOR;
        const zd = typeof val === "number" ? ZONE_DEFS.find((z: any) => z.num === val) : null;
        const cat = zd ? (getZoneSubLabel(String(val)) || zd.category || "") : "이벤트";
        return (
          <div
            key={`event-${aisleColIdx}-${pairIdx}-${side}`}
            className={`${c.bg} border ${c.border} rounded flex flex-col items-center justify-center px-0.5 py-1 gap-0.5 overflow-hidden flex-1`}
          >
            <span className={`text-[11px] font-bold text-white ${c.labelBg} rounded px-1 py-px leading-none`}>이벤트</span>
            <span className={`text-[11px] font-semibold ${c.text} text-center leading-tight`}>{cat}</span>
          </div>
        );
      }

      const num = val as number;
      const ca = CAT_A_COLORS[num] ?? CAT_A_COLORS[1];
      const cb = CAT_B_COLORS[num] ?? CAT_B_COLORS[1];
      const colors = side === "B" ? cb : ca;
      const zd = ZONE_DEFS.find((z: any) => z.num === num);
      const sub = side === "B"
        ? (getZoneSubLabel(`${num}B`) || (zd?.subB ?? ""))
        : (getZoneSubLabel(`${num}A`) || (zd?.subA ?? ""));
      const zoneId = `${num}${side}`;
      // zonesRaw location lookup
      const rawRow = zonesRaw.find(r => r.id === (side === "B" ? (zd as any)?.__rowIdB : (zd as any)?.__rowIdA));
      const zoneLabel = rawRow?.location ?? zoneId;

      return (
        <button
          key={`pair-${aisleColIdx}-${pairIdx}-${side}`}
          type="button"
          onClick={() => onZoneProductsOpen({ zoneId, zoneNum: num, zoneLabel, category: sub })}
          title={`${zoneLabel} · ${sub} · 클릭 → 상품 조회`}
          className={`${colors.bg} border ${colors.border} rounded flex flex-col items-center justify-between px-0.5 py-1 gap-0.5 cursor-pointer hover:brightness-95 transition overflow-hidden flex-1`}
        >
          <span className={`text-[11px] font-bold text-white ${colors.labelBg} rounded px-1 py-px leading-none`}>{zoneId}</span>
          <span className={`text-[11px] ${colors.text} text-center leading-tight break-keep whitespace-normal`}>{sub}</span>
          <div className="w-full mt-auto">
            {renderZoneCellById(zoneId, "w-full min-h-[36px] flex flex-col justify-between items-center py-0.5 px-0.5 text-[11px]", "", true)}
          </div>
        </button>
      );
    };

    return (
      <div key={`aisle-col${aisleColIdx}-pair${pairIdx}`} className="flex flex-col gap-0.5 flex-1">
        {renderSide(b, "B")}
        {renderSide(a, "A")}
      </div>
    );
  };

  return (
    <div className="overflow-x-auto">
      <div className="relative p-3 bg-white rounded-2xl flex flex-col border border-line shadow-[0_1px_3px_rgba(15,23,42,0.05),0_8px_24px_-8px_rgba(15,23,42,0.10)] gap-2 min-h-[500px] w-full min-w-[900px] overflow-hidden">
        <span aria-hidden className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep opacity-90 z-10 pointer-events-none" />

        {/* 물류 출근직원 pill */}
        {todayStaff.length > 0 && (() => {
          const 물류 = todayStaff.filter(s => s.employee.position.includes("물류"));
          if (물류.length === 0) return null;
          const ORDER: Record<string, number> = { "오픈": 0, "미들": 1, "마감": 2 };
          const sortShift = (a: typeof todayStaff[0], b: typeof todayStaff[0]) =>
            (ORDER[a.scheduleType] ?? 3) - (ORDER[b.scheduleType] ?? 3);
          return (
            <div className="bg-white/95 backdrop-blur rounded-lg border border-orange-200 px-2 py-1.5 shadow-sm inline-flex flex-wrap items-center gap-1 mb-1 w-fit max-w-full">
              <span className="text-[15px] font-bold text-orange-700 mr-1">물류 출근직원 ({물류.length})</span>
              {물류.sort(sortShift).map(({ employee, scheduleType, workingHours }) => {
                const colorIdx = staffColorMap.get(employee.id) ?? 0;
                const chipColor = STAFF_COLORS_LOCAL[colorIdx % STAFF_COLORS_LOCAL.length];
                return (
                  <button
                    key={employee.id}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      const s = { employee, scheduleType, workingHours };
                      dragStaffRef.current = s;
                      setDragStaff(s);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(employee.id));
                    }}
                    onDragEnd={() => { dragStaffRef.current = null; setDragStaff(null); setDragOverZoneId(null); }}
                    onClick={() => setActiveStaffInfo({ employee, scheduleType, workingHours })}
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[15px] font-bold border cursor-grab active:cursor-grabbing transition hover:brightness-95 ${chipColor}`}
                    title={`${employee.name} · ${scheduleType}${workingHours ? ` · ${workingHours}` : ""} · 드래그하여 구역 배정`}
                  >
                    <span>{employee.name}</span>
                    <span className={`text-[15px] font-bold px-1 rounded ${SHIFT_BADGE[scheduleType] ?? "bg-zinc-100 text-zinc-700 border-line"}`}>
                      {scheduleType}
                    </span>
                  </button>
                );
              })}
              <button
                onClick={onAutoAssign}
                title="물류 출근직원 미리보기 배치 (확정 전엔 DB 저장·알림 없음)"
                className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 bg-violet-600 hover:bg-violet-700 text-white text-[15px] font-bold rounded-full shadow-sm transition cursor-pointer border border-violet-700"
              >
                임의배치
              </button>
              {pendingAutoAssign && (
                <>
                  <button
                    onClick={onConfirmAutoAssign}
                    title="DB 저장 + 각 담당자에게 날짜·배정구역 알림 전송"
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[15px] font-bold rounded-full shadow-sm transition cursor-pointer border border-emerald-700 animate-pulse"
                  >
                    <Bell size={9} /> 배치확정 ({pendingAutoAssign.assignedList.length})
                  </button>
                  <button
                    onClick={onCancelAutoAssign}
                    title="미리보기 취소 · 이전 배치로 되돌리기"
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-white hover:bg-zinc-50 text-zinc-600 text-[15px] font-bold rounded-full shadow-sm transition cursor-pointer border border-zinc-300"
                  >
                    취소
                  </button>
                </>
              )}
            </div>
          );
        })()}

        {/* 미리보기 배너 */}
        {pendingAutoAssign && (
          <Card variant="flat" bg="bg-violet-50" borderColor="border-violet-200" rounded="lg" padding="none" className="px-2 py-1 text-[14px] text-violet-700 mb-1 flex items-center gap-1.5">
            <span>임의배치 미리보기 중 — 배치를 조정한 뒤 위쪽 <b>배치확정</b> 버튼을 눌러 DB 저장 + 담당자 알림 전송</span>
          </Card>
        )}

        {/* 매장 구역도 헤더 */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[14px] font-bold text-zinc-700 uppercase tracking-wider">매장 구역도</span>
          <span className="text-[12px] text-zinc-400">14×8 그리드 · zonecategory 기준</span>
          <span className="ml-auto text-[12px] bg-rose-50 text-rose-700 border border-rose-300 font-extrabold px-1.5 rounded-full uppercase tracking-wider shadow-sm">유통기한 임박존</span>
        </div>

        {/* ── 14×8 그리드 매장 구역도 ──────────────────────────────────────── */}
        {/*
          Grid 구조:
            Row 0 (grid-row 1): 14 columns 상단 벽면 (full width)
            Row 1-6 (grid-row 2-7): col 0 = 좌측벽 · col 1,3,4,6,7,9,10,11,13 = 빈 공간 · col 2,5,8,12 = aisle pair columns
            Row 7 (grid-row 8): 14 columns 하단 벽면 (full width)

          aisle 각 col 은 B(위)/A(아래) 2행을 차지 (각 pair 는 rows 2개씩)
          3 pairs × 2 rows = 6 rows (2-7)
        */}
        <div
          className="w-full"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(14, minmax(0, 1fr))",
            gridTemplateRows: "auto repeat(6, minmax(56px, 1fr)) auto",
            gap: "3px",
            minWidth: "860px",
          }}
        >
          {/* Row 0: 상단 벽면 14셀 */}
          {STORE_TOP_WALL.map((num, i) => (
            <div key={`tw-${i}`} style={{ gridColumn: i + 1, gridRow: 1 }}>
              {renderTopWallCell(num, `tw-${i}-${num}`)}
            </div>
          ))}

          {/* Row 1-6: 좌측 벽면 (col 0) */}
          {STORE_LEFT_WALL.map((num, i) => (
            <div key={`lw-${num}`} style={{ gridColumn: 1, gridRow: i + 2 }}>
              {renderLeftWallCell(num)}
            </div>
          ))}

          {/* Row 1-6: aisle 칼럼들 (col 2, 5, 8, 12) */}
          {STORE_AISLE_COLUMNS.map((aisleCol, aci) => (
            aisleCol.pairs.map(({ b, a }, pairIdx) => (
              <div
                key={`aisle-${aci}-${pairIdx}`}
                style={{
                  gridColumn: aisleCol.col + 1, // 0-based → 1-based
                  gridRow: pairIdx + 2,          // rows 2-4 (each pair occupies 1 row, B and A stacked inside)
                }}
              >
                {renderAislePair(b, a, aci, pairIdx)}
              </div>
            ))
          ))}

          {/* Row 7: 하단 벽면 14셀 */}
          {STORE_BOTTOM_WALL.map((num, i) => (
            <div key={`bw-${i}`} style={{ gridColumn: i + 1, gridRow: 8 }}>
              {renderBottomWallCell(num, `bw-${i}-${num}`)}
            </div>
          ))}
        </div>

        {/* 2026-09-08 · 카운터존 · 45~50 순차 6셀 · 제품존과 별도 영역 */}
        <Card variant="raw-md" rounded="2xl" padding="none" className="w-full mt-2 p-3 flex flex-col gap-3 shadow-zinc-200/60">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-zinc-900 flex items-center justify-center shadow-sm">
                <span className="text-[15px]">🛒</span>
              </div>
              <span className="text-[15px] font-bold text-zinc-900 leading-none">카운터존</span>
              <span className="text-[13px] font-semibold text-zinc-400 leading-none uppercase tracking-wider">45 ~ 50</span>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {COUNTER_ZONE_CELLS.map((cell) => (
              <div key={`cz-${cell.num}`} className="flex flex-col items-center gap-1">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${cell.kind === "event" ? "text-amber-700" : "text-brand-deep"}`}>
                  {cell.label}
                </span>
                <span className="text-[13px] font-bold text-zinc-500 tabular-nums">{cell.num}</span>
                {renderZoneCell(cell.num, `w-full h-[60px] text-[13px] p-1 justify-center ${cell.kind === "event" ? "bg-amber-50 border-amber-200" : "bg-brand-tint/40 border-brand-tint"}`)}
              </div>
            ))}
          </div>
        </Card>

      </div>
    </div>
  );
};
