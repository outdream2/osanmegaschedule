import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { ArrowLeft, FileText, Upload, Loader2, X, Zap, AlertCircle } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PageImageViewer } from "./PageImageViewer";
import { RawOcrTable } from "./RawOcrTable";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface OcrPageResult {
  page: number;
  headers: string[];
  rows: (string | number | null)[][];
  meta: { supplier?: string | null; recipient?: string | null; date?: string | null; total?: number | null };
  rawText?: string;
}

interface PdfTextItem { text: string; x: number; y: number; height: number; }

interface OcrPageProps { onBack: () => void; }

/** Canvas로 이미지를 물리적으로 회전 — 서버에 올바른 방향으로 전송 */
async function physicallyRotate(
  b64: string,
  mimeType: string,
  degrees: number,
): Promise<{ data: string; mimeType: string }> {
  if (degrees === 0) return { data: b64, mimeType };
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const rad  = (degrees * Math.PI) / 180;
      const swap = degrees === 90 || degrees === 270 || degrees === -90 || degrees === -270;
      const canvas = document.createElement("canvas");
      canvas.width  = swap ? img.height : img.width;
      canvas.height = swap ? img.width  : img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve({ data: canvas.toDataURL("image/jpeg", 0.95).split(",")[1], mimeType: "image/jpeg" });
    };
    img.src = `data:${mimeType};base64,${b64}`;
  });
}

export const OcrPage: React.FC<OcrPageProps> = ({ onBack }) => {
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const imagesDataRef  = useRef<{ data: string; mimeType: string }[]>([]);
  const textPagesRef   = useRef<PdfTextItem[][]>([]);

  const [fileName,       setFileName      ] = useState<string | null>(null);
  const [pageCount,      setPageCount     ] = useState(0);
  const [processed,      setProcessed     ] = useState(0);
  const [loading,        setLoading       ] = useState(false);
  const [extracting,     setExtracting    ] = useState(false);
  const [error,          setError         ] = useState<string | null>(null);
  const [pages,          setPages         ] = useState<OcrPageResult[]>([]);
  const [pageImages,     setPageImages    ] = useState<string[]>([]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [hasPdfText,     setHasPdfText    ] = useState(false);
  const [engine,         setEngine        ] = useState<"gemini" | "pdf-text">("gemini");
  const [pingStatus,     setPingStatus    ] = useState<{ ok: boolean; gemini: boolean; geminiKeyCount: number } | null>(null);
  // rotation을 여기서 관리 → handleExtract에서 물리적 회전에 사용
  const [rotation,       setRotation      ] = useState(-90);

  useEffect(() => {
    axios.get("/api/ocr-ping").then(r => {
      setPingStatus(r.data);
    }).catch(() => setPingStatus({ ok: false, gemini: false, geminiKeyCount: 0 }));
  }, []);

  const renderPdfToImages = useCallback(async (file: File): Promise<{ data: string; mimeType: string }[]> => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const scale   = isMobile ? 1.5 : 2.0;
    const quality = isMobile ? 0.80 : 0.92;

    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const imgs: { data: string; mimeType: string }[] = [];
    const textPages: PdfTextItem[][] = [];
    setPageCount(pdf.numPages);
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      // 이미지 렌더
      const vp     = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width  = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(`페이지 ${i} Canvas 컨텍스트를 가져올 수 없습니다 (메모리 부족일 수 있음)`);
      await page.render({ canvasContext: ctx as any, viewport: vp, canvas } as any).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      imgs.push({ data: dataUrl.split(",")[1], mimeType: "image/jpeg" });
      setPageImages(prev => [...prev, dataUrl]);
      // 텍스트 레이어 추출
      const tc = await page.getTextContent();
      const items: PdfTextItem[] = (tc.items as any[])
        .filter(it => it.str && it.str.trim())
        .map(it => ({ text: it.str.trim(), x: it.transform[4], y: it.transform[5], height: it.height ?? 12 }));
      textPages.push(items);
    }
    textPagesRef.current = textPages;
    const hasText = textPages.some(p => p.length > 5);
    setHasPdfText(hasText);
    if (hasText) setEngine("pdf-text");
    return imgs;
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(null); setPages([]); setProcessed(0); setPageCount(0);
    setPageImages([]); setCurrentPageIdx(0); setFileName(file.name);
    setLoading(true); setRotation(-90); setHasPdfText(false);
    imagesDataRef.current = [];
    textPagesRef.current = [];
    try {
      let imgs: { data: string; mimeType: string }[];
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        imgs = await renderPdfToImages(file);
      } else {
        const dataUrl = await new Promise<string>(res => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.readAsDataURL(file);
        });
        imgs = [{ data: dataUrl.split(",")[1], mimeType: file.type || "image/jpeg" }];
        setPageCount(1);
        setPageImages([dataUrl]);
      }
      imagesDataRef.current = imgs;
    } catch (err: any) {
      setError(err?.message ?? "파일 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [renderPdfToImages]);

  const handleExtract = useCallback(async () => {
    const images = imagesDataRef.current;
    if ((engine === "pdf-text" ? textPagesRef.current.length === 0 : images.length === 0) || extracting) return;
    setExtracting(true); setPages([]); setProcessed(0); setError(null);
    try {
      if (engine === "pdf-text") {
        const textPages = textPagesRef.current;
        const res = await axios.post("/api/ocr", { textPages, engine: "pdf-text" });
        setPages(res.data.pages ?? []);
        setProcessed(textPages.length);
      } else {
        // 화면 회전 각도만큼 이미지를 물리적으로 회전 후 서버 전송
        const rotatedImages = rotation === 0
          ? images
          : await Promise.all(images.map(img => physicallyRotate(img.data, img.mimeType, rotation)));

        const BATCH = 1;
        const all: OcrPageResult[] = [];
        for (let i = 0; i < rotatedImages.length; i += BATCH) {
          const batch = rotatedImages.slice(i, i + BATCH);
          const res = await axios.post("/api/ocr", { images: batch, engine });
          (res.data.pages ?? []).forEach((p: OcrPageResult) => all.push({ ...p, page: i + p.page }));
          setProcessed(Math.min(i + BATCH, rotatedImages.length));
        }
        setPages(all);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "OCR 처리 중 오류가 발생했습니다.");
    } finally {
      setExtracting(false);
    }
  }, [extracting, engine, rotation]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 h-14 flex items-center gap-3 px-4 shrink-0 shadow-sm">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer">
          <ArrowLeft size={18} className="text-gray-600" />
        </button>
        <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center">
          <FileText size={14} className="text-white" />
        </div>
        <span className="font-bold text-gray-900 text-sm">거래명세서 OCR</span>
      </header>

      <div className="flex-1 flex flex-col items-center px-4 py-6 gap-5 max-w-5xl mx-auto w-full">

        {/* Upload + 이미지 뷰어 통합 */}
        <div className="w-full bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {/* 업로드 클릭 영역 */}
          <div
            className={`flex flex-col items-center gap-3 cursor-pointer transition-colors ${pageImages.length === 0 ? "p-8 border-2 border-dashed border-gray-300 hover:border-amber-400 m-2 rounded-xl" : "px-4 py-2.5 border-b border-gray-100 hover:bg-gray-50"}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          >
            {pageImages.length === 0 ? (
              <>
                <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Upload size={22} className="text-amber-600" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-gray-800 text-sm">PDF 또는 이미지 파일 업로드</p>
                  <p className="text-gray-500 text-xs mt-1">거래명세서 PDF, JPEG, PNG 지원 · 클릭하거나 드래그</p>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Upload size={13} className="text-amber-500" />
                  <span className="text-xs font-semibold text-amber-700 truncate max-w-[200px]">{fileName}</span>
                  {loading && pageImages.length < pageCount && (
                    <span className="text-[10px] text-amber-500 font-bold">· 렌더링 중...</span>
                  )}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setFileName(null); setPages([]); setPageImages([]); setCurrentPageIdx(0); imagesDataRef.current = []; textPagesRef.current = []; }}
                  className="text-gray-400 hover:text-gray-700 cursor-pointer p-1"
                ><X size={14} /></button>
              </div>
            )}
          </div>

          {/* 로딩 */}
          {loading && pageImages.length === 0 && (
            <div className="p-6 flex flex-col items-center gap-4">
              <Loader2 size={28} className="text-amber-500 animate-spin" />
              <p className="text-sm font-bold text-gray-700">
                {pageCount > 0 ? `${pageImages.length} / ${pageCount} 페이지 렌더링 중...` : "파일 읽는 중..."}
              </p>
              {pageCount > 0 && (
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${(pageImages.length / pageCount) * 100}%` }} />
                </div>
              )}
            </div>
          )}

          {/* 이미지 뷰어 인라인 */}
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
        <input ref={fileInputRef} type="file" accept="application/pdf,image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { handleFile(f); e.target.value = ""; } }} />

        {/* Engine selector + extract */}
        {pageImages.length > 0 && !loading && (
          <>
            {/* 서버 상태 배너 */}
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

            {hasPdfText && (
              <div className="w-full bg-white border border-gray-200 rounded-2xl p-3">
                <div className="flex gap-2">
                  <button onClick={() => setEngine("gemini")}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${engine === "gemini" ? "bg-amber-500 text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                    이미지 인식
                  </button>
                  <button onClick={() => setEngine("pdf-text")}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${engine === "pdf-text" ? "bg-emerald-500 text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                    PDF 텍스트
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">
                  {engine === "pdf-text" ? "PDF 텍스트 레이어 직접 추출 — 가장 빠름" : "Gemini 비전 인식 — 이미지/스캔 PDF"}
                </p>
              </div>
            )}

            <button onClick={handleExtract} disabled={extracting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer shadow-sm">
              {extracting
                ? <><Loader2 size={15} className="animate-spin" />OCR 추출 중... ({processed}/{pageCount || "?"})</>
                : <><Zap size={15} />OCR 추출{rotation !== 0 ? ` (${((rotation % 360) + 360) % 360}° 회전 적용)` : ""}</>}
            </button>
          </>
        )}

        {/* Extract progress */}
        {extracting && pageCount > 0 && (
          <div className="w-full bg-white border border-amber-200 rounded-2xl px-4 py-3">
            <div className="w-full bg-amber-100 rounded-full h-1.5">
              <div className="bg-amber-500 h-1.5 rounded-full transition-all" style={{ width: `${(processed / pageCount) * 100}%` }} />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="w-full bg-rose-50 border border-rose-200 rounded-2xl p-4 text-rose-700 text-sm font-semibold">
            {error}
          </div>
        )}

        {/* Results */}
        {pages.length > 0 && <RawOcrTable pages={pages} pageImages={pageImages} />}
      </div>
    </div>
  );
};
