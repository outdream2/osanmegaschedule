// src/constants/jobCategories.ts
// 2026-08-06 · T-Constants-Extract · 직군·직급·계약유형 배열 상수 통합

// 2026-08-09 · "거래처" 추가 (사용자 요청)
export const POSITIONS      = ["약사", "캐셔", "진열", "물류", "거래처", "기타"] as const;
export const RANKS          = ["", "대표", "이사", "부장", "팀장", "과장", "약사", "사원", "알바"] as const;
export const WORKPLACES     = ["매장", "창고", "본사", "기타"] as const;
export const CONTRACT_TYPES = ["정규직", "계약직", "알바", "일용", "인턴"] as const;
export const JOB_CATEGORIES = ["약사", "매장", "창고", "기타"] as const;
