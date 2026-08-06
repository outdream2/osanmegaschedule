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
import { useConfirm } from "../../hooks/useConfirm";
import {
  Gear, FloppyDisk, ArrowsClockwise, Check, Warning, Info,
  CaretDown, CaretRight, Plus, Trash, ArrowUp, ArrowDown,
  CurrencyKrw, Coins, Clock, Calendar, Shield, ListChecks, Lock,
} from "@phosphor-icons/react";

import { AppNavHeader, type AppNavPage } from "../AppNavHeader";
import type { AuthSession } from "../../types";
import { useSettings, defaultWageForPosition, type WageRate } from "../../hooks/useSettings";

// ─────────────────────────────────────────────────────────────────────────────
// 하위호환 · 기존 export (ContractWriterPage 가 import 하므로 유지)
// ─────────────────────────────────────────────────────────────────────────────

export type ContractCategory = "약사" | "매장" | "창고" | "기타";

export interface ContractWriterSettings {
  약사: string;
  매장: string;
  창고: string;
  기타: string;
  commonNotice?: string;
}

// 하위호환 · localStorage key 는 캐시로만 사용 (서버 정본 · 오프라인 fallback)
export const CONTRACT_SETTINGS_KEY = "contract-writer-settings";
// 신규 · Supabase settings 서버 저장 key
export const CONTRACT_WRITER_SETTINGS_DB_KEY = "contract_writer_settings";

/** ContractWriterPage 하드코딩 fallback 과 동일해야 함 · 초기값 · 하위 호환 */
export const DEFAULT_CONTRACT_SETTINGS: ContractWriterSettings = {
  약사: "일반의약품·전문의약품 조제·복약지도 · 의약품 재고 관리 · 처방전 접수",
  매장: "약국 매장 진열·정리 · OTC 판매 · 카운터 계산 · 고객 응대",
  창고: "의약품 창고 관리 · 입고·검수 · 매장 보충 · 재고 실사",
  기타: "매장 지원 업무",
  commonNotice: "",
};

/** raw → 정규화된 ContractWriterSettings */
function normalizeContractSettings(parsed: unknown): ContractWriterSettings {
  if (!parsed || typeof parsed !== "object") return { ...DEFAULT_CONTRACT_SETTINGS };
  const p = parsed as Record<string, unknown>;
  return {
    약사: typeof p.약사 === "string" ? p.약사 : DEFAULT_CONTRACT_SETTINGS.약사,
    매장: typeof p.매장 === "string" ? p.매장 : DEFAULT_CONTRACT_SETTINGS.매장,
    창고: typeof p.창고 === "string" ? p.창고 : DEFAULT_CONTRACT_SETTINGS.창고,
    기타: typeof p.기타 === "string" ? p.기타 : DEFAULT_CONTRACT_SETTINGS.기타,
    commonNotice: typeof p.commonNotice === "string" ? p.commonNotice : "",
  };
}

/**
 * 동기 로더 · localStorage 캐시 기반 · 하위호환 유지
 * · ContractWriterPage 가 useMemo 로 즉시 호출 (async 회피)
 * · 신규 (2026-08-06): 서버에서 미리 fetch 한 값이 localStorage 캐시에 저장되어 있으므로 최신값 반영됨
 */
export function loadContractSettings(): ContractWriterSettings {
  try {
    const raw = localStorage.getItem(CONTRACT_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_CONTRACT_SETTINGS };
    return normalizeContractSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONTRACT_SETTINGS };
  }
}

/**
 * 2026-08-06 · T-DB-Migrate-LocalStorage
 * 서버 조회 · GET /api/settings?key=contract_writer_settings
 * · 성공 → localStorage 캐시에 저장 (다음 loadContractSettings 호출 시 최신값)
 * · 실패 → localStorage fallback (기존 캐시값 유지)
 */
export async function fetchContractWriterSettings(): Promise<ContractWriterSettings> {
  try {
    const res = await fetch(
      `/api/settings?key=${encodeURIComponent(CONTRACT_WRITER_SETTINGS_DB_KEY)}`,
      { credentials: "include" },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (body?.value == null) {
      // 서버 값 없음 · localStorage 에 값 있으면 마이그레이션
      const legacyRaw = (() => { try { return localStorage.getItem(CONTRACT_SETTINGS_KEY); } catch { return null; } })();
      if (legacyRaw) {
        try {
          const legacy = normalizeContractSettings(JSON.parse(legacyRaw));
          // 서버로 upload (실패 silent · 다음 마운트에서 재시도)
          fetch(`/api/settings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ key: CONTRACT_WRITER_SETTINGS_DB_KEY, value: legacy }),
          }).catch(() => { /* silent */ });
          return legacy;
        } catch { /* legacy parse 실패 · fallthrough */ }
      }
      return { ...DEFAULT_CONTRACT_SETTINGS };
    }
    const merged = normalizeContractSettings(body.value);
    try { localStorage.setItem(CONTRACT_SETTINGS_KEY, JSON.stringify(merged)); } catch { /* silent */ }
    return merged;
  } catch {
    return loadContractSettings();
  }
}

/**
 * 서버 저장 · POST /api/settings · key=contract_writer_settings
 * · 성공 → localStorage 캐시도 동기화
 * · 실패 → localStorage 만 저장 (fallback)
 */
export async function saveContractWriterSettingsToServer(
  settings: ContractWriterSettings,
): Promise<{ ok: boolean; savedToServer: boolean; error?: string }> {
  // localStorage 는 항상 저장 (fallback 안전망)
  try { localStorage.setItem(CONTRACT_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* silent */ }
  try {
    const res = await fetch(`/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ key: CONTRACT_WRITER_SETTINGS_DB_KEY, value: settings }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { ok: true, savedToServer: false, error: errBody?.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, savedToServer: true };
  } catch (err: any) {
    return { ok: true, savedToServer: false, error: err?.message ?? "네트워크 오류" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 신규 · 직군별 시급
// ─────────────────────────────────────────────────────────────────────────────

export const JOB_WAGES_KEY = "contractJobWages:v1";

export interface JobWage {
  weekday: number; // 주중 시급 (원)
  weekend: number; // 주말 시급 (원)
}

export type ContractJobWages = Record<ContractCategory, JobWage>;

export const DEFAULT_JOB_WAGES: ContractJobWages = {
  약사: { weekday: 30000, weekend: 33000 },
  매장: { weekday: 10030, weekend: 11000 },
  창고: { weekday: 10030, weekend: 11000 },
  기타: { weekday: 10030, weekend: 11000 },
};

export function loadJobWages(): ContractJobWages {
  try {
    const raw = localStorage.getItem(JOB_WAGES_KEY);
    if (!raw) return { ...DEFAULT_JOB_WAGES };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_JOB_WAGES };
    const pick = (k: ContractCategory): JobWage => {
      const v = (parsed as any)[k];
      if (!v || typeof v !== "object") return { ...DEFAULT_JOB_WAGES[k] };
      const wd = Number(v.weekday);
      const we = Number(v.weekend);
      return {
        weekday: Number.isFinite(wd) && wd >= 0 ? wd : DEFAULT_JOB_WAGES[k].weekday,
        weekend: Number.isFinite(we) && we >= 0 ? we : DEFAULT_JOB_WAGES[k].weekend,
      };
    };
    return {
      약사: pick("약사"),
      매장: pick("매장"),
      창고: pick("창고"),
      기타: pick("기타"),
    };
  } catch {
    return { ...DEFAULT_JOB_WAGES };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 신규 · 각 호 내용 (CMS)
// ─────────────────────────────────────────────────────────────────────────────

export const CONTRACT_CLAUSES_KEY = "contractClauses:v1";

export type ClauseGroupKey =
  | "wageClauses"
  | "workTimeClauses"
  | "holidayClauses"
  | "disciplineClauses"
  | "etcClauses"
  | "privacyClauses";

export type ContractClauses = Record<ClauseGroupKey, string[]>;

export const DEFAULT_CLAUSES: ContractClauses = {
  wageClauses: [
    "상기 월 급여 총액에는 (고정) 연장·휴일시간에 대한 (고정) 연장·휴일근로수당이 포함되어 있으며, 추가 연장 및 휴일근무는 근무일 및 휴무일(휴일) 상황에 맞게 수행할 수 있고, 매달 수행 가능한 연장 및 휴일 근무의 범위는 상기에 기재된 연장 및 휴일근로시간으로 한다.",
    "약국의 업무 특성상 불규칙한 근무로 인해 월 급여 총액에는 월간 기본 근로일, 기본 근로시간 외 추가근무를 고려하여 책정한 상기의 연장, 휴일, 야간 근로시간에 대한 수당의 사전 산입에 을은 자유로운 의사로 동의한다.",
    "'을'은 연차휴가수당을 월 지급액에 포괄하여 지급받음에 동의하고, '갑'은 '을'의 자유로운 연차휴가사용을 보장하되 '을'이 연차유급휴가를 사용할 경우 기 지급된 수당을 차감하여 정산한다. 또한, 연차휴가수당은 해당 월에 회사가 정한 징계사유에 해당하지 않고 만근한 경우에 한하여 지급한다.",
    "'을'은 관공서 공휴일 및 국경일의 날 근무로 발생하는 휴일근로 수당을 연봉에 포괄하여 (년 22일 근로에 가산을 반영한 휴일근로수당) 매달 임금으로 지급 받음에 자유로운 의사로 동의한다.",
    "관리 편의상 사전 책정한 상기의 (고정) 근로시간을 상회하여 연장·휴일근로를 한 경우에는 상기 월 급여 총액과 별도로 추가수당(상시 근로자가 5인 미만인 경우 근로기준법 제56조의 적용을 제외한다.)을 지급한다. 다만, 추가수당을 인정하는 경우는 회사의 사전 지시나 승인이 있는 경우에 한한다.",
    "지각, 조퇴 시에는 해당 시간 본을 공제하며, 중도 입·퇴사의 경우 일할 계산하여 임금을 지급한다.",
  ],
  workTimeClauses: [
    "소정근로일은 주 40시간 내에서 당사자가 정하는 근로일을 의미하며, 무급 휴무일인 토요일에 근로할 경우 연장근로로 보고, 주휴일인 일요일에 근로할 경우 휴일근로로 본다.",
    "업무형편상 부득이한 경우 상기 휴게 시간을 변경할 수 있고, 제대로 사용하지 못한 휴게시간은 다른 시간 내에서 보충 사용하는 것에 동의한다.",
    "소정근로시간은 휴게시간을 제외하고 일단위 법정근로시간(8시간) 내에서 당사자가 정하는 시간이며, '을'은 '갑'의 사정에 따라 필요 시 상기 근로시간 이외에 추가로 연장, 야간, 휴일근로를 수행할 수 있음에 자유로운 의사로 동의한다.",
    "사업장 외 근무 또는 출장근무는 특별한 사정이 없는 한 8시간을 근무한 것으로 본다. '을'은 사업장 외 근무 또는 출장근무 수행에 대한 간주근로시간 근무를 '갑'으로부터 충분한 설명을 받았으며, 이에 본인의 자유의사로 동의한다. (해당자에 한함)",
  ],
  holidayClauses: [
    "1주 동안 소정근무일을 개근한 경우에는 주 1회의 유급휴일을 부여하며, 주휴일은 일요일로 한다. 다만, 1주일의 소정근로시간이 15시간 미만인 경우와 해당 주에 결근 시에는 주휴수당을 지급하지 아니한다.",
    "근로자의 날은 유급휴일로 한다.",
    "토요일은 무급휴무일로 한다.",
    "「관공서의 공휴일에 관한 규정」 제2조 각 호(제1호는 제외한다)에 따른 공휴일 및 같은 영 제3조에 따른 대체공휴일은 유급휴일로 한다. 다만, 근로자대표와 서면으로 합의한 경우 특정한 근로일로 대체할 수 있으며, 보상 휴가 부여도 가능하다. (상시 근로자 수가 5인 미만인 경우에는 적용을 제외한다.)",
  ],
  disciplineClauses: [
    "부정 및 허위 등의 방법으로 채용된 자",
    "업무상 비밀 및 기밀을 누설하여 회사에 피해를 입힌 자",
    "회사의 명예 또는 신용에 손상을 입힌 자",
    "회사의 영업을 방해하는 언행을 한 자",
    "회사의 규율과 상사의 정당한 지시를 어겨 질서를 문란하게 한 자",
    "정당한 이유 없이 회사의 물품 및 금품을 반출한 자",
    "직무를 이용하여 부당한 이익을 취한 자",
    "회사가 정한 복무규정을 위반한 자",
    "직장 내 성희롱 행위를 한 자",
    "직장 내 괴롭힘 행위를 한 자",
    "무단으로 결근한 자",
    "근무태도나 근무성적이 극히 불량하고 개선의 여지가 없다고 판단되는 자",
    "기타 이에 준하는 행위로 징계 및 근로계약 해지가 필요하다고 판단되는 행위를 한 경우",
  ],
  etcClauses: [
    "임금 지급방법: '을'에게 직접 지급 또는 '을'이 지정한 예금 통장에 입금한다.",
    "'갑'과 '을'은 상기 임금내역을 회사 내의 타 근로자에게 누설하지 아니한다.",
    "임의 퇴사하고자 하는 경우에는 30일 전에 미리 회사에 알려야 하며, 사직서 제출 후 사용자의 수리가 있기 전까지는 '갑'이 지정하는 자에게 인수인계를 하는 등 제반업무를 수행하여야 한다.",
    "'갑'과 '을'은 성실한 근로관계가 형성되도록 노력하며 본 계약 이외의 사항에 대하여는 노동관계법, 취업규칙, 기타 회사가 정한 방침에 따른다.",
    "'을'은 퇴직 시 과다 부여된 연차휴가 및 수당에 대해 '갑'이 '을'의 임금 및 퇴직금에 공제하여 지급하는 것에 동의한다.",
  ],
  privacyClauses: [
    "정보의 수집 및 이용 목적 / CCTV 설치 목적: 당사의 인적자원관리 · 방범 및 화재예방, 시설안전관리, 사업장내 사고예방 및 범죄예방",
    "정보 보유 및 이용기간: 근로관계가 유지되는 기간 · 단, CCTV 화상영상 정보의 경우 일정기간 후 기존 영상정보에서 삭제",
    "개인정보의 항목: 성명, 주민번호, 피부양자정보, 주소, 이메일, 휴대전화번호 등 연락처 · 학력, 근무경력과 계좌번호 등 금융정보 · 기타 근로와 관련된 개인정보 · 사진, 화상영상(CCTV)",
    "CCTV 촬영시간 및 범위: 촬영시간 24시간 연속 촬영 및 녹화 · 촬영범위 출입구 및 복도, 사업장내 등 건물 내 주요 시설",
  ],
};

const CLAUSE_GROUP_KEYS: ClauseGroupKey[] = [
  "wageClauses", "workTimeClauses", "holidayClauses",
  "disciplineClauses", "etcClauses", "privacyClauses",
];

/**
 * localStorage 값을 정규화 · DEFAULT 로 채워서 완전한 ContractClauses 반환
 * (loadContractClauses / fetchContractClauses 공용)
 */
function normalizeClauses(parsed: any): ContractClauses {
  if (!parsed || typeof parsed !== "object") return cloneClauses(DEFAULT_CLAUSES);
  const out = {} as ContractClauses;
  for (const k of CLAUSE_GROUP_KEYS) {
    const arr = (parsed as any)[k];
    if (Array.isArray(arr) && arr.length > 0 && arr.every((v: any) => typeof v === "string")) {
      out[k] = arr.slice();
    } else {
      out[k] = DEFAULT_CLAUSES[k].slice();
    }
  }
  return out;
}

/**
 * 동기 로더 · localStorage 기반 · 하위호환 유지
 * · ContractWriterPage 가 useMemo 로 즉시 호출 (async 회피)
 * · 신규: 서버에서 미리 fetch 한 값이 localStorage 에 저장되어 있으므로 최신값 반영됨
 */
export function loadContractClauses(): ContractClauses {
  try {
    const raw = localStorage.getItem(CONTRACT_CLAUSES_KEY);
    if (!raw) return cloneClauses(DEFAULT_CLAUSES);
    return normalizeClauses(JSON.parse(raw));
  } catch {
    return cloneClauses(DEFAULT_CLAUSES);
  }
}

/**
 * 서버 조회 · fetch("/api/contract-clauses")
 * · 성공: localStorage 에 동기화 (다음 loadContractClauses 호출 시 최신값)
 * · 실패: localStorage fallback (기존 값 유지)
 */
export async function fetchContractClauses(): Promise<ContractClauses> {
  try {
    const res = await fetch("/api/contract-clauses", { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const merged = normalizeClauses(data);
    // localStorage sync · ContractWriterPage 의 동기 loader 가 즉시 최신값 사용
    try { localStorage.setItem(CONTRACT_CLAUSES_KEY, JSON.stringify(merged)); } catch { /* silent */ }
    return merged;
  } catch {
    // fallback · 기존 localStorage 값
    return loadContractClauses();
  }
}

/**
 * 서버 저장 · PUT /api/contract-clauses (일괄)
 * · 성공: localStorage 도 동기화
 * · 실패: localStorage 만 저장 (fallback · 오프라인/서버 다운 시 서비스 유지)
 * @returns { ok: boolean · savedToServer: boolean }
 */
export async function saveContractClausesToServer(
  clauses: ContractClauses,
  updatedBy?: number | null,
): Promise<{ ok: boolean; savedToServer: boolean; error?: string }> {
  // localStorage 는 항상 저장 (fallback 안전망)
  try { localStorage.setItem(CONTRACT_CLAUSES_KEY, JSON.stringify(clauses)); } catch { /* silent */ }

  try {
    const res = await fetch("/api/contract-clauses", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        clauses,
        updated_by: updatedBy ?? null,
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { ok: true, savedToServer: false, error: errBody?.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, savedToServer: true };
  } catch (err: any) {
    return { ok: true, savedToServer: false, error: err?.message ?? "네트워크 오류" };
  }
}

function cloneClauses(src: ContractClauses): ContractClauses {
  return {
    wageClauses: src.wageClauses.slice(),
    workTimeClauses: src.workTimeClauses.slice(),
    holidayClauses: src.holidayClauses.slice(),
    disciplineClauses: src.disciplineClauses.slice(),
    etcClauses: src.etcClauses.slice(),
    privacyClauses: src.privacyClauses.slice(),
  };
}

function clausesEqual(a: ContractClauses, b: ContractClauses): boolean {
  const keys: ClauseGroupKey[] = [
    "wageClauses", "workTimeClauses", "holidayClauses",
    "disciplineClauses", "etcClauses", "privacyClauses",
  ];
  for (const k of keys) {
    const aa = a[k]; const bb = b[k];
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 메타 · 직군 & 각 호 그룹
// ─────────────────────────────────────────────────────────────────────────────

const JOB_META: Array<{
  key: ContractCategory;
  label: string;
  color: string;    // 텍스트
  bg: string;       // 배경
  border: string;   // 테두리
}> = [
  { key: "약사", label: "약사", color: "text-violet-700",  bg: "bg-violet-50",  border: "border-violet-200"  },
  { key: "매장", label: "매장", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  { key: "창고", label: "창고", color: "text-orange-700",  bg: "bg-orange-50",  border: "border-orange-200"  },
  { key: "기타", label: "기타", color: "text-slate-700",   bg: "bg-slate-50",   border: "border-slate-200"   },
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
  { key: "wageClauses",       label: "임금 단서",        desc: "임금·수당 지급에 관한 사전 동의 및 약정",       icon: Coins,      color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200"   },
  { key: "workTimeClauses",   label: "근로시간·휴게",    desc: "근로시간·휴게시간·간주근로 등 약정",          icon: Clock,      color: "text-sky-700",     bg: "bg-sky-50",     border: "border-sky-200"     },
  { key: "holidayClauses",    label: "휴일",             desc: "주휴일·공휴일·근로자의 날 등",                icon: Calendar,   color: "text-teal-700",    bg: "bg-teal-50",    border: "border-teal-200"    },
  { key: "disciplineClauses", label: "징계·해지 사유",   desc: "근로계약 해지 및 징계 사유 각 호",             icon: Shield,     color: "text-rose-700",    bg: "bg-rose-50",    border: "border-rose-200"    },
  { key: "etcClauses",        label: "기타",             desc: "지급방법·비밀유지·인수인계 등",                icon: ListChecks, color: "text-indigo-700",  bg: "bg-indigo-50",  border: "border-indigo-200"  },
  { key: "privacyClauses",    label: "개인정보",         desc: "개인정보·CCTV 수집·이용",                     icon: Lock,       color: "text-slate-700",   bg: "bg-slate-50",   border: "border-slate-200"   },
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
  const { wageRates, update: updateSettings } = useSettings();

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

  // ── 서버 초기 로드 (mount 1회) · 실패 시 기존 localStorage 값 유지
  //   자동 마이그레이션: 서버가 빈 값(모든 그룹이 DEFAULT 와 동일) 이고
  //                     localStorage 에 편집된 값이 있으면 서버로 upload
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/contract-clauses", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
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
              await fetch("/api/contract-clauses", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                  clauses: legacyParsed,
                  updated_by: authSession?.employeeId ?? null,
                }),
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

  // ── UI · 카드 접기/펴기 (기본 전체 펼침)
  const [open, setOpen] = useState<Record<ClauseGroupKey, boolean>>({
    wageClauses: true, workTimeClauses: true, holidayClauses: true,
    disciplineClauses: true, etcClauses: true, privacyClauses: true,
  });

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
                직군별 시급은 편집 즉시 저장 · 각 호 내용은 [저장] 버튼으로 확정합니다.
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
              title="각 호 편집 취소 · 마지막 저장값으로 복원"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-black shadow-sm transition-colors cursor-pointer"
              title="각 호 저장 (시급은 편집 즉시 자동 저장됨)"
            >
              <FloppyDisk size={14} weight="bold" />
              {saving ? "저장 중..." : "각 호 저장"}
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

        {/* ── 섹션 1 · 직군별 시급 ─────────────────────────────────────── */}
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 sm:p-4 flex flex-col gap-3">
          <header className="flex items-center gap-2 pb-1 border-b border-slate-100">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
              <CurrencyKrw size={16} weight="fill" />
            </div>
            <div className="flex-1">
              <h2 className="text-[15px] font-black text-indigo-700">직군별 시급</h2>
              <p className="text-[11px] text-slate-500 font-semibold">주중·주말 시급을 직군별로 설정합니다. 이 값은 근로계약서 작성 시 자동 채워집니다.</p>
            </div>
          </header>

          {/* 안내 · 즉시 저장 · 서버 공유 */}
          <div className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5 font-semibold flex items-start gap-1.5">
            <Info size={12} weight="fill" className="mt-[2px] shrink-0" />
            <span>
              시급 값은 <b>편집 즉시 서버에 저장</b>되며 모든 관리자에게 공유됩니다.
              값을 비우면 기본값 (약사 35,000/40,000 · 그 외 10,030/12,000) 이 자동 사용됩니다.
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[12px] text-slate-500 font-black bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-3 py-2 min-w-[100px]">직군</th>
                  <th className="text-right px-3 py-2">주중 시급 (원)</th>
                  <th className="text-right px-3 py-2">주말 시급 (원)</th>
                  <th className="text-center px-2 py-2 w-[60px]">기본값</th>
                </tr>
              </thead>
              <tbody>
                {JOB_META.map(job => {
                  const stored = wageRates?.[job.key];
                  const fallback = defaultWageForPosition(job.key);
                  const rate = stored ?? fallback;
                  const isDefault = !stored;
                  return (
                    <tr key={job.key} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md ${job.bg} ${job.color} text-[13px] font-black`}>
                          {job.label}
                          {isDefault && (
                            <span
                              className="text-[9px] font-bold text-slate-500 bg-white/70 border border-slate-200 rounded px-1 py-[1px]"
                              title="저장된 값이 없어 기본값 사용 중 · 편집 시 저장됩니다"
                            >
                              기본
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={10}
                          value={rate.weekday || ""}
                          placeholder={String(fallback.weekday)}
                          onChange={(e) => updWage(job.key, "weekday", Math.max(0, Number(e.target.value) || 0))}
                          className={`w-full max-w-[180px] ml-auto block bg-white border rounded-lg px-2.5 py-1.5 text-[14px] font-bold text-right focus:outline-none focus:border-indigo-500 focus:shadow-sm transition ${isDefault ? "border-slate-200 text-slate-500" : "border-slate-300 text-slate-800"}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={10}
                          value={rate.weekend || ""}
                          placeholder={String(fallback.weekend)}
                          onChange={(e) => updWage(job.key, "weekend", Math.max(0, Number(e.target.value) || 0))}
                          className={`w-full max-w-[180px] ml-auto block bg-white border rounded-lg px-2.5 py-1.5 text-[14px] font-bold text-right focus:outline-none focus:border-indigo-500 focus:shadow-sm transition ${isDefault ? "border-slate-200 text-slate-500" : "border-slate-300 text-slate-800"}`}
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => resetWage(job.key)}
                          disabled={isDefault}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                          title="이 직군만 기본값으로 되돌리기"
                        >
                          <ArrowsClockwise size={12} weight="bold" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── 섹션 2 · 각 호 내용 CMS ──────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {CLAUSE_GROUP_META.map(grp => {
            const Icon = grp.icon;
            const list = clauses[grp.key];
            const isOpen = open[grp.key];
            return (
              <section
                key={grp.key}
                className={`bg-white border ${grp.border} rounded-xl shadow-sm overflow-hidden`}
              >
                <header
                  className="flex items-center gap-2 px-3 sm:px-4 py-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggleOpen(grp.key)}
                  role="button"
                  aria-expanded={isOpen}
                >
                  <div className={`w-8 h-8 rounded-lg ${grp.bg} ${grp.color} flex items-center justify-center shrink-0`}>
                    <Icon size={16} weight="fill" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className={`text-[14px] font-black ${grp.color}`}>{grp.label}</h2>
                    <p className="text-[11px] text-slate-500 font-semibold">{grp.desc}</p>
                  </div>
                  <span className="text-[11px] font-black text-slate-400">{list.length}개</span>
                  {isOpen
                    ? <CaretDown size={14} weight="bold" className="text-slate-400" />
                    : <CaretRight size={14} weight="bold" className="text-slate-400" />}
                </header>

                {isOpen && (
                  <div className="p-3 sm:p-4 flex flex-col gap-2">
                    {list.length === 0 && (
                      <div className="text-[12px] text-slate-400 font-semibold text-center py-4 border border-dashed border-slate-200 rounded-lg">
                        등록된 항목이 없습니다.
                      </div>
                    )}

                    {list.map((text, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50/40 hover:border-slate-200 transition-colors"
                      >
                        <div className={`flex items-center justify-center min-w-[26px] h-[26px] rounded-md ${grp.bg} ${grp.color} text-[11px] font-black shrink-0 mt-1`}>
                          {idx + 1}
                        </div>
                        <textarea
                          value={text}
                          onChange={(e) => updClause(grp.key, idx, e.target.value)}
                          rows={Math.max(2, Math.min(6, Math.ceil(text.length / 60) || 2))}
                          placeholder="내용을 입력하세요."
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px] text-slate-800 font-semibold focus:outline-none focus:border-indigo-500 focus:shadow-sm transition resize-y leading-relaxed"
                        />
                        <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                          <button
                            type="button"
                            onClick={() => moveClause(grp.key, idx, -1)}
                            disabled={idx === 0}
                            className="w-7 h-7 rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                            title="위로 이동"
                          >
                            <ArrowUp size={12} weight="bold" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveClause(grp.key, idx, 1)}
                            disabled={idx === list.length - 1}
                            className="w-7 h-7 rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                            title="아래로 이동"
                          >
                            <ArrowDown size={12} weight="bold" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeClause(grp.key, idx)}
                            className="w-7 h-7 rounded-md border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 flex items-center justify-center cursor-pointer transition-colors"
                            title="삭제"
                          >
                            <Trash size={12} weight="bold" />
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => addClause(grp.key)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:border-indigo-400 hover:text-indigo-600 text-[12px] font-bold transition-colors cursor-pointer"
                      >
                        <Plus size={12} weight="bold" />
                        항목 추가
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetGroup(grp.key)}
                        className="text-[11px] font-bold text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                        title="이 그룹만 기본값으로 되돌리기"
                      >
                        이 그룹 기본값
                      </button>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <div className="text-[11px] text-slate-400 font-semibold text-center py-2 leading-relaxed">
          시급 · 서버 저장 (모든 관리자 공유) · <code className="bg-slate-100 px-1 rounded">settings.wageRates</code>
          <br />
          각 호 · 서버 저장 (모든 관리자 공유) · <code className="bg-slate-100 px-1 rounded">contract_clauses</code>
          {!serverLoaded && <span className="ml-1 text-slate-300">· 서버 로드 중...</span>}
        </div>
      </main>
    </div>
  );
};

export default ContractSettingsPage;
