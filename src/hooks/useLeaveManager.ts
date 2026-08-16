// src/hooks/useLeaveManager.ts
// 연차 사용 이력 관리 훅 · StaffManagePage 에서 이동 (god-phase1)
// #219 · 선택된 직원 · 지정 연도 연차 이력 로드·삭제
// 2026-08-16 · apiClient 마이그레이션
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/apiClient";

export interface UsedLeaveItem {
  date: string;
  type: string;
  memo: string;
  weight: number;  // 월차=1, 반차=0.5
}

export interface UseLeaveManagerResult {
  leaveYear: number;
  setLeaveYear: React.Dispatch<React.SetStateAction<number>>;
  currentYearNow: number;
  usedLeaves: UsedLeaveItem[];
  leaveLoading: boolean;
  leaveError: string | null;
  deletingLeaveDate: string | null;
  loadUsedLeaves: (empId: number, year: number) => Promise<void>;
  deleteUsedLeave: (empId: number, date: string) => Promise<void>;
}

/**
 * @param selectedId 현재 선택된 직원 ID (null 이면 자동 초기화)
 * @param confirm useConfirm() 으로 얻은 confirm 함수 · 삭제 전 확인 다이얼로그
 */
export function useLeaveManager(
  selectedId: number | null,
  confirm: (opts: { message: string; danger?: boolean }) => Promise<boolean>,
): UseLeaveManagerResult {
  const currentYearNow = new Date().getFullYear();
  const [leaveYear, setLeaveYear] = useState<number>(currentYearNow);
  const [usedLeaves, setUsedLeaves] = useState<UsedLeaveItem[]>([]);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [deletingLeaveDate, setDeletingLeaveDate] = useState<string | null>(null);

  const LEAVE_TYPES_SET = useMemo(() => new Set(["월차", "오전반차", "오후반차"]), []);
  const leaveWeight = (t: string) => (t === "오전반차" || t === "오후반차") ? 0.5 : 1;

  const loadUsedLeaves = useCallback(async (empId: number, year: number) => {
    setLeaveLoading(true);
    setLeaveError(null);
    try {
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) => i + 1).map(async (m) => {
          try { return (await api.get<any>(`/api/schedules?year=${year}&month=${m}`)).data; }
          catch { return null; }
        }),
      );
      const items: UsedLeaveItem[] = [];
      for (const monthData of results) {
        const emps: Array<{ id: number; schedules?: Array<{ date?: string; type?: string; memo?: string }> }> =
          Array.isArray(monthData?.employees) ? monthData.employees : [];
        const target = emps.find(e => e.id === empId);
        const schedules = Array.isArray(target?.schedules) ? target.schedules : [];
        for (const s of schedules) {
          const t = String(s?.type ?? "");
          const d = String(s?.date ?? "");
          if (!t || !d) continue;
          if (!LEAVE_TYPES_SET.has(t)) continue;
          if (!d.startsWith(`${year}-`)) continue;
          items.push({ date: d, type: t, memo: String(s?.memo ?? ""), weight: leaveWeight(t) });
        }
      }
      items.sort((a, b) => a.date.localeCompare(b.date));
      setUsedLeaves(items);
    } catch (err: unknown) {
      setLeaveError(err instanceof Error ? err.message : "연차 이력 조회 실패");
      setUsedLeaves([]);
    } finally {
      setLeaveLoading(false);
    }
  }, [LEAVE_TYPES_SET]);

  // 선택된 직원 · 연도 변경 시 재조회
  useEffect(() => {
    if (selectedId == null) {
      setUsedLeaves([]);
      setLeaveError(null);
      setLeaveLoading(false);
      return;
    }
    loadUsedLeaves(selectedId, leaveYear);
  }, [selectedId, leaveYear, loadUsedLeaves]);

  // 개별 연차 삭제 · PUT /api/schedules with type="" (SchedulePage clear 방식)
  const deleteUsedLeave = async (empId: number, date: string) => {
    if (!await confirm({ message: `${date} 연차 기록을 삭제할까요?\n\n스케줄표(월차)에도 반영됩니다.`, danger: true })) return;
    setDeletingLeaveDate(date);
    try {
      try {
        await api.put(`/api/schedules`, {
          employeeId: empId, date, type: "", workingHours: "", actualHours: "", memo: "",
        });
      } catch (e: any) {
        alert(`삭제 실패: ${e?.message ?? "네트워크 오류"}`);
        return;
      }
      // 로컬 상태 즉시 반영
      setUsedLeaves(prev => prev.filter(l => l.date !== date));
    } catch (err: unknown) {
      alert(`삭제 오류: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeletingLeaveDate(null);
    }
  };

  return {
    leaveYear,
    setLeaveYear,
    currentYearNow,
    usedLeaves,
    leaveLoading,
    leaveError,
    deletingLeaveDate,
    loadUsedLeaves,
    deleteUsedLeave,
  };
}
