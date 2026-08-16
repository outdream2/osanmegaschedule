// 2026-08-16 · 프레임워크 · 서버·클라 공유 공통 응답 DTO
// 목적: 서버 응답 shape 을 클라이언트가 any 로 받지 않도록 · 컴파일 타임 타입 안전
// 사용:
//   서버: res.json({ ok: true } satisfies OkResponse);
//   클라: const { data } = await api.get<OkResponse>("/api/x");

/** 공통 · 성공/실패 · action 성공 응답 */
export interface OkResponse {
  ok: true;
}

/** 공통 · 에러 응답 (errorHandler 표준) */
export interface ErrorResponse {
  error: string;
  code?: string;
  stack?: string[]; // dev only
}

/** 페이지네이션 응답 · paginatedResponse() 결과 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/** 리스트 응답 · List endpoint 표준 */
export interface ListResponse<T> {
  rows: T[];
  count: number;
}

/** 카운트만 응답 */
export interface CountResponse {
  count: number;
}

/** 세션/사용자 · /api/auth/me 응답 */
export interface SessionMeResponse {
  id: number;
  name: string;
  role: string;
  level: number;
  rank?: string | null;
  authOff?: boolean; // JWT_SECRET 미설정 하위호환
}
