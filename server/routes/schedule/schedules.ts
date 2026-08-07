import { Router } from "express";
import { scheduleController } from "../../controllers/scheduleController";
import { supabase } from "../../../src/supabase/client";
import path from "path";
import fs from "fs";
import multer from "multer";
import { uploadToDrive, deleteFromDrive, extractDriveFileId, isDriveReady } from "../../services/googleDriveService";

const router = Router();

router.get("/api/schedules", (req, res) => scheduleController.getSchedules(req, res));
router.put("/api/schedules", (req, res) => scheduleController.updateSchedule(req, res));
router.post("/api/schedules/batch", (req, res) => scheduleController.batchUpdateSchedules(req, res));
router.post("/api/schedules/copy", (req, res) => scheduleController.copySchedules(req, res));
router.post("/api/employees", (req, res) => scheduleController.createEmployee(req, res));
router.put("/api/employees/:id", (req, res) => scheduleController.updateEmployee(req, res));
router.delete("/api/employees/:id", (req, res) => scheduleController.deleteEmployee(req, res));

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

router.post("/api/employees/:id/contract", contractUpload.single("contract"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: "파일이 없습니다" });
    const fileUrl = `/uploads/contracts/${req.file.filename}`;
    const { error } = await supabase.from("employees").update({ contract_file_url: fileUrl }).eq("id", id);
    if (error) {
      if (/column|does not exist/i.test(error.message)) {
        return res.status(500).json({ error: "Supabase employees 테이블에 contract_file_url TEXT 컬럼이 없습니다. 대시보드 SQL Editor에서 추가해 주세요." });
      }
      throw error;
    }
    return res.json({ url: fileUrl });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

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
router.post("/api/employees/:id/resume", resumeUpload.single("resume"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: "파일이 없습니다" });
    // 직원명 조회 (파일명 규칙)
    const { data: emp } = await supabase.from("employees").select("name, resume_url").eq("id", id).maybeSingle();
    if (!emp) return res.status(404).json({ error: "직원을 찾을 수 없습니다" });
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
        return res.status(500).json({ error: "Supabase employees.resume_url 컬럼이 없습니다. SQL 실행 후 재시도" });
      }
      throw error;
    }
    return res.json({ url: result.webViewLink, name: result.name, size: result.size });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// T21 · 이력서 삭제
router.delete("/api/employees/:id/resume", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { data: emp } = await supabase.from("employees").select("resume_url").eq("id", id).maybeSingle();
    const oldId = extractDriveFileId(String((emp as any)?.resume_url ?? ""));
    if (oldId) await deleteFromDrive(oldId).catch(() => null);
    const { error } = await supabase.from("employees").update({ resume_url: null }).eq("id", id);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

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

router.post("/api/employees/:id/resignation-file", resignationFileUpload.single("file"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: "파일이 없습니다" });

    // 직원 존재 확인 + 퇴사자 여부 검증 (선택적 · retire_date 없어도 업로드 허용)
    const { data: emp } = await supabase
      .from("employees")
      .select("name, retire_date, resignation_file_url")
      .eq("id", id)
      .maybeSingle();
    if (!emp) return res.status(404).json({ error: "직원을 찾을 수 없습니다" });

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
        return res.status(500).json({
          error: "employees 테이블에 resignation_file_url 컬럼이 없습니다. " +
                 "Supabase SQL Editor에서 실행하세요: " +
                 "ALTER TABLE employees ADD COLUMN IF NOT EXISTS resignation_file_url TEXT;",
        });
      }
      throw dbErr;
    }

    return res.json({ url: fileUrl });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// T19+T21 · Drive 상태 확인 API (관리자 · 설정 확인용)
router.get("/api/drive-status", async (_req, res) => {
  const status = await isDriveReady();
  return res.json(status);
});

export default router;
