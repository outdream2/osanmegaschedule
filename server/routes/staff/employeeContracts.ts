// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
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
import { supabase } from "../../../src/supabase/client";
import { uploadToDrive } from "../../services/googleDriveService";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authorize } from "../../middleware/requireAuth";
import { validateBody } from "../../middleware/zodValidate";
import { HttpError, badRequest } from "../../middleware/errorHandler";
import { CreateEmployeeContractSchema } from "../../../src/shared/schemas/employeeContracts";
// 2026-08-13 · #107 · 계약서 업로드 알림 · 사용자 지시로 제거 (알림 hook 미사용)

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

function isMissingColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703") return true;
  const msg = err.message ?? "";
  return /column .* does not exist|could not find .* column|schema cache/i.test(msg);
}

/**
 * 재계약 감지 · 기존 활성 employee_contracts row 를 is_active=false 로 UPDATE.
 * is_active 컬럼 미존재 (42703) 시 · 조용히 skip · 앱 계속 동작.
 */
async function deactivatePriorContracts(employeeId: number): Promise<void> {
  try {
    const { data: existing, error: selErr } = await supabase
      .from("employee_contracts")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("is_active", true);

    if (selErr) {
      if (isMissingColumnError(selErr)) {
        console.warn("[employee-contracts] is_active 컬럼 없음 · 재계약 감지 skip (ALTER TABLE 필요)");
        return;
      }
      console.warn("[employee-contracts] 기존 활성 계약 조회 실패:", selErr.message);
      return;
    }

    if (!existing || existing.length === 0) return;

    const { error: deactErr } = await supabase
      .from("employee_contracts")
      .update({ is_active: false })
      .eq("employee_id", employeeId)
      .eq("is_active", true);
    if (deactErr) {
      if (isMissingColumnError(deactErr)) {
        console.warn("[employee-contracts] is_active 컬럼 없음 · UPDATE skip");
        return;
      }
      console.warn("[employee-contracts] 재계약 비활성화 실패:", deactErr.message);
    } else {
      console.log(`[employee-contracts] 재계약 감지 · 기존 ${existing.length}건 · is_active=false 처리 · employee_id=${employeeId}`);
    }
  } catch (e: any) {
    console.warn("[employee-contracts] 재계약 감지 예외 (무시):", e?.message ?? e);
  }
}

/**
 * INSERT 시 · is_active=true 를 payload 에 포함하되 · 42703 에러 발생 시 자동 재시도 (is_active 제거).
 * 반환: { row, err } · row 있으면 성공, err 있으면 실패 (missing table 등 상위에서 처리).
 */
async function insertContractWithIsActiveFallback(
  baseRow: Record<string, unknown>,
): Promise<{ row: any; err: any }> {
  const withActive = { ...baseRow, is_active: true };
  const first = await supabase.from("employee_contracts").insert([withActive]).select("*").single();
  if (!first.error) return { row: first.data, err: null };

  if (isMissingColumnError(first.error)) {
    console.warn("[employee-contracts] is_active 컬럼 없음 · is_active 제거 후 INSERT 재시도");
    const retry = await supabase.from("employee_contracts").insert([baseRow]).select("*").single();
    return { row: retry.data, err: retry.error };
  }

  return { row: null, err: first.error };
}

/**
 * employees 테이블 · 계약 관련 필드 동기 갱신 (best-effort).
 * contract_file_url + contract_type + contract_start + contract_end + probation_end_date
 * 개별 컬럼 미존재 (42703) 시 · 해당 컬럼만 제외 후 재시도.
 */
// 2026-08-17 · #143 · 계약서 → 직원정보 반영 필드 확장 (working_hours · annual_leave_days · employee_number)
async function syncEmployeeContractFields(
  employeeId: number,
  fields: {
    contract_file_url?: string | null;
    contract_type?: string | null;
    contract_start?: string | null;
    contract_end?: string | null;
    probation_end_date?: string | null;
    working_hours?: string | null;
    annual_leave_days?: number | null;
    employee_number?: string | null;
  },
): Promise<void> {
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) payload[k] = v;
  }
  if (Object.keys(payload).length === 0) return;

  try {
    const { error } = await supabase.from("employees").update(payload).eq("id", employeeId);
    if (!error) return;

    // 42703 · 특정 컬럼 미존재 · 컬럼명 파싱 · 제거 후 재시도
    if (isMissingColumnError(error)) {
      const colMatch = /column\s+"?([a-z_][a-z0-9_]*)"?/i.exec(error.message ?? "");
      const missingCol = colMatch?.[1];
      if (missingCol && missingCol in payload) {
        console.warn(`[employee-contracts] employees.${missingCol} 컬럼 없음 · 제외 후 재시도`);
        delete payload[missingCol];
        if (Object.keys(payload).length > 0) {
          await syncEmployeeContractFields(employeeId, payload as any);
        }
        return;
      }
      console.warn(`[employee-contracts] employees 동기 갱신 · 컬럼 미존재 (무시): ${error.message}`);
      return;
    }

    console.warn(`[employee-contracts] employees 동기 갱신 실패 (무시) · id=${employeeId} · ${error.message}`);
  } catch (e: any) {
    console.warn(`[employee-contracts] employees 동기 갱신 예외 (무시) · ${e?.message ?? e}`);
  }
}

// ─── GET · 사번(또는 employeeId)으로 최신 계약서 1건 ───────────────────────
// 2026-08-10 · 직원정보 카드 · 근로 조건 표시용
// 우선순위: employee_number (사번) → employeeId
// is_active=true 우선 · 없으면 created_at DESC · 첫 건
router.get("/api/employees/latest-contract", asyncHandler(async (req, res) => {
  const employeeNumber = String(req.query.employee_number ?? "").trim();
  const employeeId = Number(req.query.employeeId);

  if (!employeeNumber && !Number.isFinite(employeeId)) {
    throw badRequest("employee_number or employeeId required");
  }

  let q = supabase.from("employee_contracts").select("*");
  if (employeeNumber) q = q.eq("employee_number", employeeNumber);
  else q = q.eq("employee_id", employeeId);
  q = q.order("created_at", { ascending: false }).limit(1);

  const { data, error } = await q;
  if (error) {
    if (isMissingTableError(error.message)) return res.json(null);
    if (isMissingColumnError(error)) {
      // employee_number 컬럼 없음 · employeeId 로 fallback
      if (Number.isFinite(employeeId)) {
        const retry = await supabase
          .from("employee_contracts")
          .select("*")
          .eq("employee_id", employeeId)
          .order("created_at", { ascending: false })
          .limit(1);
        return res.json(retry.data?.[0] ?? null);
      }
      return res.json(null);
    }
    throw new HttpError(500, error.message);
  }
  return res.json(data?.[0] ?? null);
}));

// ─── GET · 직원별 이력 ─────────────────────────────────────────────────────
// 2026-09-03 · #103 통일 · latest=1 파라미터 지원 · /api/employees/latest-contract 대체 가능
//   · &latest=1 · 최신 1건만 배열로 반환 (id 최소화 · 빠른 응답)
//   · 없으면 · 전체 이력 (기존 동작)
router.get("/api/employee-contracts", asyncHandler(async (req, res) => {
  const employeeId = Number(req.query.employeeId);
  const latestOnly = String(req.query.latest ?? "") === "1";
  // select("*") · is_active 컬럼 존재 시 자동 포함 (프론트 이력 UI 활성 계약 강조용)
  let q = supabase.from("employee_contracts").select("*").order("created_at", { ascending: false });
  if (Number.isFinite(employeeId)) q = q.eq("employee_id", employeeId);
  if (latestOnly) q = q.limit(1);

  const { data, error } = await q;
  if (error) {
    if (isMissingTableError(error.message)) {
      console.warn("[employee-contracts] employee_contracts 테이블 미생성 · migrations/create_employee_contracts.sql 실행 필요");
      return res.json([]);
    }
    throw new HttpError(500, error.message);
  }
  return res.json(data ?? []);
}));

// ─── POST · 승인 · PDF 업로드 ──────────────────────────────────────────────
router.post("/api/employee-contracts", authorize(9), validateBody(CreateEmployeeContractSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const employeeId    = b.employee_id ? Number(b.employee_id) || null : null;
  const employeeName  = b.employee_name.trim();
  const contractType  = b.contract_type ?? null;
  const startDate     = b.start_date ?? null;
  const endDate       = b.end_date ?? null;
  const dataUrl       = b.pdf_data_url;
  const approvedBy    = b.approved_by ?? null;
  const approvedById  = b.approved_by_id ? Number(b.approved_by_id) || null : null;
  const contractStart      = b.contract_start ?? startDate;
  const contractEnd        = b.contract_end !== undefined ? (b.contract_end ?? null) : endDate;
  const probationEndDate   = b.probation_end_date !== undefined
    ? (b.probation_end_date ?? null)
    : undefined;
  const employeeNumber     = b.employee_number ? String(b.employee_number).trim() : null;
  const workingHours       = b.working_hours ?? null;
  const annualLeaveDays    = b.annual_leave_days != null ? Number(b.annual_leave_days) || null : null;

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw badRequest("invalid pdf_data_url");
  if (parsed.buffer.length > MAX_BYTES) {
    throw new HttpError(413, `PDF 크기 초과 (${(parsed.buffer.length / 1024 / 1024).toFixed(1)}MB > ${MAX_BYTES / 1024 / 1024}MB)`);
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

    // 3-A) 재계약 감지 · 기존 활성 계약 is_active=false (컬럼 미존재 시 skip)
    if (employeeId && Number.isFinite(employeeId)) {
      await deactivatePriorContracts(employeeId);
    }

    // 3-B) employee_contracts row insert (is_active=true · 컬럼 없으면 자동 fallback)
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
      // 2026-08-10 · B Step 3 · 사번 · 근로정보 (컬럼 없으면 서버 42703 · fallback 처리 필요)
      employee_number: employeeNumber,
      working_hours: workingHours,
      annual_leave_days: annualLeaveDays,
      probation_end_date: probationEndDate !== undefined ? probationEndDate : null,
    };

    const { row, err: insErr } = await insertContractWithIsActiveFallback(insertRow);

  if (insErr || !row) {
    // 이력 저장 실패 · 원본 정리 (best-effort)
    if (storage === "supabase") {
      await supabase.storage.from(CONTRACTS_BUCKET).remove([storagePath]).catch(() => null);
    } else {
      try { fs.unlinkSync(path.join(process.cwd(), "uploads", "contracts", storagePath)); } catch { /* noop */ }
    }
    if (insErr && isMissingTableError(insErr.message ?? "")) {
      throw new HttpError(500, "employee_contracts 테이블이 없습니다. Supabase SQL Editor 에서 migrations/create_employee_contracts.sql 을 실행하세요.");
    }
    throw new HttpError(500, insErr?.message ?? "insert failed");
  }

  // 4) employees 동기 갱신 · 2026-08-17 · #143 · working_hours/annual_leave_days/employee_number 통합
  if (employeeId && Number.isFinite(employeeId)) {
    await syncEmployeeContractFields(employeeId, {
      contract_file_url: pdfUrl,
      contract_type: contractType ?? (row?.contract_type ?? null),
      contract_start: contractStart,
      contract_end: contractEnd,
      probation_end_date: probationEndDate,
      working_hours: workingHours,
      annual_leave_days: annualLeaveDays,
      employee_number: employeeNumber,
    });
  }

  // 2026-08-13 · 사용자 지시 · 계약서 업로드 알림 hook 제거 (조용히 저장만)

  return res.status(201).json(row);
}));

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
router.post("/api/employee-contracts/upload", authorize(9), driveUpload.single("contract"), asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest("PDF 파일이 없습니다");

  const b = req.body ?? {};
  const employeeId    = Number.isFinite(Number(b.employee_id)) ? Number(b.employee_id) : null;
  const employeeName  = String(b.employee_name ?? "").trim();
  const contractType  = b.contract_type ? String(b.contract_type) : null;
  const startDate     = b.start_date ? String(b.start_date) : null;
  const endDate       = b.end_date   ? String(b.end_date)   : null;
  const approvedBy    = b.approved_by ? String(b.approved_by) : null;
  const approvedById  = Number.isFinite(Number(b.approved_by_id)) ? Number(b.approved_by_id) : null;
  // employees 동기 갱신용 필드 (하위 호환)
  const contractStart      = b.contract_start ? String(b.contract_start) : startDate;
  const contractEnd        = b.contract_end !== undefined ? (b.contract_end ? String(b.contract_end) : null) : endDate;
  const probationEndDate   = b.probation_end_date !== undefined
    ? (b.probation_end_date ? String(b.probation_end_date) : null)
    : undefined;

  if (!employeeName) throw badRequest("employee_name required");

  // Drive 파일명 · {직원명}_근로계약서_{시작일}.pdf
  const dateTag = (startDate || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  const nameTag = safeName(employeeName);
  const fileName = `${nameTag}_근로계약서_${dateTag}.pdf`;

  // Drive 업로드 · 실패 시 500 (multer 이전 try/catch 와 달리 drive 업로드 자체 실패는 500)
  let driveUrl = "";
  let driveFileId = "";
  try {
    const result = await uploadToDrive("contract", req.file.buffer, fileName, req.file.mimetype || "application/pdf");
    driveUrl = result.webViewLink;
    driveFileId = result.fileId;
  } catch (drvErr: any) {
    throw new HttpError(500, `Google Drive 업로드 실패 · ${drvErr?.message ?? drvErr}`);
  }

  // 재계약 감지 · 기존 활성 계약 is_active=false (컬럼 미존재 시 skip)
  if (employeeId && Number.isFinite(employeeId)) {
    await deactivatePriorContracts(employeeId);
  }

  // employee_contracts row insert · storage="drive" · pdf_url = Drive URL · is_active=true (fallback)
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

  const { row, err: insErr } = await insertContractWithIsActiveFallback(insertRow);

  if (insErr || !row) {
    if (insErr && isMissingTableError(insErr.message ?? "")) {
      throw new HttpError(500, "employee_contracts 테이블이 없습니다. Supabase SQL Editor 에서 migrations/create_employee_contracts.sql 을 실행하세요.");
    }
    throw new HttpError(500, insErr?.message ?? "insert failed");
  }

  // employees 동기 갱신 · 2026-08-17 · #143 · working_hours/annual_leave_days/employee_number
  if (employeeId && Number.isFinite(employeeId)) {
    await syncEmployeeContractFields(employeeId, {
      contract_file_url: driveUrl,
      contract_type: contractType ?? (row?.contract_type ?? null),
      contract_start: contractStart,
      contract_end: contractEnd,
      probation_end_date: probationEndDate,
      working_hours: b.working_hours ?? null,
      annual_leave_days: b.annual_leave_days != null ? Number(b.annual_leave_days) || null : null,
      employee_number: b.employee_number ? String(b.employee_number).trim() : null,
    });
  }

  return res.status(201).json(row);
}));

export default router;
