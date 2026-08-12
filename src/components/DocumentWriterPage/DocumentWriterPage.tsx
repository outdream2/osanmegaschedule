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

interface DocumentWriterPageProps {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  embedded?: boolean;
}

type DocTab = "contract" | "resignation" | "settings";

const TABS: TabDef<DocTab>[] = [
  { key: "contract",    label: "근로계약서 작성", icon: NotePencil, color: "emerald" },
  { key: "resignation", label: "사직서 작성",     icon: SignOut,    color: "rose"    },
  { key: "settings",    label: "설정",            icon: Gear,       color: "indigo"  },
];

const DocumentWriterPage: React.FC<DocumentWriterPageProps> = (props) => {
  const [tab, setTab] = useState<DocTab>(() => {
    // 2026-08-12 · 사이드바 V2 · localStorage("sidebar.subtab.document-writer") 있으면 초기 탭
    try {
      const raw = localStorage.getItem("sidebar.subtab.document-writer") as DocTab | null;
      if (raw === "contract" || raw === "resignation" || raw === "settings") {
        localStorage.removeItem("sidebar.subtab.document-writer");
        return raw;
      }
    } catch { /* silent */ }
    return "contract";
  });
  const isAdmin = (props.authSession?.level ?? 0) >= 8;
  const sortable = useSortableTabs<TabDef<DocTab>>("tabOrder.documentWriter", TABS, isAdmin);
  // 사이드바 V2 · 같은 페이지 내 서브탭 재클릭 대응 (nested)
  useEffect(() => {
    const onSubTab = (e: Event) => {
      const detail = (e as CustomEvent<{ page: string; subTab: string; nested: string | null }>).detail;
      if (detail?.page !== "business-manage") return;
      if (detail.subTab !== "document-writer") return;
      const nested = detail.nested as DocTab | null;
      if (nested === "contract" || nested === "resignation" || nested === "settings") setTab(nested);
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
