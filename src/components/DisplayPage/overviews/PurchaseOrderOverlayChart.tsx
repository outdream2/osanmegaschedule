// 2026-10-12 · 사용자 지시 · 매입/발주 overlay chart 공통 모듈
//   · 매입재고현황 "일별 매입금액" bar(매입) + Lollipop(발주)
//   · 발주반품현황 "일별 발주금액" bar(발주) + Lollipop(매입)
//   · 2026-10-12 재지시: "꺾은선 말고" "매일 일어나는 일이 아니라서 sparse" · Line → Lollipop (얇은 stick + top dot)
//   · recharts ComposedChart · Bar (primary · 두꺼운 막대) + Bar (overlay stick · 2px) + Line (dot only · stroke=transparent)
//   · 홈 랜딩 톤 · CARD + 3px 세로줄 header · 2-tier typography

import React, { useMemo } from "react";
import { ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

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
        {/* 2026-10-12 · 사용자 지시 "범례를 그래프 내에 보기 좋게" · 커스텀 inline 범례
            · primary = 두꺼운 사각형 (Bar) · overlay = Lollipop (stick + head) 미니어처
            · recharts Legend 제거 · 홈 톤 compact */}
        <div className="flex items-center gap-4 px-2 pb-2 text-[12px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: barColor }} aria-hidden />
            <span className="text-slate-600 font-medium">{primaryLabel}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            {/* Lollipop 미니어처 (stick + head) */}
            <span className="relative inline-block" style={{ width: 10, height: 12 }} aria-hidden>
              <span className="absolute left-1/2 bottom-0" style={{ transform: "translateX(-50%)", width: 2, height: "100%", background: lineColor }} />
              <span className="absolute left-1/2" style={{ transform: "translate(-50%, 0)", top: -1, width: 6, height: 6, borderRadius: "50%", background: lineColor }} />
            </span>
            <span className="text-slate-600 font-medium">{overlayLabel}</span>
          </span>
        </div>
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
              {/* 2026-10-12 · 범례는 chart 상단 custom inline 으로 이동 · recharts Legend 제거 */}
              {/* primary · 두꺼운 bar (매입/발주 주 지표) */}
              <Bar dataKey="primary" name={primaryLabel} fill={barColor} isAnimationActive={false} radius={[2, 2, 0, 0]} />
              {/* overlay · Lollipop (stick + head) · 2026-10-12 사용자 지시 "매입이 막대랑 롤리 둘 다 나와" fix
                  · Bar 1개 + Line 분리 → Bar 1개로 통합 (custom shape 로 stick + dot 함께 그림)
                  · value <= 0 → null return (자동 숨김 · 사용자 "0이면 표시하지마" 지시) */}
              <Bar
                dataKey="overlay"
                name={overlayLabel}
                fill={lineColor}
                isAnimationActive={false}
                shape={(props: any) => {
                  const v = Number(props?.payload?.overlay ?? 0);
                  if (!Number.isFinite(v) || v <= 0) return <g />;
                  const { x, y, width, height } = props;
                  const cx = x + width / 2;
                  const stickTopY = y;
                  const stickBottomY = y + height;
                  return (
                    <g>
                      {/* Lollipop stick (얇은 세로선) */}
                      <line x1={cx} y1={stickBottomY} x2={cx} y2={stickTopY} stroke={lineColor} strokeWidth={2} />
                      {/* Lollipop head (상단 원) */}
                      <circle cx={cx} cy={stickTopY} r={5} fill={lineColor} />
                    </g>
                  );
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
