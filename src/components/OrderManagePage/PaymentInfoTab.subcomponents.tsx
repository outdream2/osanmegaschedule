// src/components/OrderManagePage/PaymentInfoTab.subcomponents.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · PaymentInfoTab 서브 컴포넌트 이관
// 프레임워크: Spinner
import React from "react";
import { Wallet, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { Spinner } from "../common/Spinner";
import type { VendorSortKey, SortDir } from "./PaymentInfoTab.types";

export const inputCls =
  "w-full h-9 px-3 text-[14px] border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep bg-white transition placeholder:text-zinc-300";

export const FieldLabel: React.FC<{
  label: string;
  icon?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}> = ({ label, icon, required, children }) => (
  <label className="block space-y-1">
    <span className="inline-flex items-center gap-1 text-[14px] font-bold text-zinc-500 uppercase tracking-wider">
      {icon && <span className="text-zinc-400">{icon}</span>}
      {label}
      {required && <span className="text-rose-500">*</span>}
    </span>
    {children}
  </label>
);

// 결제 금액 입력 필드 · 재사용 헬퍼 (2026-08-04 · #102)
// · value: 숫자 string → toLocaleString 쉼표 표시 (e.g. "1500000" → "1,500,000")
// · onChange: 비숫자 제거 후 숫자 string 저장
// · 쉼표 자동입력 검증: onChange에서 replace(/[^0-9]/g,"") 처리 후 amount는 항상 순수 숫자
//   → Number(amount)는 절대 NaN이 될 수 없음 · amount === "" 시 조건문으로 빈 문자열 유지
export const AmountField: React.FC<{
  amount: string;
  setAmount: (v: string) => void;
  inputCls: string;
  overBalance: boolean;
  currentBalance: number;
}> = ({ amount, setAmount, inputCls, overBalance, currentBalance }) => (
  <FieldLabel label="결제 금액" icon={<Wallet size={11} />} required>
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[15px] font-bold text-zinc-400 select-none">₩</span>
      <input
        type="text"
        inputMode="numeric"
        value={amount ? Number(amount).toLocaleString() : ""}
        onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder="0"
        className={`${inputCls} pl-7 pr-[52px] text-right tabular-nums font-bold text-[14px] ${overBalance ? "border-amber-400 focus:ring-brand-tint focus:border-brand-deep" : ""}`}
      />
      {currentBalance > 0 && !amount && (
        <button
          type="button"
          onClick={() => setAmount(String(Math.round(currentBalance)))}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 px-2 text-[14px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition cursor-pointer"
          title="현재 잔고 전액"
        >
          전액
        </button>
      )}
    </div>
  </FieldLabel>
);

// ─── 좌측 리스트 헤더 · 자동 정렬 · Task #103 (2026-08-04) ─────────────────
export const SortHeaderBtn: React.FC<{
  label: string;
  columnKey: VendorSortKey;
  activeKey: VendorSortKey;
  activeDir: SortDir;
  onSort: (k: VendorSortKey) => void;
  className?: string;
  align?: "left" | "right";
  title?: string;
}> = ({ label, columnKey, activeKey, activeDir, onSort, className = "", align = "right", title }) => {
  const active = columnKey === activeKey;
  const alignCls = align === "right" ? "justify-end text-right" : "justify-start text-left";
  return (
    <button
      type="button"
      onClick={() => onSort(columnKey)}
      title={title ?? `${label} · 클릭하여 정렬`}
      className={`inline-flex items-center gap-0.5 ${alignCls} h-full transition cursor-pointer select-none ${
        active ? "text-zinc-800" : "text-zinc-500 hover:text-zinc-700"
      } ${className}`}
    >
      <span>{label}</span>
      {active
        ? (activeDir === "asc"
            ? <ChevronUp size={11} strokeWidth={3} className="shrink-0" />
            : <ChevronDown size={11} strokeWidth={3} className="shrink-0" />)
        : <ChevronsUpDown size={10} strokeWidth={2.25} className="opacity-30 shrink-0" />
      }
    </button>
  );
};

export const VendorListHeader: React.FC<{
  sortKey: VendorSortKey;
  sortDir: SortDir;
  onSort: (k: VendorSortKey) => void;
  count: number;
  loading?: boolean;
}> = ({ sortKey, sortDir, onSort, count, loading = false }) => (
  <div className="px-2 py-1.5 border-b border-line bg-zinc-50/70 shrink-0 flex items-center gap-1.5 text-[15px] font-bold uppercase tracking-wider">
    {/* 분류 · 정렬 X (badge column) */}
    <span className="w-[42px] shrink-0 text-zinc-400">분류</span>
    {/* VAT · 포함/불포함 · 2026-08-06 · 사용자 요청 */}
    <span className="w-[36px] shrink-0 text-zinc-400 text-center">VAT</span>
    {/* 공급사명 · flex · 로딩 시 · "로딩중" 표시 (2026-08-09) */}
    <span className="flex-1 min-w-0 flex items-center gap-1.5">
      <SortHeaderBtn label={`공급사 (${count})`} columnKey="name" activeKey={sortKey} activeDir={sortDir} onSort={onSort} align="left" />
      {loading && (
        <span className="inline-flex items-center gap-1 shrink-0">
          <Spinner size={10} tone="sky" label="로딩중" labelSize={14} />
        </span>
      )}
    </span>
    {/* 2026-08-09 · 4컬럼 재구성 (사용자 요청 · 총재고자산·총판매액·총결제액·총잔고) */}
    <span className="w-[62px] shrink-0">
      <SortHeaderBtn label="총재고자산" columnKey="stockValue" activeKey={sortKey} activeDir={sortDir} onSort={onSort} align="right" className="w-full text-teal-700" title="총재고자산 · stock_history 최근 3개월 · 클릭하여 정렬" />
    </span>
    <span className="w-[58px] shrink-0">
      <SortHeaderBtn label="총판매액" columnKey="sales" activeKey={sortKey} activeDir={sortDir} onSort={onSort} align="right" className="w-full text-indigo-700" title="최근 3개월 총판매 · stock_history · 클릭하여 정렬" />
    </span>
    <span className="w-[58px] shrink-0">
      <SortHeaderBtn label="총결제액" columnKey="payment" activeKey={sortKey} activeDir={sortDir} onSort={onSort} align="right" className="w-full text-sky-700" title="선택 기간 내 총결제 · supplier_payments · 클릭하여 정렬" />
    </span>
    <span className="w-[58px] shrink-0">
      <SortHeaderBtn label="총잔고" columnKey="balance" activeKey={sortKey} activeDir={sortDir} onSort={onSort} align="right" className="w-full text-amber-700" title="총잔고 (전체 매입-결제) · 클릭하여 정렬" />
    </span>
  </div>
);

export const KpiMini: React.FC<{
  label: string;
  value: string;
  tone: "emerald" | "sky" | "amber" | "rose" | "slate";
  loading?: boolean;
  icon?: React.ReactNode;
  hint?: string;
}> = ({ label, value, tone, loading, icon, hint }) => {
  const map = {
    emerald: { text: "text-emerald-700", badge: "bg-emerald-50 text-emerald-600 border-emerald-100" },
    sky:     { text: "text-sky-700",     badge: "bg-sky-50 text-sky-600 border-sky-100" },
    amber:   { text: "text-amber-700",   badge: "bg-amber-50 text-amber-600 border-amber-100" },
    rose:    { text: "text-rose-700",    badge: "bg-rose-50 text-rose-600 border-rose-100" },
    slate:   { text: "text-zinc-600",   badge: "bg-zinc-50 text-zinc-500 border-line" },
  } as const;
  const t = map[tone];
  return (
    <div className="bg-white rounded-lg border border-line shadow-xs px-2.5 py-2 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 min-w-0">
        {icon && (
          <span className={`w-5 h-5 flex items-center justify-center rounded border ${t.badge} shrink-0`}>
            {icon}
          </span>
        )}
        <span className="text-[15px] font-bold text-zinc-400 uppercase tracking-wider leading-none">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        {loading ? (
          <Spinner size={12} tone="zinc" />
        ) : (
          <span className={`text-[14px] font-bold tabular-nums leading-none ${t.text}`}>{value}</span>
        )}
      </div>
      {hint && <div className="text-[15px] font-semibold text-zinc-400 leading-none">{hint}</div>}
    </div>
  );
};
