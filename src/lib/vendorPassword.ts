// src/lib/vendorPassword.ts
// 2026-08-23 · #178 Phase C-계정 · vendor 로그인 비밀번호 파생 함수
//   · 규칙 · ID=담당자 핸드폰 · 비번=핸드폰 + ENV suffix (기본 "00")
//   · DB 저장 X · 서버 파생 · SUFFIX 는 .env VENDOR_PW_SUFFIX 로 관리
//   · 서버·클라 공유 · 로직 중복 제거
//   · 관련 메모리 · project_vendor_login_rule.md
// 2026-09-01 · 보안 · timingSafeEqual 도입 · 타이밍 공격 방지 (Node.js 전용 분기)

/** 기본 suffix · ENV 미설정 시 fallback */
export const DEFAULT_VENDOR_PW_SUFFIX = "00";

/**
 * 서버 · Node.js · process.env 에서 suffix 조회 (SSR 안전)
 * 클라 · Vite · import.meta.env 에서 조회 (VITE_ prefix 필요 시 · 현재는 서버 전용)
 */
export function getVendorPwSuffix(): string {
  try {
    if (typeof process !== "undefined" && process.env?.VENDOR_PW_SUFFIX) {
      return String(process.env.VENDOR_PW_SUFFIX);
    }
  } catch { /* browser · no process */ }
  return DEFAULT_VENDOR_PW_SUFFIX;
}

/** 핸드폰 정규화 · 숫자만 · 파생 함수 입력용 */
export function normalizePhone(phone: string | null | undefined): string {
  return String(phone ?? "").replace(/[^0-9]/g, "");
}

/**
 * vendor 로그인 예상 비밀번호 파생
 * @param phone 담당자 핸드폰 (raw 또는 정규화된 값)
 * @param suffix (선택) suffix override · 기본 · getVendorPwSuffix()
 * @returns cleanPhone + suffix (숫자만)
 */
export function deriveVendorPassword(phone: string, suffix?: string): string {
  const cleanPhone = normalizePhone(phone);
  const eff = suffix ?? getVendorPwSuffix();
  return cleanPhone + String(eff);
}

/**
 * 타이밍 안전 문자열 비교 · Node.js 환경에서는 crypto.timingSafeEqual 사용
 * 브라우저(테스트 제외)에서는 일반 비교 fallback (브라우저 노출 경로 없음 · 서버 전용 함수)
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  try {
    // Node.js 전용 · crypto 모듈
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { timingSafeEqual } = require("crypto") as typeof import("crypto");
    const aBuf = Buffer.from(a, "utf8");
    const bBuf = Buffer.from(b, "utf8");
    // 길이가 다를 때도 상수 시간 유지 (dummy 비교 후 false)
    if (aBuf.length !== bBuf.length) {
      timingSafeEqual(aBuf, aBuf);
      return false;
    }
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    // 브라우저 또는 crypto 미지원 환경 · 서버 경로에서는 절대 도달 안 함
    return a === b;
  }
}

/**
 * 비밀번호 검증 · 사용자 입력 비밀번호와 파생 비밀번호 비교
 * @param phone 담당자 핸드폰
 * @param input 사용자 입력 비밀번호
 * @param suffix (선택) suffix override
 * @returns 일치 여부
 */
export function verifyVendorPassword(phone: string, input: string, suffix?: string): boolean {
  const expected = deriveVendorPassword(phone, suffix);
  const cleanInput = normalizePhone(input);
  return cleanInput.length > 0 && timingSafeStringEqual(cleanInput, expected);
}
