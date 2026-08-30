// src/components/StaffManagePage/CreateModal.tsx
// 2026-08-21 · Framework Phase 4 · StaffManagePage 대형 파일 분리 · CreateModal 이관
// 2026-08-23 · #191 Modal primitive 마이그레이션
import React, { useState } from "react";
import { UserPlus, Save } from "lucide-react";
import { Modal } from "../common/Modal";
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

  const footer = (
    <>
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
    </>
  );

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title="직원 신규 등록"
      icon={<div className="w-9 h-9 rounded-lg bg-brand-deep flex items-center justify-center shadow-sm"><UserPlus size={15} className="text-white" /></div>}
      titleAccent
      size="sm"
      closeOnBackdrop={!saving}
      closeOnEsc={!saving}
      footer={footer}
    >
      <div className="space-y-3">
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
          <label className="text-[14px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">직군</label>
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
    </Modal>
  );
};
