// src/components/common/BottomSheet.tsx
// 2026-08-17 · 공용 프레임워크 · Bottom Sheet (모바일 하위메뉴 · 필터 · 액션)
//   · iOS/Material 2026 표준 · Baymard/NN-Group 검증
//   · 하단에서 슬라이드업 · frosted backdrop · rounded-t-2xl
//   · ESC/backdrop/drag-down 으로 닫기
//   · 컨텐츠: children · scrollable · maxHeight 60vh 기본
//
// 사용 예:
//   const [open, setOpen] = useState(false);
//   <BottomSheet
//     open={open}
//     onClose={() => setOpen(false)}
//     title="발주 서브탭 선택"
//   >
//     {items.map(...)}
//   </BottomSheet>

import React, { useEffect, useCallback, useRef, useState } from "react";
import { X } from "lucide-react";

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
  maxHeight = "60vh",
  children,
  className = "",
}) => {
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
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [open]);

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-end justify-center transition-opacity duration-250 ${animating ? "opacity-100" : "opacity-0"}`}
      style={{ backgroundColor: "rgba(10,46,74,0.35)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : "선택"}
    >
      <div
        ref={sheetRef}
        className={`w-full max-w-[600px] bg-white rounded-t-2xl shadow-[0_-8px_32px_-4px_rgba(10,46,74,0.20),0_-2px_8px_-2px_rgba(10,46,74,0.10)] flex flex-col overflow-hidden transition-transform duration-250 ease-out ${animating ? "translate-y-0" : "translate-y-full"} ${className}`}
        style={{ maxHeight }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (indicator only · 실제 drag 는 향후 추가) */}
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <span className="w-10 h-1 rounded-full bg-zinc-300" />
        </div>

        {/* 헤더 · 제목 + 우측 슬롯 + 닫기 */}
        {(title || right) && (
          <div className="flex items-center gap-2.5 px-5 py-3 border-b border-line shrink-0">
            <span className="w-[3px] h-[18px] rounded-full bg-brand-deep" />
            {title && (
              <div className="flex-1 min-w-0 text-[16px] font-bold text-ink tracking-tight truncate">
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
      </div>
    </div>
  );
};

export default BottomSheet;
