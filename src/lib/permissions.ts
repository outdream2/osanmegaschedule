// src/lib/permissions.ts
// 2026-08-12 · #100 · 페이지 접근 판정 · 레벨 OR 직군 조건
//   · 기존 로직 (레벨만) 100% 하위 호환 (readPositions/writePositions 미지정 시 레벨만 판정)
//   · 사용자 요구: "레벨 또는 직군 만족 시 접근 허용"
import type { AuthSession, PagePermission, PagePermissions } from "../types";

/** authSession → 숫자 레벨 파생 (0-9) · sideNavGroups.deriveUserLevel 과 동일 규칙 */
export function deriveUserLevel(session: AuthSession | null): number {
  if (!session) return 0;
  return (
    session.level ??
    (session.role === "superadmin" || session.role === "admin" ? 9
      : session.role === "manager" ? 2
        : session.role === "employee" ? 1 : 0)
  );
}

/** 세션 → 직군 문자열 (employees.position 참조 · session.position 필드 우선) */
export function deriveUserPosition(session: AuthSession | null): string | null {
  if (!session) return null;
  const anySession = session as unknown as { position?: string | null };
  return (anySession.position ?? null) || null;
}

/** 페이지 읽기 접근 판정 · 레벨 >= perm.read  OR  직군 ∈ perm.readPositions
 *  2026-08-17 · #131 · hidden 페이지 · 모든 사용자 차단 (사용자 지시 · "설정에서 안보이기 처리하면 페이지도 안보여야지")
 *  admin lockout 방지는 라우팅 레벨 (App.tsx) 에서 essential 페이지 예외 처리 */
export function canReadPage(session: AuthSession | null, perm: PagePermission | undefined): boolean {
  if (!perm) return false;
  if (perm.hidden) return false;   // hidden 은 모두 차단 (admin 포함)
  const level = deriveUserLevel(session);
  if (level >= perm.read) return true;
  const pos = deriveUserPosition(session);
  if (pos && Array.isArray(perm.readPositions) && perm.readPositions.includes(pos)) return true;
  return false;
}

/** hidden 을 무시하는 · essential 페이지 (admin 접근 유지용) 판정
 *  · permissions/business-manage/account 등 · sidebar canAccessItem 과 동일 목록 */
const ADMIN_ESSENTIAL_PAGES = new Set(["permissions", "business-manage", "account"]);
export function isAdminEssentialPage(pageKey: string): boolean {
  return ADMIN_ESSENTIAL_PAGES.has(pageKey);
}

/** 페이지 쓰기 접근 판정 · 레벨 >= perm.write  OR  직군 ∈ perm.writePositions */
export function canWritePage(session: AuthSession | null, perm: PagePermission | undefined): boolean {
  if (!perm) return false;
  const level = deriveUserLevel(session);
  if (level >= perm.write) return true;
  const pos = deriveUserPosition(session);
  if (pos && Array.isArray(perm.writePositions) && perm.writePositions.includes(pos)) return true;
  return false;
}

/** 페이지 키로 편의 판정 · perms 전체 객체 전달
 *  2026-08-16 · subTab 파라미터 · 복합키 (`{pageKey}:{subTab}`) 우선 · 없으면 pageKey fallback */
export function canReadPageKey(
  session: AuthSession | null,
  perms: PagePermissions | null | undefined,
  pageKey: keyof PagePermissions | string,
  subTab?: string,
): boolean {
  if (!perms) return false;
  if (subTab) {
    const composite = `${pageKey}:${subTab}`;
    if (perms[composite]) return canReadPage(session, perms[composite]);
  }
  return canReadPage(session, perms[pageKey]);
}
export function canWritePageKey(
  session: AuthSession | null,
  perms: PagePermissions | null | undefined,
  pageKey: keyof PagePermissions | string,
  subTab?: string,
): boolean {
  if (!perms) return false;
  if (subTab) {
    const composite = `${pageKey}:${subTab}`;
    if (perms[composite]) return canWritePage(session, perms[composite]);
  }
  return canWritePage(session, perms[pageKey]);
}

/** 페이지 (+ optional subTab) 의 실효 PagePermission 반환 · UI 편집용 */
export function getEffectivePerm(
  perms: PagePermissions | null | undefined,
  pageKey: string,
  subTab?: string,
): PagePermission | undefined {
  if (!perms) return undefined;
  if (subTab) {
    const composite = `${pageKey}:${subTab}`;
    if (perms[composite]) return perms[composite];
  }
  return perms[pageKey];
}
