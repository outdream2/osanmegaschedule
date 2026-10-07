// src/components/common/ShelfPositionsBadge.tsx
// 2026-09-08 · 상세 진열위치 표시 (읽기 전용)
// 2026-09-09 · 사용자 지시 · 배지 스타일 제거 · 순수 텍스트로
//   · 미입력 매장 · 빨간 텍스트 강조 유지 (기능적 시각 신호)
//   · 있는 위치 · brand-deep 텍스트 · 구분자 " · "
//   · 이름은 하위호환 유지 · 실제 렌더는 배지 아님
// 2026-10-07 · 사용자 지시 · variant="zone" 추가 · 현재 진열위치 compact label 표시
//   · 입력 · zonePositions · structured position 배열 (대분류+중분류)
//   · 출력 · "9A · 21 · 뷰티1"
//   · 상세 (3자리 shelf detail) 미사용 · summarizeShelfZoneLabels SSOT 재사용

import React from "react";
import { formatShelfPositions, formatShelfDetail, summarizeShelfZoneLabels, type ShelfPositions, type ZoneLabelInput } from "../../lib/shelfPositions";
import { useStorageLocations } from "../../hooks/useStorageLocations";

export interface ShelfPositionsBadgeProps {
  positions: ShelfPositions | null | undefined;
  size?: "sm" | "md";       // sm · 리스트 · md · 상세 패널
  /** 2026-09-09 · 매장구역 UI 스타일 상속 · 사용자 지시 · 색만 다르게
   *  · "text" · 매장구역이 텍스트인 곳 (기본)
   *  · "badge" · 매장구역이 배지인 곳 · 같은 pill 스타일 · 색만 rose 계열
   *  · "zone" · 2026-10-07 · 현재 진열위치 compact label ("9A · 21 · 뷰티1")
   *    · zonePositions prop 사용 · positions (상세) 무시 */
  variant?: "text" | "badge" | "zone";
  /** 2026-10-07 · variant="zone" 전용 · structured position 배열
   *  · 각 position 은 { major, middle } (또는 호환 필드명)
   *  · summarizeShelfZoneLabels SSOT 로 요약 */
  zonePositions?: ReadonlyArray<ZoneLabelInput | null | undefined> | null;
  className?: string;
}

export const ShelfPositionsBadge: React.FC<ShelfPositionsBadgeProps> = ({ positions, size = "sm", variant = "text", zonePositions, className = "" }) => {
  // 2026-10-07 · variant="zone" · compact zone label 표시 (상세 X · structured position 사용)
  if (variant === "zone") {
    const summary = summarizeShelfZoneLabels(zonePositions);
    const sizeCls = size === "md" ? "text-[14px]" : "text-[13px]";
    const toneCls = summary === "-" ? "text-zinc-400 font-medium" : "text-ink-soft font-semibold tabular-nums";
    return (
      <span className={`inline-flex items-baseline ${sizeCls} ${toneCls} ${className}`}>
        {summary}
      </span>
    );
  }

  const locations = useStorageLocations();
  if (!locations.length) return null;
  const list = formatShelfPositions(positions, locations);

  // 2026-09-09 · 사용자 지시 · 데이터 없어도 "비어있음" 뱃지 항상 노출
  if (list.length === 0) {
    if (variant === "badge") {
      const pillBase = size === "md"
        ? "inline-flex items-center gap-1 h-8 rounded-full px-2.5 border-2 text-[14px] font-bold tabular-nums tracking-tight"
        : "inline-flex items-center gap-1 h-7 rounded-full px-2 border-2 text-[13px] font-bold tabular-nums tracking-tight";
      return (
        <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
          <span
            className={`${pillBase} bg-zinc-50 border-dashed border-zinc-300 text-zinc-500`}
            title="상세구역 미입력"
          >
            비어있음
          </span>
        </span>
      );
    }
    // text variant fallback
    return (
      <span className={`inline-flex items-baseline ${size === "md" ? "text-[14px]" : "text-[13px]"} text-zinc-400 font-medium ${className}`}>
        비어있음
      </span>
    );
  }

  const sizeCls = size === "md" ? "text-[14px]" : "text-[13px]";

  // 2026-09-09 v2 · badge variant · 매장구역 pill 톤 완전 통일 (사용자 지시)
  //   · 형태 · h-8 rounded-full border-2 · 매장구역·창고구역 pill 과 동일 규격
  //   · 색상 · store → violet (매장구역과 통일) · warehouse → cyan (창고구역과 통일) · 미입력 → rose (경고)
  if (variant === "badge") {
    const pillBase = size === "md"
      ? "inline-flex items-center gap-1 h-8 rounded-full px-2.5 border-2 text-[14px] font-bold tabular-nums tracking-tight"
      : "inline-flex items-center gap-1 h-7 rounded-full px-2 border-2 text-[13px] font-bold tabular-nums tracking-tight";
    const toneFor = (p: (typeof list)[number]) => {
      if (p.isMissing) return "bg-rose-50 border-rose-300 text-rose-700";
      if (p.kind === "store") return "bg-indigo-50 border-indigo-300 text-indigo-700";
      return "bg-cyan-50 border-cyan-200 text-cyan-700";
    };
    return (
      <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
        {list.map(p => (
          <span
            key={p.code}
            className={`${pillBase} ${toneFor(p)}`}
            title={p.detail ? `${p.name} · ${formatShelfDetail(p.detail)}` : p.isMissing ? `${p.name} · 상세위치 미입력` : p.name}
          >
            <span className="opacity-70 font-semibold text-[12px]">{p.name}</span>
            <span className="font-bold">{p.detail ? formatShelfDetail(p.detail) : p.isMissing ? "미입력" : ""}</span>
          </span>
        ))}
      </span>
    );
  }

  // text variant · 기본 · 인라인 텍스트 · " · " 구분자
  return (
    <span className={`inline-flex flex-wrap items-baseline ${sizeCls} ${className}`}>
      {list.map((p, idx) => (
        <React.Fragment key={p.code}>
          {idx > 0 && <span className="text-zinc-300 mx-1">·</span>}
          <span
            className={
              p.isMissing
                ? "text-rose-600 font-semibold tabular-nums"
                : p.detail
                  ? "text-rose-600 font-semibold tabular-nums"
                  : "text-ink-soft font-medium tabular-nums"
            }
            title={p.detail ? `${p.name} · ${formatShelfDetail(p.detail)}` : p.isMissing ? `${p.name} · 상세위치 미입력` : p.name}
          >
            <span className="text-zinc-500 font-medium mr-0.5">{p.name}</span>
            {p.detail ? formatShelfDetail(p.detail) : p.isMissing ? <span className="text-rose-500">미입력</span> : ""}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
};

export default ShelfPositionsBadge;
