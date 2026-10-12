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
      {/* ── KPI 6-strip ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiTile
          icon={UsersThree}
          tone="violet"
          label="전체 재직"
          value={activeEmps.length}
          unit="명"
          onClick={() => onOpenTab("staff-manage")}
        />
        <KpiTile
          icon={UserPlus}
          tone="emerald"
          label="신규 입사 (이번달)"
          value={newThisMonth.length}
          unit="명"
          onClick={() => onOpenTab("staff-manage")}
        />
        <KpiTile
          icon={CalendarDots}
          tone="amber"
          label="계약 만료 임박 (30일)"
          value={expiringContracts.length}
          unit="명"
          onClick={() => onOpenTab("document-writer")}
        />
        <KpiTile
          icon={ChatCenteredText}
          tone="indigo"
          label="미승인 요청"
          value={pendingTotal}
          unit="건"
          badge={pendingTotal > 0 ? "조치 필요" : undefined}
          onClick={() => onOpenTab("requests")}
        />
        {/* 2026-10-11 · #14-P2 · 인건비 분석 탭으로 이동 · 상세 KPI 는 그 탭 안에서 표시 */}
        <KpiTile
          icon={CurrencyKrw}
          tone="violet"
          label="이번달 예상 인건비"
          value="보기"
          meta="인건비 분석 탭으로 이동"
          onClick={() => onOpenTab("wage-analysis")}
        />
        <KpiTile
          icon={Percent}
          tone="slate"
          label="매출 대비 인건비율"
          value="—"
          meta="매출 API 연동 예정"
        />
      </div>

      {/* ── 메인 2단: 조치 필요 + 직원 요약 ─────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* 조치 필요 (좌 2/5) */}
        <section className={`${CARD} md:col-span-2 p-4 flex flex-col`}>
          <header className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-[3px] h-[12px] bg-rose-500 rounded-full" aria-hidden />
              <h2 className={T.sectionTitle}>조치 필요</h2>
            </div>
            <span className="text-[12px] text-slate-400">우선 처리</span>
          </header>

          <ActionRow
            icon={CalendarDots}
            iconTone="text-amber-600"
            title={`재계약 대상 · ${expiringContracts.length}명`}
            meta={expiringContracts.length === 0 ? "30일 이내 만료 없음" : expiringContracts.slice(0, 3).map(x => `${x.emp.name} (D-${x.days})`).join(" · ")}
            onClick={() => onOpenTab("document-writer")}
          />
          <ActionRow
            icon={ChatCenteredText}
            iconTone="text-indigo-600"
            title={`미승인 요청 · ${pendingTotal}건`}
            meta={pendingTotal === 0 ? "대기 중인 요청 없음" : `연차 ${leavePending}건 · 사직서 ${resignPending}건`}
            onClick={() => onOpenTab("requests")}
          />
          <ActionRow
            icon={FileText}
            iconTone="text-slate-500"
            title="서류 누락 점검"
            meta="각종양식 탭에서 확인"
            onClick={() => onOpenTab("hr-forms")}
          />
        </section>

        {/* 직원 요약 (우 3/5) */}
        <section className={`${CARD} md:col-span-3 p-4 flex flex-col`}>
          <header className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-[3px] h-[12px] bg-violet-500 rounded-full" aria-hidden />
              <h2 className={T.sectionTitle}>직원 요약</h2>
            </div>
            <button
              type="button"
              onClick={() => onOpenTab("staff-manage")}
              className="text-[13px] text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
            >
              전체 보기 <CaretRight size={12} weight="bold" />
            </button>
          </header>

          <div className="flex flex-wrap gap-2 mb-3">
            {groupedByPosition.map(([pos, list]) => (
              <span
                key={pos}
                className={`${T.pill} border ${POSITION_TONE[pos] ?? "bg-slate-50 text-slate-700 border-slate-200"}`}
              >
                {pos} <strong className="tabular-nums">{list.length}</strong>
              </span>
            ))}
          </div>

          <ul className="divide-y divide-slate-100">
            {activeEmps.slice(0, 6).map(e => (
              <li
                key={e.id}
                className="py-2 flex items-center justify-between hover:bg-slate-50 -mx-2 px-2 rounded cursor-pointer"
                onClick={() => onOpenEmployeeId?.(e.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`${T.rowTitle} truncate`}>{e.name}</div>
                  <span className="text-[12px] text-slate-500 shrink-0">{e.position}</span>
                </div>
                <div className={`${T.rowMeta} shrink-0 tabular-nums`}>
                  {e.hireDate ? `입사 ${e.hireDate.slice(0, 7)}` : "—"}
                </div>
              </li>
            ))}
            {activeEmps.length > 6 && (
              <li className="pt-3 text-[13px] text-slate-500 text-center">
                외 {activeEmps.length - 6}명 · <button type="button" onClick={() => onOpenTab("staff-manage")} className="text-indigo-600 hover:underline">전체 보기</button>
              </li>
            )}
          </ul>
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
