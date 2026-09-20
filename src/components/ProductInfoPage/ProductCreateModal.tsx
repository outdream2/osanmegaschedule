// src/components/ProductInfoPage/ProductCreateModal.tsx
// 2026-08-23 · #177 Phase C · 상품 신규 등록 모달
//   · POST /api/products · authorize(5) · Zod (CreateProductSchema)
//   · Modal + Card + apiClient + useToast · 프레임워크 원칙 준수
//
// props · open · onClose · onCreated(code) · authSession(권한 표시용)

import React, { useMemo, useState, useRef, useEffect } from "react";
import { devLog, devWarn } from "../../lib/devLog";
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
// 2026-09-14 · #82 · 상세구역 표시 · shelf_positions JSONB 배지
import { ShelfPositionsBadge } from "../common/ShelfPositionsBadge";
// 2026-09-18 · 상세구역 5-slot 입력 · ShelfPositionInput 재사용
import { ShelfPositionInput } from "../common/ShelfPositionInput";
import { useStorageLocations } from "../../hooks/useStorageLocations";
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { CreateProductSchema, type CreateProductInput } from "../../shared/schemas/products";
import { useVendors } from "../../hooks/useVendors";
// 2026-09-18 · 사용자 지시 · 공급사 필터 · (주)·주식회사 접두어 무시 · 양방향 매칭
import { matchesSupplierQuery } from "../../lib/supplierMatch";
import { displayVendorName } from "../../utils/vendorNameNormalize";
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
  // 2026-09-08 · barcode 제거 · product_code 자체가 바코드
  onCreated: (code: string, product?: { product_name: string; supplier: string | null; spec: string | null; location: string | null }) => void;
  /** 2026-08-23 · #179 · 바코드 스캔 미등록 즉시 등록 · product_code 사전 채움 */
  initialCode?: string;
  /** 2026-08-23 · #179 · barcode 사전 채움 (스캔 코드가 바코드 = product_code 인 경우 함께) */
  initialBarcode?: string;
  /** 2026-08-23 · #179 · product_code 필드 readonly (스캔 값 고정) */
  lockCode?: boolean;
  /** 2026-08-23 · #179 · 초기 상품명 (예: OCR/스캔 힌트) */
  initialName?: string;
  // 2026-09-10 · #64 · 사용자 지시 · 편집 모드 지원 (신규/편집 통합)
  /** 편집 모드 · "edit" 이면 PATCH · 아니면 POST (기본 create) */
  mode?: "create" | "edit";
  /** 편집 모드 초기값 · 기존 상품 정보 */
  initialProduct?: Partial<{
    product_code: string;
    product_name: string;
    supplier: string | null;
    category: string | null;
    unit: string | null;
    spec: string | null;
    location: string | null;
    optimal_stock: number | null;
    sale_price: number | null;
    purchase_price: number | null;
    brand: string | null;
    manufacturer: string | null;
    // 2026-09-18 · 사용자 지시 · 편집 모달 · 판매 상태 (판매중/판매중지/숨김) 편집 지원
    sale_status: string | null;
  }>;
}

// 2026-09-18 · 판매 상태 옵션 (ProductDetailView 와 동일 · SSOT)
const SALE_STATUS_OPTIONS = ["판매중", "판매중지", "숨김"];

// 2026-09-08 · barcode 필드 제거 · product_code 자체가 바코드값 (13자리 EAN)
// 2026-09-18 · shelf_detail(1슬롯) → shelf_positions(5슬롯) 로 확장 · 상세 뷰와 동일
type ShelfPositionsDraft = {
  warehouse1: string | null;
  warehouse2: string | null;
  store1: string | null;
  store2: string | null;
  store3: string | null;
};
type Form = {
  product_code: string;
  product_name: string;
  supplier: string;
  category: string;
  unit: string;
  spec: string;
  location: string;
  // 2026-09-18 · shelf_positions 5슬롯 · 상세 뷰 ShelfPositionInput 과 동일 구조
  shelf_positions: ShelfPositionsDraft;
  optimal_stock: string;
  sale_price: string;
  purchase_price: string;
  brand: string;
  manufacturer: string;
  // 2026-09-18 · 사용자 지시 · 편집 모달 · 판매 상태 (판매중/판매중지/숨김) 필드
  sale_status: string;
};

const EMPTY_SHELF: ShelfPositionsDraft = {
  warehouse1: null, warehouse2: null,
  store1: null, store2: null, store3: null,
};

const EMPTY: Form = {
  product_code: "",
  product_name: "",
  supplier: "",
  category: "",
  unit: "",
  spec: "",
  location: "",
  shelf_positions: { ...EMPTY_SHELF },
  optimal_stock: "",
  sale_price: "",
  purchase_price: "",
  brand: "",
  manufacturer: "",
  // 2026-09-18 · 신규 등록 · 기본 판매중
  sale_status: "판매중",
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
  mode = "create", initialProduct,
}) => {
  const isEdit = mode === "edit";
  const { toast, showSuccess, showError } = useToast();
  // 2026-09-18 · 5-slot ShelfPositionInput · 활성 창고/매장 목록
  const storageLocations = useStorageLocations();
  const [form, setForm] = useState<Form>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 2026-08-24 · 사용자 지시 · 공급사 검색 autocomplete
  const { vendors } = useVendors();
  const [supplierOpen, setSupplierOpen] = useState(false);
  const supplierWrapRef = useRef<HTMLDivElement | null>(null);
  // 2026-09-18 · 사용자 지시 · 공급사 자동완성 · (주)·주식회사 무시 · 양방향 매칭
  //   · 이전 · 단순 includes · 쿼리와 회사명 접두어 불일치 시 · 매칭 실패
  //   · fix · matchesSupplierQuery 프리미티브 사용 · 정제 후 부분·초성 매칭
  const supplierSuggestions = useMemo(() => {
    const q = form.supplier.trim();
    if (!q) return vendors.slice(0, 8);
    return vendors
      .filter(v => matchesSupplierQuery(v as any, q))
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

  // 2026-09-14 · #83 · 사용자 지시 · "동일 분류 참조 상품" 섹션 제거
  //   · refList·refLoading state · applyRefProduct 함수 · related useEffect 모두 제거
  //   · 화면 복잡도 감소 · 자동 반영으로 인한 의도치 않은 값 채움 위험 제거

  // 2026-08-23 · #179 · open + initialCode 변경 시 · 사전 채움 (한 번만)
  // 2026-09-08 · barcode 필드 제거 · initialBarcode 는 무시 (product_code 로 통합)
  // 2026-09-10 · #64 · 편집 모드 · initialProduct 로 form 초기화
  React.useEffect(() => {
    if (!open) return;
    if (isEdit && initialProduct) {
      // 2026-09-18 · 편집 모드 · shelf_positions 5슬롯 전체 초기화
      const sp = (initialProduct as any).shelf_positions as Record<string, string | null> | null | undefined;
      const shelfPositions: ShelfPositionsDraft = {
        warehouse1: sp?.warehouse1 ?? null,
        warehouse2: sp?.warehouse2 ?? null,
        store1: sp?.store1 ?? null,
        store2: sp?.store2 ?? null,
        store3: sp?.store3 ?? null,
      };
      setForm({
        product_code: initialProduct.product_code ?? "",
        product_name: initialProduct.product_name ?? "",
        supplier: initialProduct.supplier ?? "",
        category: initialProduct.category ?? "",
        unit: initialProduct.unit ?? "",
        spec: initialProduct.spec ?? "",
        location: initialProduct.location ?? "",
        shelf_positions: shelfPositions,
        optimal_stock: initialProduct.optimal_stock != null ? String(initialProduct.optimal_stock) : "",
        sale_price: initialProduct.sale_price != null ? String(initialProduct.sale_price) : "",
        purchase_price: initialProduct.purchase_price != null ? String(initialProduct.purchase_price) : "",
        brand: initialProduct.brand ?? "",
        manufacturer: initialProduct.manufacturer ?? "",
        // 2026-09-18 · 편집 모드 · 판매 상태 초기화 · 기본 판매중
        sale_status: initialProduct.sale_status ?? "판매중",
      });
    } else {
      setForm({
        ...EMPTY,
        shelf_positions: { ...EMPTY_SHELF },
        product_code: initialCode ?? initialBarcode ?? "",
        product_name: initialName ?? "",
      });
    }
    setError(null);
  // 2026-09-10 · fix · initialProduct 객체 dep · 매 render 재실행 · form 리셋 문제
  //   → product_code 만 dep 로 · 실제 상품 변경 시만 재초기화 · 편집 중 입력 유지
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCode, initialBarcode, initialName, isEdit, initialProduct?.product_code]);

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
    const salePriceNum = parseNum(form.sale_price);
    const purchasePriceNum = parseNum(form.purchase_price);
    return (
      form.product_code.trim().length > 0 &&
      form.product_name.trim().length > 0 &&
      form.sale_status.trim().length > 0 &&
      form.supplier.trim().length > 0 &&
      vendors.some(v => (v.company_name ?? "").trim() === form.supplier.trim()) &&
      salePriceNum !== null && salePriceNum >= 0 &&
      purchasePriceNum !== null && purchasePriceNum >= 0 &&
      !submitting
    );
  }, [form.product_code, form.product_name, form.sale_status, form.supplier, form.sale_price, form.purchase_price, submitting, vendors]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    // 2026-09-10 · #63 · 사용자 지적 · 공급사 · vendors 목록 유효성 검증 필수 (자유 입력 금지)
    const supplierValue = form.supplier.trim();
    if (supplierValue) {
      const validVendor = vendors.some(v => (v.company_name ?? "").trim() === supplierValue);
      if (!validVendor) {
        setError(`공급사 "${supplierValue}" 는 등록된 공급사 목록에 없습니다. 드롭다운에서 선택해주세요.`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const payload: CreateProductInput = {
        product_code: form.product_code.trim(),
        product_name: form.product_name.trim(),
        supplier: form.supplier.trim() || null,
        category: form.category.trim() || null,
        unit: form.unit.trim() || null,
        spec: form.spec.trim() || null,
        // 2026-09-08 · barcode 필드 제거 · product_code 자체가 바코드값 (13자리 EAN)
        location: form.location.trim() || null,
        optimal_stock: parseNum(form.optimal_stock),
        sale_price: parseNum(form.sale_price),
        purchase_price: parseNum(form.purchase_price),
        brand: form.brand.trim() || null,
        manufacturer: form.manufacturer.trim() || null,
        // 2026-09-18 · 사용자 지시 · 편집 모달 · 판매 상태 편집 지원 · form 값 사용
        //   · 신규 등록 · EMPTY 기본 '판매중'
        sale_status: form.sale_status.trim() || "판매중",
      };
      // 2026-09-18 · 상세구역 저장 · 5슬롯 전부 PATCH · null = 해당 위치 삭제
      const savedCode = form.product_code.trim();
      const saveShelfPositions = async (code: string) => {
        const sp = form.shelf_positions;
        const hasAny = Object.values(sp).some(v => v != null);
        if (!hasAny) return;
        try {
          await api.patch(`/api/products/${encodeURIComponent(code)}/shelf-positions`, {
            shelf_positions: sp,
          });
          // 실재고 테이블 자동 동기
          window.dispatchEvent(new CustomEvent("inventory-checks-updated", {
            detail: { source: "product-modal", productCode: code },
          }));
        } catch (spErr: any) {
          devWarn(`[ProductCreateModal] shelf_positions 저장 실패 (경고 · 등록·수정은 성공): ${spErr?.message ?? spErr}`);
        }
      };

      // 2026-09-10 · #64 · 편집 모드 · PATCH · 신규 · POST
      if (isEdit) {
        const code = savedCode;
        const patchBody = {
          product_name: payload.product_name,
          supplier: payload.supplier,
          category: payload.category,
          unit: payload.unit,
          spec: payload.spec,
          location: payload.location,
          optimal_stock: payload.optimal_stock,
          sale_price: payload.sale_price,
          purchase_price: payload.purchase_price,
          brand: payload.brand,
          manufacturer: payload.manufacturer,
          // 2026-09-18 · 사용자 지시 · 편집 모달 · 판매 상태 편집
          sale_status: payload.sale_status,
        };
        await api.patch(`/api/products/${encodeURIComponent(code)}`, patchBody);
        await saveShelfPositions(code);
        showSuccess(`상품 정보 수정 완료 · ${code}`);
        onCreated(code, {
          product_name: patchBody.product_name,
          supplier: patchBody.supplier ?? null,
          spec: patchBody.spec ?? null,
          location: patchBody.location ?? null,
        });
        window.dispatchEvent(new CustomEvent("products-map-updated"));
        onClose();
      } else {
        // 클라이언트 사전 검증 (Zod)
        const parsed = CreateProductSchema.safeParse(payload);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          throw new Error(`${first?.path.join(".") ?? "input"}: ${first?.message ?? "유효성 오류"}`);
        }
        const { data } = await api.post<{ ok: boolean; product_code: string }>("/api/products", parsed.data);
        await saveShelfPositions(data.product_code);
        showSuccess(`상품 등록 완료 · ${data.product_code}`);
        onCreated(data.product_code, {
          product_name: parsed.data.product_name,
          supplier: parsed.data.supplier ?? null,
          spec: parsed.data.spec ?? null,
          location: parsed.data.location ?? null,
        });
        window.dispatchEvent(new CustomEvent("products-map-updated"));
        setForm({ ...EMPTY, shelf_positions: { ...EMPTY_SHELF } });
        onClose();
      }
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : (e as Error)?.message ?? "상품 등록 실패";
      setError(msg);
      showError(`[상품 등록] ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setForm({ ...EMPTY, shelf_positions: { ...EMPTY_SHELF } });
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
            {/* 2026-09-10 · #64 · 사용자 지시 · 신규/편집 · 모드별 제목 */}
            <span className="text-[18px] font-bold text-ink tracking-tight">{isEdit ? "상품 정보 수정" : "상품 신규 등록"}</span>
            <span className="text-[14px] font-medium text-ink-soft tracking-tight mt-0.5">
              {isEdit ? "변경할 항목만 편집 후 저장" : "필수 항목만 입력해도 등록 가능"}
            </span>
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
              {/* 필수 정보 · 2026-09-20 · 공급사·가격·판매상태 필수 이동 (사용자 지시) */}
              <Section title="필수 정보" required>
                {/* 행 1 · 상품코드 · 상품명 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field icon={<Hash size={14} />} label={lockCode ? "상품코드 (스캔 고정)" : "상품코드"} required>
                    <input
                      lang="ko" type="text"
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
                      lang="ko" type="text"
                      value={form.product_name}
                      onChange={(e) => set("product_name", e.target.value)}
                      className={inputCls}
                      placeholder="예: 타이레놀 500mg"
                      maxLength={200}
                    />
                  </Field>
                </div>
                {/* 행 2 · 공급사 필수 (2026-09-20 · 필수 이동) */}
                <div className="mt-4">
                  <div ref={supplierWrapRef} className="relative min-w-0">
                    <Field icon={<Building2 size={14} />} label="공급사" required>
                      {(() => {
                        const s = form.supplier.trim();
                        const isValid = !s || vendors.some(v => (v.company_name ?? "").trim() === s);
                        return (
                          <input
                            lang="ko" type="text"
                            value={form.supplier}
                            onChange={(e) => { set("supplier", e.target.value); setSupplierOpen(true); }}
                            onFocus={() => setSupplierOpen(true)}
                            onBlur={() => {
                              setTimeout(() => {
                                setForm(prev => {
                                  const v = prev.supplier.trim();
                                  if (v && !vendors.some(x => (x.company_name ?? "").trim() === v)) {
                                    return { ...prev, supplier: "" };
                                  }
                                  return prev;
                                });
                              }, 200);
                            }}
                            className={`${inputCls} ${!isValid ? "!border-rose-400 !bg-rose-50/50" : ""}`}
                            placeholder="검색 후 목록에서 선택 (필수)"
                            maxLength={100}
                            autoComplete="off"
                            aria-invalid={!isValid}
                          />
                        );
                      })()}
                    </Field>
                    {form.supplier.trim() && !vendors.some(v => (v.company_name ?? "").trim() === form.supplier.trim()) && (
                      <div className="mt-1 text-[13px] font-semibold text-rose-600">
                        ⚠ 목록에 없는 공급사 · 드롭다운에서 선택하세요
                      </div>
                    )}
                    <PortalDropdown anchorRef={supplierWrapRef} open={supplierOpen && supplierSuggestions.length > 0}>
                      <div className="rounded-xl border border-zinc-200 bg-white shadow-[0_16px_48px_-12px_rgba(10,46,74,0.18)] max-h-64 overflow-y-auto py-1">
                        {supplierSuggestions.map(v => (
                          <button
                            key={v.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              set("supplier", v.company_name ?? "");
                              setSupplierOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 text-[16px] font-medium text-ink hover:bg-zinc-50 focus:outline-none focus:bg-zinc-50 flex items-center gap-2 transition-colors"
                          >
                            <span className="break-words break-keep">{displayVendorName(v.company_name) || v.company_name}</span>
                            {v.category && <span className="ml-auto text-[14px] text-ink-soft shrink-0 tracking-tight">{v.category}</span>}
                          </button>
                        ))}
                      </div>
                    </PortalDropdown>
                  </div>
                </div>
                {/* 행 3 · 판매가·매입가 필수 (2026-09-20 · 필수 이동) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <Field icon={<ShoppingCart size={14} />} label="판매가" required>
                    <PriceInput value={form.sale_price} onChange={(v) => set("sale_price", v)} />
                  </Field>
                  <Field icon={<Coins size={14} />} label="매입가" required>
                    <PriceInput value={form.purchase_price} onChange={(v) => set("purchase_price", v)} />
                  </Field>
                </div>
                {/* 행 4 · 판매 상태 필수 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <Field icon={<Tags size={14} />} label="판매 상태" required>
                    <select
                      value={form.sale_status}
                      onChange={(e) => set("sale_status", e.target.value)}
                      className={inputCls + " cursor-pointer"}
                    >
                      {SALE_STATUS_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </Section>

              {/* 분류 · 기타 */}
              <Section title="분류 · 기타">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field icon={<Tags size={14} />} label="분류코드">
                    <input
                      lang="ko" type="text"
                      value={form.category}
                      onChange={(e) => set("category", e.target.value)}
                      className={inputCls}
                      placeholder="예: 감기약"
                      maxLength={100}
                    />
                  </Field>
                  <Field icon={<Layers size={14} />} label="단위">
                    <input lang="ko" type="text" value={form.unit} onChange={(e) => set("unit", e.target.value)} className={inputCls} placeholder="개 · 박스 · 정" maxLength={30} />
                  </Field>
                  <Field icon={<Ruler size={14} />} label="규격">
                    <input lang="ko" type="text" value={form.spec} onChange={(e) => set("spec", e.target.value)} className={inputCls} placeholder="예: 10정" maxLength={100} />
                  </Field>
                  {/* 2026-09-20 · 진열구역 선택 · 창고/매장 자동 결정 (사용자 지시) */}
                  <div className="col-span-full relative min-w-0">
                    <Field icon={<MapPin size={14} />} label={
                      <span className="flex items-center gap-2">
                        진열구역
                        {warehouseTag && (
                          <span className={`text-[13px] font-bold px-1.5 py-0.5 rounded-md border tracking-tight ${warehouseTag.cls}`}>
                            → {warehouseTag.label}
                          </span>
                        )}
                      </span>
                    }>
                      <ZoneCategoryPicker
                        value={form.location}
                        onChange={(loc) => {
                          set("location", loc ?? "");
                          // 진열위치 변경 시 상세구역 초기화 (이전 값 버림)
                          setForm(prev => ({
                            ...prev,
                            location: loc ?? "",
                            shelf_positions: { ...EMPTY_SHELF },
                          }));
                        }}
                      />
                    </Field>
                  </div>
                  {/* 2026-09-20 · 상세구역 · 진열위치 선택 시만 표시 · 창고1/2 중 하나 + 매장 추가 방식 */}
                  {form.location.trim() && (
                    <ShelfPositionSection
                      location={form.location.trim()}
                      warehouseTag={warehouseTag}
                      shelfPositions={form.shelf_positions}
                      storageLocations={storageLocations}
                      onChange={(code, val) =>
                        setForm(prev => ({
                          ...prev,
                          shelf_positions: { ...prev.shelf_positions, [code]: val },
                        }))
                      }
                      productCode={isEdit ? form.product_code : undefined}
                    />
                  )}
                </div>
              </Section>

              {/* 2026-09-14 · #83 · 사용자 지시 · "동일 분류 참조 상품" 섹션 제거 */}

              {/* 기타 */}
              <Section title="기타">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field icon={<Award size={14} />} label="브랜드">
                    <input lang="ko" type="text" value={form.brand} onChange={(e) => set("brand", e.target.value)} className={inputCls} placeholder="예: 유한양행" maxLength={100} />
                  </Field>
                  <Field icon={<Factory size={14} />} label="제조사">
                    <input lang="ko" type="text" value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} className={inputCls} placeholder="예: 한미약품" maxLength={100} />
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

// ─── 2026-09-20 · 상세구역 섹션 · 진열위치 선택 시만 표시
//   · 창고: classifyArrivalSlot 결과 기준 warehouse1 or warehouse2 중 하나만 표시
//   · 매장: 매장1 기본 표시 · +매장2 +매장3 추가 버튼
interface ShelfPositionSectionProps {
  location: string;
  warehouseTag: { label: string; cls: string } | null;
  shelfPositions: ShelfPositionsDraft;
  storageLocations: import("../../shared/schemas/settings").StorageLocation[];
  onChange: (code: string, val: string | null) => void;
  productCode?: string;
}
const ShelfPositionSection: React.FC<ShelfPositionSectionProps> = ({
  location, warehouseTag, shelfPositions, storageLocations, onChange, productCode,
}) => {
  const [extraStores, setExtraStores] = React.useState<string[]>([]);

  // 창고 슬롯: classifyArrivalSlot 결과로 warehouse1 or warehouse2 하나만
  const warehouseSlot: "warehouse1" | "warehouse2" | null = (() => {
    const slot = classifyArrivalSlot(location);
    if (slot === "w1") return "warehouse1";
    if (slot === "w2") return "warehouse2";
    // 창고코드 아닌 경우: warehouseTag 없으면 둘 다 미표시 · warehouseTag 있으면 추론
    if (warehouseTag?.label === "창고1") return "warehouse1";
    if (warehouseTag?.label === "창고2") return "warehouse2";
    return null;
  })();

  // 매장 슬롯: store1 기본 + 추가된 슬롯
  const storeSlots: string[] = ["store1", ...extraStores];
  const availableExtraStores = ["store2", "store3"].filter(s => !extraStores.includes(s));

  const getLocInfo = (code: string) => storageLocations.find(l => l.code === code);

  return (
    <div className="col-span-full">
      <div className="flex items-center gap-1.5 mb-2">
        <MapPin size={14} className="text-ink-soft" />
        <span className="text-[15px] font-semibold text-ink tracking-tight">상세구역</span>
        <span className="text-[13px] text-ink-soft">(층·칸·순서 3자리 · 예: 332)</span>
      </div>
      <div className="flex flex-wrap gap-3 pt-1">
        {/* 창고 슬롯 */}
        {warehouseSlot && (() => {
          const loc = getLocInfo(warehouseSlot);
          if (!loc?.active) return null;
          return (
            <ShelfPositionInput
              key={warehouseSlot}
              label={loc.name}
              required={false}
              value={shelfPositions[warehouseSlot as keyof ShelfPositionsDraft] ?? null}
              onChange={(v) => onChange(warehouseSlot, v)}
              productCode={productCode}
              displayLocation={location}
              storageKey={warehouseSlot}
            />
          );
        })()}
        {/* 매장 슬롯 */}
        {storeSlots.map(code => {
          const loc = getLocInfo(code);
          if (!loc?.active) return null;
          return (
            <ShelfPositionInput
              key={code}
              label={loc.name}
              required={loc.required_detail}
              value={shelfPositions[code as keyof ShelfPositionsDraft] ?? null}
              onChange={(v) => onChange(code, v)}
              productCode={productCode}
              displayLocation={location}
              storageKey={code}
            />
          );
        })}
        {/* 매장 추가 버튼 */}
        {availableExtraStores.map(code => {
          const loc = getLocInfo(code);
          if (!loc?.active) return null;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setExtraStores(prev => [...prev, code])}
              className="h-9 px-3 rounded-lg border border-dashed border-brand-tint text-[14px] font-semibold text-brand-deep hover:bg-brand-tint/50 transition-colors cursor-pointer flex items-center gap-1"
            >
              + {loc.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ProductCreateModal;
