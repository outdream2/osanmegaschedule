// src/components/DocumentWriterPage/DocumentWriterPage.tsx
// 2026-08-03 · 서류작성 wrapper · 근로계약서·사직서·설정 3탭
// 경영관리 서브탭 (5번째)
// 2026-08-03 (#183) · 공통 TabBar 로 리팩터 · duplicate 스타일 흡수
// 2026-08-03 (#184) · 설정 탭 추가 · 카테고리별 업무내용 기본값 관리
// 2026-08-05 · 관리자(level>=8) long-press 드래그 재정렬 (useSortableTabs · tabOrder.documentWriter)
// 2026-09-27 · 네비게이션 SSOT · useActiveNav Context · nested 로 이관 (localStorage · CustomEvent 제거)
import React, { Suspense, useState, useEffect } from "react";
import { NotePencil, SignOut, Gear } from "@phosphor-icons/react";
// 2026-09-27 · 네비게이션 SSOT · useActiveNav Context
import { useActiveNav } from "../../contexts/ActiveNavContext";
import { Spinner } from "../common/Spinner";
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

  // 2026-09-27 · 네비게이션 SSOT · useActiveNav · activeNav.nested 로 initial 결정
  const { activeNav, setActiveByPage } = useActiveNav();
  const initialDocTab: DocTab = (() => {
    const raw = activeNav?.nested as DocTab | null | undefined;
    if ((raw === "contract" || raw === "resignation" || raw === "settings") && isAllowed(raw)) return raw;
    return defaultTab;
  })();
  const [tab, _setTab] = useState<DocTab>(initialDocTab);
  // 2026-09-27 · 네비게이션 SSOT · setTab · activeNav.nested 즉시 갱신
  //   · outer subTab = "document-writer" · nested = tab · 부모 페이지 그대로 유지
  const setTab = React.useCallback((next: DocTab) => {
    _setTab(next);
    const parentPage = activeNav?.itemKey ?? "business-manage";
    const parentSubTab = activeNav?.subTab ?? "document-writer";
    setActiveByPage(parentPage as any, parentSubTab, next);
  }, [setActiveByPage, activeNav]);

  // allowedTabs 가 바뀌어 현재 탭이 제외되면 · 첫 번째 허용 탭으로 이동
  useEffect(() => {
    if (!isAllowed(tab)) setTab(defaultTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.allowedTabs]);

  const isAdmin = (props.authSession?.level ?? 0) >= 8;
  const sortable = useSortableTabs<TabDef<DocTab>>("tabOrder.documentWriter", visibleTabs, isAdmin);

  // 2026-09-27 · activeNav.nested 변화 감지 · 사이드바 nested 재클릭 대응
  useEffect(() => {
    const raw = activeNav?.nested as DocTab | null | undefined;
    if ((raw === "contract" || raw === "resignation" || raw === "settings") && isAllowed(raw) && raw !== tab) {
      _setTab(raw);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNav?.nested]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* 2026-09-11 · #50 · 사용자 지시 · 매입 서브탭 (매입이력·거래명세서·유통기한임박) 과 동일 · TabBar level=3 */}
      <TabBar<DocTab>
        level={3}
        tabs={sortable.tabs}
        activeKey={tab}
        onSelect={setTab}
        maxWidth={1400}
        sortable={{ getTabProps: sortable.getTabProps, isDragging: sortable.isDragging }}
      />

      {/* ── 내부 탭 컨텐츠 ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {tab === "contract" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center py-16"><Spinner label="근로계약서 로딩 중..." size={16} tone="brand" /></div>}>
            <ContractWriterPage {...props} />
          </Suspense>
        )}
        {tab === "resignation" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center py-16"><Spinner label="사직서 로딩 중..." size={16} tone="brand" /></div>}>
            <ResignationWriterPage {...props} />
          </Suspense>
        )}
        {tab === "settings" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center py-16"><Spinner label="설정 로딩 중..." size={16} tone="brand" /></div>}>
            <ContractSettingsPage {...props} />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default DocumentWriterPage;
