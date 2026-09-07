// src/components/OrderSettingsPage/OrderSettingsPage.tsx
// 2026-09-07 · 사용자 지시 · 발주 설정 페이지 · SettingsPageShell 재사용
//   · SMTP 이메일 발송 설정 (host · port · user · pass · from)
//   · 테스트 발송 버튼
//   · 기타 발주 관련 설정 확장 지점

import React, { useEffect, useMemo, useState } from "react";
import { Truck, EnvelopeSimple, PaperPlaneTilt, ShieldCheck, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { SettingsPageShell } from "../common/SettingsPageShell";
import { AppNavPage } from "../layout/AppNavHeader";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { useToast, toastClass } from "../../hooks/useToast";
import { api, ApiError } from "../../lib/apiClient";
import type { AuthSession } from "../../types";

interface SmtpConfig {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
  /** 서버가 자동 판단 · 저장 완료 후 반영 */
  configured?: boolean;
}

const EMPTY: SmtpConfig = {
  smtp_host: "",
  smtp_port: "587",
  smtp_user: "",
  smtp_pass: "",
  smtp_from: "",
};

interface Props {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

export const OrderSettingsPage: React.FC<Props> = ({ authSession, onBack, onNavigate, onLogout }) => {
  const { toast, showSuccess, showError } = useToast();
  const [form, setForm] = useState<SmtpConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [dirty, setDirty] = useState(false);
  const [initialConfigured, setInitialConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get<SmtpConfig>("/api/settings/order-email");
        setForm({
          smtp_host: String(data?.smtp_host ?? ""),
          smtp_port: String(data?.smtp_port ?? "587"),
          smtp_user: String(data?.smtp_user ?? ""),
          smtp_pass: String(data?.smtp_pass ?? ""),
          smtp_from: String(data?.smtp_from ?? ""),
        });
        setInitialConfigured(!!data?.configured);
        setDirty(false);
      } catch (e: any) {
        console.warn("[OrderSettingsPage] load:", e?.message);
      } finally { setLoading(false); }
    })();
  }, []);

  const set = <K extends keyof SmtpConfig>(k: K, v: SmtpConfig[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
    setDirty(true);
  };

  const canSave = useMemo(() =>
    !!form.smtp_host && !!form.smtp_from && !saving && dirty
  , [form, saving, dirty]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post("/api/settings/order-email", {
        smtp_host: form.smtp_host.trim(),
        smtp_port: form.smtp_port.trim() || "587",
        smtp_user: form.smtp_user.trim(),
        smtp_pass: form.smtp_pass,
        smtp_from: form.smtp_from.trim(),
      });
      showSuccess("SMTP 설정 저장 완료 · 서버 재시작 후 적용");
      setDirty(false);
      setInitialConfigured(!!form.smtp_host);
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : (e?.message ?? "저장 실패");
      showError(`저장 실패 · ${msg}`);
    } finally { setSaving(false); }
  };

  const handleTest = async () => {
    if (!testEmail.trim()) {
      showError("테스트 수신 이메일을 입력하세요");
      return;
    }
    setTesting(true);
    try {
      const { data } = await api.post<{ ok: boolean; message?: string }>("/api/settings/order-email/test", {
        to: testEmail.trim(),
      });
      if (data?.ok) showSuccess(`테스트 이메일 발송 완료 → ${testEmail}`);
      else showError(`테스트 실패 · ${data?.message ?? "unknown"}`);
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : (e?.message ?? "테스트 실패");
      showError(`테스트 실패 · ${msg}`);
    } finally { setTesting(false); }
  };

  return (
    <SettingsPageShell
      activePage={"order-settings" as AppNavPage}
      authSession={authSession}
      onBack={onBack}
      onNavigate={onNavigate}
      onLogout={onLogout}
      icon={Truck}
      title="발주 설정"
      description="발주 이메일 SMTP 설정 · 테스트 발송 · 향후 발주 규칙·템플릿 확장"
      rightSlot={
        saving ? <StatusPill tone="brand" size="sm" dot pulse>저장 중</StatusPill>
        : dirty ? <StatusPill tone="amber" size="sm" dot>변경사항 있음</StatusPill>
        : initialConfigured === true ? <StatusPill tone="emerald" size="sm" dot>SMTP 설정됨</StatusPill>
        : initialConfigured === false ? <StatusPill tone="zinc" size="sm" dot>SMTP 미설정</StatusPill>
        : null
      }
    >
      {/* ── 1. SMTP 이메일 설정 ─────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white border border-line rounded-2xl shadow-[0_1px_2px_rgba(10,46,74,0.04),0_4px_12px_-4px_rgba(10,46,74,0.06)]">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-brand-deep via-brand to-[#3E7CB1]" />
        <header className="px-5 pt-5 pb-3 flex items-center gap-3 border-b border-line">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-deep to-brand shadow-sm flex items-center justify-center shrink-0">
            <EnvelopeSimple size={18} weight="fill" className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-ink tracking-tight">발주 이메일 (SMTP)</h2>
            <p className="text-[13px] text-ink-soft mt-0.5">발주서를 공급사에 이메일로 발송하기 위한 SMTP 서버 설정. 저장 후 서버 재시작 필요.</p>
          </div>
        </header>

        {loading ? (
          <div className="p-8 flex items-center justify-center"><Spinner size={16} tone="brand" label="설정 불러오는 중..." /></div>
        ) : (
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="SMTP 호스트" required hint="예: smtp.gmail.com · smtp.naver.com">
              <input
                type="text"
                value={form.smtp_host}
                onChange={(e) => set("smtp_host", e.target.value)}
                placeholder="smtp.gmail.com"
                className={inputCls}
              />
            </Field>
            <Field label="포트" hint="TLS: 587 · SSL: 465">
              <input
                type="number"
                value={form.smtp_port}
                onChange={(e) => set("smtp_port", e.target.value)}
                placeholder="587"
                className={inputCls + " tabular-nums"}
              />
            </Field>
            <Field label="사용자 (이메일)" hint="SMTP 인증 사용자 · 보통 발신 이메일과 동일">
              <input
                type="text"
                value={form.smtp_user}
                onChange={(e) => set("smtp_user", e.target.value)}
                placeholder="pharmacy@gmail.com"
                autoComplete="off"
                className={inputCls}
              />
            </Field>
            <Field label="비밀번호" hint="Gmail 은 앱 비밀번호 (2단계 인증 필요)">
              <input
                type="password"
                value={form.smtp_pass}
                onChange={(e) => set("smtp_pass", e.target.value)}
                placeholder="••••••••••••••••"
                autoComplete="new-password"
                className={inputCls}
              />
            </Field>
            <Field label="발신 이메일 (FROM)" required hint="공급사에 표시되는 발신 주소" className="md:col-span-2">
              <input
                type="text"
                value={form.smtp_from}
                onChange={(e) => set("smtp_from", e.target.value)}
                placeholder="orders@pharmacy.com"
                className={inputCls}
              />
            </Field>
          </div>
        )}

        <div className="px-5 pb-5 pt-2 flex items-center gap-2 border-t border-line/60">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[14px] font-bold shadow-sm cursor-pointer transition-colors"
          >
            {saving ? <Spinner size={14} tone="brand" /> : <ShieldCheck size={14} weight="bold" />}
            저장
          </button>
          <div className="flex-1" />
          <div className="text-[13px] text-ink-soft">
            {initialConfigured === true
              ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle size={13} weight="fill" /> SMTP 준비 완료</span>
              : <span className="inline-flex items-center gap-1 text-amber-700"><WarningCircle size={13} weight="fill" /> SMTP 미설정 · 이메일 발주 불가</span>
            }
          </div>
        </div>
      </section>

      {/* ── 2. 테스트 발송 ──────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white border border-line rounded-2xl shadow-[0_1px_2px_rgba(10,46,74,0.04),0_4px_12px_-4px_rgba(10,46,74,0.06)]">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-500 to-teal-500" />
        <header className="px-5 pt-5 pb-3 flex items-center gap-3 border-b border-line">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm flex items-center justify-center shrink-0">
            <PaperPlaneTilt size={18} weight="fill" className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-ink tracking-tight">테스트 발송</h2>
            <p className="text-[13px] text-ink-soft mt-0.5">저장된 SMTP 설정으로 실제 이메일 발송을 검증. 수신 이메일을 입력하고 발송하세요.</p>
          </div>
        </header>
        <div className="p-5 flex flex-wrap items-end gap-3">
          <Field label="테스트 수신 이메일" className="flex-1 min-w-[220px]">
            <input
              type="text"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="test@example.com"
              className={inputCls}
            />
          </Field>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !testEmail.trim() || initialConfigured !== true}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[14px] font-bold shadow-sm cursor-pointer transition-colors"
          >
            {testing ? <Spinner size={14} tone="emerald" /> : <PaperPlaneTilt size={14} weight="bold" />}
            테스트 발송
          </button>
        </div>
      </section>

      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
    </SettingsPageShell>
  );
};

// ─── 재사용 컴포넌트 ─────────────────────────────────────────
const inputCls =
  "w-full h-10 px-3 rounded-lg border border-line bg-white text-[15px] font-medium text-ink placeholder:text-zinc-400 focus:outline-none focus:border-brand focus:ring-[3px] focus:ring-brand-tint hover:border-zinc-300 transition-colors";

const Field: React.FC<{
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, required, hint, className = "", children }) => (
  <label className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
    <span className="text-[14px] font-semibold text-ink tracking-tight inline-flex items-center gap-1">
      {label}
      {required && <span className="text-rose-500 font-bold">*</span>}
    </span>
    {children}
    {hint && <span className="text-[12px] text-ink-soft leading-snug">{hint}</span>}
  </label>
);

export default OrderSettingsPage;
