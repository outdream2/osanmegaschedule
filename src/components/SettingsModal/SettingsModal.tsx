// src/components/SettingsModal.tsx
import React, { useState } from "react";
import { X, Plus, Trash2, GripVertical } from "lucide-react";
import { AppSettings, WageRate } from "../../hooks/useSettings";

interface SettingsModalProps {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => void;
  onApplyShiftHours: (open: string, middle: string, close: string) => Promise<void>;
  onClose: () => void;
  employees: Array<{ id: number; name: string; position: string }>;
}

type TabId = "positions" | "workplaces" | "scheduleTypes" | "shiftHours" | "wages";

const TABS: { id: TabId; label: string }[] = [
  { id: "positions", label: "직급 종류" },
  { id: "workplaces", label: "근무지 종류" },
  { id: "scheduleTypes", label: "근무 유형" },
  { id: "shiftHours", label: "기본 근무시간" },
  { id: "wages", label: "시급 설정" },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onUpdate, onApplyShiftHours, onClose, employees }) => {
  const [activeTab, setActiveTab] = useState<TabId>("positions");

  // Local draft states — committed immediately on each action
  const [positions, setPositions] = useState<string[]>([...settings.positions]);
  const [newPosition, setNewPosition] = useState("");

  const [workplaces, setWorkplaces] = useState<string[]>([...settings.workplaces]);
  const [newWorkplace, setNewWorkplace] = useState("");

  const [scheduleTypes, setScheduleTypes] = useState<string[]>([...settings.scheduleTypes]);
  const [newScheduleType, setNewScheduleType] = useState("");

  const [openShiftHour, setOpenShiftHour] = useState(settings.openShiftHour);
  const [middleShiftHour, setMiddleShiftHour] = useState(settings.middleShiftHour);
  const [closeShiftHour, setCloseShiftHour] = useState(settings.closeShiftHour);
  const [applying, setApplying] = useState(false);

  // Wage settings local drafts (committed immediately)
  const [wageRates, setWageRates] = useState<Record<string, WageRate>>({ ...(settings.wageRates ?? {}) });
  const [employeeWageOverrides, setEmployeeWageOverrides] = useState<Record<number, WageRate>>({ ...(settings.employeeWageOverrides ?? {}) });
  const [selectedEmpId, setSelectedEmpId] = useState<number | "">("");

  // Drag state for positions reorder
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // ── helpers ──────────────────────────────────────────────────────────────

  const savePositions = (next: string[]) => {
    setPositions(next);
    onUpdate({ positions: next });
  };

  const saveWorkplaces = (next: string[]) => {
    setWorkplaces(next);
    onUpdate({ workplaces: next });
  };

  const saveScheduleTypes = (next: string[]) => {
    setScheduleTypes(next);
    onUpdate({ scheduleTypes: next });
  };

  // ── positions ─────────────────────────────────────────────────────────────

  const addPosition = () => {
    const trimmed = newPosition.trim();
    if (!trimmed || positions.includes(trimmed)) return;
    const next = [...positions, trimmed];
    savePositions(next);
    setNewPosition("");
  };

  const removePosition = (idx: number) => {
    savePositions(positions.filter((_, i) => i !== idx));
  };

  const handlePositionDragStart = (idx: number) => setDragIndex(idx);

  const handlePositionDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIndex(idx);
  };

  const handlePositionDrop = (targetIdx: number) => {
    if (dragIndex === null || dragIndex === targetIdx) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const next = [...positions];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIdx, 0, moved);
    savePositions(next);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handlePositionDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // ── workplaces ────────────────────────────────────────────────────────────

  const addWorkplace = () => {
    const trimmed = newWorkplace.trim();
    if (!trimmed || workplaces.includes(trimmed)) return;
    saveWorkplaces([...workplaces, trimmed]);
    setNewWorkplace("");
  };

  const removeWorkplace = (idx: number) => {
    saveWorkplaces(workplaces.filter((_, i) => i !== idx));
  };

  // ── scheduleTypes ─────────────────────────────────────────────────────────

  const addScheduleType = () => {
    const trimmed = newScheduleType.trim();
    if (!trimmed || scheduleTypes.includes(trimmed)) return;
    saveScheduleTypes([...scheduleTypes, trimmed]);
    setNewScheduleType("");
  };

  const removeScheduleType = (idx: number) => {
    saveScheduleTypes(scheduleTypes.filter((_, i) => i !== idx));
  };

  // ── shift hours ───────────────────────────────────────────────────────────

  const saveShiftHours = (
    open: string = openShiftHour,
    middle: string = middleShiftHour,
    close: string = closeShiftHour,
  ) => {
    onUpdate({ openShiftHour: open, middleShiftHour: middle, closeShiftHour: close });
  };

  const resetShiftHours = () => {
    const open = "09:30-18:30";
    const middle = "11:00-20:00";
    const close = "13:00-22:00";
    setOpenShiftHour(open);
    setMiddleShiftHour(middle);
    setCloseShiftHour(close);
    saveShiftHours(open, middle, close);
  };

  // ── wages ─────────────────────────────────────────────────────────────────

  const saveWageRates = (next: Record<string, WageRate>) => {
    setWageRates(next);
    onUpdate({ wageRates: next });
  };

  const saveEmployeeOverrides = (next: Record<number, WageRate>) => {
    setEmployeeWageOverrides(next);
    onUpdate({ employeeWageOverrides: next });
  };

  const updatePositionWage = (position: string, field: keyof WageRate, value: number) => {
    const prev = wageRates[position] ?? { weekday: 0, weekend: 0 };
    const next = { ...wageRates, [position]: { ...prev, [field]: value } };
    saveWageRates(next);
  };

  const updateEmployeeOverride = (empId: number, field: keyof WageRate, value: number) => {
    const prev = employeeWageOverrides[empId] ?? { weekday: 0, weekend: 0 };
    const next = { ...employeeWageOverrides, [empId]: { ...prev, [field]: value } };
    saveEmployeeOverrides(next);
  };

  const addEmployeeOverride = () => {
    if (selectedEmpId === "" || selectedEmpId === null) return;
    const id = Number(selectedEmpId);
    if (!Number.isFinite(id)) return;
    if (employeeWageOverrides[id]) return; // already exists
    // Seed from the employee's position wage if defined, else zeros
    const emp = employees.find((e) => e.id === id);
    const seed: WageRate = (emp && wageRates[emp.position])
      ? { ...wageRates[emp.position] }
      : { weekday: 0, weekend: 0 };
    saveEmployeeOverrides({ ...employeeWageOverrides, [id]: seed });
    setSelectedEmpId("");
  };

  const removeEmployeeOverride = (empId: number) => {
    const next = { ...employeeWageOverrides };
    delete next[empId];
    saveEmployeeOverrides(next);
  };

  const parseWageInput = (raw: string): number => {
    const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const employeesWithOverride = employees.filter((e) => employeeWageOverrides[e.id]);
  const employeesWithoutOverride = employees.filter((e) => !employeeWageOverrides[e.id]);

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <span>⚙️</span>
            <span>환경 설정</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            title="닫기"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-slate-100 shrink-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-xs font-bold whitespace-nowrap transition border-b-2 cursor-pointer ${
                activeTab === tab.id
                  ? "border-[#2563eb] text-[#2563eb] bg-blue-50/40"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* ─── Positions Tab ─────────────────────────────────────────── */}
          {activeTab === "positions" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 font-semibold">
                직원 등록/수정 화면에서 표시될 직급 목록을 관리합니다. 드래그하여 순서를 변경할 수 있습니다.
              </p>
              <div className="space-y-1.5">
                {positions.map((pos, idx) => (
                  <div
                    key={pos}
                    draggable
                    onDragStart={() => handlePositionDragStart(idx)}
                    onDragOver={(e) => handlePositionDragOver(e, idx)}
                    onDrop={() => handlePositionDrop(idx)}
                    onDragEnd={handlePositionDragEnd}
                    className={`flex items-center gap-2 bg-white border rounded-lg px-3 py-2 transition ${
                      dragOverIndex === idx && dragIndex !== idx
                        ? "border-blue-400 bg-blue-50"
                        : "border-slate-200 hover:border-slate-300"
                    } ${dragIndex === idx ? "opacity-40" : ""}`}
                  >
                    <div className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0">
                      <GripVertical size={14} />
                    </div>
                    <span className="flex-1 text-xs font-semibold text-slate-800">{pos}</span>
                    <button
                      type="button"
                      onClick={() => removePosition(idx)}
                      className="text-slate-300 hover:text-rose-500 transition cursor-pointer p-0.5 rounded"
                      title="삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newPosition}
                  onChange={(e) => setNewPosition(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPosition(); } }}
                  placeholder="새 직급 입력 (Enter)"
                  className="flex-1 text-xs rounded-lg border border-slate-200 focus:border-[#2563eb] p-2 bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addPosition}
                  className="px-3 py-2 text-xs font-bold bg-[#2563eb] hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 transition cursor-pointer"
                >
                  <Plus size={13} />
                  추가
                </button>
              </div>
            </div>
          )}

          {/* ─── Workplaces Tab ────────────────────────────────────────── */}
          {activeTab === "workplaces" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 font-semibold">
                직원의 근무지(부서) 목록을 관리합니다. 기본값: 매장, 창고
              </p>
              <div className="space-y-1.5">
                {workplaces.map((wp, idx) => (
                  <div
                    key={wp}
                    className="flex items-center gap-2 bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 transition"
                  >
                    <span className="flex-1 text-xs font-semibold text-slate-800">{wp}</span>
                    <button
                      type="button"
                      onClick={() => removeWorkplace(idx)}
                      className="text-slate-300 hover:text-rose-500 transition cursor-pointer p-0.5 rounded"
                      title="삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newWorkplace}
                  onChange={(e) => setNewWorkplace(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWorkplace(); } }}
                  placeholder="새 근무지 입력 (Enter)"
                  className="flex-1 text-xs rounded-lg border border-slate-200 focus:border-[#2563eb] p-2 bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addWorkplace}
                  className="px-3 py-2 text-xs font-bold bg-[#2563eb] hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 transition cursor-pointer"
                >
                  <Plus size={13} />
                  추가
                </button>
              </div>
            </div>
          )}

          {/* ─── Schedule Types Tab ────────────────────────────────────── */}
          {activeTab === "scheduleTypes" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 font-semibold">
                스케줄 셀 및 일괄 등록에서 사용할 근무 유형 목록을 관리합니다.
              </p>
              <div className="space-y-1.5">
                {scheduleTypes.map((st, idx) => (
                  <div
                    key={st}
                    className="flex items-center gap-2 bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 transition"
                  >
                    <span className="flex-1 text-xs font-semibold text-slate-800">{st}</span>
                    <button
                      type="button"
                      onClick={() => removeScheduleType(idx)}
                      className="text-slate-300 hover:text-rose-500 transition cursor-pointer p-0.5 rounded"
                      title="삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newScheduleType}
                  onChange={(e) => setNewScheduleType(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addScheduleType(); } }}
                  placeholder="새 근무 유형 입력 (Enter)"
                  className="flex-1 text-xs rounded-lg border border-slate-200 focus:border-[#2563eb] p-2 bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addScheduleType}
                  className="px-3 py-2 text-xs font-bold bg-[#2563eb] hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 transition cursor-pointer"
                >
                  <Plus size={13} />
                  추가
                </button>
              </div>
            </div>
          )}

          {/* ─── Shift Hours Tab ───────────────────────────────────────── */}
          {activeTab === "shiftHours" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                오픈, 미들, 마감의 글로벌 기준 근무 시간을 설정합니다. 빠른 채우기 Preset, 일괄 입력 도구, 실시간 맵배치도에 일관 적용됩니다.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Open */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-500 shrink-0"></span>
                    <label className="text-[11px] font-bold text-slate-700">오픈 근무시간 ☀️</label>
                  </div>
                  <input
                    type="text"
                    value={openShiftHour}
                    onChange={(e) => {
                      setOpenShiftHour(e.target.value);
                      saveShiftHours(e.target.value, middleShiftHour, closeShiftHour);
                    }}
                    placeholder="예: 09:30-18:30"
                    className="w-full text-xs rounded-lg border border-slate-200 focus:border-blue-500 p-2 font-mono bg-white focus:outline-none"
                  />
                </div>

                {/* Middle */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400 border border-sky-500 shrink-0"></span>
                    <label className="text-[11px] font-bold text-slate-700">미들 근무시간 ⛅</label>
                  </div>
                  <input
                    type="text"
                    value={middleShiftHour}
                    onChange={(e) => {
                      setMiddleShiftHour(e.target.value);
                      saveShiftHours(openShiftHour, e.target.value, closeShiftHour);
                    }}
                    placeholder="예: 11:00-20:00"
                    className="w-full text-xs rounded-lg border border-slate-200 focus:border-blue-500 p-2 font-mono bg-white focus:outline-none"
                  />
                </div>

                {/* Close */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 border border-emerald-500 shrink-0"></span>
                    <label className="text-[11px] font-bold text-slate-700">마감 근무시간 🌙</label>
                  </div>
                  <input
                    type="text"
                    value={closeShiftHour}
                    onChange={(e) => {
                      setCloseShiftHour(e.target.value);
                      saveShiftHours(openShiftHour, middleShiftHour, e.target.value);
                    }}
                    placeholder="예: 13:00-22:00"
                    className="w-full text-xs rounded-lg border border-slate-200 focus:border-blue-500 p-2 font-mono bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetShiftHours}
                  className="px-3 py-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                >
                  기본값 복원 (Reset)
                </button>
                <button
                  type="button"
                  disabled={applying}
                  onClick={async () => {
                    setApplying(true);
                    try {
                      await onApplyShiftHours(openShiftHour, middleShiftHour, closeShiftHour);
                    } finally {
                      setApplying(false);
                    }
                  }}
                  className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 text-white rounded-lg transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  {applying ? (
                    <>
                      <span className="animate-spin inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full" />
                      적용 중...
                    </>
                  ) : "📋 현재 스케쥴에 전체적용"}
                </button>
              </div>
            </div>
          )}

          {/* ─── Wages Tab ─────────────────────────────────────────────── */}
          {activeTab === "wages" && (
            <div className="space-y-6">
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                직급별 기본 시급과 개인별 시급(직급별 설정을 덮어쓰기)을 설정합니다. 인건비 합계는 스케줄 표의 합계 셀에 자동 표시됩니다.
              </p>

              {/* ── Section 1: 직급별 시급 ───────────────────────────── */}
              <div className="space-y-3">
                <h3 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <span className="w-1 h-3 bg-[#2563eb] rounded-full inline-block"></span>
                  직급별 시급
                </h3>

                {positions.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">먼저 "직급 종류" 탭에서 직급을 추가해 주세요.</p>
                ) : (
                  <div className="space-y-1.5">
                    {/* Header row */}
                    <div className="grid grid-cols-[1fr,1fr,1fr] gap-2 px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                      <span>직급</span>
                      <span>주중 시급 (원)</span>
                      <span>주말 시급 (원)</span>
                    </div>
                    {positions.map((pos) => {
                      const rate = wageRates[pos] ?? { weekday: 0, weekend: 0 };
                      return (
                        <div
                          key={pos}
                          className="grid grid-cols-[1fr,1fr,1fr] gap-2 items-center bg-white border border-slate-200 rounded-lg px-3 py-2"
                        >
                          <span className="text-xs font-semibold text-slate-800 truncate">{pos}</span>
                          <input
                            type="number"
                            min={0}
                            value={rate.weekday || ""}
                            onChange={(e) => updatePositionWage(pos, "weekday", parseWageInput(e.target.value))}
                            placeholder="예: 10340"
                            className="w-full text-xs rounded-lg border border-slate-200 focus:border-[#2563eb] p-2 bg-white focus:outline-none"
                          />
                          <input
                            type="number"
                            min={0}
                            value={rate.weekend || ""}
                            onChange={(e) => updatePositionWage(pos, "weekend", parseWageInput(e.target.value))}
                            placeholder="예: 10340"
                            className="w-full text-xs rounded-lg border border-slate-200 focus:border-[#2563eb] p-2 bg-white focus:outline-none"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Section 2: 개인별 시급 ───────────────────────────── */}
              <div className="space-y-3">
                <h3 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <span className="w-1 h-3 bg-emerald-500 rounded-full inline-block"></span>
                  개인별 시급
                  <span className="text-[10px] font-semibold text-slate-400">(직급별 설정 덮어쓰기)</span>
                </h3>

                {/* Existing overrides list */}
                {employeesWithOverride.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-[1fr,1fr,1fr,32px] gap-2 px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                      <span>직원</span>
                      <span>주중 시급 (원)</span>
                      <span>주말 시급 (원)</span>
                      <span></span>
                    </div>
                    {employeesWithOverride.map((emp) => {
                      const rate = employeeWageOverrides[emp.id] ?? { weekday: 0, weekend: 0 };
                      return (
                        <div
                          key={emp.id}
                          className="grid grid-cols-[1fr,1fr,1fr,32px] gap-2 items-center bg-white border border-slate-200 rounded-lg px-3 py-2"
                        >
                          <span className="text-xs font-semibold text-slate-800 truncate">
                            {emp.name}
                            <span className="text-[10px] font-medium text-slate-400 ml-1">({emp.position})</span>
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={rate.weekday || ""}
                            onChange={(e) => updateEmployeeOverride(emp.id, "weekday", parseWageInput(e.target.value))}
                            placeholder="예: 10340"
                            className="w-full text-xs rounded-lg border border-slate-200 focus:border-[#2563eb] p-2 bg-white focus:outline-none"
                          />
                          <input
                            type="number"
                            min={0}
                            value={rate.weekend || ""}
                            onChange={(e) => updateEmployeeOverride(emp.id, "weekend", parseWageInput(e.target.value))}
                            placeholder="예: 10340"
                            className="w-full text-xs rounded-lg border border-slate-200 focus:border-[#2563eb] p-2 bg-white focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => removeEmployeeOverride(emp.id)}
                            className="text-slate-300 hover:text-rose-500 transition cursor-pointer p-1 rounded justify-self-center"
                            title="개인 시급 제거"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">아직 개인별 시급이 설정된 직원이 없습니다.</p>
                )}

                {/* Add new override */}
                <div className="flex gap-2 pt-1">
                  <select
                    value={selectedEmpId === "" ? "" : String(selectedEmpId)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedEmpId(v === "" ? "" : Number(v));
                    }}
                    className="flex-1 text-xs rounded-lg border border-slate-200 focus:border-[#2563eb] p-2 bg-white focus:outline-none"
                  >
                    <option value="">직원 선택...</option>
                    {employeesWithoutOverride.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.position})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addEmployeeOverride}
                    disabled={selectedEmpId === ""}
                    className="px-3 py-2 text-xs font-bold bg-[#2563eb] hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-1 transition cursor-pointer"
                  >
                    <Plus size={13} />
                    추가
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-black text-white bg-[#2563eb] hover:bg-blue-700 rounded-lg shadow-sm transition cursor-pointer"
          >
            완료 및 닫기
          </button>
        </div>
      </div>
    </div>
  );
};
