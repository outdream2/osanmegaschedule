/**
 * src/styles/tokens.ts
 * T-CSS Phase 1 · 2026-08-05
 * 전체 UI 통일 · 디자인 토큰 · 타이포 · 색상 · 공통 className 상수
 *
 * 반응형 breakpoint 사용 규칙:
 * - default (< 640px):  모바일 · 세로 스택 · 5칸 grid 강제
 * - sm (>= 640px):      큰 모바일 · 좌우 여백 여유
 * - md (>= 768px):      태블릿 · 2컬럼 레이아웃 · 우측 정보 모달로 (SplitPanel 규칙)
 * - lg (>= 1024px):     데스크탑 · 좌우 분할 · 우측 사이드 패널 (SplitPanel 표시)
 * - xl (>= 1280px):     와이드 · 3컬럼 가능
 *
 * 사용 방법:
 *   import { TEXT, COLOR, CARD_BASE, BUTTON_PRIMARY } from "@/styles/tokens";
 *   <h1 className={TEXT.hero}>페이지 타이틀</h1>
 *   <div className={CARD_BASE}>카드</div>
 *   <button className={BUTTON_PRIMARY}>저장</button>
 *
 * ⚠️  Phase 1 은 토큰 정의만 · 기존 파일 수정은 Phase 2 에서
 */

// ─────────────────────────────────────────────────────────────────────────────
// 타이포그래피 스케일 (5단계)
// 주의: index.css 전역 font-size 스케일 오버라이드 적용 중
//   text-[Npx] 클래스는 index.css 에서 +5px 상향됨 (e.g. text-[13px] → 18px 렌더)
// ─────────────────────────────────────────────────────────────────────────────
// 2026-08-16 · #4 · P1 · UI audit 통합 스케일 8단계 (docs/UI_TYPOGRAPHY_AUDIT_2026-08-16.md)
//   · index.css 오버라이드 반영 · 렌더 픽셀 예상값 주석
//   · 프로젝트 전역 · UI 통일 기준 · 모든 컴포넌트 · 이 상수 사용 권장
export const TEXT = {
  /** T-8 · 페이지 타이틀 · h1 · AppNavHeader 로고 · 모달 제목 · 27px 렌더 */
  hero: "text-[17px] font-black tracking-tight leading-tight",
  /** T-7 · 섹션 그룹 제목 · h2 · 26px */
  title: "text-[16px] font-extrabold tracking-tight leading-snug",
  /** T-6 · 카드 헤더 · 서브섹션 제목 · 25px */
  section: "text-[15px] font-bold leading-snug",
  /** T-5 · 탭 메뉴 · 내비게이션 항목 전용 · 24px */
  tab: "text-[14px] font-bold leading-none",
  /** T-4 · 본문 · 리스트 주요 텍스트 · 입력창 내용 · 버튼 텍스트 · 23px */
  body: "text-[13px] font-semibold leading-relaxed",
  /** T-3 · 캡션 · 서브 텍스트 · 힌트 · 보조 레이블 · 22px */
  caption: "text-[11px] font-semibold leading-snug",
  /** T-2 · 컬럼 헤더 · 폼 라벨 · 배지 · UPPERCASE 축약 · 22px */
  label: "text-[10px] font-bold uppercase tracking-wider",
  /** T-1 · 마이크로 · 최소 표시 · 21px */
  micro: "text-[9px] font-bold uppercase tracking-widest",
  /** 숫자 전용 · 색상은 별도 지정 · tabular-nums 정렬 */
  num: "tabular-nums font-black",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 색상 팔레트 (역할 기반 · 6팔레트)
// primary=indigo · success=emerald · warning=amber · danger=rose · info=sky · neutral=slate
// ─────────────────────────────────────────────────────────────────────────────
export const COLOR = {
  primary: {
    50:     "bg-indigo-50",
    100:    "bg-indigo-100",
    500:    "bg-indigo-500",
    600:    "bg-indigo-600",
    text:   "text-indigo-700",
    border: "border-indigo-200",
    ring:   "ring-indigo-400",
  },
  success: {
    50:     "bg-emerald-50",
    100:    "bg-emerald-100",
    500:    "bg-emerald-500",
    600:    "bg-emerald-600",
    text:   "text-emerald-700",
    border: "border-emerald-200",
    ring:   "ring-emerald-400",
  },
  warning: {
    50:     "bg-amber-50",
    100:    "bg-amber-100",
    500:    "bg-amber-500",
    600:    "bg-amber-600",
    text:   "text-amber-700",
    border: "border-amber-200",
    ring:   "ring-amber-400",
  },
  danger: {
    50:     "bg-rose-50",
    100:    "bg-rose-100",
    500:    "bg-rose-500",
    600:    "bg-rose-600",
    text:   "text-rose-700",
    border: "border-rose-200",
    ring:   "ring-rose-400",
  },
  info: {
    50:     "bg-sky-50",
    100:    "bg-sky-100",
    500:    "bg-sky-500",
    600:    "bg-sky-600",
    text:   "text-sky-700",
    border: "border-sky-200",
    ring:   "ring-sky-400",
  },
  neutral: {
    50:     "bg-zinc-50",
    100:    "bg-zinc-100",
    500:    "bg-zinc-500",
    600:    "bg-zinc-600",
    text:   "text-zinc-700",
    border: "border-zinc-200",
    ring:   "ring-zinc-400",
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 공통 className 조합 상수
// index.css 의 .card-panel · .modal-backdrop 등 CSS 클래스와 동일한 스타일
// JS 에서 조건부 조합이 필요한 경우 사용 · 기본은 CSS 클래스 우선
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 2026-08-31 · 사용자 지시 · 페이지 컨텐츠 표준 폭 · 프레임워크
 *   · 모든 페이지 · 사이드메뉴 오른쪽 컨텐츠 · 화면 너비의 85% · 최대 1360px
 *   · main/wrapper 에 이 상수 적용 · 하드코딩 대체
 *   · 예외 · LandingPage (홈 카드 grid) · 모달·팝오버 (전체 페이지 아님)
 */
export const PAGE_CONTAINER_CLS = "max-w-[1360px] w-[85%] mx-auto";

/** 기본 카드 · bg-white + 테두리 + 그림자 (index.css .card-panel 과 동일) */
export const CARD_BASE =
  "bg-white rounded-xl border border-zinc-200 shadow-sm";

/** 카드 hover 인터랙션 · 클릭 가능한 카드에만 추가 */
export const CARD_HOVER =
  "hover:shadow-md hover:-translate-y-0.5 transition-all duration-200";

/** 툴바 컨테이너 · 검색/필터 버튼 행 (inline 형태 · FilterBar 와 다름) */
export const TOOLBAR_BASE =
  "flex items-center gap-2 bg-white border border-zinc-200 rounded-xl px-3 h-8 shadow-sm";

/** 폼 input 기본 (index.css .input-field 보다 focus ring 강화) */
export const INPUT_BASE =
  "w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-[13px]" +
  " focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-indigo-400 transition" +
  " placeholder:text-zinc-400";

// 2026-08-13 · #109 · 2025 SaaS 트렌드 (Linear · Vercel · Supabase · Attio · Cal.com)
//   · 파스텔 톤 (bg-*-50 + text-*-600) 은 badge/chip 용도로만 유지 · 버튼은 filled/outline
//   · Primary/Danger/Success · filled 600 (짙게) · Secondary · white + border-300 outline
//   · focus-visible outline · disabled 40% opacity · active:bg-*-800 press feedback
/** Primary CTA · 저장·제출·주요 확인 · filled indigo-600 (Linear/Vercel 스타일) */
export const BUTTON_PRIMARY =
  "px-4 py-2 rounded-lg bg-indigo-600 text-white text-[12px] font-bold shadow-sm" +
  " hover:bg-indigo-700 active:bg-indigo-800" +
  " focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" +
  " disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer";

/** Secondary · 취소·상세보기·덜 중요한 액션 · white + border outline (Vercel 스타일) */
export const BUTTON_SECONDARY =
  "px-4 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-700 text-[12px] font-semibold shadow-sm" +
  " hover:bg-zinc-50 hover:border-zinc-400" +
  " focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400" +
  " disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer";

/** Destructive · 삭제·해제 · filled rose-600 (Supabase/Height 스타일) */
export const BUTTON_DANGER =
  "px-4 py-2 rounded-lg bg-rose-600 text-white text-[12px] font-bold shadow-sm" +
  " hover:bg-rose-700 active:bg-rose-800" +
  " focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600" +
  " disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer";

/** Success · 승인·완료 처리 · filled emerald-600 (Supabase 스타일) */
export const BUTTON_SUCCESS =
  "px-4 py-2 rounded-lg bg-emerald-600 text-white text-[12px] font-bold shadow-sm" +
  " hover:bg-emerald-700 active:bg-emerald-800" +
  " focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" +
  " disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer";

/** Ghost/icon · 닫기·메뉴·아이콘 전용 · border 없음 · hover 시만 배경 */
export const BUTTON_GHOST =
  "p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700" +
  " active:bg-zinc-200 transition-colors cursor-pointer" +
  " focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400" +
  " disabled:opacity-40 disabled:cursor-not-allowed";

/** 모달 backdrop (index.css .modal-backdrop 와 동일 스타일 · 모바일 하단 시트 포함) */
export const MODAL_BACKDROP =
  "fixed inset-0 z-[9997] flex items-end sm:items-center justify-center" +
  " p-0 sm:p-4 bg-zinc-900/50 backdrop-blur-sm";

/** 모달 카드 본체 · 모바일 하단 시트 + 데스크탑 센터 */
export const MODAL_CONTENT =
  "w-full sm:max-w-lg max-h-[90vh] bg-white sm:rounded-2xl rounded-t-2xl" +
  " shadow-2xl border border-zinc-200 overflow-hidden flex flex-col";

/** 페이지 최상위 컨테이너 · 좌우 최대 폭 + 패딩 */
export const PAGE_WRAPPER =
  "max-w-[1360px] mx-auto w-full px-3 sm:px-5 lg:px-6";

/** 상단 KPI 그리드 · 2/3/4/5 칸 반응형 */
export const KPI_GRID =
  "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3";

/** 섹션 제목 (카드 안 · 필터 섹션 위) */
export const SECTION_TITLE =
  "text-[11px] font-bold text-zinc-500 uppercase tracking-wider";

/** 구분선 */
export const DIVIDER = "border-t border-zinc-100";

// ─────────────────────────────────────────────────────────────────────────────
// 상태별 색상 매핑 · LeavePage/DisplayPage/ResignationApprovalPage 에서 참조
//   · 2026-08-17 · legacy common/StatusBadge 삭제됨 · StatusPill 프레임워크로 대체
// ─────────────────────────────────────────────────────────────────────────────
export type StatusKey = "pending" | "prepared" | "done" | "success" | "warning" | "danger" | "info" | "neutral";

export const STATUS_COLOR: Record<StatusKey, { bg: string; text: string; border: string }> = {
  pending:  { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200"  },
  prepared: { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200"    },
  done:     { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200"},
  success:  { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200"},
  warning:  { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200"  },
  danger:   { bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-200"   },
  info:     { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200"    },
  neutral:  { bg: "bg-zinc-50",   text: "text-zinc-600",   border: "border-zinc-200"  },
};

export const STATUS_LABEL: Record<StatusKey, string> = {
  pending:  "대기",
  prepared: "준비",
  done:     "완료",
  success:  "성공",
  warning:  "경고",
  danger:   "오류",
  info:     "정보",
  neutral:  "일반",
};
