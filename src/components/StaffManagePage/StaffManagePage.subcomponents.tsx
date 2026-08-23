// src/components/StaffManagePage/StaffManagePage.subcomponents.tsx
// 2026-08-22 · Framework Phase 4 · StaffManagePage 대형 파일 분리 · 서브컴포넌트 이관
//   · Avatar · InlineField · SectionCard(+localStorage helpers) · EmptyRow · SectionLabel · EmptyDetail
import React, { useState } from "react";
import { Users } from "lucide-react";
import { Card } from "../common/Card";
import type { SectionGroup } from "./types";
import { GROUP_HEADER, GROUP_ICON } from "./types";
import { initials } from "./helpers";

// ─── 서브컴포넌트: 아바타 ────────────────────────────────────────────────────
export const Avatar: React.FC<{
  name: string;
  photoUrl?: string | null;
  size?: "xs" | "sm" | "lg";
}> = ({ name, photoUrl, size = "sm" }) => {
  // 2026-08-17 · 사용자 지시 · 최신 트렌드 · 이름 이니셜 subtle · 화려한 gradient 지양
  //   · Linear/Notion · 이니셜 폰트 작게 · 뉴트럴 배경 · 텍스트 subtle
  const dim =
    size === "lg" ? "w-20 h-20 text-[15px]"
    : size === "xs" ? "w-8 h-8 text-[11px]"
    : "w-9 h-9 text-[13px]";
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`${dim} rounded-full object-cover ring-1 ring-line shadow-sm shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${dim} rounded-full bg-brand-tint text-brand-deep flex items-center justify-center font-semibold shadow-sm shrink-0 select-none tracking-tight`}
    >
      {initials(name)}
    </div>
  );
};

// ─── 서브컴포넌트: 인라인 텍스트 필드 ──────────────────────────────────────
export const InlineField: React.FC<{
  label: string;
  value: string;
  editing: boolean;
  icon?: React.ReactNode;
  type?: React.HTMLInputTypeAttribute;
  placeholder?: string;
  onChange: (v: string) => void;
  monospace?: boolean;
  wide?: boolean;
}> = ({ label, value, editing, icon, type = "text", placeholder, onChange, monospace: _monospace, wide }) => (
  <div className={`flex flex-col gap-0.5 ${wide ? "col-span-2" : ""}`}>
    <span className="text-[15px] font-semibold text-zinc-400 flex items-center gap-0.5 leading-none">
      {icon}
      {label}
    </span>
    {editing ? (
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="border border-indigo-300 rounded-md px-2 py-0.5 text-[15px] focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint bg-indigo-50/40 h-7"
      />
    ) : (
      <span
        className={`text-[15px] font-semibold leading-snug min-h-[20px] ${!value ? "text-zinc-300 italic" : "text-zinc-700"}`}
      >
        {value || "(없음)"}
      </span>
    )}
  </div>
);

// ─── 서브컴포넌트: 섹션 카드 (아코디언) — 그룹 컬러 헤더 ─────────────────────
const SECTION_CARD_STORAGE_KEY = "staffManage:sectionOpen:v1";
const readSectionCardOpen = (title: string, defaultOpen: boolean): boolean => {
  try {
    const raw = localStorage.getItem(SECTION_CARD_STORAGE_KEY);
    if (!raw) return defaultOpen;
    const map = JSON.parse(raw) as Record<string, boolean>;
    if (typeof map[title] === "boolean") return map[title];
    return defaultOpen;
  } catch {
    return defaultOpen;
  }
};
const writeSectionCardOpen = (title: string, open: boolean) => {
  try {
    const raw = localStorage.getItem(SECTION_CARD_STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    map[title] = open;
    localStorage.setItem(SECTION_CARD_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // storage full or disabled · silent
  }
};

export const SectionCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  group?: SectionGroup;
}> = ({ title, icon, children, defaultOpen = true, group = "personal" }) => {
  const [open, setOpenState] = useState(() => readSectionCardOpen(title, defaultOpen));
  const setOpen = (updater: boolean | ((prev: boolean) => boolean)) => {
    setOpenState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      writeSectionCardOpen(title, next);
      return next;
    });
  };
  const headerCls = GROUP_HEADER[group];
  const iconCls   = GROUP_ICON[group];
  const textCls   = headerCls.split(" ").find(c => c.startsWith("text-")) ?? "";
  return (
    <Card padding="none" clip>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full px-3 py-2 border-b ${open ? headerCls : "bg-white border-zinc-100"} flex items-center justify-between cursor-pointer transition-colors duration-150`}
      >
        <span className={`flex items-center gap-1.5 text-[15px] font-bold uppercase tracking-wider ${open ? textCls : "text-zinc-500"}`}>
          <span className={open ? iconCls : "text-zinc-400"}>{icon}</span>
          {title}
        </span>
        <span className={`transition-transform duration-200 opacity-50 ${open ? "rotate-180" : ""} ${open ? textCls : "text-zinc-400"}`}>
          <svg width="10" height="10" viewBox="0 0 12 12">
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          </svg>
        </span>
      </button>
      {open && <div className="p-3">{children}</div>}
    </Card>
  );
};

// ─── 서브컴포넌트: 빈 상태 행 ───────────────────────────────────────────────
export const EmptyRow: React.FC<{ label: string }> = ({ label }) => (
  <p className="text-[15px] text-zinc-300 italic py-1.5">{label}</p>
);

// ─── 서브컴포넌트: 섹션 소제목 indicator ─────────────────────────────────────
export const SectionLabel: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <div className="flex items-center gap-1.5 mb-3">
    <span className={`inline-block w-1 h-3.5 rounded-full shrink-0 ${color}`} />
    <span className="text-[15px] font-semibold text-zinc-500">{children}</span>
  </div>
);

// ─── 서브컴포넌트: 직원 없음 (우측 빈 상태) ─────────────────────────────────
export const EmptyDetail: React.FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center gap-4 text-zinc-300 select-none py-16">
    <div className="w-20 h-20 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shadow-sm">
      <Users size={34} className="text-indigo-300" />
    </div>
    <div className="text-center">
      <p className="text-sm font-bold text-zinc-400">직원을 선택하세요</p>
      <p className="text-[14px] text-zinc-300 mt-1">좌측 목록에서 직원을 클릭하면 인사카드가 표시됩니다</p>
    </div>
  </div>
);
