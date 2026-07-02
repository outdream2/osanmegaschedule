import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { Upload, Loader2, X, Zap, AlertCircle, Camera, Images } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { PageImageViewer } from "./PageImageViewer";
import { RawOcrTable } from "./RawOcrTable";
import type { OcrPageResult } from "./paddleEngine";
import { AppNavHeader, type AppNavPage } from "../AppNavHeader";
import type { AuthSession } from "../../types";

pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(
  new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
  { type: "module" }
);

interface OcrPageProps {
  onBack: () => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

async function detectTextOrientation(dataUrl: string): Promise<number> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const MAX = 320;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const sw = Math.floor(img.width * scale);
      const sh = Math.floor(img.height * scale);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(0);

      // Render at `deg` CW degrees, return row-projection + variance
      function renderProj(deg: number) {
        const swap = deg === 90 || deg === 270;
        const cw = swap ? sh : sw;
        const ch = swap ? sw : sh;
        canvas.width = cw; canvas.height = ch;
        ctx.clearRect(0, 0, cw, ch);
        ctx.save();
        ctx.translate(cw / 2, ch / 2);
        ctx.rotate((deg * Math.PI) / 180);
        ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
        ctx.restore();
        const px = ctx.getImageData(0, 0, cw, ch).data;
        const proj = new Float64Array(ch);
        for (let y = 0; y < ch; y++) {
          let d = 0;
          for (let x = 0; x < cw; x++) {
            const i = (y * cw + x) * 4;
            if (px[i]*0.299 + px[i+1]*0.587 + px[i+2]*0.114 < 180) d++;
          }
          proj[y] = d;
        }
        const mean = proj.reduce((a, b) => a + b, 0) / ch;
        const variance = proj.reduce((a, b) => a + (b - mean)**2, 0) / ch;
        return { proj, ch, variance };
      }

      // Ratio of top-quarter dark pixels to bottom-quarter
      // > 1 → text heavier at top (document is right-side-up)
      // < 1 → text heavier at bottom (document is upside-down / needs 180°)
      function topHeavyRatio(proj: Float64Array, ch: number) {
        const slice = Math.max(1, Math.floor(ch * 0.22));
        let top = 0, bot = 0;
        for (let y = 0; y < slice; y++) top += proj[y];
        for (let y = ch - slice; y < ch; y++) bot += proj[y];
        return top / (bot + 1);
      }

      // Step 1: is text horizontal or vertical?
      const r0  = renderProj(0);
      const r90 = renderProj(90);

      let bestDeg: number;
      if (r0.variance >= r90.variance) {
        // Horizontal text — distinguish 0° vs 180° by top-heavy ratio at 0°
        // Documents (invoices): title/supplier at top → topRatio > 1 when upright
        const ratio = topHeavyRatio(r0.proj, r0.ch);
        bestDeg = ratio >= 0.9 ? 0 : 180;
      } else {
        // Vertical text — distinguish 90° vs 270° by top-heavy ratio at 90°
        // At deg=90 rendering: if doc header lands at TOP → topRatio > 1 → bestDeg=90
        // If doc header lands at BOTTOM → topRatio < 1 → bestDeg=270
        const ratio = topHeavyRatio(r90.proj, r90.ch);
        bestDeg = ratio >= 0.9 ? 90 : 270;
      }

      // Convert to UI correction: deg > 180 → wrap to negative
      resolve(bestDeg > 180 ? bestDeg - 360 : bestDeg);
    };
    img.onerror = () => resolve(0);
    img.src = dataUrl;
  });
}

async function physicallyRotate(
  b64: string,
  mimeType: string,
  degrees: number,
): Promise<{ data: string; mimeType: string }> {
  if (degrees === 0) return { data: b64, mimeType };
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const rad = (degrees * Math.PI) / 180;
      const swap = degrees === 90 || degrees === 270 || degrees === -90 || degrees === -270;
      const canvas = document.createElement("canvas");
      canvas.width = swap ? img.height : img.width;
      canvas.height = swap ? img.width : img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve({ data: canvas.toDataURL("image/jpeg", 0.95).split(",")[1], mimeType: "image/jpeg" });
    };
    img.src = `data:${mimeType};base64,${b64}`;
  });
}

/** OCR 전송 전 이미지 리사이징: 최대 1500px, JPEG 82% — 5MB→~250KB */
async function resizeImageForOcr(
  b64: string,
  mimeType: string,
): Promise<{ data: string; mimeType: string }> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const MAX = 2400;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      resolve({ data: dataUrl.split(",")[1], mimeType: "image/jpeg" });
    };
    img.onerror = () => resolve({ data: b64, mimeType });
    img.src = `data:${mimeType};base64,${b64}`;
  });
}

export const OcrPage: React.FC<OcrPageProps> = ({ onBack, authSession, onNavigate, onLogout }) => {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imagesDataRef = useRef<{ data: string; mimeType: string }[]>([]);

  const [fileName, setFileName] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<OcrPageResult[]>([]);
  const [barcodeMatches, setBarcodeMatches] = useState<any[]>([]);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [pingStatus, setPingStatus] = useState<{ ok: boolean; gemini: boolean; geminiKeyCount: number } | null>(null);
  const [rotation, setRotation] = useState(0);
  const [detectingOrient, setDetectingOrient] = useState(false);

  useEffect(() => {
    axios.get("/api/ocr-ping")
      .then(r => setPingStatus(r.data))
      .catch(() => setPingStatus({ ok: false, gemini: false, geminiKeyCount: 0 }));
  }, []);

  const renderPdfToImages = useCallback(async (file: File): Promise<{ data: string; mimeType: string }[]> => {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const imgs: { data: string; mimeType: string }[] = [];
    setPageCount(pdf.numPages);
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(`페이지 ${i} Canvas를 초기화할 수 없습니다.`);
      await page.render({ canvasContext: ctx as any, viewport: vp, canvas } as any).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      setPageImages(prev => [...prev, dataUrl]);
      imgs.push({ data: dataUrl.split(",")[1], mimeType: "image/jpeg" });
    }
    return imgs;
  }, []);

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setError(null); setPages([]); setProcessed(0); setPageCount(0); setStatusMsg("");
    setPageImages([]); setCurrentPageIdx(0);
    setLoading(true); setRotation(-90);
    imagesDataRef.current = [];

    const isPdf = files.length === 1 &&
      (files[0].type === "application/pdf" || files[0].name.toLowerCase().endsWith(".pdf"));

    setFileName(isPdf ? files[0].name : files.length === 1 ? files[0].name : `이미지 ${files.length}장`);

    try {
      let imgs: { data: string; mimeType: string }[];

      if (isPdf) {
        imgs = await renderPdfToImages(files[0]);
      } else {
        setPageCount(files.length);
        imgs = [];
        for (const file of files) {
          const dataUrl = await new Promise<string>(res => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result as string);
            reader.readAsDataURL(file);
          });
          const rawB64 = dataUrl.split(",")[1];
          const rawMime = file.type || "image/jpeg";
          const resized = await resizeImageForOcr(rawB64, rawMime);
          const previewUrl = `data:${resized.mimeType};base64,${resized.data}`;
          setPageImages(prev => [...prev, previewUrl]);
          imgs.push(resized);
        }
      }
      imagesDataRef.current = imgs;

      // Auto-detect text orientation from the first image
      if (imgs.length > 0) {
        setDetectingOrient(true);
        try {
          const firstDataUrl = `data:${imgs[0].mimeType};base64,${imgs[0].data}`;
          const detected = await detectTextOrientation(firstDataUrl);
          setRotation(detected);
        } catch { /* keep default 0 */ } finally {
          setDetectingOrient(false);
        }
      }
    } catch (err: any) {
      setError(err?.message ?? "파일 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [renderPdfToImages]);

  const handleExtract = useCallback(async () => {
    const images = imagesDataRef.current;
    if (images.length === 0 || extracting) return;
    setExtracting(true); setPages([]); setBarcodeMatches([]); setProcessed(0); setError(null);
    setStatusMsg(images.length > 1 ? `${images.length}장 동시 처리 중...` : "처리 중...");
    try {
      const rotatedImages = rotation === 0
        ? images
        : await Promise.all(images.map(img => physicallyRotate(img.data, img.mimeType, rotation)));

      const accumBarcodes: any[] = [];

      // 모든 페이지 병렬 처리 — 4장이어도 가장 느린 1장 시간에 완료
      const settled = await Promise.allSettled(
        rotatedImages.map(async (img, i) => {
          const res = await axios.post("/api/ocr", { images: [img], engine: "gemini" });
          setProcessed(prev => prev + 1);
          return { index: i, data: res.data };
        })
      );

      const all: OcrPageResult[] = [];
      const pageErrors: string[] = [];

      settled.forEach((result, i) => {
        if (result.status === "fulfilled") {
          const page = result.value.data.pages?.[0];
          if (page) all.push({ ...page, page: i + 1 });
          if (Array.isArray(result.value.data.barcodeMatches)) {
            result.value.data.barcodeMatches.forEach((m: any) => {
              if (!accumBarcodes.find((x: any) => x.code === m.code)) accumBarcodes.push(m);
            });
          }
        } else {
          const msg = (result.reason as any)?.response?.data?.error
            ?? (result.reason as any)?.message ?? "OCR 실패";
          pageErrors.push(`${i + 1}페이지: ${msg}`);
        }
      });

      if (all.length === 0 && pageErrors.length > 0) throw new Error(pageErrors.join(" / "));
      if (pageErrors.length > 0) setError(pageErrors.join(" / "));
      setPages(all);
      setBarcodeMatches(accumBarcodes);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "OCR 처리 중 오류가 발생했습니다.");
    } finally {
      setExtracting(false);
      setStatusMsg("");
    }
  }, [extracting, rotation]);

const handleReparsePage = useCallback(async (pageNum: number, supplierHint: string): Promise<any> => {
  const images = imagesDataRef.current;
  const img = images[pageNum - 1];
  if (!img) return null;
  const rotImg = rotation !== 0 ? await physicallyRotate(img.data, img.mimeType, rotation) : img;
  const res = await axios.post("/api/ocr", {
    images: [rotImg],
    engine: "gemini",
    supplierHints: [supplierHint],
  });
  const newPage = res.data.pages?.[0];
  if (newPage) {
    setPages(prev => prev.map(p => p.page === pageNum ? { ...newPage, page: pageNum } : p));
  }
  return newPage ?? null;
}, [rotation]);

const rotDeg = ((rotation % 360) + 360) % 360;

const clearFiles = () => {
  setFileName(null); setPages([]); setBarcodeMatches([]); setPageImages([]);
  setCurrentPageIdx(0); imagesDataRef.current = [];
  setPageCount(0); setError(null); setRotation(0);
};

return (
  <div className="min-h-screen bg-gray-50 flex flex-col">
    {/* Shared App Nav Header */}
    <AppNavHeader
      activePage="ocr"
      authSession={authSession ?? null}
      onBack={onBack}
      onNavigate={onNavigate}
      onLogout={onLogout}
    />

    <div className="flex-1 flex flex-col items-center px-4 py-6 gap-5 max-w-5xl mx-auto w-full">

      {/* 파일 업로드 + 이미지 뷰어 */}
      <div className="w-full bg-white border border-gray-200 rounded-2xl overflow-hidden">

        {pageImages.length === 0 ? (
          <div
            className="p-3 m-2"
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const files = Array.from(e.dataTransfer.files ?? []);
              if (files.length > 0) handleFiles(files);
            }}
          >
            <div className="flex gap-3">
              {/* PDF 업로드 */}
              <div
                onClick={() => pdfInputRef.current?.click()}
                className="flex-1 flex flex-col items-center gap-2.5 py-6 px-3 border-2 border-dashed border-gray-300 hover:border-amber-400 hover:bg-amber-50/40 rounded-xl cursor-pointer transition-colors"
              >
                <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Upload size={20} className="text-amber-600" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-gray-800 text-sm">PDF 업로드</p>
                  <p className="text-gray-400 text-[11px] mt-0.5">1개 파일</p>
                </div>
              </div>
              {/* 이미지 여러 장 */}
              <div
                onClick={() => imageInputRef.current?.click()}
                className="flex-1 flex flex-col items-center gap-2.5 py-6 px-3 border-2 border-dashed border-gray-300 hover:border-emerald-400 hover:bg-emerald-50/40 rounded-xl cursor-pointer transition-colors"
              >
                <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <Images size={20} className="text-emerald-600" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-gray-800 text-sm">이미지 업로드</p>
                  <p className="text-gray-400 text-[11px] mt-0.5">여러 장 선택 가능</p>
                </div>
              </div>
              {/* 카메라 촬영 */}
              <div
                onClick={() => cameraInputRef.current?.click()}
                className="flex-1 flex flex-col items-center gap-2.5 py-6 px-3 border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/40 rounded-xl cursor-pointer transition-colors"
              >
                <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Camera size={20} className="text-blue-600" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-gray-800 text-sm">카메라 촬영</p>
                  <p className="text-gray-400 text-[11px] mt-0.5">사진 직접 찍기</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Upload size={13} className="text-amber-500" />
              <span className="text-xs font-semibold text-amber-700 truncate max-w-[220px]">{fileName}</span>
              {loading && pageImages.length < pageCount && (
                <span className="text-[10px] text-amber-500 font-bold">
                  · {pageImages.length}/{pageCount} 로딩 중...
                </span>
              )}
              {detectingOrient && (
                <span className="text-[10px] text-sky-500 font-bold flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" />방향 감지 중...
                </span>
              )}
              {!loading && !detectingOrient && pageCount > 1 && (
                <span className="text-[10px] text-gray-400">{pageCount}장</span>
              )}
            </div>
            <button onClick={clearFiles} className="text-gray-400 hover:text-gray-700 cursor-pointer p-1">
              <X size={14} />
            </button>
          </div>
        )}

        {loading && pageImages.length === 0 && (
          <div className="p-6 flex flex-col items-center gap-4">
            <Loader2 size={28} className="text-amber-500 animate-spin" />
            <p className="text-sm font-bold text-gray-700">
              {pageCount > 0 ? `${pageImages.length} / ${pageCount} 로딩 중...` : "파일 읽는 중..."}
            </p>
            {pageCount > 0 && (
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${(pageImages.length / pageCount) * 100}%` }} />
              </div>
            )}
          </div>
        )}

        <PageImageViewer
          key={fileName ?? ""}
          images={pageImages}
          totalPages={pageCount}
          loading={loading}
          currentIdx={currentPageIdx}
          onChangeIdx={setCurrentPageIdx}
          rotation={rotation}
          onRotate={setRotation}
        />
      </div>

      {/* Hidden inputs */}
      <input ref={pdfInputRef} type="file" accept="application/pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) { handleFiles([f]); e.target.value = ""; } }} />
      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) { handleFiles(fs); e.target.value = ""; } }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) { handleFiles([f]); e.target.value = ""; } }} />

      {/* 엔진 선택 + 추출 */}
      {pageImages.length > 0 && !loading && (
        <>
          {pingStatus && !pingStatus.ok && (
            <div className="w-full bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-rose-700 text-xs font-semibold">
              <AlertCircle size={14} />
              서버가 OCR을 지원하지 않습니다. <code className="font-mono bg-rose-100 px-1 rounded">npx tsx server.ts</code> 로 재시작하세요.
            </div>
          )}
          {pingStatus?.ok && !pingStatus.gemini && (
            <div className="w-full bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-amber-700 text-xs font-semibold">
              <AlertCircle size={14} />
              GEMINI_API_KEY가 없습니다. .env에 키를 추가하세요.
            </div>
          )}

          <button onClick={handleExtract} disabled={extracting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer shadow-sm">
            {extracting
              ? <><Loader2 size={15} className="animate-spin" />{statusMsg || `OCR 추출 중... (${processed}/${pageCount || "?"})`}</>
              : <><Zap size={15} />OCR 추출{rotDeg !== 0 ? ` (${rotDeg}° 회전 적용)` : ""}</>}
          </button>
        </>
      )}

      {extracting && pageCount > 0 && (
        <div className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3">
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full transition-all bg-amber-500"
              style={{ width: `${(processed / pageCount) * 100}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="w-full bg-rose-50 border border-rose-200 rounded-2xl p-4 text-rose-700 text-sm font-semibold">
          {error}
        </div>
      )}

      {pages.length > 0 && <RawOcrTable pages={pages} pageImages={pageImages} rotation={rotation} onReparsePage={handleReparsePage} barcodeMatches={barcodeMatches} />}
    </div>
  </div>
);
};
