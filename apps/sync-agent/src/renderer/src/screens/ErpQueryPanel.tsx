// apps/sync-agent/src/renderer/src/screens/ErpQueryPanel.tsx
// 2026-10-03 · Iregen ERP Live Query 검증 패널
//   · 버튼 클릭 → SOAP → C# decoder → DataSet · 메모리 전용
//   · Supabase 쓰기 금지 · 사용자가 ERP 화면과 직접 비교 목적
//   · CorpDB_nm 등 민감 값 · 화면/로그 노출 없음

import React, { useEffect, useMemo, useState } from "react";

type Row = Record<string, unknown>;

type QueryResult =
  | {
      ok: true;
      rowCount: number;
      columns: string[];
      rows: Row[];
      meta: { soapMs: number; decoderMs: number; totalMs: number; queriedAt: string };
    }
  | { ok: false; stage: string; error: string };

const DISPLAY_COLS: Array<{ erp: string; label: string; align?: "right" }> = [
  { erp: "PCode", label: "상품코드" },
  { erp: "ProductName", label: "상품명" },
  { erp: "CCorpName", label: "공급사" },
  { erp: "CostPrice", label: "매입가", align: "right" },
  { erp: "UnitCode", label: "단위" },
  { erp: "LocationName", label: "진열위치" },
  { erp: "IsSaleStatusName", label: "판매상태" },
];

// 2026-10-03 · 사용자 지시 · MAX_VISIBLE 제한 제거 · pagination 적용
//   · 전체 데이터 메모리 유지 · 검색은 전체 대상 · 표시만 pagination
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
    state === "ok"
      ? "성공"
      : state === "fail"
        ? "실패"
        : state === "running"
          ? "진행 중"
          : state === "notRun"
            ? "미실행"
            : "대기";
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

export const ErpQueryPanel: React.FC = () => {
  const [state, setState] = useState<"idle" | "running" | "ok" | "fail">("idle");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  // 2026-10-03 · pagination state · 사용자 지시 (50/100/200)
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);

  const run = async () => {
    if (!window.api?.erpInventoryQuery) {
      setResult({ ok: false, stage: "config", error: "preload 미연결 · erpInventoryQuery 없음" });
      setState("fail");
      return;
    }
    setState("running");
    setResult(null);
    setSelected(null);
    try {
      const r = await window.api.erpInventoryQuery();
      setResult(r);
      setState(r.ok ? "ok" : "fail");
    } catch (err: any) {
      setResult({ ok: false, stage: "config", error: err?.message ?? String(err) });
      setState("fail");
    }
  };

  // 2026-10-03 · 사용자 지시 TEST A · Fiddler Request Raw 전송
  const runRaw = async () => {
    if (!window.api?.erpInventoryQueryRaw) {
      setResult({ ok: false, stage: "config", error: "preload 미연결 · erpInventoryQueryRaw 없음" });
      setState("fail");
      return;
    }
    setState("running");
    setResult(null);
    setSelected(null);
    try {
      const r = await window.api.erpInventoryQueryRaw();
      setResult(r);
      setState(r.ok ? "ok" : "fail");
    } catch (err: any) {
      setResult({ ok: false, stage: "config", error: err?.message ?? String(err) });
      setState("fail");
    }
  };

  const filtered = useMemo(() => {
    if (!result?.ok) return [];
    const q = query.trim().toLowerCase();
    if (!q) return result.rows;
    return result.rows.filter((r) => {
      const code = String(r.PCode ?? "").toLowerCase();
      const name = String(r.ProductName ?? "").toLowerCase();
      const vendor = String(r.CCorpName ?? "").toLowerCase();
      return code.includes(q) || name.includes(q) || vendor.includes(q);
    });
  }, [result, query]);

  // 2026-10-03 · 사용자 지시 · 검색어/페이지크기 변경 → page=1 reset
  //   · 새 조회 결과 들어와도 page=1 reset
  useEffect(() => { setPage(1); }, [query, pageSize, result]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, filtered.length);
  const visible = filtered.slice(startIdx, endIdx);

  // 2026-10-03 · 사용자 지시 · 각 단계는 실제 성공했을 때만 성공 표시
  //   초기 · 모두 대기
  //   running · 모두 진행 중
  //   config/network 실패 · 연결=실패 · SOAP=미실행 · Decoder=미실행
  //   http 실패 · 연결=성공 · SOAP=실패 · Decoder=미실행
  //   decoder/fs 실패 · 연결=성공 · SOAP=성공 · Decoder=실패
  //   전체 성공 · 모두 성공
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[16px] font-bold text-zinc-900">🔗 Iregen ERP 직접 조회 (검증용)</div>
          <div className="text-[12px] text-zinc-500 mt-0.5">버튼 클릭 시 실제 SOAP 호출 · 메모리 전용 · Supabase 미반영</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={run}
            disabled={state === "running"}
            className="px-5 py-2.5 bg-brand-deep text-white rounded-lg text-[13px] font-semibold hover:bg-[#0d3a5c] disabled:opacity-40 transition"
          >
            {state === "running" ? "조회 중..." : "ERP 재고 조회"}
          </button>
          <button
            onClick={runRaw}
            disabled={state === "running"}
            title="samples/request.txt body 를 그대로 전송 · CorpDB_nm 만 env 치환"
            className="px-4 py-2.5 border border-amber-300 text-amber-700 bg-amber-50 rounded-lg text-[12px] font-semibold hover:bg-amber-100 disabled:opacity-40 transition"
          >
            🔬 진단 TEST A · Fiddler Raw
          </button>
        </div>
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
          {/* 2026-10-03 · 사용자 지시 · SOAP response body 전체 노출 X · 요약 메시지만 */}
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
          {/* 2026-10-03 · 사용자 지시 · 전체/검색결과/현재 표시 범위 + 페이지 크기 선택 */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="상품코드 · 상품명 · 공급사 검색 (전체 대상)"
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
                    {DISPLAY_COLS.map((c) => (
                      <th key={c.erp} className={`text-left px-3 py-2 font-semibold text-zinc-700 border-b border-zinc-200 ${c.align === "right" ? "text-right" : ""}`}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row, i) => (
                    <tr
                      key={String(row.PCode ?? i)}
                      onClick={() => setSelected(row)}
                      className="hover:bg-sky-50 cursor-pointer border-b border-zinc-100"
                    >
                      {DISPLAY_COLS.map((c) => {
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
                      <td colSpan={DISPLAY_COLS.length} className="text-center text-zinc-400 py-6 text-[13px]">
                        결과 없음
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2026-10-03 · 사용자 지시 · 하단 pagination · < 이전 1 2 3 4 5 ... last 다음 > */}
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
                  📋 ERP 원본 필드 · {String(selected.PCode ?? "-")}
                </div>
                <div className="text-[12px] text-zinc-500">{String(selected.ProductName ?? "")}</div>
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

// 2026-10-03 · 사용자 지시 pagination 컴포넌트
//   · < 이전 1 2 3 4 5 ... last 다음 >
//   · window 5 pages · 양 끝 생략부호 자동
const Pagination: React.FC<{ page: number; totalPages: number; onChange: (p: number) => void }> = ({
  page,
  totalPages,
  onChange,
}) => {
  const go = (p: number) => {
    const clamped = Math.min(Math.max(1, p), totalPages);
    if (clamped !== page) onChange(clamped);
  };
  // 현재 페이지 중심 5개 window + 첫/마지막 + 생략부호
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
  const btnBase =
    "min-w-[32px] h-8 px-2 border rounded text-[12px] font-semibold transition";
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
          <span key={`e-${idx}`} className="px-1 text-zinc-400 text-[12px]">
            ...
          </span>
        ) : (
          <button
            key={it}
            onClick={() => go(it)}
            className={`${btnBase} ${
              it === page
                ? "border-brand-deep bg-brand-deep text-white"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
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

export default ErpQueryPanel;
