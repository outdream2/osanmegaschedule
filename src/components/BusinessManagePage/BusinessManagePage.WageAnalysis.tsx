// 2026-10-11 · #14-P2 · 경영 > 인건비 분석 탭
//   · 계약서 임금 데이터 기반 월별 "예상 인건비" (실지급 로그 테이블 없음 · "예상치" 명시)
//   · 공식 (feedback_wage_formula_final_2026-08-06) · 시급 × 주시간 × 4.345 = 월 수령액
//   · 데이터 · listEmployees + resolveEmployeeWage(settings) · settings.employeeWageOverrides + wageRates
//   · 섹션 · ① KPI (총 인건비 · 1인당 평균 · 미설정 N명) · ② 직군별 비중 Donut · ③ 직원별 테이블
//   · 홈 랜딩 톤 · CARD + 2-tier typography · 폰트 2026-10-10 대원칙

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CurrencyKrw, Users, Warning } from "@phosphor-icons/react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { listEmployees } from "../../lib/employeeApi";
import { resolveEmployeeWage } from "../../lib/wageResolver";
import { useSettings } from "../../hooks/useSettings";
import type { Employee } from "../../types";
import { Spinner } from "../common/Spinner";

const CARD = "bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]";

const T = {
  sectionTitle: "text-[15px] md:text-[16px] font-semibold text-slate-900 tracking-tight",
  sectionDesc:  "text-[13px] md:text-[14px] text-slate-500",
  kpiLabel:     "text-[13px] md:text-[14px] text-slate-500 font-medium",
  kpiValue:     "text-[18px] md:text-[20px] font-semibold text-slate-900 tabular-nums tracking-tight",
  kpiMeta:      "text-[13px] text-slate-400",
  tableHeader:  "text-[13px] md:text-[14px] text-slate-500 font-medium",
  tableBody:    "text-[14px] md:text-[15px] text-slate-900 tabular-nums",
} as const;

const AVG_WEEKS_PER_MONTH = 4.345;
const DEFAULT_HOURS_PER_WEEK = 40;

type EmployeeExt = Employee & {
  working_hours_per_week?: number | null;
  contract_type?: string | null;
};

const fmtWon = (n: number): string => `${Math.round(n).toLocaleString("ko-KR")}원`;
const fmtMan = (n: number): string => `${Math.round(n / 10000).toLocaleString("ko-KR")}만원`;
const fmtEok = (n: number): string => {
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}억원`;
  return fmtMan(n);
};

const POSITION_TONE: Record<string, string> = {
  "약사":   "#8b5cf6",
  "매장":   "#10b981",
  "창고":   "#f59e0b",
  "캐셔":   "#06b6d4",
  "진열":   "#6366f1",
  "물류":   "#f97316",
  "알바":   "#64748b",
  "기타":   "#94a3b8",
};
const toneFor = (pos: string): string => POSITION_TONE[pos] ?? "#94a3b8";

interface EmpWageRow {
  emp: EmployeeExt;
  weekdayRate: number | null;      // 시급 (원 · null = 미설정)
  monthlyEstimate: number;         // 월 예상 인건비 (원 · 미설정은 0)
  configured: boolean;
}

export const WageAnalysisTab: React.FC = () => {
  const { settings, isReady } = useSettings();
  const [employees, setEmployees] = useState<EmployeeExt[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const emps = await listEmployees().catch(() => [] as Employee[]);
      setEmployees(emps as EmployeeExt[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows: EmpWageRow[] = useMemo(() => {
    if (!isReady) return [];
    const active = employees.filter(e => !e.retireDate);
    return active.map(emp => {
      const resolution = resolveEmployeeWage(emp.id, emp.position, settings);
      const hoursPerWeek = (emp.working_hours_per_week && Number.isFinite(emp.working_hours_per_week))
        ? emp.working_hours_per_week
        : DEFAULT_HOURS_PER_WEEK;
      const weekdayRate = resolution.wage?.weekday ?? null;
      const monthlyEstimate = weekdayRate != null
        ? Math.round(weekdayRate * hoursPerWeek * AVG_WEEKS_PER_MONTH)
        : 0;
      return {
        emp,
        weekdayRate,
        monthlyEstimate,
        configured: resolution.status === "configured",
      };
    });
  }, [employees, settings, isReady]);

  const totalMonthlyEstimate = useMemo(() => rows.reduce((acc, r) => acc + r.monthlyEstimate, 0), [rows]);
  const configuredCount = useMemo(() => rows.filter(r => r.configured).length, [rows]);
  const unconfiguredCount = rows.length - configuredCount;
  const avgPerPerson = configuredCount > 0 ? Math.round(totalMonthlyEstimate / configuredCount) : 0;

  const byPosition = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const r of rows) {
      if (!r.configured) continue;
      const key = r.emp.position || "기타";
      const cur = map.get(key) ?? { total: 0, count: 0 };
      cur.total += r.monthlyEstimate;
      cur.count += 1;
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([pos, v]) => ({ pos, total: v.total, count: v.count, color: toneFor(pos) }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => b.monthlyEstimate - a.monthlyEstimate),
    [rows],
  );

  if (loading && employees.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <Spinner label="인건비 분석 로딩 중..." size={16} tone="brand" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-5">
      {/* 예상치 안내 */}
      <div className={`${CARD} p-3 flex items-start gap-3 bg-amber-50/50 border-amber-200`}>
        <Warning size={18} weight="duotone" className="text-amber-600 shrink-0 mt-[2px]" />
        <div className="flex-1">
          <div className="text-[14px] md:text-[15px] font-semibold text-slate-900">예상 인건비 (계약서 기반)</div>
          <p className="text-[13px] md:text-[14px] text-slate-600">
            실지급 로그 테이블이 없어 · 설정된 직원별 시급 × 주 근무시간 × 4.345 (월 평균 주수) 공식으로 산출. 실제 지급액과 다를 수 있습니다.
          </p>
        </div>
      </div>

      {/* ── KPI 3-strip ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiTile
          icon={CurrencyKrw}
          tone="violet"
          label="이번달 예상 인건비 총액"
          value={fmtEok(totalMonthlyEstimate)}
          meta={`설정 완료 ${configuredCount}명 기준`}
        />
        <KpiTile
          icon={Users}
          tone="emerald"
          label="1인당 평균 (설정 완료)"
          value={configuredCount > 0 ? fmtMan(avgPerPerson) : "—"}
          meta={configuredCount > 0 ? `${configuredCount}명 평균` : "설정된 직원 없음"}
        />
        <KpiTile
          icon={Warning}
          tone={unconfiguredCount > 0 ? "amber" : "slate"}
          label="시급 미설정"
          value={unconfiguredCount}
          unit="명"
          meta={unconfiguredCount > 0 ? "설정 > 통계 설정에서 시급 입력" : "모두 설정됨"}
          badge={unconfiguredCount > 0 ? "확인 필요" : undefined}
        />
      </div>

      {/* ── 직군별 비중 Donut + 테이블 ────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <section className={`${CARD} md:col-span-2 p-4 flex flex-col min-h-[280px]`}>
          <header className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-[3px] h-[12px] bg-violet-500 rounded-full" aria-hidden />
              <h2 className={T.sectionTitle}>직군별 비중</h2>
            </div>
            <span className="text-[12px] text-slate-400">예상 인건비 기준</span>
          </header>

          {byPosition.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-[14px]">
              설정된 데이터 없음
            </div>
          ) : (
            <div className="flex-1 min-h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byPosition.map(p => ({ name: p.pos, value: p.total }))}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={2}
                  >
                    {byPosition.map((p, i) => (
                      <Cell key={i} fill={p.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => fmtWon(Number(value))}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className={`${CARD} md:col-span-3 p-4 flex flex-col`}>
          <header className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-[3px] h-[12px] bg-indigo-500 rounded-full" aria-hidden />
              <h2 className={T.sectionTitle}>직원별 예상 급여</h2>
            </div>
            <span className="text-[12px] text-slate-400">월 단위 추정</span>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className={`${T.tableHeader} py-2 pr-2`}>이름</th>
                  <th className={`${T.tableHeader} py-2 px-2`}>직군</th>
                  <th className={`${T.tableHeader} py-2 px-2 text-right`}>시급</th>
                  <th className={`${T.tableHeader} py-2 px-2 text-right`}>주시간</th>
                  <th className={`${T.tableHeader} py-2 pl-2 text-right`}>월 예상</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.map(r => {
                  const hours = (r.emp.working_hours_per_week && Number.isFinite(r.emp.working_hours_per_week))
                    ? r.emp.working_hours_per_week
                    : DEFAULT_HOURS_PER_WEEK;
                  return (
                    <tr key={r.emp.id} className="hover:bg-slate-50">
                      <td className={`${T.tableBody} py-2 pr-2 font-medium`}>{r.emp.name}</td>
                      <td className="py-2 px-2">
                        <span
                          className="inline-flex items-center gap-1 text-[12px] px-2 py-[2px] rounded-full border"
                          style={{
                            borderColor: `${toneFor(r.emp.position)}40`,
                            backgroundColor: `${toneFor(r.emp.position)}10`,
                            color: toneFor(r.emp.position),
                          }}
                        >
                          {r.emp.position}
                        </span>
                      </td>
                      <td className={`${T.tableBody} py-2 px-2 text-right`}>
                        {r.weekdayRate != null ? fmtWon(r.weekdayRate) : <span className="text-amber-600 text-[13px]">미설정</span>}
                      </td>
                      <td className={`${T.tableBody} py-2 px-2 text-right text-slate-500`}>
                        {hours}h
                      </td>
                      <td className={`${T.tableBody} py-2 pl-2 text-right font-semibold`}>
                        {r.configured ? fmtMan(r.monthlyEstimate) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 text-[14px]">
                      재직 중인 직원이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// KPI Tile · BusinessManagePage.Dashboard 와 동일 패턴 (내부 복제 · dependency 최소화)
// ─────────────────────────────────────────────────────────────

interface KpiTileProps {
  icon: React.ComponentType<{ size?: number; weight?: "regular" | "bold" | "fill" | "duotone"; className?: string }>;
  tone: "violet" | "emerald" | "amber" | "indigo" | "slate";
  label: string;
  value: number | string;
  unit?: string;
  meta?: string;
  badge?: string;
}

const TONE_RAIL: Record<KpiTileProps["tone"], string> = {
  violet:  "bg-violet-500",
  emerald: "bg-emerald-500",
  amber:   "bg-amber-500",
  indigo:  "bg-indigo-500",
  slate:   "bg-slate-300",
};
const TONE_ICON: Record<KpiTileProps["tone"], string> = {
  violet:  "text-violet-600",
  emerald: "text-emerald-600",
  amber:   "text-amber-600",
  indigo:  "text-indigo-600",
  slate:   "text-slate-400",
};

const KpiTile: React.FC<KpiTileProps> = ({ icon: Icon, tone, label, value, unit, meta, badge }) => (
  <div className={`${CARD} p-3 md:p-3.5 flex flex-col gap-1.5`}>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-[3px] h-[12px] ${TONE_RAIL[tone]} rounded-full`} aria-hidden />
        <span className={T.kpiLabel}>{label}</span>
      </div>
      <Icon size={16} weight="duotone" className={TONE_ICON[tone]} />
    </div>
    <div className="flex items-baseline gap-1.5 flex-wrap">
      <span className={T.kpiValue}>{value}</span>
      {unit && <span className="text-[13px] text-slate-500">{unit}</span>}
      {badge && (
        <span className="ml-auto text-[12px] px-2 py-[2px] rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
          {badge}
        </span>
      )}
    </div>
    {meta && <div className={T.kpiMeta}>{meta}</div>}
  </div>
);

export default WageAnalysisTab;
