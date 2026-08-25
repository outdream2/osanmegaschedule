// src/components/OrderManagePage/PaymentInputPage.tsx
// 2026-08-25 · #111 · 결제입력 페이지 재구성 (사용자 지시 · Option B · 신규 파일)
//   · 상단 · 검색(공급사) + 필터(분류) + [확인] 버튼
//   · 확인 전 · 하단 전체 · 설명 화면 (안내)
//   · 확인 후 · 하단 좌 (결제 정보) + 우 (발주내역·판매내역·차트)
//   · 프레임워크 · Card · SplitPanel · SplitRightTabs · CategoryChips · EmptyState · Spinner · useVendors · api · useToast
//   · 기존 PaymentInfoTab.tsx 는 · '공급사별결제내역' 탭 그대로 보존 (회귀 X)
//
// 향후 확장 (spec 재확인 후):
//   - 좌 · 결제 요약·잔고·결제 등록·최근 결제 (PaymentInfoTab 로직 이관/재사용)
//   - 우 · 발주내역 월별 bar · 판매내역 월별 line · KPI 카드
//   - recharts 이미 사용중 (stat 페이지)

import React, { useMemo, useState } from "react";
import { Wallet, Building2, Check, ClipboardList, LineChart, PieChart, CircleCheck, Package } from "lucide-react";
import { useVendors } from "../../hooks/useVendors";
import { useReferenceValues } from "../../hooks/useReferenceValues";
import { Card } from "../common/Card";
import { StatusPill } from "../common/StatusPill";
import { EmptyState } from "../common/EmptyState";
import { IconTile } from "../common/IconTile";
import { SplitPanel } from "../common/SplitPanel";
import { SplitRightTabs } from "../common/SplitRightTabs";
import { CategoryChips, type ChipTone } from "../common/CategoryChips";
import { useToast, toastClass } from "../../hooks/useToast";
import { VendorInfoHeader } from "../common/VendorInfoHeader";

type RightTab = "orders" | "sales";

export const PaymentInputPage: React.FC = () => {
  const { vendors, loading } = useVendors();
  const { vendorCategories: dbVendorCategories } = useReferenceValues();
  const { toast, showError } = useToast();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("전체");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("orders");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vendors.filter(v => {
      if (q && !String(v.company_name ?? "").toLowerCase().includes(q)) return false;
      if (category !== "전체" && String(v.category ?? "") !== category) return false;
      return true;
    }).slice(0, 20);
  }, [vendors, query, category]);

  const selected = useMemo(() => vendors.find(v => v.id === selectedId) ?? null, [vendors, selectedId]);

  const handleConfirm = () => {
    if (!query.trim()) {
      showError("공급사명을 입력하세요");
      return;
    }
    // 정확 일치 · 부분 일치 first-hit
    const exact = vendors.find(v => String(v.company_name ?? "").trim() === query.trim());
    const first = exact ?? filtered[0];
    if (!first) {
      showError("일치하는 공급사가 없습니다");
      return;
    }
    setSelectedId(first.id);
    setDropdownOpen(false);
  };

  const chipOptions = useMemo(() => (
    (["전체", ...dbVendorCategories] as string[]).map(cat => ({
      value: cat, label: cat,
      tone: (cat === "전체"   ? "zinc"
           : cat === "위탁"   ? "violet"
           : cat === "선결제" ? "rose"
           : cat === "60회전" ? "emerald"
           : cat === "90회전" ? "teal"
           :                    "zinc") as ChipTone,
    }))
  ), [dbVendorCategories]);

  // 확인 전 · 설명 화면
  const introScreen = (
    <div className="flex-1 min-h-0 flex items-center justify-center p-6">
      <Card padding="lg" topAccent clip className="w-full max-w-3xl">
        <div className="flex items-center gap-2.5 mb-4">
          <IconTile icon={<Wallet size={16} />} tone="amber" size="md" />
          <div>
            <div className="text-[17px] font-bold text-ink tracking-tight">결제입력</div>
            <div className="text-[13px] text-ink-soft">공급사 검색 후 [확인] 을 누르면 아래 정보가 표시됩니다</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* 왼쪽 · 결제 정보 안내 */}
          <div className="rounded-xl border border-line bg-zinc-50/60 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
                <Building2 size={16} className="text-sky-600" />
              </div>
              <div className="text-[15px] font-bold text-ink">좌측 · 결제 정보</div>
            </div>
            <ul className="text-[13px] text-ink-soft leading-relaxed pl-1 space-y-1">
              <li>· 공급사 정보 (담당자·연락처·카테고리)</li>
              <li>· 미결제 매입 · 잔고 요약</li>
              <li>· 결제 등록 (방식·금액·참조번호)</li>
              <li>· 최근 결제 이력</li>
            </ul>
          </div>

          {/* 오른쪽 · 발주내역·판매내역 안내 */}
          <div className="rounded-xl border border-line bg-zinc-50/60 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <LineChart size={16} className="text-emerald-600" />
              </div>
              <div className="text-[15px] font-bold text-ink">우측 · 발주·판매내역</div>
            </div>
            <ul className="text-[13px] text-ink-soft leading-relaxed pl-1 space-y-1">
              <li>· 발주내역 · 월별 매입액 · 발주 이력</li>
              <li>· 판매내역 · 월별 판매량·금액</li>
              <li>· 차트 · 매입 vs 결제 · 판매 추이</li>
              <li>· KPI · 총 매입·결제·잔고</li>
            </ul>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-[12px] text-ink-soft/70">
          <CircleCheck size={13} className="text-emerald-500" />
          <span>공급사 검색 후 · 상단 [확인] 버튼을 클릭하세요</span>
        </div>
      </Card>
    </div>
  );

  // 확인 후 · 좌 결제 정보 (기존 VendorInfoHeader 재사용) + 우 발주·판매 (placeholder)
  const leftPane = selected ? (
    <div className="flex flex-col gap-3 h-full overflow-auto">
      <VendorInfoHeader vendor={selected as any} />
      <Card padding="md" topAccent>
        <div className="flex items-center gap-2 mb-2">
          <IconTile icon={<Wallet size={14} />} tone="amber" size="sm" />
          <div className="text-[15px] font-bold text-ink">결제 요약</div>
        </div>
        <div className="text-[13px] text-ink-soft">
          미결제·잔고·결제 등록·최근 결제 이력이 여기에 노출됩니다.
          <br />
          <span className="text-[12px] text-zinc-400">(기존 PaymentInfoTab 로직 이관 예정 · 대형 리팩터)</span>
        </div>
      </Card>
    </div>
  ) : null;

  const rightPane = selected ? (
    <div className="flex flex-col gap-3 h-full overflow-auto">
      <SplitRightTabs
        tabs={[
          { key: "orders", label: "발주내역" },
          { key: "sales",  label: "판매내역 (월별)" },
        ]}
        active={rightTab}
        onSelect={(k) => setRightTab(k as RightTab)}
      />
      <Card padding="md" topAccent>
        {rightTab === "orders" ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <IconTile icon={<ClipboardList size={14} />} tone="brand" size="sm" />
              <div className="text-[15px] font-bold text-ink">발주내역 · 월별</div>
            </div>
            <EmptyState
              icon={PieChart}
              title="차트·리스트 준비 중"
              hint={`${selected.company_name} · 최근 12개월 발주 데이터 로딩 예정 (order-history API + recharts)`}
              size="normal"
            />
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <IconTile icon={<Package size={14} />} tone="emerald" size="sm" />
              <div className="text-[15px] font-bold text-ink">판매내역 · 월별</div>
            </div>
            <EmptyState
              icon={LineChart}
              title="차트·리스트 준비 중"
              hint={`${selected.company_name} · 이 공급사 상품 월별 판매량·금액 (top-sales API + recharts line/area)`}
              size="normal"
            />
          </>
        )}
      </Card>
    </div>
  ) : null;

  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
      <div className="flex flex-col gap-3 h-full min-h-0">
        {/* 상단 · 검색 + 필터 + 확인 */}
        <Card padding="md" topAccent clip>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <IconTile icon={<Wallet size={15} />} tone="amber" size="md" />
              <div className="min-w-0">
                <div className="text-[16px] font-bold text-ink leading-tight tracking-tight">결제입력</div>
                <div className="text-[12px] text-ink-soft leading-tight mt-0.5">공급사 검색 → 확인 → 결제 정보 · 발주·판매내역 조회</div>
              </div>
              {selected && (
                <StatusPill tone="emerald" size="sm" dot>선택 · {selected.company_name}</StatusPill>
              )}
              {selected && (
                <button
                  type="button"
                  onClick={() => { setSelectedId(null); setQuery(""); setDropdownOpen(false); }}
                  className="ml-auto inline-flex items-center h-8 px-3 rounded-lg bg-white border border-line text-[13px] font-bold text-ink-soft hover:border-brand-deep/40 hover:text-brand-deep transition cursor-pointer"
                  title="다른 공급사 검색"
                >
                  초기화
                </button>
              )}
            </div>

            {/* 검색 · 필터 · 확인 */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* 검색 (자동완성 dropdown) */}
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Building2 size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }}
                  onFocus={() => setDropdownOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); handleConfirm(); }
                    if (e.key === "Escape") setDropdownOpen(false);
                  }}
                  placeholder="공급사명 검색 · Enter 로 [확인]"
                  className="w-full h-9 pl-8 pr-3 rounded-lg border border-line bg-white text-[14px] text-ink placeholder:text-zinc-400 focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
                />
                {dropdownOpen && query.trim() && filtered.length > 0 && (
                  <Card padding="none" rounded="lg" className="absolute left-0 right-0 top-full mt-1 z-20 shadow-lg max-h-56 overflow-y-auto">
                    {filtered.map(v => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => { setSelectedId(v.id); setQuery(String(v.company_name ?? "")); setDropdownOpen(false); }}
                        className="w-full text-left px-3 py-2 text-[13px] font-medium text-ink hover:bg-brand-tint/30 flex items-center gap-2 transition-colors border-b border-line/50 last:border-b-0"
                      >
                        <span className="truncate flex-1">{v.company_name}</span>
                        {v.category && <span className="ml-auto text-[11px] text-ink-soft shrink-0">{v.category}</span>}
                      </button>
                    ))}
                  </Card>
                )}
              </div>
              {/* 필터 chip */}
              <CategoryChips
                value={category}
                onChange={(v) => setCategory(String(v))}
                options={chipOptions}
                size="sm"
                ariaLabel="공급사 분류 필터"
              />
              {/* 확인 */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading || !query.trim()}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-gradient-to-br from-brand-deep to-[#0d3a5c] text-white text-[14px] font-bold shadow-sm ring-1 ring-brand-deep/30 hover:from-[#0d3a5c] hover:to-[#08253a] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                title="선택한 공급사의 결제 정보·발주·판매내역 조회"
              >
                <Check size={14} strokeWidth={2.5} /> 확인
              </button>
            </div>
          </div>
        </Card>

        {/* 하단 · 확인 전 (설명) · 확인 후 (SplitPanel) */}
        {selected ? (
          <SplitPanel
            storageKey="paymentInput.leftWidth"
            defaultWidth={typeof window !== "undefined" ? Math.max(360, Math.min(560, Math.floor(window.innerWidth * 0.36))) : 420}
            minWidth={280}
            maxWidth={800}
            dividerColor="amber"
            left={leftPane}
            right={rightPane}
            wrapLeft={false}
            wrapRight={false}
            mobileRightAsModal
            mobileModalTitle={selected.company_name ?? "발주·판매내역"}
            mobileOpen={rightTab != null}
            onMobileClose={() => setRightTab("orders")}
            className="flex-1 min-h-0"
          />
        ) : (
          introScreen
        )}
      </div>
    </>
  );
};

export default PaymentInputPage;
