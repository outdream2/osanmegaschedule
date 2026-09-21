// server/googleDrive.ts
// Google Drive 통합 · T19 (근로계약서) + T21 (이력서)
//
// 2026-08-05 · OAuth 2.0 (refresh_token) 방식 · Service Account 대체
//   · SA 는 개인 Drive 저장 불가 (Google 정책 · quota 없음)
//   · OAuth · 개인 Google 계정 · 15GB 무료 사용 가능
//
// 설정 파일 (src/keys/*.json · gitignore):
//   OAuth 방식 (권장):
//     { "client_id": "...", "client_secret": "...", "refresh_token": "..." }
//   Service Account 방식 (레거시 · 공유 드라이브만):
//     { "type": "service_account", "private_key": "...", ... }
//
// 폴더 ID · 하드코딩 (사용자 제공 · 2026-08-05):
//   - 근로계약서: 1taDuOluNZxHSd_uJ7qr32xRVYFpD-IXe
//   - 이력서:    1gEYUWD-PHzsewJkomuzWkpQA960rLkUv

import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import { Readable } from "stream";
import fs from "fs";
import path from "path";
import { supabase } from "../../src/supabase/client";

// 사용자 제공 · Drive 폴더 ID · 2026-09-21 · #327-① · leave · misc 추가
// leave · misc 폴더 · 미설정 시 contract 폴더로 fallback (사용자 확인 후 별도 폴더 발급 가능)
const DRIVE_FOLDERS_DEFAULT: Record<FolderKind, string | null> = {
  resume: "1gEYUWD-PHzsewJkomuzWkpQA960rLkUv",
  contract: "1taDuOluNZxHSd_uJ7qr32xRVYFpD-IXe",
  leave: null,   // 미설정 · misc → contract fallback
  misc: null,    // 미설정 · contract fallback
};

const KEY_FILE_DIRS = [
  path.join(process.cwd(), "src", "keys"),
  path.join(process.cwd(), "keys"),
];

// 2026-09-21 · #327-① · 폴더 kind 통합 · resume/contract/leave/misc
export type FolderKind = "resume" | "contract" | "leave" | "misc";

interface OAuthCreds {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  // 2026-09-21 · #327-④ · refresh_token 발급 시점 (ISO 8601) · 만료 D-2 알림용
  // 파일 (google-oauth.json) 에 issued_at 이 있으면 로드 · 없으면 파일 mtime 사용
  issued_at?: string | null;
}

interface DriveConfig {
  oauth: OAuthCreds | null;
  serviceAccountJson: any | null;  // 레거시 fallback
  folders: Record<FolderKind, string | null>;
}

let cached: { driveClient: drive_v3.Drive | null; config: DriveConfig } = {
  driveClient: null,
  config: {
    oauth: null,
    serviceAccountJson: null,
    folders: { resume: null, contract: null, leave: null, misc: null },
  },
};
let initTried = false;
let lastInitFailAt = 0;
const RETRY_COOLDOWN_MS = 60 * 1000;

/**
 * src/keys 폴더에서 · OAuth JSON 또는 Service Account JSON 을 자동 감지 로드
 * 우선순위: OAuth > Service Account (OAuth 가 있으면 그것을 사용)
 */
function loadKeyFromFile(): { oauth: OAuthCreds | null; sa: any | null; folders: Partial<Record<FolderKind, string>> } {
  let oauth: OAuthCreds | null = null;
  let sa: any | null = null;
  const folders: Partial<Record<FolderKind, string>> = {};
  for (const dir of KEY_FILE_DIRS) {
    try {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
      for (const f of files) {
        try {
          const filePath = path.join(dir, f);
          const raw = fs.readFileSync(filePath, "utf8");
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object") continue;
          // OAuth JSON 감지 · refresh_token 존재
          if (parsed.refresh_token && parsed.client_id && parsed.client_secret) {
            // 2026-09-21 · #327-④ · issued_at · 파일에 있으면 우선 · 없으면 file mtime
            let issuedAt: string | null = null;
            if (parsed.issued_at && typeof parsed.issued_at === "string") {
              issuedAt = parsed.issued_at;
            } else {
              try {
                const st = fs.statSync(filePath);
                issuedAt = st.mtime.toISOString();
              } catch { /* mtime 실패 시 null 유지 */ }
            }
            oauth = {
              client_id: String(parsed.client_id),
              client_secret: String(parsed.client_secret),
              refresh_token: String(parsed.refresh_token),
              issued_at: issuedAt,
            };
            // 2026-09-21 · #327-① · folders 필드 지원 · JSON 안에 폴더 매핑 추가 가능
            if (parsed.folders && typeof parsed.folders === "object") {
              for (const k of ["resume", "contract", "leave", "misc"] as const) {
                const v = parsed.folders[k];
                if (typeof v === "string" && v.trim()) folders[k] = v.trim();
              }
            }
            console.log(`[google-drive] OAuth 크레덴셜 로드 (파일): ${filePath} · issued_at=${issuedAt ?? "?"}`);
          }
          // Service Account JSON 감지 (레거시)
          else if (parsed.type === "service_account" && parsed.private_key) {
            sa = parsed;
            console.log(`[google-drive] Service Account 키 로드 (파일): ${filePath}`);
          }
        } catch (e: any) {
          console.warn(`[google-drive] 파일 파싱 실패 (${f}):`, e?.message);
        }
      }
    } catch (e: any) {
      console.warn(`[google-drive] 디렉토리 읽기 실패 (${dir}):`, e?.message);
    }
  }
  return { oauth, sa, folders };
}

async function loadConfig(): Promise<DriveConfig> {
  const config: DriveConfig = {
    oauth: null,
    serviceAccountJson: null,
    folders: { ...DRIVE_FOLDERS_DEFAULT },
  };

  // 1) 파일 우선
  const fromFile = loadKeyFromFile();
  if (fromFile.oauth) config.oauth = fromFile.oauth;
  if (fromFile.sa) config.serviceAccountJson = fromFile.sa;
  // 2026-09-21 · #327-① · 파일 folders override
  for (const k of ["resume", "contract", "leave", "misc"] as const) {
    if (fromFile.folders[k]) config.folders[k] = fromFile.folders[k]!;
  }

  // 2) DB fallback · 파일 없으면 · 폴더 ID override
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["google_service_account", "google_oauth_refresh", "google_drive_folders"]);
    for (const row of (data ?? []) as any[]) {
      if (row.key === "google_oauth_refresh" && !config.oauth) {
        const v = row.value ?? {};
        if (v.refresh_token && v.client_id && v.client_secret) {
          config.oauth = {
            client_id: String(v.client_id),
            client_secret: String(v.client_secret),
            refresh_token: String(v.refresh_token),
            issued_at: typeof v.issued_at === "string" ? v.issued_at : null,
          };
          console.log("[google-drive] OAuth 크레덴셜 로드 (Supabase)");
        }
      }
      if (row.key === "google_service_account" && !config.serviceAccountJson) {
        config.serviceAccountJson = row.value ?? null;
        if (config.serviceAccountJson) console.log("[google-drive] Service Account 키 로드 (Supabase)");
      }
      if (row.key === "google_drive_folders") {
        const v = row.value ?? {};
        // 2026-09-21 · #327-① · leave · misc 지원
        for (const k of ["resume", "contract", "leave", "misc"] as const) {
          if (typeof v[k] === "string" && v[k].trim()) config.folders[k] = v[k].trim();
        }
      }
    }
  } catch (e: any) {
    console.warn("[google-drive] app_settings 조회 실패:", e?.message);
  }

  return config;
}

/**
 * 2026-09-21 · #327-① · kind → folderId 해석 유틸.
 * leave · misc · 미설정 시 misc → contract 순으로 fallback.
 * 관리자 확인 후 별도 폴더 발급 가능하도록 확장 가능한 구조.
 */
export function resolveDriveFolder(
  kind: FolderKind,
  folders: Record<FolderKind, string | null>,
): { folderId: string | null; usedKind: FolderKind } {
  if (folders[kind]) return { folderId: folders[kind], usedKind: kind };
  // misc 로 fallback · misc 도 없으면 contract 로 최종 fallback
  if (kind !== "misc" && folders.misc) return { folderId: folders.misc, usedKind: "misc" };
  if (folders.contract) return { folderId: folders.contract, usedKind: "contract" };
  return { folderId: null, usedKind: kind };
}

async function initClient(): Promise<drive_v3.Drive | null> {
  if (cached.driveClient) return cached.driveClient;
  if (initTried && Date.now() - lastInitFailAt < RETRY_COOLDOWN_MS) {
    return cached.driveClient;
  }
  initTried = true;
  try {
    const config = await loadConfig();
    cached.config = config;

    // 방식 1 · OAuth (권장 · 개인 Drive 지원)
    if (config.oauth) {
      const oAuth2Client = new google.auth.OAuth2(
        config.oauth.client_id,
        config.oauth.client_secret,
        "https://developers.google.com/oauthplayground",
      );
      oAuth2Client.setCredentials({ refresh_token: config.oauth.refresh_token });
      const client = google.drive({ version: "v3", auth: oAuth2Client });
      cached.driveClient = client;
      console.log("[google-drive] OAuth 초기화 완료 · 폴더: resume=", config.folders.resume, "contract=", config.folders.contract);
      return client;
    }

    // 방식 2 · Service Account (레거시 · 공유 드라이브만)
    if (config.serviceAccountJson) {
      const auth = new google.auth.GoogleAuth({
        credentials: config.serviceAccountJson,
        scopes: ["https://www.googleapis.com/auth/drive.file"],
      });
      const client = google.drive({ version: "v3", auth });
      cached.driveClient = client;
      console.log("[google-drive] Service Account 초기화 완료 · 폴더: resume=", config.folders.resume, "contract=", config.folders.contract);
      return client;
    }

    console.warn("[google-drive] OAuth · Service Account 모두 미설정 · Drive 통합 비활성");
    lastInitFailAt = Date.now();
    return null;
  } catch (e: any) {
    console.warn("[google-drive] 초기화 실패:", e?.message ?? e);
    lastInitFailAt = Date.now();
    return null;
  }
}

// 2026-09-21 · #327-④ · OAuth 테스트 앱 refresh_token 유효기간 (7일)
// 프로덕션 게시 시 무기한 · 유효성은 probe 로 검증 (heuristic)
const REFRESH_TOKEN_LIFETIME_DAYS = 7;

/**
 * OAuth refresh_token 유효성 사전 검증 · 부팅·요청 시 진단 용도.
 * E-002 (2026-09-21) · invalid_grant 조기 감지.
 * 2026-09-21 · #327-④ · issued_at 기반 만료 예상일 (expires_at) 추가.
 */
export interface ProbeDriveAuthResult {
  ok: boolean;
  mode: "oauth" | "service_account" | "none";
  reason?: string;
  // 2026-09-21 · #327-④ · 만료 예상일 · 관리자 대시보드 D-2 알림용
  issued_at?: string | null;
  expires_at?: string | null;
  days_left?: number | null;
}

export async function probeDriveAuth(): Promise<ProbeDriveAuthResult> {
  const client = await initClient();
  const mode: "oauth" | "service_account" | "none" =
    cached.config.oauth ? "oauth" :
    cached.config.serviceAccountJson ? "service_account" : "none";

  // 만료 예상일 계산 (OAuth 만)
  const issuedAt = cached.config.oauth?.issued_at ?? null;
  let expiresAt: string | null = null;
  let daysLeft: number | null = null;
  if (mode === "oauth" && issuedAt) {
    try {
      const issuedMs = new Date(issuedAt).getTime();
      if (Number.isFinite(issuedMs)) {
        const expiresMs = issuedMs + REFRESH_TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000;
        expiresAt = new Date(expiresMs).toISOString();
        daysLeft = Math.ceil((expiresMs - Date.now()) / (24 * 60 * 60 * 1000));
      }
    } catch { /* issued_at 파싱 실패 시 null */ }
  }

  if (!client) {
    return { ok: false, mode, reason: "미설정 · src/keys 없음", issued_at: issuedAt, expires_at: expiresAt, days_left: daysLeft };
  }
  try {
    // about.get · 최소 quota 소모 API · 토큰 유효성 확인
    await client.about.get({ fields: "user" });
    return { ok: true, mode, issued_at: issuedAt, expires_at: expiresAt, days_left: daysLeft };
  } catch (e: any) {
    const gErr = e?.response?.data?.error ?? "";
    const gDesc = e?.response?.data?.error_description ?? "";
    return {
      ok: false,
      mode,
      reason: gErr === "invalid_grant"
        ? "refresh_token 만료 · OAuth Playground 재발급 필요"
        : (gDesc || e?.message || "unknown"),
      issued_at: issuedAt,
      expires_at: expiresAt,
      days_left: daysLeft,
    };
  }
}

export async function isDriveReady(): Promise<{
  ready: boolean;
  mode: "oauth" | "service_account" | "none";
  folders: DriveConfig["folders"];
}> {
  const client = await initClient();
  const mode: "oauth" | "service_account" | "none" =
    cached.config.oauth ? "oauth" :
    cached.config.serviceAccountJson ? "service_account" : "none";
  return { ready: !!client, mode, folders: cached.config.folders };
}

export interface DriveUploadResult {
  fileId: string;
  webViewLink: string;
  webContentLink?: string;
  name: string;
  size: number;
}

/**
 * Google API 에러 → 사용자 친화 한국어 메시지 매핑.
 * E-002 (2026-09-21) · refresh_token 만료 · 원인 안 보이는 문제 해결.
 */
function humanizeDriveError(err: any): string {
  const raw = err?.response?.data ?? err?.errors ?? err;
  const code = err?.code ?? err?.response?.status;
  const gErr = err?.response?.data?.error ?? err?.errors?.[0]?.reason ?? "";
  const gDesc = err?.response?.data?.error_description ?? err?.errors?.[0]?.message ?? "";
  const msg = String(err?.message ?? "");

  // 1) refresh_token 만료 · 재발급 필요 (테스트 앱 · 7일 만료)
  if (gErr === "invalid_grant" || /invalid_grant/i.test(msg)) {
    return "Google Drive 인증 토큰이 만료되었습니다 (invalid_grant). " +
      "관리자가 OAuth Playground 에서 refresh_token 을 재발급해 src/keys/google-oauth.json 을 갱신해야 합니다. " +
      "(원인: 테스트 상태 앱 · 7일 만료 · 프로덕션 게시 필요)";
  }
  // 2) 스코프 부족
  if (gErr === "insufficient_permissions" || /insufficient/i.test(gDesc) || code === 403) {
    return `Google Drive 권한 부족 (403). 스코프 · 폴더 편집 권한을 확인하세요. (${gDesc || msg})`;
  }
  // 3) 폴더 없음 · 잘못된 fileId
  if (code === 404 || /notFound/i.test(gErr)) {
    return `Google Drive 폴더 또는 파일을 찾을 수 없습니다 (404). 폴더 ID 를 확인하세요. (${gDesc || msg})`;
  }
  // 4) 용량 초과
  if (/quota|storageQuotaExceeded/i.test(gErr) || /quota/i.test(gDesc)) {
    return `Google Drive 저장 용량 초과. 개인 계정 15GB 확인. (${gDesc || msg})`;
  }
  // 5) 네트워크·타임아웃
  if (code === "ETIMEDOUT" || code === "ECONNRESET" || /timeout/i.test(msg)) {
    return `Google Drive 네트워크 오류 · 잠시 후 재시도하세요. (${msg})`;
  }
  // 6) 그 외 · 원문 반환
  const detail = gDesc || gErr || msg || "unknown";
  return `Google Drive 오류 · ${detail}${code ? ` (code=${code})` : ""}`;
}

export async function uploadToDrive(
  kind: FolderKind,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<DriveUploadResult> {
  const client = await initClient();
  if (!client) {
    // 미설정 원인 세분화
    const hasKey = !!cached.config.oauth || !!cached.config.serviceAccountJson;
    if (!hasKey) {
      throw new Error(
        "Google Drive 미설정 · src/keys/google-oauth.json 또는 서비스 계정 JSON 이 없습니다. " +
        "관리자에게 Drive 연동을 요청하세요.",
      );
    }
    // 키는 있으나 initClient 실패 (드문 케이스)
    throw new Error("Google Drive 초기화 실패 · 서버 로그의 [google-drive] 초기화 실패 원인을 확인하세요.");
  }
  // 2026-09-21 · #327-① · 폴더 kind 통합 · leave/misc 미설정 시 misc → contract fallback
  const { folderId, usedKind } = resolveDriveFolder(kind, cached.config.folders);
  if (!folderId) throw new Error(`Google Drive 폴더 ID 미설정 · ${kind}`);
  if (usedKind !== kind) {
    console.log(`[google-drive] 폴더 fallback · 요청=${kind} · 사용=${usedKind} · folderId=${folderId}`);
  }

  try {
    const created = await client.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
        mimeType,
      },
      media: {
        mimeType,
        body: Readable.from(buffer),
      },
      fields: "id, name, size, webViewLink, webContentLink",
      supportsAllDrives: true,
    });

    const fileId = created.data.id!;
    try {
      await client.permissions.create({
        fileId,
        requestBody: { role: "reader", type: "anyone" },
        supportsAllDrives: true,
      });
    } catch (e: any) {
      console.warn(`[google-drive] 공유 권한 설정 실패 (계속 진행) · ${e?.message}`);
    }

    console.log(`[google-drive] 업로드 성공 · kind=${kind} · name=${fileName} · size=${buffer.length} · fileId=${fileId}`);
    return {
      fileId,
      webViewLink: created.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
      webContentLink: created.data.webContentLink ?? undefined,
      name: created.data.name ?? fileName,
      size: Number(created.data.size ?? 0),
    };
  } catch (e: any) {
    // 상세 원인 로그 · 사용자 친화 메시지로 rethrow
    console.error(
      `[google-drive] 업로드 실패 · kind=${kind} · name=${fileName} · size=${buffer.length}` +
      ` · code=${e?.code ?? "?"} · status=${e?.response?.status ?? "?"}` +
      ` · gError=${e?.response?.data?.error ?? "?"}` +
      ` · gDesc=${e?.response?.data?.error_description ?? "?"}` +
      ` · msg=${e?.message ?? "?"}`,
    );
    // invalid_grant · 캐시된 클라이언트 무효화 · 다음 요청에서 재시도 가능
    if (e?.response?.data?.error === "invalid_grant" || /invalid_grant/i.test(String(e?.message ?? ""))) {
      cached.driveClient = null;
      initTried = false;
    }
    throw new Error(humanizeDriveError(e));
  }
}

export async function deleteFromDrive(fileId: string): Promise<boolean> {
  const client = await initClient();
  if (!client) return false;
  try {
    await client.files.delete({ fileId, supportsAllDrives: true });
    return true;
  } catch (e: any) {
    console.warn(`[google-drive] 삭제 실패 · fileId=${fileId} · ${e?.message}`);
    return false;
  }
}

export function extractDriveFileId(url: string): string | null {
  if (!url) return null;
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}
