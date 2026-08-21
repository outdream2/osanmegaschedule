// src/components/common/settingsTypography.ts
// 2026-08-12 · [설정] 하위 페이지 공통 CSS 상수 · 글씨/입력/배지 크기 통일
//   · SettingsPageShell 과 함께 · 각 페이지에서 이 상수를 사용해 일관된 톤 유지
//   · 회귀 방지 · 각 페이지의 hard-coded className 을 이 상수로 순차 교체
// 2026-08-16 · #4 P1 · TEXT 8단계 스케일 정렬 (docs/UI_TYPOGRAPHY_AUDIT_2026-08-16.md)
//   · SET_LABEL text-xs → text-[10px] · TEXT.label 과 통일
//   · SET_INPUT text-sm → text-[13px] · TEXT.body 와 통일
//   · SET_HINT text-xs → text-[10px] · TEXT.label 과 통일
//   · SET_BTN_* text-sm → text-[13px] · TEXT.body 와 통일
//   · SET_SECTION_TITLE text-base → text-[15px] · TEXT.section 과 통일

// ─── 섹션 (카드 안) ───────────────────────────────────────────────────────
/** 카드 상단 · 섹션 제목 · 예: "사업장 · 법인 정보" · TEXT.section 정렬 */
export const SET_SECTION_TITLE =
  "text-[15px] font-bold text-zinc-800 flex items-center gap-2";

/** 카드 상단 · 섹션 아이콘 (size prop 은 별도 · 컬러 클래스만) */
export const SET_SECTION_ICON = "shrink-0";

/** 카드 상단 · 섹션 설명 · 제목 아래 · 부가 안내 · TEXT.caption 정렬 */
export const SET_SECTION_DESC = "text-[11px] text-zinc-500 mt-1 leading-relaxed";

// ─── 필드 (라벨 · 입력 · 힌트) ────────────────────────────────────────────
/** 폼 필드 라벨 · 예: "약국 이름" · TEXT.label 정렬 */
export const SET_LABEL =
  "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-1.5";

/** 폼 입력 (input · select · textarea) · TEXT.body 정렬 */
export const SET_INPUT =
  "w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-[13px] text-zinc-800 " +
  "focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint " +
  "transition disabled:opacity-50";

/** 폼 입력 · 강조 (font-semibold) */
export const SET_INPUT_STRONG =
  "w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-[13px] font-semibold text-zinc-800 " +
  "focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint " +
  "transition disabled:opacity-50";

/** 폼 입력 · textarea 전용 (resize-none) */
export const SET_TEXTAREA =
  "w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-[13px] text-zinc-800 " +
  "focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint " +
  "transition disabled:opacity-50 resize-none";

/** 필드 힌트 · 입력 아래 · 예: "예: 010-1234-5678" · TEXT.label 정렬 */
export const SET_HINT = "text-[10px] text-zinc-400 mt-1";

/** 필드 에러 · 힌트 자리 · 붉은 톤 · TEXT.label 정렬 */
export const SET_ERROR = "text-[10px] text-rose-500 mt-1 font-semibold";

// ─── 배지 · 상태 알림 ─────────────────────────────────────────────────────
/** 저장 상태 배지 (저장 중 · 저장됨 · 오류 등) · 페이지 헤더 rightSlot */
export const SET_BADGE =
  "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border";

/** 카테고리별 정보 배지 (총 X건 · 변경 Y건 등) · 페이지 헤더 rightSlot */
export const SET_INFO_BADGE =
  "inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border";

// ─── 액션 버튼 ────────────────────────────────────────────────────────────
/** 저장 버튼 · primary · indigo · TEXT.body 정렬 */
export const SET_BTN_PRIMARY =
  "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold text-white " +
  "bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:bg-zinc-300 shadow-sm transition cursor-pointer";

/** 초기화·다시 불러오기 등 · secondary · white border · TEXT.body 정렬 */
export const SET_BTN_SECONDARY =
  "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-zinc-600 " +
  "bg-white border border-zinc-200 hover:bg-zinc-50 transition cursor-pointer";

/** 위험 액션 · rose · TEXT.body 정렬 */
export const SET_BTN_DANGER =
  "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-bold text-white " +
  "bg-rose-600 hover:bg-rose-700 disabled:bg-zinc-300 shadow-sm transition cursor-pointer";

// ─── 하단 sticky 액션바 ───────────────────────────────────────────────────
/** SystemSettings · ZoneLabels 등 · 저장 UI 를 하단 sticky 로 통일 */
export const SET_ACTION_BAR =
  "sticky bottom-0 flex items-center justify-end gap-2 " +
  "bg-white/95 backdrop-blur-sm border border-zinc-200 rounded-xl px-3 py-2 shadow-sm mt-3";

// ─── 안내 배너 (amber · info) ─────────────────────────────────────────────
export const SET_NOTICE_AMBER =
  "rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2 text-sm text-amber-800";
export const SET_NOTICE_INDIGO =
  "rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 flex items-start gap-2 text-sm text-indigo-800";
export const SET_NOTICE_ROSE =
  "rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700";
export const SET_NOTICE_EMERALD =
  "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700";
