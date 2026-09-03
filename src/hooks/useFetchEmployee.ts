// 2026-09-03 · #62 · 직원정보 단건 상세 조회 공통 훅
//   · GET /api/employees/:id · 전체 확장 필드 (인적사항·계약·임금·보험·경력·자격)
//   · 사용처: StaffManagePage · EmployeeCalendarModal · MyPage · ContractWriterPage
//   · id null → 상태 초기화 · id 변경 → 자동 재조회 · cancel-safe
//
// 프레임워크 규칙:
//   · apiClient (api.get) · ApiError 정규화
//   · reload · 명시적 재조회 (수정 저장 후 최신값 반영)
//
// 사용:
//   const { employee, loading, error, reload } = useFetchEmployee(selectedId);

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/apiClient";
import type { Employee } from "../types";

export interface UseFetchEmployeeResult {
  employee: Employee | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useFetchEmployee(id: number | null | undefined): UseFetchEmployeeResult {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 최신 요청만 반영 · 빠른 selectedId 전환 시 race 방지
  const requestSeqRef = useRef(0);

  const doFetch = useCallback(async (targetId: number) => {
    const seq = ++requestSeqRef.current;
    setLoading(true); setError(null);
    try {
      const { data } = await api.get<Employee>(`/api/employees/${targetId}`);
      if (seq !== requestSeqRef.current) return; // 뒤늦게 도착한 응답 무시
      setEmployee(data ?? null);
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : "직원 정보 조회 실패");
      setError(msg);
      setEmployee(null);
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (id == null || !Number.isFinite(id)) {
      requestSeqRef.current++; // 진행 중 요청 무효화
      setEmployee(null);
      setError(null);
      setLoading(false);
      return;
    }
    void doFetch(Number(id));
  }, [id, doFetch]);

  const reload = useCallback(async () => {
    if (id == null || !Number.isFinite(id)) return;
    await doFetch(Number(id));
  }, [id, doFetch]);

  return { employee, loading, error, reload };
}
