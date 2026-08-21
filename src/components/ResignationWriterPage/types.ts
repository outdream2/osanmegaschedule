// src/components/ResignationWriterPage/types.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · ResignationWriterPage 타입 이관

export interface ResignationForm {
  // 근로자
  employeeId: number | null;
  employeeName: string;
  employeeNo: string;         // 사번 (있으면)
  birthDate: string;          // YYYY-MM-DD (생년월일 · 2026-08-05 추가)
  department: string;         // 부서
  position: string;           // 직급/직위
  hireDate: string;           // YYYY-MM-DD (입사일)

  // 사직 정보
  lastWorkDate: string;       // YYYY-MM-DD (마지막 근무일 = 사직 희망일)
  submitDate: string;         // YYYY-MM-DD (사직서 제출일 · 2026-08-05 추가)
  recipient: string;          // 수신 (예: "코스트팜(Costpharm) 대표") · 2026-08-05 추가

  // 사유
  reason: string;             // 표준 사유 (드롭다운 · 자유 입력 가능)
  reasonDetail: string;       // 상세 사유 (textarea)
  handoverNotes: string;      // 인수인계 사항 (textarea)

  // 금품 지급기일 동의 (2026-08-05 추가)
  payoutDate: string;         // YYYY-MM-DD (임금·퇴직금 지급일)

  // 회사
  employerName: string;       // 대표자
  companyName: string;        // 회사명
}

// 서명 slot 종류
export type SignSlot = "employee" | "payout" | "other";
