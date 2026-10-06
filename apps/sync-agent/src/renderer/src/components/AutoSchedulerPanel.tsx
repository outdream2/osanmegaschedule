// apps/sync-agent/src/renderer/src/components/AutoSchedulerPanel.tsx
// 2026-10-05 · Dataset 별 독립 자동 Scheduler 설정 UI
// 2026-10-06 · VENDOR 활성화 (사용자 승인 · BuyCustomer_List → vendors sync)
//   · PRODUCT / BUY / INVENTORY / SALE / VENDOR 각자 ON/OFF + 주기 + 시간/요일
//   · 설정 변경 즉시 config:patch 호출 → main 쪽 rescheduleDataset 자동 트리거
//   · lastRunAt / nextRunAt / result 표시 + 최근 10건 이력 접기/펼치기

import React, { useCallback, useEffect, useState } from "react";

type DsKey = "PRODUCT" | "BUY" | "INVENTORY" | "SALE" | "VENDOR";
type Interval = "30min" | "1h" | "2h" | "4h" | "6h" | "12h" | "daily" | "weekly";
type SyncDataset = "PRODUCT_LIST" | "INVENTORY_STATUS" | "BUY_STATUS" | "SALE_STATUS" | "VENDOR_LIST";

interface DsSchedule {
  enabled: boolean;
  interval: Interval;
  time: string;        // "HH:MM"
  weekday: number;     // 0-6
  lastRunAt?: string;
  lastRunResult?: string;
  nextRunAt?: string;
  active?: boolean;
}

interface SyncHistoryError {
  identity: string;
  message: string;
  // 2026-10-06 · 사용자 요청 · recoverable 분류
  errorType?: string;
  operation?: "INSERT" | "UPDATE";
  dbCode?: string;
  cause?: string;
  recovery?: "SAME" | "UPDATED" | "UNRECOVERED";
}

interface SyncHistoryItem {
  id: string;
  completedAt: string;
  ok: boolean;
  updatedRows: number;
  failed: number;
  // 2026-10-06 · 사용자 요청 · 실패 entry 클릭 시 모달 상세 표시
  errors?: SyncHistoryError[];
  startedAt?: string;
  updatedCells?: number;
  skippedSame?: number;
  webModified?: number;
  identityModified?: number;
  readbackMatched?: number;
  readbackMismatch?: number;
  erpCacheRowCount?: number;
  // 2026-10-06 · 사용자 요청 · 23505 recovery 통계
  recoveredSame?: number;
  recoveredUpdated?: number;
  erpInternalDuplicates?: number;
}

// 2026-10-05 · scheduler DsKey ↔ syncHistoryStore DatasetKey 매핑
// 2026-10-06 · VENDOR_LIST 활성화 (사용자 승인 · BuyCustomer_List → vendors sync)
const DS_TO_SYNC_DATASET: Record<DsKey, SyncDataset> = {
  PRODUCT:   "PRODUCT_LIST",
  BUY:       "BUY_STATUS",
  INVENTORY: "INVENTORY_STATUS",
  SALE:      "SALE_STATUS",
  VENDOR:    "VENDOR_LIST",
};

const DS_ORDER: DsKey[] = ["PRODUCT", "BUY", "INVENTORY", "SALE", "VENDOR"];
const DS_LABEL: Record<DsKey, string> = {
  PRODUCT:   "상품정보",
  BUY:       "매입내역",
  INVENTORY: "재고 입출고",
  SALE:      "판매내역",
  VENDOR:    "공급사",
};
const DS_ICON: Record<DsKey, string> = {
  PRODUCT: "📦", BUY: "💰", INVENTORY: "📊", SALE: "🧾", VENDOR: "🏢",
};
const INTERVAL_OPTIONS: Array<{ v: Interval; label: string }> = [
  { v: "30min",  label: "30분마다" },
  { v: "1h",     label: "1시간마다" },
  { v: "2h",     label: "2시간마다" },
  { v: "4h",     label: "4시간마다" },
  { v: "6h",     label: "6시간마다" },
  { v: "12h",    label: "12시간마다" },
  { v: "daily",  label: "매일" },
  { v: "weekly", label: "매주" },
];
const WEEKDAY_LABEL = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

function fmt(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  const H = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${M}.${D} ${H}:${m}`;
}
// 2026-10-06 · 사용자 지정 3색 체계
//   🟢 SUCCESS = 오류 없이 완료
//   🟠 WARNING = 중간 충돌 발생 · fresh query 후 자동 복구 완료 (사람 확인 불필요)
//   🔴 PARTIAL / FAILED = 실제 DB 저장 실패 · 사람 확인 필요
function resultLabel(r?: string): { text: string; color: string } {
  if (!r) return { text: "-", color: "#94a3b8" };
  if (r === "SUCCESS") return { text: "성공", color: "#10b981" };
  if (r === "WARNING") return { text: "복구", color: "#f59e0b" };
  if (r === "SKIPPED") return { text: "SKIPPED", color: "#94a3b8" };
  if (r === "PARTIAL") return { text: "실패", color: "#ef4444" };
  return { text: "실패", color: "#ef4444" };
}

export const AutoSchedulerPanel: React.FC = () => {
  const [datasets, setDatasets] = useState<Record<DsKey, DsSchedule> | null>(null);
  const [saving, setSaving] = useState<DsKey | null>(null);
  // 2026-10-05 · 사용자 요청 · 각 dataset 최근 10건 이력 리스트
  const [history, setHistory] = useState<Record<DsKey, SyncHistoryItem[]>>({
    PRODUCT: [], BUY: [], INVENTORY: [], SALE: [], VENDOR: [],
  });
  const [openHistory, setOpenHistory] = useState<DsKey | null>(null);
  // 2026-10-06 · 사용자 요청 · 실패 entry 클릭 시 모달로 errors[] 상세 표시
  const [detailModal, setDetailModal] = useState<{ ds: DsKey; item: SyncHistoryItem } | null>(null);

  const load = useCallback(async () => {
    const r = await window.api.erpSchedulerGetStatus();
    if (r?.ok && r.status) setDatasets(r.status as Record<DsKey, DsSchedule>);
  }, []);

  const loadHistory = useCallback(async () => {
    const next: Record<DsKey, SyncHistoryItem[]> = {
      PRODUCT: [], BUY: [], INVENTORY: [], SALE: [], VENDOR: [],
    };
    for (const ds of DS_ORDER) {
      const mapped = DS_TO_SYNC_DATASET[ds];
      try {
        const r = await window.api.syncHistoryGet({ dataset: mapped, limit: 10 });
        if (r?.ok && Array.isArray(r.history)) {
          next[ds] = r.history.slice(0, 10).map((h) => {
            const rec = h as Record<string, unknown>;
            const rawErrs = Array.isArray(rec.errors) ? rec.errors as unknown[] : [];
            return {
              id: String(rec.id ?? ""),
              completedAt: String(rec.completedAt ?? ""),
              ok: Boolean(rec.ok),
              updatedRows: Number(rec.updatedRows ?? 0),
              failed: Number(rec.failed ?? 0),
              errors: rawErrs.map((e) => {
                const er = e as Record<string, unknown>;
                return {
                  identity: typeof er.identity === "string" ? er.identity : JSON.stringify(er.identity ?? ""),
                  message: String(er.message ?? ""),
                  errorType: typeof er.errorType === "string" ? er.errorType : undefined,
                  operation: er.operation === "INSERT" || er.operation === "UPDATE" ? er.operation : undefined,
                  dbCode: typeof er.dbCode === "string" ? er.dbCode : undefined,
                  cause: typeof er.cause === "string" ? er.cause : undefined,
                  recovery: er.recovery === "SAME" || er.recovery === "UPDATED" || er.recovery === "UNRECOVERED" ? er.recovery : undefined,
                };
              }),
              startedAt: typeof rec.startedAt === "string" ? rec.startedAt : undefined,
              updatedCells: rec.updatedCells == null ? undefined : Number(rec.updatedCells),
              skippedSame: rec.skippedSame == null ? undefined : Number(rec.skippedSame),
              webModified: rec.webModified == null ? undefined : Number(rec.webModified),
              identityModified: rec.identityModified == null ? undefined : Number(rec.identityModified),
              readbackMatched: rec.readbackMatched == null ? undefined : Number(rec.readbackMatched),
              readbackMismatch: rec.readbackMismatch == null ? undefined : Number(rec.readbackMismatch),
              erpCacheRowCount: rec.erpCacheRowCount == null ? undefined : Number(rec.erpCacheRowCount),
              recoveredSame: rec.recoveredSame == null ? undefined : Number(rec.recoveredSame),
              recoveredUpdated: rec.recoveredUpdated == null ? undefined : Number(rec.recoveredUpdated),
              erpInternalDuplicates: rec.erpInternalDuplicates == null ? undefined : Number(rec.erpInternalDuplicates),
            };
          });
        }
      } catch {
        /* ignore · 개별 dataset 실패해도 다른 dataset 영향 X */
      }
    }
    setHistory(next);
  }, []);

  useEffect(() => {
    void load();
    void loadHistory();
    const t = setInterval(() => {
      void load();
      void loadHistory();
    }, 30_000);
    return () => clearInterval(t);
  }, [load, loadHistory]);

  const patch = useCallback(async (ds: DsKey, change: Partial<DsSchedule>) => {
    if (!datasets) return;
    setSaving(ds);
    try {
      const next = { ...datasets[ds], ...change };
      await window.api.patchConfig({ erpAutoScheduler: { datasets: { [ds]: next } } } as never);
      await load();
    } finally {
      setSaving(null);
    }
  }, [datasets, load]);

  if (!datasets) return <div style={{ padding: 20, color: "#94a3b8" }}>자동 임포트 설정 로드 중...</div>;

  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #e5e7eb", marginBottom: 20 }}>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
        <span>🕒</span><span>자동 임포트 설정</span>
        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 400, marginLeft: 8 }}>
          Dataset 별 독립 scheduler · 설정 변경 즉시 반영
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
        {DS_ORDER.map((ds) => {
          const s = datasets[ds];
          const result = resultLabel(s.lastRunResult);
          return (
            <div key={ds} style={{
              border: "1px solid #e5e7eb", borderRadius: 10, padding: 12,
              background: "#fff",
              display: "flex", flexDirection: "column", gap: 8, fontSize: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
                  <span>{DS_ICON[ds]}</span><span>{DS_LABEL[ds]}</span>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={!!s.enabled}
                    disabled={saving === ds}
                    onChange={(e) => void patch(ds, { enabled: e.target.checked })}
                  />
                  <span>자동</span>
                </label>
              </div>
              <div>
                <div style={{ color: "#64748b", marginBottom: 2 }}>주기</div>
                <select
                  value={s.interval}
                  disabled={!s.enabled || saving === ds}
                  onChange={(e) => void patch(ds, { interval: e.target.value as Interval })}
                  style={{ width: "100%", padding: "4px 6px", fontSize: 12, border: "1px solid #cbd5e1", borderRadius: 6 }}
                >
                  {INTERVAL_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              </div>
              {s.interval !== "30min" && (
                <div>
                  <div style={{ color: "#64748b", marginBottom: 2 }}>
                    {s.interval === "daily" || s.interval === "weekly" ? "시간" : "기준시간"}
                  </div>
                  <input
                    type="time"
                    value={s.time || "02:00"}
                    disabled={!s.enabled || saving === ds}
                    onChange={(e) => void patch(ds, { time: e.target.value })}
                    style={{ width: "100%", padding: "4px 6px", fontSize: 12, border: "1px solid #cbd5e1", borderRadius: 6 }}
                  />
                  {s.interval !== "daily" && s.interval !== "weekly" && s.interval !== "1h" && (
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                      이 시간부터 {s.interval === "2h" ? "2시간" : s.interval === "4h" ? "4시간" : s.interval === "6h" ? "6시간" : "12시간"}마다
                    </div>
                  )}
                  {s.interval === "1h" && (
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                      매 정각 M분 (분 단위만 사용)
                    </div>
                  )}
                </div>
              )}
              {s.interval === "weekly" && (
                <div>
                  <div style={{ color: "#64748b", marginBottom: 2 }}>요일</div>
                  <select
                    value={s.weekday ?? 0}
                    disabled={!s.enabled || saving === ds}
                    onChange={(e) => void patch(ds, { weekday: Number(e.target.value) })}
                    style={{ width: "100%", padding: "4px 6px", fontSize: 12, border: "1px solid #cbd5e1", borderRadius: 6 }}
                  >
                    {WEEKDAY_LABEL.map((w, i) => <option key={i} value={i}>{w}</option>)}
                  </select>
                </div>
              )}
              <div style={{ borderTop: "1px dashed #e5e7eb", paddingTop: 6, color: "#334155", lineHeight: 1.6 }}>
                <div><span style={{ color: "#64748b" }}>다음</span> {fmt(s.nextRunAt)}</div>
                <div>
                  <span style={{ color: "#64748b" }}>마지막</span> {fmt(s.lastRunAt)} ·{" "}
                  <span style={{ color: result.color, fontWeight: 600 }}>{result.text}</span>
                </div>
              </div>

              {/* 2026-10-05 · 사용자 요청 · 최근 10건 이력 보기 (2026-10-06 · VENDOR 포함 전 dataset) */}
              {(() => {
                const list = history[ds];
                const succ = list.filter((h) => h.ok).length;
                const fail = list.length - succ;
                const expanded = openHistory === ds;
                return (
                  <div style={{ borderTop: "1px dashed #e5e7eb", paddingTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => setOpenHistory(expanded ? null : ds)}
                      style={{
                        width: "100%", padding: "4px 6px", fontSize: 11,
                        border: "1px solid #e2e8f0", borderRadius: 6,
                        background: "#f8fafc", cursor: "pointer", color: "#475569",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}
                    >
                      <span>이력 {list.length === 0 ? "(없음)" : `(최근 ${list.length})`}</span>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>
                        {list.length > 0 && <>성공 {succ} · 실패 {fail} · </>}
                        {expanded ? "▲" : "▼"}
                      </span>
                    </button>
                    {expanded && list.length > 0 && (
                      <div style={{
                        marginTop: 4, maxHeight: 180, overflowY: "auto",
                        border: "1px solid #e2e8f0", borderRadius: 6, background: "#fafafa",
                      }}>
                        {list.map((h) => {
                          // 2026-10-06 · 사용자 지정 3색 체계
                          //   recovered > 0 && ok 이면 🟠 WARNING · 그래도 클릭해서 상세 가능
                          const recovered = (h.recoveredSame ?? 0) + (h.recoveredUpdated ?? 0);
                          const status: "SUCCESS" | "WARNING" | "FAILED" =
                            !h.ok ? "FAILED" : recovered > 0 ? "WARNING" : "SUCCESS";
                          const clickable = status !== "SUCCESS";
                          const dotColor = status === "SUCCESS" ? "#10b981" : status === "WARNING" ? "#f59e0b" : "#ef4444";
                          const bgColor = status === "SUCCESS" ? "transparent" : status === "WARNING" ? "#fffbeb" : "#fef2f2";
                          const hoverBg = status === "WARNING" ? "#fef3c7" : "#fee2e2";
                          const label = status === "SUCCESS" ? "성공" : status === "WARNING" ? "복구" : "실패";
                          const labelColor = dotColor;
                          const title = status === "WARNING"
                            ? "클릭 · 복구 상세 보기 (중간 충돌 발생 · 자동 복구 완료)"
                            : status === "FAILED"
                              ? "클릭 · 실패 상세 보기 (사람 확인 필요)"
                              : undefined;
                          return (
                            <div
                              key={h.id}
                              onClick={clickable ? () => setDetailModal({ ds, item: h }) : undefined}
                              title={title}
                              style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "4px 8px",
                                borderBottom: "1px solid #e5e7eb",
                                fontSize: 11,
                                background: bgColor,
                                cursor: clickable ? "pointer" : "default",
                              }}
                              onMouseEnter={(e) => { if (clickable) (e.currentTarget as HTMLDivElement).style.background = hoverBg; }}
                              onMouseLeave={(e) => { if (clickable) (e.currentTarget as HTMLDivElement).style.background = bgColor; }}
                            >
                              <span style={{
                                display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                                background: dotColor, flexShrink: 0,
                              }} />
                              <span style={{ color: "#64748b", fontVariantNumeric: "tabular-nums", minWidth: 68 }}>
                                {fmt(h.completedAt)}
                              </span>
                              <span style={{ color: "#334155", flex: 1, fontVariantNumeric: "tabular-nums" }}>
                                {h.updatedRows.toLocaleString()}건
                                {recovered > 0 && (
                                  <span style={{ color: "#b45309", marginLeft: 4 }}>· 복구 {recovered.toLocaleString()}</span>
                                )}
                                {h.failed > 0 && (
                                  <span style={{ color: "#ef4444", marginLeft: 4 }}>· 실패 {h.failed.toLocaleString()}</span>
                                )}
                              </span>
                              <strong style={{ color: labelColor, fontSize: 10, flexShrink: 0 }}>
                                {label}
                              </strong>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>
          );
        })}
      </div>

      {/* 2026-10-06 · 사용자 요청 · 실패 entry 상세 모달 */}
      {detailModal && (
        <div
          onClick={() => setDetailModal(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 12, maxWidth: 760, width: "100%",
              maxHeight: "85vh", display: "flex", flexDirection: "column",
              overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 18px", borderBottom: "1px solid #e5e7eb",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>{DS_ICON[detailModal.ds]}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>
                    {DS_LABEL[detailModal.ds]} · 동기화 실패 상세
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                    {detailModal.item.startedAt ? `${fmt(detailModal.item.startedAt)} ~ ` : ""}{fmt(detailModal.item.completedAt)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                style={{
                  padding: "4px 10px", border: "1px solid #cbd5e1", borderRadius: 6,
                  background: "#fff", cursor: "pointer", fontSize: 12, color: "#475569",
                }}
              >
                닫기
              </button>
            </div>
            <div style={{ padding: "12px 18px", overflow: "auto" }}>
              {/* 요약 통계 */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 14,
              }}>
                {[
                  { label: "ERP rows", v: detailModal.item.erpCacheRowCount },
                  { label: "실패 (사람 확인)", v: detailModal.item.failed, danger: (detailModal.item.failed ?? 0) > 0 },
                  { label: "변경 완료", v: detailModal.item.updatedRows },
                  { label: "SAME skip", v: detailModal.item.skippedSame },
                  // 2026-10-06 · 사용자 요청 · 23505 복구 통계
                  { label: "복구(SAME)", v: detailModal.item.recoveredSame, warn: (detailModal.item.recoveredSame ?? 0) > 0 },
                  { label: "복구(UPDATE)", v: detailModal.item.recoveredUpdated, warn: (detailModal.item.recoveredUpdated ?? 0) > 0 },
                  { label: "ERP 내부중복", v: detailModal.item.erpInternalDuplicates, warn: (detailModal.item.erpInternalDuplicates ?? 0) > 0 },
                  { label: "updatedCells", v: detailModal.item.updatedCells },
                  { label: "webModified", v: detailModal.item.webModified, danger: (detailModal.item.webModified ?? 0) > 0 },
                  { label: "identityModified", v: detailModal.item.identityModified, danger: (detailModal.item.identityModified ?? 0) > 0 },
                  { label: "readback mismatch", v: detailModal.item.readbackMismatch, danger: (detailModal.item.readbackMismatch ?? 0) > 0 },
                ].map((s) => (
                  <div key={s.label} style={{
                    border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px",
                    background: (s as { danger?: boolean }).danger ? "#fef2f2" : (s as { warn?: boolean }).warn ? "#fffbeb" : "#f8fafc",
                  }}>
                    <div style={{ fontSize: 10, color: "#64748b" }}>{s.label}</div>
                    <div style={{
                      fontSize: 15, fontWeight: 600,
                      color: (s as { danger?: boolean }).danger ? "#dc2626" : (s as { warn?: boolean }).warn ? "#b45309" : "#111827",
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {s.v == null ? "-" : Number(s.v).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>

              {/* errors[] 리스트 */}
              <div style={{ fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                실패 상세 ({(detailModal.item.errors ?? []).length}건
                {detailModal.item.failed > (detailModal.item.errors ?? []).length
                  ? ` · 전체 ${detailModal.item.failed.toLocaleString()}건 중 샘플 ${(detailModal.item.errors ?? []).length}건 저장됨`
                  : ""})
              </div>
              {(detailModal.item.errors ?? []).length === 0 ? (
                <div style={{
                  padding: 20, textAlign: "center", color: "#94a3b8",
                  border: "1px dashed #e2e8f0", borderRadius: 8, fontSize: 12,
                }}>
                  errors 샘플 없음 (과거 run · 샘플 저장 전 코드)
                </div>
              ) : (
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead style={{ background: "#f1f5f9" }}>
                      <tr>
                        <th style={{ textAlign: "left", padding: "6px 8px", color: "#475569", borderBottom: "1px solid #e2e8f0", width: 32 }}>#</th>
                        <th style={{ textAlign: "left", padding: "6px 8px", color: "#475569", borderBottom: "1px solid #e2e8f0", width: 160 }}>identity</th>
                        <th style={{ textAlign: "left", padding: "6px 8px", color: "#475569", borderBottom: "1px solid #e2e8f0", width: 60 }}>op</th>
                        <th style={{ textAlign: "left", padding: "6px 8px", color: "#475569", borderBottom: "1px solid #e2e8f0", width: 56 }}>DB code</th>
                        <th style={{ textAlign: "left", padding: "6px 8px", color: "#475569", borderBottom: "1px solid #e2e8f0" }}>cause / recovery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detailModal.item.errors ?? []).map((e, i) => {
                        const recColor =
                          e.recovery === "SAME" ? "#059669" :
                          e.recovery === "UPDATED" ? "#d97706" :
                          e.recovery === "UNRECOVERED" ? "#dc2626" :
                          "#64748b";
                        const recBg =
                          e.recovery === "SAME" ? "#ecfdf5" :
                          e.recovery === "UPDATED" ? "#fffbeb" :
                          e.recovery === "UNRECOVERED" ? "#fef2f2" :
                          "transparent";
                        return (
                          <tr key={`${e.identity}-${i}`} style={{ borderBottom: "1px solid #f1f5f9", background: recBg }}>
                            <td style={{ padding: "6px 8px", color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>{i + 1}</td>
                            <td style={{
                              padding: "6px 8px", color: "#1e293b",
                              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                              wordBreak: "break-all",
                            }}>
                              {e.identity}
                            </td>
                            <td style={{
                              padding: "6px 8px", color: "#475569",
                              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                            }}>
                              {e.operation ?? "-"}
                            </td>
                            <td style={{
                              padding: "6px 8px", color: "#475569",
                              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                              fontVariantNumeric: "tabular-nums",
                            }}>
                              {e.dbCode ?? "-"}
                            </td>
                            <td style={{ padding: "6px 8px" }}>
                              <div style={{ color: "#1e293b", fontSize: 11 }}>
                                {e.cause ?? e.message}
                              </div>
                              {e.recovery && (
                                <div style={{
                                  marginTop: 2, display: "inline-block",
                                  padding: "1px 6px", borderRadius: 4,
                                  fontSize: 10, fontWeight: 600,
                                  color: recColor, background: "#fff",
                                  border: `1px solid ${recColor}`,
                                }}>
                                  Recovery · {e.recovery}
                                </div>
                              )}
                              {e.errorType && (
                                <div style={{
                                  marginTop: 2, marginLeft: 4, display: "inline-block",
                                  padding: "1px 6px", borderRadius: 4,
                                  fontSize: 10, color: "#64748b", background: "#f8fafc",
                                  border: "1px solid #e2e8f0",
                                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                }}>
                                  {e.errorType}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
