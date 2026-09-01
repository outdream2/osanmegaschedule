// src/lib/contract/index.ts
// 근로계약서 · 순수 로직 · 타입·상수·load/save/fetch
// 2026-08-16 · #82 · ContractSettingsPage 컴포넌트에서 pure logic 분리
// · ContractWriterPage 는 이 모듈에서 import (페이지 컴포넌트 상호 의존 제거)
// · ContractSettingsPage 는 여기서 re-export (backward compat)
// 2026-08-21 · Framework Phase 3 · fetch → apiClient · error shape 유지

import { api } from "../apiClient";

// ─────────────────────────────────────────────────────────────────────────────
// ContractWriterSettings · 직군별 업무내역
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
 * 서버 조회 · GET /api/settings?key=contract_writer_settings
 * · 실패 → localStorage fallback (하위호환)
 */
export async function fetchContractWriterSettings(): Promise<ContractWriterSettings> {
  try {
    const { data: body } = await api.get<{ value?: unknown }>(
      `/api/settings?key=${encodeURIComponent(CONTRACT_WRITER_SETTINGS_DB_KEY)}`,
    );
    if (body?.value == null) {
      // 서버 값 없음 · localStorage 에 값 있으면 1회 마이그레이션 업로드
      const legacyRaw = (() => { try { return localStorage.getItem(CONTRACT_SETTINGS_KEY); } catch { return null; } })();
      if (legacyRaw) {
        try {
          const legacy = normalizeContractSettings(JSON.parse(legacyRaw));
          api.post(`/api/settings`, {
            key: CONTRACT_WRITER_SETTINGS_DB_KEY, value: legacy,
          }).catch(() => { /* silent */ });
          return legacy;
        } catch { /* legacy parse 실패 · fallthrough */ }
      }
      return { ...DEFAULT_CONTRACT_SETTINGS };
    }
    return normalizeContractSettings(body.value);
  } catch {
    return loadContractSettings();
  }
}

/**
 * 서버 저장 · POST /api/settings · key=contract_writer_settings
 * · DB 단일 소스 · localStorage 저장 없음
 */
export async function saveContractWriterSettingsToServer(
  settings: ContractWriterSettings,
): Promise<{ ok: boolean; savedToServer: boolean; error?: string }> {
  try {
    await api.post(`/api/settings`, { key: CONTRACT_WRITER_SETTINGS_DB_KEY, value: settings });
    return { ok: true, savedToServer: true };
  } catch (err: any) {
    const apiErr = err as { data?: { error?: string }; status?: number; message?: string };
    const msg = apiErr?.data?.error ?? (apiErr?.status ? `HTTP ${apiErr.status}` : (apiErr?.message ?? "네트워크 오류"));
    return { ok: false, savedToServer: false, error: msg };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 직군별 시급 · 하위호환 (편집은 settings.wageRates 로 이관됨 · 이 API 는 read fallback)
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
// 각 호 내용 (CMS)
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
export function normalizeClauses(parsed: any): ContractClauses {
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
    const { data } = await api.get<unknown>("/api/contract-clauses");
    return normalizeClauses(data);
  } catch {
    return loadContractClauses();
  }
}

/**
 * 서버 저장 · PUT /api/contract-clauses (일괄)
 * · DB 단일 소스 · localStorage 저장 없음
 * @returns { ok: boolean · savedToServer: boolean }
 */
export async function saveContractClausesToServer(
  clauses: ContractClauses,
  updatedBy?: number | null,
): Promise<{ ok: boolean; savedToServer: boolean; error?: string }> {
  try {
    await api.put("/api/contract-clauses", { clauses, updated_by: updatedBy ?? null });
    return { ok: true, savedToServer: true };
  } catch (err: any) {
    const apiErr = err as { data?: { error?: string }; status?: number; message?: string };
    const msg = apiErr?.data?.error ?? (apiErr?.status ? `HTTP ${apiErr.status}` : (apiErr?.message ?? "네트워크 오류"));
    return { ok: false, savedToServer: false, error: msg };
  }
}

export function cloneClauses(src: ContractClauses): ContractClauses {
  return {
    wageClauses: src.wageClauses.slice(),
    workTimeClauses: src.workTimeClauses.slice(),
    holidayClauses: src.holidayClauses.slice(),
    disciplineClauses: src.disciplineClauses.slice(),
    etcClauses: src.etcClauses.slice(),
    privacyClauses: src.privacyClauses.slice(),
  };
}

export function clausesEqual(a: ContractClauses, b: ContractClauses): boolean {
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
