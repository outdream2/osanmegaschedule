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
  Package, PencilSimple, FloppyDisk, X,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import { SplitListPanel } from "../common/SplitListPanel";
import { SaleStatusFilter } from "../common/SaleStatusFilter";
import { useSaleStatusFilter } from "../../hooks/useSaleStatusFilter";
import { Modal } from "../common/Modal";
import { Card } from "../common/Card";
import { ProductCreateModal } from "./ProductCreateModal";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import { useToast, toastClass } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { api, ApiError } from "../../lib/apiClient";
import { PAGE_CONTAINER_CLS } from "../../styles/tokens";
import { matchesProductQuery } from "../../lib/productMatch";
import type { AuthSession } from "../../types";
import { UpdateProductSchema, type UpdateProductInput } from "../../shared/schemas/products";
import { consumeScanPendingProductCode } from "../../hooks/useScanUnregisteredMode";
import { useVendorInfoModal } from "../common/features/VendorInfoModal";

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
  barcode?: string | null;
  spec?: string | null;
  sale_status?: string | null; // 2026-08-26 · 사용자 지시 · 판매중 필터용
}

interface ProductDetail extends ProductRow {
  warehouse_stock?: number | null;
  store_stock?: number | null;
  inv_checked_at?: string | null;
  last_purchase_date?: string | null;
  sale_price?: number | null;
  purchase_price?: number | null;
  // 2026-08-25 · products 테이블에 없는 컬럼 · cost_price · note 제거
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
type EditableKey =
  | "product_name" | "supplier" | "category" | "unit" | "spec" | "barcode"
  | "location" | "optimal_stock" | "sale_price" | "purchase_price"
  | "brand" | "manufacturer" | "sale_status";

const NUMBER_KEYS = new Set<EditableKey>(["optimal_stock", "sale_price", "purchase_price"]);
const SALE_STATUS_OPTIONS = ["판매중", "판매중지", "숨김"];

const inputCls =
  "w-full h-8 px-2.5 rounded-md border border-line bg-white text-[15px] font-medium text-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition-colors";

interface DetailProps {
  product: ProductDetail | null;
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  onSaved: () => void;
}

const ProductDetailView: React.FC<DetailProps> = ({ product, loading, error, canEdit, onSaved }) => {
  const { toast, showSuccess, showError } = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<EditableKey, string>>({} as Record<EditableKey, string>);
  const [saving, setSaving] = useState(false);
  const vendorModal = useVendorInfoModal();

  useEffect(() => {
    setEditing(false);
    setDraft({} as Record<EditableKey, string>);
  }, [product?.product_code]);

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

  const startEdit = () => { setEditing(true); setDraft({} as Record<EditableKey, string>); };
  const cancelEdit = async () => {
    if (Object.keys(draft).length > 0) {
      const ok = await confirm({ title: "변경 취소", message: "저장하지 않은 변경사항을 취소하시겠습니까?", danger: true });
      if (!ok) return;
    }
    setEditing(false);
    setDraft({} as Record<EditableKey, string>);
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
    if (Object.keys(changes).length === 0) { showError("변경사항이 없습니다"); return; }
    const parsed = UpdateProductSchema.safeParse(changes);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      showError(`${first?.path.join(".") ?? "input"}: ${first?.message ?? "유효성 오류"}`);
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/api/products/${encodeURIComponent(product.product_code)}`, parsed.data);
      showSuccess("상품 정보 저장 완료");
      setEditing(false);
      setDraft({} as Record<EditableKey, string>);
      onSaved();
    } catch (e: unknown) {
      showError(`[상품 편집] ${e instanceof ApiError ? e.message : (e as Error)?.message ?? "저장 실패"}`);
    } finally { setSaving(false); }
  };

  // ─── field helpers ─────────────────────────────────────────────────────
  const dispVal = (key: string) => {
    const v = p[key];
    return v == null || v === "" ? <span className="text-zinc-300">-</span> : <span className="text-ink font-semibold">{String(v)}</span>;
  };
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-[13px] font-semibold text-zinc-400 uppercase tracking-wider">{label}</span>
      <div className="text-[15px]">{children}</div>
    </div>
  );
  const EditField = ({ k, label, type = "text" }: { k: EditableKey; label: string; type?: "text" | "number" }) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-[13px] font-semibold text-zinc-400 uppercase tracking-wider">{label}</span>
      {k === "sale_status" ? (
        <select value={val(k)} onChange={(e) => set(k, e.target.value)} className={inputCls}>
          {SALE_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={type}
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
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-2 border-b border-zinc-100">
        <span className="text-[13px] font-mono text-zinc-400 bg-zinc-100 rounded px-1.5 py-0.5">#{product.product_code}</span>
        <div className="flex-1" />
        {editing ? (
          <>
            <StatusPill tone="amber" size="xs">편집 중</StatusPill>
            <button type="button" onClick={save} disabled={saving}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-brand-deep text-white text-[15px] font-bold hover:bg-[#0d3a5c] disabled:opacity-50 cursor-pointer shadow-sm">
              <FloppyDisk size={13} weight="bold" />{saving ? "저장중" : "저장"}
            </button>
            <button type="button" onClick={cancelEdit} disabled={saving}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-line text-[15px] font-semibold text-zinc-600 hover:bg-zinc-50 cursor-pointer disabled:opacity-50">
              <X size={13} />취소
            </button>
          </>
        ) : canEdit && (
          <button type="button" onClick={startEdit}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-line text-[15px] font-semibold text-brand-deep hover:bg-brand-tint hover:border-brand-deep cursor-pointer transition-colors shadow-sm">
            <PencilSimple size={13} />수정
          </button>
        )}
      </div>

      {/* ─── Fields grid ────────────────────────────────────────────── */}
      <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-4">
        {/* 상품명 · full row */}
        <div className="col-span-2">
          {editing
            ? <EditField k="product_name" label="상품명" />
            : <Field label="상품명"><span className="text-[17px] font-bold text-ink">{product.product_name || <span className="text-zinc-300">-</span>}</span></Field>}
        </div>

        {/* 공급사 | 카테고리 */}
        {editing
          ? <EditField k="supplier" label="공급사" />
          : <Field label="공급사">
              {product.supplier
                ? <button type="button" onClick={() => vendorModal.openVendorInfo(product.supplier!)}
                    className="inline-flex items-center gap-1 text-brand-deep font-semibold hover:underline cursor-pointer">
                    {product.supplier}<ArrowSquareOut size={12} />
                  </button>
                : <span className="text-zinc-300">-</span>}
            </Field>}
        {editing
          ? <EditField k="category" label="카테고리" />
          : <Field label="카테고리">{dispVal("category")}</Field>}

        {/* 바코드 | 판매상태 */}
        {editing ? <EditField k="barcode" label="바코드" /> : <Field label="바코드">{dispVal("barcode")}</Field>}
        {editing
          ? <EditField k="sale_status" label="판매상태" />
          : <Field label="판매상태">
              {(() => {
                const s = String(p.sale_status ?? "");
                const tone = s === "판매중" ? "emerald" : s === "판매중지" ? "rose" : "zinc";
                return s ? <StatusPill tone={tone} size="sm">{s}</StatusPill> : <span className="text-zinc-300">-</span>;
              })()}
            </Field>}

        {/* 진열위치 | 단위 */}
        {editing ? <EditField k="location" label="진열위치" /> : <Field label="진열위치">{dispVal("location")}</Field>}
        {editing ? <EditField k="unit" label="단위" /> : <Field label="단위">{dispVal("unit")}</Field>}

        {/* 매입가 | 판매가 */}
        {editing
          ? <EditField k="purchase_price" label="매입가 (단가)" type="number" />
          : <Field label="매입가 (단가)">
              {p.purchase_price != null
                ? <span className="tabular-nums font-bold text-amber-700">{Number(p.purchase_price).toLocaleString()}원</span>
                : <span className="text-zinc-300">-</span>}
            </Field>}
        {editing
          ? <EditField k="sale_price" label="판매가" type="number" />
          : <Field label="판매가">
              {p.sale_price != null
                ? <span className="tabular-nums font-bold text-brand-deep">{Number(p.sale_price).toLocaleString()}원</span>
                : <span className="text-zinc-300">-</span>}
            </Field>}

        {/* 이익율 | 적정재고 */}
        <Field label="이익율">
          {profitRate != null
            ? <span className={`tabular-nums font-bold ${profitRate >= 30 ? "text-emerald-600" : profitRate >= 15 ? "text-amber-600" : "text-rose-600"}`}>{profitRate}%</span>
            : <span className="text-zinc-300">-</span>}
        </Field>
        {editing
          ? <EditField k="optimal_stock" label="적정재고 (30일)" type="number" />
          : <Field label="적정재고 (30일)">
              {p.optimal_stock != null ? <span className="tabular-nums font-semibold">{String(p.optimal_stock)}개</span> : <span className="text-zinc-300">-</span>}
            </Field>}

        {/* 현재고 | 창고재고 */}
        <Field label="현재고">
          {p.current_stock != null ? <span className="tabular-nums font-bold text-brand-deep">{String(p.current_stock)}개</span> : <span className="text-zinc-300">-</span>}
        </Field>
        <Field label="창고재고">
          {p.warehouse_stock != null ? <span className="tabular-nums font-semibold">{String(p.warehouse_stock)}개</span> : <span className="text-zinc-300">-</span>}
        </Field>

        {/* 매장재고 | 최근매입일 */}
        <Field label="매장재고">
          {p.store_stock != null ? <span className="tabular-nums font-semibold">{String(p.store_stock)}개</span> : <span className="text-zinc-300">-</span>}
        </Field>
        <Field label="최근매입일">
          {p.last_purchase_date ? <span className="tabular-nums text-zinc-600">{String(p.last_purchase_date).slice(0, 10)}</span> : <span className="text-zinc-300">-</span>}
        </Field>

        {/* 규격 | 브랜드 */}
        {editing ? <EditField k="spec" label="규격" /> : <Field label="규격">{dispVal("spec")}</Field>}
        {editing ? <EditField k="brand" label="브랜드" /> : <Field label="브랜드">{dispVal("brand")}</Field>}

        {/* 제조사 */}
        {editing
          ? <EditField k="manufacturer" label="제조사" />
          : <Field label="제조사">{dispVal("manufacturer")}</Field>}
      </div>

      {vendorModal.modalElement}
      {toast && <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>}
    </>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────
export const ProductInfoPage: React.FC<Props> = ({ authSession }) => {
  const { toast, showError } = useToast();
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
  // 2026-08-23 · #197 · 스캔 페이지에서 넘어온 pending code · 자동 등록 모달 (권한자만)
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  useEffect(() => {
    const code = consumeScanPendingProductCode();
    if (code && canManage) {
      setPendingCode(code);
      setCreateOpen(true);
    }
  }, [canManage]);

  // 좌우 분할 · 폭 저장 · 데스크탑 감지
  const { width: leftWidth, startResize, isDesktop } = useResizablePanel({
    storageKey: "productinfo.leftWidth",
    defaultWidth: 420,
    minWidth: 300,
    maxWidth: 720,
    detectDesktop: true,
  });

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
          barcode: p.barcode ?? null,
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

  // 2026-08-30 · 사용자 지시 · 판매중/판매중지 3-way 필터 (관리 페이지 · include_inactive=1 로 다 조회)
  const { value: saleFilter, setValue: setSaleFilter, matches: saleMatches } = useSaleStatusFilter({ storageKey: "productInfo.saleFilter" });
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
    if (!isDesktop) setMobileOpen(true);
  };

  const listBody = (
    <ul className="divide-y divide-zinc-100">
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
    <>
      {/* 2026-08-30 · 사용자 지시 · 전체 화면 넓이의 85% · 중앙 정렬 */}
      <div className={`flex-1 flex min-h-0 gap-0 bg-white rounded-xl border border-line overflow-hidden ${PAGE_CONTAINER_CLS}`}>
        {/* 좌측 · 리스트 (mobile 전체폭 · desktop leftWidth) */}
        <div
          className="flex flex-col min-h-0"
          style={isDesktop ? { width: leftWidth, flexShrink: 0 } : { width: "100%" }}
        >
          <SplitListPanel
            topAccent
            title="상품정보"
            count={filtered.length}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="상품명·코드·공급사 검색"
            recentSearchScope="productInfo"
            /* 2026-08-30 · 사용자 지시 · 판매중/판매중지 3-way 필터 · 프리미티브 재사용 */
            filters={<SaleStatusFilter value={saleFilter} onChange={setSaleFilter} size="sm" />}
            onAdd={canManage ? () => setCreateOpen(true) : undefined}
            addLabel="상품 등록"
            addTitle="신규 상품 등록"
            loading={listLoading}
            empty={!listLoading && filtered.length === 0}
            emptyText={search ? "검색 결과 없음" : "상품이 없습니다"}
            emptyIcon={Package as any}
            error={listError}
          >
            {listBody}
          </SplitListPanel>
        </div>

        {/* PC · 리사이저 */}
        {isDesktop && (
          <div
            onMouseDown={startResize}
            className="w-[3px] cursor-col-resize bg-line hover:bg-brand-tint transition-colors shrink-0"
            title="드래그하여 폭 조절"
          />
        )}

        {/* PC · 우측 상세 */}
        {isDesktop && (
          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto bg-zinc-50/30">
            <ProductDetailView
              product={detail}
              loading={detailLoading}
              error={detailError}
              canEdit={canManage}
              onSaved={() => setReloadKey((k) => k + 1)}
            />
          </div>
        )}
      </div>

      {/* Mobile · 상세 모달 */}
      {!isDesktop && (
        <Modal
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          title={detail?.product_name || "상품 상세"}
          size="lg-narrow"
          bodyPadding="none"
        >
          <ProductDetailView
              product={detail}
              loading={detailLoading}
              error={detailError}
              canEdit={canManage}
              onSaved={() => setReloadKey((k) => k + 1)}
            />
        </Modal>
      )}

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

      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
    </>
  );
};

export default ProductInfoPage;
