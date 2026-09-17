// src/lib/devLog.ts
// 2026-09-17 · 개발 모드 전용 로그 유틸 · Vite `import.meta.env.DEV` 게이트
//   · production 번들 · 노이즈 제거 · console.log/warn 분리
//   · 사용 예 · devLog("[SSO] 로그인", data.name) · devWarn("[auth] blocked", err)
//   · console.error 는 그대로 사용 (프로덕션 에러는 유지)

const IS_DEV = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);

export const devLog = (...args: unknown[]): void => {
  if (IS_DEV) console.log(...args);
};

export const devWarn = (...args: unknown[]): void => {
  if (IS_DEV) console.warn(...args);
};
