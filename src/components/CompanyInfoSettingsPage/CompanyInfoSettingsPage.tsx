// src/components/CompanyInfoSettingsPage/CompanyInfoSettingsPage.tsx
// 2026-08-12 · 회사정보 설정 페이지 (관리자 lv≥9 전용)
//   · useCompanyInfo 재활용 · settings.company_info key 서버 저장
//   · 저장은 useKvSetting 의 debounce 500ms 자동 (필드 변경 즉시 서버 반영)
//   · 계약서·사직서·PDF 등 다른 화면에서 즉시 참조
import React from "react";
import { Buildings, User, IdentificationBadge, MapPin, Phone, Palette, TextT } from "@phosphor-icons/react";
import type { AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";
import { useCompanyInfo } from "../../hooks/useCompanyInfo";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import { ImageUploadField } from "../common/ImageUploadField";
import { SettingsPageShell } from "../common/SettingsPageShell";
import { CARD_BASE } from "../../styles/tokens";

interface Props {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

const LABEL_CLS = "flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5";
const INPUT_CLS = "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 transition";

const CompanyInfoSettingsPage: React.FC<Props> = ({ onBack, authSession, onNavigate, onLogout }) => {
  const { info, setInfo, loaded, saveState } = useCompanyInfo();
  // 2026-08-12 · 브랜드 정보 (앱 이름·로고·파비콘) 통합 · 이 페이지 한 곳에서 편집
  const { brand, setBrand } = useBrandIdentity();

  const badgeText =
    saveState === "saving" ? "저장 중..." :
    saveState === "saved"  ? "저장됨" :
    saveState === "error"  ? "오류" : "";
  const badgeCls =
    saveState === "saving" ? "text-amber-600 bg-amber-50 border-amber-200" :
    saveState === "saved"  ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
    saveState === "error"  ? "text-rose-600 bg-rose-50 border-rose-200" : "";

  return (
    <SettingsPageShell
      activePage={"company-info" as AppNavPage}
      authSession={authSession}
      onBack={onBack}
      onNavigate={onNavigate}
      onLogout={onLogout}
      icon={Buildings}
      iconColor="text-indigo-500"
      title="회사정보"
      description="근로계약서·사직서·PDF·각종 서식에 표시되는 사업장 정보 (약국명·대표·사업자·주소·전화) 및 앱 브랜드 (로고·파비콘). 관리자(lv 9) 전용."
      rightSlot={badgeText ? (
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${badgeCls}`}>{badgeText}</span>
      ) : undefined}
    >
        <div className={`${CARD_BASE} p-5 flex flex-col gap-4`}>
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Buildings size={18} className="text-indigo-500" />
              사업장 · 법인 정보
            </h2>
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
            <p className="text-[11px] text-slate-400 text-center">서버에서 최신 값을 불러오는 중...</p>
          )}
        </div>

        {/* ── 브랜드 정보 · 2026-08-12 · 앱브랜딩에서 이동 통합 ── */}
        <div className={`${CARD_BASE} p-5 flex flex-col gap-4 mt-4`}>
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Palette size={18} className="text-violet-500" />
              브랜드 정보 (앱 이름 · 로고)
            </h2>
            <p className="text-[11px] text-slate-500 mt-1">
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
    </SettingsPageShell>
  );
};

export default CompanyInfoSettingsPage;
