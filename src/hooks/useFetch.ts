// src/hooks/useFetch.ts
// 공통 GET 전용 데이터 훅 · T-SLIM C (2026-08-06)
//
// 사용법:
//   const { data, loading, error, refetch } = useFetch<Row[]>("/api/endpoint");
//   // deps 변경 시 재요청
//   const { data } = useFetch<Row[]>(url, { deps: [vendorId] });
//   // 응답 shape 매핑
//   const { data } = useFetch<Row[]>(url, { select: r => (r as any).rows });
//   // null url → fetch 하지 않음
//   const { data } = useFetch<Row[]>(userId ? `/api/users/${userId}` : null);
//
// 제약:
//   · GET 전용 · POST/PATCH/DELETE 는 컴포넌트에서 직접 fetch 유지
//   · 복잡한 abort-controller debounce 패턴 · 이 훅 사용 금지 (StockCheckPage 등)
//   · Promise.all 병렬 fetch · 이 훅 사용 금지 (개별 useFetch 두 개 또는 직접 유지)

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** 수동 재요청 · 마운트 후 언제든 호출 가능 · stable 참조 보장 */
  refetch: () => Promise<void>;
}

export interface UseFetchOptions<T> {
  /** 추가 deps · 변경 시 자동 재요청 (url 자체도 dep 으로 포함됨) */
  deps?: React.DependencyList;
  /** 응답 전체 → 원하는 shape 추출 · 기본: 응답 전체 사용 */
  select?: (raw: unknown) => T;
  /** true(default) · 마운트 시 즉시 fetch · false · refetch() 수동 호출까지 대기 */
  immediate?: boolean;
}

export function useFetch<T>(
  url: string | null,
  opts: UseFetchOptions<T> = {},
): UseFetchResult<T> {
  const { select, immediate = true } = opts;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // cancelledRef: effect cleanup 시 true → 언마운트 후 setState 방지
  const cancelledRef = useRef(false);

  // refetch: url·select 변경 시에만 identity 변경 (deps 는 의도적으로 미포함)
  const refetch = useCallback(async () => {
    if (!url) return;
    cancelledRef.current = false;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (cancelledRef.current) return;
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let msg = `요청 실패 (${res.status})`;
        try {
          const j = JSON.parse(text) as Record<string, unknown>;
          msg = (j?.error as string) ?? (j?.message as string) ?? msg;
        } catch { /* ignore */ }
        setError(msg);
        return;
      }
      const raw: unknown = await res.json();
      if (cancelledRef.current) return;
      setData(select ? select(raw) : (raw as T));
    } catch (e: unknown) {
      if (cancelledRef.current) return;
      const msg = e instanceof Error ? e.message : "알 수 없는 오류";
      setError(msg);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  // deps 를 의도적으로 제외 · select 는 안정적 참조 가정
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, select]);

  // url 또는 추가 deps 변경 시 자동 재요청
  // deps 는 spread 대신 JSON.stringify 비교 방식으로 안전하게 처리
  const depsKey = opts.deps ? JSON.stringify(opts.deps) : "";
  useEffect(() => {
    if (!immediate) return;
    cancelledRef.current = false;
    refetch();
    return () => { cancelledRef.current = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, immediate, refetch, depsKey]);

  return { data, loading, error, refetch };
}
