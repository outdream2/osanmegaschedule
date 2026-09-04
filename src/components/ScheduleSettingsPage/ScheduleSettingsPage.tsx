// 2026-09-04 · 스케줄 설정 페이지 (관리자 lv≥9 전용)
//   · 기본 연차일수 직군별 설정 (약사/기타)
import React, { useState, useEffect } from "react";
import type { AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";
import { SettingsPageShell } from "../common/SettingsPageShell";
import { SectionCard } from "../common/SectionCard";
import { CalendarBlank, Lock, FloppyDisk } from "@phosphor-icons/react";
import { useSettings, DEFAULT_ANNUAL_LEAVE } from "../../hooks/useSettings";
import { useToast, toastClass } from "../../hooks/useToast";

interface Props {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

const ScheduleSettingsPage: React.FC<Props> = ({ onBack, authSession, onNavigate, onLogout }) => {
  const level = authSession?.level ?? 0;
  const { defaultAnnualLeave, update, saveNow } = useSettings();
  const { showSuccess, showError, toast } = useToast();

  const [pharmacist, setPharmacist] = useState(defaultAnnualLeave.pharmacist);
  const [defaultDays, setDefaultDays] = useState(defaultAnnualLeave.default);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPharmacist(defaultAnnualLeave.pharmacist);
    setDefaultDays(defaultAnnualLeave.default);
  }, [defaultAnnualLeave.pharmacist, defaultAnnualLeave.default]);

  const handleSave = async () => {
    const pharmVal = Math.max(0, Math.min(365, Number(pharmacist) || 0));
    const defVal = Math.max(0, Math.min(365, Number(defaultDays) || 0));
    setSaving(true);
    update({ defaultAnnualLeave: { pharmacist: pharmVal, default: defVal } });
    const ok = await saveNow();
    setSaving(false);
    if (ok) showSuccess("기본 연차일수가 저장됐습니다.");
    else showError("저장 실패 · 다시 시도해주세요.");
  };

  const commonShellProps = {
    activePage: "schedule-settings" as AppNavPage,
    authSession, onBack, onNavigate, onLogout,
    icon: CalendarBlank,
    iconColor: "text-brand-deep",
    title: "스케줄 설정",
    description: "직원 스케줄 관련 전역 설정 · 기본 연차일수 직군별 지정. 관리자(lv 9) 전용.",
  };

  if (level < 9) {
    return (
      <div data-scope="schedule-settings">
        <SettingsPageShell {...commonShellProps}>
          <SectionCard title="접근 권한 필요" icon={<Lock size={18} />} tone="danger" description="이 페이지는 관리자(lv 9) 전용입니다.">
            <div className="text-[16px] text-zinc-500 text-center py-4">관리자 계정으로 로그인 후 · 다시 시도해주세요.</div>
          </SectionCard>
        </SettingsPageShell>
      </div>
    );
  }

  return (
    <div data-scope="schedule-settings">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
      <SettingsPageShell {...commonShellProps}>
        <SectionCard
          title="기본 연차일수"
          icon={<CalendarBlank size={18} />}
          description="신규 직원 등록 시 annual_leave_days 기본값 · 각 직원별로 개별 수정 가능."
        >
          <div className="space-y-5 py-1">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[17px] font-semibold text-ink">약사</p>
                <p className="text-[14px] text-ink-soft mt-0.5">position = 약사 인 직원</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={pharmacist}
                  onChange={(e) => setPharmacist(Math.max(0, Math.min(365, Number(e.target.value))))}
                  className="w-20 border border-zinc-300 rounded-lg px-3 py-1.5 text-[17px] text-center focus:outline-none focus:border-brand-deep"
                />
                <span className="text-[16px] text-ink-soft">일</span>
              </div>
            </div>
            <div className="border-t border-zinc-100" />
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[17px] font-semibold text-ink">기타 직군 (매장 · 창고)</p>
                <p className="text-[14px] text-ink-soft mt-0.5">캐셔 · 물류 · 대표 · 임원 등 약사 외 전원</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={defaultDays}
                  onChange={(e) => setDefaultDays(Math.max(0, Math.min(365, Number(e.target.value))))}
                  className="w-20 border border-zinc-300 rounded-lg px-3 py-1.5 text-[17px] text-center focus:outline-none focus:border-brand-deep"
                />
                <span className="text-[16px] text-ink-soft">일</span>
              </div>
            </div>
            <div className="border-t border-zinc-100 pt-3">
              <p className="text-[14px] text-ink-soft mb-3">
                * 기본값: 약사 {DEFAULT_ANNUAL_LEAVE.pharmacist}일 · 기타 {DEFAULT_ANNUAL_LEAVE.default}일<br />
                * 신규 직원 등록 시 직군에 따라 자동 적용됩니다.
              </p>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-deep text-white rounded-lg text-[16px] font-semibold hover:bg-brand-darker disabled:opacity-60 transition-colors"
              >
                <FloppyDisk size={16} />
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </SectionCard>
      </SettingsPageShell>
    </div>
  );
};

export default ScheduleSettingsPage;
