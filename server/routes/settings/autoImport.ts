// 2026-08-24 · #253 · 자동 임포트 · 서버 endpoints (config get/post · heartbeat)
//   · 관리자 lv9 만 · authorize(9) 미들웨어
//   · KV `auto_import_config` (설정) · `auto_import_status` (heartbeat 상태)
//   · Python 스크립트는 매 실행마다 config 조회 · heartbeat 리포트
//   · installer zip 다운로드 endpoint 는 Phase C (PyInstaller 빌드 후)
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authorize } from "../../middleware/requireAuth";
import { HttpError, badRequest } from "../../middleware/errorHandler";
import { validateBody } from "../../middleware/zodValidate";
import {
  AutoImportConfigSchema,
  AutoImportHeartbeatSchema,
  DEFAULT_AUTO_IMPORT_CONFIG,
  type AutoImportStatus,
} from "../../../src/shared/schemas/autoImport";

const router = Router();

const CONFIG_KEY = "auto_import_config";
const STATUS_KEY = "auto_import_status";

/**
 * GET /api/auto-import/config · 자동 임포트 설정 조회
 *   · Python (매 실행) · 웹 UI (초기 로드) 공용
 *   · KV 부재 시 · DEFAULT_AUTO_IMPORT_CONFIG 반환 (enabled=false)
 */
router.get("/api/auto-import/config", authorize(9), asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", CONFIG_KEY)
    .maybeSingle();
  if (error) throw new HttpError(500, `자동 임포트 설정 조회 실패: ${error.message}`);
  const raw = data?.value ?? DEFAULT_AUTO_IMPORT_CONFIG;
  // Zod 파싱 · KV 손상 시 · DEFAULT fallback
  const parsed = AutoImportConfigSchema.safeParse(raw);
  const value = parsed.success ? parsed.data : DEFAULT_AUTO_IMPORT_CONFIG;
  res.json({ value });
}));

/**
 * POST /api/auto-import/config · 자동 임포트 설정 저장 (관리자 웹 UI 편집)
 *   · 저장 → Python 다음 실행에서 반영 (Task Scheduler interval 도 자동 재등록)
 */
router.post(
  "/api/auto-import/config",
  authorize(9),
  validateBody(AutoImportConfigSchema),
  asyncHandler(async (req, res) => {
    const value = req.body;  // Zod 검증됨
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: CONFIG_KEY, value, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw new HttpError(500, `자동 임포트 설정 저장 실패: ${error.message}`);
    res.json({ ok: true, value });
  }),
);

/**
 * POST /api/auto-import/heartbeat · Python 매 실행 후 상태 리포트
 *   · KV `auto_import_status` 갱신 · 웹 UI 상태 표시 (green/amber/red)
 *   · errors 배열 · 최근 실패 · 관리자 참고
 */
router.post(
  "/api/auto-import/heartbeat",
  authorize(9),
  validateBody(AutoImportHeartbeatSchema),
  asyncHandler(async (req, res) => {
    const beat = req.body;
    const status: AutoImportStatus = {
      last_heartbeat_at:  beat.at,
      last_status:        beat.status,
      last_processed:     beat.processed ?? {},
      last_errors:        beat.errors ?? [],
      last_script_version: beat.script_version ?? null,
      last_host:          beat.host ?? null,
      updated_at:         new Date().toISOString(),
    };
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: STATUS_KEY, value: status, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw new HttpError(500, `자동 임포트 상태 저장 실패: ${error.message}`);
    // Python 이 사용할 정보 · 다음 config 반영 필요 여부
    res.json({ ok: true, received_at: status.updated_at });
  }),
);

/**
 * GET /api/auto-import/status · 웹 UI · 마지막 heartbeat 상태 조회
 */
router.get("/api/auto-import/status", authorize(9), asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", STATUS_KEY)
    .maybeSingle();
  if (error) throw new HttpError(500, `자동 임포트 상태 조회 실패: ${error.message}`);
  res.json({ value: data?.value ?? null });
}));

/**
 * GET /api/auto-import/installer · Python 설치 파일 (zip) 다운로드
 *   · Phase C · PyInstaller .exe 빌드 후 · assets/auto-import-template.zip 준비 필요
 *   · 현재 · 501 Not Implemented · Phase C 완료 시 파일 stream 반환
 */
router.get("/api/auto-import/installer", authorize(9), asyncHandler(async (_req, res) => {
  throw new HttpError(501, "installer 파일 준비 중 · Phase C (PyInstaller 빌드) 완료 후 활성");
}));

export default router;

// 최소 export · badRequest silence linter (미사용 warn 제거용 · 향후 확장 대비)
export const _autoImportBadRequest = badRequest;
