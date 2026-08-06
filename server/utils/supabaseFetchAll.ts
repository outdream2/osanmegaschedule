// server/utils/supabaseFetchAll.ts
// 2026-08-06 · Supabase 기본 max_rows 1000 캡 우회 유틸
//
// 원인:
//   Supabase REST API 기본 max_rows: 1000
//   .limit(5000) 지정해도 · 서버 config 로 1000 캡핑됨
//   → .limit(N) 만으로는 N > 1000 데이터 조회 불가
//
// 해결:
//   .range(offset, offset + PAGE - 1) 반복 loop 로 1000 씩 fetch · 누적
//   최대 상한 (maxRows) 까지 or 데이터 없을 때까지
//
// 사용:
//   const rows = await fetchAllWithRange(
//     () => supabase.from("table").select("*").eq("field", val).order("date", { ascending: false }),
//     5000 // 최대 5000행까지
//   );

/**
 * Supabase 쿼리 · 페이지 loop 로 반복 fetch · 1000행 캡 우회
 *
 * @param queryFactory · Supabase 쿼리 빌더 반환 함수 (매 반복마다 새로 호출 · 상태 재사용 X)
 * @param maxRows · 최대 반환 행 수 (기본 5000 · 상한)
 * @param pageSize · 페이지당 행 수 (기본 1000 · Supabase 캡)
 * @returns 누적 rows · 에러 시 throw
 */
export async function fetchAllWithRange<T = any>(
  queryFactory: () => any,
  maxRows: number = 5000,
  pageSize: number = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  while (offset < maxRows) {
    const take = Math.min(pageSize, maxRows - offset);
    const q = queryFactory();
    const { data, error } = await q.range(offset, offset + take - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < take) break; // 더 이상 없음
    offset += take;
  }
  return rows;
}
