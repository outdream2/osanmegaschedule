// src/components/common/SplitPanel.tsx
// 2026-08-03 (#183) · 공통 마스터-디테일 split 패널
//   - 좌측 (list) + divider (drag resize) + 우측 (detail)
//   - 데스크탑 (lg:1024px+) · 가로 배치 + 폭 조정 · localStorage 저장
//   - 모바일 (< lg) · 좌측만 표시 · 우측은 모달로 렌더링 (mobileRightAsModal=true)
//   - dividerColor · 프리셋 (indigo · teal · emerald 등) · hover 컬러 강조
// 2026-08-04 (#B-3-2) · mobileRightAsModal 추가
//   - 모바일에서 우측 패널을 모달로 자동 처리
//   - mobileModalTitle · 모달 제목
//   - 좌측 아이템 클릭 시 mobileOpen=true → 자동 모달 오픈
//   - ESC · backdrop 클릭 · X 버튼 모두로 닫기
//
// 사용 예:
//   <SplitPanel
//     storageKey="staffManage.listWidth"
//     defaultWidth={288}
//     minWidth={200}
//     maxWidth={640}
//     dividerColor="indigo"
//     mobileRightAsModal={true}
//     mobileModalTitle="상세 정보"
//     mobileOpen={!!selectedItem}
//     onMobileClose={() => setSelectedItem(null)}
//     left={<div>...</div>}
//     right={<div>...</div>}
//   />
//
// storageKey 는 localStorage 에 자동 저장 (megatown_ prefix 붙음)
// 좌측 aside · 우측 section 시맨틱 · card-panel 스타일 자동 적용

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { AccentBar } from "./AccentBar";

const STORAGE_PREFIX = "megatown_"; // 앱 관례 (useAuth · settings 와 동일)

type DividerColor = "indigo" | "teal" | "sky" | "emerald" | "amber" | "rose" | "violet";

// 2026-08-17 · 최신 트렌드 · divider hover · 모든 색상 → brand-deep 통일 (mono neutral)
const DIVIDER_HOVER: Record<DividerColor, string> = {
  indigo:  "hover:bg-brand-deep",
  teal:    "hover:bg-brand-deep",
  sky:     "hover:bg-brand-deep",
  emerald: "hover:bg-brand-deep",
  amber:   "hover:bg-brand-deep",
  rose:    "hover:bg-brand-deep",
  violet:  "hover:bg-brand-deep",
};

export interface SplitPanelProps {
  /** localStorage 키 (megatown_ prefix 자동) · 폭 저장 */
  storageKey: string;
  /** 초기 폭 (px) · localStorage 값 없을 때 사용 · 기본 288 */
  defaultWidth?: number;
  /** 최소 폭 (px) · 기본 200 */
  minWidth?: number;
  /** 최대 폭 (px) · 기본 640 */
  maxWidth?: number;
  /** divider hover 색상 · 기본 indigo */
  dividerColor?: DividerColor;
  /** 좌측 컨텐츠 */
  left: React.ReactNode;
  /** 우측 컨텐츠 */
  right: React.ReactNode;
  /** 좌측을 card-panel 로 감쌀지 (기본 true) · false 면 raw wrapper */
  wrapLeft?: boolean;
  /** 우측을 card-panel 로 감쌀지 (기본 true) */
  wrapRight?: boolean;
  /** wrapLeft=false 일 때 모바일 aside 추가 className (max-h 오버라이드 등) */
  leftClassName?: string;
  /** 컨테이너 style (예 · minHeight) */
  style?: React.CSSProperties;
  /** 컨테이너 추가 className */
  className?: string;
  // ── 모바일 모달 옵션 (B-3-2 · 2026-08-04) ──────────────────────────────
  /** 모바일 < lg 에서 우측 패널을 모달로 표시 (기본 true) */
  mobileRightAsModal?: boolean;
  /** 모달 제목 */
  mobileModalTitle?: React.ReactNode;
  /** 모달 열림 상태 (외부 제어) · 미제공 시 내부 state 사용 */
  mobileOpen?: boolean;
  /** 모달 닫기 콜백 */
  onMobileClose?: () => void;
}

/**
 * 공통 마스터-디테일 split 패널
 *   - 폭 조정 · localStorage 자동 저장
 *   - 모바일: 좌측만 표시 · 우측은 모달 (mobileRightAsModal=true 기본)
 *   - 데스크탑: 기존 side-by-side 유지
 *   - 시맨틱 aside/section 태그
 */
export const SplitPanel: React.FC<SplitPanelProps> = ({
  storageKey,
  defaultWidth = 288,
  minWidth = 200,
  // 2026-08-24 · 사용자 지시 · 최대 너비 확장 (640→1200) · 사이드바 앞 여백 · 넓은 화면 UX
  maxWidth = 1200,
  dividerColor = "indigo",
  left,
  right,
  wrapLeft = true,
  wrapRight = true,
  leftClassName = "",
  style,
  className = "",
  mobileRightAsModal = true,
  mobileModalTitle,
  mobileOpen: mobileOpenProp,
  onMobileClose,
}) => {
  const fullKey = STORAGE_PREFIX + storageKey;

  // 초기 폭 · localStorage 우선
  const [listWidth, setListWidth] = useState<number>(() => {
    try {
      const s = localStorage.getItem(fullKey);
      const n = s ? parseInt(s, 10) : NaN;
      return Number.isFinite(n) && n >= minWidth && n <= maxWidth ? n : defaultWidth;
    } catch {
      return defaultWidth;
    }
  });

  // localStorage 저장 (debounce 없음 · 값 변경 시 즉시)
  useEffect(() => {
    try {
      localStorage.setItem(fullKey, String(listWidth));
    } catch {
      // quota / private mode · silent fail
    }
  }, [fullKey, listWidth]);

  // 2026-08-25 · #263 · 반응형 개편 (사용자 지시 "반응형 엉망")
  //   · 데스크탑 기준 lg (1024) → md (768) · 태블릿부터 좌우 배치
  //   · CSS split-container md:flex-row 와 동기
  //   · 창 크기 변경 시 · listWidth 도 함께 clamp (windowWidth * 0.7 max)
  const [isDesktop, setIsDesktop] = useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth >= 768,
  );
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      setIsDesktop(w >= 768);
      // 창 축소 시 · listWidth 가 창 너비 대비 과도하면 자동 clamp (우측 최소 320px 확보)
      setListWidth(prev => {
        const cap = Math.max(minWidth, Math.min(maxWidth, w - 320));
        return prev > cap ? cap : prev;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [minWidth, maxWidth]);

  // 모바일 모달 내부 state (외부 제어 없을 때)
  const [mobileOpenInternal, setMobileOpenInternal] = useState(false);
  const isMobileModalControlled = mobileOpenProp !== undefined;
  const mobileOpen = isMobileModalControlled ? mobileOpenProp : mobileOpenInternal;
  const closeMobileModal = useCallback(() => {
    if (isMobileModalControlled) {
      onMobileClose?.();
    } else {
      setMobileOpenInternal(false);
    }
  }, [isMobileModalControlled, onMobileClose]);

  // ESC 키 · 모바일 모달 닫기
  useEffect(() => {
    if (!mobileRightAsModal || !mobileOpen || isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobileModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileRightAsModal, mobileOpen, isDesktop, closeMobileModal]);

  // 드래그 시작
  const startXRef = useRef<number>(0);
  const startWRef = useRef<number>(0);
  const startResize = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWRef.current = listWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startXRef.current;
      const next = Math.max(minWidth, Math.min(maxWidth, startWRef.current + delta));
      setListWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [listWidth, minWidth, maxWidth]);

  const dividerHoverCls = DIVIDER_HOVER[dividerColor];

  // wrapLeft=false · leftClassName 이 max-h 를 포함하면 기본 max-h-[55vh] 를 적용하지 않음
  // 2026-08-25 · #263 · 42vh → 55vh 완화 · md 부터 좌우 배치 (기존 lg → md 로 완화)
  const hasCustomMaxH = leftClassName.includes("max-h-");
  const leftCls = wrapLeft
    ? "split-left"
    : [
        "w-full shrink-0 flex flex-col min-h-0 min-w-0",
        hasCustomMaxH ? "" : "max-h-[55vh] md:max-h-none",
        leftClassName,
      ].filter(Boolean).join(" ");
  const rightCls = wrapRight ? "split-right" : "flex-1 flex flex-col min-w-0 min-h-0";

  // ── 모바일 모달 렌더링 (mobileRightAsModal=true · 비데스크탑) ──────────────
  const mobileModal = mobileRightAsModal && !isDesktop && mobileOpen ? (
    // 2026-08-17 v2 · frosted backdrop + brand tint + blur (Modal 통일)
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-[2.5vw]"
      style={{ background: "rgba(10, 46, 74, 0.35)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeMobileModal();
      }}
      role="dialog"
      aria-modal="true"
    >
      {/* 2026-08-17 v2 · 3-layer shadow · Attio/Linear */}
      <div
        className="bg-white rounded-2xl w-full max-w-[95vw] max-h-[92vh] flex flex-col overflow-hidden border border-line"
        style={{ boxShadow: "0 1px 3px rgba(10,46,74,0.12), 0 8px 32px -8px rgba(10,46,74,0.24), 0 24px 64px -24px rgba(10,46,74,0.28)" }}
      >
        {/* 모달 헤더 · 2026-08-17 · 최신 트렌드 · accent bar + 폰트 +2 */}
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-line bg-zinc-50/60 shrink-0">
          <AccentBar className="shrink-0" />
          {mobileModalTitle != null && (
            <div className="flex-1 min-w-0 text-[18px] font-bold text-ink break-words whitespace-normal leading-tight tracking-tight">
              {mobileModalTitle}
            </div>
          )}
          <button
            type="button"
            onClick={closeMobileModal}
            className="w-9 h-9 rounded-lg bg-white border border-line hover:border-brand-deep hover:bg-brand-tint flex items-center justify-center text-ink-soft hover:text-brand-deep cursor-pointer shrink-0 transition-colors ml-auto"
            title="닫기 (ESC)"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>
        {/* 모달 바디 · 우측 패널 컨텐츠 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {right}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className={`split-container ${className}`} style={style}>
        {/* 좌측: 리스트 · 폭 조정 */}
        <aside
          className={leftCls}
          style={isDesktop ? { width: `${listWidth}px` } : undefined}
        >
          {left}
        </aside>

        {/* 리사이즈 divider · 데스크탑만 · group 은 @apply 불가 → 클래스로 명시 */}
        <div
          onMouseDown={startResize}
          className={`split-divider group ${dividerHoverCls}`}
          title="드래그하여 좌측 폭 조절"
        >
          <span className="text-[10px] text-zinc-400 group-hover:text-white font-bold rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
        </div>

        {/* 우측: 상세 · 데스크탑만 표시 (모바일은 모달로) */}
        {(!mobileRightAsModal || isDesktop) && (
          <section className={rightCls}>
            {right}
          </section>
        )}
      </div>

      {/* 모바일 모달 · portal 없이 body 레벨 z-50 */}
      {mobileModal}
    </>
  );
};

export default SplitPanel;
