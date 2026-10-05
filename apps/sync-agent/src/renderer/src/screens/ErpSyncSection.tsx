// apps/sync-agent/src/renderer/src/screens/ErpSyncSection.tsx
// 2026-10-04 · 운영 중심 재구성 (사용자 승인)
//
// 역할: Local ERP data ↔ Supabase 비교/수동 동기화/모니터링 전용
//   · ERP 조회는 하단 "🔗 Iregen ERP 직접 조회"에서만 수행
//   · 각 카드: 로컬 데이터 · Supabase 비교 · 마지막 동기화 · 수동 동기화 버튼
//   · 상단: 전체 수동 동기화 버튼
//   · 상태: ● 최신 / ● 변경 있음 / ● 동기화 중 / ● 동기화 완료 / ● 오류 / ● 로컬 데이터 없음 / ● 준비 중

import React, { useCallback, useEffect, useState } from "react";
import { AutoSchedulerPanel } from "../components/AutoSchedulerPanel";

type DatasetKey = "PRODUCT_LIST" | "INVENTORY_STATUS" | "BUY_STATUS" | "SALE_STATUS";

const DATASET_LABEL: Record<DatasetKey, string> = {
  PRODUCT_LIST: "상품정보 · 현재고",
  INVENTORY_STATUS: "재고 입출고 현황",
  BUY_STATUS: "매입내역",
  SALE_STATUS: "판매내역",
};
const DATASET_ICON: Record<DatasetKey, string> = {
  PRODUCT_LIST: "📦",
  INVENTORY_STATUS: "📊",
  BUY_STATUS: "💰",
  SALE_STATUS: "🧾",
};
const ORDER: DatasetKey[] = ["PRODUCT_LIST", "BUY_STATUS", "INVENTORY_STATUS", "SALE_STATUS"];

const DATASET_IMPLEMENTED: Record<DatasetKey, boolean> = {
  PRODUCT_LIST: true,
  BUY_STATUS: true,
  INVENTORY_STATUS: true,
  SALE_STATUS: true, // 2026-10-05 · sales table 생성 완료 · saleSyncService 구현 완료
};

type Status =
  | "LOADING"
  | "NO_LOCAL"
  | "LATEST"
  | "DIRTY"           // NEW/CHANGED 존재
  | "SYNCING"
  | "SYNCED"          // 방금 성공
  | "ERROR"
  | "NOT_READY";      // SALE 등 미구현

interface CheckSummary {
  erpTotal: number;
  new: number;
  changed: number;
  same: number;
  review?: number;    // Product 전용 identityReview
  unmapped?: number;  // BUY 전용 unmappedProduct (PCode→BarCode 매칭 실패)
}

interface SyncHistoryEntry {
  id: string;
  dataset: DatasetKey;
  completedAt: string;
  ok: boolean;
  updatedRows: number;
  skippedSame: number;
  failed: number;
}

interface DatasetState {
  status: Status;
  localFetchedAt: string | null;
  localRowCount: number | null;
  queryFrom: string | null;
  queryTo: string | null;
  check: CheckSummary | null;
  changes: Array<{ identity: string; name: string; action: "NEW" | "CHANGED" | "UNMAPPED"; detail?: string }>;
  lastHistory: SyncHistoryEntry | null;
  errorMsg: string | null;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${m}.${day} ${hh}:${mm}`;
}

function friendlyError(msg: string | null): string | null {
  if (!msg) return null;
  if (/WebSocket|Node\.js detected/i.test(msg)) return "Supabase 연결 오류";
  if (/fetch|network|ENOTFOUND|ECONNREFUSED/i.test(msg)) return "네트워크 오류";
  if (/로컬 데이터 없음|no local|snapshot/i.test(msg)) return "로컬 데이터 없음";
  if (/metadata|period_start|period_end/i.test(msg)) return "조회기간 metadata 없음";
  if (/supabase.*미설정|SUPABASE_URL/i.test(msg)) return "Supabase 설정 오류";
  if (msg.length > 60) return "동기화 오류";
  return msg;
}

function statusLabel(s: Status): { dot: string; text: string; color: string } {
  switch (s) {
    case "LOADING":  return { dot: "●", text: "확인 중",       color: "#94a3b8" };
    case "NO_LOCAL": return { dot: "●", text: "로컬 데이터 없음", color: "#94a3b8" };
    case "LATEST":   return { dot: "●", text: "최신",           color: "#10b981" };
    case "DIRTY":    return { dot: "●", text: "변경 있음",       color: "#f59e0b" };
    case "SYNCING":  return { dot: "●", text: "동기화 중",       color: "#3b82f6" };
    case "SYNCED":   return { dot: "●", text: "동기화 완료",     color: "#10b981" };
    case "ERROR":    return { dot: "●", text: "오류",           color: "#ef4444" };
    case "NOT_READY":return { dot: "●", text: "준비 중",         color: "#94a3b8" };
  }
}

type AnyRow = Record<string, unknown>;

async function fetchLocalMeta(dataset: DatasetKey): Promise<{ fetchedAt: string | null; rowCount: number }> {
  const r = await window.api.erpSyncGetDatasetState(dataset) as { snapshot?: { fetchedAt?: string; rowCount?: number } | null } | null;
  const snap = r?.snapshot ?? null;
  return { fetchedAt: snap?.fetchedAt ?? null, rowCount: snap?.rowCount ?? 0 };
}

async function fetchLocalRows(dataset: DatasetKey): Promise<AnyRow[]> {
  const r = await window.api.erpSyncGetRows({ dataset, limit: 1_000_000 }) as
    | { ok: true; rows: AnyRow[]; total: number }
    | { ok: false; error: string };
  if (!r || !("ok" in r) || !r.ok) return [];
  return r.rows ?? [];
}

async function fetchLatestFetchMeta(dataset: DatasetKey): Promise<{ queryFrom?: string; queryTo?: string } | null> {
  const r = await window.api.erpGetFetchHistory({ dataset, limit: 10 });
  const list = r?.history ?? [];
  const match = list.find((e: Record<string, unknown>) => e.ok && e.queryFrom && e.queryTo);
  if (!match) return null;
  return { queryFrom: String(match.queryFrom ?? ""), queryTo: String(match.queryTo ?? "") };
}

async function fetchLatestHistory(dataset: DatasetKey): Promise<SyncHistoryEntry | null> {
  const r = await window.api.syncHistoryGet({ dataset, limit: 1 });
  const list = (r?.history ?? []) as unknown as SyncHistoryEntry[];
  return list[0] ?? null;
}

// ─── Dataset별 CHECK/APPLY 호출 추상화 ─────────────────────────────────────
async function runCheck(dataset: DatasetKey): Promise<{
  summary: CheckSummary;
  changes: DatasetState["changes"];
} | { error: string }> {
  if (dataset === "PRODUCT_LIST") {
    const r = await window.api.productSyncRunCheck();
    if (!r.ok) return { error: r.error ?? "productSync:runCheck 실패" };
    const res = (r.result ?? {}) as Record<string, unknown>;
    const entries = (res.entries ?? []) as Array<Record<string, unknown>>;
    const changes = entries
      .filter((e) => e.action === "NEW" || e.action === "CHANGED")
      .slice(0, 500)
      .map((e) => ({
        identity: String(e.pcode ?? ""),
        name: String(e.erpProductName ?? ""),
        action: e.action as "NEW" | "CHANGED",
        detail: (e.changedFields as Array<Record<string, unknown>>)?.map((cf) => `${cf.field}: ${JSON.stringify(cf.dbValue)} → ${JSON.stringify(cf.erpValue)}`).join(" · "),
      }));
    return {
      summary: {
        erpTotal: Number(res.erpTotal ?? 0),
        new: Number(res.new_ ?? 0),
        changed: Number(res.changed ?? 0),
        same: Number(res.same ?? 0),
        review: Number(res.identityReview ?? 0),
      },
      changes,
    };
  }
  if (dataset === "BUY_STATUS") {
    const rows = await fetchLocalRows(dataset);
    if (rows.length === 0) return { error: "로컬 데이터 없음" };
    const r = await window.api.buySyncRunCheck({ erpRows: rows });
    if (!r.ok) return { error: r.error ?? "buy:runCheck 실패" };
    const res = (r.result ?? {}) as Record<string, unknown>;
    const entries = (res.entries ?? []) as Array<Record<string, unknown>>;
    // 2026-10-05 · 비교내용 보기 · NEW/CHANGED + UNMAPPED 전부 표시
    //   · UNMAPPED = 상품 매칭 실패 (ERP.PCode 가 products.pcode 에 없음) · WRITE 대상 아님 · 사용자 검토
    const changes = entries
      .filter((e) => e.action === "NEW" || e.action === "CHANGED" || e.action === "UNMAPPED")
      .slice(0, 500)
      .map((e) => {
        const id = e.identity as Record<string, unknown> | undefined;
        if (e.action === "UNMAPPED") {
          return {
            identity: `${id?.bm_code ?? ""}/${id?.row_num ?? ""}`,
            name: String(e.productName ?? ""),
            action: "UNMAPPED" as const,
            detail: `상품 미매칭 · ERP PCode=${String(e.erpPCode ?? "")} · products.pcode 에 없음`,
          };
        }
        const changesRec = (e.changes ?? {}) as Record<string, { db: unknown; erp: unknown }>;
        const detail = Object.entries(changesRec).map(([f, c]) => `${f}: ${JSON.stringify(c.db)} → ${JSON.stringify(c.erp)}`).join(" · ");
        return {
          identity: `${id?.bm_code ?? ""}/${id?.row_num ?? ""}`,
          name: String(e.productName ?? ""),
          action: e.action as "NEW" | "CHANGED",
          detail,
        };
      });
    return {
      summary: {
        erpTotal: Number(res.erpTotal ?? 0),
        new: Number(res.new ?? 0),
        changed: Number(res.changed ?? 0),
        same: Number(res.same ?? 0),
        unmapped: Number(res.unmappedProduct ?? 0),
      },
      changes,
    };
  }
  if (dataset === "SALE_STATUS") {
    const rows = await fetchLocalRows(dataset);
    if (rows.length === 0) return { error: "로컬 데이터 없음" };
    const r = await window.api.saleSyncRunCheck({ erpRows: rows });
    if (!r.ok) return { error: r.error ?? "sale:runCheck 실패" };
    const res = (r.result ?? {}) as Record<string, unknown>;
    const action = String(res.action ?? "");
    const erpTotal = Number(res.erpTotal ?? 0);
    const newCount = Number(res.new ?? 0);
    const sameCount = Number(res.same ?? 0);
    const existing = Number(res.dbExistingInRange ?? 0);
    return {
      summary: {
        erpTotal,
        new: newCount,
        changed: 0,
        same: sameCount,
        unmapped: 0,
      },
      changes: newCount > 0
        ? [{ identity: `${res.saleDateMin ?? ""}~${res.saleDateMax ?? ""}`, name: `${newCount}건 INSERT 예정 · ${sameCount}건 이미 저장됨`, action: "NEW" as const, detail: `DB 범위 내 ${existing}건 · row-level fingerprint 비교` }]
        : [{ identity: `${res.saleDateMin ?? ""}~${res.saleDateMax ?? ""}`, name: `${sameCount}건 전부 이미 저장됨`, action: "NEW" as const, detail: `신규 row 없음 · action=${action}` }],
    };
  }
  if (dataset === "INVENTORY_STATUS") {
    const [rows, meta] = await Promise.all([fetchLocalRows(dataset), fetchLatestFetchMeta(dataset)]);
    if (rows.length === 0) return { error: "로컬 데이터 없음" };
    if (!meta?.queryFrom || !meta?.queryTo) return { error: "조회기간 metadata 없음 (fetch-history)" };
    const r = await window.api.stockHistorySyncRunCheck({
      erpRows: rows,
      metadata: { period_start: meta.queryFrom, period_end: meta.queryTo },
    });
    if (!r.ok) return { error: r.error ?? "stockHistory:runCheck 실패" };
    const res = (r.result ?? {}) as Record<string, unknown>;
    const entries = (res.entries ?? []) as Array<Record<string, unknown>>;
    const changes = entries
      .filter((e) => e.action === "NEW" || e.action === "CHANGED")
      .slice(0, 500)
      .map((e) => {
        const id = e.identity as Record<string, unknown> | undefined;
        const changesRec = (e.changes ?? {}) as Record<string, { db: unknown; erp: unknown }>;
        const detail = Object.entries(changesRec).map(([f, c]) => `${f}: ${JSON.stringify(c.db)} → ${JSON.stringify(c.erp)}`).join(" · ");
        return {
          identity: `${id?.st_code ?? ""}/${id?.pcode ?? ""}`,
          name: String(e.productName ?? ""),
          action: e.action as "NEW" | "CHANGED",
          detail,
        };
      });
    return {
      summary: {
        erpTotal: Number(res.erpTotal ?? 0),
        new: Number(res.new ?? 0),
        changed: Number(res.changed ?? 0),
        same: Number(res.same ?? 0),
      },
      changes,
    };
  }
  return { error: "미구현 Dataset" };
}

async function runApply(dataset: DatasetKey): Promise<{ ok: boolean; message: string }> {
  if (dataset === "PRODUCT_LIST") {
    const r = await window.api.productSyncApplyWrite({ allowWrite: true });
    if (!r.ok) return { ok: false, message: r.error ?? "WRITE 실패" };
    const res = (r.result ?? {}) as Record<string, unknown>;
    return { ok: true, message: `UPDATE ${res.updatedRows ?? 0} · 실패 ${res.failed ?? 0}` };
  }
  if (dataset === "BUY_STATUS") {
    const rows = await fetchLocalRows(dataset);
    if (rows.length === 0) return { ok: false, message: "로컬 데이터 없음" };
    const r = await window.api.buySyncApplyWrite({ erpRows: rows, allowWrite: true });
    if (!r.ok) return { ok: false, message: r.error ?? "WRITE 실패" };
    const res = (r.result ?? {}) as Record<string, unknown>;
    return { ok: true, message: `INSERT ${res.inserted ?? 0} · UPDATE ${res.updated ?? 0} · 실패 ${res.failed ?? 0}` };
  }
  if (dataset === "INVENTORY_STATUS") {
    const [rows, meta] = await Promise.all([fetchLocalRows(dataset), fetchLatestFetchMeta(dataset)]);
    if (rows.length === 0) return { ok: false, message: "로컬 데이터 없음" };
    if (!meta?.queryFrom || !meta?.queryTo) return { ok: false, message: "조회기간 metadata 없음" };
    const r = await window.api.stockHistorySyncApplyWrite({
      erpRows: rows,
      metadata: { period_start: meta.queryFrom, period_end: meta.queryTo },
      allowWrite: true,
    });
    if (!r.ok) return { ok: false, message: r.error ?? "WRITE 실패" };
    const res = (r.result ?? {}) as Record<string, unknown>;
    return { ok: true, message: `INSERT ${res.inserted ?? 0} · UPDATE ${res.updated ?? 0} · 실패 ${res.failed ?? 0}` };
  }
  if (dataset === "SALE_STATUS") {
    const rows = await fetchLocalRows(dataset);
    if (rows.length === 0) return { ok: false, message: "로컬 데이터 없음" };
    const r = await window.api.saleSyncApplyWrite({ erpRows: rows, allowWrite: true });
    if (!r.ok) return { ok: false, message: r.error ?? "WRITE 실패" };
    const res = (r.result ?? {}) as Record<string, unknown>;
    if (res.action === "NOTHING_TO_DO") return { ok: true, message: String(res.message ?? "신규 row 없음 · INSERT 대상 없음") };
    return { ok: true, message: `INSERT ${res.inserted ?? 0}/${res.new ?? 0} · 실패 ${res.failed ?? 0}` };
  }
  return { ok: false, message: "미구현" };
}

// ─── UI 컴포넌트 ────────────────────────────────────────────────────────────
interface CardProps {
  dataset: DatasetKey;
  state: DatasetState;
  onRefresh: () => void;
  onSync: () => void;
  onShowChanges: () => void;
  onShowLocal: () => void;
}

const DatasetCard: React.FC<CardProps> = ({ dataset, state, onRefresh, onSync, onShowChanges, onShowLocal }) => {
  const sl = statusLabel(state.status);
  const notReady = !DATASET_IMPLEMENTED[dataset];
  const check = state.check;
  // 2026-10-05 · 사용자 지시 · NEW + CHANGED = 0 이면 "동기화 완료" 상태로 버튼 비활성화
  const dirtyCount = check ? (check.new + check.changed) : 0;
  const canSync =
    !notReady &&
    state.status !== "SYNCING" &&
    state.status !== "NO_LOCAL" &&
    state.status !== "LOADING" &&
    dirtyCount > 0;
  // 2026-10-05 · 사용자 명시 지시 · "미동기화" 라벨 완전 제거
  //   · NEW+CHANGED=0 → ERP ↔ Supabase 완전 일치 → 상태 "변경 없음" 하나로 통일
  //   · lastHistory 유무는 라벨에 영향 없음 (WRITE 가 필요 없었던 것은 미동기화 아님)
  const syncLabel = !check
    ? "Supabase 수동 동기화"
    : dirtyCount > 0
      ? `Supabase 수동 동기화 (${dirtyCount}건)`
      : "변경 없음";

  return (
    <div style={{
      background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #e5e7eb",
      display: "flex", flexDirection: "column", gap: 14, minHeight: 320,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 600 }}>
          <span>{DATASET_ICON[dataset]}</span>
          <span>{DATASET_LABEL[dataset]}</span>
        </div>
        <div style={{ fontSize: 13, color: sl.color, fontWeight: 500 }}>
          <span style={{ marginRight: 4 }}>{sl.dot}</span>{sl.text}
        </div>
      </div>

      {notReady ? (
        <div style={{ color: "#94a3b8", fontSize: 14, padding: "40px 0", textAlign: "center" }}>
          준비 중입니다.
        </div>
      ) : (
        <>
          {/* 로컬 데이터 */}
          <div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>로컬 데이터</div>
            <div style={{ fontSize: 13, color: "#334155" }}>
              <strong>{formatTime(state.localFetchedAt)}</strong>
              {" · "}
              <strong>{state.localRowCount != null ? state.localRowCount.toLocaleString() + "건" : "-"}</strong>
            </div>
            {state.queryFrom && state.queryTo && (
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                조회기간 {state.queryFrom} ~ {state.queryTo}
              </div>
            )}
            <button onClick={onShowLocal} disabled={!state.localRowCount}
              style={{ marginTop: 6, padding: "4px 10px", fontSize: 12, border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", cursor: state.localRowCount ? "pointer" : "not-allowed", color: "#334155" }}>
              내용 보기
            </button>
          </div>

          {/* Supabase 비교 */}
          <div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Supabase 비교</div>
            {!check ? (
              <div style={{ fontSize: 13, color: "#94a3b8" }}>{state.status === "LOADING" ? "확인 중..." : "비교 결과 없음"}</div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>
                  신규 <strong style={{ color: check.new > 0 ? "#f59e0b" : "#334155" }}>{check.new}건</strong>
                  {" · "}변경 <strong style={{ color: check.changed > 0 ? "#f59e0b" : "#334155" }}>{check.changed}건</strong>
                  {" · "}동일 <strong>{check.same.toLocaleString()}건</strong>
                  {check.review != null && check.review > 0 && (<>{" · "}검토 <strong>{check.review}건</strong></>)}
                  {check.unmapped != null && check.unmapped > 0 && (
                    <>{" · "}미매칭 <strong style={{ color: "#64748b" }}>{check.unmapped}건</strong></>
                  )}
                </div>
                <button onClick={onShowChanges}
                  style={{ marginTop: 6, padding: "4px 10px", fontSize: 12, border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#334155" }}>
                  비교내용 보기
                </button>
              </>
            )}
          </div>

          {/* 마지막 동기화 */}
          <div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6, fontWeight: 500 }}>마지막 동기화</div>
            {state.lastHistory ? (
              <div style={{ fontSize: 13, color: "#334155" }}>
                {formatTime(state.lastHistory.completedAt)} ·{" "}
                INSERT/UPDATE {state.lastHistory.updatedRows.toLocaleString()}건 ·{" "}
                실패 {state.lastHistory.failed}건 ·{" "}
                <strong style={{ color: state.lastHistory.ok ? "#10b981" : "#ef4444" }}>
                  {state.lastHistory.ok ? "성공 ✓" : "실패"}
                </strong>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#94a3b8" }}>이력 없음</div>
            )}
          </div>

          {state.errorMsg && (
            <div
              title={state.errorMsg}
              style={{ fontSize: 12, color: "#ef4444", padding: "6px 10px", background: "#fef2f2", borderRadius: 6 }}
            >
              {friendlyError(state.errorMsg)}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
            <button onClick={onRefresh} disabled={state.status === "SYNCING" || state.status === "LOADING"}
              style={{ padding: "8px 14px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#334155" }}>
              다시 확인
            </button>
            <button onClick={onSync} disabled={!canSync}
              style={{
                flex: 1, padding: "8px 14px", fontSize: 13, borderRadius: 6, border: "none",
                background: canSync ? "#2563eb" : "#cbd5e1", color: "#fff", fontWeight: 600,
                cursor: canSync ? "pointer" : "not-allowed",
              }}>
              {syncLabel}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Modal ──────────────────────────────────────────────────────────────────
interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}
const Modal: React.FC<ModalProps> = ({ title, onClose, children }) => (
  <div onClick={onClose} style={{
    position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center",
    justifyContent: "center", zIndex: 1000,
  }}>
    <div onClick={(e) => e.stopPropagation()} style={{
      background: "#fff", borderRadius: 12, padding: 20, width: "min(900px, 90vw)",
      maxHeight: "80vh", display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
        <button onClick={onClose} style={{ fontSize: 14, border: "none", background: "transparent", cursor: "pointer", color: "#64748b" }}>닫기</button>
      </div>
      <div style={{ overflow: "auto", flex: 1 }}>{children}</div>
    </div>
  </div>
);

// ─── Main ───────────────────────────────────────────────────────────────────
const ErpSyncSection: React.FC = () => {
  const [states, setStates] = useState<Record<DatasetKey, DatasetState>>(() => {
    const base: Record<string, DatasetState> = {};
    for (const d of ORDER) {
      base[d] = {
        status: DATASET_IMPLEMENTED[d] ? "LOADING" : "NOT_READY",
        localFetchedAt: null, localRowCount: null,
        queryFrom: null, queryTo: null,
        check: null, changes: [], lastHistory: null, errorMsg: null,
      };
    }
    return base as Record<DatasetKey, DatasetState>;
  });
  const [modalDataset, setModalDataset] = useState<DatasetKey | null>(null);
  const [modalType, setModalType] = useState<"changes" | "local" | null>(null);
  const [localRows, setLocalRows] = useState<AnyRow[] | null>(null);

  const refreshDataset = useCallback(async (dataset: DatasetKey) => {
    if (!DATASET_IMPLEMENTED[dataset]) return;
    setStates((prev) => ({ ...prev, [dataset]: { ...prev[dataset], status: "LOADING", errorMsg: null } }));
    try {
      const [meta, lastHistory, fetchMeta] = await Promise.all([
        fetchLocalMeta(dataset),
        fetchLatestHistory(dataset),
        fetchLatestFetchMeta(dataset),
      ]);
      if (meta.rowCount === 0) {
        setStates((prev) => ({
          ...prev,
          [dataset]: {
            ...prev[dataset],
            status: "NO_LOCAL",
            localFetchedAt: null, localRowCount: 0,
            queryFrom: null, queryTo: null,
            check: null, changes: [], lastHistory,
          },
        }));
        return;
      }
      const check = await runCheck(dataset);
      if ("error" in check) {
        setStates((prev) => ({
          ...prev,
          [dataset]: {
            ...prev[dataset],
            status: "ERROR",
            localFetchedAt: meta.fetchedAt, localRowCount: meta.rowCount,
            queryFrom: fetchMeta?.queryFrom ?? null, queryTo: fetchMeta?.queryTo ?? null,
            check: null, changes: [], lastHistory,
            errorMsg: check.error,
          },
        }));
        return;
      }
      const status: Status = (check.summary.new + check.summary.changed) === 0 ? "LATEST" : "DIRTY";
      setStates((prev) => ({
        ...prev,
        [dataset]: {
          ...prev[dataset],
          status,
          localFetchedAt: meta.fetchedAt, localRowCount: meta.rowCount,
          queryFrom: fetchMeta?.queryFrom ?? null, queryTo: fetchMeta?.queryTo ?? null,
          check: check.summary, changes: check.changes, lastHistory, errorMsg: null,
        },
      }));
    } catch (err) {
      setStates((prev) => ({
        ...prev,
        [dataset]: { ...prev[dataset], status: "ERROR", errorMsg: (err as Error).message },
      }));
    }
  }, []);

  const syncDataset = useCallback(async (dataset: DatasetKey) => {
    if (!DATASET_IMPLEMENTED[dataset]) return;
    setStates((prev) => ({ ...prev, [dataset]: { ...prev[dataset], status: "SYNCING", errorMsg: null } }));
    try {
      const r = await runApply(dataset);
      if (!r.ok) {
        setStates((prev) => ({ ...prev, [dataset]: { ...prev[dataset], status: "ERROR", errorMsg: r.message } }));
        return;
      }
      setStates((prev) => ({ ...prev, [dataset]: { ...prev[dataset], status: "SYNCED" } }));
      await refreshDataset(dataset);
    } catch (err) {
      setStates((prev) => ({ ...prev, [dataset]: { ...prev[dataset], status: "ERROR", errorMsg: (err as Error).message } }));
    }
  }, [refreshDataset]);

  const syncAll = useCallback(async () => {
    for (const d of ORDER) {
      if (!DATASET_IMPLEMENTED[d]) continue;
      const s = states[d];
      if (!s.check) continue;
      if (s.check.new + s.check.changed === 0) continue;
      await syncDataset(d);
    }
  }, [states, syncDataset]);

  useEffect(() => {
    for (const d of ORDER) {
      if (DATASET_IMPLEMENTED[d]) void refreshDataset(d);
    }
  }, [refreshDataset]);

  const showLocal = useCallback(async (dataset: DatasetKey) => {
    const rows = await fetchLocalRows(dataset);
    setLocalRows(rows.slice(0, 200));
    setModalDataset(dataset);
    setModalType("local");
  }, []);

  const showChanges = useCallback((dataset: DatasetKey) => {
    setModalDataset(dataset);
    setModalType("changes");
  }, []);

  const closeModal = useCallback(() => {
    setModalDataset(null);
    setModalType(null);
    setLocalRows(null);
  }, []);

  // 전체 수동 동기화 활성화 조건
  //   · NEW + CHANGED 가 양수인 활성 카드가 하나도 없으면 비활성화
  //   · SYNCING/LOADING/NO_LOCAL 상태 카드는 집계에서 제외 (중복 트리거 방지)
  const totalDirty = ORDER.reduce((acc, d) => {
    const s = states[d];
    if (!DATASET_IMPLEMENTED[d]) return acc;
    if (!s.check) return acc;
    if (s.status === "SYNCING" || s.status === "LOADING" || s.status === "NO_LOCAL") return acc;
    const n = Number(s.check.new) || 0;
    const c = Number(s.check.changed) || 0;
    return acc + n + c;
  }, 0);

  return (
    <div style={{ padding: 20, background: "#f8fafc" }}>
      {/* 상단 헤더 */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #e5e7eb", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              <span>⚡</span><span>ERP → Supabase 동기화</span>
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 6, lineHeight: 1.5 }}>
              로컬에 저장된 ERP 데이터를 Supabase 와 비교하고 변경된 데이터만 동기화합니다.
              <br />ERP 조회는 하단 "🔗 Iregen ERP 데이터 조회 및 로컬저장"에서 수행합니다.
            </div>
          </div>
          <button onClick={syncAll} disabled={totalDirty === 0}
            style={{
              padding: "10px 18px", fontSize: 14, borderRadius: 8, border: "none",
              background: totalDirty > 0 ? "#2563eb" : "#cbd5e1", color: "#fff", fontWeight: 600,
              cursor: totalDirty > 0 ? "pointer" : "not-allowed", whiteSpace: "nowrap",
            }}>
            {totalDirty > 0 ? `전체 수동 동기화 (${totalDirty}건)` : "동기화 완료"}
          </button>
        </div>
      </div>

      {/* 자동 임포트 설정 (Dataset 별 독립) · 사용자 지시 2026-10-05 */}
      <AutoSchedulerPanel />

      {/* 4 Dataset 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
        {ORDER.map((d) => (
          <DatasetCard
            key={d}
            dataset={d}
            state={states[d]}
            onRefresh={() => refreshDataset(d)}
            onSync={() => syncDataset(d)}
            onShowChanges={() => showChanges(d)}
            onShowLocal={() => showLocal(d)}
          />
        ))}
      </div>

      {/* Modal */}
      {modalDataset && modalType === "changes" && (
        <Modal title={`${DATASET_LABEL[modalDataset]} · 비교내용`} onClose={closeModal}>
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            {states[modalDataset].changes.length === 0 ? (
              <div style={{ color: "#94a3b8", textAlign: "center", padding: 40 }}>변경 없음</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ background: "#f1f5f9", position: "sticky", top: 0 }}>
                  <tr>
                    <th style={{ padding: 8, textAlign: "left", fontSize: 12, color: "#64748b" }}>구분</th>
                    <th style={{ padding: 8, textAlign: "left", fontSize: 12, color: "#64748b" }}>identity</th>
                    <th style={{ padding: 8, textAlign: "left", fontSize: 12, color: "#64748b" }}>상품명</th>
                    <th style={{ padding: 8, textAlign: "left", fontSize: 12, color: "#64748b" }}>상세</th>
                  </tr>
                </thead>
                <tbody>
                  {states[modalDataset].changes.map((c, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: 8, fontWeight: 600, color: c.action === "NEW" ? "#2563eb" : "#f59e0b" }}>{c.action}</td>
                      <td style={{ padding: 8, fontFamily: "monospace", fontSize: 12 }}>{c.identity}</td>
                      <td style={{ padding: 8 }}>{c.name}</td>
                      <td style={{ padding: 8, fontSize: 12, color: "#334155" }}>{c.detail ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Modal>
      )}
      {modalDataset && modalType === "local" && localRows && (
        <Modal title={`${DATASET_LABEL[modalDataset]} · 로컬 데이터 (최대 200 행)`} onClose={closeModal}>
          <div style={{ fontSize: 12, fontFamily: "monospace" }}>
            {localRows.length === 0 ? (
              <div style={{ color: "#94a3b8", textAlign: "center", padding: 40 }}>
                로컬 데이터 없음 · ERP 조회 후 다시 시도하세요
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ background: "#f1f5f9", position: "sticky", top: 0 }}>
                  <tr>
                    {Object.keys(localRows[0] ?? {}).slice(0, 10).map((k) => (
                      <th key={k} style={{ padding: 6, textAlign: "left", color: "#64748b" }}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {localRows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      {Object.keys(localRows[0] ?? {}).slice(0, 10).map((k) => (
                        <td key={k} style={{ padding: 6 }}>{String(r[k] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ErpSyncSection;
export { ErpSyncSection };
