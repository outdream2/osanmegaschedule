// src/components/common/AssigneeEditor.tsx
// 2026-08-30 · 담당자 배지 편집기 · 프레임워크 프리미티브
//   · 직원명 자동완성 드롭다운 · 배지 다중 선택 · 각 add/remove 즉시 저장
//   · 최초 사용처 · ZoneEditPanel · 이후 ZoneCellPicker 등 재사용
//   · 원칙 · GET /api/employees · 모듈 캐시 (인스턴스 최초 1회)
//
// 사용:
//   <AssigneeEditor value={assignee} onSave={(next) => api.patch(...)} />

import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { api } from "../../lib/apiClient";

type EmpItem = { id: number; name: string };
let _empCache: EmpItem[] | null = null;
let _empPromise: Promise<EmpItem[]> | null = null;

async function fetchEmployeesCached(): Promise<EmpItem[]> {
  if (_empCache) return _empCache;
  if (_empPromise) return _empPromise;
  _empPromise = (async () => {
    try {
      const { data } = await api.get<EmpItem[]>("/api/employees");
      _empCache = Array.isArray(data) ? data.map(e => ({ id: e.id, name: e.name })) : [];
      return _empCache;
    } catch { return []; }
  })();
  return _empPromise;
}

export interface AssigneeEditorProps {
  value: string[];
  onSave: (next: string[]) => Promise<void> | void;
  canEdit?: boolean;
  /** 인풋 placeholder · 기본 "직원명 검색·선택" */
  placeholder?: string;
  /** 편집 불가 상태 · 배지만 표시 */
  disabled?: boolean;
  className?: string;
}

export const AssigneeEditor: React.FC<AssigneeEditorProps> = ({
  value,
  onSave,
  canEdit = true,
  placeholder = "직원명 검색·선택",
  disabled = false,
  className = "",
}) => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [emps, setEmps] = useState<EmpItem[]>(_empCache ?? []);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    fetchEmployeesCached().then(list => setEmps(list));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setQuery(""); }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const addName = async (name: string) => {
    if (!name || value.includes(name) || saving) return;
    setSaving(true);
    await onSave([...value, name]);
    setSaving(false);
    setQuery("");
    inputRef.current?.focus();
  };
  const removeName = async (name: string) => {
    if (saving) return;
    setSaving(true);
    await onSave(value.filter(n => n !== name));
    setSaving(false);
  };

  const filtered = query.trim()
    ? emps.filter(e => e.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : emps.slice(0, 8);

  const readOnly = disabled || !canEdit;

  if (readOnly && value.length === 0) return <span className="text-[12px] text-zinc-300">-</span>;
  if (readOnly) {
    return (
      <div className={`flex flex-wrap gap-1 ${className}`}>
        {value.map((n, i) => (
          <span key={i} className="inline-flex items-center h-6 px-2 rounded-full bg-brand-tint text-brand-deep text-[12px] font-bold border border-brand-deep/30">{n}</span>
        ))}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className={`flex flex-wrap gap-1 items-center min-h-[32px] rounded-md border ${open ? "border-brand-deep ring-2 ring-brand-tint" : "border-transparent hover:border-line"} px-1.5 py-1 transition`}>
        {value.map((n, i) => (
          <span key={i} className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-brand-tint text-brand-deep text-[12px] font-bold border border-brand-deep/30">
            {n}
            <button type="button" onClick={() => removeName(n)} disabled={saving} className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-brand-deep hover:text-white transition cursor-pointer disabled:opacity-40" title="담당자 제거">
              <X size={10} strokeWidth={2.5} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === "Enter" && filtered.length > 0) { e.preventDefault(); addName(filtered[0].name); }
            if (e.key === "Escape") { e.preventDefault(); setOpen(false); setQuery(""); }
            if (e.key === "Backspace" && !query && value.length > 0) { e.preventDefault(); removeName(value[value.length - 1]); }
          }}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[80px] h-6 px-1 bg-transparent text-[13px] text-ink focus:outline-none placeholder:text-zinc-300 placeholder:italic"
          disabled={saving}
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-52 overflow-auto bg-white rounded-lg border border-line shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-zinc-400 italic">일치하는 직원 없음</div>
          ) : filtered.map(e => {
            const already = value.includes(e.name);
            return (
              <button
                key={e.id}
                type="button"
                onMouseDown={ev => { ev.preventDefault(); if (!already) addName(e.name); }}
                disabled={already || saving}
                className={`w-full text-left px-3 py-1.5 text-[13px] font-semibold transition cursor-pointer ${already ? "bg-zinc-50 text-zinc-300 cursor-not-allowed" : "text-ink hover:bg-brand-tint/50"}`}
              >
                {e.name}{already ? " · 이미 선택됨" : ""}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AssigneeEditor;
