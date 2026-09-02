// 2026-08-22 · Framework Phase 4 · PaymentInfoTab.tsx large-file 분리 (2차)
// 결제 입력 폼 (self-contained · vendor 변경 시 key remount)
//   · 폼 상태 12개 · VAT 자동 계산 · 저장 검증 · api.post · 성공 후 onSubmitted 콜백
//   · 부모는 selectedVendor 를 감지해 balance/monthly/recent 로드 후 이 폼 렌더
//   · key={selectedVendor.id} 로 vendor 변경 시 자동 리셋 (별도 리셋 effect 불필요)

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Check, X, CalendarDays, Calendar, CreditCard as CreditCardIcon } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import { api } from "../../lib/apiClient";
import { useApiCall } from "../../hooks/useApiCall";
import { getErrorMessage } from "../../lib/errorMessage";
import type {
  PaymentRow, VendorItem, BalanceResp, PayMethod,
} from "./PaymentInfoTab.types";
import {
  fmtWonShort, todayYmd, encodeMemo, computeVat,
  BANKS, METHOD_OPTIONS,
} from "./PaymentInfoTab.utils";
import { AmountField, FieldLabel, inputCls } from "./PaymentInfoTab.subcomponents";
// 2026-09-02 · #69 · 결제카드 dropdown · credit_cards 목록
import type { CreditCard } from "../../shared/schemas/creditCards";

interface PaymentEntryFormProps {
  selectedVendor: VendorItem;
  balance: BalanceResp | null;
  vatIncluded: boolean;
  onSubmitted: (supplierName: string) => void | Promise<void>;
}

export const PaymentEntryForm: React.FC<PaymentEntryFormProps> = ({
  selectedVendor, balance, vatIncluded, onSubmitted,
}) => {
  const [paymentDate, setPaymentDate] = useState<string>(todayYmd());
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<PayMethod>("card");
  // 2026-09-02 · #69 · 사용자 지시 · 카드사 → 결제카드 dropdown · credit_cards 목록
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [bankName, setBankName] = useState<string>("");
  const [bankNameCustom, setBankNameCustom] = useState<string>("");
  const [etcNote, setEtcNote] = useState<string>("");
  const [referenceNo, setReferenceNo] = useState<string>("");
  const [taxInvoiceIssued, setTaxInvoiceIssued] = useState<boolean>(false);
  const [taxInvoiceNo, setTaxInvoiceNo] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const { call: saveCall, loading: saving } = useApiCall({
    successMsg: "결제 등록 완료",
    errorPrefix: "저장 실패",
    onSuccess: () => setMsg({ type: "ok", text: "결제 등록 완료" }),
    onError: (e: unknown) => {
      const raw = getErrorMessage(e, String(e));
      setMsg({ type: "err", text: `저장 실패: ${raw}` });
    },
  });

  // 2026-09-02 · 카드 목록 로드 (active 만)
  useEffect(() => {
    let alive = true;
    api.get<CreditCard[]>("/api/credit-cards?active=1")
      .then(({ data }) => { if (alive) setCards(Array.isArray(data) ? data : []); })
      .catch(() => { if (alive) setCards([]); });
    return () => { alive = false; };
  }, []);

  const paymentDateRef = useRef<HTMLInputElement | null>(null);
  const openDatePicker = useCallback(() => {
    const el = paymentDateRef.current;
    if (!el) return;
    if (typeof (el as any).showPicker === "function") {
      try { (el as any).showPicker(); return; } catch { /* fallthrough */ }
    }
    el.focus();
    try { el.click(); } catch { /* ignore */ }
  }, []);

  const amountNum = Number(String(amount).replace(/[^0-9]/g, "")) || 0;
  const { supply: supplyAmt, vat: vatAmt } = useMemo(
    () => computeVat(amountNum, vatIncluded),
    [amountNum, vatIncluded]
  );
  const currentBalance = balance?.balance ?? 0;
  const overBalance = amountNum > 0 && currentBalance > 0 && amountNum > currentBalance;

  const handleSubmit = async () => {
    setMsg(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      setMsg({ type: "err", text: "결제일 형식 오류 (YYYY-MM-DD)" });
      return;
    }
    if (amountNum <= 0) {
      setMsg({ type: "err", text: "결제 금액은 양수여야 합니다" });
      return;
    }

    // 2026-09-02 · #69 · card 결제 · credit_cards 에서 선택된 카드 정보 사용
    const selectedCard = selectedCardId ? cards.find(c => c.id === selectedCardId) : null;
    const resolvedCard = method === "card"
      ? (selectedCard ? `${selectedCard.issuer}${selectedCard.alias ? " · " + selectedCard.alias : ""}${selectedCard.last4 ? " (**" + selectedCard.last4 + ")" : ""}` : "")
      : "";
    const resolvedBank = method === "transfer"
      ? (bankName === "직접입력" ? bankNameCustom.trim() : bankName)
      : "";

    if (method === "card" && !selectedCardId) {
      setMsg({ type: "err", text: "결제카드를 선택하세요 · 등록된 카드가 없으면 [매장>결제>결제카드등록] 에서 먼저 등록" });
      return;
    }
    if (method === "transfer" && !resolvedBank) {
      setMsg({ type: "err", text: "은행을 선택하세요" });
      return;
    }

    const meta: NonNullable<PaymentRow["meta"]> = {
      card_issuer: resolvedCard || undefined,
      bank_name: resolvedBank || undefined,
      reference_no: referenceNo.trim() || undefined,
      tax_invoice_issued: taxInvoiceIssued || undefined,
      tax_invoice_no: taxInvoiceIssued ? (taxInvoiceNo.trim() || undefined) : undefined,
      vat_amount: taxInvoiceIssued ? vatAmt : undefined,
    };
    const finalMemo = encodeMemo(meta, note);

    setMsg(null);
    const result = await saveCall(() => api.post("/api/supplier-payments", {
      supplier_name: selectedVendor.company_name,
      payment_date: paymentDate,
      amount: amountNum,
      method,
      memo: finalMemo || null,
      // 2026-09-02 · #69 · 카드 결제 시 · credit_cards.id FK
      card_id: method === "card" ? selectedCardId : null,
    }));
    if (result) {
      // 리셋 (일부만 · vendor 유지 · 이력 반영 후 재입력 가능)
      setAmount("");
      setReferenceNo("");
      setTaxInvoiceNo("");
      setNote("");
      setTaxInvoiceIssued(false);
      // 부모 리로드 (balance · recent · monthly) + 이벤트
      await onSubmitted(selectedVendor.company_name);
      window.dispatchEvent(new CustomEvent("supplier-payment-added", {
        detail: { supplier: selectedVendor.company_name },
      }));
    }
  };

  return (
    <Card padding="none" rounded="2xl" clip topAccent className="flex flex-col">

      {/* 폼 헤더 */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-zinc-100 bg-emerald-50/60 shrink-0">
        <div className="w-7 h-7 rounded-xl bg-emerald-100 flex items-center justify-center ring-1 ring-emerald-200 shrink-0">
          <Plus size={14} className="text-emerald-700" strokeWidth={2.5} />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[15px] font-bold text-zinc-800">결제 등록</span>
          <span className="text-[14px] text-zinc-400">{selectedVendor.company_name}</span>
        </div>
        {vatIncluded && (
          <span className="ml-auto text-[14px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 shrink-0">
            VAT 포함가
          </span>
        )}
      </div>

      <div className="flex flex-col gap-0 divide-y divide-zinc-50">

        {/* ── 그룹 A · 날짜 + 결제방법 ──────────────────── */}
        <div className="px-4 py-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {/* 결제일 */}
            <FieldLabel label="결제일" icon={<CalendarDays size={11} />} required>
              <div className="flex items-center gap-1.5">
                <input
                  ref={paymentDateRef}
                  type="date"
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  className={`${inputCls} flex-1 min-w-0 px-2 [&::-webkit-calendar-picker-indicator]:hidden`}
                />
                <button
                  type="button"
                  onClick={openDatePicker}
                  title="달력 열기"
                  aria-label="달력 열기"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-white hover:bg-emerald-50 hover:border-emerald-400 text-zinc-400 hover:text-emerald-600 transition cursor-pointer shrink-0"
                >
                  <Calendar size={13} strokeWidth={2.25} />
                </button>
              </div>
            </FieldLabel>

            {/* 결제방법 */}
            <FieldLabel label="결제 방법" required>
              <div className="flex items-center gap-1.5">
                {METHOD_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setMethod(opt.key)}
                    className={`flex-1 h-9 rounded-lg text-[15px] font-bold border transition cursor-pointer ${
                      method === opt.key
                        ? opt.key === "card"
                          ? "bg-brand-deep border-indigo-600 text-white shadow-sm"
                          : opt.key === "cash"
                          ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                          : "bg-zinc-600 border-zinc-600 text-white shadow-sm"
                        : "bg-white border-line text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </FieldLabel>
          </div>

          {/* 2026-09-02 · #69 · 사용자 지시 · 카드사 → 결제카드 선택 (credit_cards dropdown) + 바로가기 링크 */}
          {method === "card" && (
            <div className="flex items-end gap-3">
              <div className="flex-1 min-w-0">
                <FieldLabel label="결제카드 선택">
                  {cards.length === 0 ? (
                    <div className="text-[15px] text-rose-600 font-semibold px-2 py-2 bg-rose-50 border border-rose-200 rounded-lg">
                      등록된 카드 없음 · [매장 &gt; 결제 &gt; 결제카드등록] 에서 먼저 등록
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none">
                        <CreditCardIcon size={14} className="text-brand-deep" />
                      </div>
                      <select
                        value={selectedCardId ?? ""}
                        onChange={e => setSelectedCardId(e.target.value ? Number(e.target.value) : null)}
                        className={`${inputCls} pl-8`}
                      >
                        <option value="">카드 선택...</option>
                        {cards.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.issuer}{c.alias ? " · " + c.alias : ""}{c.last4 ? " (**" + c.last4 + ")" : ""} · {c.billing_day}일 결제
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </FieldLabel>
              </div>
              <div className="flex-1 min-w-0">
                <AmountField
                  amount={amount}
                  setAmount={setAmount}
                  inputCls={inputCls}
                  overBalance={overBalance}
                  currentBalance={currentBalance}
                />
              </div>
            </div>
          )}
          {/* cash: 은행 선택 (좌) + 결제금액 (우) */}
          {method === "cash" && (
            <div className="flex items-end gap-3">
              <div className="flex-1 min-w-0">
                {bankName === "직접입력" ? (
                  <FieldLabel label="은행명 직접입력">
                    <input
                      type="text"
                      value={bankNameCustom}
                      onChange={e => setBankNameCustom(e.target.value)}
                      placeholder="은행 이름"
                      className={inputCls}
                    />
                  </FieldLabel>
                ) : (
                  <FieldLabel label="은행">
                    <select
                      value={bankName}
                      onChange={e => setBankName(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">은행 선택...</option>
                      {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                      <option value="직접입력">직접 입력...</option>
                    </select>
                  </FieldLabel>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <AmountField
                  amount={amount}
                  setAmount={setAmount}
                  inputCls={inputCls}
                  overBalance={overBalance}
                  currentBalance={currentBalance}
                />
              </div>
            </div>
          )}
          {/* etc: 결제방법 설명 (좌) + 결제금액 (우) */}
          {method === "etc" && (
            <div className="flex items-end gap-3">
              <div className="flex-1 min-w-0">
                <FieldLabel label="결제 방법 설명">
                  <input
                    type="text"
                    value={etcNote}
                    onChange={e => setEtcNote(e.target.value)}
                    placeholder="예: 페이코 · 카카오페이 · 상계 · 어음 등"
                    className={inputCls}
                  />
                </FieldLabel>
              </div>
              <div className="flex-1 min-w-0">
                <AmountField
                  amount={amount}
                  setAmount={setAmount}
                  inputCls={inputCls}
                  overBalance={overBalance}
                  currentBalance={currentBalance}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── 그룹 B · VAT 분리 표시 + 초과 경고 ────────────── */}
        {(amountNum > 0 || overBalance) && (
        <div className="px-4 pb-3 -mt-1">
          <div className={`rounded-lg px-3 py-2 flex flex-col gap-1 ${overBalance ? "bg-amber-50 border border-amber-200" : "bg-zinc-50 border border-zinc-100"}`}>
            {amountNum > 0 && taxInvoiceIssued && (
              <div className="flex items-center justify-between text-[15px] tabular-nums">
                <span className="text-zinc-500">공급가액</span>
                <span className="font-bold text-zinc-700">{supplyAmt.toLocaleString()}원</span>
              </div>
            )}
            {amountNum > 0 && taxInvoiceIssued && (
              <div className="flex items-center justify-between text-[15px] tabular-nums">
                <span className="text-zinc-500">부가세 (10%)</span>
                <span className="font-bold text-teal-700">{vatAmt.toLocaleString()}원</span>
              </div>
            )}
            {amountNum > 0 && !taxInvoiceIssued && (
              <div className="text-[14px] text-zinc-400">세금계산서 체크 시 VAT 자동 분리</div>
            )}
            {overBalance && (
              <div className="flex items-center gap-1 text-[15px] font-bold text-amber-700">
                <span>잔고 초과</span>
                <span className="tabular-nums text-amber-600">({fmtWonShort(currentBalance)} 잔고)</span>
              </div>
            )}
          </div>
        </div>
        )}

        {/* ── 그룹 C · 세금계산서 (접이식 토글) ────────────── */}
        <div className="px-4 py-3">
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <div className={`relative w-8 h-4.5 rounded-full transition-colors shrink-0 ${taxInvoiceIssued ? "bg-teal-500" : "bg-zinc-200"}`}
              style={{ height: "18px" }}>
              <input
                type="checkbox"
                checked={taxInvoiceIssued}
                onChange={e => setTaxInvoiceIssued(e.target.checked)}
                className="sr-only"
              />
              <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${taxInvoiceIssued ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
            <div className="flex flex-col leading-tight">
              <span className={`text-[14px] font-bold transition ${taxInvoiceIssued ? "text-teal-700" : "text-zinc-600 group-hover:text-zinc-800"}`}>
                세금계산서 발행
              </span>
              {!taxInvoiceIssued && (
                <span className="text-[14px] text-zinc-400">활성화 시 공급가액·VAT 자동 계산</span>
              )}
            </div>
            {taxInvoiceIssued && amountNum > 0 && (
              <span className="ml-auto text-[14px] font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-md px-2 py-0.5 tabular-nums shrink-0">
                VAT {vatAmt.toLocaleString()}원
              </span>
            )}
          </label>
        </div>

        {/* ── 그룹 D · 메모 ──────────────────────────────── */}
        <div className="px-4 py-3">
          <FieldLabel label="메모 (선택)">
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="6월분 결제 · 부분 결제 · 특이사항 등"
              rows={2}
              className={`${inputCls} py-2 resize-none leading-snug`}
            />
          </FieldLabel>
        </div>

      </div>{/* divide-y wrapper close */}

      {/* ── 상태 메시지 + 저장 버튼 ────────────────────── */}
      <div className="px-4 py-3 border-t border-zinc-100 bg-zinc-50/50 flex items-center gap-2 shrink-0">
        {msg && (
          <span className={`inline-flex items-center gap-1 text-[14px] font-bold ${
            msg.type === "ok" ? "text-emerald-600" : "text-rose-600"
          }`}>
            {msg.type === "ok" ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}
            {msg.text}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || amountNum <= 0}
          className="inline-flex items-center gap-1.5 h-9 px-6 rounded-xl bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] active:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[14px] font-bold shadow-sm hover:shadow-md transition-all cursor-pointer"
        >
          {saving ? <Spinner size={13} tone="white" /> : <Check size={13} strokeWidth={3} />}
          {saving ? "등록 중..." : "결제 등록"}
        </button>
      </div>
    </Card>
  );
};
