// src/hooks/useContractSignatures.ts
// 근로계약서 서명 상태 관리 훅 · ContractWriterPage 에서 이동 (god-phase1)
// T-D (2026-08-05): 활성 서명 지점 7개 · 레거시 5개 하위호환 유지
import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

// 서명 지점 keys (근로계약기간·퇴직금 제거 · 임금단서 3·4 추가)
// T-D (2026-08-05): T6 카테고리 이해·동의 3개에 서명 pad 추가 (wageAck·workTimeAck·etcAck)
export type SignKey =
  | "employer"        // 사업주 (갑) · 하단
  | "employee"        // 근로자 (을) · 하단
  | "privacy"         // 개인정보/CCTV
  | "specialWork"     // 소정근로시간 특별 사용 동의 (레거시 · 미사용 · 데이터 하위호환)
  | "breakChange"     // 휴게시간 변경 동의 (레거시 · 미사용 · 데이터 하위호환)
  | "wageClause3"     // 임금단서 3번 (레거시 · 미사용 · 데이터 하위호환)
  | "wageClause4"     // 임금단서 4번 (레거시 · 미사용 · 데이터 하위호환)
  | "etc5"            // 기타사항 5번 (레거시 · 미사용 · 데이터 하위호환)
  | "receipt"         // 수령자 확인 (계약서 교부)
  | "wageAck"         // T-D 임금 조항 카테고리 이해·동의 (T6 pad)
  | "workTimeAck"     // T-D 근로시간·휴게 카테고리 이해·동의 (T6 pad)
  | "etcAck"          // T-D 기타사항 카테고리 이해·동의 (T6 pad)
  ;

// 활성 서명 지점 · 6곳 (2026-08-07 · 사용자 확정)
//   · receipt (수령자 확인) 은 UI 렌더링은 유지되나 필수 검증에서 제외
export const SIGN_KEYS: SignKey[] = [
  "employer", "employee", "privacy",
  "wageAck", "workTimeAck", "etcAck",
];

export const SIGN_LABEL: Record<SignKey, string> = {
  employer:     "사업주 (갑) 하단",
  employee:     "근로자 (을) 하단",
  privacy:      "개인정보 · CCTV 동의",
  specialWork:  "소정근로시간 특별 사용 동의",
  breakChange:  "휴게시간 변경 동의",
  wageClause3:  "임금단서 3 (연차 포괄)",
  wageClause4:  "임금단서 4 (공휴일 포괄)",
  etc5:         "기타사항 5 (퇴직 시 연차 공제)",
  receipt:      "수령자 확인 (계약서 교부)",
  wageAck:      "임금 조항 이해·동의",
  workTimeAck:  "근로시간·휴게 조항 이해·동의",
  etcAck:       "기타사항 이해·동의",
};

export interface UseContractSignaturesResult {
  signUrls: Record<SignKey, string | null>;
  setSignUrls: Dispatch<SetStateAction<Record<SignKey, string | null>>>;
  signModal: { open: boolean; key: SignKey | null };
  openSign: (key: SignKey) => void;
  closeSign: () => void;
  submitSign: (dataUrl: string) => void;
  clearSign: (key: SignKey) => void;
}

export function useContractSignatures(): UseContractSignaturesResult {
  // ── 서명 URL · 7 활성 지점 (레거시 5 유지 · null 로) ──
  const [signUrls, setSignUrls] = useState<Record<SignKey, string | null>>(() => ({
    employer: null, employee: null, privacy: null,
    specialWork: null, breakChange: null,
    wageClause3: null, wageClause4: null,
    etc5: null, receipt: null,
    wageAck: null, workTimeAck: null, etcAck: null,
  }));

  const [signModal, setSignModal] = useState<{ open: boolean; key: SignKey | null }>({ open: false, key: null });

  const openSign = useCallback((key: SignKey) => setSignModal({ open: true, key }), []);
  const closeSign = useCallback(() => setSignModal({ open: false, key: null }), []);
  const submitSign = useCallback((dataUrl: string) => {
    setSignUrls(prev => (signModal.key ? { ...prev, [signModal.key]: dataUrl } : prev));
    setSignModal({ open: false, key: null });
  }, [signModal.key]);
  const clearSign = useCallback((key: SignKey) => {
    setSignUrls(prev => ({ ...prev, [key]: null }));
  }, []);

  return { signUrls, setSignUrls, signModal, openSign, closeSign, submitSign, clearSign };
}
