// src/components/PermissionsPage/LevelSelect.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · LevelSelect 컴포넌트 이관
import React from "react";
import { Check } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { LEVELS } from "./constants";

export interface LevelSelectProps {
  value: number;
  onChange: (v: number) => void;
  saving: boolean;
  saved: boolean;
}

export const LevelSelect: React.FC<LevelSelectProps> = ({ value, onChange, saving, saved }) => (
  <div className="relative flex items-center gap-1.5">
    <select
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      disabled={saving}
      className="appearance-none bg-zinc-50 border border-line rounded-lg px-3 py-1.5 text-[13px] font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep cursor-pointer disabled:opacity-60 pr-7 min-w-[120px]"
    >
      {LEVELS.map(l => (
        <option key={l} value={l}>Lv.{l}{l === 1 ? " (직원)" : l === 9 ? " (최고관리자)" : ""}</option>
      ))}
    </select>
    <div className="absolute right-2 pointer-events-none">
      {saving ? (
        <Spinner size={10} tone="brand" />
      ) : saved ? (
        <Check size={10} className="text-emerald-500" />
      ) : null}
    </div>
  </div>
);
