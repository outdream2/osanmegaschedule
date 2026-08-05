// server/routes/employeeContracts.ts
// 2026-08-03 · #202 · 근로계약서 승인 · PDF · DB 저장 API
//
// 엔드포인트:
//   POST /api/employee-contracts   · 승인 · PDF 업로드 + row insert + employees.contract_file_url 갱신
//   GET  /api/employee-contracts?employeeId=<n>   · 직원별 이력 (created_at DESC)
//
// 저장 흐름:
//   1) 클라이언트: html2canvas + jsPDF 로 PDF 생성 → dataURL (data:application/pdf;base64,...)
//   2) 서버: dataURL 파싱 → Supabase Storage("contracts" 버킷) 업로드
//      · Storage 실패 시 로컬 uploads/contracts/ fallback (hrForms 패턴 재사용)
//   3) employee_contracts row insert (이력)
//   4) employees.contract_file_url = pdf_url 로 갱신 (StaffManagePage [보기] 활성화)
//
// Graceful:
//   - 테이블 미생성 시 · GET 은 [] · POST 는 500 + 사용자 안내 메시지
//     (경로 안내 · migrations/create_employee_contracts.sql)

import { Router } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { supabase } from "../../src/supabase/client";
import { uploadToDrive } from "../googleDrive";

const router = Router();

const CONTRACTS_BUCKET = process.env.SUPABASE_CONTRACTS_BUCKET || "contracts";
const MAX_BYTES = 20 * 1024 * 1024; // PDF 다중 페이지 대비 20MB

// data:<mime>;base64,<b64>
function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

function safeName(name: string, maxLen = 60): string {
  const t = String(name ?? "").trim() || "근로자";
  return t.replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_").slice(0, maxLen);
}

function isMissingTableError(msg: string): boolean {
  return /relation .* does not exist|table .* not found|schema cache/i.test(msg);
}

// ─── GET · 직원별 이력 ─────────────────────────────────────────────────────
router.get("/api/employee-contracts", async (req, res) => {
  try {
    const employeeId = Number(req.query.employeeId);
    let q = supabase.from("employee_contracts").select("*").order("created_at", { ascending: false });
    if (Number.isFinite(employeeId)) q = q.eq("employee_id", employeeId);

    const { data, error } = await q;
    if (error) {
      if (isMissingTableError(error.message)) {
        console.warn("[employee-contracts] employee_contracts 테이블 미생성 · migrations/create_employee_contracts.sql 실행 필요");
        return res.json([]);
      }
      throw new Error(error.message);
    }
    return res.json(data ?? []);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "load failed" });
  }
});

// ─── POST · 승인 · PDF 업로드 ──────────────────────────────────────────────
router.post("/api/employee-contracts", async (req, res) => {
  try {
    const b = req.body ?? {};
    const employeeId    = Number.isFinite(Number(b.employee_id)) ? Number(b.employee_id) : null;
    const employeeName  = String(b.employee_name ?? "").trim();
    const contractType  = b.contract_type ? String(b.contract_type) : null;
    const startDate     = b.start_date ? String(b.start_date) : null;   // YYYY-MM-DD or null
    const endDate       = b.end_date   ? String(b.end_date)   : null;
    const dataUrl       = String(b.pdf_data_url ?? "");
    const approvedBy    = b.approved_by ? String(b.approved_by) : null;
    const approvedById  = Number.isFinite(Number(b.approved_by_id)) ? Number(b.approved_by_id) : null;

    if (!employeeName) return res.status(400).json({ error: "employee_name required" });
    if (!dataUrl)      return res.status(400).json({ error: "pdf_data_url required (data:application/pdf;base64,...)" });

    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return res.status(400).json({ error: "invalid pdf_data_url" });
    if (parsed.buffer.length > MAX_BYTES) {
      return res.status(413).json({
        error: `PDF 크기 초과 (${(parsed.buffer.length / 1024 / 1024).toFixed(1)}MB > ${MAX_BYTES / 1024 / 1024}MB)`,
      });
    }

    // 경로 · contracts/YYYY-MM/{ts}_{rand}_{name}_{startdate}.pdf
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const rand = Math.random().toString(36).slice(2, 8);
    const dateTag = (startDate || `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`).replace(/-/g, "");
    const nameTag = safeName(employeeName);
    const objectPath = `${ym}/${now.getTime()}_${rand}_${nameTag}_${dateTag}.pdf`;

    let pdfUrl = "";
    let storage: "supabase" | "local" = "supabase";
    let storagePath = objectPath;

    // 1) Supabase Storage 우선
    try {
      const { error: upErr } = await supabase
        .storage
        .from(CONTRACTS_BUCKET)
        .upload(objectPath, parsed.buffer, {
          contentType: "application/pdf",
          cacheControl: "31536000",
          upsert: false,
        });
      if (upErr) {
        console.warn(`[employee-contracts/upload] Supabase Storage 실패 · fallback 로컬 · bucket=${CONTRACTS_BUCKET} · reason=${upErr.message}`);
      } else {
        const { data: pub } = supabase.storage.from(CONTRACTS_BUCKET).getPublicUrl(objectPath);
        if (pub?.publicUrl) {
          pdfUrl = pub.publicUrl;
        } else {
          console.warn(`[employee-contracts/upload] getPublicUrl 실패 · fallback 로컬 · path=${objectPath}`);
        }
      }
    } catch (supErr: any) {
      console.warn(`[employee-contracts/upload] Supabase 예외 · fallback 로컬 · ${supErr?.message ?? supErr}`);
    }

    // 2) 로컬 fallback
    if (!pdfUrl) {
      const dir = path.join(process.cwd(), "uploads", "contracts", ym);
      fs.mkdirSync(dir, { recursive: true });
      const fname = `${now.getTime()}_${rand}_${nameTag}_${dateTag}.pdf`;
      const fpath = path.join(dir, fname);
      fs.writeFileSync(fpath, parsed.buffer);
      pdfUrl = `/uploads/contracts/${ym}/${fname}`;
      storage = "local";
      storagePath = `${ym}/${fname}`;
      console.log(`[employee-contracts/upload] Local fallback · path=${pdfUrl}`);
    }

    // 3) employee_contracts row insert
    const insertRow: Record<string, unknown> = {
      employee_id: employeeId ?? 0,   // 미매핑 시 0 (직접 입력 케이스)
      employee_name: employeeName,
      contract_type: contractType,
      start_date: startDate,
      end_date: endDate,
      pdf_url: pdfUrl,
      pdf_size: parsed.buffer.length,
      storage_path: storagePath,
      storage,
      approved_by: approvedBy,
      approved_by_id: approvedById,
    };

    const { data: row, error: insErr } = await supabase
      .from("employee_contracts")
      .insert([insertRow])
      .select("*")
      .single();

    if (insErr) {
      // 이력 저장 실패 · 원본 정리 (best-effort)
      if (storage === "supabase") {
        await supabase.storage.from(CONTRACTS_BUCKET).remove([storagePath]).catch(() => null);
      } else {
        try { fs.unlinkSync(path.join(process.cwd(), "uploads", "contracts", storagePath)); } catch { /* noop */ }
      }
      if (isMissingTableError(insErr.message)) {
        return res.status(500).json({
          error: "employee_contracts 테이블이 없습니다. Supabase SQL Editor 에서 migrations/create_employee_contracts.sql 을 실행하세요.",
        });
      }
      throw new Error(insErr.message);
    }

    // 4) employees.contract_file_url 갱신 (best-effort · 실패해도 저장 자체는 성공)
    if (employeeId && Number.isFinite(employeeId)) {
      try {
        const { error: updErr } = await supabase
          .from("employees")
          .update({ contract_file_url: pdfUrl })
          .eq("id", employeeId);
        if (updErr) {
          console.warn(`[employee-contracts] employees.contract_file_url 갱신 실패 (무시) · id=${employeeId} · ${updErr.message}`);
        }
      } catch (e: any) {
        console.warn(`[employee-contracts] employees 갱신 예외 (무시) · ${e?.message ?? e}`);
      }
    }

    return res.status(201).json(row);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "save failed" });
  }
});

// ─── POST · PDF 업로드 방식 (Google Drive · 2026-08-05) ────────────────────
// 사용자가 미리 준비한 PDF 를 Google Drive (contract 폴더) 에 저장 · employee_contracts 이력 insert
// storage="drive" · pdf_url = Drive webViewLink (drive_url 개념)
const driveUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ok = /pdf/.test(file.mimetype) || /\.pdf$/i.test(file.originalname);
    cb(null, ok);
  },
});
router.post("/api/employee-contracts/upload", driveUpload.single("contract"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "PDF 파일이 없습니다" });

    const b = req.body ?? {};
    const employeeId    = Number.isFinite(Number(b.employee_id)) ? Number(b.employee_id) : null;
    const employeeName  = String(b.employee_name ?? "").trim();
    const contractType  = b.contract_type ? String(b.contract_type) : null;
    const startDate     = b.start_date ? String(b.start_date) : null;
    const endDate       = b.end_date   ? String(b.end_date)   : null;
    const approvedBy    = b.approved_by ? String(b.approved_by) : null;
    const approvedById  = Number.isFinite(Number(b.approved_by_id)) ? Number(b.approved_by_id) : null;

    if (!employeeName) return res.status(400).json({ error: "employee_name required" });

    // Drive 파일명 · {직원명}_근로계약서_{시작일}.pdf
    const dateTag = (startDate || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
    const nameTag = safeName(employeeName);
    const fileName = `${nameTag}_근로계약서_${dateTag}.pdf`;

    // Drive 업로드
    let driveUrl = "";
    let driveFileId = "";
    try {
      const result = await uploadToDrive("contract", req.file.buffer, fileName, req.file.mimetype || "application/pdf");
      driveUrl = result.webViewLink;
      driveFileId = result.fileId;
    } catch (drvErr: any) {
      return res.status(500).json({
        error: `Google Drive 업로드 실패 · ${drvErr?.message ?? drvErr}`,
      });
    }

    // employee_contracts row insert · storage="drive" · pdf_url = Drive URL
    const insertRow: Record<string, unknown> = {
      employee_id: employeeId ?? 0,
      employee_name: employeeName,
      contract_type: contractType,
      start_date: startDate,
      end_date: endDate,
      pdf_url: driveUrl,
      pdf_size: req.file.size,
      storage_path: driveFileId,
      storage: "drive",
      approved_by: approvedBy,
      approved_by_id: approvedById,
    };

    const { data: row, error: insErr } = await supabase
      .from("employee_contracts")
      .insert([insertRow])
      .select("*")
      .single();

    if (insErr) {
      if (isMissingTableError(insErr.message)) {
        return res.status(500).json({
          error: "employee_contracts 테이블이 없습니다. Supabase SQL Editor 에서 migrations/create_employee_contracts.sql 을 실행하세요.",
        });
      }
      throw new Error(insErr.message);
    }

    // employees.contract_file_url 갱신 (best-effort)
    if (employeeId && Number.isFinite(employeeId)) {
      try {
        await supabase.from("employees").update({ contract_file_url: driveUrl }).eq("id", employeeId);
      } catch (e: any) {
        console.warn(`[employee-contracts/upload] employees 갱신 예외 (무시) · ${e?.message ?? e}`);
      }
    }

    return res.status(201).json(row);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "upload failed" });
  }
});

export default router;
