// src/components/OrderManagePage/BorrowingDetailPanel.tsx
// 2026-08-31 · #9 차용등록 재설계 Phase D · 우측 상세 패널
//
//   · Header · #id · contract_no + 상태 pill + 등록일
//   · BorrowingPartyCard(lender) + BorrowingArrow + BorrowingPartyCard(borrower)
//   · SignatureStampSlot × 4 · lender / borrower / lender_return / borrower_return
//   · Timeline · 계약 체결 → 기한 초과 알림 → 반환 완료
//   · 액션 CTA · 반환 처리 (open) · 취소 (open) · 재열림 (settled/cancelled) · 삭제
//   · 데이터 · borrowingsApi.listSignatures(id) + row 조합
//   · Legacy fallback · flat signature_url / return_signature_url · 별도 "등록 서명" 이미지 영역
//
//   대원칙:
//     1. 프레임워크 프리미티브 100% (Card/StatusPill/SignatureStampSlot/BorrowingPartyCard/BorrowingArrow/Modal/SignaturePad/Spinner/EmptyState)
//     2. UI + 데이터 조회만 · borrowingsApi 사용 · 신규 endpoint X
//     3. 회귀 X · 신규 파일 · 원본 BorrowingPage.tsx 무영향
//     4. 폰트 +2 · 말줄임표 금지
//     5. try/catch + prefix 로그 + toast
//     6. iOS 코드 무수정 (SignaturePad 는 그대로 재사용)
//     7. 파괴적 액션 (삭제·취소) · useConfirm 필수

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  HandCoins, Trash2, CheckCircle2, X, RotateCcw, PenTool, Clock, Save,
  Inbox, FileSignature, AlertTriangle,
} from "lucide-react";
import { Card } from "../common/Card";
import { Spinner } from "../common/Spinner";
import { Modal } from "../common/Modal";
import { StatusPill } from "../common/StatusPill";
import { EmptyState } from "../common/EmptyState";
import { SignaturePad } from "../common/SignaturePad";
import { BorrowingPartyCard, type BorrowingParty as PartyCardData } from "../common/borrowing/BorrowingPartyCard";
import { BorrowingArrow } from "../common/borrowing/BorrowingArrow";
import { SignatureStampSlot, type SignatureRecord } from "../common/borrowing/SignatureStampSlot";
import {
  listSignatures,
  returnBorrowing,
  patchBorrowing,
  deleteBorrowing,
  type BorrowingRow,
  type BorrowingSignature,
} from "../../lib/borrowingsApi";
import { useToast, toastClass } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { ApiError } from "../../lib/apiClient";
import type { AuthSession } from "../../types";

// ═══════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════

export interface BorrowingDetailPanelProps {
  row: BorrowingRow | null;
  onChanged?: (row: BorrowingRow) => void;   // 상태 변경 (반환·취소·재열림) · 리스트 재동기
  onDeleted?: (id: number) => void;          // 삭제 후 · 리스트에서 제거·선택 해제
  authSession?: AuthSession | null;
}

// ═══════════════════════════════════════════════════════
// Helper · direction 별 SELF/공급사 라벨
//   · lend  · lender=공급사 · borrower=약국
//   · borrow · lender=약국    · borrower=공급사
// ═══════════════════════════════════════════════════════

const SELF_LABEL = "약국";

function partyForCard(row: BorrowingRow, role: "lender" | "borrower"): PartyCardData | null {
  const supplier = row.supplier ?? null;
  const isLender = role === "lender";
  const isSupplierSide = (row.direction === "lend" && isLender) || (row.direction === "borrow" && !isLender);
  const name = isSupplierSide ? (supplier ?? "미지정") : SELF_LABEL;
  return {
    name,
    party_type: isSupplierSide ? "vendor" : "self",
  };
}

// ═══════════════════════════════════════════════════════
// yyyy-MM-dd HH:mm 짧게
// ═══════════════════════════════════════════════════════

function fmtTs(ts?: string | null): string {
  if (!ts) return "-";
  return String(ts).slice(0, 16).replace("T", " ");
}

// ═══════════════════════════════════════════════════════
// 상세 패널 본체
// ═══════════════════════════════════════════════════════

export const BorrowingDetailPanel: React.FC<BorrowingDetailPanelProps> = ({
  row, onChanged, onDeleted, authSession,
}) => {
  const [sigs, setSigs] = useState<BorrowingSignature[]>([]);
  const [loadingSig, setLoadingSig] = useState(false);
  const [sigError, setSigError] = useState<string | null>(null);

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnPad, setReturnPad] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [returning, setReturning] = useState(false);

  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { toast, showError, showSuccess } = useToast();
  const confirm = useConfirm();

  // ── 서명 이력 로드 ─────────────────────────────────────
  useEffect(() => {
    if (!row) { setSigs([]); return; }
    setLoadingSig(true);
    setSigError(null);
    listSignatures(row.id)
      .then((rs) => setSigs(rs))
      .catch((e: unknown) => {
        const msg = e instanceof ApiError ? e.message : (e as { message?: string })?.message ?? "네트워크 오류";
        console.error("[BorrowingDetailPanel] listSignatures 실패:", msg);
        setSigError(msg);
        setSigs([]);
      })
      .finally(() => setLoadingSig(false));
  }, [row?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── 서명 role 별 최신 매핑 ─────────────────────────────
  const sigByRole = useMemo(() => {
    const m: Partial<Record<SignatureRecord["role"], SignatureRecord>> = {};
    for (const s of sigs) {
      // 같은 role 이 여러 건이면 · signed_at 최신 우선
      const prev = m[s.role];
      if (!prev || String(s.signed_at) > String(prev.signed_at)) {
        m[s.role] = {
          role: s.role,
          signer_name: s.signer_name,
          signature_url: s.signature_url,
          stamp_url: s.stamp_url ?? null,
          signed_at: s.signed_at,
          ip_address: s.ip_address ?? null,
          intent_text: s.intent_text ?? null,
        };
      }
    }
    return m;
  }, [sigs]);

  // ── 반환 처리 (인라인 Modal · 서명 필수) ────────────────
  const handleReturnSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!row) return;
    if (!returnPad.trim()) { showError("반환 서명이 필요합니다"); return; }
    setReturning(true);
    try {
      const updated = await returnBorrowing(row.id, {
        return_signature_url: returnPad,
        return_note: returnNote.trim() || undefined,
      });
      showSuccess(`반환 처리 완료 · ${updated.product_name ?? `#${updated.id}`}`);
      onChanged?.(updated);
      // 서명 이력 재조회 (신규 return 서명이 서버에서 추가됐을 수 있음)
      try {
        const fresh = await listSignatures(row.id);
        setSigs(fresh);
      } catch (e: unknown) {
        // 조회 실패는 silent · 이미 성공 처리
        console.warn("[BorrowingDetailPanel] 반환 후 서명 재조회 실패:", e);
      }
      setReturnOpen(false);
      setReturnPad("");
      setReturnNote("");
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : (e as { message?: string })?.message ?? "네트워크 오류";
      showError(`반환 실패: ${msg}`);
      console.error("[BorrowingDetailPanel] returnBorrowing 실패:", msg);
    } finally {
      setReturning(false);
    }
  }, [row, returnPad, returnNote, onChanged, showError, showSuccess]);

  // ── 취소 (open → cancelled) · 확인 필수 ─────────────────
  const handleCancel = useCallback(async () => {
    if (!row) return;
    const label = row.product_name ?? `#${row.id}`;
    if (!(await confirm({ message: `${label} · 계약을 취소 상태로 변경할까요?`, danger: false }))) return;
    setBusy(true);
    try {
      const updated = await patchBorrowing(row.id, { status: "cancelled" });
      showSuccess("계약을 취소했습니다");
      onChanged?.(updated);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : (e as { message?: string })?.message ?? "네트워크 오류";
      showError(`취소 실패: ${msg}`);
      console.error("[BorrowingDetailPanel] cancel 실패:", msg);
    } finally { setBusy(false); }
  }, [row, confirm, onChanged, showError, showSuccess]);

  // ── 재열림 (settled/cancelled → open) ──────────────────
  const handleReopen = useCallback(async () => {
    if (!row) return;
    setBusy(true);
    try {
      const updated = await patchBorrowing(row.id, { status: "open" });
      showSuccess("다시 미해결 상태로 복귀했습니다");
      onChanged?.(updated);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : (e as { message?: string })?.message ?? "네트워크 오류";
      showError(`재열림 실패: ${msg}`);
      console.error("[BorrowingDetailPanel] reopen 실패:", msg);
    } finally { setBusy(false); }
  }, [row, onChanged, showError, showSuccess]);

  // ── 삭제 · danger 확인 필수 ─────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!row) return;
    const label = row.product_name ?? `#${row.id}`;
    if (!(await confirm({
      message: `${label} · 차용 기록을 완전 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
      danger: true,
      confirmLabel: "삭제",
    }))) return;
    setBusy(true);
    try {
      await deleteBorrowing(row.id);
      showSuccess("삭제되었습니다");
      onDeleted?.(row.id);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : (e as { message?: string })?.message ?? "네트워크 오류";
      showError(`삭제 실패: ${msg}`);
      console.error("[BorrowingDetailPanel] delete 실패:", msg);
    } finally { setBusy(false); }
  }, [row, confirm, onDeleted, showError, showSuccess]);

  // ═══════════════════════════════════════════════════════
  // Empty · row 미선택
  // ═══════════════════════════════════════════════════════
  if (!row) {
    return (
      <Card padding="none" rounded="xl" clip className="h-full min-h-[520px] flex flex-col">
        <div className="flex-1 flex items-center justify-center p-6">
          <EmptyState
            icon={Inbox}
            title="계약을 선택하세요"
            hint="좌측 리스트에서 항목을 선택하면 · 서명·감사 이력·Timeline 이 여기에 표시됩니다"
            size="large"
          />
        </div>
      </Card>
    );
  }

  const isOpen      = row.status === "open";
  const isSettled   = row.status === "settled";
  const isCancelled = row.status === "cancelled";
  const statusTone: "amber" | "emerald" | "zinc" =
    isOpen ? "amber" : isSettled ? "emerald" : "zinc";
  const statusLabel = isOpen ? "미해결" : isSettled ? "정산완료" : "취소";

  // 기한 초과 판정 (open + due_date < today)
  const today = new Date().toISOString().slice(0, 10);
  const overdue = isOpen && row.due_date != null && row.due_date < today;

  // 상품 요약 (Arrow 중앙 라벨)
  const productSummary = (() => {
    const parts: string[] = [];
    if (row.product_name) parts.push(row.product_name);
    if (row.qty != null && row.qty > 0) parts.push(`${row.qty.toLocaleString()}개`);
    if (row.unit_price != null && row.unit_price > 0) parts.push(`${row.unit_price.toLocaleString()}원`);
    return parts.length ? parts.join(" · ") : undefined;
  })();

  const arrowStatus: "open" | "settled" | "overdue" = overdue ? "overdue" : isSettled ? "settled" : "open";

  // Legacy fallback · flat signature_url · signatures 테이블에 lender/borrower 서명이 없을 때만 표시
  const hasLegacySignature = !!row.signature_url && !sigByRole.lender && !sigByRole.borrower;
  const hasLegacyReturnSignature = !!row.return_signature_url && !sigByRole.lender_return && !sigByRole.borrower_return;

  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}

      <Card padding="none" rounded="xl" clip className="h-full min-h-[520px] flex flex-col">
        {/* ─── Header · id · contract_no · 상태 · 등록일 ─── */}
        <div className="shrink-0 px-4 py-3 border-b border-line bg-white flex items-center gap-2 flex-wrap">
          <HandCoins size={17} className="text-brand-deep shrink-0" />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[16px] font-extrabold text-ink tracking-tight break-keep">
                #{row.id}
              </span>
              {row.contract_no && (
                <span className="text-[12px] font-mono text-ink-soft bg-zinc-50 border border-line px-1.5 py-0.5 rounded">
                  {row.contract_no}
                </span>
              )}
              <StatusPill tone={statusTone} size="sm">{statusLabel}</StatusPill>
              {overdue && <StatusPill tone="rose" size="sm">기한 초과</StatusPill>}
            </div>
            <div className="text-[12px] text-ink-soft mt-0.5 tabular-nums">
              등록 · {fmtTs(row.created_at)}
              {row.created_by && <> · {row.created_by}</>}
            </div>
          </div>
          {loadingSig && <Spinner size={12} tone="brand" className="ml-auto" />}
        </div>

        {/* ─── Body · scrollable ─── */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Party · Arrow · Party */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center">
            <BorrowingPartyCard role="lender"   party={partyForCard(row, "lender")} />
            <BorrowingArrow status={arrowStatus} productSummary={productSummary} className="py-2" />
            <BorrowingPartyCard role="borrower" party={partyForCard(row, "borrower")} />
          </div>

          {/* 상세 요약 정보 */}
          <div className="border-t border-line pt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[14px]">
            <div>
              <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">방향</span>
              <div className="text-ink font-semibold">
                {row.direction === "lend" ? "공급사 → 약국 · 대여" : "약국 → 공급사 · 차용"}
              </div>
            </div>
            <div>
              <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">공급사</span>
              <div className="text-ink font-semibold break-keep">{row.supplier ?? "-"}</div>
            </div>
            <div>
              <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">수량 · 단가</span>
              <div className="text-ink font-semibold tabular-nums">
                {(row.qty ?? 0).toLocaleString()}
                {row.unit_price != null && <> · @ {row.unit_price.toLocaleString()}원</>}
              </div>
            </div>
            <div>
              <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">예정일</span>
              <div className={`font-semibold tabular-nums ${overdue ? "text-rose-600" : "text-ink"}`}>
                {row.due_date ?? "-"}
              </div>
            </div>
            {row.product_code && (
              <div className="col-span-2">
                <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">상품코드</span>
                <div className="text-ink font-mono text-[13px]">{row.product_code}</div>
              </div>
            )}
            {row.note && (
              <div className="col-span-2">
                <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">사유·메모</span>
                <div className="mt-1 p-2.5 bg-zinc-50 border border-line rounded-lg text-[13px] text-ink whitespace-pre-wrap break-keep">
                  {row.note}
                </div>
              </div>
            )}
          </div>

          {/* ─── 서명 슬롯 4종 ─── */}
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <div className="flex items-center gap-1.5">
              <PenTool size={13} className="text-ink-soft" />
              <span className="text-[13px] font-bold text-ink-soft uppercase tracking-wider">서명 · 감사 이력</span>
              {sigError && (
                <span className="text-[11px] font-bold text-rose-600 ml-1 normal-case tracking-normal inline-flex items-center gap-1">
                  <AlertTriangle size={11} />
                  {sigError}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <SignatureStampSlot role="lender"          signature={sigByRole.lender ?? null} />
              <SignatureStampSlot role="borrower"        signature={sigByRole.borrower ?? null} />
              <SignatureStampSlot role="lender_return"   signature={sigByRole.lender_return ?? null} />
              <SignatureStampSlot role="borrower_return" signature={sigByRole.borrower_return ?? null} />
            </div>

            {/* Legacy fallback · flat signature_url · 별도 "등록 서명" 이미지 영역 */}
            {(hasLegacySignature || hasLegacyReturnSignature) && (
              <div className="mt-1 p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <FileSignature size={12} className="text-amber-700" />
                  <span className="text-[12px] font-bold text-amber-800 uppercase tracking-wider">
                    Legacy 서명 (구 데이터)
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {hasLegacySignature && row.signature_url && (
                    <button
                      type="button"
                      onClick={() => setSignaturePreview(row.signature_url!)}
                      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[12px] font-bold text-brand-deep bg-white border border-line hover:border-brand-deep hover:bg-brand-tint/20 cursor-pointer"
                      title="등록 서명 미리보기"
                    >
                      <FileSignature size={12} /> 등록 서명
                    </button>
                  )}
                  {hasLegacyReturnSignature && row.return_signature_url && (
                    <button
                      type="button"
                      onClick={() => setSignaturePreview(row.return_signature_url!)}
                      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[12px] font-bold text-emerald-700 bg-white border border-line hover:border-emerald-600 hover:bg-emerald-50 cursor-pointer"
                      title={`반환 서명 · ${row.returned_by ?? "-"} · ${fmtTs(row.returned_at)}`}
                    >
                      <CheckCircle2 size={12} /> 반환 서명
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ─── Timeline · 계약 → 알림 → 반환 ─── */}
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <div className="flex items-center gap-1.5">
              <Clock size={13} className="text-ink-soft" />
              <span className="text-[13px] font-bold text-ink-soft uppercase tracking-wider">Timeline · 감사 로그</span>
            </div>
            <div className="pl-1 space-y-2.5">
              {/* 계약 체결 */}
              <div className="flex items-start gap-2.5">
                <div className="w-2 h-2 rounded-full bg-brand-deep mt-1.5 shrink-0 ring-2 ring-brand-tint" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-ink">계약 체결</div>
                  <div className="text-[12px] text-ink-soft tabular-nums">
                    {fmtTs(row.created_at)}
                    {row.created_by && <> · {row.created_by}</>}
                  </div>
                  {row.note && (
                    <div className="text-[12px] text-ink-soft mt-0.5 italic break-keep">"{row.note}"</div>
                  )}
                </div>
              </div>

              {/* 기한 초과 알림 */}
              {row.overdue_notified_at && (
                <div className="flex items-start gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0 ring-2 ring-amber-100" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-amber-800">기한 초과 알림</div>
                    <div className="text-[12px] text-ink-soft tabular-nums">{fmtTs(row.overdue_notified_at)}</div>
                  </div>
                </div>
              )}

              {/* 반환 완료 */}
              {row.returned_at && (
                <div className="flex items-start gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0 ring-2 ring-emerald-100" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-emerald-800">반환 완료</div>
                    <div className="text-[12px] text-ink-soft tabular-nums">
                      {fmtTs(row.returned_at)}
                      {row.returned_by && <> · {row.returned_by}</>}
                    </div>
                    {row.return_note && (
                      <div className="text-[12px] text-ink-soft mt-0.5 italic break-keep">"{row.return_note}"</div>
                    )}
                  </div>
                </div>
              )}

              {/* 정산·취소 pseudo-이벤트 (returned_at 이 없어도 상태만 바뀐 경우) */}
              {isCancelled && !row.returned_at && (
                <div className="flex items-start gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-zinc-400 mt-1.5 shrink-0 ring-2 ring-zinc-100" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-zinc-700">계약 취소</div>
                    <div className="text-[12px] text-ink-soft tabular-nums">
                      {fmtTs(row.settled_at ?? null)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Footer · 액션 CTA · sticky bottom ─── */}
        <div className="shrink-0 px-4 py-3 border-t border-line bg-zinc-50/60 flex items-center gap-2 flex-wrap">
          {isOpen ? (
            <>
              <button
                type="button"
                onClick={() => { setReturnPad(""); setReturnNote(""); setReturnOpen(true); }}
                disabled={busy}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[14px] font-bold text-white bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-sm ring-1 ring-emerald-600/30 disabled:opacity-40 cursor-pointer"
                title="반환 처리 · 서명 필수"
              >
                <CheckCircle2 size={14} />
                반환 처리
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={busy}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[14px] font-semibold text-ink-soft bg-white border border-line hover:bg-zinc-50 hover:text-rose-600 hover:border-rose-200 disabled:opacity-40 cursor-pointer"
                title="계약 취소"
              >
                <X size={13} />
                취소
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleReopen}
              disabled={busy}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[14px] font-bold text-brand-deep bg-white border border-line hover:border-brand-deep hover:bg-brand-tint/20 disabled:opacity-40 cursor-pointer"
              title="다시 미해결로 복귀"
            >
              <RotateCcw size={13} />
              재열림
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="ml-auto inline-flex items-center justify-center w-9 h-9 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 disabled:opacity-40 cursor-pointer"
            title="완전 삭제"
            aria-label="완전 삭제"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </Card>

      {/* ─── 반환 처리 · 인라인 Modal · 서명 필수 ─── */}
      {returnOpen && row && (
        <Modal
          open={returnOpen}
          onClose={() => { if (!returning) setReturnOpen(false); }}
          size="lg-narrow"
          icon={<CheckCircle2 size={18} className="text-emerald-600" />}
          title="반환 처리 · 서명 필수"
          titleAccent
          zIndex={80}
          footer={
            <>
              <button
                type="button"
                onClick={() => setReturnOpen(false)}
                disabled={returning}
                className="h-9 px-4 rounded-lg text-[14px] font-semibold text-ink-soft bg-white border border-line hover:bg-zinc-50 disabled:opacity-40 cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleReturnSubmit}
                disabled={returning || !returnPad.trim()}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[14px] font-bold text-white bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-sm ring-1 ring-emerald-600/30 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {returning ? <Spinner size={13} tone="white" /> : <Save size={13} />}
                {returning ? "저장 중..." : "반환 처리"}
              </button>
            </>
          }
        >
          <form onSubmit={handleReturnSubmit} className="flex flex-col gap-3">
            <div className="text-[13px] text-ink-soft bg-zinc-50 border border-line rounded-lg p-3 leading-relaxed break-keep">
              <div>
                <b className="text-brand-deep">{row.direction === "lend" ? "대여" : "차용"}</b>
                {" · "}{row.supplier ?? "-"}
              </div>
              <div className="mt-1">
                <b>{row.product_name ?? "-"}</b>
                {" · "}{(row.qty ?? 0).toLocaleString()} 개
                {row.unit_price != null && <> · @ {row.unit_price.toLocaleString()}원</>}
              </div>
              {authSession?.employeeName && (
                <div className="mt-1 text-[12px]">처리자 · {authSession.employeeName}</div>
              )}
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">
                반환 서명 <span className="text-rose-600 normal-case">*</span>
              </span>
              <SignaturePad value={returnPad} onChange={setReturnPad} height={160} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">반환 비고 (선택)</span>
              <textarea
                value={returnNote}
                onChange={(e) => setReturnNote(e.target.value)}
                rows={2}
                className="w-full px-2.5 py-2 rounded-lg border border-line bg-white text-[14px] text-ink placeholder:text-zinc-400 focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition resize-y break-keep"
                placeholder="예: 파손 없음 · 정상 반환"
              />
            </label>
          </form>
        </Modal>
      )}

      {/* ─── Legacy 서명 미리보기 라이트박스 ─── */}
      {signaturePreview && (
        <div
          role="dialog"
          aria-modal
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSignaturePreview(null)}
        >
          <div className="bg-white rounded-xl shadow-xl p-4 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[15px] font-bold text-ink">서명 미리보기</span>
              <button
                type="button"
                onClick={() => setSignaturePreview(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-100 cursor-pointer"
                aria-label="닫기"
              >
                <X size={16} />
              </button>
            </div>
            <img src={signaturePreview} alt="서명" className="w-full h-auto border border-line rounded-lg bg-white" />
          </div>
        </div>
      )}
    </>
  );
};

export default BorrowingDetailPanel;
