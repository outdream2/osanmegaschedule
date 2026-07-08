// src/components/BoardPage.tsx
// 이슈공유 게시판 · 질문/이슈/메모 + 댓글 + 이미지 첨부 + @멘션 + 반응
// - 모든 직원 접근 가능
// - 이미지: Cloudinary 업로드 (클라 압축 후 25GB 무료)
// - 담당자 표시: [이름 직급] · 헤더 스타일과 통일

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HelpCircle, AlertTriangle, StickyNote, Search, Plus, Send, X, Image as ImageIcon,
  ChevronLeft, Pin, CheckCircle2, MessageCircle, ThumbsUp, Eye, Trash2, Loader2,
  Camera, AtSign,
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
  const [search, setSearch] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
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

  const filtered: BoardPost[] = useMemo(() => posts, [posts]);

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

        {/* 타입 필터 */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <button onClick={() => setFilterType("")}
            className={`px-2.5 py-1 rounded-full text-[11px] font-black transition ${filterType === "" ? "bg-slate-800 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>전체</button>
          {(Object.keys(TYPE_META) as PostType[]).map(t => {
            const meta = TYPE_META[t];
            const Icon = meta.icon;
            const active = filterType === t;
            return (
              <button key={t} onClick={() => setFilterType(t)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black transition ${active ? `${meta.bg} ${meta.text} ${meta.border} border-2` : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
                <Icon size={11} /> {meta.label}
              </button>
            );
          })}
          <span className="mx-1 text-slate-300">·</span>
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

        {/* 목록 */}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-orange-400" size={24} /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
            <StickyNote size={32} className="text-slate-300" />
            <span className="text-xs">등록된 글이 없습니다</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((p: BoardPost) => {
              const open = () => { setDetailId(p.id); };
              return <PostCard key={p.id} post={p} onOpen={open} />;
            })}
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
          onClose={() => setDetailId(null)}
          onChanged={loadPosts}
        />
      )}
    </div>
  );
};

// ── 게시글 카드
const PostCard: React.FC<{ post: BoardPost; onOpen: () => void }> = ({ post, onOpen }) => {
  const meta = TYPE_META[post.post_type] ?? TYPE_META.question;
  const status = STATUS_META[post.status] ?? STATUS_META.open;
  const Icon = meta.icon;
  const resolved = post.status === "resolved";
  return (
    <button
      onClick={onOpen}
      className="w-full text-left bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm hover:shadow-md hover:border-orange-300 transition cursor-pointer group"
    >
      <div className="flex items-start gap-2 sm:gap-3">
        <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border ${meta.bg} ${meta.border}`}>
          <Icon size={16} className={meta.text} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {post.pinned && <Pin size={11} className="text-orange-500" />}
            <span className={`inline-flex items-center gap-1 text-[10px] font-black ${status.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} /> {status.label}
            </span>
            {post.category && (
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-1.5 py-0.5">{post.category}</span>
            )}
          </div>
          <h3 className={`text-[14px] sm:text-[15px] font-black text-slate-900 leading-tight break-keep ${resolved ? "line-through text-slate-400" : ""}`}>
            {post.title}
          </h3>
          {post.body && (
            <p className="text-[12px] text-slate-500 line-clamp-2 mt-0.5">{post.body}</p>
          )}
          <div className="flex items-center gap-2 mt-2 text-[10px]">
            <AuthorBadge name={post.author_name} rank={post.author_rank} />
            <span className="text-slate-300">·</span>
            <span className="text-slate-400 font-semibold">{timeAgo(post.created_at)}</span>
            <span className="flex-1" />
            {post.images && post.images.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-slate-500 font-bold">
                <ImageIcon size={11} /> {post.images.length}
              </span>
            )}
            {(post.comment_count ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5 text-indigo-500 font-bold">
                <MessageCircle size={11} /> {post.comment_count}
              </span>
            )}
          </div>
          {post.images && post.images.length > 0 && (
            <div className="flex gap-1.5 mt-2 overflow-x-auto scrollbar-none">
              {post.images.slice(0, 4).map((img, i) => (
                <img key={i} src={img.image_url} alt="" loading="lazy"
                  className="shrink-0 w-16 h-16 object-cover rounded-lg border border-slate-200" />
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
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
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:w-[560px] sm:rounded-2xl sm:max-h-[86vh] max-h-[92vh] overflow-y-auto rounded-t-3xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900">새 글 작성</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"><X size={18} /></button>
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
                      <X size={12} strokeWidth={3} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* @멘션 */}
          <div>
            <button
              onClick={() => setShowMentionPicker(v => !v)}
              className="flex items-center gap-1.5 text-[12px] font-black text-indigo-600 hover:text-indigo-800"
            >
              <AtSign size={13} /> 담당자 지정 ({mentionIds.length})
            </button>
            {mentionedList.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {mentionedList.map(e => (
                  <button key={e.id} onClick={() => toggleMention(e.id)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-black hover:bg-indigo-200">
                    @{e.name}{e.rank ? " " + e.rank : ""}
                    <X size={10} />
                  </button>
                ))}
              </div>
            )}
            {showMentionPicker && (
              <div className="mt-2 max-h-40 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50 p-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
                {mentionable.map(e => {
                  const active = mentionIds.includes(e.id);
                  return (
                    <button key={e.id} onClick={() => toggleMention(e.id)}
                      className={`text-left text-[12px] font-bold px-2 py-1 rounded-md border transition ${active ? "bg-indigo-100 border-indigo-300 text-indigo-800" : "bg-white border-slate-200 text-slate-600 hover:border-indigo-200"}`}>
                      {e.name}{e.rank ? ` ${e.rank}` : ""}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
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
  postId, authSession, employees, isManager, onClose, onChanged,
}: {
  postId: number; authSession: AuthSession | null; employees: Employee[]; isManager: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [post, setPost] = useState<BoardPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentBody, setCommentBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [commentImages, setCommentImages] = useState<UploadedImage[]>([]);
  const [uploadingCmt, setUploadingCmt] = useState(false);
  const cmtFileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/board/posts/${postId}`);
      if (res.ok) setPost(await res.json());
    } finally { setLoading(false); }
  }, [postId]);

  useEffect(() => { load(); }, [load]);

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

  const acceptAnswer = async (commentId: number) => {
    if (!isAuthor || !authSession) return;
    await fetch(`/api/board/comments/${commentId}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editor_id: authSession.employeeId }),
    });
    await load(); onChanged();
  };

  const deletePost = async () => {
    if (!canEdit || !authSession) return;
    if (!confirm("이 글을 삭제할까요?")) return;
    await fetch(`/api/board/posts/${postId}?editor_id=${authSession.employeeId}&editor_level=${authSession.level ?? 0}`, { method: "DELETE" });
    onChanged(); onClose();
  };

  const react = async (reaction: "helpful" | "seen") => {
    if (!authSession?.employeeId) return;
    await fetch(`/api/board/posts/${postId}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: authSession.employeeId, reaction }),
    });
    await load();
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

  const myReactions = new Set((post?.reactions ?? []).filter(r => r.employee_id === authSession?.employeeId).map(r => r.reaction));
  const helpfulCount = (post?.reactions ?? []).filter(r => r.reaction === "helpful").length;
  const seenCount = (post?.reactions ?? []).filter(r => r.reaction === "seen").length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
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
              <h1 className={`text-lg sm:text-xl font-black text-slate-900 leading-snug break-keep ${post.status === "resolved" ? "line-through text-slate-400" : ""}`}>
                {post.title}
              </h1>
              <div className="flex items-center gap-2 mt-1.5">
                <AuthorBadge name={post.author_name} rank={post.author_rank} />
                <span className="text-slate-300">·</span>
                <span className="text-[10px] text-slate-400 font-semibold">{timeAgo(post.created_at)}</span>
              </div>
              {post.body && (
                <p className="text-[13px] text-slate-700 whitespace-pre-wrap leading-relaxed mt-3">{post.body}</p>
              )}
              {post.images && post.images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                  {post.images.map(img => (
                    <button key={img.id} onClick={() => setPreviewImg(img.image_url)}
                      className="aspect-square rounded-xl overflow-hidden border border-slate-200 hover:border-orange-300 transition">
                      <img src={img.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}

              {/* 액션 바 */}
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <button onClick={() => react("helpful")}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black transition ${myReactions.has("helpful") ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  <ThumbsUp size={11} /> 도움됨 {helpfulCount > 0 && helpfulCount}
                </button>
                <button onClick={() => react("seen")}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black transition ${myReactions.has("seen") ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  <Eye size={11} /> 확인 {seenCount > 0 && seenCount}
                </button>
                <span className="flex-1" />
                {canEdit && (
                  <div className="flex items-center gap-1 text-[10px]">
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
                  {post.comments.map(c => (
                    <div key={c.id} className={`rounded-xl p-3 border ${c.is_answer ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-100"}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <AuthorBadge name={c.author_name} rank={c.author_rank} />
                        {c.is_answer && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                            <CheckCircle2 size={9} /> 채택
                          </span>
                        )}
                        <span className="flex-1" />
                        <span className="text-[10px] text-slate-400 font-semibold">{timeAgo(c.created_at)}</span>
                      </div>
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
                      {isAuthor && !c.is_answer && (
                        <button onClick={() => acceptAnswer(c.id)}
                          className="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 hover:text-emerald-800">
                          <CheckCircle2 size={10} /> 답변으로 채택
                        </button>
                      )}
                    </div>
                  ))}
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
                          <X size={9} strokeWidth={3} />
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
            <img src={previewImg} alt="" className="max-w-full max-h-full object-contain rounded-xl" />
            <button className="absolute top-4 right-4 p-2 rounded-full bg-white/20 text-white hover:bg-white/40"><X size={20} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

export default BoardPage;
