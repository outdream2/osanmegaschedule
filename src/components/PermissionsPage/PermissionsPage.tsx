// 2026-08-16 · apiClient 마이그레이션
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "../../lib/apiClient";
import { Shield, Loader2, AlertCircle, Settings as SettingsIcon, Users, IdCard, Construction, Save, Eye, EyeOff } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { invalidatePagePermissions } from "../../hooks/usePagePermissions";
import { useSidebarEnabled, invalidateSidebarEnabled } from "../../hooks/useSidebar";
import { useToast, toastClass } from "../../hooks/useToast";
// 2026-08-21 · Framework Phase 3 · window.confirm → useConfirm
import { useConfirm } from "../../hooks/useConfirm";
import { updateEmployee } from "../../lib/employeeApi";
import type { AuthSession, PagePermissions } from "../../types";
import { DEFAULT_PERMISSIONS } from "../../types";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { SettingsPageShell } from "../common/SettingsPageShell";
import { StatusPill } from "../common/StatusPill";
import { Lock, DeviceMobile } from "@phosphor-icons/react";
import { SettingsModal } from "../SettingsModal";
import { MobileVisibilitySection } from "../BrandingSettingsPage/BrandingSettingsPage";
// 2026-08-23 · #252 Phase 2 · 세션 만료 시간 · 관리자 편집 카드
import { SessionTimeoutSection } from "./SessionTimeoutSection";
import { useSettings } from "../../hooks/useSettings";
import type { Employee } from "../../types";
// 2026-08-12 · #99 · 사이드바 그룹 트리 구조 · 페이지 → 그룹 매핑 재사용
import { SIDE_NAV_GROUPS } from "../layout/sideNavGroups";
// 2026-08-21 · Framework Phase 4 · large-file 분리
import { PAGE_LABELS, LEVELS, GROUP_COLOR_CLS } from "./constants";
import { LevelSelect } from "./LevelSelect";
import { PositionsField } from "./PositionsField";
// 2026-08-22 · Framework Phase 4 · 4섹션 별도 컴포넌트 이관 (PageSettings·EmployeeLevel·Positions·Construction)
import { PositionsTab, ConstructionTab, PageSettingsTab, EmployeeLevelTab } from "./PermissionsPage.panels";

interface PermissionsPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onLogout: () => void;
  onNavigate?: (page: AppNavPage) => void;
  /** true 시 자체 AppNavHeader skip (BusinessManagePage 임베드용 · 2026-08-03) */
  embedded?: boolean;
}

export const PermissionsPage: React.FC<PermissionsPageProps> = ({ authSession, onBack, onLogout, onNavigate, embedded = false }) => {
  // 2026-08-21 · Framework Phase 3 · window.confirm → useConfirm
  const confirm = useConfirm();
  const [perms, setPerms] = useState<PagePermissions>(DEFAULT_PERMISSIONS);
  const [saving, setSaving] = useState<string | null>(null); // key being saved
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<"permissions" | "app-settings" | "positions" | "construction">("permissions");
  // 2026-08-16 · 권한 조정 탭 내부 · 서브 탭 (페이지별 설정 · 직원별 레벨 · 모바일 가시성)
  // 2026-08-20 · "mobile" 추가 · 회사·브랜드 → 메뉴 설정으로 이관 (페이지별 설정 옆 배치)
  const [permSubTab, setPermSubTab] = useState<"page" | "employee" | "mobile">("page");
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
  // 2026-08-13 · #100 · 페이지 권한 · 레벨 OR 직군 조건 · 팝오버 열림 상태
  const [openPositionPopover, setOpenPositionPopover] = useState<{ page: string; field: "read" | "write" } | null>(null);
  // 2026-08-16 · 사이드바 활성 토글 · 서버 KV
  const sidebarEnabled = useSidebarEnabled();
  const [sidebarSaving, setSidebarSaving] = useState(false);
  const toggleSidebarEnabled = useCallback(async () => {
    setSidebarSaving(true);
    try {
      await api.post("/api/settings", { key: "sidebar_enabled", value: !sidebarEnabled });
      invalidateSidebarEnabled();
      setSaveToast(!sidebarEnabled ? "사이드바 활성" : "사이드바 비활성 · 공통헤더로 전환");
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) { onLogout(); return; }
      setSaveToast(`저장 실패 · ${err?.response?.data?.error ?? err?.message ?? "네트워크 오류"}`);
    } finally {
      setSidebarSaving(false);
    }
  }, [sidebarEnabled, onLogout]);

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

  // 2026-08-12 · 저장 토스트 · 2026-08-16 · useToast 프레임워크 (message.includes("실패") 자동 tone)
  const { toast, show, clear, showError } = useToast(2500);
  const setSaveToast = React.useCallback((msg: string | null) => {
    if (!msg) { clear(); return; }
    const isErr = msg.includes("실패");
    show(msg, isErr ? 4000 : 2500, isErr ? "error" : "success");
  }, [show, clear]);
  const saveToast = toast?.message ?? null;
  const handleSaveAll = React.useCallback(async () => {
    const ok = await saveSettingsNow();
    setSaveToast(ok ? "저장되었습니다" : "저장 실패");
  }, [saveSettingsNow, setSaveToast]);

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
      showError(`❌ 직군 "${removing}" 삭제 불가\n사용중인 직원 ${using.length}명 · 다른 직군을 먼저 추가하세요.`);
      return;
    }
    const newPos = window.prompt(
      `⚠ "${removing}" 사용중 · 직원 ${using.length}명\n\n재매핑할 직군을 아래 중에서 입력하세요:\n${others.map(p => `  · ${p}`).join("\n")}\n\n입력한 직군으로 자동 이동 후 "${removing}" 을 삭제합니다.`,
      others[0],
    );
    const target = (newPos ?? "").trim();
    if (!target || !others.includes(target)) {
      if (newPos !== null) showError(`❌ 취소 · "${newPos}" 는 유효한 직군이 아닙니다.`);
      return;
    }
    try {
      for (const emp of using) {
        await updateEmployee(emp, { position: target });
      }
      setEmployees(prev => prev.map(e => (e.position === removing) ? { ...e, position: target } : e));
      updateSettings({ positions: others });
      setSaveToast(`직원 ${using.length}명 · "${removing}" → "${target}" 재매핑 후 삭제 완료`);
    } catch (err) {
      showError(`재매핑 실패 · 삭제 취소: ${(err as any)?.message ?? err}`);
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
      // 2026-08-21 · Framework Phase 3 · window.confirm → useConfirm
      const ok = await confirm({
        message: `직군 "${original}" → "${trimmed}"\n사용중인 직원 ${using.length}명 · 자동으로 함께 변경됩니다.\n진행할까요?`,
      });
      if (!ok) { setEditingPosIdx(null); return; }
      try {
        for (const emp of using) {
          await updateEmployee(emp, { position: trimmed });
        }
        setEmployees(prev => prev.map(e => (e.position === original) ? { ...e, position: trimmed } : e));
      } catch (err) {
        showError(`직원 재매핑 실패 · 변경 취소: ${(err as any)?.message ?? err}`);
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
    api.get<any>(`/api/schedules?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
      .then(r => {
        const list = Array.isArray(r.data?.employees) ? r.data.employees : Array.isArray(r.data) ? r.data : [];
        setEmployees(list);
      })
      .catch(() => setEmployees([]));
  }, []);
  const applyShiftHoursToAll = useCallback(async () => {
    // 스케쥴표에서 "지금 월 전체 적용" 이 필요 · 여기선 기본 안내만
    showError("근무시간 일괄 적용은 스케쥴 관리 페이지에서 진행하세요.");
  }, [showError]);

  const userLevel = authSession?.level ??
    (authSession?.role === "superadmin" || authSession?.role === "admin" ? 9
    : authSession?.role === "manager" ? 2
    : authSession?.role === "employee" ? 1 : 0);

  useEffect(() => {
    api.get<Partial<PagePermissions>>("/api/permissions")
      .then(r => setPerms({ ...DEFAULT_PERMISSIONS, ...(r.data ?? {}) }))
      .catch(() => setLoadError("권한 설정을 불러오지 못했습니다."));
  }, []);

  // 2026-08-16 · 401 (JWT 쿠키 만료) · 즉시 로그아웃 → 로그인 화면
  const handleAuthExpired = useCallback(() => {
    onLogout();
  }, [onLogout]);

  // 2026-08-13 · #100 · 직군 토글 (레벨 OR 직군 · 하나만 만족해도 접근 허용)
  // 2026-08-16 · 버그 · 저장 실패 시 조용히 revert · 사용자 관점 "적용 안됨" · withCredentials + 에러 토스트 + 401 자동 로그아웃
  // 2026-08-16 · #111 · storageKey (`{pageKey}:{subTab}` or `{pageKey}`) 로 저장
  //   · 기존 값 없으면 · 부모 페이지 값 상속 후 override 시작 (독립 저장)
  const togglePositionForPerm = useCallback(async (
    storageKey: string,
    pageKey: string,
    field: "read" | "write",
    position: string,
  ) => {
    const posField: "readPositions" | "writePositions" = field === "read" ? "readPositions" : "writePositions";
    const basePerm = perms[storageKey] ?? perms[pageKey] ?? DEFAULT_PERMISSIONS[pageKey as keyof PagePermissions] ?? { read: 1, write: 1 };
    const current = basePerm[posField] ?? [];
    const next = current.includes(position)
      ? current.filter(p => p !== position)
      : [...current, position];
    const updated = {
      ...perms,
      [storageKey]: { ...basePerm, [posField]: next.length > 0 ? next : undefined },
    };
    setPerms(updated);
    try {
      await api.post("/api/permissions", { permissions: updated, employeeId: authSession?.employeeId });
      invalidatePagePermissions();
    } catch (err: any) {
      setPerms(perms); // revert
      const status = err?.response?.status;
      if (status === 401) { handleAuthExpired(); return; }
      const msg = status === 403 ? "저장 실패 · 권한 부족 (lv 9 필요)"
                : `저장 실패 · ${err?.response?.data?.error ?? err?.message ?? "네트워크 오류"}`;
      setSaveToast(msg);
    }
  }, [perms, authSession?.employeeId, handleAuthExpired]);

  // 2026-08-16 · 페이지 숨김 토글 · storageKey 별 · 즉시 서버 저장 + 사이드바 무효화
  const toggleHiddenForPerm = useCallback(async (storageKey: string, pageKey: string) => {
    const basePerm = perms[storageKey] ?? perms[pageKey] ?? DEFAULT_PERMISSIONS[pageKey as keyof PagePermissions] ?? { read: 1, write: 1 };
    const currentHidden = basePerm.hidden === true;
    const updated = {
      ...perms,
      [storageKey]: { ...basePerm, hidden: !currentHidden },
    };
    setPerms(updated);
    try {
      await api.post("/api/permissions", { permissions: updated, employeeId: authSession?.employeeId });
      invalidatePagePermissions();
      setSaveToast(!currentHidden ? "숨김 처리됨 · 사이드바에서 제외" : "다시 노출됨");
    } catch (err: any) {
      setPerms(perms); // revert
      const status = err?.response?.status;
      if (status === 401) { handleAuthExpired(); return; }
      setSaveToast(`저장 실패 · ${err?.response?.data?.error ?? err?.message ?? "네트워크 오류"}`);
    }
  }, [perms, authSession?.employeeId, handleAuthExpired]);

  const handleChange = useCallback(async (
    storageKey: string,
    pageKey: string,
    field: "read" | "write",
    value: number,
  ) => {
    const basePerm = perms[storageKey] ?? perms[pageKey] ?? DEFAULT_PERMISSIONS[pageKey as keyof PagePermissions] ?? { read: 1, write: 1 };
    const updated = {
      ...perms,
      [storageKey]: { ...basePerm, [field]: value },
    };
    setPerms(updated);
    const saveKey = `${storageKey}.${field}`;
    setSaving(saveKey);
    setSavedKeys(s => { const n = new Set(s); n.delete(saveKey); return n; });
    try {
      await api.post("/api/permissions", { permissions: updated, employeeId: authSession?.employeeId });
      invalidatePagePermissions();
      setSavedKeys(s => new Set(s).add(saveKey));
    } catch (err: any) {
      // revert on error · 사용자에게 원인 표시 (401/403 등)
      setPerms(perms);
      const status = err?.response?.status;
      if (status === 401) { handleAuthExpired(); return; }
      const msg = status === 403 ? "저장 실패 · 권한 부족 (lv 9 필요)"
                : `저장 실패 · ${err?.response?.data?.error ?? err?.message ?? "네트워크 오류"}`;
      setSaveToast(msg);
    } finally {
      setSaving(null);
    }
  }, [perms, authSession?.employeeId, handleAuthExpired]);

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
      showError(`레벨 저장 실패: ${target.name}`);
    } finally {
      setEmpSavingId(null);
    }
  }, [employees, showError]);

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

  // 2026-08-16 · #111 · 사이드바 구조 그대로 반영 · 각 SIDE_NAV item 별 행 · subTab 복합키
  const groupedPages = useMemo(() => {
    type Row = {
      storageKey: string;   // perms 저장 키 (`{pageKey}:{subTab}` or `{pageKey}`)
      pageKey: string;      // 부모 페이지 (fallback 용)
      subTab?: string;
      label: string;
      desc?: string;
    };
    type Group = {
      id: string;
      label: string;
      icon: any;
      color: string;
      rows: Row[];
    };
    const groups: Group[] = [];
    for (const g of SIDE_NAV_GROUPS) {
      // hideInTopTabs 는 헤더 노출용 · 여기선 무시 (모든 item 포함)
      const rows: Row[] = g.items.map((it) => {
        const storageKey = it.subTab ? `${it.key}:${it.subTab}` : it.key;
        const meta = PAGE_LABELS.find(p => p.key === it.key);
        return {
          storageKey,
          pageKey: it.key,
          subTab: it.subTab,
          // subTab 있으면 그 라벨 · 없으면 페이지 라벨 (또는 사이드바 라벨 fallback)
          label: it.label,
          desc: meta?.desc,
        };
      });
      if (rows.length === 0) continue;
      groups.push({
        id: g.id,
        label: g.label,
        icon: g.icon ?? g.items[0]?.icon,
        color: g.color,
        rows,
      });
    }
    return groups;
  }, []);

  // subTab 있으면 복합키 조회 · 없으면 부모 pageKey · 둘 다 없으면 DEFAULT_PERMISSIONS[pageKey] · 최종 fallback 은 { read:1, write:1 }
  const getPerm = useCallback((storageKey: string, pageKey: string) => {
    return (
      perms[storageKey] ??
      perms[pageKey] ??
      DEFAULT_PERMISSIONS[pageKey as keyof PagePermissions] ??
      { read: 1, write: 1 }
    );
  }, [perms]);

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
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={40} className="text-rose-400 mx-auto mb-3" />
          <p className="text-zinc-600 font-semibold">최고관리자(레벨 9)만 접근할 수 있습니다.</p>
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
      title="메뉴 설정"
      description="페이지별 최소 권한 · 직원별 레벨 · 근무 유형·직군·공사중 등 앱 전체 설정을 관리합니다. 관리자(lv 9) 전용."
      titleClassName="text-base font-bold text-zinc-800 leading-tight"
      descriptionClassName="text-[11px] text-zinc-500 mt-0.5 leading-relaxed"
      maxWidth="max-w-4xl"
    >
      {renderPermissionsBody()}
    </SettingsPageShell>
  );

  function renderPermissionsBody() {
    return <>
        {/* 탭 · 2026-08-16 · 가시성 개선 · 컨테이너 진한 배경 + 활성 강한 그림자·색상·언더라인 */}
        <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex flex-wrap bg-zinc-200/70 border border-zinc-300 rounded-xl p-1 gap-0.5 w-fit shadow-inner">
          <button type="button" onClick={() => setTab("permissions")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[18px] font-bold transition-all cursor-pointer border ${tab === "permissions" ? "bg-white text-violet-700 shadow-md border-violet-300 ring-2 ring-violet-100" : "bg-transparent text-zinc-600 border-transparent hover:bg-white/60 hover:text-zinc-900"}`}>
            <Shield size={18} />권한 조정
          </button>
          <button type="button" onClick={() => setTab("app-settings")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[18px] font-bold transition-colors cursor-pointer border ${tab === "app-settings" ? "bg-brand-deep text-white border-brand-deep shadow-sm" : "bg-transparent text-ink-soft border-transparent hover:bg-white/60 hover:text-ink"}`}>
            <SettingsIcon size={18} />스케쥴 설정
          </button>
          <button type="button" onClick={() => setTab("positions")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[18px] font-bold transition-all cursor-pointer border ${tab === "positions" ? "bg-white text-emerald-700 shadow-md border-emerald-300 ring-2 ring-emerald-100" : "bg-transparent text-zinc-600 border-transparent hover:bg-white/60 hover:text-zinc-900"}`}>
            <IdCard size={18} />직군 설정
          </button>
          <button type="button" onClick={() => setTab("construction")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[18px] font-bold transition-all cursor-pointer border ${tab === "construction" ? "bg-white text-amber-700 shadow-md border-amber-300 ring-2 ring-amber-100" : "bg-transparent text-zinc-600 border-transparent hover:bg-white/60 hover:text-zinc-900"}`}>
            <Construction size={18} />공사중
          </button>
          </div>
          {/* 저장 버튼 · 스케줄/직군/공사중 탭 · saveNow 즉시 flush + 토스트 (권한은 이미 개별 저장) */}
          {tab !== "permissions" && (
            <div className="flex items-center gap-2">
              {saveToast && (
                <StatusPill tone={saveToast.includes("실패") ? "rose" : "emerald"} size="sm" dot>
                  {saveToast}
                </StatusPill>
              )}
              <button
                type="button"
                onClick={handleSaveAll}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] shadow-sm transition cursor-pointer"
              >
                <Save size={14} /> 저장
              </button>
            </div>
          )}
        </div>

        {tab === "permissions" && (<>
        {/* 2026-08-16 · 사이드바 사용 토글 · 서버 KV · env 사용 X */}
        <div className="mb-3 px-4 py-3 rounded-xl border border-brand/15 bg-brand-tint/60 flex items-center gap-3">
          <input
            type="checkbox"
            id="sidebar-enabled-toggle"
            checked={sidebarEnabled}
            onChange={toggleSidebarEnabled}
            disabled={sidebarSaving}
            className="w-5 h-5 accent-[#1E5C8E] cursor-pointer"
          />
          <label htmlFor="sidebar-enabled-toggle" className="flex-1 cursor-pointer">
            <div className="text-[14px] font-bold text-zinc-800">사이드바 사용</div>
            <div className="text-[11px] font-semibold text-zinc-500">
              활성 시 · PC 화면에 사이드바 표시 (모바일은 항상 공통헤더 유지) · 비활성 시 · 기존 PC 공통헤더로 전환 · 서버 저장 · 즉시 반영
            </div>
          </label>
          {sidebarSaving && <Spinner size={16} tone="brand" />}
        </div>
        {loadError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-sm flex items-center gap-2">
            <AlertCircle size={14} /> {loadError}
          </div>
        )}

        {/* 2026-08-17 · 서브 탭 · 딥네이비 통일 · 세련 · Attio carved segmented */}
        <div className="mb-3 flex bg-zinc-100 border border-line rounded-xl p-1 gap-0.5 w-fit">
          <button
            type="button"
            onClick={() => setPermSubTab("page")}
            className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-[14px] font-semibold transition-colors cursor-pointer ${
              permSubTab === "page" ? "bg-brand-deep text-white shadow-sm" : "text-ink hover:text-brand-deep hover:bg-white"
            }`}
          >
            <Shield size={15} /> 페이지별 설정
          </button>
          <button
            type="button"
            onClick={() => setPermSubTab("employee")}
            className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-[14px] font-semibold transition-colors cursor-pointer ${
              permSubTab === "employee" ? "bg-brand-deep text-white shadow-sm" : "text-ink hover:text-brand-deep hover:bg-white"
            }`}
          >
            <Users size={15} /> 직원별 레벨
          </button>
          <button
            type="button"
            onClick={() => setPermSubTab("mobile")}
            className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-[14px] font-semibold transition-colors cursor-pointer ${
              permSubTab === "mobile" ? "bg-brand-deep text-white shadow-sm" : "text-ink hover:text-brand-deep hover:bg-white"
            }`}
          >
            <DeviceMobile size={15} /> 모바일 가시성
          </button>
        </div>


        {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 · PageSettingsTab · EmployeeLevelTab */}
        {permSubTab === "page" && (
          <PageSettingsTab
            groupedPages={groupedPages}
            perms={perms}
            getPerm={getPerm}
            saving={saving}
            savedKeys={savedKeys}
            saveToast={saveToast}
            handleChange={handleChange}
            toggleHiddenForPerm={toggleHiddenForPerm}
            togglePositionForPerm={togglePositionForPerm}
            openPositionPopover={openPositionPopover}
            setOpenPositionPopover={setOpenPositionPopover}
            collapsedGroups={collapsedGroups}
            toggleGroup={toggleGroup}
            presetPositions={PRESET_POSITIONS}
            onSaveAll={async () => {
              try {
                await api.post("/api/permissions", { permissions: perms, employeeId: authSession?.employeeId });
                setSaveToast("저장되었습니다");
              } catch (err: any) {
                const status = err?.response?.status;
                const msg = status === 401 ? "저장 실패 · 로그인 만료"
                          : status === 403 ? "저장 실패 · 권한 부족 (lv 9 필요)"
                          : `저장 실패 · ${err?.response?.data?.error ?? err?.message ?? "네트워크 오류"}`;
                setSaveToast(msg);
              }
            }}
          />
        )}

        {permSubTab === "employee" && (
          <EmployeeLevelTab
            employees={employees}
            filteredEmployees={filteredEmployees}
            empSearch={empSearch}
            setEmpSearch={setEmpSearch}
            empSavingId={empSavingId}
            empSavedIds={empSavedIds}
            handleEmployeeLevelChange={handleEmployeeLevelChange}
          />
        )}

        {permSubTab === "mobile" && (
          <MobileVisibilitySection />
        )}
        </>)}

        {tab === "app-settings" && (
          <div className="w-full min-w-0 overflow-hidden flex flex-col gap-4">
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
            {/* 2026-08-23 · #252 Phase 2 · 세션 만료 시간 · 관리자 편집 카드 */}
            <SessionTimeoutSection />
          </div>
        )}

        {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 · PositionsTab · ConstructionTab */}
        {tab === "positions" && (
          <PositionsTab
            presetPositions={PRESET_POSITIONS}
            posDragIdx={posDragIdx}
            posDragOverIdx={posDragOverIdx}
            setPosDragIdx={setPosDragIdx}
            setPosDragOverIdx={setPosDragOverIdx}
            editingPosIdx={editingPosIdx}
            editingPosValue={editingPosValue}
            setEditingPosIdx={setEditingPosIdx}
            setEditingPosValue={setEditingPosValue}
            commitEditPosition={commitEditPosition}
            removePositionAt={removePositionAt}
            reorderPosition={reorderPosition}
            newPositionInput={newPositionInput}
            setNewPositionInput={setNewPositionInput}
            addNewPosition={addNewPosition}
          />
        )}

        {tab === "construction" && (
          <ConstructionTab
            underConstruction={settingsUnderConstruction === true}
            onChange={(v) => updateSettings({ underConstruction: v })}
          />
        )}
    </>;
  }
};

// 2026-08-21 · LevelSelect · PositionsField 는 별도 파일로 분리 (./LevelSelect · ./PositionsField)
