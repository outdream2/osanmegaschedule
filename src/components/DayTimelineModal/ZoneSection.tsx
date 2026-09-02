// src/components/DayTimelineModal/ZoneSection.tsx
// 2026-08-21 · Framework Phase 4 · DayTimelineModal 대형 파일 분리 · ZoneSection 이관
import React, { useState, useCallback, useMemo } from "react";
import { Pill } from "lucide-react";
import {
  DEFAULT_TONE, ZONE_ROWS,
  type TypeTone, type ZoneRow, type WorkerEntry, type SlotMap, type ZoneMap, type BreakInterval, type BreakCount,
} from "./types";
import { HOUR_SLOTS, isOtherEmp, isStaffEmp, createGhost, moveGhost, removeGhost } from "./utils";
import { WorkerChips } from "./WorkerChips";
import { StatusPill } from "../common/StatusPill";
import { useToast, toastClass } from "../../hooks/useToast";
// 2026-08-22 · Framework Phase 4 · CellPickerPopup 별도 파일 이관
import { CellPickerPopup } from "./CellPickerPopup";

// ─── Sub-component: ZoneSection ──────────────────────────────────────────────
interface ZoneSectionProps {
  zoneMap: ZoneMap;
  workers: WorkerEntry[];
  allWorkers: WorkerEntry[];
  onDropToZone: (zone: ZoneRow, slot: string, empId: number) => void;
  onRemoveFromZone: (zone: ZoneRow, slot: string, empId: number) => void;
  typeTones: Record<string, TypeTone>;
  workRanges: Record<number, { start: number; end: number } | null>;
  currentDow: number; // 0=일 ~ 6=토 (highlights current day's button)
  onSaveToDow: (dow: number) => Promise<void>;
  // lunch
  lunchSlotMap: SlotMap;
  shiftedLunchSlots: string[];
  lunchOffset: number;
  onShiftLunchOffset: (delta: number) => void;
  onDropToLunch: (slot: string, empId: number, source?: { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string }) => void;
  onRemoveFromLunch: (slot: string, empId: number) => void;
  onReorderLunch?: (slot: string, empId: number, toIndex: number) => void;
  // rest
  restSlotMap: SlotMap;
  shiftedRestSlots: string[];
  restOffset: number;
  onShiftRestOffset: (delta: number) => void;
  onDropToRest: (slot: string, empId: number, source?: { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string }) => void;
  onRemoveFromRest: (slot: string, empId: number) => void;
  onReorderRest?: (slot: string, empId: number, toIndex: number) => void;
  // interval
  lunchInterval: BreakInterval;
  restInterval: BreakInterval;
  onSetLunchInterval: (v: BreakInterval) => void;
  onSetRestInterval: (v: BreakInterval) => void;
  // count (몇 명이 교대로 식사/휴게할지 — 슬롯 행 수)
  lunchCount: BreakCount;
  restCount: BreakCount;
  onSetLunchCount: (v: BreakCount) => void;
  onSetRestCount: (v: BreakCount) => void;
  // 탭 필터 (약사/사원/기타/전체) 반영
  tabWorkerIds: Set<number>;
  isTabAll: boolean;
  // 사용자가 드래그 시작 등 상호작용을 하면 부모에게 알려 임의배치 배너 등을 숨김
  onUserInteract?: () => void;
  // 현재 탭 인원 기준 최적 임의배치 실행
  onAutoSuggest?: () => void;
  // 확정 버튼 (헤더 버튼용)
  isConfirmed?: boolean;
  confirming?: boolean;
  onConfirm?: () => void;
}

// Zone section uses HOUR_SLOTS as column keys — 10:00 ~ 19:00 시작박스 (10칸)
// 20:00은 마지막 셀의 종료시간이므로 헤더 라벨로만 표시 (시작박스 없음)
const ZONE_SLOTS = HOUR_SLOTS.slice(0, -3);

/** Returns the shifted slot string for a given hour and minute offset within that hour (0 or 30). */
function subSlotKey(hourSlot: string, minuteOffset: 0 | 30): string {
  const h = parseInt(hourSlot.split(":")[0], 10);
  return `${String(h).padStart(2, "0")}:${minuteOffset === 0 ? "00" : "30"}`;
}

const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

type CellPicker =
  | { type: "zone"; zone: ZoneRow; slot: string }
  | { type: "lunch"; slot: string }
  | { type: "rest"; slot: string };

const ZoneSection: React.FC<ZoneSectionProps> = React.memo(({
  zoneMap, workers, allWorkers, onDropToZone, onRemoveFromZone, typeTones, workRanges,
  currentDow, onSaveToDow,
  lunchSlotMap, shiftedLunchSlots, lunchOffset, onShiftLunchOffset, onDropToLunch, onRemoveFromLunch, onReorderLunch,
  restSlotMap,  shiftedRestSlots,  restOffset,  onShiftRestOffset,  onDropToRest,  onRemoveFromRest,  onReorderRest,
  lunchInterval, restInterval, onSetLunchInterval, onSetRestInterval,
  lunchCount, restCount, onSetLunchCount, onSetRestCount,
  tabWorkerIds, isTabAll, onUserInteract, onAutoSuggest,
  isConfirmed, confirming, onConfirm,
}) => {
  // 2026-08-21 · Framework Phase 3 · alert → useToast
  const { toast, showError } = useToast();
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [touchDraggingId, setTouchDraggingId] = useState<number | null>(null);
  const [selectedDows, setSelectedDows] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [cellPicker, setCellPicker] = useState<CellPicker | null>(null);
  // 드래그 출발지 — zone/lunch/rest 어디서 왔는지 추적 (자유로운 상호 이동 지원)
  const [draggingSource, setDraggingSource] = useState<{ type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string } | null>(null);
  // 점심/휴게 셀 내부 chip 재정렬 드래그 (같은 슬롯 내부에서만 순서 변경)
  const [breakChipDrag, setBreakChipDrag] = useState<{ kind: "lunch" | "rest"; slot: string; fromIdx: number } | null>(null);
  // 하위 호환: 기존 코드 참조 잠깐 유지
  const draggingZoneSource = draggingSource && draggingSource.type === "zone"
    ? { zone: draggingSource.zone!, slot: draggingSource.slot } : null;
  const setDraggingZoneSource = (v: { zone: ZoneRow; slot: string } | null) => {
    setDraggingSource(v ? { type: "zone", zone: v.zone, slot: v.slot } : null);
  };

  // source 힌트: 드래그 출발지를 알려주면 그 위치의 충돌을 무시 (자유로운 이동을 위함)
  const tryDropToZone = useCallback((zone: ZoneRow, slot: string, empId: number,
    source?: { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string }
  ) => {
    const slotHour = parseInt(slot.split(":")[0], 10);
    const slotStart = slotHour * 60;
    const slotEnd = slotStart + 60;
    const range = workRanges[empId];
    if (range && (slotEnd <= range.start || slotStart >= range.end)) {
      showError("출근 시간이 아니어서 배정할 수 없습니다.");
      return;
    }
    const otherZone: ZoneRow = zone === "카운터" ? "매장" : "카운터";
    // 다른 zone 충돌 검사 — 출발지가 그 zone이면 이동으로 간주 (허용)
    if (((zoneMap[otherZone] ?? {})[slot] ?? []).includes(empId)) {
      const isMovingFromOtherZone = source?.type === "zone" && source.zone === otherZone && source.slot === slot;
      if (!isMovingFromOtherZone) {
        showError(`중복배치입니다. 다시 배정하세요.\n(같은 시간대에 이미 ${otherZone}에 배정되어 있습니다)`);
        return;
      }
    }
    const lunchConflict = Object.entries(lunchSlotMap).some(([ls, ids]) => {
      if (!(ids as number[]).includes(empId)) return false;
      if (source?.type === "lunch" && source.slot === ls) return false;
      const [lh, lm] = ls.split(":").map(Number);
      const ls0 = lh * 60 + lm;
      return ls0 < slotEnd && ls0 + 30 > slotStart;
    });
    if (lunchConflict) { showError("중복배치입니다. 다시 배정하세요.\n(같은 시간대에 이미 점심시간이 배정되어 있습니다)"); return; }
    const restConflict = Object.entries(restSlotMap).some(([rs, ids]) => {
      if (!(ids as number[]).includes(empId)) return false;
      if (source?.type === "rest" && source.slot === rs) return false;
      const [rh, rm] = rs.split(":").map(Number);
      const rs0 = rh * 60 + rm;
      return rs0 < slotEnd && rs0 + 30 > slotStart;
    });
    if (restConflict) { showError("중복배치입니다. 다시 배정하세요.\n(같은 시간대에 이미 휴게시간이 배정되어 있습니다)"); return; }
    // dropToZone은 source 파라미터를 받아 atomic 이동 처리 (any 캐스팅으로 확장 시그니처 전달)
    (onDropToZone as any)(zone, slot, empId, source);
  }, [workRanges, zoneMap, lunchSlotMap, restSlotMap, onDropToZone, showError]);

  const assignedIds = useMemo(() => {
    const ids = new Set<number>();
    ZONE_ROWS.forEach(z => (Object.values(zoneMap[z] ?? {}) as number[][]).forEach(arr => arr.forEach(id => ids.add(id))));
    (Object.values(lunchSlotMap) as number[][]).forEach(arr => arr.forEach(id => ids.add(id)));
    (Object.values(restSlotMap) as number[][]).forEach(arr => arr.forEach(id => ids.add(id)));
    return ids;
  }, [zoneMap, lunchSlotMap, restSlotMap]);
  const lunchAssignedIds = useMemo(() => {
    const ids = new Set<number>();
    for (const arr of Object.values(lunchSlotMap ?? {})) {
      if (!Array.isArray(arr)) continue;
      for (const id of arr) {
        if (typeof id === "number" && Number.isFinite(id)) ids.add(id);
      }
    }
    return ids;
  }, [lunchSlotMap]);

  const handleDragStart = useCallback((e: React.DragEvent, id: number) => {
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
    // 하단 칩 pool에서 시작하는 드래그는 source가 없음 — 잔여 source 초기화로 중복검사 우회 방지
    setDraggingSource(null);
    onUserInteract?.();
  }, [onUserInteract]);
  const handleDragEnd = useCallback(() => { setDraggingId(null); setDraggingSource(null); }, []);

  const handleTouchDragStart = useCallback((empId: number) => {
    setTouchDraggingId(empId);
    setDraggingSource(null);
    onUserInteract?.();
  }, [onUserInteract]);

  const handleTouchDragEnd = useCallback((x: number, y: number) => {
    if (touchDraggingId === null) return;
    const empId = touchDraggingId;
    const src = draggingSource;
    setTouchDraggingId(null);
    setDraggingSource(null);
    let el = document.elementFromPoint(x, y) as HTMLElement | null;
    while (el) {
      if (el.dataset.dropZone && el.dataset.dropSlot) {
        const dZone = el.dataset.dropZone as ZoneRow;
        const dSlot = el.dataset.dropSlot;
        if (src?.type === "zone" && src.zone === dZone && src.slot === dSlot) return; // 같은 셀
        tryDropToZone(dZone, dSlot, empId, src ?? undefined);
        return;
      }
      if (el.dataset.dropLunch) {
        if (src?.type === "lunch" && src.slot === el.dataset.dropLunch) return;
        onDropToLunch(el.dataset.dropLunch, empId, src ?? undefined);
        return;
      }
      if (el.dataset.dropRest) {
        if (src?.type === "rest" && src.slot === el.dataset.dropRest) return;
        onDropToRest(el.dataset.dropRest, empId, src ?? undefined);
        return;
      }
      el = el.parentElement;
    }
  }, [touchDraggingId, draggingSource, tryDropToZone, onDropToLunch, onDropToRest]);

  // Render a half-hour sub-cell for break rows (점심/휴게)
  // count: 인원 수 → 슬롯 내에 행(row) 수를 나타냄 (각 행에 1명씩 배정)
  const renderBreakSubCell = (
    slotKey: string,
    isActive: boolean,
    slotMap: SlotMap,
    theme: { border: string; bg: string; hover: string; label: string },
    onDrop: (slot: string, id: number, source?: { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string }) => void,
    onRemove: (slot: string, id: number) => void,
    dropKind: "lunch" | "rest",
    count: BreakCount,
    onReorder?: (slot: string, empId: number, toIndex: number) => void,
  ) => {
    // 비활성 슬롯: 클릭 시 순차 배정 팝업 (드래그드롭 제거됨)
    if (!isActive) {
      return (
        <div
          className={`flex-1 flex items-center justify-center bg-zinc-50/40 border-r last:border-r-0 min-h-[32px] cursor-pointer transition ${theme.border} ${theme.hover} active:bg-zinc-100/60`}
          onClick={() => setCellPicker({ type: dropKind, slot: slotKey })}
          title="탭하여 인원 배정 (순차)"
        >
          <span className="text-[13px] font-bold text-zinc-300 select-none">+</span>
        </div>
      );
    }
    const assigned = slotMap[slotKey] ?? [];
    const minLabel = slotKey.slice(3); // "00" or "30"
    // 탭 필터 통과 인원만 실제 표시 (기존과 동일 규칙)
    let visibleChips = assigned
      .map((empId, origIdx) => {
        const w = allWorkers.find(ww => ww.emp.id === empId);
        if (!w) return null;
        const inTab = isTabAll || tabWorkerIds.has(w.emp.id);
        if (!inTab) return null;
        const c = typeTones[w.schedule.type] ?? DEFAULT_TONE;
        return { empId, w, c, origIdx };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    // 2026-08-11 · 점심 배정 · 약사가 맨 위에 오게 (안정 정렬)
    if (dropKind === "lunch") {
      visibleChips = [...visibleChips].sort((a, b) => {
        const ap = a.w.emp.position === "약사" ? 0 : 1;
        const bp = b.w.emp.position === "약사" ? 0 : 1;
        return ap - bp;
      });
    }

    // 외부 chip 드롭 → 이 슬롯의 맨 앞에 삽입 (넣는 대로 맨 위 채움 · 무제한)
    const handleContainerDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (draggingId === null) return;
      // 이미 이 슬롯에 있으면 무시 (내부 재정렬은 chip drag 로 처리)
      if (assigned.includes(draggingId)) return;
      onDrop(slotKey, draggingId, draggingSource ?? undefined);
    };
    const handleContainerDragOver = (e: React.DragEvent) => {
      // 내부 chip 재정렬 중이면 컨테이너 dragover 무시
      if (breakChipDrag?.kind === dropKind && breakChipDrag.slot === slotKey) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    };

    return (
      <div
        data-drop-slot={slotKey}
        {...(dropKind === "lunch" ? { "data-drop-lunch": slotKey } : { "data-drop-rest": slotKey })}
        className={`flex-1 flex flex-col border-r last:border-r-0 ${theme.border} ${theme.bg} ${theme.hover} transition`}
        onDragOver={handleContainerDragOver}
        onDrop={handleContainerDrop}
        onClick={() => setCellPicker({ type: dropKind, slot: slotKey })}
      >
        <span className={`text-[13px] font-bold text-center leading-none py-0.5 ${theme.label}`}>:{minLabel}</span>
        {/* 한 공간: 배정된 chip 만 위에서부터 stack · 빈 자리(–) 없음 */}
        <div className="flex flex-col gap-px px-0.5 pb-0.5 min-h-[24px]">
          {visibleChips.length === 0 ? (
            <span className="text-[12px] text-zinc-300 leading-none text-center py-0.5 select-none">–</span>
          ) : (
            visibleChips.map((chip, listIdx) => {
              const { empId, w, c, origIdx } = chip;
              const isDragging = breakChipDrag?.kind === dropKind && breakChipDrag.slot === slotKey && breakChipDrag.fromIdx === origIdx;
              return (
                <div
                  key={`${slotKey}-${empId}`}
                  draggable
                  onDragStart={e => {
                    e.stopPropagation();
                    e.dataTransfer.effectAllowed = "move";
                    setBreakChipDrag({ kind: dropKind, slot: slotKey, fromIdx: origIdx });
                  }}
                  onDragOver={e => {
                    // 같은 슬롯 내부 chip 재정렬만 허용
                    if (!breakChipDrag || breakChipDrag.kind !== dropKind || breakChipDrag.slot !== slotKey) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={e => {
                    if (!breakChipDrag || breakChipDrag.kind !== dropKind || breakChipDrag.slot !== slotKey) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const from = breakChipDrag.fromIdx;
                    // 눈에 보이는 list index → 실제 assigned 배열 index
                    const to = origIdx;
                    if (from === to) { setBreakChipDrag(null); return; }
                    if (onReorder) onReorder(slotKey, empId, listIdx);
                    else {
                      const newOrder = [...assigned];
                      const [moved] = newOrder.splice(from, 1);
                      newOrder.splice(to, 0, moved);
                      // reorder 콜백 없으면 remove+drop 시퀀스로 근사 (외부 API 우선 사용 권장)
                      onRemove(slotKey, moved);
                      onDrop(slotKey, moved, { type: dropKind, slot: slotKey });
                    }
                    setBreakChipDrag(null);
                  }}
                  onDragEnd={() => setBreakChipDrag(null)}
                  onClick={e => { e.stopPropagation(); setCellPicker({ type: dropKind, slot: slotKey }); }}
                  title={w.emp.position.includes("캐셔") && w.emp.position.includes("물류") ? "캐셔 겸직 · 드래그로 순서 변경" : "드래그로 순서 변경 · 탭하여 편집"}
                  style={{ backgroundColor: c.chipBg, color: w.emp.position === "약사" ? "#2563eb" : c.chipText, borderColor: c.chipBorder, opacity: isDragging ? 0.4 : 1 }}
                  className={`relative w-full text-center rounded text-[13px] border transition leading-none py-px cursor-grab active:cursor-grabbing hover:opacity-60 inline-flex items-center justify-center gap-0.5 whitespace-nowrap overflow-hidden ${w.emp.position === "약사" ? "font-bold" : "font-bold"}`}
                >
                  <span className="truncate">{w.emp.name}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const lunchTheme = { border: "border-yellow-200", bg: "bg-yellow-50/60", hover: "hover:bg-yellow-100", label: "text-yellow-500" };
  const restTheme  = { border: "border-violet-200", bg: "bg-violet-50/60", hover: "hover:bg-violet-100", label: "text-violet-400" };

  const offsetLabel = (off: number) => off === 0 ? "기본" : `${off > 0 ? "+" : ""}${off}분`;

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-sky-400" />
          <span className="text-[14px] font-bold text-sky-800">구역 · 점심 · 휴게 배정</span>
          {assignedIds.size > 0 && (
            <span className="text-[13px] font-semibold text-sky-700 opacity-70">{assignedIds.size}명 배정됨</span>
          )}
          {onAutoSuggest && (
            <button
              type="button"
              onClick={onAutoSuggest}
              className="text-[13px] font-bold px-2 py-0.5 rounded-full bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white cursor-pointer shadow-sm transition"
              title="현재 탭 인원 기준으로 카운터·매장을 자동 배치 (약사 1시간 로테이션 + 캐셔 팀)"
            >
              ⚡ 임의배치
            </button>
          )}
          {/* 2026-08-17 · StatusPill 프레임워크 통일 */}
          {onConfirm && (
            isConfirmed ? (
              <StatusPill tone="emerald" size="md">✓ 확정됨</StatusPill>
            ) : (
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirming}
                className="text-[13px] font-bold px-2 py-0.5 rounded-full bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white cursor-pointer shadow-sm transition disabled:opacity-50"
                title="현재 배치를 확정하고 날짜/요일 템플릿에 저장"
              >
                {confirming ? "저장중…" : "✓ 확정"}
              </button>
            )
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[12px] text-zinc-400 mr-0.5">요일저장</span>
          {DOW_LABELS.map((label, dow) => (
            <button key={dow}
              onClick={() => setSelectedDows(prev => {
                const next = new Set(prev);
                if (next.has(dow)) next.delete(dow); else next.add(dow);
                return next;
              })}
              className={`w-6 h-6 text-[12px] font-bold rounded transition cursor-pointer ${
                selectedDows.has(dow)
                  ? "bg-brand-deep text-white shadow-sm"
                  : dow === currentDow
                    ? "bg-indigo-200 text-indigo-700 border border-indigo-300"
                    : "bg-white border border-line text-zinc-600 hover:border-indigo-400 hover:text-indigo-600"
              }`}>
              {label}
            </button>
          ))}
          {selectedDows.size > 0 && (
            <>
              <button
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  await Promise.all([...selectedDows].map(d => onSaveToDow(d)));
                  setSaving(false);
                  setSelectedDows(new Set());
                }}
                className="text-[13px] font-bold px-2 py-0.5 rounded bg-brand-deep text-white hover:bg-brand-deep cursor-pointer disabled:opacity-50 ml-0.5">
                {saving ? "저장중…" : `저장(${selectedDows.size})`}
              </button>
              <button onClick={() => setSelectedDows(new Set())}
                className="text-[13px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 hover:bg-zinc-200 cursor-pointer">✕</button>
            </>
          )}
        </div>
      </div>

      {/* Unified grid */}
      <div className="overflow-x-auto">
        {/* pr-6: 20시 라벨 오른쪽에 여백 확보 — 셀 오른쪽 경계가 화면 끝에 붙지 않도록 */}
        <div className="pr-6" style={{ minWidth: "600px" }}>
          {/* Hour header — 왼쪽 정렬, 21시 제거됨 + 종료시간(20:00) 라벨 + 피크타임(14~17) 표시 */}
          <div className="flex mb-0.5 relative">
            <div className="w-14 shrink-0" />
            <div className="flex-1 relative">
              {/* 피크타임 배경 밴드: 14:00~17:00 = 슬롯 인덱스 4~6 (10슬롯 기준 40%~70%) */}
              <div className="absolute top-0 bottom-0 bg-orange-100/70 rounded pointer-events-none flex items-start justify-center"
                style={{ left: "40%", width: "30%" }}>
                <span className="text-[11px] font-bold text-orange-500 tracking-tight leading-none pt-0.5">피크타임</span>
              </div>
              <div className="flex relative">
                {ZONE_SLOTS.map((slot, i) => {
                  const isPeak = i >= 4 && i <= 6;
                  return (
                    <div key={slot} className="flex-1 text-left pl-0.5">
                      <span className={`text-[14px] font-bold ${isPeak ? "text-orange-500" : "text-sky-600"}`}>{slot}</span>
                    </div>
                  );
                })}
              </div>
              {/* 20:00은 마지막 셀의 종료 지점 — 셀 오른쪽 끝에 라벨만 표시 */}
              <span className="text-[14px] font-bold text-sky-600 absolute right-0 top-0 pr-0.5">20:00</span>
            </div>
          </div>

          {/* Zone rows: 카운터 / 매장 */}
          {ZONE_ROWS.map(zone => {
            const isCounter = zone === "카운터";
            return (
              <div key={zone} className="flex items-stretch mb-0.5">
                <div className="w-14 shrink-0 flex items-center">
                  <span className={`text-[15px] font-bold tracking-wide ${isCounter ? "text-rose-600" : "text-sky-700"}`}>{zone}</span>
                </div>
                {ZONE_SLOTS.map(slot => {
                  const assignedHere = (zoneMap[zone] ?? {})[slot] ?? [];
                  return (
                    <div key={slot}
                      data-drop-zone={zone}
                      data-drop-slot={slot}
                      className={`flex-1 border min-h-[36px] p-0.5 bg-white/60 transition cursor-pointer flex flex-wrap gap-0.5 items-start ${
                        isCounter ? "border-rose-200 hover:bg-rose-50" : "border-sky-200 hover:bg-sky-100"
                      }`}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                      onDrop={e => {
                        e.preventDefault();
                        if (draggingId === null) return;
                        const src = draggingSource;
                        setDraggingSource(null);
                        // 같은 셀 → skip
                        if (src?.type === "zone" && src.zone === zone && src.slot === slot) return;
                        tryDropToZone(zone, slot, draggingId, src ?? undefined);
                      }}
                      onClick={() => setCellPicker({ type: "zone", zone, slot })}
                    >
                      {assignedHere.map(empId => {
                        const w = allWorkers.find(ww => ww.emp.id === empId);
                        if (!w) return null;
                        // 탭 필터: 현재 탭에 없는 사람은 완전히 숨김
                        const inTab = isTabAll || tabWorkerIds.has(empId);
                        if (!inTab) return null;
                        const c = typeTones[w.schedule.type] ?? DEFAULT_TONE;
                        return (
                          <div key={empId}
                            draggable
                            onDragStart={e => {
                              e.stopPropagation();
                              e.dataTransfer.effectAllowed = "move";
                              setDraggingId(empId);
                              setDraggingZoneSource({ zone, slot });
                              onUserInteract?.();
                            }}
                            onDragEnd={() => { setDraggingId(null); setDraggingZoneSource(null); }}
                            onClick={e => { e.stopPropagation(); onRemoveFromZone(zone, slot, empId); }}
                            onTouchStart={e => {
                              e.stopPropagation();
                              setTouchDraggingId(empId);
                              setDraggingZoneSource({ zone, slot });
                              createGhost(w.emp.name);
                              const touch = e.touches[0];
                              moveGhost(touch.clientX, touch.clientY);
                              const onMove = (ev: TouchEvent) => {
                                ev.preventDefault();
                                const t = ev.touches[0];
                                moveGhost(t.clientX, t.clientY);
                              };
                              const onEnd = (ev: TouchEvent) => {
                                document.removeEventListener("touchmove", onMove);
                                document.removeEventListener("touchend", onEnd);
                                const t = ev.changedTouches[0];
                                removeGhost();
                                handleTouchDragEnd(t.clientX, t.clientY);
                              };
                              document.addEventListener("touchmove", onMove, { passive: false });
                              document.addEventListener("touchend", onEnd);
                            }}
                            title="드래그: 다른 구역으로 이동 | 클릭: 제거"
                            style={{ backgroundColor: c.chipBg, color: w.emp.position === "약사" ? "#2563eb" : c.chipText, borderColor: c.chipBorder, touchAction: "none" }}
                            className={`relative px-1 py-px rounded text-[14px] border transition select-none cursor-grab hover:opacity-70 inline-flex items-center gap-0.5 whitespace-nowrap ${w.emp.position === "약사" ? "font-bold" : "font-bold"}`}
                          >
                            {w.emp.name}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Divider */}
          <div className="h-px bg-sky-200/60 my-1" />

          {/* 점심 위 시간 라벨 (컴팩트) — 시각(hour)만 표기: 10, 11, ... */}
          <div className="flex mb-0.5 relative">
            <div className="w-14 shrink-0" />
            <div className="flex-1 flex relative">
              {ZONE_SLOTS.map(slot => (
                <div key={slot} className="flex-1 text-left pl-0.5">
                  <span className="text-[13px] font-bold text-yellow-700/70">{parseInt(slot, 10)}</span>
                </div>
              ))}
              <span className="text-[13px] font-bold text-yellow-700/70 absolute right-0 top-0 pr-0.5">20</span>
            </div>
          </div>

          {/* 점심 row */}
          <div className="flex items-stretch mb-0.5">
            <div className="w-14 shrink-0 flex flex-col justify-center gap-0.5">
              <div className="flex items-center gap-0.5">
                <span className="text-[15px] font-bold text-yellow-700">점심</span>
              </div>
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => onShiftLunchOffset(-30)} disabled={lunchOffset <= -60}
                  className="w-4 h-4 flex items-center justify-center text-[12px] font-bold rounded bg-white border border-line text-zinc-500 disabled:opacity-30 cursor-pointer">−</button>
                <span className="text-[13px] tabular-nums text-zinc-400 leading-none">{offsetLabel(lunchOffset)}</span>
                <button type="button" onClick={() => onShiftLunchOffset(30)} disabled={lunchOffset >= 60}
                  className="w-4 h-4 flex items-center justify-center text-[12px] font-bold rounded bg-white border border-line text-zinc-500 disabled:opacity-30 cursor-pointer">+</button>
              </div>
              <div className="flex gap-0.5 mt-0.5">
                {([30, 60, 90] as BreakInterval[]).map(v => (
                  <button key={v} type="button" onClick={() => onSetLunchInterval(v)}
                    className={`text-[11px] px-0.5 py-px rounded font-bold border transition cursor-pointer ${
                      lunchInterval === v ? "bg-yellow-500 text-white border-yellow-500" : "bg-white text-zinc-400 border-line hover:border-yellow-300"
                    }`}>
                    {v === 30 ? "30분" : v === 60 ? "1h" : "1.5h"}
                  </button>
                ))}
              </div>
            </div>
            {ZONE_SLOTS.map(slot => {
              const k0 = subSlotKey(slot, 0);
              const k30 = subSlotKey(slot, 30);
              const activeK0 = shiftedLunchSlots.includes(k0);
              const activeK30 = shiftedLunchSlots.includes(k30);
              // 모두 비활성일 때도 renderBreakSubCell(false)로 위임 → 드롭 타겟 유지
              if (!activeK0 && !activeK30) {
                return (
                  <div key={slot} className="flex-1 flex border border-transparent">
                    {renderBreakSubCell(k0, false, lunchSlotMap, lunchTheme, onDropToLunch, onRemoveFromLunch, "lunch", lunchCount, onReorderLunch)}
                  </div>
                );
              }
              // 1시간 인터벌: 활성 slot 하나만 렌더 (전체 시간 칸 차지)
              if (lunchInterval === 60) {
                const activeKey = activeK0 ? k0 : k30;
                return (
                  <div key={slot} className="flex-1 flex border border-yellow-200">
                    {renderBreakSubCell(activeKey, true, lunchSlotMap, lunchTheme, onDropToLunch, onRemoveFromLunch, "lunch", lunchCount, onReorderLunch)}
                  </div>
                );
              }
              // 30분 인터벌: 2개 sub-cell
              return (
                <div key={slot} className="flex-1 flex border border-yellow-200">
                  {renderBreakSubCell(k0,  activeK0,  lunchSlotMap, lunchTheme, onDropToLunch, onRemoveFromLunch, "lunch", lunchCount, onReorderLunch)}
                  {renderBreakSubCell(k30, activeK30, lunchSlotMap, lunchTheme, onDropToLunch, onRemoveFromLunch, "lunch", lunchCount, onReorderLunch)}
                </div>
              );
            })}
          </div>

          {/* 휴게 위 시간 라벨 (컴팩트) — 시각(hour)만 표기 */}
          <div className="flex mb-0.5 mt-0.5 relative">
            <div className="w-14 shrink-0" />
            <div className="flex-1 flex relative">
              {ZONE_SLOTS.map(slot => (
                <div key={slot} className="flex-1 text-left pl-0.5">
                  <span className="text-[13px] font-bold text-violet-700/70">{parseInt(slot, 10)}</span>
                </div>
              ))}
              <span className="text-[13px] font-bold text-violet-700/70 absolute right-0 top-0 pr-0.5">20</span>
            </div>
          </div>

          {/* 휴게 row */}
          <div className="flex items-stretch">
            <div className="w-14 shrink-0 flex flex-col justify-center gap-0.5">
              <div className="flex items-center gap-0.5">
                <span className="text-[15px] font-bold text-violet-700">휴게</span>
              </div>
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => onShiftRestOffset(-30)} disabled={restOffset <= -60}
                  className="w-4 h-4 flex items-center justify-center text-[12px] font-bold rounded bg-white border border-line text-zinc-500 disabled:opacity-30 cursor-pointer">−</button>
                <span className="text-[13px] tabular-nums text-zinc-400 leading-none">{offsetLabel(restOffset)}</span>
                <button type="button" onClick={() => onShiftRestOffset(30)} disabled={restOffset >= 60}
                  className="w-4 h-4 flex items-center justify-center text-[12px] font-bold rounded bg-white border border-line text-zinc-500 disabled:opacity-30 cursor-pointer">+</button>
              </div>
              <div className="flex gap-0.5 mt-0.5">
                {([30, 60, 90] as BreakInterval[]).map(v => (
                  <button key={v} type="button" onClick={() => onSetRestInterval(v)}
                    className={`text-[11px] px-0.5 py-px rounded font-bold border transition cursor-pointer ${
                      restInterval === v ? "bg-violet-500 text-white border-violet-500" : "bg-white text-zinc-400 border-line hover:border-violet-300"
                    }`}>
                    {v === 30 ? "30분" : v === 60 ? "1h" : "1.5h"}
                  </button>
                ))}
              </div>
            </div>
            {ZONE_SLOTS.map(slot => {
              const k0 = subSlotKey(slot, 0);
              const k30 = subSlotKey(slot, 30);
              const activeK0 = shiftedRestSlots.includes(k0);
              const activeK30 = shiftedRestSlots.includes(k30);
              if (!activeK0 && !activeK30) {
                return (
                  <div key={slot} className="flex-1 flex border border-transparent">
                    {renderBreakSubCell(k0, false, restSlotMap, restTheme, onDropToRest, onRemoveFromRest, "rest", restCount, onReorderRest)}
                  </div>
                );
              }
              if (restInterval === 60) {
                const activeKey = activeK0 ? k0 : k30;
                return (
                  <div key={slot} className="flex-1 flex border border-violet-200">
                    {renderBreakSubCell(activeKey, true, restSlotMap, restTheme, onDropToRest, onRemoveFromRest, "rest", restCount, onReorderRest)}
                  </div>
                );
              }
              return (
                <div key={slot} className="flex-1 flex border border-violet-200">
                  {renderBreakSubCell(k0,  activeK0,  restSlotMap, restTheme, onDropToRest, onRemoveFromRest, "rest", restCount, onReorderRest)}
                  {renderBreakSubCell(k30, activeK30, restSlotMap, restTheme, onDropToRest, onRemoveFromRest, "rest", restCount, onReorderRest)}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Drag-source chips — 현재 탭에 해당하는 인원만 표시 */}
      <div className="mt-2 pt-2 border-t border-sky-200/60">
        <WorkerChips
          workers={isTabAll ? allWorkers : allWorkers.filter(w => tabWorkerIds.has(w.emp.id))}
          assignedIds={assignedIds}
          lunchAssignedIds={lunchAssignedIds}
          draggingId={draggingId}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          compact
          typeTones={typeTones}
          onTouchDragStart={handleTouchDragStart}
          onTouchDragEnd={handleTouchDragEnd}
          grouped={isTabAll}
        />
      </div>

      {/* 2026-08-22 · Framework Phase 4 · CellPickerPopup 별도 파일 이관 */}
      {cellPicker && (
        <CellPickerPopup
          cellPicker={cellPicker}
          onClose={() => setCellPicker(null)}
          allWorkers={allWorkers}
          zoneMap={zoneMap}
          lunchSlotMap={lunchSlotMap}
          restSlotMap={restSlotMap}
          shiftedLunchSlots={shiftedLunchSlots}
          shiftedRestSlots={shiftedRestSlots}
          lunchCount={lunchCount}
          restCount={restCount}
          typeTones={typeTones}
          onDropToLunch={onDropToLunch}
          onRemoveFromLunch={onRemoveFromLunch}
          onDropToRest={onDropToRest}
          onRemoveFromRest={onRemoveFromRest}
          onRemoveFromZone={onRemoveFromZone}
          tryDropToZone={tryDropToZone}
          showError={showError}
        />
      )}
      {/* 2026-08-21 · Framework Phase 3 · toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </div>
  );
});
ZoneSection.displayName = "ZoneSection";

export { ZoneSection, ZONE_SLOTS };
export type { ZoneSectionProps };
