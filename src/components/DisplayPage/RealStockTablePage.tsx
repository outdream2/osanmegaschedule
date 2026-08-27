// src/components/DisplayPage/RealStockTablePage.tsx
// 2026-08-26 · 사용자 지시 · 실재고 테이블 페이지 · 창고2 옆 신규 탭
//   · 표형식 · 왼쪽 상품 리스트 · 오른쪽 전산구역·창고1/2·매장1/2/3 재고
//   · 헤더 자동 정렬 (useSortableTable)
//   · 목업 톤 (Linear/Notion) · 프리미티브 (Card·TableListWrap·Spinner·EmptyState)
//   · /api/inventory-latest (최신 실재고) + /api/products-search (상품 리스트) 조합

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { PackageCheck, Search, RefreshCw, Check, X } from "lucide-react";
import { Modal } from "../common/Modal";
import { api, ApiError } from "../../lib/apiClient";
import { Card } from "../common/Card";
import { EmptyState } from "../common/EmptyState";
import { Spinner } from "../common/Spinner";
import { TableListWrap, tableHeadCls, tableThCls, tableTdCls } from "../common/TableList";
import { useSortableTable, type Comparator } from "../../hooks/useSortableTable";
import { useToast, toastClass } from "../../hooks/useToast";
import { useSaleActiveOnly } from "../../hooks/useSaleActiveOnly";
// 2026-08-27 · 사용자 지시 · 카테고리 → 창고 slot 지능 배정 (8A=창고1 · 32=창고2)
import { assignZonesToSlots } from "../../lib/warehouseZoneMap";

interface Product {
  product_code: string;
  product_name: string;
  supplier: string | null;
  spec: string | null;
  real_map: string | null;
  category_code: string | null;
  current_stock: number | null; // 2026-08-26 · ERP 재고 (products.current_stock)
  sale_status: string | null;   // 2026-08-26 · 판매중 필터용
}

interface InvRow {
  warehouse1_stock: number | null;
  warehouse2_stock: number | null;
  store_stock: number | null;         // 매장1
  store_stock_2: number | null;       // 매장2
  store3_stock: number | null;        // 매장3
}

interface Row {
  product_code: string;
  product_name: string;
  supplier: string | null;
  category_code: string | null;        // 2026-08-26 · 분류코드
  spec: string | null;                 // 전산구역
  real_map: string | null;
  erp: number | null;                  // 2026-08-26 · ERP 재고 (products.current_stock)
  w1: number | null;
  w2: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  // 2026-08-26 · 사용자 지시 · real_map "/" 분리 · 매장1/2/3 zone 라벨 · 창고1/2 zone 도
  s1zone: string | null;
  s2zone: string | null;
  s3zone: string | null;
  w1zone: string | null;
  w2zone: string | null;
  sale_status: string | null;
  total: number;
  diff: number;                        // 2026-08-26 · ERP - 실재고합계 (음수면 실재고 많음)
}

// 2026-08-27 · 사용자 지시 · Attio 2026 톤 · dual-chip 정렬 (수량 · 구역) · 위치별 zone 정렬 추가
type SortKey = "product_name" | "supplier" | "category_code" | "spec" | "erp" | "w1" | "w2" | "s1" | "s2" | "s3" | "total" | "diff"
             | "s1zone" | "s2zone" | "s3zone" | "w1zone" | "w2zone";

const SLOT_LABEL: Record<"w1" | "w2" | "s1" | "s2" | "s3", string> = {
  w1: "창고1", w2: "창고2", s1: "매장1", s2: "매장2", s3: "매장3",
};

const zoneCmp = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "", "ko", { numeric: true });

const CMP: Record<SortKey, Comparator<Row>> = {
  product_name:  (a, b) => (a.product_name ?? "").localeCompare(b.product_name ?? "", "ko"),
  supplier:      (a, b) => (a.supplier ?? "").localeCompare(b.supplier ?? "", "ko"),
  category_code: (a, b) => (a.category_code ?? "").localeCompare(b.category_code ?? "", "ko"),
  spec:          (a, b) => (a.spec ?? "").localeCompare(b.spec ?? "", "ko"),
  erp:           (a, b) => (a.erp ?? 0) - (b.erp ?? 0),
  w1:            (a, b) => (a.w1 ?? 0) - (b.w1 ?? 0),
  w2:            (a, b) => (a.w2 ?? 0) - (b.w2 ?? 0),
  s1:            (a, b) => (a.s1 ?? 0) - (b.s1 ?? 0),
  s2:            (a, b) => (a.s2 ?? 0) - (b.s2 ?? 0),
  s3:            (a, b) => (a.s3 ?? 0) - (b.s3 ?? 0),
  s1zone:        (a, b) => zoneCmp(a.s1zone, b.s1zone),
  s2zone:        (a, b) => zoneCmp(a.s2zone, b.s2zone),
  s3zone:        (a, b) => zoneCmp(a.s3zone, b.s3zone),
  w1zone:        (a, b) => zoneCmp(a.w1zone, b.w1zone),
  w2zone:        (a, b) => zoneCmp(a.w2zone, b.w2zone),
  total:         (a, b) => a.total - b.total,
  diff:          (a, b) => a.diff - b.diff,
};

export const RealStockTablePage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [inv, setInv] = useState<Record<string, InvRow>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // 2026-08-26 · 사용자 지시 · 전역 useSaleActiveOnly 훅 · 모든 소비자와 동기화 (기본값 true)
  const { saleActiveOnly: saleOnly, setSaleActiveOnly: setSaleOnly } = useSaleActiveOnly();
  const { toast, showError, showSuccess } = useToast();
  // 2026-08-27 · 사용자 지시 · Group by 구역 뷰 토글 (옵션 3)
  const [groupByZone, setGroupByZone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 2026-08-26 · 사용자 버그 fix · products-search 는 q="" 시 [] 반환 → 데이터 안 나옴
      //   · /api/products-map 사용 · 전체 상품 map · 배열로 변환
      const [pRes, iRes] = await Promise.all([
        api.get<Record<string, any>>("/api/products-map"),
        api.get<Record<string, InvRow>>("/api/inventory-latest"),
      ]);
      const map = pRes.data ?? {};
      const list: Product[] = Object.entries(map).map(([code, p]) => ({
        product_code: code,
        product_name: String(p?.product_name ?? p?.name ?? ""),
        supplier: p?.supplier ?? null,
        spec: p?.spec ?? null,
        real_map: p?.real_map ?? null,
        category_code: p?.category_code ?? null,
        current_stock: p?.current_stock != null ? Number(p.current_stock) : null,
        sale_status: p?.sale_status ?? null,
      }));
      list.sort((a, b) => a.product_name.localeCompare(b.product_name, "ko"));
      setProducts(list);
      setInv(iRes.data ?? {});
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : (e as any)?.message ?? "네트워크 오류";
      setError(msg);
      showError(`실재고 테이블 조회 실패: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const rows: Row[] = useMemo(() => products.map(p => {
    const i = inv[p.product_code];
    const w1 = i?.warehouse1_stock ?? null;
    const w2 = i?.warehouse2_stock ?? null;
    const s1 = i?.store_stock ?? null;
    const s2 = i?.store_stock_2 ?? null;
    const s3 = i?.store3_stock ?? null;
    const total = (w1 ?? 0) + (w2 ?? 0) + (s1 ?? 0) + (s2 ?? 0) + (s3 ?? 0);
    const erp = p.current_stock;
    const diff = (erp ?? 0) - total;
    // 2026-08-27 · 사용자 지시 · 전산 ERP 구역 (spec) → 매장 zone 그대로 적용 · 일치 보장
    //   · spec "1/2/3" → 매장1=1·매장2=2·매장3=3 (전산 컬럼과 완전 일치)
    //   · category_code=8A → 창고1 zone=8A · category_code=32 → 창고2 zone=32
    //   · real_map fallback 제거 · 매장/전산 불일치 방지
    const slots = assignZonesToSlots(String(p.spec ?? "").trim(), p.category_code);
    return {
      product_code: p.product_code,
      product_name: p.product_name,
      supplier: p.supplier,
      category_code: p.category_code,
      spec: p.spec,
      real_map: p.real_map,
      erp,
      w1, w2, s1, s2, s3,
      s1zone: slots.s1zone,
      s2zone: slots.s2zone,
      s3zone: slots.s3zone,
      w1zone: slots.w1zone,
      w2zone: slots.w2zone,
      sale_status: p.sale_status,
      total, diff,
    };
  }), [products, inv]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    // 2026-08-26 · 사용자 지시 · 오직 sale_status = "판매중" · null/빈칸 제외
    if (saleOnly) list = list.filter(r => String(r.sale_status ?? "").trim() === "판매중");
    if (!q) return list;
    return list.filter(r =>
      String(r.product_name ?? "").toLowerCase().includes(q) ||
      String(r.supplier ?? "").toLowerCase().includes(q) ||
      String(r.product_code ?? "").toLowerCase().includes(q) ||
      String(r.spec ?? "").toLowerCase().includes(q)
    );
  }, [rows, search, saleOnly]);

  const { sorted, sortKey, sortDir, toggleSort, setSort } = useSortableTable<Row, SortKey>(filtered, "product_name", CMP, "asc");
  // 2026-08-27 · 사용자 지시 · 구역별 그룹 활성 시 · 자동으로 구역(spec) 정렬로 전환
  useEffect(() => {
    if (groupByZone) setSort("spec", "asc");
  }, [groupByZone, setSort]);

  // 2026-08-26 · 사용자 지시 · 상품 클릭 · 상세 모달
  const [detailRow, setDetailRow] = useState<Row | null>(null);

  // 2026-08-26 · 사용자 지시 · 창고1/2·매장1/2/3 인라인 수량 수정 · Enter 저장
  type SlotKey = "w1" | "w2" | "s1" | "s2" | "s3";
  const [editing, setEditing] = useState<{ code: string; slot: SlotKey } | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const beginEdit = (r: Row, slot: SlotKey) => {
    if (savingRef.current) return;
    setEditing({ code: r.product_code, slot });
    const cur = slot === "w1" ? r.w1 : slot === "w2" ? r.w2 : slot === "s1" ? r.s1 : slot === "s2" ? r.s2 : r.s3;
    setDraft(cur == null ? "" : String(cur));
  };
  const cancelEdit = () => { setEditing(null); setDraft(""); };
  const commitEdit = async () => {
    if (!editing || savingRef.current) return;
    const raw = draft.trim();
    const parsed = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) { showError("숫자만 입력 가능합니다"); return; }
    const row = rows.find(r => r.product_code === editing.code);
    if (!row) { cancelEdit(); return; }
    const slot = editing.slot;
    const oldVal =
      slot === "w1" ? row.w1 : slot === "w2" ? row.w2 :
      slot === "s1" ? row.s1 : slot === "s2" ? row.s2 : row.s3;
    if ((oldVal ?? 0) === parsed) { cancelEdit(); return; }
    savingRef.current = true;
    setSaving(true);
    // 모든 5-slot 필드 보존 · 해당 slot 만 교체
    const next = {
      w1: slot === "w1" ? parsed : (row.w1 ?? 0),
      w2: slot === "w2" ? parsed : (row.w2 ?? 0),
      s1: slot === "s1" ? parsed : (row.s1 ?? 0),
      s2: slot === "s2" ? parsed : (row.s2 ?? 0),
      s3: slot === "s3" ? parsed : (row.s3 ?? 0),
    };
    try {
      await api.post("/api/inventory-checks", {
        product_code:     row.product_code,
        product_name:     row.product_name,
        checked_by:       "",
        warehouse1_stock: next.w1,
        warehouse2_stock: next.w2,
        store_stock:      next.s1,
        store_stock_2:    next.s2,
        store3_stock:     next.s3,
        store1_zone:      row.s1zone,
        store2_zone:      row.s2zone,
        store3_zone:      row.s3zone,
        warehouse_stock:  next.w1,
      });
      setInv(prev => ({
        ...prev,
        [row.product_code]: {
          warehouse1_stock: next.w1,
          warehouse2_stock: next.w2,
          store_stock:      next.s1,
          store_stock_2:    next.s2,
          store3_stock:     next.s3,
        },
      }));
      showSuccess(`${row.product_name} · ${SLOT_LABEL[slot]} = ${parsed} 저장`);
      window.dispatchEvent(new CustomEvent("inventory-checks-updated"));
      cancelEdit();
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : (e as any)?.message ?? "저장 실패";
      showError(`저장 실패: ${msg}`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const sortIndicator = (k: SortKey) => sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "";
  const thSortable = (k: SortKey, align: "left" | "center" | "num", label: string, minW?: number, extra = "") => (
    <th
      className={`${tableThCls(align)} cursor-pointer hover:bg-zinc-100/70 select-none transition ${extra}`}
      onClick={() => toggleSort(k)}
      style={minW ? { minWidth: minW } : undefined}
      title={`${label} 정렬`}
    >
      {label}<span className="ml-1 text-zinc-400 text-[11px]">{sortIndicator(k) || "⇅"}</span>
    </th>
  );

  // 2026-08-27 · 사용자 지시 · Attio 2026 dual-chip 정렬 헤더 · [수량] [구역] chip 2개 · 클릭 시 활성 + 방향
  const thDualChip = (labelText: string, qtyKey: SortKey, zoneKey: SortKey, minW?: number, extra = "") => {
    const chipCls = (k: SortKey) => {
      const active = sortKey === k;
      const dir = active ? (sortDir === "asc" ? "▲" : "▼") : "";
      return {
        base: `inline-flex items-center gap-0.5 px-1.5 h-5 rounded text-[11px] font-bold transition cursor-pointer select-none ${active ? "bg-brand-deep text-white shadow-sm" : "bg-white text-zinc-500 border border-line hover:border-brand-deep hover:text-brand-deep"}`,
        dir,
      };
    };
    const qtyC = chipCls(qtyKey);
    const zoneC = chipCls(zoneKey);
    return (
      <th className={`${tableThCls("center")} select-none ${extra}`} style={minW ? { minWidth: minW } : undefined}>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[12px] font-bold text-ink">{labelText}</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={(e) => { e.stopPropagation(); toggleSort(qtyKey); }} className={qtyC.base} title="수량 정렬">
              수량 <span className="text-[9px]">{qtyC.dir || "⇅"}</span>
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); toggleSort(zoneKey); }} className={zoneC.base} title="구역 정렬">
              구역 <span className="text-[9px]">{zoneC.dir || "⇅"}</span>
            </button>
          </div>
        </div>
      </th>
    );
  };

  // 수량/구역 · 같은톤 다른 shade · 매장(violet) · 창고(cyan)
  const renderQtyZone = (r: Row, slot: SlotKey) => {
    const qty = slot === "w1" ? r.w1 : slot === "w2" ? r.w2 : slot === "s1" ? r.s1 : slot === "s2" ? r.s2 : r.s3;
    const zone = slot === "w1" ? r.w1zone : slot === "w2" ? r.w2zone : slot === "s1" ? r.s1zone : slot === "s2" ? r.s2zone : r.s3zone;
    const tone: "cyan" | "violet" = (slot === "w1" || slot === "w2") ? "cyan" : "violet";
    const isEditing = editing?.code === r.product_code && editing?.slot === slot;
    if (isEditing) {
      return (
        <div className="inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <input
            type="number"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
              if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
            }}
            onBlur={() => { if (!saving) commitEdit(); }}
            className={`w-14 h-7 px-1.5 rounded border text-[16px] text-right tabular-nums font-bold outline-none focus:ring-2 ${tone === "violet" ? "border-violet-500 focus:ring-violet-200 text-violet-800" : "border-cyan-500 focus:ring-cyan-200 text-cyan-800"} bg-white`}
            disabled={saving}
          />
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={commitEdit} disabled={saving} className={`shrink-0 w-6 h-6 flex items-center justify-center rounded ${tone === "violet" ? "bg-violet-600 hover:bg-violet-700" : "bg-cyan-600 hover:bg-cyan-700"} text-white cursor-pointer disabled:opacity-40`} title="저장 (Enter)">
            {saving ? <Spinner size={10} tone="white" /> : <Check size={11} />}
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={cancelEdit} disabled={saving} className="shrink-0 w-6 h-6 flex items-center justify-center rounded bg-white border border-line hover:bg-zinc-50 text-zinc-500 cursor-pointer disabled:opacity-40" title="취소 (Esc)">
            <X size={11} />
          </button>
        </div>
      );
    }
    const qtyCls =
      qty == null || qty <= 0
        ? "text-zinc-300"
        : tone === "cyan" ? "text-cyan-800" : "text-violet-800";
    const zoneCls = tone === "cyan" ? "text-cyan-500" : "text-violet-500";
    return (
      <button
        type="button"
        onClick={() => beginEdit(r, slot)}
        className="inline-flex items-baseline gap-0.5 hover:bg-white rounded px-1.5 py-0.5 -mx-1 transition cursor-pointer max-w-full"
        title={`${SLOT_LABEL[slot]} · 구역/수량 · 클릭하여 편집`}
      >
        {zone && <span className={`text-[15px] font-semibold ${zoneCls} tabular-nums`}>{zone}</span>}
        {zone && <span className="text-[15px] text-zinc-300 font-normal">/</span>}
        <span className={`font-extrabold tabular-nums text-[19px] ${qtyCls}`}>{qty ?? "-"}</span>
      </button>
    );
  };

  return (
    <div data-scope="real-stock-table">
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
      {/* 2026-08-26 · 사용자 지시 · 상품 클릭 · 상세 모달 */}
      {detailRow && (
        <Modal
          open={!!detailRow}
          onClose={() => setDetailRow(null)}
          title={detailRow.product_name}
          size="md"
          titleAccent
        >
          <div className="flex flex-col gap-3 text-[15px]">
            <div className="grid grid-cols-2 gap-3">
              <Field label="상품코드" value={<span className="font-mono text-[15px] tabular-nums">{detailRow.product_code}</span>} />
              <Field label="공급사"  value={detailRow.supplier ?? "-"} />
              <Field label="전산구역" value={detailRow.spec ?? "미지정"} />
              <Field label="실제구역" value={detailRow.real_map ?? "미지정"} />
              <Field label="ERP재고"  value={<b className="text-amber-700 tabular-nums text-[17px]">{detailRow.erp ?? "-"}</b>} />
              <Field label="실재고합계" value={<b className="text-brand-deep tabular-nums text-[17px]">{detailRow.total > 0 ? detailRow.total : "-"}</b>} />
            </div>
            <div className="border-t border-line pt-3">
              <div className="text-[15px] font-bold text-ink-soft uppercase tracking-wider mb-2">위치별 실재고</div>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: "매장1", qty: detailRow.s1, zone: detailRow.s1zone, tone: "violet" },
                  { label: "매장2", qty: detailRow.s2, zone: detailRow.s2zone, tone: "violet" },
                  { label: "매장3", qty: detailRow.s3, zone: detailRow.s3zone, tone: "violet" },
                  { label: "창고1", qty: detailRow.w1, zone: detailRow.w1zone, tone: "cyan" },
                  { label: "창고2", qty: detailRow.w2, zone: detailRow.w2zone, tone: "cyan" },
                ].map((s) => (
                  <div key={s.label} className={`rounded-lg border p-2 text-center ${s.tone === "violet" ? "bg-violet-50/40 border-violet-200" : "bg-cyan-50/40 border-cyan-200"}`}>
                    <div className={`text-[12px] font-bold ${s.tone === "violet" ? "text-violet-700" : "text-cyan-700"}`}>{s.label}</div>
                    {s.zone && <div className="text-[11px] font-bold text-zinc-500 mt-0.5">{s.zone}</div>}
                    <div className={`text-[18px] font-extrabold tabular-nums mt-0.5 ${s.qty != null && s.qty > 0 ? (s.tone === "violet" ? "text-violet-800" : "text-cyan-800") : "text-zinc-300"}`}>{s.qty ?? "-"}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-line pt-3 flex items-center justify-between">
              <span className="text-[16px] font-bold text-ink-soft">차이 (ERP − 실재고합계)</span>
              <span className={`text-[20px] font-extrabold tabular-nums ${detailRow.diff > 0 ? "text-rose-600" : detailRow.diff < 0 ? "text-emerald-600" : "text-zinc-400"}`}>
                {detailRow.diff !== 0 ? (detailRow.diff > 0 ? `+${detailRow.diff}` : String(detailRow.diff)) : "0"}
              </span>
            </div>
          </div>
        </Modal>
      )}
      <div className="flex flex-col gap-3">
        {/* 헤더 · 검색 · 새로고침 */}
        <Card padding="md" topAccent>
          <div className="flex items-center gap-3 flex-wrap">
            <PackageCheck size={20} className="text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <div className="text-[18px] font-bold text-ink tracking-tight leading-tight">실재고 테이블</div>
              <div className="text-[15px] text-ink-soft mt-0.5">상품별 · 전산구역 · 창고1/2 · 매장1/2/3 실재고 현황</div>
            </div>
            <span className="text-[15px] tabular-nums font-semibold text-ink-soft">
              {loading ? <Spinner size={13} tone="brand" className="inline" /> : `${filtered.length}${search ? `/${rows.length}` : ""}건`}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="상품명·공급사·코드·전산구역 검색"
                  className="w-72 h-9 pl-8 pr-3 text-[15px] border border-line rounded-md outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition"
                />
              </div>
              {/* 2026-08-26 · 사용자 지시 · 판매중 상품만 로컬 체크박스 */}
              <label className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg bg-white border border-line text-[16px] font-semibold text-ink-soft hover:bg-zinc-50 hover:border-brand-deep transition cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={saleOnly}
                  onChange={(e) => setSaleOnly(e.target.checked)}
                  className="w-4 h-4 accent-brand-deep cursor-pointer"
                />
                판매중만
              </label>
              {/* 2026-08-27 · 사용자 지시 · Group by 구역 뷰 토글 */}
              <label className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg bg-white border border-line text-[16px] font-semibold text-ink-soft hover:bg-zinc-50 hover:border-brand-deep transition cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={groupByZone}
                  onChange={(e) => setGroupByZone(e.target.checked)}
                  className="w-4 h-4 accent-brand-deep cursor-pointer"
                />
                구역별 그룹
              </label>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-white border border-line text-[16px] font-bold text-ink-soft hover:bg-zinc-50 hover:border-brand-deep hover:text-brand-deep transition cursor-pointer disabled:opacity-40"
                title="새로고침"
              >
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> 새로고침
              </button>
            </div>
          </div>
        </Card>

        {loading && rows.length === 0 ? (
          <Card padding="none" className="flex items-center justify-center py-16">
            <Spinner size={18} tone="brand" label="실재고 로딩 중..." labelSize={15} />
          </Card>
        ) : error ? (
          <Card variant="flat" bg="bg-rose-50" borderColor="border-rose-200" padding="md" className="text-[15px] text-rose-700 font-semibold">
            ⚠ {error}
            <button onClick={load} className="ml-2 underline cursor-pointer">다시 시도</button>
          </Card>
        ) : sorted.length === 0 ? (
          <Card padding="none" className="py-16">
            <EmptyState
              icon={PackageCheck}
              title={search ? "검색 결과 없음" : "상품 없음"}
              hint={search ? "다른 검색어로 시도" : "상품이 등록되면 여기에 표시됩니다"}
              size="normal"
            />
          </Card>
        ) : (
          <TableListWrap>
            <table className="w-full border-collapse">
              <thead className={tableHeadCls("text-[16px]")}>
                <tr>
                  {/* 2026-08-26 · 사용자 지시 · 상품코드 제거 · 모든 헤더 자동정렬 */}
                  {/* 2026-08-27 · 사용자 지시 · 전산구역+ERP 합침 · 위치별 dual-chip (수량+구역) 정렬 */}
                  {thSortable("supplier",      "left",  "공급사",   140)}
                  {thSortable("product_name",  "left",  "상품명",   300)}
                  {/* 2026-08-27 · 사용자 지시 · 셀 = 구역/수량 · dual chip 순서도 [구역][수량] */}
                  {thDualChip("전산·ERP",  "spec",   "erp", 110, "bg-amber-50/60")}
                  {thDualChip("매장1",      "s1zone", "s1",  100, "bg-violet-50/60")}
                  {thDualChip("매장2",      "s2zone", "s2",  100, "bg-violet-50/60")}
                  {thDualChip("매장3",      "s3zone", "s3",  100, "bg-violet-50/60")}
                  {thDualChip("창고1",      "w1zone", "w1",  100, "bg-cyan-50/60")}
                  {thDualChip("창고2",      "w2zone", "w2",  100, "bg-cyan-50/60")}
                  {thSortable("total",        "num", "실재고합계", 95,  "bg-brand-tint/30")}
                  {thSortable("diff",         "num", "차이",     80,  "bg-rose-50/40")}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {/* 2026-08-27 · 사용자 지시 · Group by 구역 · spec (전산구역) 기준 그룹핑 */}
                {(() => {
                  if (!groupByZone) return null;
                  const groups = new Map<string, Row[]>();
                  for (const r of sorted) {
                    const key = String(r.spec ?? "").trim() || "(미지정)";
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key)!.push(r);
                  }
                  const sortedKeys = [...groups.keys()].sort((a, b) => {
                    if (a === "(미지정)") return 1;
                    if (b === "(미지정)") return -1;
                    return a.localeCompare(b, "ko", { numeric: true });
                  });
                  return sortedKeys.flatMap(k => {
                    const rows = groups.get(k)!;
                    const totalErp = rows.reduce((s, r) => s + (r.erp ?? 0), 0);
                    const totalReal = rows.reduce((s, r) => s + r.total, 0);
                    return [
                      <tr key={`group-${k}`} className="bg-gradient-to-r from-brand-tint/60 to-brand-tint/20 border-t-2 border-brand-deep/30 sticky top-0 z-10">
                        <td colSpan={10} className="px-3 py-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="w-1 h-4 rounded-full bg-brand-deep" />
                            <span className="text-[15px] font-extrabold text-brand-deep tabular-nums">{k}</span>
                            <span className="text-[12px] font-bold text-brand-deep/70 tabular-nums">· {rows.length}건</span>
                            <span className="ml-auto flex items-center gap-3 text-[12px] font-bold tabular-nums">
                              <span className="text-amber-700">ERP 합계 {totalErp}</span>
                              <span className="text-brand-deep">실재고 합계 {totalReal}</span>
                              <span className={totalErp - totalReal > 0 ? "text-rose-600" : totalErp - totalReal < 0 ? "text-emerald-600" : "text-zinc-400"}>
                                차이 {totalErp - totalReal > 0 ? `+${totalErp - totalReal}` : totalErp - totalReal}
                              </span>
                            </span>
                          </div>
                        </td>
                      </tr>,
                      ...rows.map(r => (
                        <tr key={r.product_code} className="hover:bg-zinc-50/60 transition text-[15px]">
                          <td className={tableTdCls("left", "text-zinc-700")}>{r.supplier ?? "-"}</td>
                          <td className={tableTdCls("left")}>
                            <button type="button" onClick={() => setDetailRow(r)} className="text-left font-bold text-zinc-800 break-keep whitespace-normal hover:text-brand-deep hover:underline cursor-pointer" title="상세 정보">
                              {r.product_name}
                            </button>
                          </td>
                          <td className={tableTdCls("num", "bg-amber-50/30")}>
                            <span className="inline-flex items-baseline gap-0.5">
                              {r.spec && <span className="text-[15px] font-semibold text-amber-500 tabular-nums">{r.spec}</span>}
                              {r.spec && <span className="text-[15px] text-zinc-300 font-normal">/</span>}
                              <span className={`font-bold tabular-nums text-[15px] ${r.erp != null && r.erp > 0 ? "text-amber-700" : "text-zinc-300"}`}>{r.erp ?? "-"}</span>
                            </span>
                          </td>
                          <td className={tableTdCls("num", "bg-violet-50/30")}>{renderQtyZone(r, "s1")}</td>
                          <td className={tableTdCls("num", "bg-violet-50/30")}>{renderQtyZone(r, "s2")}</td>
                          <td className={tableTdCls("num", "bg-violet-50/30")}>{renderQtyZone(r, "s3")}</td>
                          <td className={tableTdCls("num", "bg-cyan-50/30")}>{renderQtyZone(r, "w1")}</td>
                          <td className={tableTdCls("num", "bg-cyan-50/30")}>{renderQtyZone(r, "w2")}</td>
                          <td className={tableTdCls("num", `tabular-nums font-extrabold ${r.total > 0 ? "text-brand-deep" : "text-zinc-300"} bg-brand-tint/20`)}>{r.total > 0 ? r.total : "-"}</td>
                          <td className={tableTdCls("num", `tabular-nums font-bold ${r.diff > 0 ? "text-rose-600" : r.diff < 0 ? "text-emerald-600" : "text-zinc-300"} bg-rose-50/20`)}>{r.diff !== 0 ? (r.diff > 0 ? `+${r.diff}` : String(r.diff)) : "0"}</td>
                        </tr>
                      )),
                    ];
                  });
                })()}
                {!groupByZone && sorted.map(r => (
                  <tr key={r.product_code} className="hover:bg-zinc-50/60 transition text-[15px]">
                    <td className={tableTdCls("left", "text-zinc-700")}>{r.supplier ?? "-"}</td>
                    <td className={tableTdCls("left")}>
                      <button
                        type="button"
                        onClick={() => setDetailRow(r)}
                        className="text-left font-bold text-zinc-800 break-keep whitespace-normal hover:text-brand-deep hover:underline cursor-pointer"
                        title="상세 정보"
                      >
                        {r.product_name}
                      </button>
                    </td>
                    {/* 전산·ERP 합침 셀 · 구역/수량 */}
                    <td className={tableTdCls("num", "bg-amber-50/30")}>
                      <span className="inline-flex items-baseline gap-0.5">
                        {r.spec && <span className="text-[15px] font-semibold text-amber-500 tabular-nums">{r.spec}</span>}
                        {r.spec && <span className="text-[15px] text-zinc-300 font-normal">/</span>}
                        <span className={`font-bold tabular-nums text-[15px] ${r.erp != null && r.erp > 0 ? "text-amber-700" : "text-zinc-300"}`}>{r.erp ?? "-"}</span>
                      </span>
                    </td>
                    <td className={tableTdCls("num", "bg-violet-50/30")}>{renderQtyZone(r, "s1")}</td>
                    <td className={tableTdCls("num", "bg-violet-50/30")}>{renderQtyZone(r, "s2")}</td>
                    <td className={tableTdCls("num", "bg-violet-50/30")}>{renderQtyZone(r, "s3")}</td>
                    <td className={tableTdCls("num", "bg-cyan-50/30")}>{renderQtyZone(r, "w1")}</td>
                    <td className={tableTdCls("num", "bg-cyan-50/30")}>{renderQtyZone(r, "w2")}</td>
                    <td className={tableTdCls("num", `tabular-nums font-extrabold ${r.total > 0 ? "text-brand-deep" : "text-zinc-300"} bg-brand-tint/20`)}>
                      {r.total > 0 ? r.total : "-"}
                    </td>
                    <td className={tableTdCls("num", `tabular-nums font-bold ${r.diff > 0 ? "text-rose-600" : r.diff < 0 ? "text-emerald-600" : "text-zinc-300"} bg-rose-50/20`)}>
                      {r.diff !== 0 ? (r.diff > 0 ? `+${r.diff}` : String(r.diff)) : "0"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableListWrap>
        )}
      </div>
    </div>
  );
};

// 상세 모달 · Field 헬퍼 · 라벨/값 정렬
const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">{label}</span>
    <span className="text-[15px] text-ink break-keep">{value}</span>
  </div>
);

export default RealStockTablePage;
