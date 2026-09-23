// src/components/SchedulePage/useEditScheduleForm.ts
// 2026-09-23 · B-2 · ScheduleCell 편집 form state 로직 추출
import { useState, useEffect } from "react";
import type { Schedule } from "../../types";

export interface ScheduleFormValues {
  type: string;
  workingHours: string;
  actualHours: string;
  memo: string;
}

export interface UseEditScheduleFormOptions {
  /** 현재 schedule prop (없으면 null) */
  initialSchedule: Schedule | null | undefined;
  /** popover 열림 여부 — isOpen 변경 시 form 초기화 트리거 */
  isOpen: boolean;
  /** type 변경 시 workingHours 자동 채움용 맵 */
  typeHoursMap?: Record<string, string>;
  /** 저장 시 외부에서 실제 API 호출 (payload 포함) */
  onSave: (values: ScheduleFormValues) => Promise<void>;
}

export interface UseEditScheduleFormReturn {
  values: ScheduleFormValues;
  setType: (v: string) => void;
  setWorkingHours: (v: string) => void;
  setActualHours: (v: string) => void;
  setMemo: (v: string) => void;
  /** type 프리셋 클릭 — type 설정 + typeHoursMap 으로 workingHours 자동 채움 */
  applyPreset: (presetType: string) => void;
  /** select onChange — type 변경 시 workingHours 자동갱신 (수동 수정값 유지) */
  handleTypeChange: (newType: string) => void;
  saving: boolean;
  /** form submit handler (e.preventDefault 포함) */
  handleSave: (e: React.FormEvent) => Promise<void>;
}

// 근무 사이클 순환 상수 — ScheduleCell 의 handleQuickCycle 에서도 사용
export const SCHEDULE_CYCLE = ["오픈", "미들", "마감", "휴무"] as const;

export function useEditScheduleForm(
  opts: UseEditScheduleFormOptions,
): UseEditScheduleFormReturn {
  const { initialSchedule, isOpen, typeHoursMap, onSave } = opts;

  const [type, setType] = useState(initialSchedule?.type ?? "");
  const [workingHours, setWorkingHours] = useState(initialSchedule?.workingHours ?? "");
  const [actualHours, setActualHours] = useState(initialSchedule?.actualHours ?? "");
  const [memo, setMemo] = useState(initialSchedule?.memo ?? "");
  const [saving, setSaving] = useState(false);

  // popover 열릴 때(또는 schedule 교체 시) → form 값을 schedule props 로 리셋
  useEffect(() => {
    if (isOpen) {
      setType(initialSchedule?.type ?? "");
      setWorkingHours(initialSchedule?.workingHours ?? "");
      setActualHours(initialSchedule?.actualHours ?? "");
      setMemo(initialSchedule?.memo ?? "");
    }
  }, [isOpen, initialSchedule]);

  const applyPreset = (presetType: string) => {
    setType(presetType);
    setWorkingHours(typeHoursMap?.[presetType] ?? "");
  };

  const handleTypeChange = (newType: string) => {
    const oldAutoHours = typeHoursMap?.[type] ?? "";
    setType(newType);
    if (!workingHours || workingHours === oldAutoHours) {
      setWorkingHours(typeHoursMap?.[newType] ?? "");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ type, workingHours, actualHours, memo });
    } finally {
      setSaving(false);
    }
  };

  return {
    values: { type, workingHours, actualHours, memo },
    setType,
    setWorkingHours,
    setActualHours,
    setMemo,
    applyPreset,
    handleTypeChange,
    saving,
    handleSave,
  };
}
