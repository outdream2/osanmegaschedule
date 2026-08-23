// src/components/common/Modal.tsx
// 2026-08-03 (#183) · 공통 모달 컴포넌트
//   - backdrop + card + header + body + (optional footer)
//   - ESC 키 · backdrop 클릭 · onClose
//   - size 프리셋 (sm · md · lg · xl · full)
//   - 스크롤 잠금은 index.css :has() 셀렉터로 자동 처리
// 2026-08-18 · v2 확장 (모달 프레임워크화 · 인라인 모달 30+ 통합 지원)
//   - icon · titleAccent (accent bar 3px) · headerRight · backdropIntensity
//   - 기존 API 완전 하위호환 (모든 신규 prop 옵셔널)
// 2026-08-23 · v3 확장 (Modal 프레임워크 완성 · skip 되었던 특수 케이스 지원)
//   - zIndex · 팝오버 위 (z-50 override)
//   - bodyPadding · none 옵션 (내부 wrapper 이미 padding 있을 때)
//   - size "lg-narrow" · max-w-lg 추가 (기존 md=max-w-2xl · lg=max-w-4xl 사이 공백 채움)
//   - backdropIntensity "dark" · bg-zinc-950/95 (PDF 뷰어 등)
// 2026-08-23 · v3.1 · size "3xl" · max-w-3xl (768px) 추가
// 2026-08-23 · v3.2 · align "bottom-mobile" · 반응형 하이브리드 (mobile=bottom-sheet · desktop=center)
//   - `items-end sm:items-center` backdrop · `rounded-t-2xl sm:rounded-2xl` card
//   - iOS/Material 반응형 표준 · 3파일 대응 (NewVendorModal · ReservationPage · HistoryModal)
// 2026-08-23 · v3.3 · align "top-mobile" · 반응형 하이브리드 (mobile=top-slide · desktop=center)
//   - `items-start sm:items-center p-0 sm:p-4 pt-4 sm:pt-0` backdrop · `rounded-t-2xl sm:rounded-2xl` card
//   - 대형 스케쥴 모달 (DayTimelineModal 등) 용 · 카드가 위에서 슬라이드
// 2026-08-23 · v3.4 · headerBgClass · headerTextClass · 커스텀 헤더 배경 지원
//   - LoginModals (그라디언트 · deep navy) · StaffInfoModal (bg-brand-deep) · StaffMobileDetail (bg-indigo-50) 대응
//   - default 시 · 기존 headerTint 유지 (bg-zinc-50/60)
//
// 사용 예 (기본):
//   <Modal open={open} onClose={() => setOpen(false)} title="상세" size="md">
//     <div>내용</div>
//   </Modal>
//
// 사용 예 (v2 확장 · 인라인 모달 대체):
//   <Modal
//     open={open}
//     onClose={onClose}
//     icon={<Package size={18} />}
//     title="상품 상세"
//     titleAccent
//     headerRight={<StatusPill tone="emerald">완료</StatusPill>}
//     size="lg"
//     backdropIntensity="brand"
//   >
//     {children}
//   </Modal>

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { AccentBar } from "./AccentBar";

// 2026-08-23 · v3 · "lg-narrow" (max-w-lg · 512px) 추가 · md 와 lg 사이 공백 채움
// 2026-08-23 · v3.1 · "3xl" (max-w-3xl · 768px) 추가 · md 와 lg 사이 상세정보용
type ModalSize = "sm" | "md" | "lg-narrow" | "3xl" | "lg" | "xl" | "full";

const SIZE_MAP: Record<ModalSize, string> = {
  sm:         "max-w-md",     // 448px
  md:         "max-w-2xl",    // 672px
  "lg-narrow":"max-w-lg",     // 512px · v3 신규
  "3xl":      "max-w-3xl",    // 768px · v3.1 신규 (VendorDetailModal wrapper 등)
  lg:         "max-w-4xl",    // 896px
  xl:         "max-w-6xl",    // 1152px
  full:       "max-w-[95vw]",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSize;
  /** 닫기 버튼 표시 (기본 true) */
  showClose?: boolean;
  /** ESC 로 닫기 (기본 true) */
  closeOnEsc?: boolean;
  /** backdrop 클릭 시 닫기 (기본 true) */
  closeOnBackdrop?: boolean;
  className?: string;

  // ── v2 · 확장 (2026-08-18) · 모두 optional ──
  /** 헤더 좌측 아이콘 (title 앞) */
  icon?: React.ReactNode;
  /** 좌측 accent bar (3×18 · brand-deep · title 앞) · 기본 false */
  titleAccent?: boolean;
  /** 헤더 우측 slot (close 버튼 앞) · 액션·배지 등 */
  headerRight?: React.ReactNode;
  /** backdrop 강도 · brand (기본) · strong (이미지 뷰어) · dark (PDF 뷰어 · zinc-950/95) */
  backdropIntensity?: "brand" | "brand-strong" | "dark";
  /** 헤더 배경 · zinc-50/60 tint 적용 (기본 true · 인라인 모달 일관성) */
  headerTint?: boolean;

  // ── v3 · 확장 (2026-08-23) · 모두 optional ──
  /** z-index override · 기본 CSS z-50 · 부모 모달 위 팝오버 (예: 60·100+) */
  zIndex?: number;
  /** body padding · default=p-5 · none=p-0 (내부 wrapper 이미 padding 있을 때) */
  bodyPadding?: "default" | "none";
  /**
   * 정렬 · 기본 center · "bottom-mobile" 은 모바일에서 bottom-sheet · 데스크탑에서 center
   *   - center: 항상 중앙 (기본)
   *   - bottom-mobile: mobile items-end + rounded-t-2xl · sm+ items-center + rounded-2xl
   *   - top-mobile: mobile items-start pt-4 + rounded-t-2xl · sm+ items-center + rounded-2xl (대형 스케쥴 모달용)
   */
  align?: "center" | "bottom-mobile" | "top-mobile";
  /** card div 인라인 style override · maxHeight 등 특수 케이스 (기본 undefined) */
  cardStyle?: React.CSSProperties;

  // ── v3.4 · 확장 (2026-08-23) · 모두 optional ──
  /**
   * 헤더 배경 override · Tailwind class 문자열
   *   - 기본 undefined · headerTint 로직 적용 (bg-zinc-50/60 or none)
   *   - 예: "bg-indigo-50/80" · "bg-brand-deep text-white" · "bg-gradient-to-br from-brand-deep to-sky-600 text-white"
   *   - 설정 시 · headerTint 무시
   */
  headerBgClass?: string;
  /**
   * 헤더 텍스트/아이콘 색 override · Tailwind class
   *   - 기본 undefined · text-ink · text-brand-deep icon
   *   - dark 헤더 (bg-brand-deep 등) 사용 시 · "text-white" 지정
   */
  headerTextClass?: string;
}

/**
 * 공통 모달
 *   - backdrop + card
 *   - ESC · backdrop 클릭 · X 버튼 → onClose
 *   - body 는 스크롤 · 최대 90vh
 */
export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  showClose = true,
  closeOnEsc = true,
  closeOnBackdrop = true,
  className = "",
  // v2 · 확장
  icon,
  titleAccent = false,
  headerRight,
  backdropIntensity = "brand",
  headerTint = true,
  // v3 · 확장
  zIndex,
  bodyPadding = "default",
  align = "center",
  cardStyle,
  // v3.4 · 확장
  headerBgClass,
  headerTextClass,
}) => {
  // ESC 키 핸들링
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeOnEsc, onClose]);

  if (!open) return null;

  const sizeCls = SIZE_MAP[size];

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!closeOnBackdrop) return;
    if (e.target === e.currentTarget) onClose();
  };

  // 2026-08-18 v2 · backdrop 강도 · brand-strong 은 이미지 뷰어 등
  // 2026-08-23 v3 · dark 는 PDF 뷰어 (bg-zinc-950/95 · backdrop-blur-sm)
  // 2026-08-23 v3.2 · align "bottom-mobile" · items-end sm:items-center + p-0 sm:p-4
  // 2026-08-23 v3.3 · align "top-mobile" · items-start sm:items-center + p-0 sm:p-4 pt-4 sm:pt-0
  const alignCls = align === "bottom-mobile"
    ? "items-end sm:items-center p-0 sm:p-4"
    : align === "top-mobile"
      ? "items-start sm:items-center p-0 sm:p-4 pt-4 sm:pt-0"
      : "items-center p-4";
  const backdropCls = backdropIntensity === "dark"
    ? `fixed inset-0 z-50 flex ${alignCls} justify-center bg-zinc-950/95 backdrop-blur-sm`
    : backdropIntensity === "brand-strong"
      ? `fixed inset-0 z-50 flex ${alignCls} justify-center backdrop-brand-strong`
      : (align === "bottom-mobile" || align === "top-mobile")
        ? `fixed inset-0 z-50 flex ${alignCls} justify-center backdrop-brand`
        : "modal-backdrop";
  // 2026-08-23 v3.2/v3.3 · align="bottom-mobile"|"top-mobile" 시 card 는 rounded-t-2xl (mobile) sm+ rounded-2xl
  const cardRoundedCls = (align === "bottom-mobile" || align === "top-mobile") ? "rounded-t-2xl sm:rounded-2xl" : "";
  // 2026-08-18 v2 · 헤더 tint 옵션 · 인라인 모달들의 zinc-50/60 스타일과 일관
  // 2026-08-23 v3.4 · headerBgClass override · 커스텀 배경 (indigo · brand-deep · gradient 등)
  const headerCls = headerBgClass
    ? `modal-header ${headerBgClass}`
    : headerTint
      ? "modal-header bg-zinc-50/60"
      : "modal-header";
  // v3.4 · headerTextClass · 헤더 title·icon 텍스트 색 override
  const headerTitleCls = `flex-1 min-w-0 text-[16px] font-bold tracking-tight truncate ${headerTextClass ?? "text-ink"}`;
  const headerIconCls = `shrink-0 inline-flex ${headerTextClass ?? "text-brand-deep"}`;

  const hasHeader = title != null || icon != null || headerRight != null || showClose;

  // 2026-08-23 v3 · zIndex override · 팝오버 위·부모 모달 위 등
  const backdropStyle = zIndex != null ? { zIndex } : undefined;

  return (
    <div
      className={backdropCls}
      style={backdropStyle}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title != null ? "modal-title" : undefined}
    >
      <div className={`modal-card ${sizeCls} ${cardRoundedCls} ${className}`} style={cardStyle}>
        {hasHeader && (
          <div className={headerCls}>
            {titleAccent && <AccentBar size="lg" className="shrink-0" />}
            {icon != null && (
              <span className={headerIconCls} aria-hidden="true">{icon}</span>
            )}
            {title != null && (
              <div id="modal-title" className={headerTitleCls}>
                {title}
              </div>
            )}
            {headerRight != null && (
              <div className="shrink-0 inline-flex items-center gap-1.5">{headerRight}</div>
            )}
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-white border border-line hover:border-brand-deep hover:bg-brand-tint flex items-center justify-center text-ink-soft hover:text-brand-deep cursor-pointer shrink-0 transition-colors"
                title="닫기 (ESC)"
                aria-label="닫기"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}
        {/* 2026-08-23 v3 · bodyPadding=none · 내부 wrapper 이미 padding 있을 때 */}
        <div className={bodyPadding === "none" ? "flex-1 overflow-y-auto min-h-0" : "modal-body"}>
          {children}
        </div>
        {footer != null && (
          <div className="border-t border-line px-5 py-3 flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
