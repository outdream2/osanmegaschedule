// src/components/common/StatusBadge.tsx
// T-CSS Phase 1 · 2026-08-05
// 공통 상태 배지 컴포넌트
//   - 색상 자동 매핑 (tokens.ts STATUS_COLOR 기반)
//   - 아이콘 · 커스텀 라벨 옵션
//   - 최소 사용 원칙: 정말 상태가 필요한 곳에만 (feedback_ui_principles 참조)
//
// 사용 예:
//   <StatusBadge status="pending" />                     → "대기" amber
//   <StatusBadge status="done" label="처리완료" />         → "처리완료" emerald
//   <StatusBadge status="danger" icon={AlertCircle} />   → 아이콘 + "오류" rose

import React from "react";
import { type StatusKey, STATUS_COLOR, STATUS_LABEL } from "../../styles/tokens";

type IconLike = React.ComponentType<{
  size?: number;
  className?: string;
  strokeWidth?: number;
  weight?: string;
}>;

export interface StatusBadgeProps {
  /** 상태 키 → 색상 자동 매핑 */
  status: StatusKey;
  /** 오버라이드 라벨 · 미지정 시 STATUS_LABEL[status] 사용 */
  label?: string;
  /** 선택적 아이콘 */
  icon?: IconLike;
  /** 추가 className */
  className?: string;
}

/**
 * 공통 상태 배지
 *   - status → 색상·라벨 자동
 *   - index.css .badge-base 스타일 준수
 *   - 과용 금지 · 정말 필요한 상태값에만 사용
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  icon: Icon,
  className = "",
}) => {
  const c = STATUS_COLOR[status];
  const text = label ?? STATUS_LABEL[status];

  return (
    <span
      className={[
        // index.css .badge-base 스타일 인라인 동등 (CSS 클래스 재사용 가능)
        "inline-flex items-center gap-1",
        "text-[11px] font-bold leading-none",
        "px-1.5 py-0.5 rounded-md border",
        "shrink-0",
        c.bg,
        c.text,
        c.border,
        className,
      ].filter(Boolean).join(" ")}
    >
      {Icon && <Icon size={10} strokeWidth={2.5} />}
      {text}
    </span>
  );
};

export default StatusBadge;
