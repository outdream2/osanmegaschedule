import React, { useCallback, useRef, useState } from "react";
import axios from "axios";
import {
  ArrowLeft, FileText, Upload, Loader2, X, ChevronDown, ChevronUp,
  Download, ChevronLeft, ChevronRight, Zap, RotateCcw, RotateCw, ZoomIn,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface OcrPageResult {
  page: number;
  headers: string[];
  rows: (string | number | null)[][];
  meta: {
    supplier?: string | null;
    recipient?: string | null;
    date?: string | null;
    total?: number | null;
  };
  rawText?: string;
}

interface OcrPageProps {
  onBack: () => void;
}

const fmtCell = (v: string | number | null | undefined): string => {
  if (v == null || v === "") return "-";
  if (typeof v === "number") return v.toLocaleString("ko-KR");
  return String(v);
};

export const OcrPage: React.FC<OcrPageProps> = ({ onBack }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagesDataRef = useRef<{ data: string; mimeType: string }[]>([]);

  const [fileName, setFileName] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<OcrPageResult[]>([]);
  const [expandedPage, setExpandedPage] = useState<number | null>(null);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [rotation, setRotation] = useState(-90);
  const [lightbox, setLightbox] = useState(false);

  const renderPdfToImages = useCallback(async (file: File): Promise<{ data: string; mimeType: string }[]> => {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const images: { data: string; mimeType: string }[] = [];
    setPageCount(pdf.numPages);
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx as any, viewport: vp, canvas } as any).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      images.push({ data: dataUrl.split(",")[1], mimeType: "image/jpeg" });
      setPageImages(prev => [...prev, dataUrl]);
    }
    return images;
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setPages([]);
    setProcessed(0);
    setPageCount(0);
    setPageImages([]);
    setCurrentPageIdx(0);
    setFileName(file.name);
    setLoading(true);
    setRotation(-90);
    imagesDataRef.current = [];
    try {
      let images: { data: string; mimeType: string }[];
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        images = await renderPdfToImages(file);
      } else {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        images = [{ data: dataUrl.split(",")[1], mimeType: file.type || "image/jpeg" }];
        setPageCount(1);
        setPageImages([dataUrl]);
      }
      imagesDataRef.current = images;
    } catch (err: any) {
      setError(err?.message ?? "처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [renderPdfToImages]);

  const handleExtract = useCallback(async () => {
    const images = imagesDataRef.current;
    if (images.length === 0 || extracting) return;
    setExtracting(true);
    setPages([]);
    setProcessed(0);
    setError(null);
    try {
      const BATCH = 4;
      const allPages: OcrPageResult[] = [];
      for (let i = 0; i < images.length; i += BATCH) {
        const batch = images.slice(i, i + BATCH);
        const res = await axios.post("/api/ocr", { images: batch });
        const batchPages: OcrPageResult[] = res.data.pages ?? [];
        batchPages.forEach(p => allPages.push({ ...p, page: i + p.page }));
        setProcessed(Math.min(i + BATCH, images.length));
      }
      setPages(allPages);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "OCR 처리 중 오류가 발생했습니다.");
    } finally {
      setExtracting(false);
    }
  }, [extracting, planMode]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleExportCsv = useCallback(() => {
    if (pages.length === 0) return;
    const allHeaders = Array.from(new Set(pages.flatMap(p => p.headers)));
    const header = ["페이지", ...allHeaders];
    const rows = pages.flatMap(p =>
      p.rows.map(row => {
        const cells: any[] = [p.page];
        allHeaders.forEach(h => {
          const ci = p.headers.indexOf(h);
          cells.push(ci >= 0 ? (row[ci] ?? "") : "");
        });
        return cells;
      })
    );
    const csv = [header, ...rows]
      .map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `거래명세서_${pages[0]?.meta?.date?.replace(/[-/]/g, "") ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pages]);

  const totalAmount = pages.reduce((s, p) => s + (p.meta.total ?? 0), 0);
  const uniqueDates = [...new Set(pages.map(p => p.meta.date).filter(Boolean))];
  const uniqueSuppliers = [...new Set(pages.map(p => p.meta.supplier).filter(Boolean))];
  const totalRows = pages.reduce((s, p) => s + p.rows.length, 0);

  const mergedHeaders =
    pages.length > 0 && pages.every(p => JSON.stringify(p.headers) === JSON.stringify(pages[0].headers))
      ? pages[0].headers
      : null;

  const normRot = ((rotation % 360) + 360) % 360;
  const isSideways = normRot === 90 || normRot === 270;

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

        {/* Upload area */}
        <div
          className="w-full border-2 border-dashed border-gray-300 hover:border-amber-400 rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors bg-white"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
            <Upload size={22} className="text-amber-600" />
          </div>
          <div className="text-center">
            <p className="font-bold text-gray-800 text-sm">PDF 또는 이미지 파일 업로드</p>
            <p className="text-gray-500 text-xs mt-1">거래명세서 PDF, JPEG, PNG 지원 · 클릭하거나 드래그</p>
          </div>
          {fileName && !loading && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
              <FileText size={13} className="text-amber-600" />
              <span className="text-xs font-semibold text-amber-800">{fileName}</span>
              <button
                onClick={e => {
                  e.stopPropagation();
                  setFileName(null); setPages([]); setPageImages([]); setCurrentPageIdx(0);
                  imagesDataRef.current = [];
                }}
                className="text-amber-500 hover:text-amber-800 ml-1 cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { handleFile(f); e.target.value = ""; } }}
        />

        {/* PDF loading progress */}
        {loading && (
          <div className="w-full bg-white border border-gray-200 rounded-2xl p-6 flex flex-col items-center gap-4">
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

        {/* Page image viewer */}
        {pageImages.length > 0 && (
          <div className="w-full bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <span className="text-xs font-bold text-gray-500">원본 이미지</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setRotation(r => r - 90)} title="시계반대방향 90° 회전" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition cursor-pointer">
                  <RotateCcw size={14} />
                </button>
                <button onClick={() => setRotation(r => r + 90)} title="시계방향 90° 회전" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition cursor-pointer">
                  <RotateCw size={14} />
                </button>
                <span className="text-xs font-bold text-gray-400 ml-2">
                  {currentPageIdx + 1} / {pageImages.length}
                  {loading && pageImages.length < pageCount && <span className="text-amber-500 ml-1">· 렌더링 중...</span>}
                </span>
              </div>
            </div>
            <div className="relative bg-gray-100 flex items-center justify-center overflow-hidden" style={{ minHeight: "200px", maxHeight: "42vh" }}>
              <img
                key={currentPageIdx}
                src={pageImages[currentPageIdx]}
                alt={`페이지 ${currentPageIdx + 1}`}
                style={{
                  display: "block",
                  maxWidth: isSideways ? "42vh" : "100%",
                  maxHeight: isSideways ? "100%" : "42vh",
                  width: "auto", height: "auto",
                  transform: `rotate(${rotation}deg)`,
                  transition: "transform 0.25s ease",
                }}
              />
              <button
                onClick={() => setLightbox(true)}
                className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/65 text-white transition cursor-pointer"
                title="크게 보기"
              >
                <ZoomIn size={15} />
              </button>
              {pageImages.length > 1 && (
                <>
                  <button onClick={() => setCurrentPageIdx(i => Math.max(0, i - 1))} disabled={currentPageIdx === 0}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white disabled:opacity-20 disabled:cursor-not-allowed transition cursor-pointer">
                    <ChevronLeft size={20} />
                  </button>
                  <button onClick={() => setCurrentPageIdx(i => Math.min(pageImages.length - 1, i + 1))} disabled={currentPageIdx === pageImages.length - 1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white disabled:opacity-20 disabled:cursor-not-allowed transition cursor-pointer">
                    <ChevronRight size={20} />
                  </button>
                  <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1.5">
                    {pageImages.map((_, i) => (
                      <button key={i} onClick={() => setCurrentPageIdx(i)}
                        className={`h-1.5 rounded-full transition-all cursor-pointer ${i === currentPageIdx ? "bg-amber-400 w-4" : "w-1.5 bg-white/60 hover:bg-white/90"}`} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* OCR extract controls */}
        {pageImages.length > 0 && !loading && (
          <button
            onClick={handleExtract}
            disabled={extracting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer shadow-sm"
          >
            {extracting
              ? <><Loader2 size={15} className="animate-spin" />OCR 추출 중... ({processed}/{pageCount > 0 ? pageCount : "?"})</>
              : <><Zap size={15} />OCR 추출</>}
          </button>
        )}

        {/* OCR progress bar */}
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
        {pages.length > 0 && (
          <>
            <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">공급자</p>
                <p className="text-sm font-bold text-gray-900 truncate">{uniqueSuppliers.join(", ") || "-"}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">거래일자</p>
                <p className="text-sm font-bold text-gray-900 truncate">{uniqueDates.join(", ") || "-"}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">항목 수</p>
                <p className="text-sm font-bold text-gray-900">{totalRows}개</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">합계</p>
                <p className="text-sm font-bold text-amber-600">{totalAmount > 0 ? totalAmount.toLocaleString("ko-KR") + "원" : "-"}</p>
              </div>
            </div>

            <div className="w-full bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="font-bold text-gray-900 text-sm">
                  {mergedHeaders ? "추출 데이터" : `추출 데이터 (${pages.length}페이지)`}
                </span>
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-2.5 py-1 rounded-lg transition cursor-pointer"
                >
                  <Download size={12} />CSV 내보내기
                </button>
              </div>

              {mergedHeaders ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-xs font-bold">
                        {pages.length > 1 && <th className="text-center px-3 py-2.5 whitespace-nowrap">페이지</th>}
                        {mergedHeaders.map((h, i) => (
                          <th key={i} className="text-left px-3 py-2.5 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pages.flatMap(p =>
                        p.rows.map((row, ri) => (
                          <tr key={`${p.page}-${ri}`} className="border-t border-gray-50 hover:bg-amber-50/40 transition-colors">
                            {pages.length > 1 && (
                              <td className="px-3 py-2 text-center">
                                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold">{p.page}</span>
                              </td>
                            )}
                            {mergedHeaders.map((_, ci) => (
                              <td key={ci} className="px-3 py-2 text-gray-800">{fmtCell(row[ci])}</td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {pages.map(p => (
                    <div key={p.page}>
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition cursor-pointer"
                        onClick={() => setExpandedPage(expandedPage === p.page ? null : p.page)}
                      >
                        <span className="text-sm font-semibold text-gray-700">페이지 {p.page}</span>
                        <div className="flex items-center gap-3">
                          {p.meta.date && <span className="text-xs text-gray-500">{p.meta.date}</span>}
                          {p.meta.total != null && <span className="text-xs font-bold text-amber-700">{p.meta.total.toLocaleString("ko-KR")}원</span>}
                          <span className="text-[10px] text-gray-400">{p.rows.length}행</span>
                          {expandedPage === p.page ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                        </div>
                      </button>
                      {expandedPage === p.page && (
                        <div className="overflow-x-auto border-t border-gray-100">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 text-gray-500 text-xs font-bold">
                                {p.headers.map((h, i) => (
                                  <th key={i} className="text-left px-3 py-2 whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {p.rows.map((row, ri) => (
                                <tr key={ri} className="border-t border-gray-50 hover:bg-amber-50/40 transition-colors">
                                  {p.headers.map((_, ci) => (
                                    <td key={ci} className="px-3 py-2 text-gray-800">{fmtCell(row[ci])}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && pageImages[currentPageIdx] && (
        <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(false)}>
          <button className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white transition cursor-pointer" onClick={() => setLightbox(false)}>
            <X size={18} />
          </button>
          <img
            src={pageImages[currentPageIdx]}
            alt={`페이지 ${currentPageIdx + 1}`}
            style={{ maxWidth: "100%", maxHeight: "100%", transform: `rotate(${rotation}deg)`, objectFit: "contain" }}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};
