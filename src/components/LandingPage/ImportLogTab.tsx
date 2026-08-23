// src/components/LandingPage/ImportLogTab.tsx
// 2026-08-23 · Framework Phase 4 · UploadDataModal 에서 분리
import React, { useMemo } from "react";
import { Card } from "../common/Card";

type UnifiedLogEntry =
  | { kind: "products"; timestamp: string; count: number }
  | {
    kind: "stock";
    timestamp: string;
    count: number;
    total?: number;
    history?: number;
    snapshot_date?: string;
    start_date?: string | null;
    period_type?: "early" | "mid" | "late" | null;
  }
  | {
    kind: "purchase";
    timestamp: string;
    count: number;
    startDate: string;
    endDate: string;
    periodStart: string | null;
    periodType: string | null;
  };

interface ImportLogTabProps {
  importLog: { timestamp: string; count: number }[];
  stockImportLog: {
    timestamp: string;
    count: number;
    total?: number;
    history?: number;
    snapshot_date?: string;
    start_date?: string | null;
    period_type?: "early" | "mid" | "late" | null;
  }[];
  purchaseImportBatches: Array<{
    imported_at: string;
    count: number;
    startDate: string;
    endDate: string;
    periodStart: string | null;
    periodType: string | null;
  }>;
  logFilter: {
    type: "all" | "products" | "stock" | "purchase" | "vendors";
    from: string;
    to: string;
    search: string;
  };
  setLogFilter: React.Dispatch<React.SetStateAction<{
    type: "all" | "products" | "stock" | "purchase" | "vendors";
    from: string;
    to: string;
    search: string;
  }>>;
}

export const ImportLogTab: React.FC<ImportLogTabProps> = ({
  importLog,
  stockImportLog,
  purchaseImportBatches,
  logFilter,
  setLogFilter,
}) => {
  const allImportLogs = useMemo<UnifiedLogEntry[]>(() => {
    const p: UnifiedLogEntry[] = importLog.map(e => ({ kind: "products", timestamp: e.timestamp, count: e.count }));
    const s: UnifiedLogEntry[] = stockImportLog.map(e => ({
      kind: "stock",
      timestamp: e.timestamp,
      count: e.count,
      total: e.total,
      history: e.history,
      snapshot_date: e.snapshot_date,
      start_date: e.start_date,
      period_type: e.period_type,
    }));
    const pu: UnifiedLogEntry[] = purchaseImportBatches.map(b => ({
      kind: "purchase",
      timestamp: b.imported_at,
      count: b.count,
      startDate: b.startDate,
      endDate: b.endDate,
      periodStart: b.periodStart,
      periodType: b.periodType,
    }));
    return [...p, ...s, ...pu].sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
  }, [importLog, stockImportLog, purchaseImportBatches]);

  const filtered = useMemo(() => allImportLogs.filter(entry => {
    if (logFilter.type !== "all" && entry.kind !== logFilter.type) return false;
    const dayPart = (entry.timestamp || "").slice(0, 10);
    if (logFilter.from && dayPart && dayPart < logFilter.from) return false;
    if (logFilter.to && dayPart && dayPart > logFilter.to) return false;
    if (logFilter.search.trim()) {
      const q = logFilter.search.trim().toLowerCase();
      const haystack: string[] = [entry.timestamp || ""];
      if (entry.kind === "stock") {
        if (entry.start_date) haystack.push(entry.start_date);
        if (entry.snapshot_date) haystack.push(entry.snapshot_date);
      } else if (entry.kind === "purchase") {
        haystack.push(entry.startDate, entry.endDate, entry.periodStart ?? "");
      }
      if (!haystack.join("|").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [allImportLogs, logFilter]);

  return (
    <>
      <p className="text-xs text-gray-500 mb-2 leading-relaxed">
        상품 · 재고 · 매입 · 공급사 임포트 이력을 시간순으로 통합 표시합니다.
      </p>
      {stockImportLog.some(e => !e.start_date) && (
        <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mb-3">
          ℹ️ 시작재고일 저장 기능 이전에 임포트된 이력은 종료일만 표시됩니다. 이후 임포트부터는 <b>시작재고일 ~ 종료재고일</b> 이 함께 표시됩니다.
        </div>
      )}
      <Card variant="flat" bg="bg-zinc-50" padding="none" rounded="xl" className="flex flex-col gap-2 mb-3 p-2.5">
        <div className="flex flex-wrap items-center gap-1">
          {([
            { k: "all", label: "전체", cls: "text-zinc-700 border-zinc-300" },
            { k: "products", label: "상품", cls: "text-orange-700 border-orange-300" },
            { k: "stock", label: "재고", cls: "text-indigo-700 border-indigo-300" },
            { k: "purchase", label: "매입", cls: "text-sky-700 border-sky-300" },
            { k: "vendors", label: "공급사", cls: "text-teal-700 border-teal-300" },
          ] as const).map(t => (
            <button key={t.k} type="button" onClick={() => setLogFilter(f => ({ ...f, type: t.k }))}
              className={`text-[10px] font-bold rounded-full px-2 py-0.5 border transition cursor-pointer ${logFilter.type === t.k ? `${t.cls} bg-white shadow-sm` : "text-zinc-400 border-line bg-white/60 hover:bg-white"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <input type="date" value={logFilter.from} onChange={e => setLogFilter(f => ({ ...f, from: e.target.value }))}
            className="text-[11px] font-mono border border-line rounded-lg px-2 py-1 bg-white text-zinc-700" title="시작일" />
          <span className="text-[10px] text-zinc-400">~</span>
          <input type="date" value={logFilter.to} onChange={e => setLogFilter(f => ({ ...f, to: e.target.value }))}
            className="text-[11px] font-mono border border-line rounded-lg px-2 py-1 bg-white text-zinc-700" title="종료일" />
          <input type="text" placeholder="검색 (기간·파일명)" value={logFilter.search} onChange={e => setLogFilter(f => ({ ...f, search: e.target.value }))}
            className="flex-1 min-w-[100px] text-[11px] border border-line rounded-lg px-2 py-1 bg-white text-zinc-700 placeholder:text-zinc-300" />
          {(logFilter.type !== "all" || logFilter.from || logFilter.to || logFilter.search) && (
            <button type="button" onClick={() => setLogFilter({ type: "all", from: "", to: "", search: "" })}
              className="text-[10px] text-zinc-400 hover:text-zinc-700 font-bold cursor-pointer">초기화</button>
          )}
        </div>
      </Card>
      {allImportLogs.length === 0
        ? <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2"><p className="text-sm">임포트 이력이 없습니다</p></div>
        : filtered.length === 0
        ? <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2"><p className="text-sm">필터 조건에 맞는 이력이 없습니다</p></div>
        : (
          <>
            <div className="text-[10px] text-zinc-400 mb-1.5 px-1"><b className="text-zinc-600">{filtered.length}</b> / {allImportLogs.length} 건</div>
            <Card variant="flat" padding="none" rounded="xl" clip className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-line bg-gray-50/70">
                    <th className="text-left py-2 pl-4 pr-3 font-bold w-14">유형</th>
                    <th className="text-left py-2 pr-3 font-bold">시작일</th>
                    <th className="text-left py-2 pr-3 font-bold">종료일</th>
                    <th className="text-right py-2 pr-3 font-bold">임포트 시간</th>
                    <th className="text-right py-2 pr-4 font-bold">갯수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((entry, i) => {
                    const whenDate = new Date(entry.timestamp);
                    const when = isNaN(whenDate.getTime()) ? entry.timestamp : whenDate.toLocaleString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
                    if (entry.kind === "products") return (
                      <tr key={`p-${i}`} className="hover:bg-orange-50/40 transition">
                        <td className="py-1.5 pl-4 pr-3"><span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 border text-orange-700 bg-white border-orange-300">상품</span></td>
                        <td className="py-1.5 pr-3 text-gray-300">—</td>
                        <td className="py-1.5 pr-3 text-gray-300">—</td>
                        <td className="py-1.5 pr-3 text-right text-gray-500 font-mono">{when}</td>
                        <td className="py-1.5 pr-4 text-right font-semibold text-orange-600">{entry.count.toLocaleString()}개</td>
                      </tr>
                    );
                    if (entry.kind === "stock") {
                      const stored = entry.history ?? entry.count;
                      return (
                        <tr key={`s-${i}`} className="hover:bg-indigo-50/40 transition">
                          <td className="py-1.5 pl-4 pr-3"><span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 border text-indigo-700 bg-white border-indigo-300">재고</span></td>
                          <td className="py-1.5 pr-3 text-sky-700 font-mono font-bold" title={entry.start_date ?? "미입력"}>{entry.start_date ?? <span className="text-gray-300">—</span>}</td>
                          <td className="py-1.5 pr-3 text-emerald-700 font-mono font-bold" title={entry.snapshot_date ?? "미입력"}>{entry.snapshot_date ?? <span className="text-gray-300">—</span>}</td>
                          <td className="py-1.5 pr-3 text-right text-gray-500 font-mono">{when}</td>
                          <td className="py-1.5 pr-4 text-right font-semibold text-indigo-600">{stored.toLocaleString()}개{entry.total && entry.total !== stored && <span className="text-gray-300"> / {entry.total.toLocaleString()}</span>}</td>
                        </tr>
                      );
                    }
                    const periodLabel = entry.periodType === "early" ? "초순" : entry.periodType === "mid" ? "중순" : entry.periodType === "late" ? "하순" : null;
                    const startDisp = entry.periodStart ?? entry.startDate;
                    return (
                      <tr key={`pu-${i}`} className="hover:bg-sky-50/40 transition">
                        <td className="py-1.5 pl-4 pr-3"><span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 border text-sky-700 bg-white border-sky-300">매입</span></td>
                        <td className="py-1.5 pr-3 text-sky-700 font-mono font-bold" title={startDisp}>{startDisp || <span className="text-gray-300">—</span>}</td>
                        <td className="py-1.5 pr-3 text-emerald-700 font-mono font-bold" title={entry.endDate}>
                          {entry.endDate || <span className="text-gray-300">—</span>}
                          {periodLabel && <span className="ml-1 text-[9px] font-bold px-1 py-0.5 rounded-full border text-purple-700 bg-purple-50 border-purple-200">{periodLabel}</span>}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-gray-500 font-mono">{when}</td>
                        <td className="py-1.5 pr-4 text-right font-semibold text-sky-600">{entry.count.toLocaleString()}건</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </>
        )
      }
    </>
  );
};
