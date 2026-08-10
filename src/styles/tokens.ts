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
export const TEXT = {
  /** 페이지 타이틀 · AppNavHeader 제목 · 모달 제목 등 최상위 */
  hero: "text-[16px] sm:text-[17px] font-black tracking-tight",
  /** 본문 · 리스트 항목 · 카드 내 주요 텍스트 */
  body: "text-[13px] sm:text-[13.5px] font-medium",
  /** 서브 텍스트 · 힌트 · 보조 레이블 */
  caption: "text-[11px] sm:text-[11.5px] font-semibold",
  /** 컬럼 헤더 · 메타 라벨 · 배지 · UPPERCASE 축약 */
  micro: "text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider",
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
    50:     "bg-slate-50",
    100:    "bg-slate-100",
    500:    "bg-slate-500",
    600:    "bg-slate-600",
    text:   "text-slate-700",
    border: "border-slate-200",
    ring:   "ring-slate-400",
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 공통 className 조합 상수
// index.css 의 .card-panel · .modal-backdrop 등 CSS 클래스와 동일한 스타일
// JS 에서 조건부 조합이 필요한 경우 사용 · 기본은 CSS 클래스 우선
// ─────────────────────────────────────────────────────────────────────────────

/** 기본 카드 · bg-white + 테두리 + 그림자 (index.css .card-panel 과 동일) */
export const CARD_BASE =
  "bg-white rounded-xl border border-slate-200 shadow-sm";

/** 카드 hover 인터랙션 · 클릭 가능한 카드에만 추가 */
export const CARD_HOVER =
  "hover:shadow-md hover:-translate-y-0.5 transition-all duration-200";

/** 툴바 컨테이너 · 검색/필터 버튼 행 (inline 형태 · FilterBar 와 다름) */
export const TOOLBAR_BASE =
  "flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 h-8 shadow-sm";

/** 폼 input 기본 (index.css .input-field 보다 focus ring 강화) */
export const INPUT_BASE =
  "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-[13px]" +
  " focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-indigo-400 transition" +
  " placeholder:text-slate-400";

/** 기본 버튼 · 프라이머리 그라디언트 (indigo → emerald) */
export const BUTTON_PRIMARY =
  "px-4 py-2 rounded-lg bg-indigo-500" +
  " text-white text-[12px] font-black shadow-sm hover:brightness-110 transition cursor-pointer";

/** 보조 버튼 · 테두리형 (outline) */
export const BUTTON_SECONDARY =
  "px-4 py-2 rounded-lg border border-slate-200 bg-white" +
  " text-slate-700 text-[12px] font-bold shadow-sm hover:bg-slate-50 transition cursor-pointer";

/** 위험 버튼 · 삭제·취소 등 */
export const BUTTON_DANGER =
  "px-4 py-2 rounded-lg bg-rose-500 text-white text-[12px] font-black shadow-sm" +
  " hover:bg-rose-600 transition cursor-pointer";

/** 모달 backdrop (index.css .modal-backdrop 와 동일 스타일 · 모바일 하단 시트 포함) */
export const MODAL_BACKDROP =
  "fixed inset-0 z-[9997] flex items-end sm:items-center justify-center" +
  " p-0 sm:p-4 bg-slate-900/50 backdrop-blur-sm";

/** 모달 카드 본체 · 모바일 하단 시트 + 데스크탑 센터 */
export const MODAL_CONTENT =
  "w-full sm:max-w-lg max-h-[90vh] bg-white sm:rounded-2xl rounded-t-2xl" +
  " shadow-2xl border border-slate-200 overflow-hidden flex flex-col";

/** 페이지 최상위 컨테이너 · 좌우 최대 폭 + 패딩 */
export const PAGE_WRAPPER =
  "max-w-[1360px] mx-auto w-full px-3 sm:px-5 lg:px-6";

/** 상단 KPI 그리드 · 2/3/4/5 칸 반응형 */
export const KPI_GRID =
  "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3";

/** 섹션 제목 (카드 안 · 필터 섹션 위) */
export const SECTION_TITLE =
  "text-[11px] font-bold text-slate-500 uppercase tracking-wider";

/** 구분선 */
export const DIVIDER = "border-t border-slate-100";

// ─────────────────────────────────────────────────────────────────────────────
// 상태별 색상 매핑 (StatusBadge 컴포넌트에서도 사용)
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
  neutral:  { bg: "bg-slate-50",   text: "text-slate-600",   border: "border-slate-200"  },
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
