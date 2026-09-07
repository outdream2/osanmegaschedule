// src/components/SettingsHubPage/SettingsHubPage.tsx
// 2026-09-07 · 사용자 지시 · 설정 허브 페이지 · 모든 설정 통합 진입점
//   · 목업 (UI_MOCKUP_2026-08-21) 톤 · 카드 그리드 · 시인성 최우선
//   · 각 카드 · 아이콘타일 + 제목 + 설명 + 카테고리 배지 + 상태 표시

import React from "react";
import {
  Lock, CalendarBlank, Buildings, Calendar, Gear, Truck,
  CaretRight, House,
} from "@phosphor-icons/react";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";

interface Props {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

interface SettingsCard {
  key: AppNavPage;
  title: string;
  description: string;
  icon: React.ElementType;
  category: "권한" | "조직" | "운영" | "시스템";
  categoryColor: string;
  accent: string; // gradient tailwind classes
}

const CARDS: SettingsCard[] = [
  {
    key: "permissions",
    title: "메뉴 설정",
    description: "페이지별 권한 · 직원 레벨 · 직군 관리 · 사이드바 표시",
    icon: Lock,
    category: "권한",
    categoryColor: "bg-rose-50 text-rose-700 border-rose-200",
    accent: "from-rose-500 to-rose-600",
  },
  {
    key: "schedule-settings",
    title: "스케줄 설정",
    description: "직군별 기본 연차일수 · 근무 규칙",
    icon: CalendarBlank,
    category: "조직",
    categoryColor: "bg-sky-50 text-sky-700 border-sky-200",
    accent: "from-sky-500 to-sky-600",
  },
  {
    key: "company-info",
    title: "회사·브랜드",
    description: "사업자 정보 · 로고·색상 · 대표 연락처 · 도장 매핑",
    icon: Buildings,
    category: "조직",
    categoryColor: "bg-sky-50 text-sky-700 border-sky-200",
    accent: "from-indigo-500 to-indigo-600",
  },
  {
    key: "season-settings",
    title: "통계 설정",
    description: "계절 정의 (봄·여름·가을·겨울) · 적정재고 산정 기간 · 판매중 필터",
    icon: Calendar,
    category: "운영",
    categoryColor: "bg-amber-50 text-amber-700 border-amber-200",
    accent: "from-amber-500 to-orange-500",
  },
  {
    key: "order-settings",
    title: "발주 설정",
    description: "발주 이메일 (SMTP) · 테스트 발송 · 발주 규칙·템플릿",
    icon: Truck,
    category: "운영",
    categoryColor: "bg-amber-50 text-amber-700 border-amber-200",
    accent: "from-emerald-500 to-teal-600",
  },
  {
    key: "system-settings",
    title: "시스템 설정",
    description: "DB·인증 · AI/OCR · 알림톡·SMS · 이미지 CDN · Web Push · 데이터 업로드",
    icon: Gear,
    category: "시스템",
    categoryColor: "bg-zinc-100 text-zinc-700 border-zinc-300",
    accent: "from-brand-deep to-brand",
  },
];

export const SettingsHubPage: React.FC<Props> = ({ authSession, onBack, onNavigate, onLogout }) => {
  return (
    <div className="min-h-screen bg-[#F4F7FA] flex flex-col">
      <AppNavHeader
        activePage={"settings-hub" as AppNavPage}
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />
      <main className="flex-1 max-w-[1360px] w-[85%] mx-auto px-4 py-5 flex flex-col gap-5">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[15px] text-ink-soft font-medium -mb-1">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 hover:text-brand-deep transition cursor-pointer"
            title="홈으로"
          >
            <House size={12} weight="fill" /> 홈
          </button>
          <CaretRight size={11} className="text-zinc-300" />
          <span className="text-ink font-bold">설정</span>
        </nav>

        {/* Header · 목업 톤 (SettingsPageShell 와 동일 시각 스타일) */}
        <header className="relative overflow-hidden bg-white border border-line rounded-2xl shadow-[0_1px_2px_rgba(10,46,74,0.04),0_4px_12px_-4px_rgba(10,46,74,0.06)]">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-brand-deep via-brand to-[#3E7CB1]" />
          <div className="px-5 pt-5 pb-4 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-deep to-brand shadow-[0_2px_8px_-1px_rgba(10,46,74,0.25)] flex items-center justify-center shrink-0">
              <Gear size={20} weight="fill" className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-[22px] font-extrabold text-ink leading-tight tracking-tight">설정 · 시스템 관리 허브</h1>
              <p className="text-[15px] text-ink-soft mt-1 leading-relaxed">
                권한·조직·운영·시스템 관련 모든 설정을 한 곳에서 관리합니다. 카테고리별로 정리된 카드를 클릭하여 각 설정으로 진입하세요.
              </p>
            </div>
          </div>
        </header>

        {/* 카테고리별 카드 그룹 */}
        {(["권한", "조직", "운영", "시스템"] as const).map((cat) => {
          const items = CARDS.filter(c => c.category === cat);
          if (items.length === 0) return null;
          return (
            <section key={cat} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 px-1">
                <span className="inline-block w-[3px] h-4 rounded-sm bg-gradient-to-b from-brand-soft to-brand-deep" />
                <h2 className="text-[15px] font-bold text-ink tracking-tight">{cat}</h2>
                <span className="text-[13px] font-semibold text-ink-soft tabular-nums">{items.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((c) => {
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => onNavigate?.(c.key)}
                      className="group relative overflow-hidden text-left bg-white border border-line rounded-2xl p-4
                        shadow-[0_1px_2px_rgba(10,46,74,0.04),0_4px_12px_-4px_rgba(10,46,74,0.06)]
                        hover:shadow-[0_2px_8px_rgba(10,46,74,0.08),0_12px_28px_-8px_rgba(10,46,74,0.18)]
                        hover:-translate-y-0.5 hover:border-brand-deep/30
                        transition-all duration-200 cursor-pointer"
                    >
                      {/* 3px top accent · 카테고리별 그라디언트 */}
                      <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${c.accent} opacity-90`} />
                      <div className="flex items-start gap-3">
                        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${c.accent} shadow-[0_2px_8px_-1px_rgba(10,46,74,0.25)] flex items-center justify-center shrink-0`}>
                          <Icon size={20} weight="fill" className="text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md border tracking-tight ${c.categoryColor}`}>
                              {c.category}
                            </span>
                          </div>
                          <h3 className="text-[16px] font-bold text-ink tracking-tight leading-tight">{c.title}</h3>
                          <p className="text-[13px] text-ink-soft leading-relaxed mt-1.5 line-clamp-2">{c.description}</p>
                        </div>
                        <CaretRight
                          size={16}
                          weight="bold"
                          className="text-zinc-300 group-hover:text-brand-deep transition-colors shrink-0 mt-1"
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        {/* 도움말 · 목업 톤 */}
        <section className="bg-brand-tint/40 border border-brand-deep/15 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-deep/10 flex items-center justify-center shrink-0">
            <Gear size={16} weight="bold" className="text-brand-deep" />
          </div>
          <div className="text-[14px] text-ink leading-relaxed">
            <span className="font-bold text-brand-deep">TIP.</span>{" "}
            시스템 설정 항목 중 일부는 저장 후 서버 재시작이 필요할 수 있습니다.
            발주 설정의 SMTP · 세션 타임아웃 · 자동 임포트 등은 즉시 반영됩니다.
          </div>
        </section>
      </main>
    </div>
  );
};

export default SettingsHubPage;
