// src/components/OrderManagePage/CardHistoryPage.tsx
// 2026-09-02 · #69 · 카드별 결제내역 대시보드 (매장>결제>카드별결제내역)
//   · 사용자 지시 · 카드별 결제 현황 · 차월 결제 예정액 · 개별 내역
//   · 최신 트렌드 · Linear/Vercel 2026 · KPI + Chart + Table
//   · 폰트 기본 +2

import React, { useEffect, useMemo, useState } from "react";
import {
  CreditCard as CreditCardIcon, TrendingUp, Calendar, Wallet,
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { api } from "../../lib/apiClient";
import { Card } from "../common/Card";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { IconTile } from "../common/IconTile";
import type { CardSummary } from "../../shared/schemas/creditCards";

const fmtWon = (n: number): string => n > 0 ? n.toLocaleString() + "원" : "-";
const fmtWonShort = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (abs >= 10_000)      return `${(n / 10_000).toFixed(0)}만`;
  return n.toLocaleString();
};

// 카드사별 브랜드 컬러 (Vercel palette 톤)
const ISSUER_COLOR: Record<string, string> = {
  BC:  "#e11d48", 국민: "#f59e0b", 삼성: "#2563eb", 현대: "#1e40af",
  신한: "#0284c7", 롯데: "#dc2626", 하나: "#16a34a", 우리: "#0f766e",
  농협: "#059669", 씨티: "#7c3aed", 기타: "#71717a",
};

export const CardHistoryPage: React.FC = () => {
  const [summaries, setSummaries] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get<CardSummary[]>("/api/credit-cards/summary");
        if (alive) {
          const list = Array.isArray(data) ? data : [];
          setSummaries(list);
          if (list.length > 0 && selectedCardId == null) setSelectedCardId(list[0].card.id);
        }
      } catch (e: any) {
        if (alive) setError(e?.message ?? "로드 실패");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 전체 KPI ──────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const totalPaid = summaries.reduce((s, x) => s + x.totalAmount, 0);
    const currentBill = summaries.reduce((s, x) => s + x.currentBillingAmount, 0);
    const nextBill = summaries.reduce((s, x) => s + x.nextBillingAmount, 0);
    const totalCount = summaries.reduce((s, x) => s + x.totalCount, 0);
    return { totalPaid, currentBill, nextBill, totalCount, cardCount: summaries.length };
  }, [summaries]);

  // ── 카드별 파이 (총 결제 share) ─────────────────────────────
  const pieData = useMemo(() => summaries.map(s => ({
    name: `${s.card.issuer}${s.card.alias ? " " + s.card.alias : ""}`,
    value: s.totalAmount,
    id: s.card.id,
    color: ISSUER_COLOR[s.card.issuer] ?? "#71717a",
  })).filter(d => d.value > 0), [summaries]);

  // ── 월별 stacked bar (카드별 monthly) · 최근 12개월 ──────────
  const monthlyStacked = useMemo(() => {
    const months = summaries[0]?.monthly.map(m => m.month) ?? [];
    return months.map(month => {
      const row: Record<string, any> = { month: month.slice(2).replace("-", "/") };
      for (const s of summaries) {
        const m = s.monthly.find(x => x.month === month);
        const key = `${s.card.issuer}${s.card.alias ? " " + s.card.alias : ""}`;
        row[key] = m?.amount ?? 0;
      }
      return row;
    });
  }, [summaries]);

  const selectedSummary = useMemo(
    () => summaries.find(s => s.card.id === selectedCardId) ?? null,
    [summaries, selectedCardId],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size={18} tone="brand" label="카드별 결제 현황 로딩 중..." labelSize={16} />
      </div>
    );
  }

  if (error) {
    return (
      <Card variant="flat" bg="bg-rose-50" borderColor="border-rose-200" padding="md" className="text-[15px] text-rose-700">
        ⚠ {error}
      </Card>
    );
  }

  if (summaries.length === 0) {
    return (
      <EmptyState
        icon={CreditCardIcon}
        title="등록된 카드가 없습니다"
        hint="[결제카드등록] 탭에서 카드를 먼저 등록해주세요"
        size="normal"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-2 overflow-auto h-full">
      {/* ─── 상단 KPI 4개 · Vercel 톤 · mono neutral + accent ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile
          icon={<CreditCardIcon size={16} />}
          tone="brand"
          label="등록 카드"
          value={`${kpi.cardCount}장`}
          sub={`총 ${kpi.totalCount.toLocaleString()}건 결제`}
        />
        <KpiTile
          icon={<Wallet size={16} />}
          tone="emerald"
          label="총 결제 (12개월)"
          value={fmtWon(kpi.totalPaid)}
        />
        <KpiTile
          icon={<Calendar size={16} />}
          tone="amber"
          label="이번달 결제 예정"
          value={fmtWon(kpi.currentBill)}
          sub="당월 결제일 청구액"
        />
        <KpiTile
          icon={<TrendingUp size={16} />}
          tone="rose"
          label="차월 결제 예정 · 합산"
          value={fmtWon(kpi.nextBill)}
          sub="다음달 결제일 청구액"
          emphasis
        />
      </div>

      {/* ─── 카드별 · 차월 결제 예정 (사용자 지시 · 각 카드 클릭 시 · 상세 아래 접혀 노출) ─── */}
      <Card padding="md" topAccent>
        <div className="flex items-center gap-2 mb-3">
          <IconTile icon={<TrendingUp size={14} />} tone="rose" size="sm" />
          <div className="text-[18px] font-bold text-ink">카드별 · 차월 결제 예정</div>
          <div className="ml-auto text-[14px] text-ink-soft">카드 클릭 시 · 상세 접기 열림</div>
        </div>
        <div className="space-y-2">
          {summaries.map(s => {
            const isOpen = selectedCardId === s.card.id;
            const color = ISSUER_COLOR[s.card.issuer] ?? "#71717a";
            return (
              <div
                key={s.card.id}
                className={`rounded-xl border-2 overflow-hidden transition ${
                  isOpen ? "border-brand-deep bg-brand-tint/20 shadow-md" : "border-line bg-white hover:border-brand-deep/30"
                }`}
              >
                {/* 카드 요약 (button · 클릭 · 접기 토글) */}
                <button
                  type="button"
                  onClick={() => setSelectedCardId(prev => prev === s.card.id ? null : s.card.id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-4 flex-wrap cursor-pointer"
                  aria-expanded={isOpen}
                >
                  <span className="inline-flex items-center gap-2 shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                    <span className="text-[18px] font-bold text-ink">{s.card.issuer}</span>
                    {s.card.alias && <span className="text-[15px] text-zinc-600">· {s.card.alias}</span>}
                    {s.card.last4 && <span className="text-[14px] text-zinc-400 font-mono">**** {s.card.last4}</span>}
                    <span className="text-[13px] text-zinc-400">· {s.card.billing_day}일 결제</span>
                  </span>
                  <span className="inline-flex items-baseline gap-1.5 ml-auto">
                    <span className="text-[14px] text-zinc-500 font-semibold">이번달</span>
                    <span className="text-[17px] font-bold text-amber-600 tabular-nums">{fmtWon(s.currentBillingAmount)}</span>
                  </span>
                  <span className="inline-flex items-baseline gap-1.5">
                    <span className="text-[14px] text-rose-500 font-semibold">차월</span>
                    <span className="text-[20px] font-extrabold text-rose-600 tabular-nums">{fmtWon(s.nextBillingAmount)}</span>
                    <span className="text-[13px] text-zinc-400 tabular-nums">({s.nextBillingDate})</span>
                  </span>
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-400 transition-transform shrink-0 ${isOpen ? "rotate-180 text-brand-deep" : ""}`}>
                    ▾
                  </span>
                </button>

                {/* 상세 (접기 · KPI + 월별 mini bar) */}
                {isOpen && (
                  <div className="border-t border-zinc-100 bg-white/60 px-4 py-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* 좌 · KPI 4 */}
                      <div className="space-y-2 text-[16px]">
                        <div className="flex justify-between py-1.5 border-b border-zinc-100">
                          <span className="text-zinc-500">총 결제 (12개월)</span>
                          <span className="font-bold text-brand-deep tabular-nums">{fmtWon(s.totalAmount)}</span>
                        </div>
                        <div className="flex justify-between py-1.5 border-b border-zinc-100">
                          <span className="text-zinc-500">총 건수</span>
                          <span className="font-bold text-ink tabular-nums">{s.totalCount.toLocaleString()}건</span>
                        </div>
                        <div className="flex justify-between py-1.5 border-b border-zinc-100">
                          <span className="text-zinc-500">이번달 결제 예정 ({s.currentBillingDate})</span>
                          <span className="font-bold text-amber-600 tabular-nums">{fmtWon(s.currentBillingAmount)}</span>
                        </div>
                        <div className="flex justify-between py-1.5">
                          <span className="text-zinc-500">차월 결제 예정 ({s.nextBillingDate})</span>
                          <span className="font-extrabold text-rose-600 tabular-nums text-[19px]">{fmtWon(s.nextBillingAmount)}</span>
                        </div>
                      </div>
                      {/* 우 · 월별 mini bar (12개월) */}
                      <div style={{ width: "100%", height: 180 }}>
                        <ResponsiveContainer>
                          <BarChart data={s.monthly.map(m => ({ month: m.month.slice(2).replace("-", "/"), amount: m.amount }))} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="month" fontSize={12} stroke="#71717a" />
                            <YAxis fontSize={12} stroke="#71717a" tickFormatter={fmtWonShort} />
                            <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()}원`} contentStyle={{ fontSize: 14 }} />
                            <Bar dataKey="amount" fill={color} radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ─── 카드별 · 월별 stacked bar chart ─── */}
      <Card padding="md" topAccent>
        <div className="flex items-center gap-2 mb-3">
          <IconTile icon={<Wallet size={14} />} tone="brand" size="sm" />
          <div className="text-[18px] font-bold text-ink">월별 결제 · 카드별 (최근 12개월)</div>
        </div>
        {monthlyStacked.every(m => Object.entries(m).filter(([k]) => k !== "month").every(([, v]) => Number(v) === 0)) ? (
          <EmptyState icon={Wallet} title="결제 내역 없음" hint="카드 결제가 발생하면 여기 표시됩니다" size="normal" />
        ) : (
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={monthlyStacked} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" fontSize={13} stroke="#71717a" />
                <YAxis fontSize={13} stroke="#71717a" tickFormatter={fmtWonShort} />
                <Tooltip
                  formatter={(v: any) => `${Number(v).toLocaleString()}원`}
                  contentStyle={{ fontSize: 14, border: "1px solid #d4d4d8", borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                {summaries.map(s => {
                  const key = `${s.card.issuer}${s.card.alias ? " " + s.card.alias : ""}`;
                  return (
                    <Bar
                      key={s.card.id}
                      dataKey={key}
                      stackId="a"
                      fill={ISSUER_COLOR[s.card.issuer] ?? "#71717a"}
                      radius={[4, 4, 0, 0]}
                    />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* ─── 카드별 share pie chart (선택 카드 상세는 위 accordion 에 통합됨) ─── */}
      <Card padding="md" topAccent>
        <div className="flex items-center gap-2 mb-3">
          <IconTile icon={<CreditCardIcon size={14} />} tone="violet" size="sm" />
          <div className="text-[18px] font-bold text-ink">카드별 · 총 결제 비중</div>
        </div>
        {pieData.length === 0 ? (
          <EmptyState icon={CreditCardIcon} title="결제 없음" size="normal" />
        ) : (
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(e: any) => `${e.name} ${(e.percent * 100).toFixed(0)}%`}
                  labelLine={false}
                  fontSize={13}
                >
                  {pieData.map(d => <Cell key={d.id} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()}원`} contentStyle={{ fontSize: 14 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
};

// ── KPI 타일 ────────────────────────────────────────────────────
interface KpiTileProps {
  icon: React.ReactNode;
  tone: "brand" | "emerald" | "amber" | "rose" | "violet";
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
}

const TONE_MAP: Record<KpiTileProps["tone"], { dot: string; text: string }> = {
  brand:   { dot: "bg-brand-deep",  text: "text-brand-deep"  },
  emerald: { dot: "bg-emerald-500", text: "text-emerald-700" },
  amber:   { dot: "bg-amber-500",   text: "text-amber-700"   },
  rose:    { dot: "bg-rose-500",    text: "text-rose-600"    },
  violet:  { dot: "bg-violet-500",  text: "text-violet-700"  },
};

const KpiTile: React.FC<KpiTileProps> = ({ icon, tone, label, value, sub, emphasis }) => {
  const t = TONE_MAP[tone];
  return (
    <Card padding="md" topAccent className={emphasis ? "ring-2 ring-rose-200" : ""}>
      <div className="flex items-center gap-2 mb-2">
        <IconTile icon={icon} tone={tone} size="sm" />
        <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
        <span className="text-[15px] font-semibold text-zinc-500">{label}</span>
      </div>
      <div className={`text-[24px] font-extrabold tabular-nums leading-tight ${t.text}`}>{value}</div>
      {sub && <div className="text-[13px] text-zinc-400 mt-0.5">{sub}</div>}
    </Card>
  );
};

export default CardHistoryPage;
