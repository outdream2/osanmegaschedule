// ProductInfoCard.inline.tsx
// 2026-08-29 · 분리 · InlineField 헬퍼 컴포넌트 · financial + meta 섹션 공유

import React from "react";
import { Pencil, Check, X } from "lucide-react";
import { Spinner } from "../common/Spinner";
import type { InlineEditableKey } from "./ProductInfoCard.types";

interface InlineFieldProps {
  label: string;
  fieldKey: InlineEditableKey;
  value: any;
  type?: "text" | "number" | "date";
  format?: (v: any) => string;
  accent?: "slate" | "emerald" | "indigo" | "amber";
  editingKey: InlineEditableKey | null;
  editingValue: string;
  editSaving: boolean;
  editError: string | null;
  inlineEditEnabled: boolean;
  onEditStart: (k: InlineEditableKey, v: any) => void;
  onEditChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

export const InlineField: React.FC<InlineFieldProps> = ({
  label, fieldKey, value, type = "text", format, accent = "slate",
  editingKey, editingValue, editSaving, editError,
  inlineEditEnabled, onEditStart, onEditChange, onCommit, onCancel,
}) => {
  const isEditing = editingKey === fieldKey;
  const displayValue = value == null || value === "" ? "-" : format ? format(value) : String(value);
  const accentClass = {
    slate: "text-zinc-800",
    emerald: "text-emerald-700",
    indigo: "text-indigo-700",
    amber: "text-amber-700",
  }[accent];

  return (
    <div className="min-w-0">
      <p className="text-[13px] font-semibold text-zinc-500 mb-0.5">{label}</p>
      {isEditing ? (
        <div className="flex items-center gap-1">
          <input
            type={type}
            value={editingValue}
            onChange={e => onEditChange(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onCommit(); if (e.key === "Escape") onCancel(); }}
            disabled={editSaving}
            autoFocus
            className="flex-1 min-w-0 text-[13px] font-bold border-2 border-indigo-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-tint"
          />
          <button onClick={onCommit} disabled={editSaving} className="shrink-0 w-6 h-6 rounded bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 disabled:opacity-40 cursor-pointer">
            {editSaving ? <Spinner size={11} /> : <Check size={12} />}
          </button>
          <button onClick={onCancel} disabled={editSaving} className="shrink-0 w-6 h-6 rounded bg-zinc-200 text-zinc-600 flex items-center justify-center hover:bg-zinc-300 disabled:opacity-40 cursor-pointer">
            <X size={12} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1 group">
          <p className={`text-[13px] font-bold ${accentClass} break-words leading-tight flex-1`}>{displayValue}</p>
          {inlineEditEnabled && (
            <button
              onClick={() => onEditStart(fieldKey, value)}
              className="shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 rounded hover:bg-zinc-100 text-zinc-400 hover:text-indigo-600 flex items-center justify-center transition cursor-pointer"
              title={`${label} 편집`}
            >
              <Pencil size={10} />
            </button>
          )}
        </div>
      )}
      {isEditing && editError && (
        <p className="text-[13px] text-red-500 mt-0.5">{editError}</p>
      )}
    </div>
  );
};
