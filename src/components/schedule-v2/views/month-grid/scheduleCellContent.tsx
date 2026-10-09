// src/components/schedule-v2/views/month-grid/scheduleCellContent.tsx
// 2026-10-07 · 순환 import 해소 · MonthGridV2 ↔ MonthScheduleViewV2
//   · 기존: scheduleCellContent 가 MonthScheduleViewV2.tsx 에 선언되고 MonthGridV2 가 역방향 import
//     → 순환 참조 · 번들/HMR 상황에 따라 TDZ (ReferenceError: Cannot access 'scheduleCellContent' before initialization) 또는 undefined render 발생 가능
//   · 조치: cell renderer 만 별도 모듈로 분리 · MonthGridV2 와 MonthScheduleViewV2 가 모두 이 파일에서 import
//   · 기능/스타일 100% 동일 · V1↔V2 parity 유지
// 2026-10-09 · 사용자 지시 · 오늘 column 좌/우 vertical rail · scheduleCellContent 자체에 inline border 적용
//   · 이전 wrapper div 접근 모두 실패 (h-full table cell 안에서 resolve 안됨 or bg 가 가림)
//   · 최종 · bg 를 적용하는 바로 그 element 에 borderLeft/Right 함께 적용 · 같은 div 에서 그려지므로 가려짐 없음
import React from "react";
import type { Schedule } from "../../../../types";
import { isOffType } from "../../../../shared/schedule/offTypes";
// 2026-10-08 · V1 parity · settings scheduleTypes 기반 색상 적용 (V1 ScheduleCell:128,164 패턴)
import { getTypeHex, isLightHex, type ScheduleTypeEntry } from "../../../../constants";

const TODAY_BORDER: React.CSSProperties = {
  borderLeft: "2px solid #f43f5e",
  borderRight: "2px solid #f43f5e",
  boxSizing: "border-box",
};

export const scheduleCellContent = (
  schedule: Schedule | undefined,
  typeHoursMap: Record<string, string>,
  scheduleTypes?: ScheduleTypeEntry[],
  isToday?: boolean,
): React.ReactElement => {
  if (!schedule || !schedule.type) {
    return (
      <div
        className="h-full w-full flex items-center justify-center text-[11px] text-zinc-200"
        style={isToday ? TODAY_BORDER : undefined}
      >
        ·
      </div>
    );
  }
  const t = schedule.type.trim();
  const off = isOffType(t);
  const hours = (schedule.workingHours ?? "").trim() || typeHoursMap[t] || "";
  // 2026-10-08 · V1 ScheduleCell:197-213 parity · actualHours (지각/조퇴/결근 등) 셀 2번째 라인 우선 표시
  //   · 공간 많이 안 먹게 · badge style · 이모지 금지 (사용자 UI 원칙)
  const actual = (schedule.actualHours ?? "").trim();
  const bgHex = scheduleTypes ? getTypeHex(t, scheduleTypes) : null;
  const hasBg = !!bgHex;
  const isLight = hasBg ? isLightHex(bgHex!) : true;
  const textCls = hasBg
    ? (isLight ? "text-zinc-900" : "text-white")
    : (off ? "text-rose-600" : "text-ink");
  const hoursCls = hasBg
    ? (isLight ? "text-zinc-700" : "text-white/85")
    : "text-ink-soft";

  // actualHours 색상 · V1 ScheduleCell:197-213 과 동일 분기 (이모지만 제외)
  const actualTone = (() => {
    if (!actual) return null;
    if (actual.includes("지각")) return "text-amber-700 bg-amber-50 border border-amber-200";
    if (actual.includes("조퇴")) return "text-purple-700 bg-purple-50 border border-purple-200";
    if (actual.includes("결근")) return "text-rose-700 bg-rose-50 border border-rose-200";
    return "text-rose-700 bg-rose-50/70 border border-rose-100";
  })();

  // 2번째 line 결정: actual > workingHours > 공백
  const showActual = !!actual;
  const showHours = !showActual && !!hours && !off;

  // 2026-10-09 · 사용자 지시 · 오늘 column 좌/우 rail · bg 와 border 를 같은 element 에 inline style 로 (서로 가리지 않음)
  const combinedStyle: React.CSSProperties = {
    ...(hasBg ? { backgroundColor: bgHex! } : {}),
    ...(isToday ? TODAY_BORDER : {}),
  };

  return (
    <div
      className={`h-full w-full px-1 py-0.5 flex flex-col justify-center overflow-hidden ${textCls}`}
      style={combinedStyle}
    >
      <div className="text-[13px] font-bold leading-tight truncate">{t}</div>
      {showActual ? (
        <div className={`text-[11px] font-bold leading-tight truncate px-1 rounded-sm ${actualTone}`}>
          {actual}
        </div>
      ) : (
        <div className={`text-[11px] tabular-nums leading-tight truncate ${hoursCls} ${showHours ? "" : "invisible select-none"}`}>
          {showHours ? hours : "·"}
        </div>
      )}
    </div>
  );
};
