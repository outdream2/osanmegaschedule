// src/components/ContractWriterPage/useContractLoad.ts
// 직원 목록 로드 · prefill · 회사정보 sync · 계약이력 · 직군 설정

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useSettings, defaultWageForPosition } from '../../hooks/useSettings';
import { useKvSetting } from '../../hooks/useKvSetting';
import {
  loadContractSettings,
  DEFAULT_CONTRACT_SETTINGS,
  type ContractCategory,
  fetchContractWriterSettings,
} from '../../lib/contract';
import { api, ApiError } from '../../lib/apiClient';
import { JOB_CATEGORIES } from '../../constants/jobCategories';
import { todayIso } from './wageCalc';
import type { Employee } from '../../types';
import { type CompanyInfo, DEFAULT_COMPANY_INFO, DEFAULT_PAYMENT_DAY_TEXT } from '../../types';
import type { ContractForm, ExistingContract } from './types';

interface UseContractLoadProps {
  form: ContractForm;
  setForm: Dispatch<SetStateAction<ContractForm>>;
}

export function useContractLoad({ form, setForm }: UseContractLoadProps) {
  const settings = useSettings();

  const { value: companyInfo, loaded: companyInfoLoaded } = useKvSetting<CompanyInfo>({
    key: "company_info",
    defaultValue: DEFAULT_COMPANY_INFO,
  });

  const { value: paymentDayText } = useKvSetting<string>({
    key: "payment_day_text",
    defaultValue: DEFAULT_PAYMENT_DAY_TEXT,
    sanitize: (raw) => (typeof raw === "string" && raw.trim() ? raw : null),
  });

  // 직원 목록
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [empError, setEmpError] = useState<string | null>(null);
  const [empSearchOpen, setEmpSearchOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEmpLoading(true);
      setEmpError(null);
      try {
        // 2026-08-31 · endpoint 통일 · /api/employees · birth_date 포함 · #52
        const { data } = await api.get<any>(`/api/employees`);
        if (cancelled) return;
        const list = Array.isArray(data) ? data : (Array.isArray(data?.employees) ? data.employees : []);
        setEmployees(list);
      } catch (err: any) {
        if (!cancelled) setEmpError(err instanceof ApiError ? err.message : (err?.message ?? "직원 목록 불러오기 실패"));
      } finally {
        if (!cancelled) setEmpLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // prefill (직원목록 [작성] 버튼)
  const [prefillConsumed, setPrefillConsumed] = useState(false);
  const wageAutoLoadedRef = useRef(true);
  const lastAutoWageRef = useRef<{ wd: string; we: string } | null>(null);

  useEffect(() => {
    if (prefillConsumed) return;
    try {
      const raw = localStorage.getItem("contract-writer-prefill");
      if (!raw) { setPrefillConsumed(true); return; }
      const p = JSON.parse(raw);
      if (!p || typeof p !== "object") { setPrefillConsumed(true); return; }

      const mapCategory = (pos: string): { cat: ContractForm["employeeCategory"]; custom: string } => {
        const t = String(pos ?? "").trim();
        if (t === "약사") return { cat: "약사", custom: "" };
        if (t === "매장") return { cat: "매장", custom: "" };
        if (t === "창고") return { cat: "창고", custom: "" };
        if (["물류", "캐셔", "진열"].includes(t)) return { cat: "매장", custom: "" };
        if (!t) return { cat: "기타", custom: "" };
        return { cat: "기타", custom: t };
      };
      const mapContractType = (et: string, fallback: string): string => {
        const t = String(et ?? "").trim();
        if (!t) return fallback;
        if (t.includes("정")) return "정규직";
        if (t.includes("계약")) return "계약직";
        if (t.includes("알바") || t.includes("파트")) return "알바";
        return fallback;
      };

      setForm(prev => {
        const { cat, custom } = mapCategory(typeof p.position === "string" ? p.position : "");
        const nextAnnual =
          p.annualLeaveDays != null && p.annualLeaveDays !== ""
            ? String(p.annualLeaveDays)
            : prev.annualLeaveDays;
        const isDefaultWage = (
          (prev.weekdayHourly === "35000" && prev.weekendHourly === "40000") ||
          (prev.weekdayHourly === "10030" && prev.weekendHourly === "12000") ||
          (prev.weekdayHourly === "12000" && prev.weekendHourly === "13500") ||
          (!prev.weekdayHourly && !prev.weekendHourly)
        );
        let wd = prev.weekdayHourly;
        let we = prev.weekendHourly;
        if (isDefaultWage) {
          const rawPos = typeof p.position === "string" ? p.position : "";
          const empId = typeof p.employeeId === "number" ? p.employeeId : null;
          const override = empId != null ? settings.employeeWageOverrides?.[empId] : undefined;
          const positionRate = rawPos ? settings.wageRates?.[rawPos] : undefined;
          const rate = override ?? positionRate ?? (rawPos ? defaultWageForPosition(rawPos) : null);
          if (rate) {
            wd = String(rate.weekday);
            we = String(rate.weekend);
            wageAutoLoadedRef.current = true;
            lastAutoWageRef.current = { wd, we };
          }
        }
        return {
          ...prev,
          employeeId: typeof p.employeeId === "number" ? p.employeeId : prev.employeeId,
          employeeName: typeof p.employeeName === "string" && p.employeeName ? p.employeeName : prev.employeeName,
          employeePhone: typeof p.employeePhone === "string" && p.employeePhone ? p.employeePhone : prev.employeePhone,
          employeeAddress: typeof p.employeeAddress === "string" && p.employeeAddress ? p.employeeAddress : prev.employeeAddress,
          annualLeaveDays: nextAnnual,
          employeeCategory: cat,
          employeeCategoryCustom: custom || prev.employeeCategoryCustom,
          contractType: mapContractType(typeof p.employmentType === "string" ? p.employmentType : "", prev.contractType),
          startDate: typeof p.hireDate === "string" && p.hireDate ? p.hireDate : prev.startDate,
          weekdayHourly: wd,
          weekendHourly: we,
          employeeEmail: typeof p.employeeEmail === "string" && p.employeeEmail ? p.employeeEmail : prev.employeeEmail,
          employeeGender: typeof p.gender === "string" && p.gender ? p.gender : prev.employeeGender,
          employeeRank: typeof p.rank === "string" && p.rank ? p.rank : prev.employeeRank,
          employeeWorkplace: typeof p.workplace === "string" && p.workplace ? p.workplace : prev.employeeWorkplace,
        };
      });
      localStorage.removeItem("contract-writer-prefill");
    } catch { /* silent */ } finally {
      setPrefillConsumed(true);
    }
  }, [prefillConsumed, settings.wageRates, settings.employeeWageOverrides, setForm]);

  // 회사정보 서버 로드 완료 시 form 반영 (사용자 편집값 보호)
  const companyInfoAppliedRef = useRef(false);
  useEffect(() => {
    if (!companyInfoLoaded) return;
    if (companyInfoAppliedRef.current) return;
    companyInfoAppliedRef.current = true;
    setForm(prev => {
      const isDefaultName    = prev.companyName    === DEFAULT_COMPANY_INFO.name    || prev.companyName    === "";
      const isDefaultAddr    = prev.companyAddress === DEFAULT_COMPANY_INFO.address || prev.companyAddress === "";
      const isDefaultRegNo   = prev.companyRegNo   === DEFAULT_COMPANY_INFO.regNo;
      const isDefaultEmpName = prev.employerName   === DEFAULT_COMPANY_INFO.representativeName || prev.employerName === "";
      if (!isDefaultName && !isDefaultAddr && !isDefaultEmpName) return prev;
      return {
        ...prev,
        companyName:    isDefaultName    ? companyInfo.name                : prev.companyName,
        companyAddress: isDefaultAddr    ? companyInfo.address             : prev.companyAddress,
        companyRegNo:   isDefaultRegNo   ? companyInfo.regNo               : prev.companyRegNo,
        employerName:   isDefaultEmpName ? companyInfo.representativeName  : prev.employerName,
      };
    });
  }, [companyInfoLoaded, companyInfo, setForm]);

  // 계약 이력 조회
  const [existingContract, setExistingContract] = useState<ExistingContract | null>(null);
  const [existingLoading, setExistingLoading] = useState(false);
  const [hireDateReference, setHireDateReference] = useState<string | null>(null);

  useEffect(() => {
    const empId = form.employeeId;
    if (empId == null) {
      setExistingContract(null);
      setHireDateReference(null);
      setExistingLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setExistingLoading(true);
      try {
        const { data: rows } = await api.get<any>(`/api/employee-contracts?employeeId=${empId}`);
        if (!cancelled) {
          const first = Array.isArray(rows) && rows.length > 0 ? (rows[0] as ExistingContract) : null;
          setExistingContract(first);
        }
        const emp = employees.find(e => e.id === empId);
        const hd = (emp as any)?.hire_date ?? null;
        if (!cancelled) setHireDateReference(typeof hd === "string" && hd ? hd : null);
      } catch {
        if (!cancelled) {
          setExistingContract(null);
          setHireDateReference(null);
        }
      } finally {
        if (!cancelled) setExistingLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [form.employeeId, employees]);

  // 직군 설정 로드
  const [writerSettingsVersion, setWriterSettingsVersion] = useState(0);
  const [jobCategories, setJobCategories] = useState<ContractCategory[]>([...JOB_CATEGORIES]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fresh = await fetchContractWriterSettings();
        if (!cancelled) {
          setWriterSettingsVersion(v => v + 1);
          const universe: string[] = [
            ...JOB_CATEGORIES,
            ...Object.keys(settings.wageRates ?? {}).filter(k => !(JOB_CATEGORIES as readonly string[]).includes(k)),
          ];
          const cats = universe.filter(
            k => k in fresh && typeof (fresh as unknown as Record<string, unknown>)[k] === "string",
          ) as ContractCategory[];
          if (cats.length > 0) setJobCategories(cats);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 카테고리 → 업무 기본값
  useEffect(() => {
    const contractSettings = loadContractSettings();
    const defaults: Record<ContractCategory, string> = {
      "약사": contractSettings.약사 || DEFAULT_CONTRACT_SETTINGS.약사,
      "매장": contractSettings.매장 || DEFAULT_CONTRACT_SETTINGS.매장,
      "창고": contractSettings.창고 || DEFAULT_CONTRACT_SETTINGS.창고,
      "기타": contractSettings.기타 || DEFAULT_CONTRACT_SETTINGS.기타,
    };
    const key = form.employeeCategory;
    const nextDuty = defaults[key] ?? DEFAULT_CONTRACT_SETTINGS.기타;
    const knownDefaults = new Set<string>([
      ...Object.values(defaults),
      ...Object.values(DEFAULT_CONTRACT_SETTINGS).filter((v): v is string => typeof v === "string" && v.length > 0),
    ]);
    const isDefault = !form.jobDuty || knownDefaults.has(form.jobDuty);
    if (isDefault && nextDuty && nextDuty !== form.jobDuty) {
      setForm(prev => ({ ...prev, jobDuty: nextDuty }));
    }
  }, [form.employeeCategory, writerSettingsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // 계약체결일 = 시작일 (초기)
  useEffect(() => {
    setForm(prev => (prev.contractSignDate ? prev : { ...prev, contractSignDate: prev.startDate || todayIso() }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    settings,
    paymentDayText,
    employees, empLoading, empError, empSearchOpen, setEmpSearchOpen,
    existingContract, setExistingContract, existingLoading,
    hireDateReference,
    jobCategories,
    wageAutoLoadedRef,
    lastAutoWageRef,
  };
}
