// src/components/ProductInfoPage/ProductCreateModal.tsx
// 2026-08-23 · #177 Phase C · 상품 신규 등록 모달
//   · POST /api/products · authorize(5) · Zod (CreateProductSchema)
//   · Modal + Card + apiClient + useToast · 프레임워크 원칙 준수
//
// props · open · onClose · onCreated(code) · authSession(권한 표시용)

import React, { useMemo, useState } from "react";
import { Package, Save, X } from "lucide-react";
import { Modal } from "../common/Modal";
import { Card } from "../common/Card";
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { CreateProductSchema, type CreateProductInput } from "../../shared/schemas/products";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (code: string) => void;
  /** 2026-08-23 · #179 · 바코드 스캔 미등록 즉시 등록 · product_code 사전 채움 */
  initialCode?: string;
  /** 2026-08-23 · #179 · barcode 사전 채움 (스캔 코드가 바코드 = product_code 인 경우 함께) */
  initialBarcode?: string;
  /** 2026-08-23 · #179 · product_code 필드 readonly (스캔 값 고정) */
  lockCode?: boolean;
  /** 2026-08-23 · #179 · 초기 상품명 (예: OCR/스캔 힌트) */
  initialName?: string;
}

type Form = {
  product_code: string;
  product_name: string;
  supplier: string;
  category: string;
  unit: string;
  spec: string;
  barcode: string;
  real_map: string;
  optimal_stock: string;
  sale_price: string;
  purchase_price: string;
  cost_price: string;
  brand: string;
  manufacturer: string;
  note: string;
};

const EMPTY: Form = {
  product_code: "",
  product_name: "",
  supplier: "",
  category: "",
  unit: "",
  spec: "",
  barcode: "",
  real_map: "",
  optimal_stock: "",
  sale_price: "",
  purchase_price: "",
  cost_price: "",
  brand: "",
  manufacturer: "",
  note: "",
};

// 문자열 → 숫자 (빈 문자열 → null)
const parseNum = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export const ProductCreateModal: React.FC<Props> = ({
  open, onClose, onCreated,
  initialCode, initialBarcode, lockCode = false, initialName,
}) => {
  const { toast, showSuccess, showError } = useToast();
  const [form, setForm] = useState<Form>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 2026-08-23 · #179 · open + initialCode 변경 시 · 사전 채움 (한 번만)
  React.useEffect(() => {
    if (!open) return;
    setForm({
      ...EMPTY,
      product_code: initialCode ?? "",
      barcode: initialBarcode ?? initialCode ?? "",
      product_name: initialName ?? "",
    });
    setError(null);
  }, [open, initialCode, initialBarcode, initialName]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(prev => ({ ...prev, [k]: v }));

  const canSubmit = useMemo(() => {
    return form.product_code.trim().length > 0 && form.product_name.trim().length > 0 && !submitting;
  }, [form.product_code, form.product_name, submitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const payload: CreateProductInput = {
        product_code: form.product_code.trim(),
        product_name: form.product_name.trim(),
        supplier: form.supplier.trim() || null,
        category: form.category.trim() || null,
        unit: form.unit.trim() || null,
        spec: form.spec.trim() || null,
        barcode: form.barcode.trim() || null,
        real_map: form.real_map.trim() || null,
        optimal_stock: parseNum(form.optimal_stock),
        sale_price: parseNum(form.sale_price),
        purchase_price: parseNum(form.purchase_price),
        cost_price: parseNum(form.cost_price),
        brand: form.brand.trim() || null,
        manufacturer: form.manufacturer.trim() || null,
        note: form.note.trim() || null,
      };
      // 클라이언트 사전 검증 (Zod)
      const parsed = CreateProductSchema.safeParse(payload);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        throw new Error(`${first?.path.join(".") ?? "input"}: ${first?.message ?? "유효성 오류"}`);
      }
      const { data } = await api.post<{ ok: boolean; product_code: string }>("/api/products", parsed.data);
      showSuccess(`상품 등록 완료 · ${data.product_code}`);
      onCreated(data.product_code);
      setForm(EMPTY);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : (e as Error)?.message ?? "상품 등록 실패";
      setError(msg);
      showError(`[상품 등록] ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setForm(EMPTY);
    setError(null);
  };

  return (
    <>
      <Modal
        open={open}
        onClose={submitting ? () => {} : onClose}
        title={
          <span className="flex items-center gap-2">
            <Package size={16} className="text-brand-deep" />
            <span>상품 신규 등록</span>
          </span>
        }
        size="3xl"
        bodyPadding="none"
      >
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
            {error && (
              <Card variant="flat" padding="md" rounded="lg" bg="bg-rose-50" borderColor="border-rose-200" className="text-[13px] text-rose-700 font-medium">
                {error}
              </Card>
            )}

            <Card variant="flat" padding="md" rounded="lg" className="bg-white">
              <h3 className="text-[13px] font-bold text-ink mb-2 tracking-tight">필수 정보</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label={lockCode ? "상품코드 * (스캔 고정)" : "상품코드 *"} required>
                  <input
                    type="text"
                    value={form.product_code}
                    onChange={(e) => set("product_code", e.target.value)}
                    className={inputCls + (lockCode ? " bg-zinc-100 cursor-not-allowed" : "")}
                    placeholder="예: 20250823001"
                    maxLength={50}
                    readOnly={lockCode}
                    autoFocus={!lockCode}
                  />
                </Field>
                <Field label="상품명 *" required>
                  <input
                    type="text"
                    value={form.product_name}
                    onChange={(e) => set("product_name", e.target.value)}
                    className={inputCls}
                    placeholder="상품명 입력"
                    maxLength={200}
                  />
                </Field>
              </div>
            </Card>

            <Card variant="flat" padding="md" rounded="lg" className="bg-white">
              <h3 className="text-[13px] font-bold text-ink mb-2 tracking-tight">분류·공급</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="공급사">
                  <input type="text" value={form.supplier} onChange={(e) => set("supplier", e.target.value)} className={inputCls} placeholder="예: 코스트팜" maxLength={100} />
                </Field>
                <Field label="카테고리">
                  <input type="text" value={form.category} onChange={(e) => set("category", e.target.value)} className={inputCls} placeholder="예: 감기약" maxLength={100} />
                </Field>
                <Field label="단위">
                  <input type="text" value={form.unit} onChange={(e) => set("unit", e.target.value)} className={inputCls} placeholder="예: 개·박스·정" maxLength={30} />
                </Field>
                <Field label="규격">
                  <input type="text" value={form.spec} onChange={(e) => set("spec", e.target.value)} className={inputCls} placeholder="예: 10정" maxLength={100} />
                </Field>
                <Field label="바코드">
                  <input type="text" value={form.barcode} onChange={(e) => set("barcode", e.target.value)} className={inputCls} placeholder="스캔 or 수동" maxLength={50} />
                </Field>
                <Field label="실제배정구역">
                  <input type="text" value={form.real_map} onChange={(e) => set("real_map", e.target.value)} className={inputCls} placeholder="예: 12번" maxLength={100} />
                </Field>
              </div>
            </Card>

            <Card variant="flat" padding="md" rounded="lg" className="bg-white">
              <h3 className="text-[13px] font-bold text-ink mb-2 tracking-tight">가격·재고</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="적정 재고">
                  <input type="number" min={0} value={form.optimal_stock} onChange={(e) => set("optimal_stock", e.target.value)} className={inputCls + " tabular-nums"} placeholder="0" />
                </Field>
                <Field label="판매가">
                  <input type="number" min={0} value={form.sale_price} onChange={(e) => set("sale_price", e.target.value)} className={inputCls + " tabular-nums"} placeholder="0" />
                </Field>
                <Field label="매입가">
                  <input type="number" min={0} value={form.purchase_price} onChange={(e) => set("purchase_price", e.target.value)} className={inputCls + " tabular-nums"} placeholder="0" />
                </Field>
                <Field label="원가">
                  <input type="number" min={0} value={form.cost_price} onChange={(e) => set("cost_price", e.target.value)} className={inputCls + " tabular-nums"} placeholder="0" />
                </Field>
              </div>
            </Card>

            <Card variant="flat" padding="md" rounded="lg" className="bg-white">
              <h3 className="text-[13px] font-bold text-ink mb-2 tracking-tight">기타</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="브랜드">
                  <input type="text" value={form.brand} onChange={(e) => set("brand", e.target.value)} className={inputCls} maxLength={100} />
                </Field>
                <Field label="제조사">
                  <input type="text" value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} className={inputCls} maxLength={100} />
                </Field>
                <div className="md:col-span-2">
                  <Field label="비고">
                    <textarea value={form.note} onChange={(e) => set("note", e.target.value)} className={inputCls + " min-h-[70px] py-2 resize-y"} maxLength={500} placeholder="특이사항" />
                  </Field>
                </div>
              </div>
            </Card>
          </div>

          <div className="shrink-0 border-t border-line px-4 py-3 flex items-center gap-2 bg-zinc-50/60">
            <button
              type="button"
              onClick={handleReset}
              disabled={submitting}
              className="h-9 px-3 rounded-lg text-[13px] font-semibold text-zinc-600 hover:bg-white hover:text-ink border border-line cursor-pointer disabled:opacity-50"
            >
              초기화
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-9 px-3 rounded-lg text-[13px] font-semibold text-zinc-600 hover:bg-white hover:text-ink border border-line cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
            >
              <X size={13} /> 취소
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="h-9 px-4 rounded-lg text-[13px] font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors inline-flex items-center gap-1.5"
            >
              <Save size={13} className="stroke-[2.5]" />
              {submitting ? "등록 중..." : "등록"}
            </button>
          </div>
        </form>
      </Modal>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
    </>
  );
};

// ─── 재사용 · label + input 래퍼 ────────────────────────────────────────
const inputCls =
  "w-full h-9 px-2.5 rounded-lg border border-line bg-white text-[13px] font-medium text-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition-colors";

const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({ label, required, children }) => (
  <label className="flex flex-col gap-1 min-w-0">
    <span className={`text-[11px] font-semibold tracking-tight ${required ? "text-brand-deep" : "text-zinc-500"}`}>{label}</span>
    {children}
  </label>
);

export default ProductCreateModal;
