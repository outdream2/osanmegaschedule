// src/components/PermissionsPage/constants.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · PermissionsPage 상수 이관
import type { PagePermissions } from "../../types";

// 2026-08-12 · sideNavGroups 확장 · 신규 페이지 반영 (승인요청·경영·설정 등)
export const PAGE_LABELS: { key: keyof PagePermissions; label: string; desc: string }[] = [
  { key: "schedule",    label: "스케줄",          desc: "직원 월간 근무 스케줄" },
  { key: "display",     label: "매장(진열·발주·매입·통계)", desc: "발주·매입·결제·통계·매장구역·공급사 통합" },
  { key: "scan",        label: "상품 스캔",       desc: "바코드 스캔으로 요청" },
  { key: "productarrival", label: "상품 도착",    desc: "상품 입고 처리" },
  { key: "requests",    label: "요청목록",        desc: "진열·발주·연차승인 등 승인 처리" },
  { key: "leave",       label: "연차 신청/승인",  desc: "휴가·연차 신청 및 승인" },
  { key: "approval-request", label: "승인요청",   desc: "연차·점심불참·사직서 신청" },
  { key: "ocr",         label: "거래명세서 OCR",  desc: "PDF 거래명세서 자동 추출" },
  { key: "upload",      label: "상품 목록 관리",  desc: "xlsx 파일 업로드" },
  { key: "reservation", label: "방문예약",        desc: "상담 및 방문 일정 예약" },
  { key: "lunch",       label: "점심 불참",       desc: "오늘의 점심 불참 신청" },
  { key: "stockcheck",  label: "재고 점검",       desc: "매장 내 의약품 재고 점검" },
  { key: "stockarrivals", label: "입고알림",      desc: "입고 알림 수신·조회" },
  { key: "pharmacist",  label: "약사 전용",       desc: "교육자료 · 복약지도 · 문서 · 관리자 업로드" },
  { key: "board",       label: "이슈 게시판",     desc: "공지·이슈 등 게시판" },
  { key: "business-manage", label: "경영관리",    desc: "직원관리·근로계약서·각종양식" },
  { key: "hr-forms",    label: "각종 양식",       desc: "HR 서식" },
  { key: "mypage",      label: "마이페이지",      desc: "본인 정보·비밀번호·계정" },
  { key: "zone-labels", label: "구역 라벨",       desc: "매장 진열구역 라벨" },
  { key: "permissions", label: "직원권한 설정",   desc: "페이지·직원별 레벨 관리" },
  { key: "branding",    label: "앱 브랜딩 설정",  desc: "연락처·도장·모바일 가시성" },
  { key: "company-info", label: "회사정보 설정",  desc: "약국명·대표·사업자·주소·로고" },
  { key: "season-settings", label: "계절 정의",   desc: "봄·여름·가을·겨울 월 매핑" },
];

export const LEVELS = [0,1,2,3,4,5,6,7,8,9];

// 2026-08-12 · #99 · 그룹 아이콘 색상 · Tailwind JIT 스캔 대상 (dynamic class 회피)
export const GROUP_COLOR_CLS: Record<string, string> = {
  slate:   "text-zinc-500",
  amber:   "text-amber-500",
  red:     "text-red-500",
  sky:     "text-sky-500",
  indigo:  "text-indigo-500",
  emerald: "text-emerald-500",
  violet:  "text-violet-500",
  cyan:    "text-cyan-500",
};
