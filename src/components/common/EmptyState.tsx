// src/components/common/EmptyState.tsx
// T-CSS Phase 1 · 2026-08-05
// 공통 빈 상태 컴포넌트
//   - 리스트·테이블 데이터 없을 때 중앙 안내
//   - 아이콘 · 타이틀 · 힌트 텍스트 · 선택적 액션 버튼
//
// 사용 예:
//   {items.length === 0 && <EmptyState title="결과 없음" hint="검색어를 변경해 보세요" />}
//   <EmptyState icon={Package} title="재고 없음" hint="발주 후 입고 시 표시됩니다" action={<button>발주 요청</button>} />

import React from "react";
import { Inbox } from "lucide-react";
import { TEXT } from "../../styles/tokens";

type IconLike = React.ComponentType<{
  size?: number;
  className?: string;
  strokeWidth?: number;
  weight?: string;
}>;

export interface EmptyStateProps {
  /** 아이콘 컴포넌트 · 기본 Inbox */
  icon?: IconLike;
  /** 주요 메시지 · 필수 */
  title: string;
  /** 보조 힌트 텍스트 */
  hint?: string;
  /** 액션 버튼 슬롯 (선택) */
  action?: React.ReactNode;
  /** 세로 패딩 크기 · 기본 normal */
  size?: "compact" | "normal" | "large";
  /** 추가 className */
  className?: string;
}

const SIZE_PAD: Record<NonNullable<EmptyStateProps["size"]>, string> = {
  compact: "py-8",
  normal:  "py-14",
  large:   "py-24",
};

/**
 * 공통 빈 상태 표시
 *   - 리스트 아래 · 테이블 tbody · 페이지 전체 빈 상태 모두 대응
 *   - icon → title → hint → action 순 수직 배치
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  hint,
  action,
  size = "normal",
  className = "",
}) => {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center gap-2 text-center",
        SIZE_PAD[size],
        className,
      ].filter(Boolean).join(" ")}
      role="status"
      aria-live="polite"
    >
      <Icon
        size={28}
        className="text-zinc-300 mb-1"
        strokeWidth={1.5}
      />
      <p className={`${TEXT.body} text-zinc-500 font-semibold`}>
        {title}
      </p>
      {hint != null && (
        <p className={`${TEXT.caption} text-zinc-400`}>
          {hint}
        </p>
      )}
      {action != null && (
        <div className="mt-3">
          {action}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
