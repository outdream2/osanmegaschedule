// src/components/CompanyInfoSettingsPage/CompanyInfoSettingsPage.tsx
// 2026-08-12 · 회사·브랜드 통합 설정 페이지 (관리자 lv≥9 전용)
//   · 5탭 UI · 회사정보 · 브랜드 · 연락처·카카오 · 도장 매핑 · 모바일 가시성
//   · useCompanyInfo / useBrandIdentity · settings.* KV 서버 저장 (debounce 500ms)
//   · 계약서·사직서·PDF·랜딩·푸터 등 다른 화면에서 즉시 참조
import React, { useState } from "react";
import {
  Buildings, User, IdentificationBadge, MapPin, Phone,
  Palette, TextT,
  AddressBook, Stamp,
} from "@phosphor-icons/react";
import type { AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";
import { useCompanyInfo } from "../../hooks/useCompanyInfo";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import { ImageUploadField } from "../common/ImageUploadField";
import { SettingsPageShell } from "../common/SettingsPageShell";
import { StatusPill } from "../common/StatusPill";
// 2026-08-12 · 연락처·도장 개별 섹션 (개별 export · 4탭 배치용)
// 2026-08-20 · 모바일 가시성 · 메뉴 설정(PermissionsPage) 으로 이관
import { ContactSection, StampsSection } from "../BrandingSettingsPage/BrandingSettingsPage";
import {
  SET_SECTION_TITLE, SET_SECTION_DESC,
  SET_LABEL, SET_INPUT, SET_BADGE,
} from "../../lib/settingsTypography";
import { CARD_BASE } from "../../styles/tokens";
import { Spinner } from "../common/Spinner";

interface Props {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

const LABEL_CLS = SET_LABEL;
const INPUT_CLS = SET_INPUT;

type TabKey = "company" | "brand" | "contact" | "stamps";
const TABS: Array<{ key: TabKey; label: string; Icon: React.ComponentType<any>; color: string }> = [
  { key: "company", label: "회사정보",      Icon: Buildings,    color: "text-indigo-500"  },
  { key: "brand",   label: "브랜드",        Icon: Palette,      color: "text-violet-500"  },
  { key: "contact", label: "연락처·카카오", Icon: AddressBook,  color: "text-sky-500"     },
  { key: "stamps",  label: "도장 매핑",     Icon: Stamp,        color: "text-rose-500"    },
];

const CompanyInfoSettingsPage: React.FC<Props> = ({ onBack, authSession, onNavigate, onLogout }) => {
  const { info, setInfo, loaded, saveState } = useCompanyInfo();
  const { brand, setBrand } = useBrandIdentity();

  // 2026-08-12 · 5탭 상태 · localStorage 저장 (재방문 시 마지막 탭 복원)
  const [tab, setTab] = useState<TabKey>(() => {
    try {
      const v = localStorage.getItem("companyInfo.tab") as TabKey | null;
      return (v && TABS.some(t => t.key === v)) ? v : "company";
    } catch { return "company"; }
  });
  const changeTab = (k: TabKey) => {
    setTab(k);
    try { localStorage.setItem("companyInfo.tab", k); } catch { /* silent */ }
  };

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
      {/* 2026-08-12 · 상단 5탭 TabBar · 각 섹션 개별 표시 */}
      <div className="mb-3 flex flex-wrap gap-0.5 border-b border-line">
        {TABS.map(({ key, label, Icon, color }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => changeTab(key)}
              className={`px-3.5 py-2 -mb-px flex items-center gap-1.5 text-[14px] font-bold border-b-2 transition-colors ${
                active
                  ? "border-indigo-500 text-zinc-800"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
              }`}
              type="button"
            >
              <Icon size={16} weight={active ? "fill" : "regular"} className={active ? color : "text-zinc-400"} />
              {label}
            </button>
          );
        })}
      </div>

      {/* ── 탭 1 · 회사정보 (사업장 · 법인) ── */}
      {tab === "company" && (
        <div className={`${CARD_BASE} p-5 flex flex-col gap-4`}>
          <div>
            <h2 className={SET_SECTION_TITLE}>
              <Buildings size={18} className="text-indigo-500" />
              사업장 · 법인 정보
            </h2>
            <p className={SET_SECTION_DESC}>
              근로계약서·사직서·PDF·각종 서식에 표시되는 사업장 정보 (약국명·대표·사업자·주소·전화).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={LABEL_CLS}><Buildings size={12} />약국(사업장) 이름</label>
              <input className={INPUT_CLS} value={info.name} onChange={e => setInfo({ name: e.target.value })}
                     placeholder="예: 오산 메가타운 약국" />
            </div>
            <div>
              <label className={LABEL_CLS}><User size={12} />대표자 이름</label>
              <input className={INPUT_CLS} value={info.representativeName} onChange={e => setInfo({ representativeName: e.target.value })}
                     placeholder="예: 강남성" />
            </div>
            <div>
              <label className={LABEL_CLS}><IdentificationBadge size={12} />대표자 직함</label>
              <input className={INPUT_CLS} value={info.representativeTitle ?? ""} onChange={e => setInfo({ representativeTitle: e.target.value })}
                     placeholder="예: 대표 · 약국장" />
            </div>
            <div>
              <label className={LABEL_CLS}><IdentificationBadge size={12} />사업자등록번호</label>
              <input className={INPUT_CLS} value={info.regNo} onChange={e => setInfo({ regNo: e.target.value })}
                     placeholder="000-00-00000" />
            </div>
            <div>
              <label className={LABEL_CLS}><Phone size={12} />사업장 전화</label>
              <input className={INPUT_CLS} value={info.phone ?? ""} onChange={e => setInfo({ phone: e.target.value })}
                     placeholder="예: 031-000-0000" />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL_CLS}><MapPin size={12} />사업장 주소</label>
              <input className={INPUT_CLS} value={info.address} onChange={e => setInfo({ address: e.target.value })}
                     placeholder="예: 경기도 오산시 경기대로 868-4 2층" />
            </div>
          </div>

          {!loaded && (
            <div className="flex justify-center"><Spinner label="서버에서 최신 값을 불러오는 중..." size={14} tone="zinc" labelSize={15} /></div>
          )}
        </div>
      )}

      {/* ── 탭 2 · 브랜드 (앱 이름 · 로고) ── */}
      {tab === "brand" && (
        <div className={`${CARD_BASE} p-5 flex flex-col gap-4`}>
          <div>
            <h2 className={SET_SECTION_TITLE}>
              <Palette size={18} className="text-violet-500" />
              브랜드 정보 (앱 이름 · 로고)
            </h2>
            <p className={SET_SECTION_DESC}>
              사이드바·랜딩·브라우저 탭에 표시되는 앱 브랜딩. 로고·파비콘은 파일 업로드 지원.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}><TextT size={12} />앱 이름 (사이드바)</label>
              <input className={INPUT_CLS} value={brand.shortName} onChange={e => setBrand({ shortName: e.target.value })}
                     placeholder="예: 오산 메가타운 약국" />
            </div>
            <div>
              <label className={LABEL_CLS}><TextT size={12} />앱 타이틀 (브라우저 탭)</label>
              <input className={INPUT_CLS} value={brand.appTitle} onChange={e => setBrand({ appTitle: e.target.value })}
                     placeholder="예: 오산메가타운 관리시스템" />
            </div>
            <div>
              <label className={LABEL_CLS}><TextT size={12} />영문 브랜드명 (랜딩)</label>
              <input className={INPUT_CLS} value={brand.brandNameEn} onChange={e => setBrand({ brandNameEn: e.target.value })}
                     placeholder="예: OSAN MEGATOWN" />
            </div>
            <div>
              <label className={LABEL_CLS}><TextT size={12} />영문 강조 단어 (랜딩 컬러)</label>
              <input className={INPUT_CLS} value={brand.brandAccentWord} onChange={e => setBrand({ brandAccentWord: e.target.value })}
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
        </div>
      )}

      {/* ── 탭 3 · 연락처·카카오 ── */}
      {tab === "contact" && <ContactSection />}

      {/* ── 탭 4 · 도장 매핑 ── */}
      {tab === "stamps"  && <StampsSection  />}
    </SettingsPageShell>
  );
};

export default CompanyInfoSettingsPage;
