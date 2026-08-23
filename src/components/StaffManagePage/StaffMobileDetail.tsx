// src/components/StaffManagePage/StaffMobileDetail.tsx
// 2026-08-23 · Framework Phase 4 · StaffManagePage 분리 · 모바일 상세 모달
import React from "react";
import { Edit2, ExternalLink, Trash2, X } from "lucide-react";
import { Avatar } from "./StaffManagePage.subcomponents";
import type { Employee } from "./types";
import { contractTypeMeta, calcTenure, positionColor } from "./helpers";

interface StaffMobileDetailProps {
  selectedEmp: Employee;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const INFO_ROWS: { label: string; getValue: (e: Employee) => string | null | undefined }[] = [
  { label: "연락처",  getValue: (e) => e.phone },
  { label: "이메일",  getValue: (e) => e.email },
  { label: "입사일",  getValue: (e) => e.hire_date },
  { label: "근속기간", getValue: (e) => e.hire_date ? calcTenure(e.hire_date) : null },
  { label: "계약유형", getValue: (e) => contractTypeMeta(e.contract_type)?.label ?? null },
  { label: "인사평가", getValue: (e) => e.performance_rating ? String(e.performance_rating).toUpperCase() : null },
  { label: "권한레벨", getValue: (e) => e.level != null ? `Lv.${e.level}` : null },
  { label: "근무타입", getValue: (e) => e.schedule_type },
  { label: "담당구역", getValue: (e) => e.work_area },
];

export const StaffMobileDetail: React.FC<StaffMobileDetailProps> = ({
  selectedEmp, onClose, onEdit, onDelete,
}) => (
  <div
    className="lg:hidden fixed inset-0 z-50 backdrop-brand flex items-center justify-center p-[2.5vw]"
    onClick={onClose}
  >
    <div
      className="bg-white w-full max-w-[95vw] rounded-2xl shadow-brand-modal max-h-[92vh] overflow-hidden flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 bg-indigo-50/80 shrink-0">
        <div className="flex items-center gap-2.5">
          <Avatar name={selectedEmp.name} photoUrl={selectedEmp.photo_url} size="xs" />
          <div>
            <span className="text-sm font-bold text-zinc-800">{selectedEmp.name}</span>
            <span className={`ml-2 text-[15px] font-semibold px-1.5 py-px rounded-md border ${positionColor(selectedEmp.position)}`}>
              {selectedEmp.position || "직책 없음"}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-700 cursor-pointer w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/70 transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto p-3.5 bg-zinc-50/40 space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5 bg-white rounded-xl border border-line p-3.5 shadow-sm">
          {INFO_ROWS.map(({ label, getValue }) => {
            const val = getValue(selectedEmp);
            return val ? (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-[15px] font-bold text-zinc-400 uppercase tracking-wider">{label}</span>
                <span className="text-[14px] font-semibold text-zinc-700">{val}</span>
              </div>
            ) : null;
          })}

          {/* 근로계약서 */}
          <div className="col-span-2 flex flex-col gap-0.5 pt-1 border-t border-zinc-100 mt-1">
            <span className="text-[15px] font-bold text-zinc-400 uppercase tracking-wider">근로계약서</span>
            {selectedEmp.contract_file_url ? (
              <button
                type="button"
                onClick={() => window.open(selectedEmp.contract_file_url as string, "_blank", "noopener,noreferrer")}
                className="mt-1 inline-flex items-center gap-1.5 h-7 px-2.5 text-[15px] font-semibold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] rounded-md shadow-sm cursor-pointer self-start"
              >
                <ExternalLink size={11} /> 보기
              </button>
            ) : (
              <span className="text-[15px] font-semibold text-zinc-400 italic mt-1">없음</span>
            )}
          </div>
        </div>

        {selectedEmp.memo && (
          <div className="bg-white rounded-xl border border-line p-3.5 shadow-sm">
            <span className="text-[15px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">메모</span>
            <p className="text-[14px] text-zinc-700 whitespace-pre-wrap leading-relaxed">{selectedEmp.memo}</p>
          </div>
        )}
      </div>

      {/* 하단 액션 */}
      <div className="px-3.5 py-2.5 border-t border-zinc-100 bg-white flex gap-1.5 shrink-0">
        <button
          onClick={onEdit}
          className="flex-1 h-9 text-[14px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer hover:bg-indigo-100 transition-colors"
        >
          <Edit2 size={13} /> 편집
        </button>
        <button
          onClick={onDelete}
          className="h-9 px-4 text-[14px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl flex items-center gap-1.5 cursor-pointer hover:bg-red-100 transition-colors"
        >
          <Trash2 size={13} /> 삭제
        </button>
      </div>
    </div>
  </div>
);
