// src/components/BottomNav.tsx
// 모바일 하단 5탭 + "더보기" 시트
// 2026-08-29 · #196 Phase 2 · SIDE_NAV_GROUPS 자동 파생 (하드코드 제거)
//   · 하단 4탭: DERIVED_TOP_TABS 첫 4개 (mobileBottomTab · 안정 순서) + 더보기
//   · isActive: collectAllPageKeys() 동적 수집 (더 이상 하드코드 배열 X)
//   · 더보기 시트: filterGroupsForSession() 기반 · 각 그룹 · items 동적 렌더
//     · 사이드바 편집 시 · 모바일 시트 자동 동기 (사용자 크리티컬 원칙)

import React, { useMemo, useState } from "react";
import { Menu, LogOut } from "lucide-react";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "./AppNavHeader";
import { BottomSheet } from "../common/BottomSheet";
import { usePageVisibility } from "../../hooks/usePageVisibility";
import { usePagePermissions } from "../../hooks/usePagePermissions";
import { useEmploymentStatus } from "../../hooks/useEmploymentStatus";
import {
  DERIVED_TOP_TABS,
  filterGroupsForSession,
  collectAllPageKeys,
  subTabStorageKey,
  COLOR_TONES,
  type SideNavColor,
  type SideNavItem,
} from "./sideNavGroups";

interface Props {
  activePage: AppNavPage;
  authSession: AuthSession | null;
  onNavigate: (page: AppNavPage) => void;
  onLogout?: () => void;
}

// 2026-08-29 · #196 · 하단 4탭 · DERIVED_TOP_TABS 순서 · 사용자 이미 익숙 · landing/schedule/requests/board
//   · DERIVED_TOP_TABS 는 SIDE_NAV_GROUPS 자동 파생 · 그룹 label · icon · mobileLabel
const BOTTOM_TAB_KEYS = ["landing", "schedule", "requests", "board"] as const;

export const BottomNav: React.FC<Props> = ({ activePage, authSession, onNavigate, onLogout }) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { isVisible, loaded: visLoaded } = usePageVisibility();
  const { perms } = usePagePermissions();
  const { status: employmentStatus } = useEmploymentStatus(authSession);
  const mobileVisible = (pageKey: string) => !visLoaded || isVisible(pageKey, "mobile");

  // 2026-08-29 · #196 · 하단 4탭 · DERIVED_TOP_TABS 에서 · BOTTOM_TAB_KEYS 순서로 선택
  const bottomTabs = useMemo(() => {
    return BOTTOM_TAB_KEYS
      .map(k => DERIVED_TOP_TABS.find(t => t.key === k))
      .filter((t): t is NonNullable<typeof t> => !!t);
  }, []);

  // 2026-08-29 · #196 · 모든 페이지 key Set · isActive 판정
  const allKeys = useMemo(() => collectAllPageKeys(), []);

  // 2026-08-29 · #196 · "더보기" 시트에 노출할 그룹 · items 동적 파생
  //   · filterGroupsForSession 로 접근 가능한 그룹만
  //   · 하단 4탭 그룹 (landing · schedule · requests · board) 은 시트에서 제외
  //   · vendor 그룹은 hideOnMobile · 필터에서 자동 제외
  //   · account 그룹 (마이페이지) · 시트 노출
  const sheetGroups = useMemo(() => {
    const bottomTabSet = new Set<string>(BOTTOM_TAB_KEYS as readonly string[]);
    return filterGroupsForSession(authSession ?? null, perms, employmentStatus)
      .filter(g => {
        const gKey = g.topTab?.key ?? g.items[0]?.key ?? g.id;
        return !bottomTabSet.has(String(gKey));
      })
      .map(g => ({
        ...g,
        items: g.items.filter(it => mobileVisible(String(it.key))),
      }))
      .filter(g => g.items.length > 0);
  }, [authSession, perms, employmentStatus, mobileVisible]);

  const handleTap = (key: string) => {
    if (key === "more") { setSheetOpen(true); return; }
    onNavigate(key as AppNavPage);
  };

  const isActive = (key: string) => {
    if (key === activePage) return true;
    // "더보기" · 하단 4탭에 없는 모든 페이지가 활성일 때 · 하이라이트
    if (key === "more") {
      const bottomTabSet = new Set<string>(BOTTOM_TAB_KEYS as readonly string[]);
      return allKeys.has(activePage) && !bottomTabSet.has(activePage);
    }
    return false;
  };

  const handleSheetItemClick = (it: SideNavItem) => {
    setSheetOpen(false);
    if (it.subTab) {
      try { localStorage.setItem(subTabStorageKey(it.key), it.subTab); } catch { /* noop */ }
    }
    onNavigate(it.key);
  };

  return (
    <>
      {/* Bottom safe-area padding for pages · fixed 나 sticky 요소에 가리지 않도록 하단 여백 확보 */}
      <div className="sm:hidden h-20" style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }} aria-hidden="true" />

      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-line shadow-[0_-4px_20px_rgba(15,23,42,0.06)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="grid grid-cols-5 gap-0.5 px-1 pt-1">
          {bottomTabs
            .filter(t => mobileVisible(t.key))
            .map(t => {
              const Icon = t.icon;
              const active = isActive(t.key);
              return (
                <button
                  key={t.key}
                  onClick={() => handleTap(t.key)}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition active:scale-95 ${
                    active ? "text-orange-600" : "text-zinc-400 hover:text-zinc-600"
                  }`}
                >
                  <span className={`w-9 h-6 flex items-center justify-center rounded-full transition ${active ? "bg-orange-100" : ""}`}>
                    <Icon size={active ? 18 : 17} weight={active ? "fill" : "regular"} />
                  </span>
                  <span className={`text-[10px] font-bold leading-none tracking-tight ${active ? "text-orange-700" : ""}`}>{t.mobileLabel}</span>
                </button>
              );
            })}
          {/* 더보기 탭 · 항상 마지막 */}
          <button
            key="more"
            onClick={() => handleTap("more")}
            className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition active:scale-95 ${
              isActive("more") ? "text-orange-600" : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            <span className={`w-9 h-6 flex items-center justify-center rounded-full transition ${isActive("more") ? "bg-orange-100" : ""}`}>
              <Menu size={isActive("more") ? 18 : 17} strokeWidth={isActive("more") ? 2.6 : 2} />
            </span>
            <span className={`text-[10px] font-bold leading-none tracking-tight ${isActive("more") ? "text-orange-700" : ""}`}>더보기</span>
          </button>
        </div>
      </nav>

      {/* 2026-08-29 · #196 · 더보기 시트 · SIDE_NAV_GROUPS 동적 렌더 (하드코드 제거) */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={<h3 className="text-sm font-bold text-zinc-800">더보기</h3>}
        maxHeight="80vh"
        className="sm:hidden"
      >
        <div className="p-3 flex flex-col gap-4">
          {sheetGroups.map(group => {
            const tone = COLOR_TONES[group.color] ?? COLOR_TONES.slate;
            const GroupIcon = group.icon ?? group.items[0]?.icon;
            return (
              <section key={group.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-1">
                  {GroupIcon && (
                    <span className={`w-6 h-6 rounded-md flex items-center justify-center ${tone.activeBg}`}>
                      <GroupIcon size={13} weight="fill" className={tone.iconActive} />
                    </span>
                  )}
                  <span className={`text-[12px] font-bold ${tone.activeText}`}>{group.label}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {group.items.map(it => (
                    <SheetTile
                      key={`${it.key}:${it.subTab ?? ""}`}
                      icon={it.icon}
                      label={it.label}
                      color={it.color}
                      onClick={() => handleSheetItemClick(it)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          {onLogout && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-line">
              <SheetTile icon={LogOut} label="로그아웃" color="red" onClick={() => { setSheetOpen(false); onLogout(); }} />
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  );
};

const TILE_COLORS: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  slate:   { bg: "hover:bg-zinc-50",    border: "border-line",         text: "text-zinc-700",   iconBg: "bg-zinc-100" },
  amber:   { bg: "hover:bg-amber-50",   border: "border-amber-200",    text: "text-amber-700",  iconBg: "bg-amber-100" },
  red:     { bg: "hover:bg-red-50",     border: "border-red-200",      text: "text-red-700",    iconBg: "bg-red-100" },
  sky:     { bg: "hover:bg-sky-50",     border: "border-sky-200",      text: "text-sky-700",    iconBg: "bg-sky-100" },
  indigo:  { bg: "hover:bg-indigo-50",  border: "border-indigo-200",   text: "text-indigo-700", iconBg: "bg-indigo-100" },
  emerald: { bg: "hover:bg-emerald-50", border: "border-emerald-200",  text: "text-emerald-700",iconBg: "bg-emerald-100" },
  violet:  { bg: "hover:bg-violet-50",  border: "border-violet-200",   text: "text-violet-700", iconBg: "bg-violet-100" },
  cyan:    { bg: "hover:bg-cyan-50",    border: "border-cyan-200",     text: "text-cyan-700",   iconBg: "bg-cyan-100" },
  rose:    { bg: "hover:bg-rose-50",    border: "border-rose-200",     text: "text-rose-700",   iconBg: "bg-rose-100" },
};

function SheetTile({
  icon: Icon, label, color, onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string; weight?: "regular" | "fill" }>;
  label: string; color: SideNavColor | string; onClick: () => void;
}) {
  const c = TILE_COLORS[color] ?? TILE_COLORS.slate;
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1.5 py-3 bg-white border ${c.border} rounded-2xl ${c.bg} active:scale-95 transition`}>
      <span className={`w-10 h-10 rounded-xl ${c.iconBg} flex items-center justify-center`}>
        <Icon size={18} weight="fill" className={c.text} />
      </span>
      <span className={`text-[11px] font-bold ${c.text} text-center leading-tight`}>{label}</span>
    </button>
  );
}

export default BottomNav;
