// src/components/layout/SideNav.tsx
// 2026-08-11 · 사이드바 V2 · shadcn Sidebar 컴포넌트 활용 · 6그룹 페이지 트리 · 반응형
import React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "../ui/sidebar";
import { LogOut } from "lucide-react";
import type { AppNavPage } from "./AppNavHeader";
import type { AuthSession } from "../../types";
import { filterGroupsForSession, isItemActive, COLOR_TONES } from "./sideNavGroups";
import { useSidebarWidth } from "../../hooks/useSidebar";
import logoImg from "../../images/logo.png";

interface SideNavProps {
  authSession: AuthSession | null;
  activePage: AppNavPage;
  onNavigate: (page: AppNavPage) => void;
  onLogout?: () => void;
}

export const SideNav: React.FC<SideNavProps> = ({ authSession, activePage, onNavigate, onLogout }) => {
  const groups = filterGroupsForSession(authSession);
  const { startResize } = useSidebarWidth();

  return (
    <Sidebar collapsible="icon" data-sb-v2="">
      <SidebarHeader>
        <button
          type="button"
          onClick={() => onNavigate("landing")}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          title="홈"
        >
          <img src={logoImg} alt="로고" className="w-7 h-7 object-contain shrink-0" />
          <span className="text-[15px] font-black text-slate-800 group-data-[collapsible=icon]:hidden">메가타운</span>
        </button>
      </SidebarHeader>

      <SidebarContent>
        {groups.map(group => (
          <SidebarGroup key={group.id}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(item => {
                  const Icon = item.icon;
                  const active = isItemActive(item, activePage);
                  const tone = COLOR_TONES[item.color];
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        onClick={() => onNavigate(item.key)}
                        isActive={active}
                        tooltip={item.label}
                        aria-current={active ? "page" : undefined}
                        aria-label={item.label}
                        className={active
                          ? `${tone.activeBg} ${tone.activeText} font-bold hover:${tone.activeBg}`
                          : `${tone.hoverBg} font-medium`
                        }
                      >
                        <Icon size={18} weight={active ? "fill" : "duotone"} className={active ? tone.iconActive : "text-slate-500"} />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        {authSession && onLogout && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={onLogout}
                tooltip="로그아웃"
                className="hover:bg-rose-50 text-rose-600 hover:text-rose-700"
              >
                <LogOut size={16} />
                <span>로그아웃</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>

      {/* 2026-08-11 · PC 드래그 리사이즈 handle · 오른쪽 가장자리 · md 이상만 노출 */}
      <div
        onMouseDown={startResize}
        className="hidden md:block absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-slate-300/60 active:bg-slate-400 transition z-30 group-data-[collapsible=icon]:hidden"
        title="드래그하여 사이드바 폭 조절"
        aria-label="사이드바 폭 조절"
      />
    </Sidebar>
  );
};
