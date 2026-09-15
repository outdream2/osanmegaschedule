// Login.tsx
// 2026-09-15 · Phase 2 · 로그인 · 핸드폰번호 + 비밀번호
// 2026-09-15 · 사용자 요청 · 아이디 저장 · 다음 실행 시 자동 채움

import React, { useState, useEffect } from "react";

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
  const [savePhone, setSavePhone] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // 저장된 아이디 · 첫 마운트 · 자동 채움
  useEffect(() => {
    (async () => {
      try {
        const saved = await window.api.getSavedPhone();
        if (saved.savedPhone) setPhone(formatPhone(saved.savedPhone));
        setSavePhone(saved.savePhone);
      } catch (err) {
        console.warn("[Login] 저장된 아이디 로드 실패:", err);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

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
      const result = await window.api.login(cleanPhone, password, savePhone);
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

  if (!loaded) {
    return <div className="min-h-screen flex items-center justify-center text-zinc-500">로딩 중...</div>;
  }

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
            autoFocus={!phone}
            className="w-full px-4 py-3 border border-zinc-300 rounded-lg text-[15px] focus:border-brand-deep focus:ring-2 focus:ring-brand-tint outline-none transition tabular-nums"
            placeholder="010-1234-5678"
            disabled={submitting}
            inputMode="numeric"
          />
        </label>

        <label className="block mb-3">
          <span className="text-[14px] font-semibold text-zinc-700 mb-1 block">비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus={!!phone}
            className="w-full px-4 py-3 border border-zinc-300 rounded-lg text-[15px] focus:border-brand-deep focus:ring-2 focus:ring-brand-tint outline-none transition"
            disabled={submitting}
          />
        </label>

        <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={savePhone}
            onChange={(e) => setSavePhone(e.target.checked)}
            className="w-4 h-4 accent-brand-deep cursor-pointer"
            disabled={submitting}
          />
          <span className="text-[13px] text-zinc-600">아이디 저장 · 다음 실행 시 자동 채움</span>
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
