// src/lib/urlSafe.ts
// 2026-08-12 · URL 스킴 화이트리스트 · XSS·프로토콜 어택 방어
//   허용:
//     · https://…  / http://…
//     · data:image/<type>;base64,…  (인라인 이미지)
//     · /…  · ./…  (앱 내부 상대 경로)
//   차단:
//     · javascript:  · vbscript:  · file:  · about:  · blob:  · ftp:  · 기타

const HTTP_RE = /^https?:\/\//i;
const DATA_IMG_RE = /^data:image\/[a-z0-9+.\-]+;base64,/i;

/** 안전한 URL 이면 그 값 · 아니면 fallback (기본 "") · undefined 도 처리 */
export function safeUrl(input: unknown, fallback = ""): string {
  if (typeof input !== "string") return fallback;
  const t = input.trim();
  if (!t) return fallback;
  if (t.startsWith("/") || t.startsWith("./")) return t;
  if (HTTP_RE.test(t) || DATA_IMG_RE.test(t)) return t;
  return fallback;
}

/** 링크(외부 이동) 전용 · data: 는 제외 · http(s) 또는 앱 내부 경로만 */
export function safeLinkUrl(input: unknown, fallback = ""): string {
  if (typeof input !== "string") return fallback;
  const t = input.trim();
  if (!t) return fallback;
  if (t.startsWith("/") || t.startsWith("./")) return t;
  if (HTTP_RE.test(t)) return t;
  return fallback;
}
