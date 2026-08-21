// src/components/ResignationWriterPage/utils.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · ResignationWriterPage 상수/유틸 이관
import { DEFAULT_COMPANY_INFO } from "../../types";
import type { ResignationForm, SignSlot } from "./types";

// 표준 사유 (2026-08-05 · 4가지로 제한)
export const REASON_OPTIONS = [
  "일신상의 사유",
  "개인사정",
  "이직",
  "기타",
];

// 회사 기본값 · T-CompanyInfo-Universal (2026-08-07)
//   · 하드코딩 제거 · types.ts DEFAULT_COMPANY_INFO 를 fallback 으로 사용
//   · 실제 값은 마운트 후 useCompanyInfo() 로부터 서버 로드된 값으로 대체됨
export const DEFAULT_COMPANY = {
  employerName: DEFAULT_COMPANY_INFO.representativeName,
  companyName: DEFAULT_COMPANY_INFO.name,
};

// 기본 수신처 · "<회사명> 대표" 형식 (사용자 편집 시 자유)
//   · settings.company_info 로부터 회사명 반영 (마운트 후 useEffect 로 갱신)
export const buildDefaultRecipient = (companyName: string): string =>
  `${companyName || DEFAULT_COMPANY_INFO.name} 대표`;

export const DEFAULT_RECIPIENT = buildDefaultRecipient(DEFAULT_COMPANY_INFO.name);

// 서명 slot label
export const SIGN_LABELS: Record<SignSlot, string> = {
  employee: "신청인 서명",
  payout: "금품 지급기일 동의 서명",
  other: "기타 사항 동의 서명",
};

// ─────────────────────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────────────────────

export const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// 오늘 + N일
export const addDaysIso = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// 특정 기준일자 + N일 (근로기준법 · 금품 지급기일 14일 계산용)
export const addDaysToIso = (baseIso: string, days: number): string => {
  if (!baseIso) return addDaysIso(days);
  const m = baseIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return addDaysIso(days);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const fmtKoreanDate = (iso: string): string => {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
};

// 근속기간 계산 (입사일 → 마지막 근무일)
export const calcTenure = (hire: string, end: string): string => {
  if (!hire) return "-";
  const hd = new Date(hire);
  const ed = end ? new Date(end) : new Date();
  if (isNaN(hd.getTime()) || isNaN(ed.getTime())) return "-";
  let months = (ed.getFullYear() - hd.getFullYear()) * 12 + (ed.getMonth() - hd.getMonth());
  if (ed.getDate() < hd.getDate()) months -= 1;
  if (months < 0) return "-";
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem}개월`;
  if (rem === 0) return `${years}년`;
  return `${years}년 ${rem}개월`;
};

export const emptyForm = (): ResignationForm => {
  const submit = todayIso();
  return {
    employeeId: null,
    employeeName: "",
    employeeNo: "",
    birthDate: "",
    department: "",
    position: "",
    hireDate: "",
    lastWorkDate: addDaysIso(30),
    submitDate: submit,
    recipient: DEFAULT_RECIPIENT,
    reason: "일신상의 사유",
    reasonDetail: "",
    handoverNotes: "",
    // 근로기준법 · 퇴직 후 14일 이내 금품 지급 (마지막 근무일 + 5일 기본값 · 사용자 조정 가능)
    payoutDate: addDaysToIso(addDaysIso(30), 5),
    employerName: DEFAULT_COMPANY.employerName,
    companyName: DEFAULT_COMPANY.companyName,
  };
};
