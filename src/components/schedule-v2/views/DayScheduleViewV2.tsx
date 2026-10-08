// src/components/schedule-v2/views/DayScheduleViewV2.tsx
// 2026-10-07 · 스케줄 V2 · 일간 뷰 (Phase V2-C)
//   · V1 DayTimelineModal 의 data/helper 재사용 (parseRange · pct · widthPct · SKIP_TYPES · buildTypeTones)
//     · 현황 subview = 그룹별 timeline (경량 overview · 편집 X)
//   · subview · 현황 (overview + timeline) · 배치 (V1 DayTimelineModal 재사용 · full editor)
//   · canonical 재사용 · useScheduleData · useSettings · getTypeHoursMap · isOffType
//   · V1↔V2 Day parity · 동일 helper · 동일 storage · 동일 API
// 2026-10-08 · V2 자체 UI · V1 DayTimelineModal UI 사용 중단 · DayAssignmentView 로 교체
//   · 기능 로직은 V1 재사용 (useSlotHandlers · buildAutoSuggestZoneMap · computeLunchAssignments
//     · shared/schedule/dayAssignment · /api/zone-day) · UI 는 V2 자체 (modern)
//   · 트렌드: Linear/Vercel/Notion 2026 톤 · 파스텔/이모지/배지 금지 · thin border · low shadow
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useScheduleData } from "../../SchedulePage/useScheduleData";
import { useSettings } from "../../../hooks/useSettings";
import { buildDateList, getTodayStr } from "../../SchedulePage/scheduleHelpers";
import { parseRange, pct, widthPct, buildTypeTones, DISPLAY_START, DISPLAY_END, HOUR_SLOTS } from "../../DayTimelineModal/utils";
import { SKIP_TYPES } from "../../DayTimelineModal/types";
import { DayAssignmentView } from "./day-assignment/DayAssignmentView";
import { Spinner } from "../../common/Spinner";
import { Card } from "../../common/Card";
import type { AuthSession, Employee, Schedule } from "../../../types";

interface Props {
  date: string; // YYYY-MM-DD
  onDateDelta: (daysDelta: number) => void;
  onToday: () => void;
  authSession: AuthSession | null;
  /** 2026-10-08 · reserved · 외부 jump (Month/Week → Day) · 현재 Day 는 자체 nav 사용 · 미사용 but BC */
  onJumpToDate?: (date: string) => void;
}

type DaySubView = "overview" | "assignment";

const DOW_LABELS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

export const DayScheduleViewV2: React.FC<Props> = ({ date, onDateDelta, onToday, authSession, onJumpToDate }) => {
  void onJumpToDate;
  const level = authSession?.level ?? 0;
  const canEdit = level >= 5; // V1 isAdmin 등가 · 매니저+
  const [notification, setNotification] = useState<string | null>(null);
  const showNotification = useCallback((msg: string) => {
    setNotification(msg);
    window.setTimeout(() => setNotification(null), 2000);
  }, []);

  // date 해당 month 로 useScheduleData 호출 (canonical fetch)
  const dateObj = useMemo(() => new Date(date), [date]);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;

  const {
    employees, isLoading, error,
    fetchScheduleData, isInitialFetchRef,
  } = useScheduleData(year, month, showNotification);
  const { scheduleTypes, positions } = useSettings();
  const todayStr = getTodayStr();

  // 2026-10-08 · E-HOTFIX · V1 SchedulePage 와 동일한 caller-driven fetch trigger
  //   · useScheduleData 는 자동 fetch 하지 않음 (caller-driven) · 누락 시 isLoading 영구 true
  //   · DayView 는 date 가 속한 month 단위 fetch (hook 내부 월 단위 캐싱 · 같은 월 안 날짜 변경은 skip)
  const dateList = useMemo(() => buildDateList(year, month), [year, month]);
  useEffect(() => {
    const silent = !isInitialFetchRef.current;
    isInitialFetchRef.current = false;
    fetchScheduleData(dateList, silent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

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

      {/* Content · subview 분기
          · 현황 (경량 overview · timeline per group)
          · 배치 (V2 자체 DayAssignmentView · 기능은 V1 helpers 재사용 · UI 신규) */}
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
        <DayAssignmentView
          date={date}
          employees={employees}
          scheduleTypes={scheduleTypes}
          canEdit={canEdit}
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


export default DayScheduleViewV2;
