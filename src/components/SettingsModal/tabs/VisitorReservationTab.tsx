// 2026-10-06 · #VisitorReservationEmployeeAssignment · Phase 5
//   · 방문예약 담당자 (employees.id 다중선택) + slot 설정 + 스케줄 연동 토글
//   · 하드코드 "대표/이사" 완전 제거 · 재직 직원 중에서 선택
//   · 퇴직 직원 숨김 · 저장된 설정 중 퇴직자 → "비활성 직원" 배지로 표시 (조용히 삭제 X)
import React, { useMemo } from "react";
import { Plus, X, UserCheck, Clock, Timer, CalendarDays } from "lucide-react";
import type { VisitorReservationSettings } from "../../../hooks/useSettings";

export interface SettingsEmployeeOption {
  id: number;
  name: string;
  position?: string;
  rank?: string | null;
  retireDate?: string | null;
}

export interface VisitorReservationTabProps {
  value: VisitorReservationSettings;
  onChange: (next: VisitorReservationSettings) => void;
  employees: SettingsEmployeeOption[];
}

const SLOT_OPTIONS = [15, 20, 30, 45, 60, 90, 120];
const BUFFER_OPTIONS = [0, 5, 10, 15, 20, 30];

export const VisitorReservationTab: React.FC<VisitorReservationTabProps> = ({ value, onChange, employees }) => {
  const activeEmployees = useMemo(
    () => employees.filter(e => !e.retireDate),
    [employees],
  );
  const employeeById = useMemo(() => {
    const m = new Map<number, SettingsEmployeeOption>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);

  const selected = value.assigneeEmployeeIds ?? [];
  const availableToAdd = activeEmployees.filter(e => !selected.includes(e.id));

  const addEmployee = (id: number) => {
    if (!id) return;
    if (selected.includes(id)) return;
    onChange({ ...value, assigneeEmployeeIds: [...selected, id] });
  };
  const removeEmployee = (id: number) => {
    onChange({ ...value, assigneeEmployeeIds: selected.filter(x => x !== id) });
  };
  const moveEmployee = (idx: number, dir: -1 | 1) => {
    const next = [...selected];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ ...value, assigneeEmployeeIds: next });
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-zinc-500 font-semibold leading-relaxed">
          거래처가 "방문예약" 페이지에서 선택할 수 있는 담당 직원과 슬롯 길이를 설정합니다.
          <br />
          <span className="text-brand-deep font-semibold">
            담당자 스케줄(근무시간)에 자동 연동되며, 휴무일에는 예약이 차단됩니다.
          </span>
        </p>
      </div>

      {/* 담당자 목록 */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
          <UserCheck size={13} /> 예약 담당자
          <span className="text-[11px] font-semibold text-zinc-400">· {selected.length}명</span>
        </h3>
        {selected.length === 0 ? (
          <div className="text-xs text-rose-500 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 font-semibold">
            지정된 담당자가 없습니다. 아래에서 추가하세요. (설정 전까지 거래처의 방문예약은 차단됩니다.)
          </div>
        ) : (
          <ul className="space-y-1.5">
            {selected.map((id, idx) => {
              const emp = employeeById.get(id);
              const isRetired = Boolean(emp?.retireDate);
              const isMissing = !emp;
              return (
                <li
                  key={id}
                  className={`flex items-center gap-2 border rounded-lg px-3 py-2 ${
                    isMissing || isRetired ? "bg-zinc-50 border-dashed border-zinc-300" : "bg-white border-line"
                  }`}
                >
                  <span className="text-[11px] font-bold text-zinc-400 w-5 text-center tabular-nums">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-zinc-800 truncate">
                      {emp?.name ?? `직원 #${id}`}
                      {emp?.rank && <span className="ml-1.5 text-[11px] font-semibold text-zinc-500">· {emp.rank}</span>}
                      {emp?.position && <span className="ml-1 text-[11px] font-normal text-zinc-400">({emp.position})</span>}
                    </div>
                    {(isMissing || isRetired) && (
                      <div className="text-[11px] font-semibold text-amber-600 mt-0.5">
                        {isMissing ? "⚠ 직원 정보를 찾을 수 없음 (삭제됨)" : "⚠ 비활성 직원 (퇴직)"}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveEmployee(idx, -1)}
                      disabled={idx === 0}
                      className="text-xs font-bold text-zinc-400 hover:text-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed px-1.5 py-0.5 rounded cursor-pointer"
                      title="위로"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveEmployee(idx, 1)}
                      disabled={idx === selected.length - 1}
                      className="text-xs font-bold text-zinc-400 hover:text-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed px-1.5 py-0.5 rounded cursor-pointer"
                      title="아래로"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeEmployee(id)}
                      className="text-zinc-300 hover:text-rose-500 transition cursor-pointer p-0.5 rounded"
                      title="제거"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* 추가 UI */}
        <div className="flex gap-2 pt-1">
          <select
            className="flex-1 text-xs rounded-lg border border-line focus:border-[#2563eb] px-2 py-2 bg-white focus:outline-none"
            value=""
            onChange={e => {
              const id = Number(e.target.value);
              if (id > 0) addEmployee(id);
              e.currentTarget.value = "";
            }}
            disabled={availableToAdd.length === 0}
          >
            <option value="">
              {availableToAdd.length === 0 ? "추가할 재직 직원이 없습니다" : "직원 선택..."}
            </option>
            {availableToAdd.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.name}{emp.rank ? ` · ${emp.rank}` : ""}{emp.position ? ` (${emp.position})` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => { /* select onChange 로 처리 */ }}
            disabled
            className="px-3 py-2 text-xs font-bold bg-brand-deep text-white rounded-lg flex items-center gap-1 opacity-40 cursor-default"
            title="위 셀렉트에서 선택 시 자동 추가"
          >
            <Plus size={13} />
            추가
          </button>
        </div>
      </section>

      {/* slot / buffer / schedule 연동 */}
      <section className="space-y-3 pt-2 border-t border-line">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Clock size={11} /> 예약 단위
            </label>
            <select
              value={value.slotMinutes}
              onChange={e => onChange({ ...value, slotMinutes: Number(e.target.value) })}
              className="w-full text-xs rounded-lg border border-line focus:border-[#2563eb] px-2 py-2 bg-white focus:outline-none"
            >
              {SLOT_OPTIONS.map(m => (
                <option key={m} value={m}>{m}분</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Timer size={11} /> 여유시간
            </label>
            <select
              value={value.bufferMinutes}
              onChange={e => onChange({ ...value, bufferMinutes: Number(e.target.value) })}
              className="w-full text-xs rounded-lg border border-line focus:border-[#2563eb] px-2 py-2 bg-white focus:outline-none"
            >
              {BUFFER_OPTIONS.map(m => (
                <option key={m} value={m}>{m}분</option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 bg-white border border-line rounded-lg px-3 py-2 cursor-pointer hover:border-zinc-300 transition">
          <input
            type="checkbox"
            checked={value.useEmployeeSchedule}
            onChange={e => onChange({ ...value, useEmployeeSchedule: e.target.checked })}
            className="w-4 h-4 accent-brand-deep cursor-pointer"
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
              <CalendarDays size={11} /> 담당자 스케줄 연동
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              켜짐: 담당자의 근무시간 (스케줄페이지의 workingHours) 안에서만 예약 가능. 휴무일 자동 차단.
            </div>
          </div>
        </label>
      </section>
    </div>
  );
};
