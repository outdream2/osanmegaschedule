// src/components/DisplayPage.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ZONE_DEFS, ZONES_STORAGE_KEY, type ZoneSection } from "../constants/displayZones";
import {
  Bell,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutGrid,
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
  Calendar,
  ScanLine,
} from "lucide-react";
import { BarcodeScanner } from "./BarcodeScanner";

interface DisplayPageProps {
  onBack: () => void;
  onOpenEmployeeEdit?: (employeeId: number) => void;
  onNavigateToSchedule?: () => void;
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
  "오픈": "bg-amber-100 text-amber-800 border-amber-300",
  "미들": "bg-sky-100 text-sky-800 border-sky-300",
  "마감": "bg-emerald-100 text-emerald-800 border-emerald-300",
};

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

// ─── Sub-components ───────────────────────────────────────────────────────────
interface ZoneCellProps {
  zone: DisplayZone;
  onContextClick: (z: DisplayZone, rect: DOMRect) => void;
  onDetailClick: (z: DisplayZone) => void;
  className?: string;
  isPopoverOpen?: boolean;
  staffColorIndex?: number | null;
  isDragOver?: boolean;
  onDragOver?: (e: React.DragEvent, zone: DisplayZone) => void;
  onDrop?: (e: React.DragEvent, zone: DisplayZone) => void;
  onDragLeave?: () => void;
  showDetails?: boolean;
  isSearchedHighlight?: boolean;
}

const ZoneCell: React.FC<ZoneCellProps> = ({
  zone, onContextClick, onDetailClick, className = "", isPopoverOpen, staffColorIndex,
  isDragOver, onDragOver, onDrop, onDragLeave, showDetails = false, isSearchedHighlight = false
}) => {
  const ref = useRef<HTMLButtonElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      onContextClick(zone, rect);
    }
  };

  const ringCls = isDragOver
    ? "ring-2 ring-emerald-500 ring-offset-1 shadow-lg z-10 scale-[1.04]"
    : isPopoverOpen
    ? "ring-2 ring-indigo-500 ring-offset-1 shadow-lg z-10"
    : isSearchedHighlight
    ? "ring-4 ring-emerald-500 animate-pulse scale-[1.05] z-10"
    : "";

  let statusCls = "bg-white text-gray-700 border-gray-300 hover:border-gray-400";
  if (zone.status === "low") {
    statusCls = "bg-amber-500 text-white border-amber-600 hover:bg-amber-600";
  } else if (zone.status === "empty") {
    statusCls = "bg-red-500 text-white border-red-650 hover:bg-red-600";
  } else {
    // Normal background color scheme based on sections / map definitions
    if (zone.section === "aisle") {
      const aisleColors: Record<number, string> = {
        9: "bg-blue-500 text-white border-blue-600 hover:bg-blue-600",
        8: "bg-blue-400 text-white border-blue-500 hover:bg-blue-500",
        7: "bg-sky-500 text-white border-sky-600 hover:bg-sky-600",
        6: "bg-purple-400 text-white border-purple-500 hover:bg-purple-500",
        5: "bg-stone-400 text-white border-stone-500 hover:bg-stone-500",
        4: "bg-orange-300 text-white border-orange-400 hover:bg-orange-400",
        3: "bg-teal-500 text-white border-teal-600 hover:bg-teal-600",
        2: "bg-yellow-400 text-gray-900 border-yellow-500 hover:bg-yellow-500",
        1: "bg-green-500 text-white border-green-600 hover:bg-green-600",
      };
      statusCls = aisleColors[zone.num] || "bg-blue-500 text-white border-blue-600";
    } else if (zone.num === 36) {
      statusCls = "bg-blue-50 text-blue-900 border-blue-300 hover:bg-blue-100 hover:border-blue-400";
    } else if (zone.num === 37) {
      statusCls = "bg-[#fef08a] text-amber-950 border-yellow-400 hover:bg-yellow-100 hover:border-yellow-500";
    } else if (zone.num === 38) {
      statusCls = "bg-orange-500 text-white border-orange-600 hover:bg-orange-600";
    } else if (zone.num === 40) {
      statusCls = "bg-blue-500 text-white border-blue-600 hover:bg-blue-600";
    } else if (zone.num === 39 || zone.num === 41) {
      statusCls = "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200 hover:border-gray-400";
    }
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        if (ref.current) onDetailClick(zone);
      }}
      onDragOver={onDragOver ? (e) => onDragOver(e, zone) : undefined}
      onDrop={onDrop ? (e) => onDrop(e, zone) : undefined}
      onDragLeave={onDragLeave}
      className={`w-full rounded-lg border-2 transition-all duration-300 active:scale-[0.96] cursor-pointer flex flex-col font-bold shadow-sm ${statusCls} ${ringCls} ${className}`}
    >
      {/* Row 1: 구역 번호 + 상태 dot */}
      <div className="flex items-center justify-between px-1 pt-0.5 shrink-0">
        <span className="text-[8px] leading-none font-black opacity-70">{zone.num}</span>
        {zone.status !== "normal" ? (
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(zone.status)}`} />
        ) : (
          <span className="w-1.5 h-1.5 shrink-0" />
        )}
      </div>

      {/* Row 2: 담당자 이름 뱃지 */}
      <div className="flex-1 flex items-center justify-center w-full px-0.5 min-h-0 pb-0.5">
        {zone.assignedStaffName ? (
          <span className={`text-[9px] font-black px-1 py-px rounded leading-tight text-center max-w-full break-all ${
            staffColorIndex !== null && staffColorIndex !== undefined
              ? STAFF_AVATAR_COLORS[staffColorIndex % STAFF_AVATAR_COLORS.length]
              : "bg-slate-600 text-white"
          }`}>
            {zone.assignedStaffName.slice(0, 3)}
          </span>
        ) : (
          <span className="text-[9px] opacity-30 font-normal">-</span>
        )}
      </div>

      {/* Row 3: showDetails 카테고리 텍스트 (선택적) */}
      {showDetails && (
        <div className="text-[7px] leading-tight font-medium line-clamp-1 text-center opacity-70 w-full px-0.5 shrink-0 pb-0.5">{zone.category}</div>
      )}
    </button>
  );
};

// ─── Zone Assignment Popover ──────────────────────────────────────────────────
interface ZoneAssignPopoverProps {
  zone: DisplayZone;
  anchor: DOMRect;
  logisticsStaff: TodayStaff[];
  staffColorMap: Map<number, number>;
  onAssign: (staffId: number, staffName: string) => void;
  onUnassign: () => void;
  onOpenDetail: () => void;
  onClose: () => void;
  onStaffInfoClick: (staff: TodayStaff) => void;
}

const ZoneAssignPopover: React.FC<ZoneAssignPopoverProps> = ({
  zone, anchor, logisticsStaff, staffColorMap, onAssign, onUnassign, onOpenDetail, onClose, onStaffInfoClick,
}) => {
  const [style, setStyle] = useState<React.CSSProperties>({});
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popoverRef.current) return;
    const popoverHeight = popoverRef.current.offsetHeight || 220;
    const popoverWidth  = popoverRef.current.offsetWidth || 240;

    let top  = anchor.bottom + 6;
    let left = anchor.left + (anchor.width / 2) - (popoverWidth / 2);

    // Keep within window bounds
    if (left < 10) left = 10;
    if (left + popoverWidth > window.innerWidth - 10) {
      left = window.innerWidth - popoverWidth - 10;
    }
    if (top + popoverHeight > window.innerHeight - 10) {
      top = anchor.top - popoverHeight - 6;
    }
    if (top < 10) top = 10;

    setStyle({ top, left, position: "fixed", zIndex: 100 });
  }, [anchor]);

  return (
    <div
      ref={popoverRef}
      style={style}
      onClick={(e) => e.stopPropagation()}
      className="w-[240px] bg-white rounded-2xl border border-slate-200 shadow-2xl p-3 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Popover Header */}
      <div className="flex items-start justify-between border-b border-slate-100 pb-2">
        <div className="min-w-0">
          <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
            <span className={`px-1.5 py-0.5 rounded-md border text-[10px] ${statusCell(zone.status)}`}>
              {zone.num}번
            </span>
            <span className="truncate">{zone.label}</span>
          </div>
          <p className="text-[10px] text-slate-400 truncate mt-0.5">{zone.category}</p>
        </div>
        <button onClick={onClose} className="w-5 h-5 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer">
          <X size={12} />
        </button>
      </div>

      {/* Logistics Roster */}
      <div className="space-y-1">
        <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
          <Users size={11} />물류 담당 배정
        </div>

        {logisticsStaff.length === 0 ? (
          <div className="text-[10px] text-slate-400 italic py-2 text-center">오늘 출근한 물류 직원이 없습니다.</div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 max-h-[120px] overflow-y-auto pr-0.5">
            {logisticsStaff.map((ts) => {
              const { employee } = ts;
              const isAssigned = zone.assignedStaffId === employee.id;
              const colorIdx = staffColorMap.get(employee.id) ?? 0;

              return (
                <button
                  key={employee.id}
                  type="button"
                  onClick={() => onAssign(employee.id, employee.name)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onStaffInfoClick(ts);
                  }}
                  className={`px-2 py-1.5 rounded-lg border text-left text-[11px] font-bold truncate transition cursor-pointer flex items-center gap-1.5 ${
                    isAssigned
                      ? `${STAFF_COLORS[colorIdx % STAFF_COLORS.length]} border-indigo-400 shadow-3xs`
                      : "bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isAssigned ? "bg-indigo-600" : "bg-slate-300"}`} />
                  {employee.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Popover actions */}
      <div className="border-t border-slate-100 pt-2 flex gap-1.5">
        {zone.assignedStaffId !== null && (
          <button
            type="button"
            onClick={onUnassign}
            className="flex-1 text-[10px] font-bold text-rose-600 hover:text-rose-700 py-1.5 rounded-xl hover:bg-rose-50 border border-transparent transition cursor-pointer"
          >
            배정 해제
          </button>
        )}
        <button
          type="button"
          onClick={onOpenDetail}
          className="flex-1 text-[10px] font-semibold text-slate-500 hover:text-slate-700 py-1.5 rounded-xl hover:bg-slate-100 border border-transparent transition cursor-pointer flex items-center justify-center gap-1"
        >
          <Package size={11} />상세 편집 열기
        </button>
      </div>
    </div>
  );
};

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

// ─── Main component ────────────────────────────────────────────────────────────
export const DisplayPage: React.FC<DisplayPageProps> = ({ onBack, onOpenEmployeeEdit, onNavigateToSchedule }) => {
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

  // Requests panel
  const [reqFilter, setReqFilter] = useState<"all" | "pending" | "done">("all");

  // Today staff position filter
  const [staffPosFilter, setStaffPosFilter] = useState<string>("전체");

  // Push notification subscription state
  const [subscribingId, setSubscribingId] = useState<number | null>(null);
  const [subscribedIds, setSubscribedIds] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("megatown_push_subscribed") ?? "[]")); }
    catch { return new Set(); }
  });

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

  // ── Fetch employees + today's schedule ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStaffLoading(true);
      try {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth() + 1;
        const todayStr = `${y}-${String(m).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const res = await fetch(`/api/schedules?year=${y}&month=${m}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        const empList: Employee[] = Array.isArray(data?.employees) ? data.employees : [];
        if (cancelled) return;
        setEmployees(empList);

        const workTypes = new Set(["오픈", "미들", "마감", "오전반차", "오후반차"]);
        const today: TodayStaff[] = [];
        for (const emp of empList) {
          const sc = emp.schedules?.find((s) => s.date === todayStr);
          if (sc && workTypes.has(sc.type)) {
            today.push({ employee: emp, scheduleType: sc.type, workingHours: sc.workingHours || "" });
          }
        }
        setTodayStaff(today);
        setStaffError(null);
      } catch {
        if (!cancelled) setStaffError("직원 정보를 불러올 수 없습니다");
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  const searchedZoneIds = useMemo(
    () => new Set(searchQuery ? searchedZones.map((z) => z.id) : []),
    [searchedZones, searchQuery]
  );

  const filteredReqs = useMemo(() =>
    reqFilter === "all" ? requests : requests.filter((r) => r.status === reqFilter),
    [requests, reqFilter]);

  // ── Logistics staff zones helper ─────────────────────────────────────────────
  const getAssignedZones = (staffId: number) => zones.filter((z) => z.assignedStaffId === staffId);

  const now = new Date();
  const todayLabel = `${now.getMonth() + 1}월 ${now.getDate()}일`;

  const popoverZone = useMemo(
    () => (popoverAnchor ? zones.find((z) => z.id === popoverAnchor.zoneId) ?? null : null),
    [popoverAnchor, zones],
  );

  // Helper to find specific zones by number
  const getZone = (num: number) => zones.find((z) => z.num === num);

  // Helper to render Zone Cell on Blueprint
  const renderZoneCell = (num: number, classes = "") => {
    const z = getZone(num);
    if (!z) return null;
    return (
      <div key={z.id} className="flex flex-col gap-0.5">
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
        />
        {z.assignedStaffId !== null && (
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

      {/* Header */}
      <header className="bg-white border-b border-gray-200 h-14 flex items-center justify-between px-4 sm:px-6 shrink-0 shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onBack}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-500 hover:text-gray-900 transition cursor-pointer text-xs font-semibold shrink-0"
              title="메인으로 돌아가기"
            >
              <ChevronLeft size={13} />
              <span className="hidden sm:inline">메인</span>
            </button>
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm shrink-0">
              <LayoutGrid size={14} className="text-white" />
            </div>
            <span className="font-black tracking-tight leading-none shrink-0">
              <span className="text-red-500 text-xl">OSAN</span>
              <span className="hidden sm:inline text-gray-900 text-base"> MEGATOWN</span>
            </span>
          </div>

          {/* Nav tabs */}
          <div className="flex items-center gap-1 ml-2 bg-gray-100 rounded-xl p-1">
            {onNavigateToSchedule && (
              <button
                onClick={onNavigateToSchedule}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-gray-500 hover:text-gray-800 hover:bg-white transition cursor-pointer"
              >
                <Calendar size={11} /> 스케줄관리
              </button>
            )}
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black bg-white text-indigo-700 shadow-sm border border-indigo-100">
              <LayoutGrid size={11} /> 매장관리
            </span>
          </div>
        </div>
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
      </header>

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
                  onClick={() => setSearchQuery("")}
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

          {/* Today's Active Staff Panel */}
          <div className="bg-white p-4 rounded-xl shadow-xs border border-gray-100 flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-2 shrink-0">
              <Users size={14} className="text-emerald-600" />
              <h3 className="text-xs font-bold text-slate-800">오늘 출근 직원 ({todayStaff.length}명)</h3>
            </div>

            {/* Position filter pills */}
            <div className="flex gap-1 mb-2 shrink-0">
              {(["전체", "약사", "물류", "캐셔"] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() => setStaffPosFilter(pos)}
                  className={`flex-1 py-1 text-[10px] font-bold rounded-lg border cursor-pointer transition ${
                    staffPosFilter === pos
                      ? pos === "전체"   ? "bg-gray-800 text-white border-gray-800"
                      : pos === "약사"   ? "bg-violet-600 text-white border-violet-600"
                      : pos === "물류"   ? "bg-orange-500 text-white border-orange-500"
                                         : "bg-teal-500 text-white border-teal-500"
                      : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {pos === "전체" ? "전체" : pos === "약사" ? "💊 약사" : pos === "물류" ? "📦 물류" : "💳 캐셔"}
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
                  {todayStaff.filter(({ employee }) =>
                    staffPosFilter === "전체" || employee.position.includes(staffPosFilter)
                  ).map(({ employee, scheduleType, workingHours }) => {
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

            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <span className="text-xl">🗺️</span>
                <h2 className="text-lg font-bold text-gray-700">실시간 매장 지도</h2>
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


            {/* ── MAP TAB ─────────────────────────────────────────────────── */}
            {/* Simulated 2D Floor Plan L-Shape Grid matches map.png */}
            <div className="overflow-x-auto">
            <div className="p-4 bg-slate-200 rounded-2xl flex flex-col justify-between border-4 border-emerald-500 shadow-inner gap-4 min-w-[780px] min-h-[550px]">
              
              {/* SECTION 1: TOP HORIZONTAL BAND (Shelves 24-35 + corner cart/elevator) */}
              <div className="flex justify-between items-stretch gap-3 w-full shrink-0">
                
                {/* Left corner mini-wall shelves: 23, 22 */}
                <div className="flex flex-col gap-1 bg-gray-300 p-1.5 rounded-lg w-12 justify-center shadow-3xs">
                  <div className="text-[6px] font-black text-gray-500 text-center uppercase">좌측벽</div>
                  {renderZoneCell(23, "h-8 text-[9px] justify-center")}
                  {renderZoneCell(22, "h-8 text-[9px] justify-center")}
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
                  <div className="flex gap-2 items-stretch flex-1 min-h-[220px]">
                    
                    {/* Column 1: Refrigerator (37) & Best Set Zone (36) */}
                    <div className="flex-1 flex flex-col gap-1.5 justify-between">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[7px] font-black text-amber-950 leading-none">🧊 냉장고</span>
                        {renderZoneCell(37, "h-11 w-full text-[9px] p-0.5 justify-center")}
                      </div>
                      <div className="flex-1 flex flex-col gap-0.5 justify-between">
                        <span className="text-[7px] font-black text-blue-900 leading-none">🧬 베스트 세트</span>
                        {renderZoneCell(36, "flex-1 w-full text-[9px] p-1 justify-center")}
                      </div>
                    </div>

                    {/* Column 2: Event Zone (42) */}
                    <div className="flex-1 bg-white border border-slate-200 rounded-lg p-1 flex flex-col gap-1 mr-3">
                      <span className="text-[7px] font-black text-rose-600 uppercase tracking-wide border-b pb-0.5 leading-none">🎈 이벤트존</span>
                      <div className="flex-1 flex flex-col justify-center py-1">
                        {renderZoneCell(42, "flex-1 w-full text-[9px] p-1 justify-center")}
                      </div>
                    </div>

                    {/* Column 3: Main Counter Checkout (40) */}
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-[7px] font-black text-slate-500 uppercase tracking-wide leading-none">💳 메인카운터</span>
                      {renderZoneCell(40, "flex-1 w-full justify-between items-center text-[9px] p-1 bg-gray-700 text-white")}
                    </div>

                    {/* Column 4: Front Medicine Display (38) */}
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-[7px] font-black text-slate-500 uppercase tracking-wide leading-none">💊 정면 약진열</span>
                      {renderZoneCell(38, "flex-1 w-full justify-center bg-emerald-700 text-white text-[9px] p-1 font-bold")}
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
                          <button onClick={() => setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: "done" as const } : r))}
                            className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer flex items-center gap-1">
                            <CheckCircle2 size={10} />완료
                          </button>
                        )}
                        <button onClick={() => setRequests((prev) => prev.filter((r) => r.id !== req.id))}
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
