// src/components/layout/sideNavGroups.ts
// 2026-08-11 · 사이드바 V2
//   · 최상위 7개 = 상단 헤더 그대로 (홈·스케줄·매장·경영·약사·이슈·요청 · AppNavHeader TABS 매핑)
//   · 7개에 없는 페이지들 = "기타" 그룹 (랜딩 카드·서브탭에서만 접근 가능하던 페이지)
//   · 계정 (마이페이지) = 하단 sticky · SideNav.tsx SidebarFooter 에서 별도 렌더
import {
  House, Calendar, CalendarDots, Bookmarks, Coffee,
  SquaresFour, ScanSmiley, Package, Bell,
  ShoppingCart, FileMagnifyingGlass,
  ChatCircle, FirstAid, FileText,
  Briefcase, Chat, Lock, MapPin,
  UserCircle, DotsThree,
  type Icon,
} from "@phosphor-icons/react";
import type { AppNavPage } from "./AppNavHeader";
import type { AuthSession } from "../../types";

export type SideNavColor = "slate" | "amber" | "red" | "sky" | "indigo" | "emerald" | "violet" | "cyan";

export interface SideNavItem {
  key: AppNavPage;
  label: string;
  icon: Icon;
  color: SideNavColor;
  managerOnly?: boolean;
  pharmacistOnly?: boolean;
  minLevel?: number;
}

export interface SideNavGroup {
  id: string;
  label: string;
  color: SideNavColor;
  managerOnly?: boolean;
  pharmacistOnly?: boolean;
  items: SideNavItem[];
}

// 상단 헤더 TABS 순서 · 각 최상위 = 페이지 자체 하나만 · 서브탭은 페이지 내부에서 자체 표시 (Phase 2 이관 예정)
export const SIDE_NAV_GROUPS: SideNavGroup[] = [
  {
    id: "landing",
    label: "홈",
    color: "slate",
    items: [{ key: "landing", label: "홈", icon: House, color: "slate" }],
  },
  {
    id: "schedule",
    label: "스케줄",
    color: "amber",
    items: [{ key: "schedule", label: "스케줄", icon: Calendar, color: "amber" }],
  },
  {
    id: "display",
    label: "매장",
    color: "red",
    managerOnly: true,
    items: [{ key: "display", label: "매장", icon: SquaresFour, color: "red", managerOnly: true }],
  },
  {
    id: "business",
    label: "경영",
    color: "violet",
    managerOnly: true,
    items: [{ key: "business-manage", label: "경영", icon: Briefcase, color: "violet", managerOnly: true }],
  },
  {
    id: "pharmacist",
    label: "약사",
    color: "sky",
    pharmacistOnly: true,
    items: [{ key: "pharmacist", label: "약사", icon: FirstAid, color: "sky", pharmacistOnly: true }],
  },
  {
    id: "board",
    label: "이슈",
    color: "emerald",
    items: [{ key: "board", label: "이슈", icon: ChatCircle, color: "emerald" }],
  },
  {
    id: "requests",
    label: "요청",
    color: "cyan",
    items: [{ key: "requests", label: "요청", icon: Chat, color: "cyan" }],
  },
  // 상단 헤더 7개에 없는 페이지들 · 별도 접근 경로 유지
  {
    id: "misc",
    label: "기타",
    color: "slate",
    items: [
      // 근무 관련 (스케줄 서브)
      { key: "leave",          label: "연차/휴가",       icon: CalendarDots,        color: "sky" },
      { key: "lunch",          label: "점심불참",        icon: Coffee,              color: "amber" },
      { key: "reservation",    label: "예약",            icon: Bookmarks,           color: "cyan" },
      // 매장 서브
      { key: "scan",           label: "상품스캔",        icon: ScanSmiley,          color: "red",    managerOnly: true },
      { key: "productarrival", label: "상품도착",        icon: Package,             color: "red",    managerOnly: true },
      { key: "stockarrivals",  label: "입고알림",        icon: Bell,                color: "red",    managerOnly: true },
      { key: "stockcheck",     label: "재고관리",        icon: ShoppingCart,        color: "red",    managerOnly: true },
      { key: "ocr",            label: "거래명세서 OCR",  icon: FileMagnifyingGlass, color: "red",    managerOnly: true },
      // 경영 서브
      { key: "permissions",    label: "직원권한",        icon: Lock,                color: "violet", minLevel: 9 },
      { key: "zone-labels",    label: "구역 라벨",       icon: MapPin,              color: "violet", managerOnly: true },
      { key: "hr-forms",       label: "HR 양식",         icon: FileText,            color: "violet", managerOnly: true },
    ],
  },
  {
    id: "account",
    label: "계정",
    color: "slate",
    items: [
      { key: "mypage", label: "마이페이지", icon: UserCircle, color: "slate" },
    ],
  },
];

// TS unused import 방지 · 기타 그룹에 사용 안 하는 DotsThree 는 향후 그룹 헤더 아이콘용 예비
export const _DotsThree = DotsThree;

/** authSession 기반 접근 판정 · AppNavHeader.tsx 의 필터 로직 재사용 (약사 판정 · level ≥ 3) */
export function canAccessItem(item: SideNavItem, session: AuthSession | null): boolean {
  if (item.key === "landing") return true;
  if (!session) return false;
  const level =
    session.level ??
    (session.role === "superadmin" || session.role === "admin" ? 9
      : session.role === "manager" ? 2
      : session.role === "employee" ? 1 : 0);
  const isPharmacist = level >= 3;
  const isVendor = session.role === "vendor";
  const isPrivileged = level >= 2;

  if (isVendor && (item.key as AppNavPage) !== "landing") return false;
  if (item.minLevel != null && level < item.minLevel) return false;
  if (item.managerOnly && !isPrivileged) return false;
  if (item.pharmacistOnly && !isPharmacist) return false;
  return true;
}

/** 그룹 안에서 접근 가능 항목만 필터 · 빈 그룹은 제외 */
export function filterGroupsForSession(session: AuthSession | null): SideNavGroup[] {
  return SIDE_NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(it => canAccessItem(it, session)) }))
    .filter(g => g.items.length > 0);
}

/** 아이템 활성 판정 · 현재 페이지가 이 아이템이거나 · business-manage 서브페이지면 business-manage 활성 */
const BUSINESS_SUB_PAGES: Set<AppNavPage> = new Set(["business-manage", "leave", "lunch", "permissions", "hr-forms"]);
export function isItemActive(item: SideNavItem, currentPage: AppNavPage): boolean {
  if (item.key === currentPage) return true;
  if (item.key === "business-manage" && BUSINESS_SUB_PAGES.has(currentPage)) return true;
  return false;
}

/** 컬러 → tailwind 클래스 (활성 톤 · 비활성 hover 톤 · phosphor 톤에 맞춤) */
export const COLOR_TONES: Record<SideNavColor, { activeBar: string; activeBg: string; activeText: string; iconActive: string; hoverBg: string }> = {
  slate:   { activeBar: "bg-slate-500",   activeBg: "bg-slate-100",   activeText: "text-slate-800",   iconActive: "text-slate-600",   hoverBg: "hover:bg-slate-50"   },
  amber:   { activeBar: "bg-amber-500",   activeBg: "bg-amber-100",   activeText: "text-amber-800",   iconActive: "text-amber-600",   hoverBg: "hover:bg-amber-50"   },
  red:     { activeBar: "bg-red-500",     activeBg: "bg-red-100",     activeText: "text-red-700",     iconActive: "text-red-600",     hoverBg: "hover:bg-red-50"     },
  sky:     { activeBar: "bg-sky-500",     activeBg: "bg-sky-100",     activeText: "text-sky-700",     iconActive: "text-sky-600",     hoverBg: "hover:bg-sky-50"     },
  indigo:  { activeBar: "bg-indigo-500",  activeBg: "bg-indigo-100",  activeText: "text-indigo-700",  iconActive: "text-indigo-600",  hoverBg: "hover:bg-indigo-50"  },
  emerald: { activeBar: "bg-emerald-500", activeBg: "bg-emerald-100", activeText: "text-emerald-700", iconActive: "text-emerald-600", hoverBg: "hover:bg-emerald-50" },
  violet:  { activeBar: "bg-violet-500",  activeBg: "bg-violet-100",  activeText: "text-violet-700",  iconActive: "text-violet-600",  hoverBg: "hover:bg-violet-50"  },
  cyan:    { activeBar: "bg-cyan-500",    activeBg: "bg-cyan-100",    activeText: "text-cyan-700",    iconActive: "text-cyan-600",    hoverBg: "hover:bg-cyan-50"    },
};
