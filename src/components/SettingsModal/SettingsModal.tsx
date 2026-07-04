// src/components/SettingsModal.tsx
import React, { useState, useEffect, useRef } from "react";
import { X, Plus, Trash2, GripVertical, Check } from "lucide-react";
import { AppSettings, WageRate, ScheduleTypeEntry } from "../../hooks/useSettings";
import { COLOR_PRESETS, findPresetByBg } from "../../constants";

interface SettingsModalProps {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => void;
  onApplyShiftHours: () => Promise<void>;
  onClose: () => void;
  employees: Array<{ id: number; name: string; position: string }>;
  editMode?: boolean;
  onEnableEditMode?: () => void;
}

type TabId = "positions" | "workplaces" | "scheduleTypes" | "wages";

const TABS: { id: TabId; label: string }[] = [
  { id: "positions", label: "직급 종류" },
  { id: "workplaces", label: "근무지 종류" },
  { id: "scheduleTypes", label: "근무 유형" },
  { id: "wages", label: "시급 설정" },
];

type ScheduleHourTab = "hours" | "pharmHours" | "logisticsHours" | "partTimeHours";

const HOUR_TABS: { id: ScheduleHourTab; label: string }[] = [
  { id: "hours",          label: "기본(기타)" },
  { id: "pharmHours",     label: "약사" },
  { id: "logisticsHours", label: "물류" },
  { id: "partTimeHours",  label: "알바" },
];

// ─── ColorPicker ──────────────────────────────────────────────────────────────
// A compact popover picker: click the swatch to open a palette of preset colors,
// or use the "직접" native color input for a custom hex.
interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const currentPreset = findPresetByBg(value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-6 h-6 rounded-md border border-slate-300 shadow-sm hover:ring-2 hover:ring-slate-300 transition cursor-pointer"
        style={{ backgroundColor: value }}
        title={currentPreset ? `색상: ${currentPreset.label}` : "색상 선택"}
        aria-label="색상 선택"
      />
      {open && (
        <div
          className="absolute z-20 top-full right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl p-2 w-[196px] animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-6 gap-1.5 mb-2">
            {COLOR_PRESETS.map((p) => {
              const selected = p.bg.toLowerCase() === value.toLowerCase();
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { onChange(p.bg); setOpen(false); }}
                  className={`relative w-7 h-7 rounded-md border cursor-pointer transition hover:scale-110 ${
                    selected ? "border-slate-800 ring-2 ring-slate-400" : "border-slate-200"
                  }`}
                  style={{ backgroundColor: p.bg }}
                  title={p.label}
                  aria-label={p.label}
                  aria-pressed={selected}
                >
                  {selected && (
                    <Check size={12} className="absolute inset-0 m-auto text-slate-800" strokeWidth={3} />
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-100">
            <span className="text-[10px] font-bold text-slate-500">직접</span>
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border border-slate-200 p-0.5 bg-white"
              title="직접 색상 선택"
            />
            <span className="text-[10px] font-mono text-slate-400 uppercase">{value}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onUpdate, onApplyShiftHours, onClose, employees, editMode, onEnableEditMode }) => {
  const [activeTab, setActiveTab] = useState<TabId>("positions");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Local draft states — committed immediately on each action
  const [positions, setPositions] = useState<string[]>([...settings.positions]);
  const [newPosition, setNewPosition] = useState("");

  const [workplaces, setWorkplaces] = useState<string[]>([...settings.workplaces]);
  const [newWorkplace, setNewWorkplace] = useState("");

  const [scheduleTypes, setScheduleTypes] = useState<ScheduleTypeEntry[]>([...settings.scheduleTypes]);
  const [newScheduleType, setNewScheduleType] = useState("");
  const [applying, setApplying] = useState(false);
  const [scheduleHourTab, setScheduleHourTab] = useState<ScheduleHourTab>("hours");
  const [showEditConfirm, setShowEditConfirm] = useState(false);

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

  const saveScheduleTypes = (next: ScheduleTypeEntry[]) => {
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
    if (!trimmed || scheduleTypes.some(e => e.type === trimmed)) return;
    // Default new types to the first preset (파랑) so they're visible immediately.
    const defaultColor = COLOR_PRESETS[0]?.bg ?? "#dbeafe";
    saveScheduleTypes([...scheduleTypes, { type: trimmed, hours: "", pharmHours: "", logisticsHours: "", partTimeHours: "", color: defaultColor }]);
    setNewScheduleType("");
  };

  const removeScheduleType = (idx: number) => {
    saveScheduleTypes(scheduleTypes.filter((_, i) => i !== idx));
  };

  const updateScheduleTypeEntry = (idx: number, field: keyof ScheduleTypeEntry, value: string) => {
    const next = scheduleTypes.map((e, i) => i === idx ? { ...e, [field]: value } : e);
    saveScheduleTypes(next);
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
                근무 유형과 직원 유형별 기본 근무시간을 관리합니다. 비워두면 상위(기본) 시간이 사용됩니다.
              </p>

              {/* Hour type sub-tabs */}
              <div className="flex gap-0 border border-slate-200 rounded-lg overflow-hidden">
                {HOUR_TABS.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setScheduleHourTab(t.id)}
                    className={`flex-1 py-1.5 text-[11px] font-bold transition cursor-pointer ${
                      scheduleHourTab === t.id
                        ? "bg-[#2563eb] text-white"
                        : "bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <div className="grid grid-cols-[1fr_28px_1fr_28px] gap-2 px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                  <span>유형명</span>
                  <span>색</span>
                  <span>{HOUR_TABS.find(t => t.id === scheduleHourTab)?.label} 시간</span>
                  <span></span>
                </div>
                {scheduleTypes.map((st, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_28px_1fr_28px] gap-2 items-center bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-1.5 transition"
                  >
                    <span
                      className="text-xs font-semibold text-slate-800 truncate px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: st.color ?? "#e2e8f0" }}
                    >
                      {st.type}
                    </span>
                    <ColorPicker
                      value={st.color ?? "#e2e8f0"}
                      onChange={(hex) => updateScheduleTypeEntry(idx, "color", hex)}
                    />
                    <input
                      type="text"
                      value={st[scheduleHourTab]}
                      onChange={(e) => updateScheduleTypeEntry(idx, scheduleHourTab, e.target.value)}
                      placeholder={scheduleHourTab === "hours" ? "예: 10:00-18:00" : "비워두면 기본값"}
                      className="w-full text-xs rounded border border-slate-200 focus:border-[#2563eb] p-1.5 font-mono bg-white focus:outline-none"
                    />
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
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={applying}
                  onClick={() => {
                    if (editMode === false) {
                      setShowEditConfirm(true);
                    } else {
                      setApplying(true);
                      onApplyShiftHours().finally(() => setApplying(false));
                    }
                  }}
                  className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 text-white rounded-lg transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  {applying ? (
                    <>
                      <span className="animate-spin inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full" />
                      적용 중...
                    </>
                  ) : "📋 현재 스케줄에 전체적용"}
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

      {/* Edit mode confirm dialog */}
      {showEditConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-xs animate-in zoom-in-95 duration-150 space-y-4">
            <p className="text-sm font-bold text-slate-800 text-center">편집 모드를 켜겠습니까?</p>
            <p className="text-xs text-slate-500 text-center">켜면 전체 스케줄에 수정사항이 반영되고, 이후 편집 모드가 유지됩니다.</p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setShowEditConfirm(false); onClose(); }}
                className="flex-1 px-4 py-2 text-xs font-bold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 transition cursor-pointer"
              >
                아니오
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowEditConfirm(false);
                  onEnableEditMode?.();
                  setApplying(true);
                  try { await onApplyShiftHours(); } finally { setApplying(false); }
                  onClose();
                }}
                className="flex-1 px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition cursor-pointer"
              >
                켜기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
