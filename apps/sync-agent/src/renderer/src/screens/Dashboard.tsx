// Dashboard.tsx
// 2026-10-04 · ERP 자동 동기화 중심 · 탭 전환 (사용자 지시 · 다시 탭 복원)

import React, { useState } from "react";
import { ErpSection } from "./ErpSection";
import { ErpSyncSection } from "./ErpSyncSection";
import { SectionBoundary } from "../components/SectionBoundary";

type View = "sync" | "query" | "both";

export const Dashboard: React.FC = () => {
  const [view, setView] = useState<View>("sync");
  return (
    <div className="flex flex-col gap-4 w-full max-w-[1800px] mx-auto">
      <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg p-1 w-fit">
        {([
          { key: "sync", label: "⚡ ERP → Supabase 동기화" },
          { key: "query", label: "🔎 Iregen ERP 직접 조회" },
          { key: "both", label: "⬌ 모두 보기" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`px-3 py-1.5 rounded text-[13px] font-semibold transition ${
              view === t.key ? "bg-brand-deep text-white" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "both" ? (
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
          <SectionBoundary name="ERP Sync">
            <ErpSyncSection />
          </SectionBoundary>
          <SectionBoundary name="Iregen ERP 조회">
            <ErpSection />
          </SectionBoundary>
        </div>
      ) : view === "sync" ? (
        <SectionBoundary name="ERP Sync">
          <ErpSyncSection />
        </SectionBoundary>
      ) : (
        <SectionBoundary name="Iregen ERP 조회">
          <ErpSection />
        </SectionBoundary>
      )}
    </div>
  );
};

export default Dashboard;
