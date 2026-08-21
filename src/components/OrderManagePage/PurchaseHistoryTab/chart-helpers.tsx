// src/components/OrderManagePage/PurchaseHistoryTab/chart-helpers.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · PurchaseSubTabs 차트 헬퍼 이관
// 프레임워크: Card variant="raw-md"
import React from "react";
import { Card } from "../../common/Card";

// 공통 팔레트 · 6색 + 기타 회색
export const CHART_COLORS = [
  "#10b981", // emerald-500
  "#3b82f6", // blue-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#84cc16", // lime-500
  "#64748b", // zinc-500 (기타/초과)
  "#a78bfa", // violet-400
];

// 공통 커스텀 툴팁
export const ChartTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { fill?: string } }>;
  total: number;
  unit?: string;
}> = ({ active, payload, total, unit = "원" }) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
  return (
    <Card variant="raw-md" rounded="lg" padding="none" className="px-3 py-2 text-[11px] min-w-[120px]">
      <div className="font-semibold text-zinc-700 mb-1 break-words whitespace-normal leading-snug">{name}</div>
      <div className="tabular-nums text-emerald-700 font-bold">{value.toLocaleString()}{unit}</div>
      <div className="tabular-nums text-zinc-500 mt-0.5">{pct}%</div>
    </Card>
  );
};

// 공통 범례 · 색깔 · 이름 · 퍼센트 세로 리스트
export const ChartLegendList: React.FC<{
  items: Array<{ name: string; value: number; color: string }>;
  total: number;
}> = ({ items, total }) => (
  <div className="flex flex-col gap-1 min-w-0">
    {items.map((it, i) => (
      <div key={i} className="flex items-center gap-1.5 min-w-0 text-[11px]">
        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: it.color }} />
        <span className="flex-1 min-w-0 text-zinc-700 font-semibold break-words whitespace-normal leading-snug">{it.name}</span>
        <span className="tabular-nums text-zinc-500 shrink-0">
          {total > 0 ? ((it.value / total) * 100).toFixed(0) : 0}%
        </span>
      </div>
    ))}
  </div>
);

// 카테고리 분류 · 상품명 prefix 기반 (product_name 에 카테고리 필드 없으므로)
export const CATEGORY_KEYWORDS: Array<{ label: string; pattern: RegExp }> = [
  { label: "의약품",  pattern: /정|캡슐|시럽|주사|연고|좌약|앰플|밀리/ },
  { label: "건강기능식품", pattern: /비타민|오메가|유산균|프로바이|콜라겐|루테인|홍삼/ },
  { label: "위생용품", pattern: /마스크|장갑|소독|밴드|패드|면봉/ },
  { label: "의료기기", pattern: /혈압|체온|혈당|측정|검사/ },
  { label: "화장품",  pattern: /크림|로션|선크림|세럼|토너/ },
];

export function classifyProduct(name: string): string {
  const n = name.toLowerCase();
  for (const c of CATEGORY_KEYWORDS) {
    if (c.pattern.test(n)) return c.label;
  }
  return "기타";
}
