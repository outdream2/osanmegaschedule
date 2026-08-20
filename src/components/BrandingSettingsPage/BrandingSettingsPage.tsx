// src/components/BrandingSettingsPage/BrandingSettingsPage.tsx
// 2026-08-12 · 프레임워크 Phase 3 · 브랜드/연락처/도장/모바일 가시성 통합 설정 페이지
//   · 사이드바 "설정" 그룹에서 진입 (Phase 5 에서 라우팅 등록)
//   · 이번 Phase 는 컴포넌트만 · AppNavHeader activePage 는 임시로 "permissions"
//
// 4개 섹션 (모두 카드 형태 · CARD_BASE 톤):
//   1) 브랜드 정보 (useBrandIdentity)
//   2) 연락처·저작권·카카오 (useContactInfo)
//   3) 도장 매핑 (useStampsMap)
//   4) 페이지별 모바일 사용여부 (useMobileVisibility · SIDE_NAV_GROUPS 순회)
//
// 준수 원칙:
//   · feedback_ui_principles: slate + indigo/emerald 팔레트 · rounded-xl · shadow-sm
//   · ContractSettingsPage · PermissionsPage 톤 참고
//   · 각 훅 setter 만 호출 · 서버 저장은 useKvSetting 이 debounce/즉시 처리 (기존 훅 규약)
import React, { useCallback, useMemo, useState } from "react";
import {
  Gear, FloppyDisk, Check, Warning, Plus, Trash, Image as ImageIcon,
  Buildings, Phone, Stamp, DeviceMobile, Info,
} from "@phosphor-icons/react";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { AppFooter } from "../layout/AppFooter";
import { SettingsPageShell } from "../common/SettingsPageShell";
import {
  SET_LABEL, SET_INPUT_STRONG, SET_HINT, SET_SECTION_TITLE, SET_SECTION_DESC,
} from "../common/settingsTypography";
import type { AuthSession, StampMapping } from "../../types";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import { useContactInfo } from "../../hooks/useContactInfo";
import { useStampsMap } from "../../hooks/useStampsMap";
import { useMobilePageLevel } from "../../hooks/useMobilePageLevel";
import { SIDE_NAV_GROUPS } from "../layout/sideNavGroups";
import { TabBar, type TabDef } from "../common/TabBar";
import { ImageUploadField } from "../common/ImageUploadField";
import { IconTile } from "../common/IconTile";
import { Card } from "../common/Card";

// ─── 공통 카드 스타일 (ContractSettingsPage 톤과 통일) ───────────────────────
// 2026-08-20 · Card 프리미티브 확산 · <Card as="section" clip padding="none">
const SECTION_HEADER =
  "flex items-center gap-2 px-4 py-3 border-b border-line bg-zinc-50/60";
// 2026-08-12 · 공통 CSS 로 통일 (settingsTypography.ts)
const INPUT_BASE = SET_INPUT_STRONG;
const LABEL_BASE = SET_LABEL;

interface BrandingSettingsPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onLogout: () => void;
  onNavigate?: (page: AppNavPage) => void;
  /** true 시 자체 AppNavHeader/Footer skip (BusinessManagePage 임베드용 대비) */
  embedded?: boolean;
}

// ─── 저장 상태 통합 배지 ────────────────────────────────────────────────────
type SaveState = "idle" | "saving" | "saved" | "error";

function StatusBadge({ state, label }: { state: SaveState; label?: string }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[15px] text-zinc-500 font-bold">
        저장 중…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-[15px] text-emerald-600 font-bold">
        <Check size={11} weight="bold" /> {label ?? "저장됨"}
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-[15px] text-rose-500 font-bold">
        <Warning size={11} weight="fill" /> 저장 실패
      </span>
    );
  }
  return null;
}

// ─── 텍스트 입력 필드 (라벨 + input) ────────────────────────────────────────
function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  type?: "text" | "url" | "email" | "tel";
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className={LABEL_BASE}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT_BASE}
      />
      {hint && <span className={SET_HINT}>{hint}</span>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//   섹션 1 · 브랜드 정보
// ═══════════════════════════════════════════════════════════════════════
const BrandSection: React.FC = () => {
  const { brand, setBrand, loaded, saveState } = useBrandIdentity();
  return (
    <Card as="section" clip padding="none">
      <div className={SECTION_HEADER}>
        {/* 2026-08-18 · IconTile 프레임워크 확산 */}
        <IconTile icon={<Buildings size={15} weight="fill" />} tone="indigo" size="md" />

        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-zinc-800 leading-tight">브랜드 정보</div>
          <div className="text-[15px] text-zinc-500 mt-0.5">사이드바·헤더·랜딩·푸터에서 사용되는 브랜드 이름/로고</div>
        </div>
        <StatusBadge state={saveState as SaveState} />
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 2026-08-16 · 지역 · 사이드바/랜딩에 shortName 앞줄로 표시 (예: "오산\n메가타운 약국") */}
        <TextField
          label="지역"
          value={brand.region ?? ""}
          onChange={(v) => setBrand({ region: v })}
          placeholder="예: 오산"
          hint="사이드바·랜딩 · 브랜드명 위에 별도 줄로 표시"
        />
        <TextField
          label="브랜드 이름 (푸터·사이드바)"
          value={brand.shortName}
          onChange={(v) => setBrand({ shortName: v })}
          placeholder="예: 메가타운 약국"
        />
        <TextField
          label="영문 브랜드명 (랜딩)"
          value={brand.brandNameEn}
          onChange={(v) => setBrand({ brandNameEn: v })}
          placeholder="예: OSAN MEGATOWN"
        />
        <TextField
          label="영문 강조 단어 (랜딩 · 컬러)"
          value={brand.brandAccentWord}
          onChange={(v) => setBrand({ brandAccentWord: v })}
          placeholder="예: MEGATOWN"
          hint="영문 브랜드명 안에서 컬러 강조로 표시할 부분"
        />
        <TextField
          label="앱 타이틀 (브라우저 탭)"
          value={brand.appTitle}
          onChange={(v) => setBrand({ appTitle: v })}
          placeholder="예: 메가타운 스태프 스케줄러"
        />
        <TextField
          label="로고 이미지 URL"
          value={brand.logoUrl ?? ""}
          onChange={(v) => setBrand({ logoUrl: v || undefined })}
          placeholder="비워두면 기본 로고 사용"
          type="url"
          hint="Phase 4 에서 이미지 업로드 UI 예정"
        />
        <TextField
          label="파비콘 이미지 URL"
          value={brand.faviconUrl ?? ""}
          onChange={(v) => setBrand({ faviconUrl: v || undefined })}
          placeholder="비워두면 기본 파비콘 사용"
          type="url"
        />
      </div>
      {!loaded && (
        <div className="px-4 pb-3 text-[15px] text-zinc-400">서버에서 설정을 불러오는 중…</div>
      )}
    </Card>
  );
};

// ═══════════════════════════════════════════════════════════════════════
//   섹션 2 · 연락처·저작권·카카오
// ═══════════════════════════════════════════════════════════════════════
export const ContactSection: React.FC = () => {
  const { contact, setContact, loaded, saveState } = useContactInfo();
  return (
    <Card as="section" clip padding="none">
      <div className={SECTION_HEADER}>
        {/* 2026-08-18 · IconTile 프레임워크 확산 */}
        <IconTile icon={<Phone size={15} weight="fill" />} tone="emerald" size="md" />

        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-zinc-800 leading-tight">연락처·저작권·카카오</div>
          <div className="text-[15px] text-zinc-500 mt-0.5">푸터·랜딩·카카오 QR 등에서 사용되는 값</div>
        </div>
        <StatusBadge state={saveState as SaveState} />
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField
          label="대표 전화"
          value={contact.phone}
          onChange={(v) => setContact({ phone: v })}
          placeholder="예: 031-000-0000"
          type="tel"
        />
        <TextField
          label="이메일"
          value={contact.email}
          onChange={(v) => setContact({ email: v })}
          placeholder="예: info@example.com"
          type="email"
        />
        <TextField
          label="홈페이지"
          value={contact.website}
          onChange={(v) => setContact({ website: v })}
          placeholder="예: https://example.com"
          type="url"
        />
        <TextField
          label="영업시간 (푸터)"
          value={contact.businessHours}
          onChange={(v) => setContact({ businessHours: v })}
          placeholder="예: 09:00 - 22:00"
        />
        {/* 2026-08-12 · 사용자 지시 · 저작권 문구는 편집 불가 · UI 제거 (default 유지) */}
        <TextField
          label="카카오톡 채널 URL"
          value={contact.kakaoChannelUrl}
          onChange={(v) => setContact({ kakaoChannelUrl: v })}
          placeholder="예: https://pf.kakao.com/_xxxx/friend"
          type="url"
        />
        <div className="sm:col-span-2">
          {/* 2026-08-12 · 파일 업로드 지원 · ImageUploadField 로 교체 */}
          <ImageUploadField
            label="카카오톡 QR 이미지"
            value={contact.kakaoQrImageUrl ?? ""}
            onChange={(v) => setContact({ kakaoQrImageUrl: v || undefined })}
            prefix="kakao_qr"
            hint="비워두면 기본 QR 사용 · 파일 업로드 또는 URL"
          />
        </div>
      </div>
      {!loaded && (
        <div className="px-4 pb-3 text-[15px] text-zinc-400">서버에서 설정을 불러오는 중…</div>
      )}
    </Card>
  );
};

// ═══════════════════════════════════════════════════════════════════════
//   섹션 3 · 도장 매핑
// ═══════════════════════════════════════════════════════════════════════
export const StampsSection: React.FC = () => {
  const { stamps, setAll, loaded, saveState } = useStampsMap();
  const [draftName, setDraftName] = useState("");
  const [draftImageUrl, setDraftImageUrl] = useState("");
  const [draftFallback, setDraftFallback] =
    useState<"" | "sungstamp" | "kyustamp">("");

  const handleAdd = useCallback(() => {
    const name = draftName.trim();
    if (!name) return;
    const next: StampMapping = {
      name,
      imageUrl: draftImageUrl.trim(),
      bundledFallback: draftFallback === "" ? undefined : draftFallback,
    };
    setAll((prev) => {
      const filtered = prev.filter((x) => x.name !== name);
      return [...filtered, next];
    });
    setDraftName("");
    setDraftImageUrl("");
    setDraftFallback("");
  }, [draftName, draftImageUrl, draftFallback, setAll]);

  const handleUpdate = useCallback(
    (idx: number, patch: Partial<StampMapping>) => {
      setAll((prev) =>
        prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
      );
    },
    [setAll],
  );

  const handleRemove = useCallback(
    (idx: number) => {
      setAll((prev) => prev.filter((_, i) => i !== idx));
    },
    [setAll],
  );

  return (
    <Card as="section" clip padding="none">
      <div className={SECTION_HEADER}>
        {/* 2026-08-18 · IconTile 프레임워크 확산 */}
        <IconTile icon={<Stamp size={15} weight="fill" />} tone="rose" size="md" />

        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-zinc-800 leading-tight">도장 매핑</div>
          <div className="text-[15px] text-zinc-500 mt-0.5">
            근로계약서 · 사업주/근로자 이름에 자동 매칭되는 도장 이미지
          </div>
        </div>
        <StatusBadge state={saveState as SaveState} />
      </div>

      {/* 목록 테이블 */}
      <div className="p-4 flex flex-col gap-3">
        {stamps.length === 0 && (
          <div className="text-[14px] text-zinc-400 flex items-center gap-1.5">
            <Info size={12} /> 등록된 도장이 없습니다. 아래에서 추가하세요.
          </div>
        )}
        {stamps.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-line">
                  <th className="py-2 pr-2 font-semibold">이름</th>
                  <th className="py-2 pr-2 font-semibold">이미지 URL</th>
                  <th className="py-2 pr-2 font-semibold w-[140px]">Bundled Fallback</th>
                  <th className="py-2 pr-2 font-semibold w-[80px]">미리보기</th>
                  <th className="py-2 pr-2 font-semibold w-[52px] text-right">삭제</th>
                </tr>
              </thead>
              <tbody>
                {stamps.map((s, idx) => {
                  const previewSrc =
                    s.imageUrl && s.imageUrl.trim()
                      ? s.imageUrl
                      : s.bundledFallback === "sungstamp"
                      ? "/src/images/sungstamp.png"
                      : s.bundledFallback === "kyustamp"
                      ? "/src/images/kyustamp.png"
                      : "";
                  return (
                    <tr key={`${s.name}-${idx}`} className="border-b border-zinc-100">
                      <td className="py-2 pr-2 align-top">
                        <input
                          value={s.name}
                          onChange={(e) => handleUpdate(idx, { name: e.target.value })}
                          className={INPUT_BASE}
                          placeholder="예: 강남성"
                        />
                      </td>
                      <td className="py-2 pr-2 align-top">
                        <input
                          value={s.imageUrl}
                          onChange={(e) => handleUpdate(idx, { imageUrl: e.target.value })}
                          className={INPUT_BASE}
                          placeholder="Storage URL 또는 비워두고 fallback 선택"
                          type="url"
                        />
                      </td>
                      <td className="py-2 pr-2 align-top">
                        <select
                          value={s.bundledFallback ?? ""}
                          onChange={(e) =>
                            handleUpdate(idx, {
                              bundledFallback:
                                e.target.value === ""
                                  ? undefined
                                  : (e.target.value as "sungstamp" | "kyustamp"),
                            })
                          }
                          className={INPUT_BASE}
                        >
                          <option value="">(직접입력만)</option>
                          <option value="sungstamp">sungstamp</option>
                          <option value="kyustamp">kyustamp</option>
                        </select>
                      </td>
                      <td className="py-2 pr-2 align-top">
                        <div className="w-14 h-14 rounded-lg border border-line bg-zinc-50 flex items-center justify-center overflow-hidden">
                          {previewSrc ? (
                            <img
                              src={previewSrc}
                              alt={`${s.name} 도장`}
                              className="max-w-full max-h-full object-contain"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <ImageIcon size={16} className="text-zinc-300" />
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-2 align-top text-right">
                        <button
                          type="button"
                          onClick={() => handleRemove(idx)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 text-[15px] font-bold transition-colors cursor-pointer"
                          title="삭제"
                          aria-label={`${s.name} 도장 삭제`}
                        >
                          <Trash size={12} weight="bold" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 추가 폼 · 2026-08-12 · 도장 이미지 파일 업로드 지원 */}
        <div className="mt-2 border-t border-dashed border-line pt-3">
          <div className="text-[14px] font-bold text-zinc-600 mb-2">새 도장 추가</div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="이름 (예: 강남성)"
                className={INPUT_BASE + " sm:max-w-[180px]"}
              />
              <select
                value={draftFallback}
                onChange={(e) =>
                  setDraftFallback(e.target.value as "" | "sungstamp" | "kyustamp")
                }
                className={INPUT_BASE + " sm:max-w-[160px]"}
              >
                <option value="">Fallback 없음</option>
                <option value="sungstamp">sungstamp</option>
                <option value="kyustamp">kyustamp</option>
              </select>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!draftName.trim()}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white text-[14px] font-bold shadow-sm transition-colors cursor-pointer whitespace-nowrap sm:ml-auto"
              >
                <Plus size={13} weight="bold" /> 추가
              </button>
            </div>
            <ImageUploadField
              label="도장 이미지"
              value={draftImageUrl}
              onChange={setDraftImageUrl}
              prefix={`stamp_${(draftName || "new").replace(/[^a-zA-Z0-9가-힣]/g, "_")}`}
              hint="파일 업로드 또는 URL 입력 · 비워두면 Fallback 사용"
            />
          </div>
        </div>
      </div>
      {!loaded && (
        <div className="px-4 pb-3 text-[15px] text-zinc-400">서버에서 설정을 불러오는 중…</div>
      )}
    </Card>
  );
};

// ═══════════════════════════════════════════════════════════════════════
//   섹션 4 · 페이지별 모바일 최소 레벨 (2026-08-12 · Phase 6)
//     · 페이지별 · 모바일에서 접근 가능한 최소 레벨 지정
//     · 값 0 · 모두 허용 (default)
//     · SIDE_NAV_GROUPS 순회 · 각 group.items · pageKey (item.key) 별 dropdown
//     · 같은 pageKey 중복 시 (예: display 아래 서브탭 여러개) · 한 번만 표시
// ═══════════════════════════════════════════════════════════════════════
type MinLevelOption = { value: number; label: string };
const MIN_LEVEL_OPTIONS: MinLevelOption[] = [
  { value: 0, label: "0 - 모두 허용 (default)" },
  { value: 1, label: "1 - 직원 이상" },
  { value: 2, label: "2 - 매니저 이상" },
  { value: 3, label: "3 - 약사 이상" },
  { value: 8, label: "8 - 대표 이상" },
  { value: 9, label: "9 - 최고관리자만" },
];

export const MobileVisibilitySection: React.FC = () => {
  const { getMinLevel, setMinLevel, loaded, saveState } = useMobilePageLevel();

  // SIDE_NAV_GROUPS 순회 · 그룹별로 페이지 목록 구성 · 같은 pageKey 는 그룹 내에서 중복 제거
  //   · landing 은 · 접근 차단 금지 (MobileOnlyGate 에서도 스킵) · 편집 UI 에서도 제외
  const groups = useMemo(() => {
    return SIDE_NAV_GROUPS
      .map((g) => {
        const seen = new Set<string>();
        const items = g.items
          .filter((it) => it.key !== "landing")
          .filter((it) => {
            if (seen.has(it.key)) return false;
            seen.add(it.key);
            return true;
          })
          .map((it) => ({ pageKey: it.key as string, label: it.label }));
        return { id: g.id, label: g.label, items };
      })
      .filter((g) => g.items.length > 0);
  }, []);

  return (
    <Card as="section" clip padding="none">
      <div className={SECTION_HEADER}>
        {/* 2026-08-18 · IconTile 프레임워크 확산 */}
        <IconTile icon={<DeviceMobile size={15} weight="fill" />} tone="violet" size="md" />

        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-zinc-800 leading-tight">페이지별 모바일 최소 레벨</div>
          <div className="text-[15px] text-zinc-500 mt-0.5">
            모바일에서 접근 가능한 최소 레벨 · 기본값 0 (모두 허용) · 값 이상만 접근 · 미만 사용자는 PC 전용 안내 표시
          </div>
        </div>
        <StatusBadge state={saveState as SaveState} />
      </div>
      <div className="p-4 flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.id} className="flex flex-col gap-2">
            <div className="text-[15px] font-bold text-zinc-500 uppercase tracking-wide">
              {g.label}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {g.items.map((it) => {
                const min = getMinLevel(it.pageKey);
                const isRestricted = min > 0;
                return (
                  <div
                    key={`${g.id}-${it.pageKey}`}
                    className={[
                      "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                      isRestricted
                        ? "border-violet-200 bg-violet-50/60"
                        : "border-emerald-200 bg-emerald-50/40",
                    ].join(" ")}
                  >
                    <span className="text-[15px] font-bold text-zinc-800 flex-1 min-w-0 truncate">
                      {it.label}
                    </span>
                    <select
                      value={min}
                      onChange={(e) => setMinLevel(it.pageKey, Number(e.target.value))}
                      className="bg-white border border-line rounded-lg px-2 py-1 text-[14px] font-bold text-zinc-800 focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint cursor-pointer"
                      aria-label={`${it.label} 모바일 최소 레벨`}
                    >
                      {MIN_LEVEL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {!loaded && (
        <div className="px-4 pb-3 text-[15px] text-zinc-400">서버에서 설정을 불러오는 중…</div>
      )}
    </Card>
  );
};

// ═══════════════════════════════════════════════════════════════════════
//   2026-08-12 · 3섹션 탭 UI · 연락처·도장·모바일 가시성
//   · 브랜드 정보(BrandSection)는 회사정보 페이지로 이동됨
// ═══════════════════════════════════════════════════════════════════════
type BrTab = "contact" | "stamps" | "mobile";
const BR_TABS: TabDef<BrTab>[] = [
  { key: "contact", label: "연락처·카카오", icon: Phone,        color: "emerald" },
  { key: "stamps",  label: "도장 매핑",      icon: Stamp,        color: "rose"    },
  { key: "mobile",  label: "모바일 가시성",  icon: DeviceMobile, color: "indigo"  },
];
export const BrandingSectionTabs: React.FC = () => {
  const [tab, setTab] = useState<BrTab>("contact");
  return (
    <>
      <TabBar<BrTab> level={2} tabs={BR_TABS} activeKey={tab} onSelect={setTab} />
      <div className="mt-3">
        {tab === "contact" && <ContactSection />}
        {tab === "stamps"  && <StampsSection  />}
        {tab === "mobile"  && <MobileVisibilitySection />}
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════
//   메인 · BrandingSettingsPage
// ═══════════════════════════════════════════════════════════════════════
export const BrandingSettingsPage: React.FC<BrandingSettingsPageProps> = ({
  authSession,
  onBack,
  onLogout,
  onNavigate,
  embedded = false,
}) => {
  // embedded 모드는 셸 없이 원본 (BusinessManagePage 등 임베드 대비 · 미사용 상태지만 방어)
  if (embedded) {
    return (
      <div className="flex-1 flex flex-col">
        <main className="flex-1 max-w-[1100px] mx-auto w-full px-3 sm:px-5 py-4 flex flex-col gap-3">
          <BrandingSectionTabs />
        </main>
      </div>
    );
  }
  // 2026-08-12 · 공통 SettingsPageShell 사용 · [설정] 하위 페이지 UI 통일
  return (
    <SettingsPageShell
      activePage={"branding" as AppNavPage}
      authSession={authSession}
      onBack={onBack}
      onNavigate={onNavigate}
      onLogout={onLogout}
      icon={Gear}
      iconColor="text-indigo-500"
      title="앱 브랜딩"
      description="연락처·카카오·도장 매핑·페이지별 모바일 최소 레벨. (브랜드 정보 · 로고/파비콘은 [회사정보] 페이지로 이동됨.) 관리자(lv 9) 전용."
      rightSlot={
        <span className="hidden sm:inline-flex items-center gap-1 text-[15px] text-zinc-500 font-semibold">
          <FloppyDisk size={11} weight="fill" /> 변경 즉시 저장
        </span>
      }
    >
      <BrandingSectionTabs />
    </SettingsPageShell>
  );
};

export default BrandingSettingsPage;
