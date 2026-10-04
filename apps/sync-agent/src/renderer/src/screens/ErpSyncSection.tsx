// apps/sync-agent/src/renderer/src/screens/ErpSyncSection.tsx
// 2026-10-03 저녁 · Phase 2 · ERP → Supabase 동기화 UI (메가 임포트 프로그램 내부)
//
// 핵심 역할:
//   ERP 데이터 수집 → 변환 → 비교 → 이상 데이터 표시 → 사용자 승인 → Sync
//
// 안전:
//   · 실제 WRITE 는 Phase 3 승인 전까지 비활성 (DRY-RUN 전용)
//   · ERROR 가 있으면 Sync 버튼 자동 disabled

import React, { useCallback, useEffect, useState } from "react";

type Phase =
  | "IDLE"
  | "FETCHING"
  | "DECODED"
  | "VALIDATING"
  | "PREVIEW_READY"
  | "SYNCING"
  | "COMPLETED"
  | "FAILED"
  | "ERROR_BLOCKED";

interface ValidationIssue {
  code: string;
  severity: "ERROR" | "REVIEW" | "NORMAL";
  message: string;
  barcode?: string;
  pcode?: string;
  productName?: string;
  erpValue?: unknown;
  dbValue?: unknown;
  reviewFlag?: string;
}
interface ValidationReport {
  totalRows: number;
  normal: number;
  review: number;
  error: number;
  byCode: Record<string, number>;
  issues: ValidationIssue[];
  blockingErrors: boolean;
}
interface SyncSummary {
  erpProducts: number;
  dbProducts: number;
  matched: number;
  newInsert: number;
  dbOnly: number;
  conflict: number;
  wouldInsert: number;
  wouldUpdate: number;
  wouldDelete: 0;
  currentStockChanges: number;
  locationChanges: number;
  locationReview: number;
}
interface ChangeRow {
  barcode: string;
  pcode: string;
  productName: string;
  action: "INSERT" | "UPDATE" | "SAME";
  changedFields: string[];
}
interface PreviewPayload {
  phase: Phase;
  fetchedAt: string;
  supabaseConfig: { present: boolean; urlSuffix: string | null };
  summary: SyncSummary;
  validation: ValidationReport;
  changes: ChangeRow[];
  dryRunOnly: true;
  blockingErrors: boolean;
}

type AnomalyFilter = "all" | "error" | "review";

export const ErpSyncSection: React.FC = () => {
  const [phase, setPhase] = useState<Phase>("IDLE");
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [fetchRows, setFetchRows] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supaStatus, setSupaStatus] = useState<{ present: boolean; urlSuffix: string | null } | null>(null);
  const [anomalyFilter, setAnomalyFilter] = useState<AnomalyFilter>("all");
  // 2026-10-04 · ERP Fetch 진행률 (iregenSoap 가 broadcast · 멈춘 것처럼 보이지 않도록)
  const [fetchProgress, setFetchProgress] = useState<{
    page: number;
    rowsAccum: number;
    done?: boolean;
    totalPages?: number;
    totalRowsExpected?: number;
  } | null>(null);
  // 경과 시간 표시용
  const [fetchStartMs, setFetchStartMs] = useState<number | null>(null);
  const [, setTick] = useState(0);

  const loadStatus = useCallback(async () => {
    try {
      const s = await window.api.erpSyncStatus();
      setSupaStatus(s.supabase);
      if (s.session.fetchedAt) setFetchedAt(s.session.fetchedAt);
      if (s.session.snapshotRows != null) setFetchRows(s.session.snapshotRows);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // 2026-10-04 · 진행률 수신 (iregenSoap.broadcastProductProgress → preload onErpProductProgress)
  useEffect(() => {
    if (!window.api?.onErpProductProgress) return;
    const unsub = window.api.onErpProductProgress((p) => {
      setFetchProgress(p);
      if (p.done) {
        // 완료 후 잠시 유지했다가 자동 숨김 (사용자가 완료값 확인)
        setTimeout(() => setFetchProgress(null), 3000);
      }
    });
    return unsub;
  }, []);

  // 1초마다 tick · 경과 시간 live 업데이트
  useEffect(() => {
    if (phase !== "FETCHING") return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const doFetch = async () => {
    setError(null);
    setPhase("FETCHING");
    setPreview(null);
    setFetchProgress(null);
    setFetchStartMs(Date.now());
    try {
      const r = await window.api.erpSyncFetch();
      if (!r.ok) {
        setPhase("FAILED");
        setError(`${r.stage}: ${r.error}`);
        return;
      }
      setFetchedAt(r.fetchedAt);
      setFetchRows(r.rows);
      setPhase("DECODED");
    } catch (e: any) {
      setPhase("FAILED");
      setError(e?.message ?? String(e));
    } finally {
      setFetchStartMs(null);
    }
  };

  const doPreview = async () => {
    setError(null);
    setPhase("VALIDATING");
    try {
      const r = await window.api.erpSyncPreview();
      if (!r.ok) {
        setPhase("FAILED");
        setError(r.error);
        return;
      }
      const p = r.preview as PreviewPayload;
      setPreview(p);
      setPhase(p.blockingErrors ? "ERROR_BLOCKED" : "PREVIEW_READY");
    } catch (e: any) {
      setPhase("FAILED");
      setError(e?.message ?? String(e));
    }
  };

  const doSync = async () => {
    // 이번 Phase 는 전체 WRITE 비활성 · toast 표시
    const r = await window.api.erpSyncApply({ mode: "DRY_RUN", allowWrite: false });
    if (!r.ok) {
      alert(r.message ?? "실행 불가");
      return;
    }
    alert(`Dry-run 완료 · inserted=${r.inserted} updated=${r.updated} failed=${r.failed}`);
  };

  const filteredIssues = (preview?.validation.issues ?? []).filter((i) => {
    if (anomalyFilter === "all") return true;
    if (anomalyFilter === "error") return i.severity === "ERROR";
    if (anomalyFilter === "review") return i.severity === "REVIEW";
    return true;
  }).slice(0, 200);

  const canFetch = phase !== "FETCHING" && phase !== "VALIDATING" && phase !== "SYNCING";
  const canPreview = fetchRows != null && phase !== "FETCHING" && phase !== "VALIDATING";
  const syncDisabled = !preview || preview.blockingErrors || phase === "SYNCING";

  return (
    <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
      {/* 상단 헤더 */}
      <div className="px-5 py-4 border-b border-zinc-200 bg-gradient-to-r from-sky-50 to-white">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-[18px] font-bold text-zinc-900">⚡ ERP → Supabase 동기화</div>
            <div className="text-[12px] text-zinc-500 mt-0.5">
              수집 → 변환 → 검증 → 비교 → 승인 → 반영
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className={`px-2 py-0.5 rounded font-semibold ${supaStatus?.present ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
              Supabase {supaStatus?.present ? "✓" : "✗"}
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
              DRY-RUN ONLY · 실제 WRITE 비활성
            </span>
          </div>
        </div>
      </div>

      {/* 상태 바 */}
      <div className="px-5 py-3 border-b border-zinc-200 bg-zinc-50">
        <div className="flex items-center gap-2 flex-wrap text-[12px]">
          <PhaseBadge phase={phase} />
          {fetchedAt && (
            <span className="text-zinc-500">
              마지막 Fetch: <strong>{new Date(fetchedAt).toLocaleString("ko-KR")}</strong>
              {fetchRows != null ? ` · ERP ${fetchRows.toLocaleString()}건` : ""}
            </span>
          )}
          {error && (
            <span className="text-rose-700 font-semibold whitespace-pre-wrap">⚠ {error}</span>
          )}
        </div>

        {/* 2026-10-04 · Fetch 진행률 바 (iregenSoap broadcast · 멈춘 것처럼 보이지 않도록) */}
        {(phase === "FETCHING" || fetchProgress) && (
          <FetchProgressBar
            progress={fetchProgress}
            startMs={fetchStartMs}
            fetching={phase === "FETCHING"}
          />
        )}
      </div>

      {/* 실행 버튼 */}
      <div className="px-5 py-4 flex items-center gap-2 flex-wrap">
        <button
          onClick={doFetch}
          disabled={!canFetch}
          className="px-4 py-2 bg-brand-deep text-white rounded-lg text-[13px] font-semibold hover:bg-[#0d3a5c] disabled:opacity-40 transition"
        >
          {phase === "FETCHING" ? "ERP 조회 중..." : "① ERP 데이터 가져오기"}
        </button>
        <button
          onClick={doPreview}
          disabled={!canPreview}
          className="px-4 py-2 bg-sky-600 text-white rounded-lg text-[13px] font-semibold hover:bg-sky-700 disabled:opacity-40 transition"
        >
          {phase === "VALIDATING" ? "분석 중..." : "② 변경 내용 확인 (DRY-RUN)"}
        </button>
        <button
          onClick={doSync}
          disabled={syncDisabled}
          className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition ${
            syncDisabled
              ? "bg-zinc-200 text-zinc-400"
              : "bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
          title={preview?.blockingErrors ? "ERROR 가 존재하여 Sync 차단됨" : undefined}
        >
          🔒 ③ Supabase 동기화 (잠김)
        </button>
      </div>

      {/* 결과 영역 */}
      {!preview && phase !== "VALIDATING" && (
        <div className="px-5 py-8 text-center text-zinc-500 text-[13px]">
          {phase === "IDLE" || phase === "FETCHING" || phase === "DECODED"
            ? "ERP 데이터를 가져온 후 [② 변경 내용 확인] 을 누르세요."
            : "결과 준비 중..."}
        </div>
      )}

      {preview && (
        <>
          {/* Summary 카드 */}
          <div className="px-5 py-4 border-t border-zinc-200">
            <div className="text-[14px] font-bold text-zinc-900 mb-3">📊 전체 요약</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[12px]">
              <StatBox label="ERP 상품" value={preview.summary.erpProducts} tone="sky" />
              <StatBox label="DB 상품" value={preview.summary.dbProducts} tone="slate" />
              <StatBox label="매칭" value={preview.summary.matched} tone="emerald" />
              <StatBox label="신규" value={preview.summary.newInsert} tone="sky" />
              <StatBox label="DB Only (KEEP)" value={preview.summary.dbOnly} tone="violet" />
              <StatBox label="Barcode 충돌" value={preview.summary.conflict} tone={preview.summary.conflict > 0 ? "rose" : "emerald"} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[12px] mt-2">
              <StatBox label="UPDATE 예정" value={preview.summary.wouldUpdate} tone="amber" />
              <StatBox label="INSERT 예정" value={preview.summary.wouldInsert} tone="sky" />
              <StatBox label="DELETE 예정" value={preview.summary.wouldDelete} tone="emerald" />
              <StatBox label="현재고 변경" value={preview.summary.currentStockChanges} tone="amber" />
              <StatBox label="위치 변경" value={preview.summary.locationChanges} tone="amber" />
              <StatBox label="위치 REVIEW" value={preview.summary.locationReview} tone="violet" />
            </div>
          </div>

          {/* Validation 요약 */}
          <div className="px-5 py-4 border-t border-zinc-200">
            <div className="text-[14px] font-bold text-zinc-900 mb-3">🩺 데이터 품질</div>
            <div className="grid grid-cols-3 gap-2 text-[12px]">
              <StatBox label="정상" value={preview.validation.normal} tone="emerald" />
              <StatBox label="검토 필요 (REVIEW)" value={preview.validation.review} tone="amber" />
              <StatBox label="오류 (ERROR)" value={preview.validation.error} tone={preview.validation.error > 0 ? "rose" : "emerald"} />
            </div>
            {preview.blockingErrors && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded text-[12px] text-rose-700">
                ⚠ ERROR 가 존재하여 Supabase 동기화 버튼이 비활성화되었습니다. 아래 "이상 데이터" 를 확인하세요.
              </div>
            )}
          </div>

          {/* 이상 데이터 */}
          <div className="px-5 py-4 border-t border-zinc-200">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[14px] font-bold text-zinc-900">⚠ 이상 데이터</div>
              <div className="flex items-center gap-1">
                {(["all", "error", "review"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setAnomalyFilter(f)}
                    className={`px-2 py-1 rounded text-[11px] font-semibold ${
                      anomalyFilter === f ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    }`}
                  >
                    {f === "all" ? "전체" : f === "error" ? "ERROR" : "REVIEW"}
                  </button>
                ))}
              </div>
            </div>
            {filteredIssues.length === 0 ? (
              <div className="text-[12px] text-zinc-500 py-4 text-center">해당 분류 이상 없음</div>
            ) : (
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-zinc-200 rounded">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-zinc-50 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1.5">상태</th>
                      <th className="text-left px-2 py-1.5">상품명</th>
                      <th className="text-left px-2 py-1.5">Barcode</th>
                      <th className="text-left px-2 py-1.5">PCode</th>
                      <th className="text-left px-2 py-1.5">문제</th>
                      <th className="text-left px-2 py-1.5">DB</th>
                      <th className="text-left px-2 py-1.5">ERP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIssues.map((i, idx) => (
                      <tr key={idx} className="border-t border-zinc-100">
                        <td className="px-2 py-1.5">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            i.severity === "ERROR" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                          }`}>{i.severity}</span>
                        </td>
                        <td className="px-2 py-1.5 max-w-[180px] truncate" title={i.productName}>{i.productName ?? "-"}</td>
                        <td className="px-2 py-1.5 font-mono">{i.barcode ?? "-"}</td>
                        <td className="px-2 py-1.5 font-mono">{i.pcode ?? "-"}</td>
                        <td className="px-2 py-1.5">{i.code}</td>
                        <td className="px-2 py-1.5 text-zinc-500">{i.dbValue != null ? String(i.dbValue) : "-"}</td>
                        <td className="px-2 py-1.5 text-zinc-700">{i.erpValue != null ? String(i.erpValue) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.validation.issues.length > filteredIssues.length && (
              <div className="text-[11px] text-zinc-400 mt-1">
                총 {preview.validation.issues.length.toLocaleString()}건 중 상위 {filteredIssues.length}건 표시 (DOM 폭주 방지)
              </div>
            )}
          </div>

          {/* 변경 내용 */}
          <div className="px-5 py-4 border-t border-zinc-200">
            <div className="text-[14px] font-bold text-zinc-900 mb-3">
              📋 변경 상세 (상위 {preview.changes.length}건)
            </div>
            {preview.changes.length === 0 ? (
              <div className="text-[12px] text-zinc-500 py-4 text-center">변경 상품 없음</div>
            ) : (
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-zinc-200 rounded">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-zinc-50 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1.5">구분</th>
                      <th className="text-left px-2 py-1.5">상품명</th>
                      <th className="text-left px-2 py-1.5">Barcode</th>
                      <th className="text-left px-2 py-1.5">변경 필드</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.changes.map((c, idx) => (
                      <tr key={idx} className="border-t border-zinc-100">
                        <td className="px-2 py-1.5">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            c.action === "INSERT" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"
                          }`}>{c.action}</span>
                        </td>
                        <td className="px-2 py-1.5 max-w-[200px] truncate" title={c.productName}>{c.productName}</td>
                        <td className="px-2 py-1.5 font-mono">{c.barcode}</td>
                        <td className="px-2 py-1.5 text-zinc-600">{c.changedFields.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const StatBox: React.FC<{ label: string; value: number; tone: "sky" | "emerald" | "rose" | "amber" | "violet" | "slate" }> = ({ label, value, tone }) => {
  const toneCls: Record<string, string> = {
    sky: "bg-sky-50 border-sky-200 text-sky-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    violet: "bg-violet-50 border-violet-200 text-violet-700",
    slate: "bg-zinc-50 border-zinc-200 text-zinc-700",
  };
  return (
    <div className={`px-3 py-2 rounded border ${toneCls[tone]}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-[18px] font-bold mt-0.5">{value.toLocaleString()}</div>
    </div>
  );
};

// 2026-10-04 · Fetch 진행률 바 (iregenSoap · broadcastProductProgress)
const FetchProgressBar: React.FC<{
  progress: { page: number; rowsAccum: number; done?: boolean; totalPages?: number; totalRowsExpected?: number } | null;
  startMs: number | null;
  fetching: boolean;
}> = ({ progress, startMs, fetching }) => {
  const pct =
    progress?.totalPages && progress.totalPages > 0
      ? Math.min(100, Math.round((progress.page / progress.totalPages) * 100))
      : progress?.totalRowsExpected && progress.totalRowsExpected > 0
        ? Math.min(100, Math.round((progress.rowsAccum / progress.totalRowsExpected) * 100))
        : null;
  const elapsedSec = startMs != null ? Math.floor((Date.now() - startMs) / 1000) : 0;
  const etaSec =
    pct && pct > 0 && pct < 100 && elapsedSec > 0
      ? Math.max(0, Math.round((elapsedSec * (100 - pct)) / pct))
      : null;

  return (
    <div className="mt-2 bg-white border border-zinc-200 rounded p-2.5">
      <div className="flex items-center justify-between text-[12px] font-semibold mb-1">
        <span className="text-brand-deep">
          {progress
            ? `${progress.rowsAccum.toLocaleString()}${progress.totalRowsExpected ? ` / ${progress.totalRowsExpected.toLocaleString()}` : ""}건`
            : fetching
              ? "ERP SOAP 호출 준비 중..."
              : ""}
          {progress?.totalPages ? ` · ${progress.page}/${progress.totalPages} 페이지` : progress ? ` · ${progress.page} 페이지 완료` : ""}
        </span>
        <span className="text-zinc-500 tabular-nums">
          {pct !== null && <span className="mr-2">{pct}%</span>}
          경과 {elapsedSec}s{etaSec !== null ? ` · 남은시간 약 ${etaSec}s` : ""}
        </span>
      </div>
      <div className="w-full bg-zinc-200 rounded h-2 overflow-hidden">
        <div
          className="bg-brand-deep h-full transition-all duration-300"
          style={{ width: pct !== null ? `${pct}%` : fetching ? "10%" : "0%" }}
        />
      </div>
      {!progress && fetching && (
        <div className="text-[11px] text-zinc-500 mt-1">
          · ERP SOAP (concurrency=1) · 약 4분 소요 · 81 페이지 × 50건
        </div>
      )}
      {progress?.done && (
        <div className="text-[11px] text-emerald-600 font-semibold mt-1">
          ✓ 완료 · 총 {progress.rowsAccum.toLocaleString()}건
        </div>
      )}
    </div>
  );
};

const PhaseBadge: React.FC<{ phase: Phase }> = ({ phase }) => {
  const map: Record<Phase, { label: string; cls: string }> = {
    IDLE: { label: "준비", cls: "bg-zinc-200 text-zinc-600" },
    FETCHING: { label: "ERP 조회 중", cls: "bg-sky-200 text-sky-800" },
    DECODED: { label: "조회 완료", cls: "bg-emerald-200 text-emerald-800" },
    VALIDATING: { label: "검증 중", cls: "bg-amber-200 text-amber-800" },
    PREVIEW_READY: { label: "Preview 준비", cls: "bg-emerald-200 text-emerald-800" },
    SYNCING: { label: "동기화 중", cls: "bg-sky-200 text-sky-800" },
    COMPLETED: { label: "완료", cls: "bg-emerald-200 text-emerald-800" },
    FAILED: { label: "실패", cls: "bg-rose-200 text-rose-800" },
    ERROR_BLOCKED: { label: "ERROR · Sync 차단", cls: "bg-rose-200 text-rose-800" },
  };
  const m = map[phase];
  return <span className={`px-2 py-0.5 rounded font-bold ${m.cls}`}>{m.label}</span>;
};

export default ErpSyncSection;
// Note: window.api 는 ErpSection.tsx 에서 이미 `[key: string]: any` 로 선언되어 있어
// 추가 메서드 (erpSyncStatus · erpSyncFetch · erpSyncPreview · erpSyncApply) 는 자동 허용됨.
