// src/components/SettingsModal.tsx
// 2026-08-17 · apiClient 마이그레이션
// #191 · Modal primitive 마이그레이션 (inline wrapper → Modal)
// 2026-08-29 · 탭 서브컴포넌트 분리 (tabs/*.tsx) · shell 유지
import React, { useState, useEffect } from "react";
import { api, ApiError } from "../../lib/apiClient";
// 2026-08-29 · framework audit fix · window.confirm → useConfirm
import { useConfirm } from "../../hooks/useConfirm";
import { ShieldCheck, ChevronRight } from "lucide-react";
import { AppSettings, WageRate, ScheduleTypeEntry, defaultWageForPosition } from "../../hooks/useSettings";
import { COLOR_PRESETS } from "../../constants";
// #191 · Modal primitive
import { Modal } from "../common/Modal";
// 2026-08-29 · 탭 서브컴포넌트
import { PositionsTab } from "./tabs/PositionsTab";
import { RanksTab } from "./tabs/RanksTab";
import { WorkplacesTab } from "./tabs/WorkplacesTab";
import { ScheduleTypesTab } from "./tabs/ScheduleTypesTab";
import { AccountTab } from "./tabs/AccountTab";

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
// 2026-08-29 · #177 Phase 2 · ranks 탭 신설 · 자유 텍스트 · 편집 시 자동 rename
type TabId = "positions" | "ranks" | "workplaces" | "scheduleTypes" | "account";

const TABS: { id: TabId; label: string }[] = [
  { id: "positions",    label: "직군" },
  { id: "ranks",        label: "직급" },
  { id: "workplaces",   label: "근무지 종류" },
  { id: "scheduleTypes", label: "근무 유형" },
];

type ScheduleHourTab = "hours" | "pharmHours" | "logisticsHours" | "partTimeHours";

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings, onUpdate, onApplyShiftHours, onClose,
  employees, editMode, onEnableEditMode,
  sessionEmployeeId, embedded = false,
  onNavigateZoneLabels, onNavigatePermissions,
}) => {
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

  // 2026-08-29 · #177 P2 · 직급(rank) 목록 · 자유 텍스트 · 편집 시 재직 직원 자동 rename
  const [ranks, setRanks] = useState<string[]>([...(settings as any).ranks ?? []]);
  const [newRank, setNewRank] = useState("");
  const [editingRankIdx, setEditingRankIdx] = useState<number | null>(null);
  const [editingRankValue, setEditingRankValue] = useState("");
  const [rankRenaming, setRankRenaming] = useState(false);
  // 2026-08-29 · framework audit · window.confirm → useConfirm
  const confirm = useConfirm();

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
    savePositions([...positions, trimmed]);
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

  // ── ranks (#177 P2 · 자유 텍스트 · 편집 시 재직 직원 자동 rename) ──────
  const saveRanks = (next: string[]) => {
    setRanks(next);
    onUpdate({ ranks: next } as any);
  };
  const addRank = () => {
    const trimmed = newRank.trim();
    if (!trimmed || ranks.includes(trimmed)) return;
    saveRanks([...ranks, trimmed]);
    setNewRank("");
  };
  const removeRank = async (idx: number) => {
    const removing = ranks[idx];
    const using = employees.filter(e => ((e as any).rank ?? "") === removing);
    if (using.length > 0) {
      // 2026-08-29 · framework audit · useConfirm 교체
      const ok = await confirm({
        message: `직급 "${removing}" 사용중 · 재직 직원 ${using.length}명\n삭제 시 해당 직원의 직급이 비워집니다. 진행?`,
        danger: true,
      });
      if (!ok) return;
      setRankRenaming(true);
      Promise.all(using.map(emp => api.patch(`/api/employees/${emp.id}`, { rank: null }).catch(() => null)))
        .finally(() => setRankRenaming(false));
    }
    saveRanks(ranks.filter((_, i) => i !== idx));
  };
  const startEditRank = (idx: number) => {
    setEditingRankIdx(idx);
    setEditingRankValue(ranks[idx]);
  };
  const cancelEditRank = () => {
    setEditingRankIdx(null);
    setEditingRankValue("");
  };
  const commitEditRank = async () => {
    if (editingRankIdx === null) return;
    const original = ranks[editingRankIdx];
    const trimmed = editingRankValue.trim();
    if (!trimmed || trimmed === original) { cancelEditRank(); return; }
    if (ranks.includes(trimmed)) { cancelEditRank(); return; }
    const using = employees.filter(e => ((e as any).rank ?? "") === original);
    const next = ranks.map((r, i) => i === editingRankIdx ? trimmed : r);
    if (using.length > 0) {
      // 2026-08-29 · #185 Phase B · framework audit · useConfirm 교체
      const ok = await confirm({
        message:
          `직급 "${original}" → "${trimmed}"\n` +
          `재직 직원 ${using.length}명 · 자동으로 함께 변경됩니다.\n\n` +
          `⚠ JWT 세션 rank 는 다음 로그인 시 반영\n(현재 로그인 중인 해당 직원 · 로그아웃·재로그인 필요)\n\n` +
          `진행?`,
      });
      if (!ok) { cancelEditRank(); return; }
      setRankRenaming(true);
      try {
        await Promise.all(using.map(emp => api.patch(`/api/employees/${emp.id}`, { rank: trimmed })));
      } catch (e: any) {
        // rename 실패해도 · settings 변경은 진행 (다음 로그인 시 서버 상태와 재동기화)
        console.error("[rank rename] 실패:", e?.message ?? e);
      } finally {
        setRankRenaming(false);
      }
    }
    saveRanks(next);
    cancelEditRank();
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
    saveScheduleTypes(scheduleTypes.map((e, i) => i === idx ? { ...e, [field]: value } : e));
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
    saveWageRates({ ...wageRates, [position]: { ...prev, [field]: value } });
  };

  const updateEmployeeOverride = (empId: number, field: keyof WageRate, value: number) => {
    const prev = employeeWageOverrides[empId] ?? { weekday: 0, weekend: 0 };
    saveEmployeeOverrides({ ...employeeWageOverrides, [empId]: { ...prev, [field]: value } });
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

  // ── scheduleTypes apply handler (passed to ScheduleTypesTab) ─────────────
  const handleApplyClick = () => {
    if (editMode === false) {
      setShowEditConfirm(true);
    } else {
      setApplying(true);
      onApplyShiftHours().finally(() => setApplying(false));
    }
  };

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
        {activeTab === "positions" && (
          <PositionsTab
            positions={positions}
            newPosition={newPosition}
            setNewPosition={setNewPosition}
            addPosition={addPosition}
            removePosition={removePosition}
            dragIndex={dragIndex}
            dragOverIndex={dragOverIndex}
            handlePositionDragStart={handlePositionDragStart}
            handlePositionDragOver={handlePositionDragOver}
            handlePositionDrop={handlePositionDrop}
            handlePositionDragEnd={handlePositionDragEnd}
          />
        )}

        {activeTab === "ranks" && (
          <RanksTab
            ranks={ranks}
            newRank={newRank}
            setNewRank={setNewRank}
            addRank={addRank}
            removeRank={removeRank}
            editingRankIdx={editingRankIdx}
            editingRankValue={editingRankValue}
            setEditingRankValue={setEditingRankValue}
            rankRenaming={rankRenaming}
            startEditRank={startEditRank}
            cancelEditRank={cancelEditRank}
            commitEditRank={commitEditRank}
          />
        )}

        {activeTab === "workplaces" && (
          <WorkplacesTab
            workplaces={workplaces}
            newWorkplace={newWorkplace}
            setNewWorkplace={setNewWorkplace}
            addWorkplace={addWorkplace}
            removeWorkplace={removeWorkplace}
          />
        )}

        {activeTab === "scheduleTypes" && (
          <ScheduleTypesTab
            scheduleTypes={scheduleTypes}
            newScheduleType={newScheduleType}
            setNewScheduleType={setNewScheduleType}
            addScheduleType={addScheduleType}
            removeScheduleType={removeScheduleType}
            updateScheduleTypeEntry={updateScheduleTypeEntry}
            scheduleHourTab={scheduleHourTab}
            setScheduleHourTab={setScheduleHourTab}
            applying={applying}
            editMode={editMode}
            onApplyClick={handleApplyClick}
          />
        )}

        {activeTab === "account" && (
          <AccountTab
            sessionEmployeeId={sessionEmployeeId}
            pwCurrent={pwCurrent}
            pwNew={pwNew}
            pwConfirm={pwConfirm}
            pwSubmitting={pwSubmitting}
            pwMsg={pwMsg}
            setPwCurrent={setPwCurrent}
            setPwNew={setPwNew}
            setPwConfirm={setPwConfirm}
            submitPasswordChange={submitPasswordChange}
          />
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
