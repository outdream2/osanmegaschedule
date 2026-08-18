// src/components/common/VendorSearchModal.tsx
// 2026-08-09 · 사용자 요청 · 공급사 검색 후 조회수정 or 신규등록 진입 모달
//
// 흐름:
//   1. 모달 열림 · 검색창 · 공급사 리스트 (useVendors 캐시)
//   2. 검색어 입력 · 필터링된 결과 리스트업
//   3. 결과 선택 → 검색창 옆에 [조회수정] 버튼 · 클릭 시 VendorDetailModal (공통) 오픈
//   4. 검색 결과 없음 · 검색어 있으면 → [신규등록] 버튼 · 클릭 시 NewVendorModal 오픈
//
// 사용처:
//   - LandingPage 거래처용 공급사등록 카드 클릭
//   - (향후) 다른 진입점 재사용 가능
//
// 공통 관리: VendorDetailModal (매입이력 > 공급사조회 > 조회수정 버튼과 동일 모달)
//   · src/components/LandingPage/VendorListEditor.tsx 에 export 됨 · 그대로 재사용

import { useMemo, useState } from "react";
import { X, Search, Loader2, Building2, Plus, PencilLine } from "lucide-react";
import { useVendors } from "../../hooks/useVendors";
import { NewVendorModal } from "./NewVendorModal";
import { VendorDetailModal, type Vendor as VendorFull } from "../LandingPage/VendorListEditor";

interface VendorSearchModalProps {
  onClose: () => void;
}

export function VendorSearchModal({ onClose }: VendorSearchModalProps) {
  const { vendors: _raw, loading, refresh } = useVendors();
  const vendors = _raw as unknown as VendorFull[];
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [openDetailId, setOpenDetailId] = useState<number | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return vendors.slice(0, 50); // 검색어 없으면 상위 50
    return vendors.filter(v =>
      (v.company_name ?? "").toLowerCase().includes(q)
      || (v.business_number ?? "").toLowerCase().includes(q)
      || (v.contact_name ?? "").toLowerCase().includes(q)
    ).slice(0, 100);
  }, [vendors, q]);

  const selected = useMemo(() => vendors.find(v => v.id === selectedId) ?? null, [vendors, selectedId]);
  const detailVendor = useMemo(() => vendors.find(v => v.id === openDetailId) ?? null, [vendors, openDetailId]);

  // 검색어 있고 · 결과 0건 → 신규등록 버튼 노출
  const showNewButton = q.length > 0 && filtered.length === 0;
  // 선택된 vendor 있으면 · 조회수정 버튼 노출
  const showEditButton = selected != null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      // 2026-08-17 v2 · frosted backdrop + 3-layer shadow · Modal 통일
      className="fixed inset-0 z-[9998] flex items-center justify-center p-3"
      style={{ background: "rgba(10, 46, 74, 0.35)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] bg-white rounded-2xl border border-line overflow-hidden flex flex-col"
        style={{ boxShadow: "0 1px 3px rgba(10,46,74,0.12), 0 8px 32px -8px rgba(10,46,74,0.24), 0 24px 64px -24px rgba(10,46,74,0.28)" }}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 bg-sky-50/60 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
            <Building2 size={15} className="text-sky-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold text-sky-600 uppercase tracking-wider">공급사</div>
            <div className="text-[14px] font-bold text-zinc-800">공급사 검색·등록</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
            aria-label="닫기"
            title="닫기"
          >
            <X size={16} />
          </button>
        </div>

        {/* 검색 + 액션 버튼 */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-2 shrink-0">
          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelectedId(null); }}
              placeholder="공급사명·사업자번호·담당자 검색"
              className="w-full h-9 pl-8 pr-3 text-[13px] border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition"
            />
          </div>
          {/* 결과 있고 선택됨 · 조회수정 */}
          {showEditButton && (
            <button
              type="button"
              onClick={() => setOpenDetailId(selectedId)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[12px] font-bold shadow-sm transition cursor-pointer whitespace-nowrap"
              title="선택된 공급사 조회·수정"
            >
              <PencilLine size={12} strokeWidth={2.5} />
              조회수정
            </button>
          )}
          {/* 검색어 있고 결과 없음 · 신규등록 */}
          {showNewButton && (
            <button
              type="button"
              onClick={() => setOpenNew(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[12px] font-bold shadow-sm transition cursor-pointer whitespace-nowrap"
              title="신규 공급사 등록"
            >
              <Plus size={12} strokeWidth={2.5} />
              신규등록
            </button>
          )}
        </div>

        {/* 결과 리스트 */}
        <div className="flex-1 overflow-y-auto px-4 pb-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-zinc-400 text-[12px]">
              <Loader2 size={13} className="animate-spin" />불러오는 중...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center">
              {q.length === 0 ? (
                <div className="text-[12px] text-zinc-400">검색어를 입력하세요</div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="text-[12px] text-zinc-500 font-semibold">
                    "{query}" · 검색 결과 없음
                  </div>
                  <div className="text-[11px] text-zinc-400">우측 상단 [신규등록] 버튼으로 등록</div>
                </div>
              )}
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 border border-line rounded-lg overflow-hidden">
              {filtered.map(v => {
                const active = v.id === selectedId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedId(prev => prev === v.id ? null : v.id)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition cursor-pointer ${
                      active
                        ? "bg-sky-50 border-l-2 border-sky-500"
                        : "hover:bg-zinc-50 border-l-2 border-transparent"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`text-[13px] font-bold truncate ${active ? "text-sky-800" : "text-zinc-800"}`}>
                        {v.company_name}
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">
                        {v.business_number || "-"} · {v.contact_name || "-"} · {v.phone || "-"}
                      </div>
                    </div>
                    {active && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 shrink-0">
                        선택됨
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 하단 안내 */}
        <div className="px-4 py-2 border-t border-zinc-100 bg-zinc-50/60 text-[10px] text-zinc-400 shrink-0 leading-snug">
          검색 후 결과 선택 → [조회수정] · 결과 없으면 → [신규등록]
        </div>
      </div>

      {/* 신규 등록 서브 모달 */}
      {openNew && (
        <NewVendorModal
          onClose={() => setOpenNew(false)}
          onSaved={() => { setOpenNew(false); refresh(); }}
        />
      )}

      {/* 조회수정 서브 모달 · 공통 · VendorDetailModal (매입이력 > 공급사조회 · 동일) */}
      {detailVendor && (
        <VendorDetailModal
          vendor={detailVendor}
          onClose={() => setOpenDetailId(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

export default VendorSearchModal;
