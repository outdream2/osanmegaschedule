// src/components/CompanyInfoSettingsPage/CompanyInfoSettingsPage.tsx
// 2026-08-12 · 회사·브랜드 통합 설정 페이지 (관리자 lv≥9 전용)
//   · Plan B · 2026-09-18 · sticky nav 제거 → 좌측 anchor rail (IntersectionObserver)
//   · useCompanyInfo / useBrandIdentity · settings.* KV 서버 저장 (debounce 500ms)
//   · 계약서·사직서·PDF·랜딩·푸터 등 다른 화면에서 즉시 참조
import React, { useCallback, useEffect, useRef, useState } from "react";
// @deprecated · SK_COMPANY_INFO_TAB · Plan B 이전 탭 상태 저장 · 2026-09-18 이후 미사용
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { SK_COMPANY_INFO_TAB } from "../../lib/storageKeys";
import {
  Buildings, User, IdentificationBadge, MapPin, Phone,
  Palette, TextT,
  AddressBook, Stamp,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import type { AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";
import { useCompanyInfo } from "../../hooks/useCompanyInfo";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import { ImageUploadField } from "../common/ImageUploadField";
import { SettingsPageShell } from "../common/SettingsPageShell";
import { StatusPill } from "../common/StatusPill";
// 2026-08-29 · #122 P2 · SectionCard 프리미티브
import { SectionCard } from "../common/SectionCard";
// 2026-08-12 · 연락처·도장 개별 섹션
import { ContactSection, StampsSection } from "../BrandingSettingsPage/BrandingSettingsPage";
import { SET_LABEL, SET_INPUT } from "../../lib/settingsTypography";
import { Spinner } from "../common/Spinner";

interface Props {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

// 2026-08-31 · 폰트 +2 (탭메뉴 이하 모든 필드)
const LABEL_CLS = "flex items-center gap-1.5 text-[15px] font-bold text-ink mb-1.5";
const INPUT_CLS =
  "w-full h-11 bg-[#FAFBFC] border border-line rounded-[10px] px-3 text-[16px] font-medium text-ink " +
  "focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint focus:bg-white " +
  "transition disabled:opacity-50";
void SET_LABEL; void SET_INPUT;

// 2026-09-18 · Plan B · anchor rail 항목
type SectionId = "section-company" | "section-brand" | "section-contact" | "section-stamps";
const RAIL_ITEMS: Array<{ id: SectionId; label: string; Icon: PhosphorIcon }> = [
  { id: "section-company", label: "사업장·법인",   Icon: Buildings   },
  { id: "section-brand",   label: "브랜드",        Icon: Palette     },
  { id: "section-contact", label: "연락처·카카오", Icon: AddressBook },
  { id: "section-stamps",  label: "도장 매핑",     Icon: Stamp       },
];

const CompanyInfoSettingsPage: React.FC<Props> = ({ onBack, authSession, onNavigate, onLogout }) => {
  const { info, setInfo, loaded, saveState } = useCompanyInfo();
  const { brand, setBrand } = useBrandIdentity();

  // 2026-09-18 · Plan B · IntersectionObserver 기반 현재 섹션 추적
  const [activeSection, setActiveSection] = useState<SectionId>("section-company");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const sectionIds = RAIL_ITEMS.map(r => r.id);
    const ratioMap = new Map<string, number>(sectionIds.map(id => [id, 0]));

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          ratioMap.set(entry.target.id, entry.intersectionRatio);
        });
        // 가장 높은 교차 비율 섹션 선택
        let maxRatio = -1;
        let topId: SectionId = "section-company";
        ratioMap.forEach((ratio, id) => {
          if (ratio > maxRatio) {
            maxRatio = ratio;
            topId = id as SectionId;
          }
        });
        setActiveSection(topId);
      },
      { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1.0] }
    );

    sectionIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) observerRef.current!.observe(el);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  const handleRailClick = useCallback((id: SectionId) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(id);
    }
  }, []);

  const badgeText =
    saveState === "saving" ? "저장 중..." :
    saveState === "saved"  ? "저장됨" :
    saveState === "error"  ? "오류" : "";
  const badgeTone: "amber" | "emerald" | "rose" | null =
    saveState === "saving" ? "amber" :
    saveState === "saved"  ? "emerald" :
    saveState === "error"  ? "rose" : null;

  return (
    <SettingsPageShell
      activePage={"company-info" as AppNavPage}
      authSession={authSession}
      onBack={onBack}
      onNavigate={onNavigate}
      onLogout={onLogout}
      icon={Buildings}
      iconColor="text-indigo-500"
      title="회사·브랜드"
      description="근로계약서·사직서·PDF·랜딩·푸터 등에 표시되는 사업장 정보 · 앱 브랜딩 · 연락처 · 도장을 한 곳에서 관리합니다. 관리자(lv 9) 전용. (모바일 가시성은 '메뉴 설정' 페이지로 이동됨)"
      rightSlot={badgeText && badgeTone ? (
        <StatusPill tone={badgeTone} size="sm" dot pulse={saveState === "saving"}>
          {badgeText}
        </StatusPill>
      ) : undefined}
    >
      {/* 2026-09-18 · Plan B · 좌 aside rail + 우 스크롤 레이아웃 */}
      <div className="flex gap-6 items-start">

        {/* ── 좌측 anchor rail · 데스크탑(≥sm)만 표시 ── */}
        <aside className="hidden sm:flex flex-col gap-0.5 w-40 flex-shrink-0 sticky top-4 self-start">
          {RAIL_ITEMS.map(({ id, label, Icon }) => {
            const active = activeSection === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleRailClick(id)}
                className={[
                  "flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors",
                  active
                    ? "bg-brand-tint text-brand-deep font-semibold"
                    : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100",
                ].join(" ")}
              >
                <Icon
                  size={14}
                  weight={active ? "fill" : "regular"}
                />
                {label}
              </button>
            );
          })}
        </aside>

        {/* ── 우측 섹션 스크롤 영역 ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">

          {/* ── 섹션 1 · 회사정보 (사업장 · 법인) ── */}
          <section id="section-company">
            <SectionCard
              title="사업장 · 법인 정보"
              icon={<Buildings size={18} />}
              description="근로계약서·사직서·PDF·각종 서식에 표시되는 사업장 정보 (약국명·대표·사업자·주소·전화)."
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className={LABEL_CLS}><Buildings size={12} />약국(사업장) 이름</label>
                  <input lang="ko" className={INPUT_CLS} value={info.name} onChange={e => setInfo({ name: e.target.value })}
                         placeholder="예: 오산 메가타운 약국" />
                </div>
                <div>
                  <label className={LABEL_CLS}><User size={12} />대표자 이름</label>
                  <input lang="ko" className={INPUT_CLS} value={info.representativeName} onChange={e => setInfo({ representativeName: e.target.value })}
                         placeholder="예: 강남성" />
                </div>
                {/* 2026-09-02 · 대표자 직함 필드 제거 (사용자 지시) */}
                <div>
                  <label className={LABEL_CLS}><IdentificationBadge size={12} />사업자등록번호</label>
                  <input lang="ko" className={INPUT_CLS} value={info.regNo} onChange={e => setInfo({ regNo: e.target.value })}
                         placeholder="000-00-00000" />
                </div>
                <div>
                  <label className={LABEL_CLS}><Phone size={12} />사업장 전화</label>
                  <input lang="ko" className={INPUT_CLS} value={info.phone ?? ""} onChange={e => setInfo({ phone: e.target.value })}
                         placeholder="예: 031-000-0000" />
                </div>
                <div className="sm:col-span-2">
                  <label className={LABEL_CLS}><MapPin size={12} />사업장 주소</label>
                  <input lang="ko" className={INPUT_CLS} value={info.address} onChange={e => setInfo({ address: e.target.value })}
                         placeholder="예: 경기도 오산시 경기대로 868-4 2층" />
                </div>
              </div>

              {!loaded && (
                <div className="mt-3 flex justify-center"><Spinner label="서버에서 최신 값을 불러오는 중..." size={14} tone="zinc" labelSize={15} /></div>
              )}
            </SectionCard>
          </section>

          {/* ── 섹션 2 · 브랜드 (앱 이름 · 로고) ── */}
          <section id="section-brand">
            <SectionCard
              title="브랜드 정보 (앱 이름 · 로고)"
              icon={<Palette size={18} />}
              description="사이드바·랜딩·브라우저 탭에 표시되는 앱 브랜딩. 로고·파비콘은 파일 업로드 지원."
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}><TextT size={12} />앱 이름 (사이드바)</label>
                  <input lang="ko" className={INPUT_CLS} value={brand.shortName} onChange={e => setBrand({ shortName: e.target.value })}
                         placeholder="예: 오산 메가타운 약국" />
                </div>
                <div>
                  <label className={LABEL_CLS}><TextT size={12} />앱 타이틀 (브라우저 탭)</label>
                  <input lang="ko" className={INPUT_CLS} value={brand.appTitle} onChange={e => setBrand({ appTitle: e.target.value })}
                         placeholder="예: 오산메가타운 관리시스템" />
                </div>
                <div>
                  <label className={LABEL_CLS}><TextT size={12} />영문 브랜드명 (랜딩)</label>
                  <input lang="ko" className={INPUT_CLS} value={brand.brandNameEn} onChange={e => setBrand({ brandNameEn: e.target.value })}
                         placeholder="예: OSAN MEGATOWN" />
                </div>
                <div>
                  <label className={LABEL_CLS}><TextT size={12} />영문 강조 단어 (랜딩 컬러)</label>
                  <input lang="ko" className={INPUT_CLS} value={brand.brandAccentWord} onChange={e => setBrand({ brandAccentWord: e.target.value })}
                         placeholder="예: MEGATOWN" />
                </div>
                <div className="sm:col-span-2">
                  <ImageUploadField
                    label="로고 이미지"
                    value={brand.logoUrl ?? ""}
                    onChange={v => setBrand({ logoUrl: v || undefined })}
                    prefix="logo"
                    hint="비워두면 기본 로고 사용. 파일 업로드 또는 URL 입력"
                  />
                </div>
                <div className="sm:col-span-2">
                  <ImageUploadField
                    label="파비콘 이미지"
                    value={brand.faviconUrl ?? ""}
                    onChange={v => setBrand({ faviconUrl: v || undefined })}
                    prefix="favicon"
                    hint="브라우저 탭 아이콘. 32x32 또는 64x64 png 권장"
                  />
                </div>
              </div>
            </SectionCard>
          </section>

          {/* ── 섹션 3 · 연락처·카카오 ── */}
          <section id="section-contact">
            <ContactSection />
          </section>

          {/* ── 섹션 4 · 도장 매핑 ── */}
          <section id="section-stamps">
            <StampsSection />
          </section>

        </div>{/* /flex-1 */}
      </div>{/* /flex gap-6 */}
    </SettingsPageShell>
  );
};

export default CompanyInfoSettingsPage;
