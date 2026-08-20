// src/components/DisplayPage/DisplayPage.tsx
// 2026-08-17 · apiClient 마이그레이션
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
// 2026-08-17 · 프레임워크 · useZoneDefs 훅 사용 · 설정 편집 시 자동 반영
import { ZONES_STORAGE_KEY, ZONE_DEFS } from "../../constants/displayZones";
import { useZoneDefs } from "../../hooks/useZoneDefs";
import {
  type ZoneStatus, type DowMap, type DisplayZone,
  expandZoneDef, buildDefaultZones,
} from "../../utils/zoneUtils";
// 2026-07-29 · shared constants · CategoryTab MiniStoreZoneMap 과 동일 소스 (사용자 요청 통합)
import {
  STORE_TOP_WALL, STORE_AISLE_CENTER, STORE_AISLE_PAIRS, STORE_BOTTOM_WALL, STORE_VERTICAL_WING,
  CAT_A_COLORS, CAT_B_COLORS,
} from "../../constants/storeMapLayout";
import { getZoneLabel, getZoneSubLabel } from "../../constants/zoneLabels";
// 2026-08-03 · 사용자 요청 · 공용 매장 구역도 · SalesTrendPage 와 동일 · 모바일 fullscreen 모달에서 사용
import { StoreZoneMap } from "../common/StoreZoneMap";
import { AccentBar } from "../common/AccentBar";
import { getProductsMap, type ProductInfo } from "../../lib/productsCache";
import {
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Package,
  Save,
  Send,
  Sparkles,
  Store,
  User,
  X,
  XCircle,
  AlertTriangle,
  Loader2,
  MapPin,
  Search,
  Coffee,
  ScanLine,
  Pill,
  Layers,
  Info,
  BarChart2,
  Wallet,
  Building2,
} from "lucide-react";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import { BarcodeScanner } from "../BarcodeScanner";
import { ProductInfoCard } from "../ScanPage/ProductInfoCard";
import { ZoneCell } from "./ZoneCell";
import { ZoneAssignPopover } from "./ZoneAssignPopover";
import { ZoneGroupPanel, type ZoneGroup } from "./ZoneGroupPanel";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { useSidebarEnabled } from "../../hooks/useSidebar";
import { useIsMobile } from "../../hooks/use-mobile";
import { DisplayRequestPanel } from "./DisplayRequestPanel";
// DisplayRequestListPage · 2026-08-05 T-SCAN-1 · RequestsPage 로 통합 · 파일 삭제됨
// 2026-08-03 · StockManagePage 폐지 · 모든 탭이 OrderManagePage 서브탭으로 통합됨
// 2026-07-29 · 판매추이 탭 제거 (사용자 요청) · CategoryTab · LossTrackerTab 은 재고관리 안에서만 lazy import (SalesTrendPage 파일에 남아있음)
// 2026-07-28 · 재고·판매 통합 메뉴 제거 (사용자 요청) · 파일은 보관 · 사이드바/라우팅만 해제
import { StockArrivalPage } from "../StockArrivalPage/StockArrivalPage";
import { OcrPage } from "../OcrPage";
import OrderManagePage from "../OrderManagePage/OrderManagePage";
// 2026-08-09 · 사용자 요청 · 공급사관리 서브탭 (경영관리에서 이동)
const VendorListEditor = React.lazy(() => import("../LandingPage/VendorListEditor").then(m => ({ default: m.VendorListEditor })));
// 2026-08-10 · 사용자 요청 · 공급사관리 · split (PC 좌우) · 모바일 모달
const VendorDetailModalLazy = React.lazy(() => import("../LandingPage/VendorListEditor").then(m => ({ default: m.VendorDetailModal })));
import { SplitPanel } from "../common/SplitPanel";
import { useVendors as useVendorsHook } from "../../hooks/useVendors";
// 2026-08-03 (#183) · 공통 탭바 컴포넌트 · duplicate 스타일 흡수
import { TabBar, type TabDef as CommonTabDef } from "../common/TabBar";
// 2026-08-05 · 관리자(level>=8) long-press 드래그 재정렬 · localStorage 순서 저장
import { useSortableTabs } from "../../hooks/useSortableTabs";
import { useConfirm } from "../../hooks/useConfirm";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import { useContactInfo } from "../../hooks/useContactInfo";
// 2026-08-17 · #131 · 사용자 지시 · 페이지 안보이기 · 내부 subtab tab bar 도 필터
import { usePagePermissions } from "../../hooks/usePagePermissions";
// 2026-08-03 · StaffManagePage · 매장관리 서브탭에서 제거 · 경영관리 통합 페이지(BusinessManagePage)로 이동
import type { AuthSession } from "../../types";
import { api, ApiError } from "../../lib/apiClient";

// ── DisplayPage 서브탭 (level 2) 정의 · 상수 · 컴포넌트 외부 배치 (참조 안정성 · 훅 재등록 방지) ──
type DpSubTabKey = "purchase-order" | "purchase" | "payment" | "statistics" | "stock-arrivals" | "store" | "vendor-manage";
const DP_SUBTAB_DEFAULTS: CommonTabDef<DpSubTabKey>[] = [
  { key: "purchase-order", label: "발주",       icon: ClipboardList, color: "sky"    },
  { key: "purchase",       label: "매입",       icon: Package,       color: "amber"  },
  { key: "payment",        label: "결제",       icon: Wallet,        color: "teal"   },
  { key: "statistics",     label: "통계",       icon: BarChart2,     color: "indigo" },
  { key: "stock-arrivals", label: "입고알림",   icon: Bell,          color: "orange" },
  // "display-request" 서브탭 제거 · RequestsPage 진열요청 탭으로 통합 (2026-08-05)
  { key: "store",          label: "매장구역도", icon: Store,         color: "violet" },
  // 2026-08-09 · 사용자 요청 · 공급사관리 (경영관리에서 이동)
  { key: "vendor-manage",  label: "공급사관리", icon: Building2,     color: "rose"   },
];

interface DisplayPageProps {
  onBack: () => void;
  onOpenEmployeeEdit?: (employeeId: number) => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

// ─── Types ───────────────────────────────────────────────────────────────────
// ZoneStatus · DowMap · DisplayZone → src/utils/zoneUtils.ts 로 이동 (god-phase1)

// ─── DOW(요일) 마스크 유틸 ───────────────────────────────────────────
// 비트: 일(1) 월(2) 화(4) 수(8) 목(16) 금(32) 토(64) → 모든요일=127
export const DOW_ALL = 127;
export const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;
export const isDowActive = (mask: number | undefined | null, dow: number): boolean =>
  mask == null ? true : ((mask >> dow) & 1) === 1;

interface DisplayRequest {
  id: string;
  zoneId: string;
  zoneLabel: string;
  category: string;
  requestedAt: string;
  assignedStaffId: number | null;
  assignedStaffName: string;
  status: "pending" | "done";
  note: string;
}

interface ScheduleEntry { date: string; type: string; workingHours?: string; }
interface Employee { id: number; name: string; position: string; schedules?: ScheduleEntry[]; }
interface TodayStaff { employee: Employee; scheduleType: string; workingHours: string; }

// ─── Popover anchor ──────────────────────────────────────────────────────────
interface PopoverAnchor {
  zoneId: string;
  rect: DOMRect;
}

// expandZoneDef · buildDefaultZones → src/utils/zoneUtils.ts 로 이동 (god-phase1)

// ─── localStorage helpers ─────────────────────────────────────────────────────
const ZONES_KEY = ZONES_STORAGE_KEY;
const REQS_KEY = "megatown_display_requests";

const loadZones = (): DisplayZone[] => {
  try {
    const raw = localStorage.getItem(ZONES_KEY);
    if (!raw) { const d = buildDefaultZones(); localStorage.setItem(ZONES_KEY, JSON.stringify(d)); return d; }
    const parsed = JSON.parse(raw) as DisplayZone[];
    if (!Array.isArray(parsed) || parsed.length === 0) { const d = buildDefaultZones(); localStorage.setItem(ZONES_KEY, JSON.stringify(d)); return d; }
    // merge: expand A/B for aisles 1-8, preserve saved status/staff/products by id
    return ZONE_DEFS.flatMap((def) => {
      const expanded = expandZoneDef(def);
      return expanded.map(base => {
        // 하위 호환: 옛 id (예: "1")로 저장된 값은 A로 매핑, B는 새로 시작
        const saved = parsed.find((z) => z.id === base.id)
          ?? (base.id.endsWith("A") ? parsed.find((z) => z.id === String(def.num)) : null);
        return {
          ...base,
          assignedStaffId: saved?.assignedStaffId ?? null,
          assignedStaffName: saved?.assignedStaffName ?? "",
          status: saved?.status ?? "normal",
          products: saved?.products ?? "",
          dowMap: (saved as any)?.dowMap ?? null,
        };
      });
    });
  } catch { return buildDefaultZones(); }
};
const saveZones = (z: DisplayZone[]) => { try { localStorage.setItem(ZONES_KEY, JSON.stringify(z)); } catch { } };

const loadRequests = (): DisplayRequest[] => {
  try { const r = localStorage.getItem(REQS_KEY); return r ? (JSON.parse(r) as DisplayRequest[]) : []; }
  catch { return []; }
};
const saveRequests = (r: DisplayRequest[]) => { try { localStorage.setItem(REQS_KEY, JSON.stringify(r)); } catch { } };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<ZoneStatus, string> = { normal: "정상", low: "부족", empty: "품절" };

const statusCell = (s: ZoneStatus, extra = ""): string => {
  const m = {
    normal: "bg-emerald-50 border-emerald-300 hover:border-emerald-400 text-emerald-900",
    low: "bg-amber-50 border-amber-300 hover:border-amber-400 text-amber-900",
    empty: "bg-red-50 border-red-300 hover:border-red-400 text-red-900"
  };
  return `${m[s]} ${extra}`;
};
const statusDot = (s: ZoneStatus) => ({ normal: "bg-emerald-500", low: "bg-amber-500", empty: "bg-red-500" }[s]);
const statusBadge = (s: ZoneStatus) => ({ normal: "bg-emerald-100 text-emerald-700 border-emerald-300", low: "bg-amber-100 text-amber-700 border-amber-300", empty: "bg-red-100 text-red-700 border-red-300" }[s]);

const SHIFT_BADGE: Record<string, string> = {
  "오픈": "bg-emerald-100 text-emerald-800 border-emerald-300",
  "미들": "bg-blue-100 text-blue-800 border-blue-300",
  "마감": "bg-rose-100 text-rose-800 border-rose-300",
  "오전반차": "bg-lime-100 text-lime-800 border-lime-300",
  "오후반차": "bg-amber-100 text-amber-800 border-amber-300",
};

const SKIP_TYPES = new Set(["휴무", "월차", "지정휴무"]);

const formatRel = (iso: string) => {
  const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
};

// ─── Staff color palette (for assigned zone chip coloring) ────────────────────
const STAFF_COLORS = [
  "bg-violet-100 text-violet-800 border-violet-300",
  "bg-sky-100 text-sky-800 border-sky-300",
  "bg-rose-100 text-rose-800 border-rose-300",
  "bg-teal-100 text-teal-800 border-teal-300",
  "bg-orange-100 text-orange-800 border-orange-300",
  "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300",
];

const STAFF_AVATAR_COLORS = [
  "bg-violet-600 text-white",
  "bg-sky-600 text-white",
  "bg-rose-600 text-white",
  "bg-teal-600 text-white",
  "bg-orange-600 text-white",
  "bg-fuchsia-600 text-white",
];

// ─── API helpers ──────────────────────────────────────────────────────────────
const fetchZonesFromDB = async (): Promise<DisplayZone[] | null> => {
  try {
    const { data: rows } = await api.get<Array<{ zone_id: string; employee_id: number | null; employee_name: string; status: string; products: string; dow_map?: DowMap }>>("/api/zones");
    if (!Array.isArray(rows) || rows.length === 0) return null;
    // A/B 확장 + 하위 호환: 옛 zone_id ("1") → 1A로 매핑
    return ZONE_DEFS.flatMap((def) => {
      const expanded = expandZoneDef(def);
      return expanded.map(base => {
        const row = rows.find((r) => r.zone_id === base.id)
          ?? (base.id.endsWith("A") ? rows.find((r) => r.zone_id === String(def.num)) : null);
        return {
          ...base,
          assignedStaffId: row?.employee_id ?? null,
          assignedStaffName: row?.employee_name ?? "",
          status: (row?.status as ZoneStatus) ?? "normal",
          products: row?.products ?? "",
          dowMap: (row?.dow_map ?? null) as DowMap,
        };
      });
    });
  } catch { return null; }
};

const saveZonesToDB = async (zones: DisplayZone[]): Promise<{ ok: boolean; error?: string }> => {
  try {
    await api.post("/api/zones", {
      zones: zones.map((z) => ({
        zone_id: z.id,
        employee_id: z.assignedStaffId,
        employee_name: z.assignedStaffName,
        status: z.status,
        products: z.products,
        dow_map: z.dowMap ?? null,
      })),
    });
    return { ok: true };
  } catch (err: any) {
    const msg = err instanceof ApiError ? err.message : (err?.message ?? String(err));
    console.error("[saveZonesToDB] exception:", msg);
    return { ok: false, error: msg };
  }
};

const fetchRequestsFromDB = async (): Promise<DisplayRequest[] | null> => {
  try {
    const { data: rows } = await api.get<any[]>("/api/display-requests");
    return rows.map((r) => ({
      id: String(r.id),
      zoneId: r.zone_id ?? "",
      zoneLabel: r.zone_label ?? "",
      category: r.category ?? "",
      requestedAt: r.requested_at ?? new Date().toISOString(),
      assignedStaffId: r.assigned_staff_id ?? null,
      assignedStaffName: r.assigned_staff_name ?? "",
      status: (r.status ?? "pending") as "pending" | "done",
      note: r.note ?? "",
    }));
  } catch { return null; }
};

// Zones that allow multiple staff assignments (comma-separated names)
const MULTI_ASSIGN_ZONE_NUMS = new Set([36, 42]);

// ─── Main component ────────────────────────────────────────────────────────────
export const DisplayPage: React.FC<DisplayPageProps> = ({ onBack, onOpenEmployeeEdit, authSession, onNavigate, onLogout }) => {
  const confirm = useConfirm();
  // 2026-08-12 · 프레임워크 · brand·contact 반영 · 값 없으면 하드코딩 fallback 유지
  const { brand: dpBrand } = useBrandIdentity();
  const { contact: dpContact } = useContactInfo();
  // 서브탭: 재고관리(기본 · level 9 전용) · 매장관리(그 외 기본)
  const dpUserLevel = authSession?.level ??
    (authSession?.role === "superadmin" || authSession?.role === "admin" ? 9 :
      authSession?.role === "manager" ? 2 : authSession?.role === "employee" ? 1 : 0);
  const dpCanSeeStockManage = dpUserLevel >= 9;
  const dpCanSeeStockArrivals = dpUserLevel >= 3;

  // 2026-08-17 · 프레임워크 · 공통 zone defs 훅 (설정 편집 시 자동 반영)
  const { zones: ZONE_DEFS } = useZoneDefs();

  // 2026-08-17 · #131 · 사용자 지시 · admin 도 hidden 적용 (subtab 은 essential 아님)
  //   · 사이드바 hidden 처리한 서브탭 · 페이지 내부 tab bar 에서도 숨김 (admin 뷰 포함)
  const { perms: dpPerms } = usePagePermissions();
  const dpHiddenSubs = React.useMemo(() => {
    const set = new Set<DpSubTabKey>();
    const subs: DpSubTabKey[] = ["purchase-order", "purchase", "payment", "statistics", "stock-arrivals", "store", "vendor-manage"];
    for (const s of subs) {
      const perm = (dpPerms as any)[`display:${s}`];
      if (perm?.hidden === true) set.add(s);
    }
    return set;
  }, [dpPerms]);
  // 2026-08-11 · 사이드바 V2 · PC 는 사이드바가 서브탭 · TabBar 숨김 (모바일 유지)
  const isDpMobile = useIsMobile();
  const SIDEBAR_ENABLED = useSidebarEnabled(); // 2026-08-16 · 로컬 상수 유지 · body 로직 변경 최소
  const [dpSubTab, setDpSubTab] = useState<DpSubTabKey>(
    dpCanSeeStockManage ? "purchase-order" : "store"
  );

  // 2026-08-17 · #131 · 사용자 지시 · 현재 subtab 이 hidden 이면 · 자동으로 첫번째 visible 로 이동
  useEffect(() => {
    if (dpHiddenSubs.has(dpSubTab)) {
      const priority: DpSubTabKey[] = ["purchase-order", "purchase", "payment", "statistics", "store", "stock-arrivals", "vendor-manage"];
      const next = priority.find(k => !dpHiddenSubs.has(k));
      if (next) setDpSubTab(next);
    }
  }, [dpSubTab, dpHiddenSubs]);
  // 2026-08-10 · 매장구역도 · 기본 접기 (사용자 요청)
  const [mapCollapsed, setMapCollapsed] = useState(true);
  // 2026-08-09 · sessionStorage("dpInitialSubTab") 있으면 · 그 서브탭으로 진입 (LandingPage 공급사등록 카드용)
  //           · 2026-08-11 · localStorage("sidebar.subtab.display") 도 확인 (사이드바 V2 서브탭 이동)
  useEffect(() => {
    try {
      const req = sessionStorage.getItem("dpInitialSubTab") as DpSubTabKey | null;
      if (req) {
        sessionStorage.removeItem("dpInitialSubTab");
        if (DP_SUBTAB_DEFAULTS.some(t => t.key === req)) { setDpSubTab(req); return; }
      }
      const sbReq = localStorage.getItem("sidebar.subtab.display") as DpSubTabKey | null;
      if (sbReq) {
        localStorage.removeItem("sidebar.subtab.display");
        if (DP_SUBTAB_DEFAULTS.some(t => t.key === sbReq)) setDpSubTab(sbReq);
      }
    } catch { /* silent */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 2026-08-11 · 사이드바 V2 · 같은 페이지에서 다른 서브탭 클릭 시 · CustomEvent 리스닝
  useEffect(() => {
    const onSubTab = (e: Event) => {
      const detail = (e as CustomEvent<{ page: string; subTab: string }>).detail;
      if (detail?.page !== "display") return;
      const sub = detail.subTab as DpSubTabKey;
      if (DP_SUBTAB_DEFAULTS.some(t => t.key === sub)) setDpSubTab(sub);
    };
    window.addEventListener("sidebar:subtab", onSubTab);
    return () => window.removeEventListener("sidebar:subtab", onSubTab);
  }, []);
  // 2026-08-05 · 관리자(level>=8) long-press 드래그 재정렬
  const dpTabSortable = useSortableTabs<CommonTabDef<DpSubTabKey>>(
    "tabOrder.displayPage",
    DP_SUBTAB_DEFAULTS,
    dpUserLevel >= 8,
  );
  const [zones, setZones] = useState<DisplayZone[]>(() => loadZones());
  const [zonesLoaded, setZonesLoaded] = useState(false);
  const [requests, setRequests] = useState<DisplayRequest[]>(() => loadRequests());

  // 2026-07-31 · zone-labels-changed 이벤트 수신 → 강제 리렌더 (getZoneLabel 이 mutable 모듈 변수 참조)
  const [, setZoneLabelVersion] = useState(0);
  useEffect(() => {
    const handler = () => setZoneLabelVersion(v => v + 1);
    window.addEventListener("zone-labels-changed", handler);
    return () => window.removeEventListener("zone-labels-changed", handler);
  }, []);

  // Employees & today's staff
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [todayStaff, setTodayStaff] = useState<TodayStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);

  // Search query
  const [searchQuery, setSearchQuery] = useState("");

  // Zone assignment popover
  const [popoverAnchor, setPopoverAnchor] = useState<PopoverAnchor | null>(null);

  // Drag-and-drop assignment
  const [dragStaff, setDragStaff] = useState<TodayStaff | null>(null);
  const dragStaffRef = useRef<TodayStaff | null>(null);
  const [dragOverZoneId, setDragOverZoneId] = useState<string | null>(null);

  // Employee info modal
  const [activeStaffInfo, setActiveStaffInfo] = useState<TodayStaff | null>(null);

  // Zone detail modal
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [draftCategory, setDraftCategory] = useState("");
  const [draftProducts, setDraftProducts] = useState("");
  const [draftStaffId, setDraftStaffId] = useState<number | null>(null);
  const [draftStatus, setDraftStatus] = useState<ZoneStatus>("normal");
  const [requestNote, setRequestNote] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [requestFlash, setRequestFlash] = useState(false);

  // Barcode scanner
  type ScannerMode = "search" | "products" | null;
  const [scannerMode, setScannerMode] = useState<ScannerMode>(null);

  // Product DB search (약찾기)
  const [productsMap, setProductsMap] = useState<Record<string, ProductInfo>>({});
  const [productMatchZoneId, setProductMatchZoneId] = useState<string | null>(null);
  const [productInfoModal, setProductInfoModal] = useState<ProductInfo | null>(null);
  // 구역별 상품 리스트 모달 (구역 클릭 → 해당 구역 상품 조회)
  const [zoneProductsModal, setZoneProductsModal] = useState<{ zoneId: string; zoneNum: number; zoneLabel: string; category: string } | null>(null);
  // 모바일 전용 · 전체 매장 구역도 fullscreen 모달 (읽기 전용 · 드래그 스크롤)
  const [fullMapOpen, setFullMapOpen] = useState(false);
  const [zoneProductsFilter, setZoneProductsFilter] = useState<"all" | "mismatch">("all");
  const [zoneProductsSort, setZoneProductsSort] = useState<{ key: "name" | "spec" | "real_map" | "current_stock" | "warehouse_stock" | "store_stock" | "real_total" | "loss" | "optimal_stock" | "status" | "mismatch"; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [zoneProductsSearch, setZoneProductsSearch] = useState("");

  // Requests panel
  const [reqFilter, setReqFilter] = useState<"all" | "pending" | "done">("all");

  // Today staff position filter
  const [staffPosFilter, setStaffPosFilter] = useState<string>("전체");

  // Staff panel collapse
  const [staffPanelOpen, setStaffPanelOpen] = useState(true);

  // Zone groups
  const [zoneGroups, setZoneGroups] = useState<ZoneGroup[]>([]);
  const [zoneGroupsLoaded, setZoneGroupsLoaded] = useState(false);
  const [zoneConfigOpen, setZoneConfigOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  // Push notification subscription state
  const [subscribingId, setSubscribingId] = useState<number | null>(null);
  const [subscribedIds, setSubscribedIds] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("megatown_push_subscribed") ?? "[]")); }
    catch { return new Set(); }
  });

  // Selected date for schedule view (default: today)
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const selectedYM = selectedDate.slice(0, 7);

  const navigateDate = (delta: number) => {
    setSelectedDate(prev => {
      const d = new Date(prev + "T00:00:00");
      d.setDate(d.getDate() + delta);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
  };

  const handleSubscribePush = async (employeeId: number, employeeName: string) => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("이 브라우저는 푸시 알림을 지원하지 않습니다.");
      return;
    }
    setSubscribingId(employeeId);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        alert("알림 권한이 필요합니다. 브라우저 설정에서 허용해 주세요.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
      });
      await api.post("/api/push-subscribe", { employeeId, subscription: sub.toJSON() });
      const next = new Set(subscribedIds).add(employeeId);
      setSubscribedIds(next);
      localStorage.setItem("megatown_push_subscribed", JSON.stringify([...next]));
      setQuickReqToast(`${employeeName}님 알림이 이 기기에 등록되었습니다 🔔`);
      setTimeout(() => setQuickReqToast(null), 3500);
    } catch (err) {
      console.error(err);
      alert("알림 등록 중 오류가 발생했습니다.");
    } finally {
      setSubscribingId(null);
    }
  };

  // Save-all toast
  const [saveAllToast, setSaveAllToast] = useState(false);
  // 임의배치 미리보기 상태 (확정 전 rollback 가능)
  const [pendingAutoAssign, setPendingAutoAssign] = useState<null | {
    prevZones: DisplayZone[];
    assignedList: Array<{ zoneId: string; name: string; id: number }>;
  }>(null);

  // Quick request toast
  const [quickReqToast, setQuickReqToast] = useState<string | null>(null);

  const handleQuickRequest = useCallback((zone: DisplayZone) => {
    if (!zone.assignedStaffId) return;
    const req: DisplayRequest = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      zoneId: zone.id,
      zoneLabel: `${zone.num}번 ${zone.label}`,
      category: zone.category,
      requestedAt: new Date().toISOString(),
      assignedStaffId: zone.assignedStaffId,
      assignedStaffName: zone.assignedStaffName,
      status: "pending",
      note: "빠른 요청",
    };
    setRequests((prev) => [req, ...prev]);
    setQuickReqToast(`${zone.assignedStaffName}님께 ${zone.num}번 ${zone.label} 보충 요청 전송됨`);
    setTimeout(() => setQuickReqToast(null), 3500);
    // Save to DB
    fetch("/api/display-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        zone_id: zone.id,
        zone_label: `${zone.num}번 ${zone.label}`,
        category: zone.category,
        requested_at: new Date().toISOString(),
        assigned_staff_id: zone.assignedStaffId,
        assigned_staff_name: zone.assignedStaffName,
        note: "빠른 요청",
      }),
    }).catch(() => { });
    // Fire-and-forget push notification
    fetch("/api/push-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: zone.assignedStaffId,
        title: "📦 진열 보충 요청",
        body: `${zone.num}번 ${zone.label} (${zone.category}) 보충이 필요합니다.`,
        url: "/",
      }),
    }).catch(() => { });
  }, []);

  // 전체월에 적용: 현재 배정 상태를 선택된 월 전체(1일~말일) 모든 날짜에 적용
  // 요일 적용: 선택된 날짜의 요일(예: 화요일)에 현재 배정을 적용 · DB 저장
  const handleApplyToWeekday = useCallback(async () => {
    const d = new Date(selectedDate + "T00:00:00");
    const dow = d.getDay(); // 0=일 ~ 6=토
    const dowLabel = dayNames[dow];
    const proceed = await confirm({
      message:
        `현재 배정 상태를 매주 ${dowLabel}에 적용할까요?\n\n` +
        `• 각 담당자의 dowMap에 ${dowLabel} 활성 비트 추가\n` +
        `• zone_assignments 테이블에 DB 저장 (${zones.length}개 구역)\n` +
        `※ 다른 요일 설정은 그대로 유지됩니다.`,
    });
    if (!proceed) return;

    const dowBit = 1 << dow;
    // 각 zone의 담당자 dowMap에 오늘 요일 비트 OR 처리 (기존 요일 유지 + 추가)
    const nextZones = zones.map((z) => {
      if (!z.assignedStaffName) return z;
      const names = z.assignedStaffName.split(",").map(s => s.trim()).filter(Boolean);
      const nextDow: DowMap = { ...(z.dowMap ?? {}) };
      for (const n of names) {
        const current = nextDow[n] ?? DOW_ALL;
        nextDow[n] = current | dowBit;
      }
      return { ...z, dowMap: nextDow };
    });

    setZones(nextZones);
    saveZones(nextZones);
    saveRequests(requests);
    // DB 저장 — 에러 시 즉시 알림
    try {
      await api.post("/api/zones", {
        zones: nextZones.map((z) => ({
          zone_id: z.id,
          employee_id: z.assignedStaffId,
          employee_name: z.assignedStaffName,
          status: z.status,
          products: z.products,
          dow_map: z.dowMap ?? null,
        })),
      });
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : (err?.message ?? String(err));
      alert(`❌ DB 저장 실패\n${msg}\n(로컬 캐시만 저장됨)`);
      return;
    }

    setSaveAllToast(true);
    setTimeout(() => setSaveAllToast(false), 3000);
    setTimeout(() => alert(`✅ 매주 ${dowLabel} 적용 완료 · DB 저장 (${nextZones.length}개 구역)`), 100);
  }, [zones, requests, selectedDate]);

  // ── 자동 구역 배치 (기본배정 우선 + 미배정자 임의배치) ─────────────────────
  const handleAutoAssign = useCallback(async () => {
    const logistics = todayStaff.filter(s => s.employee.position.includes("물류"));
    if (logistics.length === 0) {
      alert("오늘 출근한 물류직원이 없습니다.");
      return;
    }
    // 간단 확인 — 미리보기만 적용 (DB 저장·알림 전송은 하지 않음)
    const proceed = await confirm({
      message: `물류 출근직원 ${logistics.length}명을 총 45구역 (수평윙 42 + 베스트존 3)에 근접성 세트 기반으로 임의배치할까요?`,
    });
    if (!proceed) return;

    // ── 근접성 세트 (총 11개 세트 · 45구역) ─────────────────────────────
    // 각 세트는 물리적으로 인접한 구역 묶음 → 사원별로 이동 최소화
    // 진열대 A/B + 인접 벽면 = 자연스러운 담당 구역
    const PROXIMITY_SETS: string[][] = [
      ["1B", "1A", "2B", "2A", "9", "10"],   // 세트 1: 6구역 (진열대 1-2 + 벽면 9-10)
      ["3B", "3A", "11", "12"],               // 세트 2: 4구역
      ["4B", "4A", "13", "14"],               // 세트 3: 4구역
      ["5B", "5A", "15", "16"],               // 세트 4: 4구역
      ["6B", "6A", "17", "18"],               // 세트 5: 4구역
      ["7B", "7A", "19", "20"],               // 세트 6: 4구역
      ["8B", "8A", "21", "22"],               // 세트 7: 4구역
      ["23", "24", "25", "26"],               // 세트 8: 하단 벽면 4구역
      ["27", "28", "29", "30"],               // 세트 9: 하단 벽면 4구역
      ["31", "32", "33", "34"],               // 세트 10: 하단 벽면 4구역
      ["35", "36", "37"],                     // 세트 11: 베스트존 3구역
    ];
    const CANONICAL_ORDER: string[] = PROXIMITY_SETS.flat();
    const TARGET_IDS = CANONICAL_ORDER;
    const N_SETS = PROXIMITY_SETS.length; // 11

    const logisticsNames: Set<string> = new Set(logistics.map(ts => ts.employee.name));
    const logisticsIdByName = new Map<string, number>(
      logistics.map(ts => [ts.employee.name, ts.employee.id] as [string, number])
    );

    // ── 원칙 1: 전체 배정을 살펴보고, 오늘 출근직원에게 이미 배정된 구역 유지 ──
    // 각 zone별 오늘 출근자 배정 여부 조사
    const newAssignment = new Map<string, { name: string; id: number }>();
    const alreadyPlacedStaff = new Set<string>();

    for (const zoneId of CANONICAL_ORDER) {
      const z = zones.find(zz => zz.id === zoneId);
      if (!z || !z.assignedStaffName) continue;
      const names = z.assignedStaffName.split(",").map(s => s.trim()).filter(Boolean);
      // 오늘 출근자 중 이 zone에 배정된 첫 번째 이름을 유지
      const validName = names.find(n => logisticsNames.has(n) && !alreadyPlacedStaff.has(n));
      if (validName) {
        newAssignment.set(zoneId, { name: validName, id: logisticsIdByName.get(validName)! });
        alreadyPlacedStaff.add(validName);
      }
    }

    // ── 미배정 직원 (오늘 출근했지만 어느 zone에도 배정 안 됨) ──
    const unplacedStaff = [...logisticsNames].filter(n => !alreadyPlacedStaff.has(n));

    // ── 빈 zone (오늘 출근자 배정 안 된 셀들) ──
    const emptyZones = CANONICAL_ORDER.filter(id => !newAssignment.has(id));

    // ── 원칙 2: 근접성 세트 기반 배정 ──
    // PROXIMITY_SETS의 각 세트를 사원에게 순차 할당
    // - 사원 수 == 11: 1인 1세트
    // - 사원 수 < 11: 일부 사원은 여러 세트 담당 (인접 세트 우선)
    // - 사원 수 > 11: 초과 사원은 배정 없음
    if (unplacedStaff.length > 0) {
      // 미배정 직원 순서 셔플 (매번 다른 조합)
      const shuffledUnplaced = [...unplacedStaff].sort(() => Math.random() - 0.5);
      const U = shuffledUnplaced.length;

      // 각 세트가 이미 완전히 배정됐는지 (기존 배정으로) 확인 → 비어있는 세트만 대상
      const emptySetIndices: number[] = [];
      for (let si = 0; si < PROXIMITY_SETS.length; si++) {
        const setZones = PROXIMITY_SETS[si];
        const allTaken = setZones.every(z => newAssignment.has(z));
        if (!allTaken) emptySetIndices.push(si);
      }

      const K = emptySetIndices.length; // 비어있는 세트 개수
      if (K > 0) {
        // 비어있는 세트를 U명에게 순차 분배 (인접 세트 → 같은 사원)
        for (let i = 0; i < K; i++) {
          const staffIdx = Math.min(U - 1, Math.floor((i * U) / K));
          const name = shuffledUnplaced[staffIdx];
          const id = logisticsIdByName.get(name)!;
          const setZones = PROXIMITY_SETS[emptySetIndices[i]];
          for (const z of setZones) {
            if (!newAssignment.has(z)) {
              newAssignment.set(z, { name, id });
            }
          }
        }
      }
    }

    // 각 사원별 배정 zone 개수 (알림·요약용)
    const zoneCountByName = new Map<string, number>();
    for (const { name } of newAssignment.values()) {
      zoneCountByName.set(name, (zoneCountByName.get(name) ?? 0) + 1);
    }

    // zones 상태 업데이트: TARGET (1-34)만 갱신, 나머지는 유지
    const nextZones = zones.map(z => {
      if (!TARGET_IDS.includes(z.id)) return z;
      const assign = newAssignment.get(z.id);
      if (assign) {
        return {
          ...z,
          assignedStaffId: assign.id,
          assignedStaffName: assign.name,
          dowMap: { [assign.name]: DOW_ALL },
        };
      }
      // 미배정 직원이 없어서 이 구역이 비어야 하는 경우 → 기존 배정 유지
      return z;
    });

    // 미리보기 모드로 진입 (아직 DB 저장·알림 전송 안 함)
    const prevZones = zones;
    setZones(nextZones);
    const assignedList = Array.from(newAssignment.entries()).map(([zoneId, v]) => ({ zoneId, name: v.name, id: v.id }));
    setPendingAutoAssign({ prevZones, assignedList });
  }, [todayStaff, zones]);

  // 임의배치 확정 → DB 저장 + 각 직원에게 알림 전송 (날짜 + 구역 라벨 + 카테고리)
  const handleConfirmAutoAssign = useCallback(async () => {
    if (!pendingAutoAssign) return;
    const { assignedList } = pendingAutoAssign;
    saveZones(zones);
    // DB 저장 (실패 시 사용자에게 알림)
    try {
      await api.post("/api/zones", {
        zones: zones.map((z) => ({
          zone_id: z.id,
          employee_id: z.assignedStaffId,
          employee_name: z.assignedStaffName,
          status: z.status,
          products: z.products,
          dow_map: z.dowMap ?? null,
        })),
      });
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : (err?.message ?? String(err));
      alert(`❌ 배치확정 DB 저장 실패\n${msg}\n로컬 캐시만 저장됨 · 알림은 발송하지 않습니다.`);
      return;
    }

    // 날짜 포맷 (예: "2026-07-07 (화)")
    const d = new Date(selectedDate + "T00:00:00");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const dowName = dayNames[d.getDay()];
    const dateLabel = `${d.getFullYear()}-${mm}-${dd} (${dowName})`;

    // 구역 라벨 만들기 (진열대/벽면/이벤트/기타 섹션별 프리픽스)
    const buildZoneLabel = (zoneId: string, zd: typeof ZONE_DEFS[0] | undefined) => {
      if (!zd) return `${zoneId}번`;
      const section = zd.section;
      const sideMatch = zoneId.match(/([AB])$/);
      const sideSuffix = sideMatch ? sideMatch[1] : "";
      if (section === "aisle") return `진열대 ${zd.num}${sideSuffix}`;
      if (section === "top_wall" || section === "bottom_wall" || section === "left_wall") return `벽면 ${zd.num}`;
      if (section === "wing") return `${zd.label}`;
      if (section === "event") return `이벤트존 ${zd.num}`;
      return `${zoneId}번`;
    };

    // 사원별로 zone 그룹핑 (한 사원이 여러 구역이면 단일 알림에 나열)
    const grouped = new Map<number, { name: string; zones: Array<{ zoneLabel: string; category: string }> }>();
    for (const { zoneId, name, id } of assignedList) {
      const zd = ZONE_DEFS.find(z => z.num === parseInt(zoneId, 10));
      const side = zoneId.endsWith("A") ? "A" : zoneId.endsWith("B") ? "B" : "";
      const category = side === "A" ? (zd?.subA ?? zd?.category ?? "")
        : side === "B" ? (zd?.subB ?? zd?.category ?? "")
          : (zd?.category ?? "");
      const zoneLabel = buildZoneLabel(zoneId, zd);
      if (!grouped.has(id)) grouped.set(id, { name, zones: [] });
      grouped.get(id)!.zones.push({ zoneLabel, category });
    }
    let sent = 0;
    for (const [empId, { name, zones: zList }] of grouped) {
      const zonesText = zList.map(z => `• ${z.zoneLabel} (${z.category})`).join("\n");
      fetch("/api/push-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: empId,
          title: `📍 ${dateLabel} 진열 담당구역 (${zList.length}곳)`,
          body: `${name}님, ${dateLabel} 진열 담당 구역 ${zList.length}곳입니다.\n${zonesText}`,
          url: "/",
        }),
      }).catch(() => { });
      sent++;
    }
    setPendingAutoAssign(null);
    setSaveAllToast(true);
    setTimeout(() => setSaveAllToast(false), 2500);
    setTimeout(() => alert(`확정 완료 (${dateLabel})\n${grouped.size}명 · ${assignedList.length}곳 배정 · ${sent}건 알림 전송`), 100);
  }, [pendingAutoAssign, zones, selectedDate]);

  // 임의배치 취소 → 이전 상태 복원
  const handleCancelAutoAssign = useCallback(() => {
    if (!pendingAutoAssign) return;
    setZones(pendingAutoAssign.prevZones);
    setPendingAutoAssign(null);
  }, [pendingAutoAssign]);

  // ── Fetch employees by month (re-fetches only when month changes) ──────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStaffLoading(true);
      try {
        const [y, m] = selectedYM.split("-").map(Number);
        const { data } = await api.get<any>(`/api/schedules?year=${y}&month=${m}`);
        const empList: Employee[] = Array.isArray(data?.employees) ? data.employees : [];
        if (cancelled) return;
        setEmployees(empList);
        setStaffError(null);
      } catch {
        if (!cancelled) setStaffError("직원 정보를 불러올 수 없습니다");
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedYM]);

  // ── Derive today's staff from employees + selectedDate ────────────────────
  useEffect(() => {
    const staff: TodayStaff[] = [];
    for (const emp of employees) {
      const sc = emp.schedules?.find((s) => s.date === selectedDate);
      if (sc && !SKIP_TYPES.has(sc.type)) {
        staff.push({ employee: emp, scheduleType: sc.type, workingHours: sc.workingHours || "" });
      }
    }
    setTodayStaff(staff);
  }, [employees, selectedDate]);

  // ── Load zones from DB on mount (fallback: localStorage already seeded in useState) ──
  useEffect(() => {
    fetchZonesFromDB().then((dbZones) => {
      if (dbZones) {
        setZones(dbZones);
        saveZones(dbZones);
      }
      setZonesLoaded(true);
    });
  }, []); // eslint-disable-line

  // ── Validate zone assignments against current employees after both load ──────
  // Clears stale assignments for employees no longer in the system
  useEffect(() => {
    if (!zonesLoaded || staffLoading || employees.length === 0) return;
    let changed = false;
    const validated = zones.map(z => {
      if (!z.assignedStaffName) return z;
      const names = z.assignedStaffName.split(",").map((s: string) => s.trim()).filter(Boolean);
      const validNames = names.filter((name: string) => employees.some(e => e.name === name));
      if (validNames.length === names.length) return z;
      changed = true;
      const validName = validNames.join(",");
      const firstEmp = validNames.length > 0 ? employees.find(e => e.name === validNames[0]) : null;
      return { ...z, assignedStaffName: validName, assignedStaffId: firstEmp?.id ?? null };
    });
    if (changed) {
      setZones(validated);
      saveZones(validated);
      saveZonesToDB(validated);
    }
  }, [zonesLoaded, staffLoading, employees.length]); // eslint-disable-line

  // ── Load requests from DB on mount ──────────────────────────────────────────
  useEffect(() => {
    fetchRequestsFromDB().then((dbReqs) => {
      if (dbReqs) {
        setRequests(dbReqs);
        saveRequests(dbReqs);
      }
    });
  }, []);

  // ── Load products map for medicine search ────────────────────────────────────
  // 정적 /products.json (name/spec) + 서버 /api/products-map (real_map·current_stock·optimal_stock 등)
  // + /api/inventory-latest (창고/매장 실재고 · inventory_checks 최신값) 을 병렬 로드 후 병합.
  // 재고관리 페이지와 동일한 소스로 통합해서 구역 모달에서 ERP/창고/매장/실재고 컬럼이 항상 채워지도록 함.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getProductsMap().catch(() => ({} as Record<string, ProductInfo>)),
      fetch("/api/products-map").then(r => r.ok ? r.json() : {}).catch(() => ({} as Record<string, ProductInfo>)),
      fetch("/api/inventory-latest").then(r => r.ok ? r.json() : {}).catch(() => ({} as Record<string, any>)),
    ]).then(([staticMap, serverMap, invMap]) => {
      if (cancelled) return;
      const merged: Record<string, ProductInfo> = { ...staticMap };
      for (const [code, info] of Object.entries(serverMap as Record<string, ProductInfo>)) {
        merged[code] = { ...(staticMap[code] ?? {} as ProductInfo), ...info };
      }
      // inventory_checks 최신값 병합 (product_code 별 warehouse_stock/store_stock/checked_at)
      const inv = invMap as Record<string, { warehouse_stock: number | null; store_stock: number | null; checked_at: string | null }>;
      for (const [code, iv] of Object.entries(inv)) {
        const stripped = code.replace(/^0+/, "");
        const keys = [code, stripped].filter(Boolean);
        for (const k of keys) {
          if (merged[k]) {
            merged[k] = {
              ...merged[k],
              warehouse_stock: iv.warehouse_stock,
              store_stock: iv.store_stock,
              inv_checked_at: iv.checked_at,
            } as ProductInfo;
          }
        }
      }
      setProductsMap(merged);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Load zone groups from DB on mount ────────────────────────────────────────
  useEffect(() => {
    fetch("/api/zone-groups")
      .then((r) => r.json())
      .then((data) => setZoneGroups(Array.isArray(data) ? data : []))
      .catch(() => { })
      .finally(() => setZoneGroupsLoaded(true));
  }, []);

  // ── Debounced save zone groups to DB when changed ───────────────────────────
  useEffect(() => {
    if (!zoneGroupsLoaded) return;
    const t = setTimeout(() => {
      fetch("/api/zone-groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(zoneGroups),
      }).catch(() => { });
    }, 800);
    return () => clearTimeout(t);
  }, [zoneGroups, zoneGroupsLoaded]);


  // ── Persist: save to localStorage immediately; debounce DB save ──────────────
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const dbSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    saveZones(zones);
    if (!zonesLoaded) return;
    if (dbSaveTimer.current) clearTimeout(dbSaveTimer.current);
    setSaveStatus("saving");
    dbSaveTimer.current = setTimeout(async () => {
      const result = await saveZonesToDB(zones);
      if (result.ok) {
        setSaveStatus("saved");
        setLastSaveError(null);
        setTimeout(() => setSaveStatus(prev => prev === "saved" ? "idle" : prev), 2500);
      } else {
        setSaveStatus("error");
        setLastSaveError(result.error ?? "알 수 없는 오류");
      }
    }, 1500);
    return () => { if (dbSaveTimer.current) clearTimeout(dbSaveTimer.current); };
  }, [zones, zonesLoaded]);
  useEffect(() => { saveRequests(requests); }, [requests]);

  // ── Logistics staff (today only) ────────────────────────────────────────────
  const logisticsStaff = useMemo(
    () => todayStaff.filter((s) => s.employee.position.includes("물류")),
    [todayStaff],
  );

  // ── Staff color map: stable color index per staff ID ─────────────────────────
  const staffColorMap = useMemo(() => {
    const map = new Map<number, number>();
    logisticsStaff.forEach(({ employee }, idx) => {
      map.set(employee.id, idx);
    });
    return map;
  }, [logisticsStaff]);

  // ── Active zone ──────────────────────────────────────────────────────────────
  const activeZone = useMemo(() => zones.find((z) => z.id === activeZoneId) ?? null, [zones, activeZoneId]);

  useEffect(() => {
    if (activeZone) {
      setDraftCategory(activeZone.category);
      setDraftProducts(activeZone.products);
      setDraftStaffId(activeZone.assignedStaffId);
      setDraftStatus(activeZone.status);
      setRequestNote("");
      setSavedFlash(false);
      setRequestFlash(false);
    }
  }, [activeZoneId]); // eslint-disable-line

  // ── Close popover on outside click / Escape ──────────────────────────────────
  useEffect(() => {
    if (!popoverAnchor) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopoverAnchor(null);
    };
    const handleClick = () => setPopoverAnchor(null);
    document.addEventListener("keydown", handleKey);
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("click", handleClick);
    };
  }, [popoverAnchor]);

  // ── Zone cell click → open popover ───────────────────────────────────────────
  const handleZoneCellClick = useCallback((zone: DisplayZone, rect: DOMRect) => {
    setPopoverAnchor((prev) => {
      // Toggle: clicking same zone again closes popover
      if (prev?.zoneId === zone.id) return null;
      return { zoneId: zone.id, rect };
    });
  }, []);

  // ── Open zone detail modal ───────────────────────────────────────────────────
  const handleOpenZoneDetail = useCallback((zone: DisplayZone) => {
    setPopoverAnchor(null);
    setActiveZoneId(zone.id);
  }, []);

  // ── Assign / unassign from popover ───────────────────────────────────────────
  const handlePopoverAssign = useCallback((staffId: number, staffName: string) => {
    if (!popoverAnchor) return;
    const zoneId = popoverAnchor.zoneId;
    setZones((prev) =>
      prev.map((z) => {
        if (z.id !== zoneId) return z;
        if (MULTI_ASSIGN_ZONE_NUMS.has(z.num)) {
          const existing = z.assignedStaffName ? z.assignedStaffName.split(",").map(s => s.trim()).filter(Boolean) : [];
          if (existing.includes(staffName)) return z;
          const next = [...existing, staffName];
          const nextDow: DowMap = { ...(z.dowMap ?? {}), [staffName]: DOW_ALL };
          return { ...z, assignedStaffId: staffId, assignedStaffName: next.join(","), dowMap: nextDow };
        }
        return { ...z, assignedStaffId: staffId, assignedStaffName: staffName, dowMap: { [staffName]: DOW_ALL } };
      }),
    );
    setPopoverAnchor(null);
  }, [popoverAnchor]);

  const handlePopoverUnassign = useCallback(() => {
    if (!popoverAnchor) return;
    const zoneId = popoverAnchor.zoneId;
    setZones((prev) =>
      prev.map((z) =>
        z.id === zoneId
          ? { ...z, assignedStaffId: null, assignedStaffName: "", dowMap: null }
          : z,
      ),
    );
    setPopoverAnchor(null);
  }, [popoverAnchor]);

  // Remove one person from a multi-assign zone
  const handleMultiUnassignOne = useCallback((zoneId: string, nameToRemove: string) => {
    setZones((prev) =>
      prev.map((z) => {
        if (z.id !== zoneId) return z;
        const remaining = z.assignedStaffName.split(",").map(s => s.trim()).filter(n => n && n !== nameToRemove);
        const firstEmp = remaining.length > 0 ? employees.find(e => e.name === remaining[0]) : null;
        // dowMap에서 해당 이름 키 제거
        let nextDow: DowMap = null;
        if (z.dowMap) {
          const copy = { ...z.dowMap };
          delete copy[nameToRemove];
          nextDow = Object.keys(copy).length > 0 ? copy : null;
        }
        return { ...z, assignedStaffName: remaining.join(","), assignedStaffId: firstEmp?.id ?? null, dowMap: nextDow };
      }),
    );
  }, [employees]);

  // 요일별 마스크 토글 (특정 사람의 특정 요일 on/off)
  const toggleZoneDow = useCallback((zoneId: string, nameKey: string, dow: number) => {
    setZones((prev) => prev.map((z) => {
      if (z.id !== zoneId) return z;
      const current = z.dowMap?.[nameKey] ?? DOW_ALL;
      const nextMask = current ^ (1 << dow);
      const nextDow: DowMap = { ...(z.dowMap ?? {}), [nameKey]: nextMask };
      return { ...z, dowMap: nextDow };
    }));
  }, []);

  // ── Drag-and-drop assignment ─────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent, _zone: DisplayZone) => {
    if (!dragStaffRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverZoneId(_zone.id);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, zone: DisplayZone) => {
    e.preventDefault();
    setDragOverZoneId(null);
    const staff = dragStaffRef.current;
    if (!staff) return;
    setZones((prev) =>
      prev.map((z) => {
        if (z.id !== zone.id) return z;
        if (MULTI_ASSIGN_ZONE_NUMS.has(z.num)) {
          const existing = z.assignedStaffName ? z.assignedStaffName.split(",").map(s => s.trim()).filter(Boolean) : [];
          if (existing.includes(staff.employee.name)) return z;
          const next = [...existing, staff.employee.name];
          const nextDow: DowMap = { ...(z.dowMap ?? {}), [staff.employee.name]: DOW_ALL };
          return { ...z, assignedStaffId: staff.employee.id, assignedStaffName: next.join(","), dowMap: nextDow };
        }
        return { ...z, assignedStaffId: staff.employee.id, assignedStaffName: staff.employee.name, dowMap: { [staff.employee.name]: DOW_ALL } };
      }),
    );
    dragStaffRef.current = null;
    setDragStaff(null);
  }, []);

  // ── Save / Request ───────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (!activeZone) return;
    const staff = employees.find((e) => e.id === draftStaffId) ?? null;
    setZones((prev) => prev.map((z) => {
      if (z.id !== activeZone.id) return z;
      // 새로 배정된 사람이 있으면 dowMap에 기본값(모든 요일) 추가
      let nextDow: DowMap = z.dowMap;
      if (staff && !(z.dowMap?.[staff.name])) {
        nextDow = { ...(z.dowMap ?? {}), [staff.name]: DOW_ALL };
      }
      return {
        ...z, category: draftCategory, products: draftProducts,
        assignedStaffId: staff?.id ?? null, assignedStaffName: staff?.name ?? "",
        status: draftStatus, dowMap: nextDow,
      };
    }));
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }, [activeZone, draftCategory, draftProducts, draftStaffId, draftStatus, employees]);

  const canRequest = (draftStatus === "low" || draftStatus === "empty") && draftStaffId !== null;

  const handleSendRequest = useCallback(() => {
    if (!activeZone || !canRequest) return;
    const staff = employees.find((e) => e.id === draftStaffId);
    if (!staff) return;
    setZones((prev) => prev.map((z) => z.id !== activeZone.id ? z : {
      ...z, category: draftCategory, products: draftProducts,
      assignedStaffId: staff.id, assignedStaffName: staff.name, status: draftStatus,
    }));
    const req: DisplayRequest = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      zoneId: activeZone.id, zoneLabel: `${activeZone.num}번 ${activeZone.label}`,
      category: draftCategory, requestedAt: new Date().toISOString(),
      assignedStaffId: staff.id, assignedStaffName: staff.name,
      status: "pending", note: requestNote,
    };
    setRequests((prev) => [req, ...prev]);
    // Save to DB
    fetch("/api/display-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        zone_id: activeZone.id,
        zone_label: `${activeZone.num}번 ${activeZone.label}`,
        category: draftCategory,
        requested_at: new Date().toISOString(),
        assigned_staff_id: staff.id,
        assigned_staff_name: staff.name,
        note: requestNote,
      }),
    }).catch(() => { });
    setRequestFlash(true);
    setTimeout(() => setRequestFlash(false), 1500);
  }, [activeZone, canRequest, draftCategory, draftProducts, draftStaffId, draftStatus, requestNote, employees]);

  // ── Filtered Zones for Sidebar & Highlights ────────────────────────────────
  const searchedZones = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return zones;
    return zones.filter(
      (z) =>
        z.num.toString().includes(q) ||
        z.label.toLowerCase().includes(q) ||
        z.category.toLowerCase().includes(q) ||
        z.products.toLowerCase().includes(q)
    );
  }, [zones, searchQuery]);

  const searchedZoneIds = useMemo(() => {
    const ids = new Set(searchQuery ? searchedZones.map((z) => z.id) : []);
    if (productMatchZoneId) ids.add(productMatchZoneId);
    return ids;
  }, [searchedZones, searchQuery, productMatchZoneId]);

  // ── Product DB search results (약찾기) ────────────────────────────────────────
  const productSearchResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (q.length < 1) return [];
    const seen = new Set<string>();
    const results: Array<{ code: string; name: string; spec: string; realMap: string | null }> = [];
    for (const p of Object.values(productsMap) as ProductInfo[]) {
      const code = String(p.code ?? p.product_code ?? "");
      if (seen.has(code)) continue;
      seen.add(code);
      const name = String(p.name ?? p.product_name ?? "");
      const spec = String(p.spec ?? "");
      if (name.toLowerCase().includes(q) || spec.toLowerCase().includes(q)) {
        results.push({ code, name, spec, realMap: p.real_map ?? null });
        if (results.length >= 30) break;
      }
    }
    return results;
  }, [productsMap, searchQuery]);

  const filteredReqs = useMemo(() =>
    reqFilter === "all" ? requests : requests.filter((r) => r.status === reqFilter),
    [requests, reqFilter]);

  // ── Logistics staff zones helper ─────────────────────────────────────────────
  const getAssignedZones = (staffId: number) => zones.filter((z) => z.assignedStaffId === staffId);

  const selectedDateObj = new Date(selectedDate + "T00:00:00");
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const selectedDateLabel = `${selectedDateObj.getMonth() + 1}월 ${selectedDateObj.getDate()}일 (${dayNames[selectedDateObj.getDay()]})`;
  const isToday = selectedDate === todayStr;

  const popoverZone = useMemo(
    () => (popoverAnchor ? zones.find((z) => z.id === popoverAnchor.zoneId) ?? null : null),
    [popoverAnchor, zones],
  );

  // Helper to find specific zones by number
  const getZone = (num: number) => zones.find((z) => z.num === num);
  const getZoneById = (id: string) => zones.find((z) => z.id === id);

  const getZoneGroup = useCallback(
    (areaId: string) => zoneGroups.find((g) => g.areaIds.includes(areaId)) ?? null,
    [zoneGroups],
  );

  const activeGroup = useMemo(
    () => zoneGroups.find((g) => g.id === activeGroupId) ?? null,
    [zoneGroups, activeGroupId],
  );

  const handleZoneConfigClick = useCallback((zoneId: string) => {
    if (!activeGroupId) return;
    setZoneGroups((prev) =>
      prev.map((g) => {
        if (g.id === activeGroupId) {
          return g.areaIds.includes(zoneId)
            ? { ...g, areaIds: g.areaIds.filter((id) => id !== zoneId) }
            : { ...g, areaIds: [...g.areaIds, zoneId] };
        }
        if (g.areaIds.includes(zoneId)) {
          return { ...g, areaIds: g.areaIds.filter((id) => id !== zoneId) };
        }
        return g;
      }),
    );
  }, [activeGroupId]);

  // 2026-08-12 · 사용자 요청 · 구역 단위 진열요청 버튼 복구 (구역 아래 한 개씩)
  //   - 담당자 미배정 구역은 버튼 비활성(dimmed) · 클릭 불가
  //   - 알림 텍스트에 구역 정보 포함 (handleQuickRequest 내 toast/push에 zone.label 포함됨)
  const renderRequestButton = (num: number, id?: string): React.ReactNode => {
    const zoneId = id ?? String(num);
    const zone = getZoneById(zoneId) ?? zones.find(z => z.num === num && !z.id.match(/[AB]$/));
    if (!zone) return null;
    const hasStaff = !!zone.assignedStaffId;
    return (
      <button
        type="button"
        onClick={() => hasStaff && handleQuickRequest(zone)}
        disabled={!hasStaff}
        title={hasStaff ? `${zone.num}번 ${zone.label} 진열 보충 요청` : "담당자 미배정 — 진열요청 불가"}
        className={`w-full h-6 rounded text-[9px] font-bold flex items-center justify-center gap-0.5 transition-all border ${
          hasStaff
            ? "bg-rose-500 hover:bg-rose-600 active:scale-95 text-white border-rose-600 cursor-pointer shadow-sm"
            : "bg-zinc-100 text-zinc-300 border-line cursor-not-allowed"
        }`}
      >
        <Bell size={8} />
        {hasStaff ? "진열요청" : "미배정"}
      </button>
    );
  };
  // Helper to render Zone Cell on Blueprint (id-based · A/B 서브존 지원)
  const renderZoneCellById = (id: string, classes = "", wrapperClass = "", hideRequest = false) => {
    const zRaw = getZoneById(id);
    if (!zRaw) return null;
    return renderZoneFromRaw(zRaw, classes, wrapperClass, hideRequest);
  };
  const renderZoneCell = (num: number, classes = "", wrapperClass = "", hideRequest = false) => {
    // aisle 1~8은 A/B로 확장돼 있어 num으로만 찾으면 첫번째(B)만 매칭됨.
    // 이 함수는 벽면·22·wing 등 side가 없는 zone 렌더에 사용.
    const zRaw = zones.find(z => z.num === num && !z.id.match(/[AB]$/));
    if (!zRaw) return null;
    return renderZoneFromRaw(zRaw, classes, wrapperClass, hideRequest);
  };
  // 벽면 구역 통합 카드 (9-21, 23-34) — 카테고리 라벨 + 배정 셀을 하나의 카드로 결합
  // position: "top" → 진열요청 버튼이 위, "bottom" → 아래
  const renderWallZoneCard = (num: number, position: "top" | "bottom") => {
    const zd = ZONE_DEFS.find(z => z.num === num);
    const openProducts = () => {
      setZoneProductsModal({ zoneId: String(num), zoneNum: num, zoneLabel: `벽면 ${num}`, category: zd?.category ?? "" });
      setZoneProductsFilter("all"); setZoneProductsSearch("");
    };
    return (
      <div key={`wall-${num}`} className="flex flex-col gap-0.5">
        {position === "top" && renderRequestButton(num)}
        {/* 통합 카드 (카테고리 헤더 + 배정 셀) */}
        <div className="rounded-lg overflow-hidden border-2 border-stone-300 bg-white shadow-sm hover:border-amber-400 transition">
          {/* 카테고리 헤더 (번호 → 카테고리 · 카테고리가 2개(콤마 · 슬래시 등)면 2줄로 균일 높이) */}
          <button
            type="button"
            onClick={openProducts}
            title={`${num}번 · ${zd?.category ?? ""} → 진열상품 조회`}
            className="w-full h-[64px] bg-stone-50 hover:bg-amber-50 px-1 py-1 flex flex-col items-center gap-0.5 border-b border-stone-200 cursor-pointer transition"
          >
            <span className="text-[10px] font-bold text-white bg-amber-700 rounded px-1 py-0.5 leading-none shrink-0">{getZoneLabel(num)}</span>
            {(() => {
              // 2026-07-31 · 사용자 편집 라벨 우선
              const cat = getZoneSubLabel(num) || (zd?.category ?? "");
              // 카테고리 분리 기준: "·" · "/" · "," (2개 이상이면 두 줄로 표시)
              const parts = cat.split(/[·,\/]/).map(s => s.trim()).filter(Boolean);
              if (parts.length >= 2) {
                return (
                  <div className="w-full flex-1 flex flex-col justify-center gap-0.5 min-h-0">
                    <span className="text-[10px] font-bold text-stone-800 leading-tight text-center line-clamp-1">{parts[0]}</span>
                    <span className="text-[10px] font-bold text-stone-800 leading-tight text-center line-clamp-1">{parts.slice(1).join(" · ")}</span>
                  </div>
                );
              }
              return (
                <span className="w-full flex-1 flex items-center justify-center text-[10px] font-bold text-stone-800 line-clamp-2 text-center leading-tight">
                  {cat}
                </span>
              );
            })()}
          </button>
          {/* 배정 셀 (ZoneCell — 드래그드롭 + 클릭 팝오버) */}
          {renderZoneCell(num, "w-full h-10 text-[9px] p-0.5 justify-center border-0 rounded-none", "", true)}
        </div>
        {position === "bottom" && renderRequestButton(num)}
      </div>
    );
  };
  const renderZoneFromRaw = (zRaw: DisplayZone, classes: string, wrapperClass: string, hideRequest = false) => {
    // 요일별 담당 필터링 — 선택된 날짜의 요일에 활성 인원만 표시
    // 또한 오늘 실제 출근한 직원(todayStaff)에 포함되지 않은 이름은 제거
    const currentDow = selectedDateObj.getDay();
    const todayNames = new Set(todayStaff.map(s => s.employee.name));
    const allNames = zRaw.assignedStaffName ? zRaw.assignedStaffName.split(",").map(s => s.trim()).filter(Boolean) : [];
    const activeNames = allNames.filter(n =>
      isDowActive(zRaw.dowMap?.[n] ?? DOW_ALL, currentDow) && todayNames.has(n)
    );
    const z: DisplayZone = allNames.length !== activeNames.length
      ? { ...zRaw, assignedStaffName: activeNames.join(","), assignedStaffId: activeNames.length === 0 ? null : zRaw.assignedStaffId }
      : zRaw;
    const group = getZoneGroup(z.id);
    const inSelectedGroup = !!(activeGroup && activeGroup.areaIds.includes(z.id));
    return (
      <div key={z.id} className={`flex flex-col gap-0.5 ${wrapperClass}`}>
        <ZoneCell
          zone={z}
          onContextClick={handleZoneCellClick}
          onDetailClick={handleOpenZoneDetail}
          className={classes}
          isPopoverOpen={popoverAnchor?.zoneId === z.id}
          staffColorIndex={z.assignedStaffId !== null ? (staffColorMap.get(z.assignedStaffId) ?? null) : null}
          isDragOver={dragOverZoneId === z.id && !!dragStaff}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragLeave={() => setDragOverZoneId(null)}
          isSearchedHighlight={searchedZoneIds.has(z.id)}
          groupColor={group?.color}
          groupLabel={group?.name?.slice(0, 1)}
          configMode={zoneConfigOpen}
          inSelectedGroup={inSelectedGroup}
          onConfigClick={zoneConfigOpen ? (zone) => handleZoneConfigClick(zone.id) : undefined}
        />
        {/* 2026-08-05 · 사용자 요청 · 구역 단위 진열요청 버튼 제거 (상품별 요청으로 전환) */}
      </div>
    );
  };

  // ── Product search result click: highlight matching zone on the map ──────────
  const handleProductResultClick = useCallback((realMap: string | null) => {
    if (!realMap) return;
    const m = realMap.match(/^(\d+)번/);
    if (m) {
      const num = parseInt(m[1], 10);
      const zone = zones.find((z) => z.num === num);
      if (zone) setProductMatchZoneId(zone.id);
    }
  }, [zones]);

  const handleBarcodeScan = (result: string) => {
    if (scannerMode === "search") {
      setSearchQuery(result);
    } else if (scannerMode === "products") {
      setDraftProducts((prev) => prev ? `${prev}, ${result}` : result);
    }
    setScannerMode(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans flex flex-col" onClick={() => setPopoverAnchor(null)}>

      {scannerMode && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setScannerMode(null)}
          title={scannerMode === "search" ? "상품 검색 스캔" : "상품 바코드 스캔"}
        />
      )}

      {/* Shared App Nav Header */}
      <AppNavHeader
        activePage="display"
        authSession={authSession ?? null}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      {/* 서브탭 · 2026-07-28 재설계 · Vercel Ink underline 계열 + 색상 아이덴티티 강조 */}
      {/* 2026-08-03 (#183) · 공통 TabBar (level 2) 로 리팩터 · duplicate 스타일 흡수 */}
      {/* 2026-08-05 · 관리자 long-press 드래그 재정렬 (useSortableTabs · localStorage 순서 저장) */}
      {(dpCanSeeStockManage || dpCanSeeStockArrivals) && !(SIDEBAR_ENABLED && !isDpMobile) && (() => {
        // 2026-08-17 · #131 · 사용자 지시 · 안보이기 처리 subtab 은 내부 tab bar 에서도 숨김
        const visibilityMap: Record<DpSubTabKey, boolean> = {
          "purchase-order": dpCanSeeStockManage && !dpHiddenSubs.has("purchase-order"),
          "purchase":       dpCanSeeStockManage && !dpHiddenSubs.has("purchase"),
          "payment":        dpCanSeeStockManage && !dpHiddenSubs.has("payment"),
          "statistics":     dpCanSeeStockManage && !dpHiddenSubs.has("statistics"),
          "stock-arrivals": dpCanSeeStockArrivals && !dpHiddenSubs.has("stock-arrivals"),
          "store":          !dpHiddenSubs.has("store"),
          "vendor-manage":  dpCanSeeStockManage && !dpHiddenSubs.has("vendor-manage"),
        };
        // sortable.tabs 는 localStorage 순서가 적용된 배열 · 여기서 visible 만 덮어씌움
        const tabs: CommonTabDef<DpSubTabKey>[] = dpTabSortable.tabs.map(t => ({ ...t, visible: visibilityMap[t.key] }));
        return (
          <TabBar<DpSubTabKey>
            level={2}
            tabs={tabs}
            activeKey={dpSubTab}
            onSelect={setDpSubTab}
            sortable={{ getTabProps: dpTabSortable.getTabProps, isDragging: dpTabSortable.isDragging }}
          />
        );
      })()}

      {dpSubTab === "stock-arrivals" && dpCanSeeStockArrivals ? (
        <main className="flex-1 flex flex-col min-h-0">
          <StockArrivalPage
            authSession={authSession}
            onBack={onBack}
            onNavigate={onNavigate as any}
            onLogout={onLogout}
            embedded
          />
        </main>
      ) : dpSubTab === "vendor-manage" && dpCanSeeStockManage ? (
        // 2026-08-10 · 사용자 요청 · SplitPanel · PC 좌우 · 모바일 우측 모달
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden p-3">
          <React.Suspense fallback={<div className="flex-1 flex items-center justify-center text-zinc-400 py-16">공급사관리 로딩 중...</div>}>
            <VendorManageSplit />
          </React.Suspense>
        </main>
      ) : (dpSubTab === "purchase-order" || dpSubTab === "purchase" || dpSubTab === "payment" || dpSubTab === "statistics") && dpCanSeeStockManage ? (
        // 2026-08-03 · 4개 서브탭 각각 OrderManagePage · initialTopTab prop 만 · re-mount 없이 useEffect 로 감지
        // key prop 제거 · 재mount 시 매번 재fetch · 로딩 느림 유발 (이전 방식으로 원복)
        <main className="flex-1 flex flex-col min-h-0">
          <OrderManagePage
            ocrTabAuthSession={authSession}
            ocrTabOnBack={onBack}
            ocrTabOnNavigate={onNavigate as any}
            ocrTabOnLogout={onLogout}
            initialTopTab={dpSubTab as "purchase-order" | "purchase" | "payment" | "statistics"}
            hideTopTabs
          />
        </main>
      ) : (
        /* Main Content Grid — 세로 스택: 상단(검색+출근직원 가로), 하단(매장맵 전체) */
        <main className="max-w-[1360px] w-full mx-auto p-4 flex flex-col gap-4 flex-1">

          {/* TOP SECTION: Search + Today's Staff (side by side on lg, stacked on mobile) */}
          <section className="flex flex-col lg:flex-row gap-4">

            {/* LEFT of top bar: 약찾기 결과 (검색 시에만 노출 · 검색창은 매장맵 상단으로 이동됨) */}
            <div className="flex-1 flex flex-col gap-3 min-w-0">
              {/* ── 약찾기 결과 패널 ──────────────────────────────────────────────── */}
              {productSearchResults.length > 0 && (
                <div className="bg-white rounded-xl border border-emerald-200 shadow-xs overflow-hidden shrink-0">
                  <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                      <Pill size={12} />
                      약 위치 검색 결과 ({productSearchResults.length}건)
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSearchQuery(""); setProductMatchZoneId(null); }}
                      className="text-zinc-400 hover:text-zinc-600 transition cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="max-h-52 overflow-y-auto divide-y divide-zinc-50">
                    {productSearchResults.map((p) => (
                      <div
                        key={p.code}
                        className={`px-3 py-2 flex items-start justify-between gap-2 ${productMatchZoneId && zones.find(z => z.id === productMatchZoneId)?.num === parseInt((p.realMap ?? "").match(/^(\d+)번/)?.[1] ?? "-1") ? "bg-emerald-50 border-l-2 border-emerald-400" : ""
                          }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleProductResultClick(p.realMap)}
                          className="flex-1 min-w-0 text-left hover:opacity-75 transition cursor-pointer"
                        >
                          <div className="text-[13px] font-semibold text-zinc-800 truncate">{p.name}</div>
                          {p.spec && <div className="text-[11px] text-zinc-400 truncate mt-0.5" title="전산배치구역">{p.spec}</div>}
                        </button>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {p.realMap && (
                            <button
                              type="button"
                              onClick={() => handleProductResultClick(p.realMap)}
                              className="flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 whitespace-nowrap hover:text-emerald-900 transition cursor-pointer"
                            >
                              <MapPin size={9} />
                              {p.realMap}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const full = productsMap[p.code] ?? productsMap[p.code.replace(/^0+/, "")] ?? p as ProductInfo;
                              setProductInfoModal(full);
                            }}
                            className="flex items-center gap-0.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-lg whitespace-nowrap hover:bg-indigo-100 transition cursor-pointer"
                          >
                            <Info size={9} />
                            상품정보
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </section>

          {/* BOTTOM SECTION: 매장 배치도 (full width, 한번에 보이게) */}
          <section className="flex flex-col">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col">

              {/* Save-all toast */}
              {saveAllToast && (
                <div className="fixed top-5 right-5 z-[70] bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
                  <CheckCircle2 size={14} />
                  전 요일에 현재 배정이 적용 · DB 저장되었습니다.
                </div>
              )}

              {/* Quick request toast */}
              {quickReqToast && (
                <div className="fixed top-5 right-5 z-[71] bg-amber-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 animate-in slide-in-from-top-2 duration-200 max-w-xs">
                  <Bell size={14} />
                  {quickReqToast}
                </div>
              )}

              {/* Date navigation */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigateDate(-1)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 border border-line text-gray-500 hover:text-gray-800 transition cursor-pointer"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="text-center min-w-[140px] sm:min-w-[160px]">
                    <div className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight tracking-tight">
                      {selectedDateObj.getMonth() + 1}월 {selectedDateObj.getDate()}일
                    </div>
                    <div className="flex items-center justify-center gap-1.5 mt-0.5">
                      <span className="text-sm font-semibold text-gray-400">{dayNames[selectedDateObj.getDay()]}요일</span>
                      {/* 2026-08-17 · StatusPill 프레임워크 통일 */}
                      {isToday && <StatusPill tone="indigo" size="xs">오늘</StatusPill>}
                      {!isToday && (
                        <button
                          onClick={() => setSelectedDate(todayStr)}
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 hover:bg-indigo-100 hover:text-indigo-600 transition cursor-pointer"
                        >
                          오늘로
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => navigateDate(1)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 border border-line text-gray-500 hover:text-gray-800 transition cursor-pointer"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-start sm:justify-end">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xl">🗺️</span>
                    <span className="text-sm font-bold text-gray-600">매장 배치도</span>
                  </div>
                  {/* 약찾기 검색 — 전체저장 옆에 배치 · 검색결과 드롭다운 아래로 노출 */}
                  <div className="relative flex-1 min-w-[140px] sm:min-w-[200px] max-w-[360px]">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="약 · 증상 검색 (예: 감기약)"
                      className="w-full pl-8 pr-8 py-1.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-tint bg-white text-xs"
                    />
                    <Search className="absolute left-2 top-2 text-gray-400" size={13} />
                    {searchQuery && (
                      <button
                        onClick={() => { setSearchQuery(""); setProductMatchZoneId(null); }}
                        className="absolute right-2 top-1.5 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    )}
                    {/* 검색 결과 드롭다운 (검색어 존재 시 자동 노출) */}
                    {searchQuery && productSearchResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-emerald-300 shadow-xl z-40 overflow-hidden">
                        <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                            <Pill size={12} />
                            검색 결과 ({productSearchResults.length}건)
                          </div>
                        </div>
                        <div className="max-h-72 overflow-y-auto divide-y divide-zinc-50">
                          {productSearchResults.map((p) => (
                            <div key={p.code} className="px-3 py-2 flex items-start justify-between gap-2 hover:bg-zinc-50 transition">
                              <button
                                type="button"
                                onClick={() => handleProductResultClick(p.realMap)}
                                className="flex-1 min-w-0 text-left cursor-pointer"
                              >
                                <div className="text-[13px] font-semibold text-zinc-800 truncate">{p.name}</div>
                                {p.spec && <div className="text-[11px] text-zinc-400 truncate mt-0.5" title="전산배치구역">{p.spec}</div>}
                              </button>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {p.realMap && (
                                  <button
                                    type="button"
                                    onClick={() => handleProductResultClick(p.realMap)}
                                    className="flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 whitespace-nowrap hover:text-emerald-900 transition cursor-pointer"
                                  >
                                    <MapPin size={9} />
                                    {p.realMap}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const full = productsMap[p.code] ?? productsMap[p.code.replace(/^0+/, "")] ?? p as ProductInfo;
                                    setProductInfoModal(full);
                                  }}
                                  className="flex items-center gap-0.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-lg whitespace-nowrap hover:bg-indigo-100 transition cursor-pointer"
                                >
                                  <Info size={9} />
                                  정보
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {searchQuery && productSearchResults.length === 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-line shadow-lg z-40 px-3 py-3 text-[11px] text-zinc-400 text-center">
                        검색 결과 없음
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setScannerMode("search")}
                    title="바코드 스캔으로 검색"
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 bg-white hover:bg-emerald-50 hover:border-emerald-400 text-gray-500 hover:text-emerald-600 transition cursor-pointer shadow-sm"
                  >
                    <ScanLine size={14} />
                  </button>
                  <button
                    onClick={() => { setZoneConfigOpen((v) => !v); setActiveGroupId(null); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer shrink-0 ${zoneConfigOpen
                        ? "bg-brand-deep text-white shadow-sm"
                        : "bg-white border border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600"
                      }`}
                  >
                    <Layers size={13} />
                    구역 설정
                  </button>
                  {/* DB 저장 상태 표시 · 2026-08-17 · StatusPill 통일 */}
                  <span
                    className={saveStatus === "error" ? "cursor-help" : ""}
                    title={saveStatus === "error" ? `DB 저장 실패: ${lastSaveError ?? "알 수 없는 오류"}` : "매장맵 자동저장 상태"}
                  >
                    <StatusPill
                      tone={saveStatus === "saving" ? "sky" : saveStatus === "saved" ? "emerald" : saveStatus === "error" ? "rose" : "zinc"}
                      size="xs"
                      dot
                      pulse={saveStatus === "saving"}
                    >
                      {saveStatus === "saving" && <><Loader2 size={10} className="animate-spin inline mr-0.5" />저장중</>}
                      {saveStatus === "saved" && "저장됨"}
                      {saveStatus === "error" && "저장 실패"}
                      {saveStatus === "idle" && "대기"}
                    </StatusPill>
                  </span>
                  <button
                    onClick={handleApplyToWeekday}
                    title={`현재 배정을 매주 ${dayNames[selectedDateObj.getDay()]}에 적용 · DB 저장`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-xs font-bold rounded-lg shadow-sm transition cursor-pointer shrink-0"
                  >
                    <Save size={13} />
                    📅 매주 {dayNames[selectedDateObj.getDay()]}에 적용
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-400 mb-4">
                📅 매주 {dayNames[selectedDateObj.getDay()]}에 적용 시 현재 배정이 해당 요일에 반영됩니다.
                <br />
                <span className="text-emerald-600 font-semibold">📦 카테고리 라벨을 누르면 해당 구역의 진열상품이 조회됩니다.</span>
              </p>

              {zoneConfigOpen && (
                <ZoneGroupPanel
                  groups={zoneGroups}
                  activeGroupId={activeGroupId}
                  employees={employees}
                  onGroupsChange={setZoneGroups}
                  onActiveGroupChange={setActiveGroupId}
                />
              )}


              {/* ── MOBILE 리스트뷰 · 데스크탑 미표시 · 데스크탑과 동일한 색상 적용 ── */}
              {(() => {
                // 데스크탑 catA / catB 컬러 매핑 재사용
                const catAColors: Record<number, string> = {
                  1: "bg-blue-500 text-white", 2: "bg-yellow-400 text-yellow-950",
                  3: "bg-red-500 text-white", 4: "bg-pink-500 text-white",
                  5: "bg-lime-500 text-lime-950", 6: "bg-sky-500 text-white",
                  7: "bg-brand-deep text-white", 8: "bg-purple-500 text-white",
                };
                const catBColors: Record<number, string> = {
                  1: "bg-blue-100 text-blue-900", 2: "bg-yellow-100 text-yellow-900",
                  3: "bg-red-100 text-red-900", 4: "bg-pink-100 text-pink-900",
                  5: "bg-lime-100 text-lime-900", 6: "bg-sky-100 text-sky-900",
                  7: "bg-indigo-100 text-indigo-900", 8: "bg-purple-100 text-purple-900",
                };
                // 9+ 구역 · 갈색(amber-800) 배경 · 하얀 글씨 (사용자 지정)
                const getPillCls = (z: DisplayZone): string => {
                  if (z.num >= 1 && z.num <= 8) {
                    return z.id.endsWith("A") ? catAColors[z.num] : catBColors[z.num];
                  }
                  return "bg-amber-800 text-white";
                };
                return (
                  <Card clip padding="none" className="sm:hidden mb-2">
                    <div className="px-3 py-2 border-b border-zinc-100 bg-zinc-50 flex items-center gap-2">
                      <span className="text-lg">📋</span>
                      <span className="text-[13px] font-bold text-zinc-700">구역 리스트</span>
                      <span className="text-[10px] font-mono text-zinc-400">({zones.length}개)</span>
                      <button
                        type="button"
                        onClick={() => setFullMapOpen(true)}
                        className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[10px] font-bold shadow-sm active:scale-95 transition"
                        title="매장 구역도 보기 (읽기 전용)"
                      >
                        🗺️ 매장 구역도 보기
                      </button>
                    </div>
                    <ul className="divide-y divide-zinc-100 max-h-[70vh] overflow-y-auto">
                      {[...zones]
                        .sort((a, b) => {
                          if (a.num !== b.num) return a.num - b.num;
                          const aa = a.id.endsWith("A") ? 0 : 1;
                          const bb = b.id.endsWith("A") ? 0 : 1;
                          return aa - bb;
                        })
                        .map(z => {
                          const zoneLabel = z.num <= 8
                            ? `${z.num}${z.id.endsWith("A") ? "A" : z.id.endsWith("B") ? "B" : ""}`
                            : String(z.num);
                          const statusColor = z.status === "empty" ? "bg-red-500" : z.status === "low" ? "bg-amber-500" : "bg-emerald-500";
                          const pillCls = getPillCls(z);
                          // 담당자 리스트 · 콤마 구분
                          const staffNames = z.assignedStaffName ? z.assignedStaffName.split(",").map(s => s.trim()).filter(Boolean) : [];
                          return (
                            <li key={`mobile-list-${z.id}`} className="grid grid-cols-[40px_1fr_84px_62px] items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 transition">
                              {/* 1. 구역 번호 pill · 데스크탑 색상 · 고정 40px */}
                              <button
                                type="button"
                                onClick={() => {
                                  setZoneProductsModal({ zoneId: z.id, zoneNum: z.num, zoneLabel: zoneLabel, category: z.category });
                                  setZoneProductsFilter("all"); setZoneProductsSearch("");
                                }}
                                className={`w-full h-[38px] rounded text-[13px] font-bold flex items-center justify-center leading-none active:scale-95 transition ${pillCls}`}
                                title={`${zoneLabel} 상품 조회`}
                              >
                                {zoneLabel}
                              </button>
                              {/* 2. 카테고리 · 왼쪽 정렬 · 줄임말 없음 */}
                              <span className="text-[12px] font-bold text-zinc-800 break-keep whitespace-normal leading-tight">
                                {z.category || "-"}
                              </span>
                              {/* 3. 담당자 배지 · 클릭 → 담당자 변경 popover · 데스크탑 STAFF_COLORS 재사용 */}
                              <div
                                className="flex flex-wrap gap-1 justify-end cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  handleZoneCellClick(z, rect);
                                }}
                                title="담당자 변경"
                              >
                                {staffNames.length > 0 ? (
                                  staffNames.map((name) => {
                                    const emp = employees.find(e2 => e2.name === name);
                                    const colorIdx = emp ? (staffColorMap.get(emp.id) ?? 0) : 0;
                                    const chip = STAFF_COLORS[colorIdx % STAFF_COLORS.length];
                                    const isPharm = emp ? (emp.position === "약사" || emp.position.startsWith("약사")) : false;
                                    return (
                                      <span key={`${z.id}-${name}`} className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-bold border ${chip} active:scale-95 transition ${isPharm ? "ring-2 ring-emerald-500 ring-offset-1" : ""}`}>
                                        {name}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-zinc-400 bg-zinc-50 border border-dashed border-zinc-300 active:scale-95 transition">
                                    + 배정
                                  </span>
                                )}
                              </div>
                              {/* 4. 진열요청 버튼 · 고정 폭 */}
                              <div className="w-full">
                                {renderRequestButton(z.num, z.id)}
                              </div>
                            </li>
                          );
                        })}
                    </ul>
                  </Card>
                );
              })()}

              {/* ── 모바일 · 매장 구역도 fullscreen 모달 (읽기 전용 · 드래그 스크롤) ─── */}
              {/*   2026-08-03 · 사용자 요청 · 공용 StoreZoneMap 사용 · 카테고리 페이지와 동일 구조 */}
              {/*   셀 클릭 · 상품 조회 모달 오픈 (기존 데스크탑 map 동작과 동일) */}
              {fullMapOpen && (
                <div className="sm:hidden fixed inset-0 z-50 bg-zinc-900/70 backdrop-blur-sm flex flex-col" onClick={() => setFullMapOpen(false)}>
                  <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-line shadow-sm">
                    <span className="text-sm font-bold text-zinc-800">🗺️ 매장 구역도 (읽기 전용)</span>
                    <button onClick={() => setFullMapOpen(false)} className="w-8 h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600 text-lg font-bold">×</button>
                  </div>
                  <div className="flex-1 overflow-auto" onClick={e => e.stopPropagation()}>
                    <div className="p-2 bg-zinc-100">
                      <div className="p-2 bg-zinc-200 rounded-2xl border-4 border-emerald-500 shadow-inner">
                        <StoreZoneMap
                          onZoneClick={(zoneId) => {
                            // zoneId 예: "1A" · "9B" · "22" · "35" 등
                            const num = parseInt(zoneId, 10);
                            const side = /[AB]$/.test(zoneId) ? zoneId.slice(-1) : "";
                            const zd = ZONE_DEFS.find(z => z.num === num);
                            const category = side === "A" ? (zd?.subA ?? zd?.category ?? "")
                              : side === "B" ? (zd?.subB ?? zd?.category ?? "")
                              : (zd?.category ?? "");
                            const zoneLabel = side ? `진열대 ${num}${side}` : (num === 22 ? "진열대 22" : `벽면 ${num}`);
                            setZoneProductsModal({ zoneId, zoneNum: num, zoneLabel, category });
                            setZoneProductsFilter("all"); setZoneProductsSearch("");
                            setFullMapOpen(false);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="px-3 py-2 bg-white border-t border-line text-[10px] text-zinc-500 text-center">
                    💡 좌우로 드래그하여 전체 구역도 확인 · 셀 클릭 → 진열상품 조회
                  </div>
                </div>
              )}

              {/* ── MAP TAB (데스크탑 매장 배치도) · 모바일 숨김 · 2026-08-10 · 기본 접기 (사용자 요청) ─────────────── */}
              <div className="hidden sm:flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setMapCollapsed(v => !v)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[12px] font-bold shadow-sm transition cursor-pointer"
                  title="매장 구역도 열기/접기"
                >
                  🗺️ {mapCollapsed ? "매장 구역도 펼치기" : "매장 구역도 접기"}
                </button>
              </div>
              {/* Simulated 2D Floor Plan Grid matches map.png · 접혀있으면 렌더 X */}
              <div className={`hidden ${mapCollapsed ? "" : "sm:block"} overflow-x-auto`}>
                <div className="p-2 bg-zinc-200 rounded-2xl flex flex-col justify-between border-4 border-emerald-500 shadow-inner gap-2 min-h-[500px] w-full min-w-[820px] relative">

                  {/* ── 물류출근직원 pill (매장 배치도 내부 상단) ── */}
                  {todayStaff.length > 0 && (() => {
                    const 물류 = todayStaff.filter(s => s.employee.position.includes("물류"));
                    if (물류.length === 0) return null;
                    const ORDER: Record<string, number> = { "오픈": 0, "미들": 1, "마감": 2 };
                    const sortShift = (a: typeof todayStaff[0], b: typeof todayStaff[0]) => (ORDER[a.scheduleType] ?? 3) - (ORDER[b.scheduleType] ?? 3);
                    return (
                      <div className="bg-white/95 backdrop-blur rounded-lg border border-orange-200 px-2 py-1.5 shadow-sm inline-flex flex-wrap items-center gap-1 mb-1 w-fit max-w-full">
                        <span className="text-[10px] font-bold text-orange-700 mr-1">📦 물류 출근직원 ({물류.length})</span>
                        {물류.sort(sortShift).map(({ employee, scheduleType, workingHours }) => {
                          const colorIdx = staffColorMap.get(employee.id) ?? 0;
                          const chipColor = STAFF_COLORS[colorIdx % STAFF_COLORS.length];
                          return (
                            <button
                              key={employee.id}
                              type="button"
                              draggable
                              onDragStart={(e) => {
                                const s = { employee, scheduleType, workingHours };
                                dragStaffRef.current = s;
                                setDragStaff(s);
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", String(employee.id));
                              }}
                              onDragEnd={() => { dragStaffRef.current = null; setDragStaff(null); setDragOverZoneId(null); }}
                              onClick={() => setActiveStaffInfo({ employee, scheduleType, workingHours })}
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold border cursor-grab active:cursor-grabbing transition hover:brightness-95 ${chipColor}`}
                              title={`${employee.name} · ${scheduleType}${workingHours ? ` · ${workingHours}` : ""} · 드래그하여 구역 배정`}
                            >
                              <span>{employee.name}</span>
                              <span className={`text-[10px] font-bold px-1 rounded ${SHIFT_BADGE[scheduleType] ?? "bg-zinc-100 text-zinc-700 border-line"}`}>
                                {scheduleType}
                              </span>
                            </button>
                          );
                        })}
                        <button
                          onClick={handleAutoAssign}
                          title="물류 출근직원 미리보기 배치 (확정 전엔 DB 저장·알림 없음)"
                          className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-bold rounded-full shadow-sm transition cursor-pointer border border-violet-700"
                        >
                          🎲 임의배치
                        </button>
                        {pendingAutoAssign && (
                          <>
                            <button
                              onClick={handleConfirmAutoAssign}
                              title="DB 저장 + 각 담당자에게 날짜·배정구역 알림 전송"
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[10px] font-bold rounded-full shadow-sm transition cursor-pointer border border-emerald-700 animate-pulse"
                            >
                              <Bell size={9} /> 배치확정 ({pendingAutoAssign.assignedList.length})
                            </button>
                            <button
                              onClick={handleCancelAutoAssign}
                              title="미리보기 취소 · 이전 배치로 되돌리기"
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-white hover:bg-zinc-50 text-zinc-600 text-[10px] font-bold rounded-full shadow-sm transition cursor-pointer border border-zinc-300"
                            >
                              ↺ 취소
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  {/* 미리보기 안내 배너 (얇은 힌트) */}
                  {pendingAutoAssign && (
                    <div className="bg-violet-50 border border-violet-200 rounded-lg px-2 py-1 text-[9px] text-violet-700 mb-1 flex items-center gap-1.5">
                      <span>🎲</span>
                      <span>임의배치 미리보기 중 — 배치를 조정한 뒤 위쪽 <b>배치확정</b> 버튼을 눌러 DB 저장 + 담당자 알림 전송</span>
                    </div>
                  )}

                  {/* SECTION 1: TOP HORIZONTAL BAND — 신규 배치 (2026 개편) */}
                  {/* 상단: 21→9 (좌→우 감소, 13개)  ·  중앙: 22 + 8-1 각 B|A  ·  하단: 23→34 (좌→우 증가, 12개) */}
                  <div className="flex flex-col md:flex-row md:justify-between md:items-stretch gap-3 w-full shrink-0">

                    {/* Main Horizontal Shelving Wing: Top Wall, Aisle Shelves, Bottom Wall */}
                    <div className="flex-1 bg-white border-2 border-emerald-600 rounded-xl p-2 md:p-3 flex flex-col shadow-sm relative min-w-0">

                      {/* 미니 위치 다이어그램: 수평윙(현재 표시 영역) 강조 */}
                      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-white border border-line rounded-lg px-2 py-1 shadow-sm">
                        <svg width="36" height="28" viewBox="0 0 42 34" className="shrink-0" aria-label="수평윙 위치">
                          {/* 메인 매장 (수평 윙 · 현재 영역 · 강조) */}
                          <rect x="1" y="1" width="30" height="20" rx="1.5" fill="#10b981" stroke="#047857" strokeWidth="1" />
                          {/* 수직 윙 (다른 영역 · 회색 아웃라인) */}
                          <rect x="31" y="1" width="10" height="32" rx="1.5" fill="none" stroke="#cbd5e1" strokeWidth="1.2" />
                          {/* 현재 위치 마커 (수평윙 중앙) */}
                          <circle cx="16" cy="11" r="2" fill="#fbbf24" />
                        </svg>
                        <span className="text-[10px] font-bold text-zinc-600 leading-none">수평 윙</span>
                      </div>

                      {/* 상단 벽면: 21→9 좌→우 (13개) · 모바일 4열 wrap 순차 · 데스크탑 13열 한 줄 */}
                      <div className="w-full">
                        <div className="text-[7px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">상단 벽면 (21→9)</div>
                        <div className="grid grid-cols-4 md:grid-cols-[repeat(13,minmax(0,1fr))] gap-1 bg-zinc-100 p-1 rounded">
                          {STORE_TOP_WALL.map((num) => renderWallZoneCard(num, "top"))}
                        </div>
                      </div>

                      {/* 중앙 진열대: 22 + 8B/8A/7B/7A/.../1B/1A (16개 세로 진열대 나란히) */}
                      <div className="my-3 w-full">
                        <div className="text-[7px] font-bold text-zinc-400 uppercase tracking-wider mb-1">중앙 진열대 (22 · 8B|8A → 1B|1A · 16구역)</div>
                        {/* 반응형: 모바일 (sm 이하) 에서는 2 pair 씩 wrap · 데스크탑은 한 줄 유지 */}
                        <div className="flex flex-wrap md:flex-nowrap items-stretch justify-start md:pr-3 px-1.5 bg-zinc-50 border border-line py-2 rounded-lg gap-1.5">
                          {/* 진열대 22 (좌측 첫 번째, 단독) · 왼쪽 벽에 붙임 · 좁은 고정 폭 */}
                          <div className="flex flex-col items-center gap-0.5 basis-full md:basis-auto md:flex-none md:w-[40px] md:min-w-[40px] md:mr-1">
                            <button
                              type="button"
                              onClick={() => {
                                const zd = ZONE_DEFS.find(z => z.num === STORE_AISLE_CENTER);
                                setZoneProductsModal({ zoneId: "22", zoneNum: 22, zoneLabel: `진열대 22`, category: zd?.category ?? "" });
                                setZoneProductsFilter("all"); setZoneProductsSearch("");
                              }}
                              title="22 카테고리 클릭 → 상품 리스트 보기"
                              className="w-full text-[10px] font-bold text-zinc-700 bg-white border-2 border-zinc-300 rounded px-0.5 py-0.5 leading-tight text-center h-[56px] flex items-center justify-center overflow-hidden cursor-pointer hover:bg-zinc-50 transition">
                              <span className="line-clamp-4">{ZONE_DEFS.find(z => z.num === STORE_AISLE_CENTER)?.category ?? ""}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const zd = ZONE_DEFS.find(z => z.num === STORE_AISLE_CENTER);
                                setZoneProductsModal({ zoneId: "22", zoneNum: 22, zoneLabel: `진열대 22`, category: zd?.category ?? "" });
                                setZoneProductsFilter("all"); setZoneProductsSearch("");
                              }}
                              title="22 구역 상품 리스트 보기"
                              className="w-full text-[9px] font-bold text-white bg-zinc-600 rounded px-0.5 py-0.5 text-center leading-none cursor-pointer hover:brightness-110 transition"
                            >22</button>
                            {renderZoneCell(22, "w-full h-[80px] flex flex-col justify-between items-center py-1 px-0.5 text-[9px]")}
                            <div className="w-full h-[56px]" />
                          </div>
                          {/* 진열대 8→1 각각 B|A pair — 카테고리 라벨은 A/B 합친 폭으로 넓게 표시 */}
                          {(() => {
                            // A=진한 톤 (셀 색상 = bg-{color}-600) / B=연한 톤 (셀 색상 = bg-{color}-300)
                            // 대비가 명확히 보이도록 A는 진한 배경, B는 연한 배경
                            // 2026-07-29 · shared CAT_A_COLORS/CAT_B_COLORS 사용 (storeMapLayout.ts)
                            return STORE_AISLE_PAIRS.map((num) => {
                              const ca = CAT_A_COLORS[num];
                              const cb = CAT_B_COLORS[num];
                              const zd = ZONE_DEFS.find(z => z.num === num);
                              const subB = getZoneSubLabel(`${num}B`) || (zd?.subB ?? "");
                              const subA = getZoneSubLabel(`${num}A`) || (zd?.subA ?? "");
                              return (
                                <div key={`pair-${num}`} className="flex flex-col items-stretch gap-0.5 basis-[calc(50%-6px)] md:basis-0 md:flex-[2_2_0%] md:min-w-[60px]">
                                  {/* 상단: B 카테고리 (연한 톤) */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setZoneProductsModal({ zoneId: `${num}B`, zoneNum: num, zoneLabel: `진열대 ${num}B`, category: subB });
                                      setZoneProductsFilter("all"); setZoneProductsSearch("");
                                    }}
                                    title={`${num}B 카테고리 → 상품 조회`}
                                    className={`w-full text-[10px] font-bold ${cb.text} ${cb.bg} border-2 ${cb.border} rounded px-0.5 py-0.5 leading-tight text-center h-[56px] flex flex-col items-center justify-center overflow-hidden cursor-pointer hover:brightness-95 transition`}>
                                    <span className={`text-[10px] font-bold text-white ${cb.labelBg} rounded px-1 py-0.5 leading-none mb-0.5`}>{getZoneLabel(`${num}B`)}</span>
                                    <span className="line-clamp-3 text-[10px]">{subB}</span>
                                  </button>
                                  {/* 드래그드롭 zone (B|A 나란히) */}
                                  <div className="flex gap-0.5 items-stretch">
                                    <div className="flex-1 flex flex-col gap-0.5">
                                      {renderZoneCellById(`${num}B`, "w-full h-[80px] flex flex-col justify-between items-center py-0.5 px-0.5 text-[9px]", "", true)}
                                      {renderRequestButton(num, `${num}B`)}
                                    </div>
                                    <div className="flex-1 flex flex-col gap-0.5">
                                      {renderZoneCellById(`${num}A`, "w-full h-[80px] flex flex-col justify-between items-center py-0.5 px-0.5 text-[9px]", "", true)}
                                      {renderRequestButton(num, `${num}A`)}
                                    </div>
                                  </div>
                                  {/* 하단: A 카테고리 (진한 톤) */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setZoneProductsModal({ zoneId: `${num}A`, zoneNum: num, zoneLabel: `진열대 ${num}A`, category: subA });
                                      setZoneProductsFilter("all"); setZoneProductsSearch("");
                                    }}
                                    title={`${num}A 카테고리 → 상품 조회`}
                                    className={`w-full text-[10px] font-bold ${ca.text} ${ca.bg} border-2 ${ca.border} rounded px-0.5 py-0.5 leading-tight text-center h-[56px] flex flex-col items-center justify-center overflow-hidden cursor-pointer hover:brightness-95 transition`}>
                                    <span className={`text-[10px] font-bold text-white ${ca.labelBg} rounded px-1 py-0.5 leading-none mb-0.5`}>{getZoneLabel(`${num}A`)}</span>
                                    <span className="line-clamp-3 text-[10px]">{subA}</span>
                                  </button>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>

                      {/* 하단 벽면: 23→34 좌→우 (12개) · 모바일 4열 wrap · 데스크탑 12열 한 줄 */}
                      <div className="w-full">
                        <div className="text-[7px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">하단 벽면 (23→34)</div>
                        <div className="grid grid-cols-4 md:grid-cols-12 gap-1 bg-zinc-100 p-1 rounded">
                          {STORE_BOTTOM_WALL.map((num) => renderWallZoneCard(num, "bottom"))}
                        </div>
                      </div>

                      {/* Expiring Products Zone Marker at far right of top wing */}
                      <div className="absolute top-1 right-2 bg-rose-50 text-rose-700 text-[10px] border border-rose-300 font-extrabold px-1.5 rounded-full uppercase tracking-wider shadow-sm">
                        유통기한 임박존
                      </div>
                    </div>

                  </div>

                  {/* SECTION 2: 동측 윙 — 전체 폭 */}
                  <div className="w-full mt-2 bg-white border border-line rounded-2xl p-3 flex flex-col gap-3 shadow-md shadow-zinc-200/60 relative">

                    <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-zinc-900 flex items-center justify-center shadow-sm">
                          <span className="text-[10px]">🚪</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-zinc-900 leading-none">동측 윙</span>
                          <span className="text-[10px] font-semibold text-zinc-400 leading-none mt-0.5 uppercase tracking-wider">Counter · Event · Front Display</span>
                        </div>
                      </div>
                      {/* 미니 위치 다이어그램 · 세련된 카드 */}
                      <div className="flex items-center gap-1.5 bg-zinc-50 border border-line rounded-lg px-2 py-1">
                        <svg width="30" height="24" viewBox="0 0 42 34" className="shrink-0" aria-label="수직윙 위치">
                          <rect x="1" y="1" width="30" height="20" rx="1.5" fill="none" stroke="#cbd5e1" strokeWidth="1.2" />
                          <rect x="31" y="1" width="10" height="32" rx="1.5" fill="#0f172a" />
                          <circle cx="36" cy="17" r="2" fill="#fbbf24" />
                        </svg>
                        <span className="text-[10px] font-bold text-zinc-600 leading-none">현재 위치</span>
                      </div>
                    </div>

                    {/* 1단: 베스트존 (이벤트 3구역) — 35·36·37 */}
                    <div className="w-full bg-zinc-50/60 rounded-xl p-2.5 flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-zinc-800 uppercase tracking-wide flex items-center gap-1">
                          <span className="w-1 h-3 bg-amber-500 rounded-full inline-block" />
                          베스트존
                        </span>
                        <span className="text-[10px] font-semibold text-zinc-400">이벤트 3구역 · 35·36·37</span>
                      </div>
                      <div className="flex gap-1.5 items-stretch">
                        {[35, 36, 37].map(num => (
                          <div key={`event-slot-${num}`} className="flex-1 flex flex-col gap-0.5">
                            <span className="text-[10px] font-bold text-zinc-500 leading-none">이벤트 · {num}</span>
                            {renderZoneCell(num, "w-full h-[70px] text-[9px] p-1 justify-center")}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 2단: 메인 카운터 (40 A/B/C) */}
                    <div className="w-full bg-zinc-50/60 rounded-xl p-2.5 flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-zinc-800 uppercase tracking-wide flex items-center gap-1">
                          <span className="w-1 h-3 bg-zinc-900 rounded-full inline-block" />
                          메인 카운터
                        </span>
                        <span className="text-[10px] font-semibold text-zinc-400">3구역 · 40A · 40B · 40C</span>
                      </div>
                      <div className="flex gap-1.5 items-stretch">
                        {(["A", "B", "C"] as const).map((side) => (
                          <div key={`counter-${side}`} className="flex-1 flex flex-col gap-0.5">
                            <span className="text-[10px] font-bold text-zinc-500 leading-none">카운터 {side === "A" ? "1" : side === "B" ? "2" : "3"}</span>
                            {renderZoneCellById(`40${side}`, "w-full h-[70px] justify-between items-center text-[9px] p-1 bg-brand-deep text-white", "", true)}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 3단: 정면 약진열 (38) + 시설 (41, 39) */}
                    <div className="w-full flex gap-2">
                      <div className="flex-[3] bg-zinc-50/60 rounded-xl p-2.5 flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-zinc-800 uppercase tracking-wide flex items-center gap-1">
                            <span className="w-1 h-3 bg-emerald-500 rounded-full inline-block" />
                            정면 약진열
                          </span>
                          <span className="text-[10px] font-semibold text-zinc-400">38</span>
                        </div>
                        {renderZoneCell(38, "w-full h-[70px] justify-center bg-emerald-600 text-white text-[9px] p-1 font-bold")}
                      </div>
                      <div className="flex-[2] bg-zinc-50/60 rounded-xl p-2.5 flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-zinc-800 uppercase tracking-wide flex items-center gap-1">
                            <span className="w-1 h-3 bg-zinc-400 rounded-full inline-block" />
                            시설
                          </span>
                        </div>
                        <div className="flex gap-1.5 flex-1">
                          <div className="flex-1 flex flex-col gap-0.5">
                            <span className="text-[10px] font-bold text-zinc-500 leading-none">☕ 휴게실</span>
                            {renderZoneCell(41, "w-full h-[70px] text-[9px] bg-zinc-200 text-zinc-700 justify-center border-none")}
                          </div>
                          <div className="flex-1 flex flex-col gap-0.5">
                            <span className="text-[10px] font-bold text-zinc-500 leading-none">🗄️ 사물함</span>
                            {renderZoneCell(39, "w-full h-[70px] text-[9px] bg-zinc-200 text-zinc-700 justify-center border-none")}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-zinc-400 pt-1 leading-none">
                      <span>🛗 1층 연결 EV · 🛒 카트존</span>
                      <span>🚰 수도 시설</span>
                    </div>
                  </div>{/* end SECTION 2 동측 윙 */}

                </div>
              </div>{/* end overflow-x-auto */}

              {/* 2026-08-16 · 사용자 지시 · 진열요청 목록 · 매장구역도 접힘 무관 · 항상 표시 · 아래 */}
              <div className="hidden sm:block mt-3">
                <DisplayRequestPanel
                  filteredReqs={filteredReqs}
                  requests={requests}
                  reqFilter={reqFilter}
                  setReqFilter={setReqFilter}
                  setRequests={setRequests}
                  formatRel={formatRel}
                />
              </div>
            </div>
          </section>

        </main>
      )}

      {/* Footer */}
      <footer className="bg-white text-center p-4 mt-8 text-xs text-gray-400 border-t border-line">
        &copy; 2026 {dpBrand.shortName || "오산메가타운"} 매장 관리 시스템. All Rights Reserved. {dpContact.copyrightText || "(주)이룸즈(IRUMS)"}
      </footer>

      {/* ─── Zone Assignment Popover ────────────────────────────────────────── */}
      {popoverAnchor && popoverZone && (
        <ZoneAssignPopover
          zone={popoverZone}
          anchor={popoverAnchor.rect}
          logisticsStaff={logisticsStaff}
          staffColorMap={staffColorMap}
          onAssign={handlePopoverAssign}
          onUnassign={handlePopoverUnassign}
          onOpenDetail={() => handleOpenZoneDetail(popoverZone)}
          onOpenProducts={() => {
            setZoneProductsModal({ zoneId: popoverZone.id, zoneNum: popoverZone.num, zoneLabel: popoverZone.label, category: popoverZone.category });
            setZoneProductsFilter("all");
            setZoneProductsSearch("");
            setPopoverAnchor(null);
          }}
          onClose={() => setPopoverAnchor(null)}
          onStaffInfoClick={(staff) => { setActiveStaffInfo(staff); setPopoverAnchor(null); }}
        />
      )}

      {/* ─── Zone Detail Modal ────────────────────────────────────────────────── */}
      {activeZone && (
        // 2026-08-17 v2 · Modal 통일
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center backdrop-brand" onClick={() => setActiveZoneId(null)}>
          <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-brand-modal max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="px-5 py-4 border-b border-line flex items-center gap-3 bg-zinc-50">
              <div className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center shrink-0 font-bold text-lg ${statusCell(draftStatus)}`}>
                {activeZone.num}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold text-zinc-900 truncate">{activeZone.label}</div>
                <div className="text-[11px] text-zinc-500">{activeZone.category}</div>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusBadge(draftStatus)}`}>
                {STATUS_LABEL[draftStatus]}
              </span>
              <button onClick={() => setActiveZoneId(null)} className="w-8 h-8 rounded-lg hover:bg-zinc-200 flex items-center justify-center text-zinc-500 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* Assigned staff */}
              <div>
                <label className="text-xs font-semibold text-zinc-600 mb-2 flex items-center gap-1 block">
                  <User size={11} />담당 직원
                </label>
                {(() => {
                  const assignedStaff = employees.find((e) => e.id === draftStaffId) ?? null;
                  const isLogistics = assignedStaff?.position.includes("물류");
                  const colorIdx = assignedStaff ? (staffColorMap.get(assignedStaff.id) ?? 0) : 0;
                  return assignedStaff ? (
                    <div className="flex items-center gap-3 px-3 py-3 rounded-xl border-2 border-indigo-200 bg-indigo-50">
                      {/* 2026-08-17 · 최신 트렌드 · 이름 이니셜 2글자 · brand-tint 뉴트럴 · 폰트 subtle */}
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0 bg-brand-tint text-brand-deep">
                        {assignedStaff.name.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-zinc-900">{assignedStaff.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isLogistics ? "bg-indigo-200 text-indigo-800" : "bg-zinc-200 text-zinc-600"}`}>
                            {assignedStaff.position || "약사"}
                          </span>
                        </div>
                      </div>
                      <button type="button" onClick={() => setDraftStaffId(null)}
                        className="text-zinc-400 hover:text-zinc-600 transition cursor-pointer p-1">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <select value="" onChange={(e) => setDraftStaffId(e.target.value === "" ? null : Number(e.target.value))}
                      disabled={employees.length === 0}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border-2 border-dashed border-zinc-300 bg-white focus:border-brand-deep outline-none transition cursor-pointer disabled:bg-zinc-50 text-zinc-500">
                      <option value="">— 담당 직원 선택 —</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>{emp.name}{emp.position ? ` (${emp.position})` : ""}</option>
                      ))}
                    </select>
                  );
                })()}
              </div>

              {/* 요일별 담당 (다중 요일 선택) */}
              {activeZone.assignedStaffName && (
                <div>
                  <label className="text-xs font-semibold text-zinc-600 mb-2 flex items-center gap-1">
                    적용 요일
                    <span className="text-[10px] font-normal text-zinc-400">체크된 요일에만 이 담당이 표시됩니다</span>
                  </label>
                  <div className="space-y-2">
                    {activeZone.assignedStaffName.split(",").map(s => s.trim()).filter(Boolean).map((name) => {
                      const mask = activeZone.dowMap?.[name] ?? DOW_ALL;
                      return (
                        <div key={name} className="flex items-center gap-2 flex-wrap px-2 py-1.5 bg-zinc-50 rounded-lg border border-line">
                          <span className="text-xs font-bold text-zinc-700 shrink-0 min-w-[3rem]">{name}</span>
                          <div className="flex items-center gap-1 flex-wrap">
                            {DOW_LABELS.map((lb, dow) => {
                              const active = ((mask >> dow) & 1) === 1;
                              return (
                                <button
                                  key={dow}
                                  type="button"
                                  onClick={() => toggleZoneDow(activeZone.id, name, dow)}
                                  className={`w-7 h-7 text-[11px] font-bold rounded-md border transition cursor-pointer ${active
                                      ? (dow === 0 ? "bg-rose-500 text-white border-rose-500"
                                        : dow === 6 ? "bg-sky-500 text-white border-sky-500"
                                          : "bg-brand-deep text-white border-indigo-500")
                                      : "bg-white text-zinc-400 border-line hover:border-zinc-300"
                                    }`}
                                  title={`${lb}요일 ${active ? "제외" : "포함"}`}
                                >{lb}</button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Status */}
              <div>
                <label className="text-xs font-semibold text-zinc-600 mb-2 block">진열 상태</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["normal", "low", "empty"] as const).map((s) => (
                    <button key={s} type="button" onClick={() => setDraftStatus(s)}
                      className={`py-2.5 text-xs font-semibold rounded-xl border-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${draftStatus === s
                        ? s === "normal" ? "bg-emerald-50 text-emerald-700 border-emerald-400 shadow-sm"
                          : s === "low" ? "bg-amber-50 text-amber-700 border-amber-400 shadow-sm"
                            : "bg-red-50 text-red-700 border-red-400 shadow-sm"
                        : "bg-white text-zinc-500 border-line hover:border-zinc-300"}`}>
                      <span className={`w-2 h-2 rounded-full ${statusDot(s)}`} />
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Products */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-zinc-600">진열 상품 메모</label>
                  <button
                    type="button"
                    onClick={() => setScannerMode("products")}
                    title="바코드 스캔으로 상품 추가"
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer"
                  >
                    <ScanLine size={11} />
                    바코드 스캔
                  </button>
                </div>
                <textarea value={draftProducts} onChange={(e) => setDraftProducts(e.target.value)} rows={2}
                  placeholder="예: 타이레놀 500mg, 베아제, 판콜에이..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 bg-white focus:border-brand-deep focus:ring-2 focus:ring-brand-tint outline-none transition resize-none" />
              </div>

              {/* Request note */}
              {(draftStatus === "low" || draftStatus === "empty") && (
                <div>
                  <label className="text-xs font-semibold text-zinc-600 mb-1.5 block">요청 메모 (선택)</label>
                  <input type="text" value={requestNote} onChange={(e) => setRequestNote(e.target.value)}
                    placeholder="오늘 오후까지 보충 부탁드립니다"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 bg-white focus:border-brand-deep outline-none transition" />
                </div>
              )}

              {savedFlash && (
                <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircle2 size={13} />저장되었습니다
                </div>
              )}
              {requestFlash && (
                <div className="px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold flex items-center gap-1.5">
                  <Send size={13} />진열 요청이 전송되었습니다
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-5 py-3 border-t border-line bg-zinc-50 flex flex-col-reverse sm:flex-row gap-2">
              <button onClick={handleSave}
                className="flex-1 sm:flex-none px-4 py-2.5 text-sm font-semibold rounded-xl bg-white border border-zinc-300 text-zinc-700 hover:bg-zinc-100 transition cursor-pointer flex items-center justify-center gap-1.5">
                <Save size={14} />저장
              </button>
              <button onClick={handleSendRequest} disabled={!canRequest}
                title={!canRequest ? "상태를 부족/품절로 변경하고 담당 직원을 배정하세요" : ""}
                className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition cursor-pointer flex items-center justify-center gap-2 disabled:bg-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-400 shadow-sm shadow-violet-200">
                <Send size={15} />진열 요청 보내기
                {!canRequest && <span className="text-[10px] font-normal opacity-70">(부족·품절 + 담당자 필요)</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Employee Info Modal ──────────────────────────────────────────────── */}
      {activeStaffInfo && (
        // 2026-08-17 v2 · Modal 통일
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center backdrop-brand"
          onClick={() => setActiveStaffInfo(null)}>
          <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-brand-modal overflow-hidden"
            onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            {(() => {
              const colorIdx = staffColorMap.get(activeStaffInfo.employee.id) ?? 0;
              const isLogistics = activeStaffInfo.employee.position.includes("물류");
              return (
                <div className={`px-5 py-5 ${isLogistics ? "bg-brand-deep" : "bg-zinc-700"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {/* 2026-08-17 · 최신 트렌드 · 이름 이니셜 2글자 · 폰트 subtle */}
                      <div className="w-14 h-14 rounded-full bg-white/[0.18] flex items-center justify-center text-[16px] font-semibold text-white shrink-0 ring-1 ring-white/25">
                        {activeStaffInfo.employee.name.slice(0, 2)}
                      </div>
                      <div>
                        <div className="text-xl font-bold text-white leading-tight">{activeStaffInfo.employee.name}</div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/25 text-white">
                            {activeStaffInfo.employee.position || "약사"}
                          </span>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${SHIFT_BADGE[activeStaffInfo.scheduleType] ?? "bg-zinc-100 text-zinc-700 border-line"}`}>
                            {activeStaffInfo.scheduleType}
                          </span>
                          {activeStaffInfo.workingHours && (
                            <span className="text-[11px] text-white/80 font-medium">{activeStaffInfo.workingHours}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setActiveStaffInfo(null)}
                      className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white cursor-pointer transition">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Zone assignment (logistics only) */}
            {activeStaffInfo.employee.position.includes("물류") ? (
              <div className="px-5 pt-3 pb-2 max-h-[60vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-700">
                    <MapPin size={12} className="text-indigo-500" />
                    구역 배정
                    {/* 2026-08-17 · StatusPill 프레임워크 통일 */}
                    {getAssignedZones(activeStaffInfo.employee.id).length > 0 && (
                      <StatusPill tone="indigo" size="xs">
                        {getAssignedZones(activeStaffInfo.employee.id).length}개
                      </StatusPill>
                    )}
                  </div>
                  {getAssignedZones(activeStaffInfo.employee.id).length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const empId = activeStaffInfo.employee.id;
                        setZones(prev => prev.map(z =>
                          z.assignedStaffId === empId
                            ? { ...z, assignedStaffId: null, assignedStaffName: "" }
                            : z
                        ));
                      }}
                      className="text-[10px] font-bold text-rose-500 hover:text-rose-700 px-2 py-1 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                    >
                      전체 해제
                    </button>
                  )}
                </div>
                {/* Zone grid by section */}
                {(["top_wall", "aisle", "left_wall", "bottom_wall", "wing", "event"] as const).map((section) => {
                  const sectionZones = zones.filter(z => z.section === section);
                  const sectionLabel: Record<string, string> = { top_wall: "상단 벽면", aisle: "중앙 진열대", left_wall: "좌측 벽면", bottom_wall: "하단 벽면", wing: "우측 윙", event: "이벤트존" };
                  return (
                    <div key={section} className="mb-3">
                      <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">{sectionLabel[section]}</div>
                      <div className="grid grid-cols-5 gap-1">
                        {sectionZones.map((z) => {
                          const empId = activeStaffInfo.employee.id;
                          const isAssigned = z.assignedStaffId === empId;
                          const otherName = !isAssigned && z.assignedStaffId !== null ? z.assignedStaffName : null;
                          return (
                            <button
                              key={z.id}
                              type="button"
                              onClick={() => {
                                setZones(prev => prev.map(zone =>
                                  zone.id !== z.id ? zone : (
                                    isAssigned
                                      ? { ...zone, assignedStaffId: null, assignedStaffName: "" }
                                      : { ...zone, assignedStaffId: empId, assignedStaffName: activeStaffInfo.employee.name }
                                  )
                                ));
                              }}
                              title={otherName ? `현재: ${otherName} 담당 (클릭 시 재배정)` : z.category}
                              className={`rounded-lg border-2 p-1 text-left transition-all cursor-pointer active:scale-95 ${isAssigned
                                  ? "bg-indigo-100 border-indigo-400 shadow-sm"
                                  : otherName
                                    ? "bg-amber-50 border-amber-300 hover:border-indigo-300"
                                    : "bg-white border-line hover:border-indigo-300 hover:bg-indigo-50"
                                }`}
                            >
                              {/* 1-8 은 A/B 로 구분되므로 번호 유지 · 9+ 는 카테고리 라벨과 중복이므로 번호 숨김 */}
                              {z.num <= 8 && (
                                <div className={`text-[10px] font-bold leading-tight ${isAssigned ? "text-indigo-800" : otherName ? "text-amber-700" : "text-zinc-700"}`}>
                                  {z.num}
                                  {z.id.endsWith("A") && "A"}
                                  {z.id.endsWith("B") && "B"}
                                </div>
                              )}
                              <div className={`text-[10px] leading-none ${z.num <= 8 ? "mt-0.5" : "mt-0"} truncate ${isAssigned ? "text-indigo-500" : otherName ? "text-amber-500" : "text-zinc-400"}`}>
                                {otherName ? otherName : z.label}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-5 py-4">
                <div className="flex flex-col items-center py-4 text-zinc-400 text-xs text-center bg-zinc-50 rounded-xl border border-dashed border-line">
                  <Sparkles size={18} className="mb-1 opacity-30" />
                  구역 배정은 물류 직원에게만 적용됩니다
                </div>
              </div>
            )}

            <div className="px-5 pb-5">
              <button onClick={() => setActiveStaffInfo(null)}
                className="w-full py-2.5 text-sm font-semibold rounded-xl bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition cursor-pointer">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 구역별 상품 리스트 모달 ── */}
      {zoneProductsModal && (() => {
        // 매칭 로직: DB products.spec (전산배치구역) + real_map (실제배치구역) 병합 조회
        // spec 형식 예: "9B" · "21" · "5A" · "18번 임산부영양제" (real_map)
        const zoneId = zoneProductsModal.zoneId;
        const zoneNum = zoneProductsModal.zoneNum;
        // 두 가지 형식 모두 파싱 (N번… 또는 N + A/B 접미)
        const parseSideAndNum = (v: string): { num: number; side: "A" | "B" | null } | null => {
          const s = v.trim();
          // 1) "18번 ..." 형식 (real_map)
          const m1 = /^(\d+)번[^A-Z]*?([AB])?$/.exec(s);
          if (m1) return { num: Number(m1[1]), side: (m1[2] as "A" | "B") ?? null };
          // 2) "9B" · "5A" · "21" 형식 (spec)
          const m2 = /^(\d+)([AB])?$/.exec(s);
          if (m2) return { num: Number(m2[1]), side: (m2[2] as "A" | "B") ?? null };
          return null;
        };
        const isAisle18 = zoneNum >= 1 && zoneNum <= 8;
        const zoneSide: "A" | "B" | null = zoneId.endsWith("A") ? "A" : zoneId.endsWith("B") ? "B" : null;
        const matchesZone = (raw: string | null | undefined): boolean => {
          if (!raw) return false;
          const parsed = parseSideAndNum(String(raw));
          if (!parsed) return false;
          if (parsed.num !== zoneNum) return false;
          if (isAisle18) return parsed.side === zoneSide || parsed.side === null;
          return true;
        };
        // spec (전산배치구역) OR real_map (실제배치구역) 중 하나라도 이 구역에 속하면 매칭
        const matched = (Object.values(productsMap) as ProductInfo[]).filter(p =>
          matchesZone(p.spec) || matchesZone(p.real_map)
        );
        // 검색 필터
        const q = zoneProductsSearch.trim().toLowerCase();
        const filteredRaw = matched.filter((p: ProductInfo) => {
          if (q && !(String(p.name ?? "").toLowerCase().includes(q))) return false;
          if (zoneProductsFilter === "mismatch") {
            const specStr = String(p.spec ?? "").trim();
            const realStr = String(p.real_map ?? "").trim();
            if (specStr === realStr) return false;
          }
          return true;
        });
        // 정렬
        const cmpStr = (a: string, b: string) => a.localeCompare(b, "ko");
        const cmpNum = (a: number, b: number) => a - b;
        const numOrNaN = (v: any) => v != null && v !== "" ? Number(v) : NaN;
        const realTotal = (p: any) => {
          const wh = numOrNaN(p.warehouse_stock);
          const st = numOrNaN(p.store_stock);
          if (!Number.isFinite(wh) && !Number.isFinite(st)) return -Infinity;
          return (Number.isFinite(wh) ? wh : 0) + (Number.isFinite(st) ? st : 0);
        };
        const lossOf = (p: any) => {
          const closing = numOrNaN(p.closing_stock);
          const cur = numOrNaN(p.current_stock);
          return (Number.isFinite(closing) && Number.isFinite(cur)) ? closing - cur : -Infinity;
        };
        const statusRank = (p: any) => {
          const cur = numOrNaN(p.current_stock);
          const opt = numOrNaN(p.optimal_stock);
          if (!Number.isFinite(cur)) return 5; // 미확인 뒤로
          if (cur <= 0) return 0; // 품절 앞으로
          if (cur < 3) return 1;  // 임박
          if (Number.isFinite(opt) && opt > 0 && cur < opt) return 2; // 적정이하
          return 3; // 정상
        };
        const filtered = [...filteredRaw].sort((a, b) => {
          const dir = zoneProductsSort.dir === "asc" ? 1 : -1;
          switch (zoneProductsSort.key) {
            case "name": return dir * cmpStr(String(a.name ?? ""), String(b.name ?? ""));
            case "spec": return dir * cmpStr(String(a.spec ?? ""), String(b.spec ?? ""));
            case "real_map": return dir * cmpStr(String(a.real_map ?? ""), String(b.real_map ?? ""));
            case "current_stock": {
              const aS = numOrNaN((a as any).current_stock); const bS = numOrNaN((b as any).current_stock);
              return dir * cmpNum(Number.isFinite(aS) ? aS : -Infinity, Number.isFinite(bS) ? bS : -Infinity);
            }
            case "warehouse_stock": {
              const aS = numOrNaN((a as any).warehouse_stock); const bS = numOrNaN((b as any).warehouse_stock);
              return dir * cmpNum(Number.isFinite(aS) ? aS : -Infinity, Number.isFinite(bS) ? bS : -Infinity);
            }
            case "store_stock": {
              const aS = numOrNaN((a as any).store_stock); const bS = numOrNaN((b as any).store_stock);
              return dir * cmpNum(Number.isFinite(aS) ? aS : -Infinity, Number.isFinite(bS) ? bS : -Infinity);
            }
            case "real_total": return dir * cmpNum(realTotal(a), realTotal(b));
            case "loss": return dir * cmpNum(lossOf(a), lossOf(b));
            case "optimal_stock": {
              const aS = numOrNaN((a as any).optimal_stock); const bS = numOrNaN((b as any).optimal_stock);
              return dir * cmpNum(Number.isFinite(aS) ? aS : -Infinity, Number.isFinite(bS) ? bS : -Infinity);
            }
            case "status": return dir * cmpNum(statusRank(a), statusRank(b));
            case "mismatch": {
              const aMis = (String(a.spec ?? "").trim() !== String(a.real_map ?? "").trim()) ? 1 : 0;
              const bMis = (String(b.spec ?? "").trim() !== String(b.real_map ?? "").trim()) ? 1 : 0;
              return dir * cmpNum(aMis, bMis);
            }
          }
        });
        const toggleSort = (key: typeof zoneProductsSort.key) => {
          setZoneProductsSort(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
        };
        const sortIcon = (key: typeof zoneProductsSort.key) =>
          zoneProductsSort.key !== key ? "↕" : zoneProductsSort.dir === "asc" ? "▲" : "▼";
        return (
          // 2026-08-17 v2 · Modal 통일
          <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-brand p-2 sm:p-4" onClick={() => setZoneProductsModal(null)}>
            <div className="bg-white rounded-2xl shadow-brand-modal w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="px-5 py-4 border-b border-line bg-emerald-50 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">구역별 상품 리스트</div>
                  <div className="text-lg font-bold text-zinc-800 mt-0.5">{zoneProductsModal.zoneLabel}</div>
                  {zoneProductsModal.category && (
                    <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{zoneProductsModal.category}</div>
                  )}
                </div>
                <button onClick={() => setZoneProductsModal(null)} className="text-zinc-400 hover:text-zinc-700 text-2xl font-bold w-8 h-8 rounded-lg hover:bg-white/70 cursor-pointer flex items-center justify-center">×</button>
              </div>
              {/* Filters */}
              <div className="px-4 py-2 bg-zinc-50 border-b border-line flex items-center gap-2 flex-wrap">
                <input type="text" value={zoneProductsSearch} onChange={e => setZoneProductsSearch(e.target.value)} placeholder="상품명 검색"
                  className="flex-1 min-w-[120px] text-[11px] border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:border-brand-deep" />
                <div className="inline-flex bg-white border border-zinc-300 rounded p-0.5">
                  <button onClick={() => setZoneProductsFilter("all")} className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer transition ${zoneProductsFilter === "all" ? "bg-brand-deep text-white" : "text-zinc-500"}`}>전체</button>
                  <button onClick={() => setZoneProductsFilter("mismatch")} className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer transition ${zoneProductsFilter === "mismatch" ? "bg-rose-500 text-white" : "text-rose-500"}`}>⚠️ 불일치</button>
                </div>
                <span className="text-[10px] font-bold text-zinc-500 ml-auto">{filtered.length}/{matched.length}건</span>
              </div>
              {/* List — 재고관리 페이지와 동일한 컬럼 구성 (ERP · 창고 · 매장 · 실재고 · 적정 · 상황) · 가로 스크롤 없음 */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden bg-zinc-50 p-2 sm:p-4">
                {filtered.length === 0 ? (
                  <div className="text-center text-xs text-zinc-400 py-10 bg-white rounded-xl border border-line">해당 조건의 상품 없음</div>
                ) : (
                  <div className="bg-white rounded-xl border border-line overflow-hidden">
                    <table className="w-full text-[11px] table-fixed">
                      <colgroup>
                        <col />
                        <col className="w-[44px]" />
                        <col className="w-[44px]" />
                        <col className="w-[44px]" />
                        <col className="w-[48px]" />
                        <col className="w-[44px]" />
                        <col className="w-[44px]" />
                        <col className="w-[60px]" />
                      </colgroup>
                      <thead className="bg-zinc-50 border-b border-line sticky top-0 z-10">
                        <tr className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide">
                          <th className="text-left px-2 py-2">
                            <button type="button" onClick={() => toggleSort("name")} className="hover:text-zinc-900 cursor-pointer inline-flex items-center gap-1">
                              상품명 <span className="text-zinc-400 text-[10px]">{sortIcon("name")}</span>
                            </button>
                          </th>
                          <th className="text-right px-1 py-2 text-amber-500" title="ERP 현재고 (products.current_stock)">
                            <button type="button" onClick={() => toggleSort("current_stock")} className="hover:text-amber-700 cursor-pointer inline-flex items-center justify-end gap-0.5 w-full">
                              ERP<span className="text-zinc-400 text-[10px]">{sortIcon("current_stock")}</span>
                            </button>
                          </th>
                          <th className="text-right px-1 py-2 bg-cyan-50 text-cyan-600 font-bold" title="실재고 · 창고">
                            <button type="button" onClick={() => toggleSort("warehouse_stock")} className="hover:text-cyan-800 cursor-pointer inline-flex items-center justify-end gap-0.5 w-full">
                              창고<span className="text-zinc-400 text-[10px]">{sortIcon("warehouse_stock")}</span>
                            </button>
                          </th>
                          <th className="text-right px-1 py-2 bg-violet-50 text-violet-600 font-bold" title="실재고 · 매장">
                            <button type="button" onClick={() => toggleSort("store_stock")} className="hover:text-violet-800 cursor-pointer inline-flex items-center justify-end gap-0.5 w-full">
                              매장<span className="text-zinc-400 text-[10px]">{sortIcon("store_stock")}</span>
                            </button>
                          </th>
                          <th className="text-right px-1 py-2 text-emerald-600 font-bold" title="실재고 합계 (창고+매장)">
                            <button type="button" onClick={() => toggleSort("real_total")} className="hover:text-emerald-800 cursor-pointer inline-flex items-center justify-end gap-0.5 w-full">
                              실재고<span className="text-zinc-400 text-[10px]">{sortIcon("real_total")}</span>
                            </button>
                          </th>
                          <th className="text-right px-1 py-2 text-rose-500 font-bold" title="손실 (마감재고 - 현재고, 양수일수록 손실)">
                            <button type="button" onClick={() => toggleSort("loss")} className="hover:text-rose-700 cursor-pointer inline-flex items-center justify-end gap-0.5 w-full">
                              손실<span className="text-zinc-400 text-[10px]">{sortIcon("loss")}</span>
                            </button>
                          </th>
                          <th className="text-right px-1 py-2 text-zinc-500" title="추천적정재고 (products.optimal_stock)">
                            <button type="button" onClick={() => toggleSort("optimal_stock")} className="hover:text-zinc-800 cursor-pointer inline-flex items-center justify-end gap-0.5 w-full">
                              추천적정<span className="text-zinc-400 text-[10px]">{sortIcon("optimal_stock")}</span>
                            </button>
                          </th>
                          <th className="text-center px-1 py-2">
                            <button type="button" onClick={() => toggleSort("status")} className="hover:text-zinc-900 cursor-pointer inline-flex items-center justify-center gap-0.5 w-full">
                              상황<span className="text-zinc-400 text-[10px]">{sortIcon("status")}</span>
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {filtered.map((p: ProductInfo) => {
                          const stockRaw = (p as any).current_stock;
                          const stockNum = stockRaw != null && stockRaw !== "" ? Number(stockRaw) : NaN;
                          const optRaw = (p as any).optimal_stock;
                          const optNum = optRaw != null && optRaw !== "" ? Number(optRaw) : NaN;
                          const wh = (p as any).warehouse_stock;
                          const st = (p as any).store_stock;
                          const realTotal = (wh != null || st != null) ? (Number(wh ?? 0) + Number(st ?? 0)) : null;
                          const mismatch = realTotal != null && Number.isFinite(stockNum) && realTotal !== stockNum;
                          let statusLabel = "정상";
                          let statusTone: "emerald" | "zinc" | "rose" | "amber" = "emerald";
                          let statusPulse = false;
                          if (!Number.isFinite(stockNum)) {
                            statusLabel = "미확인"; statusTone = "zinc";
                          } else if (stockNum <= 0) {
                            statusLabel = "품절"; statusTone = "rose";
                          } else if (stockNum < 3) {
                            statusLabel = "품절임박"; statusTone = "amber"; statusPulse = true;
                          } else if (Number.isFinite(optNum) && optNum > 0 && stockNum < optNum) {
                            statusLabel = "적정이하"; statusTone = "amber";
                          }
                          const fmt = (v: any) => v == null ? "-" : String(v);
                          return (
                            <tr key={p.code} className="hover:bg-zinc-50 cursor-pointer" onClick={() => { setProductInfoModal(p); setZoneProductsModal(null); }}>
                              <td className="text-left px-2 py-1.5 min-w-0">
                                <div className="text-[12px] font-bold text-zinc-800 truncate" title={p.name}>{p.name}</div>
                                {((p as any).spec || (p as any).real_map) && (
                                  <div className="mt-0.5 text-[9px] text-zinc-400 truncate">
                                    {(p as any).spec && <span className="font-mono" title="전산배치구역">전산 {String((p as any).spec)}</span>}
                                    {(p as any).real_map && <span className="font-mono" title="실제배치구역"> · 실제 {String((p as any).real_map)}</span>}
                                  </div>
                                )}
                              </td>
                              <td className={`text-right px-1 py-1.5 font-mono font-bold text-[11px] ${!Number.isFinite(stockNum) ? "text-zinc-300" : stockNum <= 0 ? "text-red-600" : "text-amber-700"}`}>{Number.isFinite(stockNum) ? stockNum : "-"}</td>
                              <td className={`text-right px-1 py-1.5 font-mono font-bold text-[11px] bg-cyan-50/50 ${wh != null ? "text-cyan-700" : "text-zinc-300"}`}>{fmt(wh)}</td>
                              <td className={`text-right px-1 py-1.5 font-mono font-bold text-[11px] bg-violet-50/50 ${st != null ? "text-violet-700" : "text-zinc-300"}`}>{fmt(st)}</td>
                              <td className={`text-right px-1 py-1.5 font-mono font-bold text-[11px] ${realTotal == null ? "text-zinc-300" : mismatch ? "text-rose-600" : "text-emerald-700"}`} title={mismatch ? `실재고 ${realTotal} ≠ ERP ${stockNum} · 불일치` : "실재고 합계"}>{realTotal == null ? "-" : realTotal}</td>
                              {(() => {
                                const closingRaw = (p as any).closing_stock;
                                const closingNum = closingRaw != null && closingRaw !== "" ? Number(closingRaw) : NaN;
                                const loss = (Number.isFinite(closingNum) && Number.isFinite(stockNum)) ? (closingNum - stockNum) : null;
                                return (
                                  <td className={`text-right px-1 py-1.5 font-mono font-bold text-[11px] ${loss == null ? "text-zinc-300" : loss > 0 ? "text-rose-600" : loss < 0 ? "text-sky-600" : "text-zinc-500"}`} title={loss == null ? "마감재고 없음" : `마감재고 ${closingNum} - 현재고 ${stockNum} = ${loss}`}>{loss == null ? "-" : loss}</td>
                                );
                              })()}
                              <td className={`text-right px-1 py-1.5 font-mono font-bold text-[11px] ${Number.isFinite(optNum) ? "text-zinc-600" : "text-zinc-300"}`}>{Number.isFinite(optNum) ? optNum : "-"}</td>
                              <td className="text-center px-1 py-1.5">
                                <StatusPill tone={statusTone} size="xs" dot={statusTone !== "zinc"} pulse={statusPulse}>{statusLabel}</StatusPill>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="px-5 py-3 border-t border-line bg-zinc-50 flex items-center justify-end">
                <button onClick={() => setZoneProductsModal(null)} className="text-[11px] font-bold text-zinc-600 bg-white border border-zinc-300 px-4 py-1.5 rounded hover:bg-zinc-100 cursor-pointer">닫기</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 상품정보 모달 ── */}
      {productInfoModal && (
        // 2026-08-17 v2 · Modal 통일
        <div className="fixed inset-0 z-50 backdrop-brand flex items-center justify-center p-1 sm:p-4" onClick={() => setProductInfoModal(null)}>
          <div className="bg-white rounded-2xl shadow-brand-modal w-full max-w-2xl max-h-[98vh] sm:max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-sky-50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow-md">
                  <Package size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-bold text-zinc-800 truncate">{productInfoModal.name ?? (productInfoModal as any).product_name}</div>
                  <div className="text-[11px] font-mono text-zinc-500 mt-0.5">#{productInfoModal.code ?? (productInfoModal as any).product_code}</div>
                </div>
              </div>
              <button onClick={() => setProductInfoModal(null)} className="text-zinc-400 hover:text-zinc-700 text-3xl leading-none font-bold w-9 h-9 rounded-lg hover:bg-white/70 transition cursor-pointer flex items-center justify-center shrink-0">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 sm:p-4 bg-zinc-50">
              <ProductInfoCard
                product={productInfoModal}
                context="stock-manage"
                editable
                onRealMapUpdate={(newValue) => {
                  setProductInfoModal(prev => prev ? { ...prev, real_map: newValue } : prev);
                  setProductsMap(prev => {
                    const code = String(productInfoModal.code ?? "").trim();
                    if (!code || !prev[code]) return prev;
                    return { ...prev, [code]: { ...prev[code], real_map: newValue } };
                  });
                }}
                onProductUpdate={(updates) => {
                  setProductInfoModal(prev => prev ? { ...prev, ...updates } : prev);
                  setProductsMap(prev => {
                    const code = String(productInfoModal.code ?? "").trim();
                    if (!code || !prev[code]) return prev;
                    return { ...prev, [code]: { ...prev[code], ...updates } };
                  });
                }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// 2026-08-10 · 사용자 요청 · 매장 > 공급사관리 · SplitPanel · PC 좌우 · 모바일 모달
//   Left  · 4컬럼 텍스트 리스트 (분류·공급사·담당자·전화) · 아이콘 X · displayVendorName
//   Right · VendorDetailModal panel 모드 (사업자번호·이메일 · 상세에서만)
//   Mobile · SplitPanel mobileRightAsModal · 우측 자동 모달
// ─────────────────────────────────────────────────────────────────────────
import { displayVendorName } from "../../utils/vendorNameNormalize";
import { Search as SearchIcon } from "lucide-react";
import { CARD_BASE } from "../../styles/tokens";
import { NewVendorModal } from "../common/NewVendorModal";
import { StatusPill } from "../common/StatusPill";

const VendorManageSplit: React.FC = () => {
  const { vendors, loading, refresh } = useVendorsHook();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("전체");
  // 2026-08-10 · 사용자 요청 · 신규 공급사 등록 모달 (복원 · 90회전 옆 [+ 신규] 버튼)
  const [showNewVendor, setShowNewVendor] = useState(false);
  // 2026-08-10 · 사용자 요청 · 자동 정렬 · 헤더 클릭 · 원칙
  type VmSortKey = "category" | "company_name" | "contact_name" | "phone";
  const [sortKey, setSortKey] = useState<VmSortKey>("company_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const toggleSort = (key: VmSortKey) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => (d === "asc" ? "desc" : "asc")); return prev; }
      setSortDir("asc");
      return key;
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = vendors.filter(v => {
      if (q && !(
        String(v.company_name ?? "").toLowerCase().includes(q)
        || String(v.contact_name ?? "").toLowerCase().includes(q)
        || String(v.phone ?? "").toLowerCase().includes(q)
      )) return false;
      if (catFilter !== "전체" && v.category !== catFilter) return false;
      return true;
    });
    // 자동 정렬
    const dirMul = sortDir === "asc" ? 1 : -1;
    const nameOf = (v: any) => displayVendorName(String(v.company_name ?? "")) || String(v.company_name ?? "");
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "category":     cmp = String(a.category ?? "").localeCompare(String(b.category ?? ""), "ko"); break;
        case "company_name": cmp = nameOf(a).localeCompare(nameOf(b), "ko"); break;
        case "contact_name": cmp = String(a.contact_name ?? "").localeCompare(String(b.contact_name ?? ""), "ko"); break;
        case "phone":        cmp = String(a.phone ?? "").localeCompare(String(b.phone ?? ""), "ko"); break;
      }
      if (cmp === 0) cmp = nameOf(a).localeCompare(nameOf(b), "ko");
      return cmp * dirMul;
    });
  }, [vendors, search, catFilter, sortKey, sortDir]);

  const selected = useMemo(() => vendors.find(v => v.id === selectedId) ?? null, [vendors, selectedId]);

  // 정렬 헤더 셀 · 클릭 정렬 · asc/desc 표시
  const SortTh: React.FC<{ label: string; sk: VmSortKey; className?: string }> = ({ label, sk, className = "" }) => (
    <button
      type="button"
      onClick={() => toggleSort(sk)}
      className={`inline-flex items-center gap-0.5 select-none cursor-pointer hover:text-indigo-600 transition ${
        sortKey === sk ? "text-indigo-600" : "text-zinc-600"
      } ${className}`}
    >
      {label}
      {sortKey === sk
        ? (sortDir === "asc" ? <ChevronUp size={11} className="shrink-0" /> : <ChevronDown size={11} className="shrink-0" />)
        : <span className="text-zinc-300 text-[9px]">↕</span>}
    </button>
  );

  const left = (
    <div className="flex flex-col h-full min-h-0 gap-2">
      {/* 툴바 · 공통 CARD_BASE · 2026-08-17 · 최신 트렌드 · 좌측 accent bar */}
      <div className={`${CARD_BASE} px-4 py-3 flex flex-col gap-2.5 shrink-0`}>
        {/* 헤더 · 좌 accent bar + 제목 + count */}
        <div className="flex items-center gap-2.5">
          <AccentBar />
          <span className="text-[17px] font-bold text-ink tracking-tight">공급사관리</span>
          <StatusPill tone="brand" size="md">
            {loading ? <Spinner size={12} tone="brand" className="inline" /> : `${filtered.length}건`}
          </StatusPill>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <SearchIcon size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="회사명 · 담당자 · 전화"
              className="w-full h-9 pl-9 pr-2 text-[14px] border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition-colors"
            />
          </div>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5">
          {(["전체", "위탁", "선결제", "60회전", "90회전"] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setCatFilter(cat)}
              className={`h-8 px-3 rounded-md text-[12px] font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                catFilter === cat
                  ? cat === "전체"    ? "bg-zinc-700 text-white shadow-sm"
                  : cat === "위탁"    ? "bg-violet-500 text-white shadow-sm"
                  : cat === "선결제"  ? "bg-rose-500 text-white shadow-sm"
                  : cat === "60회전" ? "bg-emerald-500 text-white shadow-sm"
                  :                    "bg-teal-500 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded-md"
              }`}
            >
              {cat}
            </button>
          ))}
          {/* 2026-08-10 · 사용자 요청 · 90회전 옆 · 신규 공급사 등록 버튼 */}
          <button
            onClick={() => setShowNewVendor(true)}
            className="ml-auto h-8 px-3 rounded-md text-[12px] font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] transition cursor-pointer whitespace-nowrap shrink-0"
            title="새 공급사 등록"
          >
            + 신규 등록
          </button>
        </div>
      </div>
      {/* 2026-08-10 · 신규 공급사 등록 모달 */}
      {showNewVendor && (
        <NewVendorModal
          onClose={() => setShowNewVendor(false)}
          onSaved={() => { setShowNewVendor(false); refresh(); }}
        />
      )}

      {/* 리스트 · 통일 CARD_BASE · 헤더 정렬 · 모바일도 4컬럼 (컴팩트) · 2026-08-10 */}
      <div className={`${CARD_BASE} flex-1 min-h-0 overflow-auto`}>
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-zinc-50 border-b border-line">
            <tr>
              {/* 2026-08-10 · #20 · 분류 컬럼 제거 · 공급사 셀에 [분류][줄바꿈][공급사명] 통합 (사용자 요청) */}
              {/* 2026-08-10 · 사용자 요청 · 폰트 +1 · 공급사 이름 wrap · 왼쪽 한눈에 · whitespace-normal */}
              <th className="text-left px-2 sm:px-3 py-2 text-[13px] sm:text-[14px] font-bold min-w-[120px]"><SortTh label="공급사" sk="company_name" /></th>
              <th className="text-left px-2 sm:px-3 py-2 text-[13px] sm:text-[14px] font-bold w-20 sm:w-24"><SortTh label="담당자" sk="contact_name" /></th>
              <th className="text-left px-2 sm:px-3 py-2 text-[13px] sm:text-[14px] font-bold w-28 sm:w-36"><SortTh label="전화" sk="phone" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-12 text-center text-[13px] font-semibold text-zinc-400">
                  {loading ? "로딩 중..." : search ? "검색 결과 없음" : "공급사 없음"}
                </td>
              </tr>
            ) : filtered.map(v => {
              const isActive = selectedId === v.id;
              const catCls = v.category === "위탁" ? "text-violet-700"
                : v.category === "선결제"  ? "text-rose-700"
                : v.category === "60회전" ? "text-emerald-700"
                : v.category === "90회전" ? "text-teal-700"
                :                            "text-zinc-500";
              return (
                <tr
                  key={v.id}
                  onClick={() => setSelectedId(v.id)}
                  className={`cursor-pointer transition ${isActive ? "bg-indigo-50/60" : "hover:bg-zinc-50/80"}`}
                >
                  <td className="px-2 sm:px-3 py-2 align-top" title={String(v.company_name ?? "")}>
                    <div className="flex flex-col leading-tight">
                      <span className={`text-[12px] sm:text-[13px] font-bold ${catCls}`}>
                        {v.category || <span className="text-zinc-300">-</span>}
                      </span>
                      {/* 공급사명 · 길면 wrap · 폰트 +1 */}
                      <span className={`text-[13px] sm:text-[14px] font-bold break-words whitespace-normal ${isActive ? "text-indigo-900" : "text-zinc-800"}`}>
                        {displayVendorName(String(v.company_name ?? "")) || String(v.company_name ?? "")}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-[13px] sm:text-[14px] text-zinc-600 whitespace-nowrap align-top">
                    <span className="block break-words">
                      {String(v.contact_name ?? "") || <span className="text-zinc-300">-</span>}
                    </span>
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-[13px] sm:text-[14px] text-zinc-600 tabular-nums whitespace-nowrap align-top">
                    <span className="block break-words">
                      {String(v.phone ?? "") || <span className="text-zinc-300">-</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const right = selected ? (
    <React.Suspense fallback={<div className="flex-1 flex items-center justify-center text-ink-soft py-16 text-[14px]">공급사 상세 로딩 중...</div>}>
      <VendorDetailModalLazy vendor={selected as any} onClose={() => setSelectedId(null)} onSaved={refresh} panel />
    </React.Suspense>
  ) : (
    <div className="bg-white rounded-xl border border-line flex-1 flex flex-col items-center justify-center p-10 min-h-[400px] gap-3 shadow-sm">
      <div className="w-16 h-16 rounded-2xl bg-brand-tint flex items-center justify-center">
        <Building2 size={30} className="text-brand-deep/70" />
      </div>
      <div className="text-[15px] font-semibold text-ink tracking-tight">좌측에서 공급사를 선택하세요</div>
      <div className="text-[13px] text-ink-soft">사업자번호 · 담당자 · 결제 조건 상세</div>
    </div>
  );

  return (
    <SplitPanel
      storageKey="vendor-manage.leftWidth"
      /* 2026-08-10 · 사용자 요청 · 기본 5:5 · 뷰포트 절반 (min-1200px 라면 600) */
      defaultWidth={typeof window !== "undefined" ? Math.max(400, Math.min(900, Math.floor(window.innerWidth / 2))) : 600}
      minWidth={280}
      maxWidth={1200}
      dividerColor="indigo"
      left={left}
      right={right}
      wrapLeft={false}
      mobileRightAsModal
      mobileModalTitle={selected ? String((selected as any).company_name ?? "공급사 상세") : "공급사 상세"}
      mobileOpen={selectedId != null}
      onMobileClose={() => setSelectedId(null)}
    />
  );
};

export default DisplayPage;
