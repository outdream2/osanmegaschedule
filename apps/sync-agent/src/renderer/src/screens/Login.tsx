// Login.tsx
// 2026-09-15 · Phase 2 · 첫 실행 · 로그인 화면
// 2026-09-15 · fix · 웹앱과 동일 · 핸드폰번호 + 비밀번호 (email 아님)

import React, { useState } from "react";

// 핸드폰번호 자동 포맷 · 01012345678 → 010-1234-5678
function formatPhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export const Login: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    if (!cleanPhone || !password) {
      setError("핸드폰번호와 비밀번호를 입력해주세요");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await window.api.login(cleanPhone, password);
      if (result.ok) {
        onSuccess();
      } else {
        setError(result.error ?? "로그인 실패");
      }
    } catch (err: any) {
      setError(err?.message ?? "로그인 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-tint to-white flex items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-zinc-200 p-8"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-brand-deep flex items-center justify-center text-white text-2xl">
            📥
          </div>
          <div>
            <h1 className="text-[20px] font-bold tracking-tight">메가타운 자동임포트</h1>
            <p className="text-[13px] text-zinc-500">관리자 로그인 (lv9)</p>
          </div>
        </div>

        <label className="block mb-4">
          <span className="text-[14px] font-semibold text-zinc-700 mb-1 block">핸드폰번호</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            required
            autoFocus
            className="w-full px-4 py-3 border border-zinc-300 rounded-lg text-[15px] focus:border-brand-deep focus:ring-2 focus:ring-brand-tint outline-none transition tabular-nums"
            placeholder="010-1234-5678"
            disabled={submitting}
            inputMode="numeric"
          />
        </label>

        <label className="block mb-4">
          <span className="text-[14px] font-semibold text-zinc-700 mb-1 block">비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 border border-zinc-300 rounded-lg text-[15px] focus:border-brand-deep focus:ring-2 focus:ring-brand-tint outline-none transition"
            disabled={submitting}
          />
        </label>

        {error && (
          <div className="text-[13px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-brand-deep text-white font-bold rounded-lg hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {submitting ? "로그인 중..." : "로그인"}
        </button>

        <p className="text-[12px] text-zinc-400 text-center mt-6">
          웹앱과 동일 · 관리자 (lv9) 계정 · 세션 · 안전하게 저장
        </p>
      </form>
    </div>
  );
};

export default Login;
