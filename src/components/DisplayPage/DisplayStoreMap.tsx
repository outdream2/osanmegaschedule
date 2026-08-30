// src/components/DisplayPage/DisplayStoreMap.tsx
// 2026-08-22 · Framework Phase 4 · DisplayPage.tsx 에서 분리 · 데스크탑 매장 배치도
import React from "react";
import { Bell } from "lucide-react";
import {
  STORE_TOP_WALL, STORE_AISLE_CENTER, STORE_AISLE_PAIRS, STORE_BOTTOM_WALL,
  CAT_A_COLORS, CAT_B_COLORS,
} from "../../constants/storeMapLayout";
import { getZoneLabel, getZoneSubLabel } from "../../constants/zoneLabels";
import { Card } from "../common/Card";
import { SHIFT_BADGE } from "./DisplayPage.helpers";
import type { DisplayZone } from "../../utils/zoneUtils";
import type { TodayStaff } from "./DisplayPage.types";

interface DisplayStoreMapProps {
  ZONE_DEFS: any[];
  /** 2026-08-30 · 사용자 지시 · zone_defs 원본 rows · 셀 라벨 (zone) 조회용 · cellId 매칭 */
  zonesRaw?: Array<{ id: number; cellId: number; zone: string; category: string; detailedCategory?: string }>;
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
  return (
    <div className="overflow-x-auto">
      {/* 2026-08-25 · 사용자 지시 · v9 목업 UI 원칙 반영 (구역도 셀은 제외 · surrounding 만 개선)
            · 배경 zinc-200 → white · 두꺼운 emerald-500 border → 얇은 line + shadow
            · 상단 v9 gradient accent · 폰트 +2 (섹션 라벨 · 헤더 · 캡션)
            · Attio / Linear tone · 파스텔 지양 · 딥네이비 accent */}
      <div className="relative p-3 bg-white rounded-2xl flex flex-col justify-between border border-line shadow-[0_1px_3px_rgba(15,23,42,0.05),0_8px_24px_-8px_rgba(15,23,42,0.10)] gap-2 min-h-[500px] w-full min-w-[820px] overflow-hidden">
        <span aria-hidden className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep opacity-90 z-10 pointer-events-none" />

        {/* 물류출근직원 pill */}
        {todayStaff.length > 0 && (() => {
          const 물류 = todayStaff.filter(s => s.employee.position.includes("물류"));
          if (물류.length === 0) return null;
          const ORDER: Record<string, number> = { "오픈": 0, "미들": 1, "마감": 2 };
          const sortShift = (a: typeof todayStaff[0], b: typeof todayStaff[0]) => (ORDER[a.scheduleType] ?? 3) - (ORDER[b.scheduleType] ?? 3);
          const STAFF_COLORS_LOCAL = ["bg-blue-100 text-blue-800 border-blue-300", "bg-violet-100 text-violet-800 border-violet-300", "bg-rose-100 text-rose-800 border-rose-300", "bg-amber-100 text-amber-800 border-amber-300", "bg-emerald-100 text-emerald-800 border-emerald-300", "bg-sky-100 text-sky-800 border-sky-300", "bg-pink-100 text-pink-800 border-pink-300", "bg-lime-100 text-lime-800 border-lime-300"];
          return (
            <div className="bg-white/95 backdrop-blur rounded-lg border border-orange-200 px-2 py-1.5 shadow-sm inline-flex flex-wrap items-center gap-1 mb-1 w-fit max-w-full">
              <span className="text-[13px] font-bold text-orange-700 mr-1">물류 출근직원 ({물류.length})</span>
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
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[13px] font-bold border cursor-grab active:cursor-grabbing transition hover:brightness-95 ${chipColor}`}
                    title={`${employee.name} · ${scheduleType}${workingHours ? ` · ${workingHours}` : ""} · 드래그하여 구역 배정`}
                  >
                    <span>{employee.name}</span>
                    <span className={`text-[13px] font-bold px-1 rounded ${SHIFT_BADGE[scheduleType] ?? "bg-zinc-100 text-zinc-700 border-line"}`}>
                      {scheduleType}
                    </span>
                  </button>
                );
              })}
              <button
                onClick={onAutoAssign}
                title="물류 출근직원 미리보기 배치 (확정 전엔 DB 저장·알림 없음)"
                className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-bold rounded-full shadow-sm transition cursor-pointer border border-violet-700"
              >
                임의배치
              </button>
              {pendingAutoAssign && (
                <>
                  <button
                    onClick={onConfirmAutoAssign}
                    title="DB 저장 + 각 담당자에게 날짜·배정구역 알림 전송"
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[13px] font-bold rounded-full shadow-sm transition cursor-pointer border border-emerald-700 animate-pulse"
                  >
                    <Bell size={9} /> 배치확정 ({pendingAutoAssign.assignedList.length})
                  </button>
                  <button
                    onClick={onCancelAutoAssign}
                    title="미리보기 취소 · 이전 배치로 되돌리기"
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-white hover:bg-zinc-50 text-zinc-600 text-[13px] font-bold rounded-full shadow-sm transition cursor-pointer border border-zinc-300"
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
          <Card variant="flat" bg="bg-violet-50" borderColor="border-violet-200" rounded="lg" padding="none" className="px-2 py-1 text-[12px] text-violet-700 mb-1 flex items-center gap-1.5">
            <span>임의배치 미리보기 중 — 배치를 조정한 뒤 위쪽 <b>배치확정</b> 버튼을 눌러 DB 저장 + 담당자 알림 전송</span>
          </Card>
        )}

        {/* SECTION 1: 수평 윙 */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-stretch gap-3 w-full shrink-0">
          <div className="flex-1 bg-white border-2 border-emerald-600 rounded-xl p-2 md:p-3 flex flex-col shadow-sm relative min-w-0">

            {/* 2026-08-30 · 사용자 지시 · 배지 겹침 fix · absolute 제거 · inline flex 헤더 배치 · 여백 확보 */}
            <div className="flex items-center gap-1.5 mb-2">
              <svg width="36" height="28" viewBox="0 0 42 34" className="shrink-0" aria-label="수평윙 위치">
                <rect x="1" y="1" width="30" height="20" rx="1.5" fill="#10b981" stroke="#047857" strokeWidth="1" />
                <rect x="31" y="1" width="10" height="32" rx="1.5" fill="none" stroke="#cbd5e1" strokeWidth="1.2" />
                <circle cx="16" cy="11" r="2" fill="#fbbf24" />
              </svg>
              <span className="text-[13px] font-bold text-zinc-600 leading-none">수평 윙</span>
            </div>

            {/* 상단 벽면 */}
            <div className="w-full">
              <div className="grid grid-cols-4 md:grid-cols-[repeat(13,minmax(0,1fr))] gap-1 bg-zinc-100 p-1 rounded">
                {STORE_TOP_WALL.map((num) => renderWallZoneCard(num, "top"))}
              </div>
            </div>

            {/* 중앙 진열대 · 2026-08-30 · 사용자 지시 · 반응형
                · lg+ (≥1024px) · 8 pair 한 줄 (22 옆에)
                · md (768-1023) · 4 pair per row · 2 rows (5-8 위 · 1-4 아래)
                · sm (<768) · 2 pair per row · 4 rows */}
            <div className="my-3 w-full">
              <div className="flex flex-wrap lg:flex-nowrap items-stretch justify-start lg:pr-3 px-1.5 bg-zinc-50 border border-line py-2 rounded-lg gap-1.5">
                {/* 진열대 22 · lg+ 는 첫 컬럼 · md 이하 · 상단 전체 폭 */}
                <div className="flex flex-col items-center gap-0.5 basis-full lg:basis-auto lg:flex-none lg:w-[40px] lg:min-w-[40px] lg:mr-1">
                  <button
                    type="button"
                    onClick={() => {
                      const zd = ZONE_DEFS.find((z: any) => z.num === STORE_AISLE_CENTER);
                      onZoneProductsOpen({ zoneId: "22", zoneNum: 22, zoneLabel: "진열대 22", category: zd?.category ?? "" });
                    }}
                    title="22 카테고리 클릭 → 상품 리스트 보기"
                    className="w-full text-[13px] font-bold text-zinc-700 bg-white border-2 border-zinc-300 rounded px-0.5 py-0.5 leading-tight text-center h-[56px] flex items-center justify-center overflow-hidden cursor-pointer hover:bg-zinc-50 transition">
                    <span className="line-clamp-4">{ZONE_DEFS.find((z: any) => z.num === STORE_AISLE_CENTER)?.category ?? ""}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const zd = ZONE_DEFS.find((z: any) => z.num === STORE_AISLE_CENTER);
                      onZoneProductsOpen({ zoneId: "22", zoneNum: 22, zoneLabel: "진열대 22", category: zd?.category ?? "" });
                    }}
                    title="22 구역 상품 리스트 보기"
                    className="w-full text-[12px] font-bold text-white bg-zinc-600 rounded px-0.5 py-0.5 text-center leading-none cursor-pointer hover:brightness-110 transition"
                  >22</button>
                  {renderZoneCell(22, "w-full h-[80px] flex flex-col justify-between items-center py-1 px-0.5 text-[12px]")}
                  <div className="w-full h-[56px]" />
                </div>
                {/* 진열대 8→1 각각 B|A pair · 2026-08-30 · 사용자 지시
                    · 카테고리+구역+담당자 · 하나의 셀 안 통합 (매장구역편집도와 동일)
                    · 요청 버튼 제거
                    · 색상은 CAT_A/B_COLORS 유지 */}
                {STORE_AISLE_PAIRS.map((num) => {
                  const ca = CAT_A_COLORS[num];
                  const cb = CAT_B_COLORS[num];
                  const zd = ZONE_DEFS.find((z: any) => z.num === num);
                  const subB = getZoneSubLabel(`${num}B`) || (zd?.subB ?? "");
                  const subA = getZoneSubLabel(`${num}A`) || (zd?.subA ?? "");
                  // 2026-08-30 · 사용자 지시 · 구역 라벨 · zone_defs.zone (DB · cellId 매칭)
                  //   · zd.__rowIdA · __rowIdB · compat 훅에서 노출
                  //   · zonesRaw 에서 id 로 찾아서 · raw.zone 사용
                  const rawB = zonesRaw.find(r => r.id === (zd as any)?.__rowIdB);
                  const rawA = zonesRaw.find(r => r.id === (zd as any)?.__rowIdA);
                  const zoneLabelB = rawB?.zone ?? `진열대 ${num}B`;
                  const zoneLabelA = rawA?.zone ?? `진열대 ${num}A`;
                  return (
                    <div key={`pair-${num}`} className="flex flex-row gap-0.5 items-stretch basis-[calc(50%-6px)] sm:basis-[calc(25%-6px)] lg:basis-0 lg:flex-[2_2_0%] lg:min-w-[60px]">
                      {/* B side · 좌 · 통합 셀 (카테고리 + 담당자) */}
                      <button
                        type="button"
                        onClick={() => onZoneProductsOpen({ zoneId: `${num}B`, zoneNum: num, zoneLabel: zoneLabelB, category: subB })}
                        title={`${zoneLabelB} · ${subB} · 클릭 · 상품 조회`}
                        className={`flex-1 min-w-0 text-[13px] font-bold ${cb.text} ${cb.bg} border-2 ${cb.border} rounded px-0.5 py-1 leading-tight text-center flex flex-col items-center gap-1 overflow-hidden cursor-pointer hover:brightness-95 transition`}
                      >
                        {/* 셀번호 · zone_defs.cellId 기반 */}
                        {rawB?.cellId != null && (
                          <span className="text-[10px] font-bold text-white/95 bg-black/25 rounded px-1 py-px leading-none tabular-nums" title={`셀번호 ${rawB.cellId}`}>#{rawB.cellId}</span>
                        )}
                        <span className={`text-[13px] font-bold text-white ${cb.labelBg} rounded px-1 py-0.5 leading-none`}>{zoneLabelB}</span>
                        <span className="text-[13px] break-keep whitespace-normal">{subB}</span>
                        {/* 담당자 셀 · 구역 이름 없이 · 담당자만 (renderZoneCellById 내부는 별도) */}
                        <div className="w-full mt-auto pt-1">
                          {renderZoneCellById(`${num}B`, "w-full min-h-[60px] flex flex-col justify-between items-center py-0.5 px-0.5 text-[12px]", "", true)}
                        </div>
                      </button>
                      {/* A side · 우 · 통합 셀 */}
                      <button
                        type="button"
                        onClick={() => onZoneProductsOpen({ zoneId: `${num}A`, zoneNum: num, zoneLabel: zoneLabelA, category: subA })}
                        title={`${zoneLabelA} · ${subA} · 클릭 · 상품 조회`}
                        className={`flex-1 min-w-0 text-[13px] font-bold ${ca.text} ${ca.bg} border-2 ${ca.border} rounded px-0.5 py-1 leading-tight text-center flex flex-col items-center gap-1 overflow-hidden cursor-pointer hover:brightness-95 transition`}
                      >
                        {rawA?.cellId != null && (
                          <span className="text-[10px] font-bold text-white/95 bg-black/25 rounded px-1 py-px leading-none tabular-nums" title={`셀번호 ${rawA.cellId}`}>#{rawA.cellId}</span>
                        )}
                        <span className={`text-[13px] font-bold text-white ${ca.labelBg} rounded px-1 py-0.5 leading-none`}>{zoneLabelA}</span>
                        <span className="text-[13px] break-keep whitespace-normal">{subA}</span>
                        <div className="w-full mt-auto pt-1">
                          {renderZoneCellById(`${num}A`, "w-full min-h-[60px] flex flex-col justify-between items-center py-0.5 px-0.5 text-[12px]", "", true)}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 하단 벽면 */}
            <div className="w-full">
              <div className="grid grid-cols-4 md:grid-cols-12 gap-1 bg-zinc-100 p-1 rounded">
                {STORE_BOTTOM_WALL.map((num) => renderWallZoneCard(num, "bottom"))}
              </div>
            </div>

            <div className="absolute top-1 right-2 bg-rose-50 text-rose-700 text-[13px] border border-rose-300 font-extrabold px-1.5 rounded-full uppercase tracking-wider shadow-sm">
              유통기한 임박존
            </div>
          </div>
        </div>

        {/* SECTION 2: 동측 윙 */}
        <Card variant="raw-md" rounded="2xl" padding="none" className="w-full mt-2 p-3 flex flex-col gap-3 shadow-zinc-200/60 relative">

          <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-zinc-900 flex items-center justify-center shadow-sm">
                <span className="text-[13px]">🚪</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[13px] font-bold text-zinc-900 leading-none">동측 윙</span>
                <span className="text-[13px] font-semibold text-zinc-400 leading-none mt-0.5 uppercase tracking-wider">Counter · Event · Front Display</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 bg-zinc-50 border border-line rounded-lg px-2 py-1">
              <svg width="30" height="24" viewBox="0 0 42 34" className="shrink-0" aria-label="수직윙 위치">
                <rect x="1" y="1" width="30" height="20" rx="1.5" fill="none" stroke="#cbd5e1" strokeWidth="1.2" />
                <rect x="31" y="1" width="10" height="32" rx="1.5" fill="#0f172a" />
                <circle cx="36" cy="17" r="2" fill="#fbbf24" />
              </svg>
              <span className="text-[13px] font-bold text-zinc-600 leading-none">현재 위치</span>
            </div>
          </div>

          {/* 베스트존 */}
          <div className="w-full bg-zinc-50/60 rounded-xl p-2.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-zinc-800 uppercase tracking-wide flex items-center gap-1">
                <span className="w-1 h-3 bg-amber-500 rounded-full inline-block" />
                베스트존
              </span>
              <span className="text-[13px] font-semibold text-zinc-400">이벤트 3구역 · 35·36·37</span>
            </div>
            <div className="flex gap-1.5 items-stretch">
              {[35, 36, 37].map(num => (
                <div key={`event-slot-${num}`} className="flex-1 flex flex-col gap-0.5">
                  <span className="text-[13px] font-bold text-zinc-500 leading-none">이벤트 · {num}</span>
                  {renderZoneCell(num, "w-full h-[70px] text-[12px] p-1 justify-center")}
                </div>
              ))}
            </div>
          </div>

          {/* 메인 카운터 */}
          <div className="w-full bg-zinc-50/60 rounded-xl p-2.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-zinc-800 uppercase tracking-wide flex items-center gap-1">
                <span className="w-1 h-3 bg-zinc-900 rounded-full inline-block" />
                메인 카운터
              </span>
              <span className="text-[13px] font-semibold text-zinc-400">3구역 · 40A · 40B · 40C</span>
            </div>
            <div className="flex gap-1.5 items-stretch">
              {(["A", "B", "C"] as const).map((side) => (
                <div key={`counter-${side}`} className="flex-1 flex flex-col gap-0.5">
                  <span className="text-[13px] font-bold text-zinc-500 leading-none">카운터 {side === "A" ? "1" : side === "B" ? "2" : "3"}</span>
                  {renderZoneCellById(`40${side}`, "w-full h-[70px] justify-between items-center text-[12px] p-1 bg-brand-deep text-white", "", true)}
                </div>
              ))}
            </div>
          </div>

          {/* 정면 약진열 + 시설 */}
          <div className="w-full flex gap-2">
            <div className="flex-[3] bg-zinc-50/60 rounded-xl p-2.5 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold text-zinc-800 uppercase tracking-wide flex items-center gap-1">
                  <span className="w-1 h-3 bg-emerald-500 rounded-full inline-block" />
                  정면 약진열
                </span>
                <span className="text-[13px] font-semibold text-zinc-400">38</span>
              </div>
              {renderZoneCell(38, "w-full h-[70px] justify-center bg-emerald-600 text-white text-[12px] p-1 font-bold")}
            </div>
            <div className="flex-[2] bg-zinc-50/60 rounded-xl p-2.5 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold text-zinc-800 uppercase tracking-wide flex items-center gap-1">
                  <span className="w-1 h-3 bg-zinc-400 rounded-full inline-block" />
                  시설
                </span>
              </div>
              <div className="flex gap-1.5 flex-1">
                <div className="flex-1 flex flex-col gap-0.5">
                  <span className="text-[13px] font-bold text-zinc-500 leading-none">☕ 휴게실</span>
                  {renderZoneCell(41, "w-full h-[70px] text-[12px] bg-zinc-200 text-zinc-700 justify-center border-none")}
                </div>
                <div className="flex-1 flex flex-col gap-0.5">
                  <span className="text-[13px] font-bold text-zinc-500 leading-none">🗄️ 사물함</span>
                  {renderZoneCell(39, "w-full h-[70px] text-[12px] bg-zinc-200 text-zinc-700 justify-center border-none")}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center text-[13px] text-zinc-400 pt-1 leading-none">
            <span>🛗 1층 연결 EV · 🛒 카트존</span>
            <span>🚰 수도 시설</span>
          </div>
        </Card>

      </div>
    </div>
  );
};
