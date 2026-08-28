// src/components/ProductInfoPage/ProductInfoPage.tsx
// 2026-08-23 · #177 · Phase A/B · 상품정보 페이지 (매장>매입 서브탭)
//   · 좌측 SplitListPanel · 우측 상세 (PC lg+) / 모바일 모달
//   · Phase A: 탭 진입 · 좌측 리스트 · SplitListPanel 활용
//   · Phase B: 상세 조회 (product_code · supplier · category · optimal_stock 등)
//   · Phase C/D: 등록/편집 · 후속 커밋
//
// 프레임워크 원칙 · SplitListPanel · Card · Modal · SplitPanel(resize) · apiClient · useToast

import React, { useEffect, useMemo, useState } from "react";
import { Package, Info as InfoIcon, Pencil, Save, X } from "lucide-react";
import { SplitListPanel } from "../common/SplitListPanel";
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
import { matchHangul } from "../../lib/hangulSearch";
import type { AuthSession } from "../../types";
import { UpdateProductSchema, type UpdateProductInput } from "../../shared/schemas/products";
// 2026-08-23 · #197 · 스캔 페이지에서 넘어온 pending code · 자동 등록 모달
import { consumeScanPendingProductCode } from "../../hooks/useScanUnregisteredMode";
// 2026-08-28 · 감사 P1-3 · 이중 필터 제거 · 서버 (getPublicProductMap) 이 이미 판매중 필터
// import { useSaleActiveOnly } from "../../hooks/useSaleActiveOnly";  // deprecated · 이중 필터 원인
// 2026-08-28 · 사용자 지시 · 13컬럼 통일 · ProductBasicInfoPanel 상단 삽입
import { ProductBasicInfoPanel } from "../common/ProductBasicInfoPanel";

// ─── Types ────────────────────────────────────────────────────────────────
interface ProductRow {
  product_code: string;
  product_name: string;
  supplier?: string | null;
  category?: string | null;
  unit?: string | null;
  current_stock?: number | null;
  optimal_stock?: number | null;
  real_map?: string | null;
  barcode?: string | null;
  spec?: string | null;
  sale_status?: string | null; // 2026-08-26 · 사용자 지시 · 판매중 필터용
}

interface ProductDetail extends ProductRow {
  realMap?: string | null;
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

// ─── Phase D · 편집 가능 필드 · 스캔페이지 ProductInfoCard 와 유사 ─────
// product_code 는 편집 금지 · barcode 는 UNIQUE 검사 없음 (Phase 후속)
type EditableKey =
  | "product_name" | "supplier" | "category" | "unit" | "spec" | "barcode"
  | "real_map" | "optimal_stock" | "sale_price" | "purchase_price"
  | "brand" | "manufacturer";

const NUMBER_KEYS = new Set<EditableKey>(["optimal_stock", "sale_price", "purchase_price"]);

const detailInputCls =
  "w-full h-8 px-2 rounded-md border border-line bg-white text-[13px] font-medium text-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition-colors";

// ─── Detail panel · 재사용 (PC 우측 / 모바일 modal 내부 동일) ─────────────
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
  // 2026-08-29 · 사용자 지시 · 상세 편집 카드 → 모달 · 필요할 때만 노출
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // product 변경 시 · 편집 종료 (다른 상품 선택 시 draft 리셋)
  useEffect(() => {
    setEditing(false);
    setDraft({} as Record<EditableKey, string>);
  }, [product?.product_code]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size={22} tone="brand" label="상품 상세 불러오는 중..." />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4">
        <Card variant="flat" padding="md" rounded="lg" bg="bg-rose-50" borderColor="border-rose-200" className="text-[13px] text-rose-700 font-medium">
          {error}
        </Card>
      </div>
    );
  }
  if (!product) {
    return (
      <div className="flex items-center justify-center py-16">
        <EmptyState icon={Package} title="상품을 선택하세요" hint="좌측 리스트에서 상품을 선택하면 상세정보가 표시됩니다" />
      </div>
    );
  }

  // 2026-08-28 · 사용자 지시 · 13컬럼 통일 상단 · 진열위치·판매상태 인라인 편집
  const handleLocationChange = async (newLocation: string | null) => {
    try {
      await api.patch(`/api/products/${encodeURIComponent(product.product_code)}`, {
        location: newLocation,
        display_location: newLocation,
      });
      showSuccess(`진열위치 · ${newLocation ?? "-"} 저장`);
      onSaved();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error)?.message ?? "저장 실패";
      showError(`[진열위치] ${msg}`);
    }
  };
  const handleSaleStatusChange = async (newStatus: string) => {
    try {
      await api.patch(`/api/products/${encodeURIComponent(product.product_code)}`, { sale_status: newStatus });
      showSuccess(`판매상태 · ${newStatus} 저장`);
      onSaved();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error)?.message ?? "저장 실패";
      showError(`[판매상태] ${msg}`);
    }
  };

  const val = (k: EditableKey): string => {
    if (k in draft) return draft[k];
    const p = product as unknown as Record<string, unknown>;
    const v = p[k];
    return v == null ? "" : String(v);
  };
  const set = (k: EditableKey, v: string) => setDraft(prev => ({ ...prev, [k]: v }));

  const startEdit = () => {
    setEditing(true);
    setDraft({} as Record<EditableKey, string>);
  };

  const cancelEdit = async () => {
    if (Object.keys(draft).length > 0) {
      const ok = await confirm({ title: "변경 취소", message: "저장하지 않은 변경사항을 취소하시겠습니까?", danger: true });
      if (!ok) return;
    }
    setEditing(false);
    setDraft({} as Record<EditableKey, string>);
  };

  const save = async () => {
    // draft 에 있는 것만 변경사항으로 · 실제 값이 원본과 다른지 확인
    const changes: Partial<UpdateProductInput> = {};
    for (const [rawK, rawV] of Object.entries(draft)) {
      const k = rawK as EditableKey;
      const trimmed = rawV.trim();
      const originalRaw = (product as unknown as Record<string, unknown>)[k];
      const original = originalRaw == null ? "" : String(originalRaw);
      if (trimmed === original) continue;
      if (NUMBER_KEYS.has(k)) {
        (changes as Record<string, unknown>)[k] = trimmed === "" ? null : Number(trimmed);
      } else {
        (changes as Record<string, unknown>)[k] = trimmed === "" ? null : trimmed;
      }
    }
    if (Object.keys(changes).length === 0) {
      showError("변경사항이 없습니다");
      return;
    }
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
      const msg = e instanceof ApiError ? e.message : (e as Error)?.message ?? "저장 실패";
      showError(`[상품 편집] ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── row builder · display vs edit mode ───────────────────────────────
  const displayRow = (k: EditableKey, label: string, extra?: React.ReactNode) => {
    const p = product as unknown as Record<string, unknown>;
    const v = p[k];
    return (
      <React.Fragment key={label}>
        <dt className="text-zinc-500 font-medium">{label}</dt>
        <dd className="text-ink">
          {v == null || v === "" ? <span className="text-zinc-400">—</span> : String(v)}
          {extra}
        </dd>
      </React.Fragment>
    );
  };
  const editRow = (k: EditableKey, label: string, type: "text" | "number" = "text") => (
    <React.Fragment key={label}>
      <dt className="text-zinc-500 font-medium pt-1">{label}</dt>
      <dd>
        <input
          type={type}
          value={val(k)}
          onChange={(e) => set(k, e.target.value)}
          min={type === "number" ? 0 : undefined}
          step={k === "optimal_stock" ? 1 : undefined}
          className={detailInputCls + (type === "number" ? " tabular-nums" : "")}
        />
      </dd>
    </React.Fragment>
  );

  return (
    <>
      <div className="p-4 space-y-3">
        {/* 2026-08-28 · 사용자 지시 · 13컬럼 통일 · ProductBasicInfoPanel 상단 · 진열위치·판매상태 인라인 편집 */}
        <ProductBasicInfoPanel
          product={{
            product_code: product.product_code,
            category_code: (product as any).category_code,
            category: (product as any).category,
            product_name: product.product_name,
            supplier: product.supplier,
            location: (product as any).location ?? (product as any).display_location,
            display_location: (product as any).display_location,
            sale_status: (product as any).sale_status,
            current_stock: (product as any).current_stock,
            warehouse_stock: (product as any).warehouse_stock,
            store_stock: (product as any).store_stock,
            purchase_price: (product as any).purchase_price,
            sale_price: (product as any).sale_price,
            profit_rate: (product as any).profit_rate,
            optimal_stock: (product as any).optimal_stock,
            last_purchase_date: (product as any).last_purchase_date,
          }}
          editable={canEdit}
          onLocationChange={handleLocationChange}
          onSaleStatusChange={handleSaleStatusChange}
        />
        {/* 2026-08-29 · 사용자 지시 · 상세 편집 · 모달로 이동 · [상세 편집] 버튼으로 오픈 */}
        {canEdit && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => { setDetailModalOpen(true); if (!editing) startEdit(); }}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-line bg-white text-[14px] font-bold text-brand-deep hover:bg-brand-tint hover:border-brand-deep transition cursor-pointer shadow-sm"
              title="상세 편집 (전체 필드)"
            >
              <Pencil size={14} strokeWidth={2.4} />
              상세 편집
            </button>
          </div>
        )}
      </div>
      {/* 2026-08-29 · 사용자 지시 · 상세 편집 · 모달 · [상세 편집] 버튼 클릭 시 오픈 */}
      <Modal
        open={detailModalOpen}
        onClose={() => { if (!saving) { setDetailModalOpen(false); if (editing) setEditing(false); } }}
        title={`상세 편집 · ${product.product_name || product.product_code}`}
        size="lg-narrow"
        bodyPadding="none"
      >
        <div className="p-4">
        <Card variant="flat" padding="md" rounded="lg" topAccent className="bg-white">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-line">
            <InfoIcon size={16} className="text-brand-deep" />
            <h3 className="text-[15px] font-bold text-ink tracking-tight">상세 편집 (전체 필드)</h3>
            <div className="flex-1" />
            {editing ? (
              <>
                <StatusPill tone="amber" size="xs">편집 중</StatusPill>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-brand-deep text-white text-[12px] font-bold hover:bg-[#0d3a5c] disabled:opacity-50 cursor-pointer"
                >
                  <Save size={12} />{saving ? "저장중" : "저장"}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-line text-[12px] font-semibold text-zinc-600 hover:bg-zinc-50 cursor-pointer disabled:opacity-50"
                >
                  <X size={12} />취소
                </button>
              </>
            ) : (
              <>
                <StatusPill tone="brand" size="xs">조회</StatusPill>
                {canEdit && (
                  <button
                    type="button"
                    onClick={startEdit}
                    title="상품 편집"
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-line text-[12px] font-semibold text-brand-deep hover:bg-brand-tint hover:border-brand-deep cursor-pointer transition-colors"
                  >
                    <Pencil size={12} />편집
                  </button>
                )}
              </>
            )}
          </div>
          <dl className="grid grid-cols-[110px_1fr] gap-y-2 gap-x-3 text-[13px]">
            {/* 상품코드 · 편집 불가 (read-only) */}
            <dt className="text-zinc-500 font-medium">상품코드</dt>
            <dd className="tabular-nums font-semibold text-ink">
              {product.product_code}
              <span className="ml-1.5 text-[10px] text-zinc-400 font-normal">(변경 불가)</span>
            </dd>
            {editing ? (
              <>
                {editRow("product_name", "상품명")}
                {editRow("supplier", "공급사")}
                {editRow("category", "카테고리")}
                {editRow("unit", "단위")}
                {editRow("spec", "규격")}
                {editRow("barcode", "바코드")}
                {editRow("real_map", "실제배정구역")}
                {editRow("optimal_stock", "추천 적정재고", "number")}
                {editRow("sale_price", "판매가", "number")}
                {editRow("purchase_price", "매입가", "number")}
                {editRow("brand", "브랜드")}
                {editRow("manufacturer", "제조사")}
              </>
            ) : (
              <>
                {displayRow("product_name", "상품명")}
                {displayRow("supplier", "공급사")}
                {displayRow("category", "카테고리")}
                {displayRow("unit", "단위")}
                {displayRow("spec", "규격")}
                {displayRow("barcode", "바코드")}
                {displayRow("real_map", "실제배정구역")}
                <dt className="text-zinc-500 font-medium">창고 재고</dt>
                <dd className="text-ink tabular-nums">{product.warehouse_stock ?? <span className="text-zinc-400">—</span>}</dd>
                <dt className="text-zinc-500 font-medium">매장 재고</dt>
                <dd className="text-ink tabular-nums">{product.store_stock ?? <span className="text-zinc-400">—</span>}</dd>
                {displayRow("optimal_stock", "추천 적정재고")}
                {displayRow("sale_price", "판매가")}
                {displayRow("purchase_price", "매입가")}
                {displayRow("brand", "브랜드")}
                {displayRow("manufacturer", "제조사")}
                <dt className="text-zinc-500 font-medium">최근 매입일</dt>
                <dd className="text-ink">{product.last_purchase_date ?? <span className="text-zinc-400">—</span>}</dd>
              </>
            )}
          </dl>
        </Card>
        </div>
      </Modal>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
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
    api.get<Record<string, Partial<ProductRow> & { product_name?: string }>>("/api/products-map")
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
          real_map: p.real_map ?? null,
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

  // 2026-08-28 · 감사 P1-3 · 이중 필터 제거 · 서버 getPublicProductMap 이 이미 판매중 필터 (신규 상품 null 상태 누락 방지)
  const filtered = useMemo(() => {
    const list = rows;
    const s = search.trim();
    if (!s) return list;
    return list.filter(r =>
      matchHangul(r.product_name, s) ||
      r.product_code.toLowerCase().includes(s.toLowerCase()) ||
      (r.supplier ?? "").toLowerCase().includes(s.toLowerCase()),
    );
  }, [rows, search]);

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
                <div className={`text-[13px] font-bold truncate ${active ? "text-brand-deep" : "text-ink"}`}>
                  {r.product_name || <span className="text-zinc-400">(이름없음)</span>}
                </div>
                <div className="text-[11px] text-zinc-500 truncate tabular-nums">
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
      <div className="flex-1 flex min-h-0 gap-0 bg-white rounded-xl border border-line overflow-hidden">
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
            onAdd={canManage ? () => setCreateOpen(true) : undefined}
            addLabel="상품 등록"
            addTitle="신규 상품 등록"
            loading={listLoading}
            empty={!listLoading && filtered.length === 0}
            emptyText={search ? "검색 결과 없음" : "상품이 없습니다"}
            emptyIcon={Package}
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
