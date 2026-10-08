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
    // 빈 셀 · 셀 height 일관성 위해 min-h 유지 (휴무/일반 셀과 동일 크기)
    return <div className="min-h-[36px] flex items-center justify-center text-[11px] text-zinc-200">·</div>;
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
  // 2026-10-08 · 사용자 피드백 · 오픈/마감/오픈마감/휴무 셀 크기 통일 + rounded 제거 (각진 네모) + 깔끔
  //   · min-h-[36px] · flex column justify-center · 두 번째 라인 자리 유지 (OFF 도 invisible 공백)
  //   · rounded-sm → rounded-none (각진 네모 · 사용자 지시)
  //   · 셀 꽉 채우기 · padding compact
  const showHours = !!hours && !off;
  return (
    <div
      className={`text-[12px] leading-tight px-1 py-0.5 min-h-[36px] flex flex-col justify-center ${textCls}`}
      style={hasBg ? { backgroundColor: bgHex! } : undefined}
    >
      <div className="font-bold">{t}</div>
      <div className={`text-[10px] tabular-nums ${hoursCls} ${showHours ? "" : "invisible select-none"}`}>
        {showHours ? hours : "·"}
      </div>
    </div>
  );
};
