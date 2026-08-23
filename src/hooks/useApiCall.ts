// src/hooks/useApiCall.ts
// 2026-08-23 · 공용 프레임워크 · API 호출 통합 훅
//   · try/catch + loading + toast 자동
//   · 자체 setError 인라인 UI 병행 지원 (마이그레이션 안전)
//   · useToast · apiClient 통합
//
// 사용 예:
//   const { call, loading, error, reset } = useApiCall({
//     successMsg: "저장되었습니다",
//     errorPrefix: "저장 실패",
//   });
//
//   const handleSave = async () => {
//     await call(() => api.post("/api/xxx", data));
//     // 자동 · loading toggle · showSuccess · showError + error state
//   };
//
//   {loading && <Spinner />}
//   {error && <div className="text-rose-600">{error}</div>}

import { useCallback, useState } from "react";
import { useToast } from "./useToast";
import { ApiError } from "../lib/apiClient";

export interface UseApiCallOptions {
  /** 성공 시 toast 메시지 · 미설정 시 showSuccess 안 함 */
  successMsg?: string;
  /** 에러 접두사 · 예: "저장 실패" → "저장 실패: <원본 message>" */
  errorPrefix?: string;
  /** 에러 시 · toast 표시 여부 · 기본 true */
  showErrorToast?: boolean;
  /** 성공 시 콜백 (toast 후) */
  onSuccess?: () => void;
  /** 에러 시 콜백 (toast 후) */
  onError?: (err: unknown) => void;
}

export interface UseApiCallResult<T> {
  /** API 호출 실행 · loading + toast + error state 자동 */
  call: (fn: () => Promise<T>) => Promise<T | undefined>;
  /** 실행 중 여부 */
  loading: boolean;
  /** 마지막 에러 메시지 (인라인 UI 병행용) · 성공 시 자동 null */
  error: string | null;
  /** error state 초기화 */
  reset: () => void;
}

/**
 * API 호출 통합 훅
 *   · try/catch + loading + toast 자동
 *   · 성공 · showSuccess (options.successMsg 있을 때만)
 *   · 실패 · showError + error state (인라인 UI 병행)
 *   · ApiError 는 err.message 우선 · 그 외 String(err.message ?? err)
 */
export function useApiCall<T = unknown>(options: UseApiCallOptions = {}): UseApiCallResult<T> {
  const {
    successMsg,
    errorPrefix,
    showErrorToast = true,
    onSuccess,
    onError,
  } = options;

  const { showError, showSuccess } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async (fn: () => Promise<T>): Promise<T | undefined> => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      if (successMsg) showSuccess(successMsg);
      onSuccess?.();
      return result;
    } catch (err: unknown) {
      const rawMsg = err instanceof ApiError
        ? err.message
        : (err as any)?.message ?? String(err);
      const fullMsg = errorPrefix ? `${errorPrefix}: ${rawMsg}` : rawMsg;
      setError(fullMsg);
      if (showErrorToast) showError(fullMsg);
      onError?.(err);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [successMsg, errorPrefix, showErrorToast, showError, showSuccess, onSuccess, onError]);

  const reset = useCallback(() => setError(null), []);

  return { call, loading, error, reset };
}

export default useApiCall;
