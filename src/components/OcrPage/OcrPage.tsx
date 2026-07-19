import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { Upload, Loader2, X, Zap, AlertCircle, Images, BookOpen, Building2, Plus, Trash2, Pencil, Check, RefreshCw, FileText } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { PageImageViewer } from "./PageImageViewer";
import { RawOcrTable, type ConfirmedItem } from "./RawOcrTable";
import type { OcrPageResult } from "./types";
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
  /** true 이면 헤더/전체 페이지 셸 없이 OCR 컨텐츠만 렌더 (다른 페이지에 임베드용) */
  embedded?: boolean;
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

interface ProductSynonym {
  id: number;
  prod_name_old: string;
  prod_name_new: string | null;
  product_code: string;
  supplier_old: string | null;
  supplier_new: string | null;
}

interface SupplierAlias {
  id: number;
  alias: string;
  supplier_name: string;
  created_at: string;
}

interface ProdEditState {
  prod_name_old: string;
  prod_name_new: string;
  product_code: string;
  supplier_new: string;
  supplier_old: string;
}

interface SuppEditState {
  alias: string;
  supplier_name: string;
}

const BALANCE_LABEL_OPTIONS = ["(없음)", "합계", "합계액", "잔고", "잔액", "총합계", "미수금"];

interface BalanceConfigTabProps {
  pages: OcrPageResult[];
  config: Record<string, string>;
  onConfigChange: (vendor: string, label: string) => void;
}

const BalanceConfigTab: React.FC<BalanceConfigTabProps> = ({ pages, config, onConfigChange }) => {
  const [dbVendors, setDbVendors] = React.useState<string[]>([]);

  React.useEffect(() => {
    axios.get("/api/supplier-balance-configs")
      .then(r => {
        const names = (r.data as { supplier_name: string }[]).map(x => x.supplier_name);
        setDbVendors(names);
      })
      .catch(() => {});
  }, []);

  const knownVendors = React.useMemo(() => {
    const fromPages = pages.map(p => p.meta.supplier).filter(Boolean) as string[];
    const all = new Set([...dbVendors, ...fromPages]);
    return [...all].sort();
  }, [pages, dbVendors]);

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-4 flex flex-col gap-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-orange-50 flex items-center gap-2">
          <span className="text-xs font-bold text-orange-800">잔고항목 지정</span>
          <span className="text-[11px] text-orange-500">공급처별로 잔고로 표시할 항목을 지정하세요. 확정표에 주황색으로 표시됩니다.</span>
        </div>
        {knownVendors.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-xs">
            OCR을 실행하면 공급처가 자동으로 등록됩니다.
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-orange-50 border-b border-orange-100">
                <th className="px-4 py-2 text-left font-bold text-orange-900">공급처</th>
                <th className="px-4 py-2 text-left font-bold text-orange-900">잔고 항목</th>
              </tr>
            </thead>
            <tbody>
              {knownVendors.map(vendor => (
                <tr key={vendor} className="border-t border-gray-50 hover:bg-orange-50/30">
                  <td className="px-4 py-2 font-semibold text-gray-700">{vendor}</td>
                  <td className="px-4 py-2">
                    <select
                      className="border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-orange-400 bg-white"
                      value={config[vendor] ?? "(없음)"}
                      onChange={e => onConfigChange(vendor, e.target.value)}
                    >
                      {BALANCE_LABEL_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

interface ConfirmedRecord {
  id: number;
  saved_at: string;
  supplier: string;
  product_name: string;
  product_code: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  amount: number | string | null;
  balance: number | string | null;
  expiry_date: string | null;
  memo: string | null;
  created_at: string;
}

const fmtNum = (v: number | string | null | undefined) => {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("ko-KR");
};
const toNum = (v: number | string | null | undefined): number => {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const ConfirmedRecordsTab: React.FC = () => {
  const [dateFilter, setDateFilter] = React.useState<string>("");
  const [supplierFilter, setSupplierFilter] = React.useState<string>("");
  const [showBalanceOnly, setShowBalanceOnly] = React.useState<boolean>(false);
  const [items, setItems] = React.useState<ConfirmedRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  // 공급처 잔고 히스토리 팝업 상태
  const [balanceHistory, setBalanceHistory] = React.useState<{ supplier: string; items: ConfirmedRecord[] } | null>(null);
  const [balanceHistoryLoading, setBalanceHistoryLoading] = React.useState(false);

  const fetchItems = React.useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = new URLSearchParams();
      if (dateFilter) params.set("date", dateFilter);
      if (supplierFilter.trim()) params.set("supplier", supplierFilter.trim());
      if (showBalanceOnly) params.set("hasBalance", "true");
      const res = await axios.get(`/api/ocr-confirmed-items?${params.toString()}`);
      setItems(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e?.message ?? "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [dateFilter, supplierFilter, showBalanceOnly]);

  const openBalanceHistory = React.useCallback(async (supplier: string) => {
    if (!supplier) return;
    setBalanceHistory({ supplier, items: [] });
    setBalanceHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("supplier", supplier);
      params.set("hasBalance", "true");
      const res = await axios.get(`/api/ocr-confirmed-items?${params.toString()}`);
      const list: ConfirmedRecord[] = Array.isArray(res.data?.items) ? res.data.items : [];
      setBalanceHistory({ supplier, items: list });
    } catch (e: any) {
      // 조회 실패해도 팝업은 유지 (빈 목록)
      setBalanceHistory({ supplier, items: [] });
    } finally {
      setBalanceHistoryLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (id: number) => {
    if (!confirm("이 항목을 삭제하시겠습니까?")) return;
    setDeletingId(id);
    try {
      await axios.delete(`/api/ocr-confirmed-items/${id}`);
      setItems(prev => prev.filter(x => x.id !== id));
    } catch (e: any) {
      alert(e?.response?.data?.error ?? e?.message ?? "삭제 실패");
    } finally {
      setDeletingId(null);
    }
  };

  const supplierOptions = React.useMemo(
    () => [...new Set(items.map(x => x.supplier).filter(Boolean))].sort(),
    [items],
  );
  const grandTotal = items.reduce((s, x) => s + toNum(x.amount), 0);

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-4 py-4 flex flex-col gap-3">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-rose-50 flex items-center gap-2 flex-wrap">
          <FileText size={13} className="text-rose-600" />
          <span className="text-xs font-bold text-rose-800">거래명세서 조회</span>
          <span className="text-[11px] text-rose-500">저장된 확정 항목을 조회·삭제합니다{dateFilter ? "" : " (기본: 최근 30일)"}</span>
          <button
            onClick={fetchItems}
            disabled={loading}
            className="ml-auto p-1 rounded-lg hover:bg-rose-100 cursor-pointer disabled:opacity-40"
            title="새로고침"
          >
            <RefreshCw size={13} className={`text-rose-400 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-2 items-center">
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600">
            날짜
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-rose-400 bg-white"
            />
          </label>
          {dateFilter && (
            <button
              onClick={() => setDateFilter("")}
              className="text-[10px] text-gray-400 hover:text-gray-600 underline cursor-pointer"
            >날짜 해제</button>
          )}
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600">
            공급처
            <input
              type="text"
              list="ocr-conf-supplier-list"
              value={supplierFilter}
              onChange={e => setSupplierFilter(e.target.value)}
              placeholder="공급처명 검색"
              className="border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-rose-400 bg-white min-w-[160px]"
            />
            <datalist id="ocr-conf-supplier-list">
              {supplierOptions.map(s => <option key={s} value={s} />)}
            </datalist>
          </label>
          {supplierFilter && (
            <button
              onClick={() => setSupplierFilter("")}
              className="text-[10px] text-gray-400 hover:text-gray-600 underline cursor-pointer"
            >공급처 해제</button>
          )}
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600 cursor-pointer select-none ml-2">
            <input
              type="checkbox"
              checked={showBalanceOnly}
              onChange={e => setShowBalanceOnly(e.target.checked)}
              className="accent-orange-500"
            />
            <span className={showBalanceOnly ? "text-orange-700" : ""}>잔고만 보기</span>
          </label>
          <span className="ml-auto text-[11px] text-gray-500 font-bold">
            {items.length}건{grandTotal > 0 && <span className="ml-2 text-rose-600">총 {fmtNum(grandTotal)}원</span>}
          </span>
        </div>

        {err && (
          <div className="px-4 py-2 text-[11px] text-rose-700 bg-rose-50 border-b border-rose-100 font-semibold">
            {err}
          </div>
        )}

        {loading && items.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-rose-600 font-bold py-1.5 bg-rose-50 border-b border-rose-200 sticky top-0 z-10">
            <Loader2 size={11} className="animate-spin" /> 새로 불러오는 중...
          </div>
        )}
        {loading && items.length === 0 ? (
          <div className="px-4 py-10 flex items-center justify-center text-gray-400 text-xs gap-2">
            <Loader2 size={14} className="animate-spin" />불러오는 중...
          </div>
        ) : !loading && items.length === 0 ? (
          <div className="px-4 py-10 text-center text-gray-400 text-xs">
            저장된 항목이 없습니다.
          </div>
        ) : (
          <div className={`overflow-x-auto ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-rose-50 border-b border-rose-100">
                  <th className="px-2 py-2 text-left font-bold text-rose-900 whitespace-nowrap">저장일</th>
                  <th className="px-2 py-2 text-left font-bold text-rose-900 whitespace-nowrap">공급처</th>
                  <th className="px-2 py-2 text-left font-bold text-rose-900">품명</th>
                  <th className="px-2 py-2 text-right font-bold text-rose-900 whitespace-nowrap">수량</th>
                  <th className="px-2 py-2 text-right font-bold text-rose-900 whitespace-nowrap">단가</th>
                  <th className="px-2 py-2 text-right font-bold text-rose-900 whitespace-nowrap">금액</th>
                  <th className="px-2 py-2 text-right font-bold text-rose-900 whitespace-nowrap hidden sm:table-cell">잔고</th>
                  <th className="px-2 py-2 text-left font-bold text-rose-900 whitespace-nowrap hidden md:table-cell">유통기한</th>
                  <th className="px-2 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map(x => (
                  <tr key={x.id} className="border-t border-gray-50 hover:bg-rose-50/30">
                    <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap text-[11px]">{x.saved_at}</td>
                    <td className="px-2 py-1.5 text-sky-700 font-semibold whitespace-nowrap text-[11px]">{x.supplier}</td>
                    <td className="px-2 py-1.5 font-semibold text-gray-800">
                      <div className="flex flex-col">
                        <span className="break-words">{x.product_name}</span>
                        {x.product_code && <span className="text-[10px] text-gray-400 font-mono">{x.product_code}</span>}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-700 whitespace-nowrap tabular-nums">{fmtNum(x.quantity)}</td>
                    <td className="px-2 py-1.5 text-right text-gray-700 whitespace-nowrap tabular-nums">{fmtNum(x.unit_price)}</td>
                    <td className="px-2 py-1.5 text-right font-bold text-amber-700 whitespace-nowrap tabular-nums">{fmtNum(x.amount)}</td>
                    <td className="px-2 py-1.5 text-right font-bold text-orange-600 whitespace-nowrap tabular-nums hidden sm:table-cell">
                      {toNum(x.balance) > 0 ? (
                        <button
                          type="button"
                          onClick={() => openBalanceHistory(x.supplier)}
                          className="hover:underline hover:text-orange-800 cursor-pointer"
                          title={`${x.supplier} 잔고 히스토리 보기`}
                        >
                          {fmtNum(x.balance)}
                        </button>
                      ) : fmtNum(x.balance)}
                    </td>
                    <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap text-[10px] hidden md:table-cell">{x.expiry_date ?? ""}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        onClick={() => handleDelete(x.id)}
                        disabled={deletingId === x.id}
                        className="p-1 text-gray-300 hover:text-rose-500 cursor-pointer disabled:opacity-40"
                        title="삭제"
                      >
                        {deletingId === x.id
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Trash2 size={13} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 공급처 잔고 히스토리 모달 ── */}
      {balanceHistory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setBalanceHistory(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-100 bg-orange-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={13} className="text-orange-600 shrink-0" />
                <span className="text-xs font-bold text-orange-800 break-keep">
                  {balanceHistory.supplier} 잔고 히스토리
                </span>
                <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold shrink-0">
                  {balanceHistory.items.length}건
                </span>
              </div>
              <button
                onClick={() => setBalanceHistory(null)}
                className="p-1 rounded-lg hover:bg-orange-100 cursor-pointer shrink-0"
                title="닫기"
              >
                <X size={14} className="text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {balanceHistoryLoading ? (
                <div className="px-4 py-8 flex items-center justify-center text-gray-400 text-xs gap-2">
                  <Loader2 size={13} className="animate-spin" />불러오는 중...
                </div>
              ) : balanceHistory.items.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-400 text-xs">
                  잔고가 기록된 항목이 없습니다.
                </div>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-white">
                    <tr className="bg-orange-50/60 border-b border-orange-100">
                      <th className="px-3 py-2 text-left font-bold text-orange-900 whitespace-nowrap">저장일</th>
                      <th className="px-3 py-2 text-left font-bold text-orange-900">품명</th>
                      <th className="px-3 py-2 text-right font-bold text-orange-900 whitespace-nowrap">잔고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balanceHistory.items.map(it => (
                      <tr key={it.id} className="border-t border-gray-50 hover:bg-orange-50/30">
                        <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap text-[11px]">{it.saved_at}</td>
                        <td className="px-3 py-1.5 font-semibold text-gray-700 text-[11px]">
                          <span className="break-words">{it.product_name}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-bold text-orange-600 whitespace-nowrap tabular-nums text-[11px]">
                          {fmtNum(it.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const OcrPage: React.FC<OcrPageProps> = ({ onBack, authSession, onNavigate, onLogout, embedded = false }) => {
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
  // OCR 엔진 선택 · 2가지
  //   onnx   = PP-OCRv5 한국어 Node ONNX · Render 배포 · 완전 무료 · 셀프호스팅
  //   gemini = Gemini 비전 API · 정확도 최상 · 다중 키 로테이션 · Render 배포
  type OcrEngine = "onnx" | "gemini";
  const [ocrEngine, setOcrEngine] = useState<OcrEngine>(() => {
    try {
      const v = localStorage.getItem("megatown_ocr_engine");
      if (v === "onnx" || v === "gemini") return v;
    } catch { /* ignore */ }
    return "gemini";
  });
  useEffect(() => { try { localStorage.setItem("megatown_ocr_engine", ocrEngine); } catch { /* ignore */ } }, [ocrEngine]);
  const engineToBackend = (e: OcrEngine): string => e;
  // 바코드 매칭 기능 제거됨 (사용자 요청) · 관련 state 유지 안 함
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [pingStatus, setPingStatus] = useState<{ ok: boolean; gemini: boolean; geminiKeyCount: number } | null>(null);
  const [rotation, setRotation] = useState(0);
  const [detectingOrient, setDetectingOrient] = useState(false);

  // Balance config (per-vendor balance field, stored in DB)
  const [balanceConfig, setBalanceConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    axios.get("/api/supplier-balance-configs")
      .then(r => {
        const cfg: Record<string, string> = {};
        for (const row of r.data as { supplier_name: string; balance_field: string }[]) {
          if (row.balance_field) cfg[row.supplier_name] = row.balance_field;
        }
        setBalanceConfig(cfg);
      })
      .catch(() => {});
  }, []);

  const handleSaveConfirmed = useCallback(async (items: ConfirmedItem[]) => {
    const today = new Date().toISOString().slice(0, 10);
    await axios.post("/api/ocr-confirmed-items", { items, saved_at: today });
  }, []);

  const handleBalanceConfigChange = useCallback((vendor: string, label: string) => {
    setBalanceConfig(prev => {
      const next = { ...prev };
      if (label === "(없음)") {
        delete next[vendor];
      } else {
        next[vendor] = label;
      }
      return next;
    });
    axios.put("/api/supplier-balance-configs", { supplier_name: vendor, balance_field: label === "(없음)" ? "" : label })
      .catch(console.error);
  }, []);

  // Tab state
  const [mainTab, setMainTab] = useState<"ocr" | "synonyms" | "balance" | "records">("ocr");

  // Synonym management state
  const [synTab, setSynTab] = useState<"product" | "supplier">("product");
  const [prodListView, setProdListView] = useState<"prodname" | "supplier">("prodname");
  const [productSynonyms, setProductSynonyms] = useState<ProductSynonym[]>([]);
  const [supplierAliases, setSupplierAliases] = useState<SupplierAlias[]>([]);
  const [synLoading, setSynLoading] = useState(false);
  const [addProdOld, setAddProdOld] = useState("");
  const [addProdNew, setAddProdNew] = useState("");
  const [addProdCode, setAddProdCode] = useState("");
  const [addProdSuppNew, setAddProdSuppNew] = useState("");
  const [addProdSuppOld, setAddProdSuppOld] = useState("");
  const [addSuppAlias, setAddSuppAlias] = useState("");
  const [addSuppName, setAddSuppName] = useState("");
  const [synSaving, setSynSaving] = useState(false);
  const [editingProdId, setEditingProdId] = useState<number | null>(null);
  const [editingProd, setEditingProd] = useState<ProdEditState | null>(null);
  const [editingSuppId, setEditingSuppId] = useState<number | null>(null);
  const [editingSupp, setEditingSupp] = useState<SuppEditState | null>(null);
  const [editSaving, setEditSaving] = useState(false);

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
      // 이미지 업로드와 동일한 처리 위해 scale 은 크게 렌더 후 resizeImageForOcr 로 통일
      // (기존 scale 2.0 은 사이즈 캡 없어서 A3 이상 PDF 는 3000px+ 로 나옴)
      const vp = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(`페이지 ${i} Canvas를 초기화할 수 없습니다.`);
      await page.render({ canvasContext: ctx as any, viewport: vp, canvas } as any).promise;
      // 1차 렌더링 → base64 (품질 q95, 이후 resize 에서 손실 최소화)
      const rawDataUrl = canvas.toDataURL("image/jpeg", 0.95);
      const rawB64 = rawDataUrl.split(",")[1];
      // 이미지 업로드 경로와 동일한 resize 파이프라인 (max 2400px · JPEG q92)
      const resized = await resizeImageForOcr(rawB64, "image/jpeg");
      const previewUrl = `data:${resized.mimeType};base64,${resized.data}`;
      setPageImages(prev => [...prev, previewUrl]);
      imgs.push(resized);
    }
    return imgs;
  }, []);

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setError(null); setPages([]); setProcessed(0); setPageCount(0); setStatusMsg("");
    setPageImages([]); setCurrentPageIdx(0);
    // 자동 회전 감지 결과가 도착하기 전까지는 원본 그대로 (0) 표시
    setLoading(true); setRotation(0);
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
    setExtracting(true); setPages([]); setProcessed(0); setError(null);
    setStatusMsg(images.length > 1 ? `${images.length}장 처리 시작...` : "처리 중...");
    try {
      const rotatedImages = rotation === 0
        ? images
        : await Promise.all(images.map(img => physicallyRotate(img.data, img.mimeType, rotation)));

      // ── SSE 스트리밍 (2026-07-19) ─────────────────────────────────────────
      //   1. 서버가 한 페이지 처리할 때마다 즉시 event: page 로 flush
      //   2. 클라이언트는 페이지 도착 즉시 setPages 로 아래로 렌더 추가
      //   3. Gemini/ONNX 모두 서버 내부에서 순차 처리 (기존 병렬은 폐기)
      //      · Gemini 도 순차: 다중키 회전 로직이 요청 스코프이므로 병렬 시 키 경쟁
      //      · ONNX 는 이미 CPU 병목으로 순차였음
      //   SSE 선택 이유는 파일 상단 주석 참조 (Render 프록시 keep-alive 20초 대응)
      const pageErrors: string[] = [];
      const total = rotatedImages.length;

      const res = await fetch("/api/ocr?stream=1", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
        body: JSON.stringify({ images: rotatedImages, engine: engineToBackend(ocrEngine) }),
      });
      if (!res.ok || !res.body) {
        // 서버가 SSE 응답을 시작하기 전 400/500 반환 시 JSON 파싱 시도
        let errMsg = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          errMsg = j?.error ?? errMsg;
        } catch { /* body 가 SSE 이거나 비어 있음 */ }
        throw new Error(errMsg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      let doneFlag = false;

      // SSE 이벤트 파서 · 빈 줄로 구분되는 블록마다 event/data 분리
      const processBlock = (block: string) => {
        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of block.split("\n")) {
          if (!line || line.startsWith(":")) continue;   // comment/keepalive
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length === 0) return;
        let payload: any = null;
        try { payload = JSON.parse(dataLines.join("\n")); } catch { return; }
        if (eventName === "start") {
          setStatusMsg(`0 / ${payload?.total ?? total} 페이지 처리 중...`);
        } else if (eventName === "page") {
          const pg = payload?.page;
          if (pg && typeof pg.page === "number") {
            setPages(prev => {
              // 중복 페이지 번호 방지 (혹시 재전송)
              if (prev.some(p => p.page === pg.page)) return prev.map(p => p.page === pg.page ? pg : p);
              return [...prev, pg as OcrPageResult];
            });
          }
          setProcessed(prev => {
            const next = prev + 1;
            setStatusMsg(`${next} / ${payload?.total ?? total} 페이지 처리 중...`);
            return next;
          });
          if (payload?.error) pageErrors.push(`${(payload?.index ?? 0) + 1}페이지: ${payload.error}`);
        } else if (eventName === "error") {
          const msg = payload?.error ?? "OCR 실패";
          const p = payload?.page ? `${payload.page}페이지: ` : "";
          pageErrors.push(`${p}${msg}`);
        } else if (eventName === "done") {
          doneFlag = true;
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE 이벤트 구분자: 빈 줄 (\n\n)
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          processBlock(block);
        }
        if (doneFlag) break;
      }
      // 잔여 flush
      if (buf.trim()) processBlock(buf);

      if (pageErrors.length > 0) setError(pageErrors.join(" / "));
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "OCR 처리 중 오류가 발생했습니다.");
    } finally {
      setExtracting(false);
      setStatusMsg("");
    }
  }, [extracting, rotation, ocrEngine]);

const handleReparsePage = useCallback(async (pageNum: number, supplierHint: string): Promise<any> => {
  const images = imagesDataRef.current;
  const img = images[pageNum - 1];
  if (!img) return null;
  const rotImg = rotation !== 0 ? await physicallyRotate(img.data, img.mimeType, rotation) : img;
  const res = await axios.post("/api/ocr", {
    images: [rotImg],
    engine: engineToBackend(ocrEngine),
    supplierHints: [supplierHint],
  });
  const newPage = res.data.pages?.[0];
  if (newPage) {
    setPages(prev => prev.map(p => p.page === pageNum ? { ...newPage, page: pageNum } : p));
  }
  return newPage ?? null;
}, [rotation, ocrEngine]);

const rotDeg = ((rotation % 360) + 360) % 360;

const clearFiles = () => {
  setFileName(null); setPages([]); setPageImages([]);
  setCurrentPageIdx(0); imagesDataRef.current = [];
  setPageCount(0); setError(null); setRotation(0);
};

// ─── 동의어 관리 ───────────────────────────────────────────────────────────────

const fetchSynonyms = useCallback(async () => {
  setSynLoading(true);
  try {
    const [synRes, aliasRes] = await Promise.all([
      fetch("/api/ocr-synonyms"),
      fetch("/api/ocr-supplier-aliases"),
    ]);
    const synData = await synRes.json();
    const aliasData = await aliasRes.json();
    setProductSynonyms(synData.synonyms ?? []);
    setSupplierAliases(aliasData.aliases ?? []);
  } finally { setSynLoading(false); }
}, []);

// Load synonyms when switching to the synonyms tab
useEffect(() => { if (mainTab === "synonyms") fetchSynonyms(); }, [mainTab, fetchSynonyms]);

const addProductSynonym = async () => {
  if (!addProdOld.trim() || !addProdCode.trim()) return;
  setSynSaving(true);
  try {
    const res = await fetch("/api/ocr-synonyms", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prod_name_old: addProdOld.trim(), prod_name_new: addProdNew.trim() || null, product_code: addProdCode.trim(), supplier_new: addProdSuppNew.trim() || null, supplier_old: addProdSuppOld.trim() || null }),
    });
    if (res.ok) { setAddProdOld(""); setAddProdNew(""); setAddProdCode(""); setAddProdSuppNew(""); setAddProdSuppOld(""); await fetchSynonyms(); }
  } finally { setSynSaving(false); }
};

const addSupplierAlias = async () => {
  if (!addSuppAlias.trim() || !addSuppName.trim()) return;
  setSynSaving(true);
  try {
    const res = await fetch("/api/ocr-supplier-aliases", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias: addSuppAlias.trim(), supplier_name: addSuppName.trim() }),
    });
    if (res.ok) { setAddSuppAlias(""); setAddSuppName(""); await fetchSynonyms(); }
  } finally { setSynSaving(false); }
};

const deleteProductSynonym = async (id: number) => {
  await fetch(`/api/ocr-synonyms/${id}`, { method: "DELETE" });
  setProductSynonyms(prev => prev.filter(s => s.id !== id));
};

const deleteSupplierAlias = async (id: number) => {
  await fetch(`/api/ocr-supplier-aliases/${id}`, { method: "DELETE" });
  setSupplierAliases(prev => prev.filter(a => a.id !== id));
};

const startEditProd = (s: ProductSynonym) => {
  setEditingProdId(s.id);
  setEditingProd({ prod_name_old: s.prod_name_old, prod_name_new: s.prod_name_new ?? "", product_code: s.product_code, supplier_new: s.supplier_new ?? "", supplier_old: s.supplier_old ?? "" });
};
const cancelEditProd = () => { setEditingProdId(null); setEditingProd(null); };
const saveEditProd = async () => {
  if (!editingProd || !editingProdId || !editingProd.prod_name_old.trim() || !editingProd.product_code.trim()) return;
  setEditSaving(true);
  try {
    const res = await fetch(`/api/ocr-synonyms/${editingProdId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prod_name_old: editingProd.prod_name_old.trim(), prod_name_new: editingProd.prod_name_new.trim() || null, product_code: editingProd.product_code.trim(), supplier_new: editingProd.supplier_new.trim() || null, supplier_old: editingProd.supplier_old.trim() || null }),
    });
    if (res.ok) { const { synonym } = await res.json(); setProductSynonyms(prev => prev.map(s => s.id === editingProdId ? synonym : s)); cancelEditProd(); }
  } finally { setEditSaving(false); }
};

const startEditSupp = (a: SupplierAlias) => { setEditingSuppId(a.id); setEditingSupp({ alias: a.alias, supplier_name: a.supplier_name }); };
const cancelEditSupp = () => { setEditingSuppId(null); setEditingSupp(null); };
const saveEditSupp = async () => {
  if (!editingSupp || !editingSuppId || !editingSupp.alias.trim() || !editingSupp.supplier_name.trim()) return;
  setEditSaving(true);
  try {
    const res = await fetch(`/api/ocr-supplier-aliases/${editingSuppId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias: editingSupp.alias.trim(), supplier_name: editingSupp.supplier_name.trim() }),
    });
    if (res.ok) { const { alias: updated } = await res.json(); setSupplierAliases(prev => prev.map(a => a.id === editingSuppId ? updated : a)); cancelEditSupp(); }
  } finally { setEditSaving(false); }
};

const cellCls = "border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-indigo-400 w-full";
const cellClsSky = "border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-sky-400 w-full";

return (
  <div className={embedded ? "flex-1 flex flex-col min-h-0 bg-gray-50" : "min-h-screen bg-gray-50 flex flex-col"}>
    {/* Shared App Nav Header · 임베드 모드에선 숨김 (부모 페이지의 헤더 사용) */}
    {!embedded && (
      <AppNavHeader
        activePage="ocr"
        authSession={authSession ?? null}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />
    )}

    {/* Tab bar */}
    <div className="bg-white/90 backdrop-blur-sm border-b border-slate-200/70 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-2 overflow-x-auto scrollbar-none">
        <div className="inline-flex bg-slate-100/70 border border-slate-200/60 rounded-2xl p-1 gap-0.5 min-w-max">
          <button
            onClick={() => setMainTab("ocr")}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-black rounded-lg shrink-0 transition-all duration-200 cursor-pointer ${mainTab === "ocr" ? "bg-white text-slate-900 ring-1 ring-slate-200/70 shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-white/50"}`}
          >
            <Upload size={13} className={mainTab === "ocr" ? "text-slate-800" : "text-slate-400"} /> OCR 추출
          </button>
          <button
            onClick={() => setMainTab("synonyms")}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-black rounded-lg shrink-0 transition-all duration-200 cursor-pointer ${mainTab === "synonyms" ? "bg-white text-slate-900 ring-1 ring-slate-200/70 shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-white/50"}`}
          >
            <BookOpen size={13} className={mainTab === "synonyms" ? "text-slate-800" : "text-slate-400"} /> 동의어 관리
          </button>
          <button
            onClick={() => setMainTab("balance")}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-black rounded-lg shrink-0 transition-all duration-200 cursor-pointer ${mainTab === "balance" ? "bg-white text-slate-900 ring-1 ring-slate-200/70 shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-white/50"}`}
          >
            잔고항목 지정
          </button>
          <button
            onClick={() => setMainTab("records")}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-black rounded-lg shrink-0 transition-all duration-200 cursor-pointer ${mainTab === "records" ? "bg-white text-slate-900 ring-1 ring-slate-200/70 shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-white/50"}`}
          >
            <FileText size={13} className={mainTab === "records" ? "text-slate-800" : "text-slate-400"} /> 거래명세서 조회
          </button>
        </div>
      </div>
    </div>

    {mainTab === "records" ? (
      /* ── 거래명세서 조회 탭 ── */
      <ConfirmedRecordsTab />
    ) : mainTab === "balance" ? (
      /* ── 잔고항목 지정 탭 ── */
      <BalanceConfigTab pages={pages} config={balanceConfig} onConfigChange={handleBalanceConfigChange} />
    ) : mainTab === "synonyms" ? (
      /* ── 동의어 관리 탭 ── */
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-4 flex flex-col gap-4">
        {/* 동의어 서브 탭 */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-100/80">
            <div className="inline-flex bg-slate-100/70 border border-slate-200/60 rounded-2xl p-1 gap-0.5">
            <button onClick={() => setSynTab("product")} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-black rounded-lg transition-all duration-200 cursor-pointer ${synTab === "product" ? "bg-white text-slate-900 ring-1 ring-slate-200/70 shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-white/50"}`}>
              <BookOpen size={12} className={synTab === "product" ? "text-slate-800" : "text-slate-400"} /> 상품명 동의어 ({productSynonyms.length})
            </button>
            <button onClick={() => setSynTab("supplier")} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-black rounded-lg transition-all duration-200 cursor-pointer ${synTab === "supplier" ? "bg-white text-slate-900 ring-1 ring-slate-200/70 shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-white/50"}`}>
              <Building2 size={12} className={synTab === "supplier" ? "text-slate-800" : "text-slate-400"} /> 공급사 별칭 ({supplierAliases.length})
            </button>
            </div>
            <button onClick={fetchSynonyms} className="ml-auto p-1.5 self-center rounded-lg hover:bg-gray-100 cursor-pointer">
              <RefreshCw size={13} className={`text-gray-400 ${synLoading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {synTab === "product" ? (
            <div className="p-4 flex flex-col gap-3">
              {/* 추가 폼 */}
              <p className="text-xs font-bold text-indigo-700 flex items-center gap-1.5"><Plus size={12} /> 상품명 동의어 추가</p>
              <div className="grid grid-cols-2 gap-2">
                <input className="col-span-2 border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400 font-mono" placeholder="상품코드 (필수)" value={addProdCode} onChange={e => setAddProdCode(e.target.value)} onKeyDown={e => e.key === "Enter" && addProductSynonym()} />
                <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400" placeholder="상품명(OCR) — 필수" value={addProdOld} onChange={e => setAddProdOld(e.target.value)} />
                <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400" placeholder="상품명(보정후)" value={addProdNew} onChange={e => setAddProdNew(e.target.value)} />
                <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-sky-400" placeholder="공급사명(OCR)" value={addProdSuppOld} onChange={e => setAddProdSuppOld(e.target.value)} />
                <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-sky-400" placeholder="공급사명(보정후)" value={addProdSuppNew} onChange={e => setAddProdSuppNew(e.target.value)} onKeyDown={e => e.key === "Enter" && addProductSynonym()} />
              </div>
              <button onClick={addProductSynonym} disabled={!addProdOld.trim() || !addProdCode.trim() || synSaving} className="self-end px-4 py-1.5 text-xs font-bold bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition disabled:opacity-40 cursor-pointer">추가</button>
            </div>
          ) : (
            <div className="p-4 flex flex-col gap-3">
              <p className="text-xs font-bold text-sky-700 flex items-center gap-1.5"><Plus size={12} /> 공급사 별칭 추가</p>
              <div className="grid grid-cols-2 gap-2">
                <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-sky-400" placeholder="OCR 오인식 공급사명 (필수)" value={addSuppAlias} onChange={e => setAddSuppAlias(e.target.value)} onKeyDown={e => e.key === "Enter" && addSupplierAlias()} />
                <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-sky-400" placeholder="실제 공급사명 (필수)" value={addSuppName} onChange={e => setAddSuppName(e.target.value)} onKeyDown={e => e.key === "Enter" && addSupplierAlias()} />
              </div>
              <button onClick={addSupplierAlias} disabled={!addSuppAlias.trim() || !addSuppName.trim() || synSaving} className="self-end px-4 py-1.5 text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition disabled:opacity-40 cursor-pointer">추가</button>
            </div>
          )}
        </div>

        {/* 리스트 테이블 */}
        {synTab === "product" ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {/* 상품명 / 공급사명 뷰 토글 */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 bg-slate-50">
              <button
                onClick={() => setProdListView("prodname")}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer ${prodListView === "prodname" ? "bg-indigo-100 text-indigo-700" : "text-gray-400 hover:text-gray-700"}`}
              >
                상품명
              </button>
              <button
                onClick={() => setProdListView("supplier")}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer ${prodListView === "supplier" ? "bg-sky-100 text-sky-700" : "text-gray-400 hover:text-gray-700"}`}
              >
                공급사명
              </button>
              <span className="ml-auto text-[11px] text-gray-400">{productSynonyms.length}건</span>
            </div>
            <table className="w-full text-xs border-collapse">
              <thead>
                {prodListView === "prodname" ? (
                  <tr className="bg-indigo-50 border-b border-indigo-100">
                    <th className="px-3 py-2 text-left font-bold text-indigo-800 font-mono w-28">상품코드</th>
                    <th className="px-3 py-2 text-left font-bold text-indigo-800">상품명(OCR)</th>
                    <th className="px-3 py-2 text-left font-bold text-indigo-800">상품명(보정후)</th>
                    <th className="px-2 py-2 w-14" />
                  </tr>
                ) : (
                  <tr className="bg-sky-50 border-b border-sky-100">
                    <th className="px-3 py-2 text-left font-bold text-sky-800 font-mono w-28">상품코드</th>
                    <th className="px-3 py-2 text-left font-bold text-sky-800">공급사명(OCR)</th>
                    <th className="px-3 py-2 text-left font-bold text-sky-800">공급사명(보정후)</th>
                    <th className="px-2 py-2 w-14" />
                  </tr>
                )}
              </thead>
              <tbody>
                {productSynonyms.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">{synLoading ? "불러오는 중..." : "등록된 상품명 동의어 없음"}</td></tr>
                )}
                {productSynonyms.map(s => {
                  const isEditing = editingProdId === s.id && editingProd;
                  return (
                    <tr key={s.id} className={`border-t border-gray-50 ${isEditing ? "bg-indigo-50/40" : "hover:bg-gray-50"}`}>
                      {isEditing ? (
                        prodListView === "prodname" ? (
                          <>
                            <td className="px-2 py-1.5"><input className={`${cellCls} font-mono`} value={editingProd.product_code} onChange={e => setEditingProd(p => p && ({ ...p, product_code: e.target.value }))} /></td>
                            <td className="px-2 py-1.5"><input className={cellCls} value={editingProd.prod_name_old} onChange={e => setEditingProd(p => p && ({ ...p, prod_name_old: e.target.value }))} /></td>
                            <td className="px-2 py-1.5"><input className={cellCls} value={editingProd.prod_name_new} onChange={e => setEditingProd(p => p && ({ ...p, prod_name_new: e.target.value }))} placeholder="(없음)" /></td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1">
                                <button onClick={saveEditProd} disabled={editSaving || !editingProd.prod_name_old.trim() || !editingProd.product_code.trim()} className="p-1 text-indigo-500 hover:text-indigo-700 cursor-pointer disabled:opacity-40"><Check size={13} /></button>
                                <button onClick={cancelEditProd} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"><X size={13} /></button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-2 py-1.5"><input className={`${cellClsSky} font-mono`} value={editingProd.product_code} onChange={e => setEditingProd(p => p && ({ ...p, product_code: e.target.value }))} /></td>
                            <td className="px-2 py-1.5"><input className={cellClsSky} value={editingProd.supplier_old} onChange={e => setEditingProd(p => p && ({ ...p, supplier_old: e.target.value }))} placeholder="(없음)" /></td>
                            <td className="px-2 py-1.5"><input className={cellClsSky} value={editingProd.supplier_new} onChange={e => setEditingProd(p => p && ({ ...p, supplier_new: e.target.value }))} placeholder="(없음)" /></td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1">
                                <button onClick={saveEditProd} disabled={editSaving || !editingProd.prod_name_old.trim() || !editingProd.product_code.trim()} className="p-1 text-sky-500 hover:text-sky-700 cursor-pointer disabled:opacity-40"><Check size={13} /></button>
                                <button onClick={cancelEditProd} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"><X size={13} /></button>
                              </div>
                            </td>
                          </>
                        )
                      ) : prodListView === "prodname" ? (
                        <>
                          <td className="px-3 py-2.5 text-gray-500 font-mono text-[11px] leading-snug">{s.product_code}</td>
                          <td className="px-3 py-2.5 font-semibold text-gray-700 leading-snug">{s.prod_name_old}</td>
                          <td className="px-3 py-2.5 text-indigo-700 leading-snug">{s.prod_name_new ?? <span className="text-gray-300">—</span>}</td>
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-0.5">
                              <button onClick={() => startEditProd(s)} className="p-1 text-gray-300 hover:text-indigo-500 cursor-pointer"><Pencil size={13} /></button>
                              <button onClick={() => deleteProductSynonym(s.id)} className="p-1 text-gray-300 hover:text-rose-500 cursor-pointer"><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2.5 text-gray-500 font-mono text-[11px] leading-snug">{s.product_code}</td>
                          <td className="px-3 py-2.5 text-gray-500 leading-snug">{s.supplier_old ?? <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-sky-700 font-semibold leading-snug">{s.supplier_new ?? <span className="text-gray-300">—</span>}</td>
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-0.5">
                              <button onClick={() => startEditProd(s)} className="p-1 text-gray-300 hover:text-sky-500 cursor-pointer"><Pencil size={13} /></button>
                              <button onClick={() => deleteProductSynonym(s.id)} className="p-1 text-gray-300 hover:text-rose-500 cursor-pointer"><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-sky-50 border-b border-sky-100">
                  <th className="px-3 py-2 text-left font-bold text-sky-800">OCR 공급사명 (별칭)</th>
                  <th className="px-3 py-2 text-left font-bold text-sky-800">실제 공급사명</th>
                  <th className="px-3 py-2 text-left font-bold text-sky-800 text-[11px]">등록일</th>
                  <th className="px-2 py-2 w-16" />
                </tr>
              </thead>
              <tbody>
                {supplierAliases.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">{synLoading ? "불러오는 중..." : "등록된 공급사 별칭 없음"}</td></tr>}
                {supplierAliases.map(a => {
                  const isEditing = editingSuppId === a.id && editingSupp;
                  return (
                    <tr key={a.id} className={`border-t border-gray-50 ${isEditing ? "bg-sky-50/40" : "hover:bg-gray-50"}`}>
                      {isEditing ? (
                        <>
                          <td className="px-2 py-1.5"><input className={cellClsSky} value={editingSupp.alias} onChange={e => setEditingSupp(p => p && ({ ...p, alias: e.target.value }))} /></td>
                          <td className="px-2 py-1.5"><input className={cellClsSky} value={editingSupp.supplier_name} onChange={e => setEditingSupp(p => p && ({ ...p, supplier_name: e.target.value }))} /></td>
                          <td className="px-2 py-1.5 text-gray-400">{new Date(a.created_at).toLocaleDateString("ko-KR")}</td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <button onClick={saveEditSupp} disabled={editSaving || !editingSupp.alias.trim() || !editingSupp.supplier_name.trim()} className="p-1 text-sky-500 hover:text-sky-700 cursor-pointer disabled:opacity-40"><Check size={13} /></button>
                              <button onClick={cancelEditSupp} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"><X size={13} /></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 font-semibold text-gray-700">{a.alias}</td>
                          <td className="px-3 py-2 text-sky-700 font-bold">{a.supplier_name}</td>
                          <td className="px-3 py-2 text-gray-400 text-[11px]">{new Date(a.created_at).toLocaleDateString("ko-KR")}</td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-0.5">
                              <button onClick={() => startEditSupp(a)} className="p-1 text-gray-300 hover:text-sky-500 cursor-pointer"><Pencil size={13} /></button>
                              <button onClick={() => deleteSupplierAlias(a.id)} className="p-1 text-gray-300 hover:text-rose-500 cursor-pointer"><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    ) : (
    /* ── OCR 추출 탭 ── */
    <div className="flex-1 flex flex-col px-4 py-6 gap-5 max-w-none w-full">

      {/* 파일 업로드 + 이미지 뷰어 */}
      <div className="w-full bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

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
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Upload size={13} className="text-amber-500" />
              <span className="text-xs font-semibold text-amber-700 break-all">{fileName}</span>
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

          {/* OCR 엔진 선택 · 2-way (AI 모델 · Gemini) */}
          <div className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 flex flex-col gap-1.5 shadow-sm">
            <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-600">
              <span>OCR 엔진</span>
              <span className="text-[10px] font-mono text-slate-400">
                ({ocrEngine === "onnx" ? "AI 모델 (ONNX) · 완전 무료 · Render OK"
                  : "Gemini · 정확도 최상"})
              </span>
            </div>
            <div className="inline-flex bg-slate-100 border border-slate-200 rounded-lg p-0.5 gap-0.5 w-full">
              <button type="button" onClick={() => setOcrEngine("onnx")}
                disabled={extracting}
                className={`flex-1 px-2 py-1.5 text-[11px] font-black rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed ${
                  ocrEngine === "onnx"
                    ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white"
                }`}
                title="PP-OCRv5 한국어 AI 모델 (ONNX · ppu-paddle-ocr) · 완전 무료 · Render 배포 · 셀프호스팅">
                🤖 AI 모델
              </button>
              <button type="button" onClick={() => setOcrEngine("gemini")}
                disabled={extracting}
                className={`flex-1 px-2 py-1.5 text-[11px] font-black rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed ${
                  ocrEngine === "gemini"
                    ? "bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white"
                }`}
                title="Gemini 비전 API · 정확도 최상 · 다중 키 로테이션">
                ⚡ Gemini
              </button>
            </div>
            {ocrEngine === "onnx" && (
              <p className="text-[10px] text-emerald-600 leading-tight">
                🤖 AI 모델 (PP-OCRv5 한국어 ONNX) · 첫 요청 시 모델 초기화 5~10초 · <b>Render 배포 무료</b> · Apache 2.0
              </p>
            )}
            {ocrEngine === "gemini" && (
              <p className="text-[10px] text-amber-600 leading-tight">
                ⚡ Gemini · 표 구조 인식 최상 · 다중 키 로테이션 (GEMINI_API_KEY_1/2/3...) · quota 시 자동 전환
              </p>
            )}
          </div>

          <button onClick={handleExtract} disabled={extracting}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer shadow-sm ${
              ocrEngine === "onnx" ? "bg-emerald-500 hover:bg-emerald-600"
              : "bg-amber-500 hover:bg-amber-600"
            }`}>
            {extracting
              ? <><Loader2 size={15} className="animate-spin" />{statusMsg || `OCR 추출 중... (${processed}/${pageCount || "?"})`}</>
              : <><Zap size={15} />OCR 추출 ({ocrEngine === "onnx" ? "AI 모델" : "Gemini"}){rotDeg !== 0 ? ` · ${rotDeg}° 회전` : ""}</>}
          </button>
        </>
      )}

      {extracting && pageCount > 0 && (
        <div className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
          <div className="w-full bg-slate-100 rounded-full h-1.5">
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

      {pages.length > 0 && <RawOcrTable pages={pages} pageImages={pageImages} rotation={rotation} onReparsePage={handleReparsePage} balanceConfig={balanceConfig} onSaveConfirmed={handleSaveConfirmed} />}
    </div>
    )}
  </div>
);
};
