// 2026-08-17 · apiClient 마이그레이션
// src/components/ContractSettingsPage/ContractSettingsPage.tsx
// 근로계약서 설정 페이지 · 2026-08-05 · 재설계
// - 직군별 주중/주말 시급 (약사·매장·창고·기타)
//     · 실 저장 위치: settings.wageRates (서버 저장 · 모든 관리자 공유)
//     · ContractWriterPage 가 참조하는 유일한 소스로 통일
// - 각 호 내용 편집 CMS (임금단서·근로시간·휴일·징계·기타·개인정보)
//     · 2026-08-05 T-C · localStorage → Supabase 서버 저장 (contract_clauses 테이블)
//     · 모든 관리자·모든 기기 동일 값 공유
//     · 서버 오류 시 localStorage("contractClauses:v1") fallback 유지 (하위호환)
//     · 1회 자동 마이그레이션 · 기존 localStorage 값 있으면 서버로 업로드 후 로컬 유지 (백업)
//
// 하위호환:
//   · 기존 export (ContractCategory, ContractWriterSettings, CONTRACT_SETTINGS_KEY,
//     DEFAULT_CONTRACT_SETTINGS, loadContractSettings) 는 유지 - ContractWriterPage 가 참조.
//   · 기존 export (JOB_WAGES_KEY, JobWage, ContractJobWages, DEFAULT_JOB_WAGES, loadJobWages) 는
//     하위호환용으로 유지 - 다만 이제 편집은 settings.wageRates 로 저장 (localStorage 아님).
//   · loadContractClauses (동기 · localStorage) 유지 · 오프라인/구 브라우저용
//   · fetchContractClauses (신규 · async) · 서버 조회 · 실패 시 localStorage fallback
//
// 준수 원칙:
//   · feedback_ui_principles: slate + indigo/emerald 팔레트 · rounded-xl · shadow-sm
//   · feedback_ui_consult: 카테고리 색 분류 · 통일된 카드
//   · embedded 모드 · DocumentWriterPage 임베드 시 자체 헤더 skip
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/apiClient";
import { useConfirm } from "../../hooks/useConfirm";
import {
  Gear, FloppyDisk, ArrowsClockwise, Check, Warning, Info,
  CaretDown, CaretRight, Plus, Trash, ArrowUp, ArrowDown,
  CurrencyKrw, Coins, Clock, Calendar, Shield, ListChecks, Lock,
} from "@phosphor-icons/react";

import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";
import { useSettings, defaultWageForPosition, type WageRate } from "../../hooks/useSettings";
import { useKvSetting } from "../../hooks/useKvSetting";
import { type CompanyInfo, DEFAULT_COMPANY_INFO, DEFAULT_PAYMENT_DAY_TEXT } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// 2026-08-16 · #82 · pure logic 은 src/lib/contract/ 로 이관
// · 하위호환 · 기존 export 는 re-export (ContractWriterPage 등 외부 import 유지)
// ─────────────────────────────────────────────────────────────────────────────

import {
  cloneClauses,
  clausesEqual,
  normalizeClauses,
  DEFAULT_CLAUSES,
  CONTRACT_CLAUSES_KEY,
  loadContractClauses,
  fetchContractClauses,
  saveContractClausesToServer,
  loadContractSettings,
  fetchContractWriterSettings,
  saveContractWriterSettingsToServer,
  DEFAULT_CONTRACT_SETTINGS,
  CONTRACT_SETTINGS_KEY,
  CONTRACT_WRITER_SETTINGS_DB_KEY,
  DEFAULT_JOB_WAGES,
  JOB_WAGES_KEY,
  loadJobWages,
  type ContractCategory,
  type ContractWriterSettings,
  type ContractClauses,
  type ClauseGroupKey,
  type JobWage,
  type ContractJobWages,
} from "../../lib/contract";

export {
  DEFAULT_CLAUSES,
  CONTRACT_CLAUSES_KEY,
  loadContractClauses,
  fetchContractClauses,
  saveContractClausesToServer,
  loadContractSettings,
  fetchContractWriterSettings,
  saveContractWriterSettingsToServer,
  DEFAULT_CONTRACT_SETTINGS,
  CONTRACT_SETTINGS_KEY,
  CONTRACT_WRITER_SETTINGS_DB_KEY,
  DEFAULT_JOB_WAGES,
  JOB_WAGES_KEY,
  loadJobWages,
};
export type {
  ContractCategory,
  ContractWriterSettings,
  ContractClauses,
  ClauseGroupKey,
  JobWage,
  ContractJobWages,
};

// ─────────────────────────────────────────────────────────────────────────────
// 메타 · 직군 & 각 호 그룹
// ─────────────────────────────────────────────────────────────────────────────

const JOB_META: Array<{
  key: ContractCategory;
  label: string;
  color: string;
  bg: string;
  border: string;
  accent: string;
}> = [
  { key: "약사", label: "약사", color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200", accent: "border-l-violet-400" },
  { key: "매장", label: "매장", color: "text-sky-700",    bg: "bg-sky-50",   border: "border-sky-200",   accent: "border-l-sky-400"    },
  { key: "창고", label: "창고", color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200",  accent: "border-l-amber-400"  },
  { key: "기타", label: "기타", color: "text-zinc-700",  bg: "bg-zinc-50",  border: "border-zinc-200",  accent: "border-l-zinc-400"  },
];

const CLAUSE_GROUP_META: Array<{
  key: ClauseGroupKey;
  label: string;
  desc: string;
  icon: React.ComponentType<{ size?: number; weight?: any; className?: string }>;
  color: string;
  bg: string;
  border: string;
}> = [
  { key: "wageClauses",       label: "임금 단서",      desc: "임금·수당 지급 약정",     icon: Coins,      color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200"   },
  { key: "workTimeClauses",   label: "근로시간·휴게",  desc: "근로시간·간주근로 약정",  icon: Clock,      color: "text-sky-700",     bg: "bg-sky-50",     border: "border-sky-200"     },
  { key: "holidayClauses",    label: "휴일",           desc: "주휴일·공휴일·휴무",      icon: Calendar,   color: "text-teal-700",    bg: "bg-teal-50",    border: "border-teal-200"    },
  { key: "disciplineClauses", label: "징계·해지 사유", desc: "근로계약 해지 각 호",      icon: Shield,     color: "text-rose-700",    bg: "bg-rose-50",    border: "border-rose-200"    },
  { key: "etcClauses",        label: "기타",           desc: "지급방법·비밀·인수인계",  icon: ListChecks, color: "text-indigo-700",  bg: "bg-indigo-50",  border: "border-indigo-200"  },
  { key: "privacyClauses",    label: "개인정보",       desc: "개인정보·CCTV 수집",      icon: Lock,       color: "text-zinc-700",   bg: "bg-zinc-50",   border: "border-zinc-200"   },
];

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

const ContractSettingsPage: React.FC<ContractSettingsPageProps> = ({
  authSession, onBack, onNavigate, onLogout, embedded = false,
}) => {
  const confirm = useConfirm();

  // ── 시급 · 서버 저장 (settings.wageRates · 모든 관리자 공유)
  //   ContractWriterPage 가 참조하는 유일한 소스와 통일
  //   즉시 저장 (debounce · useSettings 내부)
  const { wageRates, update: updateSettings, saveNow: saveSettingsNow } = useSettings();

  // ── 회사 정보 · 서버 저장 (settings "company_info" key)
  //   · ContractWriterPage 가 이 값으로 form 초기화 (하드코딩 fallback 대체)
  const {
    value: companyInfo,
    setValue: setCompanyInfo,
    loaded: companyInfoLoaded,
    saveState: companyInfoSaveState,
    saveNow: saveCompanyInfoNow,
  } = useKvSetting<CompanyInfo>({
    key: "company_info",
    defaultValue: DEFAULT_COMPANY_INFO,
  });

  // ── 임금지급일 · 서버 저장 (settings "payment_day_text" key)
  //   · ContractWriterPage 렌더링 (2. 임금지급일) 에 직접 반영
  const {
    value: paymentDayText,
    setValue: setPaymentDayText,
    loaded: paymentDayLoaded,
    saveNow: savePaymentDayNow,
  } = useKvSetting<string>({
    key: "payment_day_text",
    defaultValue: DEFAULT_PAYMENT_DAY_TEXT,
    sanitize: (raw) => (typeof raw === "string" && raw.trim() ? raw : null),
  });

  // ── 기존 localStorage(contractJobWages:v1) 마이그레이션 (1회)
  //   저장된 값이 wageRates 에 없으면 병합 후 삭제
  useEffect(() => {
    try {
      const raw = localStorage.getItem(JOB_WAGES_KEY);
      if (!raw) return;
      const legacy = loadJobWages();
      const missing: Record<string, WageRate> = {};
      (["약사", "매장", "창고", "기타"] as ContractCategory[]).forEach(k => {
        if (!wageRates?.[k]) {
          missing[k] = { weekday: legacy[k].weekday, weekend: legacy[k].weekend };
        }
      });
      if (Object.keys(missing).length > 0) {
        updateSettings({ wageRates: { ...(wageRates ?? {}), ...missing } });
      }
      localStorage.removeItem(JOB_WAGES_KEY);
    } catch { /* silent */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 상태 · 각 호
  //   초기값: localStorage (동기 · 즉시 렌더) · 이후 useEffect 로 서버 fetch 하여 최신값 덮어씀
  const [clauses, setClauses] = useState<ContractClauses>(() => loadContractClauses());
  const [initialClauses, setInitialClauses] = useState<ContractClauses>(() => loadContractClauses());
  const [serverLoaded, setServerLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── 전체 저장 상태
  const [overallSaving, setOverallSaving] = useState(false);
  const [overallSaveState, setOverallSaveState] = useState<"idle" | "saved" | "error">("idle");

  // ── 서버 초기 로드 (mount 1회) · 실패 시 기존 localStorage 값 유지
  //   자동 마이그레이션: 서버가 빈 값(모든 그룹이 DEFAULT 와 동일) 이고
  //                     localStorage 에 편집된 값이 있으면 서버로 upload
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: raw } = await api.get<any>("/api/contract-clauses");
        if (cancelled) return;

        // 서버 응답에서 · 각 그룹이 배열이지만 비어있으면 (서버 미저장) DEFAULT 로 fallback
        //   → normalizeClauses 는 빈 배열도 DEFAULT 로 대체함
        //   따라서 여기서는 "서버에 실제 저장된 key" 를 별도 판단
        const savedKeys = new Set<string>();
        for (const k of ["wageClauses", "workTimeClauses", "holidayClauses",
                         "disciplineClauses", "etcClauses", "privacyClauses"] as ClauseGroupKey[]) {
          const arr = (raw as any)?.[k];
          if (Array.isArray(arr) && arr.length > 0) savedKeys.add(k);
        }

        // 서버 값 (없는 key 는 DEFAULT · normalizeClauses 로직)
        const serverClauses: ContractClauses = {
          wageClauses: savedKeys.has("wageClauses") ? raw.wageClauses.slice() : DEFAULT_CLAUSES.wageClauses.slice(),
          workTimeClauses: savedKeys.has("workTimeClauses") ? raw.workTimeClauses.slice() : DEFAULT_CLAUSES.workTimeClauses.slice(),
          holidayClauses: savedKeys.has("holidayClauses") ? raw.holidayClauses.slice() : DEFAULT_CLAUSES.holidayClauses.slice(),
          disciplineClauses: savedKeys.has("disciplineClauses") ? raw.disciplineClauses.slice() : DEFAULT_CLAUSES.disciplineClauses.slice(),
          etcClauses: savedKeys.has("etcClauses") ? raw.etcClauses.slice() : DEFAULT_CLAUSES.etcClauses.slice(),
          privacyClauses: savedKeys.has("privacyClauses") ? raw.privacyClauses.slice() : DEFAULT_CLAUSES.privacyClauses.slice(),
        };

        // ── 1회 자동 마이그레이션
        //   조건: 서버에 저장된 key 가 하나도 없음 && localStorage 에 편집된 값 있음
        let migrated = false;
        const legacyRaw = (() => {
          try { return localStorage.getItem(CONTRACT_CLAUSES_KEY); } catch { return null; }
        })();
        if (savedKeys.size === 0 && legacyRaw) {
          try {
            const legacyParsed = normalizeClauses(JSON.parse(legacyRaw));
            // legacy 가 DEFAULT 와 다르면 (실제 편집한 흔적) 업로드
            if (!clausesEqual(legacyParsed, DEFAULT_CLAUSES)) {
              await api.put("/api/contract-clauses", {
                clauses: legacyParsed,
                updated_by: authSession?.employeeId ?? null,
              });
              // 마이그레이션 완료 · 화면 상태 = legacy 값
              setClauses(cloneClauses(legacyParsed));
              setInitialClauses(cloneClauses(legacyParsed));
              // localStorage 도 정규화된 값으로 재저장
              try { localStorage.setItem(CONTRACT_CLAUSES_KEY, JSON.stringify(legacyParsed)); } catch { /* silent */ }
              migrated = true;
              setNotice({ tone: "info", text: "기존 브라우저 저장값을 서버로 자동 업로드 했습니다. 이제 모든 관리자에게 공유됩니다." });
            }
          } catch { /* legacy parse 실패 · 무시 */ }
        }

        if (!migrated) {
          setClauses(cloneClauses(serverClauses));
          setInitialClauses(cloneClauses(serverClauses));
          // localStorage 동기화 (다음 ContractWriterPage 의 동기 loader 가 최신값 사용)
          try { localStorage.setItem(CONTRACT_CLAUSES_KEY, JSON.stringify(serverClauses)); } catch { /* silent */ }
        }
        setServerLoaded(true);
      } catch {
        // 서버 오류 · 기존 localStorage 값 유지 · UX 지속
        if (!cancelled) {
          setServerLoaded(true);
          setNotice({ tone: "info", text: "서버 조회 실패 · 이 브라우저 저장값으로 동작합니다. (저장 시 재시도)" });
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── UI · 카드 접기/펴기 (기본 전체 접힘 · 컴팩트 뷰)
  const [open, setOpen] = useState<Record<ClauseGroupKey, boolean>>({
    wageClauses: false, workTimeClauses: false, holidayClauses: false,
    disciplineClauses: false, etcClauses: false, privacyClauses: false,
  });
  // 2026-08-07 · 회사 정보 · 기본 접힘 (사용자 요청)
  const [companyInfoOpen, setCompanyInfoOpen] = useState(false);

  const [notice, setNotice] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);

  // 변경 여부 (dirty · 각 호만 · 시급은 즉시 저장)
  const clausesDirty = useMemo(() => !clausesEqual(clauses, initialClauses), [clauses, initialClauses]);
  const dirty = clausesDirty;

  // 자동 배너 제거
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  // ── 시급 편집 · 즉시 서버 저장 (useSettings 가 debounce 처리)
  const updWage = useCallback((cat: ContractCategory, field: keyof WageRate, val: number) => {
    const prev = wageRates?.[cat] ?? defaultWageForPosition(cat);
    const nextRate: WageRate = {
      weekday: field === "weekday" ? val : prev.weekday,
      weekend: field === "weekend" ? val : prev.weekend,
    };
    updateSettings({ wageRates: { ...(wageRates ?? {}), [cat]: nextRate } });
  }, [wageRates, updateSettings]);

  // ── 시급 초기화 (해당 직군 default 로)
  const resetWage = useCallback((cat: ContractCategory) => {
    const nextRates = { ...(wageRates ?? {}) };
    delete nextRates[cat];
    updateSettings({ wageRates: nextRates });
  }, [wageRates, updateSettings]);

  // ── 각 호 편집
  const updClause = useCallback((group: ClauseGroupKey, idx: number, val: string) => {
    setClauses(prev => {
      const next = { ...prev, [group]: prev[group].slice() };
      next[group][idx] = val;
      return next;
    });
  }, []);

  const addClause = useCallback((group: ClauseGroupKey) => {
    setClauses(prev => ({ ...prev, [group]: [...prev[group], ""] }));
  }, []);

  const removeClause = useCallback(async (group: ClauseGroupKey, idx: number) => {
    if (!await confirm({ message: "이 항목을 삭제하시겠습니까?", danger: true })) return;
    setClauses(prev => {
      const arr = prev[group].slice();
      arr.splice(idx, 1);
      return { ...prev, [group]: arr };
    });
  }, []);

  const moveClause = useCallback((group: ClauseGroupKey, idx: number, dir: -1 | 1) => {
    setClauses(prev => {
      const arr = prev[group].slice();
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return { ...prev, [group]: arr };
    });
  }, []);

  const toggleOpen = useCallback((group: ClauseGroupKey) => {
    setOpen(prev => ({ ...prev, [group]: !prev[group] }));
  }, []);

  // ── 전체 펼치기/접기
  const allOpen = Object.values(open).every(Boolean);
  const toggleAllOpen = useCallback(() => {
    const next = !allOpen;
    setOpen({
      wageClauses: next, workTimeClauses: next, holidayClauses: next,
      disciplineClauses: next, etcClauses: next, privacyClauses: next,
    });
  }, [allOpen]);

  // ── 저장 (각 호만 · 시급은 즉시 저장되므로 여기서 처리 안 함)
  //   T-C · 서버 저장 · 실패 시 localStorage fallback (saveContractClausesToServer 내부)
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await saveContractClausesToServer(clauses, authSession?.employeeId ?? null);
      setInitialClauses(cloneClauses(clauses));
      if (result.savedToServer) {
        setNotice({ tone: "ok", text: "각 호 내용이 서버에 저장되었습니다. 모든 관리자에게 즉시 반영됩니다." });
      } else {
        setNotice({
          tone: "err",
          text: `서버 저장 실패 · 이 브라우저에만 저장되었습니다 (${result.error ?? "네트워크 오류"}). 인터넷 확인 후 다시 [저장] 버튼을 눌러 주세요.`,
        });
      }
    } catch (err: any) {
      setNotice({ tone: "err", text: err?.message ?? "설정 저장에 실패했습니다." });
    } finally {
      setSaving(false);
    }
  };

  // ── 전체 저장 (회사정보 · 시급 · 각 호 · 순차)
  const handleSaveAll = async () => {
    if (overallSaving) return;
    setOverallSaving(true);
    setOverallSaveState("idle");
    const errors: string[] = [];
    try {
      // 1. 회사 정보 즉시 저장
      const ciOk = await saveCompanyInfoNow();
      if (!ciOk) errors.push("회사 정보 서버 저장 실패");

      // 1-b. 임금지급일 즉시 저장
      const pdOk = await savePaymentDayNow();
      if (!pdOk) errors.push("임금지급일 서버 저장 실패");

      // 2. 시급(wageRates) 포함 전체 settings 즉시 저장
      const wsOk = await saveSettingsNow();
      if (!wsOk) errors.push("시급 서버 저장 실패");

      // 3. 각 호 저장
      const clauseResult = await saveContractClausesToServer(clauses, authSession?.employeeId ?? null);
      if (clauseResult.savedToServer) {
        setInitialClauses(cloneClauses(clauses));
      } else {
        errors.push(`각 호 서버 저장 실패 (${clauseResult.error ?? "네트워크 오류"})`);
      }

      if (errors.length === 0) {
        setOverallSaveState("saved");
        setNotice({ tone: "ok", text: "모든 항목이 서버에 저장되었습니다. (회사 정보 · 시급 · 각 호)" });
      } else {
        setOverallSaveState("error");
        setNotice({ tone: "err", text: `일부 저장 실패: ${errors.join(" / ")}` });
      }
    } catch (err: any) {
      setOverallSaveState("error");
      setNotice({ tone: "err", text: err?.message ?? "전체 저장 중 오류가 발생했습니다." });
    } finally {
      setOverallSaving(false);
    }
  };

  // ── 기본값 (전체 · 시급은 wageRates 비우기 → default fallback)
  const handleResetToDefault = async () => {
    if (!await confirm({ message: "모든 시급 및 각 호 내용을 기본값으로 되돌립니다. 계속하시겠습니까?", danger: true })) return;
    updateSettings({ wageRates: {} });
    setClauses(cloneClauses(DEFAULT_CLAUSES));
    setNotice({ tone: "info", text: "기본값으로 되돌렸습니다. 각 호는 [저장] 버튼을 눌러야 확정됩니다." });
  };

  // ── 취소 (각 호만 · 마지막 저장값 복원)
  const handleRevert = () => {
    setClauses(cloneClauses(initialClauses));
    setNotice({ tone: "info", text: "각 호를 마지막 저장값으로 되돌렸습니다." });
  };

  // ── 그룹별 기본값 복원
  const handleResetGroup = async (group: ClauseGroupKey) => {
    if (!await confirm({ message: `[${CLAUSE_GROUP_META.find(g => g.key === group)?.label}] 항목을 기본값으로 되돌립니다. 계속하시겠습니까?`, danger: true })) return;
    setClauses(prev => ({ ...prev, [group]: DEFAULT_CLAUSES[group].slice() }));
  };

  return (
    <div className={embedded ? "flex-1 flex flex-col" : "min-h-screen bg-zinc-50 flex flex-col"}>
      {!embedded && (
        <AppNavHeader
          activePage={"business-manage" as AppNavPage}
          authSession={authSession}
          onBack={onBack}
          onNavigate={onNavigate}
          onLogout={onLogout}
        />
      )}

      <main className="flex-1 max-w-[1100px] mx-auto w-full px-3 sm:px-5 py-4 flex flex-col gap-3">

        {/* ── 상단 sticky · 전체 저장 배너 ──────────────────────────────── */}
        <div className="sticky top-0 z-20 -mx-3 sm:-mx-5 px-3 sm:px-5 py-2 bg-white/95 backdrop-blur-sm border-b border-zinc-200 shadow-sm flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <Gear size={15} weight="fill" />
            </div>
            <span className="text-[13px] font-black text-zinc-800 leading-none hidden sm:block">근로계약서 설정</span>
            {overallSaveState === "saved" && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-bold">
                <Check size={11} weight="bold" /> 모든 항목 저장됨
              </span>
            )}
            {overallSaveState === "error" && (
              <span className="inline-flex items-center gap-1 text-[11px] text-rose-500 font-bold">
                <Warning size={11} weight="fill" /> 일부 저장 실패
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={overallSaving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-[12px] font-black shadow-sm transition-colors cursor-pointer shrink-0"
          >
            <FloppyDisk size={13} weight="bold" />
            {overallSaving ? "저장 중..." : "모두 저장"}
          </button>
        </div>

        {/* ── 페이지 헤더 · 컴팩트 ──────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div>
              <h1 className="text-base sm:text-lg font-black text-zinc-800 leading-none">근로계약서 설정</h1>
              <p className="text-[11px] text-zinc-500 mt-0.5 font-semibold">
                시급·회사정보 · 즉시 저장 &nbsp;·&nbsp; 각 호 · 저장 버튼으로 확정
                {!serverLoaded && <span className="ml-1.5 text-zinc-400">· 서버 로드 중...</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleResetToDefault}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 text-[12px] font-semibold transition-colors cursor-pointer"
              title="기본값 초기화"
            >
              <ArrowsClockwise size={13} />
              <span className="hidden sm:inline">기본값</span>
            </button>
            <button
              type="button"
              onClick={handleRevert}
              disabled={!dirty}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed text-[12px] font-semibold transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-[12px] font-black shadow-sm transition-colors cursor-pointer"
            >
              <FloppyDisk size={13} weight="bold" />
              {saving ? "저장 중..." : "각 호 저장"}
            </button>
          </div>
        </div>

        {/* 안내 배너 */}
        {notice && (
          <div
            className={`rounded-lg border px-3 py-2 text-[12px] font-semibold flex items-center gap-2 ${
              notice.tone === "ok"  ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
              notice.tone === "err" ? "bg-rose-50 text-rose-700 border-rose-200" :
                                      "bg-zinc-50 text-zinc-700 border-zinc-200"
            }`}
          >
            {notice.tone === "ok"  ? <Check size={13} weight="bold" /> :
             notice.tone === "err" ? <Warning size={13} weight="fill" /> :
                                     <Info size={13} weight="fill" />}
            {notice.text}
          </div>
        )}

        {/* ── 2컬럼 그리드 · 회사정보 (좌) + 시급 (우) ─────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

          {/* 섹션 0 · 회사 정보 · 2026-08-07 · 기본 접힘 (사용자 요청) */}
          <section className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setCompanyInfoOpen(o => !o)}
              className="w-full flex items-center gap-2 px-3 py-2.5 border-b border-zinc-100 bg-zinc-50/60 hover:bg-zinc-100/60 transition cursor-pointer"
              aria-expanded={companyInfoOpen}
            >
              <span className={`text-zinc-400 transition-transform ${companyInfoOpen ? "" : "-rotate-90"}`}>▼</span>
              <div className="w-7 h-7 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <Info size={14} weight="fill" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <h2 className="text-[13px] font-black text-emerald-700 leading-none">회사 정보</h2>
                <p className="text-[11px] text-zinc-500 font-semibold mt-0.5">근로계약서 사업주란 자동 채움 · 편집 즉시 저장</p>
              </div>
              {!companyInfoLoaded && (
                <span className="text-[11px] text-zinc-400 font-semibold shrink-0">로딩 중...</span>
              )}
              {companyInfoLoaded && companyInfoSaveState === "saving" && (
                <span className="text-[11px] text-indigo-500 font-semibold shrink-0">저장 중...</span>
              )}
              {companyInfoLoaded && companyInfoSaveState === "saved" && (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold shrink-0">
                  <Check size={11} weight="bold" /> 저장됨
                </span>
              )}
              {companyInfoLoaded && companyInfoSaveState === "error" && (
                <span className="inline-flex items-center gap-1 text-[11px] text-rose-500 font-semibold shrink-0">
                  <Warning size={11} weight="fill" /> 저장 실패
                </span>
              )}
            </button>

            {companyInfoOpen && (
            <div className="p-3 grid grid-cols-2 gap-2.5">
              {/* 상호 */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-zinc-500">상호</label>
                <input
                  type="text"
                  value={companyInfo.name}
                  onChange={(e) => setCompanyInfo(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="예) 오산 메가타운 약국"
                  disabled={!companyInfoLoaded}
                  className="bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-800 font-semibold focus:outline-none focus:border-emerald-500 transition disabled:opacity-50"
                />
              </div>
              {/* 대표자 이름 */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-zinc-500">대표자 이름</label>
                <input
                  type="text"
                  value={companyInfo.representativeName}
                  onChange={(e) => setCompanyInfo(prev => ({ ...prev, representativeName: e.target.value }))}
                  placeholder="예) 강남성"
                  disabled={!companyInfoLoaded}
                  className="bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-800 font-semibold focus:outline-none focus:border-emerald-500 transition disabled:opacity-50"
                />
              </div>
              {/* 사업장 주소 */}
              <div className="flex flex-col gap-1 col-span-2">
                <label className="text-[11px] font-bold text-zinc-500">사업장 주소</label>
                <input
                  type="text"
                  value={companyInfo.address}
                  onChange={(e) => setCompanyInfo(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="예) 경기도 오산시 경기대로 868-4 2층"
                  disabled={!companyInfoLoaded}
                  className="bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-800 font-semibold focus:outline-none focus:border-emerald-500 transition disabled:opacity-50"
                />
              </div>
              {/* 사업자등록번호 */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-zinc-500">사업자등록번호 <span className="text-zinc-400 font-normal">(선택)</span></label>
                <input
                  type="text"
                  value={companyInfo.regNo}
                  onChange={(e) => setCompanyInfo(prev => ({ ...prev, regNo: e.target.value }))}
                  placeholder="예) 123-45-67890"
                  disabled={!companyInfoLoaded}
                  className="bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-800 font-semibold focus:outline-none focus:border-emerald-500 transition disabled:opacity-50"
                />
              </div>
              {/* 대표자 직함 */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-zinc-500">대표자 직함 <span className="text-zinc-400 font-normal">(선택)</span></label>
                <input
                  type="text"
                  value={companyInfo.representativeTitle ?? ""}
                  onChange={(e) => setCompanyInfo(prev => ({ ...prev, representativeTitle: e.target.value }))}
                  placeholder="예) 대표약사"
                  disabled={!companyInfoLoaded}
                  className="bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-800 font-semibold focus:outline-none focus:border-emerald-500 transition disabled:opacity-50"
                />
              </div>
              {/* 임금지급일 · 계약서 "2. 임금지급일" 항목에 그대로 표시 */}
              <div className="flex flex-col gap-1 col-span-2">
                <label className="text-[11px] font-bold text-zinc-500">
                  임금지급일 <span className="text-zinc-400 font-normal">(근로계약서에 자동 반영)</span>
                </label>
                <textarea
                  value={paymentDayText}
                  onChange={(e) => setPaymentDayText(e.target.value)}
                  placeholder="예) 당월 01일부터 당월 말일 까지 근로한 부분에 대하여 당월 말일에 '을' 본인 명의의 통장으로 지급한다."
                  disabled={!paymentDayLoaded}
                  rows={2}
                  className="bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-800 font-semibold focus:outline-none focus:border-emerald-500 transition disabled:opacity-50 resize-none"
                />
              </div>
              {/* 회사 정보 개별 저장 버튼 */}
              <div className="col-span-2 flex justify-end pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    await Promise.all([saveCompanyInfoNow(), savePaymentDayNow()]);
                  }}
                  disabled={!companyInfoLoaded || companyInfoSaveState === "saving"}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-[12px] font-black shadow-sm transition-colors cursor-pointer"
                >
                  <FloppyDisk size={12} weight="bold" />
                  {companyInfoSaveState === "saving" ? "저장 중..." : "회사 정보 저장"}
                </button>
              </div>
            </div>
            )}
          </section>

          {/* 섹션 1 · 직군별 시급 */}
          <section className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
            <header className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-100 bg-zinc-50/60">
              <div className="w-7 h-7 rounded-md bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                <CurrencyKrw size={14} weight="fill" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[13px] font-black text-indigo-700 leading-none">직군별 시급</h2>
                <p className="text-[11px] text-zinc-500 font-semibold mt-0.5">편집 즉시 서버 저장 · 근로계약서 자동 반영</p>
              </div>
            </header>

            {/* md+: 2x2 그리드 · 모바일: 1컬럼 */}
            <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              {JOB_META.map(job => {
                const stored = wageRates?.[job.key];
                const fallback = defaultWageForPosition(job.key);
                const rate = stored ?? fallback;
                const isDefault = !stored;
                return (
                  <div
                    key={job.key}
                    className={`flex flex-col rounded-xl border ${job.border} border-l-4 ${job.accent} bg-white overflow-hidden shadow-sm`}
                  >
                    {/* 카드 헤더 · 직군명 + 리셋 */}
                    <div className={`flex items-center justify-between px-3 py-2 ${job.bg}`}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-[13px] font-black ${job.color} leading-none`}>{job.label}</span>
                        {isDefault && (
                          <span className="text-[9px] font-semibold text-zinc-400 leading-none" title="기본값 사용 중">
                            기본값
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => resetWage(job.key)}
                        disabled={isDefault}
                        className={`inline-flex items-center justify-center w-5 h-5 rounded-md border ${job.border} bg-white/80 ${job.color} hover:bg-white disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer transition-colors`}
                        title="이 직군 기본값으로 되돌리기"
                      >
                        <ArrowsClockwise size={10} weight="bold" />
                      </button>
                    </div>

                    {/* 주중 · 주말 나란히 */}
                    <div className="flex items-stretch divide-x divide-zinc-100 px-3 py-2.5">
                      <div className="flex-1 flex flex-col gap-1 pr-3">
                        <label className="text-[10px] font-bold text-zinc-400 tracking-wide">주중 (원)</label>
                        <input
                          type="number"
                          min={0}
                          step={10}
                          value={rate.weekday || ""}
                          placeholder={String(fallback.weekday)}
                          onChange={(e) => updWage(job.key, "weekday", Math.max(0, Number(e.target.value) || 0))}
                          className={`w-full bg-zinc-50 border rounded-lg px-2 py-1.5 text-[13px] font-black text-right tabular-nums focus:outline-none focus:bg-white focus:border-indigo-400 transition ${isDefault ? "border-zinc-200 text-zinc-400" : "border-zinc-200 text-zinc-800"}`}
                        />
                      </div>
                      <div className="flex-1 flex flex-col gap-1 pl-3">
                        <label className="text-[10px] font-bold text-zinc-400 tracking-wide">주말 (원)</label>
                        <input
                          type="number"
                          min={0}
                          step={10}
                          value={rate.weekend || ""}
                          placeholder={String(fallback.weekend)}
                          onChange={(e) => updWage(job.key, "weekend", Math.max(0, Number(e.target.value) || 0))}
                          className={`w-full bg-zinc-50 border rounded-lg px-2 py-1.5 text-[13px] font-black text-right tabular-nums focus:outline-none focus:bg-white focus:border-indigo-400 transition ${isDefault ? "border-zinc-200 text-zinc-400" : "border-zinc-200 text-zinc-800"}`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* 시급 개별 저장 버튼 · full-width */}
              <div className="md:col-span-2 flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={saveSettingsNow}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-black shadow-sm transition-colors cursor-pointer"
                  title="시급 즉시 서버 저장 (자동 저장 중이지만 명시적 저장도 가능)"
                >
                  <FloppyDisk size={12} weight="bold" />
                  시급 저장
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* ── 각 호 CMS 섹션 헤더 ───────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-zinc-100 text-zinc-600 flex items-center justify-center shrink-0">
              <ListChecks size={14} weight="fill" />
            </div>
            <div>
              <h2 className="text-[13px] font-black text-zinc-800 leading-none">각 호 내용 편집</h2>
              <p className="text-[11px] text-zinc-500 font-semibold mt-0.5">근로계약서에 삽입되는 조항 · 그룹 클릭해서 펼치기</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleAllOpen}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 text-[11px] font-bold transition-colors cursor-pointer shrink-0"
          >
            {allOpen ? <CaretDown size={11} weight="bold" /> : <CaretRight size={11} weight="bold" />}
            {allOpen ? "전체 접기" : "전체 펼치기"}
          </button>
        </div>

        {/* 각 호 그룹 · 1컬럼 세로 나열 (내용이 길어 2컬럼 가독성 저하) */}
        <div className="grid grid-cols-1 gap-3">
          {CLAUSE_GROUP_META.map(grp => {
            const Icon = grp.icon;
            const list = clauses[grp.key];
            const isOpen = open[grp.key];
            return (
              <section
                key={grp.key}
                className={`bg-white border ${grp.border} rounded-xl shadow-sm overflow-hidden`}
              >
                {/* 아코디언 헤더 */}
                <header
                  className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-zinc-50/60 transition-colors"
                  onClick={() => toggleOpen(grp.key)}
                  role="button"
                  aria-expanded={isOpen}
                >
                  <div className={`w-7 h-7 rounded-md ${grp.bg} ${grp.color} flex items-center justify-center shrink-0`}>
                    <Icon size={13} weight="fill" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-[13px] font-black ${grp.color} leading-none`}>{grp.label}</h3>
                    <p className="text-[11px] text-zinc-500 font-semibold mt-0.5">{grp.desc}</p>
                  </div>
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${grp.bg} ${grp.color} shrink-0`}>{list.length}</span>
                  {isOpen
                    ? <CaretDown size={12} weight="bold" className="text-zinc-400 shrink-0" />
                    : <CaretRight size={12} weight="bold" className="text-zinc-400 shrink-0" />}
                </header>

                {/* 펼쳐진 내용 */}
                {isOpen && (
                  <div className={`border-t ${grp.border} p-3 flex flex-col gap-2`}>
                    {list.length === 0 && (
                      <div className="text-[11px] text-zinc-400 font-semibold text-center py-3 border border-dashed border-zinc-200 rounded-lg">
                        등록된 항목이 없습니다.
                      </div>
                    )}

                    {list.map((text, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 p-2 rounded-lg border border-zinc-100 bg-zinc-50/40 hover:border-zinc-200 transition-colors"
                      >
                        <div className={`flex items-center justify-center min-w-[22px] h-[22px] rounded-md ${grp.bg} ${grp.color} text-[10px] font-black shrink-0 mt-1`}>
                          {idx + 1}
                        </div>
                        <textarea
                          value={text}
                          onChange={(e) => updClause(grp.key, idx, e.target.value)}
                          rows={Math.max(2, Math.min(5, Math.ceil(text.length / 55) || 2))}
                          placeholder="내용을 입력하세요."
                          className="flex-1 bg-white border border-zinc-200 rounded-lg px-2 py-1.5 text-[12px] text-zinc-800 font-semibold focus:outline-none focus:border-indigo-500 focus:shadow-sm transition resize-y leading-relaxed"
                        />
                        <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                          <button
                            type="button"
                            onClick={() => moveClause(grp.key, idx, -1)}
                            disabled={idx === 0}
                            className="w-6 h-6 rounded-md border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                            title="위로 이동"
                          >
                            <ArrowUp size={10} weight="bold" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveClause(grp.key, idx, 1)}
                            disabled={idx === list.length - 1}
                            className="w-6 h-6 rounded-md border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                            title="아래로 이동"
                          >
                            <ArrowDown size={10} weight="bold" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeClause(grp.key, idx)}
                            className="w-6 h-6 rounded-md border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 flex items-center justify-center cursor-pointer transition-colors"
                            title="삭제"
                          >
                            <Trash size={10} weight="bold" />
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => addClause(grp.key)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-50 hover:border-indigo-400 hover:text-indigo-600 text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        <Plus size={11} weight="bold" />
                        항목 추가
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetGroup(grp.key)}
                        className="text-[10px] font-bold text-zinc-400 hover:text-indigo-600 transition-colors cursor-pointer"
                        title="이 그룹 기본값으로 되돌리기"
                      >
                        기본값 복원
                      </button>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>

      </main>
    </div>
  );
};

export default ContractSettingsPage;
