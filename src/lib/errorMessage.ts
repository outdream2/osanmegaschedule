/**
 * getErrorMessage · 일관된 에러 메시지 추출
 *
 * catch (e) 블록에서 (e as any)?.message 패턴을 대체한다.
 * ApiError 는 instanceof 검사 없이도 안전하게 처리.
 *
 * @param e         catch 블록의 unknown 에러
 * @param fallback  메시지를 추출할 수 없을 때 사용할 기본값
 */
export function getErrorMessage(e: unknown, fallback = "알 수 없는 오류"): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e != null && typeof (e as Record<string, unknown>).message === "string") {
    return (e as Record<string, unknown>).message as string;
  }
  return fallback;
}
