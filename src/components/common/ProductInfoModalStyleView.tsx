// src/components/common/ProductInfoModalStyleView.tsx
// 2026-09-23 · #345 후속 · 사용자 지시 · 상품정보 탭 · ProductCreateModal 배치와 동일한 조회 UI
//   · Section: 필수 정보 (상품코드·상품명·공급사·판매상태·판매가·매입가)
//   · Section: 분류·기타 (진열구역·상세위치·규격·단위·브랜드·제조사·메모)
//   · 수정 버튼 · ProductCreateModal 편집 모달 오픈 (onEditClick)
//   · 조회 전용 · 편집 없음
import React from "react";
import { Hash, Type, Building2, Tags, ShoppingCart, Coins, MapPin, Ruler, Layers, Award, Factory, Pencil } from "lucide-react";
import { Spinner } from "./Spinner";
import { StatusPill } from "./StatusPill";
import type { ProductDetail } from "../ProductInfoPage/ProductInfoPage";

const readCls = "text-[16px] font-medium text-ink";
const emptyCls = "text-[15px] text-zinc-300";

const Row: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({ icon, label, value }) => (
  <div className="flex flex-col gap-1 py-2.5 border-b border-zinc-100 last:border-b-0">
    <div className="flex items-center gap-1.5 text-[12px] font-semibold text-zinc-500 uppercase tracking-wider">
      <span className="text-brand-deep">{icon}</span>
      {label}
    </div>
    <div>{value}</div>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="rounded-2xl bg-white border border-line shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)] px-5 py-4">
    <div className="flex items-center gap-2 mb-3.5 pb-2.5 border-b border-line/70">
      <span className="inline-block w-[3px] h-5 rounded-sm bg-gradient-to-b from-brand-soft to-brand-deep" />
      <h3 className="text-[17px] font-bold text-ink tracking-tight">{title}</h3>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">{children}</div>
  </section>
);

const FullRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="md:col-span-2">{children}</div>
);

interface Props {
  product: ProductDetail | null;
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  onEditClick: () => void;
}

export const ProductInfoModalStyleView: React.FC<Props> = ({ product, loading, error, canEdit, onEditClick }) => {
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
        {canEdit && (
          <button
            type="button"
            onClick={onEditClick}
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[15px] font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] cursor-pointer shadow-sm transition"
            title="상품정보 수정 · 편집 모달 오픈"
          >
            <Pencil size={14} strokeWidth={2.4} />
            수정
          </button>
        )}
      </div>

      {/* Section 1 · 필수 정보 */}
      <Section title="필수 정보">
        <Row icon={<Hash size={13} strokeWidth={2.4} />} label="상품코드" value={fmt(p.product_code)} />
        <Row icon={<Type size={13} strokeWidth={2.4} />} label="상품명" value={fmt(p.product_name)} />
        <Row icon={<Building2 size={13} strokeWidth={2.4} />} label="공급사" value={fmt(p.supplier)} />
        <Row icon={<Tags size={13} strokeWidth={2.4} />} label="판매 상태" value={saleStatus ? <StatusPill tone={saleTone} size="sm">{saleStatus}</StatusPill> : <span className={emptyCls}>-</span>} />
        <Row icon={<ShoppingCart size={13} strokeWidth={2.4} />} label="판매가" value={fmt(p.sale_price, "원")} />
        <Row icon={<Coins size={13} strokeWidth={2.4} />} label="매입가" value={fmt(p.purchase_price, "원")} />
      </Section>

      {/* Section 2 · 분류 · 기타 */}
      <Section title="분류 · 기타">
        <FullRow>
          <Row icon={<MapPin size={13} strokeWidth={2.4} />} label="진열구역" value={fmt(p.location ?? p.display_location)} />
        </FullRow>
        {shelfEntries.length > 0 && (
          <FullRow>
            <div className="flex flex-col gap-1 py-2.5 border-b border-zinc-100">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-zinc-500 uppercase tracking-wider">
                <span className="text-brand-deep"><MapPin size={13} strokeWidth={2.4} /></span>
                상세 위치
              </div>
              <div className="flex flex-wrap gap-2">
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
        <Row icon={<Ruler size={13} strokeWidth={2.4} />} label="규격" value={fmt(p.spec)} />
        <Row icon={<Layers size={13} strokeWidth={2.4} />} label="단위" value={fmt(p.unit)} />
        <Row icon={<Award size={13} strokeWidth={2.4} />} label="브랜드" value={fmt(p.brand)} />
        <Row icon={<Factory size={13} strokeWidth={2.4} />} label="제조사" value={fmt(p.manufacturer)} />
        <FullRow>
          <Row icon={<Tags size={13} strokeWidth={2.4} />} label="메모" value={fmt(p.category)} />
        </FullRow>
      </Section>
    </div>
  );
};

export default ProductInfoModalStyleView;
