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
  Palette, Gear,
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
  /** 공통헤더 TABS 파생용 · 헤더 상단 탭 아이콘 · 지정 시 group.items[0].icon 대신 사용 (회귀 방지 · 기존 헤더 아이콘 유지) */
  icon?: Icon;
  managerOnly?: boolean;
  pharmacistOnly?: boolean;
  /** 2026-08-12 · 모바일(반응형) 사이드바에서 그룹 숨김 (거래처 그룹 등 · PC 관리자 편의 전용) */
  hideOnMobile?: boolean;
  items: SideNavItem[];
  /** 공통헤더 TABS 파생 · 없으면 그룹 자동 노출 · hideInTopTabs=true 면 헤더에 노출 안 함 */
  topTab?: {
    /** AppNavPage or "business" 확장 키 · 없으면 group.items[0].key 사용 */
    key?: string;
    /** 짧은 모바일 라벨 · 기본 group.label */
    mobileLabel?: string;
    /** true 면 헤더에서 숨김 (예: 계정 그룹) */
    hideInTopTabs?: boolean;
  };
}

// 상단 헤더 TABS 순서 · 각 최상위 아래 · 서브탭들
// 2026-08-12 · 공통헤더 TABS = 이 배열에서 자동 파생 (DERIVED_TOP_TABS · AppNavHeader.tsx)
//   · group.icon (헤더용 아이콘) · group.topTab (헤더 노출 키/라벨/숨김) 필드로 명시
//   · 순서·라벨·색상·아이콘 모두 기존 하드코딩 TABS 와 동일 (회귀 없음)
export const SIDE_NAV_GROUPS: SideNavGroup[] = [
  {
    id: "landing",
    label: "홈",
    color: "slate",
    icon: House,
    topTab: { key: "landing" },
    items: [{ key: "landing", label: "홈", icon: House, color: "slate" }],
  },
  {
    id: "schedule",
    label: "스케줄",
    color: "amber",
    icon: Calendar,
    topTab: { key: "schedule" },
    items: [
      { key: "schedule", label: "스케줄", icon: Calendar, color: "amber" },
    ],
  },
  {
    id: "approvals",
    label: "승인요청",
    color: "indigo",
    icon: CheckSquare, // 헤더용 · 기존 TABS 아이콘 유지 (items[0]=CalendarDots 와 다름 · 회귀 방지)
    topTab: { key: "approval-request", mobileLabel: "승인" },
    // 2026-08-12 · 직원(lv1) 도 본인 승인 신청 · managerOnly 해제
    items: [
      // 2026-08-12 · 승인요청 통합 페이지 (approval-request) · 서브탭 3종 라우팅
      { key: "approval-request", label: "연차신청", icon: CalendarDots, color: "indigo", subTab: "leave"           },
      { key: "approval-request", label: "점심불참", icon: Coffee,       color: "indigo", subTab: "lunch"           },
      { key: "approval-request", label: "서류작성", icon: PencilLine,   color: "indigo", subTab: "document-writer" },
    ],
  },
  {
    id: "display",
    label: "매장",
    color: "red",
    icon: SquaresFour, // 헤더용 · 기존 TABS 아이콘 유지 (items[0]=Truck 발주 와 다름 · 회귀 방지)
    topTab: { key: "display" },
    managerOnly: true,
    items: [
      // DisplayPage 서브탭 · dpCanSeeStockManage (level ≥ 9) 조건과 동일하게 minLevel 지정
      { key: "display", label: "발주", icon: Truck, color: "red", subTab: "purchase-order", minLevel: 9 },
      { key: "display", label: "매입", icon: Package, color: "red", subTab: "purchase", minLevel: 9 },
      { key: "display", label: "결제", icon: CurrencyKrw, color: "red", subTab: "payment", minLevel: 9 },
      { key: "display", label: "통계", icon: ChartBar, color: "red", subTab: "statistics", minLevel: 9 },
      // 입고알림 · dpCanSeeStockArrivals (level ≥ 3)
      { key: "display", label: "입고알림", icon: Bell, color: "red", subTab: "stock-arrivals", minLevel: 3 },
      { key: "display", label: "매장진열", icon: Storefront, color: "red", subTab: "store", managerOnly: true },
      // 2026-08-12 · 공급사 · 사이드바 항목 삭제 (사용자 지시)
      // 2026-08-12 · 상품스캔·상품도착·재고관리 · 사이드바 항목 삭제 (사용자 지시 · 매장>매입 서브탭 참고)
      // 2026-08-12 · 거래명세서 OCR · 매장>매입 서브탭에 이미 있음 · 사이드바 중복 제거
    ],
  },
  {
    id: "business",
    label: "경영",
    color: "violet",
    icon: Briefcase, // 헤더용 · 기존 TABS 아이콘 유지 (items[0]=UsersThree 직원관리 와 다름 · 회귀 방지)
    topTab: { key: "business" }, // 특수 키 · AppNavHeader 내부에서 business-manage 로 라우팅
    managerOnly: true,
    items: [
      // BusinessManagePage 서브탭
      { key: "business-manage", label: "직원관리",       icon: UsersThree, color: "violet", subTab: "staff-manage",              managerOnly: true },
      { key: "business-manage", label: "근로계약서 작성", icon: PencilLine, color: "violet", subTab: "document-writer:contract", managerOnly: true },
      { key: "business-manage", label: "각종양식",       icon: FileText,   color: "violet", subTab: "hr-forms",                  managerOnly: true },
      { key: "requests",        label: "요청목록",       icon: Chat,       color: "violet", managerOnly: true },
    ],
  },
  {
    id: "pharmacist",
    label: "약사",
    color: "sky",
    icon: FirstAid,
    topTab: { key: "pharmacist" },
    pharmacistOnly: true,
    items: [{ key: "pharmacist", label: "약사", icon: FirstAid, color: "sky", pharmacistOnly: true }],
  },
  {
    id: "board",
    label: "이슈",
    color: "emerald",
    icon: ChatCircle,
    topTab: { key: "board" },
    items: [{ key: "board", label: "이슈", icon: ChatCircle, color: "emerald" }],
  },
  // 2026-08-12 · 거래처 그룹 · PC 관리자 편의 · 모바일 숨김
  //   · 랜딩페이지의 [거래처용] 섹션과 동일 · 사이드바에서 바로 접근
  //   · 공급사 정보 · 재고확인 은 모달 기반 → landing 라우팅 + localStorage signal 로 자동 open
  //     (LandingPage 가 mount 시 "landing.action" 읽어서 해당 모달 열고 삭제)
  {
    id: "vendor",
    label: "거래처",
    color: "emerald",
    icon: Buildings,
    hideOnMobile: true,
    topTab: { hideInTopTabs: true }, // 헤더는 유지 · 사이드바 전용
    items: [
      { key: "reservation", label: "방문예약",       icon: CalendarDots, color: "emerald" },
      // 2026-08-12 · 공급사 정보 · 공통 모듈 (매장>공급사 · VendorListEditor + VendorDetailModal) 연결
      { key: "display",     label: "공급사 정보",     icon: Buildings,    color: "emerald", subTab: "vendor-manage", managerOnly: true },
      { key: "landing",     label: "공급사 재고확인", icon: Package,      color: "emerald", subTab: "vendor-stock" },
    ],
  },
  {
    id: "settings",
    label: "설정",
    color: "slate",
    icon: Gear, // 헤더용 · 기존 TABS 아이콘 유지 (items[0]=Lock 직원권한 과 다름 · 회귀 방지)
    topTab: { key: "permissions" },
    managerOnly: true,
    items: [
      { key: "permissions", label: "메뉴 설정", icon: Lock, color: "slate", minLevel: 9 },
      // 2026-08-12 · 구역 라벨 · 사이드바 항목 일단 제거 (사용자 지시 · 페이지/라우팅은 유지)
      // 2026-08-12 · 회사정보 + 앱브랜딩 통합 페이지 (약국명·대표·사업자·주소·전화·브랜드·연락처·도장·모바일)
      { key: "company-info", label: "회사·브랜드", icon: Buildings, color: "slate", minLevel: 9 },
      // 2026-08-12 · 계절 정의 (MyPage 에서 이동)
      { key: "season-settings", label: "계절 정의", icon: Calendar, color: "slate", minLevel: 9 },
      // 2026-08-12 · 시스템 설정 (env 편집)
      { key: "system-settings", label: "시스템 설정", icon: Gear, color: "slate", minLevel: 9 },
    ],
  },
  {
    id: "account",
    label: "계정",
    color: "slate",
    icon: UserCircle,
    topTab: { hideInTopTabs: true }, // 헤더 노출 안 함 · 사이드바 전용
    items: [{ key: "mypage", label: "마이페이지", icon: UserCircle, color: "slate" }],
  },
];

/** 공통헤더 TABS 파생용 · SIDE_NAV_GROUPS 로부터 자동 파생 (AppNavHeader.tsx 에서 소비)
 *  · 회귀 방지 · 순서·라벨·아이콘·색상 모두 group 정의 그대로
 *  · icon 우선순위 · group.icon > group.items[0].icon
 *  · key 는 topTab.key ?? items[0].key (business 특수 키 포함 · 헤더 내부에서 처리)
 */
export interface DerivedTopTab {
  key: string;                 // AppNavPage or "business"
  label: string;               // group.label
  mobileLabel: string;         // topTab.mobileLabel ?? group.label
  color: SideNavColor;         // group.color (TabDef.color 로 cast 안전 · SideNavColor ⊂ TabDef.color)
  managerOnly: boolean;
  pharmacistOnly?: boolean;
  icon: Icon;                  // group.icon ?? group.items[0].icon
}

export const DERIVED_TOP_TABS: DerivedTopTab[] = SIDE_NAV_GROUPS
  .filter(g => !g.topTab?.hideInTopTabs)
  .map(g => ({
    key: g.topTab?.key ?? g.items[0]?.key ?? g.id,
    label: g.label,
    mobileLabel: g.topTab?.mobileLabel ?? g.label,
    color: g.color,
    managerOnly: g.managerOnly ?? false,
    pharmacistOnly: g.pharmacistOnly,
    icon: g.icon ?? g.items[0]?.icon ?? House,
  }));

/** 서브탭 클릭 시 · 각 페이지 컴포넌트가 마운트 시 읽을 localStorage key */
export function subTabStorageKey(pageKey: AppNavPage): string {
  return `sidebar.subtab.${pageKey}`;
}

/** authSession → 숫자 레벨 파생 (0-9) · session.level 우선, 없으면 role 로 fallback */
export function deriveUserLevel(session: AuthSession | null): number {
  if (!session) return 0;
  return (
    session.level ??
    (session.role === "superadmin" || session.role === "admin" ? 9
      : session.role === "manager" ? 2
        : session.role === "employee" ? 1 : 0)
  );
}

/** authSession 기반 접근 판정 · AppNavHeader.tsx 의 필터 로직 재사용 (약사 판정 · level ≥ 3)
 *  2026-08-16 · perms 파라미터 추가 · PagePermission.hidden 체크 (lv 9 은 예외 · 설정 접근용) */
export function canAccessItem(
  item: SideNavItem,
  session: AuthSession | null,
  perms?: import("../../types").PagePermissions | null,
): boolean {
  if (item.key === "landing") return true;
  if (!session) return false;
  const level = deriveUserLevel(session);
  const isPharmacist = level >= 3;
  const isVendor = session.role === "vendor";
  const isPrivileged = level >= 2;

  if (isVendor && (item.key as AppNavPage) !== "landing") return false;
  if (item.minLevel != null && level < item.minLevel) return false;
  if (item.managerOnly && !isPrivileged) return false;
  if (item.pharmacistOnly && !isPharmacist) return false;
  // 2026-08-16 · 페이지 숨김 · lv 9 은 예외 (설정 페이지 접근 유지)
  if (perms && level < 9) {
    const perm = (perms as any)[item.key];
    if (perm?.hidden === true) return false;
  }
  return true;
}

/** 그룹 안에서 접근 가능 항목만 필터 · 빈 그룹은 제외
 *  2026-08-16 · perms 옵션 · 숨김 페이지 반영 */
export function filterGroupsForSession(
  session: AuthSession | null,
  perms?: import("../../types").PagePermissions | null,
): SideNavGroup[] {
  return SIDE_NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(it => canAccessItem(it, session, perms)) }))
    .filter(g => g.items.length > 0);
}

/** 아이템 활성 판정 · 현재 페이지가 이 아이템이거나 · business-manage 서브페이지면 business-manage 활성 */
const BUSINESS_SUB_PAGES: Set<AppNavPage> = new Set(["business-manage", "permissions", "hr-forms"]);
export function isItemActive(item: SideNavItem, currentPage: AppNavPage): boolean {
  if (item.subTab) return false; // 서브탭 항목은 · 페이지가 같아도 · 정확한 서브탭 판정 어려워 · 활성 스킵 (Phase 3에서 완성)
  if (item.key === currentPage) return true;
  if (item.key === "business-manage" && BUSINESS_SUB_PAGES.has(currentPage)) return true;
  return false;
}

/** 컬러 → tailwind 클래스 (활성 톤 · 비활성 hover 톤 · phosphor 톤에 맞춤) */
export const COLOR_TONES: Record<SideNavColor, {
  activeBar: string;
  activeBg: string;
  activeText: string;
  iconActive: string;
  hoverBg: string;
  glowShadow: string;
}> = {
  slate:   { activeBar: "bg-zinc-500",   activeBg: "bg-zinc-100",   activeText: "text-zinc-800",  iconActive: "text-zinc-600",   hoverBg: "hover:bg-white/70",   glowShadow: "shadow-zinc-200/40" },
  amber:   { activeBar: "bg-amber-500",   activeBg: "bg-amber-100",   activeText: "text-amber-900",  iconActive: "text-amber-700",   hoverBg: "hover:bg-white/70",   glowShadow: "shadow-amber-200/40" },
  red:     { activeBar: "bg-red-500",     activeBg: "bg-red-100",     activeText: "text-red-800",    iconActive: "text-red-700",     hoverBg: "hover:bg-white/70",   glowShadow: "shadow-red-200/40" },
  sky:     { activeBar: "bg-sky-500",     activeBg: "bg-sky-100",     activeText: "text-sky-800",    iconActive: "text-sky-700",     hoverBg: "hover:bg-white/70",   glowShadow: "shadow-sky-200/40" },
  indigo:  { activeBar: "bg-indigo-500",  activeBg: "bg-indigo-100",  activeText: "text-indigo-800", iconActive: "text-indigo-700",  hoverBg: "hover:bg-white/70",   glowShadow: "shadow-indigo-200/40" },
  emerald: { activeBar: "bg-emerald-500", activeBg: "bg-emerald-100", activeText: "text-emerald-800",iconActive: "text-emerald-700", hoverBg: "hover:bg-white/70",   glowShadow: "shadow-emerald-200/40" },
  violet:  { activeBar: "bg-violet-500",  activeBg: "bg-violet-100",  activeText: "text-violet-800", iconActive: "text-violet-700",  hoverBg: "hover:bg-white/70",   glowShadow: "shadow-violet-200/40" },
  cyan:    { activeBar: "bg-cyan-500",    activeBg: "bg-cyan-100",    activeText: "text-cyan-800",   iconActive: "text-cyan-700",    hoverBg: "hover:bg-white/70",   glowShadow: "shadow-cyan-200/40" },
};
