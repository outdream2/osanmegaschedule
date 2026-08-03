// src/components/common/FieldLabel.tsx
// 2026-08-03 (#199) · #185 UI 리포트 · 공통 폼 필드 레이블
//   - 라벨 텍스트 + 선택 아이콘 + 필수 * 표시
//   - ContractWriterPage / ResignationWriterPage 등에서 중복 정의되던 인라인 FieldLabel 통합
//   - 시각 규격 · text-[12px] font-bold text-slate-600 · gap-1.5 · mb-1.5
//
// 사용 예:
//   <FieldLabel icon={<User size={12} />} required>이름</FieldLabel>
//   <FieldLabel>퇴사 사유</FieldLabel>

import React from "react";

export interface FieldLabelProps {
  icon?: React.ReactNode;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}

/**
 * 공통 폼 필드 레이블
 *   - htmlFor 를 명시하려면 그냥 <label htmlFor=...>...</label> 로 직접 쓰거나
 *     이 컴포넌트의 htmlFor prop 추가를 원하면 확장 가능 (현재 사용처는 <label> 을 감싼 형태로만 씀)
 */
export const FieldLabel: React.FC<FieldLabelProps> = ({ icon, children, required, className = "" }) => (
  <label className={`text-[12px] font-bold text-slate-600 flex items-center gap-1.5 mb-1.5 ${className}`}>
    {icon}
    <span>
      {children}
      {required && <span className="text-rose-500 ml-0.5">*</span>}
    </span>
  </label>
);

export default FieldLabel;
