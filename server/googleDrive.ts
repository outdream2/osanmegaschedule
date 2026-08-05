// server/googleDrive.ts
// Google Drive 통합 · T19 (근로계약서) + T21 (이력서)
//
// 설정 로드 우선순위:
//   1. 파일 · src/keys/*.json (Service Account 키 · gitignore) → 최우선
//   2. Supabase · app_settings.google_service_account (fallback)
//
// 폴더 ID · 하드코딩 (사용자 제공 · 2026-08-05):
//   - 근로계약서: 1taDuOluNZxHSd_uJ7qr32xRVYFpD-IXe
//   - 이력서:    1gEYUWD-PHzsewJkomuzWkpQA960rLkUv
//   변경 시 · DRIVE_FOLDERS 상수 수정 or app_settings.google_drive_folders 로 override
//
// 사용:
//   const url = await uploadToDrive("resume", buffer, "홍길동_이력서.pdf", "application/pdf");
//   → https://drive.google.com/file/d/<fileId>/view (public link · anyone with link · viewer)

import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import { Readable } from "stream";
import fs from "fs";
import path from "path";
import { supabase } from "../src/supabase/client";

// 사용자 제공 · Drive 폴더 ID (기본값 · app_settings 로 override 가능)
const DRIVE_FOLDERS_DEFAULT = {
  resume: "1gEYUWD-PHzsewJkomuzWkpQA960rLkUv",
  contract: "1taDuOluNZxHSd_uJ7qr32xRVYFpD-IXe",
};

// Service Account 키 파일 검색 경로 (우선순위)
const KEY_FILE_DIRS = [
  path.join(process.cwd(), "src", "keys"),
  path.join(process.cwd(), "keys"),
];

type FolderKind = "resume" | "contract";

interface DriveConfig {
  serviceAccountJson: any | null;
  folders: Record<FolderKind, string | null>;
}

let cached: { driveClient: drive_v3.Drive | null; config: DriveConfig } = {
  driveClient: null,
  config: { serviceAccountJson: null, folders: { resume: null, contract: null } },
};
let initTried = false;

function loadKeyFromFile(): any | null {
  for (const dir of KEY_FILE_DIRS) {
    try {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
      if (files.length === 0) continue;
      // 첫번째 .json 파일 사용 (여러 개 있으면 이름 순 첫번째)
      const filePath = path.join(dir, files.sort()[0]);
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.type === "service_account" && parsed.private_key) {
        console.log(`[google-drive] Service Account 키 로드 (파일): ${filePath}`);
        return parsed;
      }
    } catch (e: any) {
      console.warn(`[google-drive] 키 파일 읽기 실패 (${dir}):`, e?.message);
    }
  }
  return null;
}

async function loadConfig(): Promise<DriveConfig> {
  const config: DriveConfig = {
    serviceAccountJson: null,
    folders: { ...DRIVE_FOLDERS_DEFAULT },
  };

  // 1) 파일 우선 (src/keys/*.json)
  const fromFile = loadKeyFromFile();
  if (fromFile) {
    config.serviceAccountJson = fromFile;
  }

  // 2) DB fallback (파일 없으면) + folder ID override
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["google_service_account", "google_drive_folders"]);
    for (const row of (data ?? []) as any[]) {
      if (row.key === "google_service_account" && !config.serviceAccountJson) {
        config.serviceAccountJson = row.value ?? null;
        if (config.serviceAccountJson) console.log("[google-drive] Service Account 키 로드 (Supabase app_settings)");
      }
      if (row.key === "google_drive_folders") {
        const v = row.value ?? {};
        if (v.resume) config.folders.resume = v.resume;
        if (v.contract) config.folders.contract = v.contract;
      }
    }
  } catch (e: any) {
    console.warn("[google-drive] app_settings 조회 실패:", e?.message);
  }

  return config;
}

async function initClient(): Promise<drive_v3.Drive | null> {
  if (cached.driveClient) return cached.driveClient;
  if (initTried) return cached.driveClient;
  initTried = true;
  try {
    const config = await loadConfig();
    cached.config = config;
    if (!config.serviceAccountJson) {
      console.warn("[google-drive] app_settings.google_service_account 미설정 · Drive 통합 비활성");
      return null;
    }
    const auth = new google.auth.GoogleAuth({
      credentials: config.serviceAccountJson,
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });
    const client = google.drive({ version: "v3", auth });
    cached.driveClient = client;
    console.log("[google-drive] 초기화 완료 · 폴더: resume=", config.folders.resume, "contract=", config.folders.contract);
    return client;
  } catch (e: any) {
    console.warn("[google-drive] 초기화 실패:", e?.message);
    return null;
  }
}

export async function isDriveReady(): Promise<{ ready: boolean; folders: DriveConfig["folders"] }> {
  const client = await initClient();
  return { ready: !!client, folders: cached.config.folders };
}

export interface DriveUploadResult {
  fileId: string;
  webViewLink: string;      // https://drive.google.com/file/d/<id>/view (뷰어 페이지)
  webContentLink?: string;  // 다운로드 링크 (선택)
  name: string;
  size: number;
}

/**
 * 파일을 Google Drive 지정 폴더에 업로드하고 · 공유 링크(anyone with link · viewer) 를 반환
 *
 * @param kind "resume" | "contract" (앱_settings.google_drive_folders 에서 조회)
 * @param buffer 파일 바이너리
 * @param fileName 저장할 파일명 (예: "홍길동_이력서_20260805.pdf")
 * @param mimeType MIME 타입 (예: "application/pdf")
 */
export async function uploadToDrive(
  kind: FolderKind,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<DriveUploadResult> {
  const client = await initClient();
  if (!client) throw new Error("Google Drive 미설정 · app_settings 확인 필요");
  const folderId = cached.config.folders[kind];
  if (!folderId) throw new Error(`Google Drive 폴더 ID 미설정 · ${kind}`);

  // 파일 생성
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
  // 공유 설정 · anyone with link · reader (organization 정책 따라 실패 가능 · 무시)
  try {
    await client.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
      supportsAllDrives: true,
    });
  } catch (e: any) {
    console.warn(`[google-drive] 공유 권한 설정 실패 (계속 진행) · ${e?.message}`);
  }

  return {
    fileId,
    webViewLink: created.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
    webContentLink: created.data.webContentLink ?? undefined,
    name: created.data.name ?? fileName,
    size: Number(created.data.size ?? 0),
  };
}

/**
 * Drive 파일 삭제 · (실패해도 throw X · log 만)
 */
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

/**
 * URL 에서 Drive fileId 추출
 * 지원 형식:
 *  - https://drive.google.com/file/d/<ID>/view
 *  - https://drive.google.com/open?id=<ID>
 *  - https://drive.google.com/uc?id=<ID>
 */
export function extractDriveFileId(url: string): string | null {
  if (!url) return null;
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}
