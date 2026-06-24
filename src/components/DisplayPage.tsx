// src/components/DisplayPage.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Boxes,
  CheckCircle2,
  ChevronLeft,
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
  CheckCheck,
  MapPin,
} from "lucide-react";

interface DisplayPageProps { onBack: () => void; }

// ─── Types ───────────────────────────────────────────────────────────────────
type ZoneStatus = "normal" | "low" | "empty";
type ZoneSection = "aisle" | "bottom_wall" | "top_wall" | "left_wall" | "wing";

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

// ─── Store data (based on category.jpg, 41 zones) ────────────────────────────
const ZONE_DEFS: { num: number; label: string; category: string; section: ZoneSection }[] = [
  // Aisles 1-9 (main floor shelf units, right→left)
  { num: 1,  label: "진열대 1",  category: "종합감기·코감기·진해거담·한방감기",    section: "aisle" },
  { num: 2,  label: "진열대 2",  category: "어린이감기약·어린이영양제·알러지",     section: "aisle" },
  { num: 3,  label: "진열대 3",  category: "해열진통소염·관절근육통·안약",         section: "aisle" },
  { num: 4,  label: "진열대 4",  category: "소화제·지사제·위염·변비약·수면",       section: "aisle" },
  { num: 5,  label: "진열대 5",  category: "자양강장·남성용품·금연·모발",          section: "aisle" },
  { num: 6,  label: "진열대 6",  category: "피부질환용제·기타피부연고",            section: "aisle" },
  { num: 7,  label: "진열대 7",  category: "여성용품·미용·다이어트·살충제",        section: "aisle" },
  { num: 8,  label: "진열대 8",  category: "파스·보호대·칫솔·치약·구강용품",       section: "aisle" },
  { num: 9,  label: "진열대 9",  category: "붕대·마스크·밴드·반창고·거즈",        section: "aisle" },
  // Bottom wall 10-21 (right→left in store: 10 near exit, 21 at far left)
  { num: 10, label: "벽면 10",   category: "종합영양제",                         section: "bottom_wall" },
  { num: 11, label: "벽면 11",   category: "종합영양제",                         section: "bottom_wall" },
  { num: 12, label: "벽면 12",   category: "간기능개선제",                       section: "bottom_wall" },
  { num: 13, label: "벽면 13",   category: "아미노산·아르기닌",                   section: "bottom_wall" },
  { num: 14, label: "벽면 14",   category: "남성기능강화·탈모·전립선",             section: "bottom_wall" },
  { num: 15, label: "벽면 15",   category: "칼슘제·비타민D",                     section: "bottom_wall" },
  { num: 16, label: "벽면 16",   category: "관절영양제·콘드로이틴·MSM",           section: "bottom_wall" },
  { num: 17, label: "벽면 17",   category: "항산화제·면역증강",                   section: "bottom_wall" },
  { num: 18, label: "벽면 18",   category: "뇌기능개선·혈액순환·혈당개선",         section: "bottom_wall" },
  { num: 19, label: "벽면 19",   category: "눈영양제",                           section: "bottom_wall" },
  { num: 20, label: "벽면 20",   category: "염색약",                             section: "bottom_wall" },
  { num: 21, label: "벽면 21",   category: "동물의약품·동물용품",                  section: "bottom_wall" },
  // Left wall 22-23 (between aisles and top section, far left)
  { num: 22, label: "벽면 22",   category: "동물의약품·동물용품",                  section: "left_wall" },
  { num: 23, label: "벽면 23",   category: "의료기기",                           section: "left_wall" },
  // Top wall 24-35 (left→right: 24 at far left, 35 at right)
  { num: 24, label: "벽면 24",   category: "어린이종합·키즈용품",                  section: "top_wall" },
  { num: 25, label: "벽면 25",   category: "오메가3",                            section: "top_wall" },
  { num: 26, label: "벽면 26",   category: "마그네슘·수면",                       section: "top_wall" },
  { num: 27, label: "벽면 27",   category: "유산균",                             section: "top_wall" },
  { num: 28, label: "벽면 28",   category: "잇몸건강",                           section: "top_wall" },
  { num: 29, label: "벽면 29",   category: "철분제·비타민C",                      section: "top_wall" },
  { num: 30, label: "벽면 30",   category: "콜라겐·갱년기·임신부영양제",            section: "top_wall" },
  { num: 31, label: "벽면 31",   category: "건강보조식품",                        section: "top_wall" },
  { num: 32, label: "벽면 32",   category: "한방관련제품",                        section: "top_wall" },
  { num: 33, label: "벽면 33",   category: "PB상품·생활의약품",                   section: "top_wall" },
  { num: 34, label: "벽면 34",   category: "드링크제품",                          section: "top_wall" },
  { num: 35, label: "벽면 35",   category: "냉장의약품",                          section: "top_wall" },
  // Right vertical wing 36-41
  { num: 36, label: "프로모션",   category: "프로모션·이벤트 상품",                 section: "wing" },
  { num: 37, label: "기능성화장품", category: "기능성화장품·미용",                  section: "wing" },
  { num: 38, label: "조제실",     category: "조제실 (약사 전용)",                  section: "wing" },
  { num: 39, label: "화장실",     category: "(시설)",                             section: "wing" },
  { num: 40, label: "계산대",     category: "계산대 (POS)",                      section: "wing" },
  { num: 41, label: "정수기",     category: "(시설)",                             section: "wing" },
];

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
const ZONES_KEY = "megatown_display_zones_v2";
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
  const m = { normal: "bg-emerald-50 border-emerald-300 hover:border-emerald-400 text-emerald-900", low: "bg-amber-50 border-amber-300 hover:border-amber-400 text-amber-900", empty: "bg-red-50 border-red-300 hover:border-red-400 text-red-900" };
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

// ─── Sub-components ───────────────────────────────────────────────────────────
interface ZoneCellProps {
  zone: DisplayZone;
  onClick: (z: DisplayZone) => void;
  size?: "xs" | "sm" | "md";
  assignMode?: boolean;
  isAssigned?: boolean;
}
const ZoneCell: React.FC<ZoneCellProps> = ({ zone, onClick, size = "sm", assignMode, isAssigned }) => {
  const h = size === "md" ? "min-h-[68px]" : size === "sm" ? "min-h-[58px]" : "min-h-[46px]";
  const numSz = size === "xs" ? "text-[10px]" : "text-xs";
  const catSz = size === "xs" ? "text-[8px]" : "text-[9px]";
  let extra = "";
  if (assignMode) extra = isAssigned ? "ring-2 ring-violet-500 shadow-md" : "opacity-80 hover:opacity-100";
  return (
    <button
      type="button"
      onClick={() => onClick(zone)}
      className={`relative w-full rounded-lg border-2 transition-all duration-150 active:scale-[0.96] cursor-pointer flex flex-col justify-between text-left p-1.5 ${h} ${statusCell(zone.status, extra)}`}
    >
      {assignMode && isAssigned && (
        <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-violet-600 flex items-center justify-center">
          <CheckCheck size={8} className="text-white" />
        </div>
      )}
      <div className="flex items-start justify-between gap-0.5">
        <span className={`${numSz} font-black tracking-tight`}>{zone.num}</span>
        <span className={`w-1.5 h-1.5 rounded-full ${statusDot(zone.status)} shrink-0 mt-0.5`} />
      </div>
      <div className={`${catSz} leading-tight text-current font-medium line-clamp-2 mt-0.5`}>{zone.category}</div>
      {zone.assignedStaffName && (
        <div className="text-[8px] text-slate-500 truncate font-semibold mt-0.5">@{zone.assignedStaffName}</div>
      )}
    </button>
  );
};

// ─── Main component ────────────────────────────────────────────────────────────
export const DisplayPage: React.FC<DisplayPageProps> = ({ onBack }) => {
  const [zones, setZones] = useState<DisplayZone[]>(() => loadZones());
  const [requests, setRequests] = useState<DisplayRequest[]>(() => loadRequests());

  // Employees & today's staff
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [todayStaff, setTodayStaff] = useState<TodayStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);

  // Zone assignment mode (for 물류 staff)
  const [assigningStaffId, setAssigningStaffId] = useState<number | null>(null);

  // Employee info modal
  const [activeStaffInfo, setActiveStaffInfo] = useState<TodayStaff | null>(null);

  // Zone modal
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [draftCategory, setDraftCategory] = useState("");
  const [draftProducts, setDraftProducts] = useState("");
  const [draftStaffId, setDraftStaffId] = useState<number | null>(null);
  const [draftStatus, setDraftStatus] = useState<ZoneStatus>("normal");
  const [requestNote, setRequestNote] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [requestFlash, setRequestFlash] = useState(false);

  // Requests panel
  const [reqFilter, setReqFilter] = useState<"all" | "pending" | "done">("all");

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

  // ── Persist ─────────────────────────────────────────────────────────────────
  useEffect(() => { saveZones(zones); }, [zones]);
  useEffect(() => { saveRequests(requests); }, [requests]);

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

  // ── Zone click (normal vs assignment mode) ───────────────────────────────────
  const handleZoneClick = useCallback((zone: DisplayZone) => {
    if (assigningStaffId !== null) {
      const staff = employees.find((e) => e.id === assigningStaffId);
      if (!staff) return;
      setZones((prev) =>
        prev.map((z) => {
          if (z.id !== zone.id) return z;
          if (z.assignedStaffId === assigningStaffId) {
            return { ...z, assignedStaffId: null, assignedStaffName: "" };
          }
          return { ...z, assignedStaffId: staff.id, assignedStaffName: staff.name };
        })
      );
      return;
    }
    setActiveZoneId(zone.id);
  }, [assigningStaffId, employees]);

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
    // Save edits first
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

  // ── Zone groups (matching physical store layout) ─────────────────────────────
  // Top wall: 24→35 left-to-right (ascending)
  const topWallZones    = useMemo(() => zones.filter((z) => z.section === "top_wall").sort((a, b) => a.num - b.num), [zones]);
  // Aisles: displayed 9→1 left-to-right (descending = 9 on left, 1 near exit)
  const aisleZones      = useMemo(() => zones.filter((z) => z.section === "aisle").sort((a, b) => b.num - a.num), [zones]);
  // Left wall: 23 on top, 22 on bottom (ascending by num gives 22,23; we want 23 top → sort descending)
  const leftWallZones   = useMemo(() => zones.filter((z) => z.section === "left_wall").sort((a, b) => b.num - a.num), [zones]);
  // Bottom wall: 21→10 left-to-right (descending = 21 on left, 10 near exit)
  const bottomWallZones = useMemo(() => zones.filter((z) => z.section === "bottom_wall").sort((a, b) => b.num - a.num), [zones]);
  // Wing: 36→41 top-to-bottom (ascending)
  const wingZones       = useMemo(() => zones.filter((z) => z.section === "wing").sort((a, b) => a.num - b.num), [zones]);

  const filteredReqs = useMemo(() =>
    reqFilter === "all" ? requests : requests.filter((r) => r.status === reqFilter),
    [requests, reqFilter]);

  // ── Logistics staff zones helper ─────────────────────────────────────────────
  const getAssignedZones = (staffId: number) => zones.filter((z) => z.assignedStaffId === staffId);

  const now = new Date();
  const todayLabel = `${now.getMonth() + 1}월 ${now.getDate()}일`;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">

      {/* Header */}
      <header className="bg-slate-900 text-white sticky top-0 z-30 shadow-lg">
        <div className="max-w-[1700px] mx-auto px-3 sm:px-5 py-3 flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-slate-300 hover:text-white px-2 py-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer">
            <ChevronLeft size={18} /><span className="text-sm font-medium hidden sm:inline">뒤로</span>
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center shadow-md shrink-0">
              <LayoutGrid size={18} className="text-white" />
            </div>
            <div className="leading-tight">
              <div className="font-bold text-base tracking-tight">매장진열 관리</div>
              <div className="text-[11px] text-slate-400 hidden sm:block">진열 상태 점검 · 보충 요청</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1 text-xs font-black tracking-tight shrink-0">
            <span className="text-red-500">OSAN</span><span className="text-slate-400">MEGATOWN</span>
          </div>
        </div>

        {/* Stats bar */}
        <div className="border-t border-slate-800 bg-slate-900/95">
          <div className="max-w-[1700px] mx-auto px-3 sm:px-5 py-2 grid grid-cols-4 gap-2">
            {[
              { icon: <Boxes size={13} className="text-slate-300" />, label: "전체", val: stats.total, cls: "text-slate-100" },
              { icon: <XCircle size={13} className="text-red-300" />, label: "품절", val: stats.empty, cls: "text-red-300" },
              { icon: <AlertTriangle size={13} className="text-amber-300" />, label: "부족", val: stats.low, cls: "text-amber-300" },
              { icon: <Bell size={13} className="text-violet-300" />, label: "대기요청", val: stats.pending, cls: "text-violet-300" },
            ].map(({ icon, label, val, cls }) => (
              <div key={label} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
                {icon}
                <div className="min-w-0 leading-tight">
                  <div className="text-[10px] text-slate-400 truncate">{label}</div>
                  <div className={`text-base font-bold ${cls}`}>{val}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Main 3-column layout */}
      <main className="flex-1 max-w-[1700px] mx-auto w-full px-3 sm:px-5 py-4 grid grid-cols-1 xl:grid-cols-[240px_1fr_340px] gap-4">

        {/* ═══ LEFT: Today's staff ═══════════════════════════════════════════ */}
        <aside className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
              <Users size={14} className="text-indigo-600" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">오늘 출근 인원</div>
              <div className="text-[11px] text-slate-400">{todayLabel}</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[280px] xl:max-h-none">
            {staffLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-400 gap-2 text-xs">
                <Loader2 size={14} className="animate-spin" />불러오는 중...
              </div>
            ) : staffError ? (
              <div className="px-4 py-3 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">⚠ {staffError}</div>
            ) : todayStaff.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400 text-xs text-center px-4">
                <Users size={24} className="mb-2 opacity-30" />오늘 출근 인원이 없습니다
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {todayStaff.map(({ employee, scheduleType, workingHours }) => {
                  const isLogistics = employee.position === "물류";
                  const assignedZones = getAssignedZones(employee.id);
                  const isAssigning = assigningStaffId === employee.id;
                  const avatarBg = isLogistics
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-200 text-slate-700";
                  return (
                    <li key={employee.id}
                      onClick={() => setActiveStaffInfo({ employee, scheduleType, workingHours })}
                      className={`px-3 py-3 transition cursor-pointer ${isAssigning ? "bg-violet-50 border-l-[3px] border-violet-500" : "hover:bg-slate-50"}`}>

                      {/* Top row: avatar + info */}
                      <div className="flex items-start gap-2.5">
                        {/* Avatar */}
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${avatarBg}`}>
                          {employee.name.slice(0, 1)}
                        </div>

                        {/* Info block */}
                        <div className="flex-1 min-w-0">
                          {/* Name + shift badge */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-bold text-slate-900 leading-tight">{employee.name}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border leading-none ${SHIFT_BADGE[scheduleType] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}>
                              {scheduleType}
                            </span>
                          </div>

                          {/* Position + working hours */}
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isLogistics ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>
                              {employee.position || "약사"}
                            </span>
                            {workingHours && (
                              <span className="text-[10px] text-slate-400 font-medium">{workingHours}</span>
                            )}
                          </div>
                        </div>

                        {/* Zone assign button (logistics only) */}
                        {isLogistics && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setAssigningStaffId(isAssigning ? null : employee.id); }}
                            className={`shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                              isAssigning
                                ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                                : "bg-white text-violet-700 border-violet-300 hover:bg-violet-50"
                            }`}
                          >
                            <MapPin size={10} />
                            {isAssigning ? "완료" : "구역배정"}
                          </button>
                        )}
                      </div>

                      {/* Assigned zones */}
                      {isLogistics && assignedZones.length > 0 && (
                        <div className="mt-2 ml-11 flex flex-wrap gap-1">
                          {assignedZones.map((z) => (
                            <span
                              key={z.id}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700 border border-violet-200 flex items-center gap-0.5"
                            >
                              <MapPin size={8} />{z.num}번
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Assignment mode hint */}
                      {isAssigning && (
                        <div className="mt-2 ml-11 text-[10px] text-violet-600 font-semibold bg-violet-100/60 rounded-md px-2 py-1 flex items-center gap-1">
                          <CheckCheck size={10} />맵에서 구역을 탭해 배정·해제하세요
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Legend */}
          <div className="px-4 py-2.5 border-t border-slate-100 flex flex-wrap gap-2 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />정상</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />부족</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />품절</span>
            {assigningStaffId && (
              <span className="flex items-center gap-1 text-violet-600 font-semibold ml-auto">
                <CheckCheck size={10} />구역 지정 중
              </span>
            )}
          </div>
        </aside>

        {/* ═══ CENTER: Store map ══════════════════════════════════════════════ */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
                <LayoutGrid size={14} className="text-violet-600" />
              </div>
              <h2 className="text-sm font-bold text-slate-900">매장 진열 맵 (1~41번)</h2>
            </div>
            {assigningStaffId && (
              <div className="flex items-center gap-2 text-[11px] text-violet-700 font-bold bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1">
                <CheckCheck size={12} />
                {employees.find((e) => e.id === assigningStaffId)?.name} 구역 지정 중
                <button type="button" onClick={() => setAssigningStaffId(null)} className="text-violet-400 hover:text-violet-700 cursor-pointer ml-1"><X size={12} /></button>
              </div>
            )}
          </div>

          {/* Store map — layout matches category.jpg physical floor plan */}
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-3 sm:p-4">
            <div className="flex gap-2 sm:gap-3">

              {/* ── Main store body ── */}
              <div className="flex-1 min-w-0 space-y-2">

                {/* TOP WALL: 24→35, left to right */}
                <div>
                  <SectionLabel title="상단 벽면" badge="24–35" icon="🧱" />
                  <div className="mt-1 grid grid-cols-12 gap-0.5 sm:gap-1">
                    {topWallZones.map((z) => (
                      <ZoneCell key={z.id} zone={z} onClick={handleZoneClick} size="xs"
                        assignMode={assigningStaffId !== null}
                        isAssigned={z.assignedStaffId === assigningStaffId} />
                    ))}
                  </div>
                </div>

                {/* MIDDLE: left wall (22,23) + aisles (9→1) */}
                <div className="flex gap-1.5 sm:gap-2">

                  {/* Left wall (22,23) — stacked, 23 on top */}
                  <div className="shrink-0 flex flex-col gap-0.5 sm:gap-1 pt-4">
                    {leftWallZones.map((z) => (
                      <ZoneCell key={z.id} zone={z} onClick={handleZoneClick} size="xs"
                        assignMode={assigningStaffId !== null}
                        isAssigned={z.assignedStaffId === assigningStaffId} />
                    ))}
                  </div>

                  {/* Aisles 9→1 (9 on left, 1 near exit on right) */}
                  <div className="flex-1 min-w-0">
                    <SectionLabel title="중앙 수직 진열대" badge="9←→1" icon="🏬" />
                    <div className="mt-1 grid grid-cols-9 gap-0.5 sm:gap-1">
                      {aisleZones.map((z) => (
                        <ZoneCell key={z.id} zone={z} onClick={handleZoneClick} size="md"
                          assignMode={assigningStaffId !== null}
                          isAssigned={z.assignedStaffId === assigningStaffId} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* BOTTOM WALL: 21→10, left to right */}
                <div>
                  <SectionLabel title="하단 벽면" badge="21←→10" icon="🧱" />
                  <div className="mt-1 grid grid-cols-12 gap-0.5 sm:gap-1">
                    {bottomWallZones.map((z) => (
                      <ZoneCell key={z.id} zone={z} onClick={handleZoneClick} size="xs"
                        assignMode={assigningStaffId !== null}
                        isAssigned={z.assignedStaffId === assigningStaffId} />
                    ))}
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-400 font-medium pr-1">↓ 매장 출입구</div>
              </div>

              {/* ── RIGHT WING (36–41) — vertical strip, matches map.png right side ── */}
              <div className="w-[64px] sm:w-[80px] shrink-0 flex flex-col gap-0.5 sm:gap-1">
                <SectionLabel title="우측 윙" badge="36–41" icon="🚪" />
                {/* 36 & 37 side by side at top */}
                <div className="grid grid-cols-2 gap-0.5 sm:gap-1 mt-1">
                  {wingZones.filter((z) => z.num === 36 || z.num === 37).map((z) => (
                    <ZoneCell key={z.id} zone={z} onClick={handleZoneClick} size="xs"
                      assignMode={assigningStaffId !== null}
                      isAssigned={z.assignedStaffId === assigningStaffId} />
                  ))}
                </div>
                {/* 40, 38, 39, 41 stacked */}
                {wingZones.filter((z) => z.num === 40 || z.num === 38 || z.num === 39 || z.num === 41).map((z) => (
                  <ZoneCell key={z.id} zone={z} onClick={handleZoneClick} size="xs"
                    assignMode={assigningStaffId !== null}
                    isAssigned={z.assignedStaffId === assigningStaffId} />
                ))}
              </div>

            </div>
          </div>

          <p className="mt-2.5 text-[11px] text-slate-400">
            {assigningStaffId
              ? "💡 구역을 탭하여 담당자를 배정하거나 해제합니다."
              : "진열대를 탭하여 상태를 갱신하고 보충 요청을 보낼 수 있습니다."}
          </p>
        </section>

        {/* ═══ RIGHT: Requests panel ══════════════════════════════════════════ */}
        <aside className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
                  <ClipboardList size={14} className="text-violet-600" />
                </div>
                <h2 className="text-sm font-bold text-slate-900">진열 요청 현황</h2>
              </div>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700">
                {requests.length}건
              </span>
            </div>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
              {(["all", "pending", "done"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setReqFilter(k)}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition cursor-pointer ${reqFilter === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {k === "all" ? "전체" : k === "pending" ? "대기중" : "완료"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[400px] xl:max-h-none">
            {filteredReqs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-xs text-center px-4">
                <Bell size={24} className="mb-2 opacity-30" />
                {reqFilter === "done" ? "완료된 요청 없음" : reqFilter === "pending" ? "대기 요청 없음" : "진열 요청 없음"}
              </div>
            ) : (
              <ul className="divide-y divide-slate-50">
                {filteredReqs.map((req) => (
                  <li key={req.id} className="p-3.5 hover:bg-slate-50 transition">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-sm font-bold text-slate-900">{req.zoneLabel}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${req.status === "pending" ? "bg-amber-50 text-amber-700 border-amber-300" : "bg-emerald-50 text-emerald-700 border-emerald-300"}`}>
                            {req.status === "pending" ? "대기" : "완료"}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">{req.category}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <User size={10} />{req.assignedStaffName || "미배정"}
                          <span className="text-slate-300">·</span>
                          {formatRel(req.requestedAt)}
                        </div>
                        {req.note && <div className="text-[11px] text-slate-500 mt-1 italic">"{req.note}"</div>}
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {req.status === "pending" && (
                          <button onClick={() => setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: "done" as const } : r))}
                            className="text-[11px] font-semibold px-2 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer flex items-center gap-1">
                            <CheckCircle2 size={11} />완료
                          </button>
                        )}
                        <button onClick={() => setRequests((prev) => prev.filter((r) => r.id !== req.id))}
                          className="text-[11px] font-medium px-2 py-1 rounded-md text-slate-500 hover:bg-slate-100 transition cursor-pointer">
                          삭제
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </main>

      {/* ═══ Zone Detail Modal ══════════════════════════════════════════════════ */}
      {activeZone && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm" onClick={() => setActiveZoneId(null)}>
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

              {/* Assigned staff — prominent card */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1 block">
                  <User size={11} />담당 직원
                </label>
                {(() => {
                  const assignedStaff = employees.find((e) => e.id === draftStaffId) ?? null;
                  const isLogistics = assignedStaff?.position === "물류";
                  return assignedStaff ? (
                    <div className="flex items-center gap-3 px-3 py-3 rounded-xl border-2 border-indigo-200 bg-indigo-50">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-black shrink-0 ${isLogistics ? "bg-indigo-600 text-white" : "bg-slate-300 text-slate-700"}`}>
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
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">진열 상품 메모</label>
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
      {/* ═══ Employee Info Modal ══════════════════════════════════════════════ */}
      {activeStaffInfo && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setActiveStaffInfo(null)}>
          <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className={`px-5 py-5 ${activeStaffInfo.employee.position === "물류" ? "bg-gradient-to-br from-indigo-600 to-indigo-700" : "bg-gradient-to-br from-slate-700 to-slate-800"}`}>
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

            {/* Assigned zones (logistics only) */}
            <div className="px-5 py-4">
              {activeStaffInfo.employee.position === "물류" ? (
                <>
                  <div className="text-xs font-bold text-slate-600 mb-2.5 flex items-center gap-1.5">
                    <MapPin size={12} className="text-indigo-500" />담당 구역
                  </div>
                  {(() => {
                    const az = getAssignedZones(activeStaffInfo.employee.id);
                    return az.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {az.map((z) => (
                          <div key={z.id}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold ${statusCell(z.status)}`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(z.status)}`} />
                            <span className="font-black">{z.num}번</span>
                            <span className="text-[10px] opacity-80 max-w-[80px] truncate">{z.label}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center py-4 text-slate-400 text-xs text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        <MapPin size={18} className="mb-1 opacity-30" />
                        배정된 구역이 없습니다
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="flex flex-col items-center py-4 text-slate-400 text-xs text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Sparkles size={18} className="mb-1 opacity-30" />
                  구역 배정은 물류 직원에게만 적용됩니다
                </div>
              )}
            </div>

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

// ─── Tiny helper sub-component ────────────────────────────────────────────────
const SectionLabel: React.FC<{ title: string; badge: string; icon: string }> = ({ title, badge, icon }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-slate-700">
      <span>{icon}</span>{title}
    </div>
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500">{badge}</span>
  </div>
);

export default DisplayPage;
