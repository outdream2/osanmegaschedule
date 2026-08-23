// src/components/ContractWriterPage/constants.ts
// 근로계약서 페이지 상수

import { type DayKey } from "./types";
import {
  CONTRACT_TYPES as CONTRACT_TYPES_CONST,
} from "../../constants/jobCategories";
import { START_TIMES as START_TIMES_CONST, END_TIMES as END_TIMES_CONST } from "../../constants/schedules";
import { RATES_2026 } from "../../lib/payroll";
import { DEFAULT_COMPANY_INFO } from "../../types";
import type { ContractForm } from "./types";

export const DAYS: DayKey[] = ["월", "화", "수", "목", "금", "토", "일"];
export const WEEKDAYS: DayKey[] = ["월", "화", "수", "목", "금"];
export const WEEKEND: DayKey[] = ["토", "일"];

export const CONTRACT_TYPES: string[] = Array.from(CONTRACT_TYPES_CONST);
export const START_TIMES: string[] = Array.from(START_TIMES_CONST);
export const END_TIMES: string[] = Array.from(END_TIMES_CONST);

export const CUSTOM_OPTION = "__custom__";

export const BANK_LIST: string[] = [
  "국민", "신한", "하나", "우리", "NH농협", "기업", "SC제일", "씨티", "카카오뱅크", "토스뱅크", "기타",
];

export const BREAK_TIME_OPTIONS: string[] = [
  "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00",
  "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00",
];

export const DEFAULT_EMPLOYER: Partial<ContractForm> = {
  employerName: DEFAULT_COMPANY_INFO.representativeName,
  companyName: DEFAULT_COMPANY_INFO.name,
  companyAddress: DEFAULT_COMPANY_INFO.address,
  companyRegNo: DEFAULT_COMPANY_INFO.regNo,
};

export const INSURANCE_RATES = {
  PENSION: RATES_2026.nationalPension,
  HEALTH: RATES_2026.healthInsurance,
  LTC_RATIO: RATES_2026.longTermCare,
  EMPLOYMENT: RATES_2026.employmentInsurance,
} as const;

export const DRAFT_STORAGE_KEY = "megatown_contract_writer_draft";
export const DRAFT_TIMESTAMP_KEY = "megatown_contract_writer_draft_ts";
export const CARD_COLLAPSE_STORAGE_KEY = "contractWriter:cardCollapsed";
