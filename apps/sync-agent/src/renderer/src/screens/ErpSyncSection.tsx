// apps/sync-agent/src/renderer/src/screens/ErpSyncSection.tsx
// 2026-10-04 · Phase 2 · 3 Dataset 독립 Card UI
//
// 각 Dataset:
//   · 선택 checkbox
//   · Fetch · 상태 · 진행률 · Snapshot · Validation · Sync 가능 여부
//   · 개별 Fetch 버튼
//
// 전체:
//   · 선택 Fetch (순차 · ERP concurrency=1)
//   · 선택 Preview (ERP 호출 없음)
//   · 선택 Sync (DRY-RUN 전용 · 전체 WRITE 는 Phase 3)

import React, { useCallback, useEffect, useRef, useState } from "react";

type DatasetKey = "PRODUCT_LIST" | "INVENTORY_STATUS" | "BUY_STATUS" | "SALE_STATUS";

const DATASET_LABEL: Record<DatasetKey, string> = {
  PRODUCT_LIST: "상품정보 · 현재고",
  INVENTORY_STATUS: "재고 입출고 현황",
  BUY_STATUS: "매입내역",
  SALE_STATUS: "판매내역",
};
const DATASET_API: Record<DatasetKey, string> = {
  PRODUCT_LIST: "Product_List",
  INVENTORY_STATUS: "Inventory_Status",
  BUY_STATUS: "Buy_Status",
  SALE_STATUS: "Sale_Status",
};
const DATASET_ICON: Record<DatasetKey, string> = {
  PRODUCT_LIST: "📦",
  INVENTORY_STATUS: "📊",
  BUY_STATUS: "💰",
  SALE_STATUS: "🧾",
};

type FetchPhase =
  | "IDLE" | "QUEUED" | "REQUESTING" | "RECEIVING" | "DECODING"
  | "VALIDATING" | "READY" | "FAILED";

type SyncReadiness = "READY" | "REVIEW" | "BLOCKED" | "NOT_CONFIGURED" | "SYNCED";

interface ValidationSummary {
  totalRows: number;
  normal: number;
  review: number;
  error: number;
  blockingErrors: boolean;
}
interface SnapshotMeta {
  snapshotId: string;
  dataset: DatasetKey;
  fetchedAt: string;
  completedAt: string;
  rowCount: number;
  checksum: string;
  validation?: ValidationSummary;
}
interface DatasetProgress {
  dataset: DatasetKey;
  phase: FetchPhase;
  page?: number;
  totalPages?: number;
  rowsAccum?: number;
  totalRowsExpected?: number;
  startedAt?: string;
  message?: string;
}
interface DatasetState {
  dataset: DatasetKey;
  phase: FetchPhase;
  readiness: SyncReadiness;
  snapshot: SnapshotMeta | null;
  inflight: DatasetProgress | null;
  lastError: string | null;
  dependencyMessage: string | null;
}

const ORDER: DatasetKey[] = ["PRODUCT_LIST", "INVENTORY_STATUS", "BUY_STATUS", "SALE_STATUS"];

export const ErpSyncSection: React.FC = () => {
  const [states, setStates] = useState<Record<DatasetKey, DatasetState> | null>(null);
  const [supaStatus, setSupaStatus] = useState<{ present: boolean; urlSuffix: string | null } | null>(null);
  const [selected, setSelected] = useState<Record<DatasetKey, boolean>>({
    PRODUCT_LIST: true,
    INVENTORY_STATUS: false,
    BUY_STATUS: false,
    SALE_STATUS: false,
  });
  const [queueStatus, setQueueStatus] = useState<{ running: boolean; current: DatasetKey | null; pending: DatasetKey[]; concurrency: 1 } | null>(null);
  // Product_List pagination 진행률 (iregenSoap · erp:product-progress 수신)
  const [productProgress, setProductProgress] = useState<{ page: number; rowsAccum: number; done?: boolean; totalPages?: number; totalRowsExpected?: number } | null>(null);
  const pollRef = useRef<number | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const data = await window.api.erpSyncGetAllDatasets();
      setStates(data.datasets);
      setSupaStatus(data.supabase);
      setQueueStatus(data.queue);
    } catch (e: any) {
      console.error("[erpSync] loadAll", e);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Dataset-progress broadcast 수신 (각 Dataset 상태 변화 시)
  useEffect(() => {
    if (!window.api?.onErpDatasetProgress) return;
    const unsub = window.api.onErpDatasetProgress(() => {
      // 어떤 Dataset 이 바뀌든 전체 refresh (상태 일관성 보장)
      loadAll();
    });
    return unsub;
  }, [loadAll]);

  // Product_List pagination 진행률 (기존 broadcast · 상세 % 표시용)
  useEffect(() => {
    if (!window.api?.onErpProductProgress) return;
    const unsub = window.api.onErpProductProgress((p) => {
      setProductProgress(p);
      if (p.done) setTimeout(() => setProductProgress(null), 2500);
    });
    return unsub;
  }, []);

  // Queue 가 돌아갈 때 1초마다 refresh (상태 반영 지연 보완)
  useEffect(() => {
    if (!queueStatus?.running) return;
    pollRef.current = window.setInterval(() => loadAll(), 1500);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [queueStatus?.running, loadAll]);

  const toggleSelect = (d: DatasetKey) => setSelected((s) => ({ ...s, [d]: !s[d] }));
  const selectedList = ORDER.filter((d) => selected[d]);

  const fetchOne = async (d: DatasetKey) => {
    await window.api.erpSyncFetchDataset({ dataset: d });
    loadAll();
  };
  const fetchSelected = async () => {
    if (selectedList.length === 0) return;
    await window.api.erpSyncFetchSelected({ datasets: selectedList });
    loadAll();
  };

  const anyRunning = !!queueStatus?.running;
  const syncSelected = async () => {
    const r = await window.api.erpSyncSyncSelected({ datasets: selectedList, allowWrite: false });
    alert(r.message ?? "DRY-RUN 완료");
  };

  if (!states) {
    return <div className="text-zinc-500 text-[13px]">로딩 중...</div>;
  }

  return (
    <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="px-5 py-4 border-b border-zinc-200 bg-gradient-to-r from-sky-50 to-white">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-[18px] font-bold text-zinc-900">⚡ ERP → Supabase 동기화</div>
            <div className="text-[12px] text-zinc-500 mt-0.5">
              4개 데이터 세트 독립 관리 · 수집 → 변환 → 검증 → 비교 → 승인 → 반영
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

      {/* Queue 상태 */}
      {queueStatus && (queueStatus.running || queueStatus.pending.length > 0) && (
        <div className="px-5 py-2 bg-sky-50 border-b border-sky-200 text-[12px] text-sky-800">
          🔄 ERP 요청 Queue (concurrency = 1) ·
          <strong className="mx-1">
            {queueStatus.current ? `${DATASET_LABEL[queueStatus.current]} 실행 중` : "대기"}
          </strong>
          {queueStatus.pending.length > 0 && (
            <span>· 대기열: {queueStatus.pending.map((d) => DATASET_LABEL[d]).join(" → ")}</span>
          )}
        </div>
      )}

      {/* 4개 Dataset Card · md 2열 · xl 4열 (판매내역 포함 · 좁은 폭에선 2x2 반응형) */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {ORDER.map((d) => (
          <DatasetCard
            key={d}
            dataset={d}
            state={states[d]}
            selected={selected[d]}
            onToggle={() => toggleSelect(d)}
            onFetch={() => fetchOne(d)}
            productProgress={d === "PRODUCT_LIST" ? productProgress : null}
            busy={anyRunning}
          />
        ))}
      </div>

      {/* 선택 액션 */}
      <div className="px-5 py-4 border-t border-zinc-200 bg-zinc-50 flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-zinc-600 font-semibold">선택 ({selectedList.length}):</span>
        <button
          onClick={fetchSelected}
          disabled={selectedList.length === 0 || anyRunning}
          className="px-4 py-2 bg-brand-deep text-white rounded-lg text-[13px] font-semibold hover:bg-[#0d3a5c] disabled:opacity-40"
          title="선택한 데이터를 ERP에서 순차적으로 가져옵니다 (concurrency=1)"
        >
          🔽 선택 데이터 ERP에서 가져오기
        </button>
        <button
          onClick={syncSelected}
          disabled={selectedList.length === 0}
          className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:bg-zinc-200 disabled:text-zinc-400"
          title="선택한 Dataset Supabase 동기화 (현재는 DRY-RUN 전용)"
        >
          🔒 선택 데이터 Supabase 동기화 (잠김)
        </button>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────────
// Dataset Card
// ───────────────────────────────────────────────────────────────────────────────
const DatasetCard: React.FC<{
  dataset: DatasetKey;
  state: DatasetState;
  selected: boolean;
  onToggle: () => void;
  onFetch: () => void;
  productProgress: { page: number; rowsAccum: number; done?: boolean; totalPages?: number; totalRowsExpected?: number } | null;
  busy: boolean;
}> = ({ dataset, state, selected, onToggle, onFetch, productProgress, busy }) => {
  const phase = state.inflight?.phase ?? state.phase;
  const isInflight = state.inflight != null && state.inflight.phase !== "READY" && state.inflight.phase !== "FAILED";
  const [showAnomaly, setShowAnomaly] = useState(false);
  // 2026-10-04 · 사용자 지시 · "내용 보기" 토글 · 카드 아래 inline 표
  const [showContent, setShowContent] = useState(false);
  const [contentRows, setContentRows] = useState<Record<string, unknown>[] | null>(null);
  const [contentTotal, setContentTotal] = useState<number>(0);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  return (
    <div className={`rounded-xl border p-4 ${selected ? "border-brand-deep bg-sky-50/40" : "border-zinc-200 bg-white"}`}>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1 w-4 h-4 accent-brand-deep cursor-pointer"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[18px]">{DATASET_ICON[dataset]}</span>
            <span className="text-[15px] font-bold text-zinc-900">{DATASET_LABEL[dataset]}</span>
          </div>
          <div className="text-[10px] text-zinc-400 font-mono">{DATASET_API[dataset]}</div>
        </div>
        <ReadinessBadge readiness={state.readiness} />
      </div>

      {/* 상태 */}
      <div className="mt-3 space-y-1 text-[12px]">
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">상태</span>
          <PhaseBadge phase={phase} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">최근 Snapshot</span>
          <span className="font-semibold text-zinc-800">
            {state.snapshot ? formatDate(state.snapshot.completedAt) : "없음"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">rows</span>
          <span className="font-semibold text-zinc-800 tabular-nums">
            {state.snapshot ? state.snapshot.rowCount.toLocaleString() : "-"}
          </span>
        </div>
        {state.snapshot?.validation && (
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">검증</span>
            <span className="flex items-center gap-1 text-[11px]">
              <span className="text-emerald-700 font-semibold">N {state.snapshot.validation.normal}</span>
              <span className="text-amber-700 font-semibold">R {state.snapshot.validation.review}</span>
              <span className="text-rose-700 font-semibold">E {state.snapshot.validation.error}</span>
            </span>
          </div>
        )}
      </div>

      {/* 진행률 */}
      {isInflight && (
        <div className="mt-3 border border-sky-200 rounded p-2 bg-sky-50">
          <div className="flex items-center justify-between text-[11px] text-sky-800 mb-1">
            <span>{state.inflight?.message ?? phase}</span>
            {productProgress && dataset === "PRODUCT_LIST" && (
              <span className="font-semibold tabular-nums">
                {productProgress.rowsAccum.toLocaleString()}
                {productProgress.totalRowsExpected ? ` / ${productProgress.totalRowsExpected.toLocaleString()}` : ""}
              </span>
            )}
          </div>
          <div className="w-full bg-sky-200 rounded h-1.5 overflow-hidden">
            <div
              className="bg-brand-deep h-full transition-all duration-300"
              style={{ width: productProgress?.totalPages ? `${Math.min(100, Math.round(productProgress.page / productProgress.totalPages * 100))}%` : "15%" }}
            />
          </div>
          {dataset === "PRODUCT_LIST" && productProgress && (
            <div className="text-[10px] text-sky-700 mt-1">
              페이지 {productProgress.page}{productProgress.totalPages ? ` / ${productProgress.totalPages}` : ""}
            </div>
          )}
        </div>
      )}

      {/* 에러 */}
      {state.lastError && !isInflight && (
        <div className="mt-3 p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-700">
          ⚠ {state.lastError}
        </div>
      )}

      {/* Dependency 메시지 */}
      {state.dependencyMessage && (
        <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800">
          ⓘ {state.dependencyMessage}
        </div>
      )}

      {/* 액션 */}
      <div className="mt-3 flex gap-1 flex-wrap">
        <button
          onClick={onFetch}
          disabled={busy || isInflight}
          className="flex-1 min-w-[120px] px-2 py-1.5 bg-brand-deep text-white rounded text-[11px] font-semibold hover:bg-[#0d3a5c] disabled:opacity-40"
        >
          {isInflight ? "진행중..." : "ERP 새로 가져오기"}
        </button>
        <button
          disabled={!state.snapshot}
          className="px-2 py-1.5 bg-zinc-100 text-zinc-700 rounded text-[11px] font-semibold hover:bg-zinc-200 disabled:opacity-40"
          title="Snapshot rows 보기 (아래 표)"
          onClick={async () => {
            if (showContent) { setShowContent(false); return; }
            setContentLoading(true); setContentError(null);
            try {
              const r = await window.api.erpSyncGetRows({ dataset, limit: 100 });
              if (r.ok) {
                setContentRows(r.rows as Record<string, unknown>[]);
                setContentTotal(r.total);
                setShowContent(true);
              } else { setContentError(r.error); setShowContent(true); }
            } finally { setContentLoading(false); }
          }}
        >
          {showContent ? "내용 접기" : contentLoading ? "로딩..." : "내용 보기"}
        </button>
        <button
          disabled={!state.snapshot?.validation || (state.snapshot.validation.review === 0 && state.snapshot.validation.error === 0)}
          onClick={() => setShowAnomaly((s) => !s)}
          className="px-2 py-1.5 bg-zinc-100 text-zinc-700 rounded text-[11px] font-semibold hover:bg-zinc-200 disabled:opacity-40"
        >
          이상 데이터
        </button>
      </div>

      {/* 이상 데이터 간이 뷰 (요약 숫자만 · 세부는 Phase 3 Preview 에서) */}
      {showAnomaly && state.snapshot?.validation && (
        <div className="mt-2 p-2 bg-zinc-50 border border-zinc-200 rounded text-[11px] text-zinc-700">
          <div className="font-semibold mb-1">검증 요약 (snapshot 저장 시점)</div>
          <div className="grid grid-cols-3 gap-2">
            <div>정상 {state.snapshot.validation.normal.toLocaleString()}</div>
            <div className="text-amber-700">REVIEW {state.snapshot.validation.review.toLocaleString()}</div>
            <div className="text-rose-700">ERROR {state.snapshot.validation.error.toLocaleString()}</div>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">상세 이상 데이터 리스트는 Phase 3 Preview 에서.</div>
        </div>
      )}

      {/* 2026-10-04 · "내용 보기" inline 표 (아래) · ERP snapshot rows 샘플 */}
      {showContent && (
        <div className="mt-2 p-2 bg-white border border-zinc-200 rounded">
          <div className="text-[11px] text-zinc-700 font-semibold mb-1">
            {DATASET_LABEL[dataset]} · 총 {contentTotal.toLocaleString()}건 · 상위 {contentRows?.length ?? 0}건 표시
          </div>
          {contentError && (
            <div className="text-[11px] text-rose-700">⚠ {contentError}</div>
          )}
          {contentRows && contentRows.length > 0 && (
            <SnapshotTable dataset={dataset} rows={contentRows} />
          )}
          {contentRows && contentRows.length === 0 && (
            <div className="text-[11px] text-zinc-500">데이터 없음</div>
          )}
        </div>
      )}
    </div>
  );
};

// 2026-10-04 · Dataset 별 핵심 column 만 표 형식으로 렌더링
const SnapshotTable: React.FC<{ dataset: DatasetKey; rows: Record<string, unknown>[] }> = ({ dataset, rows }) => {
  const COLS: Record<DatasetKey, Array<{ key: string; label: string; align?: "right" }>> = {
    PRODUCT_LIST: [
      { key: "PCode", label: "PCode" },
      { key: "BarCode", label: "Barcode" },
      { key: "ProductName", label: "상품명" },
      { key: "NowStock", label: "현재고", align: "right" },
      { key: "CorpNameView", label: "공급사" },
      { key: "LocationName", label: "위치" },
      { key: "SaleStatusName", label: "판매상태" },
    ],
    INVENTORY_STATUS: [
      { key: "PCode", label: "PCode" },
      { key: "ProductName", label: "상품명" },
      { key: "CCorpName", label: "공급사" },
      { key: "UnitCode", label: "단위" },
      { key: "PrvStock", label: "이전", align: "right" },
      { key: "BuyStock", label: "매입", align: "right" },
      { key: "SaleStock", label: "판매", align: "right" },
      { key: "PlusStock", label: "조정+", align: "right" },
      { key: "MinusStock", label: "조정-", align: "right" },
    ],
    BUY_STATUS: [
      { key: "BmCode", label: "BmCode" },
      { key: "ROWNUM", label: "라인" },
      { key: "BuyDate", label: "매입일" },
      { key: "PCode", label: "PCode" },
      { key: "ProductName", label: "상품명" },
      { key: "CorpNameView", label: "공급사" },
      { key: "StockCnt", label: "수량", align: "right" },
      { key: "UnitCost", label: "단가", align: "right" },
      { key: "BuyTotal", label: "총액", align: "right" },
    ],
    // 2026-10-04 · 판매내역 · 응답 schema 미확인 상태 · 공통 추정 field · 실제 조회 후 재확정
    SALE_STATUS: [
      { key: "SaleDate", label: "판매일" },
      { key: "PCode", label: "PCode" },
      { key: "ProductName", label: "상품명" },
      { key: "UnitSale", label: "단가", align: "right" },
      { key: "StockCnt", label: "수량", align: "right" },
      { key: "SaleTotal", label: "총액", align: "right" },
      { key: "Margin", label: "마진", align: "right" },
    ],
  };
  const cols = COLS[dataset];
  return (
    <div className="overflow-x-auto max-h-[320px] overflow-y-auto border border-zinc-200 rounded">
      <table className="min-w-full text-[10.5px]">
        <thead className="bg-zinc-50 sticky top-0">
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={`px-1.5 py-1 font-semibold ${c.align === "right" ? "text-right" : "text-left"}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className="border-t border-zinc-100 hover:bg-zinc-50">
              {cols.map((c) => (
                <td key={c.key} className={`px-1.5 py-1 ${c.align === "right" ? "text-right tabular-nums" : "text-left"} ${c.key === "ProductName" ? "max-w-[200px] truncate" : ""}`}>
                  {String(r[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────────
// 보조 컴포넌트
// ───────────────────────────────────────────────────────────────────────────────

const ReadinessBadge: React.FC<{ readiness: SyncReadiness }> = ({ readiness }) => {
  const map: Record<SyncReadiness, { label: string; cls: string }> = {
    READY: { label: "READY", cls: "bg-emerald-100 text-emerald-700" },
    REVIEW: { label: "REVIEW", cls: "bg-amber-100 text-amber-800" },
    BLOCKED: { label: "BLOCKED", cls: "bg-rose-100 text-rose-700" },
    NOT_CONFIGURED: { label: "NOT_CONFIGURED", cls: "bg-zinc-100 text-zinc-600" },
    SYNCED: { label: "SYNCED", cls: "bg-sky-100 text-sky-700" },
  };
  const m = map[readiness];
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${m.cls}`}>{m.label}</span>;
};

const PhaseBadge: React.FC<{ phase: FetchPhase }> = ({ phase }) => {
  const map: Record<FetchPhase, { label: string; cls: string }> = {
    IDLE: { label: "대기", cls: "bg-zinc-100 text-zinc-500" },
    QUEUED: { label: "대기열", cls: "bg-sky-100 text-sky-700" },
    REQUESTING: { label: "ERP 요청", cls: "bg-sky-200 text-sky-800" },
    RECEIVING: { label: "수신 중", cls: "bg-sky-200 text-sky-800" },
    DECODING: { label: "디코딩", cls: "bg-sky-200 text-sky-800" },
    VALIDATING: { label: "검증 중", cls: "bg-amber-200 text-amber-800" },
    READY: { label: "완료", cls: "bg-emerald-200 text-emerald-800" },
    FAILED: { label: "실패", cls: "bg-rose-200 text-rose-800" },
  };
  const m = map[phase];
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${m.cls}`}>{m.label}</span>;
};

function formatDate(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default ErpSyncSection;
