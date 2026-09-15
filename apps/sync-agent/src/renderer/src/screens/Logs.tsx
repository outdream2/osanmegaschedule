// Logs.tsx
// 2026-09-15 · Phase 3 · 로그 · 실행 이력 + 폴더 상태 + 재시도 큐

import React, { useEffect, useState } from "react";
import type { RendererConfig, FileKind } from "../types";

const FILE_LABELS: Record<FileKind, string> = {
  products: "상품정보",
  stock:    "재고정보",
  purchase: "매입정보",
};

interface FolderStat {
  ok: boolean;
  folder?: string;
  pending?: number;
  processed?: number;
  failed?: number;
  failedLogs?: number;
  error?: string;
}

interface QueueItem {
  id: string;
  kind: FileKind;
  filePath: string;
  originalName: string;
  addedAt: string;
  attempts: number;
  nextRetryAt: string;
  lastError?: string;
}

export const Logs: React.FC = () => {
  const [config, setConfig] = useState<RendererConfig | null>(null);
  const [stats, setStats] = useState<Partial<Record<FileKind, FolderStat>>>({});
  const [queue, setQueue] = useState<QueueItem[]>([]);

  const load = async () => {
    const cfg = await window.api.getConfig();
    setConfig(cfg);
    const s: Partial<Record<FileKind, FolderStat>> = {};
    for (const k of ["products", "stock", "purchase"] as FileKind[]) {
      s[k] = await window.api.folderStats(k);
    }
    setStats(s);
    setQueue(await window.api.listQueue());
  };
  useEffect(() => { load(); }, []);

  if (!config) return <div className="text-zinc-500">로딩 중...</div>;

  const entries = (Object.keys(config.lastRun) as FileKind[])
    .map((kind) => ({ kind, ...config.lastRun[kind]! }))
    .filter((e) => e.at)
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* 최근 실행 이력 */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[17px] font-bold">📋 최근 실행 이력</h2>
          <button
            onClick={load}
            className="text-[13px] text-zinc-600 hover:text-brand-deep px-3 py-1 border border-zinc-200 rounded"
          >
            🔄 새로고침
          </button>
        </div>

        {entries.length === 0 ? (
          <div className="text-[14px] text-zinc-400 py-6 text-center">실행 이력 없음</div>
        ) : (
          <table className="w-full text-[14px]">
            <thead className="bg-zinc-50 text-zinc-500 text-[12px] uppercase">
              <tr>
                <th className="text-left px-3 py-2">파일</th>
                <th className="text-left px-3 py-2">시간</th>
                <th className="text-left px-3 py-2">상태</th>
                <th className="text-left px-3 py-2">메시지</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {entries.map((e) => (
                <tr key={e.kind}>
                  <td className="px-3 py-2 font-semibold">{FILE_LABELS[e.kind]}</td>
                  <td className="px-3 py-2 text-zinc-600 tabular-nums">
                    {new Date(e.at).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded ${
                      e.status === "success" ? "bg-emerald-100 text-emerald-700" :
                      e.status === "failed"  ? "bg-rose-100 text-rose-700" :
                                               "bg-zinc-100 text-zinc-600"
                    }`}>
                      {e.status === "success" ? "성공" : e.status === "failed" ? "실패" : "건너뜀"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-zinc-600 break-all">{e.message ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 폴더 상태 */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6">
        <h2 className="text-[17px] font-bold mb-4">📂 폴더 상태</h2>
        <table className="w-full text-[14px]">
          <thead className="bg-zinc-50 text-zinc-500 text-[12px] uppercase">
            <tr>
              <th className="text-left px-3 py-2">파일</th>
              <th className="text-right px-3 py-2">대기</th>
              <th className="text-right px-3 py-2">처리됨</th>
              <th className="text-right px-3 py-2">실패</th>
              <th className="text-right px-3 py-2">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(["products", "stock", "purchase"] as FileKind[]).map((kind) => {
              const s = stats[kind];
              return (
                <tr key={kind}>
                  <td className="px-3 py-2 font-semibold">{FILE_LABELS[kind]}</td>
                  {s?.ok ? (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums text-brand-deep font-bold">{s.pending ?? 0}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{s.processed ?? 0}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-rose-600">{s.failed ?? 0}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-1">
                          <button
                            onClick={() => window.api.openFolder(kind)}
                            className="text-[12px] px-2 py-1 border border-zinc-200 rounded hover:bg-zinc-50"
                            title="폴더 열기"
                          >📂 열기</button>
                          {(s.failed ?? 0) > 0 && (
                            <button
                              onClick={() => window.api.openFolder(kind, "failed")}
                              className="text-[12px] px-2 py-1 border border-rose-200 text-rose-600 rounded hover:bg-rose-50"
                              title="실패 폴더 열기"
                            >실패 확인</button>
                          )}
                        </div>
                      </td>
                    </>
                  ) : (
                    <td colSpan={4} className="px-3 py-2 text-zinc-400 text-center">{s?.error ?? "-"}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* 재시도 큐 */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[17px] font-bold">⏳ 재시도 대기 큐</h2>
          {queue.length > 0 && (
            <button
              onClick={async () => {
                if (confirm(`대기 중인 ${queue.length}건 · 모두 삭제할까요?`)) {
                  await window.api.clearQueue();
                  await load();
                }
              }}
              className="text-[13px] text-rose-600 hover:bg-rose-50 px-3 py-1 border border-rose-200 rounded"
            >
              전체 삭제
            </button>
          )}
        </div>
        {queue.length === 0 ? (
          <div className="text-[14px] text-zinc-400 py-6 text-center">대기 없음 · 서버 다운 시 · 실패 파일이 여기 등록됩니다</div>
        ) : (
          <table className="w-full text-[14px]">
            <thead className="bg-zinc-50 text-zinc-500 text-[12px] uppercase">
              <tr>
                <th className="text-left px-3 py-2">파일</th>
                <th className="text-left px-3 py-2">파일명</th>
                <th className="text-right px-3 py-2">시도</th>
                <th className="text-left px-3 py-2">다음 재시도</th>
                <th className="text-left px-3 py-2">오류</th>
                <th className="text-right px-3 py-2">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {queue.map((q) => (
                <tr key={q.id}>
                  <td className="px-3 py-2 font-semibold">{FILE_LABELS[q.kind]}</td>
                  <td className="px-3 py-2 text-zinc-700 truncate max-w-[240px]" title={q.originalName}>{q.originalName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{q.attempts}회</td>
                  <td className="px-3 py-2 text-zinc-600 tabular-nums">
                    {new Date(q.nextRetryAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2 text-rose-600 truncate max-w-[200px]" title={q.lastError}>{q.lastError ?? "-"}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={async () => {
                        await window.api.removeQueueItem(q.id);
                        await load();
                      }}
                      className="text-[12px] text-rose-600 px-2 py-1 border border-rose-200 rounded hover:bg-rose-50"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};

export default Logs;
