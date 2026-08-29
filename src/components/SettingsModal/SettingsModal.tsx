// src/components/SettingsModal.tsx
// 2026-08-17 · apiClient 마이그레이션
// #191 · Modal primitive 마이그레이션 (inline wrapper → Modal)
import React, { useState, useEffect, useRef } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { X, Plus, Trash2, GripVertical, Check, MapPin, ShieldCheck, ChevronRight } from "lucide-react";
import { AppSettings, WageRate, ScheduleTypeEntry, defaultWageForPosition } from "../../hooks/useSettings";
import { COLOR_PRESETS, findPresetByBg } from "../../constants";
// 2026-08-21 · Framework Phase 3 · Card 프리미티브
import { Card } from "../common/Card";
// #191 · Modal primitive
import { Modal } from "../common/Modal";

interface SettingsModalProps {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => void;
  onApplyShiftHours: () => Promise<void>;
  onClose: () => void;
  employees: Array<{ id: number; name: string; position: string }>;
  editMode?: boolean;
  onEnableEditMode?: () => void;
  sessionEmployeeId?: number | null;
  /** true 면 fixed 모달 chrome 없이 인라인으로 렌더링 (설정 페이지 탭 등에서 사용) */
  embedded?: boolean;
  /** 2026-08-03 · 구역 라벨 관리 링크 클릭 시 페이지 전환 콜백 (선택) · 없으면 링크 숨김 */
  onNavigateZoneLabels?: () => void;
  /** 2026-08-03 · 직원권한 관리 링크 클릭 시 페이지 전환 콜백 (선택) · 없으면 링크 숨김 · 경영관리에서 이동됨 */
  onNavigatePermissions?: () => void;
}

// 2026-08-16 · account (비밀번호 변경) 탭 제거 · MyPage 에 이미 존재 · 중복 방지
// 2026-08-29 · #177 Phase 1 · positions 탭 노출 (편집 로직은 이미 존재 · TABS 노출만)
type TabId = "positions" | "workplaces" | "scheduleTypes" | "account";

const TABS: { id: TabId; label: string }[] = [
  { id: "positions",    label: "직군" },
  { id: "workplaces",   label: "근무지 종류" },
  { id: "scheduleTypes", label: "근무 유형" },
];

type ScheduleHourTab = "hours" | "pharmHours" | "logisticsHours" | "partTimeHours";

const HOUR_TABS: { id: ScheduleHourTab; label: string }[] = [
  { id: "hours",          label: "기본(기타)" },
  { id: "pharmHours",     label: "약사" },
  { id: "logisticsHours", label: "물류" },
  { id: "partTimeHours",  label: "알바" },
];

// ─── ColorPicker ──────────────────────────────────────────────────────────────
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
        className="w-6 h-6 rounded-md border border-zinc-300 shadow-sm hover:ring-2 hover:ring-zinc-300 transition cursor-pointer"
        style={{ backgroundColor: value }}
        title={currentPreset ? `색상: ${currentPreset.label}` : "색상 선택"}
        aria-label="색상 선택"
      />
      {open && (
        <Card
          variant="raw-xl"
          rounded="lg"
          padding="none"
          className="absolute z-20 bottom-full right-0 mb-1 p-2 w-[196px] animate-in fade-in zoom-in-95 duration-100"
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
                    selected ? "border-zinc-800 ring-2 ring-zinc-400" : "border-line"
                  }`}
                  style={{ backgroundColor: p.bg }}
                  title={p.label}
                  aria-label={p.label}
                  aria-pressed={selected}
                >
                  {selected && (
                    <Check size={12} className="absolute inset-0 m-auto text-zinc-800" strokeWidth={3} />
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 pt-1.5 border-t border-zinc-100">
            <span className="text-[10px] font-bold text-zinc-500">직접</span>
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border border-line p-0.5 bg-white"
              title="직접 색상 선택"
            />
            <span className="text-[10px] font-mono text-zinc-400 uppercase">{value}</span>
          </div>
        </Card>
      )}
    </div>
  );
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onUpdate, onApplyShiftHours, onClose, employees, editMode, onEnableEditMode, sessionEmployeeId, embedded = false, onNavigateZoneLabels, onNavigatePermissions }) => {
  const [activeTab, setActiveTab] = useState<TabId>("positions");

  // ─── 비밀번호 변경 상태 ─────────────────────────────────────
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const submitPasswordChange = async () => {
    setPwMsg(null);
    if (!sessionEmployeeId) {
      setPwMsg({ type: "err", text: "로그인 정보가 없습니다. 다시 로그인해주세요." });
      return;
    }
    if (!pwCurrent) { setPwMsg({ type: "err", text: "현재 비밀번호를 입력해주세요" }); return; }
    if (pwNew.length < 4) { setPwMsg({ type: "err", text: "새 비밀번호는 최소 4자 이상이어야 합니다" }); return; }
    if (pwNew !== pwConfirm) { setPwMsg({ type: "err", text: "새 비밀번호가 서로 일치하지 않습니다" }); return; }
    if (pwNew === pwCurrent) { setPwMsg({ type: "err", text: "새 비밀번호가 현재 비밀번호와 동일합니다" }); return; }
    setPwSubmitting(true);
    try {
      await api.post("/api/auth/change-password", { employeeId: sessionEmployeeId, currentPassword: pwCurrent, newPassword: pwNew }, { skipRefresh: true });
      setPwMsg({ type: "ok", text: "비밀번호가 변경되었습니다" });
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
    } catch (e: any) {
      setPwMsg({ type: "err", text: e instanceof ApiError ? e.message : (e?.message ?? "네트워크 오류") });
    } finally {
      setPwSubmitting(false);
    }
  };

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

  // #191 · 공통 body · embedded/modal 양쪽 공유
  const body = (
    <>
      {/* Tabs */}
      <div className="flex gap-0 border-b border-zinc-100 shrink-0 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-xs font-bold whitespace-nowrap transition border-b-2 cursor-pointer ${
              activeTab === tab.id
                ? "border-[#2563eb] text-[#2563eb] bg-blue-50/40"
                : "border-transparent text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 2026-08-12 · 사용자 지시 · 스케쥴 설정 · 근무지 종류 · 구역 라벨 관리 링크 일단 제거 */}

      {/* 2026-08-03 · 직원권한 관리 링크 (경영관리에서 이동) */}
      {onNavigatePermissions && (
        <div className="px-6 pt-3 shrink-0">
          <button
            type="button"
            onClick={() => { onNavigatePermissions(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-indigo-200 bg-indigo-50 hover:border-indigo-400 hover:shadow-sm active:scale-[0.99] transition-all cursor-pointer text-left group"
          >
            <div className="w-9 h-9 rounded-lg bg-white border border-indigo-200 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition">
              <ShieldCheck size={16} className="text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-zinc-800 leading-tight">직원권한 관리</div>
              <div className="text-[11px] font-semibold text-zinc-500 leading-tight mt-0.5">페이지별 · 직원별 접근 권한 (level 0~9) 설정</div>
            </div>
            <ChevronRight size={16} className="text-indigo-500 shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto overflow-x-auto min-w-0 px-6 py-5 space-y-4">

        {/* ─── Positions Tab ─────────────────────────────────────────── */}
        {/* 2026-08-29 · #177 Phase 1 · 직군 편집 · 드래그 재정렬 · 팀장 유일성 안내 */}
        {activeTab === "positions" && (
          <div className="space-y-4">
            <p className="text-xs text-zinc-500 font-semibold">
              직원 직군(직책) 목록을 관리합니다. 드래그로 순서 조정 · Enter 로 추가.
              <br />
              <span className="text-brand-deep font-semibold">
                💡 "팀장" 이 포함된 직군(예: 물류팀장·약사팀장)은 재직자 1명만 허용됩니다 (#178).
              </span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {positions.map((pos, idx) => {
                const isTeamLead = pos.includes("팀장");
                const isDragTarget = dragOverIndex === idx && dragIndex !== null && dragIndex !== idx;
                return (
                  <div
                    key={pos}
                    draggable
                    onDragStart={() => handlePositionDragStart(idx)}
                    onDragOver={(e) => handlePositionDragOver(e, idx)}
                    onDrop={() => handlePositionDrop(idx)}
                    onDragEnd={handlePositionDragEnd}
                    className={`flex items-center gap-2 bg-white border rounded-lg px-3 py-2 transition cursor-move ${
                      isDragTarget ? "border-brand-deep ring-2 ring-brand-tint" : "border-line hover:border-zinc-300"
                    }`}
                  >
                    <GripVertical size={13} className="text-zinc-300" />
                    <span className={`flex-1 text-xs font-semibold ${isTeamLead ? "text-brand-deep" : "text-zinc-800"}`}>
                      {pos}
                      {isTeamLead && <span className="ml-1 text-[10px] font-normal text-brand-deep/70">· 유일</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePosition(idx)}
                      className="text-zinc-300 hover:text-rose-500 transition cursor-pointer p-0.5 rounded"
                      title="삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                value={newPosition}
                onChange={(e) => setNewPosition(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPosition(); } }}
                placeholder="새 직군 입력 (예: 물류팀장 · 약사 · 캐셔)"
                className="flex-1 text-xs rounded-lg border border-line focus:border-[#2563eb] p-2 bg-white focus:outline-none"
              />
              <button
                type="button"
                onClick={addPosition}
                className="px-3 py-2 text-xs font-bold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white rounded-lg flex items-center gap-1 transition cursor-pointer"
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
            <p className="text-xs text-zinc-500 font-semibold">
              직원의 근무지(부서) 목록을 관리합니다. 기본값: 매장, 창고
            </p>
            {/* 2026-08-16 · 사용자 지시 · 근무지 종류 · 매장·창고 나란히 (grid 2열) */}
            <div className="grid grid-cols-2 gap-2">
              {workplaces.map((wp, idx) => (
                <div
                  key={wp}
                  className="flex items-center gap-2 bg-white border border-line hover:border-zinc-300 rounded-lg px-3 py-2 transition"
                >
                  <span className="flex-1 text-xs font-semibold text-zinc-800">{wp}</span>
                  <button
                    type="button"
                    onClick={() => removeWorkplace(idx)}
                    className="text-zinc-300 hover:text-rose-500 transition cursor-pointer p-0.5 rounded"
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
                className="flex-1 text-xs rounded-lg border border-line focus:border-[#2563eb] p-2 bg-white focus:outline-none"
              />
              <button
                type="button"
                onClick={addWorkplace}
                className="px-3 py-2 text-xs font-bold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white rounded-lg flex items-center gap-1 transition cursor-pointer"
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
            <p className="text-xs text-zinc-500 font-semibold">
              근무 유형과 직원 유형별 기본 근무시간을 관리합니다. 비워두면 상위(기본) 시간이 사용됩니다.
            </p>

            {/* Hour type sub-tabs */}
            <div className="flex flex-wrap gap-1">
              {HOUR_TABS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setScheduleHourTab(t.id)}
                  className={`flex-1 min-w-[72px] py-1.5 px-2 text-[11px] font-bold rounded-lg border transition cursor-pointer whitespace-nowrap ${
                    scheduleHourTab === t.id
                      ? "bg-brand-deep border-[#2563eb] text-white"
                      : "bg-white border-line text-zinc-500 hover:bg-zinc-50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)_28px] gap-2 px-3 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wide">
                <span>유형명</span>
                <span>색</span>
                <span>{HOUR_TABS.find(t => t.id === scheduleHourTab)?.label} 시간</span>
                <span></span>
              </div>
              {scheduleTypes.map((st, idx) => (
                <div
                  key={idx}
                  className="flex flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)_28px] gap-2 items-start sm:items-center bg-white border border-line hover:border-zinc-300 rounded-lg px-3 py-2 transition"
                >
                  <div className="flex items-center gap-2 w-full min-w-0">
                    <span
                      className="flex-1 min-w-0 text-xs font-semibold text-zinc-800 truncate px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: st.color ?? "#e2e8f0" }}
                    >
                      {st.type}
                    </span>
                    <div className="shrink-0 sm:hidden">
                      <ColorPicker
                        value={st.color ?? "#e2e8f0"}
                        onChange={(hex) => updateScheduleTypeEntry(idx, "color", hex)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeScheduleType(idx)}
                      className="sm:hidden text-zinc-300 hover:text-rose-500 transition cursor-pointer p-0.5 rounded shrink-0"
                      title="삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="hidden sm:block shrink-0">
                    <ColorPicker
                      value={st.color ?? "#e2e8f0"}
                      onChange={(hex) => updateScheduleTypeEntry(idx, "color", hex)}
                    />
                  </div>
                  <input
                    type="text"
                    value={st[scheduleHourTab]}
                    onChange={(e) => updateScheduleTypeEntry(idx, scheduleHourTab, e.target.value)}
                    placeholder={scheduleHourTab === "hours" ? "예: 10:00-18:00" : "비워두면 기본값"}
                    className="w-full text-xs rounded border border-line focus:border-[#2563eb] p-1.5 font-mono bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeScheduleType(idx)}
                    className="hidden sm:block text-zinc-300 hover:text-rose-500 transition cursor-pointer p-0.5 rounded"
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
                className="flex-1 text-xs rounded-lg border border-line focus:border-[#2563eb] p-2 bg-white focus:outline-none"
              />
              <button
                type="button"
                onClick={addScheduleType}
                className="px-3 py-2 text-xs font-bold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white rounded-lg flex items-center gap-1 transition cursor-pointer"
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
                className="px-4 py-2 text-xs font-bold bg-brand-deep hover:bg-brand-deep disabled:bg-indigo-300 text-white rounded-lg transition cursor-pointer flex items-center gap-1.5 shadow-sm"
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


        {/* ─── Account Tab (비밀번호 변경) ─────────────────────── */}
        {activeTab === "account" && (
          <div className="space-y-4 max-w-md">
            <p className="text-xs text-zinc-500 font-semibold leading-relaxed">
              로그인 중인 계정의 비밀번호를 변경합니다. 변경 후에도 세션은 유지됩니다.
            </p>
            {!sessionEmployeeId ? (
              <Card variant="flat" bg="bg-rose-50" borderColor="border-rose-200" rounded="lg" padding="sm" className="text-xs text-rose-600 font-semibold">
                로그인 세션 정보를 찾을 수 없습니다. 다시 로그인해주세요.
              </Card>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-600 mb-1">현재 비밀번호</label>
                  <input
                    type="password"
                    value={pwCurrent}
                    onChange={(e) => setPwCurrent(e.target.value)}
                    autoComplete="current-password"
                    className="w-full px-3 py-2 text-sm border border-line rounded-lg focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
                    placeholder="현재 비밀번호"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-600 mb-1">새 비밀번호 (4자 이상)</label>
                  <input
                    type="password"
                    value={pwNew}
                    onChange={(e) => setPwNew(e.target.value)}
                    autoComplete="new-password"
                    className="w-full px-3 py-2 text-sm border border-line rounded-lg focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
                    placeholder="새 비밀번호"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-600 mb-1">새 비밀번호 확인</label>
                  <input
                    type="password"
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                    autoComplete="new-password"
                    className="w-full px-3 py-2 text-sm border border-line rounded-lg focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
                    placeholder="새 비밀번호 확인"
                    onKeyDown={(e) => { if (e.key === "Enter" && !pwSubmitting) submitPasswordChange(); }}
                  />
                </div>
                {pwMsg && (
                  <div className={`text-xs font-semibold rounded-lg px-3 py-2 ${
                    pwMsg.type === "ok"
                      ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                      : "bg-rose-50 border border-rose-200 text-rose-600"
                  }`}>
                    {pwMsg.text}
                  </div>
                )}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={submitPasswordChange}
                    disabled={pwSubmitting}
                    className="px-4 py-2 text-xs font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition cursor-pointer"
                  >
                    {pwSubmitting ? "변경 중..." : "비밀번호 변경"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  // #191 · 편집 모드 확인 sub-modal · Modal primitive
  const editConfirmModal = (
    <Modal
      open={showEditConfirm}
      onClose={() => setShowEditConfirm(false)}
      size="sm"
      title="편집 모드를 켜겠습니까?"
      showClose={false}
      closeOnBackdrop={false}
      footer={
        <div className="flex gap-2 w-full">
          <button
            type="button"
            onClick={() => { setShowEditConfirm(false); onClose(); }}
            className="flex-1 px-4 py-2 text-xs font-bold bg-zinc-50 hover:bg-zinc-100 border border-line rounded-lg text-zinc-600 transition cursor-pointer"
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
            className="flex-1 px-4 py-2 text-xs font-bold bg-brand-deep hover:bg-brand-deep text-white rounded-lg transition cursor-pointer"
          >
            켜기
          </button>
        </div>
      }
    >
      <p className="text-xs text-zinc-500 text-center py-2">켜면 전체 스케줄에 수정사항이 반영되고, 이후 편집 모드가 유지됩니다.</p>
    </Modal>
  );

  // #191 · embedded: 인라인 div 유지 · !embedded: Modal primitive
  if (embedded) {
    return (
      <div className="w-full">
        <div className="relative w-full bg-white rounded-2xl border border-line flex flex-col">
          {body}
        </div>
        {editConfirmModal}
      </div>
    );
  }

  return (
    <>
      <Modal
        open={true}
        onClose={onClose}
        title="환경 설정"
        size="md"
        closeOnEsc={false}
        footer={
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] rounded-lg shadow-sm transition cursor-pointer"
          >
            완료 및 닫기
          </button>
        }
      >
        {body}
      </Modal>
      {editConfirmModal}
    </>
  );
};
