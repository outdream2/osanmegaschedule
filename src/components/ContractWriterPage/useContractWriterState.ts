// src/components/ContractWriterPage/useContractWriterState.ts
// 2026-08-23 · #framework-4 · ContractWriterPage 상태/훅/핸들러 분리

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConfirm } from '../../hooks/useConfirm';
import { useToast } from '../../hooks/useToast';
import type { AuthSession, Employee } from '../../types';
import { type CompanyInfo, DEFAULT_COMPANY_INFO, DEFAULT_PAYMENT_DAY_TEXT } from '../../types';
import {
  loadContractSettings,
  DEFAULT_CONTRACT_SETTINGS,
  type ContractCategory,
  fetchContractWriterSettings,
} from '../../lib/contract';
import { useSettings, defaultWageForPosition, type WageRate } from '../../hooks/useSettings';
import { useKvSetting } from '../../hooks/useKvSetting';
import { useStampsMap } from '../../hooks/useStampsMap';
import sungstampUrl from '../../images/sungstamp.png';
import kyustampUrl from '../../images/kyustamp.png';
import {
  MIN_WAGE_2026,
  RECOGNIZED_HOURS,
  grossUp as payrollGrossUp,
  DEFAULT_WITHHOLDING_RATE,
  type WithholdingRate,
} from '../../lib/payroll';
import { JOB_CATEGORIES } from '../../constants/jobCategories';
import { calcWageBase } from '../../lib/wageCalc';
import { shortContractLabel } from '../../utils/contractUtils';
import {
  SIGN_KEYS, SIGN_LABEL, REQUIRED_SIGN_COUNT, useContractSignatures,
} from '../../hooks/useContractSignatures';
import { api, ApiError } from '../../lib/apiClient';
import type {
  WageComponentEntry, WageComponents, ContractForm, CardKey, CardCollapsedMap, DayKey, ExistingContract,
} from './types';
import { DAYS, WEEKDAYS, WEEKEND, DRAFT_STORAGE_KEY, DRAFT_TIMESTAMP_KEY } from './constants';
import {
  WAGE_HOURS,
  computeMonthlyHours, computeWageFromHourlyDual, computeIncomeTax,
  todayIso, contractPeriodMonthsClient,
} from './wageCalc';
import { emptyForm } from './emptyForm';
import { loadCardCollapsedMap, saveCardCollapsedMap } from './draftHelpers';
import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';

export function useContractWriterState(authSession: AuthSession | null) {
  const confirm = useConfirm();
  // 2026-08-21 · Framework Phase 3 · alert → useToast
  const { toast, showError } = useToast();

  // ── T14/Phase B · 직급별 기본 시급 로드 (useSettings) · 사용자 편집 가능 유지
  const settings = useSettings();

  // ── T-CompanyInfo-DB · 회사 정보 서버 로드 (settings "company_info" key)
  //   · 서버 값 로드 완료 시 · form 의 회사 필드가 하드코딩 default 와 같으면 덮어씀
  //   · 사용자가 직접 편집한 값은 유지
  const { value: companyInfo, loaded: companyInfoLoaded } = useKvSetting<CompanyInfo>({
    key: "company_info",
    defaultValue: DEFAULT_COMPANY_INFO,
  });

  // T-Contract-PaymentDay · 임금지급일 · settings "payment_day_text" key · 계약서 렌더링에 반영
  const { value: paymentDayText } = useKvSetting<string>({
    key: "payment_day_text",
    defaultValue: DEFAULT_PAYMENT_DAY_TEXT,
    sanitize: (raw) => (typeof raw === "string" && raw.trim() ? raw : null),
  });

  // ── draft 로드 · 마이그레이션 (신규 필드 default) ──
  const [form, setForm] = useState<ContractForm>(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const base = emptyForm();
          const wageMerged: WageComponents = {
            ...base.wageComponents,
            ...(parsed.wageComponents ?? {}),
            // fixedAnnualLeave 신규 · 없으면 default
            fixedAnnualLeave: parsed.wageComponents?.fixedAnnualLeave ?? base.wageComponents.fixedAnnualLeave,
            // fixedHolidayOvertime (구 fixedHolidayNight 를 대체) · 없으면 default
            fixedHolidayOvertime: parsed.wageComponents?.fixedHolidayOvertime
              ?? parsed.wageComponents?.fixedHolidayNight
              ?? base.wageComponents.fixedHolidayOvertime,
          };
          // workDays 없으면 기본 (구 draft 는 workDays 있음)
          const workDaysMerged = parsed.workDays ?? base.workDays;
          return {
            ...base,
            ...parsed,
            wageComponents: wageMerged,
            workDays: workDaysMerged,
            privacyConsent: { ...base.privacyConsent, ...(parsed.privacyConsent ?? {}) },
          } as ContractForm;
        }
      }
    } catch { /* silent */ }
    return emptyForm();
  });

  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(() => {
    try { return localStorage.getItem(DRAFT_TIMESTAMP_KEY); } catch { return null; }
  });

  // T-Q (2026-08-05) · 실수령액 상세 · 소득세 포함 토글 · default OFF (참고 표시만)
  const [includeIncomeTax, setIncludeIncomeTax] = useState<boolean>(false);
  // T-Q · 실수령액 상세 카드 접기/펼치기 · default 펼침
  const [netDetailOpen, setNetDetailOpen] = useState<boolean>(true);

  // 2026-08-07 · 통상시급 override (null 이면 자동 = 주중시급)
  const [wageHourlyOverride, setWageHourlyOverride] = useState<number | null>(null);
  // 2026-08-07 · 부양가족 수 (본인 포함 · default 1) · 소득세 인적공제 반영
  const [dependentsCount, setDependentsCount] = useState<number>(1);
  // 2026-08-07 · 원천징수 비율 (80/100/120% · 근로자 선택 · 근소세법 §137 · default 100%)
  const [withholdingRate, setWithholdingRate] = useState<WithholdingRate>(DEFAULT_WITHHOLDING_RATE);
  // 2026-08-07 · 자녀 세액공제 대상 자녀 수 (8~20세 · 소득세법 §59-2 · default 0)
  const [childrenCount, setChildrenCount] = useState<number>(0);
  // 2026-08-07 · 공제항목 (사용자 입력 · 소득세 M에서 차감 · 세후 증가)
  const [extraDeduction, setExtraDeduction] = useState<number>(0);
  // 2026-08-16 · 주소 검색 모달 (Daum 우편번호)
  const [addrModalOpen, setAddrModalOpen] = useState<boolean>(false);

  // 2026-08-07 · 통상시급/근무조건/선택항목 변경 시 · form.wageComponents 4자동항목 자동 반영
  //   · 왼쪽 임금구성표 (통상시급×시간) → 오른쪽 계약서 프리뷰 (form.wageComponents.*.amount) 동기화
  //   · WageComponentsTable · basicSalary·fixedOvertime·fixedHoliday·fixedAnnualLeave 참조


  // T-W (2026-08-05) · 좌측 카드 접기/펴기 상태 · localStorage 지속
  const [cardCollapsed, setCardCollapsed] = useState<CardCollapsedMap>(() => loadCardCollapsedMap());
  const toggleCard = useCallback((key: CardKey) => {
    setCardCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveCardCollapsedMap(next);
      return next;
    });
  }, []);
  const isCardCollapsed = useCallback((key: CardKey) => Boolean(cardCollapsed[key]), [cardCollapsed]);

  // T-R (2026-08-05) · 작성 방식 · [여기서 작성] vs [PDF 업로드]
  const [writeMode, setWriteMode] = useState<"form" | "upload">("form");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState<boolean>(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
      const ts = new Date().toISOString();
      localStorage.setItem(DRAFT_TIMESTAMP_KEY, ts);
      setDraftSavedAt(ts);
    } catch {
      showError("임시저장 실패 · 브라우저 저장공간 부족");
    }
  }, [form, showError]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
        const ts = new Date().toISOString();
        localStorage.setItem(DRAFT_TIMESTAMP_KEY, ts);
        setDraftSavedAt(ts);
      } catch { /* silent */ }
    }, 30_000);
    return () => window.clearTimeout(t);
  }, [form]);
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      localStorage.removeItem(DRAFT_TIMESTAMP_KEY);
      setDraftSavedAt(null);
    } catch { /* silent */ }
  }, []);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [empError, setEmpError] = useState<string | null>(null);
  const [empSearchOpen, setEmpSearchOpen] = useState(false);

  // ── 서명 상태 (useContractSignatures 훅 · god-phase1) ──
  const { signUrls, setSignUrls, signModal, openSign, closeSign, submitSign, clearSign } = useContractSignatures();

  // 도장 자동 (H)
  // 2026-08-12 · 프레임워크 · stamps_map 서버 매핑 우선 조회 · 없거나 미매칭이면 기존 하드코딩 fallback 유지
  const { findStamp } = useStampsMap();
  const resolveStampUrl = useCallback((name: string | undefined | null): string | null => {
    const n = (name ?? "").trim();
    if (!n) return null;
    const mapped = findStamp(n);
    if (mapped) {
      // 우선순위: 서버 설정 imageUrl → bundled fallback (하위호환)
      if (mapped.imageUrl && mapped.imageUrl.trim()) return mapped.imageUrl;
      if (mapped.bundledFallback === "sungstamp") return sungstampUrl;
      if (mapped.bundledFallback === "kyustamp") return kyustampUrl;
    }
    // 하드코딩 fallback (프레임워크 도입 전 동작 완전 보전)
    if (n === "강남성") return sungstampUrl;
    if (n === "강남규") return kyustampUrl;
    return null;
  }, [findStamp]);

  const employerStampUrl = useMemo(
    () => resolveStampUrl(form.employerName),
    [form.employerName, resolveStampUrl],
  );

  const employeeStampUrl = useMemo(
    () => resolveStampUrl(form.employeeName),
    [form.employeeName, resolveStampUrl],
  );

  const previewRef = useRef<HTMLDivElement | null>(null);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // #220 · 연장 기능 (ExistingContract 타입 → ./types.ts)
  const [existingContract, setExistingContract] = useState<ExistingContract | null>(null);
  const [existingLoading, setExistingLoading] = useState(false);
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [extendMonths, setExtendMonths] = useState<string>("3");
  const [hireDateReference, setHireDateReference] = useState<string | null>(null);

  // 직원 목록
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEmpLoading(true);
      setEmpError(null);
      try {
        const now = new Date();
        const y = now.getFullYear(), m = now.getMonth() + 1;
        const { data } = await api.get<any>(`/api/schedules?year=${y}&month=${m}`);
        if (cancelled) return;
        const list = Array.isArray(data?.employees) ? data.employees : [];
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

  // 2026-08-05 · 시급 자동 로드 상태 · 사용자 직접 입력 vs 자동 로드 구분
  // T-CTR-WageLoad-Deep · 초기값 true · draft 포함 mount 직후부터 자동 로드 허용
  //   (사용자가 수동으로 시급 입력하면 false 로 리셋 · 이후 직군 변경해도 덮어쓰지 않음)
  const wageAutoLoadedRef = useRef(true);
  const lastAutoWageRef = useRef<{ wd: string; we: string } | null>(null);
  const wageAutoInitRef = useRef(false);
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
        // T14/Phase B · 직급별 default 시급 자동 로드 (개인별 override 우선)
        //   · 사용자 편집 가능 유지 · 기존 값이 default 이면만 덮어씀
        //   2026-08-05 · settings 미설정 시 defaultWageForPosition fallback (약사=35000/40000 · 그외=10030/12000)
        //   T-I (2026-08-05) · default 변경: 12000/13500 → 35000/40000 (약사 기본) · 10030/12000 (사원 기본) 도 자동 로드 감지
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
          // T-CTR-EmployeeLink (2026-08-06) · 신규 필드 prefill
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
  }, [prefillConsumed, settings.wageRates, settings.employeeWageOverrides]);

  // T-CompanyInfo-DB · 서버에서 company_info 로드 완료 시 · form 회사 필드 반영
  //   · 조건: companyInfoLoaded && form 의 회사 필드가 하드코딩 default 와 같은 경우만 덮어씀
  //   · draft 에 사용자가 직접 수정한 값이 있으면 그대로 유지
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
      // 모든 필드가 default 와 같을 때만 서버 값으로 교체 (사용자 편집 보호)
      if (!isDefaultName && !isDefaultAddr && !isDefaultEmpName) return prev;
      return {
        ...prev,
        companyName:    isDefaultName    ? companyInfo.name                : prev.companyName,
        companyAddress: isDefaultAddr    ? companyInfo.address             : prev.companyAddress,
        companyRegNo:   isDefaultRegNo   ? companyInfo.regNo               : prev.companyRegNo,
        employerName:   isDefaultEmpName ? companyInfo.representativeName  : prev.employerName,
      };
    });
  }, [companyInfoLoaded, companyInfo]);

  // T14/Phase B · 직급 기본 시급 재적용 · 사용자 액션
  //   폼의 employeeCategory 기반 · settings 에서 값 로드 · 개인별 override 있으면 그 값 우선
  //   2026-08-05 · settings 에 저장된 값이 없으면 defaultWageForPosition (약사=35000/40000 · 그외=10030/12000) 을 자동 fallback
  const resolveWageForCategory = useCallback((cat: ContractForm["employeeCategory"], custom: string, empId: number | null): WageRate & { posKey: string } => {
    const catToPositionKey = (c: ContractForm["employeeCategory"]): string => {
      if (c === "약사") return "약사";
      if (c === "매장") return "매장";
      if (c === "창고") return "창고";
      return "";
    };
    const posKey = catToPositionKey(cat) || custom || "사원";
    const override = empId != null ? settings.employeeWageOverrides?.[empId] : undefined;
    const positionRate = posKey ? settings.wageRates?.[posKey] : undefined;
    const rate = override ?? positionRate ?? defaultWageForPosition(posKey);
    return { weekday: rate.weekday, weekend: rate.weekend, posKey };
  }, [settings.wageRates, settings.employeeWageOverrides]);

  const applyDefaultHourly = useCallback(() => {
    const { weekday, weekend } = resolveWageForCategory(form.employeeCategory, form.employeeCategoryCustom, form.employeeId);
    setForm(prev => ({ ...prev, weekdayHourly: String(weekday), weekendHourly: String(weekend) }));
    // 자동 로드 마킹 · 이후 카테고리 변경 시 재로드 허용
    wageAutoLoadedRef.current = true;
    lastAutoWageRef.current = { wd: String(weekday), we: String(weekend) };
  }, [form.employeeCategory, form.employeeCategoryCustom, form.employeeId, resolveWageForCategory]);

  // 2026-08-05 · form.employeeCategory 변경 시 자동 재로드
  //   조건: wageAutoLoadedRef === true (자동 로드 허용 상태)
  //   → 사용자가 직접 수동으로 시급을 입력하면 wageAutoLoadedRef = false 가 되어 덮어쓰지 않음
  //   T-CTR-WageLoad-Deep · wageAutoInitRef 첫 skip 제거 · mount 직후에도 실행
  //     (초기 settings 가 빈 상태면 defaultWageForPosition fallback · 이후 settings 로드 완료 시 재실행)
  useEffect(() => {
    // 첫 렌더 flag 세팅 (skip 하지 않고 진행)
    wageAutoInitRef.current = true;
    // 자동 로드 허용 상태가 아니면 (사용자 수동 입력 후) → 유지
    if (!wageAutoLoadedRef.current) return;
    const wd = form.weekdayHourly;
    const we = form.weekendHourly;
    const { weekday, weekend } = resolveWageForCategory(form.employeeCategory, form.employeeCategoryCustom, form.employeeId);
    const nextWd = String(weekday);
    const nextWe = String(weekend);
    if (nextWd === wd && nextWe === we) return; // 이미 동일
    setForm(prev => ({ ...prev, weekdayHourly: nextWd, weekendHourly: nextWe }));
    lastAutoWageRef.current = { wd: nextWd, we: nextWe };
  }, [form.employeeCategory, form.employeeCategoryCustom, form.employeeId, resolveWageForCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // T-CTR-WageLink · settings.wageRates 변경 시 자동 재적용
  //   ContractSettingsPage 에서 시급 변경 → settings-updated 이벤트 → useSettings 인스턴스 업데이트
  //   → settings.wageRates 변경 → resolveWageForCategory 재생성 → 아래 effect 실행
  //   조건: wageAutoLoadedRef === true (자동 로드 허용 상태)
  //   T-CTR-WageLoad-Deep · wageAutoInitRef 체크 제거 (category effect 에서 이미 flag 세팅)
  useEffect(() => {
    // 자동 로드 허용 상태가 아니면 (사용자 수동 입력 후) → 유지
    if (!wageAutoLoadedRef.current) return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const wd = form.weekdayHourly;
    const we = form.weekendHourly;
    const { weekday, weekend } = resolveWageForCategory(form.employeeCategory, form.employeeCategoryCustom, form.employeeId);
    const nextWd = String(weekday);
    const nextWe = String(weekend);
    if (nextWd === wd && nextWe === we) return; // 이미 동일
    setForm(prev => ({ ...prev, weekdayHourly: nextWd, weekendHourly: nextWe }));
    lastAutoWageRef.current = { wd: nextWd, we: nextWe };
  }, [resolveWageForCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // 계약 이력 조회
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

  // 계약 유형 · 정규직 → 무기한 · 계약직 → 유기
  useEffect(() => {
    if (form.contractType === "정규직" && !form.indefinite) {
      setForm(prev => ({ ...prev, indefinite: true, endDate: "" }));
    } else if (form.contractType === "계약직" && form.indefinite) {
      setForm(prev => ({ ...prev, indefinite: false }));
    }
  }, [form.contractType]); // eslint-disable-line react-hooks/exhaustive-deps

  // 계약직 · N개월 → endDate 자동
  useEffect(() => {
    if (form.contractType !== "계약직") return;
    if (form.indefinite) return;
    const months = Number(form.contractMonths);
    if (!Number.isFinite(months) || months <= 0) return;
    if (!form.startDate) return;
    const start = new Date(form.startDate);
    if (isNaN(start.getTime())) return;
    const end = new Date(start);
    end.setMonth(end.getMonth() + months);
    end.setDate(end.getDate() - 1);
    const iso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    if (iso !== form.endDate) {
      setForm(prev => ({ ...prev, endDate: iso }));
    }
  }, [form.contractType, form.contractMonths, form.startDate, form.indefinite]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2026-08-06 · T-DB-Migrate-LocalStorage
  //   mount 시 · 서버에서 contract writer settings (직군별 업무 텍스트) 를 fetch
  //   → localStorage 캐시 갱신 → writerSettingsVersion++ → 아래 category effect 재실행
  //   서버 실패 시 · 기존 localStorage 값 유지 (silent · loadContractSettings 가 그대로 반환)
  const [writerSettingsVersion, setWriterSettingsVersion] = useState(0);
  // T-CTR-Etc+JobFromDB · 직군 목록 · DB settings 키(약사/매장/창고/기타)에서 동적 로드
  // fallback: DEFAULT_CONTRACT_SETTINGS 키 순서
  const [jobCategories, setJobCategories] = useState<ContractCategory[]>([...JOB_CATEGORIES]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fresh = await fetchContractWriterSettings(); // localStorage 캐시 자동 갱신
        if (!cancelled) {
          setWriterSettingsVersion(v => v + 1);
          // 2026-08-16 · #90 · JOB_CATEGORIES 하드코딩 → wageRates keys 동적 파생
          //   universe · JOB_CATEGORIES ∪ Object.keys(wageRates) · 순서 유지 (JOB_CATEGORIES 먼저)
          //   필터 · fresh 에 존재 + 문자열 값 (업무 텍스트) 인 것만
          const universe: string[] = [
            ...JOB_CATEGORIES,
            ...Object.keys(settings.wageRates ?? {}).filter(k => !(JOB_CATEGORIES as readonly string[]).includes(k)),
          ];
          const cats = universe.filter(
            k => k in fresh && typeof (fresh as unknown as Record<string, unknown>)[k] === "string",
          ) as ContractCategory[];
          if (cats.length > 0) setJobCategories(cats);
        }
      } catch { /* silent · fallback = localStorage */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 카테고리 → 업무 기본값 (writerSettingsVersion 변경 시에도 재계산)
  useEffect(() => {
    const settings = loadContractSettings();
    const defaults: Record<ContractCategory, string> = {
      "약사": settings.약사 || DEFAULT_CONTRACT_SETTINGS.약사,
      "매장": settings.매장 || DEFAULT_CONTRACT_SETTINGS.매장,
      "창고": settings.창고 || DEFAULT_CONTRACT_SETTINGS.창고,
      "기타": settings.기타 || DEFAULT_CONTRACT_SETTINGS.기타,
    };
    const key = form.employeeCategory;
    // T-CTR-Etc+JobFromDB · 기타 자유텍스트 제거 · defaults[key] 만 사용
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

  // 매장/창고 → primaryFocus 자동
  useEffect(() => {
    setForm(prev => {
      if (prev.employeeCategory === "매장" || prev.employeeCategory === "창고") {
        if (prev.primaryFocus == null) {
          return { ...prev, primaryFocus: prev.employeeCategory };
        }
        return prev;
      }
      if (prev.primaryFocus !== null) {
        return { ...prev, primaryFocus: null };
      }
      return prev;
    });
  }, [form.employeeCategory]);

  // 계약체결일 = 시작일 (초기)
  useEffect(() => {
    setForm(prev => (prev.contractSignDate ? prev : { ...prev, contractSignDate: prev.startDate || todayIso() }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // K. 주 근무일수 자동 계산 (요일 체크박스 → 개수)
  const weeklyDays = useMemo(() => DAYS.filter(d => form.workDays[d]).length, [form.workDays]);
  const weeklyWeekdayDays = useMemo(() => WEEKDAYS.filter(d => form.workDays[d]).length, [form.workDays]);
  const weeklyWeekendDays = useMemo(() => WEEKEND.filter(d => form.workDays[d]).length, [form.workDays]);
  const workDaysSummary = useMemo(() => {
    const active = DAYS.filter(d => form.workDays[d]);
    if (active.length === 0) return "선택 안 됨";
    return `${active.join("·")} (주 ${active.length}일)`;
  }, [form.workDays]);

  const upd = useCallback(<K extends keyof ContractForm>(key: K, val: ContractForm[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
  }, []);

  const toggleDay = (d: DayKey) => {
    setForm(prev => ({ ...prev, workDays: { ...prev.workDays, [d]: !prev.workDays[d] } }));
  };

  // 근무시간 → 월 근로시간 계산 (실시간)
  const monthlyCalc = useMemo(() => {
    return computeMonthlyHours(
      form.startTime,
      form.endTime,
      Number(form.breakMinutes) || 0,
      weeklyDays,
    );
  }, [form.startTime, form.endTime, form.breakMinutes, weeklyDays]);

  // 2026-08-07 · 통상시급 → form.wageComponents 4자동항목 자동 동기화 (프리뷰 반영)
  useEffect(() => {
    const wd = Number(form.weekdayHourly) || 0;
    const autoHourly = Math.round(wd * 10) / 10;
    const hourly = wageHourlyOverride != null && wageHourlyOverride > 0
      ? Math.round(wageHourlyOverride * 10) / 10
      : autoHourly;
    if (hourly <= 0) return;
    const basicAmt    = Math.round(hourly * WAGE_HOURS.BASIC);
    const overtimeAmt = Math.round(hourly * WAGE_HOURS.OVERTIME);
    const holidayAmt  = Math.round(hourly * WAGE_HOURS.HOLIDAY);
    const annualAmt   = Math.round(hourly * WAGE_HOURS.ANNUAL_LEAVE);
    setForm(prev => {
      const wc = prev.wageComponents;
      if (
        wc.basicSalary?.amount === basicAmt
        && wc.fixedOvertime?.amount === overtimeAmt
        && wc.fixedHoliday?.amount === holidayAmt
        && wc.fixedAnnualLeave?.amount === annualAmt
      ) return prev;
      return {
        ...prev,
        wageComponents: {
          ...wc,
          basicSalary:      { ...wc.basicSalary,      amount: basicAmt },
          fixedOvertime:    { ...wc.fixedOvertime,    amount: overtimeAmt },
          fixedHoliday:     { ...wc.fixedHoliday,     amount: holidayAmt },
          fixedAnnualLeave: { ...wc.fixedAnnualLeave, amount: annualAmt },
        },
      };
    });
  }, [
    wageHourlyOverride,
    form.weekdayHourly,
  ]);

  // 자동계산 적용 → 기본급 시간·분 세팅
  const applyMonthlyHoursToBasic = useCallback(() => {
    if (!monthlyCalc) {
      setNotice({ tone: "err", text: "근무시간을 먼저 입력하세요." });
      return;
    }
    setForm(prev => ({
      ...prev,
      useWageComponents: true,
      wageComponents: {
        ...prev.wageComponents,
        basicSalary: {
          ...prev.wageComponents.basicSalary,
          hours: monthlyCalc.monthlyHoursInt,
          minutes: monthlyCalc.monthlyMinutesRem,
        },
      },
    }));
    setNotice({
      tone: "ok",
      text: `월 근로시간 ${monthlyCalc.monthlyHoursInt}시간 ${monthlyCalc.monthlyMinutesRem}분 을 기본급 항목에 반영했습니다.`,
    });
  }, [monthlyCalc]);

  // T-U (2026-08-05) · workDays·근무시간·시급 변경 시 임금구성표 자동 재계산
  //   · 시급 (통상시급) × 각 항목 시간 = 각 항목 금액
  //   · 기본급 시간 · monthlyCalc 기준 자동 조정 (주말 추가 시 반영)
  //     - 단, 사용자가 수동으로 변경한 basic hours 는 유지 (default 값 209 또는 이전 monthlyCalc 값일 때만 자동 갱신)
  //   · 연장·휴일·연차 시간 · 그대로 유지 (사용자가 조정한 항목)
  //   · 금액은 각 항목 시간 × 시급 (또는 야간·휴일연장은 × 0.5) 로 재산정
  //
  // T-X (2026-08-05) · 노무사 표준 계산법 적용
  //   · basic/OT/holiday 시간 · 하루 근무h + 주중일수 + 주말일수 기반 · 자동 산정
  //   · 사용자 수동조정 시엔 · lastAutoRef 로 감지하여 자동 갱신 skip (수동값 유지)
  const lastAutoBasicHoursRef = useRef<{ h: number; m: number } | null>(null);
  const lastAutoOtHoursRef = useRef<{ h: number; m: number } | null>(null);
  const lastAutoHolidayHoursRef = useRef<{ h: number; m: number } | null>(null);
  useEffect(() => {
    setForm(prev => {
      // T-CTR-12 (2026-08-05) · grossSalaryInput 설정 시 · fixed 296.94 흐름이 우선
      //   · Step 4 useEffect 가 4항목 (기본·연장·휴일·연차) 을 fixed 시간으로 세팅함
      //   · 이 dynamic-hours effect 는 우회 (충돌 방지)
      if (prev.grossSalaryInput && prev.grossSalaryInput.trim() !== "") return prev;
      const wd = Number(prev.weekdayHourly) || 0;
      const we = Number(prev.weekendHourly) || 0;
      if (wd <= 0) return prev; // 시급 미입력 시 skip

      let nextWage = prev.wageComponents;

      // T-X · 하루 근무시간 + 주중/주말 일수 → 노무사 표준 base 시간
      const dailyH = monthlyCalc ? monthlyCalc.dailyMinutes / 60 : 0;
      const base = dailyH > 0 && weeklyWeekdayDays > 0
        ? calcWageBase(dailyH, weeklyWeekdayDays, weeklyWeekendDays)
        : null;

      // helper · 시·분 분리 (반올림 최소화 · 근로자 이익 · 분 올림)
      const splitHM = (totalH: number): { h: number; m: number } => {
        if (totalH <= 0) return { h: 0, m: 0 };
        const totalMin = Math.round(totalH * 60);
        return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
      };

      // helper · 수동 조정 여부 감지 (default 값 또는 최근 auto 값 이면 auto 갱신)
      const isSameAutoOrDefault = (
        cur: WageComponentEntry,
        defaults: Array<{ h: number; m: number }>,
        lastAuto: { h: number; m: number } | null,
      ): boolean => {
        if (defaults.some(d => cur.hours === d.h && cur.minutes === d.m)) return true;
        if (lastAuto != null && cur.hours === lastAuto.h && cur.minutes === lastAuto.m) return true;
        if (cur.hours === 0 && cur.minutes === 0) return true;
        return false;
      };

      // T-CTR-7 · 명시적 비활성 항목 skip · 자동 채움 방지 (사용자 의도 우선)
      const disMap = prev.wageDisabled ?? {};

      if (base) {
        // 1) basic hours · 노무사 표준 (항상 활성)
        {
          const cur = prev.wageComponents.basicSalary;
          if (isSameAutoOrDefault(
            cur,
            [{ h: 209, m: 0 }, { h: 195, m: 30 }, { h: 195, m: 32 }],
            lastAutoBasicHoursRef.current,
          )) {
            const next = splitHM(base.monthlyBasicH);
            if (cur.hours !== next.h || cur.minutes !== next.m) {
              nextWage = { ...nextWage, basicSalary: { ...cur, hours: next.h, minutes: next.m } };
            }
            lastAutoBasicHoursRef.current = next;
          }
        }
        // 2) fixedOvertime hours · 연장가산 (× 1.5 반영) · default 55h56m · T-CTR-7 · disabled 시 skip
        if (!disMap.fixedOvertime) {
          const cur = nextWage.fixedOvertime;
          if (isSameAutoOrDefault(
            cur,
            [{ h: 55, m: 56 }, { h: 0, m: 0 }],
            lastAutoOtHoursRef.current,
          )) {
            const next = splitHM(base.monthlyOvertimeGainedH);
            if (cur.hours !== next.h || cur.minutes !== next.m) {
              nextWage = { ...nextWage, fixedOvertime: { ...cur, hours: next.h, minutes: next.m } };
            }
            lastAutoOtHoursRef.current = next;
          }
        }
        // 3) fixedHoliday hours · 휴일가산 (× 1.5 반영) · default 22h0m · 주말 근무 없으면 0 · T-CTR-7 · disabled 시 skip
        if (!disMap.fixedHoliday) {
          const cur = nextWage.fixedHoliday;
          if (isSameAutoOrDefault(
            cur,
            [{ h: 22, m: 0 }, { h: 0, m: 0 }],
            lastAutoHolidayHoursRef.current,
          )) {
            const next = splitHM(base.monthlyHolidayGainedH);
            if (cur.hours !== next.h || cur.minutes !== next.m) {
              nextWage = { ...nextWage, fixedHoliday: { ...cur, hours: next.h, minutes: next.m } };
            }
            lastAutoHolidayHoursRef.current = next;
          }
        }
      } else if (monthlyCalc) {
        // Fallback · base 산정 불가 시 · 기존 monthlyCalc 기반 basic 만 반영
        const cur = prev.wageComponents.basicSalary;
        const last = lastAutoBasicHoursRef.current;
        const isDefaultBasic =
          (cur.hours === 209 && cur.minutes === 0) ||
          (cur.hours === 0 && cur.minutes === 0) ||
          (last != null && cur.hours === last.h && cur.minutes === last.m);
        if (isDefaultBasic) {
          const nextH = monthlyCalc.monthlyHoursInt;
          const nextM = monthlyCalc.monthlyMinutesRem;
          if (cur.hours !== nextH || cur.minutes !== nextM) {
            nextWage = { ...nextWage, basicSalary: { ...cur, hours: nextH, minutes: nextM } };
          }
          lastAutoBasicHoursRef.current = { h: nextH, m: nextM };
        }
      }

      // 4) 각 항목 시간 × 시급 재계산 (배수 · 야간/휴일연장 0.5) · T-CTR-7 · disabled 항목 amount=0 강제
      const calc = computeWageFromHourlyDual(wd, we, nextWage);
      const nextComp: WageComponents = {
        ...nextWage,
        basicSalary:          { ...nextWage.basicSalary,          amount: calc.basicAmount },
        fixedOvertime:        { ...nextWage.fixedOvertime,        amount: disMap.fixedOvertime        ? 0 : calc.overtimeAmount },
        fixedHoliday:         { ...nextWage.fixedHoliday,         amount: disMap.fixedHoliday         ? 0 : calc.holidayAmount },
        fixedHolidayOvertime: { ...nextWage.fixedHolidayOvertime, amount: disMap.fixedHolidayOvertime ? 0 : calc.holidayOvertimeAmount },
        fixedNight:           { ...nextWage.fixedNight,           amount: disMap.fixedNight           ? 0 : calc.nightAmount },
        fixedAnnualLeave:     { ...nextWage.fixedAnnualLeave,     amount: disMap.fixedAnnualLeave     ? 0 : calc.annualLeaveAmount },
      };

      // 변화 감지 (시간 or 금액 갱신)
      const changed =
        nextWage !== prev.wageComponents ||
        nextComp.basicSalary.amount          !== prev.wageComponents.basicSalary.amount ||
        nextComp.fixedOvertime.amount        !== prev.wageComponents.fixedOvertime.amount ||
        nextComp.fixedHoliday.amount         !== prev.wageComponents.fixedHoliday.amount ||
        nextComp.fixedHolidayOvertime.amount !== prev.wageComponents.fixedHolidayOvertime.amount ||
        nextComp.fixedNight.amount           !== prev.wageComponents.fixedNight.amount ||
        nextComp.fixedAnnualLeave.amount     !== prev.wageComponents.fixedAnnualLeave.amount;
      if (!changed) return prev;
      return { ...prev, wageComponents: nextComp };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.workDays,
    form.startTime,
    form.endTime,
    form.breakMinutes,
    form.weekdayHourly,
    form.weekendHourly,
    form.wageComponents.basicSalary.hours,
    form.wageComponents.basicSalary.minutes,
    form.wageComponents.fixedOvertime.hours,
    form.wageComponents.fixedOvertime.minutes,
    form.wageComponents.fixedHoliday.hours,
    form.wageComponents.fixedHoliday.minutes,
    form.wageComponents.fixedHolidayOvertime.hours,
    form.wageComponents.fixedHolidayOvertime.minutes,
    form.wageComponents.fixedNight.hours,
    form.wageComponents.fixedNight.minutes,
    form.wageComponents.fixedAnnualLeave.hours,
    form.wageComponents.fixedAnnualLeave.minutes,
    monthlyCalc,
    // T-CTR-7 · 명시적 비활성 변경 시 재계산
    form.wageDisabled,
  ]);

  // T-CTR-8 (2026-08-05) · 개인정보 수령자 자동 sync
  //   · recipientName 비어있으면 employeeName 로 자동 채움
  //   · recipientAddress 비어있으면 employeeAddress 로 자동 채움
  //   · 사용자가 프리뷰나 저장 시점에 별도 편집 가능 (원본 값이 있으면 유지)
  useEffect(() => {
    setForm(prev => {
      const p = prev.privacyConsent;
      const nextName = p.recipientName || prev.employeeName;
      const nextAddr = p.recipientAddress || prev.employeeAddress;
      if (nextName === p.recipientName && nextAddr === p.recipientAddress) return prev;
      return {
        ...prev,
        privacyConsent: { ...p, recipientName: nextName, recipientAddress: nextAddr },
      };
    });
  }, [form.employeeName, form.employeeAddress]);

  // T-CTR-9 · Step 2 (2026-08-05, 2026-08-07 통일)
  //   · 근무조건 헤더의 buMonthlyNet 과 동일 산식으로 targetNetInput 자동 반영
  //     weeklyPay  = round(주중일 × 하루h × 주중시급 + 주말일 × 하루h × 주말시급)
  //     monthlyNet = round(weeklyPay × 4.345)
  //   · 사용자가 targetNetInput 편집 시 · 자동 갱신 중단 (수동 우선)
  //   · targetNetInput 을 빈 값으로 초기화하면 자동 재개
  const manualTargetNetRef = useRef(false);
  useEffect(() => {
    if (manualTargetNetRef.current) return;
    const dailyH = monthlyCalc ? monthlyCalc.dailyMinutes / 60 : 0;
    const wdRate = Number(form.weekdayHourly) || 0;
    const weRate = Number(form.weekendHourly) || wdRate;
    if (!Number.isFinite(dailyH) || dailyH <= 0) return;
    if (!Number.isFinite(wdRate) || wdRate <= 0) return;
    if (!Number.isFinite(weeklyWeekdayDays) || weeklyWeekdayDays <= 0) return;

    // 헤더 buMonthlyNet 과 동일 · weeklyPay × 4.345
    const weeklyWdH = weeklyWeekdayDays * dailyH;
    const weeklyWeH = (weeklyWeekendDays || 0) * dailyH;
    const weeklyPay = Math.round(weeklyWdH * wdRate + weeklyWeH * weRate);
    const autoNet = Math.round(weeklyPay * 4.345);
    if (!Number.isFinite(autoNet) || autoNet <= 0) return;

    setForm(prev => {
      const str = String(autoNet);
      if (prev.targetNetInput === str) return prev;
      return { ...prev, targetNetInput: str };
    });
  }, [monthlyCalc, form.weekdayHourly, form.weekendHourly, weeklyWeekdayDays, weeklyWeekendDays]);

  // T-CTR-12 · Step 3 (2026-08-05) · 희망세후 → 세전 자동 gross-up
  //   · targetNetInput 변경 시 · payroll grossUp 반복 근사 (4대보험 + 누진소득세)
  //   · nonTaxable · 식대 + 차량 (비과세) 반영
  //   · dependents · 기본 1
  //   · 사용자가 grossSalaryInput 을 수동 편집하면 자동 갱신 중단
  const manualGrossSalaryRef = useRef(false);
  useEffect(() => {
    if (manualGrossSalaryRef.current) return;
    const net = Number(form.targetNetInput.replace(/[^0-9]/g, "")) || 0;
    if (!Number.isFinite(net) || net <= 0) return;
    const nonTaxable = (Number(form.wageComponents.mealAllowance) || 0)
                     + (Number(form.wageComponents.vehicleAllowance) || 0);
    const { gross } = payrollGrossUp(net, nonTaxable, 1);
    if (!Number.isFinite(gross) || gross <= 0) return;
    setForm(prev => {
      const str = String(gross);
      if (prev.grossSalaryInput === str) return prev;
      return { ...prev, grossSalaryInput: str };
    });
  }, [
    form.targetNetInput,
    form.wageComponents.mealAllowance,
    form.wageComponents.vehicleAllowance,
  ]);

  // T-CTR-12 · Step 4 (2026-08-05) · 세전 → 임금구조 4항목 자동 분배
  //   · 통상시급 = 세전 X / 296.94 (RECOGNIZED_HOURS.total)
  //   · 기본급   = 통상시급 × 209
  //   · 고정연장 = 통상시급 × 55.94 (가산 1.5배 이미 반영)
  //   · 고정휴일 = 통상시급 × 22    (가산 1.5배 이미 반영)
  //   · 고정연차 = 통상시급 × 10
  //   · hours/minutes 는 사용자 편집 존중 (default 값이면 fixed 로 초기화)
  //   · T-CTR-7 · 명시적 비활성 항목 (fixedOvertime·fixedHoliday·fixedAnnualLeave) · amount=0 유지
  useEffect(() => {
    const gross = Number(form.grossSalaryInput.replace(/[^0-9]/g, "")) || 0;
    if (!Number.isFinite(gross) || gross <= 0) return;
    const ordinaryHourly = gross / RECOGNIZED_HOURS.total;
    if (!Number.isFinite(ordinaryHourly) || ordinaryHourly <= 0) return;

    const basicAmt  = Math.round(ordinaryHourly * RECOGNIZED_HOURS.basic);
    const otAmt     = Math.round(ordinaryHourly * RECOGNIZED_HOURS.fixedOvertime);
    const holAmt    = Math.round(ordinaryHourly * RECOGNIZED_HOURS.fixedHoliday);
    const annualAmt = Math.round(ordinaryHourly * RECOGNIZED_HOURS.fixedAnnualLeave);

    setForm(prev => {
      const disMap = prev.wageDisabled ?? {};
      const wc = prev.wageComponents;
      // 시간 default (55.94h → 55h 56m · 하위호환)
      const nextBasic  = { hours: 209, minutes: 0,  amount: basicAmt };
      const nextOt     = disMap.fixedOvertime    ? { hours: 0, minutes: 0, amount: 0 } : { hours: 55, minutes: 56, amount: otAmt };
      const nextHol    = disMap.fixedHoliday     ? { hours: 0, minutes: 0, amount: 0 } : { hours: 22, minutes: 0,  amount: holAmt };
      const nextAnnual = disMap.fixedAnnualLeave ? { hours: 0, minutes: 0, amount: 0 } : { hours: 10, minutes: 0,  amount: annualAmt };

      // 변화 감지 (amount 만 체크 · hours 는 default 유지)
      const noChange =
        wc.basicSalary.amount      === nextBasic.amount &&
        wc.fixedOvertime.amount    === nextOt.amount &&
        wc.fixedHoliday.amount     === nextHol.amount &&
        wc.fixedAnnualLeave.amount === nextAnnual.amount &&
        wc.basicSalary.hours       === nextBasic.hours &&
        wc.fixedOvertime.hours     === nextOt.hours &&
        wc.fixedHoliday.hours      === nextHol.hours &&
        wc.fixedAnnualLeave.hours  === nextAnnual.hours;
      if (noChange) return prev;

      return {
        ...prev,
        useWageComponents: true,
        wageComponents: {
          ...wc,
          basicSalary:      { ...wc.basicSalary,      ...nextBasic },
          fixedOvertime:    { ...wc.fixedOvertime,    ...nextOt },
          fixedHoliday:     { ...wc.fixedHoliday,     ...nextHol },
          fixedAnnualLeave: { ...wc.fixedAnnualLeave, ...nextAnnual },
        },
      };
    });
  }, [form.grossSalaryInput, form.wageDisabled]);

  // 직원 선택
  //   T-CTR-10 (2026-08-05) · 근로자 설정 시급 자동 반영
  //     · 우선순위: 직원 override (settings.employeeWageOverrides[emp.id])
  //                → 직군 wageRates (settings.wageRates[position])
  //                → defaultWageForPosition (약사=35000/40000 · 그 외=10030/12000)
  //     · 조건: 사용자가 기존에 시급을 수동 편집하지 않은 경우 (default 값 "35000"/"40000" 인 경우 or 빈 값)
  //             다른 직원으로 스위치할 때는 이전 자동값을 새 직원의 자동값으로 덮어씀 (수동 편집이 없는 한)
  //     · 실패 (설정 없음) 시 silent · 기존 값 유지
  const onSelectEmployee = (empIdRaw: string) => {
    if (!empIdRaw) { upd("employeeId", null); return; }
    const empId = Number(empIdRaw);
    const emp = employees.find(e => e.id === empId);
    if (!emp) { upd("employeeId", empId); return; }

    // 시급 조회: override → 직군 → default
    const positionRaw = String(emp.position || "").trim();
    const empOverride = settings.employeeWageOverrides?.[emp.id];
    const positionRate = positionRaw ? settings.wageRates?.[positionRaw] : undefined;
    const resolvedRate: WageRate | null =
      (empOverride && (empOverride.weekday > 0 || empOverride.weekend > 0)) ? empOverride
      : (positionRate && (positionRate.weekday > 0 || positionRate.weekend > 0)) ? positionRate
      : (positionRaw ? defaultWageForPosition(positionRaw) : null);

    // T-CTR-WageAutoLoad-Bug fix · 직원 선택 시 wageAutoLoadedRef / lastAutoWageRef 동기화
    //   → 이후 직군 변경(employeeCategory) 시 category effect 가 "자동 로드 값" 으로 인식해 재로드 허용
    //   → onSelectEmployee 에서 직접 시급을 설정하므로 ref 업데이트 필수
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
      // T-CTR-10 · 시급 자동 반영 (수동 편집 여부와 무관하게 · 신규 직원 선택 시 새로 세팅)
      //  → 사용자가 편집 여부를 판단하기 어렵고 · 직원 스위칭 = 명시적 재세팅 의도로 해석
      //  → resolvedRate 가 null 이면 (position 이 비어있으면) 기존 값 유지
      weekdayHourly: resolvedRate ? String(resolvedRate.weekday) : prev.weekdayHourly,
      weekendHourly: resolvedRate ? String(resolvedRate.weekend) : prev.weekendHourly,
      employeeCategory: (() => {
        const pos = positionRaw;
        if (pos === "약사")  return "약사" as const;
        if (pos === "매장")  return "매장" as const;
        if (pos === "창고")  return "창고" as const;
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
      // T-CTR-EmployeeLink (2026-08-06) · 신규 필드 자동 채움
      employeeEmail: (emp as any).email || prev.employeeEmail,
      employeeBirth: (emp as any).resident_number || prev.employeeBirth,
      employeeGender: emp.gender || prev.employeeGender,
      employeeRank: emp.rank || prev.employeeRank,
      employeeWorkplace: emp.workplace || prev.employeeWorkplace,
      // 입사일 → 계약 시작일 기본값 (편집 가능 · 기존 값이 없거나 오늘 날짜인 경우만 덮어씀)
      startDate: (emp.hireDate && (!prev.startDate || prev.startDate === todayIso()))
        ? emp.hireDate
        : prev.startDate,
    }));
  };

  // 서명 전체 초기화 · 2026-08-07 · SIGN_KEYS 기반 동적 생성 (하드코딩 키 누락 위험 방지)
  //   · 레거시 키(specialWork·breakChange·wageClause3·wageClause4·etc5) 는 null 로 유지
  const clearAllSignatures = useCallback(() => {
    setSignUrls(prev => {
      const next = { ...prev };
      // 모든 현재 키 null 초기화
      (Object.keys(next) as Array<keyof typeof next>).forEach(k => { next[k] = null; });
      return next;
    });
  }, []);

  // #220 · 연장 확정
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

  // 폼 리셋 · T-N (2026-08-05) · 임시저장(localStorage) 도 함께 삭제
  const handleReset = async () => {
    if (!await confirm({ message: "입력한 모든 내용 · 서명 · 임시저장까지 전체 초기화합니다.\n계속하시겠습니까?", danger: true })) return;
    setForm(emptyForm());
    clearAllSignatures();
    clearDraft();
    setNotice({ tone: "ok", text: "전체 초기화되었습니다." });
  };

  // PDF 빌드 · T-Y (2026-08-05) · A4 정확히 2페이지 출력 (사용자 요청)
  //   방식 A + C 조합:
  //     · C · 프리뷰 자체 · 폰트/여백 축소된 상태 (컴팩트 hex 색상 · 이미 적용됨)
  //     · A · 컨텐츠 캡처 후 · A4 2페이지 크기에 맞춰 스케일 보정 (2페이지 초과 방지)
  //     · B · 단일 이미지 캡처 · pdfH 씩 슬라이스 · 총 2페이지 강제
  //   목표: 2 페이지 이내 항상 · 폰트 최소 10pt+ 유지 (스케일 팩터 안전 범위)
  const buildPdfFromPreview = async (): Promise<{ pdf: jsPDF; filename: string }> => {
    const node = previewRef.current;
    if (!node) throw new Error("계약서 프리뷰를 찾을 수 없습니다.");

    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: node.scrollWidth,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pdfW = pdf.internal.pageSize.getWidth();   // A4 = 210mm
    const pdfH = pdf.internal.pageSize.getHeight();  // A4 = 297mm

    // T-PDF-FullWidth · 가로 A4 풀폭 (margin 없음) · 세로 비율 계산 후 페이지 분할
    //   imgW = pdfW 항상 고정 · 세로만 canvas 비율로 계산
    const imgW = pdfW;
    const imgH = (canvas.height * imgW) / canvas.width;

    if (imgH <= pdfH) {
      // 1페이지 이내 · 가로 풀폭 · 상단 붙임
      pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH, undefined, "FAST");
    } else {
      // 다중 페이지 · pdfH 씩 슬라이스 · 가로 풀폭 유지
      let yOffset = 0;
      let remaining = imgH;
      while (remaining > 0) {
        pdf.addImage(imgData, "PNG", 0, -yOffset, imgW, imgH, undefined, "FAST");
        remaining -= pdfH;
        yOffset += pdfH;
        if (remaining > 0) pdf.addPage();
      }
    }

    const safeName = (form.employeeName || "근로자").replace(/[\\/:*?"<>|]/g, "_");
    const safeDate = (form.startDate || todayIso()).replace(/-/g, "");
    const filename = `근로계약서_${safeName}_${safeDate}.pdf`;
    return { pdf, filename };
  };

  // 서명 상태 (9 지점)
  const signatureStatus = useMemo(() => {
    const filled = SIGN_KEYS.filter(k => !!signUrls[k]).length;
    return { filled, total: SIGN_KEYS.length };
  }, [signUrls]);

  // 검증
  const validateBeforeAction = async (opts: { requireAllSignatures: boolean }): Promise<boolean> => {
    if (!form.employeeName.trim()) {
      setNotice({ tone: "err", text: "근로자 성명을 입력하세요." });
      return false;
    }
    if (!form.startDate) {
      setNotice({ tone: "err", text: "계약 시작일을 입력하세요." });
      return false;
    }
    if (!form.indefinite && !form.endDate) {
      setNotice({ tone: "err", text: "계약 종료일을 입력하거나 '무기한'을 선택하세요." });
      return false;
    }
    const missing = SIGN_KEYS.filter(k => !signUrls[k]);
    if (missing.length > 0) {
      const names = missing.map(k => SIGN_LABEL[k]);
      if (opts.requireAllSignatures) {
        setNotice({ tone: "err", text: `서명 누락 (${missing.length}/${SIGN_KEYS.length}): ${names.join(" · ")}` });
        return false;
      } else {
        if (!await confirm({ message: `서명이 ${missing.length}/${SIGN_KEYS.length} 비어있습니다:\n${names.join(" · ")}\n\n서명 없이 PDF를 생성하시겠습니까?` })) return false;
      }
    }
    return true;
  };

  // 계약 완료 → PDF 로컬 저장
  const handleComplete = async () => {
    setNotice(null);
    // T-PDF-SignatureRequired: 사업주·근로자 서명 필수
    if (!signUrls.employer || !signUrls.employee) {
      setNotice({ tone: "err", text: "서명 후 저장 가능합니다. 사업주(갑)와 근로자(을) 서명이 필요합니다." });
      return;
    }
    if (!await validateBeforeAction({ requireAllSignatures: false })) return;
    setGenerating(true);
    await new Promise(r => setTimeout(r, 60));
    try {
      const { pdf, filename } = await buildPdfFromPreview();
      pdf.save(filename);
      setNotice({ tone: "ok", text: "PDF 다운로드가 시작되었습니다." });
    } catch (err: any) {
      setNotice({ tone: "err", text: err?.message ?? "PDF 생성에 실패했습니다." });
    } finally {
      setGenerating(false);
    }
  };

  // 계약완료 승인 · DB 저장
  const handleApproveAndSave = async () => {
    setNotice(null);
    if (!await validateBeforeAction({ requireAllSignatures: true })) return;
    setGenerating(true);
    await new Promise(r => setTimeout(r, 60));
    try {
      const { pdf, filename } = await buildPdfFromPreview();
      const pdfDataUrl = pdf.output("datauristring");
      // T-Z (2026-08-05) · 저장 payload · short label ("정규" · "계약N")
      const contractTypeShort = shortContractLabel(form.contractType, form.contractMonths);
      const body = {
        employee_id: form.employeeId,
        employee_name: form.employeeName,
        employee_number: form.employeeNumber?.trim() || null,
        contract_type: contractTypeShort || null,
        start_date: form.startDate || null,
        end_date: form.indefinite ? null : (form.endDate || null),
        pdf_data_url: pdfDataUrl,
        approved_by: authSession?.employeeName ?? null,
        approved_by_id: authSession?.employeeId ?? null,
        // 2026-08-10 · B Step 3 · 근로정보 (계약서 조회로 카드 표시)
        working_hours: (form.startTime && form.endTime) ? `${form.startTime}-${form.endTime}` : null,
        annual_leave_days: form.annualLeaveDays ? Number(form.annualLeaveDays) || null : null,
      };
      let saved: any = {};
      try {
        const { data } = await api.post<any>("/api/employee-contracts", body);
        saved = data ?? {};
      } catch (err: any) {
        const msg = err instanceof ApiError ? err.message : (err?.message ?? `저장 실패`);
        pdf.save(filename);
        setNotice({ tone: "err", text: `${msg} · 로컬 다운로드만 진행되었습니다.` });
        return;
      }
      pdf.save(filename);
      const pdfUrl: string | undefined = saved?.pdf_url;
      setNotice({
        tone: "ok",
        text: pdfUrl ? `계약이 승인되어 저장되었습니다. 다운로드 링크: ${pdfUrl}` : "계약이 승인되어 저장되었습니다.",
      });
      clearDraft();
      if (saved && (saved.start_date || saved.end_date)) {
        setExistingContract({
          id: saved.id,
          contract_type: saved.contract_type,
          start_date: saved.start_date,
          end_date: saved.end_date,
          created_at: saved.created_at,
          pdf_url: saved.pdf_url,
        });
      }
    } catch (err: any) {
      setNotice({ tone: "err", text: err instanceof ApiError ? err.message : (err?.message ?? "계약 승인·저장에 실패했습니다.") });
    } finally {
      setGenerating(false);
    }
  };

  // T-R (2026-08-05) · PDF 업로드 방식 · Google Drive (contract 폴더) 저장
  const handleUploadContract = async () => {
    setNotice(null);
    if (!uploadFile) {
      setNotice({ tone: "err", text: "업로드할 PDF 파일을 선택하세요." });
      return;
    }
    if (!form.employeeName.trim()) {
      setNotice({ tone: "err", text: "근로자 성명을 입력하세요 (왼쪽 폼)." });
      return;
    }
    if (!/pdf$/i.test(uploadFile.name) && uploadFile.type !== "application/pdf") {
      setNotice({ tone: "err", text: "PDF 파일만 업로드 가능합니다." });
      return;
    }
    if (uploadFile.size > 20 * 1024 * 1024) {
      setNotice({ tone: "err", text: `파일 크기 초과 (${(uploadFile.size / 1024 / 1024).toFixed(1)}MB > 20MB)` });
      return;
    }

    setUploadBusy(true);
    try {
      const fd = new FormData();
      fd.append("contract", uploadFile);
      if (form.employeeId != null) fd.append("employee_id", String(form.employeeId));
      fd.append("employee_name", form.employeeName);
      // T-Z (2026-08-05) · 저장 payload · short label ("정규" · "계약N")
      const contractTypeShortU = shortContractLabel(form.contractType, form.contractMonths);
      if (contractTypeShortU) fd.append("contract_type", contractTypeShortU);
      if (form.startDate) fd.append("start_date", form.startDate);
      if (!form.indefinite && form.endDate) fd.append("end_date", form.endDate);
      if (authSession?.employeeName) fd.append("approved_by", authSession.employeeName);
      if (authSession?.employeeId != null) fd.append("approved_by_id", String(authSession.employeeId));

      const { data: saved } = await api.post<any>("/api/employee-contracts/upload", fd);
      setNotice({
        tone: "ok",
        text: saved?.pdf_url
          ? `Google Drive 업로드 완료 · 링크: ${saved.pdf_url}`
          : "Google Drive 업로드 완료",
      });
      clearDraft();
      setUploadFile(null);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
      if (saved && (saved.start_date || saved.end_date)) {
        setExistingContract({
          id: saved.id,
          contract_type: saved.contract_type,
          start_date: saved.start_date,
          end_date: saved.end_date,
          created_at: saved.created_at,
          pdf_url: saved.pdf_url,
        });
      }
    } catch (err: any) {
      setNotice({ tone: "err", text: err instanceof ApiError ? err.message : (err?.message ?? "업로드 실패") });
    } finally {
      setUploadBusy(false);
    }
  };

  const canApprove = signatureStatus.filled >= REQUIRED_SIGN_COUNT;

  return {
    toast,
    paymentDayText,
    form, setForm, upd,
    draftSavedAt, saveDraft, clearDraft,
    notice, setNotice,
    writeMode, setWriteMode,
    uploadFile, setUploadFile, uploadBusy, uploadInputRef, handleUploadContract,
    employees, empLoading, empError, empSearchOpen, setEmpSearchOpen,
    signUrls, setSignUrls, signModal, openSign, closeSign, submitSign, clearSign,
    clearAllSignatures,
    signatureStatus, canApprove,
    employerStampUrl, employeeStampUrl,
    previewRef, generating,
    existingContract, existingLoading,
    extendModalOpen, setExtendModalOpen,
    extendMonths, setExtendMonths,
    hireDateReference,
    cardCollapsed, toggleCard, isCardCollapsed,
    wageHourlyOverride, setWageHourlyOverride,
    dependentsCount, setDependentsCount,
    withholdingRate, setWithholdingRate,
    childrenCount, setChildrenCount,
    extraDeduction, setExtraDeduction,
    addrModalOpen, setAddrModalOpen,
    weeklyDays, weeklyWeekdayDays, weeklyWeekendDays, workDaysSummary,
    toggleDay, monthlyCalc,
    applyMonthlyHoursToBasic,
    jobCategories,
    onSelectEmployee,
    handleExtendConfirm, handleReset, handleComplete, handleApproveAndSave,
  };
}
