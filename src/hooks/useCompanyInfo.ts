// src/hooks/useCompanyInfo.ts
// 2026-08-07 · T-CompanyInfo-Universal
//
// 사업장 정보(CompanyInfo) 공통 훅 · settings "company_info" key wrapping.
// - 목적: ContractSettingsPage 에서 한 번 편집 → 계약서·사직서·PDF 등 모든 서식에서 공유
// - 이미 존재: types.ts (CompanyInfo · DEFAULT_COMPANY_INFO), useKvSetting("company_info")
// - 이 훅은 useKvSetting 을 얇게 감싸며 · patch 형태의 편의 setter (setInfo(patch)) 제공.
//
// 회귀 방지:
//   · 서버 로드 실패 시 · DEFAULT_COMPANY_INFO fallback (useKvSetting 이 이미 처리)
//   · loaded=false 동안 · 값은 DEFAULT_COMPANY_INFO 로 UI 는 즉시 렌더 가능
//   · sanitize 로 필수 필드 누락 시 default 로 보정

import { useCallback } from "react";
import { useKvSetting } from "./useKvSetting";
import { type CompanyInfo, DEFAULT_COMPANY_INFO } from "../types";

export interface UseCompanyInfoResult {
  /** 현재 회사 정보 · 서버 로드 전에는 DEFAULT_COMPANY_INFO */
  info: CompanyInfo;
  /** 서버 로드 완료 여부 (초기 마운트 fetch 완료 시 true) */
  loaded: boolean;
  /** 마지막 서버 저장 상태 (편집 페이지에서 UX 힌트용) */
  saveState: "idle" | "saving" | "saved" | "error";
  /**
   * 부분 업데이트 · patch 만 병합 (전체 객체 교체 안 함)
   * 예: setInfo({ name: "새 이름" }) → 나머지 필드는 유지
   */
  setInfo: (patch: Partial<CompanyInfo>) => void;
  /** 전체 교체 (덜 쓰이지만 필요할 수 있음) */
  setAll: (next: CompanyInfo) => void;
  /** 강제 서버 재조회 */
  reload: () => Promise<void>;
}

function sanitizeCompanyInfo(raw: unknown): CompanyInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const safeStr = (v: unknown, fallback: string): string =>
    typeof v === "string" ? v : fallback;
  return {
    name: safeStr(r.name, DEFAULT_COMPANY_INFO.name),
    address: safeStr(r.address, DEFAULT_COMPANY_INFO.address),
    regNo: safeStr(r.regNo, DEFAULT_COMPANY_INFO.regNo),
    representativeName: safeStr(r.representativeName, DEFAULT_COMPANY_INFO.representativeName),
    representativeTitle: typeof r.representativeTitle === "string" ? r.representativeTitle : undefined,
    phone: typeof r.phone === "string" ? r.phone : undefined,
  };
}

export function useCompanyInfo(): UseCompanyInfoResult {
  const { value, setValue, loaded, saveState, reload } = useKvSetting<CompanyInfo>({
    key: "company_info",
    defaultValue: DEFAULT_COMPANY_INFO,
    sanitize: sanitizeCompanyInfo,
  });

  const setInfo = useCallback((patch: Partial<CompanyInfo>) => {
    setValue(prev => ({ ...prev, ...patch }));
  }, [setValue]);

  const setAll = useCallback((next: CompanyInfo) => {
    setValue(next);
  }, [setValue]);

  return { info: value, loaded, saveState, setInfo, setAll, reload };
}

export default useCompanyInfo;
