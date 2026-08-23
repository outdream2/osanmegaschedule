// src/components/ContractWriterPage/ContractLeftForm.tsx
// 2026-08-23 · #framework-4 · leftFormNode 분리 · ContractWriterPage.tsx 슬림화

import React from "react";
import {
  User, ClipboardText, CalendarBlank, ClockClockwise, Money,
  Coffee, Notepad, DownloadSimple, Warning, CaretDown, X as XIcon,
} from "@phosphor-icons/react";
import type { ContractForm, DayKey, CardKey } from "./types";
import {
  DAYS, CONTRACT_TYPES, START_TIMES, END_TIMES,
  BANK_LIST, BREAK_TIME_OPTIONS, INSURANCE_RATES,
} from "./constants";
import {
  WAGE_HOURS, WAGE_DIVISOR,
  computeIncomeTax, computeWageFlow, isMonthlyWageType, fmtWon,
} from "./wageCalc";
import { SelectOrCustom } from "./subcomponents";
import { EmployeeInfoForm } from "../common/EmployeeInfoForm";
import { AddressSearchModal } from "../common/features/AddressSearchModal";
import { Card } from "../common/Card";
import { IconTile } from "../common/IconTile";
import { matchHangul } from "../../lib/hangulSearch";
import { TIMING } from "../../constants/timing";
import { MIN_WAGE_2026 } from "../../lib/payroll";
import { calcWageBase } from "../../lib/wageCalc";
import type { Employee } from "../../types";
import type { ContractCategory } from "../../lib/contract";
import type { WithholdingRate } from "../../lib/payroll";
import { WITHHOLDING_RATES } from "../../lib/payroll";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ContractLeftFormProps {
  form: ContractForm;
  upd: <K extends keyof ContractForm>(key: K, val: ContractForm[K]) => void;
  setForm: React.Dispatch<React.SetStateAction<ContractForm>>;
  setNotice: (n: { tone: "ok" | "err"; text: string } | null) => void;

  // 작성 모드
  writeMode: "form" | "upload";
  setWriteMode: (m: "form" | "upload") => void;

  // PDF 업로드 모드
  uploadFile: File | null;
  setUploadFile: (f: File | null) => void;
  uploadBusy: boolean;
  uploadInputRef: React.RefObject<HTMLInputElement | null>;
  handleUploadContract: () => void;

  // 직원 검색
  employees: Employee[];
  empLoading: boolean;
  empError: string | null;
  empSearchOpen: boolean;
  setEmpSearchOpen: (v: boolean) => void;
  onSelectEmployee: (empIdRaw: string) => void;

  // 카드 접기
  toggleCard: (key: CardKey) => void;
  isCardCollapsed: (key: CardKey) => boolean;

  // 주소 검색 모달
  addrModalOpen: boolean;
  setAddrModalOpen: (v: boolean) => void;

  // 근무일/시간 파생값
  weeklyDays: number;
  weeklyWeekdayDays: number;
  weeklyWeekendDays: number;
  toggleDay: (d: DayKey) => void;
  monthlyCalc: { dailyMinutes: number; monthlyHoursInt: number; monthlyMinutesRem: number } | null;

  // 직군
  jobCategories: ContractCategory[];

  // 임금 계산 보조
  wageHourlyOverride: number | null;
  setWageHourlyOverride: (v: number | null) => void;
  dependentsCount: number;
  setDependentsCount: (v: number) => void;
  withholdingRate: WithholdingRate;
  setWithholdingRate: (v: WithholdingRate) => void;
  childrenCount: number;
  setChildrenCount: (v: number) => void;
  extraDeduction: number;
  setExtraDeduction: (v: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────

const ContractLeftForm: React.FC<ContractLeftFormProps> = ({
  form, upd, setForm, setNotice,
  writeMode, setWriteMode,
  uploadFile, setUploadFile, uploadBusy, uploadInputRef, handleUploadContract,
  employees, empLoading, empError, empSearchOpen, setEmpSearchOpen, onSelectEmployee,
  toggleCard, isCardCollapsed,
  addrModalOpen, setAddrModalOpen,
  weeklyDays, weeklyWeekdayDays, weeklyWeekendDays, toggleDay, monthlyCalc,
  jobCategories,
  wageHourlyOverride, setWageHourlyOverride,
  dependentsCount, setDependentsCount,
  withholdingRate, setWithholdingRate,
  childrenCount, setChildrenCount,
  extraDeduction, setExtraDeduction,
}) => {
  // 스타일 토큰
  const fldInput = "w-full bg-white border border-line rounded-lg px-3 py-2 text-[15px] text-zinc-800 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-tint/60 focus:border-brand-deep transition placeholder:text-zinc-400 placeholder:font-normal";
  const fldLabel = "block text-[10.5px] font-bold uppercase tracking-wider text-zinc-500 mb-1";
  const cardBase = "rounded-xl border border-line bg-white p-3 flex flex-col gap-3 shadow-sm";
  const cardInner = "rounded-lg border border-zinc-100 bg-zinc-50/60 p-2.5 flex flex-col gap-2";
  const cardGroupLabel = "text-[14px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5 mb-0.5";

  return (
    <section className="bg-zinc-50 flex flex-col gap-3 h-full overflow-y-auto p-0.5">

      {/* ── T-R (2026-08-05) · 작성 방식 토글 ── */}
      <Card padding="none" className="p-2">
        <div className="grid grid-cols-2 gap-1">
          {([
            { key: "form" as const,   label: "여기서 작성", desc: "폼 입력 → 미리보기 → PDF 생성" },
            { key: "upload" as const, label: "PDF 업로드",  desc: "이미 작성된 PDF 를 Drive 에 저장" },
          ]).map(m => {
            const active = writeMode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setWriteMode(m.key)}
                className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
                  active
                    ? "bg-indigo-50 border-indigo-400 shadow-sm"
                    : "bg-white border-line hover:bg-zinc-50"
                }`}
              >
                <span className={`text-[14px] font-bold ${active ? "text-indigo-700" : "text-zinc-600"}`}>
                  {m.label}
                </span>
                <span className={`text-[14px] font-semibold ${active ? "text-zinc-600" : "text-zinc-400"}`}>
                  {m.desc}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ── T-R · PDF 업로드 모드 ── */}
      {writeMode === "upload" && (
        <div className={cardBase}>
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-100">
            <IconTile icon={<DownloadSimple size={13} weight="fill" />} tone="indigo" size="sm" />
            <span className="text-[14px] font-bold text-zinc-700">PDF 업로드 (Google Drive)</span>
          </div>

          <div className="rounded-lg border border-indigo-100 bg-indigo-50/30 px-3 py-2 text-[15px] text-zinc-600 leading-relaxed">
            이미 작성한 근로계약서 PDF 를 선택 후 [Google Drive 업로드] 를 누르세요. <br />
            · 저장 위치: Google Drive · <b>contract</b> 폴더 <br />
            · 이력: employee_contracts 테이블 · 링크 (Drive URL) 로 저장 <br />
            · 하단 근로자 정보 · 계약 유형 · 기간 · 입력 후 업로드 필수
          </div>

          {/* 근로자 기본 정보 · 업로드 필수 필드 */}
          <div className={cardInner}>
            <div className={cardGroupLabel}>
              <User size={10} weight="bold" />
              근로자 기본 정보 (업로드용)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 relative">
                <label className={fldLabel}>성명 *</label>
                <input
                  type="text"
                  value={form.employeeName}
                  onChange={(e) => {
                    const val = e.target.value;
                    upd("employeeName", val);
                    setEmpSearchOpen(true);
                    if (form.employeeId != null) upd("employeeId", null);
                  }}
                  onFocus={() => setEmpSearchOpen(true)}
                  onBlur={() => setTimeout(() => setEmpSearchOpen(false), TIMING.DEBOUNCE_INPUT)}
                  placeholder={empLoading ? "직원 불러오는 중..." : "성명 입력 또는 검색"}
                  autoComplete="off"
                  className={fldInput}
                />
                {empSearchOpen && (() => {
                  const q = form.employeeName.trim();
                  const matches = q
                    ? employees.filter(e => matchHangul(e.name ?? "", q)).slice(0, 8)
                    : employees.slice(0, 8);
                  if (matches.length === 0) return (
                    <Card variant="raw-lg" padding="none" className="absolute left-0 right-0 top-full mt-1 z-30 p-2.5 text-[14px] text-zinc-400 text-center">
                      일치하는 직원 없음 · 직접 입력
                    </Card>
                  );
                  return (
                    <ul className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-line rounded-xl shadow-lg max-h-52 overflow-y-auto divide-y divide-zinc-100">
                      {matches.map(e => (
                        <li key={e.id}>
                          <button
                            type="button"
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => { onSelectEmployee(String(e.id)); setEmpSearchOpen(false); }}
                            className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors flex items-center gap-2"
                          >
                            <span className="text-[15px] font-bold text-zinc-800">{e.name}</span>
                            {e.position && <span className="text-[15px] text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded-md">{e.position}</span>}
                            {e.phone && <span className="text-[15px] text-zinc-400 ml-auto tabular-nums">{e.phone}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </div>
              <div>
                <label className={fldLabel}>계약 유형</label>
                <SelectOrCustom value={form.contractType} options={CONTRACT_TYPES} onChange={(v) => upd("contractType", v)} placeholder="예: 프리랜서" />
              </div>
              <div>
                <label className={fldLabel}>시작일</label>
                <input type="date" value={form.startDate} onChange={(e) => upd("startDate", e.target.value)}
                  className={fldInput}
                />
              </div>
              {!form.indefinite && (
                <div className="col-span-2">
                  <label className={fldLabel}>종료일</label>
                  <input type="date" value={form.endDate} onChange={(e) => upd("endDate", e.target.value)}
                    className={fldInput}
                  />
                </div>
              )}
              <label className="col-span-2 inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.indefinite} onChange={(e) => upd("indefinite", e.target.checked)}
                  className="w-4 h-4 rounded accent-indigo-600" />
                <span className="text-[14px] font-semibold text-zinc-700">무기한 (정규직) · 종료일 없음</span>
              </label>
            </div>
          </div>

          {/* 파일 선택 */}
          <div className={cardInner}>
            <div className={cardGroupLabel}>PDF 파일 선택</div>
            <input
              ref={uploadInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="w-full text-[14px] text-zinc-700 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[14px] file:font-bold file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200 file:cursor-pointer cursor-pointer"
            />
            {uploadFile && (
              <Card variant="flat" rounded="lg" padding="none" className="mt-1 flex items-center gap-2 text-[15px] text-zinc-600 px-2 py-1.5">
                <ClipboardText size={12} weight="fill" className="text-indigo-500 shrink-0" />
                <span className="truncate flex-1 font-semibold">{uploadFile.name}</span>
                <span className="tabular-nums text-[14px] text-zinc-400 shrink-0">
                  {(uploadFile.size / 1024).toFixed(1)} KB
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setUploadFile(null);
                    if (uploadInputRef.current) uploadInputRef.current.value = "";
                  }}
                  className="text-rose-500 hover:text-rose-700 shrink-0 cursor-pointer"
                  title="선택 취소"
                >
                  <XIcon size={11} weight="bold" />
                </button>
              </Card>
            )}
          </div>

          {/* 업로드 버튼 */}
          <button
            type="button"
            onClick={handleUploadContract}
            disabled={!uploadFile || uploadBusy || !form.employeeName.trim()}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-[15px] font-bold shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed ${
              uploadFile && !uploadBusy && form.employeeName.trim()
                ? "bg-brand-deep hover:brightness-110"
                : "bg-zinc-300 text-zinc-500"
            }`}
            title="Google Drive contract 폴더에 저장 · employee_contracts 이력 insert"
          >
            <DownloadSimple size={13} weight="bold" className="rotate-180" />
            {uploadBusy ? "업로드 중..." : "Google Drive 업로드"}
          </button>
        </div>
      )}

      {/* ── T-R · 여기서 작성 모드 · 기존 폼 전체 ── */}
      {writeMode === "form" && (<>

      {/* ═══════════════════════════════════════════════════
          카드 1 · 근로자 정보 (collapsible · T-W)
      ═══════════════════════════════════════════════════ */}
      <div className={cardBase}>
        {/* 카드 헤더 (클릭 · 접기/펴기) */}
        <button
          type="button"
          onClick={() => toggleCard("employee")}
          className="flex items-center gap-2 pb-2 border-b border-zinc-100 cursor-pointer hover:opacity-80 transition-opacity w-full text-left"
          aria-expanded={!isCardCollapsed("employee")}
        >
          <CaretDown size={11} weight="bold" className={`text-zinc-400 transition-transform shrink-0 ${isCardCollapsed("employee") ? "-rotate-90" : ""}`} />
          <IconTile icon={<User size={13} weight="fill" />} tone="violet" size="sm" />
          <span className="text-[14px] font-bold text-zinc-700">근로자 정보</span>
        </button>

        {!isCardCollapsed("employee") && (<>

        {empError && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-1.5 text-[14px] text-rose-700 font-semibold">
            {empError}
          </div>
        )}

        {/* 그룹 A · 기본 식별 */}
        <div className={cardInner}>
          <div className={cardGroupLabel}>
            <User size={10} weight="bold" />
            기본 정보
          </div>
          <EmployeeInfoForm
            layout="compact"
            fields={["name", "employeeNumber", "birthDate", "gender", "rank", "workplace"]}
            values={{
              name:           form.employeeName,
              employeeNumber: form.employeeNumber,
              birthDate:      form.employeeBirth,
              gender:         form.employeeGender,
              rank:           form.employeeRank,
              workplace:      form.employeeWorkplace,
            }}
            onChange={(v) => {
              if (v.name           !== undefined) { upd("employeeName",   v.name);      setEmpSearchOpen(true); if (form.employeeId != null) upd("employeeId", null); }
              if (v.employeeNumber !== undefined) upd("employeeNumber",   v.employeeNumber);
              if (v.birthDate      !== undefined) upd("employeeBirth",    v.birthDate);
              if (v.gender         !== undefined) upd("employeeGender",   v.gender);
              if (v.rank           !== undefined) upd("employeeRank",     v.rank);
              if (v.workplace      !== undefined) upd("employeeWorkplace", v.workplace);
            }}
            employees={employees}
            empLoading={empLoading}
            onSelectEmployee={(emp) => { onSelectEmployee(String(emp.id)); setEmpSearchOpen(false); }}
          />

          {/* 우선업무 */}
          {(form.employeeCategory === "매장" || form.employeeCategory === "창고") && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-2.5 py-2 flex flex-wrap items-center gap-2">
              <span className="text-[10.5px] font-bold text-indigo-700 shrink-0">우선업무</span>
              <div className="flex items-center gap-1">
                {(["매장", "창고"] as const).map(f => {
                  const active = form.primaryFocus === f;
                  const activeCls = f === "매장" ? "bg-emerald-500 text-white border-emerald-600" : "bg-orange-500 text-white border-orange-600";
                  return (
                    <button key={f} type="button" onClick={() => upd("primaryFocus", active ? null : f)}
                      className={`px-2.5 py-1 rounded-md border text-[11.5px] font-bold transition-colors cursor-pointer ${
                        active ? activeCls : "bg-white border-line text-zinc-600 hover:border-zinc-300"
                      }`}
                    >{f}</button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1 ml-auto">
                <input type="number" min={0} max={100} value={form.primaryFocusPercent}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    upd("primaryFocusPercent", Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 70);
                  }}
                  disabled={form.primaryFocus == null}
                  className="w-14 bg-white border border-line rounded-lg px-2 py-1 text-[14px] text-zinc-800 font-bold text-right focus:outline-none focus:ring-2 focus:ring-brand-tint/60 focus:border-brand-deep transition disabled:bg-zinc-100 disabled:text-zinc-400"
                />
                <span className="text-[15px] text-indigo-700 font-bold">%</span>
              </div>
            </div>
          )}
        </div>

        {/* 그룹 B · 연락처 · 금융 통합 */}
        <div className={cardInner}>
          <div className={cardGroupLabel}>연락처 · 금융</div>
          <EmployeeInfoForm
            layout="compact"
            fields={["phone", "email", "address"]}
            values={{
              phone:   form.employeePhone,
              email:   form.employeeEmail,
              address: form.employeeAddress,
            }}
            onChange={(v) => {
              if (v.phone   !== undefined) upd("employeePhone",   v.phone);
              if (v.email   !== undefined) upd("employeeEmail",   v.email);
              if (v.address !== undefined) upd("employeeAddress", v.address);
            }}
            onAddressSearch={() => setAddrModalOpen(true)}
          />
          <AddressSearchModal
            open={addrModalOpen}
            onClose={() => setAddrModalOpen(false)}
            onSelect={(data) => upd("employeeAddress", data.formatted)}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 grid grid-cols-[90px_1fr_auto] gap-2 items-end">
              <div>
                <label className={fldLabel}>은행</label>
                <select
                  value={form.bankName}
                  onChange={(e) => {
                    const v = e.target.value;
                    upd("bankName", v);
                    const acct = form.bankAccountNumber;
                    upd("employeeBankAccount", [v, acct].filter(Boolean).join(" ").trim());
                  }}
                  className="w-full bg-white border border-line rounded-lg px-2 py-2 text-[15px] text-zinc-800 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-tint/60 focus:border-brand-deep transition cursor-pointer"
                >
                  <option value="">선택</option>
                  {BANK_LIST.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className={fldLabel}>계좌번호</label>
                <input
                  type="text"
                  value={form.bankAccountNumber}
                  onChange={(e) => {
                    const v = e.target.value;
                    upd("bankAccountNumber", v);
                    upd("employeeBankAccount", [form.bankName, v].filter(Boolean).join(" ").trim());
                  }}
                  placeholder="3333-12-3456789"
                  className={fldInput}
                />
              </div>
              <div className="shrink-0">
                <label className={fldLabel}>통장사본</label>
                <label
                  className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border font-bold text-[11.5px] transition-colors cursor-pointer ${
                    form.bankbookImageUrl
                      ? "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                      : "bg-white border-line text-zinc-600 hover:bg-zinc-50"
                  }`}
                  title={form.bankbookImageUrl ? "다시 업로드하려면 클릭" : "통장사본 이미지 업로드 (jpg/png)"}
                >
                  <DownloadSimple size={12} weight="bold" className="rotate-180" />
                  {form.bankbookImageUrl ? "업로드됨" : "파일 선택"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 5 * 1024 * 1024) {
                        setNotice({ tone: "err", text: `파일 크기 초과 (${(f.size / 1024 / 1024).toFixed(1)}MB > 5MB)` });
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        const url = String(reader.result || "");
                        upd("bankbookImageUrl", url);
                        setNotice({ tone: "ok", text: `통장사본이 첨부되었습니다 (${(f.size / 1024).toFixed(0)}KB)` });
                      };
                      reader.onerror = () => {
                        setNotice({ tone: "err", text: "통장사본 읽기 실패" });
                      };
                      reader.readAsDataURL(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {form.bankbookImageUrl && (
                <div className="col-span-3 flex items-center gap-2 mt-1">
                  <img
                    src={form.bankbookImageUrl}
                    alt="통장사본"
                    className="h-14 border border-line rounded-md object-contain bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => upd("bankbookImageUrl", "")}
                    className="text-[15px] font-bold text-rose-500 hover:text-rose-700 cursor-pointer"
                    title="첨부한 통장사본 제거"
                  >
                    ✕ 제거
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        </>)}
      </div>
      {/* /카드 1 */}

      {/* ═══════════════════════════════════════════════════
          카드 2 · 근무조건 (T-S 통합 · 계약유형 + 근무요일 + 근무시간 + 휴게)
      ═══════════════════════════════════════════════════ */}
      <div className={cardBase}>
        <div className="flex items-center gap-2 pb-2 border-b border-zinc-100">
          <button
            type="button"
            onClick={() => toggleCard("workCondition")}
            className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity text-left"
            aria-expanded={!isCardCollapsed("workCondition")}
          >
            <CaretDown size={11} weight="bold" className={`text-zinc-400 transition-transform shrink-0 ${isCardCollapsed("workCondition") ? "-rotate-90" : ""}`} />
            <IconTile icon={<ClipboardText size={13} weight="fill" />} tone="indigo" size="sm" />
            <span className="text-[14px] font-bold text-zinc-700">근무조건 입력</span>
          </button>
        </div>

        {!isCardCollapsed("workCondition") && (<>

        {/* 0행 · 직군 */}
        <div>
          <label className={fldLabel}>직군</label>
          <div className="flex gap-1">
            {jobCategories.map(cat => {
              const active = form.employeeCategory === cat;
              const activeCls =
                cat === "약사"  ? "bg-violet-500 text-white border-violet-500" :
                cat === "매장"  ? "bg-emerald-500 text-white border-emerald-500" :
                cat === "창고"  ? "bg-orange-500 text-white border-orange-500" :
                                  "bg-zinc-600 text-white border-zinc-600";
              return (
                <button key={cat} type="button" onClick={() => upd("employeeCategory", cat)}
                  className={`flex-1 min-w-[36px] py-1.5 rounded-lg border text-[11.5px] font-bold transition-colors cursor-pointer ${
                    active ? activeCls : "bg-white border-line text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
                  }`}
                >{cat}</button>
              );
            })}
          </div>
        </div>

        {/* 1행 · 계약 유형 + 연차 · 근무 요일 */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-start">
          <div>
            <label className={fldLabel}>계약 유형</label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <SelectOrCustom value={form.contractType} options={CONTRACT_TYPES} onChange={(v) => upd("contractType", v)} placeholder="예: 프리랜서" />
              </div>
              <div className="shrink-0 w-[100px]">
                <div className="relative">
                  <input type="number" min={0} value={form.annualLeaveDays} onChange={(e) => upd("annualLeaveDays", e.target.value)}
                    placeholder="15"
                    title="연차 일수"
                    className="w-full bg-white border border-line rounded-lg pl-2 pr-10 py-1.5 text-[15px] text-zinc-800 font-semibold text-right focus:outline-none focus:ring-2 focus:ring-brand-tint/60 focus:border-brand-deep transition"
                  />
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9.5px] text-zinc-400 font-semibold pointer-events-none leading-tight">일/연차</span>
                </div>
              </div>
            </div>
            {form.contractType === "계약직" && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10.5px] text-zinc-400 font-semibold shrink-0">계약 기간</span>
                <div className="flex-1">
                  <SelectOrCustom value={form.contractMonths} options={["2", "3", "6", "12"]} onChange={(v) => upd("contractMonths", v)} placeholder="예: 9" suffix="개월" />
                </div>
              </div>
            )}
          </div>

          {/* 근무 요일 */}
          <div>
            <label className={fldLabel}>
              근무 요일 <span className="text-indigo-600 font-bold">주{weeklyDays}일</span>
              <span className="text-zinc-400 font-semibold normal-case tracking-normal ml-1">
                (주중 {weeklyWeekdayDays}일 · 주말 {weeklyWeekendDays}일)
              </span>
            </label>
            <div className="flex flex-wrap gap-1">
              {DAYS.map(d => {
                const on = form.workDays[d];
                const isWeekend = d === "토" || d === "일";
                return (
                  <button key={d} type="button" onClick={() => toggleDay(d)}
                    className={[
                      "w-7 h-7 rounded-md text-[11.5px] font-bold transition-colors cursor-pointer border",
                      on
                        ? isWeekend
                          ? "bg-rose-500 text-white border-rose-600 shadow-sm"
                          : "bg-brand-deep text-white border-indigo-600 shadow-sm"
                        : "bg-white text-zinc-500 border-line hover:bg-zinc-50 hover:border-zinc-300",
                    ].join(" ")}
                  >{d}</button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 계약기간·담당업무·보험 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className={cardInner}>
            <div className="flex items-center justify-between mb-0.5">
              <div className={cardGroupLabel}><CalendarBlank size={10} weight="bold" /> 계약 기간</div>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.indefinite} onChange={(e) => upd("indefinite", e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-indigo-600" />
                <span className="text-[15px] font-semibold text-zinc-600">무기한</span>
              </label>
            </div>
            <div className={`grid gap-2 ${form.indefinite ? "grid-cols-2" : "grid-cols-3"}`}>
              <div>
                <label className={fldLabel}>근무 시작일</label>
                <input type="date" value={form.startDate} onChange={(e) => upd("startDate", e.target.value)} className={fldInput} />
              </div>
              <div>
                <label className={fldLabel}>계약 체결일</label>
                <input type="date" value={form.contractSignDate} onChange={(e) => upd("contractSignDate", e.target.value)} className={fldInput} />
              </div>
              {!form.indefinite && (
                <div>
                  <label className={fldLabel}>계약 종료일</label>
                  <input type="date" value={form.endDate} onChange={(e) => upd("endDate", e.target.value)} className={fldInput} />
                </div>
              )}
            </div>
          </div>
          <div className={cardInner}>
            <div className={cardGroupLabel}>담당업무 · 보험</div>
            <input type="text" value={form.jobDuty} onChange={(e) => upd("jobDuty", e.target.value)}
              placeholder="예: 약국 카운터 · OTC 판매 · 재고 관리" className={fldInput}
            />
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.socialInsurance} onChange={(e) => upd("socialInsurance", e.target.checked)}
                className="w-4 h-4 rounded accent-indigo-600" />
              <span className="text-[14px] font-semibold text-zinc-700">4대보험 가입</span>
              <span className="text-[10.5px] text-zinc-400 font-semibold ml-1">고용·산재·국민연금·건강보험</span>
            </label>
          </div>
        </div>

        {/* 출근·퇴근·휴게 */}
        <div className="flex flex-wrap items-end gap-2 lg:flex-nowrap">
          <div className="flex-1 min-w-[80px]">
            <label className={fldLabel}>
              <ClockClockwise size={10} className="inline mr-0.5 text-emerald-600" />출근
            </label>
            <SelectOrCustom value={form.startTime} options={START_TIMES} onChange={(v) => upd("startTime", v)} placeholder="HH:MM" />
          </div>
          <div className="flex-1 min-w-[80px]">
            <label className={fldLabel}>퇴근</label>
            <SelectOrCustom value={form.endTime} options={END_TIMES} onChange={(v) => upd("endTime", v)} placeholder="HH:MM" />
          </div>
          <div className="flex-1 min-w-[64px] max-w-[80px]">
            <label className={fldLabel}>
              <Coffee size={10} className="inline mr-0.5" />휴게(분)
            </label>
            <div className="relative">
              <input type="number" min={0} value={form.breakMinutes} onChange={(e) => upd("breakMinutes", e.target.value)}
                className="w-full bg-white border border-line rounded-lg pl-2 pr-5 py-1.5 text-[15px] text-zinc-800 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-tint/60 focus:border-brand-deep transition text-right"
              />
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[14px] text-zinc-400 font-semibold pointer-events-none">분</span>
            </div>
          </div>
          <div className="flex-1 min-w-[80px]">
            <label className={fldLabel}>휴게시작</label>
            <select
              value={form.breakStart}
              onChange={(e) => upd("breakStart", e.target.value)}
              className="w-full bg-white border border-line rounded-lg px-2 py-1.5 text-[15px] text-zinc-700 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-tint/60 focus:border-brand-deep transition cursor-pointer"
            >
              {BREAK_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[80px]">
            <label className={fldLabel}>휴게종료</label>
            <select
              value={form.breakEnd}
              onChange={(e) => upd("breakEnd", e.target.value)}
              className="w-full bg-white border border-line rounded-lg px-2 py-1.5 text-[15px] text-zinc-700 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-tint/60 focus:border-brand-deep transition cursor-pointer"
            >
              {BREAK_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* 4행 · 근무조건 자동 계산 힌트 + Bottom-up 역산 미리보기 */}
        {(() => {
          if (!monthlyCalc) return (
            <p className="text-[15px] text-zinc-400 font-semibold text-center pt-0.5">
              근무조건을 입력하면 임금이 자동 계산됩니다
            </p>
          );
          const dailyH = monthlyCalc.dailyMinutes / 60;
          if (dailyH <= 0) return (
            <p className="text-[15px] text-zinc-400 font-semibold text-center pt-0.5">
              근무조건을 입력하면 임금이 자동 계산됩니다
            </p>
          );
          const weeklyH = dailyH * weeklyDays;
          const wdHourly = Number(form.weekdayHourly) || 0;
          const weHourly = Number(form.weekendHourly) || wdHourly;
          const weeklyWdH = dailyH * weeklyWeekdayDays;
          const weeklyWeH = dailyH * weeklyWeekendDays;
          const weeklyPay = Math.round(weeklyWdH * wdHourly + weeklyWeH * weHourly);
          const monthlyNet = Math.round(weeklyPay * 4.345);
          const hasWage = wdHourly > 0;
          const isMonthly = isMonthlyWageType(form.contractType);
          const _annualH = WAGE_HOURS.ANNUAL_LEAVE;
          const _base = (weeklyWeekdayDays > 0)
            ? calcWageBase(dailyH, weeklyWeekdayDays, weeklyWeekendDays)
            : null;
          const _basicH  = _base ? _base.monthlyBasicH          : WAGE_HOURS.BASIC;
          const _otH     = _base ? _base.monthlyOvertimeGainedH  : WAGE_HOURS.OVERTIME;
          const _holH    = _base ? _base.monthlyHolidayGainedH   : WAGE_HOURS.HOLIDAY;
          const wf = hasWage
            ? computeWageFlow(
                form.contractType,
                wdHourly, weHourly,
                dailyH * weeklyWeekdayDays, dailyH * weeklyWeekendDays,
                _basicH, _otH, _holH, _annualH,
              )
            : null;
          const buMonthlyNet = wf?.monthlyNet ?? 0;
          const wdH = dailyH * weeklyWeekdayDays;
          const weH = dailyH * weeklyWeekendDays;
          const hasDual = weeklyWeekendDays > 0 && weHourly !== wdHourly;

          return (
            <div className="flex flex-col gap-1.5">
              {/* T-CTR-Wage-Header-3Lines · 계산식 명시 3행 헤더 · 월급제·시급제 공통 */}
              <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 px-3 py-2 text-[15px] text-indigo-700 leading-relaxed flex flex-col gap-1">
                {/* 행0 · 주 시간 + 계약유형 배지 (항상 표시) */}
                <div className="flex items-center flex-wrap gap-x-1.5">
                  <span className="font-bold text-indigo-900">주 {weeklyH.toFixed(1)}시간</span>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[15px] font-bold uppercase tracking-wide ${isMonthly ? "bg-indigo-200 text-indigo-800" : "bg-amber-200 text-amber-800"}`}>
                    {isMonthly ? "월급제" : "시급제"}
                  </span>
                  {!hasWage && (
                    <span className="text-indigo-400">(시급 입력 시 계산식 표시)</span>
                  )}
                </div>

                {hasWage && (() => {
                  // 2026-08-07 · 월급제·시급제 공통 · (시급 × 주시간) × 4.345 = 희망 월 수령액 (한 줄)
                  return (
                    <div className="flex flex-col gap-0.5 border-t border-indigo-100 pt-1">
                      {/* 1행: (시급 × 주시간 [+주말시급×주말시간]) × 4.345 = 희망 월 수령액 */}
                      <div className="flex items-center flex-wrap gap-x-1">
                        {hasDual ? (
                          <>
                            <span className="text-zinc-500 text-[14px]">주중</span>
                            <span className="tabular-nums font-bold text-zinc-700">{fmtWon(wdHourly)}원</span>
                            <span className="text-zinc-400">×</span>
                            <span className="tabular-nums text-zinc-600">{wdH.toFixed(1)}h</span>
                            <span className="text-zinc-400">+</span>
                            <span className="text-zinc-500 text-[14px]">주말</span>
                            <span className="tabular-nums font-bold text-zinc-700">{fmtWon(weHourly)}원</span>
                            <span className="text-zinc-400">×</span>
                            <span className="tabular-nums text-zinc-600">{weH.toFixed(1)}h</span>
                          </>
                        ) : (
                          <>
                            <span className="text-zinc-500 text-[14px]">시급</span>
                            <span className="tabular-nums font-bold text-zinc-700">{fmtWon(wdHourly)}원</span>
                            <span className="text-zinc-400">×</span>
                            <span className="tabular-nums text-zinc-600">{weeklyH.toFixed(1)}h</span>
                          </>
                        )}
                        <span className="text-zinc-400">×</span>
                        <span className="text-zinc-600">4.345</span>
                        <span className="text-zinc-400">=</span>
                        <span className="tabular-nums font-bold text-emerald-700">{fmtWon(buMonthlyNet)}원</span>
                        <span className="text-[9.5px] text-zinc-400 bg-emerald-100 px-1 rounded">(희망 월 수령액)</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

            </div>
          );
        })()}
        {/* 추가 특약 */}
        <div>
          <label className={fldLabel}>
            <Notepad size={10} weight="fill" className="inline mr-0.5" />추가 특약 (선택)
          </label>
          <textarea value={form.additionalContent} onChange={(e) => upd("additionalContent", e.target.value)} rows={2}
            placeholder="예: 수습기간 3개월 · 명절 상여 별도"
            className="w-full bg-white border border-line rounded-lg px-3 py-2 text-[12.5px] text-zinc-800 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-tint/60 focus:border-brand-deep transition resize-y placeholder:text-zinc-400 placeholder:font-normal"
          />
        </div>
        </>)}
      </div>
      {/* /카드 2 */}

      {/* ═══════════════════════════════════════════════════
          카드 3 · 임금 계산 · T-V
      ═══════════════════════════════════════════════════ */}
      <div className="rounded-xl border border-emerald-200 bg-white p-3 flex flex-col gap-3 shadow-sm">
        <div className="flex items-center gap-2 pb-2 border-b border-emerald-100">
          <button
            type="button"
            onClick={() => toggleCard("wage")}
            className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity text-left"
            aria-expanded={!isCardCollapsed("wage")}
          >
            <CaretDown size={11} weight="bold" className={`text-zinc-400 transition-transform shrink-0 ${isCardCollapsed("wage") ? "-rotate-90" : ""}`} />
            <IconTile icon={<Money size={13} weight="fill" />} tone="emerald" size="sm" />
            <span className="text-[14px] font-bold text-zinc-700">임금구성표 산출</span>
          </button>
        </div>

        {!isCardCollapsed("wage") && (<>

        {/* 최저임금 경고 */}
        {(() => {
          const wdRaw = Number(form.weekdayHourly);
          const wd = Number.isFinite(wdRaw) && wdRaw > 0 ? wdRaw : 0;
          if (!(wd > 0 && wd < MIN_WAGE_2026)) return null;
          return (
            <div className="rounded-md bg-rose-50 border border-rose-300 px-2 py-1.5 flex items-center gap-1.5">
              <Warning size={12} weight="fill" className="text-rose-600 shrink-0" />
              <span className="text-[10.5px] font-bold text-rose-700">
                최저임금 위반 위험 · 통상시급 <span className="tabular-nums">{fmtWon(wd)}</span> 원 &lt; 2026 최저 <span className="tabular-nums">{fmtWon(MIN_WAGE_2026)}</span> 원
              </span>
            </div>
          );
        })()}

        {/* 임금구성표 */}
        {(() => {
          const dailyH = monthlyCalc ? monthlyCalc.dailyMinutes / 60 : 0;
          const wd = Number(form.weekdayHourly) || 0;
          const we = Number(form.weekendHourly) || wd;
          const wdH = dailyH * weeklyWeekdayDays;
          const weH = dailyH * weeklyWeekendDays;
          const weeklyPay = Math.round(wdH * wd + weH * we);
          const autoMonthlyNet = Math.round(weeklyPay * 4.345);

          const autoHourly = (() => {
            const target = autoMonthlyNet;
            if (target <= 0) return Math.round(wd * 10) / 10;
            const extrasAuto = (Number(form.wageComponents.fixedHolidayOvertime?.amount) || 0)
                             + (Number(form.wageComponents.fixedNight?.amount) || 0)
                             + (Number(form.wageComponents.mealAllowance) || 0)
                             + (Number(form.wageComponents.vehicleAllowance) || 0);
            let h = wd > 0 ? wd : 25000;
            for (let i = 0; i < 12; i++) {
              const basic = h * WAGE_HOURS.BASIC;
              const g = h * WAGE_DIVISOR + extrasAuto;
              const p  = basic * INSURANCE_RATES.PENSION;
              const hh = basic * INSURANCE_RATES.HEALTH;
              const lt = hh * INSURANCE_RATES.LTC_RATIO;
              const em = basic * INSURANCE_RATES.EMPLOYMENT;
              const insSumH = p + hh + lt + em;
              const tx = computeIncomeTax(Math.round(basic), dependentsCount, withholdingRate, childrenCount, extraDeduction);
              const dedH = insSumH + tx.total;
              const net = g - dedH;
              const delta = target - net;
              if (Math.abs(delta) < 50) break;
              h += delta / WAGE_DIVISOR * 0.85;
              if (h < 0) h = 0;
            }
            return Math.round(h * 10) / 10;
          })();

          const hourly = wageHourlyOverride != null && wageHourlyOverride > 0
            ? Math.round(wageHourlyOverride * 10) / 10
            : autoHourly;

          const applyHopeMatch = () => {
            const target = autoMonthlyNet;
            if (target <= 0) return;
            const extras0 = (Number(form.wageComponents.fixedHolidayOvertime?.amount) || 0)
                          + (Number(form.wageComponents.fixedNight?.amount) || 0)
                          + (Number(form.wageComponents.mealAllowance) || 0)
                          + (Number(form.wageComponents.vehicleAllowance) || 0);
            let h = wd > 0 ? wd : 25000;
            for (let i = 0; i < 12; i++) {
              const basic = h * WAGE_HOURS.BASIC;
              const g = h * WAGE_DIVISOR + extras0;
              const p  = basic * INSURANCE_RATES.PENSION;
              const hh = basic * INSURANCE_RATES.HEALTH;
              const lt = hh * INSURANCE_RATES.LTC_RATIO;
              const em = basic * INSURANCE_RATES.EMPLOYMENT;
              const insSumH = p + hh + lt + em;
              const tx = computeIncomeTax(Math.round(basic), dependentsCount, withholdingRate, childrenCount, extraDeduction);
              const dedH = insSumH + tx.total;
              const net = g - dedH;
              const delta = target - net;
              if (Math.abs(delta) < 50) break;
              h += delta / WAGE_DIVISOR;
              if (h < 0) h = 0;
            }
            setWageHourlyOverride(Math.round(h * 10) / 10);
          };

          if (hourly <= 0) {
            return (
              <div className="rounded-lg border border-line bg-zinc-50 px-3 py-4 text-center text-[15px] text-zinc-500 font-semibold">
                시급 입력 시 · 임금구성표 자동 산출
              </div>
            );
          }

          const basicAmt    = Math.round(hourly * WAGE_HOURS.BASIC);
          const overtimeAmt = Math.round(hourly * WAGE_HOURS.OVERTIME);
          const holidayAmt  = Math.round(hourly * WAGE_HOURS.HOLIDAY);
          const annualAmt   = Math.round(hourly * WAGE_HOURS.ANNUAL_LEAVE);
          const gross       = basicAmt + overtimeAmt + holidayAmt + annualAmt;
          const autoSum     = gross;
          const holidayOtHours = Number(form.wageComponents.fixedHolidayOvertime?.hours) || 0;
          const holidayOtMins  = Number(form.wageComponents.fixedHolidayOvertime?.minutes) || 0;
          const holidayOtAmt   = Number(form.wageComponents.fixedHolidayOvertime?.amount) || 0;
          const nightHours     = Number(form.wageComponents.fixedNight?.hours) || 0;
          const nightMins      = Number(form.wageComponents.fixedNight?.minutes) || 0;
          const nightAmt       = Number(form.wageComponents.fixedNight?.amount) || 0;
          const meal    = Number(form.wageComponents.mealAllowance) || 0;
          const vehicle = Number(form.wageComponents.vehicleAllowance) || 0;
          const pension = Math.round(basicAmt * INSURANCE_RATES.PENSION);
          const health  = Math.round(basicAmt * INSURANCE_RATES.HEALTH);
          const ltc     = Math.round(health * INSURANCE_RATES.LTC_RATIO);
          const emp     = Math.round(basicAmt * INSURANCE_RATES.EMPLOYMENT);
          const insSum  = pension + health + ltc + emp;
          const taxObj  = computeIncomeTax(basicAmt, dependentsCount, withholdingRate, childrenCount, extraDeduction);
          const taxSum  = taxObj.total;
          const deductionTotal = insSum + taxSum;
          const deductionPct = basicAmt > 0 ? (deductionTotal / basicAmt * 100) : 0;
          const grossTotal = gross + holidayOtAmt + nightAmt + meal + vehicle;
          const monthlyNet = Math.max(0, grossTotal - deductionTotal);

          const setMeal = (v: number) => setForm(prev => ({
            ...prev,
            wageComponents: { ...prev.wageComponents, mealAllowance: Math.max(0, v) },
          }));
          const setVehicle = (v: number) => setForm(prev => ({
            ...prev,
            wageComponents: { ...prev.wageComponents, vehicleAllowance: Math.max(0, v) },
          }));
          const mealChecked = meal > 0;
          const vehicleChecked = vehicle > 0;

          const tdItem = "px-3 py-2 text-zinc-800 font-bold align-top";
          const tdMid  = "px-3 py-2 text-zinc-500 text-[15px] align-top";
          const tdAmt  = "px-3 py-2 text-right tabular-nums font-bold text-zinc-900 align-top whitespace-nowrap";

          const weeklyH = wdH + weH;
          const isMonthly = isMonthlyWageType(form.contractType);
          const hasDual = weeklyWeekendDays > 0 && we !== wd;

          return (
            <div className="border border-line rounded-lg bg-white overflow-hidden flex flex-col">
              {/* 근무조건 산식 헤더 */}
              <div className="px-4 py-2 bg-indigo-50/40 border-b border-indigo-100 flex items-baseline flex-wrap gap-x-1.5 text-[15px]">
                {form.employeeCategory && (() => {
                  const cat = form.employeeCategory;
                  const cls =
                    cat === "약사"  ? "bg-violet-500 text-white" :
                    cat === "매장"  ? "bg-emerald-500 text-white" :
                    cat === "창고"  ? "bg-orange-500 text-white" :
                                      "bg-zinc-600 text-white";
                  return (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold ${cls}`}>
                      {cat}
                    </span>
                  );
                })()}
                <span className="font-bold text-indigo-900">주 {weeklyH.toFixed(1)}시간</span>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[15px] font-bold uppercase tracking-wide ${isMonthly ? "bg-indigo-200 text-indigo-800" : "bg-amber-200 text-amber-800"}`}>
                  {isMonthly ? "월급제" : "시급제"}
                </span>
                {autoMonthlyNet > 0 && (
                  <>
                    {hasDual ? (
                      <>
                        <span className="text-zinc-500 text-[14px] ml-1">주중</span>
                        <span className="tabular-nums font-bold text-zinc-700">{fmtWon(wd)}원</span>
                        <span className="text-zinc-400">×</span>
                        <span className="tabular-nums text-zinc-600">{wdH.toFixed(1)}h</span>
                        <span className="text-zinc-400">+</span>
                        <span className="text-zinc-500 text-[14px]">주말</span>
                        <span className="tabular-nums font-bold text-zinc-700">{fmtWon(we)}원</span>
                        <span className="text-zinc-400">×</span>
                        <span className="tabular-nums text-zinc-600">{weH.toFixed(1)}h</span>
                      </>
                    ) : (
                      <>
                        <span className="text-zinc-500 text-[14px] ml-1">시급</span>
                        <span className="tabular-nums font-bold text-zinc-700">{fmtWon(wd)}원</span>
                        <span className="text-zinc-400">×</span>
                        <span className="tabular-nums text-zinc-600">{weeklyH.toFixed(1)}h</span>
                      </>
                    )}
                    <span className="text-zinc-400">×</span>
                    <span className="text-zinc-600">4.345</span>
                    <span className="text-zinc-400">=</span>
                    <span className="tabular-nums font-bold text-emerald-700">{fmtWon(autoMonthlyNet)}원</span>
                    <span className="text-[9.5px] text-zinc-400 bg-emerald-100 px-1 rounded">(희망 월 수령액)</span>
                  </>
                )}
              </div>

              {/* 통상시급 입력 헤더 */}
              <div className="px-4 py-2.5 bg-zinc-50/60 border-b border-line flex flex-col gap-1">
                <div className="flex items-baseline flex-wrap gap-x-2">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">통상시급</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={hourly}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setWageHourlyOverride(Number.isFinite(v) && v > 0 ? v : null);
                    }}
                    className="w-24 tabular-nums bg-white border border-zinc-300 rounded px-1.5 py-0.5 text-[15px] font-bold text-zinc-900 text-right focus:outline-none focus:border-brand-deep"
                  />
                  <span className="text-zinc-500 text-[15px]">원</span>
                  {autoMonthlyNet > 0 && (
                    <button
                      type="button"
                      onClick={applyHopeMatch}
                      className="text-[14px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-bold cursor-pointer"
                      title={`근무조건 희망월수령액 ${fmtWon(autoMonthlyNet)}원을 세후로 맞추는 통상시급으로 자동 조정`}
                    >
                      희망 맞춤
                    </button>
                  )}
                  {wageHourlyOverride != null && (
                    <button
                      type="button"
                      onClick={() => setWageHourlyOverride(null)}
                      className="text-[14px] text-indigo-500 hover:text-indigo-700 hover:underline cursor-pointer"
                      title={`자동 (주중시급 ${fmtWon(autoHourly)}원)`}
                    >
                      자동
                    </button>
                  )}
                  <span className="text-zinc-400 text-[10.5px]">→ 기본급</span>
                  <span className="tabular-nums font-bold text-zinc-700 text-[11.5px]">{fmtWon(basicAmt)}원</span>
                  <span className="text-zinc-400 text-[14px]">(× {WAGE_HOURS.BASIC}h)</span>
                  <span className="ml-auto text-zinc-500 text-[10.5px]">
                    세전 <span className="tabular-nums font-bold text-zinc-800">{fmtWon(gross)}원</span>
                    <span className="text-zinc-400"> (× {WAGE_DIVISOR.toFixed(2)}h)</span>
                  </span>
                </div>
                <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1 text-[14px] text-zinc-400 font-semibold">
                  <span>참고 · 약사 주중 근무 시 통상시급 예시 <span className="tabular-nums font-bold text-zinc-500">22,350.8</span>원 (기본급 4,671,298원 ÷ 209h)</span>
                  <span className="ml-auto flex items-baseline gap-x-1.5">
                    <span className="text-zinc-500">부양</span>
                    <input
                      type="number"
                      min={1} max={10} step={1}
                      value={dependentsCount}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setDependentsCount(Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1);
                      }}
                      className="w-12 tabular-nums bg-white border border-zinc-300 rounded px-1.5 py-0.5 text-[15px] font-bold text-zinc-800 text-right focus:outline-none focus:border-brand-deep"
                    />
                    <span className="text-zinc-500">인</span>
                  </span>
                  <span className="flex items-baseline gap-x-1.5">
                    <span className="text-zinc-500">자녀</span>
                    <input
                      type="number"
                      min={0} max={10} step={1}
                      value={childrenCount}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setChildrenCount(Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
                      }}
                      className="w-12 tabular-nums bg-white border border-zinc-300 rounded px-1.5 py-0.5 text-[15px] font-bold text-zinc-800 text-right focus:outline-none focus:border-brand-deep"
                      title="자녀 세액공제 · 8~20세 자녀"
                    />
                    <span className="text-zinc-500">인</span>
                  </span>
                  <span className="flex items-baseline gap-x-1.5">
                    <span className="text-zinc-500">원천징수</span>
                    <select
                      value={withholdingRate}
                      onChange={(e) => setWithholdingRate(Number(e.target.value) as WithholdingRate)}
                      className="tabular-nums bg-white border border-zinc-300 rounded px-1.5 py-0.5 text-[15px] font-bold text-zinc-800 focus:outline-none focus:border-brand-deep cursor-pointer"
                      title="근로자 선택 · 80%: 매달 적게(연말 추납) · 100%: 표준 · 120%: 매달 많이(연말 환급)"
                    >
                      {WITHHOLDING_RATES.map(r => (
                        <option key={r} value={r}>{Math.round(r * 100)}%</option>
                      ))}
                    </select>
                  </span>
                  <span className="flex items-baseline gap-x-1.5">
                    <span className="text-zinc-500">공제항목</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={extraDeduction ? extraDeduction.toLocaleString("ko-KR") : ""}
                      onChange={(e) => {
                        const v = Number(e.target.value.replace(/[^0-9]/g, "")) || 0;
                        setExtraDeduction(Math.max(0, v));
                      }}
                      placeholder="0"
                      className="w-20 tabular-nums bg-white border border-zinc-300 rounded px-1.5 py-0.5 text-[15px] font-bold text-zinc-800 text-right focus:outline-none focus:border-brand-deep"
                      title="추가 공제항목 · 소득세 과세대상 M에서 차감"
                    />
                    <span className="text-zinc-500">원</span>
                  </span>
                </div>
              </div>

              {/* 임금구성표 · 8항목 */}
              <table className="w-full text-[11.5px]">
                <thead className="bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-bold w-[36%]">구성 항목</th>
                    <th className="px-3 py-1.5 text-left font-bold">내용</th>
                    <th className="px-3 py-1.5 text-right font-bold w-[22%]">금액</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-zinc-100">
                    <td className={tdItem}>기본급 <span className="text-zinc-400 font-normal text-[10.5px]">(주휴수당 포함)</span></td>
                    <td className={tdMid}>월평균 {WAGE_HOURS.BASIC.toFixed(2)} 시간</td>
                    <td className={tdAmt}>{fmtWon(basicAmt)}원</td>
                  </tr>
                  <tr className="border-t border-zinc-100">
                    <td className={tdItem}>(고정)연장근로수당 <span className="text-zinc-400 font-normal text-[10.5px]">(1.5배 가산 포함)</span></td>
                    <td className={tdMid}>월평균 {WAGE_HOURS.OVERTIME.toFixed(2)} 시간 <span className="text-zinc-400">· 실 37.29h × 1.5</span></td>
                    <td className={tdAmt}>{fmtWon(overtimeAmt)}원</td>
                  </tr>
                  <tr className="border-t border-zinc-100">
                    <td className={tdItem}>(고정)휴일근로수당 <span className="text-zinc-400 font-normal text-[10.5px]">(1.5배 가산 포함)</span></td>
                    <td className={tdMid}>월평균 {WAGE_HOURS.HOLIDAY.toFixed(2)} 시간 <span className="text-zinc-400">· 실 14.67h × 1.5</span></td>
                    <td className={tdAmt}>{fmtWon(holidayAmt)}원</td>
                  </tr>
                  <tr className="border-t border-zinc-100">
                    <td className={tdItem}>(고정)휴일연장근로수당 <span className="text-zinc-400 font-normal text-[10.5px]">(0.5배 가산 포함)</span></td>
                    <td className={tdMid}>월평균 {holidayOtHours} 시간 {holidayOtMins} 분</td>
                    <td className={tdAmt}>{holidayOtAmt > 0 ? `${fmtWon(holidayOtAmt)}원` : "-"}</td>
                  </tr>
                  <tr className="border-t border-zinc-100">
                    <td className={tdItem}>(고정)야간근로수당 <span className="text-zinc-400 font-normal text-[10.5px]">(0.5배 가산 포함)</span></td>
                    <td className={tdMid}>월평균 {nightHours} 시간 {nightMins} 분</td>
                    <td className={tdAmt}>{nightAmt > 0 ? `${fmtWon(nightAmt)}원` : "-"}</td>
                  </tr>
                  <tr className="border-t border-zinc-100">
                    <td className={tdItem}>(고정)연차휴가수당</td>
                    <td className={tdMid}>월평균 {WAGE_HOURS.ANNUAL_LEAVE.toFixed(2)} 시간</td>
                    <td className={tdAmt}>{fmtWon(annualAmt)}원</td>
                  </tr>
                  {/* 식대 */}
                  <tr className="border-t border-zinc-100">
                    <td className={tdItem}>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={mealChecked}
                          onChange={(e) => setMeal(e.target.checked ? (meal > 0 ? meal : 200_000) : 0)}
                          className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer"
                        />
                        <span>식대 <span className="text-zinc-400 font-normal text-[10.5px]">(비과세)</span></span>
                      </label>
                    </td>
                    <td className={tdMid}>
                      {mealChecked ? (
                        <span className="inline-flex items-center">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={meal ? meal.toLocaleString("ko-KR") : ""}
                            onChange={(e) => setMeal(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                            className="w-24 bg-white border border-line rounded px-2 py-0.5 text-right text-[15px] font-bold text-zinc-800 focus:outline-none focus:border-brand-deep"
                          />
                          <span className="ml-1 text-zinc-400 text-[10.5px]">원</span>
                        </span>
                      ) : (
                        <span className="text-zinc-400">해당자에 한함</span>
                      )}
                    </td>
                    <td className={tdAmt}>{mealChecked ? `${fmtWon(meal)}원` : "-"}</td>
                  </tr>
                  {/* 차량유지비 */}
                  <tr className="border-t border-zinc-100">
                    <td className={tdItem}>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={vehicleChecked}
                          onChange={(e) => setVehicle(e.target.checked ? (vehicle > 0 ? vehicle : 200_000) : 0)}
                          className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer"
                        />
                        <span>차량유지비 <span className="text-zinc-400 font-normal text-[10.5px]">(비과세)</span></span>
                      </label>
                    </td>
                    <td className={tdMid}>
                      {vehicleChecked ? (
                        <span className="inline-flex items-center">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={vehicle ? vehicle.toLocaleString("ko-KR") : ""}
                            onChange={(e) => setVehicle(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                            className="w-24 bg-white border border-line rounded px-2 py-0.5 text-right text-[15px] font-bold text-zinc-800 focus:outline-none focus:border-brand-deep"
                          />
                          <span className="ml-1 text-zinc-400 text-[10.5px]">원</span>
                        </span>
                      ) : (
                        <span className="text-zinc-400">해당자에 한함</span>
                      )}
                    </td>
                    <td className={tdAmt}>{vehicleChecked ? `${fmtWon(vehicle)}원` : "-"}</td>
                  </tr>
                  {/* 월급여총액 */}
                  <tr className="border-t-2 border-zinc-300 bg-zinc-50">
                    <td className="px-3 py-2 text-zinc-800 font-bold text-[12.5px]">
                      월급여총액 <span className="text-zinc-500 font-bold text-[10.5px]">(세전)</span>
                    </td>
                    <td className="px-3 py-2 text-[10.5px] text-zinc-500 font-semibold">
                      기본 4항목 {fmtWon(autoSum)}
                      {(holidayOtAmt + nightAmt + meal + vehicle) > 0 && ` + 선택 ${fmtWon(holidayOtAmt + nightAmt + meal + vehicle)}`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-zinc-900 text-[15px] whitespace-nowrap">
                      {fmtWon(grossTotal)}원
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 예상공제액 접기 */}
              <details className="border-t border-line bg-rose-50/30 group">
                <summary className="px-3 py-2 flex items-baseline gap-x-2 cursor-pointer hover:bg-rose-50/60 list-none select-none">
                  <span className="text-zinc-400 text-[14px] transition-transform group-open:rotate-90 inline-block">▶</span>
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-rose-700">− 예상공제액</span>
                  <span className="text-[10.5px] text-zinc-500">기본급 {fmtWon(basicAmt)}원 기준 · 실효 {deductionPct.toFixed(1)}%</span>
                  <span className="tabular-nums font-bold text-rose-700 ml-auto text-[14px]">−{fmtWon(deductionTotal)}원</span>
                </summary>
                <div className="px-3 pb-2.5 flex flex-col gap-1">
                  <div className="pt-1.5 border-t border-rose-100/60 flex items-baseline gap-x-2 flex-wrap">
                    <span className="text-zinc-700 font-bold text-[11.5px] min-w-[74px]">국민연금</span>
                    <span className="tabular-nums text-zinc-500 text-[15px] min-w-[110px]">{(INSURANCE_RATES.PENSION * 100).toFixed(2)}%</span>
                    <span className="text-[14px] text-zinc-400 font-medium leading-snug flex-1 min-w-[160px]">노후 소득 보장 · 근로자 부담분</span>
                    <span className="tabular-nums text-zinc-600 text-[11.5px] ml-auto whitespace-nowrap">≈ {fmtWon(pension)}원</span>
                  </div>
                  <div className="pt-1.5 border-t border-rose-100/60 flex items-baseline gap-x-2 flex-wrap">
                    <span className="text-zinc-700 font-bold text-[11.5px] min-w-[74px]">건강보험</span>
                    <span className="tabular-nums text-zinc-500 text-[15px] min-w-[110px]">{(INSURANCE_RATES.HEALTH * 100).toFixed(3)}%</span>
                    <span className="text-[14px] text-zinc-400 font-medium leading-snug flex-1 min-w-[160px]">질병·부상 진료 급여 · 근로자 부담분</span>
                    <span className="tabular-nums text-zinc-600 text-[11.5px] ml-auto whitespace-nowrap">≈ {fmtWon(health)}원</span>
                  </div>
                  <div className="pt-1.5 border-t border-rose-100/60 flex items-baseline gap-x-2 flex-wrap">
                    <span className="text-zinc-700 font-bold text-[11.5px] min-w-[74px]">장기요양</span>
                    <span className="tabular-nums text-zinc-500 text-[15px] min-w-[110px]">건강 × {(INSURANCE_RATES.LTC_RATIO * 100).toFixed(2)}%</span>
                    <span className="text-[14px] text-zinc-400 font-medium leading-snug flex-1 min-w-[160px]">노인장기요양 · 건강보험료의 12.95%</span>
                    <span className="tabular-nums text-zinc-600 text-[11.5px] ml-auto whitespace-nowrap">≈ {fmtWon(ltc)}원</span>
                  </div>
                  <div className="pt-1.5 border-t border-rose-100/60 flex items-baseline gap-x-2 flex-wrap">
                    <span className="text-zinc-700 font-bold text-[11.5px] min-w-[74px]">고용보험</span>
                    <span className="tabular-nums text-zinc-500 text-[15px] min-w-[110px]">{(INSURANCE_RATES.EMPLOYMENT * 100).toFixed(2)}%</span>
                    <span className="text-[14px] text-zinc-400 font-medium leading-snug flex-1 min-w-[160px]">실업급여 재원 · 근로자 부담분</span>
                    <span className="tabular-nums text-zinc-600 text-[11.5px] ml-auto whitespace-nowrap">≈ {fmtWon(emp)}원</span>
                  </div>
                  <div className="pt-1.5 border-t border-rose-100/60 flex items-baseline gap-x-2 flex-wrap">
                    <span className="text-zinc-700 font-bold text-[11.5px] min-w-[74px]">근로소득세</span>
                    <span className="tabular-nums text-zinc-500 text-[15px] min-w-[110px]">간이세액표 7단계</span>
                    <span className="text-[14px] text-zinc-400 font-medium leading-snug flex-1 min-w-[160px]">
                      국세청 공식 · 부양 {dependentsCount}인 (인적공제 {dependentsCount * 150}만원){childrenCount > 0 ? ` · 자녀 ${childrenCount}인` : ""} · 원천징수 {Math.round(withholdingRate * 100)}%
                    </span>
                    <span className="tabular-nums text-zinc-600 text-[11.5px] ml-auto whitespace-nowrap">≈ {fmtWon(taxObj.incomeTax)}원</span>
                  </div>
                  <div className="pt-1.5 border-t border-rose-100/60 flex items-baseline gap-x-2 flex-wrap">
                    <span className="text-zinc-700 font-bold text-[11.5px] min-w-[74px]">지방소득세</span>
                    <span className="tabular-nums text-zinc-500 text-[15px] min-w-[110px]">소득세 × 10%</span>
                    <span className="text-[14px] text-zinc-400 font-medium leading-snug flex-1 min-w-[160px]">지자체 재원 · 근로소득세의 10%</span>
                    <span className="tabular-nums text-zinc-600 text-[11.5px] ml-auto whitespace-nowrap">≈ {fmtWon(taxObj.localTax)}원</span>
                  </div>
                  <div className="flex items-baseline gap-x-2 pt-1.5 border-t border-rose-200">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-rose-700">예상공제 합계</span>
                    <span className="text-[10.5px] text-zinc-500">4대보험 {fmtWon(insSum)} + 소득세 {fmtWon(taxSum)}</span>
                    <span className="tabular-nums font-bold text-rose-700 ml-auto text-[14px]">−{fmtWon(deductionTotal)}원</span>
                  </div>
                </div>
              </details>

              {/* 예상 실수령 */}
              <div className="px-3 py-2 bg-emerald-50/60 border-t border-emerald-200 flex items-baseline flex-wrap gap-x-2 gap-y-1">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-700">예상 실수령 (세후)</span>
                <span className="text-[10.5px] text-emerald-600 font-semibold">세전 {fmtWon(grossTotal)} − 예상공제 {fmtWon(deductionTotal)}</span>
                {autoMonthlyNet > 0 && (() => {
                  const diff = monthlyNet - autoMonthlyNet;
                  const absDiff = Math.abs(diff);
                  const near = absDiff < 1000;
                  const cls = near ? "text-emerald-500" : (diff > 0 ? "text-indigo-500" : "text-amber-600");
                  return (
                    <span className={`text-[14px] font-bold ${cls}`} title={`희망월수령액 ${fmtWon(autoMonthlyNet)}원 대비`}>
                      희망 대비 {diff > 0 ? "+" : diff < 0 ? "−" : "="}{fmtWon(absDiff)}원 {near && "✓"}
                    </span>
                  );
                })()}
                <span className="tabular-nums font-bold text-emerald-800 ml-auto text-[15px] whitespace-nowrap">{fmtWon(monthlyNet)}원</span>
              </div>
            </div>
          );
        })()}

        </>)}
      </div>
      {/* /카드 3 */}

      </>)}
      {/* /T-R · 여기서 작성 모드 */}

    </section>
  );
};

export default ContractLeftForm;
