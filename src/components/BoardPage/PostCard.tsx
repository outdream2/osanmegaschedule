// src/components/BoardPage/PostCard.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · BoardPage 게시글 카드 이관
// 프레임워크: StatusPill · AuthorBadge
import React from "react";
import { Pin, MessageCircle, Pencil, Image as ImageIcon } from "lucide-react";
import { StatusPill } from "../common/StatusPill";
import { Badge } from "../common/Badge";
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
        <span className="shrink-0 text-[16px] font-bold text-zinc-400 tabular-nums w-[38px]">
          {fmtDateShort(post.created_at)}
        </span>
        {/* 상태 dot */}
        <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${status.dot}`} title={status.label} />
        {post.pinned && <Pin size={11} className="text-orange-500 shrink-0" />}
        {/* 카테고리 */}
        {post.category && (
          <Badge tone="zinc" size="xs" className="shrink-0">{post.category}</Badge>
        )}
        {/* 제목 · 최대 두 줄 */}
        <span className="flex-1 min-w-0 text-[17px] font-bold text-zinc-900 line-clamp-2 break-keep leading-snug">
          {post.title}
        </span>
        {/* 이미지·댓글 카운트 */}
        {hasImg && (
          <span className="shrink-0 inline-flex items-center gap-0.5 text-[17px] text-zinc-400 font-bold">
            <ImageIcon size={10} /> {post.images!.length}
          </span>
        )}
        {hasCmt && (
          <span className="shrink-0 inline-flex items-center gap-0.5 text-[17px] text-indigo-400 font-bold">
            <MessageCircle size={10} /> {post.comment_count}
          </span>
        )}
        {/* 작성자 */}
        <span className="inline-flex items-center shrink-0">
          <AuthorBadge name={post.author_name} />
        </span>
      </div>

      {/* ── PC(sm+): 한 줄 레이아웃 ── */}
      <div className="hidden sm:flex sm:items-center sm:gap-2.5">
        {/* 날짜 */}
        <span className="shrink-0 text-[17px] font-bold text-zinc-400 tabular-nums w-[44px]">
          {fmtDateShort(post.created_at)}
        </span>
        {/* 상태 dot */}
        <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${status.dot}`} title={status.label} />
        {post.pinned && <Pin size={13} className="text-orange-500 shrink-0" />}
        {/* 카테고리 */}
        {post.category && (
          <span className="shrink-0">
            <StatusPill tone="zinc" size="sm">{post.category}</StatusPill>
          </span>
        )}
        {/* 제목 */}
        <span className="flex-1 min-w-0 text-[16px] font-bold text-zinc-900 truncate break-keep leading-snug">
          {post.title}
        </span>
        {/* 이미지·댓글 */}
        {hasImg && (
          <span className="shrink-0 inline-flex items-center gap-0.5 text-[17px] text-zinc-500 font-bold">
            <ImageIcon size={12} /> {post.images!.length}
          </span>
        )}
        {hasCmt && (
          <span className="shrink-0 inline-flex items-center gap-0.5 text-[17px] text-indigo-500 font-bold">
            <MessageCircle size={12} /> {post.comment_count}
          </span>
        )}
        {/* 작성자 */}
        <AuthorBadge name={post.author_name} rank={post.author_rank} />
        {/* 수정 버튼 */}
        {showEdit && onEdit && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[16px] font-bold cursor-pointer active:scale-95 transition"
            title="글 수정"
          >
            <Pencil size={11} /> 수정
          </button>
        )}
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
