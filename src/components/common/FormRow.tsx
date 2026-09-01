// src/components/common/FormRow.tsx
// 2026-09-01 · 공용 프리미티브 · Form row (label + control + hint/error)
//   · FieldLabel + input/select/textarea 조합 · 반복 30+ 파일 통합
//   · props/state 없음 · 순수 UI wrapper · 무회귀
//
// 사용 예:
//   <FormRow label="이름" required icon={<User size={12} />}>
//     <input className="..." />
//   </FormRow>
//
//   <FormRow label="비고" hint="선택 입력" error={errors.note}>
//     <textarea rows={3} />
//   </FormRow>

import React from "react";
import { FieldLabel } from "./FieldLabel";

export interface FormRowProps {
  /** 라벨 텍스트 · 없으면 label 영역 스킵 */
  label?: string;
  /** 라벨 좌측 아이콘 (lucide) */
  labelIcon?: React.ReactNode;
  /** 필수 표시 · red asterisk */
  required?: boolean;
  /** 라벨 아래 · 도움말 · 회색 · error 없을 때만 */
  hint?: string;
  /** 에러 메시지 · rose 색 · hint 대체 표시 */
  error?: string;
  /** 컨트롤 (input/select/textarea 등) */
  children: React.ReactNode;
  /** 컨테이너 추가 className */
  className?: string;
}

export const FormRow: React.FC<FormRowProps> = ({
  label,
  labelIcon,
  required,
  hint,
  error,
  children,
  className = "",
}) => {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <FieldLabel icon={labelIcon} required={required}>{label}</FieldLabel>
      )}
      {children}
      {error ? (
        <p className="text-[12px] font-semibold text-rose-600 mt-0.5 leading-tight">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] font-medium text-ink-soft mt-0.5 leading-tight">
          {hint}
        </p>
      ) : null}
    </div>
  );
};

export default FormRow;
