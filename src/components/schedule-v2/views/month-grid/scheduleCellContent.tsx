// src/components/schedule-v2/views/month-grid/scheduleCellContent.tsx
// 2026-10-07 · 순환 import 해소 · MonthGridV2 ↔ MonthScheduleViewV2
//   · 기존: scheduleCellContent 가 MonthScheduleViewV2.tsx 에 선언되고 MonthGridV2 가 역방향 import
//     → 순환 참조 · 번들/HMR 상황에 따라 TDZ (ReferenceError: Cannot access 'scheduleCellContent' before initialization) 또는 undefined render 발생 가능
//   · 조치: cell renderer 만 별도 모듈로 분리 · MonthGridV2 와 MonthScheduleViewV2 가 모두 이 파일에서 import
//   · 기능/스타일 100% 동일 · V1↔V2 parity 유지
import React from "react";
import type { Schedule } from "../../../../types";
import { isOffType } from "../../../../shared/schedule/offTypes";

export const scheduleCellContent = (
  schedule: Schedule | undefined,
  typeHoursMap: Record<string, string>,
): React.ReactElement => {
  if (!schedule || !schedule.type) {
    return <span className="inline-block w-full text-[11px] text-zinc-200">·</span>;
  }
  const t = schedule.type.trim();
  const off = isOffType(t);
  const hours = (schedule.workingHours ?? "").trim() || typeHoursMap[t] || "";
  return (
    <div className="text-[12px] leading-tight">
      <div className={`font-semibold ${off ? "text-rose-600" : "text-ink"}`}>{t}</div>
      {hours && !off && <div className="text-[10px] text-ink-soft tabular-nums">{hours}</div>}
    </div>
  );
};
