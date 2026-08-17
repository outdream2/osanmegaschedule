// 2026-08-17 · UI 프레임워크 · Panel (surface + title + content)
//   · 목업 톤 · docs/UI_MOCKUP_2026-08-17.html
//   · 우측 사이드 panel · 활동 피드 · 공지사항 · 통계 · 재사용
import type { ReactNode } from "react";

interface PanelProps {
  title: ReactNode;
  /** 우측 상단 · "전체보기" 등 링크 */
  moreLabel?: string;
  onMore?: () => void;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, moreLabel, onMore, children, className = "" }: PanelProps) {
  return (
    <div className={`bg-white border border-line rounded-[14px] p-4 shadow-sm ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[15px] font-bold text-ink">{title}</div>
        {moreLabel && onMore && (
          <button type="button" onClick={onMore} className="text-[13px] text-brand font-semibold cursor-pointer hover:underline">
            {moreLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
