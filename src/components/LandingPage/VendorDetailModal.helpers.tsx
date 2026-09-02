// 2026-08-22 · Framework Phase 4 · VendorDetailModal helpers 분리
// 결제 등록 모달 관련 상수 + Field / SectionTitle / StatCard 재사용 소형 컴포넌트

import React from "react";

export const METHOD_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "transfer", label: "이체" },
  { key: "cash",     label: "현금" },
  { key: "card",     label: "카드" },
  { key: "check",    label: "수표" },
  { key: "offset",   label: "상계" },
  { key: "etc",      label: "기타" },
];

// 2026-08-10 · Field 라벨 · accent 옵션 · 승인 필수 5필드 시각 강조 (2026-09-02)
//   · accent = "amber" | "sky" | "violet" | "rose" | "emerald" | ...
//   · label 앞 · 색상 dot (2px h-1.5 w-1.5) · label 텍스트 진한 색
export const Field: React.FC<{
  label: string;
  children: React.ReactNode;
  accent?: "sky" | "emerald" | "amber" | "rose" | "violet" | "indigo" | "teal" | "blue";
  /** 2026-09-02 · 사용자 지시 · 빨강 * 표시 (기본 정보 필수) */
  required?: boolean;
}> = ({ label, children, accent, required }) => {
  const accentCls = accent ? {
    sky:     { dot: "bg-sky-500",     text: "text-sky-700"     },
    emerald: { dot: "bg-emerald-500", text: "text-emerald-700" },
    amber:   { dot: "bg-amber-500",   text: "text-amber-700"   },
    rose:    { dot: "bg-rose-500",    text: "text-rose-700"    },
    violet:  { dot: "bg-violet-500",  text: "text-violet-700"  },
    indigo:  { dot: "bg-indigo-500",  text: "text-indigo-700"  },
    teal:    { dot: "bg-teal-500",    text: "text-teal-700"    },
    // 2026-09-02 · 사용자 지시 · 짙은 파랑 (보라 X · 순수 파랑) · Tailwind blue-700
    blue:    { dot: "bg-blue-600",    text: "text-blue-700"    },
  }[accent] : null;
  return (
    <label className="block space-y-1">
      <span className={`inline-flex items-center gap-1.5 text-[18px] font-semibold tracking-tight ${accentCls ? accentCls.text : "text-zinc-600"}`}>
        {accentCls && <span className={`w-2 h-2 rounded-full ${accentCls.dot} shrink-0`} />}
        {label}
        {required && <span className="text-rose-500 font-bold ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
};

export const colorMap = {
  sky:     { bar: "bg-sky-500",     text: "text-sky-700",     icon: "text-sky-600"     },
  emerald: { bar: "bg-emerald-500", text: "text-emerald-700", icon: "text-emerald-600" },
  amber:   { bar: "bg-amber-500",   text: "text-amber-700",   icon: "text-amber-600"   },
  rose:    { bar: "bg-rose-500",    text: "text-rose-700",    icon: "text-rose-600"    },
  teal:    { bar: "bg-teal-500",    text: "text-teal-700",    icon: "text-teal-600"    },
  indigo:  { bar: "bg-brand-deep",  text: "text-indigo-700",  icon: "text-indigo-600"  },
  violet:  { bar: "bg-violet-500",  text: "text-violet-700",  icon: "text-violet-600"  },
} as const;

export type ColorKey = keyof typeof colorMap;

// 2026-08-10 · 사용자 요청 · 아이콘 제거 · 제목 폰트 +2 (13→15)
export const SectionTitle: React.FC<{
  icon?: React.ReactNode;
  title: string;
  color: ColorKey;
  hint?: string;
}> = ({ title, color, hint }) => {
  const c = colorMap[color];
  return (
    <div className="flex items-center gap-2 pb-1.5 border-b border-zinc-100">
      <span className={`w-1 h-4 rounded-full ${c.bar} shrink-0`} />
      <span className={`text-[17px] font-bold ${c.text}`}>{title}</span>
      {hint && <span className="ml-auto text-[14px] text-zinc-400 tabular-nums">{hint}</span>}
    </div>
  );
};

// 2026-08-17 · 세련 · Vercel Dashboard 톤 · 뉴트럴 body + status dot + 값 semantic color
const statColorMap: Record<string, { dot: string; text: string; iconBg: string; iconColor: string }> = {
  emerald: { dot: "bg-emerald-500", text: "text-emerald-700", iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
  indigo:  { dot: "bg-indigo-500",  text: "text-indigo-700",  iconBg: "bg-indigo-50",  iconColor: "text-indigo-600" },
  violet:  { dot: "bg-violet-500",  text: "text-violet-700",  iconBg: "bg-violet-50",  iconColor: "text-violet-600" },
  rose:    { dot: "bg-rose-500",    text: "text-rose-700",    iconBg: "bg-rose-50",    iconColor: "text-rose-600" },
};

export const StatCard: React.FC<{
  icon: React.ReactNode;
  color: "emerald" | "indigo" | "violet" | "rose";
  label: string;
  value: string;
  sub?: string;
}> = ({ icon, color, label, value, sub }) => {
  const c = statColorMap[color];
  return (
    <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.03),0_2px_8px_rgba(10,46,74,0.04)] px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
        <span className={`inline-flex items-center gap-1 text-[13px] font-semibold text-ink-soft tracking-tight`}>
          <span className={c.iconColor}>{icon}</span><span>{label}</span>
        </span>
      </div>
      {/* 2026-08-29 · UI 감사 U1/U2 · font-mono → tabular-nums · truncate 제거 (KPI 잘림 방지) */}
      <div className={`text-[17px] font-extrabold ${c.text} tabular-nums break-words whitespace-normal leading-tight`} title={value}>{value}</div>
      {sub && <div className="text-[13px] font-medium text-ink-soft mt-0.5 break-words whitespace-normal" title={sub}>{sub}</div>}
    </div>
  );
};
