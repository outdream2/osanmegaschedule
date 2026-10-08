// src/components/schedule-v2/components/BulkEmployeePickerModal.tsx
// 2026-10-08 · 스케줄 V2 · 일괄등록 shortcut 용 직원 picker
//   · Month/Week toolbar [일괄등록] 버튼 → 이 모달 → 직원 선택 → Employee View bulk subview
//   · 신규 bulk logic 0 (기존 EmployeeBulkPanel 그대로 사용)
//   · 신규 거대 UI 0 · 기존 Modal primitive 재사용 + 간단 search + list
//   · 트렌드 V2 톤 · thin border · neutral surface · compact controls
import React, { useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Modal } from "../../common/Modal";
import { KO_INPUT_PROPS } from "../../../lib/koreanInput";
import type { Employee } from "../../../types";

interface Props {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  onSelect: (employeeId: number) => void;
}

export const BulkEmployeePickerModal: React.FC<Props> = ({ open, onClose, employees, onSelect }) => {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(e => (e.name ?? "").toLowerCase().includes(q));
  }, [employees, query]);

  const handlePick = (id: number) => {
    onSelect(id);
    setQuery("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={() => { setQuery(""); onClose(); }}
      title="일괄 등록 · 직원 선택"
      size="sm"
      bodyPadding="none"
    >
      <div className="flex flex-col max-h-[60vh]">
        <div className="shrink-0 p-3 border-b border-line">
          <div className="relative">
            <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="이름 검색"
              className="w-full h-9 pl-7 pr-2 text-[13px] rounded-md border border-line bg-white placeholder:text-zinc-400 focus:outline-none focus:border-brand-deep focus:ring-1 focus:ring-brand-deep/20"
              autoFocus
              {...KO_INPUT_PROPS}
            />
          </div>
          <div className="mt-1.5 text-[11px] text-ink-soft tabular-nums">
            {filtered.length} / {employees.length}명
          </div>
        </div>
        <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-zinc-100">
          {filtered.map(emp => (
            <li key={`bp-${emp.id}`}>
              <button
                type="button"
                onClick={() => handlePick(emp.id)}
                className="w-full text-left px-3 py-2.5 hover:bg-brand-tint/40 transition cursor-pointer"
              >
                <div className="text-[13px] font-semibold text-ink leading-tight">{emp.name}</div>
                <div className="text-[11px] text-ink-soft leading-tight">
                  {emp.position ?? ""}{emp.employmentType ? ` · ${emp.employmentType}` : ""}
                </div>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-[12px] text-ink-soft">검색 결과 없음</li>
          )}
        </ul>
      </div>
    </Modal>
  );
};

export default BulkEmployeePickerModal;
