// src/components/ContractSettingsPage/ContractSettingsPage.tsx
// 근로계약서 설정 페이지 · 2026-08-03 · #184
// - 카테고리별 업무내용 기본값 관리 (약사·매장·창고·기타)
// - 공통 안내문구 관리
// - localStorage · "contract-writer-settings"
// - 저장 · 초기화 · 하드코딩 fallback 안내
// 준수 원칙:
//   - feedback_ui_principles: 폼 요소 · min 14px · 3단 위계
//   - feedback_ui_consult: slate + indigo/emerald 팔레트 · rounded-xl · shadow-sm
//   - embedded 모드 · DocumentWriterPage 임베드 시 자체 헤더 skip
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Gear, User, Storefront, Warehouse, DotsThreeCircle,
  FloppyDisk, ArrowsClockwise, Check, Warning, Info, Notepad,
} from "@phosphor-icons/react";

import { AppNavHeader, type AppNavPage } from "../AppNavHeader";
import type { AuthSession } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// 타입 & 상수
// ─────────────────────────────────────────────────────────────────────────────

export type ContractCategory = "약사" | "매장" | "창고" | "기타";

export interface ContractWriterSettings {
  약사: string;
  매장: string;
  창고: string;
  기타: string;
  commonNotice?: string;
}

export const CONTRACT_SETTINGS_KEY = "contract-writer-settings";

/** ContractWriterPage 하드코딩 fallback 과 동일해야 함 · 초기값 · 하위 호환 */
export const DEFAULT_CONTRACT_SETTINGS: ContractWriterSettings = {
  약사: "일반의약품·전문의약품 조제·복약지도 · 의약품 재고 관리 · 처방전 접수",
  매장: "약국 매장 진열·정리 · OTC 판매 · 카운터 계산 · 고객 응대",
  창고: "의약품 창고 관리 · 입고·검수 · 매장 보충 · 재고 실사",
  기타: "매장 지원 업무",
  commonNotice: "",
};

/**
 * localStorage · 안전하게 로드 · JSON parse 실패 시 default
 */
export function loadContractSettings(): ContractWriterSettings {
  try {
    const raw = localStorage.getItem(CONTRACT_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_CONTRACT_SETTINGS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_CONTRACT_SETTINGS };
    return {
      약사: typeof parsed.약사 === "string" ? parsed.약사 : DEFAULT_CONTRACT_SETTINGS.약사,
      매장: typeof parsed.매장 === "string" ? parsed.매장 : DEFAULT_CONTRACT_SETTINGS.매장,
      창고: typeof parsed.창고 === "string" ? parsed.창고 : DEFAULT_CONTRACT_SETTINGS.창고,
      기타: typeof parsed.기타 === "string" ? parsed.기타 : DEFAULT_CONTRACT_SETTINGS.기타,
      commonNotice: typeof parsed.commonNotice === "string" ? parsed.commonNotice : "",
    };
  } catch {
    return { ...DEFAULT_CONTRACT_SETTINGS };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────

interface ContractSettingsPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  /** true · 자체 AppNavHeader skip (DocumentWriterPage 임베드용) */
  embedded?: boolean;
}

const CATEGORY_META: Array<{
  key: ContractCategory;
  label: string;
  icon: React.ComponentType<{ size?: number; weight?: any; className?: string }>;
  color: string;      // 텍스트
  bg: string;         // 배경
  border: string;     // 테두리
  ring: string;       // focus ring
}> = [
  { key: "약사", label: "약사",  icon: User,             color: "text-violet-700",  bg: "bg-violet-50",  border: "border-violet-200",  ring: "focus:border-violet-500"  },
  { key: "매장", label: "매장",  icon: Storefront,       color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", ring: "focus:border-emerald-500" },
  { key: "창고", label: "창고",  icon: Warehouse,        color: "text-orange-700",  bg: "bg-orange-50",  border: "border-orange-200",  ring: "focus:border-orange-500"  },
  { key: "기타", label: "기타",  icon: DotsThreeCircle,  color: "text-slate-700",   bg: "bg-slate-50",   border: "border-slate-200",   ring: "focus:border-slate-500"   },
];

const ContractSettingsPage: React.FC<ContractSettingsPageProps> = ({
  authSession, onBack, onNavigate, onLogout, embedded = false,
}) => {
  const [settings, setSettings] = useState<ContractWriterSettings>(() => loadContractSettings());
  const [initial, setInitial] = useState<ContractWriterSettings>(() => loadContractSettings());
  const [notice, setNotice] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);

  // 변경 여부 (dirty)
  const dirty = useMemo(() => {
    return (
      settings.약사 !== initial.약사 ||
      settings.매장 !== initial.매장 ||
      settings.창고 !== initial.창고 ||
      settings.기타 !== initial.기타 ||
      (settings.commonNotice ?? "") !== (initial.commonNotice ?? "")
    );
  }, [settings, initial]);

  // 자동 안내 배너 제거 (5초)
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const upd = useCallback(<K extends keyof ContractWriterSettings>(key: K, val: ContractWriterSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  }, []);

  const handleSave = () => {
    try {
      localStorage.setItem(CONTRACT_SETTINGS_KEY, JSON.stringify(settings));
      setInitial({ ...settings });
      setNotice({ tone: "ok", text: "설정이 저장되었습니다. 이후 근로계약서 작성에 반영됩니다." });
    } catch (err: any) {
      setNotice({ tone: "err", text: err?.message ?? "설정 저장에 실패했습니다." });
    }
  };

  const handleResetToDefault = () => {
    if (!window.confirm("모든 카테고리 업무내용을 기본값으로 되돌립니다. 계속하시겠습니까?")) return;
    setSettings({ ...DEFAULT_CONTRACT_SETTINGS });
    setNotice({ tone: "info", text: "기본값으로 되돌렸습니다. 저장하려면 [저장] 버튼을 누르세요." });
  };

  const handleRevert = () => {
    setSettings({ ...initial });
    setNotice({ tone: "info", text: "저장된 마지막 값으로 되돌렸습니다." });
  };

  return (
    <div className={embedded ? "flex-1 flex flex-col" : "min-h-screen bg-slate-50 flex flex-col"}>
      {!embedded && (
        <AppNavHeader
          activePage={"business-manage" as AppNavPage}
          authSession={authSession}
          onBack={onBack}
          onNavigate={onNavigate}
          onLogout={onLogout}
        />
      )}

      <main className="flex-1 max-w-[1000px] mx-auto w-full px-3 sm:px-5 py-5 flex flex-col gap-4">
        {/* 페이지 헤더 */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Gear size={20} weight="fill" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-slate-800 leading-none">근로계약서 설정</h1>
              <p className="text-xs text-slate-500 mt-1">
                직군별 업무내용 기본값을 지정하면, 근로계약서 작성 시 직군 선택만으로 자동 채워집니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetToDefault}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-colors cursor-pointer"
              title="기본값으로 초기화 (저장 필요)"
            >
              <ArrowsClockwise size={14} />
              <span className="hidden sm:inline">기본값</span>
            </button>
            <button
              type="button"
              onClick={handleRevert}
              disabled={!dirty}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors cursor-pointer"
              title="편집 취소 · 마지막 저장값 복원"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-black shadow-sm transition-colors cursor-pointer"
              title="설정 저장"
            >
              <FloppyDisk size={14} weight="bold" />
              저장
            </button>
          </div>
        </div>

        {/* 안내 배너 */}
        {notice && (
          <div
            className={`rounded-lg border px-3 py-2 text-sm font-semibold flex items-center gap-2 ${
              notice.tone === "ok"    ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
              notice.tone === "err"   ? "bg-rose-50 text-rose-700 border-rose-200" :
                                        "bg-slate-50 text-slate-700 border-slate-200"
            }`}
          >
            {notice.tone === "ok"    ? <Check size={14} weight="bold" /> :
             notice.tone === "err"   ? <Warning size={14} weight="fill" /> :
                                       <Info size={14} weight="fill" />}
            {notice.text}
          </div>
        )}

        {/* 안내 카드 */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 sm:p-4">
          <div className="flex items-start gap-2">
            <Info size={16} weight="fill" className="text-indigo-500 mt-0.5 shrink-0" />
            <div className="text-[12px] text-slate-600 leading-relaxed">
              <div className="font-bold text-slate-700 mb-1">사용 안내</div>
              <ul className="list-disc list-inside space-y-0.5">
                <li>각 카테고리에 자주 쓰는 업무내용을 저장해 두면, 계약서 작성 시 자동으로 채워집니다.</li>
                <li>저장된 값이 없으면 시스템 기본값이 사용됩니다.</li>
                <li>계약서 작성 화면에서 <b>수동 편집</b>도 가능합니다. 여기서의 설정은 <b>초기값</b>에 해당합니다.</li>
                <li>공통 안내문구는 모든 계약서의 [기타] 항목에 참고 기본값으로 활용됩니다 (선택).</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 카테고리별 편집 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {CATEGORY_META.map(cat => {
            const Icon = cat.icon;
            return (
              <section
                key={cat.key}
                className={`bg-white border ${cat.border} rounded-xl shadow-sm p-3 sm:p-4 flex flex-col gap-2`}
              >
                <header className="flex items-center gap-2 pb-1 border-b border-slate-100">
                  <div className={`w-7 h-7 rounded-lg ${cat.bg} ${cat.color} flex items-center justify-center shrink-0`}>
                    <Icon size={15} weight="fill" />
                  </div>
                  <h2 className={`text-[14px] font-black ${cat.color}`}>{cat.label} · 업무내용 기본값</h2>
                </header>
                <textarea
                  value={settings[cat.key]}
                  onChange={(e) => upd(cat.key, e.target.value)}
                  rows={4}
                  placeholder={`${cat.label} 카테고리의 기본 업무내용을 입력하세요.\n예: ${DEFAULT_CONTRACT_SETTINGS[cat.key]}`}
                  className={`w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-[14px] text-slate-800 font-semibold ${cat.ring} focus:outline-none focus:shadow-sm transition resize-y placeholder:text-slate-400 placeholder:text-[12px]`}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-semibold">
                    {settings[cat.key].length}자
                  </span>
                  <button
                    type="button"
                    onClick={() => upd(cat.key, DEFAULT_CONTRACT_SETTINGS[cat.key])}
                    className="text-[11px] font-bold text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                    title="이 카테고리만 기본값으로 되돌리기"
                  >
                    이 카테고리 기본값
                  </button>
                </div>
              </section>
            );
          })}
        </div>

        {/* 공통 안내문구 */}
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 sm:p-4 flex flex-col gap-2">
          <header className="flex items-center gap-2 pb-1 border-b border-slate-100">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Notepad size={15} weight="fill" />
            </div>
            <h2 className="text-[14px] font-black text-indigo-700">공통 안내문구 · 계약서 [기타] 참고 기본값 (선택)</h2>
          </header>
          <textarea
            value={settings.commonNotice ?? ""}
            onChange={(e) => upd("commonNotice", e.target.value)}
            rows={3}
            placeholder={"모든 계약서의 [기타 · 추가내용] 항목에 참고할 기본 문구를 입력하세요.\n예: 수습기간 3개월 · 명절 상여 별도 · 근무복 지급 등"}
            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-indigo-500 focus:shadow-sm transition resize-y placeholder:text-slate-400 placeholder:text-[12px]"
          />
        </section>

        <div className="text-[11px] text-slate-400 font-semibold text-center py-2">
          설정 저장 위치 · 브라우저 localStorage <code className="bg-slate-100 px-1 rounded">{CONTRACT_SETTINGS_KEY}</code>
        </div>
      </main>
    </div>
  );
};

export default ContractSettingsPage;
