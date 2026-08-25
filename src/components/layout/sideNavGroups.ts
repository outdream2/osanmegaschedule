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
  Briefcase, Chat, Lock,
  UserCircle, UsersThree, CheckSquare, PencilLine,
  Palette, Gear,
  // 2026-08-25 · 반품 메뉴 신규 (사용자 지시)
  ArrowsLeftRight as ArrowLeftRight,
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
      { key: "display", label: "판매", icon: ChartBar, color: "red", subTab: "statistics", minLevel: 9 },
      // 2026-08-25 · 사용자 지시 · 반품 메뉴 신규 · 반품필요 페이지 이동
      { key: "display", label: "반품", icon: ArrowLeftRight, color: "red", subTab: "return", minLevel: 9 },
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
      // 2026-08-23 · #181 · "매장 구역" 설정 페이지 제거 · StoreZoneMap 인라인 편집만 유지
      // 2026-08-12 · 회사정보 + 앱브랜딩 통합 페이지 (약국명·대표·사업자·주소·전화·브랜드·연락처·도장·모바일)
      { key: "company-info", label: "회사·브랜드", icon: Buildings, color: "slate", minLevel: 9 },
      // 2026-08-12 · 계절 정의 (MyPage 에서 이동)
      // 2026-08-23 · #193 · "계절 정의" → "통계 설정" (계절 + 적정재고 통합)
      { key: "season-settings", label: "통계 설정", icon: Calendar, color: "slate", minLevel: 9 },
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
 *  2026-08-16 · perms 파라미터 추가 · PagePermission.hidden 체크 (lv 9 은 예외 · 설정 접근용)
 *  2026-08-20 · #175 · employmentStatus 파라미터 추가 · document-writer 서브탭 gate
 *      · pending_resignation 또는 admin(level≥9) 만 사직서 작성 항목 노출
 *      · retired · active · admin 아니면 · 사이드바에서 숨김 */
export function canAccessItem(
  item: SideNavItem,
  session: AuthSession | null,
  perms?: import("../../types").PagePermissions | null,
  employmentStatus?: import("../../lib/employmentStatus").EmploymentStatus | null,
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

  // 2026-08-20 · #175 · 사직서 작성 (document-writer) · 퇴사예정 또는 admin 만 노출
  //   · employmentStatus 미제공 시 (로딩 중 · 훅 미사용) · 안전측 · admin 만 노출
  //   · admin (lv 9) 은 항상 노출 (사직서 관리자 대리 작성용)
  if (item.subTab === "document-writer" && item.key === "approval-request") {
    if (level >= 9) {
      // admin · 항상 허용
    } else if (employmentStatus === "pending_resignation") {
      // 퇴사예정 · 허용
    } else {
      return false;
    }
  }
  // 2026-08-17 · #131 · 페이지 숨김 · admin(lv9) 도 hidden 적용
  //   · 이전 버그: admin 은 hidden 무시 → uncheck 해도 사이드바에서 안 사라짐 → 사용자 리포트
  //   · fix: admin 도 hidden 적용 · 단 · admin 잠금 방지 (permissions/business-manage/account 는 admin 예외)
  //   · subTab 있으면 복합키 (`{key}:{subTab}`) 우선 · 없으면 부모 pageKey
  if (perms) {
    const compositeKey = item.subTab ? `${item.key}:${item.subTab}` : null;
    const perm = (compositeKey && (perms as any)[compositeKey]) || (perms as any)[item.key];
    if (perm?.hidden === true) {
      const ADMIN_ESSENTIAL = ["permissions", "business-manage", "account"] as const;
      const isEssential = (ADMIN_ESSENTIAL as readonly string[]).includes(item.key);
      if (level >= 9 && isEssential) {
        // admin lockout 방지 · 설정·관리·계정 페이지는 admin 에게 항상 노출
      } else {
        return false;
      }
    }
  }
  return true;
}

/** 그룹 안에서 접근 가능 항목만 필터 · 빈 그룹은 제외
 *  2026-08-16 · perms 옵션 · 숨김 페이지 반영
 *  2026-08-20 · #175 · employmentStatus 옵션 · 사직서 작성 항목 gate */
export function filterGroupsForSession(
  session: AuthSession | null,
  perms?: import("../../types").PagePermissions | null,
  employmentStatus?: import("../../lib/employmentStatus").EmploymentStatus | null,
): SideNavGroup[] {
  return SIDE_NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(it => canAccessItem(it, session, perms, employmentStatus)) }))
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
  indigo:  { activeBar: "bg-brand-deep",  activeBg: "bg-indigo-100",  activeText: "text-indigo-800", iconActive: "text-indigo-700",  hoverBg: "hover:bg-white/70",   glowShadow: "shadow-indigo-200/40" },
  emerald: { activeBar: "bg-emerald-500", activeBg: "bg-emerald-100", activeText: "text-emerald-800",iconActive: "text-emerald-700", hoverBg: "hover:bg-white/70",   glowShadow: "shadow-emerald-200/40" },
  violet:  { activeBar: "bg-violet-500",  activeBg: "bg-violet-100",  activeText: "text-violet-800", iconActive: "text-violet-700",  hoverBg: "hover:bg-white/70",   glowShadow: "shadow-violet-200/40" },
  cyan:    { activeBar: "bg-cyan-500",    activeBg: "bg-cyan-100",    activeText: "text-cyan-800",   iconActive: "text-cyan-700",    hoverBg: "hover:bg-white/70",   glowShadow: "shadow-cyan-200/40" },
};

/**
 * 2026-08-17 · 사이드바 deep teal 배경 (#0A4F44) 전용 다크 톤
 *   · 사용자 지시 · "왼쪽사이드바 글씨 하나도 안보여 목업참고해서 UI개선"
 *   · 목업 (docs/UI_MOCKUP_PC_2026-08-17.html · .nav-item)
 *     · text: #CFE6DF  · active bg: rgba(255,255,255,0.12)  · active text: #FFFFFF
 *     · active icon: #6FE3C2 (mint) · hover bg: rgba(255,255,255,0.06)
 *   · 그룹 색상은 · 활성 아이콘의 밝은 shade (300) 로 표현 · 텍스트/배경은 통일
 */
export const DARK_COLOR_TONES: Record<SideNavColor, {
  activeBg: string;
  activeText: string;
  iconActive: string;
  hoverBg: string;
  glowShadow: string;
}> = {
  slate:   { activeBg: "bg-white/[0.12]", activeText: "text-white", iconActive: "text-zinc-100",    hoverBg: "hover:bg-white/[0.06]", glowShadow: "shadow-black/10" },
  amber:   { activeBg: "bg-white/[0.12]", activeText: "text-white", iconActive: "text-amber-300",   hoverBg: "hover:bg-white/[0.06]", glowShadow: "shadow-black/10" },
  red:     { activeBg: "bg-white/[0.12]", activeText: "text-white", iconActive: "text-red-300",     hoverBg: "hover:bg-white/[0.06]", glowShadow: "shadow-black/10" },
  sky:     { activeBg: "bg-white/[0.12]", activeText: "text-white", iconActive: "text-sky-300",     hoverBg: "hover:bg-white/[0.06]", glowShadow: "shadow-black/10" },
  indigo:  { activeBg: "bg-white/[0.12]", activeText: "text-white", iconActive: "text-indigo-300",  hoverBg: "hover:bg-white/[0.06]", glowShadow: "shadow-black/10" },
  emerald: { activeBg: "bg-white/[0.12]", activeText: "text-white", iconActive: "text-emerald-300", hoverBg: "hover:bg-white/[0.06]", glowShadow: "shadow-black/10" },
  violet:  { activeBg: "bg-white/[0.12]", activeText: "text-white", iconActive: "text-violet-300",  hoverBg: "hover:bg-white/[0.06]", glowShadow: "shadow-black/10" },
  cyan:    { activeBg: "bg-white/[0.12]", activeText: "text-white", iconActive: "text-cyan-300",    hoverBg: "hover:bg-white/[0.06]", glowShadow: "shadow-black/10" },
};

/**
 * 2026-08-17 · 공통헤더 ↔ 사이드바 연동 · 단일 accent 소스
 *   · 그룹 톤별 · gradient bar · glow · iconAccent hex
 *   · AppNavHeader (활성 탭 하단 3px accent) + SideNav (활성 그룹/아이템 좌측 3px accent)
 *   · 둘 다 동일 hex 참조 → drift 방지
 *   · glow · box-shadow rgba (부드러운 색 액센트 · Linear/Cursor 톤)
 */
export interface NavAccent {
  /** primary color (밝은 shade 300~400) */
  hex: string;
  /** deeper shade (grad 하단 · 500~600) */
  hexDeep: string;
  /** icon color (활성 시 tailwind class) */
  iconText: string;
  /** gradient · linear-gradient(180deg, hex → hexDeep) */
  gradient: string;
  /** glow · box-shadow with color */
  glow: string;
}

export const NAV_ACCENT: Record<SideNavColor, NavAccent> = {
  slate:   { hex: "#FFFFFF", hexDeep: "#C4DAEE", iconText: "text-white",         gradient: "linear-gradient(180deg, #FFFFFF 0%, #C4DAEE 100%)", glow: "0 0 12px rgba(255,255,255,0.35)" },
  amber:   { hex: "#FFC876", hexDeep: "#FFA53A", iconText: "text-[#FFC876]",     gradient: "linear-gradient(180deg, #FFC876 0%, #FFA53A 100%)", glow: "0 0 12px rgba(255,168,60,0.55)" },
  red:     { hex: "#FFB4AE", hexDeep: "#FF8A80", iconText: "text-[#FFB4AE]",     gradient: "linear-gradient(180deg, #FFB4AE 0%, #FF8A80 100%)", glow: "0 0 12px rgba(255,138,128,0.50)" },
  sky:     { hex: "#7EB8E8", hexDeep: "#4A90D9", iconText: "text-[#7EB8E8]",     gradient: "linear-gradient(180deg, #7EB8E8 0%, #4A90D9 100%)", glow: "0 0 12px rgba(74,144,217,0.55)" },
  indigo:  { hex: "#A5B4FC", hexDeep: "#7C6BF5", iconText: "text-[#A5B4FC]",     gradient: "linear-gradient(180deg, #A5B4FC 0%, #7C6BF5 100%)", glow: "0 0 12px rgba(124,107,245,0.55)" },
  emerald: { hex: "#6FE3C2", hexDeep: "#34D39E", iconText: "text-[#6FE3C2]",     gradient: "linear-gradient(180deg, #6FE3C2 0%, #34D39E 100%)", glow: "0 0 12px rgba(52,211,158,0.50)" },
  violet:  { hex: "#C4B5FD", hexDeep: "#A78BFA", iconText: "text-[#C4B5FD]",     gradient: "linear-gradient(180deg, #C4B5FD 0%, #A78BFA 100%)", glow: "0 0 12px rgba(167,139,250,0.50)" },
  cyan:    { hex: "#7EE8E8", hexDeep: "#34D3D3", iconText: "text-[#7EE8E8]",     gradient: "linear-gradient(180deg, #7EE8E8 0%, #34D3D3 100%)", glow: "0 0 12px rgba(52,211,211,0.50)" },
};

/** 헤더 탭 활성 · 하단 accent bar 그라디언트 (좌우 fade) · AppNavHeader 전용 */
export function headerAccentGradient(color: SideNavColor): string {
  const c = NAV_ACCENT[color];
  return `linear-gradient(90deg, transparent, ${c.hex}, ${c.hexDeep}, ${c.hex}, transparent)`;
}
