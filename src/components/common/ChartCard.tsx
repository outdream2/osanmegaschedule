// src/components/common/ChartCard.tsx
// 2026-09-01 · 공용 프리미티브 · Chart wrapper (title + description + card + chart area)
//   · recharts (Pie·Bar·Line) 반복 wrapper 통합 · 10+ 파일 대상
//   · title · description · icon · actions (기간 선택 등) · loading · empty state
//   · 자식 · recharts ResponsiveContainer + Chart 직접 배치
//
// 사용 예:
//   <ChartCard title="월별 매입액" icon={<BarChart3 size={14} />}>
//     <ResponsiveContainer width="100%" height={200}>
//       <BarChart data={data}>...</BarChart>
//     </ResponsiveContainer>
//   </ChartCard>
//
//   <ChartCard title="공급사별" loading={loading} empty={data.length === 0}
//              emptyMessage="선택 기간 데이터 없음">
//     ...
//   </ChartCard>

import React from "react";
import { Card } from "./Card";
import { Spinner } from "./Spinner";
import { EmptyState } from "./EmptyState";
import { BarChart3 } from "lucide-react";

export interface ChartCardProps {
  /** 차트 제목 */
  title: string;
  /** 제목 좌측 아이콘 · default BarChart3 */
  icon?: React.ReactNode;
  /** 제목 아래 · 설명 (선택) */
  description?: string;
  /** 우측 상단 · 액션 슬롯 (기간 선택·필터·범례 토글 등) */
  actions?: React.ReactNode;
  /** loading · 스피너 노출 · body 대체 */
  loading?: boolean;
  /** empty · EmptyState 노출 · body 대체 */
  empty?: boolean;
  /** empty 시 메시지 · default "데이터 없음" */
  emptyMessage?: string;
  /** empty 시 힌트 텍스트 · 상세 안내 */
  emptyHint?: string;
  /** body 최소 높이 · default 220 · 차트 크기 통일 */
  minHeight?: number;
  /** Card padding · default md */
  padding?: "sm" | "md" | "lg";
  /** 차트 (recharts ResponsiveContainer + Chart) */
  children: React.ReactNode;
  className?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  icon,
  description,
  actions,
  loading = false,
  empty = false,
  emptyMessage = "데이터 없음",
  emptyHint,
  minHeight = 220,
  padding = "md",
  children,
  className = "",
}) => {
  const iconEl = icon ?? <BarChart3 size={14} className="text-brand-deep" />;
  return (
    <Card padding={padding} rounded="lg" className={className}>
      {/* 헤더 · title + description + actions */}
      <div className="flex items-start gap-2 mb-3">
        <span className="shrink-0 mt-0.5">{iconEl}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-ink tracking-tight leading-tight">
            {title}
          </h3>
          {description && (
            <p className="text-[12px] font-medium text-ink-soft mt-0.5 leading-snug">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
      {/* 차트 body · loading / empty / children */}
      <div className="relative" style={{ minHeight }}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner size={16} tone="brand" label="차트 로딩 중..." labelSize={13} />
          </div>
        ) : empty ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <EmptyState title={emptyMessage} hint={emptyHint} size="compact" />
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  );
};

export default ChartCard;
