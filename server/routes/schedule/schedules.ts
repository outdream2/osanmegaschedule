// 2026-08-17 · asyncHandler + HttpError + shared DTO/Schema 프레임워크
import { Router } from "express";
import { scheduleController } from "../../controllers/scheduleController";
import { supabase } from "../../../src/supabase/client";
import path from "path";
import fs from "fs";
import multer from "multer";
import { uploadToDrive, deleteFromDrive, extractDriveFileId, isDriveReady } from "../../services/googleDriveService";
import { authorize, getSession } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validateBody } from "../../middleware/zodValidate";
import { badRequest, notFound, HttpError } from "../../middleware/errorHandler";
import type { NextEmployeeNumberResponse } from "../../../src/shared/dtos/employees";
import { UpsertScheduleSchema, BatchScheduleSchema, CopyScheduleSchema } from "../../../src/shared/schemas/schedules";
import { CreateEmployeeSchema, UpdateEmployeeSchema } from "../../../src/shared/schemas/employees";

const router = Router();

router.get("/api/schedules", (req, res) => scheduleController.getSchedules(req, res));
// 2026-08-29 · 보안 S0 N4 fix · 스케줄 write · 매니저(lv5)+ 만
router.put("/api/schedules", authorize(5), validateBody(UpsertScheduleSchema), (req, res) => scheduleController.updateSchedule(req, res));
router.post("/api/schedules/batch", authorize(5), validateBody(BatchScheduleSchema), (req, res) => scheduleController.batchUpdateSchedules(req, res));
router.post("/api/schedules/copy", authorize(5), validateBody(CopyScheduleSchema), (req, res) => scheduleController.copySchedules(req, res));
// 2026-08-29 · 보안 S0 · 직원 신규 등록 · 관리자(lv9) 전용
router.post("/api/employees", authorize(9), validateBody(CreateEmployeeSchema.partial()), (req, res) => scheduleController.createEmployee(req, res));
// #122 · 신규 사번 자동 생성 · MAX + 1 · 3자리 zero-pad
router.get("/api/employees/next-number", asyncHandler(async (_req, res) => {
  const { scheduleService } = await import("../../services/scheduleService");
  const next = await scheduleService.getNextEmployeeNumber();
  const body: NextEmployeeNumberResponse = { nextNumber: next };
  res.status(200).json(body);
}));
// 2026-08-29 · 보안 S0 N5 fix · 직원 정보 수정 · 관리자(lv9) 전용 · 권한 상승 방지 필수
//   · 이전 · authorize 없음 → lv1 이 다른 직원 level 필드 수정 가능 (privilege escalation)
router.put("/api/employees/:id", authorize(9), validateBody(UpdateEmployeeSchema.partial()), (req, res) => scheduleController.updateEmployee(req, res));
router.delete("/api/employees/:id", authorize(9), (req, res) => scheduleController.deleteEmployee(req, res));

// 2026-08-29 · 엔드포인트 통일 · 직원 리스트 · GET /api/employees
//   · BoardPage @멘션 · 향후 useEmployees 훅 · 재직 직원 목록 통일 소스
//   · 재직자 필터 (retireDate 없거나 미래) · lv1+ 접근 가능
//   · 대원칙 · 같은 기능=같은 endpoint (2026-08-29)
router.get("/api/employees", authorize(1), asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from("employees")
    .select("id, name, position, rank, phone, level, workplace, hireDate, retireDate, employmentType")
    .order("name", { ascending: true });
  if (error) throw new HttpError(500, error.message);
  res.json(Array.isArray(data) ? data : []);
}));

// 2026-08-20 · #175 · 단건 조회 · 본인 or 관리자(level ≥ 9) 만 허용
//   · ApprovalRequestPage / useEmploymentStatus · retire_date 파생 · 사직서 gate
//   · payload · Employee DTO subset · retireDate 필수
router.get("/api/employees/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw badRequest("잘못된 직원 ID");
  const auth = (req as any).authUser as { sub?: number; level?: number } | undefined;
  const level = auth?.level ?? 0;
  const isSelf = auth?.sub === id;
  if (!isSelf && level < 9) throw new HttpError(403, "본인 또는 관리자만 조회 가능합니다", "FORBIDDEN");
  const { data, error } = await supabase
    .from("employees")
    .select("id, name, retireDate, level, position, rank, employmentType, hireDate, workplace, phone")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw notFound("직원을 찾을 수 없습니다");
  res.json(data);
}));

const contractsDir = path.join(process.cwd(), "uploads", "contracts");
if (!fs.existsSync(contractsDir)) fs.mkdirSync(contractsDir, { recursive: true });
const contractUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, contractsDir),
    filename: (_req, file, cb) => {
      const ts = Date.now();
      const safe = file.originalname.replace(/[^a-zA-Z0-9가-힣._-]/g, "_");
      cb(null, `${ts}_${safe}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /pdf|doc|docx|hwp|image\//.test(file.mimetype) ||
               /\.(pdf|doc|docx|hwp|png|jpg|jpeg)$/i.test(file.originalname);
    cb(null, ok);
  },
});

// 2026-08-29 · 보안 S0 N6 fix · 계약서 업로드 · 본인 or 관리자(lv9) 만 · IDOR 방지
router.post("/api/employees/:id/contract", authorize(1), contractUpload.single("contract"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!req.file) throw badRequest("파일이 없습니다");
  const session = getSession(req);
  if (session && Number(session.sub) !== id && (session.level ?? 0) < 9) {
    throw new HttpError(403, "본인 또는 관리자만 업로드 가능", "FORBIDDEN");
  }
  const fileUrl = `/uploads/contracts/${req.file.filename}`;
  const { error } = await supabase.from("employees").update({ contract_file_url: fileUrl }).eq("id", id);
  if (error) {
    if (/column|does not exist/i.test(error.message)) {
      throw new HttpError(500, "Supabase employees 테이블에 contract_file_url TEXT 컬럼이 없습니다. 대시보드 SQL Editor에서 추가해 주세요.");
    }
    throw new HttpError(500, error.message);
  }
  res.json({ url: fileUrl });
}));

// T21 · 이력서 업로드 · Google Drive 통합 (app_settings 에서 자동 설정 로드)
const resumeUpload = multer({
  storage: multer.memoryStorage(), // Drive 는 메모리 → 스트림 업로드
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const ok = /pdf|doc|docx|hwp|image\//.test(file.mimetype) ||
               /\.(pdf|doc|docx|hwp|png|jpg|jpeg)$/i.test(file.originalname);
    cb(null, ok);
  },
});
// 2026-08-29 · 보안 S0 N6 fix · 이력서 업로드 · 본인 or 관리자(lv9) 만 · IDOR 방지
router.post("/api/employees/:id/resume", authorize(1), resumeUpload.single("resume"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!req.file) throw badRequest("파일이 없습니다");
  const session = getSession(req);
  if (session && Number(session.sub) !== id && (session.level ?? 0) < 9) {
    throw new HttpError(403, "본인 또는 관리자만 업로드 가능", "FORBIDDEN");
  }
  // 직원명 조회 (파일명 규칙)
  const { data: emp } = await supabase.from("employees").select("name, resume_url").eq("id", id).maybeSingle();
  if (!emp) throw notFound("직원을 찾을 수 없습니다");
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const ext = req.file.originalname.split(".").pop() || "pdf";
  const fileName = `${(emp as any).name || `emp${id}`}_이력서_${ts}.${ext}`;
  const result = await uploadToDrive("resume", req.file.buffer, fileName, req.file.mimetype);
  // 기존 이력서 삭제 (교체) · 실패해도 계속
  const oldId = extractDriveFileId(String((emp as any).resume_url ?? ""));
  if (oldId && oldId !== result.fileId) {
    await deleteFromDrive(oldId).catch(() => null);
  }
  const { error } = await supabase.from("employees").update({ resume_url: result.webViewLink }).eq("id", id);
  if (error) {
    if (/column|does not exist/i.test(error.message)) {
      throw new HttpError(500, "Supabase employees.resume_url 컬럼이 없습니다. SQL 실행 후 재시도");
    }
    throw new HttpError(500, error.message);
  }
  res.json({ url: result.webViewLink, name: result.name, size: result.size });
}));

// T21 · 이력서 삭제 · 2026-08-16 · admin 전용
router.delete("/api/employees/:id/resume", authorize(9), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { data: emp } = await supabase.from("employees").select("resume_url").eq("id", id).maybeSingle();
  const oldId = extractDriveFileId(String((emp as any)?.resume_url ?? ""));
  if (oldId) await deleteFromDrive(oldId).catch(() => null);
  const { error } = await supabase.from("employees").update({ resume_url: null }).eq("id", id);
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

// T-Staff-ResignationColumn · 사직서 파일 업로드 · Supabase Storage "resignations" 버킷
//   · multer memoryStorage → Supabase Storage 업로드 → employees.resignation_file_url 저장
//   · 버킷 없거나 업로드 실패 시 · 로컬 fallback (/uploads/resignations/)
//   · SQL 필요: ALTER TABLE employees ADD COLUMN IF NOT EXISTS resignation_file_url TEXT;
const RESIGNATION_FILE_BUCKET = process.env.SUPABASE_RESIGNATION_FILE_BUCKET || "resignations";
const resignationsLocalDir = path.join(process.cwd(), "uploads", "resignations");
if (!fs.existsSync(resignationsLocalDir)) fs.mkdirSync(resignationsLocalDir, { recursive: true });

const resignationFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const ok = /pdf|image\//.test(file.mimetype) ||
               /\.(pdf|png|jpg|jpeg|webp)$/i.test(file.originalname);
    cb(null, ok);
  },
});

// 2026-08-29 · 보안 S0 N6 fix · 사직서 파일 업로드 · 본인 or 관리자(lv9) 만 · IDOR 방지
router.post("/api/employees/:id/resignation-file", authorize(1), resignationFileUpload.single("file"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!req.file) throw badRequest("파일이 없습니다");
  const session = getSession(req);
  if (session && Number(session.sub) !== id && (session.level ?? 0) < 9) {
    throw new HttpError(403, "본인 또는 관리자만 업로드 가능", "FORBIDDEN");
  }

  // 직원 존재 확인 + 퇴사자 여부 검증 (선택적 · retire_date 없어도 업로드 허용)
  const { data: emp } = await supabase
    .from("employees")
    .select('name, "retireDate", resignation_file_url')
    .eq("id", id)
    .maybeSingle();
  if (!emp) throw notFound("직원을 찾을 수 없습니다");

  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const ext = req.file.originalname.split(".").pop() || "pdf";
  const safeName = ((emp as any).name || `emp${id}`).replace(/[^가-힣a-zA-Z0-9]/g, "_");
  const objectPath = `${id}/${safeName}_사직서_${ts}_${Date.now()}.${ext}`;

  let fileUrl: string;

  // Supabase Storage 업로드 시도
  const { error: upErr } = await supabase.storage
    .from(RESIGNATION_FILE_BUCKET)
    .upload(objectPath, req.file.buffer, {
      contentType: req.file.mimetype,
      cacheControl: "31536000",
      upsert: true,
    });

  if (upErr) {
    // Storage 실패 → 로컬 fallback
    console.warn(`[resignation-file] Supabase Storage 실패 · fallback 로컬 · bucket=${RESIGNATION_FILE_BUCKET} · reason=${upErr.message}`);
    const localName = `${Date.now()}_${safeName}_사직서.${ext}`;
    fs.writeFileSync(path.join(resignationsLocalDir, localName), req.file.buffer);
    fileUrl = `/uploads/resignations/${localName}`;
  } else {
    const { data: pub } = supabase.storage.from(RESIGNATION_FILE_BUCKET).getPublicUrl(objectPath);
    fileUrl = pub?.publicUrl ?? `/uploads/resignations/${objectPath}`;
  }

  // employees 테이블 업데이트
  const { error: dbErr } = await supabase
    .from("employees")
    .update({ resignation_file_url: fileUrl })
    .eq("id", id);

  if (dbErr) {
    if (/column|does not exist/i.test(dbErr.message)) {
      throw new HttpError(500,
        "employees 테이블에 resignation_file_url 컬럼이 없습니다. " +
        "Supabase SQL Editor에서 실행하세요: " +
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS resignation_file_url TEXT;",
      );
    }
    throw new HttpError(500, dbErr.message);
  }

  res.json({ url: fileUrl });
}));

// T19+T21 · Drive 상태 확인 API (관리자 · 설정 확인용)
router.get("/api/drive-status", asyncHandler(async (_req, res) => {
  const status = await isDriveReady();
  res.json(status);
}));

export default router;
