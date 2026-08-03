// src/components/common/SplitPanel.tsx
// 2026-08-03 (#183) · 공통 마스터-디테일 split 패널
//   - 좌측 (list) + divider (drag resize) + 우측 (detail)
//   - 데스크탑 (lg:1024px+) · 가로 배치 + 폭 조정 · localStorage 저장
//   - 모바일 (< lg) · 세로 스택 · 좌측은 max-h 제한 · 스크롤
//   - dividerColor · 프리셋 (indigo · teal · emerald 등) · hover 컬러 강조
//
// 사용 예:
//   <SplitPanel
//     storageKey="staffManage.listWidth"
//     defaultWidth={288}
//     minWidth={200}
//     maxWidth={640}
//     dividerColor="indigo"
//     left={<div>...</div>}
//     right={<div>...</div>}
//   />
//
// storageKey 는 localStorage 에 자동 저장 (megatown_ prefix 붙음)
// 좌측 aside · 우측 section 시맨틱 · card-panel 스타일 자동 적용

import React, { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_PREFIX = "megatown_"; // 앱 관례 (useAuth · settings 와 동일)

type DividerColor = "indigo" | "teal" | "sky" | "emerald" | "amber" | "rose" | "violet";

const DIVIDER_HOVER: Record<DividerColor, string> = {
  indigo:  "hover:bg-indigo-400",
  teal:    "hover:bg-teal-400",
  sky:     "hover:bg-sky-400",
  emerald: "hover:bg-emerald-400",
  amber:   "hover:bg-amber-400",
  rose:    "hover:bg-rose-400",
  violet:  "hover:bg-violet-400",
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
  /** 컨테이너 style (예 · minHeight) */
  style?: React.CSSProperties;
  /** 컨테이너 추가 className */
  className?: string;
}

/**
 * 공통 마스터-디테일 split 패널
 *   - 폭 조정 · localStorage 자동 저장
 *   - 모바일 반응형 (세로 스택)
 *   - 시맨틱 aside/section 태그
 */
export const SplitPanel: React.FC<SplitPanelProps> = ({
  storageKey,
  defaultWidth = 288,
  minWidth = 200,
  maxWidth = 640,
  dividerColor = "indigo",
  left,
  right,
  wrapLeft = true,
  wrapRight = true,
  style,
  className = "",
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

  // 데스크탑 여부 (lg breakpoint)
  const [isDesktop, setIsDesktop] = useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth >= 1024,
  );
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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

  const leftCls = wrapLeft ? "split-left" : "w-full shrink-0 flex flex-col min-h-0 max-h-[42vh] lg:max-h-none";
  const rightCls = wrapRight ? "split-right" : "flex-1 flex flex-col min-w-0 min-h-0";

  return (
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
        <span className="text-[10px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
      </div>

      {/* 우측: 상세 */}
      <section className={rightCls}>
        {right}
      </section>
    </div>
  );
};

export default SplitPanel;
