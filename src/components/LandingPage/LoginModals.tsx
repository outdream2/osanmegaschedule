// src/components/LandingPage/LoginModals.tsx
// 2026-08-22 · Framework Phase 4 · LandingPage 에서 분리
// 거래처 로그인 모달 + 직원(auth) 로그인 모달
// 2026-08-23 · #191 Modal v3.4 재마이그레이션 · headerBgClass·headerTextClass 활용
import React, { useState, useRef, useEffect } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { Lock, X, AlertCircle, Eye, EyeOff } from "lucide-react";
import { User, CalendarCheck } from "@phosphor-icons/react";
import { Spinner } from "../common/Spinner";
import logo2Img from "../../images/logo2.png";
import type { AuthSession, AuthRole } from "../../types";
import { Button } from "../common/Button";
import { Modal } from "../common/Modal";

interface LoginModalsProps {
  // 거래처 로그인 모달
  vendorLoginOpen: boolean;
  onVendorLoginClose: () => void;
  // 직원 로그인 모달
  pendingPage: "schedule" | "display" | "scan" | "requests" | "ocr" | "upload" | "leave" | null;
  onPendingPageClose: () => void;
  // 콜백
  onAuthOnly?: (auth: AuthSession) => void;
  // 브랜드
  lpBrand: { region?: string; shortName?: string };
}

export const LoginModals: React.FC<LoginModalsProps> = ({
  vendorLoginOpen,
  onVendorLoginClose,
  pendingPage,
  onPendingPageClose,
  onAuthOnly,
  lpBrand,
}) => {
  // ── 직원 로그인 state ───────────────────────────────────────────────
  const [empNumber, setEmpNumber] = useState(() => localStorage.getItem("megatown_remembered_phone") ?? "");
  const [empPassword, setEmpPassword] = useState("");
  const [empError, setEmpError] = useState<string | null>(null);
  const [empLoading, setEmpLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const empNumberRef = useRef<HTMLInputElement>(null);

  // ── 거래처 로그인 state ─────────────────────────────────────────────
  const [vendorPhone, setVendorPhone] = useState("");
  const [vendorPassword, setVendorPassword] = useState("");
  const [vendorError, setVendorError] = useState<string | null>(null);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [showVendorPassword, setShowVendorPassword] = useState(false);
  const vendorPhoneRef = useRef<HTMLInputElement>(null);

  // ── 직원 모달 open 시 reset ────────────────────────────────────────
  useEffect(() => {
    if (pendingPage) {
      setEmpNumber(localStorage.getItem("megatown_remembered_phone") ?? "");
      setEmpPassword("");
      setEmpError(null);
      setEmpLoading(false);
      setShowPassword(false);
      setTimeout(() => empNumberRef.current?.focus(), 50);
    }
  }, [pendingPage]);

  // ── 거래처 모달 open 시 reset ──────────────────────────────────────
  useEffect(() => {
    if (vendorLoginOpen) {
      setVendorPhone("");
      setVendorPassword("");
      setVendorError(null);
      setVendorLoading(false);
      setShowVendorPassword(false);
      setTimeout(() => vendorPhoneRef.current?.focus(), 50);
    }
  }, [vendorLoginOpen]);

  const handleVendorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = vendorPhone.trim().replace(/[^0-9]/g, "");
    if (!phone || !vendorPassword) {
      setVendorError("핸드폰번호와 비밀번호를 모두 입력해 주세요.");
      return;
    }
    setVendorLoading(true);
    setVendorError(null);
    try {
      const { data } = await api.post<{ id?: number; name?: string; contactName?: string; role?: string; level?: number }>(
        "/api/auth/vendor-login",
        { phone, password: vendorPassword },
      );
      const { id, name, contactName, level } = data ?? {};
      if (!id) { setVendorError("로그인에 실패했습니다."); setVendorLoading(false); return; }
      onVendorLoginClose();
      setVendorPassword("");
      const auth: AuthSession = { role: "vendor", employeeId: id, employeeName: name ?? "", employeeRank: contactName || undefined, level: level ?? 0 };
      onAuthOnly?.(auth);
    } catch (err: unknown) {
      const isApi = err instanceof ApiError;
      const status = isApi ? err.status : 0;
      setVendorError(status === 401 || status === 400 ? (isApi ? err.message : "핸드폰번호 또는 비밀번호가 올바르지 않습니다") : "로그인 중 오류가 발생했습니다.");
      setVendorPassword("");
    } finally {
      setVendorLoading(false);
    }
  };

  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = empNumber.trim().replace(/[^0-9]/g, "");
    if (!phone || !empPassword) {
      setEmpError("핸드폰번호와 비밀번호를 모두 입력해 주세요.");
      return;
    }
    setEmpLoading(true);
    setEmpError(null);
    try {
      const { data } = await api.post<{ id?: number; name?: string; role?: string; level?: number; rank?: string | null }>(
        "/api/auth/login",
        { employee_id: phone, password: empPassword, rememberMe: rememberMe || undefined },
      );
      const { id, name, role, level, rank } = data ?? {};
      if (!id) {
        setEmpError("핸드폰번호 또는 비밀번호가 올바르지 않습니다");
        setEmpLoading(false);
        return;
      }
      onPendingPageClose();
      setEmpPassword("");
      if (rememberMe) {
        localStorage.setItem("megatown_remembered_phone", phone);
      } else {
        localStorage.removeItem("megatown_remembered_phone");
        setEmpNumber("");
      }
      const validRoles = ["superadmin", "admin", "manager", "employee", "vendor"] as const;
      const authRole: AuthRole = (validRoles as readonly string[]).includes(role) ? (role as AuthRole) : "employee";
      const auth: AuthSession = { role: authRole, employeeId: id, employeeName: name, level: level ?? 1, employeeRank: rank ?? undefined, rememberMe: rememberMe || undefined };
      onAuthOnly?.(auth);
    } catch (err: unknown) {
      const isApi = err instanceof ApiError;
      const status = isApi ? err.status : 0;
      if (status === 401 || status === 400) {
        setEmpError(isApi ? err.message : "핸드폰번호 또는 비밀번호가 올바르지 않습니다");
      } else {
        setEmpError("로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }
      setEmpPassword("");
    } finally {
      setEmpLoading(false);
    }
  };

  const inputCls = (hasError: boolean) =>
    `w-full rounded-2xl pl-10 pr-12 py-3.5 text-zinc-900 font-semibold placeholder:font-normal placeholder:text-zinc-300 focus:outline-none transition-all duration-150 ${hasError
      ? "border-2 border-rose-400 bg-rose-50 focus:ring-2 focus:ring-brand-tint"
      : "border-2 border-line bg-zinc-50 focus:border-brand-deep focus:bg-white focus:ring-2 focus:ring-brand-tint"
    }`;

  // ── 헤더 gradient (딥네이비 · 원본과 동일) ──────────────────────────────
  const HEADER_GRADIENT = "bg-[linear-gradient(120deg,#0A2E4A_0%,#1E5C8E_62%,#3E7CB1_100%)]";

  // ── 거래처 모달 헤더 JSX ──────────────────────────────────────────────
  const vendorModalHeader = (
    // -mx-5 -my-3 : modal-header 의 px-5 py-3 을 상쇄하여 full-bleed 헤더 구현
    <div className="relative -mx-5 -my-3 px-7 pt-8 pb-6 overflow-hidden flex items-center gap-4">
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #93B4D0, transparent)" }} />
      <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #C4DAEE, transparent)" }} />
      <button onClick={onVendorLoginClose} aria-label="닫기" className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition cursor-pointer">
        <X size={14} />
      </button>
      <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shrink-0" style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.35)" }}>
        <CalendarCheck size={28} className="text-white" weight="fill" />
      </div>
      <div className="relative">
        <div className="text-white/70 text-[10px] font-semibold tracking-widest uppercase mb-0.5">Vendor Portal</div>
        <div className="text-white font-bold text-2xl leading-tight tracking-tight">거래처 로그인</div>
        <div className="text-emerald-100 text-[11px] font-medium tracking-wide mt-0.5">방문예약 이용</div>
      </div>
    </div>
  );

  // ── 직원 모달 헤더 JSX ────────────────────────────────────────────────
  const empModalHeader = (
    <div className="relative -mx-5 -my-3 px-7 pt-8 pb-6 overflow-hidden flex items-center gap-4">
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #a5b4fc, transparent)" }} />
      <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #c7d2fe, transparent)" }} />
      <div className="absolute top-4 left-1/2 w-64 h-64 rounded-full opacity-[0.07]" style={{ transform: "translateX(-50%)", background: "radial-gradient(circle, #e0e7ff, transparent)" }} />
      <button onClick={onPendingPageClose} aria-label="닫기" className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-indigo-200 hover:text-white transition cursor-pointer">
        <X size={14} />
      </button>
      <img
        src={logo2Img}
        alt={`${lpBrand.region ? lpBrand.region + " " : ""}${lpBrand.shortName} 로고`}
        className="relative w-14 h-14 object-cover rounded-2xl ring-1 ring-white/30 shadow-lg shrink-0 bg-white"
      />
      <div className="relative min-w-0">
        <div className="text-white font-bold text-2xl leading-tight tracking-tight truncate">
          {(lpBrand.region ? lpBrand.region + " " : "오산 ") + (lpBrand.shortName || "메가타운약국")}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* ── 거래처 로그인 모달 ── */}
      <Modal
        open={vendorLoginOpen}
        onClose={onVendorLoginClose}
        title={vendorModalHeader}
        size="sm"
        showClose={false}
        headerBgClass={HEADER_GRADIENT}
        headerTextClass="text-white"
        bodyPadding="none"
      >
        <div className="px-7 pt-5 pb-7">
          <form onSubmit={handleVendorSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-600 text-xs font-semibold pl-1">핸드폰번호</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none"><User size={14} className="text-zinc-400" weight="fill" /></div>
                <input
                  ref={vendorPhoneRef}
                  type="tel" inputMode="numeric"
                  value={vendorPhone}
                  onChange={(e) => { setVendorPhone(e.target.value); setVendorError(null); }}
                  placeholder="01012345678"
                  style={{ fontSize: "16px" }}
                  className={inputCls(!!vendorError).replace("pr-12", "pr-4")}
                  autoComplete="username" disabled={vendorLoading}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-600 text-xs font-semibold pl-1">비밀번호</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none"><Lock size={14} className="text-zinc-400" /></div>
                <input
                  type={showVendorPassword ? "text" : "password"}
                  value={vendorPassword}
                  onChange={(e) => { setVendorPassword(e.target.value); setVendorError(null); }}
                  placeholder="비밀번호 입력"
                  style={{ fontSize: "16px" }}
                  className={inputCls(!!vendorError)}
                  autoComplete="current-password" disabled={vendorLoading}
                />
                <button type="button" onClick={() => setShowVendorPassword((v) => !v)} className="absolute inset-y-0 right-4 flex items-center text-zinc-400 hover:text-zinc-600 transition cursor-pointer">
                  {showVendorPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            {vendorError && (
              <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200">
                <AlertCircle size={13} className="text-rose-500 mt-0.5 shrink-0" />
                <p className="text-rose-600 text-xs font-semibold leading-relaxed">{vendorError}</p>
              </div>
            )}
            <button
              type="submit" disabled={vendorLoading}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-sm mt-1 transition-all duration-150 cursor-pointer active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-emerald-200"
            >
              {vendorLoading ? <><Spinner size={16} tone="white" /><span>로그인 중...</span></> : <span>거래처로 입장하기</span>}
            </button>
            <p className="text-[11px] text-zinc-400 text-center leading-relaxed">비밀번호 분실 시 관리자에게 문의하세요</p>
          </form>
        </div>
      </Modal>

      {/* ── 직원 Auth 모달 ── */}
      <Modal
        open={!!pendingPage}
        onClose={onPendingPageClose}
        title={empModalHeader}
        size="sm"
        showClose={false}
        headerBgClass={HEADER_GRADIENT}
        headerTextClass="text-white"
        bodyPadding="none"
      >
        <div className="px-7 pt-5 pb-7">
          <form onSubmit={handleEmployeeSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-600 text-xs font-semibold pl-1">핸드폰번호</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <User size={14} className="text-zinc-400" weight="fill" />
                </div>
                <input
                  ref={empNumberRef}
                  type="tel" inputMode="numeric"
                  value={empNumber}
                  onChange={(e) => { setEmpNumber(e.target.value); setEmpError(null); }}
                  placeholder="01012345678"
                  style={{ fontSize: "16px" }}
                  className={inputCls(!!empError).replace("pr-12", "pr-4")}
                  autoComplete="username" disabled={empLoading}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-600 text-xs font-semibold pl-1">비밀번호</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Lock size={14} className="text-zinc-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={empPassword}
                  onChange={(e) => { setEmpPassword(e.target.value); setEmpError(null); }}
                  placeholder="비밀번호 입력"
                  style={{ fontSize: "16px" }}
                  className={inputCls(!!empError)}
                  autoComplete="current-password" disabled={empLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-4 flex items-center text-zinc-400 hover:text-zinc-600 transition cursor-pointer"
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-2 border-zinc-300 text-indigo-600 accent-indigo-600 cursor-pointer"
              />
              <span className="text-xs text-zinc-500 group-hover:text-zinc-700 transition">자동 로그인</span>
            </label>
            {empError && (
              <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200">
                <AlertCircle size={13} className="text-rose-500 mt-0.5 shrink-0" />
                <p className="text-rose-600 text-xs font-semibold leading-relaxed">{empError}</p>
              </div>
            )}
            <Button type="submit" variant="primary" size="lg" fullWidth loading={empLoading} className="mt-1">
              {empLoading ? "로그인 중..." : "직원으로 입장하기"}
            </Button>
            <p className="text-[11px] text-zinc-400 text-center leading-relaxed">비밀번호 분실 시 관리자에게 문의하세요</p>
          </form>
        </div>
      </Modal>
    </>
  );
};
