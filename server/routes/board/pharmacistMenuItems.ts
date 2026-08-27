// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
// server/routes/pharmacistMenuItems.ts
// 약사 전용 페이지 · 하위메뉴 항목 CRUD (2026-08-03 · Cloudinary 전환)
//   - GET    /api/pharmacist-menu-items?tab=X&category=Y  · 리스트
//   - POST   /api/pharmacist-menu-items                    · 신규 등록 (title + optional file)
//   - PATCH  /api/pharmacist-menu-items/:id                · 이름·순서·title 등 변경
//   - DELETE /api/pharmacist-menu-items/:id                · 삭제 (Storage 원본 정리)
//
// 파일 업로드 방식: invoiceImages.ts 와 동일 · base64 dataURL → Cloudinary
//   folder: "pharmacist-materials"
//   resource_type: "auto" (PDF · 이미지 · DOCX 자동 판정)
//   env: CLOUDINARY_CLOUD_NAME · CLOUDINARY_API_KEY · CLOUDINARY_API_SECRET
//   미설정 시 · POST 는 503 반환 (로컬 fallback 제거)
//
// 하위 호환:
//   기존 DB row (storage: "supabase" / "local") · file_url 그대로 반환 · 표시 가능
//   DELETE 시 · storage 값에 따라 Cloudinary / Supabase Storage / 로컬 파일 각각 정리
//
// 권한 체크: editor_level (query 또는 body) 로 확인
//   - CRUD (POST/PATCH/DELETE) · level >= 8 (관리자) 필수
//   - GET · 인증만 · 별도 체크 없음 (프론트에서 세션 필터)

import { Router } from "express";
import fs from "fs";
import path from "path";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { supabase } from "../../../src/supabase/client";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, forbidden, notFound, HttpError } from "../../middleware/errorHandler";

const router = Router();

// 기존 Supabase Storage bucket · 하위 호환 DELETE 용도로만 사용
const BUCKET = process.env.SUPABASE_PHARM_MATERIALS_BUCKET || "pharmacist-materials";

// 파일 크기 상한 · 20MB
const MAX_BYTES = 20 * 1024 * 1024;

// 허용 탭 키
const ALLOWED_TABS = new Set(["education", "reference", "video", "docs"]);

// 관리자 권한 기준 (>= 8)
const ADMIN_LEVEL = 8;

// Cloudinary 폴더명
const CLOUD_FOLDER = "pharmacist-materials";

// ── Cloudinary 설정 (invoiceImages.ts 와 동일 패턴) ─────────────
let cloudinaryConfigured = false;
function ensureConfigured(): boolean {
  if (cloudinaryConfigured) return true;
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) {
    console.warn(
      "[pharm-menu] Cloudinary env 미설정 · CLOUDINARY_CLOUD_NAME · CLOUDINARY_API_KEY · CLOUDINARY_API_SECRET 필요"
    );
    return false;
  }
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  cloudinaryConfigured = true;
  return true;
}

// ── 유틸 ─────────────────────────────────────────────────────

function safeFilename(name: string, maxLen = 80): string {
  const trimmed = String(name ?? "").trim() || "material";
  const cleaned = trimmed.replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_");
  return cleaned.slice(0, maxLen);
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const buffer = Buffer.from(m[2], "base64");
  return { mime, buffer };
}

// public_id · 슬래시 없는 안전한 문자로 sanitize · folder 옵션으로 경로 지정
function safePublicIdPart(s: string, maxLen = 40): string {
  const cleaned = String(s ?? "").replace(/[^A-Za-z0-9_-]+/g, "_");
  return cleaned.slice(0, maxLen) || "x";
}

// Cloudinary resource_type 을 저장·삭제에서 그대로 사용하기 위한 타입
type ResourceType = "image" | "video" | "raw" | "auto";

// MIME 으로 resource_type 힌트 (destroy 시 필수 · upload 는 auto 사용)
function resourceTypeFromMime(mime: string | null | undefined): "image" | "video" | "raw" {
  const m = String(mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  return "raw"; // PDF · DOCX · XLSX · ZIP 등
}

/**
 * GET /api/pharmacist-menu-items
 * Query: tab?  category?
 * Response: PharmMenuItem[]
 */
router.get("/api/pharmacist-menu-items", asyncHandler(async (req, res) => {
  const tab = typeof req.query.tab === "string" ? req.query.tab : "";
  const category = typeof req.query.category === "string" ? req.query.category : "";
  let q = supabase
    .from("pharmacist_menu_items")
    .select("id, tab_key, category_key, title, file_url, file_name, file_size, mime_type, storage_path, storage, sort_order, uploaded_by, uploaded_by_id, created_at, updated_at")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (tab && ALLOWED_TABS.has(tab)) q = q.eq("tab_key", tab);
  if (category) q = q.eq("category_key", category);
  const { data, error } = await q;
  if (error) throw new HttpError(500, error.message);
  return res.json(data ?? []);
}));

/**
 * POST /api/pharmacist-menu-items
 * Body: {
 *   editor_level: number,        // >= 8 (관리자) 필수
 *   tab_key: 'education'|'reference'|'video'|'docs',
 *   category_key: string,        // 예: "1A", "22", "interact", "manual"
 *   title: string,
 *   sort_order?: number,
 *   // 파일 (선택) · title 만 등록 가능 · 파일 없는 하위메뉴 (링크·설명만) 도 허용
 *   data_url?: string,
 *   file_name?: string,
 *   uploaded_by?: string,
 *   uploaded_by_id?: number,
 * }
 */
router.post("/api/pharmacist-menu-items", authorize(5), asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const editorLevel = Number(b.editor_level ?? 0);
  if (editorLevel < ADMIN_LEVEL) throw forbidden("관리자 권한 필요 (level ≥ 8)");

  const tabKey = String(b.tab_key ?? "").trim();
  const categoryKey = String(b.category_key ?? "").trim();
  const title = String(b.title ?? "").trim();
  const sortOrder = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 0;
  const uploadedBy = b.uploaded_by ? String(b.uploaded_by) : null;
  const uploadedById = Number.isFinite(Number(b.uploaded_by_id)) ? Number(b.uploaded_by_id) : null;

  if (!title) throw badRequest("title required");
  if (!ALLOWED_TABS.has(tabKey)) throw badRequest("invalid tab_key");
  if (!categoryKey) throw badRequest("category_key required");

  // 파일 (옵션)
  const dataUrl = String(b.data_url ?? "");
  const rawFileName = String(b.file_name ?? "");
  let fileUrl: string | null = null;
  let fileName: string | null = null;
  let fileSize: number | null = null;
  let mimeType: string | null = null;
  let storage: "cloudinary" | "supabase" | "local" | null = null;
  let storagePath: string | null = null;

  if (dataUrl) {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) throw badRequest("invalid data_url (data:<mime>;base64,...)");
    if (parsed.buffer.length > MAX_BYTES) {
      throw new HttpError(413, `파일 크기 초과 (${(parsed.buffer.length / 1024 / 1024).toFixed(1)}MB > ${MAX_BYTES / 1024 / 1024}MB)`);
    }

    // Cloudinary 미설정 시 · 503 (로컬 fallback 제거 · 명확한 실패)
    if (!ensureConfigured()) {
      throw new HttpError(503, "Cloudinary 설정이 없습니다 (env).");
    }

    fileName = safeFilename(rawFileName || "material");
    mimeType = parsed.mime;
    fileSize = parsed.buffer.length;

    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const rand = Math.random().toString(36).slice(2, 8);
    const baseNoExt = fileName.replace(/\.[^.]+$/, "").slice(0, 60) || "material";

    // Cloudinary public_id · folder 옵션으로 경로 지정하므로 파일명 부분만 사용
    // folder: pharmacist-materials/<tab>/<category>/<yyyy-mm>
    const cloudFolder = `${CLOUD_FOLDER}/${safePublicIdPart(tabKey, 20)}/${safePublicIdPart(categoryKey, 30)}/${ym}`;
    const publicId = `${now.getTime()}_${rand}_${safePublicIdPart(baseNoExt, 40)}`;

    // data URI 로 업로드 (invoiceImages.ts 와 동일)
    const dataUri = dataUrl; // 이미 data:<mime>;base64,... 포맷 확인됨

    let result: UploadApiResponse;
    try {
      result = await cloudinary.uploader.upload(dataUri, {
        folder: cloudFolder,
        public_id: publicId,
        resource_type: "auto",   // PDF · 이미지 · DOCX 자동 판정
        overwrite: false,
        use_filename: false,
        unique_filename: false,
        // 이미지는 자동 최적화 · PDF/문서 (raw) 는 transformation 무시됨
        transformation: [
          { width: 1600, crop: "limit", quality: "auto:good", fetch_format: "auto" },
        ],
      });
    } catch (upErr: any) {
      console.error(`[pharm-menu/upload] Cloudinary 업로드 실패 · ${upErr?.message ?? upErr}`);
      throw new HttpError(502, upErr?.message ?? "Cloudinary 업로드 실패");
    }

    fileUrl = result.secure_url;
    storage = "cloudinary";
    // storage_path = public_id · Cloudinary destroy 시 필요 (folder 포함 full public_id)
    storagePath = result.public_id;
    // Cloudinary 가 실제로 사용한 크기·포맷 반영
    if (Number.isFinite(result.bytes)) fileSize = Number(result.bytes);
    if (result.resource_type && result.format) {
      mimeType = `${result.resource_type}/${result.format}`;
    } else if (result.format) {
      // raw 리소스라도 format 만 있으면 원본 MIME 유지 (parsed.mime)
      mimeType = parsed.mime;
    }
  }

  const insertRow = {
    tab_key: tabKey,
    category_key: categoryKey,
    title,
    file_url: fileUrl,
    file_name: fileName,
    file_size: fileSize,
    mime_type: mimeType,
    storage_path: storagePath,
    storage,
    sort_order: sortOrder,
    uploaded_by: uploadedBy,
    uploaded_by_id: uploadedById,
  };

  const { data, error } = await supabase
    .from("pharmacist_menu_items")
    .insert([insertRow])
    .select("id, tab_key, category_key, title, file_url, file_name, file_size, mime_type, storage_path, storage, sort_order, uploaded_by, uploaded_by_id, created_at, updated_at")
    .single();

  if (error) {
    // 메타 저장 실패 시 업로드한 파일 정리 (best-effort)
    if (storage === "cloudinary" && storagePath) {
      const rt = resourceTypeFromMime(mimeType);
      await cloudinary.uploader.destroy(storagePath, { resource_type: rt, invalidate: true }).catch(() => null);
    }
    throw new HttpError(500, error.message);
  }

  return res.status(201).json(data);
}));

/**
 * PATCH /api/pharmacist-menu-items/:id
 * Body: { editor_level, title?, sort_order?, category_key?, tab_key? }
 *   · 파일 교체는 지원하지 않음 (삭제 후 재등록)
 */
router.patch("/api/pharmacist-menu-items/:id", authorize(5), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw badRequest("invalid id");

  const b = req.body ?? {};
  const editorLevel = Number(b.editor_level ?? 0);
  if (editorLevel < ADMIN_LEVEL) throw forbidden("관리자 권한 필요 (level ≥ 8)");

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (typeof b.title === "string") {
    const t = b.title.trim();
    if (!t) throw badRequest("title cannot be empty");
    patch.title = t;
  }
  if (Number.isFinite(Number(b.sort_order))) patch.sort_order = Number(b.sort_order);
  if (typeof b.category_key === "string" && b.category_key.trim()) patch.category_key = b.category_key.trim();
  if (typeof b.tab_key === "string" && ALLOWED_TABS.has(b.tab_key)) patch.tab_key = b.tab_key;

  // 실질 patch 필드가 updated_at 뿐이면 400
  if (Object.keys(patch).length === 1) throw badRequest("no fields to update");

  const { data, error } = await supabase
    .from("pharmacist_menu_items")
    .update(patch)
    .eq("id", id)
    .select("id, tab_key, category_key, title, file_url, file_name, file_size, mime_type, storage_path, storage, sort_order, uploaded_by, uploaded_by_id, created_at, updated_at")
    .single();
  if (error) throw new HttpError(500, error.message);
  return res.json(data);
}));

/**
 * DELETE /api/pharmacist-menu-items/:id?editor_level=X
 *   · Storage 원본 정리 (best-effort)
 *   · storage 값에 따라 Cloudinary / Supabase Storage / 로컬 파일 각각 처리
 */
router.delete("/api/pharmacist-menu-items/:id", authorize(9), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const editorLevel = Number(req.query.editor_level ?? 0);
  if (!Number.isFinite(id)) throw badRequest("invalid id");
  if (editorLevel < ADMIN_LEVEL) throw forbidden("관리자 권한 필요 (level ≥ 8)");

  // 원본 정리 위해 먼저 조회 (mime_type 도 함께 · Cloudinary resource_type 판정)
  const { data: row, error: getErr } = await supabase
    .from("pharmacist_menu_items")
    .select("id, storage, storage_path, mime_type")
    .eq("id", id)
    .maybeSingle();
  if (getErr) throw new HttpError(500, getErr.message);
  if (!row) throw notFound("not found");

  // 메타 삭제
  const { error: delErr } = await supabase.from("pharmacist_menu_items").delete().eq("id", id);
  if (delErr) throw new HttpError(500, delErr.message);

  // 원본 삭제 · best-effort
  try {
    if (row.storage === "cloudinary" && row.storage_path) {
      if (ensureConfigured()) {
        const rt = resourceTypeFromMime(row.mime_type);
        await cloudinary.uploader.destroy(row.storage_path, { resource_type: rt, invalidate: true });
      } else {
        console.warn(`[pharm-menu/delete] Cloudinary 미설정 · 원본 정리 스킵 · id=${id} · public_id=${row.storage_path}`);
      }
    } else if (row.storage === "supabase" && row.storage_path) {
      await supabase.storage.from(BUCKET).remove([row.storage_path]);
    } else if (row.storage === "local" && row.storage_path) {
      const fpath = path.join(process.cwd(), "uploads", "pharmacist-materials", row.storage_path);
      if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
    }
  } catch (cleanupErr: any) {
    console.warn(`[pharm-menu/delete] 원본 정리 실패 (무시) · id=${id} · ${cleanupErr?.message ?? cleanupErr}`);
  }

  return res.json({ ok: true });
}));

export default router;
