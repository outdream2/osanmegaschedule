// 2026-08-16 · 프레임워크 · GET API + 로딩·에러·데이터 통일 (경량 React Query 대체)
// 사용:
//   const { data, loading, error, refetch } = useApiQuery<Employee[]>("/api/employees");
//   const { data } = useApiQuery("/api/settings?key=brand_identity", { skip: !ready });
// 2026-08-16 · apiClient 로 통일 · 401 refresh + 에러 정규화 (ApiError) 자동
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/apiClient";

interface Options<T> {
  /** true 면 fetch skip · 조건부 fetch 용 */
  skip?: boolean;
  /** 응답 데이터 변환 · axios res.data → 원하는 형태 */
  select?: (raw: unknown) => T;
  /** 초기값 · fetch 전 표시용 */
  initialData?: T;
  /** 401 시 · true 리턴하면 앱 통합 401 핸들러 발동 (기본: axios interceptor 자동 처리) */
  onUnauthorized?: () => void;
}

export interface QueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useApiQuery<T = unknown>(url: string, opts: Options<T> = {}): QueryResult<T> {
  const [data, setData] = useState<T | undefined>(opts.initialData);
  const [loading, setLoading] = useState<boolean>(!opts.skip);
  const [error, setError] = useState<string | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const doFetch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get(url);
      const transformed = optsRef.current.select ? optsRef.current.select(res.data) : (res.data as T);
      setData(transformed);
    } catch (err) {
      const isApi = err instanceof ApiError;
      const status = isApi ? err.status : 0;
      const msg = isApi ? err.message : (err as any)?.message ?? "네트워크 오류";
      setError(msg);
      if (status === 401 && optsRef.current.onUnauthorized) optsRef.current.onUnauthorized();
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (opts.skip) return;
    let alive = true;
    (async () => {
      await doFetch();
      if (!alive) return;
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, opts.skip]);

  return { data, loading, error, refetch: doFetch };
}
