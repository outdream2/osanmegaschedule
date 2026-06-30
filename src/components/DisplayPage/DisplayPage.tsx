// src/components/DisplayPage/DisplayPage.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ZONE_DEFS, ZONES_STORAGE_KEY, type ZoneSection } from "../../constants/displayZones";
import { getProductsMap } from "../../lib/productsCache";
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
} from "lucide-react";
import { BarcodeScanner } from "../BarcodeScanner";
import { ZoneCell } from "./ZoneCell";
import { ZoneAssignPopover } from "./ZoneAssignPopover";
import { ZoneGroupPanel, type ZoneGroup } from "./ZoneGroupPanel";
import { AppNavHeader, type AppNavPage } from "../AppNavHeader";
import type { AuthSession } from "../../types";

interface DisplayPageProps {
  onBack: () => void;
  onOpenEmployeeEdit?: (employeeId: number) => void;
  onNavigateToSchedule?: () => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

// ─── Types ───────────────────────────────────────────────────────────────────
type ZoneStatus = "normal" | "low" | "empty";

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

const buildDefaultZones = (): DisplayZone[] =>
  ZONE_DEFS.map((d) => ({
    id: String(d.num),
    num: d.num,
    label: d.label,
    category: d.category,
    section: d.section,
    assignedStaffId: null,
    assignedStaffName: "",
    status: "normal",
    products: "",
  }));

// ─── localStorage helpers ─────────────────────────────────────────────────────
const ZONES_KEY = ZONES_STORAGE_KEY;
const REQS_KEY  = "megatown_display_requests";

const loadZones = (): DisplayZone[] => {
  try {
    const raw = localStorage.getItem(ZONES_KEY);
    if (!raw) { const d = buildDefaultZones(); localStorage.setItem(ZONES_KEY, JSON.stringify(d)); return d; }
    const parsed = JSON.parse(raw) as DisplayZone[];
    if (!Array.isArray(parsed) || parsed.length === 0) { const d = buildDefaultZones(); localStorage.setItem(ZONES_KEY, JSON.stringify(d)); return d; }
    // merge: preserve saved status/staff/products but keep fresh label/category from ZONE_DEFS
    return ZONE_DEFS.map((def) => {
      const saved = parsed.find((z) => z.id === String(def.num));
      return {
        id: String(def.num), num: def.num, label: def.label, category: def.category,
        section: def.section,
        assignedStaffId: saved?.assignedStaffId ?? null,
        assignedStaffName: saved?.assignedStaffName ?? "",
        status: saved?.status ?? "normal",
        products: saved?.products ?? "",
      };
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
    const rows: Array<{ zone_id: string; employee_id: number | null; employee_name: string; status: string; products: string }> = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return ZONE_DEFS.map((def) => {
      const row = rows.find((r) => r.zone_id === String(def.num));
      return {
        id: String(def.num), num: def.num, label: def.label, category: def.category,
        section: def.section,
        assignedStaffId: row?.employee_id ?? null,
        assignedStaffName: row?.employee_name ?? "",
        status: (row?.status as ZoneStatus) ?? "normal",
        products: row?.products ?? "",
      };
    });
  } catch { return null; }
};

const saveZonesToDB = async (zones: DisplayZone[]) => {
  try {
    await fetch("/api/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        zones: zones.map((z) => ({
          zone_id: z.id,
          employee_id: z.assignedStaffId,
          employee_name: z.assignedStaffName,
          status: z.status,
          products: z.products,
        })),
      }),
    });
  } catch {}
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

// ─── Main component ────────────────────────────────────────────────────────────
export const DisplayPage: React.FC<DisplayPageProps> = ({ onBack, onOpenEmployeeEdit, onNavigateToSchedule, authSession, onNavigate, onLogout }) => {
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
  const [productsMap, setProductsMap] = useState<Record<string, any>>({});
  const [productMatchZoneId, setProductMatchZoneId] = useState<string | null>(null);

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

  const handleSaveAll = () => {
    saveZones(zones);
    saveRequests(requests);
    setSaveAllToast(true);
    setTimeout(() => setSaveAllToast(false), 2500);
  };

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
  useEffect(() => {
    getProductsMap().then(m => setProductsMap(m));
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

  // ── Persist: save to localStorage immediately; debounce DB save ──────────────
  const dbSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    saveZones(zones);
    if (!zonesLoaded) return;
    if (dbSaveTimer.current) clearTimeout(dbSaveTimer.current);
    dbSaveTimer.current = setTimeout(() => saveZonesToDB(zones), 1500);
    return () => { if (dbSaveTimer.current) clearTimeout(dbSaveTimer.current); };
  }, [zones, zonesLoaded]);
  useEffect(() => { saveRequests(requests); }, [requests]);

  // ── Logistics staff (today only) ────────────────────────────────────────────
  const logisticsStaff = useMemo(
    () => todayStaff.filter((s) => s.employee.position === "물류"),
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
      prev.map((z) =>
        z.id === zoneId
          ? { ...z, assignedStaffId: staffId, assignedStaffName: staffName }
          : z,
      ),
    );
    setPopoverAnchor(null);
  }, [popoverAnchor]);

  const handlePopoverUnassign = useCallback(() => {
    if (!popoverAnchor) return;
    const zoneId = popoverAnchor.zoneId;
    setZones((prev) =>
      prev.map((z) =>
        z.id === zoneId
          ? { ...z, assignedStaffId: null, assignedStaffName: "" }
          : z,
      ),
    );
    setPopoverAnchor(null);
  }, [popoverAnchor]);

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
      prev.map((z) =>
        z.id === zone.id
          ? { ...z, assignedStaffId: staff.employee.id, assignedStaffName: staff.employee.name }
          : z,
      ),
    );
    dragStaffRef.current = null;
    setDragStaff(null);
  }, []);

  // ── Save / Request ───────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (!activeZone) return;
    const staff = employees.find((e) => e.id === draftStaffId) ?? null;
    setZones((prev) => prev.map((z) => z.id !== activeZone.id ? z : {
      ...z, category: draftCategory, products: draftProducts,
      assignedStaffId: staff?.id ?? null, assignedStaffName: staff?.name ?? "",
      status: draftStatus,
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

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: zones.length,
    empty: zones.filter((z) => z.status === "empty").length,
    low:   zones.filter((z) => z.status === "low").length,
    pending: requests.filter((r) => r.status === "pending").length,
  }), [zones, requests]);

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
    for (const p of Object.values(productsMap)) {
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

  // Helper to render Zone Cell on Blueprint
  const renderZoneCell = (num: number, classes = "", wrapperClass = "") => {
    const z = getZone(num);
    if (!z) return null;
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
        {!zoneConfigOpen && z.assignedStaffId !== null && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleQuickRequest(z); }}
            title={`${z.assignedStaffName}에게 보충 요청`}
            className="w-full h-4 bg-red-500 hover:bg-red-600 rounded text-white text-[7px] font-black flex items-center justify-center gap-0.5 transition-colors leading-none cursor-pointer shrink-0"
          >
            <Bell size={6} />
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
        onNavigate={(page) => {
          if (page === "schedule" && onNavigateToSchedule) onNavigateToSchedule();
          else onNavigate?.(page);
        }}
        onLogout={onLogout}
        rightSlot={
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-[11px] font-bold">
              <span className="bg-white border border-gray-200 px-2.5 py-1 rounded-lg flex items-center gap-1 text-gray-600 shadow-sm">
                전체 <span className="text-indigo-600 font-black">{stats.total}</span>
              </span>
              <span className="bg-white border border-rose-200 px-2.5 py-1 rounded-lg flex items-center gap-1 text-gray-600 shadow-sm">
                품절 <span className="text-rose-600 font-black">{stats.empty}</span>
              </span>
              <span className="bg-white border border-amber-200 px-2.5 py-1 rounded-lg flex items-center gap-1 text-gray-600 shadow-sm">
                부족 <span className="text-amber-600 font-black">{stats.low}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 text-xs font-semibold shadow-sm">
              <MapPin size={11} className="text-rose-500" />
              <span>현위치: 36번 매대 앞</span>
            </div>
          </div>
        }
      />

      {/* Main Content Grid */}
      <main className="max-w-[1700px] w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">

        {/* LEFT COLUMN: Search & Directory (Stacked) */}
        <section className="lg:col-span-3 flex flex-col space-y-4 lg:max-h-[calc(100vh-80px)] lg:sticky lg:top-20">

          {/* Search box */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="찾으시는 약이나 증상을 입력하세요 (예: 감기약, 비타민)"
                className="w-full p-2.5 pl-9 pr-9 border border-gray-300 rounded-xl shadow-3xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-xs"
              />
              <Search className="absolute left-3 top-3.5 text-gray-400" size={13} />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setProductMatchZoneId(null); }}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <button
              onClick={() => setScannerMode("search")}
              title="바코드 스캔으로 검색"
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-gray-300 bg-white hover:bg-emerald-50 hover:border-emerald-400 text-gray-500 hover:text-emerald-600 transition cursor-pointer shadow-3xs"
            >
              <ScanLine size={16} />
            </button>
          </div>

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
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => handleProductResultClick(p.realMap)}
                    className={`w-full text-left px-3 py-2 transition cursor-pointer flex items-start justify-between gap-2 ${
                      p.realMap
                        ? "hover:bg-emerald-50"
                        : "hover:bg-slate-50 opacity-60"
                    } ${productMatchZoneId && zones.find(z => z.id === productMatchZoneId)?.num === parseInt((p.realMap ?? "").match(/^(\d+)번/)?.[1] ?? "-1") ? "bg-emerald-50 border-l-2 border-emerald-400" : ""}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-800 truncate">{p.name}</div>
                      {p.spec && <div className="text-[10px] text-slate-400 truncate mt-0.5">{p.spec}</div>}
                    </div>
                    {p.realMap ? (
                      <div className="flex items-center gap-0.5 shrink-0 text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-lg whitespace-nowrap">
                        <MapPin size={9} />
                        {p.realMap}
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-300 shrink-0 whitespace-nowrap">위치 미등록</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Today's Active Staff Panel */}
          <div className={`bg-white rounded-xl shadow-xs border border-gray-100 flex flex-col ${staffPanelOpen ? "flex-1 min-h-0 p-4" : "shrink-0 px-4 py-2.5"}`}>
            <button
              type="button"
              onClick={() => setStaffPanelOpen(o => !o)}
              className={`flex items-center justify-between w-full cursor-pointer shrink-0 ${staffPanelOpen ? "border-b border-slate-100 pb-2 mb-2" : ""}`}
            >
              <div className="flex items-center gap-2">
                <Users size={14} className="text-emerald-600" />
                <h3 className="text-xs font-bold text-slate-800">{selectedDateLabel} 출근 직원 ({todayStaff.length}명)</h3>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                <span>{staffPanelOpen ? "숨기기" : "보기"}</span>
                {staffPanelOpen
                  ? <ChevronUp size={12} />
                  : <ChevronDown size={12} />}
              </div>
            </button>

            {staffPanelOpen && (<>
            {/* Position filter pills */}
            <div className="flex gap-1 mb-2 shrink-0">
              {(["전체", "약사", "물류", "캐셔", "진열"] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() => setStaffPosFilter(pos)}
                  className={`flex-1 py-1 text-[10px] font-bold rounded-lg border cursor-pointer transition ${
                    staffPosFilter === pos
                      ? pos === "전체"   ? "bg-gray-800 text-white border-gray-800"
                      : pos === "약사"   ? "bg-violet-600 text-white border-violet-600"
                      : pos === "물류"   ? "bg-orange-500 text-white border-orange-500"
                      : pos === "캐셔"   ? "bg-amber-500 text-white border-amber-500"
                                         : "bg-teal-500 text-white border-teal-500"
                      : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {pos === "전체" ? "전체" : pos === "약사" ? "💊 약사" : pos === "물류" ? "📦 물류" : pos === "캐셔" ? "💳 캐셔" : "🛒 진열"}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 pr-1">
              {staffLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-400 gap-2 text-xs">
                  <Loader2 size={13} className="animate-spin" />불러오는 중...
                </div>
              ) : staffError ? (
                <div className="px-4 py-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg">⚠ {staffError}</div>
              ) : todayStaff.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-xs text-center px-4">
                  <Users size={20} className="mb-2 opacity-30" />오늘 근무 직원 정보가 없습니다
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {todayStaff.filter(({ employee }) => {
                    if (staffPosFilter === "전체") return true;
                    if (staffPosFilter === "물류") return ["물류", "캐셔", "진열"].includes(employee.position);
                    return employee.position === staffPosFilter;
                  }).sort((a, b) => {
                    const ORDER: Record<string, number> = { "오픈": 0, "미들": 1, "마감": 2 };
                    return (ORDER[a.scheduleType] ?? 3) - (ORDER[b.scheduleType] ?? 3);
                  }).map(({ employee, scheduleType, workingHours }) => {
                    const isLogistics = employee.position === "물류";
                    const assignedZones = getAssignedZones(employee.id);
                    const colorIdx = staffColorMap.get(employee.id) ?? 0;
                    const avatarBg = isLogistics
                      ? STAFF_AVATAR_COLORS[colorIdx % STAFF_AVATAR_COLORS.length]
                      : "bg-slate-200 text-slate-700";
                    return (
                      <li key={employee.id}
                        draggable={isLogistics}
                        onDragStart={(e) => {
                          if (!isLogistics) return;
                          const s = { employee, scheduleType, workingHours };
                          dragStaffRef.current = s;
                          setDragStaff(s);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", String(employee.id));
                        }}
                        onDragEnd={() => { dragStaffRef.current = null; setDragStaff(null); setDragOverZoneId(null); }}
                        onClick={() => setActiveStaffInfo({ employee, scheduleType, workingHours })}
                        className={`px-2 py-2.5 transition cursor-pointer hover:bg-slate-50 rounded-lg ${isLogistics ? "cursor-grab active:cursor-grabbing" : ""}`}
                        title={isLogistics ? "드래그하여 지도 구역에 배정" : undefined}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${avatarBg}`}>
                            {employee.name.slice(0, 1)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-bold text-slate-700 leading-tight truncate">
                                {employee.name}
                              </span>
                              <div className="flex items-center gap-0.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleSubscribePush(employee.id, employee.name); }}
                                  title={subscribedIds.has(employee.id) ? "알림 등록됨 (재등록)" : "이 기기에서 알림 받기"}
                                  className={`w-5 h-5 rounded flex items-center justify-center transition cursor-pointer ${
                                    subscribedIds.has(employee.id)
                                      ? "bg-emerald-100 text-emerald-600 hover:bg-emerald-200"
                                      : "bg-slate-100 text-slate-400 hover:bg-amber-100 hover:text-amber-600"
                                  }`}
                                >
                                  {subscribingId === employee.id
                                    ? <Loader2 size={10} className="animate-spin" />
                                    : <Bell size={10} />}
                                </button>
                                <span className={`text-[9px] font-semibold px-1 rounded border leading-none ${SHIFT_BADGE[scheduleType] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}>
                                  {scheduleType}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className={`text-[9px] font-semibold px-1 py-0.2 rounded ${isLogistics ? `${STAFF_COLORS[colorIdx % STAFF_COLORS.length]}` : "bg-slate-100 text-slate-650"}`}>
                                {employee.position || "약사"}
                              </span>
                              {workingHours && (
                                <span className="text-[9px] text-slate-400 font-medium">{workingHours}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {isLogistics && assignedZones.length > 0 && (
                          <div className="mt-2 ml-10 flex flex-wrap gap-1">
                            {assignedZones.map((z) => (
                              <span
                                key={z.id}
                                className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${STAFF_COLORS[colorIdx % STAFF_COLORS.length]}`}
                              >
                                <MapPin size={8} />{z.num}번
                              </span>
                            ))}
                          </div>
                        )}

                        {isLogistics && assignedZones.length === 0 && (
                          <div className="mt-1.5 ml-10 text-[9px] text-slate-400 flex items-center gap-1">
                            <MapPin size={8} />맵에서 구역 셀을 눌러 배정
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            </>)}
          </div>

        </section>

        {/* RIGHT COLUMN: Interactive Blueprint Map (Structured according to map.png) */}
        <section className="lg:col-span-9 flex flex-col">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col">

            {/* Save-all toast */}
            {saveAllToast && (
              <div className="fixed top-5 right-5 z-[70] bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
                <CheckCircle2 size={14} />
                전체 구역 배정이 저장되었습니다.
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
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigateDate(-1)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-800 transition cursor-pointer"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="text-center min-w-[160px]">
                  <div className="text-3xl font-black text-gray-900 leading-tight tracking-tight">
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
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {logisticsStaff.length > 0 && logisticsStaff.map(({ employee }) => {
                  const colorIdx = staffColorMap.get(employee.id) ?? 0;
                  return (
                    <span key={employee.id} className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${STAFF_COLORS[colorIdx % STAFF_COLORS.length]}`}>
                      {employee.name}
                    </span>
                  );
                })}
                <div className="flex items-center gap-1.5">
                  <span className="text-xl">🗺️</span>
                  <span className="text-sm font-bold text-gray-600">매장 배치도</span>
                </div>
                <button
                  onClick={() => { setZoneConfigOpen((v) => !v); setActiveGroupId(null); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                    zoneConfigOpen
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-white border border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600"
                  }`}
                >
                  <Layers size={13} />
                  구역 설정
                </button>
                <button
                  onClick={handleSaveAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition cursor-pointer"
                >
                  <Save size={13} />
                  전체저장
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-400 mb-4">* 구역 번호를 누르면 상세 편집창이 열립니다. 전체저장 시 직원 구역배정 정보가 반영됩니다.</p>

            {zoneConfigOpen && (
              <ZoneGroupPanel
                groups={zoneGroups}
                activeGroupId={activeGroupId}
                employees={employees}
                onGroupsChange={setZoneGroups}
                onActiveGroupChange={setActiveGroupId}
              />
            )}


            {/* ── MAP TAB ─────────────────────────────────────────────────── */}
            {/* Simulated 2D Floor Plan L-Shape Grid matches map.png */}
            <div className="overflow-x-auto">
            <div className="p-4 bg-slate-200 rounded-2xl flex flex-col justify-between border-4 border-emerald-500 shadow-inner gap-4 min-w-[780px] min-h-[550px]">

              {/* SECTION 1: TOP HORIZONTAL BAND (Shelves 24-35 + corner cart/elevator) */}
              <div className="flex justify-between items-stretch gap-3 w-full shrink-0">

                {/* Left corner mini-wall shelves: 23, 22 */}
                <div className="flex flex-col gap-1.5 bg-gray-300 p-1.5 rounded-lg w-[72px] justify-center shadow-3xs">
                  <div className="text-[6px] font-black text-gray-500 text-center uppercase tracking-wider">좌측벽</div>
                  {renderZoneCell(23, "h-16 text-[9px] justify-center")}
                  {renderZoneCell(22, "h-16 text-[9px] justify-center")}
                </div>

                {/* Main Horizontal Shelving Wing: includes Top Wall, Aisle Shelves, and Bottom Wall */}
                <div className="flex-1 bg-white border-2 border-emerald-600 rounded-xl p-3 flex flex-col shadow-sm relative">

                  {/* Outer Top Wall Shelves: 24 to 35 */}
                  <div className="w-full">
                    <div className="text-[7px] font-black text-slate-400 uppercase tracking-wider mb-0.5">상단 외곽 매대 (24~35)</div>
                    <div className="grid grid-cols-12 gap-1 bg-slate-100 p-1 rounded">
                      {[24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35].map((num) =>
                        renderZoneCell(num, "h-10 text-[9px] p-0.5 justify-center")
                      )}
                    </div>
                  </div>

                  {/* Inner Aisle Shelves: 9 to 1 (Vertical shelves spaced inside top wing) */}
                  <div className="my-3 w-full">
                    <div className="text-[7px] font-black text-slate-400 uppercase tracking-wider mb-1">중앙 수직 진열대 (9~1)</div>
                    <div className="flex justify-around items-center px-4 bg-slate-50 border border-slate-200 py-2 rounded-lg gap-3">
                      {[9, 8, 7, 6, 5, 4, 3, 2, 1].map((num) =>
                        renderZoneCell(num, "w-9 h-20 flex flex-col justify-between items-center py-1.5 px-0.5 text-[9px]")
                      )}
                    </div>
                  </div>

                  {/* Outer Bottom Wall Shelves of Horizontal Wing: 21 to 10 */}
                  <div className="w-full">
                    <div className="text-[7px] font-black text-slate-400 uppercase tracking-wider mb-0.5">하단 외곽 매대 (21~10)</div>
                    <div className="grid grid-cols-12 gap-1 bg-slate-100 p-1 rounded">
                      {[21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map((num) =>
                        renderZoneCell(num, "h-10 text-[9px] p-0.5 justify-center")
                      )}
                    </div>
                  </div>

                  {/* Expiring Products Zone Marker at far right of top wing */}
                  <div className="absolute top-1 right-2 bg-rose-50 text-rose-700 text-[8px] border border-rose-300 font-extrabold px-1.5 rounded-full uppercase tracking-wider shadow-3xs">
                    유통기한 임박존
                  </div>
                </div>

                {/* Right Top Corner: Cart zone / Elevator / Stairs */}
                <div className="w-14 bg-white border-2 border-emerald-600 rounded-xl p-1.5 flex flex-col justify-between items-center shadow-sm shrink-0 text-center">
                  <div className="text-[8px] font-extrabold text-slate-700 leading-none">🛒 카트존</div>
                  <div className="w-full flex flex-col gap-1 my-1">
                    <div className="bg-slate-50 border rounded p-0.5 text-[10px] leading-none" title="계단"> Stairs ↗️ </div>
                    <div className="bg-slate-50 border rounded p-0.5 text-[10px] leading-none" title="엘리베이터"> EV 🛗 </div>
                  </div>
                  <div className="text-[6px] text-slate-400 leading-none">2층 연결</div>
                </div>

              </div>

              {/* SECTION 2: MIDDLE/BOTTOM AREA (Guidance console + Right vertical wing) */}
              <div className="flex justify-between items-stretch gap-3 w-full flex-1">

                {/* Left guidance area — 위치 카테고리 안내 */}
                <div className="flex-1 bg-white/95 border border-slate-300 rounded-xl p-3 flex flex-col shadow-3xs gap-2 min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 shrink-0">
                    <span className="text-[10px] uppercase font-black text-emerald-700 tracking-wider flex items-center gap-1">
                      <ClipboardList size={11} className="text-emerald-600" />
                      실시간 매장 안내 정보
                    </span>
                    <span className="text-[8px] bg-slate-100 px-1.5 py-0.5 rounded-full font-semibold text-slate-500">
                      {searchQuery ? `${searchedZones.length}개 검색됨` : `전체 ${zones.length}구역`}
                    </span>
                  </div>
                  <div className="relative shrink-0">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="구역명·약품명·증상으로 검색 (예: 감기약, 비타민)"
                      className="w-full py-1.5 pl-7 pr-6 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-400 text-[10px] placeholder-slate-400"
                    />
                    <Search className="absolute left-2 top-2 text-slate-400" size={11} />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-[300px] pr-0.5">
                    {searchedZones.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-[10px]">검색 결과가 없습니다</div>
                    ) : (
                      searchedZones.map((z) => {
                        let cardStyle = "bg-gray-50 border-gray-300 text-gray-700 border-l-4";
                        if (z.section === "aisle") {
                          if (z.num === 1) cardStyle = "bg-green-50 border-green-400 text-green-700 border-l-4";
                          else if (z.num === 2) cardStyle = "bg-yellow-50 border-yellow-400 text-yellow-800 border-l-4";
                          else if (z.num === 3) cardStyle = "bg-teal-50 border-teal-400 text-teal-700 border-l-4";
                          else if (z.num === 9) cardStyle = "bg-blue-50 border-blue-400 text-blue-700 border-l-4";
                          else cardStyle = "bg-slate-50 border-slate-300 text-slate-700 border-l-4";
                        }
                        if (z.status === "empty") cardStyle = "bg-red-50 border-red-400 text-red-700 border-l-4 animate-pulse";
                        else if (z.status === "low") cardStyle = "bg-amber-50 border-amber-400 text-amber-700 border-l-4";
                        return (
                          <div
                            key={z.id}
                            onClick={() => handleOpenZoneDetail(z)}
                            className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer hover:brightness-95 transition ${cardStyle}`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="font-extrabold text-[9px] bg-white/80 px-1 rounded border border-black/10 shrink-0">{z.num}번</span>
                                <span className="font-bold text-[10px] truncate">{z.label}</span>
                                {z.category && (
                                  <span className="text-[9px] text-slate-400 font-medium shrink-0">· {z.category}</span>
                                )}
                              </div>
                              {z.assignedStaffName && (
                                <span className="text-[9px] font-semibold text-slate-500 truncate block">👤 {z.assignedStaffName}</span>
                              )}
                            </div>
                            <ChevronRight size={10} className="text-gray-400 shrink-0 ml-1" />
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold border-t border-slate-100 pt-1.5 shrink-0">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 block" />정상</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 block" />부족</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 block" />품절</span>
                  </div>
                </div>

                {/* Right Vertical Wing of L-Shape (wing zones 36-41) */}
                <div className="w-[300px] bg-slate-50 border-2 border-emerald-600 rounded-xl p-3 flex flex-col gap-2 shadow-sm shrink-0 relative">

                  {/* Wing Title Badge */}
                  <div className="absolute -top-3 left-3 bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm z-20">
                    🚪 우측 수직 카운터 윙
                  </div>

                  <div className="flex items-center justify-between border-b pb-1.5 mt-1 border-slate-200">
                    <span className="text-[10px] font-black text-slate-800">🚪 조제/카운터/이벤트 동선</span>
                    <span className="text-[7px] text-slate-400">Vertical Wing</span>
                  </div>

                  {/* Interactive 4-Column Layout matches map.png side-by-side structures */}
                  <div className="flex gap-2 items-stretch flex-1 min-h-[300px]">

                    {/* Column 1: Refrigerator (37) & Best Set Zone (36) */}
                    <div className="flex-1 flex flex-col gap-1.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[7px] font-black text-amber-950 leading-none">🧊 냉장고</span>
                        {renderZoneCell(37, "h-11 w-full text-[9px] p-0.5 justify-center")}
                      </div>
                      <div className="flex-1 flex flex-col gap-0.5">
                        <span className="text-[7px] font-black text-blue-900 leading-none">🧬 베스트 세트</span>
                        {renderZoneCell(36, "w-full text-[9px] p-1 justify-center", "flex-1")}
                      </div>
                    </div>

                    {/* Column 2: Event Zone (42) */}
                    <div className="flex-1 bg-white border border-slate-200 rounded-lg p-1 flex flex-col gap-1 mr-3">
                      <span className="text-[7px] font-black text-rose-600 uppercase tracking-wide border-b pb-0.5 leading-none">🎈 이벤트존</span>
                      {renderZoneCell(42, "w-full text-[9px] p-1 justify-center", "flex-1")}
                    </div>

                    {/* Column 3: Main Counter Checkout (40) */}
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-[7px] font-black text-slate-500 uppercase tracking-wide leading-none">💳 메인카운터</span>
                      {renderZoneCell(40, "flex-1 w-full justify-between items-center text-[9px] p-1 bg-gray-700 text-white", "flex-1")}
                    </div>

                    {/* Column 4: Front Medicine Display (38) */}
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-[7px] font-black text-slate-500 uppercase tracking-wide leading-none">💊 정면 약진열</span>
                      {renderZoneCell(38, "flex-1 w-full justify-center bg-emerald-700 text-white text-[9px] p-1 font-bold", "flex-1")}
                    </div>

                  </div>

                  {/* Bottom facilities: Breakroom (41), Lockers (39) */}
                  <div className="border-t border-slate-200 pt-2 grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[7px] font-bold text-slate-400">☕ 휴게실/정수기</span>
                      {renderZoneCell(41, "h-10 text-[9px] bg-gray-200 justify-center border-none")}
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[7px] font-bold text-slate-400">🗄️ 사물함/화장실</span>
                      {renderZoneCell(39, "h-10 text-[9px] bg-gray-200 justify-center border-none")}
                    </div>
                  </div>

                  {/* Corner Annex: EV icon + plumbing at very bottom */}
                  <div className="flex justify-between items-center text-[8px] text-slate-400 border-t border-slate-200 pt-1 leading-none">
                    <span>🛗 1층 연결 EV</span>
                    <span>🚰 수도 시설</span>
                  </div>

                </div>

              </div>

            </div>
            </div>{/* end overflow-x-auto */}
          </div>
        </section>

        {/* BOTTOM FULL-WIDTH COLUMN: Requests panel */}
        <section className="lg:col-span-12 mt-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                <ClipboardList size={16} className="text-violet-600" />
              </div>
              <h2 className="text-base font-bold text-slate-900">실시간 진열 보충 요청 현황</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 shrink-0">
                대기 {requests.filter(r => r.status === "pending").length}건 / 전체 {requests.length}건
              </span>
            </div>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 text-xs">
              {(["all", "pending", "done"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setReqFilter(k)}
                  className={`px-3 py-1.5 font-semibold rounded-md transition cursor-pointer ${reqFilter === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {k === "all" ? "전체" : k === "pending" ? "대기중" : "완료"}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto max-h-[300px] overflow-y-auto mt-3">
            {filteredReqs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-xs text-center px-4">
                <Bell size={28} className="mb-2 opacity-30 animate-bounce" />
                {reqFilter === "done" ? "완료된 요청이 없습니다" : reqFilter === "pending" ? "대기 중인 요청이 없습니다" : "등록된 진열 요청이 없습니다"}
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                    <th className="p-3 w-28">요청 구역</th>
                    <th className="p-3">진열 카테고리</th>
                    <th className="p-3 w-24">담당 직원</th>
                    <th className="p-3 w-28">요청 시각</th>
                    <th className="p-3">요청 메모</th>
                    <th className="p-3 w-24 text-center">진행 상태</th>
                    <th className="p-3 w-24 text-center">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReqs.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-bold text-slate-900">{req.zoneLabel}</td>
                      <td className="p-3 text-slate-600">{req.category}</td>
                      <td className="p-3 font-bold text-slate-800">{req.assignedStaffName || "미배정"}</td>
                      <td className="p-3 text-slate-500">{formatRel(req.requestedAt)}</td>
                      <td className="p-3 text-slate-500 italic">{req.note ? `"${req.note}"` : "-"}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-bold border ${req.status === "pending" ? "bg-amber-50 text-amber-700 border-amber-300" : "bg-emerald-50 text-emerald-700 border-emerald-300"}`}>
                          {req.status === "pending" ? "대기" : "완료"}
                        </span>
                      </td>
                      <td className="p-3 flex items-center justify-center gap-1.5">
                        {req.status === "pending" && (
                          <button onClick={() => {
                            setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: "done" as const } : r));
                            fetch(`/api/display-requests/${req.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "done" }),
                            }).catch(() => {});
                          }}
                            className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer flex items-center gap-1">
                            <CheckCircle2 size={10} />완료
                          </button>
                        )}
                        <button onClick={() => {
                          setRequests((prev) => prev.filter((r) => r.id !== req.id));
                          fetch(`/api/display-requests/${req.id}`, { method: "DELETE" }).catch(() => {});
                        }}
                          className="text-[10px] font-medium px-2 py-1 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer border border-slate-200">
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="bg-white text-center p-4 mt-8 text-xs text-gray-400 border-t border-gray-200">
        &copy; 2026 오산메가타운 매장 내비게이션 및 진열 보충 관리 시스템. All Rights Reserved.
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
                  const isLogistics = assignedStaff?.position === "물류";
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
              const isLogistics = activeStaffInfo.employee.position === "물류";
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
            {activeStaffInfo.employee.position === "물류" ? (
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
                              <div className={`text-[10px] font-black leading-tight ${isAssigned ? "text-indigo-800" : otherName ? "text-amber-700" : "text-slate-700"}`}>
                                {z.num}
                              </div>
                              <div className={`text-[8px] leading-none mt-0.5 truncate ${isAssigned ? "text-indigo-500" : otherName ? "text-amber-500" : "text-slate-400"}`}>
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

    </div>
  );
};

export default DisplayPage;
