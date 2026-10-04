// Dashboard.tsx
// 2026-10-04 · Phase 2 · ERP 자동 동기화 중심으로 재구성
//   · 이전 Excel xlsx 3-카드 (상품/재고/매입 "지금 실행") 제거 (사용자 지시 · 쓸거 아니면 제거)
//   · 백엔드 (importer / scheduler / watcher / queue) 는 Settings 에서 폴더 설정 지원용으로 보존
//   · 메인 UI = Iregen ERP 조회 (3탭 검증) + ERP → Supabase 동기화 (Phase 2 Gateway)

import React from "react";
import { ErpSection } from "./ErpSection";
import { ErpSyncSection } from "./ErpSyncSection";
import { SectionBoundary } from "../components/SectionBoundary";

export const Dashboard: React.FC = () => {
  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      {/* 2026-10-04 · ERP → Supabase 동기화 (Phase 2 · DRY-RUN 전용) */}
      <SectionBoundary name="ERP Sync">
        <ErpSyncSection />
      </SectionBoundary>

      {/* 2026-10-03 · Iregen ERP 직접 조회 (3탭 · 사업장 상품관리 · 재고 현황 · 매입 현황)
          · SectionBoundary 로 격리 · 이 섹션 crash 가 Dashboard 전체를 죽이지 않음 */}
      <SectionBoundary name="Iregen ERP 조회">
        <ErpSection />
      </SectionBoundary>
    </div>
  );
};

export default Dashboard;
