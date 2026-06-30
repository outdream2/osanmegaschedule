// src/components/DisplayPage/ZoneGroupPanel.tsx
import React from "react";
import { Plus, Trash2, MapPin, Check } from "lucide-react";

export interface ZoneGroup {
  id: string;
  name: string;
  color: string;
  areaIds: string[];
  employeeId: number | null;
  employeeName: string;
}

interface EmployeeLike {
  id: number;
  name: string;
  position?: string;
}

interface ZoneGroupPanelProps {
  groups: ZoneGroup[];
  activeGroupId: string | null;
  employees: EmployeeLike[];
  onGroupsChange: (groups: ZoneGroup[]) => void;
  onActiveGroupChange: (id: string | null) => void;
}

const PALETTE = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#6366f1", "#a855f7", "#ec4899"];

const DEFAULT_NAMES = ["A구역", "B구역", "C구역", "D구역", "E구역", "F구역", "G구역", "H구역"];

const newId = () => `zg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const pickNextColor = (groups: ZoneGroup[]): string => {
  const used = new Set(groups.map((g) => g.color));
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[groups.length % PALETTE.length];
};

const pickNextName = (groups: ZoneGroup[]): string => {
  const used = new Set(groups.map((g) => g.name));
  return DEFAULT_NAMES.find((n) => !used.has(n)) ?? `구역${groups.length + 1}`;
};

export const ZoneGroupPanel: React.FC<ZoneGroupPanelProps> = ({
  groups,
  activeGroupId,
  employees,
  onGroupsChange,
  onActiveGroupChange,
}) => {
  const addGroup = () => {
    const g: ZoneGroup = {
      id: newId(),
      name: pickNextName(groups),
      color: pickNextColor(groups),
      areaIds: [],
      employeeId: null,
      employeeName: "",
    };
    onGroupsChange([...groups, g]);
    onActiveGroupChange(g.id);
  };

  const updateGroup = (id: string, patch: Partial<ZoneGroup>) => {
    onGroupsChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  const deleteGroup = (id: string) => {
    onGroupsChange(groups.filter((g) => g.id !== id));
    if (activeGroupId === id) onActiveGroupChange(null);
  };

  const handleEmployeeChange = (id: string, value: string) => {
    if (!value) {
      updateGroup(id, { employeeId: null, employeeName: "" });
      return;
    }
    const empId = Number(value);
    const emp = employees.find((e) => e.id === empId);
    updateGroup(id, { employeeId: empId, employeeName: emp?.name ?? "" });
  };

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;

  return (
    <div className="bg-white border-2 border-indigo-200 rounded-xl p-3 mb-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-indigo-600" />
          <h3 className="text-sm font-black text-slate-800">구역 그룹 설정</h3>
          <span className="text-[10px] text-slate-500 font-semibold bg-slate-100 px-2 py-0.5 rounded-full">
            {groups.length}개 그룹
          </span>
        </div>
        <button
          type="button"
          onClick={addGroup}
          disabled={groups.length >= PALETTE.length}
          className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-[11px] font-bold rounded-lg transition cursor-pointer"
        >
          <Plus size={12} />
          새 구역 추가
        </button>
      </div>

      {activeGroup && (
        <div
          className="mb-2 px-3 py-2 rounded-lg text-[11px] font-bold flex items-center gap-2"
          style={{ backgroundColor: `${activeGroup.color}15`, color: activeGroup.color, border: `1px solid ${activeGroup.color}55` }}
        >
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeGroup.color }} />
          <span>
            <strong>{activeGroup.name}</strong> 선택됨 — 지도에서 구역을 클릭해 담당 영역을 추가/제거하세요
          </span>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="text-center py-6 text-slate-400 text-xs">
          아직 구역 그룹이 없습니다. "새 구역 추가"를 눌러 시작하세요.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {groups.map((g) => {
            const isActive = activeGroupId === g.id;
            return (
              <div
                key={g.id}
                onClick={() => onActiveGroupChange(isActive ? null : g.id)}
                className={`relative rounded-lg p-2 cursor-pointer transition border-2 ${
                  isActive ? "shadow-md scale-[1.02]" : "border-slate-200 hover:border-slate-300 bg-slate-50"
                }`}
                style={isActive ? { borderColor: g.color, backgroundColor: `${g.color}10` } : undefined}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span
                    className="w-4 h-4 rounded-full border-2 border-white shadow shrink-0"
                    style={{ backgroundColor: g.color }}
                  />
                  <input
                    type="text"
                    value={g.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateGroup(g.id, { name: e.target.value })}
                    className="flex-1 min-w-0 bg-transparent text-[12px] font-black text-slate-800 focus:outline-none focus:bg-white px-1 rounded"
                  />
                  <span className="text-[9px] font-bold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded-full shrink-0">
                    {g.areaIds.length}구역
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deleteGroup(g.id); }}
                    className="text-slate-400 hover:text-red-500 transition cursor-pointer shrink-0"
                    title="그룹 삭제"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <select
                    value={g.employeeId ?? ""}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleEmployeeChange(g.id, e.target.value)}
                    className="flex-1 text-[10px] font-semibold bg-white border border-slate-200 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer"
                  >
                    <option value="">담당자 선택...</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                  {isActive && (
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: g.color }}
                    >
                      <Check size={11} className="text-white" />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
