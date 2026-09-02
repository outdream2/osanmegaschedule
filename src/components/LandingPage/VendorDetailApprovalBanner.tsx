// 2026-08-26 · Framework Phase 4 · large-file 분리
// VendorDetailModal.tsx 승인 상태 배너 (panel 모드 전용)
//   approvalStatus 에 따라 4종 상태 렌더

import React from "react";
import type { ApprovalStatus } from "./VendorDetailModal.types";

interface Props {
  approvalStatus: ApprovalStatus | undefined;
  missingCount: number;
}

export const VendorDetailApprovalBanner: React.FC<Props> = ({ approvalStatus, missingCount }) => {
  const approved = approvalStatus === "approved";
  const pending  = approvalStatus === "pending";
  const rejected = approvalStatus === "rejected";

  const borderBg = approved
    ? "border-emerald-300 bg-gradient-to-br from-emerald-50/60 to-white"
    : pending
    ? "border-amber-300   bg-gradient-to-br from-amber-50/60 to-white"
    : rejected
    ? "border-rose-300    bg-gradient-to-br from-rose-50/60 to-white"
    : "border-brand-deep/20 bg-gradient-to-br from-brand-tint/40 to-sky-50/40";

  const iconBg = approved ? "bg-emerald-600"
    : pending  ? "bg-amber-600"
    : rejected ? "bg-rose-600"
    : "bg-brand-deep";

  const iconChar = approved ? "✓" : pending ? "⏳" : rejected ? "✗" : "i";

  return (
    <div className={`mb-4 rounded-xl border-2 px-4 py-3 flex items-start gap-3 ${borderBg}`}>
      <span className={`w-8 h-8 rounded-lg text-white flex items-center justify-center shrink-0 font-bold text-[16px] ${iconBg}`}>
        {iconChar}
      </span>
      <div className="flex-1 min-w-0">
        {approved ? (
          <>
            <div className="text-[17px] font-bold text-emerald-700 leading-tight">승인 완료 · 공급사 재고확인 사용 가능</div>
            <div className="text-[15px] text-ink-soft mt-1">랜딩 페이지 · [공급사 재고확인] 메뉴 활성화됨</div>
          </>
        ) : pending ? (
          <>
            <div className="text-[17px] font-bold text-amber-700 leading-tight">관리자 승인 대기 중</div>
            <div className="text-[15px] text-ink-soft mt-1">관리자 승인 완료 시 · [공급사 재고확인] 메뉴가 활성화됩니다</div>
          </>
        ) : rejected ? (
          <>
            <div className="text-[17px] font-bold text-rose-700 leading-tight">승인 거절됨 · 관리자에게 문의 후 재요청 가능</div>
            <div className="text-[15px] text-ink-soft mt-1">필수 항목을 다시 확인하고 [승인 요청]을 눌러주세요</div>
          </>
        ) : (
          <>
            {/* 2026-09-02 · 사용자 지시 · default 블록 · 안내 텍스트 제거 · '공급사 정보' 헤더로만 */}
            <div className="text-[19px] font-bold text-brand-deep leading-tight">공급사 정보</div>
          </>
        )}
      </div>
    </div>
  );
};
