// src/components/common/ProductInfoModalStyleView.tsx
// 2026-09-23 · #345 후속 · 사용자 지시 · 상품정보 탭 · ProductCreateModal 배치와 동일한 조회 UI
// 2026-10-06 · 사용자 지시 · 진열구역/상세위치 → 필수 정보 섹션으로 이동 + 컬러 포인트 디자인
//   · Section: 필수 정보 (상품코드·상품명·공급사·판매상태·판매가·매입가·진열구역·상세위치)
//   · Section: 분류·기타 (규격·단위·브랜드·제조사·메모)
//   · 수정 버튼 · ProductCreateModal 편집 모달 오픈 (onEditClick)
//   · 조회 전용 · 편집 없음
import React from "react";
import { Hash, Type, Building2, Tags, ShoppingCart, Coins, MapPin, Ruler, Layers, Award, Factory, Pencil, Boxes } from "lucide-react";
import { Spinner } from "./Spinner";
import { StatusPill } from "./StatusPill";
import type { ProductDetail } from "../ProductInfoPage/ProductInfoPage";

const readCls = "text-[17px] font-medium text-ink";
const emptyCls = "text-[15px] text-zinc-300";

// 2026-10-06 · 섹션별 액센트 톤 (사용자 지시 · 컬러포인트)
//   · brand = 필수 정보 (파랑 · 핵심)
//   · mint  = 분류·기타 (청록 · 보조)
type Accent = "brand" | "mint";
const accentCls: Record<Accent, { bar: string; iconBg: string; iconColor: string; titleHint: string }> = {
  brand: {
    bar: "bg-gradient-to-b from-sky-400 via-brand-soft to-brand-deep",
    iconBg: "bg-brand-tint/70 ring-1 ring-brand-deep/15",
    iconColor: "text-brand-deep",
    titleHint: "text-brand-deep/70",
  },
  mint: {
    bar: "bg-gradient-to-b from-emerald-300 via-teal-400 to-teal-600",
    iconBg: "bg-emerald-50 ring-1 ring-emerald-500/15",
    iconColor: "text-emerald-700",
    titleHint: "text-emerald-700/70",
  },
};

const Row: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; accent?: Accent }> = ({ icon, label, value, accent = "brand" }) => {
  const a = accentCls[accent];
  return (
    <div className="flex flex-col gap-1 py-2.5 border-b border-zinc-100 last:border-b-0">
      <div className="flex items-center gap-2 text-[15px] font-semibold text-zinc-500 uppercase tracking-wider">
        <span className={`inline-flex items-center justify-center w-[22px] h-[22px] rounded-md ${a.iconBg} ${a.iconColor}`}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="pl-[30px]">{value}</div>
    </div>
  );
};

const Section: React.FC<{ title: string; hint?: string; accent?: Accent; children: React.ReactNode }> = ({ title, hint, accent = "brand", children }) => {
  const a = accentCls[accent];
  return (
    <section className="rounded-2xl bg-white border border-line shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)] px-5 py-4 overflow-hidden">
      <div className="flex items-center gap-2.5 mb-3.5 pb-2.5 border-b border-line/70">
        <span className={`inline-block w-[4px] h-6 rounded-sm ${a.bar}`} />
        <h3 className="text-[17px] font-bold text-ink tracking-tight">{title}</h3>
        {hint && <span className={`text-[12px] font-semibold ${a.titleHint}`}>{hint}</span>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">{children}</div>
    </section>
  );
};

const FullRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="md:col-span-2">{children}</div>
);

interface Props {
  product: ProductDetail | null;
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  onEditClick: () => void;
  // 2026-10-05 · 사용자 지시 · 실재고 확인창 (InventoryEditModal) 오픈 콜백
  onInventoryClick?: () => void;
}

export const ProductInfoModalStyleView: React.FC<Props> = ({ product, loading, error, canEdit, onEditClick, onInventoryClick }) => {
  if (loading) return <div className="flex items-center justify-center py-16"><Spinner size={22} tone="brand" label="불러오는 중..." /></div>;
  if (error) return <div className="p-4 text-[14px] text-rose-700 font-medium bg-rose-50 rounded-lg border border-rose-200">{error}</div>;
  if (!product) return <div className="p-6 text-center text-[15px] text-zinc-400 font-medium">상품을 선택하세요</div>;

  const p = product as any;
  const fmt = (v: unknown, unit?: string): React.ReactNode => {
    if (v == null || v === "") return <span className={emptyCls}>-</span>;
    return <span className={readCls + " tabular-nums"}>{typeof v === "number" ? v.toLocaleString() : String(v)}{unit ? <span className="text-[13px] text-zinc-500 ml-0.5">{unit}</span> : null}</span>;
  };
  const saleStatus = String(p.sale_status ?? "");
  const saleTone = saleStatus === "판매중" ? "emerald" : saleStatus === "판매중지" ? "rose" : "zinc";

  const shelf = (p.shelf_positions ?? {}) as Record<string, string | null>;
  const shelfEntries = Object.entries(shelf).filter(([, v]) => v);

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* 헤더 · 상품명 hero + 수정 버튼 */}
      <div className="flex items-start justify-between gap-3 rounded-2xl bg-white border border-line px-5 py-4 shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]">
        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] font-extrabold text-ink leading-tight tracking-tight break-keep">
            {p.product_name || <span className="text-zinc-300 font-normal">(이름없음)</span>}
          </h2>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-[13px] font-mono text-zinc-500 bg-zinc-100 rounded-md px-2 py-0.5 tabular-nums">{p.product_code}</span>
            {saleStatus && <StatusPill tone={saleTone} size="sm">{saleStatus}</StatusPill>}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {onInventoryClick && (
            <button
              type="button"
              onClick={onInventoryClick}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[15px] font-bold text-brand-deep bg-brand-tint/40 hover:bg-brand-tint/70 border border-brand-deep/15 cursor-pointer transition"
              title="실재고 확인 · 창고/매장별 재고 조회 및 편집"
            >
              <Boxes size={14} strokeWidth={2.4} />
              재고 확인
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={onEditClick}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[15px] font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] cursor-pointer shadow-sm transition"
              title="상품정보 수정 · 편집 모달 오픈"
            >
              <Pencil size={14} strokeWidth={2.4} />
              수정
            </button>
          )}
        </div>
      </div>

      {/* Section 1 · 필수 정보 · brand accent · 2026-10-06 · 진열구역/상세위치 이동 */}
      <Section title="필수 정보" hint="필수" accent="brand">
        <Row accent="brand" icon={<Hash size={13} strokeWidth={2.4} />} label="상품코드" value={fmt(p.product_code)} />
        <Row accent="brand" icon={<Type size={13} strokeWidth={2.4} />} label="상품명" value={fmt(p.product_name)} />
        <Row accent="brand" icon={<Building2 size={13} strokeWidth={2.4} />} label="공급사" value={fmt(p.supplier)} />
        <Row accent="brand" icon={<Tags size={13} strokeWidth={2.4} />} label="판매 상태" value={saleStatus ? <StatusPill tone={saleTone} size="sm">{saleStatus}</StatusPill> : <span className={emptyCls}>-</span>} />
        <Row accent="brand" icon={<ShoppingCart size={13} strokeWidth={2.4} />} label="판매가" value={fmt(p.sale_price, "원")} />
        <Row accent="brand" icon={<Coins size={13} strokeWidth={2.4} />} label="매입가" value={fmt(p.purchase_price, "원")} />
        {/* 2026-10-06 · 진열구역 · 필수 정보로 이동 (사용자 지시) · 2026-10-05 · 왼쪽 목록과 동일 소스 (p.location) */}
        <FullRow>
          <Row accent="brand" icon={<MapPin size={13} strokeWidth={2.4} />} label="진열구역" value={fmt(p.location)} />
        </FullRow>
        {shelfEntries.length > 0 && (
          <FullRow>
            <div className="flex flex-col gap-1 py-2.5 border-b border-zinc-100 last:border-b-0">
              <div className="flex items-center gap-2 text-[15px] font-semibold text-zinc-500 uppercase tracking-wider">
                <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-md bg-brand-tint/70 ring-1 ring-brand-deep/15 text-brand-deep">
                  <MapPin size={13} strokeWidth={2.4} />
                </span>
                상세 위치
              </div>
              <div className="pl-[30px] flex flex-wrap gap-2">
                {shelfEntries.map(([code, val]) => (
                  <span key={code} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-brand-tint/60 border border-brand-deep/20 text-[14px] font-semibold text-brand-deep tabular-nums">
                    <span className="text-[11px] font-bold text-brand-deep/70">{code}</span>
                    {val}
                  </span>
                ))}
              </div>
            </div>
          </FullRow>
        )}
      </Section>

      {/* Section 2 · 분류 · 기타 · mint accent · 2026-10-06 · 진열구역 제거 */}
      <Section title="분류 · 기타" hint="보조" accent="mint">
        <Row accent="mint" icon={<Ruler size={13} strokeWidth={2.4} />} label="규격" value={fmt(p.spec)} />
        <Row accent="mint" icon={<Layers size={13} strokeWidth={2.4} />} label="단위" value={fmt(p.unit)} />
        <Row accent="mint" icon={<Award size={13} strokeWidth={2.4} />} label="브랜드" value={fmt(p.brand)} />
        <Row accent="mint" icon={<Factory size={13} strokeWidth={2.4} />} label="제조사" value={fmt(p.manufacturer)} />
        <FullRow>
          <Row accent="mint" icon={<Tags size={13} strokeWidth={2.4} />} label="메모" value={fmt(p.memo)} />
        </FullRow>
      </Section>
    </div>
  );
};

export default ProductInfoModalStyleView;
