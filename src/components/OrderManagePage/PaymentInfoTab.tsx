// src/components/OrderManagePage/PaymentInfoTab.tsx
// 결제 탭 > 결제정보 서브탭 · 공급사별 결제 KPI + 원장
// 2026-08-03 UI 통일 재설계 — 좌측 공급사 리스트 + 우측 VendorDetailTabs (헤더+2탭)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Loader2, Package } from "lucide-react";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { VendorDetailTabs } from "./VendorDetailTabs";
import type { VendorBasic } from "./VendorInfoHeader";

// ─── Types ───────────────────────────────────────────────────────────────────

interface VendorItem {
  id: number;
  company_name: string;
  category: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  business_number?: string | null;
  created_at?: string | null;
  payment_terms?: string | null;
  active?: boolean | null;
}

// ─── PaymentInfoTab ───────────────────────────────────────────────────────────

export const PaymentInfoTab: React.FC = () => {
  // 공급사 목록
  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState<"전체" | "위탁" | "선결제" | "60일회전" | "90일회전" | "기타">("전체");

  // 선택 공급사
  const [selectedVendor, setSelectedVendor] = useState<VendorItem | null>(null);

  // 공급사 목록 로드
  const loadVendors = useCallback(async () => {
    setVendorsLoading(true);
    try {
      const res = await fetch("/api/vendors?withBalances=1");
      if (!res.ok) throw new Error(String(res.status));
      const list: any[] = await res.json();
      setVendors(list.map(v => ({
        id: v.id,
        company_name: String(v.company_name ?? ""),
        category: v.category ?? null,
        contact_name: v.contact_name ?? null,
        phone: v.phone ?? null,
        email: v.email ?? null,
        business_number: v.business_number ?? null,
        created_at: v.created_at ?? null,
        payment_terms: v.payment_terms ?? null,
        active: v.active ?? null,
      })));
    } catch { setVendors([]); }
    finally { setVendorsLoading(false); }
  }, []);

  useEffect(() => {
    loadVendors();
    window.addEventListener("vendors-changed", loadVendors);
    return () => window.removeEventListener("vendors-changed", loadVendors);
  }, [loadVendors]);

  // 공급사 변경 시 선택 초기화
  useEffect(() => {
    if (!selectedVendor) return;
    // 목록 갱신 후 선택 동기화 (company_name 기준)
    const found = vendors.find(v => v.id === selectedVendor.id);
    if (found) setSelectedVendor(found);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendors]);

  // 필터링된 공급사
  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    return vendors.filter(v => {
      if (q && !v.company_name.toLowerCase().includes(q)) return false;
      if (vendorCategoryFilter !== "전체" && v.category !== vendorCategoryFilter) return false;
      return true;
    });
  }, [vendors, vendorSearch, vendorCategoryFilter]);

  // VendorBasic 캐스팅 (VendorDetailTabs prop 타입 맞춤)
  const vendorForDetail: VendorBasic | null = selectedVendor
    ? {
        id: selectedVendor.id,
        company_name: selectedVendor.company_name,
        category: selectedVendor.category,
        contact_name: selectedVendor.contact_name,
        phone: selectedVendor.phone,
        email: selectedVendor.email,
        business_number: selectedVendor.business_number,
        created_at: selectedVendor.created_at,
        payment_terms: selectedVendor.payment_terms,
        active: selectedVendor.active,
      }
    : null;

  const CATEGORY_COLORS: Record<string, string> = {
    "위탁":     "bg-violet-500 text-white",
    "선결제":   "bg-rose-500 text-white",
    "60일회전": "bg-emerald-500 text-white",
    "90일회전": "bg-teal-500 text-white",
    "기타":     "bg-slate-500 text-white",
    "전체":     "bg-slate-700 text-white",
  };

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">

      {/* 좌우 분할 */}
      <div className="flex flex-col lg:flex-row gap-2 flex-1 min-h-0">

        {/* 좌측: 공급사 리스트 */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-2">
          {/* 검색 + 카테고리 필터 */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2.5 flex flex-col gap-2">
            <input
              type="text"
              value={vendorSearch}
              onChange={e => setVendorSearch(e.target.value)}
              placeholder="공급사명 검색"
              className="w-full h-7 px-2.5 text-[11px] border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-sky-400 focus:border-sky-400 transition"
            />
            <div className="flex flex-wrap gap-0.5">
              {(["전체", "위탁", "선결제", "60일회전", "90일회전", "기타"] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setVendorCategoryFilter(cat)}
                  className={`h-6 px-2 text-[10px] font-semibold rounded-lg transition cursor-pointer ${
                    vendorCategoryFilter === cat
                      ? CATEGORY_COLORS[cat]
                      : "bg-slate-50 text-slate-500 border border-slate-200 hover:text-slate-700"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* 공급사 목록 */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-y-auto flex-1 min-h-0 max-h-[72vh]">
            {vendorsLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-400 gap-2 text-[12px]">
                <Loader2 size={13} className="animate-spin" />불러오는 중...
              </div>
            ) : filteredVendors.length === 0 ? (
              <div className="py-10 text-center text-[11px] text-slate-300">공급사 없음</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredVendors.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVendor(prev => prev?.id === v.id ? null : v)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition cursor-pointer ${
                      selectedVendor?.id === v.id
                        ? "bg-sky-50 border-l-2 border-sky-500"
                        : "hover:bg-slate-50 border-l-2 border-transparent"
                    }`}
                  >
                    <VendorCategoryBadge category={v.category} />
                    <span className={`text-[12px] font-semibold break-words whitespace-normal leading-tight flex-1 ${
                      selectedVendor?.id === v.id ? "text-sky-800" : "text-slate-700"
                    }`}>
                      {v.company_name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 우측: 공급사 상세 (VendorDetailTabs — 헤더 + 결제잔고 + 매입이력) */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2 overflow-y-auto">
          {!vendorForDetail ? (
            <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
              <Building2 size={40} className="mb-3 opacity-30" />
              <div className="text-[12px] font-bold">좌측에서 공급사를 선택하세요</div>
              <div className="text-[11px] mt-1">결제정보 · 원장 · 매입이력이 표시됩니다</div>
            </div>
          ) : (
            <VendorDetailTabs vendor={vendorForDetail} />
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentInfoTab;
