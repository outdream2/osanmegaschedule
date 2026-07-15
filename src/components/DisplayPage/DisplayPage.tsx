// src/components/DisplayPage/DisplayPage.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense, lazy } from "react";
import { ZONE_DEFS, ZONES_STORAGE_KEY, type ZoneSection } from "../../constants/displayZones";
import { getProductsMap, type ProductInfo } from "../../lib/productsCache";
import {
  Bell,
  Boxes,
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
  TrendingUp,
  User,
  X,
  XCircle,
  AlertTriangle,
  Users,
  Loader2,
  MapPin,
  Search,
  Coffee,
  ScanLine,
  Pill,
  Layers,
  Info,
} from "lucide-react";
import { BarcodeScanner } from "../BarcodeScanner";
import { ProductInfoCard } from "../ScanPage/ProductInfoCard";
import { ZoneCell } from "./ZoneCell";
import { ZoneAssignPopover } from "./ZoneAssignPopover";
import { ZoneGroupPanel, type ZoneGroup } from "./ZoneGroupPanel";
import { AppNavHeader, type AppNavPage } from "../AppNavHeader";
// A. code splitting (2026-07-15) · StockManage/SalesTrend 큰 컴포넌트 lazy 로드
//    초기 앱 번들에서 제외 · 사용자가 해당 탭 클릭 시에만 로드
const StockManagePage = lazy(() => import("../StockManagePage").then(m => ({ default: m.StockManagePage })));
const SalesTrendPage = lazy(() => import("../SalesTrendPage/SalesTrendPage").then(m => ({ default: m.SalesTrendPage })));
import { StockArrivalPage } from "../StockArrivalPage";
import { OcrPage } from "../OcrPage";
import OrderManagePage from "../OrderManagePage/OrderManagePage";
import StaffManagePage from "../StaffManagePage/StaffManagePage";
import type { AuthSession } from "../../types";

interface DisplayPageProps {
  onBack: () => void;
  onOpenEmployeeEdit?: (employeeId: number) => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

// ─── Types ───────────────────────────────────────────────────────────────────
type ZoneStatus = "normal" | "low" | "empty";

// ─── DOW(요일) 마스크 유틸 ───────────────────────────────────────────
// 비트: 일(1) 월(2) 화(4) 수(8) 목(16) 금(32) 토(64) → 모든요일=127
export const DOW_ALL = 127;
export const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;
export type DowMap = { [nameKey: string]: number } | null; // {"*":mask} 단일, {"이름":mask,...} 다중
export const isDowActive = (mask: number | undefined | null, dow: number): boolean =>
  mask == null ? true : ((mask >> dow) & 1) === 1;

interface DisplayZone {
  id: string;
  num: number;
  label: string;
  category: string;
  section: ZoneSection;
  assignedStaffId: number | null;
  assignedStaffName: string;
  status: ZoneStatus;
  products: string;
  dowMap: DowMap; // 요일별 다중선택 마스크. null이면 모든 요일 적용 (하위호환)
}

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

// 진열대 1~8은 A/B 두 서브존으로 확장 · 계산대 40은 A/B/C 3-way 확장
const expandZoneDef = (d: typeof ZONE_DEFS[0]): DisplayZone[] => {
  const isAisleWithAB = d.section === "aisle" && d.num >= 1 && d.num <= 8 && (d.subA || d.subB);
  const isCounter3Way = d.num === 40 && d.subA && d.subB && d.subC;
  if (isCounter3Way) {
    return (["A", "B", "C"] as const).map((side) => ({
      id: `${d.num}${side}`, num: d.num, label: `${d.label} ${side}`,
      category: (side === "A" ? d.subA : side === "B" ? d.subB : d.subC) ?? d.category,
      section: d.section,
      assignedStaffId: null, assignedStaffName: "", status: "normal" as const,
      products: "", dowMap: null,
    }));
  }
  if (!isAisleWithAB) {
    return [{
      id: String(d.num),
      num: d.num,
      label: d.label,
      category: d.category,
      section: d.section,
      assignedStaffId: null,
      assignedStaffName: "",
      status: "normal",
      products: "",
      dowMap: null,
    }];
  }
  return [
    {
      id: `${d.num}B`, num: d.num, label: `${d.label} B`,
      category: d.subB ?? d.category, section: d.section,
      assignedStaffId: null, assignedStaffName: "", status: "normal",
      products: "", dowMap: null,
    },
    {
      id: `${d.num}A`, num: d.num, label: `${d.label} A`,
      category: d.subA ?? d.category, section: d.section,
      assignedStaffId: null, assignedStaffName: "", status: "normal",
      products: "", dowMap: null,
    },
  ];
};

const buildDefaultZones = (): DisplayZone[] =>
  ZONE_DEFS.flatMap(expandZoneDef);

// ─── localStorage helpers ─────────────────────────────────────────────────────
const ZONES_KEY = ZONES_STORAGE_KEY;
const REQS_KEY  = "megatown_display_requests";

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
const saveZones = (z: DisplayZone[]) => { try { localStorage.setItem(ZONES_KEY, JSON.stringify(z)); } catch {} };

const loadRequests = (): DisplayRequest[] => {
  try { const r = localStorage.getItem(REQS_KEY); return r ? (JSON.parse(r) as DisplayRequest[]) : []; }
  catch { return []; }
};
const saveRequests = (r: DisplayRequest[]) => { try { localStorage.setItem(REQS_KEY, JSON.stringify(r)); } catch {} };

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
const statusDot  = (s: ZoneStatus) => ({ normal: "bg-emerald-500", low: "bg-amber-500", empty: "bg-red-500" }[s]);
const statusBadge = (s: ZoneStatus) => ({ normal: "bg-emerald-100 text-emerald-700 border-emerald-300", low: "bg-amber-100 text-amber-700 border-amber-300", empty: "bg-red-100 text-red-700 border-red-300" }[s]);

const SHIFT_BADGE: Record<string, string> = {
  "오픈":    "bg-emerald-100 text-emerald-800 border-emerald-300",
  "미들":    "bg-blue-100 text-blue-800 border-blue-300",
  "마감":    "bg-rose-100 text-rose-800 border-rose-300",
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
    const res = await fetch("/api/zones");
    if (!res.ok) return null;
    const rows: Array<{ zone_id: string; employee_id: number | null; employee_name: string; status: string; products: string; dow_map?: DowMap }> = await res.json();
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
    const res = await fetch("/api/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        zones: zones.map((z) => ({
          zone_id: z.id,
          employee_id: z.assignedStaffId,
          employee_name: z.assignedStaffName,
          status: z.status,
          products: z.products,
          dow_map: z.dowMap ?? null,
        })),
      }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => String(res.status));
      console.error("[saveZonesToDB] failed:", res.status, msg);
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (err: any) {
    console.error("[saveZonesToDB] exception:", err?.message);
    return { ok: false, error: err?.message };
  }
};

const fetchRequestsFromDB = async (): Promise<DisplayRequest[] | null> => {
  try {
    const res = await fetch("/api/display-requests");
    if (!res.ok) return null;
    const rows: any[] = await res.json();
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
  // 서브탭: 재고관리(기본 · level 9 전용) · 매장관리(그 외 기본)
  const dpUserLevel = authSession?.level ??
    (authSession?.role === "superadmin" || authSession?.role === "admin" ? 9 :
     authSession?.role === "manager" ? 2 : authSession?.role === "employee" ? 1 : 0);
  const dpCanSeeStockManage = dpUserLevel >= 9;
  const dpCanSeeStockArrivals = dpUserLevel >= 3;
  const [dpSubTab, setDpSubTab] = useState<"store" | "stock-manage" | "sales-trend" | "stock-arrivals" | "order-manage" | "staff-manage">(
    dpCanSeeStockManage ? "stock-manage" : "store"
  );
  const [zones, setZones] = useState<DisplayZone[]>(() => loadZones());
  const [zonesLoaded, setZonesLoaded] = useState(false);
  const [requests, setRequests] = useState<DisplayRequest[]>(() => loadRequests());

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
      await fetch("/api/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, subscription: sub.toJSON() }),
      });
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
    }).catch(() => {});
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
    }).catch(() => {});
  }, []);

  // 전체월에 적용: 현재 배정 상태를 선택된 월 전체(1일~말일) 모든 날짜에 적용
  // 요일 적용: 선택된 날짜의 요일(예: 화요일)에 현재 배정을 적용 · DB 저장
  const handleApplyToWeekday = useCallback(async () => {
    const d = new Date(selectedDate + "T00:00:00");
    const dow = d.getDay(); // 0=일 ~ 6=토
    const dowLabel = dayNames[dow];
    const proceed = window.confirm(
      `현재 배정 상태를 매주 ${dowLabel}에 적용할까요?\n\n` +
      `• 각 담당자의 dowMap에 ${dowLabel} 활성 비트 추가\n` +
      `• zone_assignments 테이블에 DB 저장 (${zones.length}개 구역)\n` +
      `※ 다른 요일 설정은 그대로 유지됩니다.`
    );
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
      const res = await fetch("/api/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zones: nextZones.map((z) => ({
            zone_id: z.id,
            employee_id: z.assignedStaffId,
            employee_name: z.assignedStaffName,
            status: z.status,
            products: z.products,
            dow_map: z.dowMap ?? null,
          })),
        }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => String(res.status));
        alert(`❌ DB 저장 실패\n${msg}\n(로컬 캐시만 저장됨)`);
        return;
      }
    } catch (err: any) {
      alert(`❌ DB 저장 중 오류: ${err?.message ?? err}\n(로컬 캐시만 저장됨)`);
      return;
    }

    setSaveAllToast(true);
    setTimeout(() => setSaveAllToast(false), 3000);
    setTimeout(() => alert(`✅ 매주 ${dowLabel} 적용 완료 · DB 저장 (${nextZones.length}개 구역)`), 100);
  }, [zones, requests, selectedDate]);

  // ── 자동 구역 배치 (기본배정 우선 + 미배정자 임의배치) ─────────────────────
  const handleAutoAssign = useCallback(() => {
    const logistics = todayStaff.filter(s => s.employee.position.includes("물류"));
    if (logistics.length === 0) {
      alert("오늘 출근한 물류직원이 없습니다.");
      return;
    }
    // 간단 확인 — 미리보기만 적용 (DB 저장·알림 전송은 하지 않음)
    const proceed = window.confirm(
      `물류 출근직원 ${logistics.length}명을 총 45구역 (수평윙 42 + 베스트존 3)에 근접성 세트 기반으로 임의배치할까요?`
    );
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
      const res = await fetch("/api/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zones: zones.map((z) => ({
            zone_id: z.id,
            employee_id: z.assignedStaffId,
            employee_name: z.assignedStaffName,
            status: z.status,
            products: z.products,
            dow_map: z.dowMap ?? null,
          })),
        }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => String(res.status));
        alert(`❌ 배치확정 DB 저장 실패\n${msg}\n로컬 캐시만 저장됨 · 알림은 발송하지 않습니다.`);
        return;
      }
    } catch (err: any) {
      alert(`❌ 배치확정 DB 저장 중 오류: ${err?.message ?? err}\n로컬 캐시만 저장됨 · 알림은 발송하지 않습니다.`);
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
      }).catch(() => {});
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
        const res = await fetch(`/api/schedules?year=${y}&month=${m}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
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
      .catch(() => {})
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
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [zoneGroups, zoneGroupsLoaded]);

  // 좌우 폭 조절 (실시간 보충요청 폭 · localStorage 저장)
  const [reqPanelWidth, setReqPanelWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("megatown_req_panel_w")); return Number.isFinite(v) && v > 0 ? v : 380; } catch { return 380; }
  });
  const startReqPanelResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = reqPanelWidth;
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(240, Math.min(720, startW + (ev.clientX - startX)));
      setReqPanelWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [reqPanelWidth]);
  useEffect(() => {
    try { localStorage.setItem("megatown_req_panel_w", String(reqPanelWidth)); } catch { /* silent */ }
  }, [reqPanelWidth]);

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
    }).catch(() => {});
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

  // Helper: 진열요청 버튼 (배정된 경우 = 빨간 활성 · 미배정/미출근 = 회색 disabled)
  const renderRequestButton = (num: number, id?: string) => {
    const targetId = id ?? String(num);
    const zRaw = zones.find(z => z.id === targetId);
    if (!zRaw || zoneConfigOpen) return null;
    const todayNames = new Set(todayStaff.map(s => s.employee.name));
    const names = zRaw.assignedStaffName ? zRaw.assignedStaffName.split(",").map(s => s.trim()).filter(Boolean) : [];
    const activeToday = names.some(n => todayNames.has(n));
    const isActive = zRaw.assignedStaffId !== null && activeToday;
    if (isActive) {
      return (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleQuickRequest(zRaw); }}
          title={`${zRaw.assignedStaffName}에게 보충 요청`}
          className="w-full h-6 bg-red-500 hover:bg-red-600 rounded text-white text-[11px] font-black flex items-center justify-center gap-1 transition-colors leading-none cursor-pointer shrink-0"
        >
          <Bell size={10} />
          진열요청
        </button>
      );
    }
    // 미배정 또는 오늘 미출근 → 회색 비활성 버튼
    return (
      <button
        type="button"
        disabled
        title="담당 직원 미배정 · 사원을 드래그하여 배정하세요"
        className="w-full h-6 bg-slate-100 border border-slate-200 rounded text-slate-400 text-[10px] font-bold flex items-center justify-center gap-1 leading-none cursor-not-allowed shrink-0"
      >
        <Bell size={9} />
        미배정
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
        <div className="rounded-lg overflow-hidden border-2 border-stone-300 bg-white shadow-3xs hover:border-amber-400 transition">
          {/* 카테고리 헤더 (번호 → 카테고리 · 카테고리가 2개(콤마 · 슬래시 등)면 2줄로 균일 높이) */}
          <button
            type="button"
            onClick={openProducts}
            title={`${num}번 · ${zd?.category ?? ""} → 진열상품 조회`}
            className="w-full h-[64px] bg-stone-50 hover:bg-amber-50 px-1 py-1 flex flex-col items-center gap-0.5 border-b border-stone-200 cursor-pointer transition"
          >
            <span className="text-[10px] font-black text-white bg-amber-700 rounded px-1 py-0.5 leading-none shrink-0">{num}</span>
            {(() => {
              const cat = zd?.category ?? "";
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
        {!hideRequest && !zoneConfigOpen && z.assignedStaffId !== null && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleQuickRequest(z); }}
            title={`${z.assignedStaffName}에게 보충 요청`}
            className="w-full h-6 bg-red-500 hover:bg-red-600 rounded text-white text-[11px] font-black flex items-center justify-center gap-1 transition-colors leading-none cursor-pointer shrink-0"
          >
            <Bell size={10} />
            진열요청
          </button>
        )}
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

      {/* 서브탭 · 모바일: 가로 스크롤 한 줄 (전체 라벨 유지) · 데스크탑: 인라인 flex 한 줄 */}
      {(dpCanSeeStockManage || dpCanSeeStockArrivals) && (() => {
        // 모바일에서도 전체 라벨 유지 · 안 맞으면 가로 스크롤
        // 순서: 재고 → 판매 → 발주 → 입고알림 → 구역도(구 매장관리) → 직원관리
        // 옵션 1: 헤더는 무지개 유지 · 서브탭은 그레이톤 · 활성만 인디고 강조 → 시각 계층 명확
        // 2026-07-15 · 연한 파스텔 톤 (사용자 요청 · 진한 gradient 대신 tinted bg)
        //   active: bg-{color}-50 border border-{color}-200 text-{color}-700 (톤다운 · 시인성 유지)
        //   inactive: text-slate-500 · hover 만 subtle bg
        //   각 탭별 아이덴티티 색상 유지 · 촌스러운 채도 down
        type TabDef = { key: string; label: string; icon: any; visible: boolean; activeCls: string; iconActiveCls: string; ringCls: string; hoverCls: string };
        const tabs: Array<TabDef> = [
          { key: "stock-manage",   label: "재고관리", icon: Boxes,         visible: dpCanSeeStockManage,   activeCls: "bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-sm", iconActiveCls: "text-emerald-600", ringCls: "focus-visible:ring-emerald-300", hoverCls: "hover:bg-emerald-50/60 hover:text-emerald-700" },
          { key: "sales-trend",    label: "판매추이", icon: TrendingUp,    visible: dpCanSeeStockManage,   activeCls: "bg-amber-50 border border-amber-200 text-amber-700 shadow-sm",     iconActiveCls: "text-amber-600",   ringCls: "focus-visible:ring-amber-300",   hoverCls: "hover:bg-amber-50/60 hover:text-amber-700"   },
          { key: "order-manage",   label: "발주관리", icon: ClipboardList, visible: dpCanSeeStockManage,   activeCls: "bg-sky-50 border border-sky-200 text-sky-700 shadow-sm",           iconActiveCls: "text-sky-600",     ringCls: "focus-visible:ring-sky-300",     hoverCls: "hover:bg-sky-50/60 hover:text-sky-700"       },
          { key: "stock-arrivals", label: "입고알림", icon: Bell,          visible: dpCanSeeStockArrivals, activeCls: "bg-orange-50 border border-orange-200 text-orange-700 shadow-sm",  iconActiveCls: "text-orange-600",  ringCls: "focus-visible:ring-orange-300",  hoverCls: "hover:bg-orange-50/60 hover:text-orange-700" },
          { key: "store",          label: "구역도",   icon: Store,         visible: true,                  activeCls: "bg-rose-50 border border-rose-200 text-rose-700 shadow-sm",        iconActiveCls: "text-rose-600",    ringCls: "focus-visible:ring-rose-300",    hoverCls: "hover:bg-rose-50/60 hover:text-rose-700"     },
          { key: "staff-manage",   label: "직원관리", icon: Users,         visible: true,                  activeCls: "bg-indigo-50 border border-indigo-200 text-indigo-700 shadow-sm",  iconActiveCls: "text-indigo-600",  ringCls: "focus-visible:ring-indigo-300",  hoverCls: "hover:bg-indigo-50/60 hover:text-indigo-700" },
        ];
        const inactiveCls = "text-slate-500";
        const iconInactive = "text-slate-400";
        const visibleTabs = tabs.filter(t => t.visible);
        const tabBase = "flex flex-col sm:flex-row items-center sm:justify-start justify-center gap-0.5 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 text-[11px] sm:text-[14px] font-bold whitespace-nowrap transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-offset-1 rounded-md sm:rounded-xl min-h-[48px] sm:min-h-0 active:scale-95 flex-1 sm:flex-initial sm:min-w-0";
        return (
          <div className="bg-white border-b border-slate-200/70 px-1.5 sm:px-4 w-full">
            <div className="max-w-[1360px] mx-auto py-1 sm:py-2 w-full flex justify-center sm:justify-start overflow-x-auto scrollbar-none">
              <div className="flex flex-nowrap bg-slate-100 border border-slate-200 rounded-lg sm:rounded-xl p-0.5 sm:p-1 gap-0.5 sm:gap-1 shadow-sm w-full sm:w-auto">
                {visibleTabs.map(t => {
                  const active = dpSubTab === t.key;
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setDpSubTab(t.key as any)}
                      className={`${tabBase} ${t.ringCls} ${active ? t.activeCls : `${inactiveCls} ${t.hoverCls}`}`}
                      title={t.label}
                    >
                      <Icon size={13} strokeWidth={2.2} className={`shrink-0 sm:size-[14px] ${active ? t.iconActiveCls : iconInactive}`} />
                      <span className="leading-none">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {dpSubTab === "stock-manage" && dpCanSeeStockManage ? (
        <main className="flex-1 flex flex-col min-h-0">
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-bold py-16">재고관리 로딩 중...</div>}>
            <StockManagePage />
          </Suspense>
        </main>
      ) : dpSubTab === "sales-trend" && dpCanSeeStockManage ? (
        <main className="flex-1 flex flex-col min-h-0">
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-bold py-16">판매추이 로딩 중...</div>}>
            <SalesTrendPage />
          </Suspense>
        </main>
      ) : dpSubTab === "stock-arrivals" && dpCanSeeStockArrivals ? (
        <main className="flex-1 flex flex-col min-h-0">
          <StockArrivalPage
            authSession={authSession}
            onBack={onBack}
            onNavigate={onNavigate as any}
            onLogout={onLogout}
            embedded
          />
        </main>
      ) : dpSubTab === "order-manage" && dpCanSeeStockManage ? (
        <main className="flex-1 flex flex-col min-h-0">
          <OrderManagePage
            ocrTabAuthSession={authSession}
            ocrTabOnBack={onBack}
            ocrTabOnNavigate={onNavigate as any}
            ocrTabOnLogout={onLogout}
          />
        </main>
      ) : dpSubTab === "staff-manage" ? (
        <main className="flex-1 flex flex-col min-h-0">
          <StaffManagePage />
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
                  className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-slate-50">
                {productSearchResults.map((p) => (
                  <div
                    key={p.code}
                    className={`px-3 py-2 flex items-start justify-between gap-2 ${
                      productMatchZoneId && zones.find(z => z.id === productMatchZoneId)?.num === parseInt((p.realMap ?? "").match(/^(\d+)번/)?.[1] ?? "-1") ? "bg-emerald-50 border-l-2 border-emerald-400" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleProductResultClick(p.realMap)}
                      className="flex-1 min-w-0 text-left hover:opacity-75 transition cursor-pointer"
                    >
                      <div className="text-xs font-semibold text-slate-800 truncate">{p.name}</div>
                      {p.spec && <div className="text-[10px] text-slate-400 truncate mt-0.5" title="전산배치구역">{p.spec}</div>}
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {p.realMap && (
                        <button
                          type="button"
                          onClick={() => handleProductResultClick(p.realMap)}
                          className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-lg whitespace-nowrap hover:bg-emerald-200 transition cursor-pointer"
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
                  className="p-1.5 rounded-lg hover:bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-800 transition cursor-pointer"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="text-center min-w-[140px] sm:min-w-[160px]">
                  <div className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight tracking-tight">
                    {selectedDateObj.getMonth() + 1}월 {selectedDateObj.getDate()}일
                  </div>
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    <span className="text-sm font-semibold text-gray-400">{dayNames[selectedDateObj.getDay()]}요일</span>
                    {isToday && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600">오늘</span>}
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
                  className="p-1.5 rounded-lg hover:bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-800 transition cursor-pointer"
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
                    className="w-full pl-8 pr-8 py-1.5 border border-gray-300 rounded-lg shadow-3xs focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white text-xs"
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
                      <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                        {productSearchResults.map((p) => (
                          <div key={p.code} className="px-3 py-2 flex items-start justify-between gap-2 hover:bg-slate-50 transition">
                            <button
                              type="button"
                              onClick={() => handleProductResultClick(p.realMap)}
                              className="flex-1 min-w-0 text-left cursor-pointer"
                            >
                              <div className="text-xs font-semibold text-slate-800 truncate">{p.name}</div>
                              {p.spec && <div className="text-[10px] text-slate-400 truncate mt-0.5" title="전산배치구역">{p.spec}</div>}
                            </button>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {p.realMap && (
                                <button
                                  type="button"
                                  onClick={() => handleProductResultClick(p.realMap)}
                                  className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-lg whitespace-nowrap hover:bg-emerald-200 transition cursor-pointer"
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
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-slate-200 shadow-lg z-40 px-3 py-3 text-[11px] text-slate-400 text-center">
                      검색 결과 없음
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setScannerMode("search")}
                  title="바코드 스캔으로 검색"
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 bg-white hover:bg-emerald-50 hover:border-emerald-400 text-gray-500 hover:text-emerald-600 transition cursor-pointer shadow-3xs"
                >
                  <ScanLine size={14} />
                </button>
                <button
                  onClick={() => { setZoneConfigOpen((v) => !v); setActiveGroupId(null); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer shrink-0 ${
                    zoneConfigOpen
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-white border border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600"
                  }`}
                >
                  <Layers size={13} />
                  구역 설정
                </button>
                {/* DB 저장 상태 표시 */}
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border shrink-0 ${
                    saveStatus === "saving" ? "bg-blue-50 border-blue-200 text-blue-700" :
                    saveStatus === "saved"  ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
                    saveStatus === "error"  ? "bg-red-50 border-red-200 text-red-700 cursor-help" :
                    "bg-slate-50 border-slate-200 text-slate-400"
                  }`}
                  title={saveStatus === "error" ? `DB 저장 실패: ${lastSaveError ?? "알 수 없는 오류"}` : "매장맵 자동저장 상태"}
                >
                  {saveStatus === "saving" && <><Loader2 size={10} className="animate-spin" />저장중</>}
                  {saveStatus === "saved"  && <><CheckCircle2 size={10} />저장됨</>}
                  {saveStatus === "error"  && <>❌ 저장 실패</>}
                  {saveStatus === "idle"   && <>◎ 대기</>}
                </span>
                <button
                  onClick={handleApplyToWeekday}
                  title={`현재 배정을 매주 ${dayNames[selectedDateObj.getDay()]}에 적용 · DB 저장`}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition cursor-pointer shrink-0"
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
                1: "bg-blue-500 text-white",   2: "bg-yellow-400 text-yellow-950",
                3: "bg-red-500 text-white",    4: "bg-pink-500 text-white",
                5: "bg-lime-500 text-lime-950",6: "bg-sky-500 text-white",
                7: "bg-indigo-500 text-white", 8: "bg-purple-500 text-white",
              };
              const catBColors: Record<number, string> = {
                1: "bg-blue-100 text-blue-900",     2: "bg-yellow-100 text-yellow-900",
                3: "bg-red-100 text-red-900",       4: "bg-pink-100 text-pink-900",
                5: "bg-lime-100 text-lime-900",     6: "bg-sky-100 text-sky-900",
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
                <div className="sm:hidden bg-white border border-slate-200 rounded-xl overflow-hidden mb-2">
                  <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                    <span className="text-lg">📋</span>
                    <span className="text-[13px] font-black text-slate-700">구역 리스트</span>
                    <span className="text-[10px] font-mono text-slate-400">({zones.length}개)</span>
                    <button
                      type="button"
                      onClick={() => setFullMapOpen(true)}
                      className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black shadow-sm active:scale-95 transition"
                      title="매장 구역도 보기 (읽기 전용)"
                    >
                      🗺️ 매장 구역도 보기
                    </button>
                  </div>
                  <ul className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
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
                          <li key={`mobile-list-${z.id}`} className="grid grid-cols-[40px_1fr_84px_62px] items-center gap-2 px-2 py-1.5 hover:bg-slate-50 transition">
                            {/* 1. 구역 번호 pill · 데스크탑 색상 · 고정 40px */}
                            <button
                              type="button"
                              onClick={() => {
                                setZoneProductsModal({ zoneId: z.id, zoneNum: z.num, zoneLabel: zoneLabel, category: z.category });
                                setZoneProductsFilter("all"); setZoneProductsSearch("");
                              }}
                              className={`w-full h-[38px] rounded text-[13px] font-black flex items-center justify-center leading-none active:scale-95 transition ${pillCls}`}
                              title={`${zoneLabel} 상품 조회`}
                            >
                              {zoneLabel}
                            </button>
                            {/* 2. 카테고리 · 왼쪽 정렬 · 줄임말 없음 */}
                            <span className="text-[12px] font-black text-slate-800 break-keep whitespace-normal leading-tight">
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
                                  return (
                                    <span key={`${z.id}-${name}`} className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-black border ${chip} active:scale-95 transition`}>
                                      {name}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-slate-400 bg-slate-50 border border-dashed border-slate-300 active:scale-95 transition">
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
                </div>
              );
            })()}

            {/* ── 모바일 · 매장 구역도 fullscreen 모달 (읽기 전용 · 드래그 스크롤) ─── */}
            {fullMapOpen && (
              <div className="sm:hidden fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex flex-col" onClick={() => setFullMapOpen(false)}>
                <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-slate-200 shadow-sm">
                  <span className="text-sm font-black text-slate-800">🗺️ 매장 구역도 (읽기 전용)</span>
                  <button onClick={() => setFullMapOpen(false)} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg font-black">×</button>
                </div>
                <div className="flex-1 overflow-auto p-2" onClick={e => e.stopPropagation()}>
                  {/* 데스크탑 매장맵과 동일한 카테고리 라벨/색깔/테두리 · pointer-events-none 으로 읽기만 · 드래그·스크롤은 가능 */}
                  <div className="min-w-[820px] pointer-events-none select-none">
                    <div className="p-2 bg-slate-200 rounded-2xl border-4 border-emerald-500 shadow-inner space-y-3">
                      {/* 상단 벽면 */}
                      <div className="w-full bg-white border-2 border-emerald-600 rounded-xl p-2 shadow-sm">
                        <div className="text-[7px] font-black text-slate-400 uppercase tracking-wider mb-0.5">상단 벽면 (21→9)</div>
                        <div className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-1 bg-slate-100 p-1 rounded">
                          {[21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9].map((num) => renderWallZoneCard(num, "top"))}
                        </div>

                        {/* 중앙 진열대: 22 + 8B|8A → 1B|1A · 데스크탑과 동일 카테고리 라벨/색깔/테두리 */}
                        <div className="my-3 w-full">
                          <div className="text-[7px] font-black text-slate-400 uppercase tracking-wider mb-1">중앙 진열대 (22 · 8B|8A → 1B|1A · 16구역)</div>
                          <div className="flex items-stretch justify-start pr-3 px-1.5 bg-slate-50 border border-slate-200 py-2 rounded-lg gap-1.5">
                            {/* 진열대 22 (단독) */}
                            <div className="flex flex-col items-center gap-0.5 flex-none w-[40px] min-w-[40px] mr-1">
                              <div className="w-full text-[10px] font-black text-slate-700 bg-white border-2 border-slate-300 rounded px-0.5 py-0.5 leading-tight text-center h-[56px] flex items-center justify-center overflow-hidden">
                                <span className="line-clamp-4">{ZONE_DEFS.find(z => z.num === 22)?.category ?? ""}</span>
                              </div>
                              <div className="w-full text-[9px] font-black text-white bg-slate-600 rounded px-0.5 py-0.5 text-center leading-none">22</div>
                              {renderZoneCell(22, "w-full h-[80px] flex flex-col justify-between items-center py-1 px-0.5 text-[9px]", "", true)}
                            </div>
                            {/* 8→1 pair · 데스크탑 catA/catB 컬러맵 그대로 */}
                            {(() => {
                              const catA: Record<number, { bg: string; border: string; text: string; labelBg: string }> = {
                                1: { bg: "bg-blue-500",   border: "border-blue-700",   text: "text-white", labelBg: "bg-blue-800" },
                                2: { bg: "bg-yellow-400", border: "border-yellow-700", text: "text-yellow-950", labelBg: "bg-yellow-700" },
                                3: { bg: "bg-red-500",    border: "border-red-700",    text: "text-white", labelBg: "bg-red-800" },
                                4: { bg: "bg-pink-500",   border: "border-pink-700",   text: "text-white", labelBg: "bg-pink-800" },
                                5: { bg: "bg-lime-500",   border: "border-lime-700",   text: "text-lime-950", labelBg: "bg-lime-800" },
                                6: { bg: "bg-sky-500",    border: "border-sky-700",    text: "text-white", labelBg: "bg-sky-800" },
                                7: { bg: "bg-indigo-500", border: "border-indigo-700", text: "text-white", labelBg: "bg-indigo-800" },
                                8: { bg: "bg-purple-500", border: "border-purple-700", text: "text-white", labelBg: "bg-purple-800" },
                              };
                              const catB: Record<number, { bg: string; border: string; text: string; labelBg: string }> = {
                                1: { bg: "bg-blue-100",   border: "border-blue-300",   text: "text-blue-900",   labelBg: "bg-blue-400" },
                                2: { bg: "bg-yellow-100", border: "border-yellow-300", text: "text-yellow-900", labelBg: "bg-yellow-400" },
                                3: { bg: "bg-red-100",    border: "border-red-300",    text: "text-red-900",    labelBg: "bg-red-400" },
                                4: { bg: "bg-pink-100",   border: "border-pink-300",   text: "text-pink-900",   labelBg: "bg-pink-400" },
                                5: { bg: "bg-lime-100",   border: "border-lime-300",   text: "text-lime-900",   labelBg: "bg-lime-400" },
                                6: { bg: "bg-sky-100",    border: "border-sky-300",    text: "text-sky-900",    labelBg: "bg-sky-400" },
                                7: { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-900", labelBg: "bg-indigo-400" },
                                8: { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-900", labelBg: "bg-purple-400" },
                              };
                              return [8, 7, 6, 5, 4, 3, 2, 1].map(num => {
                                const ca = catA[num];
                                const cb = catB[num];
                                const zd = ZONE_DEFS.find(z => z.num === num);
                                const subB = zd?.subB ?? "";
                                const subA = zd?.subA ?? "";
                                return (
                                  <div key={`fullmap-pair-${num}`} className="flex flex-col items-stretch gap-0.5 flex-[2] min-w-[60px]">
                                    {/* B (연한 톤) */}
                                    <div className={`w-full text-[10px] font-black ${cb.text} ${cb.bg} border-2 ${cb.border} rounded px-0.5 py-0.5 leading-tight text-center h-[56px] flex flex-col items-center justify-center overflow-hidden`}>
                                      <span className={`text-[10px] font-black text-white ${cb.labelBg} rounded px-1 py-0.5 leading-none mb-0.5`}>{num}B</span>
                                      <span className="line-clamp-3 text-[10px]">{subB}</span>
                                    </div>
                                    {/* B|A zone cell 나란히 */}
                                    <div className="flex gap-0.5 items-stretch">
                                      <div className="flex-1 flex flex-col gap-0.5">
                                        {renderZoneCellById(`${num}B`, "w-full h-[80px] flex flex-col justify-between items-center py-0.5 px-0.5 text-[9px]", "", true)}
                                      </div>
                                      <div className="flex-1 flex flex-col gap-0.5">
                                        {renderZoneCellById(`${num}A`, "w-full h-[80px] flex flex-col justify-between items-center py-0.5 px-0.5 text-[9px]", "", true)}
                                      </div>
                                    </div>
                                    {/* A (진한 톤) */}
                                    <div className={`w-full text-[10px] font-black ${ca.text} ${ca.bg} border-2 ${ca.border} rounded px-0.5 py-0.5 leading-tight text-center h-[56px] flex flex-col items-center justify-center overflow-hidden`}>
                                      <span className={`text-[10px] font-black text-white ${ca.labelBg} rounded px-1 py-0.5 leading-none mb-0.5`}>{num}A</span>
                                      <span className="line-clamp-3 text-[10px]">{subA}</span>
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>

                        {/* 하단 벽면 */}
                        <div className="w-full">
                          <div className="text-[7px] font-black text-slate-400 uppercase tracking-wider mb-0.5">하단 벽면 (23→34)</div>
                          <div className="grid grid-cols-12 gap-1 bg-slate-100 p-1 rounded">
                            {[23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34].map((num) => renderWallZoneCard(num, "bottom"))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="px-3 py-2 bg-white border-t border-slate-200 text-[10px] text-slate-500 text-center">
                  💡 좌우로 드래그하여 전체 구역도 확인 · 편집은 데스크탑에서 가능
                </div>
              </div>
            )}

            {/* ── MAP TAB (데스크탑 매장 배치도) · 모바일 숨김 ─────────────── */}
            {/* Simulated 2D Floor Plan Grid matches map.png */}
            <div className="hidden sm:block xl:overflow-x-visible overflow-x-auto">
            <div className="p-2 bg-slate-200 rounded-2xl flex flex-col justify-between border-4 border-emerald-500 shadow-inner gap-2 min-h-[500px] xl:w-full min-w-[820px] w-max relative">

              {/* ── 물류출근직원 pill (매장 배치도 내부 상단) ── */}
              {todayStaff.length > 0 && (() => {
                const 물류 = todayStaff.filter(s => s.employee.position.includes("물류"));
                if (물류.length === 0) return null;
                const ORDER: Record<string, number> = { "오픈": 0, "미들": 1, "마감": 2 };
                const sortShift = (a: typeof todayStaff[0], b: typeof todayStaff[0]) => (ORDER[a.scheduleType] ?? 3) - (ORDER[b.scheduleType] ?? 3);
                return (
                  <div className="bg-white/95 backdrop-blur rounded-lg border border-orange-200 px-2 py-1.5 shadow-sm inline-flex flex-wrap items-center gap-1 mb-1 w-fit max-w-full">
                    <span className="text-[10px] font-black text-orange-700 mr-1">📦 물류 출근직원 ({물류.length})</span>
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
                          <span className={`text-[8px] font-black px-1 rounded ${SHIFT_BADGE[scheduleType] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}>
                            {scheduleType}
                          </span>
                        </button>
                      );
                    })}
                    <button
                      onClick={handleAutoAssign}
                      title="물류 출근직원 미리보기 배치 (확정 전엔 DB 저장·알림 없음)"
                      className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-black rounded-full shadow-sm transition cursor-pointer border border-violet-700"
                    >
                      🎲 임의배치
                    </button>
                    {pendingAutoAssign && (
                      <>
                        <button
                          onClick={handleConfirmAutoAssign}
                          title="DB 저장 + 각 담당자에게 날짜·배정구역 알림 전송"
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black rounded-full shadow-sm transition cursor-pointer border border-emerald-700 animate-pulse"
                        >
                          <Bell size={9} /> 배치확정 ({pendingAutoAssign.assignedList.length})
                        </button>
                        <button
                          onClick={handleCancelAutoAssign}
                          title="미리보기 취소 · 이전 배치로 되돌리기"
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-white hover:bg-slate-50 text-slate-600 text-[10px] font-bold rounded-full shadow-sm transition cursor-pointer border border-slate-300"
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
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
                    <svg width="36" height="28" viewBox="0 0 42 34" className="shrink-0" aria-label="수평윙 위치">
                      {/* 메인 매장 (수평 윙 · 현재 영역 · 강조) */}
                      <rect x="1" y="1" width="30" height="20" rx="1.5" fill="#10b981" stroke="#047857" strokeWidth="1" />
                      {/* 수직 윙 (다른 영역 · 회색 아웃라인) */}
                      <rect x="31" y="1" width="10" height="32" rx="1.5" fill="none" stroke="#cbd5e1" strokeWidth="1.2" />
                      {/* 현재 위치 마커 (수평윙 중앙) */}
                      <circle cx="16" cy="11" r="2" fill="#fbbf24" />
                    </svg>
                    <span className="text-[8px] font-bold text-slate-600 leading-none">수평 윙</span>
                  </div>

                  {/* 상단 벽면: 21→9 좌→우 (13개) · 모바일 4열 wrap 순차 · 데스크탑 13열 한 줄 */}
                  <div className="w-full">
                    <div className="text-[7px] font-black text-slate-400 uppercase tracking-wider mb-0.5">상단 벽면 (21→9)</div>
                    <div className="grid grid-cols-4 md:grid-cols-[repeat(13,minmax(0,1fr))] gap-1 bg-slate-100 p-1 rounded">
                      {[21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9].map((num) => renderWallZoneCard(num, "top"))}
                    </div>
                  </div>

                  {/* 중앙 진열대: 22 + 8B/8A/7B/7A/.../1B/1A (16개 세로 진열대 나란히) */}
                  <div className="my-3 w-full">
                    <div className="text-[7px] font-black text-slate-400 uppercase tracking-wider mb-1">중앙 진열대 (22 · 8B|8A → 1B|1A · 16구역)</div>
                    {/* 반응형: 모바일 (sm 이하) 에서는 2 pair 씩 wrap · 데스크탑은 한 줄 유지 */}
                    <div className="flex flex-wrap md:flex-nowrap items-stretch justify-start md:pr-3 px-1.5 bg-slate-50 border border-slate-200 py-2 rounded-lg gap-1.5">
                      {/* 진열대 22 (좌측 첫 번째, 단독) · 왼쪽 벽에 붙임 · 좁은 고정 폭 */}
                      <div className="flex flex-col items-center gap-0.5 basis-full md:basis-auto md:flex-none md:w-[40px] md:min-w-[40px] md:mr-1">
                        <button
                          type="button"
                          onClick={() => {
                            const zd = ZONE_DEFS.find(z => z.num === 22);
                            setZoneProductsModal({ zoneId: "22", zoneNum: 22, zoneLabel: `진열대 22`, category: zd?.category ?? "" });
                            setZoneProductsFilter("all"); setZoneProductsSearch("");
                          }}
                          title="22 카테고리 클릭 → 상품 리스트 보기"
                          className="w-full text-[10px] font-black text-slate-700 bg-white border-2 border-slate-300 rounded px-0.5 py-0.5 leading-tight text-center h-[56px] flex items-center justify-center overflow-hidden cursor-pointer hover:bg-slate-50 transition">
                          <span className="line-clamp-4">{ZONE_DEFS.find(z => z.num === 22)?.category ?? ""}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const zd = ZONE_DEFS.find(z => z.num === 22);
                            setZoneProductsModal({ zoneId: "22", zoneNum: 22, zoneLabel: `진열대 22`, category: zd?.category ?? "" });
                            setZoneProductsFilter("all"); setZoneProductsSearch("");
                          }}
                          title="22 구역 상품 리스트 보기"
                          className="w-full text-[9px] font-black text-white bg-slate-600 rounded px-0.5 py-0.5 text-center leading-none cursor-pointer hover:brightness-110 transition"
                        >22</button>
                        {renderZoneCell(22, "w-full h-[80px] flex flex-col justify-between items-center py-1 px-0.5 text-[9px]")}
                        <div className="w-full h-[56px]" />
                      </div>
                      {/* 진열대 8→1 각각 B|A pair — 카테고리 라벨은 A/B 합친 폭으로 넓게 표시 */}
                      {(() => {
                        // A=진한 톤 (셀 색상 = bg-{color}-600) / B=연한 톤 (셀 색상 = bg-{color}-300)
                        // 대비가 명확히 보이도록 A는 진한 배경, B는 연한 배경
                        const catA: Record<number, { bg: string; border: string; text: string; labelBg: string }> = {
                          1: { bg: "bg-blue-500",   border: "border-blue-700",   text: "text-white", labelBg: "bg-blue-800" },
                          2: { bg: "bg-yellow-400", border: "border-yellow-700", text: "text-yellow-950", labelBg: "bg-yellow-700" },
                          3: { bg: "bg-red-500",    border: "border-red-700",    text: "text-white", labelBg: "bg-red-800" },
                          4: { bg: "bg-pink-500",   border: "border-pink-700",   text: "text-white", labelBg: "bg-pink-800" },
                          5: { bg: "bg-lime-500",   border: "border-lime-700",   text: "text-lime-950", labelBg: "bg-lime-800" },
                          6: { bg: "bg-sky-500",    border: "border-sky-700",    text: "text-white", labelBg: "bg-sky-800" },
                          7: { bg: "bg-indigo-500", border: "border-indigo-700", text: "text-white", labelBg: "bg-indigo-800" },
                          8: { bg: "bg-purple-500", border: "border-purple-700", text: "text-white", labelBg: "bg-purple-800" },
                        };
                        const catB: Record<number, { bg: string; border: string; text: string; labelBg: string }> = {
                          1: { bg: "bg-blue-100",   border: "border-blue-300",   text: "text-blue-900",   labelBg: "bg-blue-400" },
                          2: { bg: "bg-yellow-100", border: "border-yellow-300", text: "text-yellow-900", labelBg: "bg-yellow-400" },
                          3: { bg: "bg-red-100",    border: "border-red-300",    text: "text-red-900",    labelBg: "bg-red-400" },
                          4: { bg: "bg-pink-100",   border: "border-pink-300",   text: "text-pink-900",   labelBg: "bg-pink-400" },
                          5: { bg: "bg-lime-100",   border: "border-lime-300",   text: "text-lime-900",   labelBg: "bg-lime-400" },
                          6: { bg: "bg-sky-100",    border: "border-sky-300",    text: "text-sky-900",    labelBg: "bg-sky-400" },
                          7: { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-900", labelBg: "bg-indigo-400" },
                          8: { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-900", labelBg: "bg-purple-400" },
                        };
                        return [8, 7, 6, 5, 4, 3, 2, 1].map((num) => {
                          const ca = catA[num];
                          const cb = catB[num];
                          const zd = ZONE_DEFS.find(z => z.num === num);
                          const subB = zd?.subB ?? "";
                          const subA = zd?.subA ?? "";
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
                                className={`w-full text-[10px] font-black ${cb.text} ${cb.bg} border-2 ${cb.border} rounded px-0.5 py-0.5 leading-tight text-center h-[56px] flex flex-col items-center justify-center overflow-hidden cursor-pointer hover:brightness-95 transition`}>
                                <span className={`text-[10px] font-black text-white ${cb.labelBg} rounded px-1 py-0.5 leading-none mb-0.5`}>{num}B</span>
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
                                className={`w-full text-[10px] font-black ${ca.text} ${ca.bg} border-2 ${ca.border} rounded px-0.5 py-0.5 leading-tight text-center h-[56px] flex flex-col items-center justify-center overflow-hidden cursor-pointer hover:brightness-95 transition`}>
                                <span className={`text-[10px] font-black text-white ${ca.labelBg} rounded px-1 py-0.5 leading-none mb-0.5`}>{num}A</span>
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
                    <div className="text-[7px] font-black text-slate-400 uppercase tracking-wider mb-0.5">하단 벽면 (23→34)</div>
                    <div className="grid grid-cols-4 md:grid-cols-12 gap-1 bg-slate-100 p-1 rounded">
                      {[23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34].map((num) => renderWallZoneCard(num, "bottom"))}
                    </div>
                  </div>

                  {/* Expiring Products Zone Marker at far right of top wing */}
                  <div className="absolute top-1 right-2 bg-rose-50 text-rose-700 text-[8px] border border-rose-300 font-extrabold px-1.5 rounded-full uppercase tracking-wider shadow-3xs">
                    유통기한 임박존
                  </div>
                </div>

              </div>

              {/* SECTION 2 + 실시간 보충요청 (2열 배치 · 보충요청 왼쪽 · 윙 오른쪽 축소) */}
              <div className="w-full flex flex-col lg:flex-row gap-2 mt-2 items-stretch">

              {/* 실시간 진열 보충 요청 현황 — 드래그로 폭 조절 가능 */}
              <div className="bg-white p-3 rounded-2xl shadow-md shadow-slate-200/60 border border-slate-100 flex flex-col shrink-0" style={{ width: `min(100%, ${reqPanelWidth}px)` }}>
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between flex-nowrap gap-2 overflow-x-auto scrollbar-none">
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                      <ClipboardList size={16} className="text-violet-600" />
                    </div>
                    <h2 className="text-sm font-bold text-slate-900 whitespace-nowrap">실시간 진열 보충 요청 현황</h2>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 shrink-0 whitespace-nowrap">
                      대기 {requests.filter(r => r.status === "pending").length}건 / 전체 {requests.length}건
                    </span>
                  </div>
                  <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 text-[10px] shrink-0">
                    {(["all", "pending", "done"] as const).map((k) => (
                      <button key={k} type="button" onClick={() => setReqFilter(k)}
                        className={`px-2.5 py-1 font-semibold rounded-md transition cursor-pointer whitespace-nowrap ${reqFilter === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                        {k === "all" ? "전체" : k === "pending" ? "대기중" : "완료"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto flex-1 min-h-0 overflow-y-auto mt-2">
                  {filteredReqs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-xs text-center px-4">
                      <Bell size={24} className="mb-2 opacity-30 animate-bounce" />
                      {reqFilter === "done" ? "완료된 요청이 없습니다" : reqFilter === "pending" ? "대기 중인 요청이 없습니다" : "등록된 진열 요청이 없습니다"}
                    </div>
                  ) : (
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                          <th className="p-2 w-24">구역</th>
                          <th className="p-2 w-24">담당</th>
                          <th className="p-2 w-20">시각</th>
                          <th className="p-2 w-16 text-center">상태</th>
                          <th className="p-2 text-center">작업</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredReqs.map((req) => (
                          <tr key={req.id} className="hover:bg-slate-50 transition">
                            <td className="p-2 font-bold text-slate-900">{req.zoneLabel}</td>
                            <td className="p-2 font-bold text-slate-800">{req.assignedStaffName || "미배정"}</td>
                            <td className="p-2 text-slate-500 text-[10px]">{formatRel(req.requestedAt)}</td>
                            <td className="p-2 text-center">
                              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${req.status === "pending" ? "bg-amber-50 text-amber-700 border-amber-300" : "bg-emerald-50 text-emerald-700 border-emerald-300"}`}>
                                {req.status === "pending" ? "대기" : "완료"}
                              </span>
                            </td>
                            <td className="p-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {req.status === "pending" && (
                                  <button onClick={() => {
                                    setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: "done" as const } : r));
                                    fetch(`/api/display-requests/${req.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ status: "done" }),
                                    }).catch(() => {});
                                  }}
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer flex items-center gap-0.5">
                                    <CheckCircle2 size={9} />완료
                                  </button>
                                )}
                                <button onClick={() => {
                                  setRequests((prev) => prev.filter((r) => r.id !== req.id));
                                  fetch(`/api/display-requests/${req.id}`, { method: "DELETE" }).catch(() => {});
                                }}
                                  className="text-[9px] font-medium px-1.5 py-0.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer border border-slate-200">
                                  삭제
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* 리사이즈 핸들 — 좌우 폭 조절 · 데스크탑만 */}
              <div
                onMouseDown={startReqPanelResize}
                className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-slate-200 hover:bg-emerald-400 rounded-full cursor-col-resize transition-all shrink-0 relative group"
                title="드래그하여 폭 조절"
              >
                <span className="text-[10px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
              </div>

              {/* SECTION 2: 우측 윙 — 남는 공간 모두 사용 · 미니멀 세련 톤 */}
              <div className="flex-1 min-w-0 lg:min-w-[400px] bg-white border border-slate-200 rounded-2xl p-3 flex flex-col gap-3 shadow-md shadow-slate-200/60 relative">

                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-slate-900 flex items-center justify-center shadow-sm">
                      <span className="text-[10px]">🚪</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-900 leading-none">동측 윙</span>
                      <span className="text-[8px] font-semibold text-slate-400 leading-none mt-0.5 uppercase tracking-wider">Counter · Event · Front Display</span>
                    </div>
                  </div>
                  {/* 미니 위치 다이어그램 · 세련된 카드 */}
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                    <svg width="30" height="24" viewBox="0 0 42 34" className="shrink-0" aria-label="수직윙 위치">
                      <rect x="1" y="1" width="30" height="20" rx="1.5" fill="none" stroke="#cbd5e1" strokeWidth="1.2" />
                      <rect x="31" y="1" width="10" height="32" rx="1.5" fill="#0f172a" />
                      <circle cx="36" cy="17" r="2" fill="#fbbf24" />
                    </svg>
                    <span className="text-[8px] font-bold text-slate-600 leading-none">현재 위치</span>
                  </div>
                </div>

                {/* 1단: 베스트존 (이벤트 3구역) — 35·36·37 */}
                <div className="w-full bg-slate-50/60 rounded-xl p-2.5 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-slate-800 uppercase tracking-wide flex items-center gap-1">
                      <span className="w-1 h-3 bg-amber-500 rounded-full inline-block" />
                      베스트존
                    </span>
                    <span className="text-[8px] font-semibold text-slate-400">이벤트 3구역 · 35·36·37</span>
                  </div>
                  <div className="flex gap-1.5 items-stretch">
                    {[35, 36, 37].map(num => (
                      <div key={`event-slot-${num}`} className="flex-1 flex flex-col gap-0.5">
                        <span className="text-[8px] font-bold text-slate-500 leading-none">이벤트 · {num}</span>
                        {renderZoneCell(num, "w-full h-[70px] text-[9px] p-1 justify-center")}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2단: 메인 카운터 (40 A/B/C) */}
                <div className="w-full bg-slate-50/60 rounded-xl p-2.5 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-slate-800 uppercase tracking-wide flex items-center gap-1">
                      <span className="w-1 h-3 bg-slate-900 rounded-full inline-block" />
                      메인 카운터
                    </span>
                    <span className="text-[8px] font-semibold text-slate-400">3구역 · 40A · 40B · 40C</span>
                  </div>
                  <div className="flex gap-1.5 items-stretch">
                    {(["A", "B", "C"] as const).map((side) => (
                      <div key={`counter-${side}`} className="flex-1 flex flex-col gap-0.5">
                        <span className="text-[8px] font-bold text-slate-500 leading-none">카운터 {side === "A" ? "1" : side === "B" ? "2" : "3"}</span>
                        {renderZoneCellById(`40${side}`, "w-full h-[70px] justify-between items-center text-[9px] p-1 bg-slate-800 text-white", "", true)}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3단: 정면 약진열 (38) + 시설 (41, 39) */}
                <div className="w-full flex gap-2">
                  <div className="flex-[3] bg-slate-50/60 rounded-xl p-2.5 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black text-slate-800 uppercase tracking-wide flex items-center gap-1">
                        <span className="w-1 h-3 bg-emerald-500 rounded-full inline-block" />
                        정면 약진열
                      </span>
                      <span className="text-[8px] font-semibold text-slate-400">38</span>
                    </div>
                    {renderZoneCell(38, "w-full h-[70px] justify-center bg-emerald-600 text-white text-[9px] p-1 font-bold")}
                  </div>
                  <div className="flex-[2] bg-slate-50/60 rounded-xl p-2.5 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black text-slate-800 uppercase tracking-wide flex items-center gap-1">
                        <span className="w-1 h-3 bg-slate-400 rounded-full inline-block" />
                        시설
                      </span>
                    </div>
                    <div className="flex gap-1.5 flex-1">
                      <div className="flex-1 flex flex-col gap-0.5">
                        <span className="text-[8px] font-bold text-slate-500 leading-none">☕ 휴게실</span>
                        {renderZoneCell(41, "w-full h-[70px] text-[9px] bg-slate-200 text-slate-700 justify-center border-none")}
                      </div>
                      <div className="flex-1 flex flex-col gap-0.5">
                        <span className="text-[8px] font-bold text-slate-500 leading-none">🗄️ 사물함</span>
                        {renderZoneCell(39, "w-full h-[70px] text-[9px] bg-slate-200 text-slate-700 justify-center border-none")}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center text-[8px] text-slate-400 pt-1 leading-none">
                  <span>🛗 1층 연결 EV · 🛒 카트존</span>
                  <span>🚰 수도 시설</span>
                </div>
              </div>

              </div>{/* end 2-column row */}

            </div>
            </div>{/* end overflow-x-auto */}
          </div>
        </section>

      </main>
      )}

      {/* Footer */}
      <footer className="bg-white text-center p-4 mt-8 text-xs text-gray-400 border-t border-gray-200">
        &copy; 2026 오산메가타운 매장 관리 시스템. All Rights Reserved. (주)이룸
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-gray-900/60 backdrop-blur-sm" onClick={() => setActiveZoneId(null)}>
          <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3 bg-slate-50">
              <div className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center shrink-0 font-black text-lg ${statusCell(draftStatus)}`}>
                {activeZone.num}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold text-slate-900 truncate">{activeZone.label}</div>
                <div className="text-[11px] text-slate-500">{activeZone.category}</div>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusBadge(draftStatus)}`}>
                {STATUS_LABEL[draftStatus]}
              </span>
              <button onClick={() => setActiveZoneId(null)} className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* Assigned staff */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1 block">
                  <User size={11} />담당 직원
                </label>
                {(() => {
                  const assignedStaff = employees.find((e) => e.id === draftStaffId) ?? null;
                  const isLogistics = assignedStaff?.position.includes("물류");
                  const colorIdx = assignedStaff ? (staffColorMap.get(assignedStaff.id) ?? 0) : 0;
                  return assignedStaff ? (
                    <div className="flex items-center gap-3 px-3 py-3 rounded-xl border-2 border-indigo-200 bg-indigo-50">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-black shrink-0 ${isLogistics ? STAFF_AVATAR_COLORS[colorIdx % STAFF_AVATAR_COLORS.length] : "bg-slate-300 text-slate-700"}`}>
                        {assignedStaff.name.slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-slate-900">{assignedStaff.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isLogistics ? "bg-indigo-200 text-indigo-800" : "bg-slate-200 text-slate-600"}`}>
                            {assignedStaff.position || "약사"}
                          </span>
                        </div>
                      </div>
                      <button type="button" onClick={() => setDraftStaffId(null)}
                        className="text-slate-400 hover:text-slate-600 transition cursor-pointer p-1">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <select value="" onChange={(e) => setDraftStaffId(e.target.value === "" ? null : Number(e.target.value))}
                      disabled={employees.length === 0}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border-2 border-dashed border-slate-300 bg-white focus:border-violet-400 outline-none transition cursor-pointer disabled:bg-slate-50 text-slate-500">
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
                  <label className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
                    적용 요일
                    <span className="text-[10px] font-normal text-slate-400">체크된 요일에만 이 담당이 표시됩니다</span>
                  </label>
                  <div className="space-y-2">
                    {activeZone.assignedStaffName.split(",").map(s => s.trim()).filter(Boolean).map((name) => {
                      const mask = activeZone.dowMap?.[name] ?? DOW_ALL;
                      return (
                        <div key={name} className="flex items-center gap-2 flex-wrap px-2 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-xs font-bold text-slate-700 shrink-0 min-w-[3rem]">{name}</span>
                          <div className="flex items-center gap-1 flex-wrap">
                            {DOW_LABELS.map((lb, dow) => {
                              const active = ((mask >> dow) & 1) === 1;
                              return (
                                <button
                                  key={dow}
                                  type="button"
                                  onClick={() => toggleZoneDow(activeZone.id, name, dow)}
                                  className={`w-7 h-7 text-[11px] font-bold rounded-md border transition cursor-pointer ${
                                    active
                                      ? (dow === 0 ? "bg-rose-500 text-white border-rose-500"
                                        : dow === 6 ? "bg-sky-500 text-white border-sky-500"
                                        : "bg-indigo-500 text-white border-indigo-500")
                                      : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
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
                <label className="text-xs font-semibold text-slate-600 mb-2 block">진열 상태</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["normal", "low", "empty"] as const).map((s) => (
                    <button key={s} type="button" onClick={() => setDraftStatus(s)}
                      className={`py-2.5 text-xs font-semibold rounded-xl border-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${draftStatus === s
                        ? s === "normal" ? "bg-emerald-50 text-emerald-700 border-emerald-400 shadow-sm"
                          : s === "low" ? "bg-amber-50 text-amber-700 border-amber-400 shadow-sm"
                          : "bg-red-50 text-red-700 border-red-400 shadow-sm"
                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
                      <span className={`w-2 h-2 rounded-full ${statusDot(s)}`} />
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Products */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-600">진열 상품 메모</label>
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
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none transition resize-none" />
              </div>

              {/* Request note */}
              {(draftStatus === "low" || draftStatus === "empty") && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">요청 메모 (선택)</label>
                  <input type="text" value={requestNote} onChange={(e) => setRequestNote(e.target.value)}
                    placeholder="오늘 오후까지 보충 부탁드립니다"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white focus:border-violet-500 outline-none transition" />
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
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row gap-2">
              <button onClick={handleSave}
                className="flex-1 sm:flex-none px-4 py-2.5 text-sm font-semibold rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition cursor-pointer flex items-center justify-center gap-1.5">
                <Save size={14} />저장
              </button>
              <button onClick={handleSendRequest} disabled={!canRequest}
                title={!canRequest ? "상태를 부족/품절로 변경하고 담당 직원을 배정하세요" : ""}
                className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition cursor-pointer flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:cursor-not-allowed disabled:text-slate-400 shadow-sm shadow-violet-200">
                <Send size={15} />진열 요청 보내기
                {!canRequest && <span className="text-[10px] font-normal opacity-70">(부족·품절 + 담당자 필요)</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Employee Info Modal ──────────────────────────────────────────────── */}
      {activeStaffInfo && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-gray-900/60 backdrop-blur-sm"
          onClick={() => setActiveStaffInfo(null)}>
          <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            {(() => {
              const colorIdx = staffColorMap.get(activeStaffInfo.employee.id) ?? 0;
              const isLogistics = activeStaffInfo.employee.position.includes("물류");
              return (
                <div className={`px-5 py-5 bg-gradient-to-br ${isLogistics ? "from-indigo-600 to-indigo-700" : "from-slate-700 to-slate-800"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-2xl font-black text-white shrink-0">
                        {activeStaffInfo.employee.name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="text-xl font-black text-white leading-tight">{activeStaffInfo.employee.name}</div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/25 text-white">
                            {activeStaffInfo.employee.position || "약사"}
                          </span>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${SHIFT_BADGE[activeStaffInfo.scheduleType] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}>
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
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                    <MapPin size={12} className="text-indigo-500" />
                    구역 배정
                    {getAssignedZones(activeStaffInfo.employee.id).length > 0 && (
                      <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-black">
                        {getAssignedZones(activeStaffInfo.employee.id).length}개
                      </span>
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
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">{sectionLabel[section]}</div>
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
                              className={`rounded-lg border-2 p-1 text-left transition-all cursor-pointer active:scale-95 ${
                                isAssigned
                                  ? "bg-indigo-100 border-indigo-400 shadow-sm"
                                  : otherName
                                  ? "bg-amber-50 border-amber-300 hover:border-indigo-300"
                                  : "bg-white border-slate-200 hover:border-indigo-300 hover:bg-indigo-50"
                              }`}
                            >
                              {/* 1-8 은 A/B 로 구분되므로 번호 유지 · 9+ 는 카테고리 라벨과 중복이므로 번호 숨김 */}
                              {z.num <= 8 && (
                                <div className={`text-[10px] font-black leading-tight ${isAssigned ? "text-indigo-800" : otherName ? "text-amber-700" : "text-slate-700"}`}>
                                  {z.num}
                                  {z.id.endsWith("A") && "A"}
                                  {z.id.endsWith("B") && "B"}
                                </div>
                              )}
                              <div className={`text-[8px] leading-none ${z.num <= 8 ? "mt-0.5" : "mt-0"} truncate ${isAssigned ? "text-indigo-500" : otherName ? "text-amber-500" : "text-slate-400"}`}>
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
                <div className="flex flex-col items-center py-4 text-slate-400 text-xs text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Sparkles size={18} className="mb-1 opacity-30" />
                  구역 배정은 물류 직원에게만 적용됩니다
                </div>
              </div>
            )}

            <div className="px-5 pb-5">
              <button onClick={() => setActiveStaffInfo(null)}
                className="w-full py-2.5 text-sm font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer">
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
          if (m1) return { num: Number(m1[1]), side: (m1[2] as "A"|"B") ?? null };
          // 2) "9B" · "5A" · "21" 형식 (spec)
          const m2 = /^(\d+)([AB])?$/.exec(s);
          if (m2) return { num: Number(m2[1]), side: (m2[2] as "A"|"B") ?? null };
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4" onClick={() => setZoneProductsModal(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-sky-50 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">구역별 상품 리스트</div>
                  <div className="text-lg font-black text-slate-800 mt-0.5">{zoneProductsModal.zoneLabel}</div>
                  {zoneProductsModal.category && (
                    <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{zoneProductsModal.category}</div>
                  )}
                </div>
                <button onClick={() => setZoneProductsModal(null)} className="text-slate-400 hover:text-slate-700 text-2xl font-black w-8 h-8 rounded-lg hover:bg-white/70 cursor-pointer flex items-center justify-center">×</button>
              </div>
              {/* Filters */}
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2 flex-wrap">
                <input type="text" value={zoneProductsSearch} onChange={e => setZoneProductsSearch(e.target.value)} placeholder="상품명 검색"
                  className="flex-1 min-w-[120px] text-[11px] border border-slate-300 rounded px-2 py-1 focus:outline-none focus:border-emerald-400" />
                <div className="inline-flex bg-white border border-slate-300 rounded p-0.5">
                  <button onClick={() => setZoneProductsFilter("all")} className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer transition ${zoneProductsFilter === "all" ? "bg-slate-800 text-white" : "text-slate-500"}`}>전체</button>
                  <button onClick={() => setZoneProductsFilter("mismatch")} className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer transition ${zoneProductsFilter === "mismatch" ? "bg-rose-500 text-white" : "text-rose-500"}`}>⚠️ 불일치</button>
                </div>
                <span className="text-[10px] font-bold text-slate-500 ml-auto">{filtered.length}/{matched.length}건</span>
              </div>
              {/* List — 재고관리 페이지와 동일한 컬럼 구성 (ERP · 창고 · 매장 · 실재고 · 적정 · 상황) · 가로 스크롤 없음 */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-50 p-2 sm:p-4">
                {filtered.length === 0 ? (
                  <div className="text-center text-xs text-slate-400 py-10 bg-white rounded-xl border border-slate-200">해당 조건의 상품 없음</div>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
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
                      <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                        <tr className="text-[10px] font-black text-slate-600 uppercase tracking-wide">
                          <th className="text-left px-2 py-2">
                            <button type="button" onClick={() => toggleSort("name")} className="hover:text-slate-900 cursor-pointer inline-flex items-center gap-1">
                              상품명 <span className="text-slate-400 text-[8px]">{sortIcon("name")}</span>
                            </button>
                          </th>
                          <th className="text-right px-1 py-2 text-amber-500" title="ERP 현재고 (products.current_stock)">
                            <button type="button" onClick={() => toggleSort("current_stock")} className="hover:text-amber-700 cursor-pointer inline-flex items-center justify-end gap-0.5 w-full">
                              ERP<span className="text-slate-400 text-[8px]">{sortIcon("current_stock")}</span>
                            </button>
                          </th>
                          <th className="text-right px-1 py-2 bg-cyan-50 text-cyan-600 font-black" title="실재고 · 창고">
                            <button type="button" onClick={() => toggleSort("warehouse_stock")} className="hover:text-cyan-800 cursor-pointer inline-flex items-center justify-end gap-0.5 w-full">
                              창고<span className="text-slate-400 text-[8px]">{sortIcon("warehouse_stock")}</span>
                            </button>
                          </th>
                          <th className="text-right px-1 py-2 bg-violet-50 text-violet-600 font-black" title="실재고 · 매장">
                            <button type="button" onClick={() => toggleSort("store_stock")} className="hover:text-violet-800 cursor-pointer inline-flex items-center justify-end gap-0.5 w-full">
                              매장<span className="text-slate-400 text-[8px]">{sortIcon("store_stock")}</span>
                            </button>
                          </th>
                          <th className="text-right px-1 py-2 text-emerald-600 font-black" title="실재고 합계 (창고+매장)">
                            <button type="button" onClick={() => toggleSort("real_total")} className="hover:text-emerald-800 cursor-pointer inline-flex items-center justify-end gap-0.5 w-full">
                              실재고<span className="text-slate-400 text-[8px]">{sortIcon("real_total")}</span>
                            </button>
                          </th>
                          <th className="text-right px-1 py-2 text-rose-500 font-black" title="손실 (마감재고 - 현재고, 양수일수록 손실)">
                            <button type="button" onClick={() => toggleSort("loss")} className="hover:text-rose-700 cursor-pointer inline-flex items-center justify-end gap-0.5 w-full">
                              손실<span className="text-slate-400 text-[8px]">{sortIcon("loss")}</span>
                            </button>
                          </th>
                          <th className="text-right px-1 py-2 text-slate-500" title="적정재고 (products.optimal_stock)">
                            <button type="button" onClick={() => toggleSort("optimal_stock")} className="hover:text-slate-800 cursor-pointer inline-flex items-center justify-end gap-0.5 w-full">
                              적정<span className="text-slate-400 text-[8px]">{sortIcon("optimal_stock")}</span>
                            </button>
                          </th>
                          <th className="text-center px-1 py-2">
                            <button type="button" onClick={() => toggleSort("status")} className="hover:text-slate-900 cursor-pointer inline-flex items-center justify-center gap-0.5 w-full">
                              상황<span className="text-slate-400 text-[8px]">{sortIcon("status")}</span>
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
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
                          let statusClass = "text-emerald-700 bg-emerald-50 border-emerald-200";
                          if (!Number.isFinite(stockNum)) {
                            statusLabel = "미확인"; statusClass = "text-slate-500 bg-slate-100 border-slate-200";
                          } else if (stockNum <= 0) {
                            statusLabel = "품절"; statusClass = "text-red-700 bg-red-50 border-red-300";
                          } else if (stockNum < 3) {
                            statusLabel = "품절임박"; statusClass = "text-amber-700 bg-amber-50 border-amber-300 animate-pulse";
                          } else if (Number.isFinite(optNum) && optNum > 0 && stockNum < optNum) {
                            statusLabel = "적정이하"; statusClass = "text-orange-700 bg-orange-50 border-orange-200";
                          }
                          const fmt = (v: any) => v == null ? "-" : String(v);
                          return (
                            <tr key={p.code} className="hover:bg-slate-50 cursor-pointer" onClick={() => { setProductInfoModal(p); setZoneProductsModal(null); }}>
                              <td className="text-left px-2 py-1.5 min-w-0">
                                <div className="text-[12px] font-bold text-slate-800 truncate" title={p.name}>{p.name}</div>
                                {((p as any).spec || (p as any).real_map) && (
                                  <div className="mt-0.5 text-[9px] text-slate-400 truncate">
                                    {(p as any).spec && <span className="font-mono" title="전산배치구역">전산 {String((p as any).spec)}</span>}
                                    {(p as any).real_map && <span className="font-mono" title="실제배치구역"> · 실제 {String((p as any).real_map)}</span>}
                                  </div>
                                )}
                              </td>
                              <td className={`text-right px-1 py-1.5 font-mono font-black text-[11px] ${!Number.isFinite(stockNum) ? "text-slate-300" : stockNum <= 0 ? "text-red-600" : "text-amber-700"}`}>{Number.isFinite(stockNum) ? stockNum : "-"}</td>
                              <td className={`text-right px-1 py-1.5 font-mono font-black text-[11px] bg-cyan-50/50 ${wh != null ? "text-cyan-700" : "text-slate-300"}`}>{fmt(wh)}</td>
                              <td className={`text-right px-1 py-1.5 font-mono font-black text-[11px] bg-violet-50/50 ${st != null ? "text-violet-700" : "text-slate-300"}`}>{fmt(st)}</td>
                              <td className={`text-right px-1 py-1.5 font-mono font-black text-[11px] ${realTotal == null ? "text-slate-300" : mismatch ? "text-rose-600" : "text-emerald-700"}`} title={mismatch ? `실재고 ${realTotal} ≠ ERP ${stockNum} · 불일치` : "실재고 합계"}>{realTotal == null ? "-" : realTotal}</td>
                              {(() => {
                                const closingRaw = (p as any).closing_stock;
                                const closingNum = closingRaw != null && closingRaw !== "" ? Number(closingRaw) : NaN;
                                const loss = (Number.isFinite(closingNum) && Number.isFinite(stockNum)) ? (closingNum - stockNum) : null;
                                return (
                                  <td className={`text-right px-1 py-1.5 font-mono font-black text-[11px] ${loss == null ? "text-slate-300" : loss > 0 ? "text-rose-600" : loss < 0 ? "text-sky-600" : "text-slate-500"}`} title={loss == null ? "마감재고 없음" : `마감재고 ${closingNum} - 현재고 ${stockNum} = ${loss}`}>{loss == null ? "-" : loss}</td>
                                );
                              })()}
                              <td className={`text-right px-1 py-1.5 font-mono font-black text-[11px] ${Number.isFinite(optNum) ? "text-slate-600" : "text-slate-300"}`}>{Number.isFinite(optNum) ? optNum : "-"}</td>
                              <td className="text-center px-1 py-1.5">
                                <span className={`inline-block text-[9px] font-black border rounded-full px-1.5 py-0.5 ${statusClass}`}>{statusLabel}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
                <button onClick={() => setZoneProductsModal(null)} className="text-[11px] font-bold text-slate-600 bg-white border border-slate-300 px-4 py-1.5 rounded hover:bg-slate-100 cursor-pointer">닫기</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 상품정보 모달 ── */}
      {productInfoModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-1 sm:p-4" onClick={() => setProductInfoModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[98vh] sm:max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-sky-50 to-indigo-50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shrink-0 shadow-md">
                  <Package size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-black text-slate-800 truncate">{productInfoModal.name ?? (productInfoModal as any).product_name}</div>
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5">#{productInfoModal.code ?? (productInfoModal as any).product_code}</div>
                </div>
              </div>
              <button onClick={() => setProductInfoModal(null)} className="text-slate-400 hover:text-slate-700 text-3xl leading-none font-black w-9 h-9 rounded-lg hover:bg-white/70 transition cursor-pointer flex items-center justify-center shrink-0">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 sm:p-4 bg-slate-50">
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

export default DisplayPage;
