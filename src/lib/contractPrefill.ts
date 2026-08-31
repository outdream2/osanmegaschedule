// src/lib/contractPrefill.ts
// #14 · 2026-08-31 · contract-writer-prefill localStorage 대체
// StaffListRow → ContractWriterPage 간 데이터 전달 · 탭 전환 내 in-memory 단발성 저장소
// localStorage 대신 모듈 변수 사용 · 브라우저 탭 내부에서만 유효 · 사용자 임의 조작 불가

export interface ContractPrefill {
  employeeId?: number;
  employeeName?: string;
  employeePhone?: string;
  employeeAddress?: string;
  hireDate?: string;
  position?: string;
  employmentType?: string;
  annualLeaveDays?: number | null;
  gender?: string;
  rank?: string;
  workplace?: string;
  employeeEmail?: string;
}

let _prefill: ContractPrefill | null = null;

export const setContractPrefill = (data: ContractPrefill): void => { _prefill = data; };
export const consumeContractPrefill = (): ContractPrefill | null => {
  const v = _prefill;
  _prefill = null;
  return v;
};
