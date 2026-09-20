// src/components/layout/AppLayout.tsx
// 2026-09-20 · App.tsx 슬림화 · Layout Wrapper 분리 (App.tsx L638-701 이관)
//   · 데스크탑 · 사이드바 · SideNav + SidebarInset
//   · 모바일 · 사이드바 없음 · MobileOnlyGate + AppFooter
//   · 기능 100% 유지 · JSX 이동만
import React from "react";
import { useIsMobile } from "../../hooks/use-mobile";
import { useSidebarWidth } from "../../hooks/useSidebar";
import { MobileOnlyGate } from "../common/MobileOnlyGate";
import { AppFooter } from "./AppFooter";
import { SideNav } from "./SideNav";
import { SidebarProvider, SidebarInset } from "../ui/sidebar";
import { TooltipProvider } from "../ui/tooltip";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "./AppNavHeader";

export interface AppLayoutProps {
  pageContent: React.ReactElement;
  authSession: AuthSession | null;
  activePage: AppNavPage;
  navigate: (page: string) => void;
  handleLogout: () => void;
  timeoutWarningOverlay: React.ReactElement | null;
}

// 2026-08-11 · 사이드바 V2 · 데스크탑만 사이드바 · 모바일은 기존 헤더 fallback
// 모바일 감지 · 모바일이면 기존 렌더 · 데스크탑이면 사이드바 · React hook rules 준수 위해 wrapper 컴포넌트 분리
export const SidebarLayoutWrapper: React.FC<AppLayoutProps> = (props) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <>
        <MobileOnlyGate pageKey={props.activePage} authSession={props.authSession}>
          {props.pageContent}
        </MobileOnlyGate>
        <AppFooter />
        {props.timeoutWarningOverlay}
      </>
    );
  }
  return <SidebarLayout {...props} />;
};

const SIDEBAR_OPEN_KEY = "sidebar.open";
const readSidebarOpen = (): boolean => {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(SIDEBAR_OPEN_KEY);
  return raw === "false" ? false : true; // 기본 true
};

const SidebarLayout: React.FC<AppLayoutProps> = ({ pageContent, authSession, activePage, navigate, handleLogout, timeoutWarningOverlay }) => {
  const { width } = useSidebarWidth();
  // 2026-08-12 · PC 사이드바 접기 · localStorage 로 상태 유지 · 헤더 SidebarTrigger 로 토글
  const [sidebarOpen, setSidebarOpen] = React.useState<boolean>(readSidebarOpen);
  const handleOpenChange = React.useCallback((next: boolean) => {
    setSidebarOpen(next);
    try { localStorage.setItem(SIDEBAR_OPEN_KEY, String(next)); } catch { /* silent */ }
  }, []);
  return (
    <TooltipProvider delayDuration={200}>
      <SidebarProvider
        open={sidebarOpen}
        onOpenChange={handleOpenChange}
        style={{ "--sidebar-width": `${width}px` } as React.CSSProperties}
      >
        <SideNav
          authSession={authSession}
          activePage={activePage}
          onNavigate={(p) => navigate(p as string)}
          onLogout={handleLogout}
        />
        <SidebarInset>
          <MobileOnlyGate pageKey={activePage} authSession={authSession}>
            {pageContent}
          </MobileOnlyGate>
          <AppFooter />
        </SidebarInset>
        {timeoutWarningOverlay}
      </SidebarProvider>
    </TooltipProvider>
  );
};
