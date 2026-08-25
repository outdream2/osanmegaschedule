// 2026-08-17 · apiClient 마이그레이션
// src/components/HrFormsPage/HrFormsPage.tsx
// 각종 양식 관리 페이지 (근로계약서 · 사직서 · 서약서 · 기타)
// - 관리자(level >= 2) · 업로드 · 삭제 가능
// - 모든 인증 사용자 · 다운로드 가능
// - 리스트 UI 원칙:
//     1) 헤더 클릭 정렬 (모든 컬럼)
//     2) 컬럼 폭 · min-width + colgroup
//     3) 카테고리 색상 배지
// - embedded 모드 · BusinessManagePage 안 서브탭 · 자체 AppNavHeader skip
// #209 UI 세련화: 드래그&드롭 업로드 · 파일타입 아이콘 · 개선된 empty state · 카테고리 segmented control
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { useSortableTable, type Comparator, type SortDir } from "../../hooks/useSortableTable";
import { useConfirm } from "../../hooks/useConfirm";
// 2026-08-21 · Framework Phase 3 · alert → useToast
import { useToast, toastClass } from "../../hooks/useToast";
import { Spinner } from "../common/Spinner";
import {
  FileText, Download, Upload, Trash2, Plus, X, RefreshCw,
  Filter, FileEdit, FileSignature, FilePlus, FileArchive,
  FileSpreadsheet, FileImage, File, AlertCircle, CloudUpload,
  CheckCircle2,
} from "lucide-react";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { FilterBar } from "../common/FilterBar";
import { AccentBar } from "../common/AccentBar";
import { IconTile } from "../common/IconTile";
import { StatusPill, type PillTone } from "../common/StatusPill";
import { Card } from "../common/Card";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";
import type { AuthSession } from "../../types";
// 2026-08-21 · Framework Phase 4 · large-file 분리
import type { CategoryKey, HrForm, SortKey } from "./types";
import { MAX_UPLOAD_BYTES, CATEGORIES, CATEGORY_MAP, HR_FORM_SORT_CMP } from "./constants";
import { fmtBytes, fmtDateTime, readFileAsDataUrl, downloadFile, fileIconInfo } from "./utils";
import { FileTypeBadge, CatChip, DropZone, EmptyState } from "./subcomponents";

interface HrFormsPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  /** true 시 자체 AppNavHeader skip (BusinessManagePage 임베드용) */
  embedded?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────

const HrFormsPage: React.FC<HrFormsPageProps> = ({ authSession, onBack, onNavigate, onLogout, embedded = false }) => {
  const confirm = useConfirm();
  // 2026-08-21 · Framework Phase 3 · alert → useToast
  const { toast, showError } = useToast();

  const isManager = (authSession?.level ?? 0) >= 2;

  // 컬럼 리사이즈
  const { getWidth, resizerProps } = useColumnResize("hrForms", {
    _icon:       { default: 52,  min: 44,  max: 80  },
    title:       { default: 220, min: 100, max: 500 },
    category:    { default: 120, min: 80,  max: 200 },
    file_name:   { default: 200, min: 100, max: 400 },
    file_size:   { default: 90,  min: 60,  max: 160 },
    uploaded_by: { default: 110, min: 60,  max: 200 },
    created_at:  { default: 150, min: 100, max: 240 },
    _action:     { default: 160, min: 100, max: 260 },
  });

  // 데이터
  const [forms, setForms] = useState<HrForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 필터
  const [categoryFilter, setCategoryFilter] = useState<"all" | CategoryKey>("all");
  const [searchQ, setSearchQ] = useState("");

  // 정렬 (T30-followup · useSortableTable)

  // 업로드 상태
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState<CategoryKey>("contract");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0); // 0~100
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 삭제 상태
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const qs = categoryFilter === "all" ? "" : `?category=${categoryFilter}`;
      const { data } = await api.get<HrForm[]>(`/api/hr-forms${qs}`);
      setForms(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setLoadError(err instanceof ApiError ? err.message : (err?.message ?? "불러오기 실패"));
      setForms([]);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => { load(); }, [load]);

  // ── 필터 (검색어) ─────────────────────────────────────────────────────────
  const filteredForms = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return forms;
    return forms.filter(f =>
      (f.title || "").toLowerCase().includes(q) ||
      (f.file_name || "").toLowerCase().includes(q) ||
      (f.uploaded_by || "").toLowerCase().includes(q)
    );
  }, [forms, searchQ]);

  // ── 정렬 (T30-followup · useSortableTable) ───────────────────────────────
  const { sorted: displayForms, sortKey, sortDir, setSort } =
    useSortableTable<HrForm, SortKey>(filteredForms, "created_at", HR_FORM_SORT_CMP, "desc");

  const isFiltered = searchQ.trim() !== "" || categoryFilter !== "all";

  const handleSort = (key: SortKey, dir: SortDir) => setSort(key, dir);

  // sortableColumns · SortableHeader 는 리사이즈 헤더로 교체 · 제거됨

  // ── 파일 선택 ─────────────────────────────────────────────────────────────
  const onFileChosen = useCallback((file: File | null) => {
    setUploadError(null);
    if (!file) { setUploadFile(null); return; }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`파일 크기 초과 (${(file.size / 1024 / 1024).toFixed(1)}MB > ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)`);
      setUploadFile(null);
      return;
    }
    setUploadFile(file);
    if (!uploadTitle.trim()) {
      const base = file.name.replace(/\.[^.]+$/, "");
      setUploadTitle(base.slice(0, 80));
    }
  }, [uploadTitle]);

  const resetUploadForm = useCallback(() => {
    setShowUploadForm(false);
    setUploadTitle("");
    setUploadCategory("contract");
    setUploadFile(null);
    setUploadError(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

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
    setUploadProgress(10);
    try {
      const dataUrl = await readFileAsDataUrl(uploadFile);
      setUploadProgress(50);
      await api.post("/api/hr-forms", {
        title: uploadTitle.trim(),
        category: uploadCategory,
        data_url: dataUrl,
        file_name: uploadFile.name,
        uploaded_by: authSession?.employeeName ?? null,
        uploaded_by_id: authSession?.employeeId ?? null,
      });
      setUploadProgress(90);
      setUploadProgress(100);
      // 짧은 딜레이 후 닫기 (완료 피드백)
      setTimeout(() => {
        resetUploadForm();
        load();
      }, 400);
    } catch (err: any) {
      setUploadError(err instanceof ApiError ? err.message : (err?.message ?? "업로드 실패"));
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  // ── 삭제 ──────────────────────────────────────────────────────────────────
  const handleDelete = async (row: HrForm) => {
    if (!isManager) return;
    if (!await confirm({ message: `정말 삭제하시겠습니까?\n\n${row.title}`, danger: true })) return;
    setDeletingId(row.id);
    try {
      const editorLevel = authSession?.level ?? 0;
      await api.del(`/api/hr-forms/${row.id}?editor_level=${editorLevel}`);
      setForms(prev => prev.filter(f => f.id !== row.id));
    } catch (err: any) {
      showError(err instanceof ApiError ? err.message : (err?.message ?? "삭제 실패"));
    } finally {
      setDeletingId(null);
    }
  };

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div className={embedded ? "flex-1 flex flex-col" : "min-h-screen bg-zinc-50 flex flex-col"}>
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

        {/* ── 헤더 영역 · 2026-08-17 · 세련 · accent bar + gradient icon card ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <AccentBar size="hero" className="shrink-0" />
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-tint to-white border border-brand/15 text-brand-deep flex items-center justify-center shadow-[0_1px_2px_rgba(10,46,74,0.04),0_2px_8px_rgba(10,46,74,0.06)]">
              <FileText size={20} />
            </div>
            <div>
              <h1 className="text-[18px] sm:text-[20px] font-bold text-ink tracking-tight leading-tight">각종 양식</h1>
              <p className="text-[13px] text-ink-soft font-medium mt-0.5">
                근로계약서 · 사직서 · 서약서 · 기타 양식 다운로드 및 관리
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-line bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 text-sm font-semibold transition-colors cursor-pointer shadow-sm"
              title="새로고침"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span className="hidden sm:inline">새로고침</span>
            </button>

            {isManager && (
              <button
                type="button"
                onClick={() => setShowUploadForm(v => !v)}
                className={[
                  "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all duration-150 cursor-pointer",
                  showUploadForm
                    ? "bg-zinc-100 border border-line text-zinc-600 hover:bg-zinc-200"
                    : "bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white border border-amber-600",
                ].join(" ")}
                title="양식 업로드"
              >
                {showUploadForm ? <X size={14} /> : <Plus size={14} />}
                <span>{showUploadForm ? "취소" : "양식 업로드"}</span>
              </button>
            )}
          </div>
        </div>

        {/* ── 업로드 폼 ──────────────────────────────────────────────────── */}
        {showUploadForm && isManager && (
          <Card borderColor="border-amber-200" rounded="2xl" padding="none" clip>
            {/* 폼 헤더 */}
            <div className="flex items-center gap-2.5 px-5 py-3.5 bg-amber-50 border-b border-amber-100">
              <Upload size={16} className="text-amber-600 shrink-0" />
              <p className="text-sm font-bold text-amber-800">신규 양식 업로드</p>
              <span className="ml-auto text-xs text-amber-600 font-semibold">* 최대 10MB</span>
            </div>

            <form onSubmit={handleUpload} className="p-4 sm:p-5 flex flex-col gap-4">
              {/* 양식명 + 카테고리 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-600 block mb-1.5">
                    양식명 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={e => setUploadTitle(e.target.value)}
                    placeholder="예: 2026년 표준 근로계약서"
                    className="w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-zinc-800 text-sm font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition placeholder:text-zinc-400 placeholder:font-normal"
                    maxLength={120}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-600 block mb-1.5">
                    카테고리 <span className="text-rose-500">*</span>
                  </label>
                  {/* Segmented control */}
                  <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl">
                    {CATEGORIES.map(c => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setUploadCategory(c.key)}
                        className={[
                          "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer",
                          uploadCategory === c.key
                            ? "bg-white shadow-sm text-zinc-800"
                            : "text-zinc-500 hover:text-zinc-700",
                        ].join(" ")}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 드래그&드롭 업로드 존 */}
              <div>
                <label className="text-xs font-bold text-zinc-600 block mb-1.5">
                  파일 <span className="text-rose-500">*</span>
                </label>
                <DropZone
                  file={uploadFile}
                  onFile={onFileChosen}
                  inputRef={fileInputRef}
                  error={uploadError}
                />
              </div>

              {/* 업로드 진행률 */}
              {uploading && uploadProgress > 0 && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-zinc-500">
                    <span>업로드 중...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-colors duration-150"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 완료 피드백 */}
              {!uploading && uploadProgress === 100 && (
                <div className="flex items-center gap-2 text-sm text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
                  <CheckCircle2 size={15} className="shrink-0" />
                  업로드 완료! 목록을 갱신하는 중...
                </div>
              )}

              {/* 에러 */}
              {uploadError && (
                <div className="flex items-start gap-2 text-sm text-rose-700 font-semibold bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  {uploadError}
                </div>
              )}

              {/* 액션 버튼 */}
              <div className="flex items-center gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={resetUploadForm}
                  disabled={uploading}
                  className="px-4 py-2 rounded-xl bg-white border border-line text-zinc-600 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFile || !uploadTitle.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:bg-amber-200 disabled:text-amber-400 text-white text-sm font-bold shadow-sm transition-all duration-150 cursor-pointer"
                >
                  {uploading ? (
                    <><Spinner size={14} /><span>업로드 중...</span></>
                  ) : (
                    <><Upload size={14} /><span>업로드</span></>
                  )}
                </button>
              </div>
            </form>
          </Card>
        )}

        {/* ── 필터 바 ────────────────────────────────────────────────────── */}
        <FilterBar gap="tight">
          {/* 카테고리 label */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Filter size={12} className="text-zinc-400" />
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">분류</span>
          </div>

          {/* 카테고리 칩 그룹 */}
          <div className="flex items-center gap-1 flex-wrap">
            <CatChip
              active={categoryFilter === "all"}
              onClick={() => setCategoryFilter("all")}
              label="전체"
              count={forms.length}
              badgeClass="bg-zinc-100 text-zinc-600 border-line"
              activeClass="bg-brand-deep text-white border-zinc-800"
            />
            {CATEGORIES.map(c => {
              const cnt = forms.filter(f => f.category === c.key).length;
              return (
                <CatChip
                  key={c.key}
                  active={categoryFilter === c.key}
                  onClick={() => setCategoryFilter(c.key)}
                  label={c.label}
                  count={cnt}
                  badgeClass={c.badge}
                  activeClass={c.activeBg}
                />
              );
            })}
          </div>

          {/* 검색 */}
          <input
            type="text"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="양식명 · 파일명 · 업로더 검색"
            className="ml-auto w-full sm:w-60 bg-white border border-line rounded-lg px-3 py-1.5 text-sm text-zinc-800 font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint/60 transition placeholder:text-zinc-400 placeholder:font-normal"
          />
        </FilterBar>

        {/* ── 리스트 · 2026-08-25 · v9 topAccent ─────────────────────── */}
        <Card clip padding="none" topAccent>
          {/* 에러 배너 */}
          {loadError && (
            <div className="flex items-center gap-2 p-3.5 text-sm text-rose-700 font-semibold bg-rose-50 border-b border-rose-200">
              <AlertCircle size={15} className="shrink-0" />
              {loadError}
            </div>
          )}

          {/* 데스크톱 테이블 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="text-sm border-collapse" style={{ tableLayout: "fixed", width: (["_icon","title","category","file_name","file_size","uploaded_by","created_at","_action"] as const).reduce((s, k) => s + getWidth(k as any), 0) }}>
              <thead className="bg-zinc-50">
                <tr className="border-b border-line text-[15px] font-bold text-zinc-500 uppercase tracking-wider">
                  {/* 파일 아이콘 컬럼 */}
                  <th
                    className="relative select-none text-left px-2.5 py-2"
                    style={{ width: getWidth("_icon"), minWidth: getWidth("_icon") }}
                  >
                    <span {...resizerProps("_icon" as any)}
                      className={RESIZER_CLS}
                      style={{ touchAction: "none" }}
                    />
                  </th>
                  {/* 양식명 */}
                  <th
                    className="relative select-none text-left px-2.5 py-2 cursor-pointer hover:text-zinc-700 transition-colors"
                    style={{ width: getWidth("title"), minWidth: getWidth("title") }}
                    onClick={() => handleSort("title", sortKey === "title" ? (sortDir === "asc" ? "desc" : "asc") : "asc")}
                    title="양식명 · 클릭하여 정렬"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>양식명</span>
                      {sortKey === "title" ? <span className="text-[15px]">{sortDir === "asc" ? "▲" : "▼"}</span> : <span className="text-[15px] text-zinc-300 opacity-60">▲▼</span>}
                    </span>
                    <span {...resizerProps("title" as any)}
                      className={RESIZER_CLS}
                      style={{ touchAction: "none" }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                  </th>
                  {/* 분류 */}
                  <th
                    className="relative select-none text-left px-2.5 py-2 cursor-pointer hover:text-zinc-700 transition-colors"
                    style={{ width: getWidth("category"), minWidth: getWidth("category") }}
                    onClick={() => handleSort("category", sortKey === "category" ? (sortDir === "asc" ? "desc" : "asc") : "asc")}
                    title="분류 · 클릭하여 정렬"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>분류</span>
                      {sortKey === "category" ? <span className="text-[15px]">{sortDir === "asc" ? "▲" : "▼"}</span> : <span className="text-[15px] text-zinc-300 opacity-60">▲▼</span>}
                    </span>
                    <span {...resizerProps("category" as any)}
                      className={RESIZER_CLS}
                      style={{ touchAction: "none" }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                  </th>
                  {/* 파일명 */}
                  <th
                    className="relative select-none text-left px-2.5 py-2 cursor-pointer hover:text-zinc-700 transition-colors"
                    style={{ width: getWidth("file_name"), minWidth: getWidth("file_name") }}
                    onClick={() => handleSort("file_name", sortKey === "file_name" ? (sortDir === "asc" ? "desc" : "asc") : "asc")}
                    title="파일명 · 클릭하여 정렬"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>파일명</span>
                      {sortKey === "file_name" ? <span className="text-[15px]">{sortDir === "asc" ? "▲" : "▼"}</span> : <span className="text-[15px] text-zinc-300 opacity-60">▲▼</span>}
                    </span>
                    <span {...resizerProps("file_name" as any)}
                      className={RESIZER_CLS}
                      style={{ touchAction: "none" }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                  </th>
                  {/* 크기 */}
                  <th
                    className="relative select-none text-right px-2.5 py-2 cursor-pointer hover:text-zinc-700 transition-colors"
                    style={{ width: getWidth("file_size"), minWidth: getWidth("file_size") }}
                    onClick={() => handleSort("file_size", sortKey === "file_size" ? (sortDir === "asc" ? "desc" : "asc") : "asc")}
                    title="크기 · 클릭하여 정렬"
                  >
                    <span className="inline-flex items-center gap-1 justify-end w-full">
                      <span>크기</span>
                      {sortKey === "file_size" ? <span className="text-[15px]">{sortDir === "asc" ? "▲" : "▼"}</span> : <span className="text-[15px] text-zinc-300 opacity-60">▲▼</span>}
                    </span>
                    <span {...resizerProps("file_size" as any)}
                      className={RESIZER_CLS}
                      style={{ touchAction: "none" }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                  </th>
                  {/* 업로더 */}
                  <th
                    className="relative select-none text-left px-2.5 py-2 cursor-pointer hover:text-zinc-700 transition-colors"
                    style={{ width: getWidth("uploaded_by"), minWidth: getWidth("uploaded_by") }}
                    onClick={() => handleSort("uploaded_by", sortKey === "uploaded_by" ? (sortDir === "asc" ? "desc" : "asc") : "asc")}
                    title="업로더 · 클릭하여 정렬"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>업로더</span>
                      {sortKey === "uploaded_by" ? <span className="text-[15px]">{sortDir === "asc" ? "▲" : "▼"}</span> : <span className="text-[15px] text-zinc-300 opacity-60">▲▼</span>}
                    </span>
                    <span {...resizerProps("uploaded_by" as any)}
                      className={RESIZER_CLS}
                      style={{ touchAction: "none" }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                  </th>
                  {/* 업로드일 */}
                  <th
                    className="relative select-none text-left px-2.5 py-2 cursor-pointer hover:text-zinc-700 transition-colors"
                    style={{ width: getWidth("created_at"), minWidth: getWidth("created_at") }}
                    onClick={() => handleSort("created_at", sortKey === "created_at" ? (sortDir === "asc" ? "desc" : "asc") : "asc")}
                    title="업로드일 · 클릭하여 정렬"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>업로드일</span>
                      {sortKey === "created_at" ? <span className="text-[15px]">{sortDir === "asc" ? "▲" : "▼"}</span> : <span className="text-[15px] text-zinc-300 opacity-60">▲▼</span>}
                    </span>
                    <span {...resizerProps("created_at" as any)}
                      className={RESIZER_CLS}
                      style={{ touchAction: "none" }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                  </th>
                  {/* 액션 */}
                  <th
                    className="relative select-none text-center px-2.5 py-2"
                    style={{ width: getWidth("_action"), minWidth: getWidth("_action") }}
                  >
                    <span>액션</span>
                    <span {...resizerProps("_action" as any)}
                      className={RESIZER_CLS}
                      style={{ touchAction: "none" }}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} className="py-14 text-center">
                      <div className="inline-flex flex-col items-center gap-2">
                        <Spinner size={20} tone="amber" />
                        <span className="text-sm text-zinc-400 font-bold">불러오는 중...</span>
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && displayForms.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        isFiltered={isFiltered}
                        isManager={isManager}
                        onUpload={() => setShowUploadForm(true)}
                      />
                    </td>
                  </tr>
                )}
                {!loading && displayForms.map(f => {
                  const cat = CATEGORY_MAP[f.category] ?? CATEGORY_MAP.etc;
                  const fileInfo = fileIconInfo(f.file_name, f.mime_type);
                  const FileIcon = fileInfo.Icon;
                  return (
                    <tr key={f.id} className="hover:bg-amber-50/30 transition-colors border-b border-zinc-100 last:border-b-0 group">
                      {/* 파일 타입 아이콘 */}
                      <td className="px-3 py-2.5 align-middle">
                        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${fileInfo.colorClass} shrink-0`}>
                          <FileIcon size={16} />
                        </span>
                      </td>

                      {/* 양식명 */}
                      <td className="px-3 py-2.5 align-middle">
                        <div className="text-sm font-bold text-zinc-800 break-all leading-snug">{f.title}</div>
                      </td>

                      {/* 분류 배지 · 2026-08-17 · StatusPill 프레임워크 통일 */}
                      <td className="px-3 py-2.5 align-middle">
                        <StatusPill tone={cat.tone} size="md">{cat.label}</StatusPill>
                      </td>

                      {/* 파일명 */}
                      <td className="px-3 py-2.5 align-middle">
                        <div className="text-xs text-zinc-500 font-semibold break-all">{f.file_name ?? "-"}</div>
                        <div className="text-[14px] text-zinc-400 font-semibold mt-0.5">{fileInfo.label}</div>
                      </td>

                      {/* 크기 */}
                      <td className="px-3 py-2.5 align-middle text-right">
                        <span className="text-xs text-zinc-500 font-semibold tabular-nums">{fmtBytes(f.file_size)}</span>
                      </td>

                      {/* 업로더 */}
                      <td className="px-3 py-2.5 align-middle">
                        <span className="text-xs text-zinc-600 font-semibold">{f.uploaded_by ?? "-"}</span>
                      </td>

                      {/* 업로드일 */}
                      <td className="px-3 py-2.5 align-middle">
                        <span className="text-xs text-zinc-400 font-semibold whitespace-nowrap">{fmtDateTime(f.created_at)}</span>
                      </td>

                      {/* 액션 */}
                      <td className="px-3 py-2.5 align-middle">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => downloadFile(f.file_url, f.file_name || f.title || "form")}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-700 border border-emerald-200 text-xs font-bold transition-all duration-100 cursor-pointer shadow-sm"
                            title="다운로드"
                          >
                            <Download size={12} />
                            <span>다운로드</span>
                          </button>
                          {isManager && (
                            <button
                              type="button"
                              onClick={() => handleDelete(f)}
                              disabled={deletingId === f.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-600 border border-rose-200 text-xs font-bold disabled:opacity-50 transition-all duration-100 cursor-pointer shadow-sm"
                              title="삭제"
                            >
                              {deletingId === f.id ? <Spinner size={12} /> : <Trash2 size={12} />}
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

          {/* 모바일 카드 */}
          <div className="md:hidden divide-y divide-zinc-100">
            {loading && (
              <div className="py-14 flex flex-col items-center gap-2">
                <Spinner size={20} tone="amber" />
                <span className="text-sm text-zinc-400 font-bold">불러오는 중...</span>
              </div>
            )}
            {!loading && displayForms.length === 0 && (
              <EmptyState
                isFiltered={isFiltered}
                isManager={isManager}
                onUpload={() => setShowUploadForm(true)}
              />
            )}
            {!loading && displayForms.map(f => {
              const cat = CATEGORY_MAP[f.category] ?? CATEGORY_MAP.etc;
              const fileInfo = fileIconInfo(f.file_name, f.mime_type);
              const FileIcon = fileInfo.Icon;
              return (
                <div key={f.id} className="p-3.5 hover:bg-amber-50/20 transition-colors">
                  {/* 상단: 아이콘 + 양식명 + 분류 */}
                  <div className="flex items-start gap-3">
                    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${fileInfo.colorClass} shrink-0`}>
                      <FileIcon size={18} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-zinc-800 leading-snug break-all">{f.title}</div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {/* 2026-08-17 · StatusPill 프레임워크 통일 */}
                        <StatusPill tone={cat.tone} size="sm">{cat.label}</StatusPill>
                        <span className="text-[15px] text-zinc-400 font-semibold">{fmtDateTime(f.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* 파일 정보 */}
                  <div className="mt-2.5 pl-13 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[15px] text-zinc-500 font-semibold break-all">
                      {f.file_name ?? "-"}
                    </span>
                    <span className="text-[15px] text-zinc-400">·</span>
                    <span className="text-[15px] text-zinc-400 font-semibold tabular-nums">{fmtBytes(f.file_size)}</span>
                    <span className="text-[15px] text-zinc-400">·</span>
                    <span className="text-[15px] text-zinc-400 font-semibold">{f.uploaded_by ?? "-"}</span>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="mt-3 pl-13 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => downloadFile(f.file_url, f.file_name || f.title || "form")}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-700 border border-emerald-200 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Download size={13} />
                      다운로드
                    </button>
                    {isManager && (
                      <button
                        type="button"
                        onClick={() => handleDelete(f)}
                        disabled={deletingId === f.id}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-600 border border-rose-200 text-xs font-bold disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {deletingId === f.id ? <Spinner size={13} /> : <Trash2 size={13} />}
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* ── 관리자 안내 ────────────────────────────────────────────────── */}
        {isManager && (
          <div className="flex items-start gap-2.5 px-4 py-3 bg-zinc-50 border border-line rounded-xl text-[15px] text-zinc-400 leading-relaxed">
            <FilePlus size={13} className="mt-0.5 shrink-0 text-zinc-400" />
            <div>
              Supabase Storage{" "}
              <code className="px-1 py-0.5 rounded bg-white border border-line text-zinc-500 font-mono text-[14px]">hr-forms</code>{" "}
              버킷 사용 (없으면 로컬{" "}
              <code className="px-1 py-0.5 rounded bg-white border border-line text-zinc-500 font-mono text-[14px]">uploads/hr-forms/</code>{" "}
              자동 fallback). 최초 1회 Supabase 대시보드에서{" "}
              <b className="text-zinc-500">hr-forms</b> 버킷(Public 권장) 및{" "}
              <code className="px-1 py-0.5 rounded bg-white border border-line text-zinc-500 font-mono text-[14px]">hr_forms</code> 테이블 생성 필요.
            </div>
          </div>
        )}
      </main>
      {/* 2026-08-21 · Framework Phase 3 · toast · alert 대체 */}
      {toast && <div className={toastClass(toast.tone)}>{toast.message}</div>}
    </div>
  );
};

export default HrFormsPage;
