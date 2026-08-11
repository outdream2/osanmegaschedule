// src/components/layout/sideNavGroups.ts
// 2026-08-11 · 사이드바 V2
//   · 최상위 7개 = 상단 헤더 그대로 (홈·스케줄·매장·경영·약사·이슈·요청 · AppNavHeader TABS 매핑)
//   · 각 아래 트리 구조 = 그 페이지의 서브탭 + 관련 페이지
//   · subTab 클릭 시 · localStorage 저장 후 페이지 이동 → 각 페이지 마운트 시 localStorage 읽어 초기 탭 설정
import {
  House, Calendar, CalendarDots, Bookmarks, Coffee,
  SquaresFour, ScanSmiley, Package, Bell,
  ShoppingCart, FileMagnifyingGlass, Truck, CurrencyKrw, ChartBar, Storefront, Buildings,
  ChatCircle, FirstAid, FileText,
  Briefcase, Chat, Lock, MapPin,
  UserCircle, UsersThree, CheckSquare, PencilLine,
  type Icon,
} from "@phosphor-icons/react";
import type { AppNavPage } from "./AppNavHeader";
import type { AuthSession } from "../../types";

export type SideNavColor = "slate" | "amber" | "red" | "sky" | "indigo" | "emerald" | "violet" | "cyan";

/** subTab · 페이지 이동 후 · 특정 서브탭을 활성화하고 싶을 때 지정 (localStorage 통해 페이지에 전달) */
export interface SideNavItem {
  key: AppNavPage;
  label: string;
  icon: Icon;
  color: SideNavColor;
  subTab?: string;              // 예: "purchase-order" · "staff-manage" · "inventory"
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

// 상단 헤더 TABS 순서 · 각 최상위 아래 · 서브탭들
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
    items: [
      { key: "schedule", label: "스케줄",    icon: Calendar,     color: "amber" },
      { key: "leave",    label: "연차/휴가", icon: CalendarDots, color: "amber" },
      { key: "lunch",    label: "점심불참",  icon: Coffee,       color: "amber" },
    ],
  },
  {
    id: "display",
    label: "매장",
    color: "red",
    managerOnly: true,
    items: [
      // DisplayPage 서브탭 (initialTopTab prop 지원 · line 1452)
      { key: "display", label: "발주",     icon: Truck,        color: "red", subTab: "purchase-order", managerOnly: true },
      { key: "display", label: "매입",     icon: Package,      color: "red", subTab: "purchase",       managerOnly: true },
      { key: "display", label: "결제",     icon: CurrencyKrw,  color: "red", subTab: "payment",        managerOnly: true },
      { key: "display", label: "통계",     icon: ChartBar,     color: "red", subTab: "statistics",     managerOnly: true },
      { key: "display", label: "입고알림", icon: Bell,         color: "red", subTab: "stock-arrivals", managerOnly: true },
      { key: "display", label: "매장구역", icon: Storefront,   color: "red", subTab: "store",          managerOnly: true },
      { key: "display", label: "공급사",   icon: Buildings,    color: "red", subTab: "vendor-manage",  managerOnly: true },
      // 별도 페이지 (매장 관련)
      { key: "scan",           label: "상품스캔",       icon: ScanSmiley,          color: "red", managerOnly: true },
      { key: "productarrival", label: "상품도착",       icon: Package,             color: "red", managerOnly: true },
      { key: "stockcheck",     label: "재고관리",       icon: ShoppingCart,        color: "red", managerOnly: true },
      { key: "ocr",            label: "거래명세서 OCR", icon: FileMagnifyingGlass, color: "red", managerOnly: true },
    ],
  },
  {
    id: "business",
    label: "경영",
    color: "violet",
    managerOnly: true,
    items: [
      // BusinessManagePage 서브탭
      { key: "business-manage", label: "직원관리",  icon: UsersThree,  color: "violet", subTab: "staff-manage",     managerOnly: true },
      { key: "business-manage", label: "승인센터",  icon: CheckSquare, color: "violet", subTab: "approval-center",  managerOnly: true },
      { key: "business-manage", label: "점심불참",  icon: Coffee,      color: "violet", subTab: "lunch",            managerOnly: true },
      { key: "business-manage", label: "HR 양식",   icon: FileText,    color: "violet", subTab: "hr-forms",         managerOnly: true },
      { key: "business-manage", label: "문서작성",  icon: PencilLine,  color: "violet", subTab: "document-writer",  managerOnly: true },
      // 별도 페이지 (경영 관련)
      { key: "permissions", label: "직원권한",  icon: Lock,   color: "violet", minLevel: 9 },
      { key: "zone-labels", label: "구역 라벨", icon: MapPin, color: "violet", managerOnly: true },
    ],
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
    items: [
      // RequestsPage 서브탭
      { key: "requests", label: "진열요청",   icon: Chat,         color: "cyan", subTab: "display" },
      { key: "requests", label: "실재고차이", icon: ShoppingCart, color: "cyan", subTab: "inventory", managerOnly: true },
      { key: "requests", label: "점심불참",   icon: Coffee,       color: "cyan", subTab: "lunch",     managerOnly: true },
    ],
  },
  {
    id: "account",
    label: "계정",
    color: "slate",
    items: [{ key: "mypage", label: "마이페이지", icon: UserCircle, color: "slate" }],
  },
];

/** 서브탭 클릭 시 · 각 페이지 컴포넌트가 마운트 시 읽을 localStorage key */
export function subTabStorageKey(pageKey: AppNavPage): string {
  return `sidebar.subtab.${pageKey}`;
}

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
  if (item.subTab) return false; // 서브탭 항목은 · 페이지가 같아도 · 정확한 서브탭 판정 어려워 · 활성 스킵 (Phase 3에서 완성)
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
