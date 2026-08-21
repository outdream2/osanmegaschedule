// src/components/BoardPage/ComposerModal.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · BoardPage 새 글 작성 모달 이관
// 프레임워크: Spinner · useToast · toastClass · apiClient · cloudinaryUpload
import React, { useRef, useState } from "react";
import { X as XIcon, Camera, Send } from "lucide-react";
import { api } from "../../lib/apiClient";
import { Spinner } from "../common/Spinner";
import { useToast, toastClass } from "../../hooks/useToast";
import { uploadImagesToCloudinary, type UploadedImage } from "../../lib/cloudinaryUpload";
import type { AuthSession } from "../../types";
import type { Employee, PostType } from "./types";
import { TYPE_META, CATEGORIES } from "./constants";

export function ComposerModal({
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
  // 2026-08-21 · Framework Phase 3 · alert → useToast
  const { toast, showError } = useToast();

  const submit = async () => {
    if (!title.trim()) { showError("제목을 입력해 주세요"); return; }
    setSaving(true);
    try {
      await api.post("/api/board/posts", {
        author_id: authSession.employeeId,
        author_name: authSession.employeeName ?? "",
        author_rank: authSession.employeeRank ?? null,
        post_type: type,
        title: title.trim(),
        body,
        category: category || null,
        mentions: mentionIds,
        images,
      });
      onCreated();
    } catch (e: any) {
      showError(e?.message ?? "등록 실패");
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
      showError(e?.message ?? "이미지 업로드 실패");
    } finally { setUploading(false); setUploadProgress(null); }
  };

  const removeImg = (i: number) => setImages(prev => prev.filter((_, idx) => idx !== i));

  const mentionable = employees.filter(e => e.id !== authSession.employeeId);
  const mentionedList = mentionable.filter(e => mentionIds.includes(e.id));
  const toggleMention = (id: number) => setMentionIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    // 2026-08-17 v2 · Modal 통일
    <div className="fixed inset-0 z-50 backdrop-brand flex items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:w-[560px] sm:rounded-xl sm:max-h-[86vh] max-h-[92vh] overflow-y-auto rounded-t-2xl shadow-brand-modal flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-line px-4 py-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-900">새 글 작성</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-500"><XIcon size={18} /></button>
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
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition ${active ? `${meta.bg} ${meta.border} ${meta.text}` : "bg-white border-line text-zinc-500 hover:border-zinc-300"}`}>
                  <Icon size={18} />
                  <span className="text-[15px] font-bold">{meta.label}</span>
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
            className="w-full px-3 py-2.5 text-[15px] font-bold border border-line rounded-xl focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
            maxLength={300}
          />

          {/* 카테고리 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[15px] font-bold text-zinc-500">카테고리:</span>
            <button onClick={() => setCategory("")}
              className={`px-2 py-0.5 rounded-full text-[15px] font-bold ${category === "" ? "bg-brand-deep text-white" : "bg-zinc-100 text-zinc-500"}`}>없음</button>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                className={`px-2 py-0.5 rounded-full text-[15px] font-bold ${category === c ? "bg-brand-deep text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"}`}>{c}</button>
            ))}
          </div>

          {/* 본문 */}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="본문 · 상황을 자세히 남겨주세요"
            rows={5}
            className="w-full px-3 py-2 text-[15px] border border-line rounded-xl focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint resize-none"
          />

          {/* 이미지 첨부 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading || images.length >= 8}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[14px] font-bold disabled:opacity-40"
              >
                <Camera size={14} /> 사진 첨부
              </button>
              <span className="text-[15px] text-zinc-400">{images.length}/8</span>
              {uploading && uploadProgress && (
                <span className="text-[15px] font-bold text-orange-500 flex items-center gap-1">
                  <Spinner size={11} tone="amber" /> {uploadProgress.done}/{uploadProgress.total} 업로드 중
                </span>
              )}
              <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" className="hidden"
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
            </div>
            {images.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {images.map((img, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-line">
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

        <div className="sticky bottom-0 bg-white border-t border-line px-4 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[15px] font-bold">취소</button>
          <button onClick={submit} disabled={saving || uploading || !title.trim()}
            className="px-4 py-2 rounded-xl bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[15px] font-bold shadow-sm disabled:opacity-40 flex items-center gap-1">
            {saving ? <Spinner size={13} /> : <Send size={13} />}
            등록
          </button>
        </div>
      </div>
      {/* 2026-08-21 · Framework Phase 3 · toast · alert 대체 */}
      {toast && <div className={toastClass(toast.tone)}>{toast.message}</div>}
    </div>
  );
}
