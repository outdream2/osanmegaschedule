// apps/sync-agent/src/renderer/src/components/ErpQueryView.tsx
// 2026-10-03 · PHASE 1 · ERP 조회 공통 뷰 (3 탭 재사용)
//   · fetch · 상태 chip · pagination · 검색 · row 상세 modal
//   · API 와 표시 column 만 props 로 받음 · 각 탭 독립 state

import React, { useEffect, useMemo, useState } from "react";

export type Row = Record<string, unknown>;

export type ErpQueryResult =
  | {
      ok: true;
      rowCount: number;
      columns: string[];
      rows: Row[];
      meta: { soapMs: number; decoderMs: number; totalMs: number; queriedAt: string };
    }
  | { ok: false; stage: string; error: string };

export interface ColumnSpec {
  erp: string; // ERP response field 이름
  label: string;
  align?: "right";
}

interface Props {
  /** 탭 식별자 (로그용) */
  name: string;
  /** 조회 버튼 라벨 */
  queryLabel: string;
  /** 조회 함수 · ipc wrapper · 예: window.api.erpProductList */
  queryFn: () => Promise<ErpQueryResult>;
  /** 테이블 컬럼 정의 (대표 7-8개) */
  displayCols: ColumnSpec[];
  /** 검색 field 리스트 (ERP field 이름) */
  searchFields: string[];
  /** row 식별자 field (상세 modal title · pcode 등) */
  idField?: string;
  /** 상세 modal 부제목 field (상품명 등) */
  subtitleField?: string;
  /** 조회 조건 영역 (날짜 입력 등) · 선택 */
  conditionsSlot?: React.ReactNode;
  /** 검색 placeholder */
  searchPlaceholder?: string;
}

const PAGE_SIZE_OPTIONS = [50, 100, 200] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

type ChipState = "idle" | "running" | "ok" | "fail" | "notRun";

function statusChip(label: string, state: ChipState, detail?: string) {
  const cls =
    state === "ok"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : state === "fail"
        ? "bg-rose-50 border-rose-200 text-rose-700"
        : state === "running"
          ? "bg-amber-50 border-amber-200 text-amber-700"
          : state === "notRun"
            ? "bg-zinc-50 border-zinc-200 text-zinc-400"
            : "bg-zinc-50 border-zinc-200 text-zinc-500";
  const text =
    state === "ok" ? "성공" : state === "fail" ? "실패" : state === "running" ? "진행 중" : state === "notRun" ? "미실행" : "대기";
  return (
    <div className={`border rounded-lg px-3 py-2 text-[13px] ${cls}`}>
      <div className="font-semibold">{label}</div>
      <div className="text-[12px]">{text}</div>
      {detail && <div className="text-[11px] text-zinc-500 mt-0.5">{detail}</div>}
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function formatNumber(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return formatValue(v);
  return n.toLocaleString("ko-KR");
}

export const ErpQueryView: React.FC<Props> = ({
  name,
  queryLabel,
  queryFn,
  displayCols,
  searchFields,
  idField = "PCode",
  subtitleField = "ProductName",
  conditionsSlot,
  searchPlaceholder = "검색 (전체 데이터 대상)",
}) => {
  const [state, setState] = useState<"idle" | "running" | "ok" | "fail">("idle");
  const [result, setResult] = useState<ErpQueryResult | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);

  const run = async () => {
    setState("running");
    setResult(null);
    setSelected(null);
    try {
      const r = await queryFn();
      setResult(r);
      setState(r.ok ? "ok" : "fail");
    } catch (err: any) {
      console.error(`[${name}] queryFn 예외:`, err);
      setResult({ ok: false, stage: "config", error: err?.message ?? String(err) });
      setState("fail");
    }
  };

  const filtered = useMemo(() => {
    if (!result?.ok) return [];
    const q = query.trim().toLowerCase();
    if (!q) return result.rows;
    return result.rows.filter((r) =>
      searchFields.some((f) => String(r[f] ?? "").toLowerCase().includes(q)),
    );
  }, [result, query, searchFields]);

  useEffect(() => {
    setPage(1);
  }, [query, pageSize, result]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, filtered.length);
  const visible = filtered.slice(startIdx, endIdx);

  // chip 상태 매핑
  let connState: ChipState = "idle";
  let soapState: ChipState = "idle";
  let decoderState: ChipState = "idle";
  if (state === "running") {
    connState = "running";
    soapState = "running";
    decoderState = "running";
  } else if (result?.ok) {
    connState = "ok";
    soapState = "ok";
    decoderState = "ok";
  } else if (result && !result.ok) {
    const st = result.stage;
    if (st === "config" || st === "network") {
      connState = "fail";
      soapState = "notRun";
      decoderState = "notRun";
    } else if (st === "http") {
      connState = "ok";
      soapState = "fail";
      decoderState = "notRun";
    } else if (st === "decoder" || st === "fs") {
      connState = "ok";
      soapState = "ok";
      decoderState = "fail";
    }
  }

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex-1 min-w-[200px]">{conditionsSlot}</div>
        <button
          onClick={run}
          disabled={state === "running"}
          className="px-5 py-2.5 bg-brand-deep text-white rounded-lg text-[13px] font-semibold hover:bg-[#0d3a5c] disabled:opacity-40 transition"
        >
          {state === "running" ? "조회 중..." : queryLabel}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-4">
        {statusChip("Iregen 연결", connState)}
        {statusChip("SOAP", soapState, result?.ok ? `${result.meta.soapMs} ms` : undefined)}
        {statusChip("Decoder", decoderState, result?.ok ? `${result.meta.decoderMs} ms` : undefined)}
        <div className="border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50">
          <div className="text-[12px] text-zinc-500">조회건수</div>
          <div className="text-[14px] font-bold text-zinc-900">{result?.ok ? result.rowCount.toLocaleString() : "-"}</div>
        </div>
        <div className="border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50">
          <div className="text-[12px] text-zinc-500">소요시간</div>
          <div className="text-[14px] font-bold text-zinc-900">{result?.ok ? `${result.meta.totalMs} ms` : "-"}</div>
        </div>
        <div className="border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50">
          <div className="text-[12px] text-zinc-500">조회시간</div>
          <div className="text-[12px] font-semibold text-zinc-900">
            {result?.ok ? new Date(result.meta.queriedAt).toLocaleString("ko-KR", { hour12: false }) : "-"}
          </div>
        </div>
      </div>

      {result && !result.ok && (
        <div className="mb-4 border border-rose-200 bg-rose-50 rounded-lg p-3">
          {result.stage === "config" ? (
            <div className="text-[13px] text-rose-900 whitespace-pre-wrap">{result.error}</div>
          ) : (
            <>
              <div className="text-[13px] font-bold text-rose-700">⚠ SOAP 요청 실패 · stage: {result.stage}</div>
              <div className="text-[13px] text-rose-900 mt-1">{result.error}</div>
            </>
          )}
        </div>
      )}

      {result?.ok && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 min-w-[200px] border border-zinc-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-deep/30"
            />
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
              className="border border-zinc-300 rounded-lg px-2 py-2 text-[12px] bg-white"
              title="페이지당 표시 수"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}건/페이지</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-[12px] text-zinc-600">
            <span>전체 <b className="text-zinc-900">{result.rowCount.toLocaleString()}</b>건</span>
            <span className="text-zinc-300">·</span>
            <span>검색결과 <b className="text-zinc-900">{filtered.length.toLocaleString()}</b>건</span>
            <span className="text-zinc-300">·</span>
            <span>
              {filtered.length === 0
                ? "0 표시"
                : <>{(startIdx + 1).toLocaleString()}-{endIdx.toLocaleString()} 표시</>}
            </span>
            <span className="text-zinc-300">·</span>
            <span>페이지 <b className="text-zinc-900">{currentPage}</b>/{totalPages}</span>
          </div>

          <div className="border border-zinc-200 rounded-lg overflow-hidden">
            <div className="overflow-auto max-h-[480px]">
              <table className="w-full text-[12px]">
                <thead className="bg-zinc-50 sticky top-0">
                  <tr>
                    {displayCols.map((c) => (
                      <th key={c.erp} className={`text-left px-3 py-2 font-semibold text-zinc-700 border-b border-zinc-200 ${c.align === "right" ? "text-right" : ""}`}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row, i) => (
                    <tr
                      key={String(row[idField] ?? i)}
                      onClick={() => setSelected(row)}
                      className="hover:bg-sky-50 cursor-pointer border-b border-zinc-100"
                    >
                      {displayCols.map((c) => {
                        const v = row[c.erp];
                        const text = c.align === "right" ? formatNumber(v) : formatValue(v);
                        return (
                          <td key={c.erp} className={`px-3 py-1.5 text-zinc-800 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                            {text}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={displayCols.length} className="text-center text-zinc-400 py-6 text-[13px]">
                        결과 없음
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
          )}
        </>
      )}

      {selected && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-6"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200">
              <div>
                <div className="text-[14px] font-bold text-zinc-900">
                  📋 ERP 원본 필드 · {String(selected[idField] ?? "-")}
                </div>
                <div className="text-[12px] text-zinc-500">{String(selected[subtitleField] ?? "")}</div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="px-3 py-1 border border-zinc-300 rounded text-[12px] text-zinc-600 hover:bg-zinc-50"
              >
                닫기
              </button>
            </div>
            <div className="overflow-auto p-4">
              <table className="w-full text-[12px]">
                <tbody>
                  {result?.ok &&
                    result.columns.map((col) => (
                      <tr key={col} className="border-b border-zinc-100">
                        <td className="px-2 py-1 text-zinc-500 font-mono w-56 align-top">{col}</td>
                        <td className="px-2 py-1 text-zinc-900 break-all">{formatValue(selected[col])}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Pagination: React.FC<{ page: number; totalPages: number; onChange: (p: number) => void }> = ({
  page, totalPages, onChange,
}) => {
  const go = (p: number) => {
    const clamped = Math.min(Math.max(1, p), totalPages);
    if (clamped !== page) onChange(clamped);
  };
  const buildPages = (): Array<number | "ellipsis-l" | "ellipsis-r"> => {
    const list: Array<number | "ellipsis-l" | "ellipsis-r"> = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) list.push(i);
      return list;
    }
    const windowStart = Math.max(2, page - 2);
    const windowEnd = Math.min(totalPages - 1, page + 2);
    list.push(1);
    if (windowStart > 2) list.push("ellipsis-l");
    for (let i = windowStart; i <= windowEnd; i++) list.push(i);
    if (windowEnd < totalPages - 1) list.push("ellipsis-r");
    list.push(totalPages);
    return list;
  };
  const items = buildPages();
  const btnBase = "min-w-[32px] h-8 px-2 border rounded text-[12px] font-semibold transition";
  return (
    <div className="flex items-center justify-center gap-1 mt-3 flex-wrap">
      <button
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        className={`${btnBase} border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        ‹ 이전
      </button>
      {items.map((it, idx) =>
        it === "ellipsis-l" || it === "ellipsis-r" ? (
          <span key={`e-${idx}`} className="px-1 text-zinc-400 text-[12px]">...</span>
        ) : (
          <button
            key={it}
            onClick={() => go(it)}
            className={`${btnBase} ${it === page ? "border-brand-deep bg-brand-deep text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}
          >
            {it}
          </button>
        ),
      )}
      <button
        onClick={() => go(page + 1)}
        disabled={page >= totalPages}
        className={`${btnBase} border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        다음 ›
      </button>
    </div>
  );
};

export default ErpQueryView;
