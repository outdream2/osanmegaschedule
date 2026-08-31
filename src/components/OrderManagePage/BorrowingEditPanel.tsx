// src/components/OrderManagePage/BorrowingEditPanel.tsx
// 2026-08-31 · #9 차용등록 재설계 Phase C · 중앙 편집 패널
//
//   · 신규 등록 (kind: "new") + 편집 (kind: "edit", id) 통합
//   · 3행 구조:
//     - 행 1 · BorrowingPartyCard(lender) + BorrowingArrow + BorrowingPartyCard(borrower)
//     - 행 2 · SegmentedControl(lend/borrow) + 상품·수량·단가·due_date·note
//     - 행 3 · SignatureStampSlot(lender) + SignatureStampSlot(borrower)
//   · 하단 · 초기화·저장 버튼
//   · borrowingsApi.createBorrowing / patchBorrowing 호출
//   · 서명 SignaturePad 는 Modal 로 오픈 (프리미티브 재사용)
//
//   대원칙:
//     1. 프레임워크 프리미티브 100% (BorrowingPartyCard/Arrow/SignatureStampSlot/SegmentedControl/Card/Modal/SignaturePad)
//     2. 회귀 X · 신규 파일 · 원본 BorrowingPage.tsx 무영향
//     3. 폰트 +2 · 말줄임표 금지
//     4. try/catch + prefix 로그 + toast
//     5. iOS 코드 무수정 (SignaturePad 는 그대로 재사용)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { HandCoins, Save, RefreshCcw, FilePlus2, Pencil, PenTool } from "lucide-react";
import { Card } from "../common/Card";
import { Spinner } from "../common/Spinner";
import { Modal } from "../common/Modal";
import { StatusPill } from "../common/StatusPill";
import { SegmentedControl, type SegmentedOption } from "../common/SegmentedControl";
import { SignaturePad } from "../common/SignaturePad";
import { EmptyState } from "../common/EmptyState";
import { BorrowingPartyCard } from "../common/borrowing/BorrowingPartyCard";
import { BorrowingArrow } from "../common/borrowing/BorrowingArrow";
import { SignatureStampSlot, type SignatureRecord } from "../common/borrowing/SignatureStampSlot";
import { PartySelectModal } from "./PartySelectModal";
import {
  createBorrowing,
  patchBorrowing,
  listSignatures,
  type BorrowingParty,
  type BorrowingRow,
  type CreateBorrowingInput,
} from "../../lib/borrowingsApi";
import { useToast, toastClass } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import type { AuthSession } from "../../types";

// ═══════════════════════════════════════════════════════
// Props / EditMode
// ═══════════════════════════════════════════════════════

export type EditMode = null | { kind: "new" } | { kind: "edit"; id: number };

export interface BorrowingEditPanelProps {
  mode: EditMode;
  row?: BorrowingRow | null;          // edit 모드일 때 · 부모가 rows 에서 lookup 해서 전달
  onSaved: (row: BorrowingRow) => void;
  onClose?: () => void;
  authSession?: AuthSession | null;
}

// ═══════════════════════════════════════════════════════
// 폼 상태
// ═══════════════════════════════════════════════════════

type Direction = "lend" | "borrow";

interface FormState {
  direction: Direction;
  lender:   BorrowingParty | null;
  borrower: BorrowingParty | null;
  product_name: string;
  product_code: string;
  qty: string;
  unit_price: string;
  due_date: string;
  note: string;
  // 서명 (신규 등록 시만 사용 · edit 모드에선 감사 이력 조회 · 별도 flow)
  lenderSignatureUrl: string;
  borrowerSignatureUrl: string;
}

const EMPTY_FORM: FormState = {
  direction: "lend",
  lender: null,
  borrower: null,
  product_name: "",
  product_code: "",
  qty: "",
  unit_price: "",
  due_date: "",
  note: "",
  lenderSignatureUrl: "",
  borrowerSignatureUrl: "",
};

const DIRECTION_OPTIONS: SegmentedOption<Direction>[] = [
  { value: "lend",   label: "대여 · 공급사→약국", tone: "violet" },
  { value: "borrow", label: "차용 · 약국→공급사", tone: "emerald" },
];

// ═══════════════════════════════════════════════════════
// BorrowingRow → FormState 시드 (edit 모드)
//   · 서명·party 는 상세 조회로 별도 로드 (edit 모드에서 감사 이력)
// ═══════════════════════════════════════════════════════

function rowToFormSeed(row: BorrowingRow): FormState {
  return {
    direction: row.direction,
    lender: null,   // edit 모드에선 party 재선택은 optional · 미변경 시 patch 에 미포함
    borrower: null,
    product_name: row.product_name ?? "",
    product_code: row.product_code ?? "",
    qty: row.qty != null ? String(row.qty) : "",
    unit_price: row.unit_price != null ? String(row.unit_price) : "",
    due_date: row.due_date ?? "",
    note: row.note ?? "",
    lenderSignatureUrl: "",
    borrowerSignatureUrl: "",
  };
}

// ═══════════════════════════════════════════════════════
// 편집 패널 본체
// ═══════════════════════════════════════════════════════

export const BorrowingEditPanel: React.FC<BorrowingEditPanelProps> = ({
  mode, row, onSaved, onClose, authSession,
}) => {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [existingSignatures, setExistingSignatures] = useState<SignatureRecord[]>([]);
  const [loadingSig, setLoadingSig] = useState(false);

  // 서명 모달 (신규 등록 시 · 대여자/차용자 각각)
  const [signPadRole, setSignPadRole] = useState<"lender" | "borrower" | null>(null);
  const [padDraft, setPadDraft] = useState("");

  // 당사자 선택 모달 (lender / borrower)
  const [partyModal, setPartyModal] = useState<"lender" | "borrower" | null>(null);

  const { toast, showError, showSuccess } = useToast();

  const isNew  = mode?.kind === "new";
  const isEdit = mode?.kind === "edit";

  // ── mode 변경 시 · 폼 seed ────────────────────────────
  useEffect(() => {
    if (isNew) {
      setForm(EMPTY_FORM);
      setExistingSignatures([]);
    } else if (isEdit && row) {
      setForm(rowToFormSeed(row));
      // 서명 감사 이력 로드
      setLoadingSig(true);
      listSignatures(row.id)
        .then((sigs) => setExistingSignatures(sigs))
        .catch((e: unknown) => {
          const msg = e instanceof ApiError ? e.message : (e as { message?: string })?.message ?? "네트워크 오류";
          console.error("[BorrowingEditPanel] listSignatures 실패:", msg);
          setExistingSignatures([]);
        })
        .finally(() => setLoadingSig(false));
    } else {
      setForm(EMPTY_FORM);
      setExistingSignatures([]);
    }
  }, [mode, isNew, isEdit, row]);

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  }, []);

  // ── 상품 요약 (Arrow 라벨) ─────────────────────────────
  const productSummary = useMemo(() => {
    const parts: string[] = [];
    if (form.product_name) parts.push(form.product_name);
    const qtyNum = Number(form.qty);
    if (Number.isFinite(qtyNum) && qtyNum > 0) parts.push(`${qtyNum.toLocaleString()}개`);
    if (form.unit_price) {
      const up = Number(form.unit_price);
      if (Number.isFinite(up) && up > 0) parts.push(`${up.toLocaleString()}원`);
    }
    return parts.length ? parts.join(" · ") : undefined;
  }, [form.product_name, form.qty, form.unit_price]);

  // ── 기존 서명 매핑 (edit 모드 · lender/borrower) ────────
  const sigByRole = useMemo(() => {
    const m: Partial<Record<"lender" | "borrower", SignatureRecord>> = {};
    for (const s of existingSignatures) {
      if (s.role === "lender"   && !m.lender)   m.lender = s;
      if (s.role === "borrower" && !m.borrower) m.borrower = s;
    }
    return m;
  }, [existingSignatures]);

  // ── 저장 ──────────────────────────────────────────────
  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    // 공통 검증
    if (!form.product_name.trim()) { showError("상품명을 입력하세요"); return; }
    const qty = Number(form.qty);
    if (!Number.isFinite(qty) || qty <= 0) { showError("수량은 1 이상이어야 합니다"); return; }
    const unit_price = form.unit_price.trim() ? Number(form.unit_price) : null;
    if (unit_price != null && !Number.isFinite(unit_price)) { showError("단가가 올바르지 않습니다"); return; }

    setSaving(true);
    try {
      if (isNew) {
        // 신규 등록 · supplier 필드는 상대편(공급사 롤) 이름으로 자동 세팅
        // direction=lend  · lender=공급사 · supplier=lender.name
        // direction=borrow · borrower=공급사 · supplier=borrower.name
        const supplierParty = form.direction === "lend" ? form.lender : form.borrower;
        const signatures: NonNullable<CreateBorrowingInput["signatures"]> = [];
        if (form.lenderSignatureUrl) {
          signatures.push({
            role: "lender",
            signer_name: form.lender?.name ?? (authSession?.employeeName ?? "대여자"),
            party_id: form.lender?.id ?? null,
            signature_url: form.lenderSignatureUrl,
          });
        }
        if (form.borrowerSignatureUrl) {
          signatures.push({
            role: "borrower",
            signer_name: form.borrower?.name ?? (authSession?.employeeName ?? "차용자"),
            party_id: form.borrower?.id ?? null,
            signature_url: form.borrowerSignatureUrl,
          });
        }

        const input: CreateBorrowingInput = {
          direction: form.direction,
          supplier: supplierParty?.name ?? null,
          product_code: form.product_code.trim() || null,
          product_name: form.product_name.trim(),
          qty,
          unit_price,
          due_date: form.due_date || null,
          note: form.note.trim() || null,
          signature_url: form.lenderSignatureUrl || form.borrowerSignatureUrl || null,
          created_by: authSession?.employeeName ?? null,
          created_by_id: authSession?.employeeId ?? null,
          lender_party_id:   form.lender?.id   ?? null,
          borrower_party_id: form.borrower?.id ?? null,
          signatures: signatures.length > 0 ? signatures : undefined,
        };
        const created = await createBorrowing(input);
        showSuccess(`차용 등록 완료 · ${created.product_name ?? `#${created.id}`}`);
        onSaved(created);
        setForm(EMPTY_FORM);
      } else if (isEdit && mode?.kind === "edit") {
        const patch: Partial<CreateBorrowingInput> = {
          direction: form.direction,
          product_code: form.product_code.trim() || null,
          product_name: form.product_name.trim(),
          qty,
          unit_price,
          due_date: form.due_date || null,
          note: form.note.trim() || null,
        };
        // party 를 재선택했을 때만 patch (미변경 시 무시)
        if (form.lender)   {
          patch.lender_party_id = form.lender.id;
          const supplierParty = form.direction === "lend" ? form.lender : form.borrower;
          if (supplierParty) patch.supplier = supplierParty.name;
        }
        if (form.borrower) {
          patch.borrower_party_id = form.borrower.id;
          const supplierParty = form.direction === "lend" ? form.lender : form.borrower;
          if (supplierParty) patch.supplier = supplierParty.name;
        }
        const updated = await patchBorrowing(mode.id, patch);
        showSuccess(`계약 수정 완료 · #${updated.id}`);
        onSaved(updated);
      }
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : (e as { message?: string })?.message ?? "네트워크 오류";
      showError(`저장 실패: ${msg}`);
      console.error("[BorrowingEditPanel] 저장 실패:", msg);
    } finally {
      setSaving(false);
    }
  }, [form, isNew, isEdit, mode, authSession, onSaved, showError, showSuccess]);

  const handleReset = useCallback(() => {
    if (isNew) {
      setForm(EMPTY_FORM);
    } else if (isEdit && row) {
      setForm(rowToFormSeed(row));
    }
  }, [isNew, isEdit, row]);

  // ── 서명 완료 ────────────────────────────────────────
  const handleSignConfirm = useCallback(() => {
    if (!signPadRole) return;
    if (!padDraft.trim()) { showError("서명이 필요합니다"); return; }
    if (signPadRole === "lender")   set("lenderSignatureUrl", padDraft);
    if (signPadRole === "borrower") set("borrowerSignatureUrl", padDraft);
    setSignPadRole(null);
    setPadDraft("");
  }, [signPadRole, padDraft, set, showError]);

  const handleSignOpen = useCallback((role: "lender" | "borrower") => {
    setPadDraft(role === "lender" ? form.lenderSignatureUrl : form.borrowerSignatureUrl);
    setSignPadRole(role);
  }, [form.lenderSignatureUrl, form.borrowerSignatureUrl]);

  // ═══════════════════════════════════════════════════════
  // 렌더 · mode 별 분기
  // ═══════════════════════════════════════════════════════

  // mode 없음 · placeholder
  if (!mode) {
    return (
      <Card padding="none" rounded="xl" topAccent clip className="h-full min-h-[520px] flex flex-col">
        <div className="shrink-0 px-4 py-3 border-b border-line bg-white flex items-center gap-2">
          <HandCoins size={17} className="text-brand-deep" />
          <span className="text-[17px] font-bold text-ink tracking-tight">계약 편집 영역</span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center p-6">
          <EmptyState
            icon={FilePlus2}
            title="폼을 여세요"
            hint="좌측 리스트에서 항목을 선택하거나 · [신규 등록] 을 눌러 계약을 만드세요"
            size="large"
          />
        </div>
      </Card>
    );
  }

  const inputCls = "w-full h-9 px-2.5 rounded-lg border border-line bg-white text-[15px] text-ink placeholder:text-zinc-400 focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition";
  const labelCls = "text-[13px] font-bold text-ink-soft";

  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
      <Card padding="none" rounded="xl" topAccent clip className="h-full min-h-[520px] flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-4 py-3 border-b border-line bg-white flex items-center gap-2">
          {isNew ? <FilePlus2 size={17} className="text-brand-deep" /> : <Pencil size={17} className="text-brand-deep" />}
          <span className="text-[17px] font-bold text-ink tracking-tight">
            {isNew ? "신규 차용 계약 · 등록" : `계약 편집 · #${mode.kind === "edit" ? mode.id : ""}`}
          </span>
          {loadingSig && <Spinner size={12} tone="brand" />}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto h-8 px-3 rounded-lg text-[13px] font-semibold text-ink-soft bg-white border border-line hover:bg-zinc-50 cursor-pointer"
            >
              닫기
            </button>
          )}
        </div>

        {/* Body · 3-row · scrollable */}
        <form onSubmit={handleSave} className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
          {/* ─── 행 1 · Lender + Arrow + Borrower ─── */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center">
            <BorrowingPartyCard
              role="lender"
              party={form.lender}
              onClick={() => setPartyModal("lender")}
            />
            <BorrowingArrow
              status={isEdit && row?.status === "settled" ? "settled" : "open"}
              productSummary={productSummary}
              className="py-2"
            />
            <BorrowingPartyCard
              role="borrower"
              party={form.borrower}
              onClick={() => setPartyModal("borrower")}
            />
          </div>

          {/* ─── 행 2 · direction + 상품·수량·단가·due_date·note ─── */}
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <div className="flex items-center gap-2 flex-wrap">
              <SegmentedControl<Direction>
                value={form.direction}
                onChange={(v) => set("direction", v)}
                options={DIRECTION_OPTIONS}
                size="sm"
                variant="pills"
                ariaLabel="차용 방향"
              />
              {isEdit && row && (
                <StatusPill
                  tone={row.status === "open" ? "amber" : row.status === "settled" ? "emerald" : "zinc"}
                  size="sm"
                >
                  {row.status === "open" ? "미해결" : row.status === "settled" ? "정산완료" : "취소"}
                </StatusPill>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className={labelCls}>상품명 <span className="text-rose-600">*</span></span>
                <input
                  type="text"
                  value={form.product_name}
                  onChange={(e) => set("product_name", e.target.value)}
                  className={inputCls}
                  placeholder="예: 타이레놀 500mg 100T"
                  required
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>상품코드</span>
                <input
                  type="text"
                  value={form.product_code}
                  onChange={(e) => set("product_code", e.target.value)}
                  className={inputCls + " font-mono"}
                  placeholder="(선택)"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>반환·정산 예정일</span>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => set("due_date", e.target.value)}
                  className={inputCls + " tabular-nums"}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>수량 <span className="text-rose-600">*</span></span>
                <input
                  type="number"
                  min={1}
                  value={form.qty}
                  onChange={(e) => set("qty", e.target.value)}
                  className={inputCls + " tabular-nums"}
                  required
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>단가 (원)</span>
                <input
                  type="number"
                  min={0}
                  value={form.unit_price}
                  onChange={(e) => set("unit_price", e.target.value)}
                  className={inputCls + " tabular-nums"}
                  placeholder="(선택)"
                />
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1">
                <span className={labelCls}>사유·메모</span>
                <textarea
                  value={form.note}
                  onChange={(e) => set("note", e.target.value)}
                  rows={2}
                  className="w-full px-2.5 py-2 rounded-lg border border-line bg-white text-[15px] text-ink placeholder:text-zinc-400 focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition resize-y break-keep"
                  placeholder="예: 급한 요청으로 임시 대여 · 다음 정산 시 반영"
                />
              </label>
            </div>
          </div>

          {/* ─── 행 3 · 서명·도장 슬롯 ─── */}
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <div className="flex items-center gap-1.5">
              <PenTool size={13} className="text-ink-soft" />
              <span className="text-[13px] font-bold text-ink-soft uppercase tracking-wider">서명 · 도장</span>
              {isNew && (
                <span className="text-[12px] text-ink-soft ml-1 normal-case tracking-normal">(선택 · 등록 후에도 추가 가능)</span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <SignatureStampSlot
                role="lender"
                signature={
                  isNew && form.lenderSignatureUrl
                    ? {
                        role: "lender",
                        signer_name: form.lender?.name ?? "대여자",
                        signature_url: form.lenderSignatureUrl,
                        signed_at: new Date().toISOString(),
                      }
                    : sigByRole.lender ?? null
                }
                onSign={isNew ? () => handleSignOpen("lender") : undefined}
              />
              <SignatureStampSlot
                role="borrower"
                signature={
                  isNew && form.borrowerSignatureUrl
                    ? {
                        role: "borrower",
                        signer_name: form.borrower?.name ?? "차용자",
                        signature_url: form.borrowerSignatureUrl,
                        signed_at: new Date().toISOString(),
                      }
                    : sigByRole.borrower ?? null
                }
                onSign={isNew ? () => handleSignOpen("borrower") : undefined}
              />
            </div>
          </div>

          {/* 액션 버튼 · sticky bottom */}
          <div className="mt-auto pt-4 border-t border-line flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[14px] font-semibold text-ink-soft bg-white border border-line hover:bg-zinc-50 disabled:opacity-40 cursor-pointer"
            >
              <RefreshCcw size={13} />
              초기화
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 h-9 px-5 rounded-lg text-[14px] font-bold text-white bg-gradient-to-br from-brand-deep to-[#0d3a5c] hover:from-[#0d3a5c] hover:to-[#08253a] shadow-sm ring-1 ring-brand-deep/30 disabled:opacity-40 cursor-pointer"
            >
              {saving ? <Spinner size={13} tone="white" /> : <Save size={13} />}
              {saving ? "저장 중..." : isNew ? "등록" : "수정 저장"}
            </button>
          </div>
        </form>
      </Card>

      {/* 당사자 선택 모달 */}
      {partyModal && (
        <PartySelectModal
          open={partyModal !== null}
          role={partyModal}
          onClose={() => setPartyModal(null)}
          onSelect={(p) => {
            if (partyModal === "lender")   set("lender", p);
            if (partyModal === "borrower") set("borrower", p);
            setPartyModal(null);
          }}
        />
      )}

      {/* 서명 캡처 모달 (신규 등록 시) */}
      {signPadRole && (
        <Modal
          open={signPadRole !== null}
          onClose={() => { setSignPadRole(null); setPadDraft(""); }}
          size="lg-narrow"
          icon={<PenTool size={18} />}
          title={signPadRole === "lender" ? "대여자 서명" : "차용자 서명"}
          titleAccent
          zIndex={80}
          footer={
            <>
              <button
                type="button"
                onClick={() => { setSignPadRole(null); setPadDraft(""); }}
                className="h-9 px-4 rounded-lg text-[14px] font-semibold text-ink-soft bg-white border border-line hover:bg-zinc-50 cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSignConfirm}
                disabled={!padDraft.trim()}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[14px] font-bold text-white bg-gradient-to-br from-brand-deep to-[#0d3a5c] hover:from-[#0d3a5c] hover:to-[#08253a] shadow-sm ring-1 ring-brand-deep/30 disabled:opacity-40 cursor-pointer"
              >
                <Save size={13} />
                서명 저장
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-2">
            <div className="text-[13px] text-ink-soft break-keep">
              {signPadRole === "lender"
                ? `대여자 · ${form.lender?.name ?? "미지정"}`
                : `차용자 · ${form.borrower?.name ?? "미지정"}`}
            </div>
            <SignaturePad value={padDraft} onChange={setPadDraft} height={180} />
          </div>
        </Modal>
      )}
    </>
  );
};

export default BorrowingEditPanel;
