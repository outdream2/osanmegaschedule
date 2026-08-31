// src/components/DisplayPage/DisplayPage.tsx
// 2026-08-22 · Framework Phase 4 · 대형 파일 분리 완료
//   · ZoneDetailModal · StaffInfoModal · ZoneProductsModal · ProductInfoModal
//   · DisplayStoreMap · useDisplayData · DisplaySearchBar
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useZoneDefs } from "../../hooks/useZoneDefs";
import { type ZoneStatus, type DowMap, type DisplayZone } from "../../utils/zoneUtils";
import { type ProductInfo } from "../../lib/productsCache";
import {
  Bell, CheckCircle2, ChevronLeft, ChevronRight,
  Layers, Save, ScanLine, X, Store,
} from "lucide-react";
import { Spinner } from "../common/Spinner";
import { StatusPill } from "../common/StatusPill";
import { IconTile } from "../common/IconTile";
import { BarcodeScanner } from "../BarcodeScanner";
import { ZoneCell } from "./ZoneCell";
import { ZoneGroupPanel, type ZoneGroup } from "./ZoneGroupPanel";
import { AppNavHeader } from "../layout/AppNavHeader";
import { useSidebarEnabled } from "../../hooks/useSidebar";
import { useIsMobile } from "../../hooks/use-mobile";
import { DisplayRequestPanel } from "./DisplayRequestPanel";
import { StockArrivalPage } from "../StockArrivalPage/StockArrivalPage";
import OrderManagePage from "../OrderManagePage/OrderManagePage";
// 2026-08-29 · #193 · 사용자 지시 · 상품 서브탭 · 3개 이너 탭 (실재고입력·상품입고·상품정보) 매입에서 이관
const ScanPageLazy = React.lazy(() => import("../ScanPage/ScanPage").then(m => ({ default: m.ScanPage })));
const ProductArrivalPageLazy = React.lazy(() => import("../ProductArrivalPage/ProductArrivalPage").then(m => ({ default: m.ProductArrivalPage })));
const ProductInfoPageLazy = React.lazy(() => import("../ProductInfoPage/ProductInfoPage").then(m => ({ default: m.ProductInfoPage })));
// 2026-08-29 · #193 · 반품 서브탭 · 매입 우회 · 반품필요 + 반품확정 직접 렌더 (이너 탭)
const ReturnListPanelLazy = React.lazy(() => import("../OrderManagePage/ReturnListPanel").then(m => ({ default: m.ReturnListPanel })));
const ReturnConfirmedPanelLazy = React.lazy(() => import("../OrderManagePage/ReturnConfirmedPanel").then(m => ({ default: m.ReturnConfirmedPanel })));
import { TabBar, type TabDef as CommonTabDef } from "../common/TabBar";
import { useSortableTabs } from "../../hooks/useSortableTabs";
import { useConfirm } from "../../hooks/useConfirm";
import { useToast, toastClass } from "../../hooks/useToast";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import { useContactInfo } from "../../hooks/useContactInfo";
import { usePagePermissions } from "../../hooks/usePagePermissions";
import type { AuthSession } from "../../types";
import { api, ApiError } from "../../lib/apiClient";
import type { DpSubTabKey, DisplayPageProps, DisplayRequest, Employee, TodayStaff, PopoverAnchor } from "./DisplayPage.types";
import {
  DP_SUBTAB_DEFAULTS,
  DOW_ALL, DOW_LABELS, isDowActive,
  saveZones, saveRequests,
  STATUS_LABEL, statusCell, statusDot, statusBadge,
  SHIFT_BADGE, formatRel,
  STAFF_COLORS,
  saveZonesToDB,
  MULTI_ASSIGN_ZONE_NUMS,
} from "./DisplayPage.helpers";
// 2026-08-25 · Framework Phase 4 · 4 modals wrapper + WallZoneCard + subtab 초기화 hook
import { DisplayModals } from "./DisplayModals";
import { type ZoneProductsModalState } from "./ZoneProductsModal";
import { WallZoneCard } from "./WallZoneCard";
import { useDpInitialSubTab } from "./useDpInitialSubTab";
import { DisplayStoreMap } from "./DisplayStoreMap";
import { DisplaySearchBar } from "./DisplaySearchBar";
import { DisplayMobileList } from "./DisplayMobileList";
import { DisplayProductPanel } from "./DisplayProductPanel";
import { VendorManageSplit } from "./VendorManageSplit";
import { useDisplayData } from "./useDisplayData";
// 2026-08-25 · 사용자 지시 · 매장구역 안 배치구역 불일치 탭
// 2026-08-26 · 사용자 지시 · 미지정 인너탭 통합 · MismatchPage wrapper 사용
import { MismatchPage } from "./MismatchPage";
// 2026-08-26 · 사용자 지시 · 실재고 테이블 페이지 · 창고2 옆 신규 탭
import { RealStockTablePage } from "./RealStockTablePage";
// 2026-08-26 · 사용자 지시 · 매장구역도 편집 · 신규 탭 · KV DB 저장
import { ZoneEditPanel } from "./ZoneEditPanel";
import { SplitRightTabs } from "../common/SplitRightTabs";
// 2026-08-26 · 창고1 · 창고2 구역도 · storage.webp 기반
import { WarehouseZoneMap } from "../common/WarehouseZoneMap";

// 기존 DOW_* export 하위 호환 유지 (외부 import 대응)
export { DOW_ALL, DOW_LABELS, isDowActive };

// ─── Main component ────────────────────────────────────────────────────────────
export const DisplayPage: React.FC<DisplayPageProps> = ({ onBack, onOpenEmployeeEdit, authSession, onNavigate, onLogout }) => {
  const confirm = useConfirm();
  const { toast, showError, showSuccess } = useToast();
  const { brand: dpBrand } = useBrandIdentity();
  const { contact: dpContact } = useContactInfo();
  const dpUserLevel = authSession?.level ??
    (authSession?.role === "superadmin" || authSession?.role === "admin" ? 9 :
      authSession?.role === "manager" ? 2 : authSession?.role === "employee" ? 1 : 0);
  const dpCanSeeStockManage = dpUserLevel >= 9;
  const dpCanSeeStockArrivals = dpUserLevel >= 3;

  // 2026-08-23 · #189 · 구역 편집 (팝오버) 지원 · setZoneDefs 사용
  // 2026-08-26 · #129 · saveNow 로 즉시 저장 + 토스트 피드백 (사용자 · 저장 안됨 신고)
  const { zones: ZONE_DEFS, zonesRaw, setZones: setZoneDefs, saveNow: saveZoneDefsNow } = useZoneDefs();

  // 2026-08-23 · #181 Phase 2 · 매장 구역도 드래그 재정렬 · 관리자 (lv>=9) 만
  const dpZoneEditable = dpUserLevel >= 9;
  const handleZoneReorder = React.useCallback((fromNum: number, toNum: number) => {
    if (!dpZoneEditable || fromNum === toNum) return;
    setZoneDefs((prev) => {
      const a = prev.find(z => z.num === fromNum);
      const b = prev.find(z => z.num === toNum);
      if (!a || !b) return prev;
      // num 스왑 · 다른 필드 유지 (label · category · subA · subB 등)
      return prev.map(z => {
        if (z.num === fromNum) return { ...z, num: toNum };
        if (z.num === toNum) return { ...z, num: fromNum };
        return z;
      });
    });
  }, [dpZoneEditable, setZoneDefs]);

  const { perms: dpPerms } = usePagePermissions();
  const dpHiddenSubs = React.useMemo(() => {
    const set = new Set<DpSubTabKey>();
    const subs: DpSubTabKey[] = ["product", "purchase-order", "purchase", "payment", "statistics", "return", "stock-arrivals", "store", "vendor-manage"];
    for (const s of subs) {
      const perm = (dpPerms as any)[`display:${s}`];
      if (perm?.hidden === true) set.add(s);
    }
    return set;
  }, [dpPerms]);
  const isDpMobile = useIsMobile();
  const SIDEBAR_ENABLED = useSidebarEnabled();
  const [dpSubTab, setDpSubTab] = useState<DpSubTabKey>(dpCanSeeStockManage ? "purchase-order" : "store");
  // 2026-08-29 · #193 · 상품 서브탭 안 · 3개 이너 탭 (실재고입력·상품입고·상품정보)
  // 2026-08-30 · 사용자 지시 · 순서 변경 · 상품정보 · 실재고입력 · 상품입고
  const [productInnerTab, setProductInnerTab] = useState<"info" | "scan" | "arrival">(() => {
    try {
      const raw = localStorage.getItem("dp.productInnerTab");
      if (raw === "arrival" || raw === "info" || raw === "scan") return raw;
    } catch { /* noop */ }
    return "info"; // 2026-08-30 · 사용자 지시 · 기본 · 상품정보
  });
  useEffect(() => {
    try { localStorage.setItem("dp.productInnerTab", productInnerTab); } catch { /* noop */ }
  }, [productInnerTab]);
  // 2026-08-29 · #193 · 반품 서브탭 안 · 2개 이너 탭 (반품필요·반품확정)
  const [returnInnerTabDp, setReturnInnerTabDp] = useState<"need" | "confirmed">(() => {
    try {
      const raw = localStorage.getItem("dp.returnInnerTab");
      if (raw === "confirmed" || raw === "need") return raw;
    } catch { /* noop */ }
    return "need";
  });
  useEffect(() => {
    try { localStorage.setItem("dp.returnInnerTab", returnInnerTabDp); } catch { /* noop */ }
  }, [returnInnerTabDp]);

  // 2026-08-25 · Framework Phase 4 · 서브탭 초기화 · useDpInitialSubTab 이관
  useDpInitialSubTab(dpSubTab, setDpSubTab, dpHiddenSubs);

  // 2026-08-30 · 사용자 지시 · 접기/펼치기 제거 · 그냥 보이게 (mapCollapsed prop 유지 안 함)
  // 2026-08-25 · 사용자 지시 · 매장구역 subtab 안 · 매장구역도 vs 배치구역 불일치 탭
  // 2026-08-26 · 창고1 · 창고2 구역도 탭 추가 (storage.webp 기반)
  const [storeInnerTab, setStoreInnerTab] = useState<"map" | "displayRequest" | "mismatch" | "warehouse1" | "warehouse2" | "stockTable" | "zoneEdit">(() => {
    try {
      const raw = sessionStorage.getItem("dpStoreInnerTab");
      if (raw === "mismatch") { sessionStorage.removeItem("dpStoreInnerTab"); return "mismatch"; }
    } catch { /* SSR */ }
    return "map";
  });

  const dpTabSortable = useSortableTabs<CommonTabDef<DpSubTabKey>>("tabOrder.displayPage", DP_SUBTAB_DEFAULTS, dpUserLevel >= 8);

  // 날짜 관련
  const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayStr = fmtDate(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const selectedYM = selectedDate.slice(0, 7);
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const selectedDateObj = new Date(selectedDate + "T00:00:00");
  const isToday = selectedDate === todayStr;
  const navigateDate = (delta: number) => setSelectedDate(prev => { const d = new Date(prev + "T00:00:00"); d.setDate(d.getDate() + delta); return fmtDate(d); });

  // 데이터 훅
  const {
    employees,
    todayStaff,
    zones, setZones,
    requests, setRequests,
    productsMap, setProductsMap,
    zoneGroups, setZoneGroups,
    saveStatus, lastSaveError,
  } = useDisplayData(selectedDate, selectedYM);

  // zone-labels-changed 이벤트 리렌더
  const [, setZoneLabelVersion] = useState(0);
  useEffect(() => {
    const handler = () => setZoneLabelVersion(v => v + 1);
    window.addEventListener("zone-labels-changed", handler);
    return () => window.removeEventListener("zone-labels-changed", handler);
  }, []);

  // UI 상태
  const [searchQuery, setSearchQuery] = useState("");
  const [popoverAnchor, setPopoverAnchor] = useState<PopoverAnchor | null>(null);
  const [dragStaff, setDragStaff] = useState<TodayStaff | null>(null);
  const dragStaffRef = useRef<TodayStaff | null>(null);
  const [dragOverZoneId, setDragOverZoneId] = useState<string | null>(null);
  const [activeStaffInfo, setActiveStaffInfo] = useState<TodayStaff | null>(null);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [draftCategory, setDraftCategory] = useState("");
  const [draftProducts, setDraftProducts] = useState("");
  const [draftStaffId, setDraftStaffId] = useState<number | null>(null);
  const [draftStatus, setDraftStatus] = useState<ZoneStatus>("normal");
  const [requestNote, setRequestNote] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [requestFlash, setRequestFlash] = useState(false);
  type ScannerMode = "search" | "products" | null;
  const [scannerMode, setScannerMode] = useState<ScannerMode>(null);
  const [productMatchZoneId, setProductMatchZoneId] = useState<string | null>(null);
  const [productInfoModal, setProductInfoModal] = useState<ProductInfo | null>(null);
  const [zoneProductsModal, setZoneProductsModal] = useState<ZoneProductsModalState | null>(null);
  const [fullMapOpen, setFullMapOpen] = useState(false);
  const [zoneProductsFilter, setZoneProductsFilter] = useState<"all" | "mismatch">("all");
  const [zoneProductsSort, setZoneProductsSort] = useState<{ key: "name" | "spec" | "real_map" | "current_stock" | "warehouse_stock" | "store_stock" | "real_total" | "loss" | "optimal_stock" | "status" | "mismatch"; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [zoneProductsSearch, setZoneProductsSearch] = useState("");
  const [reqFilter, setReqFilter] = useState<"all" | "pending" | "done">("all");
  const [zoneConfigOpen, setZoneConfigOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [saveAllToast, setSaveAllToast] = useState(false);
  const [pendingAutoAssign, setPendingAutoAssign] = useState<null | {
    prevZones: DisplayZone[];
    assignedList: Array<{ zoneId: string; name: string; id: number }>;
  }>(null);
  const [quickReqToast, setQuickReqToast] = useState<string | null>(null);

  const handleQuickRequest = useCallback((zone: DisplayZone) => {
    if (!zone.assignedStaffId) return;
    const req: DisplayRequest = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      zoneId: zone.id, zoneLabel: `${zone.num}번 ${zone.label}`, category: zone.category,
      requestedAt: new Date().toISOString(), assignedStaffId: zone.assignedStaffId,
      assignedStaffName: zone.assignedStaffName, status: "pending", note: "빠른 요청",
    };
    setRequests((prev) => [req, ...prev]);
    setQuickReqToast(`${zone.assignedStaffName}님께 ${zone.num}번 ${zone.label} 보충 요청 전송됨`);
    setTimeout(() => setQuickReqToast(null), 3500);
    api.post("/api/display-requests", { zone_id: zone.id, zone_label: `${zone.num}번 ${zone.label}`, category: zone.category, requested_at: new Date().toISOString(), assigned_staff_id: zone.assignedStaffId, assigned_staff_name: zone.assignedStaffName, note: "빠른 요청" }).catch(() => {});
    api.post("/api/push-send", { employeeId: zone.assignedStaffId, title: "📦 진열 보충 요청", body: `${zone.num}번 ${zone.label} (${zone.category}) 보충이 필요합니다.`, url: "/" }).catch(() => {});
  }, []);

  const handleApplyToWeekday = useCallback(async () => {
    const d = new Date(selectedDate + "T00:00:00");
    const dow = d.getDay();
    const dowLabel = dayNames[dow];
    const proceed = await confirm({ message: `현재 배정 상태를 매주 ${dowLabel}에 적용할까요?\n\n• 각 담당자의 dowMap에 ${dowLabel} 활성 비트 추가\n• zone_assignments 테이블에 DB 저장 (${zones.length}개 구역)\n※ 다른 요일 설정은 그대로 유지됩니다.` });
    if (!proceed) return;
    const dowBit = 1 << dow;
    const nextZones = zones.map((z) => {
      if (!z.assignedStaffName) return z;
      const names = z.assignedStaffName.split(",").map(s => s.trim()).filter(Boolean);
      const nextDow: DowMap = { ...(z.dowMap ?? {}) };
      for (const n of names) nextDow[n] = (nextDow[n] ?? DOW_ALL) | dowBit;
      return { ...z, dowMap: nextDow };
    });
    setZones(nextZones); saveZones(nextZones); saveRequests(requests);
    try {
      await api.post("/api/zones", { zones: nextZones.map((z) => ({ zone_id: z.id, employee_id: z.assignedStaffId, employee_name: z.assignedStaffName, status: z.status, products: z.products, dow_map: z.dowMap ?? null })) });
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : (err?.message ?? String(err));
      showError(`❌ DB 저장 실패\n${msg}\n(로컬 캐시만 저장됨)`); return;
    }
    setSaveAllToast(true); setTimeout(() => setSaveAllToast(false), 3000);
    setTimeout(() => showSuccess(`✅ 매주 ${dowLabel} 적용 완료 · DB 저장 (${nextZones.length}개 구역)`), 100);
  }, [zones, requests, selectedDate, showError, showSuccess]);

  const handleAutoAssign = useCallback(async () => {
    const logistics = todayStaff.filter(s => s.employee.position.includes("물류"));
    if (logistics.length === 0) { showError("오늘 출근한 물류직원이 없습니다."); return; }
    const proceed = await confirm({ message: `물류 출근직원 ${logistics.length}명을 총 45구역에 근접성 세트 기반으로 임의배치할까요?` });
    if (!proceed) return;
    const PROXIMITY_SETS: string[][] = [
      ["1B","1A","2B","2A","9","10"],["3B","3A","11","12"],["4B","4A","13","14"],
      ["5B","5A","15","16"],["6B","6A","17","18"],["7B","7A","19","20"],
      ["8B","8A","21","22"],["23","24","25","26"],["27","28","29","30"],
      ["31","32","33","34"],["35","36","37"],
    ];
    const CANONICAL_ORDER: string[] = PROXIMITY_SETS.flat();
    const logisticsNames = new Set(logistics.map(ts => ts.employee.name));
    const logisticsIdByName = new Map<string, number>(logistics.map(ts => [ts.employee.name, ts.employee.id]));
    const newAssignment = new Map<string, { name: string; id: number }>();
    const alreadyPlaced = new Set<string>();
    for (const zoneId of CANONICAL_ORDER) {
      const z = zones.find(zz => zz.id === zoneId);
      if (!z || !z.assignedStaffName) continue;
      const validName = z.assignedStaffName.split(",").map(s => s.trim()).filter(Boolean).find(n => logisticsNames.has(n) && !alreadyPlaced.has(n));
      if (validName) { newAssignment.set(zoneId, { name: validName, id: logisticsIdByName.get(validName)! }); alreadyPlaced.add(validName); }
    }
    const unplaced = [...logisticsNames].filter(n => !alreadyPlaced.has(n));
    if (unplaced.length > 0) {
      const shuffled = [...unplaced].sort(() => Math.random() - 0.5);
      const emptySets = PROXIMITY_SETS.map((s, i) => s.every(z => newAssignment.has(z)) ? -1 : i).filter(i => i >= 0);
      const K = emptySets.length;
      if (K > 0) {
        for (let i = 0; i < K; i++) {
          const name = shuffled[Math.min(shuffled.length - 1, Math.floor((i * shuffled.length) / K))];
          const id = logisticsIdByName.get(name)!;
          for (const z of PROXIMITY_SETS[emptySets[i]]) { if (!newAssignment.has(z)) newAssignment.set(z, { name, id }); }
        }
      }
    }
    const prevZones = zones;
    setZones(zones.map(z => {
      if (!CANONICAL_ORDER.includes(z.id)) return z;
      const assign = newAssignment.get(z.id);
      if (assign) return { ...z, assignedStaffId: assign.id, assignedStaffName: assign.name, dowMap: { [assign.name]: DOW_ALL } };
      return z;
    }));
    setPendingAutoAssign({ prevZones, assignedList: Array.from(newAssignment.entries()).map(([zoneId, v]) => ({ zoneId, name: v.name, id: v.id })) });
  }, [todayStaff, zones]);

  const handleConfirmAutoAssign = useCallback(async () => {
    if (!pendingAutoAssign) return;
    const { assignedList } = pendingAutoAssign;
    saveZones(zones);
    try {
      await api.post("/api/zones", { zones: zones.map((z) => ({ zone_id: z.id, employee_id: z.assignedStaffId, employee_name: z.assignedStaffName, status: z.status, products: z.products, dow_map: z.dowMap ?? null })) });
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : (err?.message ?? String(err));
      showError(`❌ 배치확정 DB 저장 실패\n${msg}\n로컬 캐시만 저장됨 · 알림은 발송하지 않습니다.`); return;
    }
    const d = new Date(selectedDate + "T00:00:00");
    const dateLabel = `${fmtDate(d)} (${dayNames[d.getDay()]})`;
    const buildZoneLabel = (zoneId: string, zd: any) => {
      if (!zd) return `${zoneId}번`;
      if (zd.section === "aisle") return `진열대 ${zd.num}${zoneId.match(/([AB])$/)?.[1] ?? ""}`;
      if (["top_wall","bottom_wall","left_wall"].includes(zd.section)) return `벽면 ${zd.num}`;
      if (zd.section === "wing") return `${zd.label}`;
      if (zd.section === "event") return `이벤트존 ${zd.num}`;
      return `${zoneId}번`;
    };
    const grouped = new Map<number, { name: string; zones: Array<{ zoneLabel: string; category: string }> }>();
    for (const { zoneId, name, id } of assignedList) {
      const zd = ZONE_DEFS.find(z => z.num === parseInt(zoneId, 10));
      const side = zoneId.endsWith("A") ? "A" : zoneId.endsWith("B") ? "B" : "";
      const category = side === "A" ? (zd?.subA ?? zd?.category ?? "") : side === "B" ? (zd?.subB ?? zd?.category ?? "") : (zd?.category ?? "");
      if (!grouped.has(id)) grouped.set(id, { name, zones: [] });
      grouped.get(id)!.zones.push({ zoneLabel: buildZoneLabel(zoneId, zd), category });
    }
    let sent = 0;
    for (const [empId, { name, zones: zList }] of grouped) {
      api.post("/api/push-send", { employeeId: empId, title: `📍 ${dateLabel} 진열 담당구역 (${zList.length}곳)`, body: `${name}님, ${dateLabel} 진열 담당 구역 ${zList.length}곳입니다.\n${zList.map(z => `• ${z.zoneLabel} (${z.category})`).join("\n")}`, url: "/" }).catch(() => {});
      sent++;
    }
    setPendingAutoAssign(null); setSaveAllToast(true); setTimeout(() => setSaveAllToast(false), 2500);
    setTimeout(() => showSuccess(`확정 완료 (${dateLabel})\n${grouped.size}명 · ${assignedList.length}곳 배정 · ${sent}건 알림 전송`), 100);
  }, [pendingAutoAssign, zones, selectedDate, showError, showSuccess]);

  const handleCancelAutoAssign = useCallback(() => {
    if (!pendingAutoAssign) return;
    setZones(pendingAutoAssign.prevZones); setPendingAutoAssign(null);
  }, [pendingAutoAssign]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const logisticsStaff = useMemo(() => todayStaff.filter((s) => s.employee.position.includes("물류")), [todayStaff]);
  const staffColorMap = useMemo(() => {
    const map = new Map<number, number>();
    logisticsStaff.forEach(({ employee }, idx) => { map.set(employee.id, idx); });
    return map;
  }, [logisticsStaff]);
  const activeZone = useMemo(() => zones.find((z) => z.id === activeZoneId) ?? null, [zones, activeZoneId]);

  useEffect(() => {
    if (activeZone) {
      setDraftCategory(activeZone.category); setDraftProducts(activeZone.products);
      setDraftStaffId(activeZone.assignedStaffId); setDraftStatus(activeZone.status);
      setRequestNote(""); setSavedFlash(false); setRequestFlash(false);
    }
  }, [activeZoneId]); // eslint-disable-line

  useEffect(() => {
    if (!popoverAnchor) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPopoverAnchor(null); };
    const handleClick = () => setPopoverAnchor(null);
    document.addEventListener("keydown", handleKey); document.addEventListener("click", handleClick);
    return () => { document.removeEventListener("keydown", handleKey); document.removeEventListener("click", handleClick); };
  }, [popoverAnchor]);

  // ── Zone interaction handlers ───────────────────────────────────────────────
  const handleZoneCellClick = useCallback((zone: DisplayZone, rect: DOMRect) => {
    setPopoverAnchor((prev) => (prev?.zoneId === zone.id ? null : { zoneId: zone.id, rect }));
  }, []);

  const handleOpenZoneDetail = useCallback((zone: DisplayZone) => { setPopoverAnchor(null); setActiveZoneId(zone.id); }, []);

  const handlePopoverAssign = useCallback((staffId: number, staffName: string) => {
    if (!popoverAnchor) return;
    const zoneId = popoverAnchor.zoneId;
    setZones((prev) => prev.map((z) => {
      if (z.id !== zoneId) return z;
      if (MULTI_ASSIGN_ZONE_NUMS.has(z.num)) {
        const existing = z.assignedStaffName ? z.assignedStaffName.split(",").map(s => s.trim()).filter(Boolean) : [];
        if (existing.includes(staffName)) return z;
        const next = [...existing, staffName];
        return { ...z, assignedStaffId: staffId, assignedStaffName: next.join(","), dowMap: { ...(z.dowMap ?? {}), [staffName]: DOW_ALL } };
      }
      return { ...z, assignedStaffId: staffId, assignedStaffName: staffName, dowMap: { [staffName]: DOW_ALL } };
    }));
    setPopoverAnchor(null);
  }, [popoverAnchor]);

  const handlePopoverUnassign = useCallback(() => {
    if (!popoverAnchor) return;
    const zoneId = popoverAnchor.zoneId;
    setZones((prev) => prev.map((z) => z.id === zoneId ? { ...z, assignedStaffId: null, assignedStaffName: "", dowMap: null } : z));
    setPopoverAnchor(null);
  }, [popoverAnchor]);

  const toggleZoneDow = useCallback((zoneId: string, nameKey: string, dow: number) => {
    setZones((prev) => prev.map((z) => {
      if (z.id !== zoneId) return z;
      const current = z.dowMap?.[nameKey] ?? DOW_ALL;
      return { ...z, dowMap: { ...(z.dowMap ?? {}), [nameKey]: current ^ (1 << dow) } };
    }));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, _zone: DisplayZone) => {
    if (!dragStaffRef.current) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverZoneId(_zone.id);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, zone: DisplayZone) => {
    e.preventDefault(); setDragOverZoneId(null);
    const staff = dragStaffRef.current;
    if (!staff) return;
    setZones((prev) => prev.map((z) => {
      if (z.id !== zone.id) return z;
      if (MULTI_ASSIGN_ZONE_NUMS.has(z.num)) {
        const existing = z.assignedStaffName ? z.assignedStaffName.split(",").map(s => s.trim()).filter(Boolean) : [];
        if (existing.includes(staff.employee.name)) return z;
        return { ...z, assignedStaffId: staff.employee.id, assignedStaffName: [...existing, staff.employee.name].join(","), dowMap: { ...(z.dowMap ?? {}), [staff.employee.name]: DOW_ALL } };
      }
      return { ...z, assignedStaffId: staff.employee.id, assignedStaffName: staff.employee.name, dowMap: { [staff.employee.name]: DOW_ALL } };
    }));
    dragStaffRef.current = null; setDragStaff(null);
  }, []);

  const handleSave = useCallback(() => {
    if (!activeZone) return;
    const staff = employees.find((e) => e.id === draftStaffId) ?? null;
    setZones((prev) => prev.map((z) => {
      if (z.id !== activeZone.id) return z;
      let nextDow: DowMap = z.dowMap;
      if (staff && !(z.dowMap?.[staff.name])) nextDow = { ...(z.dowMap ?? {}), [staff.name]: DOW_ALL };
      return { ...z, category: draftCategory, products: draftProducts, assignedStaffId: staff?.id ?? null, assignedStaffName: staff?.name ?? "", status: draftStatus, dowMap: nextDow };
    }));
    setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500);
  }, [activeZone, draftCategory, draftProducts, draftStaffId, draftStatus, employees]);

  const canRequest = (draftStatus === "low" || draftStatus === "empty") && draftStaffId !== null;

  const handleSendRequest = useCallback(() => {
    if (!activeZone || !canRequest) return;
    const staff = employees.find((e) => e.id === draftStaffId);
    if (!staff) return;
    setZones((prev) => prev.map((z) => z.id !== activeZone.id ? z : { ...z, category: draftCategory, products: draftProducts, assignedStaffId: staff.id, assignedStaffName: staff.name, status: draftStatus }));
    const req: DisplayRequest = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, zoneId: activeZone.id, zoneLabel: `${activeZone.num}번 ${activeZone.label}`, category: draftCategory, requestedAt: new Date().toISOString(), assignedStaffId: staff.id, assignedStaffName: staff.name, status: "pending", note: requestNote };
    setRequests((prev) => [req, ...prev]);
    api.post("/api/display-requests", { zone_id: activeZone.id, zone_label: `${activeZone.num}번 ${activeZone.label}`, category: draftCategory, requested_at: new Date().toISOString(), assigned_staff_id: staff.id, assigned_staff_name: staff.name, note: requestNote }).catch(() => {});
    setRequestFlash(true); setTimeout(() => setRequestFlash(false), 1500);
  }, [activeZone, canRequest, draftCategory, draftProducts, draftStaffId, draftStatus, requestNote, employees]);

  // ── Search & filter ─────────────────────────────────────────────────────────
  const searchedZones = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return zones;
    return zones.filter((z) => z.num.toString().includes(q) || z.label.toLowerCase().includes(q) || z.category.toLowerCase().includes(q) || z.products.toLowerCase().includes(q));
  }, [zones, searchQuery]);

  const searchedZoneIds = useMemo(() => {
    const ids = new Set(searchQuery ? searchedZones.map((z) => z.id) : []);
    if (productMatchZoneId) ids.add(productMatchZoneId);
    return ids;
  }, [searchedZones, searchQuery, productMatchZoneId]);

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

  const getZoneById = (id: string) => zones.find((z) => z.id === id);

  const getZoneGroup = useCallback((areaId: string) => zoneGroups.find((g) => g.areaIds.includes(areaId)) ?? null, [zoneGroups]);
  const activeGroup = useMemo(() => zoneGroups.find((g) => g.id === activeGroupId) ?? null, [zoneGroups, activeGroupId]);

  const handleZoneConfigClick = useCallback((zoneId: string) => {
    if (!activeGroupId) return;
    setZoneGroups((prev) => prev.map((g) => {
      if (g.id === activeGroupId) return g.areaIds.includes(zoneId) ? { ...g, areaIds: g.areaIds.filter((id) => id !== zoneId) } : { ...g, areaIds: [...g.areaIds, zoneId] };
      if (g.areaIds.includes(zoneId)) return { ...g, areaIds: g.areaIds.filter((id) => id !== zoneId) };
      return g;
    }));
  }, [activeGroupId]);

  const handleProductResultClick = useCallback((realMap: string | null) => {
    if (!realMap) return;
    const m = realMap.match(/^(\d+)번/);
    if (m) { const zone = zones.find((z) => z.num === parseInt(m[1], 10)); if (zone) setProductMatchZoneId(zone.id); }
  }, [zones]);

  const handleBarcodeScan = (result: string) => {
    if (scannerMode === "search") setSearchQuery(result);
    else if (scannerMode === "products") setDraftProducts((prev) => prev ? `${prev}, ${result}` : result);
    setScannerMode(null);
  };

  const openZoneProducts = (args: { zoneId: string; zoneNum: number; zoneLabel: string; category: string }) => {
    setZoneProductsModal(args); setZoneProductsFilter("all"); setZoneProductsSearch("");
  };

  // ── Render helpers ──────────────────────────────────────────────────────────
  const renderRequestButton = (num: number, id?: string): React.ReactNode => {
    const zoneId = id ?? String(num);
    const zone = getZoneById(zoneId) ?? zones.find(z => z.num === num && !z.id.match(/[AB]$/));
    if (!zone) return null;
    const hasStaff = !!zone.assignedStaffId;
    // 2026-08-26 · P1 fix · 터치영역 h-6 → h-8 · 폰트 9→11 · 40대+/모바일 가독성
    return (
      <button type="button" onClick={() => hasStaff && handleQuickRequest(zone)} disabled={!hasStaff}
        title={hasStaff ? `${zone.num}번 ${zone.label} 진열 보충 요청` : "담당자 미배정 — 진열요청 불가"}
        className={`w-full h-8 rounded text-[11px] font-bold flex items-center justify-center gap-1 transition-all border ${hasStaff ? "bg-rose-500 hover:bg-rose-600 active:scale-95 text-white border-rose-600 cursor-pointer shadow-sm" : "bg-zinc-100 text-zinc-300 border-line cursor-not-allowed"}`}>
        <Bell size={10} />{hasStaff ? "진열요청" : "미배정"}
      </button>
    );
  };

  const renderZoneFromRaw = (zRaw: DisplayZone, classes: string, wrapperClass: string, hideRequest = false) => {
    const currentDow = selectedDateObj.getDay();
    const todayNames = new Set(todayStaff.map(s => s.employee.name));
    const allNames = zRaw.assignedStaffName ? zRaw.assignedStaffName.split(",").map(s => s.trim()).filter(Boolean) : [];
    const activeNames = allNames.filter(n => isDowActive(zRaw.dowMap?.[n] ?? DOW_ALL, currentDow) && todayNames.has(n));
    const z: DisplayZone = allNames.length !== activeNames.length
      ? { ...zRaw, assignedStaffName: activeNames.join(","), assignedStaffId: activeNames.length === 0 ? null : zRaw.assignedStaffId }
      : zRaw;
    const group = getZoneGroup(z.id);
    const inSelectedGroup = !!(activeGroup && activeGroup.areaIds.includes(z.id));
    return (
      <div key={z.id} className={`flex flex-col gap-0.5 ${wrapperClass}`}>
        <ZoneCell
          zone={z} onContextClick={handleZoneCellClick} onDetailClick={handleOpenZoneDetail}
          className={classes} isPopoverOpen={popoverAnchor?.zoneId === z.id}
          staffColorIndex={z.assignedStaffId !== null ? (staffColorMap.get(z.assignedStaffId) ?? null) : null}
          isDragOver={dragOverZoneId === z.id && !!dragStaff}
          onDragOver={handleDragOver} onDrop={handleDrop} onDragLeave={() => setDragOverZoneId(null)}
          isSearchedHighlight={searchedZoneIds.has(z.id)}
          groupColor={group?.color} groupLabel={group?.name?.slice(0, 1)}
          configMode={zoneConfigOpen} inSelectedGroup={inSelectedGroup}
          onConfigClick={zoneConfigOpen ? (zone) => handleZoneConfigClick(zone.id) : undefined}
        />
      </div>
    );
  };

  const renderZoneCellById = (id: string, classes = "", wrapperClass = "", hideRequest = false) => { const z = getZoneById(id); return z ? renderZoneFromRaw(z, classes, wrapperClass, hideRequest) : null; };
  const renderZoneCell = (num: number, classes = "", wrapperClass = "", hideRequest = false) => { const z = zones.find(z => z.num === num && !z.id.match(/[AB]$/)); return z ? renderZoneFromRaw(z, classes, wrapperClass, hideRequest) : null; };

  // 2026-08-25 · Framework Phase 4 · 벽면 존 카드 · WallZoneCard 이관
  const renderWallZoneCard = (num: number, position: "top" | "bottom") => (
    <WallZoneCard num={num} position={position} zoneDefs={ZONE_DEFS}
      openZoneProducts={openZoneProducts} renderRequestButton={renderRequestButton} renderZoneCell={renderZoneCell} />
  );

  const popoverZone = useMemo(() => (popoverAnchor ? zones.find((z) => z.id === popoverAnchor.zoneId) ?? null : null), [popoverAnchor, zones]);

  const dpVisibilityMap: Record<DpSubTabKey, boolean> = {
    // 2026-08-29 · #193 · 상품 서브탭 · 매입에서 이관
    // 2026-08-29 · #201 BUG-1 A안 · manager 이상 (level >= 2) 허용 · 사이드바 managerOnly 와 일치
    //   · 이전: dpCanSeeStockManage (level>=9) · 사이드바와 불일치 · level 2~8 클릭 시 탭 안 보임
    //   · 신규: dpUserLevel >= 2 · 사이드바 managerOnly=true 와 정확 매칭
    "product": dpUserLevel >= 2 && !dpHiddenSubs.has("product"),
    "purchase-order": dpCanSeeStockManage && !dpHiddenSubs.has("purchase-order"),
    "purchase": dpCanSeeStockManage && !dpHiddenSubs.has("purchase"),
    "payment": dpCanSeeStockManage && !dpHiddenSubs.has("payment"),
    "statistics": dpCanSeeStockManage && !dpHiddenSubs.has("statistics"),
    // 2026-08-25 · 반품 신규 · dpCanSeeStockManage 조건 사용 (통계와 동일 레벨)
    "return": dpCanSeeStockManage && !dpHiddenSubs.has("return"),
    "stock-arrivals": dpCanSeeStockArrivals && !dpHiddenSubs.has("stock-arrivals"),
    "store": !dpHiddenSubs.has("store"),
    "vendor-manage": dpCanSeeStockManage && !dpHiddenSubs.has("vendor-manage"),
  };
  const dpVisibleTabs: CommonTabDef<DpSubTabKey>[] = dpTabSortable.tabs.map(t => ({ ...t, visible: dpVisibilityMap[t.key] }));

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans flex flex-col" onClick={() => setPopoverAnchor(null)}>

      {scannerMode && (
        <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setScannerMode(null)} title={scannerMode === "search" ? "상품 검색 스캔" : "상품 바코드 스캔"} />
      )}

      <AppNavHeader activePage="display" authSession={authSession ?? null} onBack={onBack} onNavigate={onNavigate} onLogout={onLogout} />

      {(dpCanSeeStockManage || dpCanSeeStockArrivals) && !(SIDEBAR_ENABLED && !isDpMobile) && (
        <TabBar<DpSubTabKey> level={2} tabs={dpVisibleTabs} activeKey={dpSubTab} onSelect={setDpSubTab} sortable={{ getTabProps: dpTabSortable.getTabProps, isDragging: dpTabSortable.isDragging }} />
      )}

      {dpSubTab === "stock-arrivals" && dpCanSeeStockArrivals ? (
        <main className="flex-1 flex flex-col min-h-0">
          <StockArrivalPage authSession={authSession} onBack={onBack} onNavigate={onNavigate as any} onLogout={onLogout} embedded />
        </main>
      ) : dpSubTab === "vendor-manage" && dpCanSeeStockManage ? (
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden p-3">
          <React.Suspense fallback={<div className="flex-1 flex items-center justify-center py-16"><Spinner label="공급사관리 로딩 중..." size={16} tone="brand" /></div>}>
            <VendorManageSplit />
          </React.Suspense>
        </main>
      ) : (dpSubTab === "purchase-order" || dpSubTab === "purchase" || dpSubTab === "payment" || dpSubTab === "statistics") && dpCanSeeStockManage ? (
        <main className="flex-1 flex flex-col min-h-0">
          <OrderManagePage
            ocrTabAuthSession={authSession} ocrTabOnBack={onBack} ocrTabOnNavigate={onNavigate as any}
            ocrTabOnLogout={onLogout} initialTopTab={dpSubTab as "purchase-order" | "purchase" | "payment" | "statistics"} hideTopTabs
          />
        </main>
      ) : dpSubTab === "return" && dpCanSeeStockManage ? (
        /* 2026-08-29 · #193 · 사용자 지시 · 반품 서브탭 · 매입 우회 · 직접 이너 탭 (반품필요·반품확정)
           2026-08-30 · #37 · 사용자 지시 · SplitListPanel 넓이 통일 · max-w-[1360px] 컨테이너 (다른 페이지와 동일) */
        <main className="flex-1 max-w-[1360px] w-full mx-auto flex flex-col min-h-0 px-3">
          <div className="bg-white border-b border-line px-3">
            <TabBar<"need" | "confirmed">
              level={3}
              activeKey={returnInnerTabDp}
              onSelect={setReturnInnerTabDp}
              tabs={[
                { key: "need",      label: "반품필요", visible: true },
                { key: "confirmed", label: "반품확정", visible: true },
              ]}
            />
          </div>
          <div className="flex-1 min-h-0">
            <React.Suspense fallback={<div className="flex-1 flex items-center justify-center py-16"><Spinner label="로딩 중..." size={14} tone="zinc" /></div>}>
              {returnInnerTabDp === "need" ? <ReturnListPanelLazy /> : <ReturnConfirmedPanelLazy />}
            </React.Suspense>
          </div>
        </main>
      ) : dpSubTab === "product" && dpUserLevel >= 2 ? (
        /* 2026-08-29 · #193 · 사용자 지시 · 상품 서브탭 · 3개 이너 탭 (실재고입력·상품입고·상품정보) · 매입에서 이관 */
        <main className="flex-1 flex flex-col min-h-0">
          <div className="bg-white border-b border-line px-3">
            <TabBar<"info" | "scan" | "arrival">
              level={3}
              activeKey={productInnerTab}
              onSelect={setProductInnerTab}
              tabs={[
                { key: "info",    label: "상품정보",   visible: true },
                { key: "scan",    label: "실재고입력", visible: true },
                { key: "arrival", label: "상품입고",   visible: true },
              ]}
            />
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            <React.Suspense fallback={<div className="flex-1 flex items-center justify-center py-16"><Spinner label="로딩 중..." size={14} tone="zinc" /></div>}>
              {productInnerTab === "scan"    && <ScanPageLazy embedded onBack={onBack} authSession={authSession ?? null} onNavigate={onNavigate as any} onLogout={onLogout} />}
              {productInnerTab === "arrival" && <ProductArrivalPageLazy embedded onBack={onBack} authSession={authSession ?? null} onNavigate={onNavigate as any} onLogout={onLogout} />}
              {productInnerTab === "info"    && <ProductInfoPageLazy authSession={authSession ?? null} />}
            </React.Suspense>
          </div>
        </main>
      ) : (
        <main className="max-w-[1360px] w-full mx-auto p-4 flex flex-col gap-4 flex-1">
          {/* 2026-08-25 · 매장구역도/배치불일치 · 2026-08-26 · 창고1/창고2 추가 */}
          <div className="bg-white rounded-xl border border-line overflow-hidden">
            <SplitRightTabs
              tabs={[
                { key: "map",            label: "매장구역도" },
                { key: "displayRequest", label: "진열요청목록" },
                { key: "warehouse1",     label: "창고1" },
                { key: "warehouse2",     label: "창고2" },
                { key: "stockTable",     label: "실재고 테이블" },
                { key: "mismatch",       label: "배치구역 불일치" },
                { key: "zoneEdit",       label: "매장구역도 편집" },
              ]}
              active={storeInnerTab}
              onSelect={(k) => setStoreInnerTab(k as typeof storeInnerTab)}
              bg="bg-zinc-50/40"
              size="lg"
            />
          </div>
          {storeInnerTab === "mismatch" ? (
            <MismatchPage />
          ) : storeInnerTab === "stockTable" ? (
            <RealStockTablePage />
          ) : storeInnerTab === "zoneEdit" ? (
            <div className="flex flex-col gap-3">
              {/* 2026-08-31 · 사용자 지시 · 구역그룹설정(ZoneGroupPanel) 제거 · 안 씀 */}
              <ZoneEditPanel canEdit={dpZoneEditable} />
            </div>
          ) : storeInnerTab === "warehouse1" ? (
            <WarehouseZoneMap filter="1" />
          ) : storeInnerTab === "warehouse2" ? (
            <WarehouseZoneMap filter="2" />
          ) : storeInnerTab === "displayRequest" ? (
            <DisplayRequestPanel filteredReqs={filteredReqs} requests={requests} reqFilter={reqFilter} setReqFilter={setReqFilter} setRequests={setRequests} formatRel={formatRel} />
          ) : (<>
          <DisplayProductPanel
            productSearchResults={productSearchResults} productMatchZoneId={productMatchZoneId}
            zones={zones} productsMap={productsMap}
            onClear={() => { setSearchQuery(""); setProductMatchZoneId(null); }}
            onProductResultClick={handleProductResultClick}
            onProductInfoClick={(p) => setProductInfoModal(p)}
          />

          <section className="flex flex-col">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col">

              {saveAllToast && (
                <div className="fixed top-5 right-5 z-[70] bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
                  <CheckCircle2 size={14} />전 요일에 현재 배정이 적용 · DB 저장되었습니다.
                </div>
              )}
              {quickReqToast && (
                <div className="fixed top-5 right-5 z-[71] bg-amber-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 animate-in slide-in-from-top-2 duration-200 max-w-xs">
                  <Bell size={14} />{quickReqToast}
                </div>
              )}

              {/* 2026-08-27 · 사용자 지시 · 매장 배치도 상단 헤더 전체 제거 (제목·부제·저장상태·구역설정·매주적용·날짜네비·검색바·스캔·힌트)
                    · 구역설정(ZoneGroupPanel) 은 "매장구역도 편집" 서브탭으로 이관
                    · 검색은 실재고테이블에서 사용 (중복 회피) · state/handler 는 하위 UI 재사용 위해 유지 */}

              <DisplayMobileList
                zones={zones} employees={employees} staffColorMap={staffColorMap}
                fullMapOpen={fullMapOpen} setFullMapOpen={setFullMapOpen}
                onZoneProductsOpen={openZoneProducts} onZoneCellClick={handleZoneCellClick}
                renderRequestButton={renderRequestButton} ZONE_DEFS={ZONE_DEFS}
                zoneEditing={dpZoneEditable} onZoneReorder={handleZoneReorder}
              />

              {/* 2026-08-30 · 사용자 지시 · 접기/펼치기 버튼 제거 · 항상 표시 */}
              <div className="hidden sm:block">
                <DisplayStoreMap
                  ZONE_DEFS={ZONE_DEFS} zonesRaw={zonesRaw} zones={zones} todayStaff={todayStaff} staffColorMap={staffColorMap}
                  pendingAutoAssign={pendingAutoAssign} dragStaff={dragStaff} dragStaffRef={dragStaffRef}
                  setDragStaff={setDragStaff} setDragOverZoneId={setDragOverZoneId} setActiveStaffInfo={setActiveStaffInfo}
                  onAutoAssign={handleAutoAssign} onConfirmAutoAssign={handleConfirmAutoAssign} onCancelAutoAssign={handleCancelAutoAssign}
                  onZoneProductsOpen={openZoneProducts} renderZoneCellById={renderZoneCellById} renderZoneCell={renderZoneCell}
                  renderWallZoneCard={renderWallZoneCard} renderRequestButton={renderRequestButton}
                />
              </div>

              {/* 2026-08-27 · 사용자 지시 · 진열요청목록 중복 제거 · "진열요청목록" 서브탭에서만 렌더 */}
            </div>
          </section>
          </>)}
        </main>
      )}

      <footer className="bg-white text-center p-4 mt-8 text-xs text-gray-400 border-t border-line">
        &copy; 2026 {dpBrand.shortName || "오산메가타운"} 매장 관리 시스템. All Rights Reserved. {dpContact.copyrightText || "(주)이룸즈(IRUMS)"}
      </footer>

      {/* 2026-08-25 · Framework Phase 4 · 4 modals wrapper · DisplayModals 로 이관 */}
      <DisplayModals
        popoverAnchor={popoverAnchor} popoverZone={popoverZone} logisticsStaff={logisticsStaff} staffColorMap={staffColorMap}
        handlePopoverAssign={handlePopoverAssign} handlePopoverUnassign={handlePopoverUnassign}
        handleOpenZoneDetail={handleOpenZoneDetail} openZoneProducts={openZoneProducts}
        setPopoverAnchor={setPopoverAnchor} setActiveStaffInfo={setActiveStaffInfo} setZoneDefs={setZoneDefs}
        saveZoneDefsNow={saveZoneDefsNow} showSuccess={showSuccess} showError={showError}
        canEditZone={dpZoneEditable}
        activeZone={activeZone} draftCategory={draftCategory} draftProducts={draftProducts} draftStaffId={draftStaffId}
        draftStatus={draftStatus} requestNote={requestNote} savedFlash={savedFlash} requestFlash={requestFlash}
        employees={employees} canRequest={canRequest}
        setActiveZoneId={setActiveZoneId} setDraftStaffId={setDraftStaffId} setDraftProducts={setDraftProducts}
        setDraftStatus={setDraftStatus} setRequestNote={setRequestNote}
        handleSave={handleSave} handleSendRequest={handleSendRequest} setScannerMode={setScannerMode} toggleZoneDow={toggleZoneDow}
        activeStaffInfo={activeStaffInfo} zones={zones} setZones={setZones}
        zoneProductsModal={zoneProductsModal} productsMap={productsMap}
        zoneProductsFilter={zoneProductsFilter} zoneProductsSearch={zoneProductsSearch} zoneProductsSort={zoneProductsSort}
        setZoneProductsModal={setZoneProductsModal} setZoneProductsFilter={setZoneProductsFilter}
        setZoneProductsSearch={setZoneProductsSearch} setZoneProductsSort={setZoneProductsSort}
        productInfoModal={productInfoModal} setProductInfoModal={setProductInfoModal} setProductsMap={setProductsMap}
      />

      {/* Toast */}
      {toast && <div className="fixed bottom-6 right-6 z-[9999]"><div className={toastClass(toast.tone)}>{toast.message}</div></div>}
    </div>
  );
};

export default DisplayPage;
