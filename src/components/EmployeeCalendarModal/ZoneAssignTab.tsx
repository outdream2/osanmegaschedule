// 2026-08-17 · 사용자 지시 · 구역 배정 · 최신 트렌드 · 깔끔·세련·고급 · 배지·이모지 지양 · 딥네이비 accent
//   · 프레임워크 · ZONE_DEFS (constants/displayZones.ts) 공통 · DisplayPage/StoreZoneMap 과 정합
//   · TODO Phase 2 · zone defs 서버 저장 (settings 페이지 편집) · DB 마이그레이션 · 별도 태스크
import React, { useState } from "react";
import { MapPin, Save, X } from "lucide-react";
import { Employee } from "../../types";
import { useZoneDefs, SECTION_LABEL, type ZoneSection } from "../../hooks/useZoneDefs";

export interface LogisticsZoneProps {
  assignedZoneNums: number[];
  onToggle: (zoneNum: number) => void;
  onClearAll: () => void;
  onSaveToDow?: (dow: number) => Promise<void>;
}

const SECTION_ORDER: ZoneSection[] = ["top_wall", "aisle", "left_wall", "bottom_wall", "wing"];
const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export const ZoneAssignTab: React.FC<{
  employee: Employee;
  assignedZoneNums: number[];
  onToggle: (num: number) => void;
  onClearAll: () => void;
  onSaveToDow?: (dow: number) => Promise<void>;
}> = ({ employee, assignedZoneNums, onToggle, onClearAll, onSaveToDow }) => {
  // 2026-08-17 · 프레임워크 훅 · 정적 ZONE_DEFS · 향후 서버/설정 편집 반영
  const { zones: ZONE_DEFS } = useZoneDefs();
  const [selectedDows, setSelectedDows] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const toggleDow = (dow: number) => {
    setSelectedDows(prev => {
      const next = new Set(prev);
      if (next.has(dow)) next.delete(dow); else next.add(dow);
      return next;
    });
  };

  const handleSaveToDows = async () => {
    if (!onSaveToDow || selectedDows.size === 0) return;
    setSaving(true);
    try {
      for (const dow of selectedDows) {
        await onSaveToDow(dow);
      }
      setSelectedDows(new Set());
    } finally {
      setSaving(false);
    }
  };
  const grouped = SECTION_ORDER.map((section) => ({
    section,
    label: SECTION_LABEL[section],
    zones: ZONE_DEFS.filter((z) => z.section === section),
  }));

  const sortedAssigned = [...assignedZoneNums].sort((a, b) => a - b);

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
      {/* Summary · 배지 지양 · 텍스트 + 아이콘 · 딥네이비 accent */}
      <div className="flex items-start justify-between gap-3 bg-brand-tint border border-brand/15 rounded-xl px-4 py-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <MapPin size={16} strokeWidth={2.2} className="text-brand-deep shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-[15px] font-bold text-brand-deep tracking-tight">{employee.name}님 배정 구역</div>
            <div className="text-[14px] font-semibold text-brand-deep/80 mt-0.5 tabular-nums">
              {sortedAssigned.length > 0 ? `${sortedAssigned.join(", ")}번 · 총 ${sortedAssigned.length}개` : "미배정"}
            </div>
          </div>
        </div>
        {sortedAssigned.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-[14px] font-semibold text-rose-600 hover:text-rose-800 hover:bg-white/60 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            전체 해제
          </button>
        )}
      </div>

      {/* DOW 템플릿 저장 · 배지 지양 · flat card · 딥네이비 톤 */}
      {onSaveToDow && (
        <div className="border border-line rounded-xl px-4 py-3 space-y-2.5 bg-white">
          <div className="flex items-center gap-2.5">
            <span className="w-[3px] h-[16px] rounded-full bg-brand-deep" />
            <span className="text-[15px] font-bold text-ink tracking-tight">요일 템플릿 저장</span>
            <span className="text-[13px] font-medium text-ink-soft">— 현재 배정을 선택 요일 기본값으로 저장</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {DOW_LABELS.map((label, dow) => {
              const active = selectedDows.has(dow);
              return (
                <button
                  key={dow}
                  type="button"
                  onClick={() => toggleDow(dow)}
                  className={`w-9 h-9 text-[14px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                    active
                      ? "bg-brand-deep text-white border-brand-deep shadow-sm"
                      : "bg-white text-ink border-line hover:border-brand-deep hover:bg-brand-tint"
                  }`}
                >
                  {label}
                </button>
              );
            })}
            {selectedDows.size > 0 && (
              <div className="flex items-center gap-1.5 ml-1">
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveToDows}
                  className="h-9 px-3.5 text-[14px] font-semibold rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                >
                  <Save size={13} strokeWidth={2.2} />
                  {saving ? "저장 중…" : `저장 · ${selectedDows.size}요일`}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDows(new Set())}
                  className="h-9 w-9 flex items-center justify-center rounded-lg bg-white text-ink-soft hover:bg-zinc-100 border border-line cursor-pointer transition-colors"
                  aria-label="선택 해제"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Zone groups · section 별 · 배지·checkmark 지양 · border 톤 통일 · 폰트 +3 */}
      {grouped.map(({ section, label, zones }) => (
        <section key={section} className="space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="w-[3px] h-[14px] rounded-full bg-brand-deep/70" />
            <div className="text-[14px] font-bold text-ink tracking-tight">{label}</div>
            <span className="text-[13px] font-medium text-ink-soft tabular-nums">· {zones.length}개</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {zones.map((z) => {
              const isAssigned = assignedZoneNums.includes(z.num);
              return (
                <button
                  key={z.num}
                  type="button"
                  onClick={() => onToggle(z.num)}
                  className={`rounded-lg border p-2 text-left transition-colors cursor-pointer ${
                    isAssigned
                      ? "bg-brand-deep border-brand-deep text-white shadow-sm"
                      : "bg-white border-line text-ink hover:border-brand-deep hover:bg-brand-tint"
                  }`}
                >
                  <div className={`text-[14px] font-bold leading-tight tabular-nums ${isAssigned ? "text-white" : "text-ink"}`}>
                    {z.num}번
                  </div>
                  <div className={`text-[12px] leading-snug mt-1 line-clamp-2 ${isAssigned ? "text-white/85" : "text-ink-soft"}`}>
                    {z.label}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};
