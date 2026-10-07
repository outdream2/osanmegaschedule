// src/components/schedule-v2/views/DayScheduleViewV2.tsx
// 2026-10-07 · 스케줄 V2 · 일간 뷰 (Phase V2-C)
//   · V1 DayTimelineModal 의 data/helper 재사용 (parseRange · pct · widthPct · SKIP_TYPES · buildTypeTones)
//     · modal 띄우지 않고 · full page workspace 로 승격
//     · V1 modal 은 그대로 유지 (삭제 안 함) · V2 는 기존 helper 만 재사용
//   · subview · 현황 (overview + timeline) · 배치 (zone assignment · V2-E 로 defer · placeholder)
//   · canonical 재사용 · useScheduleData · useSettings · getTypeHoursMap · isOffType
//   · V1↔V2 Day parity · 동일 helper 사용 · schedule row 는 동일 소스
import React, { useCallback, useMemo, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useScheduleData } from "../../SchedulePage/useScheduleData";
import { useSettings } from "../../../hooks/useSettings";
import { getTodayStr, getTypeHoursMap } from "../../SchedulePage/scheduleHelpers";
import { parseRange, pct, widthPct, buildTypeTones, DISPLAY_START, DISPLAY_END, HOUR_SLOTS } from "../../DayTimelineModal/utils";
import { SKIP_TYPES } from "../../DayTimelineModal/types";
import { Spinner } from "../../common/Spinner";
import { Card } from "../../common/Card";
import type { AuthSession, Employee, Schedule } from "../../../types";

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
        <DayAssignmentPlaceholder />
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

// ─── 배치 (zone assignment) · Phase V2-C2 또는 V2-E 에서 구현 ────────
//   · V1 ZoneSection + localStorage persistence · 복잡 · 별도 Phase 로 분리
const DayAssignmentPlaceholder: React.FC = () => {
  return (
    <Card variant="sm" padding="md" rounded="xl" className="flex-1 min-h-0 overflow-auto">
      <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
        <div className="text-[16px] font-semibold text-ink">배치 뷰 준비 중</div>
        <div className="text-[13px] text-ink-soft">
          V1 Daily Coverage 의 zone/lunch/rest 배치 기능 승격은
          <br />다음 Phase (V2-C2 / V2-E) 에서 진행됩니다.
        </div>
        <div className="mt-2 text-[12px] text-ink-soft">
          그 전까지는 기존 "스케줄" 메뉴의 Daily Timeline 모달을 사용해 주세요.
        </div>
      </div>
    </Card>
  );
};

export default DayScheduleViewV2;
