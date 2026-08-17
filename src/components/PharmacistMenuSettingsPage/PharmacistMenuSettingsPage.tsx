// src/components/PharmacistMenuSettingsPage/PharmacistMenuSettingsPage.tsx
// 2026-08-17 · apiClient 마이그레이션

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { useConfirm } from "../../hooks/useConfirm";
import {
  Plus, Trash2, Loader2, AlertCircle, X, Save, Pencil,
  ArrowUp, ArrowDown, CheckCircle2, FileText, CloudUpload,
} from "lucide-react";
import Modal from "../common/Modal";
import type { AuthSession } from "../../types";

export type PharmTabKey = "education" | "reference" | "video" | "docs";

export interface PharmMenuItem {
  id: number;
  tab_key: PharmTabKey;
  category_key: string;
  title: string;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  storage_path: string | null;
  storage: string | null;
  sort_order: number;
  uploaded_by: string | null;
  uploaded_by_id: number | null;
  created_at: string;
  updated_at: string;
}

// 20MB (서버와 일치)
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽을 수 없습니다"));
    reader.readAsDataURL(file);
  });
}

interface PharmacistMenuSettingsModalProps {
  open: boolean;
  onClose: () => void;
  tabKey: PharmTabKey;
  tabLabel: string;
  categoryKey: string;
  categoryTitle: string;
  authSession: AuthSession | null;
  /** 저장/삭제 발생 시 부모에게 알림 (리스트 리로드용) */
  onChanged?: () => void;
}

export const PharmacistMenuSettingsModal: React.FC<PharmacistMenuSettingsModalProps> = ({
  open,
  onClose,
  tabKey,
  tabLabel,
  categoryKey,
  categoryTitle,
  authSession,
  onChanged,
}) => {
  const confirm = useConfirm();

  const editorLevel = authSession?.level ?? 0;
  const isAdmin = editorLevel >= 8;

  const [items, setItems] = useState<PharmMenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 신규 등록 폼
  const [newTitle, setNewTitle] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadOkAt, setUploadOkAt] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 인라인 편집 (id → 편집 title)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ── 로드 ──────────────────────────────────────────
  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);
    try {
      const qs = `?tab=${encodeURIComponent(tabKey)}&category=${encodeURIComponent(categoryKey)}`;
      const { data } = await api.get<any>(`/api/pharmacist-menu-items${qs}`);
      setItems(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setLoadError(err instanceof ApiError ? err.message : (err?.message ?? "불러오기 실패"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [open, tabKey, categoryKey]);

  useEffect(() => { load(); }, [load]);

  // 모달이 열릴 때마다 입력 상태 초기화
  useEffect(() => {
    if (open) {
      setNewTitle("");
      setNewFile(null);
      setUploadError(null);
      setUploadOkAt(null);
      setEditingId(null);
      setEditingTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open, tabKey, categoryKey]);

  // ── 신규 등록 ─────────────────────────────────────
  const onFileChosen = (file: File | null) => {
    setUploadError(null);
    if (!file) { setNewFile(null); return; }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`파일 크기 초과 (${(file.size / 1024 / 1024).toFixed(1)}MB > 20MB)`);
      setNewFile(null);
      return;
    }
    setNewFile(file);
    if (!newTitle.trim()) {
      const base = file.name.replace(/\.[^.]+$/, "");
      setNewTitle(base.slice(0, 80));
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    if (!isAdmin) { setUploadError("관리자 권한이 필요합니다."); return; }
    const title = newTitle.trim();
    if (!title) { setUploadError("항목 이름을 입력하세요."); return; }

    setUploading(true);
    try {
      let dataUrl: string | undefined;
      let fileName: string | undefined;
      if (newFile) {
        dataUrl = await readFileAsDataUrl(newFile);
        fileName = newFile.name;
      }
      const nextOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order ?? 0)) + 1 : 0;
      await api.post("/api/pharmacist-menu-items", {
        editor_level: editorLevel,
        tab_key: tabKey,
        category_key: categoryKey,
        title,
        sort_order: nextOrder,
        data_url: dataUrl,
        file_name: fileName,
        uploaded_by: authSession?.employeeName ?? null,
        uploaded_by_id: authSession?.employeeId ?? null,
      });
      // reset form + reload
      setNewTitle("");
      setNewFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadOkAt(Date.now());
      await load();
      onChanged?.();
    } catch (err: any) {
      setUploadError(err instanceof ApiError ? err.message : (err?.message ?? "등록 실패"));
    } finally {
      setUploading(false);
    }
  };

  // ── 인라인 편집 저장 ──────────────────────────────
  const startEdit = (row: PharmMenuItem) => {
    setEditingId(row.id);
    setEditingTitle(row.title);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
  };
  const saveEdit = async (row: PharmMenuItem) => {
    const t = editingTitle.trim();
    if (!t) { alert("이름을 입력하세요."); return; }
    setSavingId(row.id);
    try {
      await api.patch(`/api/pharmacist-menu-items/${row.id}`, { editor_level: editorLevel, title: t });
      cancelEdit();
      await load();
      onChanged?.();
    } catch (err: any) {
      alert(err?.message ?? "저장 실패");
    } finally {
      setSavingId(null);
    }
  };

  // ── 순서 변경 (위/아래로 스왑) ────────────────────
  const moveItem = async (row: PharmMenuItem, dir: -1 | 1) => {
    const idx = items.findIndex(i => i.id === row.id);
    if (idx < 0) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    const other = items[swapIdx];
    // 두 개 patch (동시)
    setSavingId(row.id);
    try {
      await Promise.all([
        api.patch(`/api/pharmacist-menu-items/${row.id}`, { editor_level: editorLevel, sort_order: other.sort_order }),
        api.patch(`/api/pharmacist-menu-items/${other.id}`, { editor_level: editorLevel, sort_order: row.sort_order }),
      ]);
      await load();
      onChanged?.();
    } catch (err: any) {
      alert(err?.message ?? "순서 변경 실패");
    } finally {
      setSavingId(null);
    }
  };

  // ── 삭제 ─────────────────────────────────────────
  const handleDelete = async (row: PharmMenuItem) => {
    if (!isAdmin) return;
    if (!await confirm({ message: `정말 삭제하시겠습니까?\n\n${row.title}`, danger: true })) return;
    setDeletingId(row.id);
    try {
      await api.del(`/api/pharmacist-menu-items/${row.id}?editor_level=${editorLevel}`);
      await load();
      onChanged?.();
    } catch (err: any) {
      alert(err?.message ?? "삭제 실패");
    } finally {
      setDeletingId(null);
    }
  };

  const title = useMemo(() => (
    <span className="flex items-center gap-2">
      <span className="text-zinc-500 text-[12px] font-bold uppercase tracking-wider">{tabLabel}</span>
      <span className="text-zinc-300">/</span>
      <span className="text-zinc-800 truncate">{categoryTitle}</span>
      <span className="text-zinc-400 text-[12px] font-bold">· 하위메뉴 설정</span>
    </span>
  ), [tabLabel, categoryTitle]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={title}
    >
      <div className="flex flex-col gap-4">
        {/* ── 신규 등록 폼 ─────────────────────── */}
        {isAdmin && (
          <form
            onSubmit={handleAdd}
            className="bg-sky-50/60 border border-sky-200 rounded-xl p-3 sm:p-4 flex flex-col gap-3"
          >
            <div className="flex items-center gap-2">
              <Plus size={15} className="text-sky-600" />
              <span className="text-[13px] font-bold text-sky-800">신규 하위메뉴 추가</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 items-stretch">
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="항목 이름 (예: 병용 금기 요약표)"
                className="flex-1 bg-white border border-line rounded-lg px-3 py-2 text-sm font-semibold text-zinc-800 focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition placeholder:text-zinc-400 placeholder:font-normal"
                maxLength={120}
                required
              />
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="sr-only"
                  onChange={e => onFileChosen(e.target.files?.[0] ?? null)}
                  accept=".pdf,application/pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-line bg-white text-zinc-600 hover:bg-zinc-50 text-sm font-semibold transition cursor-pointer whitespace-nowrap"
                  title="파일 선택 (PDF 권장 · 최대 20MB)"
                >
                  <CloudUpload size={14} />
                  {newFile ? "파일 변경" : "파일 선택"}
                </button>
              </div>
              <button
                type="submit"
                disabled={uploading || !newTitle.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:bg-sky-200 disabled:text-sky-400 text-white text-sm font-bold shadow-sm cursor-pointer transition"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {uploading ? "등록 중..." : "등록"}
              </button>
            </div>

            {/* 선택된 파일 표시 */}
            {newFile && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-emerald-200">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span className="text-xs font-bold text-zinc-700 break-all flex-1">{newFile.name}</span>
                <span className="text-[10px] text-zinc-400 font-semibold tabular-nums shrink-0">{fmtBytes(newFile.size)}</span>
                <button
                  type="button"
                  onClick={() => { setNewFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className="shrink-0 text-zinc-400 hover:text-rose-600 cursor-pointer"
                  title="파일 제거"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {uploadError && (
              <div className="flex items-start gap-1.5 text-xs text-rose-700 font-semibold bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                {uploadError}
              </div>
            )}

            {uploadOkAt && Date.now() - uploadOkAt < 3000 && !uploadError && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2">
                <CheckCircle2 size={13} className="shrink-0" />
                등록 완료
              </div>
            )}

            <div className="text-[11px] text-zinc-500 leading-relaxed">
              · 파일 없이 이름만 등록해도 됩니다 (이후 파일 교체는 삭제 후 재등록).<br />
              · PDF 권장 · 브라우저 내장 뷰어로 열립니다 · 이미지·Word 는 새 창.<br />
              · 최대 20MB · Supabase Storage 실패 시 로컬 저장 자동 폴백.
            </div>
          </form>
        )}

        {/* ── 목록 ─────────────────────────────── */}
        <div className="bg-white border border-line rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-100 bg-zinc-50 flex items-center gap-1.5">
            <FileText size={13} className="text-zinc-400" />
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">등록된 하위메뉴</span>
            <span className="ml-auto text-[10px] font-bold text-zinc-400 tabular-nums">{items.length}건</span>
          </div>

          {loadError && (
            <div className="flex items-center gap-2 p-3 text-sm text-rose-700 font-semibold bg-rose-50 border-b border-rose-200">
              <AlertCircle size={14} className="shrink-0" />
              {loadError}
            </div>
          )}

          {loading ? (
            <div className="py-10 flex flex-col items-center gap-2">
              <Loader2 size={18} className="animate-spin text-sky-500" />
              <span className="text-xs text-zinc-400 font-bold">불러오는 중...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2 text-center px-4">
              <FileText size={24} className="text-zinc-300" />
              <p className="text-sm font-bold text-zinc-500">등록된 하위메뉴가 없습니다</p>
              <p className="text-xs text-zinc-400">
                {isAdmin ? "위 폼에서 첫 항목을 추가하세요" : "관리자가 등록하면 표시됩니다"}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {items.map((row, idx) => {
                const isEdit = editingId === row.id;
                return (
                  <li key={row.id} className="px-3 py-2 flex items-center gap-2 hover:bg-zinc-50/60">
                    {/* 순서 · 이동 버튼 */}
                    {isAdmin && (
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveItem(row, -1)}
                          disabled={idx === 0 || savingId === row.id}
                          className="w-5 h-5 rounded flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-zinc-500"
                          title="위로"
                        >
                          <ArrowUp size={10} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(row, 1)}
                          disabled={idx === items.length - 1 || savingId === row.id}
                          className="w-5 h-5 rounded flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-zinc-500"
                          title="아래로"
                        >
                          <ArrowDown size={10} />
                        </button>
                      </div>
                    )}

                    {/* 이름 (편집/표시) */}
                    <div className="flex-1 min-w-0">
                      {isEdit ? (
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={e => setEditingTitle(e.target.value)}
                          className="w-full bg-white border border-sky-300 rounded-md px-2 py-1 text-sm font-semibold text-zinc-800 focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
                          maxLength={120}
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === "Enter") saveEdit(row);
                            else if (e.key === "Escape") cancelEdit();
                          }}
                        />
                      ) : (
                        <>
                          <div className="text-sm font-bold text-zinc-800 break-all leading-snug">{row.title}</div>
                          <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
                            {row.file_name
                              ? <>파일: <span className="text-zinc-500 font-semibold">{row.file_name}</span> · {fmtBytes(row.file_size)}</>
                              : <span className="italic">파일 없음 (이름만)</span>}
                          </div>
                        </>
                      )}
                    </div>

                    {/* 액션 */}
                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        {isEdit ? (
                          <>
                            <button
                              type="button"
                              onClick={() => saveEdit(row)}
                              disabled={savingId === row.id}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                              title="저장 (Enter)"
                            >
                              {savingId === row.id ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-xs font-semibold cursor-pointer"
                              title="취소 (ESC)"
                            >
                              <X size={11} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(row)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-line hover:bg-zinc-50 text-zinc-600 text-xs font-semibold cursor-pointer"
                              title="이름 변경"
                            >
                              <Pencil size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(row)}
                              disabled={deletingId === row.id}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-600 border border-rose-200 text-xs font-semibold cursor-pointer"
                              title="삭제"
                            >
                              {deletingId === row.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!isAdmin && (
          <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700">
            <AlertCircle size={12} className="shrink-0 mt-0.5" />
            관리자(level ≥ 8) 만 하위메뉴를 추가·수정·삭제할 수 있습니다.
          </div>
        )}
      </div>
    </Modal>
  );
};

export default PharmacistMenuSettingsModal;
