// src/components/ProductInfoPage/ProductInfoPage.tsx
// 2026-08-23 · #177 · Phase A/B · 상품정보 페이지 (매장>매입 서브탭)
//   · 좌측 SplitListPanel · 우측 상세 (PC lg+) / 모바일 모달
//   · Phase A: 탭 진입 · 좌측 리스트 · SplitListPanel 활용
//   · Phase B: 상세 조회 (product_code · supplier · category · optimal_stock 등)
//   · Phase C/D: 등록/편집 · 후속 커밋
//
// 프레임워크 원칙 · SplitListPanel · Card · Modal · SplitPanel(resize) · apiClient · useToast

import React, { useEffect, useMemo, useState } from "react";
import { Package, Info as InfoIcon } from "lucide-react";
import { SplitListPanel } from "../common/SplitListPanel";
import { Modal } from "../common/Modal";
import { Card } from "../common/Card";
import { ProductCreateModal } from "./ProductCreateModal";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import { useToast, toastClass } from "../../hooks/useToast";
import { api, ApiError } from "../../lib/apiClient";
import { matchHangul } from "../../lib/hangulSearch";
import type { AuthSession } from "../../types";

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
}

interface ProductDetail extends ProductRow {
  realMap?: string | null;
  warehouse_stock?: number | null;
  store_stock?: number | null;
  inv_checked_at?: string | null;
  last_purchase_date?: string | null;
  sale_price?: number | null;
  purchase_price?: number | null;
  cost_price?: number | null;
  note?: string | null;
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

// ─── Detail panel · 재사용 (PC 우측 / 모바일 modal 내부 동일) ─────────────
const ProductDetailView: React.FC<{ product: ProductDetail | null; loading: boolean; error: string | null }> = ({
  product, loading, error,
}) => {
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
  const rows: Array<[string, React.ReactNode]> = [
    ["상품코드", <span className="tabular-nums font-semibold text-ink">{product.product_code}</span>],
    ["상품명", <span className="font-bold text-ink">{product.product_name}</span>],
    ["공급사", product.supplier ?? <span className="text-zinc-400">—</span>],
    ["카테고리", product.category ?? <span className="text-zinc-400">—</span>],
    ["단위", product.unit ?? <span className="text-zinc-400">—</span>],
    ["규격", product.spec ?? <span className="text-zinc-400">—</span>],
    ["바코드", product.barcode ?? <span className="text-zinc-400">—</span>],
    ["실제배정구역", product.real_map ?? product.realMap ?? <span className="text-zinc-400">—</span>],
    ["창고 재고", product.warehouse_stock ?? <span className="text-zinc-400">—</span>],
    ["매장 재고", product.store_stock ?? <span className="text-zinc-400">—</span>],
    ["추천 적정재고", product.optimal_stock ?? <span className="text-zinc-400">—</span>],
    ["최근 매입일", product.last_purchase_date ?? <span className="text-zinc-400">—</span>],
  ];
  return (
    <div className="p-4 space-y-3">
      <Card variant="flat" padding="md" rounded="lg" className="bg-white">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-line">
          <InfoIcon size={16} className="text-brand-deep" />
          <h3 className="text-[15px] font-bold text-ink tracking-tight">기본 정보</h3>
          <div className="flex-1" />
          <StatusPill tone="brand" size="xs">조회</StatusPill>
        </div>
        <dl className="grid grid-cols-[110px_1fr] gap-y-2 gap-x-3 text-[13px]">
          {rows.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="text-zinc-500 font-medium">{k}</dt>
              <dd className="text-ink">{v}</dd>
            </React.Fragment>
          ))}
        </dl>
      </Card>
    </div>
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

  const filtered = useMemo(() => {
    const s = search.trim();
    if (!s) return rows;
    return rows.filter(r =>
      matchHangul(r.product_name, s) ||
      r.product_code.toLowerCase().includes(s.toLowerCase()) ||
      (r.supplier ?? "").toLowerCase().includes(s.toLowerCase()),
    );
  }, [rows, search]);

  // 상세 fetch (선택 시)
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
  }, [selectedCode]);

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
            title="상품정보"
            count={filtered.length}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="상품명·코드·공급사 검색"
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
            <ProductDetailView product={detail} loading={detailLoading} error={detailError} />
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
          <ProductDetailView product={detail} loading={detailLoading} error={detailError} />
        </Modal>
      )}

      {/* Phase C · 상품 등록 모달 */}
      <ProductCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(code) => {
          setSelectedCode(code);
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
