// src/components/BoardPage/DetailModal.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · BoardPage 게시글 상세 모달 이관
// 프레임워크: Spinner · useToast · toastClass · useConfirm · apiClient · cloudinaryUpload · AuthorBadge · Modal primitive
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft, Pin, MessageCircle, Trash2, Camera, Pencil, Check, X as XIcon, Send,
} from "lucide-react";
import { api } from "../../lib/apiClient";
import { Spinner } from "../common/Spinner";
import { Modal } from "../common/Modal";
import { Badge } from "../common/Badge";
import { useConfirm } from "../../hooks/useConfirm";
import { useToast, toastClass } from "../../hooks/useToast";
import { uploadImagesToCloudinary, type UploadedImage } from "../../lib/cloudinaryUpload";
import type { AuthSession } from "../../types";
import type { BoardPost, Employee, Status } from "./types";
import { TYPE_META, STATUS_META, CATEGORIES } from "./constants";
import { timeAgo, AuthorBadge } from "./utils";

export function DetailModal({
  postId, authSession, employees, isManager, initialEdit, onClose, onChanged,
}: {
  postId: number; authSession: AuthSession | null; employees: Employee[]; isManager: boolean; initialEdit?: boolean; onClose: () => void; onChanged: () => void;
}) {
  void employees;
  const confirm = useConfirm();
  const { toast, showError } = useToast();
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
      await api.patch(`/api/board/comments/${commentId}`, { editor_id: authSession.employeeId, body });
      setEditingCommentId(null);
      setEditingCommentBody("");
      await load();
      onChanged();
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
      if (list.length === 0) { showError("이미지는 최대 8장까지 첨부 가능합니다."); return; }
      const uploaded = await uploadImagesToCloudinary(list, (done, total) => setEditUploadProgress({ done, total }));
      setEditImages(prev => [...prev, ...uploaded]);
    } catch (e: any) {
      showError(e?.message ?? "이미지 업로드 실패");
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
      await api.patch(`/api/board/posts/${postId}`, {
        editor_id: authSession.employeeId,
        editor_level: authSession.level ?? 0,
        title: editDraft.title.trim(),
        body: editDraft.body,
        category: editDraft.category || null,
        images: editImages,
      });
      setEditingPost(false);
      setEditImages([]);
      await load();
      onChanged();
    } finally { setSavingEdit(false); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<BoardPost>(`/api/board/posts/${postId}`);
      setPost(data);
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
      await api.post(`/api/board/posts/${postId}/comments`, {
        author_id: authSession.employeeId,
        author_name: authSession.employeeName ?? "",
        author_rank: authSession.employeeRank ?? null,
        body: commentBody.trim(),
        images: commentImages,
      });
      setCommentBody("");
      setCommentImages([]);
      await load();
      onChanged();
    } finally { setPosting(false); }
  };

  const changeStatus = async (status: Status) => {
    if (!canEdit || !authSession) return;
    await api.patch(`/api/board/posts/${postId}`, { editor_id: authSession.employeeId, editor_level: authSession.level ?? 0, status });
    await load(); onChanged();
  };

  const togglePin = async () => {
    if (!isManager || !post || !authSession) return;
    await api.patch(`/api/board/posts/${postId}`, { editor_id: authSession.employeeId, editor_level: authSession.level ?? 0, pinned: !post.pinned });
    await load(); onChanged();
  };

  const deletePost = async () => {
    if (!canEdit || !authSession) return;
    if (!await confirm({ message: "이 글을 삭제할까요?", danger: true })) return;
    await api.del(`/api/board/posts/${postId}?editor_id=${authSession.employeeId}&editor_level=${authSession.level ?? 0}`);
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
      showError(e?.message ?? "이미지 업로드 실패");
    } finally { setUploadingCmt(false); }
  };

  // 헤더 좌측: ChevronLeft + 제목
  const modalTitle = (
    <div className="flex items-center gap-2 min-w-0">
      <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-500 shrink-0"><ChevronLeft size={18} /></button>
      <span className="text-[14px] font-bold text-zinc-800 truncate">이슈공유</span>
    </div>
  );

  // 헤더 우측: Pin · Pencil · Trash2
  const headerRight = (
    <div className="flex items-center gap-0.5">
      {isManager && post && (
        <button onClick={togglePin}
          className={`p-1.5 rounded-lg ${post.pinned ? "text-orange-500 bg-orange-50" : "text-zinc-400 hover:bg-zinc-100"}`} title={post.pinned ? "고정 해제" : "고정"}>
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
  );

  // 댓글 입력 footer
  const commentFooter = authSession?.employeeId ? (
    <div className="w-full flex flex-col gap-2">
      {commentImages.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {commentImages.map((img, i) => (
            <div key={i} className="relative w-14 h-14 rounded-md overflow-hidden border border-line shrink-0">
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
          className="p-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 shrink-0 disabled:opacity-40" title="사진 첨부">
          {uploadingCmt ? <Spinner size={14} /> : <Camera size={14} />}
        </button>
        <input ref={cmtFileRef} type="file" accept="image/*" multiple capture="environment" className="hidden"
          onChange={(e) => { handleCmtFiles(e.target.files); e.target.value = ""; }} />
        <input
          type="text"
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
          placeholder="댓글 작성"
          className="flex-1 px-3 py-2 text-[15px] border border-line rounded-xl focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
        />
        <button onClick={submitComment} disabled={posting || !commentBody.trim()}
          className="p-2 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white shrink-0 disabled:opacity-40">
          {posting ? <Spinner size={14} /> : <Send size={14} />}
        </button>
      </div>
    </div>
  ) : undefined;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={modalTitle}
        showClose={false}
        headerRight={headerRight}
        size="md"
        backdropIntensity="brand"
        closeOnBackdrop
        closeOnEsc
        footer={commentFooter}
        className="sm:max-w-[640px]"
      >
        {loading || !post ? (
          <div className="flex justify-center py-20"><Spinner size={24} tone="orange" /></div>
        ) : (
          <>
            {/* 본문 */}
            <div className="p-4 sm:p-5 border-b border-zinc-100">
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                {(() => {
                  const meta = TYPE_META[post.post_type] ?? TYPE_META.question;
                  const status = STATUS_META[post.status] ?? STATUS_META.open;
                  const Icon = meta.icon;
                  return (
                    <>
                      <Badge
                        shape="pill"
                        size="xs"
                        className={`${meta.bg} ${meta.text} ${meta.border}`}
                        icon={<Icon size={10} />}
                      >
                        {meta.label}
                      </Badge>
                      <span className={`inline-flex items-center gap-1 text-[14px] font-bold ${status.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} /> {status.label}
                      </span>
                      {post.category && (
                        <Badge tone="zinc" shape="pill" size="xs">{post.category}</Badge>
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
                  className="w-full text-lg sm:text-xl font-bold text-zinc-900 leading-snug bg-white border-2 border-indigo-300 rounded-xl px-3 py-2 focus:outline-none focus:border-brand-deep"
                />
              ) : (
                <h1 className="text-lg sm:text-xl font-bold text-zinc-900 leading-snug break-keep">
                  {post.title}
                </h1>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                <AuthorBadge name={post.author_name} rank={post.author_rank} />
                <span className="text-zinc-300">·</span>
                <span className="text-[14px] text-zinc-400 font-semibold">{timeAgo(post.created_at)}</span>
              </div>
              {editingPost ? (
                <>
                  <textarea
                    value={editDraft.body}
                    onChange={e => setEditDraft(prev => ({ ...prev, body: e.target.value }))}
                    rows={6}
                    placeholder="본문"
                    className="w-full mt-3 text-[15px] text-zinc-700 leading-relaxed bg-white border border-zinc-300 rounded-xl px-3 py-2 focus:outline-none focus:border-brand-deep resize-y"
                  />
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className="text-[14px] font-bold text-zinc-500 mr-1">카테고리:</span>
                    <button type="button" onClick={() => setEditDraft(prev => ({ ...prev, category: "" }))}
                      className={`px-2 py-0.5 rounded-full text-[15px] font-bold ${editDraft.category === "" ? "bg-brand-deep text-white" : "bg-zinc-100 text-zinc-500"}`}>없음</button>
                    {CATEGORIES.map(c => (
                      <button key={c} type="button" onClick={() => setEditDraft(prev => ({ ...prev, category: c }))}
                        className={`px-2 py-0.5 rounded-full text-[15px] font-bold ${editDraft.category === c ? "bg-brand-deep text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"}`}>{c}</button>
                    ))}
                  </div>
                  {/* 이미지 편집: 기존 이미지 + 신규 첨부 + 취소(X) */}
                  <div className="mt-3 border border-line rounded-xl p-2 bg-zinc-50/50">
                    <div className="flex items-center gap-2 mb-2">
                      <input ref={editFileRef} type="file" accept="image/*" multiple capture="environment" className="hidden"
                        onChange={(e) => { handleEditFiles(e.target.files); e.target.value = ""; }} />
                      <button type="button" onClick={() => editFileRef.current?.click()} disabled={editUploading || editImages.length >= 8}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-zinc-300 hover:bg-zinc-50 text-[15px] font-bold text-zinc-700 disabled:opacity-40 cursor-pointer">
                        <Camera size={12} /> 사진 첨부
                      </button>
                      <span className="text-[15px] text-zinc-400">{editImages.length}/8</span>
                      {editUploading && editUploadProgress && (
                        <span className="text-[14px] text-indigo-500 font-bold inline-flex items-center gap-1">
                          <Spinner size={10} />
                          업로드 {editUploadProgress.done}/{editUploadProgress.total}
                        </span>
                      )}
                    </div>
                    {editImages.length > 0 && (
                      <div className="grid grid-cols-4 gap-1.5">
                        {editImages.map((img, i) => (
                          <div key={`${img.image_url}-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-line bg-white">
                            <img src={img.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                            <button type="button" onClick={() => removeEditImage(i)}
                              className="absolute top-0.5 right-0.5 w-6 h-6 rounded-full bg-black/70 hover:bg-black text-white text-xs font-bold flex items-center justify-center cursor-pointer shadow"
                              title="사진 첨부 취소"
                            >✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-3">
                    <button type="button" onClick={() => { setEditingPost(false); setEditImages([]); }} disabled={savingEdit || editUploading}
                      className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-[14px] font-bold disabled:opacity-40">취소</button>
                    <button type="button" onClick={saveEditPost} disabled={savingEdit || editUploading || !editDraft.title.trim()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[14px] font-bold disabled:opacity-40">
                      {savingEdit ? <Spinner size={12} /> : <Send size={12} />} 저장
                    </button>
                  </div>
                </>
              ) : (
                post.body && (
                  <p className="text-[15px] text-zinc-700 whitespace-pre-wrap leading-relaxed mt-3">{post.body}</p>
                )
              )}
              {!editingPost && post.images && post.images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                  {post.images.map(img => (
                    <button key={img.id} onClick={() => setPreviewImg(img.image_url)}
                      className="aspect-square rounded-xl overflow-hidden border border-line hover:border-line transition">
                      <img src={img.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}

              {/* 액션 바 · 상태 변경 */}
              {canEdit && (
                <div className="flex items-center gap-1 mt-4 text-[14px] flex-wrap">
                  <span className="text-zinc-400 font-bold">상태:</span>
                  {(Object.keys(STATUS_META) as Status[]).map(s => {
                    const meta = STATUS_META[s];
                    const active = post.status === s;
                    return (
                      <button key={s} onClick={() => changeStatus(s)}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-bold transition ${active ? `${meta.text} bg-white border border-current` : "text-zinc-500 bg-zinc-100 hover:bg-zinc-200"}`}>
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
              <h3 className="text-[14px] font-bold text-zinc-500 uppercase tracking-wider">
                <MessageCircle size={12} className="inline mr-1" />
                댓글 {post.comments?.length ?? 0}
              </h3>
              {(!post.comments || post.comments.length === 0) ? (
                <p className="text-[14px] text-zinc-400 text-center py-4">아직 댓글이 없습니다</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {post.comments.map(c => {
                    const canEditC = c.author_id === authSession?.employeeId;
                    const editing = editingCommentId === c.id;
                    return (
                    <div key={c.id} className="rounded-xl p-3 border bg-zinc-50 border-zinc-100">
                      <div className="flex items-center gap-2 mb-1">
                        <AuthorBadge name={c.author_name} rank={c.author_rank} />
                        <span className="flex-1" />
                        <span className="text-[14px] text-zinc-400 font-semibold">{timeAgo(c.created_at)}</span>
                      </div>
                      {editing ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            value={editingCommentBody}
                            onChange={(e) => setEditingCommentBody(e.target.value)}
                            rows={3}
                            className="w-full px-2 py-1.5 text-[15px] border border-line rounded-lg focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint resize-none"
                          />
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => saveCommentEdit(c.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[15px] font-bold"
                            ><Check size={11} strokeWidth={3} /> 저장</button>
                            <button
                              onClick={() => { setEditingCommentId(null); setEditingCommentBody(""); }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-[15px] font-bold"
                            ><XIcon size={11} strokeWidth={3} /> 취소</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-[15px] text-zinc-700 whitespace-pre-wrap">{c.body}</p>
                          {c.images && c.images.length > 0 && (
                            <div className="flex gap-1.5 mt-2 flex-wrap">
                              {c.images.map(img => (
                                <button key={img.id} onClick={() => setPreviewImg(img.image_url)}
                                  className="w-16 h-16 rounded-md overflow-hidden border border-line">
                                  <img src={img.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                </button>
                              ))}
                            </div>
                          )}
                          {canEditC && (
                            <button
                              onClick={() => { setEditingCommentId(c.id); setEditingCommentBody(c.body); }}
                              className="mt-2 inline-flex items-center gap-1 text-[14px] font-bold text-brand-deep hover:text-[#0d3a5c]"
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
          </>
        )}

        {/* 이미지 프리뷰 */}
        {previewImg && (
          <div className="fixed inset-0 z-[60] backdrop-brand-strong flex items-center justify-center p-4" onClick={() => setPreviewImg(null)}>
            <img src={previewImg} alt="" className="max-w-full max-h-full object-contain rounded-xl" onClick={e => e.stopPropagation()} />
            <button
              type="button"
              onClick={() => setPreviewImg(null)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-zinc-800 text-2xl leading-none font-bold shadow-lg flex items-center justify-center cursor-pointer"
              aria-label="닫기"
            >×</button>
          </div>
        )}
      </Modal>
      {/* toast */}
      {toast && <div className={toastClass(toast.tone)}>{toast.message}</div>}
    </>
  );
}
