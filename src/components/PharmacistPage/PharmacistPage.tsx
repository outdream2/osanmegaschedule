// src/components/PharmacistPage/PharmacistPage.tsx
// 2026-08-03 · 약사 전용 페이지 (탭+split 레이아웃 재구성)
//   - 상단 정보 헤더 (약사 전용 · FirstAid)
//   - 공통 TabBar (L2) · 교육자료 · 복약지도 · 동영상 · 문서
//     · 관리자(level>=8) long-press 드래그 재정렬 (useSortableTabs)
//   - 각 탭 아래 · 좌 리스트 + 리사이저 + 우 상세 split (기존 페이지 통일)
//   - 실제 자료 업로드/조회 로직은 후속 · 현재는 카테고리 구조 + placeholder
// 관리자만 업로드 · 약사(및 관리자) 다운로드 · 미로그인 접근 제한

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FirstAid, BookOpen, Video, FileText, GraduationCap, Folder } from "@phosphor-icons/react";
import { AppNavHeader, type AppNavPage } from "../AppNavHeader";
import { TabBar, type TabDef as CommonTabDef } from "../common/TabBar";
import { useSortableTabs, type TabHandlerProps } from "../../hooks/useSortableTabs";
import type { AuthSession } from "../../types";

interface PharmacistPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate: (page: AppNavPage) => void;
  onLogout: () => void;
}

type PharmTabKey = "education" | "reference" | "video" | "docs";

const PHARM_TABS: CommonTabDef<PharmTabKey>[] = [
  { key: "education", label: "교육자료",  icon: GraduationCap, color: "sky"     },
  { key: "reference", label: "복약지도",  icon: BookOpen,      color: "emerald" },
  { key: "video",     label: "동영상 강의", icon: Video,         color: "violet"  },
  { key: "docs",      label: "각종 문서",  icon: FileText,      color: "amber"   },
];

interface CategoryItem { key: string; title: string; subtitle: string; }

const CATEGORIES: Record<PharmTabKey, CategoryItem[]> = {
  education: [
    { key: "drug",     title: "약물학 기초",         subtitle: "성분·기전·상호작용" },
    { key: "compound", title: "조제·투약",           subtitle: "처방 조제 실무" },
    { key: "counsel",  title: "복약 상담",           subtitle: "환자 응대 · 사례" },
    { key: "otc",      title: "OTC · 일반약",        subtitle: "일반의약품 안내" },
    { key: "law",      title: "약사법 · 규정",       subtitle: "관계 법령·고시" },
  ],
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

const RESIZE_STORAGE_KEY = "megatown_pharm_leftw";

export const PharmacistPage: React.FC<PharmacistPageProps> = ({ authSession, onBack, onNavigate, onLogout }) => {
  const isAdmin = (authSession?.level ?? 0) >= 8;

  // 탭 재정렬 · admin 만 (useSortableTabs 는 { key } 오브젝트 배열)
  const sortable = useSortableTabs<CommonTabDef<PharmTabKey>>("tabOrder.pharmacist", PHARM_TABS, isAdmin);
  const [tab, setTab] = useState<PharmTabKey>("education");

  // 탭 변경 시 선택 카테고리 초기화
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  useEffect(() => { setSelectedCat(null); }, [tab]);

  // ── 좌우 split 폭 (lg 이상) · localStorage 저장 ─────────────────
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem(RESIZE_STORAGE_KEY)); return Number.isFinite(v) && v > 0 ? v : 320; } catch { return 320; }
  });
  useEffect(() => { try { localStorage.setItem(RESIZE_STORAGE_KEY, String(leftWidth)); } catch { /* ignore */ } }, [leftWidth]);
  const leftWidthRef = useRef(leftWidth);
  useEffect(() => { leftWidthRef.current = leftWidth; }, [leftWidth]);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startW: leftWidthRef.current };
    const move = (ev: MouseEvent) => {
      const r = resizeRef.current; if (!r) return;
      setLeftWidth(Math.min(560, Math.max(240, r.startW + (ev.clientX - r.startX))));
    };
    const up = () => { resizeRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  const categories = CATEGORIES[tab] ?? [];
  const activeTabDef = useMemo(() => PHARM_TABS.find(t => t.key === tab)!, [tab]);
  const selectedCatObj = useMemo(() => categories.find(c => c.key === selectedCat) ?? null, [categories, selectedCat]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50/40 via-white to-emerald-50/30">
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
        {/* 정보 헤더 (탭 카드) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-sky-500 to-cyan-500 shadow-sm shrink-0">
            <FirstAid size={20} className="text-white" weight="fill" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] sm:text-[16px] font-black text-slate-800 tracking-tight leading-tight">약사 전용</h1>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">교육자료 · 복약지도 · 동영상 강의 · 각종 문서</p>
          </div>
          <div className="flex-1" />
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 font-bold">
            <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200">level ≥ 3</span>
            {isAdmin && <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">관리자 업로드</span>}
          </div>
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

        {/* 좌 리스트 + 리사이저 + 우 상세 (기존 페이지와 동일 split) */}
        <div className="flex flex-col lg:flex-row gap-2 lg:min-h-[520px]">
          {/* 좌측 · 카테고리 리스트 */}
          <div
            className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col"
            style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? leftWidth : undefined }}
          >
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/60 flex items-center gap-1.5">
                {activeTabDef.icon && <activeTabDef.icon size={14} className="text-slate-500" weight="fill" />}
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">{activeTabDef.label} · 카테고리</span>
                <span className="ml-auto text-[10px] font-bold text-slate-400 tabular-nums">{categories.length}건</span>
              </div>
              <ul className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
                {categories.map(c => {
                  const active = selectedCat === c.key;
                  return (
                    <li key={c.key}>
                      <button
                        type="button"
                        onClick={() => setSelectedCat(c.key)}
                        className={`w-full text-left px-3 py-2.5 flex items-start gap-2 transition cursor-pointer ${active ? "bg-sky-50/70" : "hover:bg-slate-50"}`}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-sky-100 text-sky-600" : "bg-slate-100 text-slate-500"}`}>
                          <Folder size={14} weight="fill" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className={`text-[13px] font-bold leading-tight ${active ? "text-sky-800" : "text-slate-800"}`}>{c.title}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate">{c.subtitle}</div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* 리사이저 (lg 이상) */}
          <div
            onMouseDown={onResizeStart}
            className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-slate-200 hover:bg-sky-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
            title="드래그하여 폭 조절"
          >
            <span className="text-[9px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
          </div>

          {/* 우측 · 선택 상세 */}
          <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0">
            {!selectedCatObj ? (
              <EmptyRightPanel tabLabel={activeTabDef.label} />
            ) : (
              <RightPanelPlaceholder tabLabel={activeTabDef.label} category={selectedCatObj} isAdmin={isAdmin} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

const EmptyRightPanel: React.FC<{ tabLabel: string }> = ({ tabLabel }) => (
  <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
    <FirstAid size={40} className="mb-3 opacity-30" />
    <div className="text-sm font-bold">좌측에서 {tabLabel} 카테고리를 선택하세요</div>
    <div className="text-[11px] mt-1">자료 리스트가 이 영역에 표시됩니다</div>
  </div>
);

const RightPanelPlaceholder: React.FC<{ tabLabel: string; category: CategoryItem; isAdmin: boolean }> = ({ tabLabel, category, isAdmin }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
    <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-sky-50/60 to-transparent flex items-center gap-2">
      <div>
        <div className="text-[10px] font-black text-sky-600 uppercase tracking-wider">{tabLabel}</div>
        <div className="text-[15px] font-black text-slate-800 leading-tight">{category.title}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{category.subtitle}</div>
      </div>
    </div>
    <div className="p-10 flex flex-col items-center justify-center text-center gap-3 min-h-[300px]">
      <div className="w-14 h-14 rounded-2xl bg-sky-50 text-sky-500 flex items-center justify-center">
        <FirstAid size={26} weight="fill" />
      </div>
      <div className="text-[14px] font-black text-slate-800">자료 준비 중</div>
      <div className="text-[12px] text-slate-500 leading-snug max-w-md">
        Supabase Storage 기반 자료 업로드/조회 기능이 곧 제공됩니다.<br />
        {isAdmin ? "관리자 계정으로 파일 업로드를 진행할 수 있게 됩니다." : "약사 계정으로 자료를 열람할 수 있게 됩니다."}
      </div>
    </div>
  </div>
);

export default PharmacistPage;
