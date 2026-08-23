// src/components/LandingPage/StockUploadTab.tsx
// 2026-08-23 · Framework Phase 4 · UploadDataModal 에서 분리
import React, { useRef } from "react";
import { Upload } from "lucide-react";
import { CheckCircle } from "@phosphor-icons/react";
import { useToast } from "../../hooks/useToast";
import { StatusPill } from "../common/StatusPill";
import { PeriodCoverageWidget } from "./PeriodCoverageWidget";

interface StockImportLogEntry {
  timestamp: string;
  count: number;
  total?: number;
  history?: number;
  snapshot_date?: string;
  start_date?: string | null;
  period_type?: "early" | "mid" | "late" | null;
}

interface StockUploadTabProps {
  stockUploadFile: File | null;
  setStockUploadFile: (f: File | null) => void;
  stockUploadLoading: boolean;
  stockUploadResult: { ok: boolean; updated?: number; total?: number; history?: number; snapshot_date?: string; msg?: string } | null;
  setStockUploadResult: (r: { ok: boolean; updated?: number; total?: number; history?: number; snapshot_date?: string; msg?: string } | null) => void;
  stockImportLog: StockImportLogEntry[];
  stockStartDate: string;
  setStockStartDate: (d: string) => void;
  stockEndDate: string;
  setStockEndDate: (d: string) => void;
  stockPeriodType: "early" | "mid" | "late" | null;
  handleStockUpload: () => Promise<void>;
  handleClearStockImportLog: () => Promise<void>;
}

const shortDate = (d?: string | null): string | null => {
  if (!d) return null;
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${Number(m[1])}/${Number(m[2])}` : null;
};

export const StockUploadTab: React.FC<StockUploadTabProps> = ({
  stockUploadFile,
  setStockUploadFile,
  stockUploadLoading,
  stockUploadResult,
  setStockUploadResult,
  stockImportLog,
  stockStartDate,
  setStockStartDate,
  stockEndDate,
  setStockEndDate,
  stockPeriodType,
  handleStockUpload,
  handleClearStockImportLog,
}) => {
  const { showError } = useToast();
  const stockUploadInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) { setStockUploadFile(null); return; }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "xlsx" && ext !== "xls") {
      showError("xlsx 또는 xls 파일만 가능합니다.");
      e.target.value = ""; return;
    }
    setStockUploadResult(null);
    setStockUploadFile(file);
    try {
      const stem = file.name.replace(/\.(xlsx|xls)$/i, "");
      const two = (s: string) => s.padStart(2, "0");
      let m: RegExpMatchArray | null = stem.match(/(\d{4})[-_](\d{2})(\d{2})[-_](\d{2})(\d{2})/);
      if (!m) m = stem.match(/(\d{4})[-_](\d{2})[-_.](\d{2})[-_](\d{2})[-_.](\d{2})/);
      if (!m) {
        const alt = stem.match(/(\d{4})(\d{2})(\d{2})[-_](\d{4})(\d{2})(\d{2})/);
        if (alt) {
          const [, y1, m1, d1, y2, m2, d2] = alt;
          setStockStartDate(`${y1}-${two(m1)}-${two(d1)}`);
          setStockEndDate(`${y2}-${two(m2)}-${two(d2)}`);
          return;
        }
      }
      if (m) {
        const [, yyyy, sMM, sDD, eMM, eDD] = m;
        setStockStartDate(`${yyyy}-${two(sMM)}-${two(sDD)}`);
        setStockEndDate(`${yyyy}-${two(eMM)}-${two(eDD)}`);
      }
    } catch { /* 파싱 실패 시 무시 */ }
  };

  return (
    <>
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        재고현황 xlsx (초순/중순/하순 스냅샷)를 <strong>stock_history</strong> 테이블에 임포트합니다.<br />
        <span className="text-gray-400">같은 날짜+상품코드는 덮어쓰기. 매칭되는 상품 정보(공급사·규격 등)도 함께 저장.</span>
      </p>
      <PeriodCoverageWidget endpoint="/api/stock-manage/period-coverage" label="재고 스냅샷 커버리지" color="indigo" refreshTrigger={stockUploadResult} />
      {stockUploadResult?.ok ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <CheckCircle size={36} className="text-emerald-500" weight="fill" />
          <p className="text-sm font-bold text-emerald-700">임포트 완료</p>
          <p className="text-sm text-gray-700">
            <span className="font-bold text-emerald-700">{(stockUploadResult.history ?? 0).toLocaleString()}</span>
            <span className="text-gray-500 mx-1">/</span>
            <span className="font-bold">{(stockUploadResult.total ?? 0).toLocaleString()}</span>
            건 스냅샷 저장됨
          </p>
          {stockUploadResult.snapshot_date && (
            <p className="text-[11px] text-gray-500">스냅샷일: <span className="font-mono font-bold text-gray-700">{stockUploadResult.snapshot_date}</span></p>
          )}
          {(stockUploadResult.history ?? 0) < (stockUploadResult.total ?? 0) && (
            <p className="text-[10px] text-amber-600">일부 행 저장 실패 (서버 로그 확인 필요)</p>
          )}
          <button onClick={() => { setStockUploadResult(null); setStockUploadFile(null); }} className="mt-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer">확인</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-[11px] font-bold text-gray-500 mb-1.5">재고 기간 (필수)</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-gray-500">시작재고일</span>
                <input type="date" value={stockStartDate} onChange={(e) => setStockStartDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs font-mono border-2 border-line rounded-lg focus:outline-none focus:border-brand-deep" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-gray-500">종료재고일</span>
                <input type="date" value={stockEndDate} onChange={(e) => setStockEndDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs font-mono border-2 border-line rounded-lg focus:outline-none focus:border-brand-deep" />
              </label>
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap text-[10px]">
              {stockPeriodType ? (
                <StatusPill tone={stockPeriodType === "early" ? "sky" : stockPeriodType === "mid" ? "indigo" : "violet"} size="xs">
                  자동판정: {stockPeriodType === "early" ? "초순 (1-10일)" : stockPeriodType === "mid" ? "중순 (11-20일)" : "하순 (21-말일)"}
                </StatusPill>
              ) : (
                <span className="text-gray-400">종료일 입력 시 초/중/하순 자동 판정</span>
              )}
              {stockStartDate && stockEndDate && stockStartDate > stockEndDate && (
                <span className="text-rose-600 font-bold">⚠ 시작일이 종료일보다 뒤</span>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">예: 6월 초순 스냅샷 → 시작재고일 2026-06-01 · 종료재고일 2026-06-10</p>
          </div>
          <input ref={stockUploadInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
          <button type="button" onClick={() => stockUploadInputRef.current?.click()}
            className="w-full py-3 border-2 border-dashed border-gray-300 hover:border-indigo-400 text-gray-500 hover:text-indigo-600 text-sm font-semibold rounded-xl transition cursor-pointer flex items-center justify-center gap-2">
            <Upload size={16} />
            {stockUploadFile ? stockUploadFile.name : "파일 선택 (.xlsx)"}
          </button>
          {stockUploadResult?.ok === false && (
            <p className="text-xs text-rose-500 font-semibold text-center">{stockUploadResult.msg}</p>
          )}
          <button type="button"
            disabled={!stockUploadFile || stockUploadLoading || !stockStartDate || !stockEndDate || !stockPeriodType || stockStartDate > stockEndDate}
            onClick={handleStockUpload}
            className="w-full py-3 bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:bg-indigo-200 disabled:cursor-not-allowed text-white font-bold rounded-xl transition cursor-pointer text-sm flex items-center justify-center gap-2">
            {stockUploadLoading
              ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" /><span>임포트 중...</span></>
              : <><Upload size={14} /><span>재고 임포트</span></>}
          </button>
        </div>
      )}
      {stockImportLog.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">재고 임포트 이력</p>
            <button onClick={handleClearStockImportLog} className="text-[10px] text-gray-400 hover:text-rose-500 transition cursor-pointer">clear</button>
          </div>
          <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto">
            {stockImportLog.map((entry, i) => {
              const periodLabel = entry.period_type === "early" ? "초순" : entry.period_type === "mid" ? "중순" : entry.period_type === "late" ? "하순" : null;
              const rangeLabel = entry.start_date && entry.snapshot_date
                ? `${shortDate(entry.start_date)} ~ ${shortDate(entry.snapshot_date)}`
                : entry.snapshot_date ? `~ ${shortDate(entry.snapshot_date)}` : null;
              const periodChipClass = entry.period_type === "early"
                ? "text-sky-700 bg-sky-50 border-sky-200"
                : entry.period_type === "mid"
                  ? "text-indigo-700 bg-indigo-50 border-indigo-200"
                  : "text-purple-700 bg-purple-50 border-purple-200";
              const stored = entry.history ?? entry.count;
              return (
                <div key={i} className="flex items-center justify-between gap-2 text-[11px] py-0.5">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="text-gray-500 font-mono shrink-0">
                      {new Date(entry.timestamp).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {rangeLabel && <span className="text-emerald-700 font-mono font-bold shrink-0" title={entry.start_date && entry.snapshot_date ? `재고기간 ${entry.start_date} ~ ${entry.snapshot_date}` : `스냅샷일 ${entry.snapshot_date}`}>{rangeLabel}</span>}
                    {periodLabel && <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 border shrink-0 ${periodChipClass}`}>{periodLabel}</span>}
                  </div>
                  <span className={`font-semibold shrink-0 ${i === 0 ? "text-indigo-600" : "text-gray-400"}`}>
                    {stored.toLocaleString()}개
                    {entry.total && entry.total !== stored && <span className="text-gray-300"> / {entry.total.toLocaleString()}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};
