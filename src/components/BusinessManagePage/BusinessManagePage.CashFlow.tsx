// 2026-10-12 · 사용자 지시 · 경영현황 "현황" tab · 현금흐름 비율 (cash flow composition) 차트
//   · 리서치 결과 적용 (research-strategist 2026-10-12)
//   · UI: 상단 100% stacked horizontal bar (recharts) + 하단 Progress Bar List (Tailwind div)
//   · Linear/Vercel/Attio 톤 · neutral 단색 그라데이션 · 파스텔/그라디언트/counter 금지
//   · 데이터 소스:
//     - 매출: /api/erp/sale-monthly-report (자동)
//     - 인건비: 계약서 기반 월 예상 (wageResolver + working_hours_per_week × 4.345)
//     - 임대료 · 수수료% · 공과금 · 기타: settings key "business_cost_structure" JSON
//     - 매입 · 발주: Phase 1 수동 입력 (Phase 2 자동 연동 예정)
//   · 입력 UI · 차트 바로 아래 inline 테이블 (사용자 Q1=b 선택)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, PencilSimple, FloppyDisk, X, Trash } from "@phosphor-icons/react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../../lib/apiClient";
import { getSetting, saveSetting } from "../../lib/settingsApi";
import { useSettings } from "../../hooks/useSettings";
import { listEmployees } from "../../lib/employeeApi";
import { resolveEmployeeWage } from "../../lib/wageResolver";
import type { Employee } from "../../types";
import { Spinner } from "../common/Spinner";

// ─────────────────────────────────────────────────────────────
// Settings schema
// ─────────────────────────────────────────────────────────────

const SETTING_KEY = "business_cost_structure";

export interface BusinessCostStructure {
  rent: number;                // 임대료 (원 · 월)
  hqFeeRate: number;           // 본사수수료 % (매출 대비 · 기본 3)
  cardFeeRate: number;         // 오프라인 카드수수료 % (매출 대비 · 기본 1.2)
  utilities: number;           // 공과금 (원 · 월)
  purchaseManual: number;      // 매입금액 (원 · 월 · Phase 1 수동 · Phase 2 ERP 자동)
  orderManual: number;         // 발주금액 (원 · 월 · Phase 1 수동)
  revenueManual: number;       // 월 매출 수동 (ERP 0 또는 실패 시 fallback · 2026-10-12 사용자 지시)
  extras: Array<{ id: string; label: string; amount: number }>;  // 사용자 추가 항목
}

const DEFAULT_COST: BusinessCostStructure = {
  rent: 20_000_000,
  hqFeeRate: 3,
  cardFeeRate: 1.2,
  utilities: 0,
  purchaseManual: 0,
  orderManual: 0,
  revenueManual: 0,
  extras: [],
};

// ─────────────────────────────────────────────────────────────
// Data types
// ─────────────────────────────────────────────────────────────

interface MonthlyRevenueResponse {
  ok: boolean;
  totalSale?: number;
  rows?: Array<{ SaleDate: string; SaleTotal: number }>;
}

type EmployeeExt = Employee & {
  working_hours_per_week?: number | null;
};

const AVG_WEEKS_PER_MONTH = 4.345;
const DEFAULT_HOURS_PER_WEEK = 40;

interface CostRow {
  key: string;
  label: string;
  amount: number;
  color: string;
}

// Linear/Vercel neutral 단색 그라데이션 (리서치 추천 팔레트)
const COLORS = {
  purchase: "#111827",
  payroll:  "#1f2937",
  order:    "#374151",
  rent:     "#4b5563",
  hqFee:    "#6b7280",
  cardFee:  "#9ca3af",
  utility:  "#d1d5db",
  etc:      "#e5e7eb",
};

const fmtWon = (n: number): string => `${Math.round(n).toLocaleString("ko-KR")}원`;
const fmtMan = (n: number): string => `${Math.round(n / 10000).toLocaleString("ko-KR")}만원`;
const currentYm = (): { year: number; month: number } => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
};

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export const BusinessCashFlow: React.FC = () => {
  const { settings } = useSettings();
  const [cost, setCost] = useState<BusinessCostStructure>(DEFAULT_COST);
  const [costLoading, setCostLoading] = useState(true);
  const [revenueErp, setRevenueErp] = useState<number>(0);
  const [revenueLoading, setRevenueLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeExt[]>([]);
  // 2026-10-12 · 사용자 지시 · ERP 매출 0 or 미연동 시 수동 입력값 fallback
  //   · 매출이 있어야 매출 대비 % 계산 가능
  const revenue = revenueErp > 0 ? revenueErp : (cost.revenueManual ?? 0);
  const revenueSource: "erp" | "manual" | "none" = revenueErp > 0 ? "erp" : (cost.revenueManual > 0 ? "manual" : "none");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BusinessCostStructure>(DEFAULT_COST);
  const [saving, setSaving] = useState(false);
  const { year, month } = currentYm();

  // Load cost structure settings
  useEffect(() => {
    (async () => {
      setCostLoading(true);
      try {
        const saved = await getSetting<BusinessCostStructure>(SETTING_KEY);
        if (saved && typeof saved === "object") {
          setCost({ ...DEFAULT_COST, ...saved, extras: Array.isArray(saved.extras) ? saved.extras : [] });
        }
      } catch {
        // use defaults
      } finally {
        setCostLoading(false);
      }
    })();
  }, []);

  // Load monthly revenue (ERP · 실패 or 0 이면 수동 입력 fallback)
  useEffect(() => {
    (async () => {
      setRevenueLoading(true);
      try {
        const { data } = await api.get<MonthlyRevenueResponse>(`/api/erp/sale-monthly-report?year=${year}&month=${month}`);
        const total = (data?.totalSale ?? 0) || (data?.rows ?? []).reduce((s, r) => s + (r.SaleTotal ?? 0), 0);
        setRevenueErp(total);
      } catch {
        setRevenueErp(0);
      } finally {
        setRevenueLoading(false);
      }
    })();
  }, [year, month]);

  // Load employees (payroll calc)
  useEffect(() => {
    (async () => {
      const list = await listEmployees().catch(() => [] as Employee[]);
      setEmployees(list as EmployeeExt[]);
    })();
  }, []);

  // Payroll calc (WageAnalysisTab 공식과 동일)
  const payrollEstimate = useMemo(() => {
    if (!settings || employees.length === 0) return 0;
    const active = employees.filter(e => !e.retireDate);
    let total = 0;
    for (const emp of active) {
      const resolution = resolveEmployeeWage(emp.id, emp.position, settings);
      if (resolution.status !== "configured" || !resolution.wage) continue;
      const hoursPerWeek = (emp.working_hours_per_week && Number.isFinite(emp.working_hours_per_week))
        ? emp.working_hours_per_week
        : DEFAULT_HOURS_PER_WEEK;
      total += Math.round(resolution.wage.weekday * hoursPerWeek * AVG_WEEKS_PER_MONTH);
    }
    return total;
  }, [employees, settings]);

  // Build cost rows (fixed order · neutral palette)
  const rows: CostRow[] = useMemo(() => {
    const hqFee = Math.round(revenue * (cost.hqFeeRate / 100));
    const cardFee = Math.round(revenue * (cost.cardFeeRate / 100));
    const base: CostRow[] = [
      { key: "purchase", label: "매입금액",      amount: cost.purchaseManual, color: COLORS.purchase },
      { key: "payroll",  label: "인건비",         amount: payrollEstimate,    color: COLORS.payroll  },
      { key: "order",    label: "발주금액",       amount: cost.orderManual,   color: COLORS.order    },
      { key: "rent",     label: "임대료",         amount: cost.rent,          color: COLORS.rent     },
      { key: "hqFee",    label: `본사수수료 (${cost.hqFeeRate}%)`,   amount: hqFee,     color: COLORS.hqFee   },
      { key: "cardFee",  label: `카드수수료 (${cost.cardFeeRate}%)`, amount: cardFee,   color: COLORS.cardFee },
      { key: "utility",  label: "공과금",         amount: cost.utilities,     color: COLORS.utility  },
    ];
    const extras: CostRow[] = cost.extras.map(e => ({ key: `extra-${e.id}`, label: e.label, amount: e.amount, color: COLORS.etc }));
    return [...base, ...extras].filter(r => r.amount > 0);
  }, [cost, revenue, payrollEstimate]);

  const totalCost = rows.reduce((s, r) => s + r.amount, 0);
  const profit = revenue - totalCost;
  const profitPct = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;

  // 2026-10-12 · 사용자 지시 "항목/금액/매출%/비용% 제거 → 인건비 구성 노출 + 매출 대비 인건비 %"
  //   · 직군(position) 별 그룹 · 각 그룹 인건비 합 · 직원수 · 비중 %
  const payrollBreakdown = useMemo(() => {
    if (!settings || employees.length === 0) return [] as Array<{ position: string; amount: number; count: number }>;
    const g = new Map<string, { amount: number; count: number }>();
    const active = employees.filter(e => !e.retireDate);
    for (const emp of active) {
      const resolution = resolveEmployeeWage(emp.id, emp.position, settings);
      if (resolution.status !== "configured" || !resolution.wage) continue;
      const hoursPerWeek = (emp.working_hours_per_week && Number.isFinite(emp.working_hours_per_week))
        ? emp.working_hours_per_week
        : DEFAULT_HOURS_PER_WEEK;
      const monthly = Math.round(resolution.wage.weekday * hoursPerWeek * AVG_WEEKS_PER_MONTH);
      const key = String(emp.position ?? "(직군 미지정)").trim() || "(직군 미지정)";
      const prev = g.get(key) ?? { amount: 0, count: 0 };
      g.set(key, { amount: prev.amount + monthly, count: prev.count + 1 });
    }
    return Array.from(g.entries())
      .map(([position, v]) => ({ position, ...v }))
      .sort((a, b) => b.amount - a.amount);
  }, [employees, settings]);
  // 매출 대비 인건비 비율 (ERP 매출 or 수동 매출 base)
  const payrollVsRevenuePct = revenue > 0 ? (payrollEstimate / revenue) * 100 : 0;

  const loading = costLoading || revenueLoading;

  // Edit handlers
  const startEdit = useCallback(() => {
    setDraft({ ...cost });
    setEditing(true);
  }, [cost]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setDraft(cost);
  }, [cost]);

  const saveEdit = useCallback(async () => {
    setSaving(true);
    try {
      await saveSetting(SETTING_KEY, draft);
      setCost(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const updateDraft = useCallback(<K extends keyof BusinessCostStructure>(k: K, v: BusinessCostStructure[K]) => {
    setDraft(prev => ({ ...prev, [k]: v }));
  }, []);

  const addExtra = useCallback(() => {
    setDraft(prev => ({
      ...prev,
      extras: [...prev.extras, { id: String(Date.now()), label: "", amount: 0 }],
    }));
  }, []);

  const removeExtra = useCallback((id: string) => {
    setDraft(prev => ({ ...prev, extras: prev.extras.filter(e => e.id !== id) }));
  }, []);

  const updateExtra = useCallback((id: string, patch: Partial<{ label: string; amount: number }>) => {
    setDraft(prev => ({
      ...prev,
      extras: prev.extras.map(e => e.id === id ? { ...e, ...patch } : e),
    }));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner label="현금흐름 로딩 중..." size={16} tone="brand" />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 md:p-5 flex flex-col gap-4">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-[12px] bg-slate-900 rounded-full" aria-hidden />
          <h2 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">현금흐름 구성</h2>
          <span className="text-[13px] text-slate-500">{year}-{String(month).padStart(2, "0")}</span>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[13px] text-slate-700 font-medium"
          >
            <PencilSimple size={14} /> 입력
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[13px] text-slate-600 disabled:opacity-50"
            >
              <X size={14} /> 취소
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={saving}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md bg-slate-900 text-white hover:bg-slate-800 text-[13px] font-medium disabled:opacity-50"
            >
              <FloppyDisk size={14} weight="bold" /> {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        )}
      </header>

      {/* 2026-10-12 · 사용자 지시 "월 매출/월 비용 합계/영업이익 KPI 제거 · 왼쪽 리스트로" */}

      {/* 100% Stacked Bar (요약 띠) */}
      {revenue > 0 && rows.length > 0 && (
        <div className="rounded-md overflow-hidden">
          <ResponsiveContainer width="100%" height={32}>
            <BarChart
              data={[rows.reduce<Record<string, any>>((acc, r) => { acc[r.key] = r.amount; return acc; }, { label: "cur" })]}
              layout="vertical"
              stackOffset="expand"
              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
              barCategoryGap={0}
            >
              <XAxis type="number" hide domain={[0, 1]} />
              <YAxis type="category" dataKey="label" hide />
              <Tooltip
                formatter={(v: any, name: string) => {
                  const row = rows.find(r => r.key === name);
                  return [fmtWon(Number(v) || 0), row?.label ?? name];
                }}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              {rows.map(r => (
                <Bar key={r.key} dataKey={r.key} stackId="a" fill={r.color} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 2026-10-12 · 사용자 지시 "항목/금액/매출%/비용% 제거 · 인건비 구성 노출 + 매출 대비 인건비 %" */}
      <section className="pt-2">
        {/* 요약 header · 전체 인건비 + 매출 대비 % */}
        <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-200 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="w-[3px] h-[14px] bg-indigo-500 rounded-full shrink-0" aria-hidden />
            <h3 className="text-[14px] md:text-[15px] font-semibold text-ink tracking-tight">인건비 구성</h3>
            <span className="text-[13px] text-slate-500 tabular-nums">· {payrollBreakdown.reduce((s, g) => s + g.count, 0)}명 · {payrollBreakdown.length}직군</span>
          </div>
          <div className="flex items-baseline gap-2 tabular-nums">
            <span className="text-[13px] text-slate-500">월 인건비</span>
            <span className="text-[16px] font-bold text-ink">{fmtMan(payrollEstimate)}</span>
            <span className="text-slate-300">·</span>
            <span className="text-[13px] text-slate-500">매출 대비</span>
            <span className={`text-[16px] font-bold ${payrollVsRevenuePct >= 35 ? "text-rose-600" : payrollVsRevenuePct >= 25 ? "text-amber-600" : payrollVsRevenuePct > 0 ? "text-emerald-700" : "text-slate-300"}`}>
              {payrollVsRevenuePct > 0 ? `${payrollVsRevenuePct.toFixed(1)}%` : "-"}
            </span>
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {payrollBreakdown.map(g => {
            const pct = payrollEstimate > 0 ? (g.amount / payrollEstimate) * 100 : 0;
            const pctRev = revenue > 0 ? (g.amount / revenue) * 100 : 0;
            return (
              <li key={g.position} className="flex items-center gap-3 py-2 text-[14px] md:text-[15px]">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0 bg-indigo-500" aria-hidden />
                <span className="flex-1 text-ink font-medium truncate min-w-0">{g.position}</span>
                <span className="w-14 text-right tabular-nums text-[13px] text-slate-500 shrink-0">{g.count}명</span>
                <span className="w-28 text-right tabular-nums text-ink shrink-0">{fmtMan(g.amount)}</span>
                <span className="w-16 text-right tabular-nums text-[14px] md:text-[15px] font-semibold text-ink shrink-0" title="매출 대비">
                  {pctRev > 0 ? `${pctRev.toFixed(1)}%` : "-"}
                </span>
                <span className="w-14 text-right tabular-nums text-[12px] text-slate-400 shrink-0 hidden sm:inline" title="인건비 대비 비중">
                  비중 {Math.round(pct)}%
                </span>
                <div className="w-24 md:w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0" title={`인건비 비중 ${Math.round(pct)}%`}>
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
          {payrollBreakdown.length === 0 && (
            <li className="py-6 text-center text-[14px] text-slate-400">
              인건비 구성 데이터 없음 · 직원 급여 설정 필요
            </li>
          )}
        </ul>
      </section>

      {/* Edit panel · inline table (사용자 Q1=b) */}
      {editing && (
        <div className="mt-2 pt-4 border-t border-slate-200 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="w-[3px] h-[12px] bg-violet-500 rounded-full" />
            <h3 className="text-[14px] md:text-[15px] font-semibold text-ink">비용 입력</h3>
            <span className="text-[12px] text-slate-500">* 수수료 %는 매출 비율 · 금액은 월 단위</span>
          </div>

          {/* 2026-10-12 · 사용자 지시 · ERP 매출 0 or 실패 시 수동 입력 fallback (매출 대비 % 계산용) */}
          <div className="bg-sky-50/50 border border-sky-200 rounded-md p-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[13px] text-slate-700 font-medium">월 매출 (수동 입력)</label>
              <span className="text-[12px] text-slate-500">
                ERP 매출 {revenueErp > 0 ? `${fmtMan(revenueErp)} 자동 사용` : "0 → 수동값 사용"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={draft.revenueManual}
                onChange={e => updateDraft("revenueManual", Math.max(0, Number(e.target.value) || 0))}
                className="flex-1 h-9 px-2.5 rounded-md border border-slate-200 bg-white text-[14px] text-right tabular-nums focus:border-slate-400 focus:outline-none"
                min={0}
                placeholder="예: 100000000"
              />
              <span className="text-[12px] text-slate-500 shrink-0">원</span>
            </div>
            <span className="text-[12px] text-slate-500">
              ERP 매출이 0일 때만 이 값 사용 · 매출 대비 % 계산 base
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <AmountField label="임대료 (월)"      value={draft.rent}           onChange={v => updateDraft("rent", v)} />
            <AmountField label="공과금 (월)"      value={draft.utilities}      onChange={v => updateDraft("utilities", v)} />
            <AmountField label="매입금액 (월)"    value={draft.purchaseManual} onChange={v => updateDraft("purchaseManual", v)} helper="Phase 2 ERP 자동 연동 예정" />
            <AmountField label="발주금액 (월)"    value={draft.orderManual}    onChange={v => updateDraft("orderManual", v)} helper="Phase 2 자동 연동 예정" />
            <PercentField label="본사수수료 (매출 %)" value={draft.hqFeeRate}    onChange={v => updateDraft("hqFeeRate", v)} />
            <PercentField label="카드수수료 (매출 %)" value={draft.cardFeeRate}  onChange={v => updateDraft("cardFeeRate", v)} />
          </div>

          {/* Extras */}
          <div className="flex items-center justify-between mt-2">
            <h4 className="text-[13px] text-slate-500 font-medium">기타 항목</h4>
            <button
              type="button"
              onClick={addExtra}
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-slate-200 hover:bg-slate-50 text-[12px] text-slate-700 font-medium"
            >
              <Plus size={12} weight="bold" /> 항목 추가
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {draft.extras.map(ex => (
              <div key={ex.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={ex.label}
                  onChange={e => updateExtra(ex.id, { label: e.target.value })}
                  placeholder="항목 이름 (예: 광고비)"
                  className="flex-1 h-9 px-2.5 rounded-md border border-slate-200 bg-white text-[14px] focus:border-slate-400 focus:outline-none"
                />
                <input
                  type="number"
                  value={ex.amount}
                  onChange={e => updateExtra(ex.id, { amount: Math.max(0, Number(e.target.value) || 0) })}
                  className="w-32 h-9 px-2.5 rounded-md border border-slate-200 bg-white text-[14px] text-right tabular-nums focus:border-slate-400 focus:outline-none"
                />
                <span className="text-[12px] text-slate-500">원</span>
                <button
                  type="button"
                  onClick={() => removeExtra(ex.id)}
                  className="p-1.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                  aria-label="삭제"
                >
                  <Trash size={14} />
                </button>
              </div>
            ))}
            {draft.extras.length === 0 && (
              <div className="text-[13px] text-slate-400">+ 항목 추가 버튼으로 공과금 외 비용을 추가하세요.</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

// ─────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────

const MetaTile: React.FC<{
  label: string;
  value: string;
  tone: "slate" | "emerald" | "rose";
  badge?: string;
  badgeTone?: "emerald" | "sky" | "amber";
}> = ({ label, value, tone, badge, badgeTone }) => (
  <div className="bg-slate-50/70 border border-slate-200 rounded-md px-3 py-2 flex flex-col gap-0.5">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[13px] text-slate-500 font-medium">{label}</span>
      {badge && (
        <span className={`text-[11px] px-1.5 py-[1px] rounded font-medium border ${
          badgeTone === "emerald" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : badgeTone === "sky" ? "bg-sky-50 text-sky-700 border-sky-200"
          : "bg-amber-50 text-amber-700 border-amber-200"
        }`}>
          {badge}
        </span>
      )}
    </div>
    <span className={`text-[15px] md:text-[16px] font-semibold tabular-nums ${
      tone === "emerald" ? "text-emerald-700" : tone === "rose" ? "text-rose-700" : "text-ink"
    }`}>
      {value}
    </span>
  </div>
);

const AmountField: React.FC<{ label: string; value: number; onChange: (v: number) => void; helper?: string }> = ({ label, value, onChange, helper }) => (
  <label className="flex flex-col gap-1">
    <span className="text-[13px] text-slate-600 font-medium">{label}</span>
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        value={value}
        onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="flex-1 h-9 px-2.5 rounded-md border border-slate-200 bg-white text-[14px] text-right tabular-nums focus:border-slate-400 focus:outline-none"
        min={0}
      />
      <span className="text-[12px] text-slate-500 shrink-0">원</span>
    </div>
    {helper && <span className="text-[12px] text-slate-400">{helper}</span>}
  </label>
);

const PercentField: React.FC<{ label: string; value: number; onChange: (v: number) => void }> = ({ label, value, onChange }) => (
  <label className="flex flex-col gap-1">
    <span className="text-[13px] text-slate-600 font-medium">{label}</span>
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        value={value}
        onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="flex-1 h-9 px-2.5 rounded-md border border-slate-200 bg-white text-[14px] text-right tabular-nums focus:border-slate-400 focus:outline-none"
        min={0}
        step="0.1"
      />
      <span className="text-[12px] text-slate-500 shrink-0">%</span>
    </div>
  </label>
);

export default BusinessCashFlow;
