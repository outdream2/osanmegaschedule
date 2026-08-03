// src/components/ResignationWriterPage/ResignationWriterPage.tsx
// 2026-08-03 · 사직서 작성 (스텁) · 리서치 에이전트로 정식 양식 조사 예정
// 위치 · 경영관리 → 서류작성 → 사직서 작성 탭
import React from "react";
import { SignOut, Warning } from "@phosphor-icons/react";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../AppNavHeader";

interface ResignationWriterPageProps {
  onBack?: () => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  embedded?: boolean;
}

const ResignationWriterPage: React.FC<ResignationWriterPageProps> = () => {
  return (
    <div className="flex-1 flex items-center justify-center py-16 px-4">
      <div className="max-w-md w-full bg-white border border-rose-100 rounded-2xl shadow-sm p-6 flex flex-col items-center gap-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center">
          <SignOut size={28} weight="fill" />
        </div>
        <div>
          <h2 className="text-base font-black text-slate-800 mb-1">사직서 작성</h2>
          <p className="text-[12px] text-slate-500 leading-snug">
            표준 사직서 양식으로 작성 · 관리자에게 제출 · 승인 관리
          </p>
        </div>
        <div className="w-full bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2 text-left">
          <Warning size={13} weight="fill" className="text-amber-500 shrink-0 mt-0.5" />
          <div className="text-[11px] text-amber-800 font-semibold leading-snug">
            준비 중 · 표준 양식·필수 항목 조사 후 · 폼·서명·제출·승인 흐름 구현 예정
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResignationWriterPage;
