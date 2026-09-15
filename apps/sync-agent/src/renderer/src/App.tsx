// apps/sync-agent/src/renderer/src/App.tsx
// 2026-09-15 · Phase 2 · 로그인 체크 → 3-탭 (대시보드 · 설정 · 로그)

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

  const checkAuth = useCallback(async () => {
    const ok = await window.api.isLoggedIn();
    setLoggedIn(ok);
  }, []);

  useEffect(() => {
    window.api.getAppInfo().then(setAppInfo);
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const unsub = window.api.onNavigate((page) => {
      if (page === "settings" || page === "logs" || page === "dashboard") setTab(page);
    });
    return unsub;
  }, []);

  const handleLogout = async () => {
    await window.api.logout();
    setLoggedIn(false);
  };

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

      <main className="p-6">
        {tab === "dashboard" && <Dashboard />}
        {tab === "settings" && <Settings />}
        {tab === "logs" && <Logs />}
      </main>
    </div>
  );
};

export default App;
