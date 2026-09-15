// Login.tsx
// 2026-09-15 · Phase 2 · 첫 실행 · 로그인 화면 · Email + Password

import React, { useState } from "react";

export const Login: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 입력해주세요");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await window.api.login(email.trim(), password);
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
            <p className="text-[13px] text-zinc-500">서버 관리자 계정 로그인</p>
          </div>
        </div>

        <label className="block mb-4">
          <span className="text-[14px] font-semibold text-zinc-700 mb-1 block">이메일</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="w-full px-4 py-3 border border-zinc-300 rounded-lg text-[15px] focus:border-brand-deep focus:ring-2 focus:ring-brand-tint outline-none transition"
            placeholder="admin@megatown.co.kr"
            disabled={submitting}
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
          토큰 · Windows 자격 증명 관리자 · 안전하게 저장
        </p>
      </form>
    </div>
  );
};

export default Login;
