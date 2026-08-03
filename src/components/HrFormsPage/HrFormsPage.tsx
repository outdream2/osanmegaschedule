// src/components/HrFormsPage/HrFormsPage.tsx
// 각종 양식 관리 페이지 (근로계약서 · 사직서 · 서약서 · 기타)
// - 관리자(level >= 2) · 업로드 · 삭제 가능
// - 모든 인증 사용자 · 다운로드 가능
// - 리스트 UI 원칙:
//     1) 헤더 클릭 정렬 (모든 컬럼)
//     2) 컬럼 폭 · min-width + colgroup (드래그 리사이즈는 폰트/뷰포트 안정성 우선 · 후속 개선 여지)
//     3) 카테고리 색상 배지
// - embedded 모드 · BusinessManagePage 안 서브탭 · 자체 AppNavHeader skip
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText, Download, Upload, Trash2, Plus, X, RefreshCw, Loader2,
  ChevronDown, ChevronUp, ChevronsUpDown, Filter, FileEdit, FileSignature, FilePlus, FileArchive,
} from "lucide-react";
import { AppNavHeader, type AppNavPage } from "../AppNavHeader";
import type { AuthSession } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────────

type CategoryKey = "contract" | "resignation" | "pledge" | "etc";

interface HrForm {
  id: number;
  title: string;
  category: CategoryKey;
  file_url: string;
  file_name: string | null;
  file_size: number | null;
  mime_type?: string | null;
  storage_path?: string | null;
  storage?: string | null;
  uploaded_by: string | null;
  uploaded_by_id: number | null;
  created_at: string;
}

interface HrFormsPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  /** true 시 자체 AppNavHeader skip (BusinessManagePage 임베드용) */
  embedded?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────────────────────

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

const CATEGORIES: Array<{ key: CategoryKey; label: string; badge: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { key: "contract",    label: "근로계약서", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: FileSignature },
  { key: "resignation", label: "사직서",     badge: "bg-rose-50 text-rose-700 border-rose-200",         icon: FileEdit      },
  { key: "pledge",      label: "서약서",     badge: "bg-indigo-50 text-indigo-700 border-indigo-200",   icon: FileText      },
  { key: "etc",         label: "기타",       badge: "bg-slate-100 text-slate-700 border-slate-200",     icon: FileArchive   },
];

const CATEGORY_MAP: Record<CategoryKey, { label: string; badge: string; icon: React.ComponentType<{ size?: number; className?: string }> }> =
  CATEGORIES.reduce((acc, c) => {
    acc[c.key] = { label: c.label, badge: c.badge, icon: c.icon };
    return acc;
  }, {} as any);

type SortKey = "title" | "category" | "file_name" | "file_size" | "uploaded_by" | "created_at";
type SortDir = "asc" | "desc";

// ─────────────────────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}.${m}.${dd} ${hh}:${mm}`;
  } catch { return String(iso); }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽을 수 없습니다"));
    reader.readAsDataURL(file);
  });
}

// 다운로드 · 원본 파일명 유지 · CORS 회피 위해 fetch → blob → object URL
async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename || "form";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
  } catch {
    // fallback · 새 탭 열기
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────

const HrFormsPage: React.FC<HrFormsPageProps> = ({ authSession, onBack, onNavigate, onLogout, embedded = false }) => {
  const isManager = (authSession?.level ?? 0) >= 2;

  // 데이터
  const [forms, setForms] = useState<HrForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 필터
  const [categoryFilter, setCategoryFilter] = useState<"all" | CategoryKey>("all");
  const [searchQ, setSearchQ] = useState("");

  // 정렬
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // 업로드 상태
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState<CategoryKey>("contract");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 삭제 상태
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const qs = categoryFilter === "all" ? "" : `?category=${categoryFilter}`;
      const res = await fetch(`/api/hr-forms${qs}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `서버 오류 (${res.status})`);
      const data = await res.json();
      setForms(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setLoadError(err?.message ?? "불러오기 실패");
      setForms([]);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => { load(); }, [load]);

  // ── 정렬/필터 적용된 목록 ─────────────────────────────────────────────────
  const displayForms = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    const filtered = q
      ? forms.filter(f =>
          (f.title || "").toLowerCase().includes(q) ||
          (f.file_name || "").toLowerCase().includes(q) ||
          (f.uploaded_by || "").toLowerCase().includes(q)
        )
      : forms.slice();

    const dir = sortDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1 * dir;
      if (bv == null) return -1 * dir;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "ko") * dir;
    });
    return filtered;
  }, [forms, searchQ, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "created_at" || key === "file_size" ? "desc" : "asc");
    }
  };

  // ── 업로드 핸들러 ─────────────────────────────────────────────────────────
  const onFileChosen = (file: File | null) => {
    setUploadError(null);
    if (!file) { setUploadFile(null); return; }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`파일 크기 초과 (${(file.size / 1024 / 1024).toFixed(1)}MB > ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)`);
      setUploadFile(null);
      return;
    }
    setUploadFile(file);
    if (!uploadTitle.trim()) {
      // 파일명(확장자 제외) 기본값
      const base = file.name.replace(/\.[^.]+$/, "");
      setUploadTitle(base.slice(0, 80));
    }
  };

  const resetUploadForm = () => {
    setShowUploadForm(false);
    setUploadTitle("");
    setUploadCategory("contract");
    setUploadFile(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    if (!isManager) { setUploadError("관리자 권한이 필요합니다."); return; }
    if (!uploadTitle.trim()) { setUploadError("양식명을 입력하세요."); return; }
    if (!uploadFile) { setUploadError("파일을 선택하세요."); return; }
    if (uploadFile.size > MAX_UPLOAD_BYTES) {
      setUploadError(`파일 크기 초과 (${(uploadFile.size / 1024 / 1024).toFixed(1)}MB > 10MB)`);
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(uploadFile);
      const res = await fetch("/api/hr-forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: uploadTitle.trim(),
          category: uploadCategory,
          data_url: dataUrl,
          file_name: uploadFile.name,
          uploaded_by: authSession?.employeeName ?? null,
          uploaded_by_id: authSession?.employeeId ?? null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `업로드 실패 (${res.status})`);
      }
      resetUploadForm();
      await load();
    } catch (err: any) {
      setUploadError(err?.message ?? "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  // ── 삭제 ──────────────────────────────────────────────────────────────────
  const handleDelete = async (row: HrForm) => {
    if (!isManager) return;
    if (!window.confirm(`정말 삭제하시겠습니까?\n\n${row.title}`)) return;
    setDeletingId(row.id);
    try {
      const editorLevel = authSession?.level ?? 0;
      const res = await fetch(`/api/hr-forms/${row.id}?editor_level=${editorLevel}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `삭제 실패 (${res.status})`);
      }
      setForms(prev => prev.filter(f => f.id !== row.id));
    } catch (err: any) {
      window.alert(err?.message ?? "삭제 실패");
    } finally {
      setDeletingId(null);
    }
  };

  // ── 렌더 헬퍼 ────────────────────────────────────────────────────────────
  const SortIcon: React.FC<{ k: SortKey }> = ({ k }) => {
    if (sortKey !== k) return <ChevronsUpDown size={12} className="text-slate-300" />;
    return sortDir === "asc"
      ? <ChevronUp size={12} className="text-slate-600" />
      : <ChevronDown size={12} className="text-slate-600" />;
  };

  const HeaderCell: React.FC<{
    k: SortKey;
    label: string;
    className?: string;
    align?: "left" | "right" | "center";
  }> = ({ k, label, className = "", align = "left" }) => (
    <th
      className={`px-3 py-2 text-[12px] font-black uppercase tracking-wide text-slate-500 select-none cursor-pointer hover:bg-slate-100 transition-colors border-b border-slate-200 ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      } ${className}`}
      onClick={() => toggleSort(k)}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        <SortIcon k={k} />
      </span>
    </th>
  );

  // ── 리턴 ─────────────────────────────────────────────────────────────────
  return (
    <div className={embedded ? "flex-1 flex flex-col" : "min-h-screen bg-slate-50 flex flex-col"}>
      {/* embedded 모드가 아니면 공용 헤더 */}
      {!embedded && (
        <AppNavHeader
          activePage={"hr-forms" as AppNavPage}
          authSession={authSession}
          onBack={onBack}
          onNavigate={onNavigate}
          onLogout={onLogout}
        />
      )}

      <main className="flex-1 max-w-[1200px] mx-auto w-full px-3 sm:px-5 py-5 flex flex-col gap-4">
        {/* 페이지 제목 + 업로드 버튼 */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <FileText size={20} />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-slate-800 leading-none">각종 양식</h1>
              <p className="text-xs text-slate-500 mt-1">근로계약서 · 사직서 · 서약서 · 기타 양식 다운로드 및 업로드</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 text-sm font-semibold transition-colors cursor-pointer"
              title="새로고침"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span className="hidden sm:inline">새로고침</span>
            </button>

            {isManager && (
              <button
                type="button"
                onClick={() => setShowUploadForm(v => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold shadow-sm transition-colors cursor-pointer"
                title="양식 업로드"
              >
                {showUploadForm ? <X size={14} /> : <Plus size={14} />}
                <span>{showUploadForm ? "취소" : "양식 업로드"}</span>
              </button>
            )}
          </div>
        </div>

        {/* 업로드 폼 */}
        {showUploadForm && isManager && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Upload size={16} className="text-amber-600" />
              <p className="text-sm font-black text-slate-800">신규 양식 업로드</p>
            </div>
            <form onSubmit={handleUpload} className="flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1.5">양식명 <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={e => setUploadTitle(e.target.value)}
                    placeholder="예: 2026년 표준 근로계약서"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-sm font-semibold focus:outline-none focus:border-amber-500 transition"
                    maxLength={120}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1.5">카테고리 <span className="text-rose-500">*</span></label>
                  <div className="relative">
                    <select
                      value={uploadCategory}
                      onChange={e => setUploadCategory(e.target.value as CategoryKey)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-sm font-semibold focus:outline-none focus:border-amber-500 transition appearance-none cursor-pointer pr-9"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">파일 <span className="text-rose-500">*</span></label>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={e => onFileChosen(e.target.files?.[0] ?? null)}
                    className="block text-sm text-slate-700 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:font-semibold file:cursor-pointer hover:file:bg-slate-200 transition"
                  />
                  {uploadFile && (
                    <span className="text-xs text-slate-500 font-semibold">
                      {uploadFile.name} · {fmtBytes(uploadFile.size)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">최대 10MB · PDF · Word · Excel · 한글(HWP) · 이미지 등 모든 형식</p>
              </div>

              {uploadError && (
                <div className="text-xs text-rose-600 font-semibold bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{uploadError}</div>
              )}

              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={resetUploadForm}
                  disabled={uploading}
                  className="px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFile || !uploadTitle.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white text-sm font-bold shadow-sm transition-colors cursor-pointer"
                >
                  {uploading ? <><Loader2 size={14} className="animate-spin" /><span>업로드 중...</span></> : <><Upload size={14} /><span>업로드</span></>}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 필터 · 검색 */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex items-center gap-1.5 shrink-0">
            <Filter size={13} className="text-slate-400" />
            <span className="text-xs font-black text-slate-500 uppercase tracking-wide">카테고리</span>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <CatChip active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")} label="전체" count={forms.length} chipClass="bg-slate-100 text-slate-700 border-slate-200" activeClass="bg-slate-800 text-white border-slate-800" />
            {CATEGORIES.map(c => {
              const cnt = forms.filter(f => f.category === c.key).length;
              return (
                <CatChip
                  key={c.key}
                  active={categoryFilter === c.key}
                  onClick={() => setCategoryFilter(c.key)}
                  label={c.label}
                  count={cnt}
                  chipClass={c.badge}
                  activeClass={activeClassFor(c.key)}
                />
              );
            })}
          </div>
          <div className="flex-1" />
          <input
            type="text"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="양식명 · 파일명 · 업로더 검색"
            className="w-full sm:w-64 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 font-semibold focus:outline-none focus:border-amber-400 transition"
          />
        </div>

        {/* 리스트 */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {loadError && (
            <div className="p-4 text-sm text-rose-600 font-semibold bg-rose-50 border-b border-rose-200">
              {loadError}
            </div>
          )}

          {/* 데스크톱: 테이블 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <colgroup>
                <col style={{ minWidth: 40, width: 44 }} />
                <col style={{ minWidth: 200 }} />
                <col style={{ minWidth: 110, width: 130 }} />
                <col style={{ minWidth: 200 }} />
                <col style={{ minWidth: 90, width: 100 }} />
                <col style={{ minWidth: 100, width: 130 }} />
                <col style={{ minWidth: 140, width: 170 }} />
                <col style={{ minWidth: 140, width: isManager ? 170 : 100 }} />
              </colgroup>
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 border-b border-slate-200"></th>
                  <HeaderCell k="title"       label="양식명" />
                  <HeaderCell k="category"    label="분류" />
                  <HeaderCell k="file_name"   label="파일명" />
                  <HeaderCell k="file_size"   label="크기" align="right" />
                  <HeaderCell k="uploaded_by" label="업로더" />
                  <HeaderCell k="created_at"  label="업로드일" />
                  <th className="px-3 py-2 text-center text-[12px] font-black uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    액션
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400 text-sm font-bold">
                      <Loader2 size={16} className="animate-spin inline mr-2" />
                      불러오는 중...
                    </td>
                  </tr>
                )}
                {!loading && displayForms.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400 text-sm font-bold">
                      등록된 양식이 없습니다.
                    </td>
                  </tr>
                )}
                {!loading && displayForms.map(f => {
                  const cat = CATEGORY_MAP[f.category] ?? CATEGORY_MAP.etc;
                  const CatIcon = cat.icon;
                  return (
                    <tr key={f.id} className="hover:bg-amber-50/40 transition-colors border-b border-slate-100">
                      <td className="px-3 py-2 align-middle">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-500">
                          <CatIcon size={16} />
                        </span>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <div className="text-sm font-bold text-slate-800 break-all">{f.title}</div>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${cat.badge}`}>
                          {cat.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <div className="text-xs text-slate-500 font-semibold break-all">{f.file_name ?? "-"}</div>
                      </td>
                      <td className="px-3 py-2 align-middle text-right">
                        <span className="text-xs text-slate-500 font-mono">{fmtBytes(f.file_size)}</span>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <span className="text-xs text-slate-600 font-semibold">{f.uploaded_by ?? "-"}</span>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <span className="text-xs text-slate-500 font-semibold whitespace-nowrap">{fmtDateTime(f.created_at)}</span>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => downloadFile(f.file_url, f.file_name || f.title || "form")}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-colors cursor-pointer"
                            title="다운로드"
                          >
                            <Download size={12} />
                            <span>다운</span>
                          </button>
                          {isManager && (
                            <button
                              type="button"
                              onClick={() => handleDelete(f)}
                              disabled={deletingId === f.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold disabled:opacity-50 transition-colors cursor-pointer"
                              title="삭제"
                            >
                              {deletingId === f.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                              <span>삭제</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 모바일: 카드 */}
          <div className="md:hidden">
            {loading && (
              <div className="py-10 text-center text-slate-400 text-sm font-bold">
                <Loader2 size={16} className="animate-spin inline mr-2" />
                불러오는 중...
              </div>
            )}
            {!loading && displayForms.length === 0 && (
              <div className="py-10 text-center text-slate-400 text-sm font-bold">등록된 양식이 없습니다.</div>
            )}
            {!loading && displayForms.map(f => {
              const cat = CATEGORY_MAP[f.category] ?? CATEGORY_MAP.etc;
              const CatIcon = cat.icon;
              return (
                <div key={f.id} className="p-3 border-b border-slate-100 last:border-b-0 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 text-slate-500 shrink-0">
                      <CatIcon size={17} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-black text-slate-800 break-all">{f.title}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${cat.badge}`}>
                          {cat.label}
                        </span>
                        <span className="text-[11px] text-slate-400 font-semibold">{fmtDateTime(f.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 font-semibold break-all pl-11">
                    {f.file_name ?? "-"} · {fmtBytes(f.file_size)} · {f.uploaded_by ?? "-"}
                  </div>
                  <div className="flex items-center gap-1.5 pl-11">
                    <button
                      type="button"
                      onClick={() => downloadFile(f.file_url, f.file_name || f.title || "form")}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Download size={12} />
                      다운로드
                    </button>
                    {isManager && (
                      <button
                        type="button"
                        onClick={() => handleDelete(f)}
                        disabled={deletingId === f.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {deletingId === f.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 하단 안내 (관리자용) */}
        {isManager && (
          <div className="text-[11px] text-slate-400 leading-relaxed">
            <div className="flex items-start gap-1.5">
              <FilePlus size={12} className="mt-0.5 shrink-0" />
              <div>
                Supabase Storage · <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">hr-forms</code> 버킷 사용
                (없으면 로컬 <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">uploads/hr-forms/</code> 로 자동 fallback).
                최초 1회 · Supabase 대시보드에서 <b>hr-forms</b> 버킷(Public 권장) 및 <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">hr_forms</code> 테이블 생성 필요.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 서브: 카테고리 필터 chip
// ─────────────────────────────────────────────────────────────────────────────

const CatChip: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  chipClass: string;
  activeClass: string;
}> = ({ active, onClick, label, count, chipClass, activeClass }) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border transition-colors cursor-pointer",
      active ? activeClass : `${chipClass} hover:brightness-95`,
    ].join(" ")}
  >
    <span>{label}</span>
    <span className={active ? "opacity-80" : "text-slate-500"}>{count}</span>
  </button>
);

function activeClassFor(k: CategoryKey): string {
  switch (k) {
    case "contract":    return "bg-emerald-600 text-white border-emerald-600";
    case "resignation": return "bg-rose-600 text-white border-rose-600";
    case "pledge":      return "bg-indigo-600 text-white border-indigo-600";
    case "etc":         return "bg-slate-700 text-white border-slate-700";
  }
}

export default HrFormsPage;
