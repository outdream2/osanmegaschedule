// src/components/PharmacistPage/PharmacistPage.tsx
// 2026-08-17 · apiClient 마이그레이션
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { useConfirm } from "../../hooks/useConfirm";
import { FirstAid, BookOpen, Video, FileText, GraduationCap, Folder, FolderOpen, File as FileIcon } from "@phosphor-icons/react";
import { Settings2, Plus, Eye, FileText as FileTextIcon, Loader2, ChevronRight, ChevronDown, CloudUpload, Trash2, X as XIcon } from "lucide-react";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { TabBar, type TabDef as CommonTabDef } from "../common/TabBar";
import { useSortableTabs, type TabHandlerProps } from "../../hooks/useSortableTabs";
import { SplitPanel } from "../common/SplitPanel";
import { ZONE_DEFS } from "../../constants/displayZones";
import { getZoneLabel } from "../../constants/zoneLabels";
import type { AuthSession } from "../../types";
import PharmacistMenuSettingsModal, { type PharmMenuItem, type PharmTabKey } from "../PharmacistMenuSettingsPage/PharmacistMenuSettingsPage";
import PdfViewerModal from "./PdfViewerModal";

interface PharmacistPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate: (page: AppNavPage) => void;
  onLogout: () => void;
}

const PHARM_TABS: CommonTabDef<PharmTabKey>[] = [
  { key: "education", label: "교육자료",  icon: GraduationCap, color: "sky"     },
  { key: "reference", label: "복약지도",  icon: BookOpen,      color: "emerald" },
  { key: "video",     label: "동영상 강의", icon: Video,         color: "violet"  },
  { key: "docs",      label: "각종 문서",  icon: FileText,      color: "amber"   },
];

interface CategoryItem { key: string; title: string; subtitle: string; custom?: boolean; }

// 커스텀 카테고리 · app_settings key='education_custom_categories' 로 저장 (JSON 배열)
//   - zone 기반 카테고리와 병합 · 뒤쪽에 표시 · 삭제는 커스텀만 가능
//   - key 는 "cus_<timestamp>_<rand>" (zone key 와 충돌 방지)
const CUSTOM_CATS_SETTINGS_KEY = "education_custom_categories";
interface CustomCategoryRow { key: string; title: string; subtitle?: string; createdAt?: string; }

// 파일 → dataURL (신규 카테고리 · 첫 자료 업로드용 · MenuSettings 와 동일 패턴)
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽을 수 없습니다"));
    reader.readAsDataURL(file);
  });
}
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// 교육자료 카테고리는 매장 구역(ZONE_DEFS) 기반 · 아래 buildEducationCategories 참조
const CATEGORIES: Record<Exclude<PharmTabKey, "education">, CategoryItem[]> = {
  reference: [
    { key: "interact",   title: "상호작용",           subtitle: "병용 금기·주의" },
    { key: "adverse",    title: "부작용",             subtitle: "이상반응·대응" },
    { key: "pregnancy",  title: "임부·수유부",         subtitle: "안전성 등급" },
    { key: "chronic",    title: "만성질환",           subtitle: "고혈압·당뇨 등" },
  ],
  video: [
    { key: "recent",   title: "최신 강의",           subtitle: "약사회·제약사 최근 영상" },
    { key: "series",   title: "시리즈 강의",         subtitle: "테마별 연속 강의" },
    { key: "webinar",  title: "웨비나 다시보기",     subtitle: "실시간 세미나 녹화" },
  ],
  docs: [
    { key: "manual",  title: "매뉴얼",              subtitle: "업무 매뉴얼·SOP" },
    { key: "notice",  title: "환자 안내문",         subtitle: "복용법·주의사항" },
    { key: "form",    title: "각종 양식",           subtitle: "인수인계·체크리스트" },
    { key: "policy",  title: "내부 정책",           subtitle: "약국 운영 정책" },
  ],
};

/**
 * 교육자료 카테고리 · 매장 구역(ZONE_DEFS) 기반 동적 생성
 *  · 통계 > 카테고리별 현황 · zone key 규칙과 동일 (예: "1A","1B","22","40A","40B","40C","35","36")
 *  · aisle 1~8 · A/B 서브존 개별 카드 · 22 · 계산대 40 A/B/C · 벽면·윙 통합
 *  · 매장 layout 순 정렬 (aisle → 상단벽면 → 하단벽면 → 윙 → 이벤트)
 */
function buildEducationCategories(): CategoryItem[] {
  const items: CategoryItem[] = [];
  const sectionRank: Record<string, number> = { aisle: 0, top_wall: 1, bottom_wall: 2, wing: 3, left_wall: 4, event: 5 };
  const sorted = [...ZONE_DEFS].sort((a, b) => {
    const sa = sectionRank[a.section] ?? 9;
    const sb = sectionRank[b.section] ?? 9;
    if (sa !== sb) return sa - sb;
    return a.num - b.num;
  });
  for (const z of sorted) {
    const numStr = String(z.num);
    if (z.subA && z.subB && z.subC) {
      items.push({ key: `${numStr}A`, title: `${getZoneLabel(`${numStr}A`)} · ${z.label} A`, subtitle: z.subA });
      items.push({ key: `${numStr}B`, title: `${getZoneLabel(`${numStr}B`)} · ${z.label} B`, subtitle: z.subB });
      items.push({ key: `${numStr}C`, title: `${getZoneLabel(`${numStr}C`)} · ${z.label} C`, subtitle: z.subC });
    } else if (z.subA && z.subB) {
      items.push({ key: `${numStr}A`, title: `${getZoneLabel(`${numStr}A`)} · ${z.label} A`, subtitle: z.subA });
      items.push({ key: `${numStr}B`, title: `${getZoneLabel(`${numStr}B`)} · ${z.label} B`, subtitle: z.subB });
    } else {
      items.push({ key: numStr, title: `${getZoneLabel(numStr)} · ${z.label}`, subtitle: z.category });
    }
  }
  return items;
}

export const PharmacistPage: React.FC<PharmacistPageProps> = ({ authSession, onBack, onNavigate, onLogout }) => {
  const confirm = useConfirm();

  const isAdmin = (authSession?.level ?? 0) >= 8;

  // 탭 재정렬 · admin 만 (useSortableTabs 는 { key } 오브젝트 배열)
  const sortable = useSortableTabs<CommonTabDef<PharmTabKey>>("tabOrder.pharmacist", PHARM_TABS, isAdmin);
  const [tab, setTab] = useState<PharmTabKey>("education");

  // 탭 변경 시 선택 카테고리 초기화
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  useEffect(() => { setSelectedCat(null); }, [tab]);

  // ── 교육탭 트리 · 펼쳐진 카테고리 키 Set ─────────────
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  // 교육탭 전환 시 · 이전 펼침 상태 초기화
  useEffect(() => {
    if (tab === "education") setExpandedCats(new Set());
  }, [tab]);
  const toggleCat = (key: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); }
      else { next.add(key); }
      return next;
    });
  };

  // 교육자료 카테고리 · zone-labels-changed 이벤트 시 재빌드 (사용자 라벨 변경 반영)
  const [zoneLabelVer, setZoneLabelVer] = useState(0);
  useEffect(() => {
    const h = () => setZoneLabelVer(v => v + 1);
    window.addEventListener("zone-labels-changed", h);
    return () => window.removeEventListener("zone-labels-changed", h);
  }, []);
  const educationCategories = useMemo(() => buildEducationCategories(), [zoneLabelVer]);

  // ── 커스텀 교육 카테고리 (사용자 추가) · app_settings 저장 ──────
  const [customCats, setCustomCats] = useState<CustomCategoryRow[]>([]);
  const [customCatsLoading, setCustomCatsLoading] = useState(false);
  const loadCustomCats = useCallback(async () => {
    setCustomCatsLoading(true);
    try {
      const { data } = await api.get<any>(`/api/settings?key=${encodeURIComponent(CUSTOM_CATS_SETTINGS_KEY)}`);
      const arr = Array.isArray(data?.value) ? data.value : [];
      // sanitize
      const clean: CustomCategoryRow[] = arr
        .filter((r: any) => r && typeof r.key === "string" && typeof r.title === "string" && r.key && r.title)
        .map((r: any) => ({
          key: String(r.key),
          title: String(r.title),
          subtitle: typeof r.subtitle === "string" ? r.subtitle : "",
          createdAt: typeof r.createdAt === "string" ? r.createdAt : undefined,
        }));
      setCustomCats(clean);
    } catch {
      // 조용히 빈 배열 fallback (기존 동작 유지)
      setCustomCats([]);
    } finally {
      setCustomCatsLoading(false);
    }
  }, []);
  useEffect(() => { loadCustomCats(); }, [loadCustomCats]);

  // 저장 유틸 (전체 배열 upsert)
  const persistCustomCats = useCallback(async (next: CustomCategoryRow[]) => {
    await api.post(`/api/settings`, { key: CUSTOM_CATS_SETTINGS_KEY, value: next });
  }, []);

  const categories = useMemo<CategoryItem[]>(
    () => {
      if (tab !== "education") return CATEGORIES[tab as Exclude<PharmTabKey, "education">] ?? [];
      // zone 기반 + 커스텀 (뒤쪽에 표시)
      const custom: CategoryItem[] = customCats.map(c => ({
        key: c.key,
        title: c.title,
        subtitle: c.subtitle || "사용자 추가",
        custom: true,
      }));
      return [...educationCategories, ...custom];
    },
    [tab, educationCategories, customCats],
  );
  const activeTabDef = useMemo(() => PHARM_TABS.find(t => t.key === tab)!, [tab]);
  const selectedCatObj = useMemo(() => categories.find(c => c.key === selectedCat) ?? null, [categories, selectedCat]);

  // ── 하위메뉴 (선택된 category) ───────────────────
  const [menuItems, setMenuItems] = useState<PharmMenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);

  const loadMenuItems = useCallback(async () => {
    if (!selectedCat) { setMenuItems([]); return; }
    setMenuLoading(true);
    setMenuError(null);
    try {
      const qs = `?tab=${encodeURIComponent(tab)}&category=${encodeURIComponent(selectedCat)}`;
      const { data } = await api.get<any>(`/api/pharmacist-menu-items${qs}`);
      setMenuItems(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setMenuError(err instanceof ApiError ? err.message : (err?.message ?? "불러오기 실패"));
      setMenuItems([]);
    } finally {
      setMenuLoading(false);
    }
  }, [tab, selectedCat]);

  useEffect(() => { loadMenuItems(); }, [loadMenuItems]);

  // ── 설정 모달 (관리자) ───────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── 왼쪽 상단 · 신규 카테고리 추가 폼 (교육탭 · 모든 사용자 사용 가능) ─
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [newCatTitle, setNewCatTitle] = useState("");
  const [newCatFile, setNewCatFile] = useState<File | null>(null);
  const [newCatSaving, setNewCatSaving] = useState(false);
  const [newCatError, setNewCatError] = useState<string | null>(null);
  const newCatFileRef = useRef<HTMLInputElement | null>(null);

  const resetNewCatForm = useCallback(() => {
    setNewCatTitle("");
    setNewCatFile(null);
    setNewCatError(null);
    if (newCatFileRef.current) newCatFileRef.current.value = "";
  }, []);

  const onNewCatFile = (file: File | null) => {
    setNewCatError(null);
    if (!file) { setNewCatFile(null); return; }
    if (file.size > MAX_UPLOAD_BYTES) {
      setNewCatError(`파일 크기 초과 (${(file.size / 1024 / 1024).toFixed(1)}MB > 20MB)`);
      setNewCatFile(null);
      return;
    }
    setNewCatFile(file);
  };

  const handleAddCustomCat = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewCatError(null);
    const title = newCatTitle.trim();
    if (!title) { setNewCatError("카테고리 제목을 입력하세요."); return; }
    // 중복 방지 (title 기준 커스텀)
    if (customCats.some(c => c.title === title)) { setNewCatError("이미 같은 이름의 카테고리가 있습니다."); return; }

    setNewCatSaving(true);
    try {
      // 1) 새 커스텀 카테고리 key 생성 및 배열 upsert
      const key = `cus_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const nextRow: CustomCategoryRow = {
        key,
        title,
        subtitle: newCatFile ? newCatFile.name : "사용자 추가",
        createdAt: new Date().toISOString(),
      };
      const next = [...customCats, nextRow];
      await persistCustomCats(next);
      setCustomCats(next);

      // 2) 파일이 있으면 · 이 카테고리의 첫 자료로 등록 (관리자 권한 필요 · 서버 체크)
      if (newCatFile) {
        try {
          const dataUrl = await readFileAsDataUrl(newCatFile);
          await api.post(`/api/pharmacist-menu-items`, {
            editor_level: authSession?.level ?? 0,
            tab_key: "education",
            category_key: key,
            title,
            sort_order: 0,
            data_url: dataUrl,
            file_name: newCatFile.name,
            uploaded_by: authSession?.employeeName ?? null,
            uploaded_by_id: authSession?.employeeId ?? null,
          });
        } catch (fileErr: any) {
          // 카테고리는 저장됨 · 파일만 실패 안내 (카테고리 유지)
          setNewCatError(`카테고리는 추가됐지만 자료 업로드 실패: ${fileErr instanceof ApiError ? fileErr.message : (fileErr?.message ?? "unknown")}`);
        }
      }

      // 3) 카테고리 자동 선택 · 폼 초기화
      setSelectedCat(key);
      setExpandedCats(prev => { const n = new Set(prev); n.add(key); return n; });
      // 성공 시 폼만 초기화 (에러 메시지는 파일 실패 시 유지)
      setNewCatTitle("");
      setNewCatFile(null);
      if (newCatFileRef.current) newCatFileRef.current.value = "";
    } catch (err: any) {
      setNewCatError(err?.message ?? "저장 실패");
    } finally {
      setNewCatSaving(false);
    }
  };

  const handleDeleteCustomCat = async (key: string, title: string) => {
    if (!await confirm({ message: `정말 삭제하시겠습니까?\n\n${title}\n\n(이 카테고리와 그 하위 자료가 리스트에서 제거됩니다)`, danger: true })) return;
    try {
      const next = customCats.filter(c => c.key !== key);
      await persistCustomCats(next);
      setCustomCats(next);
      // 선택 카테고리가 삭제된 경우 해제
      if (selectedCat === key) { setSelectedCat(null); setSelectedItem(null); }
      setExpandedCats(prev => { const n = new Set(prev); n.delete(key); return n; });
    } catch (err: any) {
      alert(err?.message ?? "삭제 실패");
    }
  };

  // ── T20 · 우측 인라인 PDF 뷰어 (선택된 하위메뉴) ─────
  //   기존 모달 → 인라인 · 좌측에 하위메뉴 리스트 · 우측에 PDF 표시
  const [selectedItem, setSelectedItem] = useState<PharmMenuItem | null>(null);
  // 카테고리·탭 변경 시 · 선택 하위메뉴 초기화
  useEffect(() => { setSelectedItem(null); }, [tab, selectedCat]);
  const selectItem = (item: PharmMenuItem) => setSelectedItem(item);

  // 교육탭 트리 · 카테고리 클릭 핸들러 (selectedItem 선언 이후 위치)
  const handleCatClickTree = (key: string) => {
    toggleCat(key);
    setSelectedCat(key);
    setSelectedItem(null);
  };
  // 풀스크린 모달 (선택적 · double-click) — 유지
  const [viewerItem, setViewerItem] = useState<PharmMenuItem | null>(null);
  const openViewerModal = (item: PharmMenuItem) => {
    if (!item.file_url) return;
    setViewerItem(item);
  };

  const watermarkText = useMemo(() => {
    const name = authSession?.employeeName ?? "약사";
    const rank = authSession?.employeeRank ?? "";
    return `${name}${rank}`;
  }, [authSession]);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50/50">
      <div className="sticky top-0 z-30">
        <AppNavHeader
          activePage={"pharmacist" as AppNavPage}
          authSession={authSession}
          onBack={onBack}
          onNavigate={onNavigate}
          onLogout={onLogout}
        />
      </div>

      <main className="flex-1 max-w-[1360px] mx-auto w-full px-3 sm:px-4 py-3 sm:py-4 flex flex-col gap-3">
        {/* 정보 헤더 · 2026-08-17 · 세련 · accent bar + gradient icon card + 폰트 +2 */}
        <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.04),0_4px_16px_rgba(10,46,74,0.06)] px-4 py-3.5 flex items-center gap-3">
          <span className="w-[3px] h-[40px] rounded-full bg-gradient-to-b from-brand-deep to-[#1E5C8E] shrink-0" />
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-brand-deep to-[#1E5C8E] shadow-[0_2px_8px_rgba(10,46,74,0.25)] ring-1 ring-brand/10 shrink-0">
            <FirstAid size={20} className="text-white" weight="fill" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[18px] sm:text-[19px] font-bold text-ink tracking-tight leading-tight">약사 전용</h1>
            <p className="text-[14px] text-ink-soft mt-0.5 truncate">교육자료 · 복약지도 · 동영상 강의 · 각종 문서</p>
          </div>
          <div className="flex-1" />
          <div className="hidden sm:flex items-center gap-1.5 text-[13px] font-semibold">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-tint text-brand-deep border border-brand/15">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-deep" />
              level ≥ 3
            </span>
            {isAdmin && tab !== "education" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                관리자 CRUD
              </span>
            )}
          </div>
          {/* 관리자 · 설정 버튼 · 교육탭에서는 트리 위 통합 컨트롤로 대체 (숨김) */}
          {isAdmin && tab !== "education" && (
            <button
              type="button"
              onClick={() => selectedCatObj && setSettingsOpen(true)}
              disabled={!selectedCatObj}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[14px] font-bold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:bg-zinc-200 disabled:text-zinc-400 text-white transition cursor-pointer shrink-0 shadow-sm"
              title={selectedCatObj ? "선택된 카테고리의 하위메뉴 관리" : "좌측에서 카테고리를 먼저 선택하세요"}
            >
              <Settings2 size={14} />
              하위메뉴 설정
            </button>
          )}
        </div>

        {/* Level-2 TabBar · admin 만 드래그 재정렬 */}
        <TabBar<PharmTabKey>
          level={2}
          tabs={sortable.tabs}
          activeKey={tab}
          onSelect={setTab}
          sortable={{
            getTabProps: ((k: PharmTabKey | CommonTabDef<PharmTabKey>) =>
              sortable.getTabProps(typeof k === "string" ? k : (k as CommonTabDef<PharmTabKey>))) as (k: PharmTabKey | CommonTabDef<PharmTabKey>) => TabHandlerProps,
            isDragging: sortable.isDragging,
          }}
        />

        {/* T20 · 좌 리스트 + 리사이저 + 우 PDF 인라인 뷰어 (2026-08-05 교육탭 트리구조) */}
        <SplitPanel
          storageKey="pharmacistPage.listWidth"
          defaultWidth={320}
          minWidth={240}
          maxWidth={520}
          dividerColor="sky"
          mobileRightAsModal={true}
          mobileModalTitle={selectedCatObj?.title}
          mobileOpen={!!selectedCatObj || !!selectedItem}
          onMobileClose={() => { setSelectedCat(null); setSelectedItem(null); }}
          wrapLeft={false}
          wrapRight={false}
          style={{ minHeight: "520px" }}
          left={
            <div className="flex flex-col gap-2 w-full">
            {tab === "education" ? (
              /* ─── 교육탭 · 트리 구조 ─────────────────────── */
              <div className="bg-white rounded-xl border border-line shadow-sm flex flex-col overflow-hidden">
                {/* ── 트리 위 · 카테고리 추가 컨트롤 (통합 진입점) ── */}
                <div className="border-b border-zinc-100 bg-sky-50/60">
                  <div className="px-3 py-2 flex items-center gap-1.5">
                    <Plus size={13} className="text-sky-600" />
                    <span className="text-[15px] font-bold text-sky-700 uppercase tracking-wider">하위메뉴 설정</span>
                    <span className="ml-auto flex items-center gap-1">
                      {customCatsLoading && <Loader2 size={10} className="animate-spin text-zinc-400" />}
                      <button
                        type="button"
                        onClick={() => { setAddCatOpen(v => !v); if (!addCatOpen) resetNewCatForm(); }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[15px] font-bold cursor-pointer transition bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white shadow-sm"
                        title={addCatOpen ? "폼 닫기" : "새 카테고리 추가"}
                      >
                        {addCatOpen ? <XIcon size={11} /> : <Plus size={11} />}
                        {addCatOpen ? "닫기" : "카테고리 추가"}
                      </button>
                    </span>
                  </div>
                  {addCatOpen && (
                    <form onSubmit={handleAddCustomCat} className="px-3 pb-3 flex flex-col gap-2">
                      <input
                        type="text"
                        value={newCatTitle}
                        onChange={e => setNewCatTitle(e.target.value)}
                        placeholder="카테고리 제목 (예: 겨울철 감기 대응)"
                        className="w-full bg-white border border-line rounded-lg px-2.5 py-1.5 text-[14px] font-semibold text-zinc-800 focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition placeholder:text-zinc-400 placeholder:font-normal"
                        maxLength={120}
                        disabled={newCatSaving}
                        required
                      />
                      <div className="flex items-center gap-1.5">
                        <input
                          ref={newCatFileRef}
                          type="file"
                          className="sr-only"
                          onChange={e => onNewCatFile(e.target.files?.[0] ?? null)}
                          accept=".pdf,application/pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                          disabled={newCatSaving}
                        />
                        <button
                          type="button"
                          onClick={() => newCatFileRef.current?.click()}
                          disabled={newCatSaving}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-line bg-white text-zinc-600 hover:bg-zinc-50 text-[15px] font-semibold transition cursor-pointer whitespace-nowrap disabled:opacity-50"
                          title="자료 파일 선택 (선택 · PDF·이미지 등 · 최대 20MB)"
                        >
                          <CloudUpload size={11} />
                          {newCatFile ? "파일 변경" : "자료 파일 (선택)"}
                        </button>
                        {newCatFile && (
                          <span className="text-[10.5px] text-zinc-500 font-semibold truncate flex-1">
                            {newCatFile.name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="submit"
                          disabled={newCatSaving || !newCatTitle.trim()}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:bg-zinc-200 disabled:text-zinc-400 text-white text-[15px] font-bold cursor-pointer transition shadow-sm"
                        >
                          {newCatSaving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                          {newCatSaving ? "저장 중..." : "저장"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { resetNewCatForm(); setAddCatOpen(false); }}
                          disabled={newCatSaving}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-line bg-white text-zinc-500 hover:bg-zinc-50 text-[15px] font-semibold cursor-pointer transition"
                        >
                          취소
                        </button>
                      </div>
                      {newCatError && (
                        <div className="text-[10.5px] text-rose-600 font-semibold leading-tight">{newCatError}</div>
                      )}
                    </form>
                  )}
                </div>

                {/* 트리 헤더 */}
                <div className="px-3 py-2 border-b border-zinc-100 bg-zinc-50/60 flex items-center gap-1.5">
                  <GraduationCap size={14} className="text-zinc-500" weight="fill" />
                  <span className="text-[15px] font-bold text-zinc-500 uppercase tracking-wider">교육자료 · 카테고리</span>
                  <span className="ml-auto text-[14px] font-bold text-zinc-400 tabular-nums">{categories.length}건</span>
                </div>

                {/* 트리 본문 */}
                <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)", minHeight: 200 }}>
                  {categories.map(c => {
                    const isExpanded = expandedCats.has(c.key);
                    const isCatActive = selectedCat === c.key;
                    // 이 카테고리의 하위메뉴 로딩 여부 (선택된 카테고리만 로드)
                    const showChildren = isExpanded && isCatActive;
                    const showLoading = showChildren && menuLoading;
                    const showItems = showChildren && !menuLoading && menuItems.length > 0;
                    const showEmpty = showChildren && !menuLoading && menuItems.length === 0;

                    return (
                      <div key={c.key}>
                        {/* 카테고리 행 (폴더 행) */}
                        <div className={`flex items-center gap-0 ${isCatActive && isExpanded ? "bg-sky-50/60" : ""}`}>
                          <button
                            type="button"
                            onClick={() => handleCatClickTree(c.key)}
                            className={`flex-1 text-left px-2.5 py-2 flex items-center gap-2 transition cursor-pointer min-w-0 ${
                              isCatActive ? "text-sky-800" : "text-zinc-800 hover:bg-zinc-50"
                            }`}
                            title={isExpanded ? "접기" : "펼치기"}
                          >
                            {/* 펼침/접힘 화살표 */}
                            <span className={`text-zinc-400 shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-0" : "-rotate-90"}`}>
                              {isExpanded
                                ? <ChevronDown size={13} className={isCatActive ? "text-sky-500" : "text-zinc-400"} />
                                : <ChevronRight size={13} className="text-zinc-400" />
                              }
                            </span>
                            {/* 폴더 아이콘 */}
                            <span className="shrink-0">
                              {isExpanded
                                ? <FolderOpen size={14} className="text-sky-500" weight="fill" />
                                : <Folder size={14} className={isCatActive ? "text-sky-400" : "text-zinc-400"} weight="fill" />
                              }
                            </span>
                            {/* 카테고리 텍스트 */}
                            <div className="min-w-0 flex-1">
                              <div className={`text-[12.5px] font-bold leading-tight break-words whitespace-normal ${isCatActive ? "text-sky-800" : "text-zinc-800"}`}>
                                {c.title}
                              </div>
                              <div className="text-[14px] text-zinc-500 leading-tight">{c.subtitle}</div>
                            </div>
                          </button>
                          {/* 커스텀 카테고리 · 삭제 버튼 (zone 기반은 여기서 삭제 불가) */}
                          {c.custom && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDeleteCustomCat(c.key, c.title); }}
                              className="shrink-0 w-6 h-6 mr-2 rounded flex items-center justify-center text-zinc-300 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                              title="이 카테고리 삭제 (사용자 추가 카테고리만)"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>

                        {/* 하위메뉴 (펼쳐진 상태 · 선택된 카테고리만) */}
                        {isExpanded && isCatActive && (
                          <div className="border-l-2 border-sky-100 ml-6">
                            {showLoading && (
                              <div className="pl-4 py-2 flex items-center gap-1.5 text-zinc-400">
                                <Loader2 size={11} className="animate-spin" />
                                <span className="text-[10.5px] font-bold">불러오는 중...</span>
                              </div>
                            )}
                            {menuError && (
                              <div className="pl-4 py-1.5 text-[14px] text-rose-600 font-semibold">
                                {menuError}
                              </div>
                            )}
                            {showEmpty && (
                              <div className="pl-4 py-2 text-[10.5px] text-zinc-400 italic">
                                {isAdmin ? "[ + ] 버튼으로 등록하세요" : "등록된 자료 없음"}
                              </div>
                            )}
                            {showItems && menuItems.map(row => {
                              const hasFile = !!row.file_url;
                              const itemActive = selectedItem?.id === row.id;
                              return (
                                <button
                                  key={row.id}
                                  type="button"
                                  onClick={() => selectItem(row)}
                                  className={`w-full text-left pl-5 pr-3 py-1.5 flex items-center gap-2 transition cursor-pointer ${
                                    itemActive ? "bg-sky-100/70" : "hover:bg-sky-50/50"
                                  }`}
                                  title={hasFile ? "PDF 인라인 표시" : "파일 없음"}
                                >
                                  <FileIcon
                                    size={12}
                                    className={hasFile ? (itemActive ? "text-sky-600" : "text-zinc-400") : "text-zinc-300"}
                                    weight="fill"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className={`text-[11.5px] font-bold leading-tight break-words whitespace-normal ${itemActive ? "text-sky-800" : "text-zinc-700"}`}>
                                      {row.title}
                                    </div>
                                    {row.file_name && (
                                      <div className="text-[9.5px] text-zinc-400 font-semibold leading-tight">
                                        {fmtBytes(row.file_size)}
                                      </div>
                                    )}
                                  </div>
                                  {itemActive && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-sky-500" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {/* 구분선 */}
                        <div className="border-b border-zinc-100 mx-0" />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* ─── 나머지 탭 · 기존 stacked 2단 ──────────── */
              <>
                {/* 카테고리 리스트 */}
                <div className="bg-white rounded-xl border border-line shadow-sm flex flex-col overflow-hidden">
                  <div className="px-3 py-2 border-b border-zinc-100 bg-zinc-50/60 flex items-center gap-1.5">
                    {activeTabDef.icon && <activeTabDef.icon size={14} className="text-zinc-500" weight="fill" />}
                    <span className="text-[15px] font-bold text-zinc-500 uppercase tracking-wider">{activeTabDef.label} · 카테고리</span>
                    <span className="ml-auto text-[14px] font-bold text-zinc-400 tabular-nums">{categories.length}건</span>
                  </div>
                  <ul className="divide-y divide-zinc-100 max-h-[38vh] overflow-y-auto">
                    {categories.map(c => {
                      const active = selectedCat === c.key;
                      return (
                        <li key={c.key}>
                          <button
                            type="button"
                            onClick={() => setSelectedCat(c.key)}
                            className={`w-full text-left px-3 py-2 flex items-start gap-2 transition cursor-pointer ${active ? "bg-sky-50/70" : "hover:bg-zinc-50"}`}
                          >
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-sky-100 text-sky-600" : "bg-zinc-100 text-zinc-500"}`}>
                              <Folder size={12} weight="fill" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className={`text-[12.5px] font-bold leading-tight ${active ? "text-sky-800" : "text-zinc-800"}`}>{c.title}</div>
                              <div className="text-[10.5px] text-zinc-500 mt-0.5">{c.subtitle}</div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* 하위메뉴 리스트 · 선택된 카테고리 · 관리자 CRUD 버튼 포함 */}
                {selectedCatObj && (
                  <div className="bg-white rounded-xl border border-line shadow-sm flex flex-col overflow-hidden">
                    <div className="px-3 py-2 border-b border-zinc-100 bg-sky-50/60 flex items-center gap-1.5">
                      <FileTextIcon size={13} className="text-sky-600" />
                      <span className="text-[15px] font-bold text-sky-700 uppercase tracking-wider break-words whitespace-normal">{selectedCatObj.title}</span>
                      <span className="ml-auto text-[14px] font-bold text-zinc-400 tabular-nums shrink-0">{menuItems.length}건</span>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setSettingsOpen(true)}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[14px] font-bold cursor-pointer transition shadow-sm shrink-0"
                          title="하위메뉴 추가·수정·삭제"
                        >
                          <Plus size={10} />관리
                        </button>
                      )}
                    </div>
                    {menuError && (
                      <div className="px-3 py-1.5 text-[10.5px] text-rose-700 font-semibold bg-rose-50 border-b border-rose-200">
                        {menuError}
                      </div>
                    )}
                    {menuLoading ? (
                      <div className="p-6 flex items-center justify-center gap-2 text-zinc-400">
                        <Loader2 size={13} className="animate-spin" />
                        <span className="text-[15px] font-bold">불러오는 중...</span>
                      </div>
                    ) : menuItems.length === 0 ? (
                      <div className="p-6 text-center text-[15px] text-zinc-400">
                        {isAdmin ? "관리 버튼으로 등록하세요" : "등록된 자료 없음"}
                      </div>
                    ) : (
                      <ul className="divide-y divide-zinc-100 max-h-[38vh] overflow-y-auto">
                        {menuItems.map(row => {
                          const hasFile = !!row.file_url;
                          const active = selectedItem?.id === row.id;
                          return (
                            <li key={row.id}>
                              <button
                                type="button"
                                onClick={() => selectItem(row)}
                                className={`w-full text-left px-3 py-2 flex items-center gap-2 transition ${
                                  active ? "bg-sky-100/60" : "hover:bg-sky-50/40"
                                } cursor-pointer`}
                                title={hasFile ? "PDF 인라인 표시" : "파일 없음"}
                              >
                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                                  hasFile ? "bg-sky-100 text-sky-600" : "bg-zinc-100 text-zinc-400"
                                }`}>
                                  <FileTextIcon size={12} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className={`text-[14px] font-bold break-words whitespace-normal ${active ? "text-sky-800" : "text-zinc-800"}`}>{row.title}</div>
                                  {row.file_name && (
                                    <div className="text-[14px] text-zinc-400 font-semibold">
                                      {row.file_name}{row.file_size ? ` · ${fmtBytes(row.file_size)}` : ""}
                                    </div>
                                  )}
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
            </div>
          }
          right={
            <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0 h-full">
              {!selectedItem ? (
                <div className="bg-white rounded-xl border border-line flex-1 flex flex-col items-center justify-center p-10 text-zinc-400 min-h-[400px]">
                  <FirstAid size={40} className="mb-3 opacity-30" />
                  <div className="text-sm font-bold">
                    {selectedCatObj ? "좌측에서 하위메뉴를 선택하세요" : `좌측에서 ${activeTabDef.label} 카테고리를 선택하세요`}
                  </div>
                  <div className="text-[15px] mt-1">
                    {selectedCatObj ? "선택된 자료의 PDF 가 이 영역에 표시됩니다" : "카테고리 선택 시 하위메뉴가 좌측 아래에 표시됩니다"}
                  </div>
                </div>
              ) : !selectedItem.file_url ? (
                <div className="bg-white rounded-xl border border-line flex-1 flex flex-col items-center justify-center p-10 text-zinc-400 min-h-[400px]">
                  <FileTextIcon size={36} className="mb-3 opacity-30" />
                  <div className="text-sm font-bold text-zinc-600">{selectedItem.title}</div>
                  <div className="text-[15px] mt-2 text-zinc-400">첨부 파일이 없습니다</div>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-line shadow-sm flex-1 flex flex-col overflow-hidden min-h-[400px]">
                  <div className="px-4 py-2.5 border-b border-zinc-100 bg-zinc-50/60 flex items-center gap-2">
                    <FileTextIcon size={14} className="text-sky-600" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-bold text-zinc-800 break-words whitespace-normal leading-tight">{selectedItem.title}</div>
                      {selectedItem.file_name && (
                        <div className="text-[10.5px] text-zinc-400 font-semibold break-words whitespace-normal">
                          {selectedItem.file_name}{selectedItem.file_size ? ` · ${fmtBytes(selectedItem.file_size)}` : ""}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openViewerModal(selectedItem)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[10.5px] font-bold cursor-pointer shrink-0"
                      title="풀스크린 · 워터마크 스크린샷 방지 모드"
                    >
                      <Eye size={11} />풀스크린
                    </button>
                  </div>
                  <iframe
                    src={selectedItem.file_url}
                    title={selectedItem.title}
                    className="flex-1 w-full border-0 min-h-[400px] bg-zinc-50"
                  />
                </div>
              )}
            </div>
          }
        />
      </main>

      {/* ── 설정 모달 (관리자) ─────────────────────────── */}
      {isAdmin && selectedCatObj && (
        <PharmacistMenuSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          tabKey={tab}
          tabLabel={activeTabDef.label}
          categoryKey={selectedCatObj.key}
          categoryTitle={selectedCatObj.title}
          authSession={authSession}
          onChanged={loadMenuItems}
        />
      )}

      {/* ── PDF 뷰어 모달 (스크린샷 방지) ───────────── */}
      {viewerItem && (
        <PdfViewerModal
          open={!!viewerItem}
          onClose={() => setViewerItem(null)}
          fileUrl={viewerItem.file_url ?? ""}
          fileName={viewerItem.file_name || viewerItem.title || "material"}
          mimeType={viewerItem.mime_type}
          watermarkText={watermarkText}
        />
      )}
    </div>
  );
};

const EmptyRightPanel: React.FC<{ tabLabel: string }> = ({ tabLabel }) => (
  <div className="bg-white rounded-xl border border-line flex-1 flex flex-col items-center justify-center p-10 text-zinc-400 min-h-[400px]">
    <FirstAid size={40} className="mb-3 opacity-30" />
    <div className="text-sm font-bold">좌측에서 {tabLabel} 카테고리를 선택하세요</div>
    <div className="text-[15px] mt-1">하위메뉴가 이 영역에 표시됩니다</div>
  </div>
);

// ─────────────────────────────────────────────────────
// 우측 하위메뉴 리스트 패널
// ─────────────────────────────────────────────────────
interface SubMenuListPanelProps {
  tabLabel: string;
  category: CategoryItem;
  items: PharmMenuItem[];
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  onOpenViewer: (item: PharmMenuItem) => void;
  onOpenSettings: () => void;
}

const SubMenuListPanel: React.FC<SubMenuListPanelProps> = ({
  tabLabel, category, items, loading, error, isAdmin, onOpenViewer, onOpenSettings,
}) => {
  return (
    <div className="bg-white rounded-xl border border-line shadow-sm flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-100 bg-sky-50/60 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-sky-600 uppercase tracking-wider">{tabLabel}</div>
          <div className="text-[15px] font-bold text-zinc-800 leading-tight truncate">{category.title}</div>
          <div className="text-[15px] text-zinc-500 mt-0.5 truncate">{category.subtitle}</div>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 text-[14px] font-bold tabular-nums">
            {items.length}건
          </span>
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[15px] font-bold cursor-pointer transition shadow-sm"
              title="하위메뉴 추가·수정·삭제"
            >
              <Plus size={11} />
              추가·관리
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-rose-700 font-semibold bg-rose-50 border-b border-rose-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-10 flex flex-col items-center gap-2">
          <Loader2 size={18} className="animate-spin text-sky-500" />
          <span className="text-xs text-zinc-400 font-bold">불러오는 중...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="p-10 flex flex-col items-center justify-center text-center gap-3 min-h-[280px]">
          <div className="w-14 h-14 rounded-2xl bg-sky-50 text-sky-500 flex items-center justify-center">
            <FirstAid size={26} weight="fill" />
          </div>
          <div className="text-[14px] font-bold text-zinc-800">등록된 하위메뉴 없음</div>
          <div className="text-[14px] text-zinc-500 leading-snug max-w-md">
            {isAdmin ? (
              <>
                우측 상단 <b>추가·관리</b> 버튼으로 하위메뉴를 등록하세요.<br />
                이름만 등록하거나 PDF 등을 첨부할 수 있습니다.
              </>
            ) : (
              <>이 카테고리에는 아직 자료가 없습니다.<br />관리자에게 자료 등록을 요청하세요.</>
            )}
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 max-h-[70vh] overflow-y-auto">
          {items.map(row => {
            const hasFile = !!row.file_url;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onOpenViewer(row)}
                  disabled={!hasFile}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition ${
                    hasFile ? "hover:bg-sky-50/50 cursor-pointer" : "opacity-60 cursor-not-allowed"
                  }`}
                  title={hasFile ? "클릭 · PDF 뷰어 열기" : "첨부 파일 없음"}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    hasFile ? "bg-sky-100 text-sky-600" : "bg-zinc-100 text-zinc-400"
                  }`}>
                    <FileTextIcon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold text-zinc-800 truncate">{row.title}</div>
                    <div className="text-[15px] text-zinc-400 mt-0.5 truncate font-semibold">
                      {row.file_name
                        ? <>{row.file_name}{row.file_size ? ` · ${fmtBytes(row.file_size)}` : ""}</>
                        : <span className="italic">파일 없음 (이름만)</span>}
                    </div>
                  </div>
                  {hasFile && (
                    <div className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-50 text-sky-700 text-[15px] font-bold">
                      <Eye size={11} />
                      열기
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export default PharmacistPage;
