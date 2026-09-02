// src/components/layout/AppFooter.tsx
// 전체 페이지 공통 하단 푸터
// 2026-08-12 · 프레임워크 · brand_identity·contact_info 반영 · 값 없으면 하드코딩 fallback 유지
// 2026-08-23 · #205 · 확장 · version · extraLinks · className props · 하위 호환 100%
import React from "react";
import { MapPin, Clock } from "lucide-react";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import { useContactInfo } from "../../hooks/useContactInfo";

export interface AppFooterExtraLink {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface AppFooterProps {
  /** 축약 모드 · 위치·시간 숨김 · 브랜드·copyright 만 (좁은 컨텍스트) */
  compact?: boolean;
  /** 버전 표시 · 예 "v1.2.3" · 미지정 시 미노출 */
  version?: string;
  /** 추가 링크 (이용약관 · 개인정보 등) · 우측 정렬 */
  extraLinks?: AppFooterExtraLink[];
  /** 추가 className · sticky · fixed 등 특수 케이스 */
  className?: string;
}

/**
 * 앱 공통 푸터 · 모든 페이지 하단 통일
 *   · 기본 · brand shortName · businessHours · copyright
 *   · 확장 · version · extraLinks (옵셔널)
 *   · Linear/Vercel 톤 · 얇은 통일 UX
 */
export const AppFooter: React.FC<AppFooterProps> = ({
  compact = false,
  version,
  extraLinks,
  className = "",
}) => {
  const { brand } = useBrandIdentity();
  const { contact } = useContactInfo();
  const hours = contact.businessHours || "09:00 - 22:00";
  const shortName = brand.shortName || "오산메가타운";
  // 2026-09-02 · 사용자 지시 · 최신 트렌드 · 통일 카피라이트 · IRUMs · since 2026
  return (
    <footer
      className={[
        "w-full flex items-center justify-center gap-x-3 gap-y-1 py-2.5 text-[12px] font-medium text-zinc-500 flex-wrap tracking-tight",
        className,
      ].filter(Boolean).join(" ")}
      role="contentinfo"
    >
      <span className="inline-flex items-center gap-1.5">
        <MapPin size={12} className="text-zinc-400" />
        <span className="text-zinc-600 font-semibold">{shortName}</span>
      </span>
      {!compact && (
        <>
          <span className="w-1 h-1 rounded-full bg-zinc-300" />
          <span className="inline-flex items-center gap-1.5">
            <Clock size={12} className="text-zinc-400" />
            <span className="tabular-nums">{hours}</span>
          </span>
        </>
      )}
      <span className="w-1 h-1 rounded-full bg-zinc-300" />
      <span className="inline-flex items-center gap-1 text-zinc-500">
        <span className="text-zinc-400">©</span>
        <span className="font-bold tracking-wide text-brand-deep">IRUMs</span>
        <span className="text-zinc-500">(주) 이룸즈</span>
        <span className="text-zinc-400 tabular-nums">since 2026</span>
      </span>
      {version && (
        <>
          <span className="w-1 h-1 rounded-full bg-zinc-300" />
          <span className="tabular-nums font-mono text-zinc-400 text-[11px]">{version}</span>
        </>
      )}
      {extraLinks && extraLinks.length > 0 && (
        <span className="inline-flex items-center gap-3 ml-auto">
          {extraLinks.map((l, i) => (
            <a
              key={`${l.label}-${i}`}
              href={l.href}
              onClick={l.onClick ? (e) => { if (!l.href) e.preventDefault(); l.onClick?.(); } : undefined}
              className="text-zinc-500 hover:text-brand-deep transition-colors cursor-pointer text-[12px] font-medium"
              target={l.href?.startsWith("http") ? "_blank" : undefined}
              rel={l.href?.startsWith("http") ? "noopener noreferrer" : undefined}
            >
              {l.label}
            </a>
          ))}
        </span>
      )}
    </footer>
  );
};
