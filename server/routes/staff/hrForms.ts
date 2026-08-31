// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
// server/routes/hrForms.ts
// 각종 양식 관리 API (근로계약서 · 사직서 · 서약서 · 기타)
// - 파일 업로드: 클라이언트 base64 → 서버 → Supabase Storage ("hr-forms" bucket · private)
//   · service key 노출 없이 서버 프록시 방식 (board.ts 업로드 패턴과 동일)
//   · Supabase Storage 실패 시 로컬 uploads/hr-forms/ 폴더 fallback (dev 편의)
// - 메타 저장: hr_forms 테이블
//
// ※ 사용자 액션 필요 (SQL Editor 에서 1회 실행):
//   -- 1) 테이블
//   CREATE TABLE IF NOT EXISTS hr_forms (
//     id BIGSERIAL PRIMARY KEY,
//     title TEXT NOT NULL,
//     category TEXT NOT NULL DEFAULT 'contract'
//       CHECK (category IN ('contract','resignation','pledge','etc')),
//     file_url TEXT NOT NULL,
//     file_name TEXT,
//     file_size INT,
//     mime_type TEXT,
//     storage_path TEXT,   -- Supabase Storage object path (삭제 시 원본 정리용)
//     storage TEXT,        -- "supabase" | "local"
//     uploaded_by TEXT,
//     uploaded_by_id INT,
//     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
//   );
//   CREATE INDEX IF NOT EXISTS idx_hr_forms_category ON hr_forms(category);
//   CREATE INDEX IF NOT EXISTS idx_hr_forms_created  ON hr_forms(created_at DESC);
//   -- 2) Storage 버킷 (대시보드에서 수동 생성): 이름 "hr-forms" · Public 권장 (다운로드 UX 단순)
//      · Private 이면 signed URL 발급 로직 추가 필요 (아래 GET_SIGNED_URL_TTL 참고)

import { Router } from "express";
import fs from "fs";
import path from "path";
import { supabase } from "../../../src/supabase/client";
// 2026-08-13 · #107 · 인사서류 업로드 · 관리자 알림
import { notificationsService } from "../../services/notificationsService";
// 2026-08-16 · #112-E1 · admin 삭제 보호
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validateBody } from "../../middleware/zodValidate";
import { badRequest, forbidden, notFound, HttpError } from "../../middleware/errorHandler";
import { CreateHrFormSchema } from "../../../src/shared/schemas/hrForms";

const router = Router();

// 환경변수 오버라이드 가능
const HR_FORMS_BUCKET = process.env.SUPABASE_HR_FORMS_BUCKET || "hr-forms";

// 파일 크기 상한 · 10MB (요구 스펙)
const MAX_BYTES = 10 * 1024 * 1024;

// 허용 카테고리
const ALLOWED_CATEGORIES = new Set(["contract", "resignation", "pledge", "etc"]);

// 파일명 안전화 (한글·공백 허용, 파일시스템 위험 문자만 치환)
function safeFilename(name: string, maxLen = 80): string {
  const trimmed = String(name ?? "").trim() || "form";
  // 경로 구분자 · 제어문자 · 몇몇 위험 기호 치환
  const cleaned = trimmed.replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_");
  return cleaned.slice(0, maxLen);
}

// dataURL 파싱 · data:<mime>;base64,<b64>
function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const buffer = Buffer.from(m[2], "base64");
  return { mime, buffer };
}

function extFromNameOrMime(filename: string, mime: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot >= 0 && dot < filename.length - 1) {
    const ext = filename.slice(dot + 1).toLowerCase();
    if (/^[a-z0-9]{1,6}$/.test(ext)) return ext;
  }
  // mime → ext 폴백
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/zip": "zip",
    "text/plain": "txt",
    "text/csv": "csv",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[mime] ?? "bin";
}

/**
 * GET /api/hr-forms
 * Query: category? = contract|resignation|pledge|etc
 * Response: HrForm[]
 */
router.get("/api/hr-forms", asyncHandler(async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category : "";
  let q = supabase.from("hr_forms").select("id, title, category, file_url, file_name, file_size, mime_type, storage_path, storage, uploaded_by, uploaded_by_id, created_at").order("created_at", { ascending: false });
  if (category && ALLOWED_CATEGORIES.has(category)) q = q.eq("category", category);
  const { data, error } = await q;
  if (error) throw new HttpError(500, error.message);
  res.json(data ?? []);
}));

/**
 * POST /api/hr-forms
 * Body: {
 *   title: string,
 *   category: 'contract'|'resignation'|'pledge'|'etc',
 *   data_url: string,          // data:<mime>;base64,<b64> · 파일 원본
 *   file_name: string,         // 원본 파일명 (다운로드 시 사용)
 *   uploaded_by?: string,
 *   uploaded_by_id?: number,
 * }
 * Response: { id, file_url, ... } (hr_forms row)
 */
router.post("/api/hr-forms", authorize(5), validateBody(CreateHrFormSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const title = b.title.trim();
  const category = b.category;
  const fileName = safeFilename(b.file_name);
  const dataUrl = b.data_url;
  const uploadedBy = b.uploaded_by ? String(b.uploaded_by) : null;
  const uploadedById = Number.isFinite(Number(b.uploaded_by_id)) ? Number(b.uploaded_by_id) : null;

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw badRequest("invalid data_url (data:<mime>;base64,...)");
  if (parsed.buffer.length > MAX_BYTES) {
    throw new HttpError(413, `파일 크기 초과 (${(parsed.buffer.length / 1024 / 1024).toFixed(1)}MB > ${MAX_BYTES / 1024 / 1024}MB)`);
  }

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8);
  const ext = extFromNameOrMime(fileName, parsed.mime);
  const baseNoExt = fileName.replace(/\.[^.]+$/, "").slice(0, 60) || "form";
  const objectPath = `${category}/${ym}/${now.getTime()}_${rand}_${baseNoExt}.${ext}`;

  let fileUrl = "";
  let storage: "supabase" | "local" = "supabase";
  let storagePath = objectPath;

  // 1) Supabase Storage 우선
  try {
    const { error: upErr } = await supabase
      .storage
      .from(HR_FORMS_BUCKET)
      .upload(objectPath, parsed.buffer, {
        contentType: parsed.mime,
        cacheControl: "31536000",
        upsert: false,
      });
    if (upErr) {
      console.warn(`[hr-forms/upload] Supabase Storage 실패 · fallback 로컬 · bucket=${HR_FORMS_BUCKET} · reason=${upErr.message}`);
    } else {
      const { data: pub } = supabase.storage.from(HR_FORMS_BUCKET).getPublicUrl(objectPath);
      if (pub?.publicUrl) {
        fileUrl = pub.publicUrl;
      } else {
        console.warn(`[hr-forms/upload] getPublicUrl 실패 · fallback 로컬 · path=${objectPath}`);
      }
    }
  } catch (supErr: any) {
    console.warn(`[hr-forms/upload] Supabase 예외 · fallback 로컬 · ${supErr?.message ?? supErr}`);
  }

  // 2) 로컬 fallback
  if (!fileUrl) {
    const dir = path.join(process.cwd(), "uploads", "hr-forms", category, ym);
    fs.mkdirSync(dir, { recursive: true });
    const fname = `${now.getTime()}_${rand}_${baseNoExt}.${ext}`;
    const fpath = path.join(dir, fname);
    fs.writeFileSync(fpath, parsed.buffer);
    fileUrl = `/uploads/hr-forms/${category}/${ym}/${fname}`;
    storage = "local";
    storagePath = `${category}/${ym}/${fname}`;
    console.log(`[hr-forms/upload] Local fallback · path=${fileUrl}`);
  }

  // 3) 메타 insert
  const insertRow = {
    title,
    category,
    file_url: fileUrl,
    file_name: fileName,
    file_size: parsed.buffer.length,
    mime_type: parsed.mime,
    storage_path: storagePath,
    storage,
    uploaded_by: uploadedBy,
    uploaded_by_id: uploadedById,
  };

  const { data, error } = await supabase
    .from("hr_forms")
    .insert([insertRow])
    .select("id, title, category, file_url, file_name, file_size, mime_type, storage_path, storage, uploaded_by, uploaded_by_id, created_at")
    .single();
  if (error) {
    // 메타 저장 실패 · 업로드한 파일 정리 시도
    if (storage === "supabase") {
      await supabase.storage.from(HR_FORMS_BUCKET).remove([storagePath]).catch(() => null);
    } else {
      try { fs.unlinkSync(path.join(process.cwd(), "uploads", "hr-forms", storagePath)); } catch { /* noop */ }
    }
    throw new HttpError(500, error.message);
  }

  // 2026-08-13 · #107 · 관리자 broadcast · 인사서류 업로드
  notificationsService.notifyAllAdmins({
    title: "📎 인사서류 업로드",
    body: `${title} (${category}) 업로드됨${uploadedBy ? ` (담당: ${uploadedBy})` : ""}.`,
    type: "info",
    push: { url: "/", tag: `hr-form-${data.id}` },
  }).catch(() => null);
  res.status(201).json(data);
}));

/**
 * DELETE /api/hr-forms/:id
 * Query: editor_level  (>=2 필수)
 * - 메타 삭제 + Storage 원본 삭제 (best-effort)
 */
router.delete("/api/hr-forms/:id", authorize(9), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const editorLevel = Number(req.query.editor_level ?? 0);
  if (!Number.isFinite(id)) throw badRequest("invalid id");
  if (editorLevel < 2) throw forbidden("관리자 권한 필요");

  // 원본 정리 위해 먼저 조회
  const { data: row, error: getErr } = await supabase
    .from("hr_forms")
    .select("id, storage, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (getErr) throw new HttpError(500, getErr.message);
  if (!row) throw notFound("not found");

  // 메타 삭제
  const { error: delErr } = await supabase.from("hr_forms").delete().eq("id", id);
  if (delErr) throw new HttpError(500, delErr.message);

  // 원본 삭제 · best-effort
  try {
    if (row.storage === "supabase" && row.storage_path) {
      await supabase.storage.from(HR_FORMS_BUCKET).remove([row.storage_path]);
    } else if (row.storage === "local" && row.storage_path) {
      const fpath = path.join(process.cwd(), "uploads", "hr-forms", row.storage_path);
      if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
    }
  } catch (cleanupErr: any) {
    console.warn(`[hr-forms/delete] 원본 정리 실패 (무시) · id=${id} · ${cleanupErr?.message ?? cleanupErr}`);
  }

  res.json({ ok: true });
}));

export default router;
