// Logs.tsx
// 2026-09-15 · #253 Phase B · 로그 화면 · 최근 실행 이력 · Phase 2 에서 완성

import React from "react";

export const Logs: React.FC = () => {
  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <section className="bg-white rounded-xl border border-zinc-200 p-6">
        <h2 className="text-[17px] font-bold mb-4">📋 최근 실행 로그</h2>
        <div className="text-[13px] text-zinc-500">로그 없음 · 임포트 시작되면 여기 표시</div>
      </section>

      <div className="text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
        Phase 2 개발 예정 · 로컬 sqlite 로그 · 최근 100건 표시 · CSV 내보내기
      </div>
    </div>
  );
};

export default Logs;
