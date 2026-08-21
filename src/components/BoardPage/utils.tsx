// src/components/BoardPage/utils.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · BoardPage 유틸/서브 컴포넌트 이관
import React from "react";

export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export function AuthorBadge({ name, rank }: { name: string; rank?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[15px] font-bold text-zinc-500 tracking-tight">
      <span className="text-zinc-300 font-normal">[</span>
      <span className="text-zinc-800">{name}</span>
      {rank && <span className="text-zinc-600 text-[14px]">{rank}</span>}
      <span className="text-zinc-300 font-normal">]</span>
    </span>
  );
}
