// src/components/DisplayPage.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ChevronLeft,
  LayoutGrid,
  Package,
  AlertTriangle,
  XCircle,
  Bell,
  CheckCircle2,
  X,
  Send,
  Save,
  User,
  Boxes,
  Clock,
  ClipboardList,
  Sparkles,
} from "lucide-react";

interface DisplayPageProps {
  onBack: () => void;
}

type ZoneStatus = "normal" | "low" | "empty";
type ZoneSection = "horizontal" | "vertical" | "event" | "best" | "counter";

interface DisplayZone {
  id: string;
  label: string;
  section: ZoneSection;
  num: number;
  category: string;
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

interface Employee {
  id: number;
  name: string;
  position: string;
}

const ZONES_STORAGE_KEY = "megatown_display_zones";
const REQUESTS_STORAGE_KEY = "megatown_display_requests";

const CATEGORIES = [
  "감기·해열",
  "소화·위장",
  "비타민·영양제",
  "관절·근육",
  "눈·코·귀",
  "피부·외용제",
  "한방·자연의학",
  "건강기능식품",
  "의료기기·용품",
  "화장품·뷰티",
  "음료·식품",
  "이벤트상품",
  "베스트세트",
  "(미지정)",
];

const SHORT_CATEGORY: Record<string, string> = {
  "감기·해열": "감기·해열",
  "소화·위장": "소화·위장",
  "비타민·영양제": "비타민",
  "관절·근육": "관절근육",
  "눈·코·귀": "눈·코·귀",
  "피부·외용제": "피부외용",
  "한방·자연의학": "한방",
  "건강기능식품": "건강식품",
  "의료기기·용품": "의료용품",
  "화장품·뷰티": "뷰티",
  "음료·식품": "음료식품",
  "이벤트상품": "이벤트",
  "베스트세트": "베스트",
  "(미지정)": "미지정",
};

const DEFAULT_CATEGORY_BY_NUM_H = [
  "감기·해열",
  "감기·해열",
  "소화·위장",
  "소화·위장",
  "비타민·영양제",
  "비타민·영양제",
  "관절·근육",
  "관절·근육",
  "눈·코·귀",
  "피부·외용제",
  "피부·외용제",
  "한방·자연의학",
  "건강기능식품",
  "건강기능식품",
  "화장품·뷰티",
  "화장품·뷰티",
];

const DEFAULT_CATEGORY_BY_NUM_V = [
  "비타민·영양제",
  "건강기능식품",
  "소화·위장",
  "음료·식품",
  "의료기기·용품",
  "피부·외용제",
  "화장품·뷰티",
  "관절·근육",
];

const DEFAULT_CATEGORY_BY_NUM_C = [
  "(미지정)",
  "(미지정)",
  "(미지정)",
  "(미지정)",
  "(미지정)",
  "(미지정)",
];

const buildDefaultZones = (): DisplayZone[] => {
  const zones: DisplayZone[] = [];
  // Horizontal wing: H-01 ~ H-16
  for (let i = 1; i <= 16; i++) {
    const id = `H-${String(i).padStart(2, "0")}`;
    zones.push({
      id,
      label: id,
      section: "horizontal",
      num: i,
      category: DEFAULT_CATEGORY_BY_NUM_H[i - 1] || "(미지정)",
      assignedStaffId: null,
      assignedStaffName: "",
      status: "normal",
      products: "",
    });
  }
  // Vertical aisles: V-01 ~ V-08
  for (let i = 1; i <= 8; i++) {
    const id = `V-${String(i).padStart(2, "0")}`;
    zones.push({
      id,
      label: id,
      section: "vertical",
      num: i,
      category: DEFAULT_CATEGORY_BY_NUM_V[i - 1] || "(미지정)",
      assignedStaffId: null,
      assignedStaffName: "",
      status: "normal",
      products: "",
    });
  }
  // Event zones
  for (let i = 1; i <= 3; i++) {
    const id = `E-${String(i).padStart(2, "0")}`;
    zones.push({
      id,
      label: `이벤트존 ${i}`,
      section: "event",
      num: i,
      category: "이벤트상품",
      assignedStaffId: null,
      assignedStaffName: "",
      status: "normal",
      products: "",
    });
  }
  // Best set zone
  zones.push({
    id: "B-01",
    label: "베스트세트존",
    section: "best",
    num: 1,
    category: "베스트세트",
    assignedStaffId: null,
    assignedStaffName: "",
    status: "normal",
    products: "",
  });
  // Counter shelves
  for (let i = 1; i <= 6; i++) {
    const id = `C-${String(i).padStart(2, "0")}`;
    zones.push({
      id,
      label: `카운터 ${id}`,
      section: "counter",
      num: i,
      category: DEFAULT_CATEGORY_BY_NUM_C[i - 1] || "(미지정)",
      assignedStaffId: null,
      assignedStaffName: "",
      status: "normal",
      products: "",
    });
  }
  return zones;
};

const loadZones = (): DisplayZone[] => {
  try {
    const raw = localStorage.getItem(ZONES_STORAGE_KEY);
    if (!raw) {
      const defaults = buildDefaultZones();
      localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(defaults));
      return defaults;
    }
    const parsed = JSON.parse(raw) as DisplayZone[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const defaults = buildDefaultZones();
      localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(defaults));
      return defaults;
    }
    return parsed;
  } catch {
    const defaults = buildDefaultZones();
    try {
      localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(defaults));
    } catch {
      /* ignore */
    }
    return defaults;
  }
};

const loadRequests = (): DisplayRequest[] => {
  try {
    const raw = localStorage.getItem(REQUESTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DisplayRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveZones = (zones: DisplayZone[]) => {
  try {
    localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(zones));
  } catch {
    /* ignore quota */
  }
};

const saveRequests = (requests: DisplayRequest[]) => {
  try {
    localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(requests));
  } catch {
    /* ignore quota */
  }
};

const STATUS_LABEL: Record<ZoneStatus, string> = {
  normal: "정상",
  low: "부족",
  empty: "품절",
};

const formatRelative = (iso: string): string => {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffSec = Math.max(0, Math.floor((now - then) / 1000));
    if (diffSec < 60) return "방금 전";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}분 전`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}시간 전`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}일 전`;
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return "";
  }
};

// Tailwind class helpers — kept verbose so JIT picks them up.
const statusCellClasses = (status: ZoneStatus): string => {
  switch (status) {
    case "normal":
      return "bg-emerald-50 border-emerald-300 hover:bg-emerald-100 hover:border-emerald-400 text-emerald-900";
    case "low":
      return "bg-amber-50 border-amber-300 hover:bg-amber-100 hover:border-amber-400 text-amber-900";
    case "empty":
      return "bg-red-50 border-red-300 hover:bg-red-100 hover:border-red-400 text-red-900";
  }
};

const statusDotClasses = (status: ZoneStatus): string => {
  switch (status) {
    case "normal":
      return "bg-emerald-500";
    case "low":
      return "bg-amber-500";
    case "empty":
      return "bg-red-500";
  }
};

const statusBadgeClasses = (status: ZoneStatus): string => {
  switch (status) {
    case "normal":
      return "bg-emerald-100 text-emerald-700 border-emerald-300";
    case "low":
      return "bg-amber-100 text-amber-700 border-amber-300";
    case "empty":
      return "bg-red-100 text-red-700 border-red-300";
  }
};

interface ZoneCellProps {
  zone: DisplayZone;
  onClick: (zone: DisplayZone) => void;
  size?: "sm" | "md" | "lg";
}

const ZoneCell: React.FC<ZoneCellProps> = ({ zone, onClick, size = "sm" }) => {
  const shortCat = SHORT_CATEGORY[zone.category] || zone.category;
  const sizeClasses =
    size === "lg"
      ? "min-h-[78px] p-2.5"
      : size === "md"
      ? "min-h-[64px] p-2"
      : "min-h-[54px] p-1.5";
  const idClass =
    size === "lg" ? "text-sm font-bold" : size === "md" ? "text-xs font-bold" : "text-[11px] font-bold";
  const catClass =
    size === "lg" ? "text-[11px]" : size === "md" ? "text-[10px]" : "text-[9px]";
  return (
    <button
      type="button"
      onClick={() => onClick(zone)}
      className={`relative w-full rounded-lg border-2 transition-all duration-150 active:scale-[0.97] cursor-pointer flex flex-col justify-between text-left ${statusCellClasses(
        zone.status
      )} ${sizeClasses}`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className={`tracking-tight ${idClass}`}>{zone.label}</span>
        <span className={`w-2 h-2 rounded-full ${statusDotClasses(zone.status)} shrink-0 mt-0.5`} />
      </div>
      <div className={`mt-1 leading-tight ${catClass} text-slate-600 font-medium line-clamp-2`}>
        {shortCat}
      </div>
      {zone.assignedStaffName ? (
        <div className="mt-0.5 text-[9px] text-slate-500 truncate font-medium">
          @{zone.assignedStaffName}
        </div>
      ) : null}
    </button>
  );
};

export const DisplayPage: React.FC<DisplayPageProps> = ({ onBack }) => {
  const [zones, setZones] = useState<DisplayZone[]>(() => loadZones());
  const [requests, setRequests] = useState<DisplayRequest[]>(() => loadRequests());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesError, setEmployeesError] = useState<string | null>(null);

  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [requestFilter, setRequestFilter] = useState<"all" | "pending" | "done">("all");

  // Modal-local editable state (committed only on save)
  const [draftCategory, setDraftCategory] = useState<string>("");
  const [draftProducts, setDraftProducts] = useState<string>("");
  const [draftStaffId, setDraftStaffId] = useState<number | null>(null);
  const [draftStatus, setDraftStatus] = useState<ZoneStatus>("normal");
  const [requestNote, setRequestNote] = useState<string>("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [requestFlash, setRequestFlash] = useState(false);

  // Fetch employees once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/schedules?year=2026&month=6");
        if (!res.ok) {
          if (!cancelled) setEmployeesError(`직원 정보를 불러올 수 없습니다 (${res.status})`);
          return;
        }
        const data = await res.json();
        const list = Array.isArray(data?.employees) ? (data.employees as Employee[]) : [];
        if (!cancelled) {
          setEmployees(list);
          setEmployeesError(null);
        }
      } catch (e) {
        if (!cancelled) setEmployeesError("직원 정보를 불러올 수 없습니다");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on change
  useEffect(() => {
    saveZones(zones);
  }, [zones]);
  useEffect(() => {
    saveRequests(requests);
  }, [requests]);

  const activeZone = useMemo(
    () => (activeZoneId ? zones.find((z) => z.id === activeZoneId) || null : null),
    [activeZoneId, zones]
  );

  // When opening modal, hydrate drafts
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
  }, [activeZoneId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openZone = useCallback((zone: DisplayZone) => {
    setActiveZoneId(zone.id);
  }, []);

  const closeModal = useCallback(() => {
    setActiveZoneId(null);
  }, []);

  const handleSave = useCallback(() => {
    if (!activeZone) return;
    const staff = employees.find((e) => e.id === draftStaffId) || null;
    setZones((prev) =>
      prev.map((z) =>
        z.id === activeZone.id
          ? {
              ...z,
              category: draftCategory,
              products: draftProducts,
              assignedStaffId: staff?.id ?? null,
              assignedStaffName: staff?.name ?? "",
              status: draftStatus,
            }
          : z
      )
    );
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  }, [activeZone, draftCategory, draftProducts, draftStaffId, draftStatus, employees]);

  const canRequest = useMemo(
    () => (draftStatus === "low" || draftStatus === "empty") && draftStaffId !== null,
    [draftStatus, draftStaffId]
  );

  const handleSendRequest = useCallback(() => {
    if (!activeZone || !canRequest) return;
    const staff = employees.find((e) => e.id === draftStaffId) || null;
    if (!staff) return;

    // Persist any pending edits first so the request reflects the modal state
    setZones((prev) =>
      prev.map((z) =>
        z.id === activeZone.id
          ? {
              ...z,
              category: draftCategory,
              products: draftProducts,
              assignedStaffId: staff.id,
              assignedStaffName: staff.name,
              status: draftStatus,
            }
          : z
      )
    );

    const newReq: DisplayRequest = {
      id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      zoneId: activeZone.id,
      zoneLabel: activeZone.label,
      category: draftCategory,
      requestedAt: new Date().toISOString(),
      assignedStaffId: staff.id,
      assignedStaffName: staff.name,
      status: "pending",
      note: requestNote.trim(),
    };
    setRequests((prev) => [newReq, ...prev]);
    setRequestFlash(true);
    window.setTimeout(() => setRequestFlash(false), 1500);
  }, [
    activeZone,
    canRequest,
    employees,
    draftStaffId,
    draftCategory,
    draftProducts,
    draftStatus,
    requestNote,
  ]);

  const markRequestDone = useCallback((id: string) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "done" as const } : r))
    );
  }, []);

  const deleteRequest = useCallback((id: string) => {
    setRequests((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // Derived stats
  const stats = useMemo(() => {
    const total = zones.length;
    const empty = zones.filter((z) => z.status === "empty").length;
    const low = zones.filter((z) => z.status === "low").length;
    const pending = requests.filter((r) => r.status === "pending").length;
    return { total, empty, low, pending };
  }, [zones, requests]);

  const horizontalZones = useMemo(
    () => zones.filter((z) => z.section === "horizontal").sort((a, b) => a.num - b.num),
    [zones]
  );
  const verticalZones = useMemo(
    () => zones.filter((z) => z.section === "vertical").sort((a, b) => a.num - b.num),
    [zones]
  );
  const eventZones = useMemo(
    () => zones.filter((z) => z.section === "event").sort((a, b) => a.num - b.num),
    [zones]
  );
  const bestZones = useMemo(() => zones.filter((z) => z.section === "best"), [zones]);
  const counterZones = useMemo(
    () => zones.filter((z) => z.section === "counter").sort((a, b) => a.num - b.num),
    [zones]
  );

  const filteredRequests = useMemo(() => {
    if (requestFilter === "all") return requests;
    return requests.filter((r) => r.status === requestFilter);
  }, [requests, requestFilter]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 text-white sticky top-0 z-30 shadow-lg shadow-slate-900/20">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-slate-300 hover:text-white px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="뒤로가기"
          >
            <ChevronLeft size={18} />
            <span className="text-sm font-medium hidden sm:inline">뒤로</span>
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center shadow-md shadow-violet-900/40 shrink-0">
              <LayoutGrid size={18} className="text-white" />
            </div>
            <div className="leading-tight min-w-0">
              <div className="font-bold text-base sm:text-lg tracking-tight truncate">매장진열 관리</div>
              <div className="text-[11px] text-slate-400 hidden sm:block">
                진열대 상태 점검 및 보충 요청
              </div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs font-black tracking-tight shrink-0">
            <span className="text-red-500">OSAN</span>
            <span className="text-slate-300">MEGATOWN</span>
          </div>
        </div>

        {/* Stats bar */}
        <div className="border-t border-slate-800 bg-slate-900/95">
          <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-2.5 grid grid-cols-4 gap-2 sm:gap-4">
            <StatPill
              icon={<Boxes size={14} className="text-slate-300" />}
              label="전체 진열대"
              value={stats.total}
              tone="slate"
            />
            <StatPill
              icon={<XCircle size={14} className="text-red-300" />}
              label="품절"
              value={stats.empty}
              tone="red"
            />
            <StatPill
              icon={<AlertTriangle size={14} className="text-amber-300" />}
              label="부족"
              value={stats.low}
              tone="amber"
            />
            <StatPill
              icon={<Bell size={14} className="text-violet-300" />}
              label="대기요청"
              value={stats.pending}
              tone="violet"
            />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-[1600px] mx-auto w-full px-3 sm:px-6 py-4 sm:py-6">
        {employeesError ? (
          <div className="mb-4 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            ⚠ {employeesError} — 직원 배정이 비활성화됩니다.
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] gap-4 sm:gap-6">
          {/* Left: Store map */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
                  <LayoutGrid size={15} className="text-violet-600" />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  매장 진열도
                </h2>
              </div>
              <Legend />
            </div>

            <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-3 sm:p-5">
              {/* Top horizontal wing */}
              <div className="mb-4">
                <SectionHeader icon={<Package size={12} />} title="상단 진열대 (벽면)" badge="H-01 ~ H-16" />
                <div className="mt-2 grid grid-cols-8 sm:grid-cols-16 gap-1.5">
                  {horizontalZones.map((z) => (
                    <ZoneCell key={z.id} zone={z} onClick={openZone} size="sm" />
                  ))}
                </div>
              </div>

              {/* Middle row: vertical aisles + event/best + counter */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_140px] gap-3 sm:gap-4">
                {/* Vertical aisles */}
                <div>
                  <SectionHeader
                    icon={<Boxes size={12} />}
                    title="중앙 진열대 (통로)"
                    badge="V-01 ~ V-08"
                  />
                  <div className="mt-2 grid grid-cols-4 gap-1.5 sm:gap-2">
                    {verticalZones.map((z) => (
                      <ZoneCell key={z.id} zone={z} onClick={openZone} size="md" />
                    ))}
                  </div>
                </div>

                {/* Event + Best */}
                <div>
                  <SectionHeader
                    icon={<Sparkles size={12} />}
                    title="이벤트 / 베스트"
                    badge="E·B"
                  />
                  <div className="mt-2 flex flex-col gap-1.5 sm:gap-2">
                    {eventZones.map((z) => (
                      <ZoneCell key={z.id} zone={z} onClick={openZone} size="md" />
                    ))}
                    {bestZones.map((z) => (
                      <ZoneCell key={z.id} zone={z} onClick={openZone} size="md" />
                    ))}
                  </div>
                </div>

                {/* Counter */}
                <div>
                  <SectionHeader
                    icon={<Package size={12} />}
                    title="카운터 진열"
                    badge="C-01 ~ C-06"
                  />
                  <div className="mt-2 flex flex-col gap-1.5 sm:gap-2">
                    {counterZones.map((z) => (
                      <ZoneCell key={z.id} zone={z} onClick={openZone} size="md" />
                    ))}
                    <div className="mt-1 px-2 py-1.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] text-slate-500 text-center font-medium">
                      카운터
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
                <span className="font-medium">↑ 매장 입구</span>
              </div>
            </div>

            <p className="mt-3 text-[11px] text-slate-500">
              진열대를 탭하여 상태를 갱신하고 보충 요청을 보낼 수 있습니다.
            </p>
          </section>

          {/* Right: Requests panel */}
          <aside className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-0">
            <div className="p-4 sm:p-5 border-b border-slate-200">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                    <ClipboardList size={15} className="text-violet-600" />
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate">
                    진열 요청 현황
                  </h2>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 shrink-0">
                  {requests.length}건
                </span>
              </div>

              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                {([
                  { key: "all", label: "전체" },
                  { key: "pending", label: "대기중" },
                  { key: "done", label: "완료" },
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setRequestFilter(tab.key)}
                    className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-colors cursor-pointer ${
                      requestFilter === tab.key
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[480px] lg:max-h-[640px]">
              {filteredRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-12 px-6 text-slate-400">
                  <Bell size={28} className="mb-2 opacity-40" />
                  <p className="text-sm font-medium text-slate-500">
                    {requestFilter === "done"
                      ? "완료된 요청이 없습니다"
                      : requestFilter === "pending"
                      ? "대기 중인 요청이 없습니다"
                      : "진열 요청이 없습니다"}
                  </p>
                  <p className="text-[11px] mt-1">진열대를 탭하여 보충 요청을 보내보세요.</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredRequests.map((req) => (
                    <li key={req.id} className="p-3.5 sm:p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-slate-900 tracking-tight">
                              {req.zoneLabel}
                            </span>
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                                req.status === "pending"
                                  ? "bg-amber-50 text-amber-700 border-amber-300"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-300"
                              }`}
                            >
                              {req.status === "pending" ? "대기중" : "완료"}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 leading-relaxed">
                            <span className="font-medium text-slate-700">{req.category}</span>
                            {req.assignedStaffName ? (
                              <span className="text-slate-500"> · 담당 {req.assignedStaffName}</span>
                            ) : null}
                          </div>
                          {req.note ? (
                            <div className="mt-1.5 text-[11px] text-slate-500 line-clamp-2 bg-slate-50 rounded-md px-2 py-1 border border-slate-100">
                              {req.note}
                            </div>
                          ) : null}
                          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">
                            <Clock size={11} />
                            <span>{formatRelative(req.requestedAt)}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          {req.status === "pending" ? (
                            <button
                              onClick={() => markRequestDone(req.id)}
                              className="text-[11px] font-semibold px-2 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <CheckCircle2 size={11} />
                              완료
                            </button>
                          ) : null}
                          <button
                            onClick={() => deleteRequest(req.id)}
                            className="text-[11px] font-medium px-2 py-1 rounded-md text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
                            aria-label="요청 삭제"
                          >
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
        </div>
      </main>

      {/* Zone Detail Modal */}
      {activeZone ? (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3 bg-slate-50">
              <div
                className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center shrink-0 ${statusCellClasses(
                  draftStatus
                )}`}
              >
                <Package size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold text-slate-900 tracking-tight truncate">
                  {activeZone.label}
                </div>
                <div className="text-[11px] text-slate-500 font-medium">
                  {sectionLabel(activeZone.section)} · ID {activeZone.id}
                </div>
              </div>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusBadgeClasses(
                  draftStatus
                )}`}
              >
                {STATUS_LABEL[draftStatus]}
              </span>
              <button
                onClick={closeModal}
                className="ml-1 w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 cursor-pointer transition-colors"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Status toggle */}
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block">진열 상태</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["normal", "low", "empty"] as const).map((s) => {
                    const active = draftStatus === s;
                    const base =
                      "py-2 text-xs font-semibold rounded-lg border-2 transition-all cursor-pointer flex items-center justify-center gap-1.5";
                    const inactive = "bg-white text-slate-500 border-slate-200 hover:border-slate-300";
                    const activeCls =
                      s === "normal"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-400 shadow-sm shadow-emerald-100"
                        : s === "low"
                        ? "bg-amber-50 text-amber-700 border-amber-400 shadow-sm shadow-amber-100"
                        : "bg-red-50 text-red-700 border-red-400 shadow-sm shadow-red-100";
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setDraftStatus(s)}
                        className={`${base} ${active ? activeCls : inactive}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${statusDotClasses(s)}`} />
                        {STATUS_LABEL[s]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block">상품 카테고리</label>
                <select
                  value={draftCategory}
                  onChange={(e) => setDraftCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none transition cursor-pointer"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Products */}
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block">진열 상품 메모</label>
                <textarea
                  value={draftProducts}
                  onChange={(e) => setDraftProducts(e.target.value)}
                  rows={3}
                  placeholder="예: 타이레놀 500mg, 판콜에이, 베아제 등"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none transition resize-none"
                />
              </div>

              {/* Staff */}
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block flex items-center gap-1">
                  <User size={12} />
                  담당 직원
                </label>
                <select
                  value={draftStaffId ?? ""}
                  onChange={(e) =>
                    setDraftStaffId(e.target.value === "" ? null : Number(e.target.value))
                  }
                  disabled={employees.length === 0}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none transition cursor-pointer disabled:bg-slate-50 disabled:cursor-not-allowed"
                >
                  <option value="">— 미배정 —</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                      {emp.position ? ` (${emp.position})` : ""}
                    </option>
                  ))}
                </select>
                {employees.length === 0 ? (
                  <p className="mt-1 text-[10px] text-slate-400">직원 목록을 불러오는 중...</p>
                ) : null}
              </div>

              {/* Request note */}
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block">요청 메모 (선택)</label>
                <input
                  type="text"
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value)}
                  placeholder="예: 오늘 오후까지 보충 부탁드립니다"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none transition"
                />
              </div>

              {savedFlash ? (
                <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircle2 size={14} />
                  저장되었습니다
                </div>
              ) : null}
              {requestFlash ? (
                <div className="px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold flex items-center gap-1.5">
                  <Send size={14} />
                  진열 요청이 전송되었습니다
                </div>
              ) : null}
            </div>

            {/* Modal footer */}
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                onClick={handleSave}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Save size={14} />
                저장
              </button>
              <button
                onClick={handleSendRequest}
                disabled={!canRequest}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:text-slate-500"
                title={
                  !canRequest
                    ? "상태가 '부족' 또는 '품절'이고 담당 직원이 배정되어야 요청할 수 있습니다"
                    : ""
                }
              >
                <Send size={14} />
                진열 요청 보내기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

// ---- small subcomponents ----

interface StatPillProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "slate" | "red" | "amber" | "violet";
}

const StatPill: React.FC<StatPillProps> = ({ icon, label, value, tone }) => {
  const toneClass: Record<StatPillProps["tone"], string> = {
    slate: "text-slate-100",
    red: "text-red-300",
    amber: "text-amber-300",
    violet: "text-violet-300",
  };
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex flex-col leading-tight">
        <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate">{label}</span>
        <span className={`text-base sm:text-lg font-bold tracking-tight ${toneClass[tone]}`}>
          {value}
        </span>
      </div>
    </div>
  );
};

const Legend: React.FC = () => (
  <div className="hidden sm:flex items-center gap-3 text-[11px] font-medium text-slate-600">
    <span className="flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
      정상
    </span>
    <span className="flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
      부족
    </span>
    <span className="flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
      품절
    </span>
  </div>
);

interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  badge: string;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ icon, title, badge }) => (
  <div className="flex items-center justify-between gap-2">
    <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-slate-700 tracking-tight">
      <span className="text-slate-500">{icon}</span>
      {title}
    </div>
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500">
      {badge}
    </span>
  </div>
);

const sectionLabel = (section: ZoneSection): string => {
  switch (section) {
    case "horizontal":
      return "상단 벽면 진열";
    case "vertical":
      return "중앙 통로 진열";
    case "event":
      return "이벤트 진열";
    case "best":
      return "베스트세트 진열";
    case "counter":
      return "카운터 진열";
  }
};

export default DisplayPage;
