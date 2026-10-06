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
function resultLabel(r?: string): { text: string; color: string } {
  if (!r) return { text: "-", color: "#94a3b8" };
  if (r === "SUCCESS") return { text: "성공", color: "#10b981" };
  if (r === "PARTIAL") return { text: "일부 실패", color: "#f59e0b" };
  if (r === "SKIPPED") return { text: "SKIPPED", color: "#94a3b8" };
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
                          const clickable = !h.ok;
                          return (
                            <div
                              key={h.id}
                              onClick={clickable ? () => setDetailModal({ ds, item: h }) : undefined}
                              title={clickable ? "클릭 · 실패 상세 보기" : undefined}
                              style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "4px 8px",
                                borderBottom: "1px solid #e5e7eb",
                                fontSize: 11,
                                background: h.ok ? "transparent" : "#fef2f2",
                                cursor: clickable ? "pointer" : "default",
                              }}
                              onMouseEnter={(e) => { if (clickable) (e.currentTarget as HTMLDivElement).style.background = "#fee2e2"; }}
                              onMouseLeave={(e) => { if (clickable) (e.currentTarget as HTMLDivElement).style.background = "#fef2f2"; }}
                            >
                              <span style={{
                                display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                                background: h.ok ? "#10b981" : "#ef4444", flexShrink: 0,
                              }} />
                              <span style={{ color: "#64748b", fontVariantNumeric: "tabular-nums", minWidth: 68 }}>
                                {fmt(h.completedAt)}
                              </span>
                              <span style={{ color: "#334155", flex: 1, fontVariantNumeric: "tabular-nums" }}>
                                {h.updatedRows.toLocaleString()}건
                                {h.failed > 0 && (
                                  <span style={{ color: "#ef4444", marginLeft: 4 }}>· 실패 {h.failed.toLocaleString()}</span>
                                )}
                              </span>
                              <strong style={{ color: h.ok ? "#10b981" : "#ef4444", fontSize: 10, flexShrink: 0 }}>
                                {h.ok ? "성공" : "실패"}
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
                  { label: "실패", v: detailModal.item.failed, danger: true },
                  { label: "변경 완료", v: detailModal.item.updatedRows },
                  { label: "SAME skip", v: detailModal.item.skippedSame },
                  { label: "updatedCells", v: detailModal.item.updatedCells },
                  { label: "webModified", v: detailModal.item.webModified, danger: (detailModal.item.webModified ?? 0) > 0 },
                  { label: "identityModified", v: detailModal.item.identityModified, danger: (detailModal.item.identityModified ?? 0) > 0 },
                  { label: "readback mismatch", v: detailModal.item.readbackMismatch, danger: (detailModal.item.readbackMismatch ?? 0) > 0 },
                ].map((s) => (
                  <div key={s.label} style={{
                    border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px",
                    background: s.danger ? "#fef2f2" : "#f8fafc",
                  }}>
                    <div style={{ fontSize: 10, color: "#64748b" }}>{s.label}</div>
                    <div style={{
                      fontSize: 15, fontWeight: 600,
                      color: s.danger ? "#dc2626" : "#111827",
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
                        <th style={{ textAlign: "left", padding: "6px 10px", color: "#475569", borderBottom: "1px solid #e2e8f0", width: 40 }}>#</th>
                        <th style={{ textAlign: "left", padding: "6px 10px", color: "#475569", borderBottom: "1px solid #e2e8f0", width: 200 }}>identity</th>
                        <th style={{ textAlign: "left", padding: "6px 10px", color: "#475569", borderBottom: "1px solid #e2e8f0" }}>message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detailModal.item.errors ?? []).map((e, i) => (
                        <tr key={`${e.identity}-${i}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "6px 10px", color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>{i + 1}</td>
                          <td style={{
                            padding: "6px 10px", color: "#1e293b",
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                            wordBreak: "break-all",
                          }}>
                            {e.identity}
                          </td>
                          <td style={{
                            padding: "6px 10px", color: "#991b1b",
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                            wordBreak: "break-word",
                          }}>
                            {e.message}
                          </td>
                        </tr>
                      ))}
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
