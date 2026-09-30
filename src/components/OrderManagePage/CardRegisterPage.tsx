// src/components/OrderManagePage/CardRegisterPage.tsx
// 2026-09-02 · #69 · 카드 결제 관리 · 결제카드등록 (매장>결제>결제카드등록)
//   · 사용자 지시 · 카드 CRUD 설정 페이지 · 결제일 · 카드사 등록
//   · SplitPanel · 좌 리스트 · 우 편집 폼 · Linear/Vercel 톤 · 폰트 +2

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard as CreditCardIcon, Plus, Trash2, Check, X } from "lucide-react";
import { ApiError } from "../../lib/apiClient";
// 2026-09-14 · creditCardsApi 프리미티브
import { listCreditCards, createCreditCard, updateCreditCard, deleteCreditCard } from "../../lib/creditCardsApi";
import { Card } from "../common/Card";
import { Button } from "../common/Button";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { StatusPill } from "../common/StatusPill";
import { useConfirm } from "../../hooks/useConfirm";
import { useToast, toastClass } from "../../hooks/useToast";
import { SplitPanel } from "../common/SplitPanel";
import { CARD_ISSUERS, type CardIssuer, type CreditCard } from "../../shared/schemas/creditCards";
// 2026-09-30 · #2 · 카드사별 청구기간 계산 (BC카드 공식 신용공여기간 표 기반)
import { calcBillingPeriod, CARD_PAYMENT_GAP } from "../../lib/cardBillingCycle";
// 2026-09-21 · #329 · 한글 IME 우선
import { KO_INPUT_PROPS } from "../../lib/koreanInput";

const inputCls = "w-full h-10 px-3 text-[17px] border border-zinc-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition placeholder:text-zinc-300";
const labelCls = "block text-[15px] font-semibold text-zinc-600 mb-1.5";

type Draft = {
  id: number | null;
  issuer: string;
  alias: string;
  last4: string;
  billing_day: number;
  active: boolean;
  note: string;
  // 2026-09-14 · #129 · 한도·캐시백
  credit_limit: string;    // 텍스트로 관리 · 저장 시 Number 변환
  cashback_rate: string;
};

const emptyDraft = (): Draft => ({
  id: null, issuer: "BC", alias: "", last4: "", billing_day: 15, active: true, note: "",
  credit_limit: "", cashback_rate: "",
});

const draftFromCard = (c: CreditCard): Draft => ({
  id: c.id,
  issuer: c.issuer,
  alias: c.alias ?? "",
  last4: c.last4 ?? "",
  billing_day: c.billing_day,
  active: c.active,
  note: c.note ?? "",
  credit_limit: c.credit_limit != null ? String(c.credit_limit) : "",
  cashback_rate: c.cashback_rate != null ? String(c.cashback_rate) : "",
});

export const CardRegisterPage: React.FC = () => {
  const confirm = useConfirm();
  const { toast, showSuccess, showError } = useToast();
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listCreditCards();
      setCards(list);
      if (selectedId != null) {
        const cur = list.find(c => c.id === selectedId);
        if (cur) setDraft(draftFromCard(cur));
      }
    } catch (e: any) {
      showError(`카드 목록 로드 실패: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, [selectedId, showError]);

  useEffect(() => { load(); }, [load]);

  const handleSelect = (c: CreditCard) => {
    setSelectedId(c.id);
    setDraft(draftFromCard(c));
    setSaveMsg(null);
  };

  const handleNew = () => {
    setSelectedId(null);
    setDraft(emptyDraft());
    setSaveMsg(null);
  };

  const handleSave = async () => {
    if (!draft.issuer.trim()) { setSaveMsg({ type: "err", text: "카드사를 선택해주세요" }); return; }
    if (draft.billing_day < 1 || draft.billing_day > 31) { setSaveMsg({ type: "err", text: "결제일은 1~31 사이" }); return; }
    setSaving(true); setSaveMsg(null);
    try {
      const body: Record<string, any> = {
        issuer: draft.issuer.trim(),
        alias: draft.alias.trim() || null,
        last4: /^\d{4}$/.test(draft.last4) ? draft.last4 : null,
        billing_day: draft.billing_day,
        active: draft.active,
        note: draft.note.trim() || null,
      };
      // 2026-09-14 · #129 · 한도·캐시백 · 값 있을 때만 저장
      const cl = draft.credit_limit.replace(/[^0-9]/g, "");
      body.credit_limit = cl ? Number(cl) : null;
      const cb = draft.cashback_rate.trim();
      body.cashback_rate = cb ? Number(cb) : null;
      if (draft.id == null) {
        const created = await createCreditCard(body as any);
        setSelectedId(created?.id ?? null);
        setSaveMsg({ type: "ok", text: "카드 등록 완료" });
        showSuccess("카드가 등록되었습니다");
      } else {
        await updateCreditCard(draft.id, body as any);
        setSaveMsg({ type: "ok", text: "저장 완료" });
        showSuccess("저장되었습니다");
      }
      await load();
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : (e?.message ?? "저장 실패");
      setSaveMsg({ type: "err", text: msg });
      showError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (draft.id == null) return;
    if (!await confirm({ message: `카드 "${draft.alias || draft.issuer}" 를 비활성화(soft delete) 하시겠습니까? 기존 결제 이력은 유지됩니다.`, danger: true })) return;
    try {
      await deleteCreditCard(draft.id, true);
      showSuccess("카드가 비활성화되었습니다");
      handleNew();
      await load();
    } catch (e: any) {
      const msg = `삭제 실패: ${e?.message ?? e}`;
      showError(msg);
    }
  };

  const sortedCards = useMemo(() => {
    return [...cards].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.issuer.localeCompare(b.issuer, "ko");
    });
  }, [cards]);

  // ── 좌측 · 카드 리스트 ──────────────────────────────────────────
  const leftPane = (
    <div className="flex flex-col gap-2 p-1 h-full overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <CreditCardIcon size={18} className="text-brand-deep" />
          <div className="text-[19px] font-bold text-ink">등록된 카드</div>
          <StatusPill tone="zinc">{`${cards.length}장`}</StatusPill>
        </div>
        <Button variant="primary" size="sm" onClick={handleNew}>
          <Plus size={14} /> 신규
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size={16} tone="brand" label="로딩 중..." labelSize={15} />
          </div>
        ) : sortedCards.length === 0 ? (
          <EmptyState icon={CreditCardIcon} title="등록된 카드 없음" hint="[신규] 버튼을 눌러 카드를 등록하세요" size="normal" />
        ) : (
          <ul className="space-y-1.5">
            {sortedCards.map(c => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(c)}
                  className={`w-full text-left rounded-xl border-2 transition ${
                    selectedId === c.id
                      ? "border-brand-deep bg-brand-tint/40"
                      : "border-line bg-white hover:border-brand-deep/40 hover:bg-zinc-50/50"
                  } ${!c.active ? "opacity-60" : ""}`}
                >
                  {/* PC 한 줄 뷰 (sm 이상) */}
                  <div className="hidden sm:flex items-center gap-2 px-3.5 py-2.5">
                    <span className="text-[17px] font-bold text-ink">{c.issuer}</span>
                    {c.alias && <span className="text-[15px] text-zinc-600">· {c.alias}</span>}
                    {!c.active && <StatusPill tone="zinc" size="sm">비활성</StatusPill>}
                    <div className="ml-auto text-[15px] font-semibold text-brand-deep tabular-nums">
                      {c.billing_day}일 결제
                    </div>
                    {c.last4 && (
                      <span className="text-[14px] text-zinc-400 tabular-nums">···· {c.last4}</span>
                    )}
                  </div>
                  {/* 모바일 카드 뷰 (sm 미만) */}
                  <div className="sm:hidden px-3.5 py-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[16px] font-bold text-ink">{c.issuer}</span>
                        {c.alias && (
                          <span className="text-[14px] text-zinc-500 break-words whitespace-normal">
                            {c.alias}
                          </span>
                        )}
                        {!c.active && <StatusPill tone="zinc" size="sm">비활성</StatusPill>}
                      </div>
                      <span className="text-[14px] font-semibold text-brand-deep tabular-nums shrink-0">
                        {c.billing_day}일 결제
                      </span>
                    </div>
                    {c.last4 && (
                      <div className="text-[13px] text-zinc-400 tabular-nums">
                        **** **** **** {c.last4}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  // ── 우측 · 편집 폼 ─────────────────────────────────────────────
  const rightPane = (
    <div className="flex flex-col gap-3 p-1 h-full overflow-auto">
      <Card padding="md" topAccent>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-6 rounded-full bg-brand-deep" />
          <div className="text-[19px] font-bold text-ink">
            {draft.id == null ? "카드 신규 등록" : `카드 수정 · #${draft.id}`}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>카드사 <span className="text-rose-500">*</span></label>
            <select
              value={draft.issuer}
              onChange={e => setDraft({ ...draft, issuer: e.target.value })}
              className={inputCls}
            >
              {CARD_ISSUERS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>별칭 (선택)</label>
            <input
              type="text" {...KO_INPUT_PROPS}
              value={draft.alias}
              onChange={e => setDraft({ ...draft, alias: e.target.value })}
              placeholder="법인 삼성 SDI · 개인 국민 체크 등"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>카드번호 뒷 4자리 (선택)</label>
            <input
              type="text" {...KO_INPUT_PROPS}
              inputMode="numeric"
              value={draft.last4}
              onChange={e => setDraft({ ...draft, last4: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })}
              placeholder="1234"
              maxLength={4}
              className={`${inputCls} font-mono tracking-wider`}
            />
          </div>
          <div>
            <label className={labelCls}>결제일 <span className="text-rose-500">*</span></label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={31}
                value={draft.billing_day}
                onChange={e => setDraft({ ...draft, billing_day: Math.max(1, Math.min(31, Number(e.target.value) || 15)) })}
                className={`${inputCls} tabular-nums`}
              />
              <span className="text-[15px] text-zinc-500 whitespace-nowrap">일</span>
            </div>
            {/* 2026-09-30 · #2 · 카드사별 청구기간 · calcBillingPeriod 사용
                근거 · BC카드 공식 신용공여기간 표 (KB·신한·우리·NH=13일, 하나·삼성=12일, 현대=11일) */}
            {(() => {
              const period = calcBillingPeriod(draft.issuer as CardIssuer, draft.billing_day);
              const gap = CARD_PAYMENT_GAP[draft.issuer as CardIssuer] ?? 13;
              return (
                <div className="mt-1.5 text-[14px] text-brand-deep bg-brand-tint/40 border border-brand/15 rounded-md px-2.5 py-1.5 tabular-nums leading-relaxed">
                  <div className="font-semibold">
                    청구기간 · <b>{period.label}</b> 매입분 → <b>{draft.billing_day}일</b> 청구
                  </div>
                  <div className="text-[12px] text-brand-deep/70 mt-0.5">
                    {draft.issuer} · 신용공여 {gap}일 (BC카드 공식 기준)
                  </div>
                </div>
              );
            })()}
          </div>
          {/* 2026-09-14 · #129 · 한도·캐시백 (선택) */}
          <div>
            <label className={labelCls}>카드 한도 (선택)</label>
            <div className="flex items-center gap-2">
              <input
                type="text" {...KO_INPUT_PROPS}
                inputMode="numeric"
                value={draft.credit_limit ? Number(draft.credit_limit.replace(/[^0-9]/g, "")).toLocaleString() : ""}
                onChange={e => setDraft({ ...draft, credit_limit: e.target.value.replace(/[^0-9]/g, "") })}
                placeholder="10000000"
                className={`${inputCls} tabular-nums`}
              />
              <span className="text-[15px] text-zinc-500 whitespace-nowrap">원</span>
            </div>
          </div>
          <div>
            <label className={labelCls}>캐시백 요율 (선택 · %)</label>
            <div className="flex items-center gap-2">
              <input
                lang="ko" type="number"
                min={0} max={100} step={0.1}
                value={draft.cashback_rate}
                onChange={e => setDraft({ ...draft, cashback_rate: e.target.value })}
                placeholder="0.5"
                className={`${inputCls} tabular-nums`}
              />
              <span className="text-[15px] text-zinc-500 whitespace-nowrap">%</span>
            </div>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>비고 (선택)</label>
            <textarea {...KO_INPUT_PROPS} value={draft.note}
              onChange={e => setDraft({ ...draft, note: e.target.value })}
              placeholder="사용 목적 · 관리자 · 결제 조건 등"
              rows={2}
              className={`${inputCls} h-auto py-2 resize-none`}
            />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={e => setDraft({ ...draft, active: e.target.checked })}
                className="w-4 h-4 accent-brand-deep cursor-pointer"
              />
              <span className={`text-[16px] font-semibold ${draft.active ? "text-brand-deep" : "text-zinc-400"}`}>
                활성 카드 (결제 등록 시 dropdown 에 표시)
              </span>
            </label>
          </div>
        </div>

        {/* 하단 액션 */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-zinc-100">
          {saveMsg && (
            <span className={`inline-flex items-center gap-1.5 text-[15px] font-bold ${saveMsg.type === "ok" ? "text-emerald-600" : "text-rose-600"}`}>
              {saveMsg.type === "ok" ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
              {saveMsg.text}
            </span>
          )}
          <div className="flex-1" />
          {draft.id != null && (
            <Button variant="danger" size="md" onClick={handleDelete}>
              <Trash2 size={14} /> 비활성화
            </Button>
          )}
          <Button variant="primary" size="md" onClick={handleSave} loading={saving}>
            <Check size={14} /> {draft.id == null ? "등록" : "저장"}
          </Button>
        </div>
      </Card>
    </div>
  );

  return (
    <>
      <SplitPanel
        storageKey="cardRegister.listWidth"
        defaultWidth={360}
        minWidth={280}
        dividerColor="indigo"
        left={leftPane}
        right={rightPane}
        mobileRightAsModal
        mobileModalTitle={draft.id == null ? "카드 신규 등록" : "카드 수정"}
        mobileOpen={draft.id != null || draft !== null}
        onMobileClose={handleNew}
      />
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10002] pointer-events-none">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </>
  );
};

export default CardRegisterPage;
