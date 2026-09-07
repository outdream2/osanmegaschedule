// src/components/ProductInfoPage/ProductCreateModal.tsx
// 2026-08-23 · #177 Phase C · 상품 신규 등록 모달
//   · POST /api/products · authorize(5) · Zod (CreateProductSchema)
//   · Modal + Card + apiClient + useToast · 프레임워크 원칙 준수
//
// props · open · onClose · onCreated(code) · authSession(권한 표시용)

import React, { useMemo, useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import {
  Package, Save, X,
  Hash, Type, Building2, Layers, Ruler, Tags,
  MapPin, Coins, ShoppingCart, Award, Factory,
} from "lucide-react";
import { Modal } from "../common/Modal";
import { IconTile } from "../common/IconTile";
// 2026-08-31 · #42 · 카테고리 검색 → 구역 지정 프리미티브
import { ZoneCategoryPicker } from "../common/ZoneCategoryPicker";
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { CreateProductSchema, type CreateProductInput } from "../../shared/schemas/products";
import { useVendors } from "../../hooks/useVendors";
import { useZoneDefs } from "../../hooks/useZoneDefs";
import { classifyArrivalSlot } from "../../lib/warehouseZoneMap";
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
  onCreated: (code: string, product?: { product_name: string; supplier: string | null; spec: string | null; barcode: string | null; location: string | null }) => void;
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
  location: string;
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
  location: "",
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
    const q = form.location.trim().toLowerCase();
    const all = zones.map(z => ({ label: `${z.num}. ${z.label}`, value: String(z.num), category: z.category }));
    if (!q) return all.slice(0, 12);
    return all
      .filter(z => z.label.toLowerCase().includes(q) || z.value.includes(q) || z.category.toLowerCase().includes(q))
      .slice(0, 12);
  }, [form.location, zones]);
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
    location: string | null;
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
      location: prev.location || r.location || "",
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

  // 구역 → 창고1/창고2 자동 판별
  const warehouseTag = useMemo(() => {
    const loc = form.location.trim();
    if (!loc) return null;
    const slot = classifyArrivalSlot(loc);
    if (slot === "w1") return { label: "창고1", cls: "text-cyan-700 bg-cyan-50 border-cyan-300" };
    if (slot === "w2") return { label: "창고2", cls: "text-sky-700 bg-sky-50 border-sky-300" };
    return null;
  }, [form.location]);

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
        location: form.location.trim() || null,
        optimal_stock: parseNum(form.optimal_stock),
        sale_price: parseNum(form.sale_price),
        purchase_price: parseNum(form.purchase_price),
        brand: form.brand.trim() || null,
        manufacturer: form.manufacturer.trim() || null,
        // 2026-08-30 · 사용자 지시 · 상품 등록 시 · 판매중 자동 설정 (조회 필터 통과)
        sale_status: "판매중",
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
        location: parsed.data.location ?? null,
      });
      // 실재고 테이블 등 구독 컴포넌트 자동 리로드
      window.dispatchEvent(new CustomEvent("products-map-updated"));
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
        icon={<IconTile icon={<Package size={18} strokeWidth={2.4} />} tone="brand" size="md" />}
        titleAccent
        title={
          <span className="flex flex-col leading-tight">
            <span className="text-[18px] font-bold text-ink tracking-tight">상품 신규 등록</span>
            <span className="text-[14px] font-medium text-ink-soft tracking-tight mt-0.5">필수 항목만 입력해도 등록 가능</span>
          </span>
        }
        size="3xl"
        bodyPadding="none"
      >
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="max-h-[72vh] overflow-y-auto bg-[#F7F8FA]">
            {error && (
              <div className="px-5 pt-4">
                <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 shadow-[0_1px_2px_rgba(180,65,60,0.08)]">
                  <span className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  <span className="text-[16px] text-rose-700 font-semibold leading-snug">{error}</span>
                </div>
              </div>
            )}

            <div className="p-5 flex flex-col gap-4">
              {/* 필수 정보 */}
              <Section title="필수 정보" required>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field icon={<Hash size={14} />} label={lockCode ? "상품코드 (스캔 고정)" : "상품코드"} required>
                    <input
                      type="text"
                      value={form.product_code}
                      onChange={(e) => set("product_code", e.target.value)}
                      className={inputCls + (lockCode ? " bg-zinc-100 text-zinc-500 cursor-not-allowed" : "")}
                      placeholder="예: 20250823001"
                      maxLength={50}
                      readOnly={lockCode}
                      autoFocus={!lockCode}
                    />
                  </Field>
                  <Field icon={<Type size={14} />} label="상품명" required>
                    <input
                      type="text"
                      value={form.product_name}
                      onChange={(e) => set("product_name", e.target.value)}
                      className={inputCls}
                      placeholder="예: 타이레놀 500mg"
                      maxLength={200}
                    />
                  </Field>
                </div>
              </Section>

              {/* 분류·공급 */}
              <Section title="분류 · 공급">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div ref={supplierWrapRef} className="relative min-w-0">
                    <Field icon={<Building2 size={14} />} label="공급사">
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
                      <div className="rounded-xl border border-zinc-200 bg-white shadow-[0_16px_48px_-12px_rgba(10,46,74,0.18)] max-h-64 overflow-y-auto py-1">
                        {supplierSuggestions.map(v => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => { set("supplier", v.company_name ?? ""); setSupplierOpen(false); }}
                            className="w-full text-left px-3 py-2 text-[16px] font-medium text-ink hover:bg-zinc-50 focus:outline-none focus:bg-zinc-50 flex items-center gap-2 transition-colors"
                          >
                            <span className="truncate">{v.company_name}</span>
                            {v.category && <span className="ml-auto text-[14px] text-ink-soft shrink-0 tracking-tight">{v.category}</span>}
                          </button>
                        ))}
                      </div>
                    </PortalDropdown>
                  </div>
                  <Field icon={<Tags size={14} />} label="분류코드">
                    <input
                      type="text"
                      value={form.category}
                      onChange={(e) => set("category", e.target.value)}
                      className={inputCls}
                      placeholder="예: 감기약"
                      maxLength={100}
                    />
                  </Field>
                  <Field icon={<Layers size={14} />} label="단위">
                    <input type="text" value={form.unit} onChange={(e) => set("unit", e.target.value)} className={inputCls} placeholder="개 · 박스 · 정" maxLength={30} />
                  </Field>
                  <Field icon={<Ruler size={14} />} label="규격">
                    <input type="text" value={form.spec} onChange={(e) => set("spec", e.target.value)} className={inputCls} placeholder="예: 10정" maxLength={100} />
                  </Field>
                  <div className="relative min-w-0 md:col-span-2">
                    <Field icon={<MapPin size={14} />} label={
                      <span className="flex items-center gap-2">
                        배치구역
                        {warehouseTag && (
                          <span className={`text-[13px] font-bold px-1.5 py-0.5 rounded-md border tracking-tight ${warehouseTag.cls}`}>
                            → {warehouseTag.label}
                          </span>
                        )}
                      </span>
                    }>
                      <ZoneCategoryPicker
                        value={form.location}
                        onChange={(loc) => set("location", loc ?? "")}
                      />
                    </Field>
                  </div>
                </div>
              </Section>

              {/* 참조 상품 (동일 분류코드) */}
              {form.category.trim().length >= 2 && (
                <Section
                  title="동일 분류 · 참조 상품"
                  right={<>
                    <span className="text-[14px] font-semibold text-ink-soft tabular-nums bg-zinc-100 rounded-full px-2 py-0.5">{refList.length}건</span>
                    {refLoading && <Spinner size={13} tone="brand" />}
                  </>}
                >
                  {refList.length === 0 && !refLoading && (
                    <div className="text-[15px] text-ink-soft py-3">해당 분류코드에 등록된 상품이 없습니다</div>
                  )}
                  {refList.length > 0 && (
                    <>
                      <p className="text-[14px] text-ink-soft mb-2">클릭하면 비어있는 필드에 자동 반영</p>
                      <div className="max-h-56 overflow-y-auto flex flex-col gap-1.5 -mr-1 pr-1">
                        {refList.map(r => (
                          <button
                            key={r.product_code}
                            type="button"
                            onClick={() => applyRefProduct(r)}
                            className="text-left px-3 py-2 rounded-lg bg-white hover:bg-brand-tint/30 border border-zinc-200 hover:border-brand hover:shadow-sm transition cursor-pointer"
                            title="클릭 시 빈 필드에만 자동 반영"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[16px] text-ink flex-1 truncate">{r.product_name}</span>
                              <span className="text-[14px] text-ink-soft tabular-nums shrink-0 tracking-tight">{r.product_code}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[14px] text-ink-soft">
                              {r.supplier && <span className="truncate">{r.supplier}</span>}
                              {r.brand && <span className="truncate opacity-70">· {r.brand}</span>}
                              {r.spec && <span className="truncate opacity-70">· {r.spec}</span>}
                              {r.sale_price != null && <span className="ml-auto shrink-0 font-bold tabular-nums text-brand-deep">₩{r.sale_price.toLocaleString()}</span>}
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </Section>
              )}

              {/* 가격 */}
              <Section title="가격">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field icon={<ShoppingCart size={14} />} label="판매가">
                    <PriceInput value={form.sale_price} onChange={(v) => set("sale_price", v)} />
                  </Field>
                  <Field icon={<Coins size={14} />} label="매입가">
                    <PriceInput value={form.purchase_price} onChange={(v) => set("purchase_price", v)} />
                  </Field>
                </div>
              </Section>

              {/* 기타 */}
              <Section title="기타">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field icon={<Award size={14} />} label="브랜드">
                    <input type="text" value={form.brand} onChange={(e) => set("brand", e.target.value)} className={inputCls} placeholder="예: 유한양행" maxLength={100} />
                  </Field>
                  <Field icon={<Factory size={14} />} label="제조사">
                    <input type="text" value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} className={inputCls} placeholder="예: 한미약품" maxLength={100} />
                  </Field>
                </div>
              </Section>
            </div>
          </div>

          {/* 목업 · footer bg-zinc-50 · 우측정렬 */}
          <div className="shrink-0 border-t border-line px-5 py-3.5 flex items-center gap-2 bg-zinc-50">
            <button
              type="button"
              onClick={handleReset}
              disabled={submitting}
              className="h-10 px-3.5 rounded-[10px] text-[16px] font-semibold text-ink-soft hover:text-ink hover:bg-zinc-100 cursor-pointer disabled:opacity-40 transition-colors"
            >
              초기화
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-10 px-4 rounded-[10px] text-[16px] font-semibold text-ink bg-white border border-line hover:border-brand hover:text-brand cursor-pointer disabled:opacity-40 inline-flex items-center gap-1.5 shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)] transition-colors"
            >
              <X size={16} strokeWidth={2.4} /> 취소
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="h-10 px-5 rounded-[10px] text-[16px] font-bold text-white bg-brand-deep hover:bg-brand disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer transition-colors inline-flex items-center gap-1.5 shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_4px_10px_-4px_rgba(10,46,74,0.4)] hover:shadow-[0_6px_14px_-4px_rgba(10,46,74,0.55)]"
            >
              <Save size={16} strokeWidth={2.5} />
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

// ─── 재사용 · Section · Field · 입력 스타일 (목업 UI_MOCKUP_2026-08-21 기준 · 폰트 +2)
const inputCls =
  "w-full h-11 px-3 rounded-[10px] border border-line bg-white text-[17px] font-medium text-ink placeholder:text-zinc-400 focus:outline-none focus:border-brand focus:ring-[3px] focus:ring-brand-tint hover:border-zinc-300 transition-colors";

const Section: React.FC<{
  title: string;
  required?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, required, right, children }) => (
  <section className="rounded-2xl bg-white border border-line shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)] px-5 py-4">
    <div className="flex items-center gap-2 mb-3.5 pb-2.5 border-b border-line/70">
      <span className="inline-block w-[3px] h-5 rounded-sm bg-gradient-to-b from-brand-soft to-brand-deep" />
      <h3 className="text-[17px] font-bold text-ink tracking-tight">{title}</h3>
      {required && <span className="text-[14px] font-semibold text-rose-500 tracking-tight">* 필수</span>}
      {right && <span className="ml-auto flex items-center gap-1.5">{right}</span>}
    </div>
    {children}
  </section>
);

const Field: React.FC<{
  label: React.ReactNode;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, required, icon, children }) => (
  <label className="flex flex-col gap-1.5 min-w-0">
    <span className="text-[15px] font-semibold text-ink tracking-tight inline-flex items-center gap-1.5">
      {icon && <span className="text-ink-soft">{icon}</span>}
      {label}
      {required && <span className="text-rose-500 font-bold">*</span>}
    </span>
    {children}
  </label>
);

const PriceInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div className="relative">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[16px] font-semibold text-ink-soft pointer-events-none">₩</span>
    <input
      type="number"
      min={0}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls + " pl-7 pr-3 tabular-nums text-right"}
      placeholder="0"
    />
  </div>
);

export default ProductCreateModal;
