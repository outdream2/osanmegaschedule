// src/lib/cloudinaryUpload.ts
// 클라이언트에서 Cloudinary 로 이미지 직접 업로드
// - 서버에서 서명 발급 → 클라이언트가 서명된 request 로 Cloudinary 에 직접 POST
// - 사전 리사이즈 + WebP 변환으로 데이터 최소화

export interface UploadedImage {
  image_url: string;
  public_id: string;
  width: number;
  height: number;
}

/** 이미지 파일을 리사이즈 + WebP 로 변환 후 Blob 반환 (모바일 카메라 원본 → 200-400KB) */
export async function compressImage(
  file: File,
  opts: { maxSize?: number; quality?: number } = {}
): Promise<Blob> {
  const maxSize = opts.maxSize ?? 1600;
  const quality = opts.quality ?? 0.75;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onerror = reject;
    el.onload = () => resolve(el);
    el.src = dataUrl;
  });
  let w = img.width, h = img.height;
  if (w > maxSize || h > maxSize) {
    const ratio = Math.min(maxSize / w, maxSize / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unsupported");
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob) throw new Error("compress failed");
  return blob;
}

/** Blob → base64 data URL */
async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(blob);
  });
}

/** 로컬 서버 업로드 (Cloudinary 미설정 fallback · uploads/board/ 폴더에 저장) */
export async function uploadImageToLocal(file: File): Promise<UploadedImage> {
  const blob = await compressImage(file);
  const dataUrl = await blobToDataUrl(blob);
  const res = await fetch("/api/board/upload-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data_url: dataUrl, filename: file.name.replace(/\.[^.]+$/, "") }),
  });
  if (!res.ok) {
    const t = await res.json().catch(() => ({}));
    throw new Error(t.error ?? `로컬 업로드 실패 (${res.status})`);
  }
  const j = await res.json();
  return {
    image_url: j.image_url,
    public_id: j.public_id,
    width: j.width ?? 0,
    height: j.height ?? 0,
  };
}

/** Cloudinary 업로드 (서명 방식) · 실패 시 로컬 fallback */
export async function uploadImageToCloudinary(file: File): Promise<UploadedImage> {
  // 1) 서명 발급 시도 · 실패 시 로컬 서버 저장으로 fallback
  const sigRes = await fetch("/api/board/cloudinary-signature", { method: "POST" });
  if (!sigRes.ok) {
    // Cloudinary 환경변수 미설정 등 → 로컬 저장
    return uploadImageToLocal(file);
  }
  const sig = await sigRes.json();

  // 2) 압축
  const blob = await compressImage(file);

  // 3) Cloudinary 업로드
  const form = new FormData();
  form.append("file", blob, `${Date.now()}.webp`);
  form.append("api_key", sig.api_key);
  form.append("timestamp", String(sig.timestamp));
  form.append("folder", sig.folder);
  form.append("signature", sig.signature);
  const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`, {
    method: "POST",
    body: form,
  });
  if (!uploadRes.ok) {
    // Cloudinary 응답 실패 시에도 로컬로 fallback
    return uploadImageToLocal(file);
  }
  const r = await uploadRes.json();
  return {
    image_url: r.secure_url,
    public_id: r.public_id,
    width: r.width,
    height: r.height,
  };
}

/** 여러 파일 병렬 업로드 (진행률 콜백 지원) */
export async function uploadImagesToCloudinary(
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<UploadedImage[]> {
  let done = 0;
  const results: UploadedImage[] = [];
  await Promise.all(
    files.map(async (f) => {
      try {
        const r = await uploadImageToCloudinary(f);
        results.push(r);
      } finally {
        done++;
        onProgress?.(done, files.length);
      }
    })
  );
  return results;
}
