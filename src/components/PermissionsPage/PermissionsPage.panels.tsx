// 2026-08-22 · Framework Phase 4 · PermissionsPage.tsx large-file 분리
// 4개 UI 섹션 · props-driven pure display
//   · PageSettingsTab · 페이지별 최소 권한 설정 (2차 · 2026-08-22)
//   · EmployeeLevelTab · 직원별 개별 레벨 (2차 · 2026-08-22)
//   · PositionsTab · 직군 설정 (드래그 재정렬 · 편집 · 삭제 · 추가)
//   · ConstructionTab · 공사중 모드 토글

import React from "react";
import { Construction, IdCard, Pencil, Trash2, GripVertical, Plus, Shield, Save, Check, Users } from "lucide-react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { AccentBar } from "../common/AccentBar";
import { Card } from "../common/Card";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { LevelSelect } from "./LevelSelect";
import { PositionsField } from "./PositionsField";
import { GROUP_COLOR_CLS } from "./constants";
import type { PagePermissions } from "../../types";

// ═══════════════════════════════════════════════════════════════════════════
// 1) PositionsTab · 직군 설정
// ═══════════════════════════════════════════════════════════════════════════

interface PositionsTabProps {
  presetPositions: string[];
  posDragIdx: number | null;
  posDragOverIdx: number | null;
  setPosDragIdx: (v: number | null) => void;
  setPosDragOverIdx: (v: number | null) => void;
  editingPosIdx: number | null;
  editingPosValue: string;
  setEditingPosIdx: (v: number | null) => void;
  setEditingPosValue: (v: string) => void;
  commitEditPosition: () => void;
  removePositionAt: (idx: number) => void;
  reorderPosition: (from: number, to: number) => void;
  newPositionInput: string;
  setNewPositionInput: (v: string) => void;
  addNewPosition: () => void;
}

export const PositionsTab: React.FC<PositionsTabProps> = ({
  presetPositions, posDragIdx, posDragOverIdx, setPosDragIdx, setPosDragOverIdx,
  editingPosIdx, editingPosValue, setEditingPosIdx, setEditingPosValue,
  commitEditPosition, removePositionAt, reorderPosition,
  newPositionInput, setNewPositionInput, addNewPosition,
}) => {
  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex items-center gap-2">
        <IdCard size={14} className="text-zinc-500" />
        <h2 className="text-[13px] font-bold text-zinc-700">직군 설정</h2>
      </div>
      <p className="text-[12px] text-zinc-500 font-semibold">
        직원 등록/수정 화면의 직군 드롭박스에 표시될 목록입니다. 이름 클릭 또는 <Pencil size={11} className="inline align-middle text-violet-500 mx-0.5" /> 아이콘으로 편집 · 드래그로 순서 변경 · <Trash2 size={11} className="inline align-middle text-rose-500 mx-0.5" /> 로 삭제 (사용중이면 재매핑 안내).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {presetPositions.map((pos, idx) => (
          <div
            key={pos}
            draggable
            onDragStart={() => setPosDragIdx(idx)}
            onDragOver={(e) => { e.preventDefault(); setPosDragOverIdx(idx); }}
            onDrop={() => {
              if (posDragIdx !== null) reorderPosition(posDragIdx, idx);
              setPosDragIdx(null); setPosDragOverIdx(null);
            }}
            onDragEnd={() => { setPosDragIdx(null); setPosDragOverIdx(null); }}
            className={`flex items-center gap-2 bg-white border rounded-lg px-3 py-2 transition ${
              posDragOverIdx === idx && posDragIdx !== idx
                ? "border-violet-400 bg-violet-50"
                : "border-line hover:border-zinc-300"
            } ${posDragIdx === idx ? "opacity-40" : ""}`}
          >
            <div className="text-zinc-300 hover:text-zinc-500 cursor-grab active:cursor-grabbing shrink-0">
              <GripVertical size={14} />
            </div>
            {editingPosIdx === idx ? (
              <input
                autoFocus
                value={editingPosValue}
                onChange={(e) => setEditingPosValue(e.target.value)}
                onBlur={commitEditPosition}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitEditPosition(); }
                  else if (e.key === "Escape") { setEditingPosIdx(null); }
                }}
                className="flex-1 text-[13px] font-semibold text-zinc-800 bg-white border border-violet-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-tint min-w-0"
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { setEditingPosIdx(idx); setEditingPosValue(pos); }}
                  className="flex-1 text-[13px] font-semibold text-zinc-800 truncate text-left hover:text-violet-700 cursor-text"
                  title="클릭하여 이름 수정"
                >
                  {pos}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingPosIdx(idx); setEditingPosValue(pos); }}
                  className="text-zinc-300 hover:text-violet-500 transition cursor-pointer p-0.5 rounded"
                  title="이름 편집"
                >
                  <Pencil size={13} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => removePositionAt(idx)}
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
          value={newPositionInput}
          onChange={(e) => setNewPositionInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNewPosition(); } }}
          placeholder="새 직군 입력 (Enter)"
          className="flex-1 text-[13px] rounded-lg border border-line focus:border-brand-deep p-2 bg-white focus:outline-none"
        />
        <button
          type="button"
          onClick={addNewPosition}
          className="px-3 py-2 text-[12px] font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-lg flex items-center gap-1 transition cursor-pointer"
        >
          <Plus size={13} />
          추가
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 2) ConstructionTab · 공사중 모드 토글
// ═══════════════════════════════════════════════════════════════════════════

interface ConstructionTabProps {
  underConstruction: boolean;
  onChange: (v: boolean) => void;
}

export const ConstructionTab: React.FC<ConstructionTabProps> = ({ underConstruction, onChange }) => {
  return (
    <div className="w-full min-w-0 space-y-4 max-w-xl">
      <div className="flex items-center gap-2">
        <Construction size={14} className="text-amber-600" />
        <h2 className="text-[13px] font-bold text-zinc-700">공사중 (Under Construction)</h2>
      </div>
      <label className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 hover:border-amber-400 cursor-pointer">
        <input
          type="checkbox"
          checked={underConstruction === true}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 accent-amber-500"
        />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-zinc-800 leading-tight">공사중 모드 활성화</div>
          <div className="text-[11px] font-semibold text-zinc-500 leading-tight mt-0.5">
            비로그인 랜딩페이지 · 재고 검색 숨김 · "곧 오픈 예정입니다" 표시
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${underConstruction ? "bg-amber-500 text-white" : "bg-zinc-200 text-zinc-500"}`}>
          {underConstruction ? "ON" : "OFF"}
        </span>
      </label>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 3) PageSettingsTab · 페이지별 최소 권한 설정 (2차 · 2026-08-22)
// ═══════════════════════════════════════════════════════════════════════════

interface GroupedPage {
  id: string;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  rows: Array<{ storageKey: string; pageKey: string; label: string; desc?: string }>;
}

interface PermRow {
  read: number;
  write: number;
  hidden?: boolean;
  readPositions?: string[];
  writePositions?: string[];
}

interface PageSettingsTabProps {
  groupedPages: GroupedPage[];
  perms: PagePermissions;
  getPerm: (storageKey: string, pageKey: string) => PermRow;
  saving: string | null;
  savedKeys: Set<string>;
  saveToast: string | null;
  handleChange: (storageKey: string, pageKey: string, field: "read" | "write", value: number) => void;
  toggleHiddenForPerm: (storageKey: string, pageKey: string) => void;
  togglePositionForPerm: (storageKey: string, pageKey: string, field: "read" | "write", position: string) => void;
  openPositionPopover: { page: string; field: "read" | "write" } | null;
  setOpenPositionPopover: (v: { page: string; field: "read" | "write" } | null) => void;
  collapsedGroups: Set<string>;
  toggleGroup: (groupId: string) => void;
  presetPositions: string[];
  onSaveAll: () => void;
}

export const PageSettingsTab: React.FC<PageSettingsTabProps> = ({
  groupedPages, getPerm, saving, savedKeys, saveToast,
  handleChange, toggleHiddenForPerm, togglePositionForPerm,
  openPositionPopover, setOpenPositionPopover,
  collapsedGroups, toggleGroup, presetPositions, onSaveAll,
}) => {
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <AccentBar />
          <Shield size={16} className="text-brand-deep" />
          <h2 className="text-[17px] font-bold text-ink tracking-tight">페이지별 설정</h2>
        </div>
        <div className="flex items-center gap-2">
          {saveToast && (
            <StatusPill tone={saveToast.includes("실패") ? "rose" : "emerald"} size="sm" dot>
              {saveToast}
            </StatusPill>
          )}
          <button
            type="button"
            onClick={onSaveAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] shadow-sm transition cursor-pointer"
            title="현재 페이지별 최소 권한을 서버에 저장"
          >
            <Save size={14} /> 저장
          </button>
        </div>
      </div>
      <Card padding="none" clip>
        <div className="grid grid-cols-[44px_minmax(0,1fr)_110px_110px] sm:grid-cols-[64px_minmax(0,1fr)_180px_180px] px-5 py-2.5 bg-zinc-50 border-b border-zinc-100 text-[16px] font-bold text-zinc-500 tracking-tight">
          <span className="text-center">보기</span>
          <span>페이지</span>
          <span className="text-right pr-3">읽기 최소</span>
          <span className="text-right pr-3">쓰기 최소</span>
        </div>

        {groupedPages.map((g, gi) => {
          const GroupIcon = g.icon;
          const isLastGroup = gi === groupedPages.length - 1;
          const isSingle = g.rows.length === 1;

          if (isSingle) {
            const row = g.rows[0];
            const perm = getPerm(row.storageKey, row.pageKey);
            return (
              <div
                key={g.id}
                title={row.desc}
                className={`grid grid-cols-[44px_minmax(0,1fr)_110px_110px] sm:grid-cols-[64px_minmax(0,1fr)_180px_180px] px-5 py-2.5 items-center ${isLastGroup ? "" : "border-b border-zinc-100"}`}
              >
                <div className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={!perm.hidden}
                    onChange={() => toggleHiddenForPerm(row.storageKey, row.pageKey)}
                    title={perm.hidden ? "숨김 (사이드바 제외)" : "노출"}
                    className="w-4 h-4 accent-[#1E5C8E] cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  {GroupIcon && <GroupIcon size={16} className={GROUP_COLOR_CLS[g.color] ?? "text-zinc-500"} />}
                  <span className={`text-[17px] font-bold truncate ${perm.hidden ? "text-zinc-400 line-through" : "text-zinc-700"}`}>{g.label}</span>
                </div>
                <div className="flex flex-col items-end gap-1 pr-3">
                  <LevelSelect value={perm.read} onChange={v => handleChange(row.storageKey, row.pageKey, "read", v)} saving={saving === `${row.storageKey}.read`} saved={savedKeys.has(`${row.storageKey}.read`)} />
                  <PositionsField page={row.storageKey} field="read" selected={perm.readPositions ?? []} allPositions={presetPositions}
                    isOpen={openPositionPopover?.page === row.storageKey && openPositionPopover?.field === "read"}
                    onToggleOpen={(open) => setOpenPositionPopover(open ? { page: row.storageKey, field: "read" } : null)}
                    onToggle={(p) => togglePositionForPerm(row.storageKey, row.pageKey, "read", p)}
                  />
                </div>
                <div className="flex flex-col items-end gap-1 pr-3">
                  <LevelSelect value={perm.write} onChange={v => handleChange(row.storageKey, row.pageKey, "write", v)} saving={saving === `${row.storageKey}.write`} saved={savedKeys.has(`${row.storageKey}.write`)} />
                  <PositionsField page={row.storageKey} field="write" selected={perm.writePositions ?? []} allPositions={presetPositions}
                    isOpen={openPositionPopover?.page === row.storageKey && openPositionPopover?.field === "write"}
                    onToggleOpen={(open) => setOpenPositionPopover(open ? { page: row.storageKey, field: "write" } : null)}
                    onToggle={(p) => togglePositionForPerm(row.storageKey, row.pageKey, "write", p)}
                  />
                </div>
              </div>
            );
          }

          const collapsed = collapsedGroups.has(g.id);
          return (
            <div key={g.id} className={isLastGroup ? "" : "border-b border-zinc-100"}>
              <button
                type="button"
                onClick={() => toggleGroup(g.id)}
                className="w-full grid grid-cols-[44px_minmax(0,1fr)_110px_110px] sm:grid-cols-[64px_minmax(0,1fr)_180px_180px] px-4 py-2.5 items-center bg-zinc-50/60 hover:bg-zinc-100/70 transition-colors text-left"
              >
                <div />
                <div className="flex items-center gap-2">
                  {collapsed
                    ? <CaretRight size={14} className="text-zinc-500" weight="bold" />
                    : <CaretDown  size={14} className="text-zinc-500" weight="bold" />}
                  {GroupIcon && <GroupIcon size={16} className={GROUP_COLOR_CLS[g.color] ?? "text-zinc-500"} />}
                  <span className="text-[17px] font-bold text-zinc-700">{g.label}</span>
                  <span className="text-[14px] font-semibold text-zinc-400">({g.rows.length})</span>
                </div>
                <div />
                <div />
              </button>

              {!collapsed && g.rows.map((row) => {
                const perm = getPerm(row.storageKey, row.pageKey);
                return (
                  <div
                    key={row.storageKey}
                    title={row.desc}
                    className={`grid grid-cols-[44px_minmax(0,1fr)_110px_110px] sm:grid-cols-[64px_minmax(0,1fr)_180px_180px] px-5 py-2 items-center border-t border-zinc-100/70`}
                  >
                    <div className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={!perm.hidden}
                        onChange={() => toggleHiddenForPerm(row.storageKey, row.pageKey)}
                        title={perm.hidden ? "숨김 (사이드바 제외)" : "노출"}
                        className="w-4 h-4 accent-[#1E5C8E] cursor-pointer"
                      />
                    </div>
                    <div className={`text-[16px] font-semibold truncate pl-6 ${perm.hidden ? "text-zinc-400 line-through" : "text-zinc-700"}`}>
                      <span className="text-zinc-300 mr-1.5">└</span>
                      {row.label}
                    </div>
                    <div className="flex flex-col items-end gap-1 pr-3">
                      <LevelSelect value={perm.read} onChange={v => handleChange(row.storageKey, row.pageKey, "read", v)} saving={saving === `${row.storageKey}.read`} saved={savedKeys.has(`${row.storageKey}.read`)} />
                      <PositionsField page={row.storageKey} field="read" selected={perm.readPositions ?? []} allPositions={presetPositions}
                        isOpen={openPositionPopover?.page === row.storageKey && openPositionPopover?.field === "read"}
                        onToggleOpen={(open) => setOpenPositionPopover(open ? { page: row.storageKey, field: "read" } : null)}
                        onToggle={(p) => togglePositionForPerm(row.storageKey, row.pageKey, "read", p)}
                      />
                    </div>
                    <div className="flex flex-col items-end gap-1 pr-3">
                      <LevelSelect value={perm.write} onChange={v => handleChange(row.storageKey, row.pageKey, "write", v)} saving={saving === `${row.storageKey}.write`} saved={savedKeys.has(`${row.storageKey}.write`)} />
                      <PositionsField page={row.storageKey} field="write" selected={perm.writePositions ?? []} allPositions={presetPositions}
                        isOpen={openPositionPopover?.page === row.storageKey && openPositionPopover?.field === "write"}
                        onToggleOpen={(open) => setOpenPositionPopover(open ? { page: row.storageKey, field: "write" } : null)}
                        onToggle={(p) => togglePositionForPerm(row.storageKey, row.pageKey, "write", p)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </Card>

      <p className="text-[11px] text-zinc-400 mt-2 mb-6 pl-1">
        레벨 9(최고관리자)는 항상 모든 페이지에 접근할 수 있습니다. 각 페이지 설명은 마우스를 올리면 표시됩니다.
      </p>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 4) EmployeeLevelTab · 직원별 개별 레벨 (2차 · 2026-08-22)
// ═══════════════════════════════════════════════════════════════════════════

interface EmployeeItem {
  id: number;
  name: string;
  position: string | null;
  level?: number;
}

interface EmployeeLevelTabProps {
  employees: EmployeeItem[];
  filteredEmployees: EmployeeItem[];
  empSearch: string;
  setEmpSearch: (v: string) => void;
  empSavingId: number | null;
  empSavedIds: Set<number>;
  handleEmployeeLevelChange: (empId: number, level: number) => void;
}

export const EmployeeLevelTab: React.FC<EmployeeLevelTabProps> = ({
  employees, filteredEmployees, empSearch, setEmpSearch,
  empSavingId, empSavedIds, handleEmployeeLevelChange,
}) => {
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Users size={13} className="text-zinc-500" />
          <h2 className="text-[17px] font-bold text-zinc-700">직원별 레벨</h2>
          <span className="text-[11px] text-zinc-400 font-medium">
            ({filteredEmployees.length}명 · 약사 우선)
          </span>
        </div>
        <input
          type="text"
          value={empSearch}
          onChange={e => setEmpSearch(e.target.value)}
          placeholder="이름·직군 검색"
          className="text-xs px-3 py-1.5 rounded-lg border border-line bg-white text-zinc-700 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep w-44"
        />
      </div>
      <Card padding="none" clip>
        <div className="grid grid-cols-[1fr_90px_130px_36px] px-5 py-2 bg-zinc-50 border-b border-zinc-100 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
          <span>성명</span>
          <span>직군</span>
          <span className="text-center">레벨</span>
          <span className="text-center">상태</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {filteredEmployees.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-zinc-400">
              {employees.length === 0 ? "직원 목록을 불러오는 중..." : "일치하는 직원이 없습니다."}
            </div>
          ) : filteredEmployees.map((emp, i) => {
            const isPharma = emp.position === "약사";
            return (
              <div
                key={emp.id}
                className={`grid grid-cols-[1fr_90px_130px_36px] px-5 py-1.5 items-center ${
                  i < filteredEmployees.length - 1 ? "border-b border-zinc-100" : ""
                } ${isPharma ? "bg-violet-50/40" : ""}`}
              >
                <div className="text-sm font-semibold text-zinc-800 truncate">{emp.name}</div>
                <div className="flex items-center">
                  <StatusPill tone={isPharma ? "violet" : "zinc"} size="xs">
                    {emp.position ?? "-"}
                  </StatusPill>
                </div>
                <div className="flex justify-center">
                  <LevelSelect
                    value={emp.level ?? 1}
                    onChange={v => handleEmployeeLevelChange(emp.id, v)}
                    saving={empSavingId === emp.id}
                    saved={empSavedIds.has(emp.id)}
                  />
                </div>
                <div className="flex justify-center">
                  {empSavingId === emp.id ? (
                    <Spinner size={12} tone="brand" />
                  ) : empSavedIds.has(emp.id) ? (
                    <Check size={12} className="text-emerald-500" />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <p className="text-[11px] text-zinc-400 mt-2 pl-1">
        변경 즉시 서버에 저장됩니다. 실패 시 이전 값으로 되돌립니다.
      </p>
    </>
  );
};
