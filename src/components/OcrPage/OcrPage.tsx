import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { ArrowLeft, FileText, Upload, Loader2, X, Zap, AlertCircle, Cpu, Camera, Images } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PageImageViewer } from "./PageImageViewer";
import { RawOcrTable } from "./RawOcrTable";
import { runPaddleOcr } from "./paddleEngine";
import type { OcrPageResult } from "./paddleEngine";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface OcrPageProps { onBack: () => void; }

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
  const pdfInputRef    = useRef<HTMLInputElement>(null);
  const imageInputRef  = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imagesDataRef  = useRef<{ data: string; mimeType: string }[]>([]);

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
  const [engine,         setEngine        ] = useState<"paddle" | "gemini">("paddle");
  const [pingStatus,     setPingStatus    ] = useState<{ ok: boolean; gemini: boolean; geminiKeyCount: number } | null>(null);
  const [rotation,       setRotation      ] = useState(-90);

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
      const vp     = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width  = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(`페이지 ${i} Canvas를 초기화할 수 없습니다.`);
      await page.render({ canvasContext: ctx as any, viewport: vp, canvas } as any).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.80);
      imgs.push({ data: dataUrl.split(",")[1], mimeType: "image/jpeg" });
      setPageImages(prev => [...prev, dataUrl]);
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
          imgs.push({ data: dataUrl.split(",")[1], mimeType: file.type || "image/jpeg" });
          setPageImages(prev => [...prev, dataUrl]);
        }
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

      if (engine === "paddle") {
        const results = await runPaddleOcr(rotatedImages, p => {
          setStatusMsg(`페이지 ${p.done}/${p.total} 처리 중...`);
          setProcessed(p.done);
        });
        setPages(results);
      } else {
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

  const clearFiles = () => {
    setFileName(null); setPages([]); setPageImages([]);
    setCurrentPageIdx(0); imagesDataRef.current = [];
    setPageCount(0); setError(null);
  };

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
                {!loading && pageCount > 1 && (
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
            {engine === "gemini" && pingStatus?.ok && !pingStatus.gemini && (
              <div className="w-full bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-amber-700 text-xs font-semibold">
                <AlertCircle size={14} />
                GEMINI_API_KEY가 없습니다. .env에 키를 추가하거나 무료 OCR을 사용하세요.
              </div>
            )}

            <div className="w-full bg-white border border-gray-200 rounded-2xl p-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setEngine("paddle")}
                  className={`flex-1 flex flex-col items-center py-3 rounded-xl text-xs font-bold transition cursor-pointer gap-1 ${engine === "paddle" ? "bg-emerald-500 text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
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
                {engine === "paddle"
                  ? "EasyOCR — 서버 Python 처리 · API 불필요 · 한글 지원"
                  : "Gemini 비전 AI — 고정밀 인식 · API 키 필요"}
              </p>
            </div>

            <button onClick={handleExtract} disabled={extracting}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer shadow-sm ${engine === "paddle" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-amber-500 hover:bg-amber-600"}`}>
              {extracting
                ? <><Loader2 size={15} className="animate-spin" />{statusMsg || `OCR 추출 중... (${processed}/${pageCount || "?"})`}</>
                : <>{engine === "paddle" ? <Cpu size={15} /> : <Zap size={15} />}OCR 추출{rotDeg !== 0 ? ` (${rotDeg}° 회전 적용)` : ""}</>}
            </button>
          </>
        )}

        {extracting && pageCount > 0 && (
          <div className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3">
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full transition-all ${engine === "paddle" ? "bg-emerald-500" : "bg-amber-500"}`}
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
