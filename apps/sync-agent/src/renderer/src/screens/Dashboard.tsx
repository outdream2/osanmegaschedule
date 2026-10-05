// Dashboard.tsx
// 2026-10-05 · 탭 복원 (사용자 지시)
//   · default: both (ERP Sync + Query 세로 stacked)
//   · 사용자 선택: sync only · query only · both

import React, { useState } from "react";
import { ErpSection } from "./ErpSection";
import { ErpSyncSection } from "./ErpSyncSection";
import { SectionBoundary } from "../components/SectionBoundary";

type View = "sync" | "query" | "both";

export const Dashboard: React.FC = () => {
  const [view, setView] = useState<View>("both");
  return (
    <div className="flex flex-col gap-2 w-full max-w-[1800px] mx-auto">
      <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg p-1 w-fit">
        {([
          { key: "sync", label: "⚡ ERP → Supabase 동기화" },
          { key: "query", label: "🔎 Iregen ERP 데이터 조회 및 로컬저장" },
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
        <div className="flex flex-col gap-2">
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
