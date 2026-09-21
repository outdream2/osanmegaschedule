// apps/sync-agent/src/renderer/src/App.tsx
// 2026-09-15 · Phase 2 · 로그인 체크 → 3-탭 (대시보드 · 설정 · 로그)
// 2026-09-21 · E-004 · window.api 부재 시 하얀 화면 방지 · guard + 사용자 안내

import React, { useEffect, useState, useCallback } from "react";
import { Login } from "./screens/Login";
import { Dashboard } from "./screens/Dashboard";
import { Settings } from "./screens/Settings";
import { Logs } from "./screens/Logs";

type Tab = "dashboard" | "settings" | "logs";

export const App: React.FC = () => {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [appInfo, setAppInfo] = useState<{ version: string; name: string } | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null); // null = 로딩 중
  const [bootError, setBootError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      // 2026-09-21 · window.api 없으면 preload 실패 · 사용자에게 안내
      if (!window.api || typeof window.api.isLoggedIn !== "function") {
        setBootError("preload 브릿지 초기화 실패 · window.api 없음 · 앱 재설치 필요");
        setLoggedIn(false);
        return;
      }
      const ok = await window.api.isLoggedIn();
      setLoggedIn(ok);
    } catch (err: any) {
      console.error("[App] isLoggedIn 실패:", err);
      setBootError(`인증 확인 실패: ${err?.message ?? String(err)}`);
      setLoggedIn(false);
    }
  }, []);

  useEffect(() => {
    if (window.api?.getAppInfo) {
      window.api.getAppInfo().then(setAppInfo).catch(() => {});
    }
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!window.api?.onNavigate) return;
    const unsub = window.api.onNavigate((page) => {
      if (page === "settings" || page === "logs" || page === "dashboard") setTab(page);
    });
    return unsub;
  }, []);

  const handleLogout = async () => {
    if (!window.api?.logout) return;
    await window.api.logout();
    setLoggedIn(false);
  };

  if (bootError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-rose-200 p-6">
          <div className="text-[16px] font-bold text-rose-700 mb-2">⚠ 초기화 오류</div>
          <div className="text-[13px] text-zinc-600 whitespace-pre-wrap">{bootError}</div>
          <button
            onClick={() => location.reload()}
            className="mt-4 px-4 py-2 bg-brand-deep text-white rounded-lg text-[13px] font-semibold"
          >
            새로고침
          </button>
        </div>
      </div>
    );
  }

  if (loggedIn === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-zinc-500">로딩 중...</div>
      </div>
    );
  }

  if (!loggedIn) {
    return <Login onSuccess={() => setLoggedIn(true)} />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-ink">
      <header className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-500 to-brand-deep flex items-center justify-center text-white font-bold text-lg">
          📥
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[19px] font-bold tracking-tight">{appInfo?.name ?? "메가타운 자동임포트"}</h1>
          <p className="text-[13px] text-zinc-500">v{appInfo?.version ?? "-"} · Windows · 자동 임포트</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-[13px] text-zinc-500 hover:text-rose-600 px-3 py-1.5 rounded border border-zinc-200 hover:border-rose-300 transition"
          title="로그아웃"
        >
          로그아웃
        </button>
      </header>

      <nav className="bg-white border-b border-zinc-200 px-6 flex gap-1">
        {(["dashboard", "settings", "logs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-[15px] font-semibold border-b-2 transition ${
              tab === t
                ? "border-brand-deep text-brand-deep"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t === "dashboard" ? "대시보드" : t === "settings" ? "설정" : "로그"}
          </button>
        ))}
      </nav>

      <main className="p-6 pb-20">
        {tab === "dashboard" && <Dashboard />}
        {tab === "settings" && <Settings />}
        {tab === "logs" && <Logs />}
      </main>

      {/* 하단 · Copyright */}
      <footer className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-zinc-200 py-2.5 px-6 flex items-center justify-center gap-2 text-[12px]">
        <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-sky-500 to-brand-deep" />
        <span className="font-bold text-brand-deep tracking-tight">IRUMs</span>
        <span className="text-zinc-300">·</span>
        <span className="text-zinc-500 font-medium">(주)이룸즈</span>
        <span className="text-zinc-300">·</span>
        <span className="text-zinc-400 tabular-nums">© {new Date().getFullYear()}</span>
        <span className="text-zinc-300">·</span>
        <span className="text-zinc-400">All rights reserved</span>
      </footer>
    </div>
  );
};

export default App;
