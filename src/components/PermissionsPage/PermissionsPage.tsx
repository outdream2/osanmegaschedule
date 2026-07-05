import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { Shield, Check, Loader2, AlertCircle } from "lucide-react";
import type { AuthSession, PagePermissions } from "../../types";
import { DEFAULT_PERMISSIONS } from "../../types";
import { AppNavHeader, type AppNavPage } from "../AppNavHeader";

interface PermissionsPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onLogout: () => void;
  onNavigate?: (page: AppNavPage) => void;
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
];

const LEVELS = [0,1,2,3,4,5,6,7,8,9];

export const PermissionsPage: React.FC<PermissionsPageProps> = ({ authSession, onBack, onLogout, onNavigate }) => {
  const [perms, setPerms] = useState<PagePermissions>(DEFAULT_PERMISSIONS);
  const [saving, setSaving] = useState<string | null>(null); // key being saved
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);

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
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppNavHeader
        activePage="permissions"
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <Shield size={14} className="text-white" />
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">권한 조정</h1>
          </div>
          <p className="text-slate-400 text-sm pl-9">페이지별 최소 접근 레벨을 설정합니다. 변경 즉시 자동 저장됩니다.</p>
        </div>

        {loadError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-sm flex items-center gap-2">
            <AlertCircle size={14} /> {loadError}
          </div>
        )}

        {/* Level legend */}
        <div className="mb-5 px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-100 text-[11px] text-indigo-600 font-medium">
          <span className="font-bold">레벨 기준:</span>&nbsp; 1 = 직원 &nbsp;·&nbsp; 2–8 = 관리자 등급 &nbsp;·&nbsp; 9 = 최고관리자
        </div>

        {/* Permissions table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_110px_110px] px-5 py-3 bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            <span>페이지</span>
            <span className="text-center">읽기 최소</span>
            <span className="text-center">쓰기 최소</span>
          </div>

          {PAGE_LABELS.map(({ key, label, desc }, i) => {
            const perm = perms[key];
            return (
              <div
                key={key}
                className={`grid grid-cols-[1fr_110px_110px] px-5 py-3.5 items-center ${
                  i < PAGE_LABELS.length - 1 ? "border-b border-slate-100" : ""
                }`}
              >
                {/* Page name */}
                <div>
                  <div className="text-sm font-semibold text-slate-800">{label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{desc}</div>
                </div>

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

        <p className="text-center text-[11px] text-slate-400 mt-4">
          레벨 9(최고관리자)는 항상 모든 페이지에 접근할 수 있습니다.
        </p>
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
