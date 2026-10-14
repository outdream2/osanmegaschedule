// src/components/schedule-v2/views/employee/EmployeeBulkPanel.tsx
// 2026-10-07 · 스케줄 V2 · 직원별 일괄등록 panel (Phase V2-D)
//   · 캐노니컬 write · POST /api/schedules/batch (V1 SchedulePage · BulkTab 과 동일 endpoint)
//   · 날짜 선택 (해당 월 · 요일 단축선택) · schedule type · workingHours · memo
//   · lock · canEdit=false 일 때 저장 비활성 · server guard 가 최종 authority
//   · V2 전용 bulk API 생성 X · V1 과 동일 contract
import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Check, X as XIcon } from "@phosphor-icons/react";
import { api } from "../../../../lib/apiClient";
import type { Employee } from "../../../../types";
import type { ScheduleTypeEntry } from "../../../../hooks/useSettings";
import { getTypeHoursMap, buildDateList, weekdays } from "../../../SchedulePage/scheduleHelpers";
import { Card } from "../../../common/Card";

interface Props {
  employee: Employee;
  year: number;
  month: number;
  scheduleTypes: ScheduleTypeEntry[];
  isLocked: boolean;
  canEdit: boolean;
  showNotification: (msg: string, type?: "success" | "error") => void;
  onApplied: () => void;
}

export const EmployeeBulkPanel: React.FC<Props> = ({
  employee, year, month, scheduleTypes, isLocked, canEdit, showNotification, onApplied,
}) => {
  const dateList = useMemo(() => buildDateList(year, month), [year, month]);
  // 2026-10-12 · 사용자 지시 · 오늘 날짜 붉은 테두리용 YYYY-MM-DD 상수
  const todayYmd = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [type, setType] = useState<string>("");
  const [workingHours, setWorkingHours] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const typeHoursMap = useMemo(
    () => getTypeHoursMap(employee.position ?? "", employee.employmentType ?? "", scheduleTypes),
    [employee, scheduleTypes],
  );

  // 2026-10-12 · 사용자 지시 · "근무조건이 적용된 날짜는 근무유형 표시" · 기존 schedule fetch
  const [existingByDate, setExistingByDate] = useState<Map<string, { type: string; workingHours?: string }>>(new Map());
  const typeColorMap = useMemo(() => {
    const m = new Map<string, string | undefined>();
    for (const e of scheduleTypes) m.set(e.type, e.color);
    return m;
  }, [scheduleTypes]);

  const loadExisting = useCallback(async () => {
    try {
      const { data } = await api.get<{ employees?: Array<{ id: number; schedules?: Array<{ date: string; type?: string; workingHours?: string }> }> }>(
        `/api/schedules?year=${year}&month=${month}`,
      );
      const emps = Array.isArray(data?.employees) ? data!.employees! : [];
      const me = emps.find(e => e.id === employee.id);
      const map = new Map<string, { type: string; workingHours?: string }>();
      for (const s of me?.schedules ?? []) {
        const t = String(s?.type ?? "").trim();
        if (!t || !s?.date) continue;
        map.set(String(s.date), { type: t, workingHours: s.workingHours });
      }
      setExistingByDate(map);
    } catch { setExistingByDate(new Map()); }
  }, [employee.id, year, month]);

  useEffect(() => { void loadExisting(); }, [loadExisting]);

  const toggleDate = (d: string) => {
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };
  // 2026-10-08 · 사용자 지시 · 평일/주말 shortcut 제거 · 요일별 (월·화·수·목·금·토·일) toggle 지원
  //   · 각 요일 click → 해당 요일 날짜만 selectedDates 추가/제거 (toggle)
  const toggleDow = (targetDow: number) => {
    const dowDates = dateList.filter(d => new Date(d).getDay() === targetDow);
    setSelectedDates(prev => {
      const next = new Set(prev);
      // 해당 요일 날짜가 전부 선택되어 있으면 전체 해제, 아니면 전체 선택
      const allSelected = dowDates.every(d => next.has(d));
      for (const d of dowDates) {
        if (allSelected) next.delete(d); else next.add(d);
      }
      return next;
    });
  };
  // 특정 요일 전체가 선택되었는지 (버튼 active 표시용)
  const isDowAllSelected = (targetDow: number): boolean => {
    const dowDates = dateList.filter(d => new Date(d).getDay() === targetDow);
    if (dowDates.length === 0) return false;
    return dowDates.every(d => selectedDates.has(d));
  };
  const selectAll = () => setSelectedDates(new Set(dateList));
  const clearAll = () => setSelectedDates(new Set());

  const onTypeChange = (t: string) => {
    setType(t);
    // 기본 workingHours 자동 매핑 · 사용자가 수동 수정 가능
    setWorkingHours(typeHoursMap[t] ?? "");
  };

  const handleSave = async () => {
    if (!canEdit) {
      showNotification("확정된 월은 수정할 수 없습니다.", "error");
      return;
    }
    if (selectedDates.size === 0 || !type) {
      showNotification("날짜와 근무유형을 선택하세요.", "error");
      return;
    }
    setSaving(true);
    try {
      const items = Array.from(selectedDates).map(date => ({
        employeeId: employee.id,
        date,
        type,
        workingHours,
        actualHours: workingHours,
        memo,
      }));
      // 캐노니컬 · POST /api/schedules/batch (V1 과 동일)
      await api.post("/api/schedules/batch", { items });
      showNotification(`${items.length}건 일괄 등록 완료`);
      setSelectedDates(new Set());
      setMemo("");
      onApplied();
      // 2026-10-12 · 사용자 지시 · 저장 후 달력 셀 근무유형 라벨 즉시 refetch
      void loadExisting();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "네트워크 오류";
      showNotification(`일괄 등록 실패 · ${msg}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    // 2026-10-12 · 사용자 지시 · 달력 아래 shrink-0 wrapper 안에서 height=0 bug fix
    //   · flex-1 min-h-0 overflow-auto → w-full 자연 height (shrink-0 환경 호환)
    //   · bulk 단독 subview 도 natural height 로 작동 (parent flex-col 안에서 자체 content height)
    // 2026-10-12 · 사용자 지시 재조정 · "2단 좌/우를 담고 있는 카드가 좁음" ·
    //   · max-w-[560px] 제거 → w-full 전체 폭 활용 (2단 좌 220px + 우 flex-1 확보)
    // 2026-10-12 · 사용자 "화면 넘어가버려" · min-w-0 + overflow-hidden 추가 (가로 overflow 방지)
    <Card variant="sm" padding="md" rounded="xl" className="w-full min-w-0 max-w-full overflow-hidden">
      {isLocked && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[13px] font-semibold">
          <span>이 월({month}월)은 확정됨 · 편집 불가</span>
        </div>
      )}
      {/* 2026-10-08 · 사용자 지시 · 저장 bar 를 상단에 노출 (sticky · 스크롤 시에도 가시) */}
      <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 px-4 py-2.5 bg-white/95 backdrop-blur border-b border-line flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canEdit || saving || selectedDates.size === 0 || !type}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand-deep text-white text-[13px] font-semibold hover:bg-[#0d3a5c] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Check size={14} weight="bold" /> {saving ? "저장 중..." : `${selectedDates.size}건 저장`}
        </button>
        <button
          type="button"
          onClick={clearAll}
          disabled={saving || selectedDates.size === 0}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white text-ink border border-zinc-200 text-[13px] font-semibold hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <XIcon size={14} weight="bold" /> 선택 해제
        </button>
        {selectedDates.size > 0 && !type && (
          <span className="ml-auto text-[12px] font-semibold text-amber-700">근무유형 선택 필요</span>
        )}
      </div>
      {/* 2026-10-12 · 사용자 "근무조건 폭 더 축소 · 달력 더 넓게" · grid-cols-4 (1:3) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 items-start min-w-0">
        {/* 섹션 1 · 근무 조건 (좌 · 1/4) */}
        <section className="lg:col-span-1 min-w-0 overflow-hidden">
          <h3 className="text-[14px] font-bold text-ink mb-2">① 근무 조건</h3>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-[14px]">
              <span className="w-20 shrink-0 text-ink-soft">근무유형</span>
              <select
                value={type}
                onChange={e => onTypeChange(e.target.value)}
                className="flex-1 h-9 px-2 rounded-md border border-zinc-200 bg-white text-[14px] cursor-pointer"
                disabled={!canEdit || scheduleTypes.length === 0}
              >
                <option value="">선택</option>
                {scheduleTypes.map(entry => (
                  <option key={entry.type} value={entry.type}>
                    {entry.type} {typeHoursMap[entry.type] ? `(${typeHoursMap[entry.type]})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[14px]">
              <span className="w-20 shrink-0 text-ink-soft">근무시간</span>
              <input
                type="text"
                value={workingHours}
                onChange={e => setWorkingHours(e.target.value)}
                placeholder="예: 09:30-18:30"
                className="flex-1 h-9 px-2 rounded-md border border-zinc-200 bg-white text-[14px]"
                disabled={!canEdit}
              />
            </label>
            <label className="flex items-start gap-2 text-[14px]">
              <span className="w-20 shrink-0 text-ink-soft mt-2">메모</span>
              <textarea
                value={memo}
                onChange={e => setMemo(e.target.value)}
                rows={2}
                className="flex-1 px-2 py-1.5 rounded-md border border-zinc-200 bg-white text-[14px]"
                disabled={!canEdit}
              />
            </label>
          </div>
        </section>

        {/* 섹션 2 · 날짜 선택 (우 · 3/4) · 달력 더 넓게 · min-w-0 로 overflow 차단 */}
        <section className="lg:col-span-3 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-baseline gap-2">
              <h3 className="text-[14px] font-bold text-ink">② 날짜 선택</h3>
              <span className="text-[14px] font-bold text-brand-deep tabular-nums tracking-tight">
                {year}년 {month}월
              </span>
            </div>
            <div className="flex items-center gap-1 text-[12px]">
              <button type="button" onClick={selectAll} className="h-7 px-2 rounded-md border border-zinc-200 bg-white hover:bg-sky-50 text-ink cursor-pointer">전체</button>
              <button type="button" onClick={clearAll} className="h-7 px-2 rounded-md border border-zinc-200 bg-white hover:bg-zinc-100 text-ink cursor-pointer">해제</button>
            </div>
          </div>

          {/* 2026-10-08 · 사용자 지시 · 명시적 "요일 전체 선택" row 분리 · 요일 button click → 해당 요일 toggle */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[12px] font-semibold text-ink-soft shrink-0">요일 선택</span>
            <div className="flex items-center gap-1">
              {([
                { dow: 0, label: "일" },
                { dow: 1, label: "월" },
                { dow: 2, label: "화" },
                { dow: 3, label: "수" },
                { dow: 4, label: "목" },
                { dow: 5, label: "금" },
                { dow: 6, label: "토" },
              ]).map(({ dow, label }) => {
                const active = isDowAllSelected(dow);
                return (
                  <button
                    key={`dow-sel-${dow}`}
                    type="button"
                    onClick={() => toggleDow(dow)}
                    className={`h-8 w-9 rounded-md border text-[13px] font-bold cursor-pointer transition ${
                      active
                        ? "bg-brand-deep text-white border-brand-deep"
                        : dow === 0 ? "bg-white border-rose-200 text-rose-700 hover:bg-rose-50"
                        : dow === 6 ? "bg-white border-sky-200 text-sky-700 hover:bg-sky-50"
                        : "bg-white border-zinc-200 text-ink hover:bg-zinc-50"
                    }`}
                    title={`${label}요일 전체 선택/해제`}
                    aria-pressed={active}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 달력 요일 header · display 전용 · 2026-10-12 폰트 up (11 → 13) */}
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {["일","월","화","수","목","금","토"].map((label, i) => (
              <div
                key={`cal-h-${i}`}
                className={`h-7 flex items-center justify-center text-[13px] font-semibold tabular-nums ${
                  i === 0 ? "text-rose-600" : i === 6 ? "text-sky-600" : "text-ink-soft"
                }`}
                aria-hidden
              >
                {label}
              </div>
            ))}
          </div>

          {/* 달력 grid · 1일 요일 position 맞춤 + leading/trailing 빈 placeholder */}
          <div className="grid grid-cols-7 gap-1.5">
            {(() => {
              const firstDowOfMonth = dateList.length > 0 ? new Date(dateList[0]).getDay() : 0;
              const leading = Array.from({ length: firstDowOfMonth }, (_, i) => ({ kind: "pad" as const, key: `pad-l-${i}` }));
              const dateCells = dateList.map(d => ({ kind: "date" as const, key: d, d }));
              const trailingCount = (7 - ((firstDowOfMonth + dateList.length) % 7)) % 7;
              const trailing = Array.from({ length: trailingCount }, (_, i) => ({ kind: "pad" as const, key: `pad-r-${i}` }));
              return [...leading, ...dateCells, ...trailing].map(cell => {
                if (cell.kind === "pad") {
                  return <div key={cell.key} className="h-10 rounded-md" aria-hidden />;
                }
                const d = cell.d;
                const dateObj = new Date(d);
                const dayNum = dateObj.getDate();
                const selected = selectedDates.has(d);
                const isSun = dateObj.getDay() === 0;
                const isSat = dateObj.getDay() === 6;
                // 2026-10-12 · 사용자 지시 · 기존 근무유형 적용 날짜 표시 (color bg + type label)
                const existing = existingByDate.get(d);
                const existingColor = existing?.type ? typeColorMap.get(existing.type) : undefined;
                // 2026-10-12 · 사용자 지시 · 오늘 날짜 붉은 테두리 (ring 중첩 · 상태 색과 양립)
                const isToday = d === todayYmd;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDate(d)}
                    disabled={!canEdit}
                    style={!selected && existingColor ? { backgroundColor: existingColor } : undefined}
                    className={`h-11 rounded-md border text-[13px] font-semibold tabular-nums transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-0.5 relative ${
                      isToday ? "ring-2 ring-rose-500 ring-offset-1" : ""
                    } ${
                      selected
                        ? "bg-brand-deep text-white border-brand-deep"
                        : existing
                          ? "border-slate-300 text-ink hover:brightness-95"
                          : isSun ? "bg-rose-50/40 border-rose-100 text-rose-700 hover:bg-rose-100/60"
                          : isSat ? "bg-sky-50/40 border-sky-100 text-sky-700 hover:bg-sky-100/60"
                          : "bg-white border-zinc-200 text-ink hover:bg-zinc-50"
                    }`}
                    title={existing ? `${d} · ${existing.type}` : d}
                  >
                    <span className="leading-none">{dayNum}</span>
                    {existing && !selected && (
                      <span className="text-[9px] font-bold leading-none truncate max-w-full px-0.5 opacity-80">{existing.type}</span>
                    )}
                  </button>
                );
              });
            })()}
          </div>
          <div className="mt-1.5 text-[12px] text-ink-soft tabular-nums">선택 {selectedDates.size}일</div>
        </section>

        {/* 2026-10-12 · 사용자 지시 · 근무 조건 섹션 위로 이동 · 중복 제거 */}
      </div>
    </Card>
  );
};

export default EmployeeBulkPanel;
