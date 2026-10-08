// src/components/schedule-v2/views/day-assignment/DayAssignmentView.tsx
// 2026-10-08 · 스케줄 V2 · Day 배치 자체 UI
//   · 기능 로직 전부 V1 재사용:
//     - useSlotHandlers (drop/remove · atomic 이동 · conflict 검증)
//     - buildAutoSuggestZoneMap · computeLunchAssignments
//     - parseRange · shiftSlot · HOUR_SLOTS · LUNCH_SLOTS · REST_SLOTS · SKIP_TYPES · ZONE_ROWS
//     - shared/schedule/dayAssignment (load/save)
//     - /api/zone-day/{date} (autosave + confirm)
//   · UI 전부 신규 작성 · V1 DayTimelineModal 미사용 (Modal 띄우지 않음)
//     · 트렌드 Linear/Vercel/Notion 2026: light neutral · thin border · low shadow · 8~12px radius · compact
//     · 파스텔/이모지/배지 금지 · heavy gradient 금지
//   · 레이아웃 · desktop 3-column (근무직원 · 구역 · 점심/휴게) · tablet 2-col · mobile section stacked
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, Sparkle, X } from "@phosphor-icons/react";
import type { Employee, Schedule } from "../../../../types";
import type { ScheduleTypeEntry } from "../../../../hooks/useSettings";
import type { SlotMap, ZoneMap, ZoneRow, BreakInterval, BreakCount, TypeTone, WorkerEntry } from "../../../DayTimelineModal/types";
import { SKIP_TYPES, ZONE_ROWS } from "../../../DayTimelineModal/types";
import {
  HOUR_SLOTS, LUNCH_SLOTS, REST_SLOTS,
  buildTypeTones, buildAutoSuggestZoneMap, computeLunchAssignments,
  parseRange, shiftSlot,
} from "../../../DayTimelineModal/utils";
import { useSlotHandlers } from "../../../DayTimelineModal/useSlotHandlers";
import {
  loadZoneSlots, saveZoneSlots,
  loadLunchSlots, saveLunchSlots,
  loadRestSlots, saveRestSlots,
  loadLunchOffset, loadRestOffset,
  loadLunchInterval, loadRestInterval,
  loadLunchCount, loadRestCount,
  cleanupStaleTimelineKeys,
} from "../../../../shared/schedule/dayAssignment";
import { api, ApiError } from "../../../../lib/apiClient";
import { useToast, toastClass } from "../../../../hooks/useToast";
import { getTypeHoursMap } from "../../../SchedulePage/scheduleHelpers";
// 2026-10-08 · V2 자체 UI · V1 getTypeHex/isLightHex 은 scheduleCellContent 에서만 사용 · 여기서는 chip tone 로 충분

// Zone grid 가 쓰는 10시 ~ 19시 (10 hour starts) · V1 ZoneSection:68 과 동일
const ZONE_HOUR_SLOTS = HOUR_SLOTS.slice(0, -3);
// Zone slot key convention · V1 과 동일 "HH:00" / "HH:30" sub-slot
//   · V2 UI 는 HOUR cell 1개로 통합 (세로 쌓임 방지) · drop 저장은 "HH:00" (V1 buildAutoSuggest 와 동일)
//   · 조회 시 (HH:00 ids) + (HH:30 ids) merge 하여 모두 표시 (V1 호환 · 기존 "HH:30" 저장도 노출)
function subSlotKey(hour: string, minute: 0 | 30): string {
  const h = parseInt(hour.split(":")[0], 10);
  return `${String(h).padStart(2, "0")}:${minute === 0 ? "00" : "30"}`;
}

interface Props {
  date: string;             // YYYY-MM-DD
  employees: Employee[];    // 전체 (해당 월 fetch · OFF 포함)
  scheduleTypes: ScheduleTypeEntry[];
  canEdit: boolean;         // level >= 5
}

export const DayAssignmentView: React.FC<Props> = ({ date, employees, scheduleTypes, canEdit }) => {
  const { toast, show, showError } = useToast();

  // 30일 초과 tl_* localStorage key 정리 (Quota 방어 · V1 과 동일 cleanup 호출)
  useEffect(() => { cleanupStaleTimelineKeys(); }, []);

  // ─── State ──────────────────────────────────────────────────────────────
  //   · 전부 shared/schedule/dayAssignment 로 로드 · date 변경 시 재로드
  //   · V1 와 동일 state shape · 같은 key 사용
  const [zoneSlots, setZoneSlots] = useState<ZoneMap>(() => loadZoneSlots(date));
  const [lunchSlots, setLunchSlots] = useState<SlotMap>(() => loadLunchSlots(date));
  const [restSlots, setRestSlots] = useState<SlotMap>(() => loadRestSlots(date));
  const [lunchOffset] = useState<number>(() => loadLunchOffset(date));
  const [restOffset] = useState<number>(() => loadRestOffset(date));
  const [lunchInterval] = useState<BreakInterval>(() => loadLunchInterval(date));
  const [restInterval] = useState<BreakInterval>(() => loadRestInterval(date));
  const [lunchCount] = useState<BreakCount>(() => loadLunchCount(date));
  const [restCount] = useState<BreakCount>(() => loadRestCount(date));

  // date 변경 시 state 리로드 (date 가 바뀌면 다른 날짜 데이터)
  useEffect(() => {
    setZoneSlots(loadZoneSlots(date));
    setLunchSlots(loadLunchSlots(date));
    setRestSlots(loadRestSlots(date));
  }, [date]);

  // 서버 자동 저장 (debounced 1.5s · V1 과 동일 payload)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAutoSave = useCallback((
    zs: ZoneMap, ls: SlotMap, rs: SlotMap,
    lo: number, ro: number, li: BreakInterval, ri: BreakInterval,
    lc: BreakCount, rc: BreakCount,
  ) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      api.put(`/api/zone-day/${date}`, {
        zone_slots: zs, lunch_slots: ls, rest_slots: rs,
        lunch_offset: lo, rest_offset: ro,
        lunch_interval: li, rest_interval: ri,
        lunch_count: lc, rest_count: rc,
        is_confirmed: false,
      }).catch(() => { /* fire-and-forget · V1 동일 */ });
    }, 1500);
  }, [date]);
  useEffect(() => () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); }, []);

  // 유형별 톤 · V1 buildTypeTones 재사용
  const typeTones = useMemo(() => buildTypeTones(scheduleTypes), [scheduleTypes]);

  // 해당 날짜 근무 직원 (OFF 제외 + schedule 존재) · V1 과 동일 조건
  const workers: WorkerEntry[] = useMemo(() => {
    const list: WorkerEntry[] = [];
    for (const emp of employees) {
      const s = emp.schedules?.find(x => x.date === date);
      if (!s || !s.type) continue;
      if (SKIP_TYPES.has(s.type)) continue;
      const hoursMap = getTypeHoursMap(emp.position ?? "", emp.employmentType ?? "", scheduleTypes);
      const wh = (s.workingHours || hoursMap[s.type] || "").trim();
      list.push({ emp, schedule: s as Schedule, wh });
    }
    return list;
  }, [employees, date, scheduleTypes]);

  // 근무 범위 (parseRange) · auto-suggest 와 handlers 모두 사용
  const workRanges = useMemo(() => {
    const r: Record<number, { start: number; end: number } | null> = {};
    workers.forEach(w => { r[w.emp.id] = parseRange(w.wh); });
    return r;
  }, [workers]);

  // Shifted slot 목록 (offset · interval 반영)
  const shiftedLunchSlots = useMemo(() => {
    const all = LUNCH_SLOTS.map(s => shiftSlot(s, lunchOffset));
    if (lunchInterval === 90) return all.filter((_, i) => i % 3 === 0);
    if (lunchInterval === 60) return all.filter((_, i) => i % 2 === 0);
    return all;
  }, [lunchOffset, lunchInterval]);
  const shiftedRestSlots = useMemo(() => {
    const all = REST_SLOTS.map(s => shiftSlot(s, restOffset));
    if (restInterval === 90) return all.filter((_, i) => i % 3 === 0);
    if (restInterval === 60) return all.filter((_, i) => i % 2 === 0);
    return all;
  }, [restOffset, restInterval]);

  // V1 useSlotHandlers 재사용 (atomic 이동 · 겹침·중복 검증)
  const { dropToLunchSlot, removeFromLunchSlot, dropToRestSlot, removeFromRestSlot, dropToZone, removeFromZone } = useSlotHandlers({
    date, employees,
    lunchSlots, restSlots, zoneSlots,
    setLunchSlots, setRestSlots, setZoneSlots,
    lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount,
    scheduleAutoSave, mainShowError: showError,
  });

  // 직원 lookup (id → WorkerEntry) · chip 렌더용
  const empById = useMemo(() => {
    const m = new Map<number, WorkerEntry>();
    for (const w of workers) m.set(w.emp.id, w);
    return m;
  }, [workers]);

  // 자동배치 (V1 buildAutoSuggestZoneMap + computeLunchAssignments)
  const [autoSuggested, setAutoSuggested] = useState(false);
  const handleAutoSuggest = useCallback(() => {
    if (!canEdit) return;
    if (workers.length === 0) { show("배치할 근무 직원이 없습니다."); return; }
    const lunchMap = computeLunchAssignments(workers, shiftedLunchSlots, workRanges, lunchCount);
    const nextZone = buildAutoSuggestZoneMap(workers, ZONE_HOUR_SLOTS, lunchMap, workRanges);
    const nextLunch: SlotMap = {};
    lunchMap.forEach((slot, empId) => {
      if (!nextLunch[slot]) nextLunch[slot] = [];
      nextLunch[slot].push(empId);
    });
    setZoneSlots(nextZone);
    setLunchSlots(nextLunch);
    saveZoneSlots(date, nextZone);
    saveLunchSlots(date, nextLunch);
    scheduleAutoSave(nextZone, nextLunch, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
    setAutoSuggested(true);
    show("자동배치가 적용되었습니다.", undefined, "success");
  }, [canEdit, workers, shiftedLunchSlots, workRanges, lunchCount, date, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, restCount, scheduleAutoSave, show]);

  // 확정 저장 (is_confirmed=true · V1 과 동일 payload)
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const handleConfirm = useCallback(async () => {
    if (!canEdit) return;
    setConfirming(true);
    try {
      await api.put(`/api/zone-day/${date}`, {
        zone_slots: zoneSlots, lunch_slots: lunchSlots, rest_slots: restSlots,
        lunch_offset: lunchOffset, rest_offset: restOffset,
        lunch_interval: lunchInterval, rest_interval: restInterval,
        lunch_count: lunchCount, rest_count: restCount,
        is_confirmed: true,
      });
      setIsConfirmed(true);
      setAutoSuggested(false);
      show("배치가 확정되었습니다.", undefined, "success");
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : "확정 저장에 실패했습니다.";
      showError(msg);
    } finally {
      setConfirming(false);
    }
  }, [canEdit, date, zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, show, showError]);

  // 서버 confirm 상태 로드 (first mount + date 변경)
  //   · V1 DayTimelineModal 과 동일 endpoint · body 는 { zone_slots, lunch_slots, ..., is_confirmed, _empty }
  useEffect(() => {
    let cancelled = false;
    api.get<{ is_confirmed?: boolean; _empty?: boolean }>(`/api/zone-day/${date}`)
      .then(res => {
        if (!cancelled) setIsConfirmed(!!(res.data?.is_confirmed));
      })
      .catch(() => { if (!cancelled) setIsConfirmed(false); });
    return () => { cancelled = true; };
  }, [date]);

  // Drag API · dataTransfer 로 source + empId 전달
  //   · setData 는 custom MIME + text/plain fallback (일부 브라우저 drag 세션 유지 조건)
  const handleDragStartWorker = useCallback((e: React.DragEvent, empId: number) => {
    e.dataTransfer.effectAllowed = "move";
    const payload = JSON.stringify({ source: "pool", empId });
    e.dataTransfer.setData("application/x-sched-v2", payload);
    e.dataTransfer.setData("text/plain", payload);
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      {/* Toolbar · 자동배치 · 확정 · 임의배치 배너 */}
      <div className="shrink-0 flex items-center flex-wrap gap-2 py-2 border-b border-line">
        <div className="text-[13px] text-ink-soft">
          <span className="font-semibold text-ink">근무 {workers.length}명</span>
          <span className="mx-1.5 text-zinc-300">·</span>
          구역 {Object.values(zoneSlots).reduce((n, z) => n + Object.values(z).reduce((m, ids) => m + ids.length, 0), 0)}
          <span className="mx-1.5 text-zinc-300">·</span>
          점심 {Object.values(lunchSlots).reduce((n, ids) => n + ids.length, 0)}
          <span className="mx-1.5 text-zinc-300">·</span>
          휴게 {Object.values(restSlots).reduce((n, ids) => n + ids.length, 0)}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            disabled={!canEdit}
            onClick={handleAutoSuggest}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line bg-white hover:bg-zinc-50 text-ink text-[13px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="근무자 범위 기반 자동배치"
          >
            <Sparkle size={13} weight="bold" />
            자동배치
          </button>
          <button
            type="button"
            disabled={!canEdit || confirming}
            onClick={handleConfirm}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              isConfirmed
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                : "bg-brand-deep text-white border border-brand-deep hover:bg-[#0d3a5c]"
            }`}
            title={isConfirmed ? "다시 확정" : "현재 상태로 확정 저장"}
          >
            <CheckCircle size={13} weight="bold" />
            {confirming ? "저장중..." : isConfirmed ? "확정됨" : "확정"}
          </button>
        </div>
      </div>

      {autoSuggested && !isConfirmed && (
        <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-[12px] text-amber-800">
          <span className="font-semibold">임의배치 적용됨 · 확정 전 수동 조정 가능</span>
        </div>
      )}
      {toast && (
        <div className={`shrink-0 ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}

      {/* 3-column · desktop + · mobile stacked */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[220px_1fr_300px] gap-2">
        <WorkerPool workers={workers} typeTones={typeTones} onDragStartWorker={handleDragStartWorker} canEdit={canEdit} />
        <ZonePanel
          zoneSlots={zoneSlots}
          empById={empById}
          typeTones={typeTones}
          onDrop={dropToZone}
          onRemove={removeFromZone}
          canEdit={canEdit}
        />
        <BreakPanel
          lunchSlots={lunchSlots} restSlots={restSlots}
          shiftedLunchSlots={shiftedLunchSlots} shiftedRestSlots={shiftedRestSlots}
          empById={empById} typeTones={typeTones}
          onDropLunch={dropToLunchSlot} onRemoveLunch={removeFromLunchSlot}
          onDropRest={dropToRestSlot} onRemoveRest={removeFromRestSlot}
          canEdit={canEdit}
        />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Worker Pool · 근무 직원 (drag source)
// ─────────────────────────────────────────────────────────────────────────
const WorkerPool: React.FC<{
  workers: WorkerEntry[];
  typeTones: Record<string, TypeTone>;
  onDragStartWorker: (e: React.DragEvent, empId: number) => void;
  canEdit: boolean;
}> = ({ workers, typeTones, onDragStartWorker, canEdit }) => {
  return (
    <section className="min-h-0 flex flex-col rounded-xl border border-line bg-white overflow-hidden">
      <header className="shrink-0 flex items-baseline justify-between px-3 py-2 border-b border-line">
        <h3 className="text-[13px] font-bold text-ink tracking-tight">근무 직원</h3>
        <span className="text-[11px] text-ink-soft tabular-nums">{workers.length}명</span>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-zinc-100">
        {workers.length === 0 && (
          <div className="px-3 py-6 text-center text-[12px] text-ink-soft">근무 직원 없음</div>
        )}
        {workers.map(w => {
          const tone = typeTones[w.schedule.type];
          return (
            <div
              key={`wk-${w.emp.id}`}
              draggable={canEdit}
              onDragStart={(e) => canEdit && onDragStartWorker(e, w.emp.id)}
              className={`flex items-center gap-2 px-3 py-2 select-none ${canEdit ? "cursor-grab active:cursor-grabbing hover:bg-sky-50/60" : "cursor-default"}`}
              title={canEdit ? `${w.emp.name} · 끌어서 구역/점심/휴게 배정` : `${w.emp.name} · ${w.schedule.type}${w.wh ? ` · ${w.wh}` : ""}`}
            >
              <span
                className="inline-block w-1 h-6 rounded-sm shrink-0"
                style={{ backgroundColor: tone?.dot ?? "#94a3b8" }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-ink leading-tight truncate">{w.emp.name}</div>
                <div className="text-[11px] text-ink-soft tabular-nums leading-tight">
                  {w.schedule.type}{w.wh ? ` · ${w.wh}` : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Zone Panel · ZONE_ROWS × ZONE_HOUR_SLOTS × (0, 30) sub-slot grid
// ─────────────────────────────────────────────────────────────────────────
const ZonePanel: React.FC<{
  zoneSlots: ZoneMap;
  empById: Map<number, WorkerEntry>;
  typeTones: Record<string, TypeTone>;
  onDrop: (zone: ZoneRow, slot: string, empId: number, source?: { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string }) => void;
  onRemove: (zone: ZoneRow, slot: string, empId: number) => void;
  canEdit: boolean;
}> = ({ zoneSlots, empById, typeTones, onDrop, onRemove, canEdit }) => {
  const handleDrop = useCallback((e: React.DragEvent, zone: ZoneRow, slot: string) => {
    if (!canEdit) return;
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/x-sched-v2") || e.dataTransfer.getData("text/plain");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { source: "pool" | "zone" | "lunch" | "rest"; empId: number; zone?: ZoneRow; slot?: string };
      if (parsed.source === "pool") {
        onDrop(zone, slot, parsed.empId);
      } else if (parsed.source === "zone" && parsed.zone && parsed.slot) {
        onDrop(zone, slot, parsed.empId, { type: "zone", zone: parsed.zone, slot: parsed.slot });
      } else if ((parsed.source === "lunch" || parsed.source === "rest") && parsed.slot) {
        onDrop(zone, slot, parsed.empId, { type: parsed.source, slot: parsed.slot });
      }
    } catch { /* bad payload */ }
  }, [onDrop, canEdit]);

  return (
    <section className="min-h-0 flex flex-col rounded-xl border border-line bg-white overflow-hidden">
      <header className="shrink-0 flex items-baseline justify-between px-3 py-2 border-b border-line">
        <h3 className="text-[13px] font-bold text-ink tracking-tight">구역 배정</h3>
        <span className="text-[11px] text-ink-soft">왼쪽 직원 이름을 끌어다 놓으세요 · 10:00 ~ 20:00</span>
      </header>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="border-collapse text-[12px]" style={{ tableLayout: "fixed", minWidth: 980 }}>
          <colgroup>
            <col style={{ width: 72 }} />
            {ZONE_HOUR_SLOTS.map(h => <col key={`c-${h}`} style={{ width: 110 }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 bg-zinc-50 border-r border-b border-line text-left px-2 py-1.5 text-[11px] font-bold text-ink-soft uppercase tracking-wide">구역</th>
              {ZONE_HOUR_SLOTS.map(h => (
                <th key={`h-${h}`} className="sticky top-0 z-10 bg-zinc-50 border-r border-b border-line text-center px-1 py-1.5 text-[11px] font-semibold text-ink-soft tabular-nums">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ZONE_ROWS.map(zone => (
              <tr key={`zr-${zone}`}>
                <th scope="row" className="sticky left-0 z-10 bg-white border-r border-b border-line text-left px-2 py-1.5 text-[12px] font-semibold text-ink align-top">
                  {zone}
                </th>
                {ZONE_HOUR_SLOTS.map(h => {
                  const k00 = subSlotKey(h, 0);
                  const k30 = subSlotKey(h, 30);
                  const ids00 = zoneSlots[zone]?.[k00] ?? [];
                  const ids30 = zoneSlots[zone]?.[k30] ?? [];
                  // 2026-10-08 · 사용자 지시 · 세로 쌓임 수정 · HOUR cell 1개로 통합
                  //   · 저장 slot = "HH:00" (V1 buildAutoSuggest 와 동일 · "HH:30" 는 chip 유래 정보로만 유지)
                  //   · 표시 chips = (HH:00) + (HH:30) · V1 호환 (기존 HH:30 데이터도 노출)
                  const items = [
                    ...ids00.map(id => ({ id, slot: k00 })),
                    ...ids30.map(id => ({ id, slot: k30 })),
                  ];
                  return (
                    <td key={`c-${zone}-${h}`} className="border-r border-b border-line p-0 align-top">
                      <ZoneHourCell
                        zone={zone} dropSlot={k00} items={items}
                        empById={empById} typeTones={typeTones}
                        onDropToCell={handleDrop}
                        onRemove={onRemove}
                        canEdit={canEdit}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const ZoneHourCell: React.FC<{
  zone: ZoneRow;
  dropSlot: string;                 // drop 시 저장되는 slot ("HH:00")
  items: { id: number; slot: string }[]; // 표시 · chip 별 origin slot (HH:00 or HH:30)
  empById: Map<number, WorkerEntry>;
  typeTones: Record<string, TypeTone>;
  onDropToCell: (e: React.DragEvent, zone: ZoneRow, slot: string) => void;
  onRemove: (zone: ZoneRow, slot: string, empId: number) => void;
  canEdit: boolean;
}> = ({ zone, dropSlot, items, empById, typeTones, onDropToCell, onRemove, canEdit }) => {
  const [hover, setHover] = useState(false);
  return (
    <div
      onDragOver={canEdit ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setHover(true); } : undefined}
      onDragLeave={() => setHover(false)}
      onDrop={canEdit ? (e) => { setHover(false); onDropToCell(e, zone, dropSlot); } : undefined}
      className={`relative min-h-[52px] p-1.5 flex flex-wrap gap-1 content-start transition-colors ${hover ? "bg-sky-50" : ""}`}
    >
      {items.length === 0 && (
        <span className="text-[10px] text-zinc-300 italic">—</span>
      )}
      {items.map(({ id, slot }) => (
        <SlotChip key={`${zone}-${slot}-${id}`} id={id} empById={empById} typeTones={typeTones}
          sourceType="zone" sourceZone={zone} sourceSlot={slot}
          onRemove={() => onRemove(zone, slot, id)}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Break Panel · Lunch + Rest 영역 (슬롯 리스트 · drop target + 제거)
// ─────────────────────────────────────────────────────────────────────────
const BreakPanel: React.FC<{
  lunchSlots: SlotMap; restSlots: SlotMap;
  shiftedLunchSlots: string[]; shiftedRestSlots: string[];
  empById: Map<number, WorkerEntry>; typeTones: Record<string, TypeTone>;
  onDropLunch: (slot: string, empId: number, source?: { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string }) => void;
  onRemoveLunch: (slot: string, empId: number) => void;
  onDropRest: (slot: string, empId: number, source?: { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string }) => void;
  onRemoveRest: (slot: string, empId: number) => void;
  canEdit: boolean;
}> = (props) => {
  return (
    <section className="min-h-0 flex flex-col rounded-xl border border-line bg-white overflow-hidden">
      <header className="shrink-0 flex items-baseline justify-between px-3 py-2 border-b border-line">
        <h3 className="text-[13px] font-bold text-ink tracking-tight">점심 · 휴게</h3>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-line">
        <BreakRow
          title="점심"
          slots={props.shiftedLunchSlots}
          assignments={props.lunchSlots}
          empById={props.empById}
          typeTones={props.typeTones}
          onDrop={props.onDropLunch}
          onRemove={props.onRemoveLunch}
          kind="lunch"
          canEdit={props.canEdit}
        />
        <BreakRow
          title="휴게"
          slots={props.shiftedRestSlots}
          assignments={props.restSlots}
          empById={props.empById}
          typeTones={props.typeTones}
          onDrop={props.onDropRest}
          onRemove={props.onRemoveRest}
          kind="rest"
          canEdit={props.canEdit}
        />
      </div>
    </section>
  );
};

const BreakRow: React.FC<{
  title: string;
  slots: string[];
  assignments: SlotMap;
  empById: Map<number, WorkerEntry>;
  typeTones: Record<string, TypeTone>;
  onDrop: (slot: string, empId: number, source?: { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string }) => void;
  onRemove: (slot: string, empId: number) => void;
  kind: "lunch" | "rest";
  canEdit: boolean;
}> = ({ title, slots, assignments, empById, typeTones, onDrop, onRemove, kind, canEdit }) => {
  const handleDrop = (e: React.DragEvent, slot: string) => {
    if (!canEdit) return;
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/x-sched-v2") || e.dataTransfer.getData("text/plain");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { source: "pool" | "zone" | "lunch" | "rest"; empId: number; zone?: ZoneRow; slot?: string };
      if (parsed.source === "pool") {
        onDrop(slot, parsed.empId);
      } else if (parsed.source === "zone" && parsed.zone && parsed.slot) {
        onDrop(slot, parsed.empId, { type: "zone", zone: parsed.zone, slot: parsed.slot });
      } else if ((parsed.source === "lunch" || parsed.source === "rest") && parsed.slot) {
        onDrop(slot, parsed.empId, { type: parsed.source, slot: parsed.slot });
      }
    } catch { /* bad payload */ }
  };
  return (
    <div className="p-3">
      <h4 className="text-[12px] font-semibold text-ink-soft mb-2 tracking-tight">{title}</h4>
      <div className="flex flex-col gap-1.5">
        {slots.map(slot => {
          const ids = assignments[slot] ?? [];
          return (
            <SlotRow
              key={`${kind}-${slot}`}
              slot={slot} ids={ids}
              empById={empById} typeTones={typeTones}
              onDropToSlot={(e) => handleDrop(e, slot)}
              onRemove={(id) => onRemove(slot, id)}
              sourceType={kind}
              canEdit={canEdit}
            />
          );
        })}
      </div>
    </div>
  );
};

const SlotRow: React.FC<{
  slot: string; ids: number[];
  empById: Map<number, WorkerEntry>; typeTones: Record<string, TypeTone>;
  onDropToSlot: (e: React.DragEvent) => void;
  onRemove: (empId: number) => void;
  sourceType: "lunch" | "rest";
  canEdit: boolean;
}> = ({ slot, ids, empById, typeTones, onDropToSlot, onRemove, sourceType, canEdit }) => {
  const [hover, setHover] = useState(false);
  return (
    <div
      onDragOver={canEdit ? (e) => { e.preventDefault(); setHover(true); } : undefined}
      onDragLeave={() => setHover(false)}
      onDrop={canEdit ? (e) => { setHover(false); onDropToSlot(e); } : undefined}
      className={`flex items-start gap-2 min-h-[32px] px-2 py-1 rounded-md border transition-colors ${hover ? "bg-sky-50 border-sky-200" : "bg-zinc-50/60 border-zinc-100"}`}
    >
      <span className="shrink-0 text-[12px] font-semibold text-ink-soft tabular-nums min-w-[42px]">{slot}</span>
      <div className="flex-1 flex flex-wrap gap-1">
        {ids.length === 0 && (
          <span className="text-[11px] text-zinc-300 py-0.5">—</span>
        )}
        {ids.map(id => (
          <SlotChip
            key={`${sourceType}-${slot}-${id}`}
            id={id} empById={empById} typeTones={typeTones}
            sourceType={sourceType} sourceSlot={slot}
            onRemove={() => onRemove(id)}
            canEdit={canEdit}
          />
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Chip · 직원 이름 + 유형 색 · drag source · X 제거
// ─────────────────────────────────────────────────────────────────────────
const SlotChip: React.FC<{
  id: number;
  empById: Map<number, WorkerEntry>;
  typeTones: Record<string, TypeTone>;
  sourceType: "zone" | "lunch" | "rest";
  sourceZone?: ZoneRow;
  sourceSlot: string;
  onRemove: () => void;
  canEdit: boolean;
}> = ({ id, empById, typeTones, sourceType, sourceZone, sourceSlot, onRemove, canEdit }) => {
  const w = empById.get(id);
  const name = w?.emp.name ?? `#${id}`;
  const type = w?.schedule.type ?? "";
  const tone = typeTones[type];
  // bg hex 적용 · V1 getTypeHex 와 동일 접근 · tone 없으면 neutral
  const bg = tone?.chipBg ?? "#eef2ff";
  const text = tone?.chipText ?? "#334155";
  const border = tone?.chipBorder ?? "#e2e8f0";

  const handleDragStart = (e: React.DragEvent) => {
    if (!canEdit) return;
    e.dataTransfer.effectAllowed = "move";
    const payload = JSON.stringify({
      source: sourceType, empId: id,
      ...(sourceType === "zone" ? { zone: sourceZone, slot: sourceSlot } : { slot: sourceSlot }),
    });
    e.dataTransfer.setData("application/x-sched-v2", payload);
    e.dataTransfer.setData("text/plain", payload);
  };

  return (
    <span
      draggable={canEdit}
      onDragStart={handleDragStart}
      className={`inline-flex items-center gap-1 h-5 pl-1.5 pr-0.5 rounded border text-[11px] font-semibold leading-none tabular-nums ${canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
      style={{ background: bg, color: text, borderColor: border }}
      title={w ? `${name} · ${type}` : `직원 #${id} · 근무 외`}
    >
      <span>{name}</span>
      {canEdit && (
        <button
          type="button"
          onClick={onRemove}
          className="h-4 w-4 inline-flex items-center justify-center rounded-full hover:bg-black/10 cursor-pointer"
          aria-label={`${name} 제거`}
          title="제거"
        >
          <X size={9} weight="bold" />
        </button>
      )}
    </span>
  );
};

export default DayAssignmentView;
