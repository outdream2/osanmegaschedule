// src/components/common/BottomSheet.tsx
// 2026-08-17 · 공용 프레임워크 · Bottom Sheet (모바일 하위메뉴 · 필터 · 액션)
//   · iOS/Material 2026 표준 · Baymard/NN-Group 검증
//   · 하단에서 슬라이드업 · frosted backdrop · rounded-t-2xl
//   · ESC/backdrop/drag-down 으로 닫기
//   · 컨텐츠: children · scrollable · maxHeight 60vh 기본
// 2026-08-23 · v2 확장 · mobile fullscreen 마이그레이션 커버리지 확대
//   · header · 커스텀 헤더 JSX 지원 (indigo/dark bg · Avatar 등 표현)
//   · fullscreen · maxHeight="100vh" + mt-0 (RealMapSelector · StaffMobileDetail 등)
//   · disableHandle · drag handle indicator 숨김 (fullscreen 모드용)
//   · backdropClass · backdrop 배경 override (dark · custom color)
//   · zIndex · z-index override (default z-[100])
//
// 사용 예:
//   <BottomSheet open={open} onClose={onClose} title="선택">...</BottomSheet>
//   <BottomSheet open fullscreen disableHandle header={<CustomHeader />}>...</BottomSheet>
//   <BottomSheet open backdropClass="bg-zinc-900/70" zIndex={70}>...</BottomSheet>

import React, { useEffect, useCallback, useRef, useState } from "react";
import { X } from "lucide-react";
import { AccentBar } from "./AccentBar";

export interface BottomSheetProps {
  /** 열림 상태 · 외부 제어 */
  open: boolean;
  /** 닫기 콜백 */
  onClose: () => void;
  /** 제목 (drag handle 아래 · 왼쪽) */
  title?: React.ReactNode;
  /** 우측 슬롯 (액션 버튼 등) */
  right?: React.ReactNode;
  /** 최대 높이 · 기본 60vh · "auto"·"70vh" 등 */
  maxHeight?: string;
  /** children · 스크롤 가능 컨텐츠 */
  children: React.ReactNode;
  className?: string;

  // ── v2 · 확장 (2026-08-23) · 모두 optional ──
  /**
   * 커스텀 헤더 JSX · title/right 대신 완전 커스텀 헤더 사용
   *   · 지정 시 · title/right/기본 헤더 무시
   *   · Avatar · custom bg · gradient 등 표현 시 사용
   */
  header?: React.ReactNode;
  /** fullscreen · maxHeight 100vh + rounded-t-2xl 유지 · mt-0 (RealMapSelector 등) */
  fullscreen?: boolean;
  /** drag handle indicator 숨김 · fullscreen 시 권장 */
  disableHandle?: boolean;
  /** backdrop 배경 override · 기본 rgba(10,46,74,0.35) · dark 필요 시 "bg-zinc-900/70" */
  backdropClass?: string;
  /** z-index override · 기본 z-[100] · 부모 modal 위 등 */
  zIndex?: number;
  /** footer · 하단 액션 바 (편집·삭제 등) */
  footer?: React.ReactNode;
  /**
   * 2026-09-01 · P3 a11y · aria-describedby · body 안 설명 요소 id
   *   · 예: describedBy="sheet-help" · body 안 <p id="sheet-help">...</p>
   */
  describedBy?: string;
}

/**
 * 공용 Bottom Sheet
 *   · 모바일 표준 · iOS/Material 2026 스타일
 *   · 하단 슬라이드업 애니메이션 · backdrop click/ESC 로 닫기
 *   · handle bar (drag indicator) 자동 표시
 */
export const BottomSheet: React.FC<BottomSheetProps> = ({
  open,
  onClose,
  title,
  right,
  maxHeight,
  children,
  className = "",
  // v2 확장
  header,
  fullscreen = false,
  disableHandle = false,
  backdropClass,
  zIndex,
  footer,
  describedBy,
}) => {
  // v2 · fullscreen 시 maxHeight 100vh · 기본 60vh
  const resolvedMaxHeight = maxHeight ?? (fullscreen ? "100vh" : "60vh");
  const [visible, setVisible] = useState(open);
  const [animating, setAnimating] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  // open true 시 즉시 render + 애니메이션
  useEffect(() => {
    if (open) {
      setVisible(true);
      // 다음 frame 에서 animating 활성화 (transition 트리거)
      requestAnimationFrame(() => setAnimating(true));
    } else {
      setAnimating(false);
      // 애니메이션 완료 후 언마운트
      const t = setTimeout(() => setVisible(false), 250);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ESC 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // body scroll lock
  // 2026-08-29 · #171 P2 fix · 원복 시 exit animation 완료 후 (250ms 대기)
  //   · iOS Safari · 즉시 원복 시 · momentum scroll 상태 초기화 · 스크롤 튀기
  //   · overscroll-behavior: none 병용 · rubber-band effect 차단
  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    const originalOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      // exit animation (250ms · line 128 duration-250) 완료 후 · 원복 · 스크롤 튀기 방지
      setTimeout(() => {
        document.body.style.overflow = originalOverflow;
        document.body.style.overscrollBehavior = originalOverscroll;
      }, 260);
    };
  }, [open]);

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  if (!visible) return null;

  // v2 · backdrop 커스텀 지원 · zIndex override · fullscreen 시 max-w 확대
  const backdropStyle: React.CSSProperties = backdropClass
    ? (zIndex != null ? { zIndex } : {})
    : { backgroundColor: "rgba(10,46,74,0.35)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", ...(zIndex != null ? { zIndex } : {}) };
  const zIndexCls = zIndex != null ? "" : "z-[100]";
  const backdropCls = `fixed inset-0 ${zIndexCls} flex items-end justify-center transition-opacity duration-250 ${animating ? "opacity-100" : "opacity-0"} ${backdropClass ?? ""}`.trim();
  const sheetMaxWidth = fullscreen ? "" : "max-w-[600px]";

  return (
    <div
      className={backdropCls}
      style={backdropStyle}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      // 2026-09-01 · P3 a11y · title 이 string 이면 aria-labelledby (id="bottomsheet-title") 로 연결 · 그 외 fallback aria-label
      aria-labelledby={typeof title === "string" && title ? "bottomsheet-title" : undefined}
      aria-label={typeof title === "string" && title ? undefined : (typeof title === "string" ? title : "선택")}
      aria-describedby={describedBy}
    >
      <div
        ref={sheetRef}
        className={`w-full ${sheetMaxWidth} bg-white rounded-t-2xl shadow-[0_-8px_32px_-4px_rgba(10,46,74,0.20),0_-2px_8px_-2px_rgba(10,46,74,0.10)] flex flex-col overflow-hidden transition-transform duration-250 ease-out ${animating ? "translate-y-0" : "translate-y-full"} ${className}`.trim()}
        style={{ maxHeight: resolvedMaxHeight }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle · disableHandle 시 숨김 (fullscreen 등) */}
        {!disableHandle && (
          <div className="flex justify-center pt-2.5 pb-1 shrink-0">
            <span className="w-10 h-1 rounded-full bg-zinc-300" />
          </div>
        )}

        {/* v2 · 커스텀 헤더 우선 · 지정 시 title/right/기본 헤더 무시 */}
        {header ? (
          <div className="shrink-0">{header}</div>
        ) : (title || right) && (
          <div className="flex items-center gap-2.5 px-5 py-3 border-b border-line shrink-0">
            <AccentBar size="lg" />
            {title && (
              /* 2026-08-29 · UI 감사 U0 · truncate 제거 · 대원칙 · 말줄임 금지 */
              /* 2026-09-01 · P3 a11y · id="bottomsheet-title" · aria-labelledby 연결 */
              <div id="bottomsheet-title" className="flex-1 min-w-0 text-[16px] font-bold text-ink tracking-tight break-words whitespace-normal leading-tight">
                {title}
              </div>
            )}
            {right}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-lg bg-white border border-line hover:border-brand-deep hover:bg-brand-tint text-ink-soft hover:text-brand-deep flex items-center justify-center transition-colors cursor-pointer shrink-0"
              aria-label="닫기"
              title="닫기 (ESC)"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* 컨텐츠 · 스크롤 가능 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {children}
        </div>

        {/* v2 · footer · 하단 액션 바 */}
        {footer && (
          <div className="shrink-0 border-t border-line px-4 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
};

export default BottomSheet;
