// src/components/ContractWriterPage/useContractActions.ts
// onSelectEmployee · clearAllSignatures · handleExtendConfirm · handleReset

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import { useConfirm } from '../../hooks/useConfirm';
import { defaultWageForPosition, type WageRate, type AppSettings } from '../../hooks/useSettings';
type SettingsObject = Pick<AppSettings, 'wageRates' | 'employeeWageOverrides'>;
import { SIGN_KEYS, REQUIRED_SIGN_COUNT } from '../../hooks/useContractSignatures';
import type { SignKey } from '../../hooks/useContractSignatures';
import { todayIso } from './wageCalc';
import { emptyForm } from './emptyForm';
import { loadCardCollapsedMap, saveCardCollapsedMap } from './draftHelpers';
import type { ContractForm, CardKey, CardCollapsedMap, ExistingContract } from './types';
import type { Employee } from '../../types';

interface UseContractActionsProps {
  form: ContractForm;
  setForm: Dispatch<SetStateAction<ContractForm>>;
  employees: Employee[];
  settings: SettingsObject;
  signUrls: Record<SignKey, string | null>;
  setSignUrls: Dispatch<SetStateAction<Record<SignKey, string | null>>>;
  existingContract: ExistingContract | null;
  hireDateReference: string | null;
  clearDraft: () => void;
  setNotice: Dispatch<SetStateAction<{ tone: "ok" | "err"; text: string } | null>>;
  wageAutoLoadedRef: MutableRefObject<boolean>;
  lastAutoWageRef: MutableRefObject<{ wd: string; we: string } | null>;
}

export function useContractActions({
  form,
  setForm,
  employees,
  settings,
  signUrls,
  setSignUrls,
  existingContract,
  hireDateReference,
  clearDraft,
  setNotice,
  wageAutoLoadedRef,
  lastAutoWageRef,
}: UseContractActionsProps) {
  const confirm = useConfirm();

  // 카드 접기/펼치기 상태 (T-W)
  const [cardCollapsed, setCardCollapsed] = useState<CardCollapsedMap>(() => loadCardCollapsedMap());
  const toggleCard = useCallback((key: CardKey) => {
    setCardCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveCardCollapsedMap(next);
      return next;
    });
  }, []);
  const isCardCollapsed = useCallback((key: CardKey) => Boolean(cardCollapsed[key]), [cardCollapsed]);

  // 주소 검색 모달
  const [addrModalOpen, setAddrModalOpen] = useState<boolean>(false);

  // 연장 모달 상태
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [extendMonths, setExtendMonths] = useState<string>("3");

  // 서명 전체 초기화
  const clearAllSignatures = useCallback(() => {
    setSignUrls(prev => {
      const next = { ...prev };
      (Object.keys(next) as Array<keyof typeof next>).forEach(k => { next[k] = null; });
      return next;
    });
  }, [setSignUrls]);

  // 서명 상태
  const signatureStatus = useMemo(() => {
    const filled = SIGN_KEYS.filter(k => !!signUrls[k]).length;
    return { filled, total: SIGN_KEYS.length };
  }, [signUrls]);

  const canApprove = signatureStatus.filled >= REQUIRED_SIGN_COUNT;

  // 직원 선택 (T-CTR-10)
  const onSelectEmployee = (empIdRaw: string) => {
    if (!empIdRaw) {
      setForm(prev => ({ ...prev, employeeId: null }));
      return;
    }
    const empId = Number(empIdRaw);
    const emp = employees.find(e => e.id === empId);
    if (!emp) {
      setForm(prev => ({ ...prev, employeeId: empId }));
      return;
    }

    const positionRaw = String(emp.position || "").trim();
    const empOverride = settings.employeeWageOverrides?.[emp.id];
    const positionRate = positionRaw ? settings.wageRates?.[positionRaw] : undefined;
    const resolvedRate: WageRate | null =
      (empOverride && (empOverride.weekday > 0 || empOverride.weekend > 0)) ? empOverride
      : (positionRate && (positionRate.weekday > 0 || positionRate.weekend > 0)) ? positionRate
      : (positionRaw ? defaultWageForPosition(positionRaw) : null);

    if (resolvedRate) {
      wageAutoLoadedRef.current = true;
      lastAutoWageRef.current = {
        wd: String(resolvedRate.weekday),
        we: String(resolvedRate.weekend),
      };
    }

    setForm(prev => ({
      ...prev,
      employeeId: emp.id,
      employeeName: emp.name || prev.employeeName,
      employeePhone: emp.phone || prev.employeePhone,
      employeeAddress: emp.address || prev.employeeAddress,
      employeeNumber: (emp as any).employee_number != null ? String((emp as any).employee_number) : prev.employeeNumber,
      annualLeaveDays: emp.annual_leave_days != null ? String(emp.annual_leave_days) : prev.annualLeaveDays,
      weekdayHourly: resolvedRate ? String(resolvedRate.weekday) : prev.weekdayHourly,
      weekendHourly: resolvedRate ? String(resolvedRate.weekend) : prev.weekendHourly,
      employeeCategory: (() => {
        const pos = positionRaw;
        if (pos === "약사") return "약사" as const;
        if (pos === "매장") return "매장" as const;
        if (pos === "창고") return "창고" as const;
        if (["물류", "캐셔", "진열"].includes(pos)) return "매장" as const;
        return "기타" as const;
      })(),
      employeeCategoryCustom: (() => {
        const pos = positionRaw;
        return pos && pos !== "약사" ? pos : prev.employeeCategoryCustom;
      })(),
      contractType: (() => {
        const et = (emp.employmentType || "").trim();
        if (et.includes("정")) return "정규직";
        if (et.includes("계약")) return "계약직";
        if (et.includes("알바") || et.includes("파트")) return "알바";
        return prev.contractType;
      })(),
      primaryFocus: (emp.primary_focus === "매장" || emp.primary_focus === "창고")
        ? emp.primary_focus
        : prev.primaryFocus,
      primaryFocusPercent: (typeof emp.primary_focus_percent === "number" && emp.primary_focus_percent > 0)
        ? emp.primary_focus_percent
        : prev.primaryFocusPercent,
      employeeEmail: (emp as any).email || prev.employeeEmail,
      employeeBirth: (emp as any).resident_number || prev.employeeBirth,
      employeeGender: emp.gender || prev.employeeGender,
      employeeRank: emp.rank || prev.employeeRank,
      employeeWorkplace: emp.workplace || prev.employeeWorkplace,
      startDate: (emp.hireDate && (!prev.startDate || prev.startDate === todayIso()))
        ? emp.hireDate
        : prev.startDate,
    }));
  };

  // 연장 확정 (#220)
  const handleExtendConfirm = () => {
    const months = Number(extendMonths);
    if (!Number.isFinite(months) || months <= 0) {
      setNotice({ tone: "err", text: "연장 개월수를 올바르게 입력하세요." });
      return;
    }
    const baseEnd = existingContract?.end_date;
    if (!baseEnd) {
      setNotice({ tone: "err", text: "기존 계약서에 종료일이 없어 연장할 수 없습니다." });
      return;
    }
    const baseEndDate = new Date(baseEnd);
    if (Number.isNaN(baseEndDate.getTime())) {
      setNotice({ tone: "err", text: "기존 계약서 종료일이 유효하지 않습니다." });
      return;
    }
    const newStart = new Date(baseEndDate);
    newStart.setDate(newStart.getDate() + 1);
    const newStartIso = `${newStart.getFullYear()}-${String(newStart.getMonth() + 1).padStart(2, "0")}-${String(newStart.getDate()).padStart(2, "0")}`;
    const newEnd = new Date(newStart);
    newEnd.setMonth(newEnd.getMonth() + months);
    newEnd.setDate(newEnd.getDate() - 1);
    const newEndIso = `${newEnd.getFullYear()}-${String(newEnd.getMonth() + 1).padStart(2, "0")}-${String(newEnd.getDate()).padStart(2, "0")}`;

    setForm(prev => ({
      ...prev,
      contractType: "계약직",
      contractMonths: String(months),
      indefinite: false,
      startDate: newStartIso,
      endDate: newEndIso,
      contractSignDate: newStartIso,
    }));

    clearAllSignatures();
    setExtendModalOpen(false);
    setNotice({
      tone: "ok",
      text: `${months}개월 연장 초안이 작성되었습니다. 신규 기간 ${newStartIso} ~ ${newEndIso} · 입사일 ${hireDateReference ?? "(정보 없음)"} 은 유지됩니다. 서명 후 [계약완료 승인] 을 눌러 저장하세요.`,
    });
  };

  // 폼 리셋 (T-N)
  const handleReset = async () => {
    if (!await confirm({ message: "입력한 모든 내용 · 서명 · 임시저장까지 전체 초기화합니다.\n계속하시겠습니까?", danger: true })) return;
    setForm(emptyForm());
    clearAllSignatures();
    clearDraft();
    setNotice({ tone: "ok", text: "전체 초기화되었습니다." });
  };

  return {
    cardCollapsed, toggleCard, isCardCollapsed,
    addrModalOpen, setAddrModalOpen,
    extendModalOpen, setExtendModalOpen,
    extendMonths, setExtendMonths,
    clearAllSignatures,
    signatureStatus, canApprove,
    onSelectEmployee,
    handleExtendConfirm,
    handleReset,
  };
}
