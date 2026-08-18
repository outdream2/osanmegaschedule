// 2026-08-16 · 프레임워크 · 환경변수 부팅 검증
// server.ts 최상단에서 loadTenantConfig() 뒤에 호출 · 필수 미설정 시 fail-fast
//
// 사용:
//   import { validateEnv } from "./server/lib/envValidation";
//   validateEnv();  // 실패 시 process.exit(1)
//
// 원칙:
//   - required · 없으면 프로세스 종료 (인증·DB 관련)
//   - recommended · 없으면 warn (푸시·OCR·업로드 관련 · 기능 부분 비활성)
//   - optional · 침묵 (개발용 · 미설정 정상)
type Severity = "required" | "recommended" | "optional";
interface EnvSpec {
  key: string;
  severity: Severity;
  purpose: string;
}

const ENV_SPECS: EnvSpec[] = [
  // ── required · 미설정 시 서버 fail ──
  //   · 2026-08-17 · SUPABASE_KEY (서버 코드가 사용하는 실제 키명) · 이전 오탐 SUPABASE_ANON_KEY 수정
  { key: "SUPABASE_URL",       severity: "required",    purpose: "Supabase 접속 URL" },
  { key: "SUPABASE_KEY",       severity: "required",    purpose: "Supabase 서비스 키 (서버 · client.ts:12)" },
  // 2026-08-18 · JWT_SECRET · required → recommended
  //   requireAuth.ts 에서 미설정 시 SUPABASE_KEY 로 자동 파생 (HMAC-SHA256 · deterministic)
  //   명시적 설정 시 그 값 우선 (rotate 가능)
  { key: "JWT_SECRET",         severity: "recommended", purpose: "JWT 서명 (미설정 시 SUPABASE_KEY 자동 파생)" },
  // ── recommended · 미설정 시 기능 부분 비활성 ──
  { key: "VAPID_PUBLIC_KEY",   severity: "recommended", purpose: "웹푸시 알림 (공개키)" },
  { key: "VAPID_PRIVATE_KEY",  severity: "recommended", purpose: "웹푸시 알림 (비공개키)" },
  { key: "VAPID_SUBJECT",      severity: "recommended", purpose: "웹푸시 알림 (연락처)" },
  { key: "GEMINI_API_KEY",     severity: "recommended", purpose: "Gemini OCR (거래명세서 인식)" },
  { key: "CLOUDINARY_URL",     severity: "recommended", purpose: "이미지 업로드 (게시판·거래명세서)" },
  { key: "GOOGLE_APPLICATION_CREDENTIALS", severity: "recommended", purpose: "Google Drive (이력서 업로드)" },
];

export interface EnvCheckResult {
  ok: boolean;
  missing: { key: string; purpose: string }[];
  warnings: { key: string; purpose: string }[];
}

export function checkEnv(): EnvCheckResult {
  const missing: { key: string; purpose: string }[] = [];
  const warnings: { key: string; purpose: string }[] = [];
  for (const spec of ENV_SPECS) {
    const val = process.env[spec.key];
    if (val && val.trim() !== "") continue;
    if (spec.severity === "required") missing.push({ key: spec.key, purpose: spec.purpose });
    else if (spec.severity === "recommended") warnings.push({ key: spec.key, purpose: spec.purpose });
  }
  return { ok: missing.length === 0, missing, warnings };
}

/** 부팅 시 호출 · required 미설정 시 fail-fast (process.exit(1)) */
export function validateEnv(): void {
  const { ok, missing, warnings } = checkEnv();
  if (warnings.length > 0) {
    console.warn("\n[envValidation] ⚠️  권장 환경변수 미설정 · 일부 기능 비활성:");
    for (const w of warnings) console.warn(`   - ${w.key} · ${w.purpose}`);
    console.warn("");
  }
  if (!ok) {
    console.error("\n[envValidation] ❌  필수 환경변수 미설정 · 서버 종료:");
    for (const m of missing) console.error(`   - ${m.key} · ${m.purpose}`);
    console.error("\n → .env 파일 또는 배포 환경변수 설정 후 재시작하세요.\n");
    // 테스트 환경에서는 exit 하지 않음 (vitest 등)
    if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
      process.exit(1);
    }
    throw new Error(`Missing required env: ${missing.map(m => m.key).join(", ")}`);
  }
  console.log(`[envValidation] ✓  필수 env ${ENV_SPECS.filter(s => s.severity === "required").length}개 확인 완료`);
}
