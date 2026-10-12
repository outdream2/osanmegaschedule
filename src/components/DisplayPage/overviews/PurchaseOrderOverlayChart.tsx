// 2026-10-12 · 사용자 지시 · 매입/발주 overlay chart 공통 모듈
//   · 매입재고현황 "일별 매입금액" bar(매입) + Lollipop(발주)
//   · 발주반품현황 "일별 발주금액" bar(발주) + Lollipop(매입)
//   · 2026-10-12 재지시: "꺾은선 말고" "매일 일어나는 일이 아니라서 sparse" · Line → Lollipop (얇은 stick + top dot)
//   · recharts ComposedChart · Bar (primary · 두꺼운 막대) + Bar (overlay stick · 2px) + Line (dot only · stroke=transparent)
//   · 홈 랜딩 톤 · CARD + 3px 세로줄 header · 2-tier typography

import React, { useMemo } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

const CARD = "bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]";

export interface PurchaseOrderOverlayDatum {
  date: string;
  primary: number;
  overlay: number;
}

export interface PurchaseOrderOverlayChartProps {
  title: string;
  data: PurchaseOrderOverlayDatum[];
  periodLabel: string;
  primaryLabel: string;
  overlayLabel: string;
  /** bar color (primary) · default: brand-deep */
  barColor?: string;
  /** line color (overlay) · default: rose */
  lineColor?: string;
  /** header strip 색상 tone */
  stripColor?: string;
  /** right slot · chart mode toggle 등 */
  right?: React.ReactNode;
}

const fmt = (n: number): string => Math.round(n).toLocaleString("ko-KR");
const fmtShort = (n: number): string => {
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (abs >= 10_000_000) return `${Math.round(n / 1_000_000)}백만`;
  if (abs >= 10_000) return `${Math.round(n / 10_000)}만`;
  return n.toLocaleString();
};

export const PurchaseOrderOverlayChart: React.FC<PurchaseOrderOverlayChartProps> = ({
  title, data, periodLabel,
  primaryLabel, overlayLabel,
  barColor = "#0A4F44",
  lineColor = "#E11D48",
  stripColor = "bg-sky-500",
  right,
}) => {
  const totals = useMemo(() => {
    let p = 0, o = 0;
    for (const d of data) { p += d.primary; o += d.overlay; }
    return { primary: p, overlay: o, avgP: data.length > 0 ? Math.round(p / data.length) : 0 };
  }, [data]);

  return (
    <section className={`${CARD} overflow-hidden`}>
      <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100">
        <span className={`w-[3px] h-[16px] ${stripColor} rounded-full shrink-0`} aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">{title}</h3>
          <p className="text-[13px] md:text-[14px] text-slate-500 mt-0.5">
            {periodLabel} · {primaryLabel} 총 {fmt(totals.primary)}원 · 일평균 {fmt(totals.avgP)}원 · {overlayLabel} 총 {fmt(totals.overlay)}원
          </p>
        </div>
        {right}
      </header>
      <div className="px-3 py-4">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => String(v).slice(5)}
                tick={{ fontSize: 12, fill: "#64748b" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#64748b" }}
                tickFormatter={(v) => fmtShort(Number(v))}
                width={56}
              />
              <Tooltip
                formatter={(value: any, name: any) => [`${fmt(Number(value))}원`, name]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" />
              {/* primary · 두꺼운 bar (매입/발주 주 지표) */}
              <Bar dataKey="primary" name={primaryLabel} fill={barColor} isAnimationActive={false} radius={[2, 2, 0, 0]} />
              {/* overlay · Lollipop stick (얇은 2px bar) · recharts Bar 는 값=0 자동 숨김 (높이 0) */}
              <Bar dataKey="overlay" name={overlayLabel} fill={lineColor} isAnimationActive={false} barSize={2} radius={[1, 1, 0, 0]} legendType="none" />
              {/* overlay · Lollipop head · 2026-10-12 사용자 지시 "0이면 Lollipop 표시하지마"
                  · dot/activeDot 를 function 으로 교체 · payload.overlay <= 0 이면 null return */}
              <Line
                type="monotone"
                dataKey="overlay"
                name={overlayLabel}
                stroke="transparent"
                isAnimationActive={false}
                dot={(props: any) => {
                  const v = Number(props?.payload?.overlay ?? 0);
                  if (!Number.isFinite(v) || v <= 0) return <g key={props?.key} />;
                  return <circle key={props?.key} cx={props.cx} cy={props.cy} r={5} fill={lineColor} strokeWidth={0} />;
                }}
                activeDot={(props: any) => {
                  const v = Number(props?.payload?.overlay ?? 0);
                  if (!Number.isFinite(v) || v <= 0) return <g key={props?.key} />;
                  return <circle key={props?.key} cx={props.cx} cy={props.cy} r={6} fill={lineColor} strokeWidth={0} />;
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
};

export default PurchaseOrderOverlayChart;
