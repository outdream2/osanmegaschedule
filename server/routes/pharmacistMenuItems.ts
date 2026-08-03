// server/routes/pharmacistMenuItems.ts
// 약사 전용 페이지 · 하위메뉴 항목 CRUD (2026-08-03)
//   - GET    /api/pharmacist-menu-items?tab=X&category=Y  · 리스트
//   - POST   /api/pharmacist-menu-items                    · 신규 등록 (title + optional file)
//   - PATCH  /api/pharmacist-menu-items/:id                · 이름·순서·title 등 변경
//   - DELETE /api/pharmacist-menu-items/:id                · 삭제 (Storage 원본 정리)
//
// 파일 업로드 방식: hrForms.ts 그대로 · base64 → 서버 → Supabase Storage
//   bucket: "pharmacist-materials" (없으면 로컬 uploads/pharmacist-materials/ 폴백)
//
// 권한 체크: editor_level (query 또는 body) 로 확인
//   - CRUD (POST/PATCH/DELETE) · level >= 8 (관리자) 필수
//   - GET · 인증만 · 별도 체크 없음 (프론트에서 세션 필터)

import { Router } from "express";
import fs from "fs";
import path from "path";
import { supabase } from "../../src/supabase/client";

const router = Router();

// 환경변수 오버라이드 가능
const BUCKET = process.env.SUPABASE_PHARM_MATERIALS_BUCKET || "pharmacist-materials";

// 파일 크기 상한 · 20MB (PDF 는 hrForms 10MB 보다 크게)
const MAX_BYTES = 20 * 1024 * 1024;

// 허용 탭 키
const ALLOWED_TABS = new Set(["education", "reference", "video", "docs"]);

// 관리자 권한 기준 (>= 8)
const ADMIN_LEVEL = 8;

// ── 유틸 (hrForms.ts 패턴 재사용) ─────────────────────────────

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

function extFromNameOrMime(filename: string, mime: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot >= 0 && dot < filename.length - 1) {
    const ext = filename.slice(dot + 1).toLowerCase();
    if (/^[a-z0-9]{1,6}$/.test(ext)) return ext;
  }
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
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  return map[mime] ?? "bin";
}

/**
 * GET /api/pharmacist-menu-items
 * Query: tab?  category?
 * Response: PharmMenuItem[]
 */
router.get("/api/pharmacist-menu-items", async (req, res) => {
  try {
    const tab = typeof req.query.tab === "string" ? req.query.tab : "";
    const category = typeof req.query.category === "string" ? req.query.category : "";
    let q = supabase
      .from("pharmacist_menu_items")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    if (tab && ALLOWED_TABS.has(tab)) q = q.eq("tab_key", tab);
    if (category) q = q.eq("category_key", category);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return res.json(data ?? []);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "load failed" });
  }
});

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
router.post("/api/pharmacist-menu-items", async (req, res) => {
  try {
    const b = req.body ?? {};
    const editorLevel = Number(b.editor_level ?? 0);
    if (editorLevel < ADMIN_LEVEL) return res.status(403).json({ error: "관리자 권한 필요 (level ≥ 8)" });

    const tabKey = String(b.tab_key ?? "").trim();
    const categoryKey = String(b.category_key ?? "").trim();
    const title = String(b.title ?? "").trim();
    const sortOrder = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 0;
    const uploadedBy = b.uploaded_by ? String(b.uploaded_by) : null;
    const uploadedById = Number.isFinite(Number(b.uploaded_by_id)) ? Number(b.uploaded_by_id) : null;

    if (!title) return res.status(400).json({ error: "title required" });
    if (!ALLOWED_TABS.has(tabKey)) return res.status(400).json({ error: "invalid tab_key" });
    if (!categoryKey) return res.status(400).json({ error: "category_key required" });

    // 파일 (옵션)
    const dataUrl = String(b.data_url ?? "");
    const rawFileName = String(b.file_name ?? "");
    let fileUrl: string | null = null;
    let fileName: string | null = null;
    let fileSize: number | null = null;
    let mimeType: string | null = null;
    let storage: "supabase" | "local" | null = null;
    let storagePath: string | null = null;

    if (dataUrl) {
      const parsed = parseDataUrl(dataUrl);
      if (!parsed) return res.status(400).json({ error: "invalid data_url (data:<mime>;base64,...)" });
      if (parsed.buffer.length > MAX_BYTES) {
        return res.status(413).json({
          error: `파일 크기 초과 (${(parsed.buffer.length / 1024 / 1024).toFixed(1)}MB > ${MAX_BYTES / 1024 / 1024}MB)`,
        });
      }
      fileName = safeFilename(rawFileName || "material");
      mimeType = parsed.mime;
      fileSize = parsed.buffer.length;

      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const rand = Math.random().toString(36).slice(2, 8);
      const ext = extFromNameOrMime(fileName, parsed.mime);
      const baseNoExt = fileName.replace(/\.[^.]+$/, "").slice(0, 60) || "material";
      // path: <tab>/<category>/<yyyy-mm>/<ts>_<rand>_<name>.<ext>
      const objectPath = `${tabKey}/${categoryKey}/${ym}/${now.getTime()}_${rand}_${baseNoExt}.${ext}`;

      // 1) Supabase Storage 우선
      let uploadedUrl = "";
      try {
        const { error: upErr } = await supabase
          .storage
          .from(BUCKET)
          .upload(objectPath, parsed.buffer, {
            contentType: parsed.mime,
            cacheControl: "31536000",
            upsert: false,
          });
        if (upErr) {
          console.warn(`[pharm-menu/upload] Supabase Storage 실패 · fallback 로컬 · bucket=${BUCKET} · reason=${upErr.message}`);
        } else {
          const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
          if (pub?.publicUrl) {
            uploadedUrl = pub.publicUrl;
          } else {
            console.warn(`[pharm-menu/upload] getPublicUrl 실패 · fallback 로컬 · path=${objectPath}`);
          }
        }
      } catch (supErr: any) {
        console.warn(`[pharm-menu/upload] Supabase 예외 · fallback 로컬 · ${supErr?.message ?? supErr}`);
      }

      if (uploadedUrl) {
        fileUrl = uploadedUrl;
        storage = "supabase";
        storagePath = objectPath;
      } else {
        // 2) 로컬 fallback
        const dir = path.join(process.cwd(), "uploads", "pharmacist-materials", tabKey, categoryKey, ym);
        fs.mkdirSync(dir, { recursive: true });
        const fname = `${now.getTime()}_${rand}_${baseNoExt}.${ext}`;
        const fpath = path.join(dir, fname);
        fs.writeFileSync(fpath, parsed.buffer);
        fileUrl = `/uploads/pharmacist-materials/${tabKey}/${categoryKey}/${ym}/${fname}`;
        storage = "local";
        storagePath = `${tabKey}/${categoryKey}/${ym}/${fname}`;
        console.log(`[pharm-menu/upload] Local fallback · path=${fileUrl}`);
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
      .select("*")
      .single();

    if (error) {
      // 메타 저장 실패 시 업로드한 파일 정리 (best-effort)
      if (storage === "supabase" && storagePath) {
        await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => null);
      } else if (storage === "local" && storagePath) {
        try { fs.unlinkSync(path.join(process.cwd(), "uploads", "pharmacist-materials", storagePath)); } catch { /* noop */ }
      }
      throw new Error(error.message);
    }

    return res.status(201).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "upload failed" });
  }
});

/**
 * PATCH /api/pharmacist-menu-items/:id
 * Body: { editor_level, title?, sort_order?, category_key?, tab_key? }
 *   · 파일 교체는 지원하지 않음 (삭제 후 재등록)
 */
router.patch("/api/pharmacist-menu-items/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });

    const b = req.body ?? {};
    const editorLevel = Number(b.editor_level ?? 0);
    if (editorLevel < ADMIN_LEVEL) return res.status(403).json({ error: "관리자 권한 필요 (level ≥ 8)" });

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (typeof b.title === "string") {
      const t = b.title.trim();
      if (!t) return res.status(400).json({ error: "title cannot be empty" });
      patch.title = t;
    }
    if (Number.isFinite(Number(b.sort_order))) patch.sort_order = Number(b.sort_order);
    if (typeof b.category_key === "string" && b.category_key.trim()) patch.category_key = b.category_key.trim();
    if (typeof b.tab_key === "string" && ALLOWED_TABS.has(b.tab_key)) patch.tab_key = b.tab_key;

    // 실질 patch 필드가 updated_at 뿐이면 400
    if (Object.keys(patch).length === 1) return res.status(400).json({ error: "no fields to update" });

    const { data, error } = await supabase
      .from("pharmacist_menu_items")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "update failed" });
  }
});

/**
 * DELETE /api/pharmacist-menu-items/:id?editor_level=X
 *   · Storage 원본 정리 (best-effort)
 */
router.delete("/api/pharmacist-menu-items/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const editorLevel = Number(req.query.editor_level ?? 0);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
    if (editorLevel < ADMIN_LEVEL) return res.status(403).json({ error: "관리자 권한 필요 (level ≥ 8)" });

    // 원본 정리 위해 먼저 조회
    const { data: row, error: getErr } = await supabase
      .from("pharmacist_menu_items")
      .select("id, storage, storage_path")
      .eq("id", id)
      .maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!row) return res.status(404).json({ error: "not found" });

    // 메타 삭제
    const { error: delErr } = await supabase.from("pharmacist_menu_items").delete().eq("id", id);
    if (delErr) throw new Error(delErr.message);

    // 원본 삭제 · best-effort
    try {
      if (row.storage === "supabase" && row.storage_path) {
        await supabase.storage.from(BUCKET).remove([row.storage_path]);
      } else if (row.storage === "local" && row.storage_path) {
        const fpath = path.join(process.cwd(), "uploads", "pharmacist-materials", row.storage_path);
        if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
      }
    } catch (cleanupErr: any) {
      console.warn(`[pharm-menu/delete] 원본 정리 실패 (무시) · id=${id} · ${cleanupErr?.message ?? cleanupErr}`);
    }

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "delete failed" });
  }
});

export default router;
