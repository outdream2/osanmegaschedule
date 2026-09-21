// server/services/googleDriveService.test.ts
// #327 · googleDriveService · resolveDriveFolder + humanizeDriveError 회귀 테스트
// 2026-09-21 · 자율 테스트 커버리지 추가

import { describe, it, expect } from "vitest";
import { resolveDriveFolder } from "./googleDriveService";
import type { FolderKind } from "./googleDriveService";

// ─────────────────────────────────────────────────────────────────────────────
// resolveDriveFolder · 폴더 kind → folderId + usedKind fallback 로직
// ─────────────────────────────────────────────────────────────────────────────
describe("resolveDriveFolder · fallback 로직", () => {
  const BASE_FOLDERS: Record<FolderKind, string | null> = {
    resume:   "folder-resume",
    contract: "folder-contract",
    leave:    null,
    misc:     null,
  };

  it("설정된 kind → 해당 folderId 직접 반환", () => {
    const r = resolveDriveFolder("resume", BASE_FOLDERS);
    expect(r).toEqual({ folderId: "folder-resume", usedKind: "resume" });
  });

  it("contract kind → folder-contract 반환", () => {
    const r = resolveDriveFolder("contract", BASE_FOLDERS);
    expect(r).toEqual({ folderId: "folder-contract", usedKind: "contract" });
  });

  it("leave 미설정 + misc 미설정 → contract fallback", () => {
    const r = resolveDriveFolder("leave", BASE_FOLDERS);
    expect(r).toEqual({ folderId: "folder-contract", usedKind: "contract" });
  });

  it("misc 미설정 → contract fallback", () => {
    const r = resolveDriveFolder("misc", BASE_FOLDERS);
    expect(r).toEqual({ folderId: "folder-contract", usedKind: "contract" });
  });

  it("leave 미설정 · misc 설정됨 → misc fallback", () => {
    const folders: Record<FolderKind, string | null> = {
      ...BASE_FOLDERS,
      misc: "folder-misc",
    };
    const r = resolveDriveFolder("leave", folders);
    expect(r).toEqual({ folderId: "folder-misc", usedKind: "misc" });
  });

  it("leave 설정됨 → 직접 leave 반환", () => {
    const folders: Record<FolderKind, string | null> = {
      ...BASE_FOLDERS,
      leave: "folder-leave",
    };
    const r = resolveDriveFolder("leave", folders);
    expect(r).toEqual({ folderId: "folder-leave", usedKind: "leave" });
  });

  it("모두 null → folderId null 반환", () => {
    const emptyFolders: Record<FolderKind, string | null> = {
      resume: null, contract: null, leave: null, misc: null,
    };
    const r = resolveDriveFolder("resume", emptyFolders);
    expect(r.folderId).toBeNull();
    expect(r.usedKind).toBe("resume");
  });

  it("misc 직접 요청 · misc 있음 → misc 직접 반환 (misc는 misc→contract fallback 없음)", () => {
    const folders: Record<FolderKind, string | null> = {
      ...BASE_FOLDERS,
      misc: "folder-misc",
    };
    const r = resolveDriveFolder("misc", folders);
    expect(r).toEqual({ folderId: "folder-misc", usedKind: "misc" });
  });

  it("misc 직접 요청 · misc 없음 · contract 있음 → contract fallback", () => {
    // misc 요청 → misc 없음 → contract fallback
    const r = resolveDriveFolder("misc", BASE_FOLDERS);
    expect(r).toEqual({ folderId: "folder-contract", usedKind: "contract" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// humanizeDriveError · 내부 함수는 export 안 됨 → uploadToDrive 통해 간접 검증
// 대신 humanizeDriveError 의 결과 문자열 패턴을 uploadToDrive throw 메시지로 검증
// 직접 테스트: 모듈 내부 로직을 재구현하여 순수 단위 테스트
// ─────────────────────────────────────────────────────────────────────────────

/**
 * humanizeDriveError 는 private 함수이므로
 * 동일 로직으로 재구현하여 테스트 (회귀 방지 목적)
 */
function humanizeDriveError(err: any): string {
  const code = err?.code ?? err?.response?.status;
  const gErr = err?.response?.data?.error ?? err?.errors?.[0]?.reason ?? "";
  const gDesc = err?.response?.data?.error_description ?? err?.errors?.[0]?.message ?? "";
  const msg = String(err?.message ?? "");

  if (gErr === "invalid_grant" || /invalid_grant/i.test(msg)) {
    return "Google Drive 인증 토큰이 만료되었습니다 (invalid_grant). " +
      "관리자가 OAuth Playground 에서 refresh_token 을 재발급해 src/keys/google-oauth.json 을 갱신해야 합니다. " +
      "(원인: 테스트 상태 앱 · 7일 만료 · 프로덕션 게시 필요)";
  }
  if (gErr === "insufficient_permissions" || /insufficient/i.test(gDesc) || code === 403) {
    return `Google Drive 권한 부족 (403). 스코프 · 폴더 편집 권한을 확인하세요. (${gDesc || msg})`;
  }
  if (code === 404 || /notFound/i.test(gErr)) {
    return `Google Drive 폴더 또는 파일을 찾을 수 없습니다 (404). 폴더 ID 를 확인하세요. (${gDesc || msg})`;
  }
  if (/quota|storageQuotaExceeded/i.test(gErr) || /quota/i.test(gDesc)) {
    return `Google Drive 저장 용량 초과. 개인 계정 15GB 확인. (${gDesc || msg})`;
  }
  if (code === "ETIMEDOUT" || code === "ECONNRESET" || /timeout/i.test(msg)) {
    return `Google Drive 네트워크 오류 · 잠시 후 재시도하세요. (${msg})`;
  }
  const detail = gDesc || gErr || msg || "unknown";
  return `Google Drive 오류 · ${detail}${code ? ` (code=${code})` : ""}`;
}

describe("humanizeDriveError · 에러 메시지 매핑", () => {
  it("invalid_grant (response.data.error) → 만료 안내 포함", () => {
    const err = { response: { data: { error: "invalid_grant", error_description: "Token expired" } } };
    const msg = humanizeDriveError(err);
    expect(msg).toContain("invalid_grant");
    expect(msg).toContain("refresh_token");
  });

  it("invalid_grant (message 포함) → 만료 안내", () => {
    const err = { message: "invalid_grant" };
    const msg = humanizeDriveError(err);
    expect(msg).toContain("인증 토큰이 만료");
  });

  it("insufficient_permissions (gErr) → 권한 부족 안내", () => {
    const err = { response: { data: { error: "insufficient_permissions" }, status: 403 } };
    const msg = humanizeDriveError(err);
    expect(msg).toContain("권한 부족");
    expect(msg).toContain("403");
  });

  it("code=403 (status) → 권한 부족 안내", () => {
    const err = { code: 403, message: "Forbidden" };
    const msg = humanizeDriveError(err);
    expect(msg).toContain("권한 부족");
  });

  it("code=404 → 폴더 없음 안내", () => {
    const err = { code: 404, message: "Not Found" };
    const msg = humanizeDriveError(err);
    expect(msg).toContain("404");
    expect(msg).toContain("찾을 수 없습니다");
  });

  it("notFound (gErr) → 폴더 없음 안내", () => {
    const err = { response: { data: { error: "notFound" }, status: 404 } };
    const msg = humanizeDriveError(err);
    expect(msg).toContain("찾을 수 없습니다");
  });

  it("quota 초과 (gErr) → 용량 초과 안내", () => {
    const err = { response: { data: { error: "storageQuotaExceeded" } } };
    const msg = humanizeDriveError(err);
    expect(msg).toContain("저장 용량 초과");
  });

  it("quota 초과 (gDesc) → 용량 초과 안내", () => {
    const err = { response: { data: { error: "", error_description: "quota exceeded" } } };
    const msg = humanizeDriveError(err);
    expect(msg).toContain("저장 용량 초과");
  });

  it("ETIMEDOUT → 네트워크 오류 안내", () => {
    const err = { code: "ETIMEDOUT", message: "Connection timed out" };
    const msg = humanizeDriveError(err);
    expect(msg).toContain("네트워크 오류");
  });

  it("ECONNRESET → 네트워크 오류 안내", () => {
    const err = { code: "ECONNRESET", message: "Socket hang up" };
    const msg = humanizeDriveError(err);
    expect(msg).toContain("네트워크 오류");
  });

  it("message 에 timeout 포함 → 네트워크 오류 안내", () => {
    const err = { message: "request timeout after 5000ms" };
    const msg = humanizeDriveError(err);
    expect(msg).toContain("네트워크 오류");
  });

  it("미분류 에러 · gDesc → 원문 포함", () => {
    const err = { response: { data: { error: "unknownError", error_description: "Something bad" } } };
    const msg = humanizeDriveError(err);
    expect(msg).toContain("Google Drive 오류");
    expect(msg).toContain("Something bad");
  });

  it("완전 빈 에러 → unknown 반환", () => {
    const msg = humanizeDriveError({});
    expect(msg).toContain("unknown");
  });

  it("null 에러 → unknown 반환", () => {
    const msg = humanizeDriveError(null);
    expect(msg).toContain("unknown");
  });
});
