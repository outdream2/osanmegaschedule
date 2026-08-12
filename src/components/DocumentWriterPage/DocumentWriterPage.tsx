// src/components/DocumentWriterPage/DocumentWriterPage.tsx
// 2026-08-03 · 서류작성 wrapper · 근로계약서·사직서·설정 3탭
// 경영관리 서브탭 (5번째)
// 2026-08-03 (#183) · 공통 TabBar 로 리팩터 · duplicate 스타일 흡수
// 2026-08-03 (#184) · 설정 탭 추가 · 카테고리별 업무내용 기본값 관리
// 2026-08-05 · 관리자(level>=8) long-press 드래그 재정렬 (useSortableTabs · tabOrder.documentWriter)
import React, { Suspense, useState, useEffect } from "react";
import { NotePencil, SignOut, Gear } from "@phosphor-icons/react";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";
import { TabBar, type TabDef } from "../common/TabBar";
import { useSortableTabs } from "../../hooks/useSortableTabs";

const ContractWriterPage = React.lazy(() => import("../ContractWriterPage/ContractWriterPage"));
const ResignationWriterPage = React.lazy(() => import("../ResignationWriterPage/ResignationWriterPage"));
const ContractSettingsPage = React.lazy(() => import("../ContractSettingsPage/ContractSettingsPage"));

type DocTab = "contract" | "resignation" | "settings";

interface DocumentWriterPageProps {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  embedded?: boolean;
  /** 2026-08-12 · 노출할 탭 화이트리스트
   *  · undefined = 전체 (하위호환)
   *  · ["resignation"]           = 승인요청 > 사직서 작성 (직원용)
   *  · ["contract", "settings"]  = 경영 > 근로계약서 작성 + 설정 (관리자용)
   */
  allowedTabs?: DocTab[];
}

const TABS: TabDef<DocTab>[] = [
  { key: "contract",    label: "근로계약서 작성", icon: NotePencil, color: "emerald" },
  { key: "resignation", label: "사직서 작성",     icon: SignOut,    color: "rose"    },
  { key: "settings",    label: "설정",            icon: Gear,       color: "indigo"  },
];

const DocumentWriterPage: React.FC<DocumentWriterPageProps> = (props) => {
  // allowedTabs 있으면 그 순서·집합으로 · 없으면 전체
  const visibleTabs: TabDef<DocTab>[] = props.allowedTabs
    ? TABS.filter(t => props.allowedTabs!.includes(t.key))
    : TABS;
  const isAllowed = (k: DocTab): boolean => visibleTabs.some(t => t.key === k);
  const defaultTab: DocTab = visibleTabs[0]?.key ?? "contract";

  const [tab, setTab] = useState<DocTab>(() => {
    // 2026-08-12 · 사이드바 V2 · localStorage("sidebar.subtab.document-writer") 있으면 초기 탭
    // StrictMode 이중 마운트 대비 · 읽기만 · 삭제는 useEffect 로
    // allowedTabs 지정 시 · 허용된 탭만 선택
    try {
      const raw = localStorage.getItem("sidebar.subtab.document-writer") as DocTab | null;
      if ((raw === "contract" || raw === "resignation" || raw === "settings") && isAllowed(raw)) return raw;
    } catch { /* silent */ }
    return defaultTab;
  });
  useEffect(() => {
    try { localStorage.removeItem("sidebar.subtab.document-writer"); } catch { /* silent */ }
  }, []);
  // allowedTabs 가 바뀌어 현재 탭이 제외되면 · 첫 번째 허용 탭으로 이동
  useEffect(() => {
    if (!isAllowed(tab)) setTab(defaultTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.allowedTabs]);

  const isAdmin = (props.authSession?.level ?? 0) >= 8;
  const sortable = useSortableTabs<TabDef<DocTab>>("tabOrder.documentWriter", visibleTabs, isAdmin);
  // 사이드바 V2 · 같은 페이지 내 서브탭 재클릭 대응 (nested)
  useEffect(() => {
    const onSubTab = (e: Event) => {
      const detail = (e as CustomEvent<{ page: string; subTab: string; nested: string | null }>).detail;
      if (detail?.page !== "business-manage") return;
      if (detail.subTab !== "document-writer") return;
      const nested = detail.nested as DocTab | null;
      if ((nested === "contract" || nested === "resignation" || nested === "settings") && isAllowed(nested)) setTab(nested);
    };
    window.addEventListener("sidebar:subtab", onSubTab);
    return () => window.removeEventListener("sidebar:subtab", onSubTab);
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── 내부 3탭 바 · 공통 TabBar (level 2) · 관리자 long-press 재정렬 ── */}
      <TabBar<DocTab>
        level={2}
        tabs={sortable.tabs}
        activeKey={tab}
        onSelect={setTab}
        maxWidth={1400}
        sortable={{ getTabProps: sortable.getTabProps, isDragging: sortable.isDragging }}
      />

      {/* ── 내부 탭 컨텐츠 ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {tab === "contract" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-bold py-16">근로계약서 로딩 중...</div>}>
            <ContractWriterPage {...props} />
          </Suspense>
        )}
        {tab === "resignation" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-bold py-16">사직서 로딩 중...</div>}>
            <ResignationWriterPage {...props} />
          </Suspense>
        )}
        {tab === "settings" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-bold py-16">설정 로딩 중...</div>}>
            <ContractSettingsPage {...props} />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default DocumentWriterPage;
