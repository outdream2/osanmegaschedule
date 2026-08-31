// src/components/common/EmployeeChip.tsx
// 2026-08-31 · 프레임워크 프리미티브 · 직원정보 공통 UI
//   · 사용자 지시 · 직원정보 나오는 모든 세션에 공통 적용
//   · Attio · Linear · Notion 2026 톤 · 아바타 + 이름 + 직군 chip
//   · variant · compact · row · detailed
//   · position tone · 약사=emerald · 매장=violet · 창고=amber · 관리자=sky · 기본=zinc
//
// 사용:
//   <EmployeeChip employee={emp} variant="compact" />
//   <EmployeeChip employee={emp} variant="row" onClick={...} />
//   <EmployeeChip employee={emp} variant="detailed" />

import React from "react";

export interface EmployeeChipData {
  id?: number;
  name?: string | null;
  position?: string | null;
  gender?: string | null;
  birth_date?: string | null;
  birthDate?: string | null;
  employee_number?: string | null;
}

export interface EmployeeChipProps {
  employee: EmployeeChipData;
  /** compact · 아바타 원형 (32px) · 이름·직군 chip (작음)
   *  row · 좌측 accent bar + 아바타(36px) + 이름 큼 + 직군 chip
   *  detailed · row + 생년월일·성별·사번 (하단 라인) */
  variant?: "compact" | "row" | "detailed";
  onClick?: () => void;
  className?: string;
  /** 이름 옆 · 배지 · 활성/퇴사 등 · 부모가 지정 */
  badge?: React.ReactNode;
}

const POSITION_TONE: Record<string, { stripe: string; avatarBg: string; avatarText: string; ring: string; posText: string; posBg: string }> = {
  "약사":   { stripe: "bg-emerald-500", avatarBg: "bg-emerald-100", avatarText: "text-emerald-700", ring: "ring-emerald-300", posText: "text-emerald-700", posBg: "bg-emerald-50 border-emerald-200" },
  "매장":   { stripe: "bg-violet-500",  avatarBg: "bg-violet-100",  avatarText: "text-violet-700",  ring: "ring-violet-300",  posText: "text-violet-700",  posBg: "bg-violet-50 border-violet-200" },
  "창고":   { stripe: "bg-amber-500",   avatarBg: "bg-amber-100",   avatarText: "text-amber-700",   ring: "ring-amber-300",   posText: "text-amber-700",   posBg: "bg-amber-50 border-amber-200" },
  "관리자": { stripe: "bg-sky-500",     avatarBg: "bg-sky-100",     avatarText: "text-sky-700",     ring: "ring-sky-300",     posText: "text-sky-700",     posBg: "bg-sky-50 border-sky-200" },
};
const DEFAULT_TONE = { stripe: "bg-zinc-300", avatarBg: "bg-zinc-100", avatarText: "text-zinc-600", ring: "ring-zinc-200", posText: "text-zinc-500", posBg: "bg-zinc-50 border-zinc-200" };

export function toneForPosition(pos: string | null | undefined) {
  const s = String(pos ?? "").trim();
  if (POSITION_TONE[s]) return POSITION_TONE[s];
  // 부분 매칭 · "매장·물류" 등 복합
  if (s.includes("약사")) return POSITION_TONE["약사"];
  if (s.includes("매장")) return POSITION_TONE["매장"];
  if (s.includes("창고") || s.includes("물류")) return POSITION_TONE["창고"];
  if (s.includes("관리")) return POSITION_TONE["관리자"];
  return DEFAULT_TONE;
}

function initialOf(name: string | null | undefined): string {
  const s = String(name ?? "").trim();
  return s ? s.charAt(0) : "?";
}

export const EmployeeChip: React.FC<EmployeeChipProps> = ({
  employee,
  variant = "compact",
  onClick,
  className = "",
  badge,
}) => {
  const tone = toneForPosition(employee.position);
  const initial = initialOf(employee.name);
  const name = employee.name ?? "";
  const birthDate = employee.birth_date ?? employee.birthDate ?? null;
  const clickable = !!onClick;

  if (variant === "compact") {
    return (
      <span
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 ${clickable ? "cursor-pointer hover:text-brand-deep" : ""} ${className}`}
        title={name}
      >
        <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold ${tone.avatarBg} ${tone.avatarText} ring-1 ${tone.ring}`}>
          {initial}
        </span>
        <span className="text-[14px] font-bold text-ink truncate">{name}</span>
        {employee.position && (
          <span className={`inline-flex items-center h-4 px-1.5 rounded text-[10px] font-bold border ${tone.posBg} ${tone.posText}`}>
            {employee.position}
          </span>
        )}
        {badge}
      </span>
    );
  }

  // row & detailed 공통 shell
  return (
    <div className={`relative flex items-center gap-2.5 pl-2 ${className}`}>
      <span className={`absolute left-0 top-1 bottom-1 w-1 rounded-r-full ${tone.stripe} opacity-70`} aria-hidden />
      <button
        type="button"
        onClick={onClick}
        disabled={!clickable}
        title={name}
        className={`
          shrink-0 w-9 h-9 rounded-full flex items-center justify-center
          text-[15px] font-extrabold ${tone.avatarBg} ${tone.avatarText}
          ring-2 ${tone.ring} shadow-sm
          ${clickable ? "hover:scale-105 active:scale-95 cursor-pointer" : "cursor-default"} transition-all
        `}
      >
        {initial}
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            onClick={onClick}
            className={`text-[16px] font-extrabold text-ink tracking-tight truncate ${clickable ? "cursor-pointer hover:text-brand-deep" : ""}`}
          >
            {name}
          </span>
          {badge}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {employee.position && (
            <span className={`inline-flex items-center h-4 px-1.5 rounded text-[11px] font-bold border ${tone.posBg} ${tone.posText}`}>
              {employee.position}
            </span>
          )}
          {variant === "detailed" && employee.gender && (
            <span className="inline-flex items-center h-4 px-1.5 rounded text-[11px] font-bold bg-zinc-50 border border-zinc-200 text-zinc-600">
              {employee.gender}
            </span>
          )}
          {variant === "detailed" && birthDate && (
            <span className="text-[11px] font-semibold text-ink-soft tabular-nums">
              생 {birthDate}
            </span>
          )}
          {variant === "detailed" && employee.employee_number && (
            <span className="text-[11px] font-semibold text-zinc-400 tabular-nums">
              #{employee.employee_number}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeChip;
