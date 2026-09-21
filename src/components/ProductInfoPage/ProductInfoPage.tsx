// src/components/ProductInfoPage/ProductInfoPage.tsx
// 2026-08-23 · #177 · Phase A/B · 상품정보 페이지 (매장>매입 서브탭)
//   · 좌측 SplitListPanel · 우측 상세 (PC lg+) / 모바일 모달
//   · Phase A: 탭 진입 · 좌측 리스트 · SplitListPanel 활용
//   · Phase B: 상세 조회 (product_code · supplier · category · optimal_stock 등)
//   · Phase C/D: 등록/편집 · 후속 커밋
//
// 프레임워크 원칙 · SplitListPanel · Card · Modal · SplitPanel(resize) · apiClient · useToast

import React, { useEffect, useMemo, useState } from "react";
import { devLog, devWarn } from "../../lib/devLog";
import {
  Package, PencilSimple, FloppyDisk, X, ArrowSquareOut,
} from "@phosphor-icons/react";
import { Button } from "../common/Button";
import { SearchBar } from "../common/SearchBar";
import { SplitListPanel } from "../common/SplitListPanel";
import { SaleStatusFilter } from "../common/SaleStatusFilter";
import { useSaleStatusFilter } from "../../hooks/useSaleStatusFilter";
import { Modal } from "../common/Modal";
import { Card } from "../common/Card";
import { SplitPanel } from "../common/SplitPanel";
import { ProductCreateModal } from "./ProductCreateModal";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { GradientAccent } from "../common/GradientAccent";
import { SectionTitle } from "../LandingPage/VendorDetailModal.helpers";
import { useToast, toastClass } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { api, ApiError } from "../../lib/apiClient";
// 2026-09-14 · inventoryChecksApi · productsApi 프리미티브
import { saveInventoryCheck } from "../../lib/inventoryChecksApi";
import { getProductByCode } from "../../lib/productsApi";
// 2026-09-14 · 통계설정 · 적정재고 계산 일수 · 실시간 반영
import { useOptimalStockPeriod } from "../../hooks/useOptimalStockPeriod";
import { PAGE_CONTAINER_CLS, CARD_BASE } from "../../styles/tokens";
import { AccentBar } from "../common/AccentBar";
import { matchesProductQuery } from "../../lib/productMatch";
import { displayVendorName } from "../../utils/vendorNameNormalize";
// 2026-09-18 · 사용자 지시 · 왼쪽 리스트 · 카드→표 · 자동정렬 헤더
import { useSortableTable, type Comparator } from "../../hooks/useSortableTable";
import { SortHeader } from "../common/SortHeader";
import type { AuthSession } from "../../types";
import { UpdateProductSchema, type UpdateProductInput } from "../../shared/schemas/products";
import { consumeScanPendingProductCode } from "../../hooks/useScanUnregisteredMode";
import { useVendorInfoModal } from "../common/features/VendorInfoModal";
// 2026-09-08 · 상세 진열위치 · 위치별 3-stepper 입력 + 표시
import { ShelfPositionInput } from "../common/ShelfPositionInput";
import { ShelfPositionsBadge } from "../common/ShelfPositionsBadge";
import { useStorageLocations } from "../../hooks/useStorageLocations";
import type { ShelfPositions } from "../../lib/shelfPositions";
// 2026-09-18 · 사용자 지시 · 계층 2 클라 폴백 · shelf_positions 비어있어도 · location 있으면 슬롯 계산
import { mergeShelfPositionsWithFallback, formatShelfPositions, formatShelfDetail } from "../../lib/shelfPositions";

// ─── Types ────────────────────────────────────────────────────────────────
interface ProductRow {
  product_code: string;
  product_name: string;
  supplier?: string | null;
  category?: string | null;
  unit?: string | null;
  current_stock?: number | null;
  optimal_stock?: number | null;
  location?: string | null;
  // 2026-09-08 · barcode 제거 · product_code 자체가 바코드값
  spec?: string | null;
  sale_status?: string | null; // 2026-08-26 · 사용자 지시 · 판매중 필터용
  // 2026-09-18 · 사용자 지시 · 왼쪽 리스트 · 판매가 컬럼 표시 · products.sale_price 매핑
  sale_price?: number | null;
}

interface ProductDetail extends ProductRow {
  warehouse_stock?: number | null;   // 창고1 (warehouse1_stock alias)
  warehouse1_stock?: number | null;
  warehouse2_stock?: number | null;  // 창고2
  store_stock?: number | null;       // 매장1
  store3_stock?: number | null;      // 매장3
  inv_checked_at?: string | null;
  last_purchase_date?: string | null;
  sale_price?: number | null;
  purchase_price?: number | null;
  // 2026-09-08 · 상세 진열위치 · JSONB (inventory_checks.shelf_positions)
  shelf_positions?: ShelfPositions | null;
}

interface Props {
  authSession: AuthSession | null;
}

// 권한 · 관리자 전체 + 매니저 lv5+
function canManageProducts(session: AuthSession | null): boolean {
  if (!session) return false;
  if (session.role === "admin" || session.role === "superadmin") return true;
  if (session.role === "manager" && (session.level ?? 0) >= 5) return true;
  return false;
}

// ─── Detail panel ─────────────────────────────────────────────────────────
// 2026-09-08 · barcode 편집 필드 제거 · product_code 자체가 바코드
type EditableKey =
  | "product_name" | "supplier" | "category" | "unit" | "spec"
  | "location" | "optimal_stock" | "sale_price" | "purchase_price"
  | "brand" | "manufacturer" | "sale_status";

const NUMBER_KEYS = new Set<EditableKey>(["optimal_stock", "sale_price", "purchase_price"]);
const SALE_STATUS_OPTIONS = ["판매중", "판매중지", "숨김"];

const inputCls =
  "w-full h-8 px-2.5 rounded-md border border-line bg-white text-[17px] font-medium text-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition-colors";

interface DetailProps {
  product: ProductDetail | null;
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  onSaved: () => void;
  // 2026-09-10 · #64 · 사용자 지시 · [수정] 버튼 · 인라인 편집 대신 · 모달 open 콜백
  onEditClick?: (product: ProductDetail) => void;
}

const ProductDetailView: React.FC<DetailProps> = ({ product, loading, error, canEdit, onSaved, onEditClick }) => {
  const { toast, showSuccess, showError } = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<EditableKey, string>>({} as Record<EditableKey, string>);
  const [saving, setSaving] = useState(false);
  const vendorModal = useVendorInfoModal();
  // 2026-09-14 · 통계설정 · 적정재고 계산 일수 (SeasonSettingsPage KV) · 실시간 반영
  const { days: optimalStockDays } = useOptimalStockPeriod();
  // 진열위치 드롭다운 옵션 (zone_defs) — hooks를 early return 앞에 배치 (Rules of Hooks)
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  // 2026-09-08 · 상세 진열위치 draft (편집 중 값)
  const storageLocations = useStorageLocations();
  const [shelfDraft, setShelfDraft] = useState<ShelfPositions>({});

  useEffect(() => {
    setEditing(false);
    setDraft({} as Record<EditableKey, string>);
    setShelfDraft({});
  }, [product?.product_code]);

  useEffect(() => {
    api.get<Array<{ zone?: string; location?: string }>>("/api/zone-defs")
      .then(({ data }) => {
        const zones = Array.from(new Set((data ?? []).map(d => d.zone).filter(Boolean))) as string[];
        setLocationOptions(zones);
      })
      .catch(() => { /* silent */ });
  }, []);

  if (loading) return <div className="flex items-center justify-center py-16"><Spinner size={22} tone="brand" label="불러오는 중..." /></div>;
  if (error) return <div className="p-4"><Card variant="flat" padding="md" rounded="lg" bg="bg-rose-50" borderColor="border-rose-200" className="text-[14px] text-rose-700 font-medium">{error}</Card></div>;
  if (!product) return <div className="flex items-center justify-center py-16"><EmptyState icon={Package as any} title="상품을 선택하세요" hint="좌측 리스트에서 상품을 선택하면 상세정보가 표시됩니다" /></div>;

  const p = product as unknown as Record<string, unknown>;
  const val = (k: EditableKey): string => {
    if (k in draft) return draft[k];
    const v = p[k];
    return v == null ? "" : String(v);
  };
  const set = (k: EditableKey, v: string) => setDraft(prev => ({ ...prev, [k]: v }));

  const startEdit = () => {
    setEditing(true);
    setDraft({} as Record<EditableKey, string>);
    // 2026-09-08 · 편집 시작 · 현재 shelf_positions 값을 draft 로 로드 (변경 추적)
    // 2026-09-18 · 사용자 지시 · 계층 2 클라 폴백 · shelf_positions 비어있어도 · location 있으면 default 슬롯 seed
    //   · 레거시 상품 (DB 자동 배정 이전 등록) · 편집 화면 · 창고1/2·매장1 슬롯 즉시 나타남
    //   · 사용자가 값 입력·저장 시 · DB 반영 (자동 DB 쓰기 X · 편집 액션에서만 저장)
    const merged = mergeShelfPositionsWithFallback(
      product?.shelf_positions ?? {},
      product?.location ?? (product as any)?.display_location ?? null,
      (product as any)?.category_code ?? null,
    );
    setShelfDraft(merged);
  };
  const cancelEdit = async () => {
    const hasShelfChange = JSON.stringify(shelfDraft ?? {}) !== JSON.stringify(product?.shelf_positions ?? {});
    if (Object.keys(draft).length > 0 || hasShelfChange) {
      const ok = await confirm({ title: "변경 취소", message: "저장하지 않은 변경사항을 취소하시겠습니까?", danger: true });
      if (!ok) return;
    }
    setEditing(false);
    setDraft({} as Record<EditableKey, string>);
    setShelfDraft({});
  };
  const save = async () => {
    const changes: Partial<UpdateProductInput> = {};
    for (const [rawK, rawV] of Object.entries(draft)) {
      const k = rawK as EditableKey;
      const trimmed = rawV.trim();
      const originalRaw = p[k];
      const original = originalRaw == null ? "" : String(originalRaw);
      if (trimmed === original) continue;
      if (NUMBER_KEYS.has(k)) (changes as Record<string, unknown>)[k] = trimmed === "" ? null : Number(trimmed);
      else (changes as Record<string, unknown>)[k] = trimmed === "" ? null : trimmed;
    }
    // 2026-09-08 · shelf_positions 변경 여부
    const originalShelf = (product?.shelf_positions ?? {}) as ShelfPositions;
    const shelfChanged = JSON.stringify(shelfDraft) !== JSON.stringify(originalShelf);

    // 매장(required_detail=true) 필수 체크 · 값이 없으면 저장 차단
    if (shelfChanged) {
      const requiredCodes = storageLocations.filter(l => l.active && l.required_detail).map(l => l.code);
      for (const code of requiredCodes) {
        const v = shelfDraft[code];
        // key 자체가 없는 위치는 사용자가 안 쓰는 위치 · required 무관 · 저장 없으면 pass
        // key 는 있는데 값이 없는 경우만 (사용자가 지웠거나 미입력) · 에러
        const hasKey = Object.prototype.hasOwnProperty.call(shelfDraft, code);
        if (hasKey && (v === null || v === "" || (typeof v === "string" && v.length !== 3))) {
          const loc = storageLocations.find(l => l.code === code);
          showError(`${loc?.name ?? code} 위치는 상세위치가 필수입니다 (3자리 · 예 332)`);
          return;
        }
      }
    }

    if (Object.keys(changes).length === 0 && !shelfChanged) { showError("변경사항이 없습니다"); return; }
    const parsed = UpdateProductSchema.safeParse(changes);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      showError(`${first?.path.join(".") ?? "input"}: ${first?.message ?? "유효성 오류"}`);
      return;
    }
    setSaving(true);
    try {
      if (Object.keys(changes).length > 0) {
        await api.patch(`/api/products/${encodeURIComponent(product.product_code)}`, parsed.data);
      }
      // 2026-09-08 · 상세 진열위치 저장 · inventory_checks POST (부분 병합)
      if (shelfChanged) {
        await saveInventoryCheck({
          product_code: product.product_code,
          product_name: product.product_name,
          shelf_positions: shelfDraft,
        });
      }
      showSuccess("상품 정보 저장 완료");
      setEditing(false);
      setDraft({} as Record<EditableKey, string>);
      setShelfDraft({});
      onSaved();
      // 구역/상품 변경 시 실재고 테이블 등 자동 리로드
      window.dispatchEvent(new CustomEvent("products-map-updated"));
    } catch (e: unknown) {
      showError(`[상품 편집] ${e instanceof ApiError ? e.message : (e as Error)?.message ?? "저장 실패"}`);
    } finally { setSaving(false); }
  };

  // 2026-09-08 · shelf_position 편집 핸들러
  const setShelf = (code: string, val: string | null) => {
    setShelfDraft(prev => ({ ...prev, [code]: val }));
  };
  const addShelfLocation = (code: string) => {
    if (Object.prototype.hasOwnProperty.call(shelfDraft, code)) return;
    setShelfDraft(prev => ({ ...prev, [code]: null }));
  };

  // ─── field helpers ─────────────────────────────────────────────────────
  const dispVal = (key: string) => {
    const v = p[key];
    return v == null || v === "" ? <span className="text-zinc-300">-</span> : <span className="text-ink font-semibold">{String(v)}</span>;
  };

  // 2026-09-20 · 사용자 지시 · 배지 → Linear/Notion 텍스트 라벨 (uppercase · tracking-wider · zinc-500)
  //   · 라벨: text-[11px] font-medium text-zinc-500 uppercase tracking-wider
  //   · 값:   text-[16px] font-semibold text-ink
  const DField = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] font-semibold text-ink-soft">{label}</span>
      <div className="text-[16px] font-semibold text-ink">{children}</div>
    </div>
  );
  const EditField = ({ k, label, type = "text" }: { k: EditableKey; label: string; type?: "text" | "number" }) => (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] font-semibold text-ink-soft">{label}</span>
      {k === "sale_status" ? (
        <select value={val(k)} onChange={(e) => set(k, e.target.value)} className={inputCls}>
          {SALE_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : k === "location" ? (
        <select value={val(k)} onChange={(e) => set(k, e.target.value)} className={inputCls}>
          <option value="">-선택-</option>
          {locationOptions.map(z => <option key={z} value={z}>{z}</option>)}
          {val(k) && !locationOptions.includes(val(k)) && (
            <option value={val(k)}>{val(k)}</option>
          )}
        </select>
      ) : (
        <input
          lang="ko" type={type}
          value={val(k)}
          onChange={(e) => set(k, e.target.value)}
          min={type === "number" ? 0 : undefined}
          className={inputCls + (type === "number" ? " tabular-nums" : "")}
        />
      )}
    </div>
  );

  const profitRate = (() => {
    const sp = Number(p.sale_price ?? 0), pp = Number(p.purchase_price ?? 0);
    if (!sp) return null;
    return Math.round((sp - pp) / sp * 1000) / 10;
  })();

  // 2026-09-14 · 사용자 지시 · 완전 재설계 · 중복 제거 + Notion 데이터베이스 톤
  //   · Hero (큰 상품명 · 하나만) → 3-KPI 인라인 → 진열위치 통합 → 상세정보 key-value 테이블
  //   · 중복 · 상품명·공급사·진열위치·shelf 뱃지 · 각각 1회만 표시
  const w1 = product.warehouse1_stock ?? product.warehouse_stock ?? null;
  const w2 = product.warehouse2_stock ?? null;
  const totalWarehouse = (w1 ?? 0) + (w2 ?? 0);
  const totalStore = product.store_stock ?? 0;

  return (
    <>
      {/* ══════════════ HERO · 상품명 크게 · 코드·상태만 · 편집 버튼 우측 ══════════════ */}
      <div className="relative px-6 pt-6 pb-5 border-b border-line bg-white shrink-0 sticky top-0 z-10">
        <GradientAccent size="thin" />
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* 상품명 · 큰 hero · 이름·코드·상태·카테고리 */}
            <h1 className="text-[22px] font-extrabold text-ink leading-tight tracking-tight break-keep">
              {product.product_name || <span className="text-zinc-300 font-normal">(이름없음)</span>}
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[13px] font-mono text-zinc-500 bg-zinc-100 rounded-md px-2 py-0.5 tabular-nums">{product.product_code}</span>
              {(() => {
                const s = String(p.sale_status ?? "");
                if (!s) return null;
                const tone = s === "판매중" ? "emerald" : s === "판매중지" ? "rose" : "zinc";
                return <StatusPill tone={tone} size="sm">{s}</StatusPill>;
              })()}
              {/* 2026-09-14 · 사용자 지시 · 판매중 옆 분류 표시 제거 · 분류는 아래 정보 섹션에 */}
            </div>
          </div>
          {editing ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <StatusPill tone="amber" size="xs">편집 중</StatusPill>
              <Button variant="primary" size="sm" icon={<FloppyDisk size={13} weight="bold" />} onClick={save} loading={saving}>저장</Button>
              <Button variant="secondary" size="sm" icon={<X size={13} />} onClick={cancelEdit} disabled={saving} />
            </div>
          ) : canEdit ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<PencilSimple size={13} weight="bold" />}
              onClick={() => {
                if (onEditClick && product) { onEditClick(product); return; }
                startEdit();
              }}
              title="상품정보 수정"
            >
              수정
            </Button>
          ) : null}
        </div>
      </div>

      {/* ══════════════ 본문 · 상품정보 우선 · 클린 텍스트 리스트 (Shopify/Notion 톤) ══════════════ */}
      {/* 사용자 지시 · 재고보다 가격·공급사 우선 · 텍스트 형식으로 한눈에 · 라벨 +3 크게 */}
      <div className="px-6 py-5 space-y-5">

        {/* ─── SECTION 1 · 가격 정보 · 2026-09-20 · 배지 → 텍스트 라벨 (Linear/Notion 톤) ─── */}
        <section className="space-y-0">
          <h3 className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider pb-2 border-b border-zinc-100">
            가격 정보
          </h3>
          <div className="grid grid-cols-2 gap-x-4">
            <div className="flex flex-col gap-0.5 py-3 border-b border-zinc-100">
              <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">판매가</span>
              {editing
                ? <input type="number" min={0} value={val("sale_price")} onChange={e => set("sale_price", e.target.value)} className={inputCls + " tabular-nums text-[14px] max-w-[140px]"} />
                : p.sale_price != null
                  ? <span className="text-[20px] font-extrabold text-brand-deep tabular-nums leading-tight tracking-tight">{Number(p.sale_price).toLocaleString()}<span className="text-[13px] font-bold ml-0.5 text-brand-deep/70">원</span></span>
                  : <span className="text-zinc-300 text-[15px]">-</span>}
            </div>
            <div className="flex flex-col gap-0.5 py-3 border-b border-zinc-100">
              <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">매입가</span>
              {editing
                ? <input type="number" min={0} value={val("purchase_price")} onChange={e => set("purchase_price", e.target.value)} className={inputCls + " tabular-nums text-[14px] max-w-[140px]"} />
                : p.purchase_price != null
                  ? <span className="text-[18px] font-bold text-amber-700 tabular-nums leading-tight tracking-tight">{Number(p.purchase_price).toLocaleString()}<span className="text-[12px] font-semibold ml-0.5 text-amber-600">원</span></span>
                  : <span className="text-zinc-300 text-[15px]">-</span>}
            </div>
            <div className="col-span-2 flex flex-col gap-0.5 py-3 border-b border-zinc-100">
              <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">이익율</span>
              {profitRate != null
                ? <span className={`text-[18px] font-bold tabular-nums leading-tight tracking-tight ${profitRate >= 30 ? "text-emerald-600" : profitRate >= 15 ? "text-amber-600" : "text-rose-600"}`}>{profitRate}<span className="text-[13px] font-semibold ml-0.5">%</span></span>
                : <span className="text-zinc-300 text-[15px]">-</span>}
            </div>
          </div>
        </section>

        {/* ─── SECTION 2 · 공급사·기본 정보 · 2026-09-20 · 텍스트 라벨 ─── */}
        <section className="space-y-0">
          <h3 className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider pb-2 border-b border-zinc-100">
            공급사 · 기본 정보
          </h3>
          <div className="space-y-0">
            {/* 편집모드 · 상품명 */}
            {editing && (
              <div className="flex flex-col gap-0.5 py-3 border-b border-zinc-100">
                <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">상품명</span>
                <div className="max-w-md"><EditField k="product_name" label="" /></div>
              </div>
            )}
            {/* 공급사 */}
            <div className="flex flex-col gap-0.5 py-3 border-b border-zinc-100">
              <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">공급사</span>
              {editing
                ? <div className="max-w-[220px]"><EditField k="supplier" label="" /></div>
                : product.supplier
                  ? <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <span className="text-[16px] font-bold text-ink whitespace-normal break-words break-keep">{displayVendorName(product.supplier) || product.supplier}</span>
                      <button
                        type="button"
                        onClick={() => vendorModal.openVendorInfo(product.supplier!)}
                        className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-[12px] font-medium text-zinc-600 transition cursor-pointer shrink-0"
                      >
                        상세<ArrowSquareOut size={10} />
                      </button>
                    </div>
                  : <span className="text-zinc-300 text-[15px]">-</span>}
            </div>
            {/* 최근매입 */}
            <div className="flex flex-col gap-0.5 py-3 border-b border-zinc-100">
              <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">최근매입</span>
              {p.last_purchase_date
                ? <span className="text-[16px] font-bold text-ink tabular-nums mt-0.5">{String(p.last_purchase_date).slice(0, 10)}</span>
                : <span className="text-zinc-300 text-[15px]">-</span>}
            </div>
            {/* 규격·단위·브랜드·제조사·분류 · 2-col grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              {([
                { k: "spec" as const, label: "규격" },
                { k: "unit" as const, label: "단위" },
                { k: "brand" as const, label: "브랜드" },
                { k: "manufacturer" as const, label: "제조사" },
              ] as const).map(({ k, label }) => (
                <div key={k} className="flex flex-col gap-0.5 py-3 border-b border-zinc-100">
                  <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">{label}</span>
                  {editing
                    ? <div className="max-w-[180px]"><EditField k={k} label="" /></div>
                    : <span className="text-[16px] font-semibold text-ink whitespace-normal break-words break-keep mt-0.5">{dispVal(k)}</span>}
                </div>
              ))}
              {editing && (
                <div className="flex flex-col gap-0.5 py-3 border-b border-zinc-100">
                  <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">분류</span>
                  <div className="max-w-[180px]"><EditField k="category" label="" /></div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ─── SECTION 3 · 재고 · 2026-09-20 · 텍스트 라벨 ─── */}
        <section className="space-y-0">
          <h3 className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider pb-2 border-b border-zinc-100">
            재고
          </h3>
          <div className="grid grid-cols-2 gap-x-4">
            {/* 현재고 */}
            <div className="flex flex-col gap-0.5 py-3 border-b border-zinc-100">
              <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">현재고</span>
              {(p.current_stock != null && Number(p.current_stock) !== 0)
                ? <span className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[20px] font-extrabold text-emerald-700 tabular-nums leading-tight tracking-tight">
                      {String(p.current_stock)}<span className="text-[13px] font-semibold ml-0.5 text-emerald-600/70">개</span>
                    </span>
                    {p.optimal_stock != null && (() => {
                      const cur = Number(p.current_stock ?? 0);
                      const opt = Number(p.optimal_stock);
                      const short = opt - cur;
                      if (short <= 0) return <span className="text-[12px] font-semibold text-emerald-600">충분</span>;
                      return <span className="text-[12px] font-semibold text-rose-600 tabular-nums">-{short}</span>;
                    })()}
                  </span>
                : <span className="text-[15px] font-bold text-rose-500 mt-0.5">부족</span>}
            </div>
            {/* 적정재고 */}
            <div className="flex flex-col gap-0.5 py-3 border-b border-zinc-100">
              <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                적정재고 <span className="text-zinc-400 normal-case">({optimalStockDays}일)</span>
              </span>
              {editing
                ? <input type="number" min={0} value={val("optimal_stock")} onChange={e => set("optimal_stock", e.target.value)} className={inputCls + " tabular-nums text-[14px] max-w-[120px]"} />
                : p.optimal_stock != null
                  ? <span className="text-[18px] font-bold text-ink tabular-nums leading-tight tracking-tight mt-0.5">
                      {String(p.optimal_stock)}<span className="text-[12px] font-semibold ml-0.5 text-ink-soft">개</span>
                    </span>
                  : <span className="text-zinc-300 text-[15px] mt-0.5">-</span>}
            </div>
          </div>
        </section>

        {/* ─── SECTION 4 · 진열위치 · 2026-09-20 · 텍스트 라벨 · 색상 계층으로 창고/매장 구분 ─── */}
        <section className="space-y-0">
          <h3 className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider pb-2 border-b border-zinc-100">
            진열위치
          </h3>
          {editing ? (
            /* 편집 모드 · ShelfPositionInput 유지 */
            <div className="py-3 space-y-3">
              <div className="text-[12px] text-zinc-500">
                각 위치 <span className="font-bold text-brand-deep">3자리 (층·칸·순서)</span> 입력 · 예 332 · 매장 필수
              </div>
              <div className="flex flex-wrap gap-2">
                {storageLocations.filter(l => l.active).map(loc => {
                  const hasKey = Object.prototype.hasOwnProperty.call(shelfDraft, loc.code);
                  if (!hasKey) return null;
                  return (
                    <ShelfPositionInput
                      key={loc.code}
                      label={`${loc.name}${loc.kind === "warehouse" ? " (창고)" : ""}`}
                      required={loc.required_detail}
                      value={shelfDraft[loc.code] ?? null}
                      onChange={(v) => setShelf(loc.code, v)}
                      productCode={product.product_code}
                      displayLocation={String(p.location ?? p.display_location ?? "").trim() || null}
                      storageKey={loc.code}
                    />
                  );
                })}
              </div>
              {(() => {
                const missing = storageLocations.filter(l => l.active && !Object.prototype.hasOwnProperty.call(shelfDraft, l.code));
                if (missing.length === 0) return null;
                return (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-zinc-500">위치 추가:</span>
                    {missing.map(loc => (
                      <button
                        key={loc.code}
                        type="button"
                        onClick={() => addShelfLocation(loc.code)}
                        className="text-[12px] font-medium px-2.5 h-7 rounded-lg border border-dashed border-brand-tint text-brand-deep hover:bg-brand-tint/50 transition-colors cursor-pointer"
                      >+ {loc.name}</button>
                    ))}
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <EditField k="location" label="구역" />
                <EditField k="sale_status" label="판매 상태" />
              </div>
            </div>
          ) : (
            /* 표시 모드 · 텍스트 라벨 · 구역→창고→매장 순 */
            (() => {
              const displayPositions = mergeShelfPositionsWithFallback(
                product.shelf_positions ?? {},
                String(p.location ?? p.display_location ?? "").trim() || null,
                (product as any)?.category_code ?? null,
              );
              const allItems = formatShelfPositions(displayPositions, storageLocations);
              const warehouseItems = allItems.filter(item => item.kind === "warehouse");
              const storeItems = allItems.filter(item => item.kind === "store");
              const hasLocation = !!p.location;
              const hasAny = hasLocation || allItems.length > 0;

              if (!hasAny) {
                return <span className="py-3 block text-[14px] text-zinc-400">진열구역 없음</span>;
              }

              return (
                <div className="space-y-0">
                  {/* 구역 · 텍스트 라벨 */}
                  {hasLocation && (
                    <div className="flex flex-col gap-0.5 py-3 border-b border-zinc-100">
                      <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">구역</span>
                      <span className="text-[18px] font-extrabold text-ink tabular-nums tracking-tight leading-tight mt-0.5">
                        {String(p.location)}
                      </span>
                    </div>
                  )}
                  {/* 창고1/창고2 · 텍스트 라벨 + 값 */}
                  {warehouseItems.map(item => (
                    <div key={item.code} className="flex flex-col gap-0.5 py-3 border-b border-zinc-100">
                      <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">{item.name}</span>
                      {item.detail
                        ? <span className="text-[16px] font-bold text-cyan-700 tabular-nums leading-tight mt-0.5">
                            {formatShelfDetail(item.detail)}
                          </span>
                        : <span className="text-[12px] font-medium text-rose-500 mt-0.5">위치 미입력</span>
                      }
                    </div>
                  ))}
                  {/* 매장1/2/3 · 텍스트 라벨 + 값 */}
                  {storeItems.map(item => (
                    <div key={item.code} className="flex flex-col gap-0.5 py-3 border-b border-zinc-100">
                      <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">{item.name}</span>
                      {item.detail
                        ? <span className="text-[16px] font-bold text-indigo-700 tabular-nums leading-tight mt-0.5">
                            {formatShelfDetail(item.detail)}
                          </span>
                        : <span className="text-[12px] font-medium text-rose-500 mt-0.5">위치 미입력</span>
                      }
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </section>

      </div>

      {vendorModal.modalElement}
      {toast && <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>}
    </>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────
export const ProductInfoPage: React.FC<Props> = ({ authSession }) => {
  const { toast, showError, showSuccess } = useToast();
  const confirm = useConfirm();
  const canManage = canManageProducts(authSession);

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // 2026-09-10 · #64 · 사용자 지시 · 상품 편집 모달 · 인라인 편집 대신 · ProductCreateModal edit mode
  const [editProduct, setEditProduct] = useState<ProductDetail | null>(null);
  // 2026-08-23 · #197 · 스캔 페이지에서 넘어온 pending code · 자동 등록 모달 (권한자만)
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  useEffect(() => {
    const code = consumeScanPendingProductCode();
    if (code && canManage) {
      setPendingCode(code);
      setCreateOpen(true);
    }
  }, [canManage]);


  // 리스트 fetch · /api/products-map (전체) 를 배열화
  // 2026-09-18 · 사용자 지시 · 재고 컬럼 실제 값 표시 · /api/inventory-latest 병렬 호출
  //   · products.current_stock 은 매입검수 시에만 갱신 · 대부분 null · 실제 실재고 = inventory_checks (SSOT)
  //   · warehouse1+warehouse2+store1+store2+store3 합산 = 실재고
  useEffect(() => {
    let alive = true;
    setListLoading(true);
    setListError(null);
    // 2026-08-30 · 사용자 지시 · 관리 페이지 · 판매중지·숨김 상품도 모두 표시
    Promise.all([
      api.get<Record<string, Partial<ProductRow> & { product_name?: string }>>("/api/products-map?include_inactive=1&include_hidden=1"),
      api.get<Record<string, { warehouse1_stock: number | null; warehouse2_stock: number | null; store1_stock: number | null; store2_stock: number | null; store3_stock: number | null }>>("/api/inventory-latest").catch(() => ({ data: {} })),
    ])
      .then(([{ data }, { data: invMap }]) => {
        if (!alive) return;
        const inv = invMap ?? {};
        const arr: ProductRow[] = Object.entries(data ?? {}).map(([code, p]) => {
          // 2026-09-18 · 실재고 합산 · inventory_checks SSOT 우선 · fallback products.current_stock
          // 2026-09-18 · fix (3차) · invRow 존재만 체크 → 필드 중 하나라도 non-null 인 경우만 sum
          //   · 원인 · xlsx 임포트 시 · applyInitialShelfPositionsForCodes · null-only row 자동 삽입 (계층 1)
          //   · 결과 · invRow 있지만 5-슬롯 모두 null → sum=0 · fallback products.current_stock 무시 · 빨간 '0' 표시
          //   · fix · hasInvValue 검사 · null-only invRow · products.current_stock fallback 활성
          const invRow = inv[code];
          const hasInvValue = invRow && (
            invRow.warehouse1_stock != null ||
            invRow.warehouse2_stock != null ||
            invRow.store1_stock != null ||
            invRow.store2_stock != null ||
            invRow.store3_stock != null
          );
          let realStock: number | null = null;
          if (hasInvValue) {
            const sum =
              Number(invRow.warehouse1_stock ?? 0) +
              Number(invRow.warehouse2_stock ?? 0) +
              Number(invRow.store1_stock ?? 0) +
              Number(invRow.store2_stock ?? 0) +
              Number(invRow.store3_stock ?? 0);
            realStock = sum;
          } else if (p.current_stock != null) {
            realStock = Number(p.current_stock);
          }
          // 2026-09-18 · 사용자 재보고 · 판매가·현재고 안 나옴 · Number 강제 변환 fix
          //   · Supabase JS · NUMERIC 컬럼 · 문자열로 반환되는 케이스 대응
          //   · 렌더링 side · typeof === 'number' 검사 · 문자열이면 '-' 표시 되던 버그
          const rawSalePrice = (p as any).sale_price;
          const salePriceNum = rawSalePrice != null && rawSalePrice !== "" ? Number(rawSalePrice) : null;
          const rawOptimalStock = (p as any).optimal_stock;
          const optimalStockNum = rawOptimalStock != null && rawOptimalStock !== "" ? Number(rawOptimalStock) : null;
          return {
            product_code: code,
            product_name: p.product_name ?? "",
            supplier: p.supplier ?? null,
            category: p.category ?? null,
            unit: p.unit ?? null,
            current_stock: realStock,
            optimal_stock: optimalStockNum,
            location: p.location ?? null,
            // 2026-09-08 · barcode 제거 · product_code 자체가 바코드값
            spec: p.spec ?? null,
            sale_status: (p as any).sale_status ?? null,
            // 2026-09-18 · 사용자 지시 · 왼쪽 리스트 · 판매가 표시 · Number 강제 변환 fix
            sale_price: Number.isFinite(salePriceNum) ? salePriceNum : null,
          };
        });
        // devLog · 현재고 데이터 진단 (임시 · 데이터 안 나옴 원인 조사)
        const noStockCount = arr.filter(r => r.current_stock == null).length;
        const hasStockCount = arr.length - noStockCount;
        devLog("[ProductInfoPage] 현재고 진단", {
          total: arr.length,
          hasStock: hasStockCount,
          noStock: noStockCount,
          sampleNoStock: arr.filter(r => r.current_stock == null).slice(0, 3).map(r => ({ code: r.product_code, name: r.product_name, rawCurrentStock: r.current_stock })),
          sampleHasStock: arr.filter(r => r.current_stock != null).slice(0, 3).map(r => ({ code: r.product_code, name: r.product_name, stock: r.current_stock })),
        });
        arr.sort((a, b) => a.product_name.localeCompare(b.product_name, "ko"));
        setRows(arr);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const msg = e instanceof ApiError ? e.message : (e as Error)?.message ?? "상품 목록 조회 실패";
        setListError(msg);
        showError(`[상품정보] ${msg}`);
      })
      .finally(() => alive && setListLoading(false));
    return () => { alive = false; };
  }, [showError, reloadKey]);

  // 2026-09-07 · 사용자 지시 · 검수 완료 (product-mutated) 후 · 현재고·목록 자동 반영
  useEffect(() => {
    const onMutated = () => setReloadKey(k => k + 1);
    window.addEventListener("product-mutated", onMutated);
    window.addEventListener("products-map-updated", onMutated);
    return () => {
      window.removeEventListener("product-mutated", onMutated);
      window.removeEventListener("products-map-updated", onMutated);
    };
  }, []);

  // 2026-08-30 · 사용자 지시 · 판매중/판매중지 3-way 필터 (관리 페이지 · include_inactive=1 로 다 조회)
  // 2026-09-10 · 사용자 지시 · 판매중 기본값 강제 · storageKey bump v2 · localStorage 초기화
  const { value: saleFilter, setValue: setSaleFilter, matches: saleMatches } = useSaleStatusFilter({ storageKey: "productInfo.saleFilter.v2" });
  const filtered = useMemo(() => {
    const list = rows;
    // 1. 판매상태 필터
    const bySale = list.filter(r => saleMatches((r as any).sale_status));
    // 2. 검색 필터
    const s = search.trim();
    if (!s) return bySale;
    return bySale.filter(r => matchesProductQuery(r, s));
  }, [rows, search, saleMatches]);

  // 상세 fetch (선택 시 · reloadKey 변경 시에도 refetch · 편집 저장 후 stale 방지)
  useEffect(() => {
    if (!selectedCode) { setDetail(null); return; }
    let alive = true;
    setDetailLoading(true);
    setDetailError(null);
    getProductByCode<ProductDetail>(selectedCode)
      .then((data) => { if (alive) setDetail(data); })
      .catch((e: unknown) => {
        if (!alive) return;
        const msg = e instanceof ApiError ? e.message : (e as Error)?.message ?? "상품 상세 조회 실패";
        setDetailError(msg);
      })
      .finally(() => alive && setDetailLoading(false));
    return () => { alive = false; };
  }, [selectedCode, reloadKey]);

  const handleSelect = (code: string) => {
    setSelectedCode(code);
    setMobileOpen(true);
  };

  // 2026-09-18 · 상품명 컬럼 폭 드래그 조절 · localStorage 저장
  const NAME_COL_STORAGE_KEY = "productInfo.nameColWidth.v1";
  const NAME_COL_MIN = 80;
  const NAME_COL_MAX = 320;
  const [nameColWidth, setNameColWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem(NAME_COL_STORAGE_KEY)); return (v >= NAME_COL_MIN && v <= NAME_COL_MAX) ? v : 120; }
    catch { return 120; }
  });
  const startNameColResize = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = nameColWidth;
    const onMove = (mv: MouseEvent) => {
      const next = Math.min(NAME_COL_MAX, Math.max(NAME_COL_MIN, startW + (mv.clientX - startX)));
      setNameColWidth(next);
    };
    const onUp = (mu: MouseEvent) => {
      const final = Math.min(NAME_COL_MAX, Math.max(NAME_COL_MIN, startW + (mu.clientX - startX)));
      try { localStorage.setItem(NAME_COL_STORAGE_KEY, String(final)); } catch { /* noop */ }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [nameColWidth]);

  // 2026-09-18 · 사용자 지시 · 왼쪽 리스트 · 카드형식 → 표 형식 · 자동 정렬 헤더
  //   · 컬럼 · 상품명(코드 아래) · 공급사 · 판매가 · 재고 · 위치
  //   · useSortableTable · 헤더 클릭 asc/desc 토글
  //   · 기본 · 상품명 asc
  type ProductListSortKey = "product_name" | "supplier" | "sale_price" | "current_stock" | "location";
  const listComparators = useMemo<Record<ProductListSortKey, Comparator<ProductRow>>>(() => ({
    product_name: (a, b) => String(a.product_name ?? "").localeCompare(String(b.product_name ?? ""), "ko"),
    // 2026-09-18 · 사용자 지시 · (주)·주식회사 무시 · 정제 후 정렬
    supplier:     (a, b) => displayVendorName(a.supplier).localeCompare(displayVendorName(b.supplier), "ko"),
    sale_price:   (a, b) => (Number((a as any).sale_price ?? 0)) - (Number((b as any).sale_price ?? 0)),
    current_stock: (a, b) => (Number(a.current_stock ?? 0)) - (Number(b.current_stock ?? 0)),
    location:     (a, b) => String(a.location ?? "").localeCompare(String(b.location ?? ""), "ko"),
  }), []);
  const { sorted: sortedList, sortKey: listSortKey, sortDir: listSortDir, toggleSort: toggleListSort } =
    useSortableTable<ProductRow, ProductListSortKey>(filtered, "product_name", listComparators, "asc");


  const listBody = (
    <div className="h-[calc(100vh-240px)] overflow-y-auto overscroll-contain">
      {/* ── 모바일 카드뷰 (md 미만) ── */}
      <div className="md:hidden flex flex-col divide-y divide-zinc-100">
        {sortedList.map(r => {
          const active = r.product_code === selectedCode;
          const salePrice = (r as any).sale_price;
          const stock = r.current_stock;
          return (
            <button
              key={r.product_code}
              type="button"
              onClick={() => handleSelect(r.product_code)}
              className={[
                "w-full text-left px-4 py-3 transition-colors min-h-[44px] flex flex-col gap-1.5",
                active
                  ? "bg-brand-tint/60 border-l-2 border-brand-deep"
                  : "hover:bg-zinc-50/70",
              ].join(" ")}
            >
              {/* Row 1: 상품명 */}
              <span className={`text-[16px] font-semibold leading-snug whitespace-normal break-words break-keep ${active ? "text-brand-deep" : "text-ink"}`}>
                {r.product_name || <span className="text-zinc-400 font-normal">(이름없음)</span>}
              </span>
              {/* Row 2: 공급사 + 위치 */}
              <div className="flex items-center gap-2 flex-wrap">
                {r.supplier && (
                  <span className="text-[13px] font-medium text-zinc-500">{r.supplier}</span>
                )}
                {r.location && (
                  <span className="text-[13px] font-medium text-zinc-400">{r.location}</span>
                )}
              </div>
              {/* Row 3: 판매가 + 현재고 */}
              <div className="flex items-center gap-3">
                {typeof salePrice === "number" && salePrice > 0 && (
                  <span className="text-[14px] font-semibold tabular-nums text-brand-deep">
                    {salePrice.toLocaleString()}원
                  </span>
                )}
                <span className={`text-[14px] font-semibold tabular-nums ${
                  typeof stock === "number" && stock <= 0 ? "text-rose-600" : "text-zinc-600"
                }`}>
                  재고 {typeof stock === "number" ? stock : "-"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── PC 표뷰 (md 이상) ── */}
      <table className="hidden md:table w-full text-[15px] border-collapse table-fixed">
        <thead className="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur-sm border-b-2 border-line">
          <tr className="text-[16px] font-bold tracking-tight uppercase text-zinc-500">
            <th className="text-left px-3 py-2 relative group overflow-hidden" style={{ width: nameColWidth, minWidth: 80, maxWidth: 320 }}>
              <SortHeader label="상품명" columnKey="product_name" activeKey={listSortKey} activeDir={listSortDir} onToggle={toggleListSort} arrowStyle="arrow" activeColor="brand" />
              {/* 드래그 핸들 · 우측 경계선 */}
              <div
                onMouseDown={startNameColResize}
                className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none hover:bg-brand-tint/60 transition-colors"
                title="드래그하여 폭 조절"
              />
            </th>
            <th className="text-left px-2 py-2 w-[110px]"><SortHeader label="공급사" columnKey="supplier" activeKey={listSortKey} activeDir={listSortDir} onToggle={toggleListSort} arrowStyle="arrow" activeColor="brand" /></th>
            <th className="text-right px-2 py-2 w-[80px]"><SortHeader label="판매가" columnKey="sale_price" activeKey={listSortKey} activeDir={listSortDir} onToggle={toggleListSort} arrowStyle="arrow" activeColor="brand" align="right" /></th>
            <th className="text-right px-2 py-2 w-[60px]"><SortHeader label="현재고" columnKey="current_stock" activeKey={listSortKey} activeDir={listSortDir} onToggle={toggleListSort} arrowStyle="arrow" activeColor="brand" align="right" /></th>
            <th className="text-left px-2 py-2 w-[100px]"><SortHeader label="위치" columnKey="location" activeKey={listSortKey} activeDir={listSortDir} onToggle={toggleListSort} arrowStyle="arrow" activeColor="brand" /></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {sortedList.map(r => {
            const active = r.product_code === selectedCode;
            const salePrice = (r as any).sale_price;
            const stock = r.current_stock;
            return (
              <tr
                key={r.product_code}
                onClick={() => handleSelect(r.product_code)}
                className={`cursor-pointer transition-colors ${active ? "bg-brand-tint/60" : "hover:bg-zinc-50/70"}`}
              >
                <td className="px-3 py-2.5 align-top overflow-hidden" style={{ width: nameColWidth, minWidth: 80, maxWidth: 320 }}>
                  <div className={`text-[15px] font-semibold leading-tight whitespace-normal break-words break-keep ${active ? "text-brand-deep" : "text-ink"}`}>
                    {r.product_name || <span className="text-zinc-400 font-normal">(이름없음)</span>}
                  </div>
                </td>
                <td className="px-2 py-2.5 align-top text-ink text-[15px] font-medium">
                  {r.supplier || <span className="text-zinc-300">-</span>}
                </td>
                <td className="px-2 py-2.5 align-top text-right text-[15px] font-medium tabular-nums text-ink">
                  {typeof salePrice === "number" && salePrice > 0
                    ? salePrice.toLocaleString()
                    : <span className="text-zinc-300">-</span>}
                </td>
                <td className="px-2 py-2.5 align-top text-right text-[15px] font-medium tabular-nums">
                  {typeof stock === "number"
                    ? <span className={stock <= 0 ? "text-rose-600" : "text-ink"}>{stock}</span>
                    : <span className="text-zinc-300">-</span>}
                </td>
                <td className="px-2 py-2.5 align-top text-[15px] font-medium text-ink-soft whitespace-normal break-words break-keep">
                  {r.location || <span className="text-zinc-300">-</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-[#F4F7FA] min-h-0">
      {/* ── 상단 FilterBar ── */}
      <div className={`${PAGE_CONTAINER_CLS} px-3 sm:px-4 lg:px-6 py-3 shrink-0`}>
        <div className={`${CARD_BASE} px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2`}>
          <div className="flex items-center gap-2.5 shrink-0">
            <AccentBar />
            <Package size={16} className="text-brand-deep shrink-0" />
            <span className="text-[17px] font-bold text-ink">상품정보</span>
          </div>
          <StatusPill tone="sky" size="sm">{filtered.length}건</StatusPill>
          {/* 검색창 */}
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="상품명·코드·공급사 검색"
            historyKey="megatown_productInfo_search"
            accent="sky"
            widthClass="flex-1 min-w-[160px] max-w-[260px]"
          />
          {/* 판매상태 필터 */}
          <SaleStatusFilter value={saleFilter} onChange={setSaleFilter} size="sm" />
          {canManage && (
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)} className="ml-auto">
              + 상품 등록
            </Button>
          )}
          {canManage && selectedCode && (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const target = filtered.find(p => p.product_code === selectedCode);
                if (!target) return;
                // 2026-09-15 · DB 정합성 대원칙 · 참조 pre-check · 회계 이력 있으면 삭제 차단
                //   · GET /api/products/:code/references · 서버 counts · UI 안내
                let refInfo: {
                  totalCritical: number;
                  totalOther: number;
                  canDelete: boolean;
                  hint: string;
                  counts: Record<string, { label: string; count: number; critical: boolean }>;
                } | null = null;
                try {
                  const { data } = await api.get<any>(`/api/products/${encodeURIComponent(selectedCode)}/references`);
                  refInfo = data;
                } catch (e: any) {
                  devWarn("[ProductInfoPage] references pre-check 실패", e?.message);
                }
                // 회계 이력 있으면 · 삭제 차단 · Soft delete 안내
                if (refInfo && !refInfo.canDelete) {
                  const details = Object.values(refInfo.counts)
                    .filter(c => c.critical && c.count > 0)
                    .map(c => `${c.label} ${c.count}건`)
                    .join(" · ");
                  showError(`[${target.product_name}]\n삭제 불가 · ${details}\n이력 보존 필요 · [판매중지] or [숨김] 처리를 사용해주세요`);
                  return;
                }
                // 비-critical 참조 (실재고·발주 등) · 정리 후 삭제 안내
                const cleanupNote = refInfo && refInfo.totalOther > 0
                  ? `\n\n※ 함께 정리됨:\n${Object.values(refInfo.counts).filter(c => !c.critical && c.count > 0).map(c => `- ${c.label} ${c.count}건`).join("\n")}`
                  : "";
                const ok = await confirm({
                  title: "상품 삭제",
                  message: `[${target.product_name}]\n\n이 상품과 참조 데이터를 삭제합니다.${cleanupNote}\n\n계속하시겠어요?`,
                  confirmLabel: "삭제",
                  cancelLabel: "취소",
                });
                if (!ok) return;
                try {
                  await api.del(`/api/products/${encodeURIComponent(selectedCode)}`);
                  showSuccess("상품 삭제됨");
                  setSelectedCode(null);
                  setReloadKey(k => k + 1);
                } catch (e: any) {
                  console.error("[ProductInfoPage] delete error", e);
                  showError(e?.response?.data?.error?.message ?? e?.message ?? "삭제 실패");
                }
              }}
              className="!border-rose-200 !text-rose-600 hover:!bg-rose-50 hover:!border-rose-400"
            >
              삭제
            </Button>
          )}
        </div>
      </div>

      {/* ── 좌우 분할 패널 · SplitPanel 프레임워크 ── */}
      <div className={`flex-1 min-h-0 ${PAGE_CONTAINER_CLS} px-3 sm:px-4 lg:px-6 pb-3 flex flex-col`}>
        <SplitPanel
          storageKey="productInfo.leftWidth.v2"
          defaultWidth={420}
          minWidth={280}
          maxWidth={720}
          wrapLeft={false}
          wrapRight={false}
          className="flex-1 min-h-0"
          mobileRightAsModal={true}
          mobileModalTitle={detail?.product_name ?? "상품 상세"}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          left={
            <SplitListPanel
              topAccent
              title="상품정보"
              count={filtered.length}
              loading={listLoading}
              empty={!listLoading && filtered.length === 0}
              emptyText={search ? "검색 결과 없음" : "상품이 없습니다"}
              emptyIcon={Package as any}
              error={listError}
            >
              {listBody}
            </SplitListPanel>
          }
          right={
            <div className="flex-1 min-h-0 overflow-y-auto bg-zinc-50/30">
              <ProductDetailView
                product={detail}
                loading={detailLoading}
                error={detailError}
                canEdit={canManage}
                onSaved={() => setReloadKey((k) => k + 1)}
                onEditClick={(prod) => setEditProduct(prod)}
              />
            </div>
          }
        />
      </div>

      {/* Phase C · 상품 등록 모달 · 2026-08-23 · #197 · pending code 있으면 자동 채움+lock */}
      <ProductCreateModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); setPendingCode(null); }}
        initialCode={pendingCode ?? ""}
        initialBarcode={pendingCode ?? ""}
        lockCode={!!pendingCode}
        onCreated={(code) => {
          setSelectedCode(code);
          setPendingCode(null);
          setReloadKey((k) => k + 1);
        }}
      />

      {/* 2026-09-10 · #64 · 사용자 지시 · 상품 편집 모달 · ProductCreateModal edit mode */}
      <ProductCreateModal
        open={!!editProduct}
        onClose={() => setEditProduct(null)}
        mode="edit"
        initialProduct={editProduct ? {
          product_code: editProduct.product_code,
          product_name: editProduct.product_name,
          supplier: (editProduct as any).supplier ?? null,
          category: (editProduct as any).category ?? null,
          unit: (editProduct as any).unit ?? null,
          spec: (editProduct as any).spec ?? null,
          location: (editProduct as any).location ?? null,
          optimal_stock: (editProduct as any).optimal_stock ?? null,
          sale_price: (editProduct as any).sale_price ?? null,
          purchase_price: (editProduct as any).purchase_price ?? null,
          brand: (editProduct as any).brand ?? null,
          manufacturer: (editProduct as any).manufacturer ?? null,
          // 2026-09-18 · 사용자 지시 · 편집 모달 · 판매 상태 편집 지원
          sale_status: (editProduct as any).sale_status ?? null,
        } : undefined}
        lockCode={true}
        onCreated={() => {
          setEditProduct(null);
          setReloadKey((k) => k + 1);
        }}
      />

      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
    </div>
  );
};

export default ProductInfoPage;
