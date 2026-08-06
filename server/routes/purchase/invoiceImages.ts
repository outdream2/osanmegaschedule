// server/routes/invoiceImages.ts
// 거래명세서(OCR) 원본 이미지 Cloudinary 업로드 엔드포인트
// - 클라이언트에서 base64 dataURL 로 전송 (RawOcrTable → pageImages[])
// - Cloudinary 에서 자동 변환(WebP · 리사이즈 · 최적화) → CDN URL 반환
// - 저장 URL 은 ocr_confirmed_items.image_url · image_public_id 에 기록
// - Render(512MB) 환경 · 서버 sharp 부담 없이 Cloudinary 가 원본 압축/포맷 변환 수행
//
// 필수 env: CLOUDINARY_CLOUD_NAME · CLOUDINARY_API_KEY · CLOUDINARY_API_SECRET
//
// board(게시판) 이미지는 기존대로 Supabase Storage 사용 · 이 라우터는 명세서 전용

import { Router } from "express";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

const router = Router();

// Cloudinary 설정 · 서버 부팅 시 1회
let cloudinaryConfigured = false;
function ensureConfigured(): boolean {
  if (cloudinaryConfigured) return true;
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) {
    console.warn(
      "[invoice-images] Cloudinary env 미설정 · CLOUDINARY_CLOUD_NAME · CLOUDINARY_API_KEY · CLOUDINARY_API_SECRET 필요"
    );
    return false;
  }
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  cloudinaryConfigured = true;
  return true;
}

// 업로드 크기 제한 (base64 디코딩 후 15MB · Cloudinary free tier 10MB 기본 · 안전 마진)
const MAX_BYTES = 15 * 1024 * 1024;

// dataURL(data:image/...;base64,....) 또는 순수 base64 문자열을 dataURI 로 정규화
function normalizeDataUri(input: string): { dataUri: string; approxBytes: number } | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // 이미 완전한 dataURL 이면 그대로 사용
  if (/^data:image\/[a-zA-Z0-9+.-]+;base64,/.test(trimmed)) {
    const b64 = trimmed.split(",", 2)[1] ?? "";
    return { dataUri: trimmed, approxBytes: Math.floor((b64.length * 3) / 4) };
  }
  // 순수 base64 로 전송된 경우 · MIME 을 image/jpeg 로 가정
  // (RawOcrTable 은 dataURL 을 그대로 넘기므로 사실상 이 경로는 방어용)
  const b64 = trimmed;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) return null;
  return {
    dataUri: `data:image/jpeg;base64,${b64.replace(/\s+/g, "")}`,
    approxBytes: Math.floor((b64.length * 3) / 4),
  };
}

// POST /api/invoice-images/upload
// body: { data_url: string, filename?: string, page?: number }
// resp: { url: string, public_id: string, width?: number, height?: number, bytes?: number, format?: string }
router.post("/api/invoice-images/upload", async (req, res) => {
  if (!ensureConfigured()) {
    return res.status(503).json({ error: "Cloudinary 설정이 없습니다 (env)." });
  }

  try {
    const body = req.body ?? {};
    const rawInput = typeof body.data_url === "string" ? body.data_url
                   : typeof body.dataUrl === "string" ? body.dataUrl
                   : typeof body.image === "string" ? body.image
                   : "";
    const normalized = normalizeDataUri(rawInput);
    if (!normalized) {
      return res.status(400).json({ error: "유효한 data_url (data:image/...;base64,...) 이 필요합니다." });
    }
    if (normalized.approxBytes > MAX_BYTES) {
      return res
        .status(413)
        .json({ error: `이미지 크기 초과 (${(normalized.approxBytes / 1024 / 1024).toFixed(1)}MB > ${MAX_BYTES / 1024 / 1024}MB)` });
    }

    const filename = String(body.filename ?? "").replace(/[^\w.-]+/g, "_").slice(0, 60);
    const page = Number.isFinite(body.page) ? Number(body.page) : undefined;
    const publicIdSuffix = filename ? `_${filename}` : "";
    const publicId = `p${page ?? "x"}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}${publicIdSuffix}`;

    let result: UploadApiResponse;
    try {
      result = await cloudinary.uploader.upload(normalized.dataUri, {
        folder: "invoice-images",
        public_id: publicId,
        resource_type: "image",
        overwrite: false,
        // 원본 업로드 시점에 리사이즈/포맷 최적화 · 저장 용량 절감
        transformation: [
          { width: 1600, crop: "limit", quality: "auto:good", fetch_format: "auto" },
        ],
      });
    } catch (upErr: any) {
      console.error(`[invoice-images/upload] Cloudinary 업로드 실패: ${upErr?.message ?? upErr}`);
      return res.status(502).json({ error: upErr?.message ?? "Cloudinary 업로드 실패" });
    }

    return res.json({
      url: result.secure_url,
      public_id: result.public_id,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      format: result.format,
    });
  } catch (err: any) {
    console.error(`[invoice-images/upload] 예외: ${err?.message ?? err}`);
    return res.status(500).json({ error: err?.message ?? "업로드 처리 중 오류" });
  }
});

// DELETE /api/invoice-images/:public_id
// 이미지 정리용 (선택 · 관리자 정리 시)
router.delete("/api/invoice-images/:public_id(*)", async (req, res) => {
  if (!ensureConfigured()) {
    return res.status(503).json({ error: "Cloudinary 설정이 없습니다 (env)." });
  }
  const publicId = req.params.public_id;
  if (!publicId) return res.status(400).json({ error: "public_id 가 필요합니다." });
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
    return res.json({ ok: result.result === "ok" || result.result === "not found", result: result.result });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "삭제 실패" });
  }
});

export default router;
