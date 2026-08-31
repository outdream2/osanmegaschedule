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
import { PAGE_CONTAINER_CLS } from "../../styles/tokens";
import { useSortableTable, type SortDir } from "../../hooks/useSortableTable";
import { useConfirm } from "../../hooks/useConfirm";
// 2026-08-21 · Framework Phase 3 · alert → useToast
import { useToast, toastClass } from "../../hooks/useToast";
import { Spinner } from "../common/Spinner";
import {
  Download, Upload, Trash2, Plus, X, RefreshCw,
  AlertCircle, CheckCircle2,
} from "lucide-react";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { FilterBar } from "../common/FilterBar";
import { AccentBar } from "../common/AccentBar";
import { StatusPill } from "../common/StatusPill";
import { Card } from "../common/Card";
import { Hero, HeroButton } from "../common/Hero";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";
import type { AuthSession } from "../../types";
// 2026-08-21 · Framework Phase 4 · large-file 분리
import type { CategoryKey, HrForm, SortKey } from "./types";
import { MAX_UPLOAD_BYTES, CATEGORIES, CATEGORY_MAP, HR_FORM_SORT_CMP } from "./constants";
import { fmtBytes, fmtDateTime, readFileAsDataUrl, downloadFile, fileIconInfo } from "./utils";
import { CatChip, DropZone, EmptyState } from "./subcomponents";

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
    // 2026-08-26 · 사용자 지시 · 각종양식 · 프레임워크 폰트 +2 + 프리미엄 톤 · data-scope 격리
    <div data-scope="hr-forms" className={embedded ? "flex-1 flex flex-col" : "min-h-screen bg-zinc-50 flex flex-col"}>
      {!embedded && (
        <AppNavHeader
          activePage={"hr-forms" as AppNavPage}
          authSession={authSession}
          onBack={onBack}
          onNavigate={onNavigate}
          onLogout={onLogout}
        />
      )}

      <main className={`flex-1 ${PAGE_CONTAINER_CLS} px-3 sm:px-5 py-5 flex flex-col gap-4`}>

        {/* 2026-08-31 · 목업 톤 재적용 · Hero 컴포넌트 (Linear/Vercel gradient + aurora) */}
        <Hero
          eyebrow="HR FORMS · 인사 서류"
          title="각종 양식"
          description="근로계약서 · 사직서 · 서약서 · 위임장 · 급여 · 기타 인사 양식"
          actions={
            <>
              <HeroButton
                onClick={load}
                icon={<RefreshCw size={14} className={loading ? "animate-spin" : ""} />}
                ghost
              >
                새로고침
              </HeroButton>
              {isManager && (
                showUploadForm ? (
                  <HeroButton
                    onClick={() => setShowUploadForm(false)}
                    icon={<X size={14} />}
                    ghost
                  >
                    취소
                  </HeroButton>
                ) : (
                  <HeroButton
                    onClick={() => setShowUploadForm(true)}
                    icon={<Plus size={14} />}
                  >
                    양식 업로드
                  </HeroButton>
                )
              )}
            </>
          }
        />

        {/* ── 업로드 폼 ──────────────────────────────────────────────────── */}
        {showUploadForm && isManager && (
          <Card rounded="xl" padding="none" clip topAccent>
            {/* 폼 헤더 */}
            <div className="flex items-center gap-2.5 px-5 py-3.5 bg-brand-tint/60 border-b border-line">
              <AccentBar size="lg" />
              <Upload size={15} className="text-brand shrink-0" />
              <p className="text-[15px] font-bold text-ink">신규 양식 업로드</p>
              <span className="ml-auto text-[13px] text-ink-soft font-semibold">최대 10MB</span>
            </div>

            <form onSubmit={handleUpload} className="p-4 sm:p-5 flex flex-col gap-4">
              {/* 양식명 + 카테고리 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] font-bold text-ink-soft block mb-1.5">
                    양식명 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={e => setUploadTitle(e.target.value)}
                    placeholder="예: 2026년 표준 근로계약서"
                    className="w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[15px] text-ink font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition placeholder:text-ink-soft/50 placeholder:font-normal"
                    maxLength={120}
                    required
                  />
                </div>
                <div>
                  <label className="text-[13px] font-bold text-ink-soft block mb-1.5">
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
                          "flex-1 py-1.5 rounded-lg text-[13px] font-bold transition-all duration-150 cursor-pointer",
                          uploadCategory === c.key
                            ? "bg-white shadow-sm text-ink"
                            : "text-ink-soft hover:text-ink",
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
                <label className="text-[13px] font-bold text-ink-soft block mb-1.5">
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
                  <div className="flex justify-between text-[13px] font-bold text-ink-soft">
                    <span>업로드 중...</span>
                    <span className="tabular-nums">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 완료 피드백 */}
              {!uploading && uploadProgress === 100 && (
                <div className="flex items-center gap-2 text-[14px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
                  <CheckCircle2 size={15} className="shrink-0" />
                  업로드 완료! 목록을 갱신하는 중...
                </div>
              )}

              {/* 에러 */}
              {uploadError && (
                <div className="flex items-start gap-2 text-[14px] text-rose-700 font-semibold bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
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
                  className="px-4 py-2 rounded-xl bg-white border border-line text-ink-soft text-[14px] font-semibold hover:bg-zinc-50 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFile || !uploadTitle.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:opacity-40 text-white text-[14px] font-bold shadow-sm transition-all duration-150 cursor-pointer"
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
            <AccentBar size="sm" />
            <span className="text-[13px] font-bold text-ink-soft uppercase tracking-wide">분류</span>
          </div>

          {/* 카테고리 칩 그룹 */}
          <div className="flex items-center gap-1 flex-wrap">
            <CatChip
              active={categoryFilter === "all"}
              onClick={() => setCategoryFilter("all")}
              label="전체"
              count={forms.length}
              badgeClass="bg-zinc-100 text-ink-soft border-line"
              activeClass="bg-brand-deep text-white border-brand-deep"
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
            className="ml-auto w-full sm:w-64 bg-white border border-line rounded-lg px-3 py-2 text-[15px] text-ink font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint/60 transition placeholder:text-ink-soft/50 placeholder:font-normal"
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
              <thead className="bg-zinc-50/80">
                <tr className="border-b border-line text-[13px] font-bold text-ink-soft uppercase tracking-wider">
                  {/* 파일 아이콘 컬럼 */}
                  <th
                    className="relative select-none text-left px-3 py-2.5"
                    style={{ width: getWidth("_icon"), minWidth: getWidth("_icon") }}
                  >
                    <span {...resizerProps("_icon" as any)}
                      className={RESIZER_CLS}
                      style={{ touchAction: "none" }}
                    />
                  </th>
                  {/* 양식명 */}
                  <th
                    className="relative select-none text-left px-3 py-2.5 cursor-pointer hover:text-ink transition-colors"
                    style={{ width: getWidth("title"), minWidth: getWidth("title") }}
                    onClick={() => handleSort("title", sortKey === "title" ? (sortDir === "asc" ? "desc" : "asc") : "asc")}
                    title="양식명 · 클릭하여 정렬"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>양식명</span>
                      {sortKey === "title" ? <span className="text-[11px] text-brand-deep">{sortDir === "asc" ? "▲" : "▼"}</span> : <span className="text-[11px] text-zinc-300">↕</span>}
                    </span>
                    <span {...resizerProps("title" as any)}
                      className={RESIZER_CLS}
                      style={{ touchAction: "none" }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                  </th>
                  {/* 분류 */}
                  <th
                    className="relative select-none text-left px-3 py-2.5 cursor-pointer hover:text-ink transition-colors"
                    style={{ width: getWidth("category"), minWidth: getWidth("category") }}
                    onClick={() => handleSort("category", sortKey === "category" ? (sortDir === "asc" ? "desc" : "asc") : "asc")}
                    title="분류 · 클릭하여 정렬"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>분류</span>
                      {sortKey === "category" ? <span className="text-[11px] text-brand-deep">{sortDir === "asc" ? "▲" : "▼"}</span> : <span className="text-[11px] text-zinc-300">↕</span>}
                    </span>
                    <span {...resizerProps("category" as any)}
                      className={RESIZER_CLS}
                      style={{ touchAction: "none" }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                  </th>
                  {/* 파일명 */}
                  <th
                    className="relative select-none text-left px-3 py-2.5 cursor-pointer hover:text-ink transition-colors"
                    style={{ width: getWidth("file_name"), minWidth: getWidth("file_name") }}
                    onClick={() => handleSort("file_name", sortKey === "file_name" ? (sortDir === "asc" ? "desc" : "asc") : "asc")}
                    title="파일명 · 클릭하여 정렬"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>파일명</span>
                      {sortKey === "file_name" ? <span className="text-[11px] text-brand-deep">{sortDir === "asc" ? "▲" : "▼"}</span> : <span className="text-[11px] text-zinc-300">↕</span>}
                    </span>
                    <span {...resizerProps("file_name" as any)}
                      className={RESIZER_CLS}
                      style={{ touchAction: "none" }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                  </th>
                  {/* 크기 */}
                  <th
                    className="relative select-none text-right px-3 py-2.5 cursor-pointer hover:text-ink transition-colors"
                    style={{ width: getWidth("file_size"), minWidth: getWidth("file_size") }}
                    onClick={() => handleSort("file_size", sortKey === "file_size" ? (sortDir === "asc" ? "desc" : "asc") : "asc")}
                    title="크기 · 클릭하여 정렬"
                  >
                    <span className="inline-flex items-center gap-1 justify-end w-full">
                      <span>크기</span>
                      {sortKey === "file_size" ? <span className="text-[11px] text-brand-deep">{sortDir === "asc" ? "▲" : "▼"}</span> : <span className="text-[11px] text-zinc-300">↕</span>}
                    </span>
                    <span {...resizerProps("file_size" as any)}
                      className={RESIZER_CLS}
                      style={{ touchAction: "none" }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                  </th>
                  {/* 업로더 */}
                  <th
                    className="relative select-none text-left px-3 py-2.5 cursor-pointer hover:text-ink transition-colors"
                    style={{ width: getWidth("uploaded_by"), minWidth: getWidth("uploaded_by") }}
                    onClick={() => handleSort("uploaded_by", sortKey === "uploaded_by" ? (sortDir === "asc" ? "desc" : "asc") : "asc")}
                    title="업로더 · 클릭하여 정렬"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>업로더</span>
                      {sortKey === "uploaded_by" ? <span className="text-[11px] text-brand-deep">{sortDir === "asc" ? "▲" : "▼"}</span> : <span className="text-[11px] text-zinc-300">↕</span>}
                    </span>
                    <span {...resizerProps("uploaded_by" as any)}
                      className={RESIZER_CLS}
                      style={{ touchAction: "none" }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                  </th>
                  {/* 업로드일 */}
                  <th
                    className="relative select-none text-left px-3 py-2.5 cursor-pointer hover:text-ink transition-colors"
                    style={{ width: getWidth("created_at"), minWidth: getWidth("created_at") }}
                    onClick={() => handleSort("created_at", sortKey === "created_at" ? (sortDir === "asc" ? "desc" : "asc") : "asc")}
                    title="업로드일 · 클릭하여 정렬"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>업로드일</span>
                      {sortKey === "created_at" ? <span className="text-[11px] text-brand-deep">{sortDir === "asc" ? "▲" : "▼"}</span> : <span className="text-[11px] text-zinc-300">↕</span>}
                    </span>
                    <span {...resizerProps("created_at" as any)}
                      className={RESIZER_CLS}
                      style={{ touchAction: "none" }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                  </th>
                  {/* 액션 */}
                  <th
                    className="relative select-none text-center px-3 py-2.5"
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
                        <Spinner size={20} tone="brand" />
                        <span className="text-[14px] text-ink-soft font-bold">불러오는 중...</span>
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
                    <tr key={f.id} className="hover:bg-zinc-50/70 transition-colors border-b border-line last:border-b-0 group">
                      {/* 파일 타입 아이콘 */}
                      <td className="px-3 py-3 align-middle">
                        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${fileInfo.colorClass} shrink-0`}>
                          <FileIcon size={16} />
                        </span>
                      </td>

                      {/* 양식명 */}
                      <td className="px-3 py-3 align-middle">
                        <div className="text-[15px] font-bold text-ink break-all leading-snug">{f.title}</div>
                      </td>

                      {/* 분류 배지 · StatusPill 프레임워크 통일 */}
                      <td className="px-3 py-3 align-middle">
                        <StatusPill tone={cat.tone} size="md">{cat.label}</StatusPill>
                      </td>

                      {/* 파일명 */}
                      <td className="px-3 py-3 align-middle">
                        <div className="text-[13px] text-ink-soft font-semibold break-all">{f.file_name ?? "-"}</div>
                        <div className="text-[12px] text-zinc-400 font-medium mt-0.5">{fileInfo.label}</div>
                      </td>

                      {/* 크기 */}
                      <td className="px-3 py-3 align-middle text-right">
                        <span className="text-[13px] text-ink-soft font-semibold tabular-nums">{fmtBytes(f.file_size)}</span>
                      </td>

                      {/* 업로더 */}
                      <td className="px-3 py-3 align-middle">
                        <span className="text-[13px] text-ink font-semibold">{f.uploaded_by ?? "-"}</span>
                      </td>

                      {/* 업로드일 */}
                      <td className="px-3 py-3 align-middle">
                        <span className="text-[13px] text-ink-soft font-medium whitespace-nowrap tabular-nums">{fmtDateTime(f.created_at)}</span>
                      </td>

                      {/* 액션 */}
                      <td className="px-3 py-3 align-middle">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => downloadFile(f.file_url, f.file_name || f.title || "form")}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-700 border border-emerald-200 text-[13px] font-bold transition-all duration-150 cursor-pointer shadow-sm"
                            title="다운로드"
                          >
                            <Download size={13} />
                            <span>다운로드</span>
                          </button>
                          {isManager && (
                            <button
                              type="button"
                              onClick={() => handleDelete(f)}
                              disabled={deletingId === f.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-600 border border-rose-200 text-[13px] font-bold disabled:opacity-50 transition-all duration-150 cursor-pointer shadow-sm"
                              title="삭제"
                            >
                              {deletingId === f.id ? <Spinner size={13} /> : <Trash2 size={13} />}
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
          <div className="md:hidden divide-y divide-line">
            {loading && (
              <div className="py-14 flex flex-col items-center gap-2">
                <Spinner size={20} tone="brand" />
                <span className="text-[14px] text-ink-soft font-bold">불러오는 중...</span>
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
                <div key={f.id} className="p-4 hover:bg-zinc-50/70 transition-colors">
                  {/* 상단: 아이콘 + 양식명 + 분류 */}
                  <div className="flex items-start gap-3">
                    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${fileInfo.colorClass} shrink-0`}>
                      <FileIcon size={18} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[16px] font-bold text-ink leading-snug break-all">{f.title}</div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <StatusPill tone={cat.tone} size="sm">{cat.label}</StatusPill>
                        <span className="text-[13px] text-ink-soft font-medium tabular-nums">{fmtDateTime(f.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* 파일 정보 */}
                  <div className="mt-2.5 pl-13 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] text-ink-soft font-semibold break-all">
                      {f.file_name ?? "-"}
                    </span>
                    <span className="text-[13px] text-zinc-300">·</span>
                    <span className="text-[13px] text-ink-soft font-medium tabular-nums">{fmtBytes(f.file_size)}</span>
                    <span className="text-[13px] text-zinc-300">·</span>
                    <span className="text-[13px] text-ink-soft font-medium">{f.uploaded_by ?? "-"}</span>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="mt-3 pl-13 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => downloadFile(f.file_url, f.file_name || f.title || "form")}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-700 border border-emerald-200 text-[13px] font-bold transition-colors cursor-pointer"
                    >
                      <Download size={14} />
                      다운로드
                    </button>
                    {isManager && (
                      <button
                        type="button"
                        onClick={() => handleDelete(f)}
                        disabled={deletingId === f.id}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-600 border border-rose-200 text-[13px] font-bold disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {deletingId === f.id ? <Spinner size={14} /> : <Trash2 size={14} />}
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
          <div className="flex items-start gap-2.5 px-4 py-3.5 bg-brand-tint/40 border border-line rounded-xl text-[14px] text-ink-soft leading-relaxed">
            <AccentBar size="sm" className="mt-0.5 shrink-0" />
            <div>
              Supabase Storage{" "}
              <code className="px-1.5 py-0.5 rounded-md bg-white border border-line text-brand font-semibold text-[13px]">hr-forms</code>{" "}
              버킷 사용 (없으면 로컬{" "}
              <code className="px-1.5 py-0.5 rounded-md bg-white border border-line text-ink-soft font-semibold text-[13px]">uploads/hr-forms/</code>{" "}
              자동 fallback). 최초 1회 Supabase 대시보드에서{" "}
              <span className="font-bold text-ink">hr-forms</span> 버킷(Public 권장) 및{" "}
              <code className="px-1.5 py-0.5 rounded-md bg-white border border-line text-ink-soft font-semibold text-[13px]">hr_forms</code> 테이블 생성 필요.
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
