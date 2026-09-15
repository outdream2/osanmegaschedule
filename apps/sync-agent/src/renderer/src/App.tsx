// apps/sync-agent/src/renderer/src/App.tsx
// 2026-09-15 · #253 Phase B · Electron 앱 · 메인 UI · 3 탭
//   · 대시보드 · 폴더/스케줄 설정 · 로그
//   · 웹앱 React 프리미티브 재사용 예정 (Card·Button·Modal 등)

import React, { useEffect, useState } from "react";
import { Dashboard } from "./screens/Dashboard";
import { Settings } from "./screens/Settings";
import { Logs } from "./screens/Logs";

type Tab = "dashboard" | "settings" | "logs";

export const App: React.FC = () => {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [appInfo, setAppInfo] = useState<{ version: string; name: string } | null>(null);

  useEffect(() => {
    window.api.getAppInfo().then(setAppInfo);
  }, []);

  useEffect(() => {
    // main process · 트레이 메뉴 클릭 시 · 자동 탭 전환
    const unsub = window.api.onNavigate((page) => {
      if (page === "settings" || page === "logs" || page === "dashboard") setTab(page);
    });
    return unsub;
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 text-ink">
      {/* 상단 헤더 */}
      <header className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-500 to-brand-deep flex items-center justify-center text-white font-bold text-lg">
          📥
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[19px] font-bold tracking-tight">{appInfo?.name ?? "메가타운 자동임포트"}</h1>
          <p className="text-[13px] text-zinc-500">v{appInfo?.version ?? "-"} · Windows · 자동 임포트</p>
        </div>
      </header>

      {/* 탭 네비 */}
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

      {/* 콘텐츠 */}
      <main className="p-6">
        {tab === "dashboard" && <Dashboard />}
        {tab === "settings" && <Settings />}
        {tab === "logs" && <Logs />}
      </main>
    </div>
  );
};

export default App;
