// Settings.tsx
// 2026-09-15 · #253 Phase B · 설정 화면 · 폴더/스케줄/로그인 · Phase 2 에서 완성

import React from "react";

export const Settings: React.FC = () => {
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <section className="bg-white rounded-xl border border-zinc-200 p-6">
        <h2 className="text-[17px] font-bold mb-4">🔐 서버 로그인</h2>
        <p className="text-[14px] text-zinc-500 mb-4">
          Supabase 관리자 계정 · Email + Password
        </p>
        <div className="text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Phase 2 개발 예정 · 로그인 form · Windows Credential Manager 저장
        </div>
      </section>

      <section className="bg-white rounded-xl border border-zinc-200 p-6">
        <h2 className="text-[17px] font-bold mb-4">📂 폴더 지정 · 3 파일</h2>
        <p className="text-[14px] text-zinc-500 mb-4">
          각 파일 종류별 · 로컬 폴더 (xlsx 저장 위치)
        </p>
        <div className="text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Phase 2 개발 예정 · 폴더 선택 dialog · 4개 (상품·재고·매입)
        </div>
      </section>

      <section className="bg-white rounded-xl border border-zinc-200 p-6">
        <h2 className="text-[17px] font-bold mb-4">⏰ 스케줄 · 파일별 개별</h2>
        <p className="text-[14px] text-zinc-500 mb-4">
          실행 간격 or 특정 시각 · 파일별 자유 조정
        </p>
        <div className="text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Phase 2 개발 예정 · cron 편집 · 프리셋 (매 10분·1시간·매일 08:00 등)
        </div>
      </section>
    </div>
  );
};

export default Settings;
