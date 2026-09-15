// Dashboard.tsx
// 2026-09-15 · Phase 2 · 대시보드 · 실 상태 표시 · lastRun 반영

import React, { useEffect, useState, useCallback } from "react";
import type { RendererConfig, FileKind } from "../types";

const FILE_META: Record<FileKind, { label: string; color: string; icon: string }> = {
  products: { label: "상품정보", color: "sky",     icon: "📦" },
  stock:    { label: "재고정보", color: "emerald", icon: "📊" },
  purchase: { label: "매입정보", color: "amber",   icon: "💰" },
};

function formatDate(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function toneClass(status?: string): string {
  if (status === "success") return "bg-emerald-50 border-emerald-200 text-emerald-700";
  if (status === "failed")  return "bg-rose-50 border-rose-200 text-rose-700";
  if (status === "skipped") return "bg-zinc-50 border-zinc-200 text-zinc-600";
  return "bg-zinc-50 border-zinc-200 text-zinc-400";
}

export const Dashboard: React.FC = () => {
  const [config, setConfig] = useState<RendererConfig | null>(null);
  const [running, setRunning] = useState<FileKind | "all" | null>(null);

  const load = useCallback(async () => {
    const cfg = await window.api.getConfig();
    setConfig(cfg);
  }, []);
  useEffect(() => { load(); }, [load]);

  const runOne = async (kind: FileKind) => {
    // 최신 파일 정보 · 사용자 확인 dialog
    const latest = await window.api.findLatest(kind);
    if (!latest.ok) {
      alert(`${kind} · ${latest.error}\n설정에서 · 폴더 지정 · xlsx 파일 추가 후 다시 시도해주세요.`);
      return;
    }
    const meta = FILE_META[kind];
    const statusHint = latest.isFailed
      ? "\n\n⚠ 이전 임포트 실패 파일 (_failed/) · 재시도?"
      : latest.isProcessed
        ? "\n\n⚠ 이미 임포트됨 (_processed/) · 다시 임포트?"
        : "\n\n✓ 새 파일 · 임포트 대기";
    const msg = `${meta.label} · 최신 파일:\n\n📄 ${latest.name}\n📅 파일 날짜: ${latest.date}${statusHint}\n\n지금 임포트하시겠습니까?`;
    if (!confirm(msg)) return;

    setRunning(kind);
    try {
      await window.api.runNow(kind);
      await load();
    } finally { setRunning(null); }
  };

  const runAll = async () => {
    setRunning("all");
    try {
      await window.api.runAll();
      await load();
    } finally { setRunning(null); }
  };

  if (!config) return <div className="text-zinc-500">로딩 중...</div>;

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* 전체 실행 CTA */}
      <div className="flex items-center gap-3">
        <button
          onClick={runAll}
          disabled={running !== null}
          className="px-5 py-3 bg-gradient-to-r from-sky-500 to-brand-deep text-white rounded-lg text-[15px] font-bold shadow-md hover:shadow-lg disabled:opacity-40 transition"
        >
          {running === "all" ? "실행 중..." : "🚀 전체 지금 실행"}
        </button>
        <button
          onClick={load}
          className="px-4 py-3 border border-zinc-300 rounded-lg text-[14px] font-semibold text-zinc-600 hover:bg-zinc-50 transition"
        >
          🔄 새로고침
        </button>
      </div>

      {/* 상태 카드 · 3 파일 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(["products", "stock", "purchase"] as FileKind[]).map((kind) => {
          const meta = FILE_META[kind];
          const lastRun = config.lastRun[kind];
          const folder = config.folders[kind];
          const schedule = config.schedules[kind];
          return (
            <div key={kind} className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[20px]">{meta.icon}</span>
                <span className="text-[16px] font-bold">{meta.label}</span>
              </div>

              <div className={`text-[12px] font-semibold border rounded-lg px-2 py-1 mb-3 inline-block ${toneClass(lastRun?.status)}`}>
                {lastRun?.status === "success" ? "✓ 성공"
                  : lastRun?.status === "failed" ? "✕ 실패"
                  : lastRun?.status === "skipped" ? "○ 건너뜀"
                  : "미실행"}
              </div>

              <div className="text-[13px] text-zinc-600 space-y-1">
                <div>마지막 · <span className="font-semibold">{formatDate(lastRun?.at)}</span></div>
                {lastRun?.message && <div className="text-zinc-500">{lastRun.message}</div>}
                <div className="pt-2 border-t border-zinc-100 mt-2 text-zinc-500">
                  {folder ? <div className="truncate" title={folder}>📂 {folder}</div> : <div className="text-zinc-400">폴더 미설정</div>}
                  {schedule ? <div>⏰ {schedule}</div> : <div className="text-zinc-400">스케줄 없음</div>}
                </div>
              </div>

              <button
                onClick={() => runOne(kind)}
                disabled={running !== null || !folder}
                className="mt-4 w-full py-2 bg-brand-deep text-white rounded-lg text-[13px] font-semibold hover:bg-[#0d3a5c] disabled:opacity-40 transition"
              >
                {running === kind ? "실행 중..." : "지금 실행"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Dashboard;
