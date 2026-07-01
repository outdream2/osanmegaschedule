import { Router } from "express";
import { scheduleController } from "../../src/controllers/scheduleController";
import { supabase } from "../../src/supabase/client";
import path from "path";
import fs from "fs";
import multer from "multer";

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

export default router;
