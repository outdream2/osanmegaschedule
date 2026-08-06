// src/constants/timing.ts
// 2026-08-06 · T-Constants-Extract · 타이밍 관련 상수 통합

export const TIMING = {
  // 검색 디바운스
  DEBOUNCE_SEARCH: 250,       // useProductInfoSearch · /api/products-search 자동 검색
  DEBOUNCE_INPUT: 200,        // useWageCalculator · ContractWriter blur 디바운스
  DEBOUNCE_SETTINGS: 500,     // useKvSetting · 서버 저장 기본값

  // 토스트 표시 시간
  TOAST_SHORT: 2500,
  TOAST_MEDIUM: 3000,
  TOAST_LONG: 3500,
  TOAST_EXTRA_LONG: 5000,

  // 기능별 타이밍
  CAMERA_READY: 1500,         // BarcodeScanner · 카메라 준비 대기
  AUTOSAVE: 1500,             // DayTimelineModal · 자동 저장 debounce
  POLL_FAST: 300,             // StockCheckPage 검색 debounce · SchedulePage 스크롤 억제
  POLL_MEDIUM: 1000,          // BarcodeScanner OCR 루프
  PRESS_LONG: 500,            // useSortableTabs · long-press 감지 (500ms)
} as const;
