// src/components/BoardPage/InlineDetail.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · BoardPage 인라인 상세 이관
// 프레임워크: Spinner · AuthorBadge · apiClient
import React, { useCallback, useEffect, useState } from "react";
import { MessageCircle, Send, Pencil, Check } from "lucide-react";
import { api } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { Spinner } from "../common/Spinner";
import { Modal } from "../common/Modal";
import type { AuthSession } from "../../types";
import type { BoardPost, Employee } from "./types";
import { timeAgo, AuthorBadge } from "./utils";

export const InlineDetail: React.FC<{
  postId: number;
  authSession: AuthSession | null;
  employees: Employee[];
  isManager: boolean;
  onOpenFull: () => void;
  onChanged: () => void;
}> = ({ postId, authSession, employees, isManager, onOpenFull, onChanged }) => {
  void employees; void isManager; // 확장 필요 시 사용
  const { toast, showError, showSuccess } = useToast();
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
      const { data } = await api.get<BoardPost>(`/api/board/posts/${postId}`);
      setPost(data);
    } finally { setLoading(false); }
  }, [postId]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!commentBody.trim() || !authSession?.employeeId) return;
    setPosting(true);
    try {
      await api.post(`/api/board/posts/${postId}/comments`, {
        author_id: authSession.employeeId,
        author_name: authSession.employeeName ?? "",
        author_rank: authSession.employeeRank ?? null,
        body: commentBody.trim(),
      });
      setCommentBody(""); await load(); onChanged();
      showSuccess("댓글이 등록되었습니다");
    } catch (e: any) {
      showError(`댓글 등록 실패: ${e?.message ?? "네트워크 오류"}`);
    } finally { setPosting(false); }
  };

  const saveEdit = async (id: number) => {
    if (!editingCommentBody.trim() || !authSession) return;
    try {
      await api.patch(`/api/board/comments/${id}`, { editor_id: authSession.employeeId, body: editingCommentBody.trim() });
      setEditingCommentId(null); setEditingCommentBody(""); await load(); onChanged();
      showSuccess("댓글이 수정되었습니다");
    } catch (e: any) {
      showError(`댓글 수정 실패: ${e?.message ?? "네트워크 오류"}`);
    }
  };

  return (
    <div className="bg-zinc-50/60 border-t border-line px-3 py-2.5">
      {toast && <div className={toastClass(toast.tone)}>{toast.message}</div>}
      {loading || !post ? (
        <div className="flex justify-center py-3 text-zinc-400"><Spinner size={16} tone="zinc" /></div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* 본문 요약 */}
          {post.body && (
            <p className="text-[14px] text-zinc-600 whitespace-pre-wrap leading-relaxed">{post.body}</p>
          )}
          {/* 이미지 · 크게 표시 · 클릭 시 원본 뷰어 */}
          {post.images && post.images.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {post.images.map(img => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setPreviewImg(img.image_url)}
                  className="block w-full aspect-square rounded-xl overflow-hidden border border-line hover:border-line hover:shadow-md transition"
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
            <div className="flex items-center gap-1.5 text-[14px] font-bold text-zinc-500 uppercase tracking-wider">
              <MessageCircle size={11} /> 댓글 {post.comments?.length ?? 0}
              <button onClick={onOpenFull} className="ml-auto text-[14px] font-bold text-brand-deep hover:text-[#0d3a5c] normal-case tracking-normal">전체보기 →</button>
            </div>
            {(post.comments ?? []).map(c => {
              const canEdit = c.author_id === authSession?.employeeId;
              const editing = editingCommentId === c.id;
              return (
                <div key={c.id} className="bg-white rounded-lg p-2 border border-zinc-100">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AuthorBadge name={c.author_name} rank={c.author_rank} />
                    <span className="flex-1" />
                    <span className="text-[15px] text-zinc-400 font-semibold">{timeAgo(c.created_at)}</span>
                  </div>
                  {editing ? (
                    <div className="flex flex-col gap-1">
                      <textarea value={editingCommentBody} onChange={(e) => setEditingCommentBody(e.target.value)} rows={2}
                        className="w-full px-2 py-1 text-[14px] border border-line rounded focus:outline-none focus:border-brand-deep resize-none" />
                      <div className="flex gap-1">
                        <button onClick={() => saveEdit(c.id)} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[14px] font-bold">
                          <Check size={10} strokeWidth={3} /> 저장
                        </button>
                        <button onClick={() => { setEditingCommentId(null); setEditingCommentBody(""); }} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-[14px] font-bold">
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-[14px] text-zinc-700 whitespace-pre-wrap">{c.body}</p>
                      {canEdit && (
                        <button onClick={() => { setEditingCommentId(c.id); setEditingCommentBody(c.body); }}
                          className="mt-1 inline-flex items-center gap-0.5 text-[15px] font-bold text-brand-deep hover:text-[#0d3a5c]">
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
                className="flex-1 px-2 py-1 text-[14px] border border-line rounded-lg focus:outline-none focus:border-brand-deep"
              />
              <button onClick={submit} disabled={posting || !commentBody.trim()}
                className="p-1.5 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white disabled:opacity-40 shrink-0">
                {posting ? <Spinner size={12} /> : <Send size={12} />}
              </button>
            </div>
          )}
        </div>
      )}
      {/* 사진 원본 미리보기 · 2026-08-23 · #191 · Modal primitive · brand-strong backdrop */}
      {previewImg && (
        <Modal
          open
          onClose={() => setPreviewImg(null)}
          size="full"
          bodyPadding="none"
          showClose={false}
          backdropIntensity="brand-strong"
          zIndex={60}
        >
          <div className="relative flex items-center justify-center p-4 min-h-[80vh]">
            <button
              type="button"
              onClick={() => setPreviewImg(null)}
              className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-zinc-800 text-2xl leading-none font-bold shadow-lg flex items-center justify-center cursor-pointer"
              aria-label="닫기"
            >×</button>
            <img src={previewImg} alt="" className="max-w-full max-h-[85vh] object-contain rounded-xl" />
          </div>
        </Modal>
      )}
    </div>
  );
};
