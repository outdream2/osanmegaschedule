// Logs.tsx
// 2026-09-15 · Phase 2 · 로그 · lastRun 기반 · 파일별 최근 결과

import React, { useEffect, useState } from "react";
import type { RendererConfig, FileKind } from "../types";

const FILE_LABELS: Record<FileKind, string> = {
  products: "상품정보",
  stock:    "재고정보",
  purchase: "매입정보",
};

export const Logs: React.FC = () => {
  const [config, setConfig] = useState<RendererConfig | null>(null);

  const load = async () => setConfig(await window.api.getConfig());
  useEffect(() => { load(); }, []);

  if (!config) return <div className="text-zinc-500">로딩 중...</div>;

  const entries = (Object.keys(config.lastRun) as FileKind[])
    .map((kind) => ({ kind, ...config.lastRun[kind]! }))
    .filter((e) => e.at)
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
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
          <div className="text-[14px] text-zinc-400 py-8 text-center">로그 없음 · 임포트 실행하면 여기 표시</div>
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
                  <td className="px-3 py-2 text-zinc-600">{e.message ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="text-[12px] text-zinc-500">
        상세 로그 · 각 실행 이력 확인 · 실패 파일 · <code>_failed/</code> 폴더 안 <code>.log</code> 파일
      </div>
    </div>
  );
};

export default Logs;
