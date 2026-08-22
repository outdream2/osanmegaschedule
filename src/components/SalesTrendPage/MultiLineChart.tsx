// src/components/SalesTrendPage/MultiLineChart.tsx
// 2026-08-22 · Framework Phase 4 · SalesTrendPage.tsx 에서 분리
import React, { useState } from "react";
import { fmtWon } from "../../lib/format";
import type { ChartSeries, LineChartProps } from "./SalesTrendPage.helpers";
import { fmt, niceScale } from "./SalesTrendPage.helpers";

// ─── 라인 + 막대 혼합 차트 (듀얼 축: 라인=상단 판매/매입, 막대=하단 재고 흐린 색) ────
export const MultiLineChartInner: React.FC<LineChartProps> = ({ labels, series, height = 320 }) => {
  const W = 720;
  const H = height;
  const padL = 58, padR = 58, padT = 18, padB = 40;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const n = labels.length;
  if (n === 0) return <div className="text-center text-zinc-400 text-xs py-8">데이터 없음</div>;

  const lineSeries = series.filter(s => s.kind !== "bar");
  const barSeries = series.filter(s => s.kind === "bar");

  // 듀얼 축 스케일:
  //   라인(판매/매입): 상단 60% 영역 (padT ~ padT + 0.60 chartH)
  //   막대(재고):     하단 40% 영역 (padT + 0.60 chartH ~ H - padB)
  const lineAreaH = chartH * 0.60;
  const barAreaH = chartH * 0.40;
  const lineTop = padT;
  const barTop = padT + lineAreaH;

  const lineRaw = Math.max(1, ...lineSeries.flatMap(s => s.values));
  const barRaw = Math.max(1, ...barSeries.flatMap(s => s.values));
  const lineScale = niceScale(lineRaw);
  const barScale = niceScale(barRaw);
  const lineMax = lineScale.niceMax;
  const barMax = barScale.niceMax;

  const xAt = (i: number) => padL + (n === 1 ? chartW / 2 : (chartW * i) / (n - 1));
  const yLine = (v: number) => lineTop + lineAreaH - (v / lineMax) * lineAreaH;
  const yBar = (v: number) => barTop + barAreaH - (v / barMax) * barAreaH;

  // Y축 격자 (라인 · 막대 영역 각각 nice tick)
  const lineTicks = lineScale.ticks;
  const barTicks = [barScale.ticks[0], barScale.ticks[Math.floor(barScale.ticks.length / 2)], barScale.ticks[barScale.ticks.length - 1]];

  const slotW = n === 1 ? chartW * 0.4 : chartW / (n - 1) * 0.7;
  const barW = barSeries.length > 0 ? Math.max(6, slotW / barSeries.length) : 0;

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W - padL;
    if (x < 0 || x > chartW) { setHoverIdx(null); return; }
    const i = n === 1 ? 0 : Math.round((x / chartW) * (n - 1));
    setHoverIdx(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div className="w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* 라인 영역 격자 · 좌측 Y라벨 (판매/매입) */}
        {lineTicks.map((v, i) => (
          <g key={`ly-${i}`}>
            <line x1={padL} y1={yLine(v)} x2={W - padR} y2={yLine(v)} stroke="#e2e8f0" strokeDasharray="2 3" />
            <text x={padL - 6} y={yLine(v) + 3} textAnchor="end" fontSize="12" fill="#64748b">
              {Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}만` : fmt(Math.round(v))}
            </text>
          </g>
        ))}
        {/* 라인/막대 영역 구분선 */}
        <line x1={padL} y1={barTop} x2={W - padR} y2={barTop} stroke="#cbd5e1" strokeWidth={1.2} />
        {/* 막대 영역 우측 Y라벨 (재고) */}
        {barTicks.map((v, i) => (
          <g key={`by-${i}`}>
            <line x1={padL} y1={yBar(v)} x2={W - padR} y2={yBar(v)} stroke="#f1f5f9" strokeDasharray="1 3" />
            <text x={W - padR + 4} y={yBar(v) + 3} textAnchor="start" fontSize="12" fill="#818cf8">
              {Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}만` : fmt(Math.round(v))}
            </text>
          </g>
        ))}
        {/* 영역 라벨 (좌측 상단·좌측 중단) */}
        <text x={padL} y={padT + 8} fontSize="11" fill="#dc2626" fontWeight="bold">판매·종료재고 (좌축)</text>
        <text x={padL} y={barTop + 8} fontSize="11" fill="#10b981" fontWeight="bold">매입 (우축)</text>

        {/* X축 라벨 */}
        {labels.map((lb, i) => {
          if (n > 8 && i % Math.ceil(n / 8) !== 0 && i !== n - 1) return null;
          return (
            <text key={`x-${i}`} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#475569">
              {lb}
            </text>
          );
        })}

        {/* 매입 막대 (하단) · 0 값은 그리지 않음 */}
        {barSeries.map((s, si) => (
          <g key={`bar-${si}`}>
            {s.values.map((v, i) => {
              if (v <= 0) return null;
              const x = xAt(i) - (barSeries.length * barW) / 2 + si * barW;
              const y = yBar(v);
              const h = Math.max(1, yBar(0) - y);
              return (
                <g key={`b-${si}-${i}`}>
                  <rect
                    x={x} y={y}
                    width={barW * 0.85} height={h}
                    fill={s.color}
                    opacity={0.55}
                    rx={1.5}
                  />
                  <text
                    x={x + barW * 0.425}
                    y={y - 3}
                    textAnchor="middle"
                    fontSize="10"
                    fill={s.color}
                    fontWeight="bold"
                  >{fmt(v)}</text>
                </g>
              );
            })}
          </g>
        ))}

        {/* 판매·종료재고 라인 + 값 라벨 · 0값은 gap 처리 (다음 non-zero 점과 연결) */}
        {lineSeries.map((s, si) => {
          const segments: Array<Array<{ i: number; v: number }>> = [];
          let curSeg: Array<{ i: number; v: number }> = [];
          for (let i = 0; i < s.values.length; i++) {
            const v = s.values[i];
            if (v > 0) curSeg.push({ i, v });
            else if (curSeg.length > 0) { segments.push(curSeg); curSeg = []; }
          }
          if (curSeg.length > 0) segments.push(curSeg);
          return (
            <g key={`line-${si}`}>
              {segments.map((seg, segIdx) => (
                <polyline
                  key={`seg-${si}-${segIdx}`}
                  points={seg.map(p => `${xAt(p.i)},${yLine(p.v)}`).join(" ")}
                  fill="none" stroke={s.color} strokeWidth={2.5}
                  strokeLinejoin="round" strokeLinecap="round"
                />
              ))}
              {s.values.map((v, i) => v > 0 ? (
                <g key={`p-${si}-${i}`}>
                  <circle cx={xAt(i)} cy={yLine(v)} r={3.5} fill="white" stroke={s.color} strokeWidth={2} />
                  <text
                    x={xAt(i)}
                    y={yLine(v) - 8}
                    textAnchor="middle"
                    fontSize="11"
                    fill={s.color}
                    fontWeight="bold"
                  >{fmt(v)}</text>
                </g>
              ) : null)}
            </g>
          );
        })}

        {/* Hover crosshair */}
        {hoverIdx != null && (
          <g>
            <line x1={xAt(hoverIdx)} y1={padT} x2={xAt(hoverIdx)} y2={H - padB} stroke="#94a3b8" strokeDasharray="3 3" />
            {lineSeries.map((s, si) => (
              <circle key={`hc-${si}`} cx={xAt(hoverIdx)} cy={yLine(s.values[hoverIdx])} r={5.5} fill="white" stroke={s.color} strokeWidth={2.5} />
            ))}
          </g>
        )}
      </svg>
      {/* 범례 + hover 상세 */}
      <div className="flex items-center gap-3 mt-2 flex-wrap text-[11px]">
        {series.map((s, si) => (
          <div key={`lg-${si}`} className="flex items-center gap-1">
            {s.kind === "bar"
              ? <span className="w-3 h-2.5 rounded-sm" style={{ background: s.color, opacity: 0.35 }} />
              : <span className="w-3 h-0.5 rounded" style={{ background: s.color }} />
            }
            <span className="font-bold text-zinc-600">{s.label}</span>
            {hoverIdx != null && (
              <span className="tabular-nums text-zinc-800">
                {s.format === "won" ? fmtWon(s.values[hoverIdx]) : fmt(s.values[hoverIdx])}
              </span>
            )}
          </div>
        ))}
        {hoverIdx != null && (
          <span className="ml-auto text-zinc-500 tabular-nums font-bold">{labels[hoverIdx]}</span>
        )}
      </div>
    </div>
  );
};

// React.memo · props 얕은 비교 · 그래프 모달 열림/닫힘 시 재렌더링 최소화
export const MultiLineChart = React.memo(MultiLineChartInner);
