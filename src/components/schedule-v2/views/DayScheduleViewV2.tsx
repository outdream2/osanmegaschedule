// src/components/schedule-v2/views/DayScheduleViewV2.tsx
// 2026-10-07 · 스케줄 V2 · 일간 뷰 (Phase V2-C)
//   · V1 DayTimelineModal 의 data/helper 재사용 (parseRange · pct · widthPct · SKIP_TYPES · buildTypeTones)
//     · modal 띄우지 않고 · full page workspace 로 승격
//     · V1 modal 은 그대로 유지 (삭제 안 함) · V2 는 기존 helper 만 재사용
//   · subview · 현황 (overview + timeline) · 배치 (zone assignment · V2-C2 완료 · shared/schedule/dayAssignment)
//   · canonical 재사용 · useScheduleData · useSettings · getTypeHoursMap · isOffType
//   · V1↔V2 Day parity · 동일 helper 사용 · schedule row 는 동일 소스
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { useScheduleData } from "../../SchedulePage/useScheduleData";
import { useSettings } from "../../../hooks/useSettings";
import { getTodayStr } from "../../SchedulePage/scheduleHelpers";
import { parseRange, pct, widthPct, buildTypeTones, DISPLAY_START, DISPLAY_END, HOUR_SLOTS, LUNCH_SLOTS, REST_SLOTS, shiftSlot } from "../../DayTimelineModal/utils";
import { SKIP_TYPES, ZONE_ROWS, type ZoneRow, type TypeTone } from "../../DayTimelineModal/types";
import { Spinner } from "../../common/Spinner";
import { Card } from "../../common/Card";
import type { AuthSession, Employee, Schedule } from "../../../types";
import {
  loadDayAssignmentSnapshot,
  saveZoneSlots, saveLunchSlots, saveRestSlots,
  type DayAssignmentSnapshot,
} from "../../../shared/schedule/dayAssignment";
import { api } from "../../../lib/apiClient";

interface Props {
  date: string; // YYYY-MM-DD
  onDateDelta: (daysDelta: number) => void;
  onToday: () => void;
  authSession: AuthSession | null;
}

type DaySubView = "overview" | "assignment";

const DOW_LABELS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

export const DayScheduleViewV2: React.FC<Props> = ({ date, onDateDelta, onToday, authSession }) => {
  void authSession;
  const [notification, setNotification] = useState<string | null>(null);
  const showNotification = useCallback((msg: string) => {
    setNotification(msg);
    window.setTimeout(() => setNotification(null), 2000);
  }, []);

  // date 해당 month 로 useScheduleData 호출 (canonical fetch)
  const dateObj = useMemo(() => new Date(date), [date]);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;

  const { employees, isLoading, error } = useScheduleData(year, month, showNotification);
  const { scheduleTypes, positions } = useSettings();
  const todayStr = getTodayStr();

  // subview
  const [subview, setSubview] = useState<DaySubView>("overview");

  // 해당 날짜의 근무 (OFF 제외 + schedule 존재) 만 추출
  //   · (employee, schedule) pair · V1 과 동일하게 SKIP_TYPES 로 OFF 제외
  const workingToday = useMemo(() => {
    const list: Array<{ emp: Employee; schedule: Schedule }> = [];
    for (const emp of employees) {
      const s = emp.schedules?.find(x => x.date === date);
      if (!s || !s.type) continue;
      if (SKIP_TYPES.has(s.type)) continue;
      list.push({ emp, schedule: s });
    }
    return list;
  }, [employees, date]);

  // typeTones · scheduleTypes 기반 색상
  const typeTones = useMemo(() => buildTypeTones(scheduleTypes), [scheduleTypes]);

  // position 기반 grouping · settings.positions 순회 · canonical taxonomy
  //   · UNMAPPED (positions 목록에 없는 position) · 별도 "UNMAPPED" 그룹 (관측 가능 · 기타로 자동 흡수 X)
  const grouped = useMemo(() => {
    const groups = new Map<string, Array<{ emp: Employee; schedule: Schedule }>>();
    const knownPositions = new Set(positions ?? []);
    for (const row of workingToday) {
      const pos = String(row.emp.position ?? "").trim();
      const key = knownPositions.has(pos) ? pos : (pos ? pos : "UNMAPPED");
      // settings 에 없는 position 은 UNMAPPED (사용자 지시: 기타 자동 매핑 X)
      const finalKey = knownPositions.has(pos) ? pos : (pos && knownPositions.size > 0 ? `UNMAPPED: ${pos}` : (pos || "UNMAPPED"));
      void key;
      if (!groups.has(finalKey)) groups.set(finalKey, []);
      groups.get(finalKey)!.push(row);
    }
    // 정렬 · settings.positions 순 · UNMAPPED 끝
    const sorted: Array<{ position: string; rows: Array<{ emp: Employee; schedule: Schedule }> }> = [];
    for (const p of positions ?? []) {
      if (groups.has(p)) sorted.push({ position: p, rows: groups.get(p)! });
    }
    for (const [k, v] of groups) {
      if (!(positions ?? []).includes(k)) sorted.push({ position: k, rows: v });
    }
    return sorted;
  }, [workingToday, positions]);

  // Summary · 그룹별 count · OFF 제외된 workingToday 기반
  const summary = useMemo(() => {
    const total = workingToday.length;
    const perGroup = grouped.map(g => ({ label: g.position, count: g.rows.length }));
    return { total, perGroup };
  }, [workingToday, grouped]);

  const dowLabel = DOW_LABELS[dateObj.getDay()];
  const isToday = date === todayStr;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      {/* Date header */}
      <div className="flex flex-wrap items-center gap-2 py-2 border-b border-line">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onDateDelta(-1)}
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-line bg-white hover:bg-zinc-50 text-ink transition cursor-pointer"
            aria-label="전날"
            title="전날"
          >
            <CaretLeft size={14} weight="bold" />
          </button>
          <div className="min-w-[200px] text-center text-[16px] font-bold text-ink tabular-nums tracking-tight">
            {year}년 {month}월 {dateObj.getDate()}일 <span className="text-ink-soft font-semibold">{dowLabel}</span>
          </div>
          <button
            type="button"
            onClick={() => onDateDelta(1)}
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-line bg-white hover:bg-zinc-50 text-ink transition cursor-pointer"
            aria-label="다음날"
            title="다음날"
          >
            <CaretRight size={14} weight="bold" />
          </button>
          <button
            type="button"
            onClick={onToday}
            disabled={isToday}
            className="ml-1 h-8 px-3 rounded-lg border border-line bg-white hover:bg-brand-tint/50 hover:border-brand-deep/30 text-ink text-[13px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="오늘로"
          >
            오늘
          </button>
        </div>

        {/* summary pills · canonical 계산만 */}
        <div className="flex items-center gap-2 text-[13px] text-ink-soft tabular-nums">
          <span className="font-semibold text-ink">근무 {summary.total}</span>
          {summary.perGroup.map(g => (
            <React.Fragment key={g.label}>
              <span className="text-zinc-300">·</span>
              <span>{g.label} {g.count}</span>
            </React.Fragment>
          ))}
        </div>

        {/* subview · segmented control (현황 | 배치) */}
        <div className="ml-auto inline-flex rounded-lg border border-line bg-white overflow-hidden">
          {([
            { key: "overview", label: "현황" },
            { key: "assignment", label: "배치" },
          ] as const).map(opt => {
            const active = subview === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSubview(opt.key)}
                className={`h-8 px-3 text-[13px] font-semibold transition cursor-pointer ${
                  active ? "bg-brand-deep text-white" : "text-ink-soft hover:text-ink hover:bg-zinc-50"
                }`}
                aria-pressed={active}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {notification && (
        <div className="shrink-0 text-[13px] text-brand-deep bg-brand-tint/40 border border-brand-deep/20 rounded-md px-3 py-1.5">
          {notification}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center py-16">
          <Spinner size={16} tone="brand" label="스케줄 불러오는 중..." />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center py-16 text-[13px] text-rose-600">
          로드 실패 · {error}
        </div>
      ) : subview === "overview" ? (
        <DayOverview grouped={grouped} typeTones={typeTones} />
      ) : (
        <DayAssignment
          date={date}
          workingToday={workingToday}
          typeTones={typeTones}
        />
      )}
    </div>
  );
};

// ─── 현황 · timeline per 직원 (그룹별) ─────────────────────────────────
const DayOverview: React.FC<{
  grouped: Array<{ position: string; rows: Array<{ emp: Employee; schedule: Schedule }> }>;
  typeTones: ReturnType<typeof buildTypeTones>;
}> = ({ grouped, typeTones }) => {
  if (grouped.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-16 text-[13px] text-ink-soft">
        해당 날짜 근무 직원 없음
      </div>
    );
  }
  return (
    <Card variant="sm" padding="none" rounded="xl" className="flex-1 min-h-0 overflow-auto">
      <div className="flex flex-col divide-y divide-line">
        {grouped.map(group => (
          <section key={`g-${group.position}`} className="p-3">
            <div className="flex items-baseline gap-2 mb-2">
              <h3 className="text-[14px] font-bold text-ink tracking-tight">{group.position}</h3>
              <span className="text-[12px] text-ink-soft tabular-nums">· {group.rows.length}명</span>
            </div>
            {/* 시간 축 · 10:00~22:00 (V1 과 동일 DISPLAY_START/END) */}
            <TimelineAxis />
            <div className="flex flex-col gap-1 mt-1.5">
              {group.rows.map(({ emp, schedule }) => {
                const range = parseRange(schedule.workingHours ?? "");
                const typeKey = schedule.type ?? "";
                const tone = typeTones[typeKey];
                const barColor = tone?.bg ?? "#CBD5E1";
                return (
                  <div
                    key={`r-${emp.id}`}
                    className="flex items-center gap-2 min-h-[26px]"
                  >
                    <div className="w-28 shrink-0 text-[13px] font-semibold text-ink text-right pr-2 whitespace-nowrap">
                      {emp.name}
                    </div>
                    <div className="relative flex-1 h-5 bg-zinc-50 rounded overflow-hidden">
                      {range ? (
                        <div
                          className="absolute top-0 bottom-0 rounded flex items-center px-1.5 text-[11px] font-semibold text-white tabular-nums whitespace-nowrap"
                          style={{
                            left: `${pct(range.start)}%`,
                            width: `${widthPct(range.start, range.end)}%`,
                            background: barColor,
                          }}
                          title={`${schedule.type} · ${schedule.workingHours}`}
                        >
                          <span className="truncate">{schedule.type}</span>
                        </div>
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center text-[11px] text-ink-soft">{schedule.type}</span>
                      )}
                    </div>
                    <div className="w-28 shrink-0 text-[11px] text-ink-soft tabular-nums whitespace-nowrap">
                      {schedule.workingHours || "-"}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Card>
  );
};

const TimelineAxis: React.FC = () => {
  return (
    <div className="flex items-center gap-2 h-5">
      <div className="w-28 shrink-0" aria-hidden />
      <div className="relative flex-1 h-5">
        {HOUR_SLOTS.map((label) => {
          const [hh] = label.split(":");
          const min = parseInt(hh, 10) * 60;
          const left = `${((min - DISPLAY_START) / (DISPLAY_END - DISPLAY_START)) * 100}%`;
          return (
            <div key={label} className="absolute top-0 bottom-0 border-l border-zinc-100" style={{ left }}>
              <span className="absolute -top-3 left-1 text-[10px] text-ink-soft tabular-nums">{hh}</span>
            </div>
          );
        })}
      </div>
      <div className="w-28 shrink-0" aria-hidden />
    </div>
  );
};

// ─── 배치 (zone/lunch/rest assignment · read + remove) ──────────────────────
//   · 2026-10-07 · V2-C2 · V1 (DayTimelineModal) 과 동일 localStorage/API 소스 사용
//     · load/save = shared/schedule/dayAssignment · V1/V2 parity
//     · identity = employees.id (number) · 기존 convention 동일
//     · drag/drop · auto-suggest · 확정 저장은 V1 모달 유지 (V2-E or later 승격)
//     · 여기서는 현황 표시 + chip X 로 remove 만 지원
//
//   · 디자인 · 좌: 구역(ZONE_ROWS × 10:00~19:30 20슬롯) · 중: 점심 · 우: 휴게
//   · 각 cell = 할당된 직원 chip 리스트 (name + 유형 색상) · X 로 제거
//   · 서버 autosave debounced 1.5s · V1 /api/zone-day/{date} 와 동일 payload

const ZONE_HOUR_SLOTS = HOUR_SLOTS.slice(0, -3); // 10:00..19:00 (10 hours)
function subSlotKey(hourSlot: string, minuteOffset: 0 | 30): string {
  const h = parseInt(hourSlot.split(":")[0], 10);
  return `${String(h).padStart(2, "0")}:${minuteOffset === 0 ? "00" : "30"}`;
}

const DayAssignment: React.FC<{
  date: string;
  workingToday: Array<{ emp: Employee; schedule: Schedule }>;
  typeTones: Record<string, TypeTone>;
}> = ({ date, workingToday, typeTones }) => {
  const [snap, setSnap] = useState<DayAssignmentSnapshot>(() => loadDayAssignmentSnapshot(date));

  // Reload on date change
  useEffect(() => { setSnap(loadDayAssignmentSnapshot(date)); }, [date]);

  // Debounced server autosave (V1 와 동일 payload shape)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAutoSave = useCallback((next: DayAssignmentSnapshot) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      api.put(`/api/zone-day/${date}`, {
        zone_slots: next.zone,
        lunch_slots: next.lunch,
        rest_slots: next.rest,
        lunch_offset: next.lunchOffset,
        rest_offset: next.restOffset,
        lunch_interval: next.lunchInterval,
        rest_interval: next.restInterval,
        lunch_count: next.lunchCount,
        rest_count: next.restCount,
        is_confirmed: false,
      }).catch(() => { /* fire-and-forget · V1 동일 */ });
    }, 1500);
  }, [date]);

  useEffect(() => () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
  }, []);

  // 직원 lookup · workingToday 는 OFF 제외된 리스트 · 할당된 직원이 workingToday 에
  //   없는 경우 (예: 과거 schedule 삭제) 는 "이름없음" 금지 (대원칙 · fallback 금지) ·
  //   직원 id 그대로 "#id" 로 노출하여 데이터 깨짐을 가시화
  const empById = useMemo(() => {
    const m = new Map<number, { emp: Employee; schedule: Schedule }>();
    for (const w of workingToday) m.set(w.emp.id, w);
    return m;
  }, [workingToday]);

  // Shifted lunch/rest slots (interval 적용 전 · V1 과 동일)
  const shiftedLunchSlots = useMemo(() => {
    const all = LUNCH_SLOTS.map(s => shiftSlot(s, snap.lunchOffset));
    if (snap.lunchInterval === 90) return all.filter((_, i) => i % 3 === 0);
    if (snap.lunchInterval === 60) return all.filter((_, i) => i % 2 === 0);
    return all;
  }, [snap.lunchOffset, snap.lunchInterval]);
  const shiftedRestSlots = useMemo(() => {
    const all = REST_SLOTS.map(s => shiftSlot(s, snap.restOffset));
    if (snap.restInterval === 90) return all.filter((_, i) => i % 3 === 0);
    if (snap.restInterval === 60) return all.filter((_, i) => i % 2 === 0);
    return all;
  }, [snap.restOffset, snap.restInterval]);

  const removeFromZone = useCallback((zone: ZoneRow, slot: string, empId: number) => {
    setSnap(prev => {
      const z = { ...(prev.zone[zone] ?? {}) };
      z[slot] = (z[slot] ?? []).filter(id => id !== empId);
      const nextZone = { ...prev.zone, [zone]: z };
      saveZoneSlots(date, nextZone);
      const next = { ...prev, zone: nextZone };
      scheduleAutoSave(next);
      return next;
    });
  }, [date, scheduleAutoSave]);

  const removeFromLunch = useCallback((slot: string, empId: number) => {
    setSnap(prev => {
      const nextLunch = { ...prev.lunch, [slot]: (prev.lunch[slot] ?? []).filter(id => id !== empId) };
      saveLunchSlots(date, nextLunch);
      const next = { ...prev, lunch: nextLunch };
      scheduleAutoSave(next);
      return next;
    });
  }, [date, scheduleAutoSave]);

  const removeFromRest = useCallback((slot: string, empId: number) => {
    setSnap(prev => {
      const nextRest = { ...prev.rest, [slot]: (prev.rest[slot] ?? []).filter(id => id !== empId) };
      saveRestSlots(date, nextRest);
      const next = { ...prev, rest: nextRest };
      scheduleAutoSave(next);
      return next;
    });
  }, [date, scheduleAutoSave]);

  const assignedCount = useMemo(() => {
    let n = 0;
    for (const zone of ZONE_ROWS) {
      for (const ids of Object.values(snap.zone[zone] ?? {})) n += ids.length;
    }
    return n;
  }, [snap.zone]);

  return (
    <Card variant="sm" padding="none" rounded="xl" className="flex-1 min-h-0 overflow-auto">
      <div className="flex flex-col divide-y divide-line">
        {/* 안내 · V2 는 remove-only · 자세한 drag/drop · 자동배치 · 확정은 V1 모달 */}
        <div className="px-3 py-2 text-[12px] text-ink-soft bg-brand-tint/20 flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">배치 현황</span>
          <span>· 구역 {assignedCount}건</span>
          <span>· 점심 {Object.values(snap.lunch).reduce((n, ids) => n + ids.length, 0)}명</span>
          <span>· 휴게 {Object.values(snap.rest).reduce((n, ids) => n + ids.length, 0)}명</span>
          <span className="ml-auto text-[11px] text-ink-soft">
            자동배치 · 드래그 · 확정은 기존 "스케줄 → Daily Coverage" 모달 사용
          </span>
        </div>

        {/* 구역 · ZONE_ROWS × 20 subslots */}
        <section className="p-3">
          <h3 className="text-[14px] font-bold text-ink mb-2 tracking-tight">구역 배치</h3>
          <ZoneAssignmentGrid
            zone={snap.zone}
            empById={empById}
            typeTones={typeTones}
            onRemove={removeFromZone}
          />
        </section>

        {/* 점심 · 휴게 */}
        <section className="p-3 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <h3 className="text-[14px] font-bold text-ink mb-2 tracking-tight">점심 배정 ({snap.lunchInterval}분 · {snap.lunchCount}명/슬롯)</h3>
            <SlotList
              slots={shiftedLunchSlots}
              assignments={snap.lunch}
              empById={empById}
              typeTones={typeTones}
              onRemove={removeFromLunch}
            />
          </div>
          <div className="hidden sm:block w-px bg-line" />
          <div className="flex-1">
            <h3 className="text-[14px] font-bold text-ink mb-2 tracking-tight">휴게 배정 ({snap.restInterval}분 · {snap.restCount}명/슬롯)</h3>
            <SlotList
              slots={shiftedRestSlots}
              assignments={snap.rest}
              empById={empById}
              typeTones={typeTones}
              onRemove={removeFromRest}
            />
          </div>
        </section>
      </div>
    </Card>
  );
};

const ZoneAssignmentGrid: React.FC<{
  zone: DayAssignmentSnapshot["zone"];
  empById: Map<number, { emp: Employee; schedule: Schedule }>;
  typeTones: Record<string, TypeTone>;
  onRemove: (zone: ZoneRow, slot: string, empId: number) => void;
}> = ({ zone, empById, typeTones, onRemove }) => {
  const hasAny = ZONE_ROWS.some(z => Object.values(zone[z] ?? {}).some(ids => ids.length > 0));
  if (!hasAny) {
    return (
      <div className="text-[12px] text-ink-soft py-6 text-center">구역 배정 없음 · "스케줄 → Daily Coverage" 모달에서 자동배치/드래그로 배정</div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white text-left p-1.5 font-semibold text-ink w-20 shrink-0 border-b border-line">구역</th>
            {ZONE_HOUR_SLOTS.map(h => (
              <th key={`th-${h}`} className="p-1.5 font-semibold text-ink-soft text-center min-w-[110px] border-b border-line">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ZONE_ROWS.map(zrow => (
            <tr key={`zr-${zrow}`} className="align-top">
              <td className="sticky left-0 bg-white p-1.5 font-bold text-ink text-[13px] whitespace-nowrap border-b border-line">{zrow}</td>
              {ZONE_HOUR_SLOTS.map(h => {
                const key00 = subSlotKey(h, 0);
                const key30 = subSlotKey(h, 30);
                const ids00 = zone[zrow]?.[key00] ?? [];
                const ids30 = zone[zrow]?.[key30] ?? [];
                return (
                  <td key={`c-${zrow}-${h}`} className="p-1 align-top border-b border-line">
                    <div className="flex flex-col gap-1">
                      <SubSlotCell ids={ids00} slot={key00} empById={empById} typeTones={typeTones}
                        onRemove={(empId) => onRemove(zrow, key00, empId)} />
                      <SubSlotCell ids={ids30} slot={key30} empById={empById} typeTones={typeTones}
                        onRemove={(empId) => onRemove(zrow, key30, empId)} />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const SubSlotCell: React.FC<{
  ids: number[];
  slot: string;
  empById: Map<number, { emp: Employee; schedule: Schedule }>;
  typeTones: Record<string, TypeTone>;
  onRemove: (empId: number) => void;
}> = ({ ids, slot, empById, typeTones, onRemove }) => {
  return (
    <div className="min-h-[22px] flex flex-wrap items-center gap-1">
      <span className="text-[10px] text-ink-soft tabular-nums shrink-0 w-10">{slot}</span>
      {ids.length === 0 ? (
        <span className="text-[11px] text-zinc-300">—</span>
      ) : (
        ids.map(id => (
          <EmployeeChip key={`chip-${slot}-${id}`} id={id} empById={empById} typeTones={typeTones} onRemove={onRemove} />
        ))
      )}
    </div>
  );
};

const SlotList: React.FC<{
  slots: string[];
  assignments: Record<string, number[]>;
  empById: Map<number, { emp: Employee; schedule: Schedule }>;
  typeTones: Record<string, TypeTone>;
  onRemove: (slot: string, empId: number) => void;
}> = ({ slots, assignments, empById, typeTones, onRemove }) => {
  return (
    <ul className="flex flex-col divide-y divide-line border border-line rounded-lg overflow-hidden">
      {slots.map(slot => {
        const ids = assignments[slot] ?? [];
        return (
          <li key={`sl-${slot}`} className="flex items-center gap-2 px-2 py-1.5 min-h-[32px]">
            <span className="text-[12px] font-semibold text-ink tabular-nums w-12 shrink-0">{slot}</span>
            {ids.length === 0 ? (
              <span className="text-[11px] text-zinc-300">—</span>
            ) : (
              <div className="flex flex-wrap items-center gap-1">
                {ids.map(id => (
                  <EmployeeChip key={`sl-chip-${slot}-${id}`} id={id} empById={empById} typeTones={typeTones}
                    onRemove={(empId) => onRemove(slot, empId)} />
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

const EmployeeChip: React.FC<{
  id: number;
  empById: Map<number, { emp: Employee; schedule: Schedule }>;
  typeTones: Record<string, TypeTone>;
  onRemove: (empId: number) => void;
}> = ({ id, empById, typeTones, onRemove }) => {
  const row = empById.get(id);
  const name = row ? row.emp.name : `#${id}`;
  const type = row?.schedule.type ?? "";
  const tone = typeTones[type];
  const bg = tone?.chipBg ?? "#f1f5f9";
  const text = tone?.chipText ?? "#334155";
  const border = tone?.chipBorder ?? "#e2e8f0";
  return (
    <span
      className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap border"
      style={{ background: bg, color: text, borderColor: border }}
      title={row ? `${name} · ${type}` : `직원 #${id} · workingToday 외`}
    >
      <span>{name}</span>
      <button
        type="button"
        onClick={() => onRemove(id)}
        className="h-4 w-4 inline-flex items-center justify-center rounded-full hover:bg-black/10 cursor-pointer"
        aria-label={`${name} 제거`}
        title="제거"
      >
        <X size={10} weight="bold" />
      </button>
    </span>
  );
};

export default DayScheduleViewV2;
