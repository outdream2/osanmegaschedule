// src/components/schedule-v2/views/month-grid/scheduleCellContent.tsx
// 2026-10-07 · 순환 import 해소 · MonthGridV2 ↔ MonthScheduleViewV2
//   · 기존: scheduleCellContent 가 MonthScheduleViewV2.tsx 에 선언되고 MonthGridV2 가 역방향 import
//     → 순환 참조 · 번들/HMR 상황에 따라 TDZ (ReferenceError: Cannot access 'scheduleCellContent' before initialization) 또는 undefined render 발생 가능
//   · 조치: cell renderer 만 별도 모듈로 분리 · MonthGridV2 와 MonthScheduleViewV2 가 모두 이 파일에서 import
//   · 기능/스타일 100% 동일 · V1↔V2 parity 유지
import React from "react";
import type { Schedule } from "../../../../types";
import { isOffType } from "../../../../shared/schedule/offTypes";
// 2026-10-08 · V1 parity · settings scheduleTypes 기반 색상 적용 (V1 ScheduleCell:128,164 패턴)
import { getTypeHex, isLightHex, type ScheduleTypeEntry } from "../../../../constants";

export const scheduleCellContent = (
  schedule: Schedule | undefined,
  typeHoursMap: Record<string, string>,
  scheduleTypes?: ScheduleTypeEntry[],
): React.ReactElement => {
  if (!schedule || !schedule.type) {
    // 빈 셀 · 전체 셀 꽉 채움 (h-full) + height 통일
    return <div className="h-full w-full flex items-center justify-center text-[11px] text-zinc-200">·</div>;
  }
  const t = schedule.type.trim();
  const off = isOffType(t);
  const hours = (schedule.workingHours ?? "").trim() || typeHoursMap[t] || "";
  // 2026-10-08 · V1 ScheduleCell:128,164 과 동일 · bgHex 있으면 fallback 포함 적용 (휴무도 bg 유지)
  const bgHex = scheduleTypes ? getTypeHex(t, scheduleTypes) : null;
  const hasBg = !!bgHex;
  const isLight = hasBg ? isLightHex(bgHex!) : true;
  const textCls = hasBg
    ? (isLight ? "text-zinc-900" : "text-white")
    : (off ? "text-rose-600" : "text-ink");
  const hoursCls = hasBg
    ? (isLight ? "text-zinc-700" : "text-white/85")
    : "text-ink-soft";
  // 2026-10-08 · 사용자 피드백 · 셀 크기 통일 + 여백 없게 + 각진 네모 + overflow hidden (hours wrap 방지)
  const showHours = !!hours && !off;
  return (
    <div
      className={`h-full w-full px-1 py-0.5 flex flex-col justify-center overflow-hidden ${textCls}`}
      style={hasBg ? { backgroundColor: bgHex! } : undefined}
    >
      <div className="text-[12px] font-bold leading-tight truncate">{t}</div>
      <div className={`text-[10px] tabular-nums leading-tight truncate ${hoursCls} ${showHours ? "" : "invisible select-none"}`}>
        {showHours ? hours : "·"}
      </div>
    </div>
  );
};
