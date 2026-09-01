// server/routes/settings/systemConfig.ts
// 2026-08-12 · 시스템 설정 API · env 편집 · 재시작 시 반영
//   · GET /api/system-config · 관리자 lv≥9 · 파일+env 병합 · 민감값 마스킹
//   · POST /api/system-config · 관리자 lv≥9 · patch 저장 · restartRequired=true
// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
import { Router } from "express";
import { z } from "zod";
import { authorize } from "../../middleware/requireAuth";
import { readTenantConfig, saveTenantConfig, isSensitive, maskValue } from "../../lib/tenantConfig";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../middleware/errorHandler";
import { validateBody } from "../../middleware/zodValidate";

const router = Router();

// 편집 대상 화이트리스트 · 이 외 키는 저장 거부
export const SUPPORTED_KEYS = [
  // DB / Auth
  "SUPABASE_URL", "SUPABASE_KEY",
  "JWT_SECRET",
  // AI / OCR
  "GEMINI_API_KEY", "GEMINI_API_KEYS",
  // SMS · 알림톡
  "SOLAPI_API_KEY", "SOLAPI_API_SECRET", "SOLAPI_SENDER",
  "KAKAO_TOKEN", "KAKAO_PFID",
  // 이미지 CDN
  "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET",
  // Web Push · 2026-08-26 · 런타임 이름과 통일 (기존 WEB_PUSH_VAPID_PUBLIC/PRIVATE/SUBJECT → VAPID_*)
  "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT",
  // OCR 수신처 (프레임워크 · 다른 약국 배포 시 수정)
  "OCR_RECIPIENT_COMPANY", "OCR_RECIPIENT_NAMES", "OCR_RECIPIENT_ADDRESS",
  "OCR_EXCLUDED_LOGISTICS", "OCR_EXCLUDED_SUPPLIERS", "OCR_EXCLUDED_BUSINESS_NUMBERS",
];

interface FieldState {
  value: string;                       // 마스킹 or 실제
  source: "file" | "env" | "";         // 값 출처
  masked: boolean;                     // 민감 마스킹 여부
  hasValue: boolean;                   // 실제 값이 있는지 (편집 UI · placeholder 표시용)
}

router.get("/api/system-config", authorize(9), asyncHandler(async (_req, res) => {
  const fileCfg = readTenantConfig();
  const result: Record<string, FieldState> = {};
  for (const k of SUPPORTED_KEYS) {
    const fromFile = fileCfg[k];
    const fromEnv = process.env[k];
    const raw = (fromFile != null && fromFile !== "") ? fromFile : (fromEnv ?? "");
    const hasValue = !!(raw && raw.length);
    const source: "file" | "env" | "" = fromFile != null && fromFile !== "" ? "file" : (fromEnv ? "env" : "");
    const sensitive = isSensitive(k);
    result[k] = {
      value: sensitive && hasValue ? maskValue(raw) : (raw ?? ""),
      source,
      masked: sensitive && hasValue,
      hasValue,
    };
  }
  res.json(result);
}));

const SystemConfigPatchSchema = z.record(z.string(), z.union([z.string(), z.null()]));

router.post("/api/system-config", authorize(9), validateBody(SystemConfigPatchSchema), asyncHandler(async (req, res) => {
  const patch = req.body;
  const cleanPatch: Record<string, string> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!SUPPORTED_KEYS.includes(k)) continue;
    if (v == null) { cleanPatch[k] = ""; continue; } // 삭제 (env 로 되돌림)
    if (typeof v !== "string") continue;
    cleanPatch[k] = v;
  }
  const saved = saveTenantConfig(cleanPatch);
  res.json({
    ok: true,
    restartRequired: true,
    savedKeys: Object.keys(saved),
    message: "저장되었습니다. 서버를 재시작해야 새 값이 적용됩니다.",
  });
}));

export default router;
