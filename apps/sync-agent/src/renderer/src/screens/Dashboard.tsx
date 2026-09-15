// Dashboard.tsx
// 2026-09-15 · #253 Phase B · 대시보드 · 파일별 마지막 실행 상태 · 다음 예정
//   · Phase 2 에서 · 실제 상태 IPC 연동

import React from "react";

interface FileTaskCard {
  key: "products" | "stock" | "purchase";
  label: string;
  color: string;
}

const FILE_TASKS: FileTaskCard[] = [
  { key: "products", label: "상품정보", color: "sky" },
  { key: "stock",    label: "재고정보", color: "emerald" },
  { key: "purchase", label: "매입정보", color: "amber" },
];

export const Dashboard: React.FC = () => {
  return (
    <div className="flex flex-col gap-6">
      {/* 상태 카드 · 3 파일 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {FILE_TASKS.map((t) => (
          <div key={t.key} className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2 h-2 rounded-full bg-${t.color}-500`} />
              <span className="text-[15px] font-bold">{t.label}</span>
            </div>
            <div className="text-[13px] text-zinc-500">마지막 실행 · 미실행</div>
            <div className="text-[13px] text-zinc-500 mt-1">다음 예정 · 설정 필요</div>
          </div>
        ))}
      </div>

      {/* 안내 · Phase 2 개발 대기 */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-[14px] text-amber-800">
        <div className="font-bold mb-2">🚧 개발 진행 중</div>
        <ul className="list-disc list-inside space-y-1">
          <li>Phase 1 · Electron 셋업 · 트레이 · 자동 시작 · UI 스켈레톤 (진행 중)</li>
          <li>Phase 2 · 로그인 · 폴더 지정 · 스케줄 · xlsx 업로드 (다음)</li>
          <li>Phase 3 · 로컬 큐 · 재시도 · 자동 업데이트 배포 (마지막)</li>
        </ul>
      </div>
    </div>
  );
};

export default Dashboard;
