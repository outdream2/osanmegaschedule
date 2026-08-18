// 2026-08-17 · 사용자 지시 · 매장 구역 설정 페이지
//   · useZoneDefs 훅 · settings.zone_defs 서버 저장 · 모든 zone 소비자 자동 반영
//   · 표 형식 · label + category (설명) 편집 · 저장 자동 (debounce)
//   · Phase 1 · 편집만 (추가/삭제 · num 재배정 · A/B split 편집 · Phase 2)
//   · 대원칙 · 최신 트렌드 · 딥네이비 accent · 파스텔·배지·이모지 지양
import React from "react";
import { MapPin } from "@phosphor-icons/react";
import { SettingsPageShell } from "../common/SettingsPageShell";
import { AccentBar } from "../common/AccentBar";
import { useZoneDefs, SECTION_LABEL, type ZoneSection } from "../../hooks/useZoneDefs";
// 2026-08-17 · 사용자 지시 · 매장구역도와 매핑 · StoreZoneMap 미리보기
import { StoreZoneMap } from "../common/StoreZoneMap";
import type { AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";

interface Props {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

const SECTION_ORDER: ZoneSection[] = ["top_wall", "aisle", "left_wall", "bottom_wall", "wing", "event"];

const ZoneSettingsPage: React.FC<Props> = ({ authSession, onBack, onNavigate, onLogout }) => {
  const { zones, setZones, saveState } = useZoneDefs();

  const updateZone = (num: number, patch: { label?: string; category?: string }) => {
    setZones(prev => prev.map(z => (z.num === num ? { ...z, ...patch } : z)));
  };

  // section 별 그룹
  const grouped = SECTION_ORDER.map(section => ({
    section,
    label: SECTION_LABEL[section],
    zones: zones.filter(z => z.section === section).sort((a, b) => a.num - b.num),
  })).filter(g => g.zones.length > 0);

  const saveBadge = (() => {
    if (saveState === "saving") return { text: "저장 중…", tone: "text-ink-soft" };
    if (saveState === "saved") return { text: "저장됨", tone: "text-emerald-600" };
    if (saveState === "error") return { text: "저장 실패", tone: "text-rose-600" };
    return null;
  })();

  return (
    <SettingsPageShell
      activePage="zone-labels"
      authSession={authSession}
      onBack={onBack}
      onNavigate={onNavigate}
      onLogout={onLogout}
      icon={MapPin}
      title="매장 구역 설정"
      description="구역 번호별 이름·상세 카테고리를 편집합니다. 편집 즉시 스케쥴·매장구역도 등 모든 곳에 자동 반영됩니다."
      iconColor="text-brand-deep"
      maxWidth="max-w-[1100px]"
      rightSlot={saveBadge && (
        <span className={`text-[13px] font-semibold ${saveBadge.tone}`}>{saveBadge.text}</span>
      )}
    >
      <div className="space-y-5">
        {/* 매장구역도 미리보기 · 실시간 반영 · useZoneDefs 훅으로 자동 sync */}
        <section className="bg-white border border-line rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2.5 px-5 py-3 border-b border-line bg-zinc-50/60">
            <AccentBar />
            <h2 className="text-[17px] font-bold text-ink tracking-tight">매장 구역도 미리보기</h2>
            <span className="text-[13px] font-medium text-ink-soft">· 편집 즉시 반영</span>
          </div>
          <div className="p-3 overflow-x-auto">
            <StoreZoneMap compact />
          </div>
        </section>

        {grouped.map(({ section, label, zones: sectionZones }) => (
          <section key={section} className="bg-white border border-line rounded-2xl overflow-hidden shadow-sm">
            {/* Section 헤더 · 딥네이비 accent bar */}
            <div className="flex items-center gap-2.5 px-5 py-3 border-b border-line bg-zinc-50/60">
              <AccentBar />
              <h2 className="text-[17px] font-bold text-ink tracking-tight">{label}</h2>
              <span className="text-[14px] font-medium text-ink-soft tabular-nums">· {sectionZones.length}개</span>
            </div>

            {/* Zone 표 · num · label · category (편집) */}
            <div className="divide-y divide-line">
              {/* 컬럼 헤더 */}
              <div className="grid grid-cols-[60px_minmax(0,1fr)_minmax(0,2fr)] sm:grid-cols-[80px_minmax(0,180px)_minmax(0,1fr)] gap-3 px-5 py-2.5 bg-white text-[13px] font-semibold text-ink-soft uppercase tracking-wider">
                <div>번호</div>
                <div>이름</div>
                <div>상세 카테고리</div>
              </div>
              {sectionZones.map(z => (
                <div key={z.num} className="grid grid-cols-[60px_minmax(0,1fr)_minmax(0,2fr)] sm:grid-cols-[80px_minmax(0,180px)_minmax(0,1fr)] gap-3 px-5 py-2.5 items-center hover:bg-brand-tint/40 transition-colors">
                  <div className="text-[15px] font-bold text-ink tabular-nums">{z.num}번</div>
                  <div>
                    <input
                      type="text"
                      value={z.label}
                      onChange={e => updateZone(z.num, { label: e.target.value })}
                      className="w-full text-[15px] font-semibold text-ink rounded-lg border border-line focus:border-brand-deep focus:ring-2 focus:ring-brand-tint px-2.5 py-1.5 bg-white focus:outline-none transition-colors"
                      placeholder="구역 이름"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={z.category}
                      onChange={e => updateZone(z.num, { category: e.target.value })}
                      className="w-full text-[14px] text-ink rounded-lg border border-line focus:border-brand-deep focus:ring-2 focus:ring-brand-tint px-2.5 py-1.5 bg-white focus:outline-none transition-colors"
                      placeholder="예: 오메가3 · 유산균 · 종합비타민"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* 안내 */}
        <div className="text-[13px] text-ink-soft leading-relaxed px-1">
          <b className="text-ink">TIP</b> · 편집한 값은 자동 저장됩니다 (0.5초 debounce). 서버 저장 후 스케쥴표·매장구역도·구역 배정 등 전 앱에 즉시 반영됩니다.
          <br />
          Phase 2 예정 · 새 구역 추가·삭제 (1~100번 지원) · A/B 좌우 서브존 편집 · 매장구역도 시각 편집기.
        </div>
      </div>
    </SettingsPageShell>
  );
};

export default ZoneSettingsPage;
