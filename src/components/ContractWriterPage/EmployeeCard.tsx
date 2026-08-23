// src/components/ContractWriterPage/EmployeeCard.tsx
// 카드 1 · 근로자 정보 (collapsible · T-W)

import React from "react";
import { User, DownloadSimple, CaretDown } from "@phosphor-icons/react";
import type { ContractForm, CardKey } from "./types";
import { BANK_LIST } from "./constants";
import { EmployeeInfoForm } from "../common/EmployeeInfoForm";
import { AddressSearchModal } from "../common/features/AddressSearchModal";
import { Card } from "../common/Card";
import { IconTile } from "../common/IconTile";
import type { Employee } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface EmployeeCardProps {
  form: ContractForm;
  upd: <K extends keyof ContractForm>(key: K, val: ContractForm[K]) => void;
  setNotice: (n: { tone: "ok" | "err"; text: string } | null) => void;

  employees: Employee[];
  empLoading: boolean;
  empError: string | null;
  empSearchOpen: boolean;
  setEmpSearchOpen: (v: boolean) => void;
  onSelectEmployee: (empIdRaw: string) => void;

  toggleCard: (key: CardKey) => void;
  isCardCollapsed: (key: CardKey) => boolean;

  addrModalOpen: boolean;
  setAddrModalOpen: (v: boolean) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────

const fldInput = "w-full bg-white border border-line rounded-lg px-3 py-2 text-[15px] text-zinc-800 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-tint/60 focus:border-brand-deep transition placeholder:text-zinc-400 placeholder:font-normal";
const fldLabel = "block text-[10.5px] font-bold uppercase tracking-wider text-zinc-500 mb-1";
const cardInner = "rounded-lg border border-zinc-100 bg-zinc-50/60 p-2.5 flex flex-col gap-2";
const cardGroupLabel = "text-[14px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5 mb-0.5";

export const EmployeeCard: React.FC<EmployeeCardProps> = ({
  form, upd, setNotice,
  employees, empLoading, empError, empSearchOpen, setEmpSearchOpen, onSelectEmployee,
  toggleCard, isCardCollapsed,
  addrModalOpen, setAddrModalOpen,
}) => (
  <div className="rounded-xl border border-line bg-white p-3 flex flex-col gap-3 shadow-sm">
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
);
