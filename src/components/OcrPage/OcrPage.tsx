import React, { useCallback, useRef, useState } from "react";
import axios from "axios";
import { ArrowLeft, FileText, Upload, Loader2, X } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { OcrItem, OcrMeta } from "./types";
import { fmt } from "./types";
import { PageImageViewer } from "./PageImageViewer";
import { ItemsTable } from "./ItemsTable";
import { MetaAccordion } from "./MetaAccordion";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface OcrPageProps {
  onBack: () => void;
}

export const OcrPage: React.FC<OcrPageProps> = ({ onBack }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<OcrItem[]>([]);
  const [meta, setMeta] = useState<OcrMeta[]>([]);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);

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
    setItems([]);
    setMeta([]);
    setProcessed(0);
    setPageCount(0);
    setPageImages([]);
    setCurrentPageIdx(0);
    setFileName(file.name);
    setLoading(true);

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

      const BATCH = 4;
      const allItems: OcrItem[] = [];
      const allMeta: OcrMeta[] = [];
      for (let i = 0; i < images.length; i += BATCH) {
        const batch = images.slice(i, i + BATCH);
        const res = await axios.post("/api/ocr", { images: batch });
        (res.data.items ?? []).forEach((item: OcrItem) => allItems.push({ ...item, _page: i + item._page }));
        (res.data.meta ?? []).forEach((m: OcrMeta) => allMeta.push({ ...m, page: i + m.page }));
        setProcessed(Math.min(i + BATCH, images.length));
      }

      setItems(allItems);
      setMeta(allMeta);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [renderPdfToImages]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const clearFile = useCallback(() => {
    setFileName(null);
    setItems([]);
    setMeta([]);
    setPageImages([]);
    setCurrentPageIdx(0);
  }, []);

  const uniqueDates = [...new Set(meta.map(m => m.date).filter(Boolean))] as string[];
  const uniqueSuppliers = [...new Set(meta.map(m => m.supplier).filter(Boolean))] as string[];
  const totalAmount = items.reduce((s, it) => s + (it.amount ?? 0), 0);

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
        {/* Upload */}
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
                onClick={e => { e.stopPropagation(); clearFile(); }}
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

        {/* Image viewer — appears as pages render */}
        <PageImageViewer
          images={pageImages}
          totalPages={pageCount}
          loading={loading}
          currentIdx={currentPageIdx}
          onChangeIdx={setCurrentPageIdx}
        />

        {/* Progress */}
        {loading && (
          <div className="w-full bg-white border border-gray-200 rounded-2xl p-6 flex flex-col items-center gap-4">
            <Loader2 size={28} className="text-amber-500 animate-spin" />
            <p className="text-sm font-bold text-gray-700">
              {pageCount > 0 ? `${processed} / ${pageCount} 페이지 OCR 처리 중...` : "파일 읽는 중..."}
            </p>
            {pageCount > 0 && (
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-amber-500 h-2 rounded-full transition-all"
                  style={{ width: `${(processed / pageCount) * 100}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="w-full bg-rose-50 border border-rose-200 rounded-2xl p-4 text-rose-700 text-sm font-semibold">
            {error}
          </div>
        )}

        {/* Summary cards */}
        {meta.length > 0 && (
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
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">품목 수</p>
              <p className="text-sm font-bold text-gray-900">{items.length}개</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">총 금액</p>
              <p className="text-sm font-bold text-amber-600">{fmt(totalAmount)}원</p>
            </div>
          </div>
        )}

        <ItemsTable items={items} uniqueDates={uniqueDates} />
        <MetaAccordion meta={meta} />
      </div>
    </div>
  );
};
