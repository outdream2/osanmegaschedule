// src/components/ContractWriterPage/types.ts
// 근로계약서 페이지 타입 정의

export interface WageComponentEntry {
  hours: number;    // 월평균 시간 (정수부)
  minutes: number;  // 분 (0~59)
  amount: number;   // 금액 (원)
}

export interface WageComponents {
  basicSalary: WageComponentEntry;         // 1. 기본급 (주휴수당 포함)
  fixedOvertime: WageComponentEntry;       // 2. (고정)연장근로수당 (1.5배)
  fixedHoliday: WageComponentEntry;        // 3. (고정)휴일근로수당 (1.5배)
  fixedHolidayOvertime: WageComponentEntry;// 4. (고정)휴일연장근로수당 (0.5배)
  fixedNight: WageComponentEntry;          // 5. (고정)야간근로수당 (0.5배)
  fixedAnnualLeave: WageComponentEntry;    // 6. (고정)연차휴가수당
  mealAllowance: number;                   // 7. 식대 (비과세)
  vehicleAllowance: number;                // 8. 차량유지비 (비과세)
}

export interface PrivacyConsent {
  recipientName: string;
  recipientAddress: string;
  agreedCollection: boolean;
  agreedCCTV: boolean;
}

export type DayKey = "월" | "화" | "수" | "목" | "금" | "토" | "일";

export interface ContractForm {
  // 근로자
  employeeId: number | null;
  employeeName: string;
  employeePhone: string;
  employeeAddress: string;
  employeeBirth: string;
  employeeBankAccount: string;
  bankName: string;
  bankAccountNumber: string;
  bankbookImageUrl: string;
  employeeEmail: string;
  employeeGender: string;
  employeeRank: string;
  employeeWorkplace: string;
  employeeNumber: string;

  // 계약 유형
  contractType: string;
  contractMonths: string;

  // 근무 요일
  workDays: Record<DayKey, boolean>;

  // 근무 시간
  startTime: string;
  endTime: string;
  breakMinutes: string;
  breakStart: string;
  breakEnd: string;

  // 시급
  weekdayHourly: string;
  weekendHourly: string;

  // 계약 기간
  startDate: string;
  endDate: string;
  indefinite: boolean;

  // 업무
  jobDuty: string;

  // 4대보험
  socialInsurance: boolean;

  // 추가 내용
  additionalContent: string;

  // 연차
  annualLeaveDays: string;

  // 직원 카테고리
  employeeCategory: "약사" | "매장" | "창고" | "기타";
  employeeCategoryCustom: string;
  primaryFocus: "매장" | "창고" | null;
  primaryFocusPercent: number;

  // 사업주
  employerName: string;
  companyName: string;
  companyAddress: string;
  companyRegNo: string;

  // 임금 세분화
  useWageComponents: boolean;
  wageComponents: WageComponents;

  // 개인정보/CCTV
  privacyConsent: PrivacyConsent;

  // 임금 지급일
  paymentDayText: string;

  // 계약체결일
  contractSignDate: string;

  // 희망 월 세후 수령액
  targetNetInput: string;

  // 세전 월 총액
  grossSalaryInput: string;

  // T6 카테고리별 이해·동의
  clauseAcks: {
    wage: boolean;
    workTime: boolean;
    etc: boolean;
  };

  // 임금 항목 명시적 비활성화
  wageDisabled?: {
    fixedOvertime?: boolean;
    fixedHoliday?: boolean;
    fixedHolidayOvertime?: boolean;
    fixedNight?: boolean;
    fixedAnnualLeave?: boolean;
  };
}

// CardKey · 좌측 카드 접기/펴기
export type CardKey = "employee" | "workCondition" | "wage";
export type CardCollapsedMap = Partial<Record<CardKey, boolean>>;

// CalcMode · 역산 계산기 모드
export type CalcMode = "forward" | "target" | "actual";

// WageEntryKey
export type WageEntryKey = keyof Pick<WageComponents, "basicSalary" | "fixedOvertime" | "fixedHoliday" | "fixedHolidayOvertime" | "fixedNight" | "fixedAnnualLeave">;
export type WageToggleableKey = Exclude<WageEntryKey, "basicSalary">;
export type WageDisabledMap = NonNullable<ContractForm["wageDisabled"]>;

// 기존 계약서 (연장 기능)
export interface ExistingContract {
  id?: number;
  contract_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
  pdf_url?: string | null;
}
