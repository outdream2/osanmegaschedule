import React, { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { Shield, Check, Loader2, AlertCircle, Settings as SettingsIcon, Users, IdCard, Construction, Plus, Trash2, GripVertical, Save } from "lucide-react";
import { updateEmployee } from "../../lib/employeeApi";
import type { AuthSession, PagePermissions } from "../../types";
import { DEFAULT_PERMISSIONS } from "../../types";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { SettingsPageShell } from "../common/SettingsPageShell";
import { Lock } from "@phosphor-icons/react";
import { SettingsModal } from "../SettingsModal";
import { useSettings } from "../../hooks/useSettings";
import type { Employee } from "../../types";
// 2026-08-12 · #99 · 사이드바 그룹 트리 구조 · 페이지 → 그룹 매핑 재사용
import { SIDE_NAV_GROUPS } from "../layout/sideNavGroups";
import { CaretDown, CaretRight } from "@phosphor-icons/react";

interface PermissionsPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onLogout: () => void;
  onNavigate?: (page: AppNavPage) => void;
  /** true 시 자체 AppNavHeader skip (BusinessManagePage 임베드용 · 2026-08-03) */
  embedded?: boolean;
}

// 2026-08-12 · sideNavGroups 확장 · 신규 페이지 반영 (승인요청·경영·설정 등)
const PAGE_LABELS: { key: keyof PagePermissions; label: string; desc: string }[] = [
  { key: "schedule",    label: "스케줄",          desc: "직원 월간 근무 스케줄" },
  { key: "display",     label: "매장(진열·발주·매입·통계)", desc: "발주·매입·결제·통계·매장구역·공급사 통합" },
  { key: "scan",        label: "상품 스캔",       desc: "바코드 스캔으로 요청" },
  { key: "productarrival", label: "상품 도착",    desc: "상품 입고 처리" },
  { key: "requests",    label: "요청목록",        desc: "진열·발주·연차승인 등 승인 처리" },
  { key: "leave",       label: "연차 신청/승인",  desc: "휴가·연차 신청 및 승인" },
  { key: "approval-request", label: "승인요청",   desc: "연차·점심불참·사직서 신청" },
  { key: "ocr",         label: "거래명세서 OCR",  desc: "PDF 거래명세서 자동 추출" },
  { key: "upload",      label: "상품 목록 관리",  desc: "xlsx 파일 업로드" },
  { key: "reservation", label: "방문예약",        desc: "상담 및 방문 일정 예약" },
  { key: "lunch",       label: "점심 불참",       desc: "오늘의 점심 불참 신청" },
  { key: "stockcheck",  label: "재고 점검",       desc: "매장 내 의약품 재고 점검" },
  { key: "stockarrivals", label: "입고알림",      desc: "입고 알림 수신·조회" },
  { key: "pharmacist",  label: "약사 전용",       desc: "교육자료 · 복약지도 · 문서 · 관리자 업로드" },
  { key: "board",       label: "이슈 게시판",     desc: "공지·이슈 등 게시판" },
  { key: "business-manage", label: "경영관리",    desc: "직원관리·근로계약서·각종양식" },
  { key: "hr-forms",    label: "각종 양식",       desc: "HR 서식" },
  { key: "mypage",      label: "마이페이지",      desc: "본인 정보·비밀번호·계정" },
  { key: "zone-labels", label: "구역 라벨",       desc: "매장 진열구역 라벨" },
  { key: "permissions", label: "직원권한 설정",   desc: "페이지·직원별 레벨 관리" },
  { key: "branding",    label: "앱 브랜딩 설정",  desc: "연락처·도장·모바일 가시성" },
  { key: "company-info", label: "회사정보 설정",  desc: "약국명·대표·사업자·주소·로고" },
  { key: "season-settings", label: "계절 정의",   desc: "봄·여름·가을·겨울 월 매핑" },
];

const LEVELS = [0,1,2,3,4,5,6,7,8,9];

// 2026-08-12 · #99 · 그룹 아이콘 색상 · Tailwind JIT 스캔 대상 (dynamic class 회피)
const GROUP_COLOR_CLS: Record<string, string> = {
  slate:   "text-slate-500",
  amber:   "text-amber-500",
  red:     "text-red-500",
  sky:     "text-sky-500",
  indigo:  "text-indigo-500",
  emerald: "text-emerald-500",
  violet:  "text-violet-500",
  cyan:    "text-cyan-500",
};

export const PermissionsPage: React.FC<PermissionsPageProps> = ({ authSession, onBack, onLogout, onNavigate, embedded = false }) => {
  const [perms, setPerms] = useState<PagePermissions>(DEFAULT_PERMISSIONS);
  const [saving, setSaving] = useState<string | null>(null); // key being saved
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<"permissions" | "app-settings" | "positions" | "construction">("permissions");
  // 2026-08-11 · 직군 편집 로컬 draft (SettingsModal 이관)
  const [newPositionInput, setNewPositionInput] = useState("");
  const [posDragIdx, setPosDragIdx] = useState<number | null>(null);
  const [posDragOverIdx, setPosDragOverIdx] = useState<number | null>(null);
  const [editingPosIdx, setEditingPosIdx] = useState<number | null>(null);
  const [editingPosValue, setEditingPosValue] = useState<string>("");
  // 직원별 레벨 조정 상태
  const [empSavingId, setEmpSavingId] = useState<number | null>(null);
  const [empSavedIds, setEmpSavedIds] = useState<Set<number>>(new Set());
  const [empSearch, setEmpSearch] = useState<string>("");
  // 2026-08-12 · #99 · 트리 구조 · 그룹 접힘 상태 (localStorage 유지)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("permissions.tree.collapsed");
      if (!raw) return new Set();
      return new Set(JSON.parse(raw) as string[]);
    } catch { return new Set(); }
  });
  const toggleGroup = (id: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("permissions.tree.collapsed", JSON.stringify([...next])); } catch { /* silent */ }
      return next;
    });
  };

  // 환경설정(구 톱니바퀴 모달) 통합 — useSettings + employees 로드
  const {
    positions: PRESET_POSITIONS,
    employmentTypes: PRESET_EMPLOYMENT_TYPES,
    workplaces: settingsWorkplaces,
    scheduleTypes: settingsScheduleTypes,
    wageRates: settingsWageRates,
    employeeWageOverrides: settingsEmployeeWageOverrides,
    underConstruction: settingsUnderConstruction,
    update: updateSettings,
    saveNow: saveSettingsNow,
  } = useSettings();

  // 2026-08-12 · 사용자 지시 · 설정 페이지 저장 버튼 + 토스트 (자동 저장은 이미 debounce 800ms · 이건 즉시 flush + 안내)
  const [saveToast, setSaveToast] = React.useState<string | null>(null);
  const handleSaveAll = React.useCallback(async () => {
    const ok = await saveSettingsNow();
    setSaveToast(ok ? "저장되었습니다" : "저장 실패");
    setTimeout(() => setSaveToast(null), 2500);
  }, [saveSettingsNow]);

  // ─── 직군 편집 핸들러 (SettingsModal 이관) ──────────────────────────────
  const addNewPosition = () => {
    const trimmed = newPositionInput.trim();
    if (!trimmed || PRESET_POSITIONS.includes(trimmed)) return;
    updateSettings({ positions: [...PRESET_POSITIONS, trimmed] });
    setNewPositionInput("");
  };
  // 2026-08-12 · #101 · 직군 삭제 안전장치
  //   · 사용중인 직원 존재 시 · prompt 로 재매핑 대상 직군 입력 · 자동 이동 후 삭제
  //   · 대체 직군 없으면 · 삭제 차단
  const removePositionAt = async (idx: number) => {
    const removing = PRESET_POSITIONS[idx];
    const others = PRESET_POSITIONS.filter((_, i) => i !== idx);
    const using = employees.filter(e => (e.position ?? "") === removing);

    if (using.length === 0) {
      updateSettings({ positions: others });
      return;
    }
    if (others.length === 0) {
      alert(`❌ 직군 "${removing}" 삭제 불가\n사용중인 직원 ${using.length}명 · 다른 직군을 먼저 추가하세요.`);
      return;
    }
    const newPos = window.prompt(
      `⚠ "${removing}" 사용중 · 직원 ${using.length}명\n\n재매핑할 직군을 아래 중에서 입력하세요:\n${others.map(p => `  · ${p}`).join("\n")}\n\n입력한 직군으로 자동 이동 후 "${removing}" 을 삭제합니다.`,
      others[0],
    );
    const target = (newPos ?? "").trim();
    if (!target || !others.includes(target)) {
      if (newPos !== null) alert(`❌ 취소 · "${newPos}" 는 유효한 직군이 아닙니다.`);
      return;
    }
    try {
      for (const emp of using) {
        await updateEmployee(emp, { position: target });
      }
      setEmployees(prev => prev.map(e => (e.position === removing) ? { ...e, position: target } : e));
      updateSettings({ positions: others });
      setSaveToast(`직원 ${using.length}명 · "${removing}" → "${target}" 재매핑 후 삭제 완료`);
      setTimeout(() => setSaveToast(null), 4000);
    } catch (err) {
      alert(`재매핑 실패 · 삭제 취소: ${(err as any)?.message ?? err}`);
    }
  };
  const reorderPosition = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const next = [...PRESET_POSITIONS];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    updateSettings({ positions: next });
  };
  // 2026-08-12 · #101 · 직군 이름 변경 시 · 사용중인 직원 · 자동 rename (transaction)
  const commitEditPosition = async () => {
    if (editingPosIdx === null) return;
    const trimmed = editingPosValue.trim();
    const original = PRESET_POSITIONS[editingPosIdx];
    if (!trimmed || trimmed === original) { setEditingPosIdx(null); return; }
    if (PRESET_POSITIONS.includes(trimmed)) { setEditingPosIdx(null); return; }

    const using = employees.filter(e => (e.position ?? "") === original);
    const next = PRESET_POSITIONS.map((p, i) => i === editingPosIdx ? trimmed : p);

    if (using.length > 0) {
      const ok = window.confirm(
        `직군 "${original}" → "${trimmed}"\n사용중인 직원 ${using.length}명 · 자동으로 함께 변경됩니다.\n진행할까요?`,
      );
      if (!ok) { setEditingPosIdx(null); return; }
      try {
        for (const emp of using) {
          await updateEmployee(emp, { position: trimmed });
        }
        setEmployees(prev => prev.map(e => (e.position === original) ? { ...e, position: trimmed } : e));
      } catch (err) {
        alert(`직원 재매핑 실패 · 변경 취소: ${(err as any)?.message ?? err}`);
        setEditingPosIdx(null);
        return;
      }
    }
    updateSettings({ positions: next });
    setEditingPosIdx(null);
  };
  const [employees, setEmployees] = useState<Employee[]>([]);
  useEffect(() => {
    const now = new Date();
    axios.get(`/api/schedules?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
      .then(r => {
        const list = Array.isArray(r.data?.employees) ? r.data.employees : Array.isArray(r.data) ? r.data : [];
        setEmployees(list);
      })
      .catch(() => setEmployees([]));
  }, []);
  const applyShiftHoursToAll = useCallback(async () => {
    // 스케쥴표에서 "지금 월 전체 적용" 이 필요 · 여기선 기본 안내만
    alert("근무시간 일괄 적용은 스케쥴 관리 페이지에서 진행하세요.");
  }, []);

  const userLevel = authSession?.level ??
    (authSession?.role === "superadmin" || authSession?.role === "admin" ? 9
    : authSession?.role === "manager" ? 2
    : authSession?.role === "employee" ? 1 : 0);

  useEffect(() => {
    axios.get("/api/permissions")
      .then(r => setPerms({ ...DEFAULT_PERMISSIONS, ...r.data }))
      .catch(() => setLoadError("권한 설정을 불러오지 못했습니다."));
  }, []);

  const handleChange = useCallback(async (
    page: keyof PagePermissions,
    field: "read" | "write",
    value: number,
  ) => {
    const updated = {
      ...perms,
      [page]: { ...perms[page], [field]: value },
    };
    setPerms(updated);
    const saveKey = `${page}.${field}`;
    setSaving(saveKey);
    setSavedKeys(s => { const n = new Set(s); n.delete(saveKey); return n; });
    try {
      await axios.post("/api/permissions", { permissions: updated, employeeId: authSession?.employeeId });
      setSavedKeys(s => new Set(s).add(saveKey));
    } catch {
      // revert on error
      setPerms(perms);
    } finally {
      setSaving(null);
    }
  }, [perms, authSession?.employeeId]);

  // 직원 개별 레벨 저장 (PUT /api/employees/:id · 전체 필드 payload · optimistic)
  const handleEmployeeLevelChange = useCallback(async (empId: number, newLevel: number) => {
    const target = employees.find(e => e.id === empId);
    if (!target) return;
    const prevLevel = target.level ?? null;
    if (prevLevel === newLevel) return;

    // Optimistic 갱신
    setEmployees(prev => prev.map(e => e.id === empId ? { ...e, level: newLevel } : e));
    setEmpSavingId(empId);
    setEmpSavedIds(s => { const n = new Set(s); n.delete(empId); return n; });

    try {
      await updateEmployee(target, { level: newLevel });
      setEmpSavedIds(s => new Set(s).add(empId));
      // 2초 뒤 checkmark fade
      window.setTimeout(() => {
        setEmpSavedIds(s => { const n = new Set(s); n.delete(empId); return n; });
      }, 2000);
    } catch (err) {
      console.error("Failed to update employee level:", err);
      // 실패 시 이전 값 복원
      setEmployees(prev => prev.map(e => e.id === empId ? { ...e, level: prevLevel } : e));
      alert(`레벨 저장 실패: ${target.name}`);
    } finally {
      setEmpSavingId(null);
    }
  }, [employees]);

  // 활성 직원 리스트: 퇴사자 제외 · 약사 우선 → 이름순
  const activeEmployees = useMemo(() => {
    const list = employees.filter(e => !e.retireDate);
    const pharmaFirst = (p?: string) => (p === "약사" ? 0 : 1);
    list.sort((a, b) => {
      const d = pharmaFirst(a.position) - pharmaFirst(b.position);
      if (d !== 0) return d;
      const pos = (a.position ?? "").localeCompare(b.position ?? "", "ko");
      if (pos !== 0) return pos;
      return (a.name ?? "").localeCompare(b.name ?? "", "ko");
    });
    return list;
  }, [employees]);

  // 2026-08-12 · #99 · 페이지 → 사이드바 그룹 매핑 · 그룹별 페이지 리스트 계산
  const groupedPages = useMemo(() => {
    const pageToGroup = new Map<string, { groupId: string; groupLabel: string; groupIcon: any; color: string }>();
    SIDE_NAV_GROUPS.forEach(g => g.items.forEach(it => {
      if (!pageToGroup.has(it.key)) {
        pageToGroup.set(it.key, {
          groupId: g.id,
          groupLabel: g.label,
          groupIcon: g.icon ?? g.items[0]?.icon,
          color: g.color,
        });
      }
    }));
    // system-settings · sideNavGroups 에는 있으나 PAGE_LABELS 없을 수 있음 · 매핑만 사용
    const groups: Array<{ id: string; label: string; icon: any; color: string; pages: typeof PAGE_LABELS }> = [];
    const seen = new Set<string>();
    // sideNavGroups 순서 유지
    for (const g of SIDE_NAV_GROUPS) {
      const pages = PAGE_LABELS.filter(p => pageToGroup.get(p.key)?.groupId === g.id);
      if (pages.length === 0) continue;
      groups.push({ id: g.id, label: g.label, icon: g.icon ?? g.items[0]?.icon, color: g.color, pages });
      pages.forEach(p => seen.add(p.key));
    }
    // 미분류 페이지 (기타 그룹)
    const uncategorized = PAGE_LABELS.filter(p => !seen.has(p.key));
    if (uncategorized.length > 0) {
      groups.push({ id: "_misc", label: "기타", icon: Shield, color: "slate", pages: uncategorized });
    }
    return groups;
  }, []);

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    if (!q) return activeEmployees;
    return activeEmployees.filter(e =>
      (e.name ?? "").toLowerCase().includes(q) ||
      (e.position ?? "").toLowerCase().includes(q),
    );
  }, [activeEmployees, empSearch]);

  if (userLevel < 9) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={40} className="text-rose-400 mx-auto mb-3" />
          <p className="text-slate-600 font-semibold">최고관리자(레벨 9)만 접근할 수 있습니다.</p>
        </div>
      </div>
    );
  }

  // 2026-08-12 · embedded 모드는 셸 없이 (BusinessManagePage 임베드 대비)
  if (embedded) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-4">
          {renderPermissionsBody()}
        </div>
      </div>
    );
  }

  return (
    <SettingsPageShell
      activePage={"permissions" as AppNavPage}
      authSession={authSession}
      onBack={onBack}
      onNavigate={onNavigate}
      onLogout={onLogout}
      icon={Lock}
      iconColor="text-violet-600"
      title="직원 권한"
      description="페이지별 최소 권한 · 직원별 레벨 · 근무 유형·직군·공사중 등 앱 전체 설정을 관리합니다. 관리자(lv 9) 전용."
      maxWidth="max-w-4xl"
    >
      {renderPermissionsBody()}
    </SettingsPageShell>
  );

  function renderPermissionsBody() {
    return <>
        {/* 탭 · 2026-08-12 · 우측에 [저장] 버튼 · saveNow + 토스트 (사용자 지시) */}
        <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex flex-wrap bg-slate-100 border border-slate-200 rounded-xl p-0.5 gap-0.5 w-fit">
          <button type="button" onClick={() => setTab("permissions")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[15px] font-black transition cursor-pointer ${tab === "permissions" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            <Shield size={15} />권한 조정
          </button>
          <button type="button" onClick={() => setTab("app-settings")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[15px] font-black transition cursor-pointer ${tab === "app-settings" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            <SettingsIcon size={15} />스케쥴 설정
          </button>
          <button type="button" onClick={() => setTab("positions")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[15px] font-black transition cursor-pointer ${tab === "positions" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            <IdCard size={15} />직군 설정
          </button>
          <button type="button" onClick={() => setTab("construction")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[15px] font-black transition cursor-pointer ${tab === "construction" ? "bg-white text-amber-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            <Construction size={15} />공사중
          </button>
          </div>
          {/* 저장 버튼 · 스케줄/직군/공사중 탭 · saveNow 즉시 flush + 토스트 (권한은 이미 개별 저장) */}
          {tab !== "permissions" && (
            <div className="flex items-center gap-2">
              {saveToast && (
                <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${
                  saveToast.includes("실패")
                    ? "text-rose-600 bg-rose-50 border-rose-200"
                    : "text-emerald-600 bg-emerald-50 border-emerald-200"
                }`}>{saveToast}</span>
              )}
              <button
                type="button"
                onClick={handleSaveAll}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition cursor-pointer"
              >
                <Save size={14} /> 저장
              </button>
            </div>
          )}
        </div>

        {tab === "permissions" && (<>
        {loadError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-sm flex items-center gap-2">
            <AlertCircle size={14} /> {loadError}
          </div>
        )}

        {/* Level legend */}
        <div className="mb-5 px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-100 text-[11px] text-indigo-600 font-medium">
          <span className="font-bold">레벨 기준:</span>&nbsp; 1 = 직원 &nbsp;·&nbsp; 2–8 = 관리자 등급 &nbsp;·&nbsp; 9 = 최고관리자
        </div>

        {/* 섹션 1 · 페이지별 최소 권한 · 2026-08-13 · 저장 버튼 추가 (명시 저장) */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Shield size={13} className="text-slate-500" />
            <h2 className="text-[17px] font-black text-slate-700">페이지별 최소 권한</h2>
          </div>
          <div className="flex items-center gap-2">
            {saveToast && (
              <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${
                saveToast.includes("실패")
                  ? "text-rose-600 bg-rose-50 border-rose-200"
                  : "text-emerald-600 bg-emerald-50 border-emerald-200"
              }`}>{saveToast}</span>
            )}
            <button
              type="button"
              onClick={async () => {
                try {
                  await axios.post("/api/permissions", { permissions: perms, employeeId: authSession?.employeeId });
                  setSaveToast("저장되었습니다");
                } catch {
                  setSaveToast("저장 실패");
                }
                setTimeout(() => setSaveToast(null), 2500);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition cursor-pointer"
              title="현재 페이지별 최소 권한을 서버에 저장"
            >
              <Save size={14} /> 저장
            </button>
          </div>
        </div>
        {/* 2026-08-12 · #99 · 트리 구조 · 사이드바 그룹별 접기/펼치기 · 그룹 내 페이지 리스트 */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[minmax(0,1fr)_170px_170px] sm:grid-cols-[minmax(0,1fr)_180px_180px] px-5 py-2.5 bg-slate-50 border-b border-slate-100 text-[15px] font-bold text-slate-500 tracking-tight">
            <span>페이지</span>
            <span className="text-right pr-3">읽기 최소</span>
            <span className="text-right pr-3">쓰기 최소</span>
          </div>

          {groupedPages.map((g, gi) => {
            const collapsed = collapsedGroups.has(g.id);
            const GroupIcon = g.icon;
            const isLastGroup = gi === groupedPages.length - 1;
            return (
              <div key={g.id} className={isLastGroup ? "" : "border-b border-slate-100"}>
                {/* 그룹 헤더 · 접기/펼치기 · 사이드바 톤 */}
                <button
                  type="button"
                  onClick={() => toggleGroup(g.id)}
                  className="w-full grid grid-cols-[minmax(0,1fr)_170px_170px] sm:grid-cols-[minmax(0,1fr)_180px_180px] px-4 py-2.5 items-center bg-slate-50/60 hover:bg-slate-100/70 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    {collapsed
                      ? <CaretRight size={14} className="text-slate-500" weight="bold" />
                      : <CaretDown  size={14} className="text-slate-500" weight="bold" />}
                    {GroupIcon && <GroupIcon size={16} className={GROUP_COLOR_CLS[g.color] ?? "text-slate-500"} />}
                    <span className="text-[16px] font-black text-slate-700">{g.label}</span>
                    <span className="text-[13px] font-semibold text-slate-400">({g.pages.length})</span>
                  </div>
                  <div />
                  <div />
                </button>

                {!collapsed && g.pages.map(({ key, label, desc }, i) => {
                  const perm = perms[key];
                  return (
                    <div
                      key={key}
                      title={desc}
                      className={`grid grid-cols-[minmax(0,1fr)_170px_170px] sm:grid-cols-[minmax(0,1fr)_180px_180px] px-5 py-2 items-center ${
                        i < g.pages.length - 1 ? "border-t border-slate-100/70" : "border-t border-slate-100/70"
                      }`}
                    >
                      {/* 페이지명 · 들여쓰기 · 트리 시각화 · 2026-08-13 · +2 */}
                      <div className="text-[15px] font-semibold text-slate-700 truncate pl-6">
                        <span className="text-slate-300 mr-1.5">└</span>
                        {label}
                      </div>

                      {/* Read level · 2026-08-13 · pr-3 여백 확대 · 컬럼 폭 170/180 */}
                      <div className="flex justify-end pr-3">
                        <LevelSelect
                          value={perm.read}
                          onChange={v => handleChange(key, "read", v)}
                          saving={saving === `${key}.read`}
                          saved={savedKeys.has(`${key}.read`)}
                        />
                      </div>

                      {/* Write level · 2026-08-13 · pr-3 여백 확대 */}
                      <div className="flex justify-end pr-3">
                        <LevelSelect
                          value={perm.write}
                          onChange={v => handleChange(key, "write", v)}
                          saving={saving === `${key}.write`}
                          saved={savedKeys.has(`${key}.write`)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-slate-400 mt-2 mb-6 pl-1">
          레벨 9(최고관리자)는 항상 모든 페이지에 접근할 수 있습니다. 각 페이지 설명은 마우스를 올리면 표시됩니다.
        </p>

        {/* 섹션 2 · 직원별 개별 레벨 */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Users size={13} className="text-slate-500" />
            <h2 className="text-[13px] font-black text-slate-700">직원별 레벨</h2>
            <span className="text-[11px] text-slate-400 font-medium">
              ({filteredEmployees.length}명 · 약사 우선)
            </span>
          </div>
          <input
            type="text"
            value={empSearch}
            onChange={e => setEmpSearch(e.target.value)}
            placeholder="이름·직군 검색"
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 w-44"
          />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="grid grid-cols-[1fr_90px_130px_36px] px-5 py-2 bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            <span>성명</span>
            <span>직군</span>
            <span className="text-center">레벨</span>
            <span className="text-center">상태</span>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {filteredEmployees.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-400">
                {employees.length === 0 ? "직원 목록을 불러오는 중..." : "일치하는 직원이 없습니다."}
              </div>
            ) : filteredEmployees.map((emp, i) => {
              const isPharma = emp.position === "약사";
              return (
                <div
                  key={emp.id}
                  className={`grid grid-cols-[1fr_90px_130px_36px] px-5 py-1.5 items-center ${
                    i < filteredEmployees.length - 1 ? "border-b border-slate-100" : ""
                  } ${isPharma ? "bg-violet-50/40" : ""}`}
                >
                  <div className="text-sm font-semibold text-slate-800 truncate">{emp.name}</div>
                  <div className="flex items-center">
                    <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded ${
                      isPharma ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"
                    }`}>{emp.position ?? "-"}</span>
                  </div>
                  <div className="flex justify-center">
                    <LevelSelect
                      value={emp.level ?? 1}
                      onChange={v => handleEmployeeLevelChange(emp.id, v)}
                      saving={empSavingId === emp.id}
                      saved={empSavedIds.has(emp.id)}
                    />
                  </div>
                  <div className="flex justify-center">
                    {empSavingId === emp.id ? (
                      <Loader2 size={12} className="text-indigo-400 animate-spin" />
                    ) : empSavedIds.has(emp.id) ? (
                      <Check size={12} className="text-emerald-500" />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-2 pl-1">
          변경 즉시 서버에 저장됩니다. 실패 시 이전 값으로 되돌립니다.
        </p>
        </>)}

        {tab === "app-settings" && (
          <div className="w-full min-w-0 overflow-hidden">
            <SettingsModal
              embedded
              settings={{
                positions: PRESET_POSITIONS,
                employmentTypes: PRESET_EMPLOYMENT_TYPES,
                workplaces: settingsWorkplaces,
                scheduleTypes: settingsScheduleTypes,
                wageRates: settingsWageRates,
                employeeWageOverrides: settingsEmployeeWageOverrides,
              }}
              employees={employees.map(e => ({ id: e.id, name: e.name, position: e.position }))}
              onUpdate={updateSettings}
              onApplyShiftHours={applyShiftHoursToAll}
              onClose={() => { /* no-op · 탭 임베디드 모드 */ }}
              sessionEmployeeId={authSession?.employeeId ?? null}
              onNavigateZoneLabels={onNavigate ? () => onNavigate("zone-labels" as AppNavPage) : undefined}
            />
          </div>
        )}

        {/* 2026-08-11 · 직군 설정 탭 (SettingsModal positions 탭 이관 · 3열 그리드) */}
        {tab === "positions" && (
          <div className="w-full min-w-0 space-y-4">
            <div className="flex items-center gap-2">
              <IdCard size={14} className="text-slate-500" />
              <h2 className="text-[13px] font-black text-slate-700">직군 설정</h2>
            </div>
            <p className="text-[12px] text-slate-500 font-semibold">
              직원 등록/수정 화면의 직군 드롭박스에 표시될 목록입니다. 드래그하여 순서를 변경할 수 있습니다.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {PRESET_POSITIONS.map((pos, idx) => (
                <div
                  key={pos}
                  draggable
                  onDragStart={() => setPosDragIdx(idx)}
                  onDragOver={(e) => { e.preventDefault(); setPosDragOverIdx(idx); }}
                  onDrop={() => {
                    if (posDragIdx !== null) reorderPosition(posDragIdx, idx);
                    setPosDragIdx(null); setPosDragOverIdx(null);
                  }}
                  onDragEnd={() => { setPosDragIdx(null); setPosDragOverIdx(null); }}
                  className={`flex items-center gap-2 bg-white border rounded-lg px-3 py-2 transition ${
                    posDragOverIdx === idx && posDragIdx !== idx
                      ? "border-violet-400 bg-violet-50"
                      : "border-slate-200 hover:border-slate-300"
                  } ${posDragIdx === idx ? "opacity-40" : ""}`}
                >
                  <div className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0">
                    <GripVertical size={14} />
                  </div>
                  {editingPosIdx === idx ? (
                    <input
                      autoFocus
                      value={editingPosValue}
                      onChange={(e) => setEditingPosValue(e.target.value)}
                      onBlur={commitEditPosition}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); commitEditPosition(); }
                        else if (e.key === "Escape") { setEditingPosIdx(null); }
                      }}
                      className="flex-1 text-[13px] font-semibold text-slate-800 bg-white border border-violet-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-300 min-w-0"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setEditingPosIdx(idx); setEditingPosValue(pos); }}
                      className="flex-1 text-[13px] font-semibold text-slate-800 truncate text-left hover:text-violet-700 cursor-text"
                      title="클릭하여 이름 수정"
                    >
                      {pos}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removePositionAt(idx)}
                    className="text-slate-300 hover:text-rose-500 transition cursor-pointer p-0.5 rounded"
                    title="삭제"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                value={newPositionInput}
                onChange={(e) => setNewPositionInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNewPosition(); } }}
                placeholder="새 직군 입력 (Enter)"
                className="flex-1 text-[13px] rounded-lg border border-slate-200 focus:border-violet-500 p-2 bg-white focus:outline-none"
              />
              <button
                type="button"
                onClick={addNewPosition}
                className="px-3 py-2 text-[12px] font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-lg flex items-center gap-1 transition cursor-pointer"
              >
                <Plus size={13} />
                추가
              </button>
            </div>
          </div>
        )}

        {/* 2026-08-11 · 공사중 탭 (SettingsModal 상단 카드 이관) */}
        {tab === "construction" && (
          <div className="w-full min-w-0 space-y-4 max-w-xl">
            <div className="flex items-center gap-2">
              <Construction size={14} className="text-amber-600" />
              <h2 className="text-[13px] font-black text-slate-700">공사중 (Under Construction)</h2>
            </div>
            <label className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 hover:border-amber-400 cursor-pointer">
              <input
                type="checkbox"
                checked={settingsUnderConstruction === true}
                onChange={(e) => updateSettings({ underConstruction: e.target.checked })}
                className="w-4 h-4 accent-amber-500"
              />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-black text-slate-800 leading-tight">공사중 모드 활성화</div>
                <div className="text-[11px] font-semibold text-slate-500 leading-tight mt-0.5">
                  비로그인 랜딩페이지 · 재고 검색 숨김 · "곧 오픈 예정입니다" 표시
                </div>
              </div>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded ${settingsUnderConstruction ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-500"}`}>
                {settingsUnderConstruction ? "ON" : "OFF"}
              </span>
            </label>
          </div>
        )}
    </>;
  }
};

interface LevelSelectProps {
  value: number;
  onChange: (v: number) => void;
  saving: boolean;
  saved: boolean;
}

const LevelSelect: React.FC<LevelSelectProps> = ({ value, onChange, saving, saved }) => (
  <div className="relative flex items-center gap-1.5">
    <select
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      disabled={saving}
      className="appearance-none bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[13px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 cursor-pointer disabled:opacity-60 pr-7 min-w-[120px]"
    >
      {LEVELS.map(l => (
        <option key={l} value={l}>Lv.{l}{l === 1 ? " (직원)" : l === 9 ? " (최고관리자)" : ""}</option>
      ))}
    </select>
    <div className="absolute right-2 pointer-events-none">
      {saving ? (
        <Loader2 size={10} className="text-indigo-400 animate-spin" />
      ) : saved ? (
        <Check size={10} className="text-emerald-500" />
      ) : null}
    </div>
  </div>
);
