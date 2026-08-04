// PostgREST or() 필터의 특수문자 방어 유틸.
// `,` `(` `)` `"` 는 or() 문법의 조건/그룹 delimiter 로 해석되어
// 값에 포함되면 400 Bad Request 발생. 검색어에서 안전하게 제거한다.
export function sanitizeOrValue(v: string): string {
  return v
    .replace(/[,()"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
