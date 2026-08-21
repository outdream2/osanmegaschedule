// src/components/BoardPage/PostCard.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · BoardPage 게시글 카드 이관
// 프레임워크: StatusPill · AuthorBadge
import React from "react";
import { Pin, MessageCircle, Pencil, Image as ImageIcon } from "lucide-react";
import { StatusPill } from "../common/StatusPill";
import { fmtDateShort } from "../../lib/format";
import type { BoardPost } from "./types";
import { TYPE_META, STATUS_META } from "./constants";
import { AuthorBadge } from "./utils";

export const PostCard: React.FC<{ post: BoardPost; onOpen: () => void; showEdit?: boolean; onEdit?: () => void }> = ({ post, onOpen, showEdit, onEdit }) => {
  const meta = TYPE_META[post.post_type] ?? TYPE_META.question;
  const status = STATUS_META[post.status] ?? STATUS_META.open;
  const Icon = meta.icon;
  const hasImg = post.images && post.images.length > 0;
  const hasCmt = (post.comment_count ?? 0) > 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="w-full text-left bg-white hover:bg-zinc-50/60 transition-all duration-150 cursor-pointer px-0.5 sm:px-4 py-1.5 sm:py-2 min-h-[44px]"
    >
      {/* ── 모바일: 단일 flex 행 ── */}
      <div className="flex items-center gap-2 sm:hidden">
        {/* 날짜 */}
        <span className="shrink-0 text-[14px] font-bold text-zinc-400 tabular-nums w-[36px]">
          {fmtDateShort(post.created_at)}
        </span>
        {/* 상태 dot */}
        <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${status.dot}`} title={status.label} />
        {post.pinned && <Pin size={10} className="text-orange-500 shrink-0" />}
        {/* 카테고리 */}
        {post.category && (
          <span className="shrink-0 text-[15px] font-semibold text-zinc-500 bg-zinc-100 rounded-md px-1.5 py-0.5">{post.category}</span>
        )}
        {/* 제목 · 최대 두 줄 */}
        <span className="flex-1 min-w-0 text-[15px] font-bold text-zinc-900 line-clamp-2 break-keep leading-snug">
          {post.title}
        </span>
        {/* 이미지·댓글 카운트 */}
        {hasImg && (
          <span className="shrink-0 inline-flex items-center gap-0.5 text-[15px] text-zinc-400 font-bold">
            <ImageIcon size={9} /> {post.images!.length}
          </span>
        )}
        {hasCmt && (
          <span className="shrink-0 inline-flex items-center gap-0.5 text-[15px] text-indigo-400 font-bold">
            <MessageCircle size={9} /> {post.comment_count}
          </span>
        )}
        {/* 작성자 */}
        <span className="inline-flex items-center shrink-0">
          <AuthorBadge name={post.author_name} />
        </span>
      </div>

      {/* ── PC(sm+): 두 줄 레이아웃 ── */}
      <div className="hidden sm:flex sm:flex-col sm:gap-1">
        {/* 1행: 상태 · 카테고리 · 제목 */}
        <div className="flex items-start gap-2.5">
          {/* 상태 dot */}
          <span className={`shrink-0 mt-2 w-1.5 h-1.5 rounded-full ${status.dot}`} title={status.label} />
          {post.pinned && <Pin size={12} className="text-orange-500 shrink-0 mt-1.5" />}
          {/* 카테고리 배지 · 2026-08-17 · StatusPill 통일 */}
          {post.category && (
            <span className="shrink-0 self-center">
              <StatusPill tone="zinc" size="sm">{post.category}</StatusPill>
            </span>
          )}
          {/* 제목 · PC에서 최대 두 줄 */}
          <span className="flex-1 min-w-0 text-[14px] font-bold text-zinc-900 line-clamp-2 break-keep leading-snug">
            {post.title}
          </span>
          {/* 이미지·댓글 카운트 · 우측 정렬 */}
          {hasImg && (
            <span className="shrink-0 self-center inline-flex items-center gap-0.5 text-[15px] text-zinc-500 font-bold">
              <ImageIcon size={11} /> {post.images!.length}
            </span>
          )}
          {hasCmt && (
            <span className="shrink-0 self-center inline-flex items-center gap-0.5 text-[15px] text-indigo-500 font-bold">
              <MessageCircle size={11} /> {post.comment_count}
            </span>
          )}
          {/* 수정 버튼 */}
          {showEdit && onEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="shrink-0 self-center inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[14px] font-bold cursor-pointer active:scale-95 transition"
              title="글 수정"
            >
              <Pencil size={10} /> 수정
            </button>
          )}
        </div>
        {/* 2행: 날짜 · 작성자 */}
        <div className="flex items-center gap-2 pl-[38px]">
          <span className="text-[15px] font-semibold text-zinc-400 tabular-nums">
            {fmtDateShort(post.created_at)}
          </span>
          <span className="text-zinc-200">·</span>
          <AuthorBadge name={post.author_name} rank={post.author_rank} />
        </div>
      </div>

      {/* 모바일 수정 버튼 · 두 번째 행으로 분리 */}
      {showEdit && onEdit && (
        <div className="flex sm:hidden justify-end mt-0.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[14px] font-bold cursor-pointer active:scale-95 transition"
            title="글 수정"
          >
            <Pencil size={10} /> 수정
          </button>
        </div>
      )}
    </div>
  );
};
