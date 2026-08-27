// src/components/ProductInfoPage/ProductCreateModal.tsx
// 2026-08-23 · #177 Phase C · 상품 신규 등록 모달
//   · POST /api/products · authorize(5) · Zod (CreateProductSchema)
//   · Modal + Card + apiClient + useToast · 프레임워크 원칙 준수
//
// props · open · onClose · onCreated(code) · authSession(권한 표시용)

import React, { useMemo, useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import { Package, Save, X } from "lucide-react";
import { Modal } from "../common/Modal";
import { Card } from "../common/Card";
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { CreateProductSchema, type CreateProductInput } from "../../shared/schemas/products";
import { useVendors } from "../../hooks/useVendors";
import { useZoneDefs } from "../../hooks/useZoneDefs";
// 2026-08-28 · 사용자 지시 · 분류코드 참조 상품 리스트 (스크롤 · 클릭 시 자동 채움)
import { Spinner } from "../common/Spinner";

// 2026-08-26 · P0 fix · 모달 body overflow-hidden 안 · autocomplete dropdown clip fix
//   · createPortal 로 body 에 렌더 · getBoundingClientRect 기준 fixed positioning
interface PortalDropdownProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  children: React.ReactNode;
}
const PortalDropdown: React.FC<PortalDropdownProps> = ({ anchorRef, open, children }) => {
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  useEffect(() => {
    if (!open || !anchorRef.current) { setPos(null); return; }
    const update = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef]);
  if (!open || !pos) return null;
  return ReactDOM.createPortal(
    <div style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}>
      {children}
    </div>,
    document.body,
  );
};

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * 등록 성공 콜백 · (code, product) 형태로 확장 (하위 호환 유지)
   *   · product · 방금 등록한 상품 정보 · 후속 로컬 캐시 삽입 · UI 반영 등에 사용
   */
  onCreated: (code: string, product?: { product_name: string; supplier: string | null; spec: string | null; barcode: string | null; real_map: string | null }) => void;
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
  brand: string;
  manufacturer: string;
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
  brand: "",
  manufacturer: "",
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
  // 2026-08-24 · 사용자 지시 · 공급사 검색 autocomplete
  const { vendors } = useVendors();
  const [supplierOpen, setSupplierOpen] = useState(false);
  const supplierWrapRef = useRef<HTMLDivElement | null>(null);
  const supplierSuggestions = useMemo(() => {
    const q = form.supplier.trim().toLowerCase();
    if (!q) return vendors.slice(0, 8);
    return vendors
      .filter(v => (v.company_name ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [form.supplier, vendors]);
  // outside click · close dropdown
  useEffect(() => {
    if (!supplierOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (supplierWrapRef.current && !supplierWrapRef.current.contains(e.target as Node)) {
        setSupplierOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [supplierOpen]);
  // 2026-08-24 · 사용자 지시 · 실제배정구역 검색 autocomplete
  const { zones } = useZoneDefs();
  const [zoneOpen, setZoneOpen] = useState(false);
  const zoneWrapRef = useRef<HTMLDivElement | null>(null);
  const zoneSuggestions = useMemo(() => {
    const q = form.real_map.trim().toLowerCase();
    const all = zones.map(z => ({ label: `${z.num}. ${z.label}`, value: String(z.num), category: z.category }));
    if (!q) return all.slice(0, 12);
    return all
      .filter(z => z.label.toLowerCase().includes(q) || z.value.includes(q) || z.category.toLowerCase().includes(q))
      .slice(0, 12);
  }, [form.real_map, zones]);
  useEffect(() => {
    if (!zoneOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (zoneWrapRef.current && !zoneWrapRef.current.contains(e.target as Node)) {
        setZoneOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [zoneOpen]);

  // 2026-08-28 · 사용자 지시 · 분류코드 참조 상품 리스트 · category 입력 시 debounce fetch
  type RefProduct = {
    product_code: string;
    product_name: string;
    category: string | null;
    category_code: string | null;
    supplier: string | null;
    brand: string | null;
    manufacturer: string | null;
    spec: string | null;
    unit: string | null;
    sale_price: number | null;
    purchase_price: number | null;
    real_map: string | null;
  };
  const [refList, setRefList] = useState<RefProduct[]>([]);
  const [refLoading, setRefLoading] = useState(false);
  useEffect(() => {
    const q = form.category.trim();
    if (!q || q.length < 2) { setRefList([]); return; }
    const t = setTimeout(async () => {
      setRefLoading(true);
      try {
        const { data } = await api.get<RefProduct[]>(`/api/products-by-category?category=${encodeURIComponent(q)}`);
        setRefList(Array.isArray(data) ? data : []);
      } catch { setRefList([]); }
      finally { setRefLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [form.category]);

  // 참조 상품 클릭 · 기존 입력값 유지 + 빈 필드만 자동 채움
  const applyRefProduct = (r: RefProduct) => {
    setForm(prev => ({
      ...prev,
      supplier: prev.supplier || r.supplier || "",
      category: prev.category || r.category || "",
      unit: prev.unit || r.unit || "",
      spec: prev.spec || r.spec || "",
      real_map: prev.real_map || r.real_map || "",
      brand: prev.brand || r.brand || "",
      manufacturer: prev.manufacturer || r.manufacturer || "",
      sale_price: prev.sale_price || (r.sale_price != null ? String(r.sale_price) : ""),
      purchase_price: prev.purchase_price || (r.purchase_price != null ? String(r.purchase_price) : ""),
    }));
    showSuccess(`참조 · ${r.product_name}`);
  };

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
        // 2026-08-24 · 사용자 지시 · 상품코드 = 바코드 · 자동 동일값 세팅
        barcode: form.product_code.trim() || null,
        real_map: form.real_map.trim() || null,
        optimal_stock: parseNum(form.optimal_stock),
        sale_price: parseNum(form.sale_price),
        purchase_price: parseNum(form.purchase_price),
        brand: form.brand.trim() || null,
        manufacturer: form.manufacturer.trim() || null,
      };
      // 클라이언트 사전 검증 (Zod)
      const parsed = CreateProductSchema.safeParse(payload);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        throw new Error(`${first?.path.join(".") ?? "input"}: ${first?.message ?? "유효성 오류"}`);
      }
      const { data } = await api.post<{ ok: boolean; product_code: string }>("/api/products", parsed.data);
      showSuccess(`상품 등록 완료 · ${data.product_code}`);
      // 2026-08-23 · 후속 캐시 삽입용 · product 정보도 전달 (하위 호환)
      onCreated(data.product_code, {
        product_name: parsed.data.product_name,
        supplier: parsed.data.supplier ?? null,
        spec: parsed.data.spec ?? null,
        barcode: parsed.data.barcode ?? null,
        real_map: parsed.data.real_map ?? null,
      });
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
                {/* 2026-08-24 · 사용자 지시 · 공급사 검색 autocomplete · 입력 시 리스트 · 클릭 선택 */}
                <div ref={supplierWrapRef} className="relative min-w-0">
                  <Field label="공급사">
                    <input
                      type="text"
                      value={form.supplier}
                      onChange={(e) => { set("supplier", e.target.value); setSupplierOpen(true); }}
                      onFocus={() => setSupplierOpen(true)}
                      className={inputCls}
                      placeholder="검색 · 클릭하여 선택"
                      maxLength={100}
                      autoComplete="off"
                    />
                  </Field>
                  <PortalDropdown anchorRef={supplierWrapRef} open={supplierOpen && supplierSuggestions.length > 0}>
                    <Card padding="none" rounded="lg" className="shadow-xl max-h-56 overflow-y-auto">
                      {supplierSuggestions.map(v => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => { set("supplier", v.company_name ?? ""); setSupplierOpen(false); }}
                          className="w-full text-left px-3 py-2 text-[13px] font-medium text-ink hover:bg-brand-tint/30 focus:outline-none focus:bg-brand-tint/40 flex items-center gap-2 transition-colors"
                        >
                          <span className="truncate">{v.company_name}</span>
                          {v.category && <span className="ml-auto text-[11px] text-ink-soft shrink-0">{v.category}</span>}
                        </button>
                      ))}
                    </Card>
                  </PortalDropdown>
                </div>
                <Field label="분류코드 (카테고리)">
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => set("category", e.target.value)}
                    className={inputCls}
                    placeholder="예: 감기약 · 코스트팜 > 약국"
                    maxLength={100}
                  />
                </Field>
                <Field label="단위">
                  <input type="text" value={form.unit} onChange={(e) => set("unit", e.target.value)} className={inputCls} placeholder="예: 개·박스·정" maxLength={30} />
                </Field>
                <Field label="규격">
                  <input type="text" value={form.spec} onChange={(e) => set("spec", e.target.value)} className={inputCls} placeholder="예: 10정" maxLength={100} />
                </Field>
                {/* 2026-08-24 · 사용자 지시 · 상품코드 = 바코드 · 별도 바코드 필드 제거 (submit 시 자동 세팅) */}
                {/* 2026-08-24 · 사용자 지시 · 실제배정구역 검색 autocomplete · 구역 리스트 · 클릭 선택 */}
                <div ref={zoneWrapRef} className="relative min-w-0">
                  <Field label="실제배정구역">
                    <input
                      type="text"
                      value={form.real_map}
                      onChange={(e) => { set("real_map", e.target.value); setZoneOpen(true); }}
                      onFocus={() => setZoneOpen(true)}
                      className={inputCls}
                      placeholder="구역 번호·이름 검색"
                      maxLength={100}
                      autoComplete="off"
                    />
                  </Field>
                  <PortalDropdown anchorRef={zoneWrapRef} open={zoneOpen && zoneSuggestions.length > 0}>
                    <Card padding="none" rounded="lg" className="shadow-xl max-h-56 overflow-y-auto">
                      {zoneSuggestions.map(z => (
                        <button
                          key={z.value}
                          type="button"
                          onClick={() => { set("real_map", z.value); setZoneOpen(false); }}
                          className="w-full text-left px-3 py-2 text-[13px] font-medium text-ink hover:bg-brand-tint/30 focus:outline-none focus:bg-brand-tint/40 flex items-center gap-2 transition-colors"
                        >
                          <span className="truncate">{z.label}</span>
                          <span className="ml-auto text-[11px] text-ink-soft shrink-0">{z.category}</span>
                        </button>
                      ))}
                    </Card>
                  </PortalDropdown>
                </div>
              </div>
            </Card>

            {/* 2026-08-28 · 사용자 지시 · 분류코드 참조 상품 리스트 · 카드 클릭 → 빈 필드 자동 채움 */}
            {form.category.trim().length >= 2 && (
              <Card variant="flat" padding="md" rounded="lg" className="bg-brand-tint/20 border-brand-deep/20">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-[13px] font-bold text-ink tracking-tight flex-1">
                    분류코드 · 참조 상품 <span className="text-ink-soft font-medium">({refList.length}건)</span>
                  </h3>
                  {refLoading && <Spinner size={12} tone="brand" />}
                </div>
                {refList.length === 0 && !refLoading && (
                  <div className="text-[12px] text-ink-soft italic">해당 분류코드에 등록된 상품 없음</div>
                )}
                {refList.length > 0 && (
                  <div className="max-h-56 overflow-y-auto flex flex-col gap-1 pr-1">
                    {refList.map(r => (
                      <button
                        key={r.product_code}
                        type="button"
                        onClick={() => applyRefProduct(r)}
                        className="text-left px-2.5 py-1.5 rounded-md bg-white hover:bg-brand-tint/40 border border-line hover:border-brand-deep/40 text-[12px] transition cursor-pointer"
                        title="클릭 시 · 빈 필드 자동 채움"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-ink flex-1 truncate">{r.product_name}</span>
                          <span className="text-[11px] text-ink-soft tabular-nums shrink-0">{r.product_code}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-ink-soft">
                          {r.supplier && <span className="truncate">📦 {r.supplier}</span>}
                          {r.brand && <span className="truncate">· {r.brand}</span>}
                          {r.spec && <span className="truncate">· {r.spec}</span>}
                          {r.sale_price != null && <span className="ml-auto shrink-0 font-bold tabular-nums text-brand-deep">₩{r.sale_price.toLocaleString()}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            )}

            <Card variant="flat" padding="md" rounded="lg" className="bg-white">
              <h3 className="text-[13px] font-bold text-ink mb-2 tracking-tight">가격</h3>
              {/* 2026-08-24 · 사용자 지시 · 적정 재고 · 설정에서 자동 계산 · 신규 등록 폼 제외 */}
              {/* 2026-08-25 · 사용자 지시 · products 테이블에 있는 컬럼만 등록 · 원가(cost_price) 필드 제거 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="판매가">
                  <input type="number" min={0} value={form.sale_price} onChange={(e) => set("sale_price", e.target.value)} className={inputCls + " tabular-nums"} placeholder="0" />
                </Field>
                <Field label="매입가">
                  <input type="number" min={0} value={form.purchase_price} onChange={(e) => set("purchase_price", e.target.value)} className={inputCls + " tabular-nums"} placeholder="0" />
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
                {/* 2026-08-25 · products 테이블에 없는 컬럼 · note 필드 제거 */}
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
