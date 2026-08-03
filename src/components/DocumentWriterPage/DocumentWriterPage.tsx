// src/components/DocumentWriterPage/DocumentWriterPage.tsx
// 2026-08-03 · 서류작성 wrapper · 근로계약서·사직서 2탭
// 경영관리 서브탭 (5번째)
import React, { Suspense, useState } from "react";
import { NotePencil, SignOut } from "@phosphor-icons/react";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../AppNavHeader";

const ContractWriterPage = React.lazy(() => import("../ContractWriterPage/ContractWriterPage"));
const ResignationWriterPage = React.lazy(() => import("../ResignationWriterPage/ResignationWriterPage"));

interface DocumentWriterPageProps {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  embedded?: boolean;
}

type DocTab = "contract" | "resignation";

const TABS: { key: DocTab; label: string; icon: typeof NotePencil; color: string }[] = [
  { key: "contract",    label: "근로계약서 작성", icon: NotePencil, color: "emerald" },
  { key: "resignation", label: "사직서 작성",     icon: SignOut,    color: "rose"    },
];

const DocumentWriterPage: React.FC<DocumentWriterPageProps> = (props) => {
  const [tab, setTab] = useState<DocTab>("contract");

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── 내부 2탭 바 ── */}
      <div className="bg-white border-b border-slate-200 shrink-0">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-5 flex items-stretch gap-0">
          {TABS.map(t => {
            const active = tab === t.key;
            const Icon = t.icon;
            const color = t.color;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`
                  relative flex items-center gap-1.5 px-4 py-2.5
                  text-[13px] font-bold leading-none whitespace-nowrap
                  transition-colors cursor-pointer
                  ${active ? `text-${color}-700` : `text-slate-500 hover:text-${color}-700`}
                `}
              >
                <Icon size={15} weight="fill" className={active ? `text-${color}-600` : "text-slate-400"} />
                <span>{t.label}</span>
                {active && (
                  <span className={`absolute left-0 right-0 -bottom-px h-[2px] bg-${color}-500 rounded-t-sm`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 내부 탭 컨텐츠 ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {tab === "contract" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-bold py-16">근로계약서 로딩 중...</div>}>
            <ContractWriterPage {...props} />
          </Suspense>
        )}
        {tab === "resignation" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-bold py-16">사직서 로딩 중...</div>}>
            <ResignationWriterPage {...props} />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default DocumentWriterPage;
