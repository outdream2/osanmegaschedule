import React, { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { Shield, Check, Loader2, AlertCircle, Settings as SettingsIcon, Users } from "lucide-react";
import type { AuthSession, PagePermissions } from "../../types";
import { DEFAULT_PERMISSIONS } from "../../types";
import { AppNavHeader, type AppNavPage } from "../AppNavHeader";
import { SettingsModal } from "../SettingsModal";
import { useSettings } from "../../hooks/useSettings";
import type { Employee } from "../../types";

interface PermissionsPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onLogout: () => void;
  onNavigate?: (page: AppNavPage) => void;
  /** true 시 자체 AppNavHeader skip (BusinessManagePage 임베드용 · 2026-08-03) */
  embedded?: boolean;
}

const PAGE_LABELS: { key: keyof PagePermissions; label: string; desc: string }[] = [
  { key: "schedule",    label: "스케줄 관리",    desc: "직원 월간 근무 스케줄" },
  { key: "display",     label: "매장진열 관리",   desc: "진열대 점검 및 보충 요청" },
  { key: "scan",        label: "상품 스캔",       desc: "바코드 스캔으로 요청" },
  { key: "requests",    label: "요청목록 조회",   desc: "진열·발주 요청 확인" },
  { key: "leave",       label: "연차 신청/승인",  desc: "휴가·연차 신청 및 승인" },
  { key: "ocr",         label: "거래명세서 OCR",  desc: "PDF 거래명세서 자동 추출" },
  { key: "upload",      label: "상품 목록 관리",  desc: "xlsx 파일 업로드" },
  { key: "reservation", label: "방문예약",        desc: "상담 및 방문 일정 예약" },
  { key: "lunch",       label: "점심 불참",       desc: "오늘의 점심 불참 신청" },
  { key: "stockcheck",  label: "재고 점검",       desc: "매장 내 의약품 재고 점검" },
  // 약사 전용 · 열람은 약사(≥3) · 쓰기(자료 업로드)는 관리자(≥8)
  { key: "pharmacist",  label: "약사 전용",       desc: "교육자료 · 복약지도 · 문서 · 관리자 업로드" },
];

const LEVELS = [0,1,2,3,4,5,6,7,8,9];

export const PermissionsPage: React.FC<PermissionsPageProps> = ({ authSession, onBack, onLogout, onNavigate, embedded = false }) => {
  const [perms, setPerms] = useState<PagePermissions>(DEFAULT_PERMISSIONS);
  const [saving, setSaving] = useState<string | null>(null); // key being saved
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<"permissions" | "app-settings">("permissions");
  // 직원별 레벨 조정 상태
  const [empSavingId, setEmpSavingId] = useState<number | null>(null);
  const [empSavedIds, setEmpSavedIds] = useState<Set<number>>(new Set());
  const [empSearch, setEmpSearch] = useState<string>("");

  // 환경설정(구 톱니바퀴 모달) 통합 — useSettings + employees 로드
  const {
    positions: PRESET_POSITIONS,
    employmentTypes: PRESET_EMPLOYMENT_TYPES,
    workplaces: settingsWorkplaces,
    scheduleTypes: settingsScheduleTypes,
    wageRates: settingsWageRates,
    employeeWageOverrides: settingsEmployeeWageOverrides,
    update: updateSettings,
  } = useSettings();
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
      // PUT /api/employees/:id 는 기존 값이 default 로 덮일 수 있는 필드가 있어
      // 대상 직원의 현재 값을 전부 실어 부분 업데이트 안전성 확보 (SchedulePage 관례 준수)
      await axios.put(`/api/employees/${empId}`, {
        name: target.name,
        position: target.position,
        rank: target.rank ?? null,
        employmentType: target.employmentType,
        hireDate: target.hireDate,
        retireDate: target.retireDate ?? null,
        description: target.description ?? "",
        workplace: target.workplace ?? "매장",
        gender: target.gender ?? null,
        phone: target.phone ?? null,
        annual_leave_days: target.annual_leave_days ?? null,
        level: newLevel,
        address: target.address ?? null,
      });
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

  return (
    <div className={embedded ? "flex-1 flex flex-col" : "min-h-screen bg-slate-50 flex flex-col"}>
      {!embedded && (
        <AppNavHeader
          activePage="permissions"
          authSession={authSession}
          onBack={onBack}
          onNavigate={onNavigate}
          onLogout={onLogout}
        />
      )}

      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <Shield size={14} className="text-white" />
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">설정</h1>
          </div>
          <p className="text-slate-400 text-sm pl-9">권한 · 근무 유형 · 시급 등 앱 전체 설정을 관리합니다.</p>
        </div>

        {/* 탭 */}
        <div className="mb-4 flex flex-wrap bg-slate-100 border border-slate-200 rounded-xl p-0.5 gap-0.5 w-fit">
          <button type="button" onClick={() => setTab("permissions")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-black transition cursor-pointer ${tab === "permissions" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            <Shield size={12} /> 권한 조정
          </button>
          <button type="button" onClick={() => setTab("app-settings")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-black transition cursor-pointer ${tab === "app-settings" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            <SettingsIcon size={12} /> 스케쥴 설정
          </button>
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

        {/* 섹션 1 · 페이지별 최소 권한 (컴팩트 · 1행 · desc 는 tooltip) */}
        <div className="mb-2 flex items-center gap-1.5">
          <Shield size={13} className="text-slate-500" />
          <h2 className="text-[13px] font-black text-slate-700">페이지별 최소 권한</h2>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_110px_110px] px-5 py-2 bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            <span>페이지</span>
            <span className="text-center">읽기 최소</span>
            <span className="text-center">쓰기 최소</span>
          </div>

          {PAGE_LABELS.map(({ key, label, desc }, i) => {
            const perm = perms[key];
            return (
              <div
                key={key}
                title={desc}
                className={`grid grid-cols-[1fr_110px_110px] px-5 py-2 items-center ${
                  i < PAGE_LABELS.length - 1 ? "border-b border-slate-100" : ""
                }`}
              >
                {/* Page name (1행 · desc 는 title tooltip) */}
                <div className="text-sm font-semibold text-slate-800 truncate">{label}</div>

                {/* Read level */}
                <div className="flex justify-center">
                  <LevelSelect
                    value={perm.read}
                    onChange={v => handleChange(key, "read", v)}
                    saving={saving === `${key}.read`}
                    saved={savedKeys.has(`${key}.read`)}
                  />
                </div>

                {/* Write level */}
                <div className="flex justify-center">
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
      </div>
    </div>
  );
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
      className="appearance-none bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 cursor-pointer disabled:opacity-60 pr-6"
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
