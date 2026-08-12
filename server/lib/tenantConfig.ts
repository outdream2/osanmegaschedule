// server/lib/tenantConfig.ts
// 2026-08-12 · 프레임워크 재사용 · 테넌트별 env 설정 (파일 저장 · 서버 재시작 시 process.env 병합)
//
// 목적:
//   · 다른 약국 배포 시 · .env 재편집·재배포 없이 · 관리자 UI 에서 필수 env 편집
//   · 저장은 로컬 파일 (server/tenant.config.json) · Supabase 아님 (재귀 문제 방지)
//   · 서버 부팅 시 loadTenantConfig() 로 process.env 에 override · 이후 코드는 process.env 사용
//   · 저장 후 반영은 · 서버 재시작 필요 (프론트에서 안내 배너)
//
// 보안:
//   · 파일은 .gitignore (커밋되면 안 됨)
//   · 민감한 KEY 는 GET 시 마스킹 (isSensitive/maskValue)
//   · GET/POST 는 authorize(9) 미들웨어 (JWT 쿠키)
import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "server", "tenant.config.json");

export interface TenantConfig {
  [key: string]: string | undefined;
}

/** 부팅 시 1회 호출 · 파일 → process.env 로 override
 *  · 파일이 없으면 조용히 스킵 (기존 .env / 시스템 env 유지)
 *  · 파일이 있으면 · 파일 값이 우선 (사용자 편집이 최신)
 */
export function loadTenantConfig(): TenantConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    if (!raw.trim()) return {};
    const cfg = JSON.parse(raw) as TenantConfig;
    let applied = 0;
    for (const [k, v] of Object.entries(cfg)) {
      if (typeof v === "string" && v.trim()) {
        process.env[k] = v;
        applied++;
      }
    }
    if (applied > 0) {
      console.log(`[tenantConfig] loaded · ${applied} keys · applied to process.env`);
    }
    return cfg;
  } catch (e) {
    console.warn("[tenantConfig] load failed · ignoring", e);
    return {};
  }
}

/** 현재 파일 내용 (마스킹 없음) · GET 응답 준비 시 사용 */
export function readTenantConfig(): TenantConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    if (!raw.trim()) return {};
    return JSON.parse(raw) as TenantConfig;
  } catch {
    return {};
  }
}

/** patch 병합 저장 · 빈 문자열 값은 삭제 (env 로 되돌림) */
export function saveTenantConfig(patch: TenantConfig): TenantConfig {
  const current = readTenantConfig();
  const merged: TenantConfig = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") delete merged[k];
    else merged[k] = String(v);
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

// ─── 민감 키 판정 · 마스킹 ────────────────────────────────────────────────────
const SENSITIVE_KEYS = new Set([
  "SUPABASE_KEY",
  "JWT_SECRET",
  "GEMINI_API_KEY", "GEMINI_API_KEYS",
  "SOLAPI_API_KEY", "SOLAPI_API_SECRET",
  "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET",
  "WEB_PUSH_VAPID_PRIVATE",
  "KAKAO_TOKEN",
]);

export function isSensitive(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toUpperCase());
}

export function maskValue(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "****";
  return "****" + value.slice(-4);
}
