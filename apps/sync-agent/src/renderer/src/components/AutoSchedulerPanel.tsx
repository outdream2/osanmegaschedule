// apps/sync-agent/src/renderer/src/components/AutoSchedulerPanel.tsx
// 2026-10-05 · Dataset 별 독립 자동 Scheduler 설정 UI
//   · PRODUCT / BUY / INVENTORY / SALE / VENDOR 각자 ON/OFF + 주기 + 시간/요일
//   · 설정 변경 즉시 config:patch 호출 → main 쪽 rescheduleDataset 자동 트리거
//   · lastRunAt / nextRunAt / result 표시
//   · VENDOR 는 ERP 연동 완료 전까지 disabled

import React, { useCallback, useEffect, useState } from "react";

type DsKey = "PRODUCT" | "BUY" | "INVENTORY" | "SALE" | "VENDOR";
type Interval = "30min" | "1h" | "2h" | "4h" | "6h" | "12h" | "daily" | "weekly";

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

  const load = useCallback(async () => {
    const r = await window.api.erpSchedulerGetStatus();
    if (r?.ok && r.status) setDatasets(r.status as Record<DsKey, DsSchedule>);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

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
          const isVendor = ds === "VENDOR";
          const result = resultLabel(s.lastRunResult);
          return (
            <div key={ds} style={{
              border: "1px solid #e5e7eb", borderRadius: 10, padding: 12,
              background: isVendor ? "#f8fafc" : "#fff", opacity: isVendor ? 0.75 : 1,
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
                    disabled={isVendor || saving === ds}
                    onChange={(e) => void patch(ds, { enabled: e.target.checked })}
                  />
                  <span>자동</span>
                </label>
              </div>
              <div>
                <div style={{ color: "#64748b", marginBottom: 2 }}>주기</div>
                <select
                  value={s.interval}
                  disabled={!s.enabled || isVendor || saving === ds}
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
                    disabled={!s.enabled || isVendor || saving === ds}
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
                    disabled={!s.enabled || isVendor || saving === ds}
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
              {isVendor && (
                <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", padding: "4px 0" }}>
                  ERP 연동 완료 후 활성화
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
