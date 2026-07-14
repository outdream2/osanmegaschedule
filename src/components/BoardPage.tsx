// src/components/BoardPage.tsx
// 이슈공유 게시판 · 질문/이슈/메모 + 댓글 + 이미지 첨부 + @멘션 + 반응
// - 모든 직원 접근 가능
// - 이미지: Cloudinary 업로드 (클라 압축 후 25GB 무료)
// - 담당자 표시: [이름 직급] · 헤더 스타일과 통일

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HelpCircle, AlertTriangle, StickyNote, Search, Plus, Send, X as XIcon, Image as ImageIcon,
  ChevronLeft, Pin, MessageCircle, Trash2, Loader2,
  Camera, AtSign, Pencil, Check,
} from "lucide-react";
import type { AuthSession } from "../types";
import { AppNavHeader, type AppNavPage } from "./AppNavHeader";
import { uploadImagesToCloudinary, type UploadedImage } from "../lib/cloudinaryUpload";

interface Props {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

type PostType = "question" | "issue" | "memo";
type Status = "open" | "in_progress" | "resolved";

interface BoardImage { id?: number; image_url: string; public_id?: string; width?: number; height?: number; }

interface BoardComment {
  id: number; post_id: number; author_id: number; author_name: string; author_rank?: string;
  parent_id: number | null; body: string; is_answer: boolean; mentions: number[]; created_at: string;
  images?: BoardImage[];
}

interface BoardReaction { post_id: number; employee_id: number; reaction: string; }

interface BoardPost {
  id: number; author_id: number; author_name: string; author_rank?: string;
  post_type: PostType; title: string; body: string; status: Status;
  category?: string; pinned: boolean; resolved_at?: string; resolved_by?: number;
  mentions: number[]; created_at: string; updated_at: string;
  images?: BoardImage[]; comment_count?: number; comments?: BoardComment[]; reactions?: BoardReaction[];
}

interface Employee { id: number; name: string; rank?: string; level?: number; }

const TYPE_META: Record<PostType, { label: string; icon: any; bg: string; text: string; border: string; }> = {
  question: { label: "질문", icon: HelpCircle,    bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200" },
  issue:    { label: "이슈", icon: AlertTriangle, bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200" },
  memo:     { label: "메모", icon: StickyNote,    bg: "bg-slate-50",  text: "text-slate-700",  border: "border-slate-200" },
};

const STATUS_META: Record<Status, { label: string; dot: string; text: string; }> = {
  open:        { label: "미해결", dot: "bg-rose-500",    text: "text-rose-600" },
  in_progress: { label: "진행중", dot: "bg-amber-500",   text: "text-amber-600" },
  resolved:    { label: "해결",   dot: "bg-emerald-500", text: "text-emerald-600" },
};

const CATEGORIES = ["결제", "상품", "주문", "손님", "기타"] as const;

function timeAgo(iso: string): string {
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

function AuthorBadge({ name, rank }: { name: string; rank?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-black text-slate-500 tracking-tight">
      <span className="text-slate-300 font-normal">[</span>
      <span className="text-slate-800">{name}</span>
      {rank && <span className="text-slate-600 text-[10px]">{rank}</span>}
      <span className="text-slate-300 font-normal">]</span>
    </span>
  );
}

export const BoardPage: React.FC<Props> = ({ authSession, onBack, onNavigate, onLogout }) => {
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<"" | PostType>("");
  const [filterStatus, setFilterStatus] = useState<"" | Status>("");
  // "" = 전체, "__none__" = 미분류(카테고리 없는 글), CATEGORIES 중 하나 = 해당 카테고리
  const [filterCategory, setFilterCategory] = useState<"" | "__none__" | typeof CATEGORIES[number]>("");
  const [search, setSearch] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailInitialEdit, setDetailInitialEdit] = useState(false);
  // 인라인 확장: 리스트 클릭 시 아래에 댓글 인라인으로 표시
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const level = authSession?.level ?? 0;
  const isManager = level >= 2;

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set("type", filterType);
      if (filterStatus) params.set("status", filterStatus);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/board/posts?${params}`);
      if (res.ok) setPosts(await res.json());
    } finally { setLoading(false); }
  }, [filterType, filterStatus, search]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  // 직원 리스트 (@멘션용)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/employees");
        if (res.ok) {
          const list = await res.json();
          setEmployees(Array.isArray(list) ? list : []);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const filtered: BoardPost[] = useMemo(() => {
    if (!filterCategory) return posts;
    if (filterCategory === "__none__") return posts.filter(p => !p.category);
    return posts.filter(p => p.category === filterCategory);
  }, [posts, filterCategory]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(160deg, #fff7ed 0%, #fef3c7 40%, #fef9c3 100%)" }}>
      <AppNavHeader activePage="board" authSession={authSession} onBack={onBack} onNavigate={onNavigate} onLogout={onLogout} />

      <main className="flex-1 max-w-[900px] mx-auto w-full px-3 sm:px-4 py-3 sm:py-4">
        {/* 필터 · 검색 · 새글 */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex-1 min-w-[180px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="제목·본문 검색"
              className="w-full pl-9 pr-3 py-2 text-[13px] font-semibold bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 shadow-sm"
            />
          </div>
          <button
            onClick={() => setShowComposer(true)}
            disabled={!authSession?.employeeId}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-black shadow-sm active:scale-95 transition disabled:opacity-40"
          >
            <Plus size={14} strokeWidth={3} /> 새 글
          </button>
        </div>

        {/* 상태 필터 · 미해결/진행중/해결 (전체·질문·이슈·메모 타입 필터 제거) */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {(Object.keys(STATUS_META) as Status[]).map(s => {
            const meta = STATUS_META[s];
            const active = filterStatus === s;
            return (
              <button key={s} onClick={() => setFilterStatus(active ? "" : s)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black transition ${active ? `${meta.text} bg-white border-2 border-current` : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* 카테고리 필터 배지 · status 필터 아래 · 항상 표시 (결과 0건이어도 사라지지 않음) */}
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider mr-1">카테고리</span>
          <button
            onClick={() => setFilterCategory("")}
            className={`px-2 py-0.5 rounded-full text-[11px] font-black transition ${filterCategory === "" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
          >전체</button>
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setFilterCategory(prev => prev === c ? "" : c)}
              className={`px-2 py-0.5 rounded-full text-[11px] font-black transition ${filterCategory === c ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >{c}</button>
          ))}
          <button
            onClick={() => setFilterCategory(prev => prev === "__none__" ? "" : "__none__")}
            className={`px-2 py-0.5 rounded-full text-[11px] font-black transition ${filterCategory === "__none__" ? "bg-slate-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
          >미분류</button>
        </div>

        {/* 목록 */}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-orange-400" size={24} /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
            <StickyNote size={32} className="text-slate-300" />
            <span className="text-xs">등록된 글이 없습니다</span>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            {/* 이슈리스트 제목 */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/60">
              <span className="text-[11px] font-black text-slate-600">이슈리스트</span>
              <span className="text-[10px] font-mono text-slate-400">({filtered.length}건)</span>
              <span className="ml-auto text-[10px] text-slate-400 font-semibold hidden sm:inline">💡 항목 클릭 시 상세내용 표시</span>
              <span className="ml-auto text-[10px] text-slate-400 font-semibold sm:hidden">💡 클릭 → 상세</span>
            </div>
            <div className="divide-y divide-slate-100">
            {filtered.map((p: BoardPost) => {
              const isExpanded = expandedId === p.id;
              const toggle = () => setExpandedId(prev => prev === p.id ? null : p.id);
              const isAuthor = p.author_id === authSession?.employeeId;
              return (
                <React.Fragment key={p.id}>
                  <PostCard
                    post={p}
                    onOpen={toggle}
                    showEdit={isAuthor || isManager}
                    onEdit={() => { setDetailInitialEdit(true); setDetailId(p.id); }}
                  />
                  {isExpanded && (
                    <InlineDetail
                      postId={p.id}
                      authSession={authSession}
                      employees={employees}
                      isManager={isManager}
                      onOpenFull={() => setDetailId(p.id)}
                      onChanged={loadPosts}
                    />
                  )}
                </React.Fragment>
              );
            })}
            </div>
          </div>
        )}
      </main>

      {showComposer && authSession?.employeeId && (
        <ComposerModal
          authSession={authSession}
          employees={employees}
          onClose={() => setShowComposer(false)}
          onCreated={() => { setShowComposer(false); loadPosts(); }}
        />
      )}

      {detailId != null && (
        <DetailModal
          postId={detailId}
          authSession={authSession}
          employees={employees}
          isManager={isManager}
          initialEdit={detailInitialEdit}
          onClose={() => { setDetailId(null); setDetailInitialEdit(false); }}
          onChanged={loadPosts}
        />
      )}
    </div>
  );
};

// ── 게시글 카드
// 날짜 YY/MM/DD (오늘/어제도 실제 날짜로 표시)
function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  return `${yy}/${M}/${D}`;
}

const PostCard: React.FC<{ post: BoardPost; onOpen: () => void; showEdit?: boolean; onEdit?: () => void }> = ({ post, onOpen, showEdit, onEdit }) => {
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
      className="w-full text-left bg-white border border-slate-200 hover:border-orange-300 hover:bg-orange-50/20 transition cursor-pointer flex items-center gap-2 px-2.5 sm:px-3 py-2 min-h-[44px]"
    >
      {/* 날짜 · 맨 앞 */}
      <span className="shrink-0 text-[10px] sm:text-[11px] font-mono font-black text-slate-500 tabular-nums w-[52px] sm:w-[64px]">
        {fmtDateShort(post.created_at)}
      </span>
      {/* 좌측 타입 아이콘 */}
      <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center border ${meta.bg} ${meta.border}`}>
        <Icon size={13} className={meta.text} />
      </div>
      {/* 상태 dot */}
      <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${status.dot}`} title={status.label} />
      {post.pinned && <Pin size={11} className="text-orange-500 shrink-0" />}
      {/* 카테고리 */}
      {post.category && (
        <span className="shrink-0 text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-1.5 py-0.5">{post.category}</span>
      )}
      {/* 제목 · 한 줄 · 말줄임 · 취소선 제거 (해결 여부는 상태 dot 으로만 표시) */}
      <span className="flex-1 min-w-0 text-[13px] sm:text-[14px] font-black text-slate-900 truncate">
        {post.title}
      </span>
      {/* 이미지·댓글 카운트 */}
      {hasImg && (
        <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-slate-500 font-bold">
          <ImageIcon size={10} /> {post.images!.length}
        </span>
      )}
      {hasCmt && (
        <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-indigo-500 font-bold">
          <MessageCircle size={10} /> {post.comment_count}
        </span>
      )}
      {/* 작성자 · 이름만 표시 (직급 제거) */}
      <span className="inline-flex items-center shrink-0">
        <AuthorBadge name={post.author_name} />
      </span>
      {/* 수정 버튼 · 본인 작성 or 관리자만 노출 · 클릭 시 상세 모달 오픈 (거기서 수정 가능) */}
      {showEdit && onEdit && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[10px] font-black cursor-pointer active:scale-95 transition"
          title="글 수정"
        >
          <Pencil size={10} /> 수정
        </button>
      )}
    </div>
  );
};

// ── 인라인 상세 (리스트 클릭 시 아래에 확장 · 댓글 표시)
const InlineDetail: React.FC<{
  postId: number;
  authSession: AuthSession | null;
  employees: Employee[];
  isManager: boolean;
  onOpenFull: () => void;
  onChanged: () => void;
}> = ({ postId, authSession, employees, isManager, onOpenFull, onChanged }) => {
  void employees; void isManager; // 확장 필요 시 사용
  const [post, setPost] = useState<BoardPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentBody, setCommentBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/board/posts/${postId}`);
      if (res.ok) setPost(await res.json());
    } finally { setLoading(false); }
  }, [postId]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!commentBody.trim() || !authSession?.employeeId) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/board/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_id: authSession.employeeId,
          author_name: authSession.employeeName ?? "",
          author_rank: authSession.employeeRank ?? null,
          body: commentBody.trim(),
        }),
      });
      if (res.ok) { setCommentBody(""); await load(); onChanged(); }
    } finally { setPosting(false); }
  };

  const saveEdit = async (id: number) => {
    if (!editingCommentBody.trim() || !authSession) return;
    const res = await fetch(`/api/board/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editor_id: authSession.employeeId, body: editingCommentBody.trim() }),
    });
    if (res.ok) { setEditingCommentId(null); setEditingCommentBody(""); await load(); onChanged(); }
  };

  return (
    <div className="bg-slate-50/60 border-t border-slate-200 px-3 py-2.5">
      {loading || !post ? (
        <div className="flex justify-center py-3 text-slate-400"><Loader2 size={16} className="animate-spin" /></div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* 본문 요약 */}
          {post.body && (
            <p className="text-[12px] text-slate-600 whitespace-pre-wrap leading-relaxed">{post.body}</p>
          )}
          {/* 이미지 · 크게 표시 · 클릭 시 원본 뷰어 */}
          {post.images && post.images.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {post.images.map(img => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setPreviewImg(img.image_url)}
                  className="block w-full aspect-square rounded-xl overflow-hidden border border-slate-200 hover:border-orange-300 hover:shadow-md transition"
                  title="크게 보기"
                >
                  <img src={img.image_url} alt="" loading="lazy"
                    className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          {/* 댓글 리스트 · 이미지 아래 */}
          <div className="flex flex-col gap-1.5 mt-1">
            <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-wider">
              <MessageCircle size={11} /> 댓글 {post.comments?.length ?? 0}
              <button onClick={onOpenFull} className="ml-auto text-[10px] font-black text-orange-600 hover:text-orange-800 normal-case tracking-normal">전체보기 →</button>
            </div>
            {(post.comments ?? []).map(c => {
              const canEdit = c.author_id === authSession?.employeeId;
              const editing = editingCommentId === c.id;
              return (
                <div key={c.id} className="bg-white rounded-lg p-2 border border-slate-100">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AuthorBadge name={c.author_name} rank={c.author_rank} />
                    <span className="flex-1" />
                    <span className="text-[9px] text-slate-400 font-semibold">{timeAgo(c.created_at)}</span>
                  </div>
                  {editing ? (
                    <div className="flex flex-col gap-1">
                      <textarea value={editingCommentBody} onChange={(e) => setEditingCommentBody(e.target.value)} rows={2}
                        className="w-full px-2 py-1 text-[12px] border border-orange-300 rounded focus:outline-none focus:border-orange-500 resize-none" />
                      <div className="flex gap-1">
                        <button onClick={() => saveEdit(c.id)} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black">
                          <Check size={10} strokeWidth={3} /> 저장
                        </button>
                        <button onClick={() => { setEditingCommentId(null); setEditingCommentBody(""); }} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black">
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-[12px] text-slate-700 whitespace-pre-wrap">{c.body}</p>
                      {canEdit && (
                        <button onClick={() => { setEditingCommentId(c.id); setEditingCommentBody(c.body); }}
                          className="mt-1 inline-flex items-center gap-0.5 text-[9px] font-black text-orange-600 hover:text-orange-800">
                          <Pencil size={9} /> 수정
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {/* 댓글 입력 */}
          {authSession?.employeeId && (
            <div className="flex items-center gap-1.5 mt-1">
              <input
                type="text"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder="댓글 작성"
                className="flex-1 px-2 py-1 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:border-orange-400"
              />
              <button onClick={submit} disabled={posting || !commentBody.trim()}
                className="p-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-40 shrink-0">
                {posting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              </button>
            </div>
          )}
        </div>
      )}
      {/* 사진 원본 미리보기 모달 (닫기 버튼 · 배경 클릭 · × 버튼) */}
      {previewImg && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4" onClick={() => setPreviewImg(null)}>
          <button
            type="button"
            onClick={() => setPreviewImg(null)}
            className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-slate-800 text-2xl leading-none font-black shadow-lg flex items-center justify-center cursor-pointer"
            aria-label="닫기"
          >×</button>
          <img src={previewImg} alt="" className="max-w-full max-h-full object-contain rounded-xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
};

// ── 새 글 작성 모달
function ComposerModal({
  authSession, employees, onClose, onCreated,
}: {
  authSession: AuthSession; employees: Employee[]; onClose: () => void; onCreated: () => void;
}) {
  const [type, setType] = useState<PostType>("question");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<string>("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [mentionIds, setMentionIds] = useState<number[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!title.trim()) { alert("제목을 입력해 주세요"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/board/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_id: authSession.employeeId,
          author_name: authSession.employeeName ?? "",
          author_rank: authSession.employeeRank ?? null,
          post_type: type,
          title: title.trim(),
          body,
          category: category || null,
          mentions: mentionIds,
          images,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        alert(b.error ?? `등록 실패 (${res.status})`);
        return;
      }
      onCreated();
    } finally { setSaving(false); }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadProgress({ done: 0, total: files.length });
    try {
      const list = Array.from(files).slice(0, 8);
      const uploaded = await uploadImagesToCloudinary(list, (done, total) => setUploadProgress({ done, total }));
      setImages(prev => [...prev, ...uploaded]);
    } catch (e: any) {
      alert(e?.message ?? "이미지 업로드 실패");
    } finally { setUploading(false); setUploadProgress(null); }
  };

  const removeImg = (i: number) => setImages(prev => prev.filter((_, idx) => idx !== i));

  const mentionable = employees.filter(e => e.id !== authSession.employeeId);
  const mentionedList = mentionable.filter(e => mentionIds.includes(e.id));
  const toggleMention = (id: number) => setMentionIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:w-[560px] sm:rounded-2xl sm:max-h-[86vh] max-h-[92vh] overflow-y-auto rounded-t-3xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900">새 글 작성</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"><XIcon size={18} /></button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          {/* 타입 선택 */}
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(TYPE_META) as PostType[]).map(t => {
              const meta = TYPE_META[t];
              const Icon = meta.icon;
              const active = type === t;
              return (
                <button key={t} onClick={() => setType(t)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition ${active ? `${meta.bg} ${meta.border} ${meta.text}` : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                  <Icon size={18} />
                  <span className="text-[11px] font-black">{meta.label}</span>
                </button>
              );
            })}
          </div>

          {/* 제목 */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목 (필수)"
            className="w-full px-3 py-2.5 text-[15px] font-bold border border-slate-200 rounded-xl focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            maxLength={300}
          />

          {/* 카테고리 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-500">카테고리:</span>
            <button onClick={() => setCategory("")}
              className={`px-2 py-0.5 rounded-full text-[11px] font-black ${category === "" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500"}`}>없음</button>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-black ${category === c ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{c}</button>
            ))}
          </div>

          {/* 본문 */}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="본문 · 상황을 자세히 남겨주세요"
            rows={5}
            className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-xl focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 resize-none"
          />

          {/* 이미지 첨부 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading || images.length >= 8}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12px] font-black disabled:opacity-40"
              >
                <Camera size={14} /> 사진 첨부
              </button>
              <span className="text-[11px] text-slate-400">{images.length}/8</span>
              {uploading && uploadProgress && (
                <span className="text-[11px] font-black text-orange-500 flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" /> {uploadProgress.done}/{uploadProgress.total} 업로드 중
                </span>
              )}
              <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" className="hidden"
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
            </div>
            {images.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {images.map((img, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200">
                    <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removeImg(i)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 text-rose-600 hover:bg-white shadow-md flex items-center justify-center">
                      <XIcon size={12} strokeWidth={3} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* @멘션 */}
          {/* 담당자 지정 기능 제거됨 · 관리자 전원 자동 알림만 유지 */}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-4 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[13px] font-black">취소</button>
          <button onClick={submit} disabled={saving || uploading || !title.trim()}
            className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-black shadow-sm disabled:opacity-40 flex items-center gap-1">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            등록
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 게시글 상세 모달
function DetailModal({
  postId, authSession, employees, isManager, initialEdit, onClose, onChanged,
}: {
  postId: number; authSession: AuthSession | null; employees: Employee[]; isManager: boolean; initialEdit?: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [post, setPost] = useState<BoardPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentBody, setCommentBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  // 댓글 수정 상태
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const saveCommentEdit = async (commentId: number) => {
    const body = editingCommentBody.trim();
    if (!body || !authSession) return;
    try {
      const res = await fetch(`/api/board/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editor_id: authSession.employeeId, body }),
      });
      if (res.ok) {
        setEditingCommentId(null);
        setEditingCommentBody("");
        await load();
        onChanged();
      }
    } catch { /* silent */ }
  };
  const [commentImages, setCommentImages] = useState<UploadedImage[]>([]);
  const [uploadingCmt, setUploadingCmt] = useState(false);
  const cmtFileRef = useRef<HTMLInputElement>(null);
  // 게시글 본문 수정 상태
  const [editingPost, setEditingPost] = useState(false);
  const [editDraft, setEditDraft] = useState<{ title: string; body: string; category: string }>({ title: "", body: "", category: "" });
  const [editImages, setEditImages] = useState<UploadedImage[]>([]);
  const [editUploading, setEditUploading] = useState(false);
  const [editUploadProgress, setEditUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const editFileRef = useRef<HTMLInputElement>(null);
  const startEditPost = () => {
    if (!post) return;
    setEditDraft({ title: post.title ?? "", body: post.body ?? "", category: post.category ?? "" });
    // 기존 이미지들을 편집 상태로 복사
    const existing: UploadedImage[] = (post.images ?? []).map(img => ({
      image_url: img.image_url,
      public_id: img.public_id ?? "",
      width: img.width ?? 0,
      height: img.height ?? 0,
    }));
    setEditImages(existing);
    setEditingPost(true);
  };
  const handleEditFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setEditUploading(true);
    setEditUploadProgress({ done: 0, total: files.length });
    try {
      const list = Array.from(files).slice(0, 8 - editImages.length);
      if (list.length === 0) { alert("이미지는 최대 8장까지 첨부 가능합니다."); return; }
      const uploaded = await uploadImagesToCloudinary(list, (done, total) => setEditUploadProgress({ done, total }));
      setEditImages(prev => [...prev, ...uploaded]);
    } catch (e: any) {
      alert(e?.message ?? "이미지 업로드 실패");
    } finally {
      setEditUploading(false);
      setEditUploadProgress(null);
    }
  };
  const removeEditImage = (index: number) => {
    setEditImages(prev => prev.filter((_, i) => i !== index));
  };
  const saveEditPost = async () => {
    if (!post || !authSession) return;
    if (!editDraft.title.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/board/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editor_id: authSession.employeeId,
          editor_level: authSession.level ?? 0,
          title: editDraft.title.trim(),
          body: editDraft.body,
          category: editDraft.category || null,
          images: editImages,
        }),
      });
      if (res.ok) {
        setEditingPost(false);
        setEditImages([]);
        await load();
        onChanged();
      }
    } finally { setSavingEdit(false); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/board/posts/${postId}`);
      if (res.ok) setPost(await res.json());
    } finally { setLoading(false); }
  }, [postId]);

  useEffect(() => { load(); }, [load]);

  // 리스트의 [수정] 버튼으로 진입한 경우 자동으로 편집 모드로 전환
  useEffect(() => {
    if (!initialEdit || !post || editingPost) return;
    const canEditNow = post.author_id === authSession?.employeeId || isManager;
    if (canEditNow) startEditPost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id, initialEdit]);

  if (!post && !loading) return null;

  const isAuthor = post?.author_id === authSession?.employeeId;
  const canEdit = isAuthor || isManager;

  const submitComment = async () => {
    if (!commentBody.trim() || !authSession?.employeeId) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/board/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_id: authSession.employeeId,
          author_name: authSession.employeeName ?? "",
          author_rank: authSession.employeeRank ?? null,
          body: commentBody.trim(),
          images: commentImages,
        }),
      });
      if (res.ok) {
        setCommentBody("");
        setCommentImages([]);
        await load();
        onChanged();
      }
    } finally { setPosting(false); }
  };

  const changeStatus = async (status: Status) => {
    if (!canEdit || !authSession) return;
    await fetch(`/api/board/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editor_id: authSession.employeeId, editor_level: authSession.level ?? 0, status }),
    });
    await load(); onChanged();
  };

  const togglePin = async () => {
    if (!isManager || !post || !authSession) return;
    await fetch(`/api/board/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editor_id: authSession.employeeId, editor_level: authSession.level ?? 0, pinned: !post.pinned }),
    });
    await load(); onChanged();
  };

  // 답변 채택 기능 제거됨

  const deletePost = async () => {
    if (!canEdit || !authSession) return;
    if (!confirm("이 글을 삭제할까요?")) return;
    await fetch(`/api/board/posts/${postId}?editor_id=${authSession.employeeId}&editor_level=${authSession.level ?? 0}`, { method: "DELETE" });
    onChanged(); onClose();
  };

  const handleCmtFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingCmt(true);
    try {
      const list = Array.from(files).slice(0, 4);
      const uploaded = await uploadImagesToCloudinary(list);
      setCommentImages(prev => [...prev, ...uploaded]);
    } catch (e: any) {
      alert(e?.message ?? "이미지 업로드 실패");
    } finally { setUploadingCmt(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:w-[640px] sm:rounded-2xl sm:max-h-[92vh] max-h-[95vh] overflow-y-auto rounded-t-3xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-200 px-3 sm:px-4 py-3 flex items-center gap-2">
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronLeft size={18} /></button>
          <span className="text-[12px] font-black text-slate-800">이슈공유</span>
          <span className="flex-1" />
          {isManager && post && (
            <button onClick={togglePin}
              className={`p-1.5 rounded-lg ${post.pinned ? "text-orange-500 bg-orange-50" : "text-slate-400 hover:bg-slate-100"}`} title={post.pinned ? "고정 해제" : "고정"}>
              <Pin size={14} />
            </button>
          )}
          {canEdit && !editingPost && (
            <button onClick={startEditPost} className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50" title="글 수정"><Pencil size={14} /></button>
          )}
          {canEdit && (
            <button onClick={deletePost} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50" title="삭제"><Trash2 size={14} /></button>
          )}
        </div>

        {loading || !post ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-orange-400" size={24} /></div>
        ) : (
          <>
            {/* 본문 */}
            <div className="p-4 sm:p-5 border-b border-slate-100">
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                {(() => {
                  const meta = TYPE_META[post.post_type] ?? TYPE_META.question;
                  const status = STATUS_META[post.status] ?? STATUS_META.open;
                  const Icon = meta.icon;
                  return (
                    <>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${meta.bg} ${meta.text} ${meta.border} border`}>
                        <Icon size={10} /> {meta.label}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-black ${status.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} /> {status.label}
                      </span>
                      {post.category && (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-1.5 py-0.5">{post.category}</span>
                      )}
                    </>
                  );
                })()}
              </div>
              {editingPost ? (
                <input
                  type="text"
                  value={editDraft.title}
                  onChange={e => setEditDraft(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="제목"
                  className="w-full text-lg sm:text-xl font-black text-slate-900 leading-snug bg-white border-2 border-indigo-300 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              ) : (
                <h1 className="text-lg sm:text-xl font-black text-slate-900 leading-snug break-keep">
                  {post.title}
                </h1>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                <AuthorBadge name={post.author_name} rank={post.author_rank} />
                <span className="text-slate-300">·</span>
                <span className="text-[10px] text-slate-400 font-semibold">{timeAgo(post.created_at)}</span>
              </div>
              {editingPost ? (
                <>
                  <textarea
                    value={editDraft.body}
                    onChange={e => setEditDraft(prev => ({ ...prev, body: e.target.value }))}
                    rows={6}
                    placeholder="본문"
                    className="w-full mt-3 text-[13px] text-slate-700 leading-relaxed bg-white border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 resize-y"
                  />
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className="text-[10px] font-black text-slate-500 mr-1">카테고리:</span>
                    <button type="button" onClick={() => setEditDraft(prev => ({ ...prev, category: "" }))}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-black ${editDraft.category === "" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500"}`}>없음</button>
                    {CATEGORIES.map(c => (
                      <button key={c} type="button" onClick={() => setEditDraft(prev => ({ ...prev, category: c }))}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-black ${editDraft.category === c ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{c}</button>
                    ))}
                  </div>
                  {/* 이미지 편집: 기존 이미지 + 신규 첨부 + 취소(X) */}
                  <div className="mt-3 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                    <div className="flex items-center gap-2 mb-2">
                      <input ref={editFileRef} type="file" accept="image/*" multiple capture="environment" className="hidden"
                        onChange={(e) => { handleEditFiles(e.target.files); e.target.value = ""; }} />
                      <button type="button" onClick={() => editFileRef.current?.click()} disabled={editUploading || editImages.length >= 8}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-[11px] font-black text-slate-700 disabled:opacity-40 cursor-pointer">
                        <Camera size={12} /> 사진 첨부
                      </button>
                      <span className="text-[11px] text-slate-400">{editImages.length}/8</span>
                      {editUploading && editUploadProgress && (
                        <span className="text-[10px] text-indigo-500 font-black inline-flex items-center gap-1">
                          <Loader2 size={10} className="animate-spin" />
                          업로드 {editUploadProgress.done}/{editUploadProgress.total}
                        </span>
                      )}
                    </div>
                    {editImages.length > 0 && (
                      <div className="grid grid-cols-4 gap-1.5">
                        {editImages.map((img, i) => (
                          <div key={`${img.image_url}-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-white">
                            <img src={img.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                            <button type="button" onClick={() => removeEditImage(i)}
                              className="absolute top-0.5 right-0.5 w-6 h-6 rounded-full bg-black/70 hover:bg-black text-white text-xs font-black flex items-center justify-center cursor-pointer shadow"
                              title="사진 첨부 취소"
                            >✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-3">
                    <button type="button" onClick={() => { setEditingPost(false); setEditImages([]); }} disabled={savingEdit || editUploading}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[12px] font-black disabled:opacity-40">취소</button>
                    <button type="button" onClick={saveEditPost} disabled={savingEdit || editUploading || !editDraft.title.trim()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-[12px] font-black disabled:opacity-40">
                      {savingEdit ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} 저장
                    </button>
                  </div>
                </>
              ) : (
                post.body && (
                  <p className="text-[13px] text-slate-700 whitespace-pre-wrap leading-relaxed mt-3">{post.body}</p>
                )
              )}
              {!editingPost && post.images && post.images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                  {post.images.map(img => (
                    <button key={img.id} onClick={() => setPreviewImg(img.image_url)}
                      className="aspect-square rounded-xl overflow-hidden border border-slate-200 hover:border-orange-300 transition">
                      <img src={img.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}

              {/* 액션 바 · 도움됨/확인 배지 제거 · 상태 변경만 유지 */}
              {canEdit && (
                <div className="flex items-center gap-1 mt-4 text-[10px] flex-wrap">
                  <span className="text-slate-400 font-bold">상태:</span>
                  {(Object.keys(STATUS_META) as Status[]).map(s => {
                    const meta = STATUS_META[s];
                    const active = post.status === s;
                    return (
                      <button key={s} onClick={() => changeStatus(s)}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-black transition ${active ? `${meta.text} bg-white border border-current` : "text-slate-500 bg-slate-100 hover:bg-slate-200"}`}>
                        <span className={`w-1 h-1 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 댓글 */}
            <div className="p-4 sm:p-5 flex flex-col gap-3">
              <h3 className="text-[12px] font-black text-slate-500 uppercase tracking-wider">
                댓글 {post.comments?.length ?? 0}
              </h3>
              {(!post.comments || post.comments.length === 0) ? (
                <p className="text-[12px] text-slate-400 text-center py-4">아직 댓글이 없습니다</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {post.comments.map(c => {
                    const canEdit = c.author_id === authSession?.employeeId;
                    const editing = editingCommentId === c.id;
                    return (
                    <div key={c.id} className="rounded-xl p-3 border bg-slate-50 border-slate-100">
                      <div className="flex items-center gap-2 mb-1">
                        <AuthorBadge name={c.author_name} rank={c.author_rank} />
                        <span className="flex-1" />
                        <span className="text-[10px] text-slate-400 font-semibold">{timeAgo(c.created_at)}</span>
                      </div>
                      {editing ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            value={editingCommentBody}
                            onChange={(e) => setEditingCommentBody(e.target.value)}
                            rows={3}
                            className="w-full px-2 py-1.5 text-[13px] border border-orange-300 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 resize-none"
                          />
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => saveCommentEdit(c.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-black"
                            ><Check size={11} strokeWidth={3} /> 저장</button>
                            <button
                              onClick={() => { setEditingCommentId(null); setEditingCommentBody(""); }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-black"
                            ><XIcon size={11} strokeWidth={3} /> 취소</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-[13px] text-slate-700 whitespace-pre-wrap">{c.body}</p>
                          {c.images && c.images.length > 0 && (
                            <div className="flex gap-1.5 mt-2 flex-wrap">
                              {c.images.map(img => (
                                <button key={img.id} onClick={() => setPreviewImg(img.image_url)}
                                  className="w-16 h-16 rounded-md overflow-hidden border border-slate-200">
                                  <img src={img.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                </button>
                              ))}
                            </div>
                          )}
                          {canEdit && (
                            <button
                              onClick={() => { setEditingCommentId(c.id); setEditingCommentBody(c.body); }}
                              className="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-orange-600 hover:text-orange-800"
                            ><Pencil size={10} /> 수정</button>
                          )}
                        </>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 댓글 입력 */}
            {authSession?.employeeId && (
              <div className="sticky bottom-0 bg-white border-t border-slate-200 p-3 flex flex-col gap-2">
                {commentImages.length > 0 && (
                  <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
                    {commentImages.map((img, i) => (
                      <div key={i} className="relative w-14 h-14 rounded-md overflow-hidden border border-slate-200 shrink-0">
                        <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                        <button onClick={() => setCommentImages(prev => prev.filter((_, x) => x !== i))}
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-white/90 text-rose-600 flex items-center justify-center shadow">
                          <XIcon size={9} strokeWidth={3} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button onClick={() => cmtFileRef.current?.click()} disabled={uploadingCmt}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 shrink-0 disabled:opacity-40" title="사진 첨부">
                    {uploadingCmt ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                  </button>
                  <input ref={cmtFileRef} type="file" accept="image/*" multiple capture="environment" className="hidden"
                    onChange={(e) => { handleCmtFiles(e.target.files); e.target.value = ""; }} />
                  <input
                    type="text"
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                    placeholder="댓글 작성"
                    className="flex-1 px-3 py-2 text-[13px] border border-slate-200 rounded-xl focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  />
                  <button onClick={submitComment} disabled={posting || !commentBody.trim()}
                    className="p-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white shrink-0 disabled:opacity-40">
                    {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* 이미지 프리뷰 */}
        {previewImg && (
          <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4" onClick={() => setPreviewImg(null)}>
            <img src={previewImg} alt="" className="max-w-full max-h-full object-contain rounded-xl" onClick={e => e.stopPropagation()} />
            <button
              type="button"
              onClick={() => setPreviewImg(null)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-slate-800 text-2xl leading-none font-black shadow-lg flex items-center justify-center cursor-pointer"
              aria-label="닫기"
            >×</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default BoardPage;
