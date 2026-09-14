// src/components/ProductInfoPage/ProductInfoPage.tsx
// 2026-08-23 · #177 · Phase A/B · 상품정보 페이지 (매장>매입 서브탭)
//   · 좌측 SplitListPanel · 우측 상세 (PC lg+) / 모바일 모달
//   · Phase A: 탭 진입 · 좌측 리스트 · SplitListPanel 활용
//   · Phase B: 상세 조회 (product_code · supplier · category · optimal_stock 등)
//   · Phase C/D: 등록/편집 · 후속 커밋
//
// 프레임워크 원칙 · SplitListPanel · Card · Modal · SplitPanel(resize) · apiClient · useToast

import React, { useEffect, useMemo, useState } from "react";
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
// 2026-09-14 · inventoryChecksApi 프리미티브
import { saveInventoryCheck } from "../../lib/inventoryChecksApi";
// 2026-09-14 · 통계설정 · 적정재고 계산 일수 · 실시간 반영
import { useOptimalStockPeriod } from "../../hooks/useOptimalStockPeriod";
import { PAGE_CONTAINER_CLS, CARD_BASE } from "../../styles/tokens";
import { AccentBar } from "../common/AccentBar";
import { matchesProductQuery } from "../../lib/productMatch";
import type { AuthSession } from "../../types";
import { UpdateProductSchema, type UpdateProductInput } from "../../shared/schemas/products";
import { consumeScanPendingProductCode } from "../../hooks/useScanUnregisteredMode";
import { useVendorInfoModal } from "../common/features/VendorInfoModal";
// 2026-09-08 · 상세 진열위치 · 위치별 3-stepper 입력 + 표시
import { ShelfPositionInput } from "../common/ShelfPositionInput";
import { ShelfPositionsBadge } from "../common/ShelfPositionsBadge";
import { useStorageLocations } from "../../hooks/useStorageLocations";
import type { ShelfPositions } from "../../lib/shelfPositions";

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
  if (error) return <div className="p-4"><Card variant="flat" padding="md" rounded="lg" bg="bg-rose-50" borderColor="border-rose-200" className="text-[16px] text-rose-700 font-medium">{error}</Card></div>;
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
    setShelfDraft({ ...(product?.shelf_positions ?? {}) });
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

  // 2026-09-14 · 최신 트렌드 · uppercase 제거 · 라벨 축소 · 시인성 우선
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

  return (
    <>
      {/* ─── Header · 2026-09-14 최신 트렌드 · Linear/Vercel/Notion · 시인성 최우선 ─────────────────── */}
      <div className="relative flex items-start justify-between px-5 py-4 border-b border-line bg-white shrink-0 gap-3 sticky top-0 z-10">
        <GradientAccent size="thin" />
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-brand-tint flex items-center justify-center shrink-0 mt-0.5">
            <Package size={18} weight="fill" className="text-brand-deep" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[19px] font-bold text-ink leading-snug break-words tracking-tight">
              {product.product_name || <span className="text-zinc-400">(이름없음)</span>}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="text-[12px] font-mono text-zinc-500 bg-zinc-100 rounded-md px-1.5 py-0.5 tabular-nums">{product.product_code}</span>
              {product.supplier && (
                <button type="button" onClick={() => vendorModal.openVendorInfo(product.supplier!)}
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-deep hover:underline cursor-pointer">
                  {product.supplier}<ArrowSquareOut size={11} />
                </button>
              )}
              {(() => {
                const s = String(p.sale_status ?? "");
                if (!s) return null;
                const tone = s === "판매중" ? "emerald" : s === "판매중지" ? "rose" : "zinc";
                return <StatusPill tone={tone} size="sm">{s}</StatusPill>;
              })()}
              {p.location && (
                <span className="text-[12px] font-semibold text-zinc-600 bg-zinc-100 rounded-md px-1.5 py-0.5">{String(p.location)}</span>
              )}
              {/* 2026-09-08 · 상세 진열위치 뱃지 · 진열위치 옆에 무조건 표시 */}
              <ShelfPositionsBadge positions={product.shelf_positions} size="sm" />
            </div>
          </div>
        </div>
        {editing ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <StatusPill tone="amber" size="xs">편집 중</StatusPill>
            <Button variant="primary" size="sm" icon={<FloppyDisk size={13} weight="bold" />} onClick={save} loading={saving}>
              저장
            </Button>
            <Button variant="secondary" size="sm" icon={<X size={13} />} onClick={cancelEdit} disabled={saving} />
          </div>
        ) : canEdit ? (
          <Button
            variant="secondary"
            size="sm"
            icon={<PencilSimple size={13} weight="bold" />}
            onClick={() => {
              // 2026-09-10 · #64 · 사용자 지시 · 인라인 편집 대신 · 모달 편집 (onEditClick prop 있으면 우선)
              if (onEditClick && product) { onEditClick(product); return; }
              startEdit();
            }}
            title="상품정보 수정"
          >
            수정
          </Button>
        ) : null}
      </div>

      {/* ─── 본문 ─── */}
      <div className="p-4 sm:p-5 space-y-6">

        {/* 가격 · 재고 — 2026-09-14 최신 트렌드 · Linear/Vercel · 시인성 최우선 · uppercase 제거 · 라벨 축소 */}
        <div className="space-y-2.5">
          <SectionTitle title="가격 · 재고" color="emerald" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* 판매가 · PRIMARY · brand 강조 */}
            <div className="bg-brand-tint/40 border border-brand-tint rounded-lg p-2.5 flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-brand-deep">판매가</span>
              {editing
                ? <input type="number" min={0} value={val("sale_price")} onChange={e => set("sale_price", e.target.value)} className={inputCls + " tabular-nums"} />
                : p.sale_price != null
                  ? <span className="text-[20px] font-bold text-brand-deep tabular-nums leading-tight tracking-tight">{Number(p.sale_price).toLocaleString()}<span className="text-[13px] font-semibold ml-0.5">원</span></span>
                  : <span className="text-zinc-300 text-[15px]">-</span>}
            </div>
            {/* 매입가 */}
            <Card variant="flat" padding="none" rounded="lg" className="p-2.5 flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-ink-soft">매입가</span>
              {editing
                ? <input type="number" min={0} value={val("purchase_price")} onChange={e => set("purchase_price", e.target.value)} className={inputCls + " tabular-nums"} />
                : p.purchase_price != null
                  ? <span className="text-[18px] font-bold text-amber-700 tabular-nums leading-tight tracking-tight">{Number(p.purchase_price).toLocaleString()}<span className="text-[13px] font-semibold ml-0.5">원</span></span>
                  : <span className="text-zinc-300 text-[15px]">-</span>}
            </Card>
            {/* 이익율 · semantic color · 강조 */}
            <Card variant="flat" padding="none" rounded="lg" borderColor={profitRate != null && profitRate >= 30 ? "border-emerald-200" : profitRate != null && profitRate >= 15 ? "border-amber-200" : profitRate != null ? "border-rose-200" : "border-line"} className="p-2.5 flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-ink-soft">이익율</span>
              {profitRate != null
                ? <span className={`text-[20px] font-bold tabular-nums leading-tight tracking-tight ${profitRate >= 30 ? "text-emerald-600" : profitRate >= 15 ? "text-amber-600" : "text-rose-600"}`}>{profitRate}<span className="text-[13px] font-semibold ml-0.5">%</span></span>
                : <span className="text-zinc-300 text-[15px]">-</span>}
            </Card>
            {/* 현재고 · PRIMARY · sky tone */}
            <div className="bg-sky-50/60 border border-sky-200 rounded-lg p-2.5 flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-sky-700">현재고</span>
              {p.current_stock != null
                ? <span className="text-[20px] font-bold text-sky-700 tabular-nums leading-tight tracking-tight">{String(p.current_stock)}<span className="text-[13px] font-semibold ml-0.5">개</span></span>
                : <span className="text-zinc-300 text-[15px]">-</span>}
            </div>
            {/* 적정재고 */}
            <Card variant="flat" padding="none" rounded="lg" className="p-2.5 flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-ink-soft">적정재고 <span className="text-zinc-400 font-medium">· {optimalStockDays}일</span></span>
              {editing
                ? <input type="number" min={0} value={val("optimal_stock")} onChange={e => set("optimal_stock", e.target.value)} className={inputCls + " tabular-nums"} />
                : p.optimal_stock != null
                  ? <span className="text-[17px] font-semibold text-ink tabular-nums leading-tight tracking-tight">{String(p.optimal_stock)}<span className="text-[13px] font-medium text-ink-soft ml-0.5">개</span></span>
                  : <span className="text-zinc-300 text-[15px]">-</span>}
            </Card>
            {/* 창고재고 (창고1+창고2 분리 표시) · cyan 톤 · 창고 구분 */}
            {(() => {
              const w1 = product.warehouse1_stock ?? product.warehouse_stock ?? null;
              const w2 = product.warehouse2_stock ?? null;
              if (w1 == null && w2 == null) {
                return (
                  <Card variant="flat" padding="none" rounded="lg" className="p-2.5 flex flex-col gap-1">
                    <span className="text-[12px] font-semibold text-ink-soft">창고재고</span>
                    <span className="text-zinc-400 text-[13px]">미조사</span>
                  </Card>
                );
              }
              return (
                <>
                  {w1 != null && (
                    <div className="bg-cyan-50/50 border border-cyan-100 rounded-lg p-2.5 flex flex-col gap-1">
                      <span className="text-[12px] font-semibold text-cyan-700">창고1</span>
                      <span className="text-[17px] font-semibold text-ink tabular-nums leading-tight tracking-tight">{String(w1)}<span className="text-[13px] font-medium text-ink-soft ml-0.5">개</span></span>
                    </div>
                  )}
                  {w2 != null && (
                    <div className="bg-cyan-50/50 border border-cyan-100 rounded-lg p-2.5 flex flex-col gap-1">
                      <span className="text-[12px] font-semibold text-cyan-700">창고2</span>
                      <span className="text-[17px] font-semibold text-ink tabular-nums leading-tight tracking-tight">{String(w2)}<span className="text-[13px] font-medium text-ink-soft ml-0.5">개</span></span>
                    </div>
                  )}
                </>
              );
            })()}
            {/* 매장재고 · indigo 톤 · 매장 구분 */}
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-2.5 flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-indigo-700">매장재고</span>
              {product.store_stock != null
                ? <span className="text-[17px] font-semibold text-ink tabular-nums leading-tight tracking-tight">{String(product.store_stock)}<span className="text-[13px] font-medium text-ink-soft ml-0.5">개</span></span>
                : <span className="text-zinc-400 text-[13px]">미조사</span>}
            </div>
            {/* 최근매입일 */}
            <Card variant="flat" padding="none" rounded="lg" className="p-2.5 flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-ink-soft">최근매입일</span>
              {p.last_purchase_date
                ? <span className="text-[14px] font-semibold text-ink tabular-nums leading-tight">{String(p.last_purchase_date).slice(0, 10)}</span>
                : <span className="text-zinc-300 text-[15px]">-</span>}
            </Card>
          </div>
        </div>

        {/* 기본 정보 · 2026-09-14 · 라벨 축소 · 값 강조 */}
        <div className="space-y-2.5">
          <SectionTitle title="기본 정보" color="sky" />
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            <div className="col-span-2">
              {editing ? <EditField k="product_name" label="상품명" /> : (
                <DField label="상품명"><span className="text-[17px] font-bold text-ink tracking-tight">{product.product_name || <span className="text-zinc-300 font-normal">-</span>}</span></DField>
              )}
            </div>
            {editing ? <EditField k="supplier" label="공급사" /> : (
              <DField label="공급사">
                {product.supplier
                  ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-[15px] font-semibold text-ink">{product.supplier}</span>
                      {/* 2026-09-10 · 사용자 지시 · 화살표 → [상세보기] 버튼 · 2026-09-14 축소 */}
                      <button
                        type="button"
                        onClick={() => vendorModal.openVendorInfo(product.supplier!)}
                        className="inline-flex items-center h-5 px-1.5 rounded-md text-[11px] font-semibold text-brand-deep hover:bg-brand-tint transition cursor-pointer"
                      >
                        상세
                      </button>
                    </span>
                  )
                  : <span className="text-zinc-300 font-normal">-</span>}
              </DField>
            )}
            {editing ? <EditField k="category" label="카테고리" /> : <DField label="카테고리"><span className="text-[15px] font-semibold text-ink">{dispVal("category")}</span></DField>}
            {editing && <EditField k="sale_status" label="판매상태" />}
            {editing && <EditField k="location" label="진열위치" />}
          </div>
        </div>

        {/* 2026-09-08 · 상세 진열위치 · 위치별 3-stepper · 매장 필수 강조 · 2026-09-14 폴리시 */}
        <div className="space-y-2.5">
          <SectionTitle title="상세 진열위치" color="rose" />
          {editing ? (
            <div className="space-y-2.5">
              <div className="text-[12px] text-ink-soft leading-relaxed">
                각 위치에 <span className="font-bold text-brand-deep">3자리 (층·칸·순서)</span> 입력.
                예 <span className="font-mono text-ink">332</span> = 3층 3칸 2번. 매장 필수.
              </div>
              <div className="flex flex-wrap gap-2.5">
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
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[11px] text-ink-soft">위치 추가:</span>
                    {missing.map(loc => (
                      <button
                        key={loc.code}
                        type="button"
                        onClick={() => addShelfLocation(loc.code)}
                        className="text-[11px] font-semibold px-2 h-6 rounded-md border border-brand-tint text-brand-deep hover:bg-brand-tint transition-colors cursor-pointer"
                      >+ {loc.name}</button>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div>
              {(product.shelf_positions && Object.keys(product.shelf_positions).length > 0) ? (
                <ShelfPositionsBadge positions={product.shelf_positions} size="md" />
              ) : (
                <span className="text-[13px] text-zinc-400">등록된 진열위치 없음</span>
              )}
            </div>
          )}
        </div>

        {/* 기타 (단위 · 규격 · 브랜드 · 제조사) · 2026-09-14 폴리시 */}
        <div className="space-y-2.5">
          <SectionTitle title="기타" color="amber" />
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            {editing ? <EditField k="unit" label="단위" /> : <DField label="단위">{dispVal("unit")}</DField>}
            {editing ? <EditField k="spec" label="규격" /> : <DField label="규격">{dispVal("spec")}</DField>}
            {editing ? <EditField k="brand" label="브랜드" /> : <DField label="브랜드">{dispVal("brand")}</DField>}
            {editing ? <EditField k="manufacturer" label="제조사" /> : <DField label="제조사">{dispVal("manufacturer")}</DField>}
          </div>
        </div>
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
  useEffect(() => {
    let alive = true;
    setListLoading(true);
    setListError(null);
    // 2026-08-30 · 사용자 지시 · 관리 페이지 · 판매중지·숨김 상품도 모두 표시
    api.get<Record<string, Partial<ProductRow> & { product_name?: string }>>("/api/products-map?include_inactive=1&include_hidden=1")
      .then(({ data }) => {
        if (!alive) return;
        const arr: ProductRow[] = Object.entries(data ?? {}).map(([code, p]) => ({
          product_code: code,
          product_name: p.product_name ?? "",
          supplier: p.supplier ?? null,
          category: p.category ?? null,
          unit: p.unit ?? null,
          current_stock: p.current_stock ?? null,
          optimal_stock: p.optimal_stock ?? null,
          location: p.location ?? null,
          // 2026-09-08 · barcode 제거 · product_code 자체가 바코드값
          spec: p.spec ?? null,
          sale_status: (p as any).sale_status ?? null,
        }));
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
    api.get<ProductDetail>(`/api/products/${encodeURIComponent(selectedCode)}`)
      .then(({ data }) => { if (alive) setDetail(data); })
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

  // 2026-09-09 · 사용자 지시 · 왼쪽 상품 리스트 · 세로 스크롤 · UI 프레임워크 적용
  //   · SplitListPanel body(flex-1 min-h-0 overflow-y-auto) 안에 렌더 · 자체 height 제약 강제
  //   · calc · 헤더·검색·필터·페이지 컨테이너 padding 감안 · 240px 오프셋 (실측)
  //   · height 고정 (min-h + max-h) · 로딩·empty·filtered 전환 시 · 크기 변화 없음 · 페이지 스크롤 방지
  const listBody = (
    <ul className="divide-y divide-zinc-100 h-[calc(100vh-240px)] overflow-y-auto overscroll-contain">
      {filtered.map(r => {
        const active = r.product_code === selectedCode;
        return (
          <li key={r.product_code}>
            <button
              type="button"
              onClick={() => handleSelect(r.product_code)}
              className={`w-full text-left px-3.5 py-2.5 flex items-center gap-2 cursor-pointer transition-colors ${
                active ? "bg-brand-tint/60" : "hover:bg-zinc-50"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className={`text-[16px] font-bold truncate ${active ? "text-brand-deep" : "text-ink"}`}>
                  {r.product_name || <span className="text-zinc-400">(이름없음)</span>}
                </div>
                <div className="text-[17px] text-zinc-500 truncate tabular-nums">
                  {r.product_code}
                  {r.supplier && <span className="ml-1.5">· {r.supplier}</span>}
                </div>
              </div>
              {typeof r.optimal_stock === "number" && (
                <StatusPill tone="zinc" size="xs">적정 {r.optimal_stock}</StatusPill>
              )}
            </button>
          </li>
        );
      })}
    </ul>
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
                const ok = await confirm({
                  title: "상품 삭제",
                  message: `[${target.product_name}]\n\n이 상품을 완전히 삭제합니다.\n관련 매입내역·실재고는 유지되지만 상품 마스터에서 사라집니다.\n계속하시겠어요?`,
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
