// src/components/LandingPage/PaymentRegisterModal.tsx
// 2026-08-21 · Framework Phase 4 · VendorListEditor 대형 파일 분리 · PaymentRegisterModal 이관
// 2026-08-23 · #191 · Modal primitive 마이그레이션
import React, { useState, useEffect, useMemo } from "react";
import { X, Check, Package, TrendingUp, Wallet } from "lucide-react";
import { IconTile } from "../common/IconTile";
import { Modal } from "../common/Modal";
import { api } from "../../lib/apiClient";
import type { OpenInvoiceRow } from "./VendorListEditor.types";
import { fmtWon, inputCls, METHOD_OPTIONS } from "./VendorListEditor.utils";
import { Spinner } from "../common/Spinner";
import { useToast, toastClass } from "../../hooks/useToast";

const todayYmd = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block space-y-1">
    <span className="text-[14px] font-semibold text-zinc-600 tracking-tight">{label}</span>
    {children}
  </label>
);

const sectionColorMap = {
  sky:     { bar: "bg-sky-500",     text: "text-sky-700" },
  emerald: { bar: "bg-emerald-500", text: "text-emerald-700" },
  amber:   { bar: "bg-amber-500",   text: "text-amber-700" },
  rose:    { bar: "bg-rose-500",    text: "text-rose-700" },
  teal:    { bar: "bg-teal-500",    text: "text-teal-700" },
  indigo:  { bar: "bg-brand-deep",  text: "text-indigo-700" },
  violet:  { bar: "bg-violet-500",  text: "text-violet-700" },
} as const;
type SectionColor = keyof typeof sectionColorMap;

const SectionTitle: React.FC<{
  icon?: React.ReactNode;
  title: string;
  color: SectionColor;
  hint?: string;
}> = ({ title, color, hint }) => {
  const c = sectionColorMap[color];
  return (
    <div className="flex items-center gap-2 pb-1.5 border-b border-zinc-100">
      <span className={`w-1 h-4 rounded-full ${c.bar} shrink-0`} />
      <span className={`text-[15px] font-bold ${c.text}`}>{title}</span>
      {hint && <span className="ml-auto text-[12px] text-zinc-400 font-mono tabular-nums">{hint}</span>}
    </div>
  );
};

const PaymentRegisterModal: React.FC<{
  supplierName: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ supplierName, onClose, onSaved }) => {
  const { toast, showSuccess, showError } = useToast();
  const [paymentDate, setPaymentDate] = useState<string>(todayYmd());
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("transfer");
  const [memo, setMemo] = useState<string>("");
  const [invoices, setInvoices] = useState<OpenInvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  // invoice_id → { checked, allocated_amount(string) }
  const [allocMap, setAllocMap] = useState<Map<number, { checked: boolean; alloc: string }>>(new Map());

  // 미결제 매입건 로드
  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const { data: j } = await api.get<any>(`/api/supplier-open-invoices?supplier=${encodeURIComponent(supplierName)}`);
        const rows: OpenInvoiceRow[] = Array.isArray(j.rows) ? j.rows : [];
        rows.sort((a, b) => {
          const sw = (s: string) => s === "open" ? 0 : s === "partial" ? 1 : 2;
          const d = sw(a.status) - sw(b.status);
          return d !== 0 ? d : String(b.date).localeCompare(String(a.date));
        });
        setInvoices(rows);
        const m = new Map<number, { checked: boolean; alloc: string }>();
        rows.forEach(r => m.set(r.id, { checked: false, alloc: String(Math.max(0, Math.round(r.remaining))) }));
        setAllocMap(m);
      } catch { setInvoices([]); }
      finally { setLoading(false); }
    })();
  }, [supplierName]);

  const amountNum = Number(String(amount).replace(/[^0-9.-]/g, "")) || 0;
  const allocSum = useMemo(() => {
    let s = 0;
    for (const [, v] of allocMap) {
      if (v.checked) s += Number(v.alloc) || 0;
    }
    return s;
  }, [allocMap]);
  const diff = amountNum - allocSum;

  const toggleCheck = (id: number) => {
    setAllocMap(prev => {
      const n = new Map<number, { checked: boolean; alloc: string }>(prev);
      const v = n.get(id);
      if (v) n.set(id, { ...v, checked: !v.checked });
      return n;
    });
  };

  const updateAlloc = (id: number, val: string) => {
    setAllocMap(prev => {
      const n = new Map<number, { checked: boolean; alloc: string }>(prev);
      const v = n.get(id);
      if (v) n.set(id, { ...v, alloc: val });
      return n;
    });
  };

  const autoAllocate = () => {
    // 결제금액을 위에서부터 잔여금액만큼 자동 배분
    let remainingBudget = amountNum;
    setAllocMap(prev => {
      const n = new Map<number, { checked: boolean; alloc: string }>(prev);
      for (const inv of invoices) {
        if (inv.status === "paid" || inv.remaining <= 0) continue;
        if (remainingBudget <= 0) {
          const v = n.get(inv.id);
          if (v) n.set(inv.id, { ...v, checked: false, alloc: String(Math.round(inv.remaining)) });
          continue;
        }
        const take = Math.min(remainingBudget, inv.remaining);
        n.set(inv.id, { checked: true, alloc: String(Math.round(take)) });
        remainingBudget -= take;
      }
      return n;
    });
  };

  const handleSubmit = async () => {
    setErrMsg(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      setErrMsg("날짜는 YYYY-MM-DD 형식이어야 합니다");
      return;
    }
    if (amountNum <= 0) {
      setErrMsg("결제 금액은 양수여야 합니다");
      return;
    }
    if (diff < -0.5) {
      setErrMsg(`배분 총액이 결제 금액을 초과합니다 (차이 ${diff.toLocaleString()})`);
      return;
    }
    const allocations: Array<{ ocr_confirmed_item_id: number; allocated_amount: number }> = [];
    for (const [id, v] of allocMap) {
      if (v.checked) {
        const a = Number(v.alloc) || 0;
        if (a > 0) allocations.push({ ocr_confirmed_item_id: id, allocated_amount: a });
      }
    }
    setSaving(true);
    try {
      await api.post("/api/supplier-payments", {
        supplier_name: supplierName,
        payment_date: paymentDate,
        amount: amountNum,
        method,
        memo: memo.trim() || null,
        allocations,
      });
      showSuccess("결제가 등록되었습니다");
      onSaved();
    } catch (e: any) {
      const msg = `저장 실패: ${e?.message ?? e}`;
      setErrMsg(msg);
      showError(msg);
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <div className="flex items-center gap-2 flex-wrap w-full">
      {errMsg && (
        <span className="inline-flex items-center gap-1 text-[12px] font-bold text-rose-600">
          <X size={13} strokeWidth={3} />
          {errMsg}
        </span>
      )}
      <div className="flex-1" />
      <button
        onClick={onClose}
        className="h-8 px-4 text-[12px] font-semibold bg-white border border-zinc-300 hover:bg-zinc-50 rounded-lg text-zinc-700 transition cursor-pointer"
      >
        취소
      </button>
      <button
        onClick={handleSubmit}
        disabled={saving || amountNum <= 0}
        className="inline-flex items-center gap-1.5 h-8 px-5 text-[12px] font-bold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition shadow-sm cursor-pointer"
      >
        {saving ? <Spinner size={12} tone="white" /> : <Check size={12} strokeWidth={2.5} />}
        결제 등록
      </button>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <div className="flex items-center gap-3 min-w-0">
          <IconTile icon={<Wallet size={18} />} tone="emerald" size="lg" />
          <div className="min-w-0">
            <div className="text-[15px] font-bold text-zinc-800 truncate leading-tight">결제 등록</div>
            <div className="text-[11px] text-zinc-500 truncate">{supplierName}</div>
          </div>
        </div>
      }
      className="h-[92vh] md:h-auto md:max-h-[88vh]"
      footer={footer}
    >
      {/* Body */}
      <div className="p-4 sm:p-5 space-y-4">
        {/* 결제 정보 */}
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-3">
          <Field label="결제 날짜 *">
            <input
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="결제 금액 (원) *">
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="0"
              className={`${inputCls} text-right font-mono tabular-nums font-bold`}
            />
            {amountNum > 0 && (
              <p className="text-[11px] text-zinc-400 mt-1 text-right font-mono">{fmtWon(amountNum)}</p>
            )}
          </Field>
          <Field label="결제 방법">
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              className={inputCls}
            >
              {METHOD_OPTIONS.map(m => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="메모">
          <input
            type="text"
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="예: 6월분 결제 · 상계 처리 · 세금계산서 매칭 등"
            className={inputCls}
          />
        </Field>

        {/* 매입건 매칭 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <SectionTitle
              icon={<Package size={13} />}
              title="매입건 매칭 (선택)"
              color="amber"
              hint={loading ? "로딩..." : `${invoices.filter(i => i.status !== "paid").length}건 미결제`}
            />
            <button
              onClick={autoAllocate}
              disabled={amountNum <= 0 || loading}
              className="inline-flex items-center gap-1 h-7 px-3 text-[11px] font-bold rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition cursor-pointer shadow-sm"
              title="상단부터 결제금액만큼 자동 배분"
            >
              <TrendingUp size={11} strokeWidth={2.5} />
              자동 배분
            </button>
          </div>

          <div className="rounded-lg border border-line overflow-auto max-h-[300px] bg-white">
            {loading ? (
              <div className="flex items-center justify-center py-8"><Spinner tone="zinc" label="로딩중..." labelSize={12} /></div>
            ) : invoices.length === 0 ? (
              <div className="py-8 text-center text-zinc-400 text-[12px]">
                매입건 없음 · 결제만 등록 (unallocated payment)
              </div>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 z-10 bg-zinc-50 border-b border-line">
                  <tr className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                    <th className="px-2 py-2 w-8"></th>
                    <th className="text-left px-3 py-2 w-20">일자</th>
                    <th className="text-left px-3 py-2">상품</th>
                    <th className="text-right px-3 py-2 w-20">매입액</th>
                    <th className="text-right px-3 py-2 w-20">잔액</th>
                    <th className="text-right px-3 py-2 w-24">배분</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {invoices.map(inv => {
                    const v = allocMap.get(inv.id);
                    const disabled = inv.status === "paid";
                    return (
                      <tr key={inv.id} className={`transition ${disabled ? "bg-zinc-50/50 opacity-50" : "hover:bg-teal-50/40"}`}>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={v?.checked ?? false}
                            disabled={disabled}
                            onChange={() => toggleCheck(inv.id)}
                            className="w-4 h-4 accent-teal-600 cursor-pointer disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[11px] text-zinc-500 whitespace-nowrap tabular-nums">
                          {String(inv.date).slice(2)}
                        </td>
                        <td className="px-3 py-1.5 text-zinc-700 break-words leading-snug text-[11px]">
                          {inv.product_name}
                          {inv.status === "partial" && <span className="ml-1 text-[10px] font-bold text-amber-600">· 부분</span>}
                          {inv.status === "paid" && <span className="ml-1 text-[10px] font-bold text-zinc-400">· 완납</span>}
                        </td>
                        <td className="text-right px-3 py-1.5 font-mono tabular-nums text-zinc-600 whitespace-nowrap">
                          {Number(inv.amount).toLocaleString()}
                        </td>
                        <td className={`text-right px-3 py-1.5 font-mono font-bold tabular-nums whitespace-nowrap ${
                          inv.remaining > 0 ? "text-rose-700" : "text-zinc-400"
                        }`}>
                          {Number(inv.remaining).toLocaleString()}
                        </td>
                        <td className="text-right px-2 py-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={v?.alloc ?? ""}
                            disabled={disabled || !v?.checked}
                            onChange={e => updateAlloc(inv.id, e.target.value.replace(/[^0-9]/g, ""))}
                            className="w-full h-7 px-2 text-right text-[11px] font-mono tabular-nums border border-line rounded focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep disabled:bg-zinc-50 disabled:text-zinc-400"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* toast */}
        {toast && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10001] pointer-events-none">
            <div className={toastClass(toast.tone)}>{toast.message}</div>
          </div>
        )}

        {/* 합계 요약 · 2026-08-17 · Vercel Dashboard 톤 · white body + status dot */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.03),0_2px_8px_rgba(10,46,74,0.04)] px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <div className="text-[11px] font-semibold text-ink-soft tracking-tight">결제 금액</div>
            </div>
            <div className="text-[15px] font-extrabold font-mono tabular-nums text-emerald-700 leading-tight">{amountNum.toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.03),0_2px_8px_rgba(10,46,74,0.04)] px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
              <div className="text-[11px] font-semibold text-ink-soft tracking-tight">배분 총액</div>
            </div>
            <div className="text-[15px] font-extrabold font-mono tabular-nums text-teal-700 leading-tight">{allocSum.toLocaleString()}</div>
          </div>
          {(() => {
            const isMatch = Math.abs(diff) < 0.5;
            const isPos = diff > 0;
            const dotCls = isMatch ? "bg-emerald-500" : isPos ? "bg-amber-500" : "bg-rose-500";
            const textCls = isMatch ? "text-emerald-700" : isPos ? "text-amber-700" : "text-rose-700";
            const label = isMatch ? "일치" : isPos ? "미배분" : "초과";
            return (
              <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.03),0_2px_8px_rgba(10,46,74,0.04)] px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
                  <div className="text-[11px] font-semibold text-ink-soft tracking-tight">{label}</div>
                </div>
                <div className={`text-[15px] font-extrabold font-mono tabular-nums leading-tight ${textCls}`}>{diff.toLocaleString()}</div>
              </div>
            );
          })()}
        </div>
      </div>
    </Modal>
  );
};

export { PaymentRegisterModal };

