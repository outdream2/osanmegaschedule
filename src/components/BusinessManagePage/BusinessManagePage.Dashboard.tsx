// 2026-10-11 · #14 · 경영 통합 대시보드 (Phase 1)
//   · A+B 하이브리드 · KPI 6-strip + 조치 필요 + 직원 요약
//   · 홈 랜딩 톤 참조 (HomeDashboard.tsx) · CARD + 2-tier typography
//   · 2026-10-10 폰트 대원칙 · body 15~17 · label 13~14 · 소수점 금지
//   · Phase 1 데이터 소스 · listEmployees + leave/resignation pending count
//   · Phase 2 KPI (이번달 예상 인건비 · 매출 대비 인건비율) 은 "집계 중" badge 유지

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  UsersThree, UserPlus, CalendarDots, ChatCenteredText,
  CurrencyKrw, Percent, ChartLineUp, Warning, FileText, CaretRight,
} from "@phosphor-icons/react";
import { listEmployees } from "../../lib/employeeApi";
import { getLeavePendingCount } from "../../lib/leaveApi";
import { getResignationPendingCount } from "../../lib/resignationsApi";
import type { Employee } from "../../types";
import { Spinner } from "../common/Spinner";
// 2026-10-12 · 사용자 지시 "조치 필요 자리에 인건비 구성 + 클릭 시 직군별 세부" · wage resolver 통합
import { useSettings } from "../../hooks/useSettings";
import { resolveEmployeeWage } from "../../lib/wageResolver";

const AVG_WEEKS_PER_MONTH = 4.345;
const DEFAULT_HOURS_PER_WEEK = 40;
const fmtMan = (n: number): string => `${Math.round(n / 10000).toLocaleString("ko-KR")}만원`;

const CARD = "bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]";

const T = {
  sectionTitle: "text-[15px] md:text-[16px] font-semibold text-slate-900 tracking-tight",
  sectionDesc:  "text-[13px] md:text-[14px] text-slate-500",
  kpiLabel:     "text-[13px] md:text-[14px] text-slate-500 font-medium",
  kpiValue:     "text-[18px] md:text-[20px] font-semibold text-slate-900 tabular-nums tracking-tight",
  kpiMeta:      "text-[13px] text-slate-400",
  rowTitle:     "text-[14px] md:text-[15px] text-slate-900 font-medium",
  rowMeta:      "text-[13px] text-slate-500",
  pill:         "text-[12px] px-2 py-[2px] rounded-full font-medium inline-flex items-center gap-1",
} as const;

const currentYm = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const daysBetween = (ymdA: string, ymdB: string): number => {
  const a = new Date(ymdA + "T00:00:00").getTime();
  const b = new Date(ymdB + "T00:00:00").getTime();
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
};
const todayYmd = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type EmployeeExt = Employee & {
  contract_type?: string | null;
  contract_start?: string | null;
  contract_end?: string | null;
  resume_url?: string | null;
};

export interface BusinessDashboardProps {
  // 2026-10-11 · #14-P2 · wage-analysis 추가 (인건비 KPI 클릭 target)
  onOpenTab: (tab: "staff-manage" | "requests" | "document-writer" | "hr-forms" | "wage-analysis") => void;
  onOpenEmployeeId?: (id: number) => void;
}

const POSITION_ORDER = ["약사", "매장", "창고", "캐셔", "진열", "물류", "알바", "기타"];
const POSITION_TONE: Record<string, string> = {
  "약사":   "bg-sky-50 text-sky-700 border-sky-200",
  "매장":   "bg-emerald-50 text-emerald-700 border-emerald-200",
  "창고":   "bg-amber-50 text-amber-700 border-amber-200",
  "캐셔":   "bg-emerald-50 text-emerald-700 border-emerald-200",
  "진열":   "bg-indigo-50 text-indigo-700 border-indigo-200",
  "물류":   "bg-amber-50 text-amber-700 border-amber-200",
  "알바":   "bg-slate-50 text-slate-700 border-slate-200",
  "기타":   "bg-slate-50 text-slate-700 border-slate-200",
};

export const BusinessDashboard: React.FC<BusinessDashboardProps> = ({ onOpenTab, onOpenEmployeeId }) => {
  const [employees, setEmployees] = useState<EmployeeExt[]>([]);
  const [leavePending, setLeavePending] = useState<number>(0);
  const [resignPending, setResignPending] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [emps, leaveCnt, resignCnt] = await Promise.all([
        listEmployees().catch(() => [] as Employee[]),
        getLeavePendingCount().catch(() => 0),
        getResignationPendingCount().catch(() => 0),
      ]);
      setEmployees(emps as EmployeeExt[]);
      setLeavePending(leaveCnt);
      setResignPending(resignCnt);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [load]);

  const activeEmps = useMemo(() => employees.filter(e => !e.retireDate), [employees]);
  const curYm = currentYm();
  const today = todayYmd();

  const newThisMonth = useMemo(
    () => activeEmps.filter(e => (e.hireDate ?? "").startsWith(curYm)),
    [activeEmps, curYm],
  );

  const expiringContracts = useMemo(() => {
    return activeEmps
      .filter(e => !!e.contract_end)
      .map(e => ({ emp: e, days: daysBetween(e.contract_end as string, today) }))
      .filter(x => x.days >= 0 && x.days <= 30)
      .sort((a, b) => a.days - b.days);
  }, [activeEmps, today]);

  const pendingTotal = leavePending + resignPending;

  // 2026-10-12 · 사용자 지시 "조치 필요 자리에 인건비 구성 넣어" · 직군별 인건비 집계 (payrollBreakdown)
  const { settings } = useSettings();
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(new Set());
  const togglePosition = (pos: string) => {
    setExpandedPositions(prev => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos); else next.add(pos);
      return next;
    });
  };
  // 직군별 (position) 월 인건비 집계 + 소속 직원 리스트
  const payrollBreakdown = useMemo(() => {
    if (!settings) return [] as Array<{ position: string; amount: number; count: number; members: Array<{ emp: EmployeeExt; monthly: number }> }>;
    const g = new Map<string, { amount: number; count: number; members: Array<{ emp: EmployeeExt; monthly: number }> }>();
    for (const emp of activeEmps) {
      const resolution = resolveEmployeeWage(emp.id, emp.position, settings);
      if (resolution.status !== "configured" || !resolution.wage) continue;
      const hoursPerWeek = ((emp as any).working_hours_per_week && Number.isFinite((emp as any).working_hours_per_week))
        ? (emp as any).working_hours_per_week
        : DEFAULT_HOURS_PER_WEEK;
      const monthly = Math.round(resolution.wage.weekday * hoursPerWeek * AVG_WEEKS_PER_MONTH);
      const key = String(emp.position ?? "(직군 미지정)").trim() || "(직군 미지정)";
      const prev = g.get(key) ?? { amount: 0, count: 0, members: [] };
      prev.amount += monthly;
      prev.count += 1;
      prev.members.push({ emp, monthly });
      g.set(key, prev);
    }
    return Array.from(g.entries())
      .map(([position, v]) => ({ position, ...v, members: v.members.sort((a, b) => b.monthly - a.monthly) }))
      .sort((a, b) => b.amount - a.amount);
  }, [activeEmps, settings]);
  const payrollTotal = useMemo(() => payrollBreakdown.reduce((s, g) => s + g.amount, 0), [payrollBreakdown]);

  // 2026-10-12 · 사용자 지시 "직원리스트는 3단으로 · 약사 / 매장 / 창고/기타"
  const classifyPosition = (position: string | null | undefined): "pharmacist" | "store" | "warehouse_other" => {
    const p = String(position ?? "").trim();
    if (p.includes("약사")) return "pharmacist";
    if (p.includes("매장") || p.includes("캐셔") || p.includes("매니저") || p.includes("판매")) return "store";
    return "warehouse_other";
  };
  const grouped3 = useMemo(() => {
    const buckets: Record<"pharmacist" | "store" | "warehouse_other", EmployeeExt[]> = {
      pharmacist: [], store: [], warehouse_other: [],
    };
    for (const e of activeEmps) buckets[classifyPosition(e.position)].push(e);
    return buckets;
  }, [activeEmps]);

  const groupedByPosition = useMemo(() => {
    const map = new Map<string, EmployeeExt[]>();
    for (const e of activeEmps) {
      const key = e.position || "기타";
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      const ia = POSITION_ORDER.indexOf(a);
      const ib = POSITION_ORDER.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
  }, [activeEmps]);

  if (loading && employees.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <Spinner label="대시보드 로딩 중..." size={16} tone="brand" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-5">
      {/* ── 2026-10-12 · 사용자 지시 "전부 텍스트로 깔끔하게" · KPI 큰 카드 6-strip 제거 · inline text 요약 */}
      <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-4 py-3">
        <div className="flex items-baseline gap-x-6 gap-y-1.5 flex-wrap text-[14px]">
          <button type="button" onClick={() => onOpenTab("staff-manage")} className="inline-flex items-baseline gap-1.5 cursor-pointer hover:text-brand-deep transition-colors">
            <span className="text-slate-500 font-medium">전체 재직</span>
            <span className="font-bold text-ink tabular-nums">{activeEmps.length}</span>
            <span className="text-slate-500">명</span>
          </button>
          <span className="text-slate-300">·</span>
          <button type="button" onClick={() => onOpenTab("staff-manage")} className="inline-flex items-baseline gap-1.5 cursor-pointer hover:text-brand-deep transition-colors">
            <span className="text-slate-500 font-medium">신규 입사 (이번달)</span>
            <span className="font-bold text-ink tabular-nums">{newThisMonth.length}</span>
            <span className="text-slate-500">명</span>
          </button>
          <span className="text-slate-300">·</span>
          <button type="button" onClick={() => onOpenTab("document-writer")} className="inline-flex items-baseline gap-1.5 cursor-pointer hover:text-brand-deep transition-colors">
            <span className="text-slate-500 font-medium">계약 만료 임박 (30일)</span>
            <span className={`font-bold tabular-nums ${expiringContracts.length > 0 ? "text-amber-600" : "text-ink"}`}>{expiringContracts.length}</span>
            <span className="text-slate-500">명</span>
          </button>
          <span className="text-slate-300">·</span>
          <button type="button" onClick={() => onOpenTab("requests")} className="inline-flex items-baseline gap-1.5 cursor-pointer hover:text-brand-deep transition-colors">
            <span className="text-slate-500 font-medium">미승인 요청</span>
            <span className={`font-bold tabular-nums ${pendingTotal > 0 ? "text-rose-600" : "text-ink"}`}>{pendingTotal}</span>
            <span className="text-slate-500">건</span>
            {pendingTotal > 0 && <span className="ml-1 text-[12px] font-semibold text-rose-600">· 조치 필요</span>}
          </button>
          <span className="text-slate-300">·</span>
          <button type="button" onClick={() => onOpenTab("wage-analysis")} className="inline-flex items-baseline gap-1.5 cursor-pointer hover:text-brand-deep transition-colors">
            <span className="text-slate-500 font-medium">이번달 예상 인건비</span>
            <span className="font-semibold text-brand-deep">보기 →</span>
          </button>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-slate-500 font-medium">매출 대비 인건비율</span>
            <span className="text-slate-300">—</span>
            <span className="text-[12px] text-slate-400">매출 API 연동 예정</span>
          </span>
        </div>
      </section>

      {/* ── 2026-10-12 · 사용자 지시 "조치 필요 자리에 인건비 구성 · 직원 요약 아래로" · vertical stack */}
      <div className="flex flex-col gap-4">
        {/* 인건비 구성 (상단) · 조치 필요 교체 · 직군별 리스트 · 클릭 expand 세부 직원 */}
        <section className={`${CARD} p-4 flex flex-col`}>
          <header className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="w-[3px] h-[12px] bg-indigo-500 rounded-full" aria-hidden />
              <h2 className={T.sectionTitle}>인건비 구성</h2>
              <span className="text-[13px] text-slate-500 tabular-nums">· {payrollBreakdown.reduce((s, g) => s + g.count, 0)}명 · {payrollBreakdown.length}직군</span>
            </div>
            <div className="flex items-baseline gap-2 tabular-nums">
              <span className="text-[13px] text-slate-500">월 인건비</span>
              <span className="text-[18px] font-bold text-ink">{fmtMan(payrollTotal)}</span>
            </div>
          </header>
          <ul className="divide-y divide-slate-100">
            {payrollBreakdown.map(g => {
              const expanded = expandedPositions.has(g.position);
              const pct = payrollTotal > 0 ? (g.amount / payrollTotal) * 100 : 0;
              return (
                <React.Fragment key={g.position}>
                  <li
                    className="py-2.5 flex items-center gap-3 text-[14px] md:text-[15px] cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded transition-colors"
                    onClick={() => togglePosition(g.position)}
                    title={expanded ? "접기" : "펼치기 · 소속 직원 리스트"}
                  >
                    <span className={`inline-block text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden>▸</span>
                    <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 shrink-0" aria-hidden />
                    <span className="flex-1 text-ink font-medium truncate min-w-0">{g.position}</span>
                    <span className="w-14 text-right tabular-nums text-[13px] text-slate-500 shrink-0">{g.count}명</span>
                    <span className="w-28 text-right tabular-nums text-ink shrink-0 font-semibold">{fmtMan(g.amount)}</span>
                    <span className="w-14 text-right tabular-nums text-[12px] text-slate-400 shrink-0 hidden sm:inline">비중 {Math.round(pct)}%</span>
                    <div className="w-24 md:w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                  {/* 2026-10-12 · 클릭 expand · 소속 직원 세부 리스트 (금액 desc) */}
                  {expanded && (
                    <li className="bg-slate-50/60 -mx-2 px-2 py-2">
                      <ul className="divide-y divide-slate-200/60 pl-10">
                        {g.members.map(({ emp, monthly }) => {
                          const empPct = g.amount > 0 ? (monthly / g.amount) * 100 : 0;
                          return (
                            <li
                              key={emp.id}
                              className="py-1.5 flex items-center gap-3 text-[13px] cursor-pointer hover:bg-white -mx-2 px-2 rounded transition-colors"
                              onClick={(ev) => { ev.stopPropagation(); onOpenEmployeeId?.(emp.id); }}
                              title="클릭 · 직원 상세"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 shrink-0" aria-hidden />
                              <span className="flex-1 text-slate-700 truncate min-w-0">{emp.name}</span>
                              <span className="w-24 text-right tabular-nums text-slate-700 shrink-0">{fmtMan(monthly)}</span>
                              <span className="w-14 text-right tabular-nums text-[12px] text-slate-400 shrink-0">{Math.round(empPct)}%</span>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  )}
                </React.Fragment>
              );
            })}
            {payrollBreakdown.length === 0 && (
              <li className="py-6 text-center text-[13px] text-slate-400">
                인건비 집계 데이터 없음 · 직원 급여 설정 필요
              </li>
            )}
          </ul>
        </section>

        {/* 2026-10-12 · 사용자 지시 "직원리스트 3단 · 약사 / 매장 / 창고기타" · 3-column grid */}
        <section className={`${CARD} p-4 flex flex-col`}>
          <header className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-[3px] h-[12px] bg-violet-500 rounded-full" aria-hidden />
              <h2 className={T.sectionTitle}>직원 요약</h2>
              <span className="text-[13px] text-slate-500">· 약사 {grouped3.pharmacist.length} · 매장 {grouped3.store.length} · 창고/기타 {grouped3.warehouse_other.length}</span>
            </div>
            <button
              type="button"
              onClick={() => onOpenTab("staff-manage")}
              className="text-[13px] text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
            >
              전체 보기 <CaretRight size={12} weight="bold" />
            </button>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {([
              { key: "pharmacist" as const,       title: "약사",       tone: "bg-emerald-500", list: grouped3.pharmacist },
              { key: "store" as const,            title: "매장",       tone: "bg-sky-500",     list: grouped3.store },
              { key: "warehouse_other" as const,  title: "창고 / 기타", tone: "bg-slate-500",   list: grouped3.warehouse_other },
            ]).map(group => (
              <div key={group.key} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 pb-1.5 border-b border-slate-200">
                  <span className={`w-1.5 h-1.5 rounded-full ${group.tone}`} aria-hidden />
                  <span className="text-[13px] font-semibold text-slate-700">{group.title}</span>
                  <span className="text-[12px] text-slate-400 tabular-nums">· {group.list.length}명</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {group.list.length === 0 ? (
                    <li className="py-3 text-center text-[13px] text-slate-400">직원 없음</li>
                  ) : group.list.map(e => {
                    const ext = e as EmployeeExt;
                    const hasResume = !!(ext.resume_url && String(ext.resume_url).trim());
                    const hasContract = !!(ext.contract_type || ext.contract_start);
                    const contractType = String(ext.contract_type ?? "").trim();
                    const isRegular = contractType.includes("정규") || contractType.includes("정직원");
                    const isTemp = contractType.includes("계약") || contractType.includes("수습");
                    const typeLabel = isRegular ? "정규" : isTemp ? "계약" : "미지정";
                    const typeCls = isRegular
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : isTemp
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-slate-50 text-slate-400 border-slate-200";
                    return (
                      <li
                        key={e.id}
                        className="py-1.5 flex items-center gap-2 hover:bg-slate-50 -mx-1 px-1 rounded cursor-pointer transition-colors"
                        onClick={() => onOpenEmployeeId?.(e.id)}
                        title="클릭 · 직원 상세 열기"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] text-ink font-medium truncate">{e.name}</div>
                          <div className="text-[12px] text-slate-500 truncate">{e.position || "—"}</div>
                        </div>
                        <div className="shrink-0 flex items-center gap-1">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${typeCls}`}>{typeLabel}</span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${hasResume ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-slate-50 text-slate-400 border-slate-200"}`}
                            title={hasResume ? "이력서 있음" : "이력서 없음"}
                          >
                            이력서 {hasResume ? "✓" : "✗"}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${hasContract ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-slate-50 text-slate-400 border-slate-200"}`}
                            title={hasContract ? "근로계약서 작성됨" : "근로계약서 미작성"}
                          >
                            계약서 {hasContract ? "✓" : "✗"}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          {/* 2026-10-12 · 사용자 지시 "클릭시 슬라이딩윈도우 편집 가능" · onOpenEmployeeId 는 상위 BusinessManagePage.Overview 가 slide drawer 로 처리 */}
        </section>
      </div>

      {/* ── 인건비 분석 shortcut (Phase 2 완료) ───────────────────── */}
      <button
        type="button"
        onClick={() => onOpenTab("wage-analysis")}
        className={`${CARD} p-3 flex items-start gap-3 bg-violet-50/40 hover:bg-violet-50 text-left transition-colors`}
      >
        <ChartLineUp size={18} weight="duotone" className="text-violet-600 shrink-0 mt-[2px]" />
        <div className="flex-1">
          <div className={T.sectionTitle}>인건비 분석 열기</div>
          <p className={T.sectionDesc}>
            월별 예상 인건비 · 직군별 비중 Donut · 직원별 예상 급여 테이블 (계약서 설정 시급 기반 산출).
          </p>
        </div>
        <CaretRight size={14} weight="bold" className="text-slate-400 shrink-0 mt-[6px]" />
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Internal components
// ─────────────────────────────────────────────────────────────

interface KpiTileProps {
  icon: React.ComponentType<{ size?: number; weight?: "regular" | "bold" | "fill" | "duotone"; className?: string }>;
  tone: "violet" | "emerald" | "amber" | "indigo" | "slate";
  label: string;
  value: number | string;
  unit?: string;
  meta?: string;
  badge?: string;
  onClick?: () => void;
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

const KpiTile: React.FC<KpiTileProps> = ({ icon: Icon, tone, label, value, unit, meta, badge, onClick }) => {
  const clickable = typeof onClick === "function";
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={clickable ? (ev) => { if (ev.key === "Enter" || ev.key === " ") onClick?.(); } : undefined}
      className={[
        CARD,
        "p-3 md:p-3.5 flex flex-col gap-1.5",
        clickable ? "cursor-pointer hover:shadow-[0_2px_6px_rgba(0,0,0,0.06)] transition-shadow" : "",
      ].join(" ")}
    >
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
          <span className="ml-auto text-[12px] px-2 py-[2px] rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-medium">
            {badge}
          </span>
        )}
      </div>
      {meta && <div className={T.kpiMeta}>{meta}</div>}
    </div>
  );
};

interface ActionRowProps {
  icon: React.ComponentType<{ size?: number; weight?: "regular" | "bold" | "fill" | "duotone"; className?: string }>;
  iconTone: string;
  title: string;
  meta: string;
  onClick: () => void;
}

const ActionRow: React.FC<ActionRowProps> = ({ icon: Icon, iconTone, title, meta, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-start gap-3 py-2.5 border-t first:border-t-0 border-slate-100 hover:bg-slate-50 -mx-2 px-2 rounded text-left"
  >
    <Icon size={18} weight="duotone" className={`${iconTone} shrink-0 mt-[2px]`} />
    <div className="flex-1 min-w-0">
      <div className={T.rowTitle}>{title}</div>
      <div className={T.rowMeta}>{meta}</div>
    </div>
    <CaretRight size={12} weight="bold" className="text-slate-400 shrink-0 mt-[6px]" />
  </button>
);

export default BusinessDashboard;
