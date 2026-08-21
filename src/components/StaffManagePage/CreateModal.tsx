// src/components/StaffManagePage/CreateModal.tsx
// 2026-08-21 · Framework Phase 4 · StaffManagePage 대형 파일 분리 · CreateModal 이관
import React, { useState } from "react";
import { UserPlus, X, Save } from "lucide-react";
import { AccentBar } from "../common/AccentBar";
import { Spinner } from "../common/Spinner";
import type { Employee } from "./types";
import { POSITIONS } from "./types";

export const CreateModal: React.FC<{
  onClose: () => void;
  onSave: (data: Partial<Employee>) => Promise<void>;
  saving: boolean;
}> = ({ onClose, onSave, saving }) => {
  const [draft, setDraft] = useState<Partial<Employee>>({ name: "", position: "물류" });
  const set = (k: keyof Employee, v: unknown) => setDraft((p) => ({ ...p, [k]: v }));

  return (
    // 2026-08-17 v2 · Modal 통일
    <div
      className="fixed inset-0 z-50 backdrop-brand flex items-center justify-center p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-white rounded-xl shadow-brand-modal w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 모달 헤더 · 2026-08-17 · 최신 트렌드 · accent bar + 딥네이비 통일 */}
        <div className="px-4 py-3 border-b border-line bg-zinc-50/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AccentBar h={20} className="shrink-0" />
            <div className="w-9 h-9 rounded-lg bg-brand-deep flex items-center justify-center shadow-sm">
              <UserPlus size={15} className="text-white" />
            </div>
            <span className="text-[16px] font-bold text-ink tracking-tight">직원 신규 등록</span>
          </div>
          <button
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="w-9 h-9 rounded-lg bg-white border border-line hover:border-brand-deep hover:bg-brand-tint text-ink-soft hover:text-brand-deep transition-colors cursor-pointer flex items-center justify-center disabled:opacity-40"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {(
            [
              { label: "이름 *", key: "name", type: "text", placeholder: "" },
              { label: "연락처", key: "phone", type: "text", placeholder: "010-0000-0000" },
              { label: "이메일", key: "email", type: "email", placeholder: "name@example.com" },
              { label: "입사일", key: "hire_date", type: "date", placeholder: "" },
            ] as { label: string; key: keyof Employee; type: string; placeholder: string }[]
          ).map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label className="text-[14px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">{label}</label>
              <input
                type={type}
                value={String(draft[key] ?? "")}
                onChange={(e) => set(key, e.target.value)}
                placeholder={placeholder}
                className="w-full border border-line rounded-md px-2.5 py-1.5 text-[14px] focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
              />
            </div>
          ))}
          <div>
            <label className="text-[14px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">직책</label>
            <select
              value={String(draft.position ?? "")}
              onChange={(e) => set("position", e.target.value)}
              className="w-full border border-line rounded-md px-2.5 py-1.5 text-[14px] bg-white focus:outline-none focus:border-brand-deep"
            >
              <option value="">선택 안 함</option>
              {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[14px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">메모</label>
            <textarea
              value={String(draft.memo ?? "")}
              onChange={(e) => set("memo", e.target.value)}
              placeholder="(선택) 근무 특이사항 · 알러지 등"
              rows={2}
              className="w-full border border-line rounded-md px-2.5 py-1.5 text-[14px] focus:outline-none focus:border-brand-deep resize-none"
            />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-line bg-zinc-50/70 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="text-[15px] font-semibold text-zinc-600 bg-white border border-zinc-300 rounded-md h-7 px-3 hover:bg-zinc-50 cursor-pointer disabled:opacity-40"
          >
            취소
          </button>
          <button
            onClick={() => onSave(draft)}
            disabled={saving}
            className="text-[15px] font-semibold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] rounded-md h-7 px-3.5 cursor-pointer disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
          >
            {saving ? <Spinner size={11} tone="white" /> : <Save size={11} />}
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
};
