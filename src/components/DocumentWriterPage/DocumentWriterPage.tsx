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
            // 색상 정적 클래스 (Tailwind JIT purge 안전 · 동적 문자열 회피)
            const activeText = t.key === "contract" ? "text-emerald-700" : "text-rose-700";
            const activeIcon = t.key === "contract" ? "text-emerald-600" : "text-rose-600";
            const activeBar  = t.key === "contract" ? "bg-emerald-500"   : "bg-rose-500";
            const hoverText  = t.key === "contract" ? "hover:text-emerald-700" : "hover:text-rose-700";
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`
                  relative flex items-center gap-2 px-5 sm:px-6 py-3.5 sm:py-4
                  text-[16px] sm:text-[18px] font-black leading-none whitespace-nowrap
                  transition-colors cursor-pointer
                  ${active ? activeText : `text-slate-500 ${hoverText}`}
                `}
              >
                <Icon size={19} weight="fill" className={active ? activeIcon : "text-slate-400"} />
                <span>{t.label}</span>
                {active && (
                  <span className={`absolute left-0 right-0 -bottom-px h-[2.5px] ${activeBar} rounded-t-sm`} />
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
