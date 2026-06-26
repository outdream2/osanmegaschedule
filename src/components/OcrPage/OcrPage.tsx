import React, { useCallback, useRef, useState } from "react";
import axios from "axios";
import { ArrowLeft, FileText, Upload, Loader2, X, ChevronDown, ChevronUp, Download } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface OcrItem {
  name: string | null;
  spec: string | null;
  qty: number | null;
  unit_price: number | null;
  amount: number | null;
  _page: number;
}
interface OcrMeta {
  page: number;
  supplier?: string | null;
  recipient?: string | null;
  date?: string | null;
  subtotal?: number | null;
  vat?: number | null;
  total?: number | null;
  _rawText?: string;
}

interface OcrPageProps {
  onBack: () => void;
}

const fmt = (n: number | null | undefined) =>
  n == null ? "-" : n.toLocaleString("ko-KR");

export const OcrPage: React.FC<OcrPageProps> = ({ onBack }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<OcrItem[]>([]);
  const [meta, setMeta] = useState<OcrMeta[]>([]);
  const [expandedPage, setExpandedPage] = useState<number | null>(null);

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
      const b64 = dataUrl.split(",")[1];
      images.push({ data: b64, mimeType: "image/jpeg" });
    }
    return images;
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setItems([]);
    setMeta([]);
    setProcessed(0);
    setPageCount(0);
    setFileName(file.name);
    setLoading(true);

    try {
      let images: { data: string; mimeType: string }[];
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        images = await renderPdfToImages(file);
      } else {
        // single image
        const buf = await file.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        images = [{ data: b64, mimeType: file.type || "image/jpeg" }];
        setPageCount(1);
      }

      // Send in batches of 4 pages
      const BATCH = 4;
      const allItems: OcrItem[] = [];
      const allMeta: OcrMeta[] = [];
      for (let i = 0; i < images.length; i += BATCH) {
        const batch = images.slice(i, i + BATCH);
        const res = await axios.post("/api/ocr", { images: batch });
        // adjust page numbers relative to global offset
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

  const totalAmount = items.reduce((s, it) => s + (it.amount ?? 0), 0);
  const uniqueDates = [...new Set(meta.map(m => m.date).filter(Boolean))];
  const uniqueSuppliers = [...new Set(meta.map(m => m.supplier).filter(Boolean))];

  const handleExportCsv = useCallback(() => {
    const header = ["페이지", "품명", "규격", "수량", "단가", "금액"];
    const rows = items.map(it => [
      it._page,
      it.name ?? "",
      it.spec ?? "",
      it.qty ?? "",
      it.unit_price ?? "",
      it.amount ?? "",
    ]);
    const csv = [header, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const bom = "﻿";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = uniqueDates[0]?.replace(/[-/]/g, "") ?? "export";
    a.download = `거래명세서_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [items, uniqueDates]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
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
                onClick={e => { e.stopPropagation(); setFileName(null); setItems([]); setMeta([]); }}
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

        {/* Progress */}
        {loading && (
          <div className="w-full bg-white border border-gray-200 rounded-2xl p-6 flex flex-col items-center gap-4">
            <Loader2 size={28} className="text-amber-500 animate-spin" />
            <p className="text-sm font-bold text-gray-700">
              {pageCount > 0 ? `${processed} / ${pageCount} 페이지 처리 중...` : "파일 읽는 중..."}
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

        {/* Items table */}
        {items.length > 0 && (
          <div className="w-full bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="font-bold text-gray-900 text-sm">품목 목록</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{items.length}개 항목</span>
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-2.5 py-1 rounded-lg transition cursor-pointer"
                >
                  <Download size={12} />CSV 내보내기
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs font-bold">
                    <th className="text-left px-4 py-2.5">품명</th>
                    <th className="text-left px-3 py-2.5 whitespace-nowrap">규격</th>
                    <th className="text-right px-3 py-2.5">수량</th>
                    <th className="text-right px-3 py-2.5 whitespace-nowrap">단가</th>
                    <th className="text-right px-4 py-2.5">금액</th>
                    <th className="text-center px-3 py-2.5">페이지</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-t border-gray-50 hover:bg-amber-50/50 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{it.name ?? "-"}</td>
                      <td className="px-3 py-2.5 text-gray-500">{it.spec ?? "-"}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{it.qty ?? "-"}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700 whitespace-nowrap">{fmt(it.unit_price)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900 whitespace-nowrap">{fmt(it.amount)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold">{it._page}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-amber-50 border-t-2 border-amber-200">
                    <td colSpan={4} className="px-4 py-2.5 text-right font-black text-gray-700 text-sm">합계</td>
                    <td className="px-4 py-2.5 text-right font-black text-amber-700 text-sm whitespace-nowrap">{fmt(totalAmount)}원</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Per-page meta */}
        {meta.length > 0 && (
          <div className="w-full bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="font-bold text-gray-900 text-sm">페이지별 요약</span>
            </div>
            <div className="divide-y divide-gray-50">
              {meta.map((m) => (
                <div key={m.page}>
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition cursor-pointer"
                    onClick={() => setExpandedPage(expandedPage === m.page ? null : m.page)}
                  >
                    <span className="text-sm font-semibold text-gray-700">페이지 {m.page}</span>
                    <div className="flex items-center gap-3">
                      {m.date && <span className="text-xs text-gray-500">{m.date}</span>}
                      {m.total != null && <span className="text-xs font-bold text-amber-700">{fmt(m.total)}원</span>}
                      {expandedPage === m.page ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                    </div>
                  </button>
                  {expandedPage === m.page && (
                    <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      {m.supplier && <div><span className="text-gray-400">공급자: </span><span className="font-semibold text-gray-700">{m.supplier}</span></div>}
                      {m.recipient && <div><span className="text-gray-400">수신자: </span><span className="font-semibold text-gray-700">{m.recipient}</span></div>}
                      {m.date && <div><span className="text-gray-400">일자: </span><span className="font-semibold text-gray-700">{m.date}</span></div>}
                      {m.subtotal != null && <div><span className="text-gray-400">공급가액: </span><span className="font-semibold text-gray-700">{fmt(m.subtotal)}원</span></div>}
                      {m.vat != null && <div><span className="text-gray-400">부가세: </span><span className="font-semibold text-gray-700">{fmt(m.vat)}원</span></div>}
                      {m.total != null && <div><span className="text-gray-400">합계: </span><span className="font-bold text-amber-700">{fmt(m.total)}원</span></div>}
                      {m._rawText && (
                        <div className="col-span-full">
                          <p className="text-gray-400 mb-1">원문 응답:</p>
                          <pre className="text-[10px] text-gray-600 bg-gray-50 p-2 rounded overflow-x-auto">{m._rawText}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
