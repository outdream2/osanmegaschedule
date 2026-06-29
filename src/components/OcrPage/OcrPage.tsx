import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { ArrowLeft, FileText, Upload, Loader2, X, Zap, AlertCircle, Cpu } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PageImageViewer } from "./PageImageViewer";
import { RawOcrTable } from "./RawOcrTable";
import { runTesseractOcr } from "./tesseractEngine";
import type { OcrPageResult } from "./tesseractEngine";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface OcrPageProps { onBack: () => void; }

/** Canvas로 이미지를 물리적으로 회전 */
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
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const imagesDataRef = useRef<{ data: string; mimeType: string }[]>([]);

  const [fileName,       setFileName      ] = useState<string | null>(null);
  const [pageCount,      setPageCount     ] = useState(0);
  const [processed,      setProcessed     ] = useState(0);
  const [statusMsg,      setStatusMsg     ] = useState<string>("");
  const [loading,        setLoading       ] = useState(false);
  const [extracting,     setExtracting    ] = useState(false);
  const [error,          setError         ] = useState<string | null>(null);
  const [pages,          setPages         ] = useState<OcrPageResult[]>([]);
  const [pageImages,     setPageImages    ] = useState<string[]>([]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [engine,         setEngine        ] = useState<"tesseract" | "gemini">("tesseract");
  const [pingStatus,     setPingStatus    ] = useState<{ ok: boolean; gemini: boolean; geminiKeyCount: number } | null>(null);
  const [rotation,       setRotation      ] = useState(-90);

  useEffect(() => {
    axios.get("/api/ocr-ping")
      .then(r => setPingStatus(r.data))
      .catch(() => setPingStatus({ ok: false, gemini: false, geminiKeyCount: 0 }));
  }, []);

  const renderPdfToImages = useCallback(async (file: File): Promise<{ data: string; mimeType: string }[]> => {
    const scale   = 1.5;
    const quality = 0.80;
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const imgs: { data: string; mimeType: string }[] = [];
    setPageCount(pdf.numPages);
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp     = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width  = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(`페이지 ${i} Canvas를 초기화할 수 없습니다.`);
      await page.render({ canvasContext: ctx as any, viewport: vp, canvas } as any).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      imgs.push({ data: dataUrl.split(",")[1], mimeType: "image/jpeg" });
      setPageImages(prev => [...prev, dataUrl]);
    }
    return imgs;
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(null); setPages([]); setProcessed(0); setPageCount(0); setStatusMsg("");
    setPageImages([]); setCurrentPageIdx(0); setFileName(file.name);
    setLoading(true); setRotation(-90);
    imagesDataRef.current = [];
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
    if (images.length === 0 || extracting) return;
    setExtracting(true); setPages([]); setProcessed(0); setError(null); setStatusMsg("");

    try {
      const rotatedImages = rotation === 0
        ? images
        : await Promise.all(images.map(img => physicallyRotate(img.data, img.mimeType, rotation)));

      if (engine === "tesseract") {
        const results = await runTesseractOcr(rotatedImages, p => {
          if (p.type === "status") {
            setStatusMsg(p.status ?? "");
          } else if (p.type === "page") {
            setStatusMsg(`페이지 ${p.done}/${p.total} 처리 중...`);
            setProcessed(p.done ?? 0);
          }
        });
        setPages(results);
      } else {
        // gemini — 순차 처리
        const all: OcrPageResult[] = [];
        for (let i = 0; i < rotatedImages.length; i++) {
          try {
            const res = await axios.post("/api/ocr", { images: [rotatedImages[i]], engine: "gemini" });
            const page = res.data.pages?.[0];
            if (page) all.push({ ...page, page: i + 1 });
          } catch (e: any) {
            const msg = e?.response?.data?.error ?? e?.message ?? "OCR 실패";
            if (all.length === 0 && i === rotatedImages.length - 1) throw new Error(msg);
            setError(`페이지 ${i + 1} 실패: ${msg}`);
          }
          setProcessed(i + 1);
        }
        setPages(all);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "OCR 처리 중 오류가 발생했습니다.");
    } finally {
      setExtracting(false);
      setStatusMsg("");
    }
  }, [extracting, engine, rotation]);

  const rotDeg = ((rotation % 360) + 360) % 360;

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

        {/* 파일 업로드 + 이미지 뷰어 */}
        <div className="w-full bg-white border border-gray-200 rounded-2xl overflow-hidden">
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
                  onClick={e => {
                    e.stopPropagation();
                    setFileName(null); setPages([]); setPageImages([]);
                    setCurrentPageIdx(0); imagesDataRef.current = [];
                  }}
                  className="text-gray-400 hover:text-gray-700 cursor-pointer p-1"
                ><X size={14} /></button>
              </div>
            )}
          </div>

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

        {/* 엔진 선택 + 추출 */}
        {pageImages.length > 0 && !loading && (
          <>
            {/* 배너 */}
            {pingStatus && !pingStatus.ok && (
              <div className="w-full bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-rose-700 text-xs font-semibold">
                <AlertCircle size={14} />
                서버가 OCR을 지원하지 않습니다. <code className="font-mono bg-rose-100 px-1 rounded">npx tsx server.ts</code> 로 재시작하세요.
              </div>
            )}
            {engine === "gemini" && pingStatus?.ok && !pingStatus.gemini && (
              <div className="w-full bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-amber-700 text-xs font-semibold">
                <AlertCircle size={14} />
                GEMINI_API_KEY가 없습니다. .env에 키를 추가하거나 무료 OCR을 사용하세요.
              </div>
            )}

            {/* 무료 / 유료 엔진 선택 */}
            <div className="w-full bg-white border border-gray-200 rounded-2xl p-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setEngine("tesseract")}
                  className={`flex-1 flex flex-col items-center py-3 rounded-xl text-xs font-bold transition cursor-pointer gap-1 ${engine === "tesseract" ? "bg-emerald-500 text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                >
                  <Cpu size={14} />
                  무료 OCR
                </button>
                <button
                  onClick={() => setEngine("gemini")}
                  className={`flex-1 flex flex-col items-center py-3 rounded-xl text-xs font-bold transition cursor-pointer gap-1 ${engine === "gemini" ? "bg-amber-500 text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                >
                  <Zap size={14} />
                  유료 OCR
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-2 text-center">
                {engine === "tesseract"
                  ? "Tesseract.js — 브라우저 로컬 연산 · API 불필요 · 오프라인 지원"
                  : "Gemini 비전 AI — 고정밀 인식 · API 키 필요"}
              </p>
            </div>

            <button onClick={handleExtract} disabled={extracting}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer shadow-sm ${engine === "tesseract" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-amber-500 hover:bg-amber-600"}`}>
              {extracting
                ? <><Loader2 size={15} className="animate-spin" />{statusMsg || `OCR 추출 중... (${processed}/${pageCount || "?"})`}</>
                : <>{engine === "tesseract" ? <Cpu size={15} /> : <Zap size={15} />}OCR 추출{rotDeg !== 0 ? ` (${rotDeg}° 회전 적용)` : ""}</>}
            </button>
          </>
        )}

        {extracting && pageCount > 0 && (
          <div className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3">
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full transition-all ${engine === "tesseract" ? "bg-emerald-500" : "bg-amber-500"}`}
                style={{ width: `${(processed / pageCount) * 100}%` }} />
            </div>
          </div>
        )}

        {error && (
          <div className="w-full bg-rose-50 border border-rose-200 rounded-2xl p-4 text-rose-700 text-sm font-semibold">
            {error}
          </div>
        )}

        {pages.length > 0 && <RawOcrTable pages={pages} pageImages={pageImages} />}
      </div>
    </div>
  );
};
