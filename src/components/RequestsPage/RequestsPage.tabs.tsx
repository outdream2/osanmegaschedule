// 2026-08-22 · Framework Phase 4 · RequestsPage.tsx large-file 분리
// 3개 큰 탭 컴포넌트 (Display / Order / Inventory) · props-driven pure display
//   · 상태·핸들러는 부모(RequestsPage)에 유지 · props 로 전달
//   · Checkbox 공통 헬퍼는 이 파일에 통합
//   · toggleAll/toggleOne 등 헬퍼는 부모에서 넘김

import React, { useMemo, useState } from "react";
import {
  Bell, Package, CheckCircle, ShoppingCart,
  Square, CheckSquare, PaperPlaneTilt, Scroll, CaretDown, CaretUp,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import type { ProductInfo } from "../../lib/productsCache";
import { fmtDateMD } from "../../lib/format";
import { CARD_BASE } from "../../styles/tokens";
import { StatusPill, type PillTone } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import { EmptyState } from "../common/EmptyState";
import { ListToolbar } from "./ListToolbar";
import type { DisplayRequest, OrderRequest, InventoryCheck } from "./types";

const fmtDate = fmtDateMD;

// ─── 공통 Checkbox ─────────────────────────────────────────────
export const RequestCheckbox: React.FC<{ checked: boolean; onChange: () => void }> = ({ checked, onChange }) => (
  <button onClick={onChange} className="shrink-0 cursor-pointer text-zinc-300 hover:text-zinc-500 transition">
    {checked ? <CheckSquare size={16} weight="fill" className="text-brand-deep" /> : <Square size={16} />}
  </button>
);

// ═══════════════════════════════════════════════════════════════════════════
// 1) DisplayRequestTab · 진열요청 (#64 완전 재구성 · 2026-09-05)
//    검색(상품명·구역·담당자) · 상태 필터 칩 · 카드 리스트
// ═══════════════════════════════════════════════════════════════════════════

interface DisplayRequestTabProps {
  displayReqs: DisplayRequest[];
  displayLoading: boolean;
  selectedDisplay: Set<string>;
  setSelectedDisplay: React.Dispatch<React.SetStateAction<Set<string>>>;
  completingDisplay: Set<string>;
  notifyToast: string | null;
  notifying: boolean;
  isManager: boolean;
  isAdminLevel8: boolean;
  canPrepare: boolean;
  canComplete: boolean;
  onToggleOne: (id: string) => void;
  onDeleteSelected: () => void;
  onDeleteAll: () => Promise<void> | void;
  onRefresh: () => void;
  onNotifyAll: () => void;
  onPrepareDisplay: (req: DisplayRequest) => void;
  onCompleteDisplay: (req: DisplayRequest) => void;
}

const getProductName = (r: DisplayRequest): string => {
  const pn = String((r as any).product_name ?? "").trim();
  if (pn) return pn;
  if (r.note) {
    const cleaned = r.note.replace(/\s*진열\s*요청\s*$/u, "").trim();
    if (cleaned) return cleaned;
  }
  return r.category || r.zone_label || "—";
};

const STATUS_CHIPS = [
  { key: "all"      as const, label: "전체" },
  { key: "pending"  as const, label: "대기" },
  { key: "prepared" as const, label: "준비완료" },
  { key: "done"     as const, label: "진열완료" },
];

export const DisplayRequestTab: React.FC<DisplayRequestTabProps> = ({
  displayReqs, displayLoading, selectedDisplay, setSelectedDisplay, completingDisplay,
  notifyToast, notifying, isManager, isAdminLevel8, canPrepare, canComplete,
  onToggleOne, onDeleteSelected, onDeleteAll, onRefresh,
  onNotifyAll, onPrepareDisplay, onCompleteDisplay,
}) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "prepared" | "done">("all");

  const filtered = displayReqs.filter(r => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const name = getProductName(r).toLowerCase();
      const zone = (r.zone_label || r.zone_id || "").toLowerCase();
      const staff = (r.assigned_staff_name || "").toLowerCase();
      if (!name.includes(q) && !zone.includes(q) && !staff.includes(q)) return false;
    }
    return true;
  });

  // 2026-09-08 · T-DISPLAY-1 · 상품별 그룹핑 · 상품당 1행 + 요청 횟수 뱃지
  //   · 그룹 키 · product_code 우선 → product_name → `${category}::${zone_id}` fallback
  //   · 대표 상태 · pending > prepared > done · 아직 진행 안 된 상태 우선 노출
  //   · 대표 요청 · 대표 상태의 첫 번째 요청 (액션은 대표 요청 대상 · 처리 후 다음 요청이 자동 승격)
  //   · 선택 · 그룹 전체 선택 시 그룹 내 모든 request id 추가 (삭제 등 bulk 자연스럽게 동작)
  const grouped = useMemo(() => {
    const map = new Map<string, DisplayRequest[]>();
    for (const r of filtered) {
      const key =
        (r.product_code && String(r.product_code).trim()) ||
        getProductName(r) ||
        `${r.category}::${r.zone_id}`;
      const list = map.get(key);
      if (list) list.push(r); else map.set(key, [r]);
    }
    const priority = (s: string): number => (s === "pending" ? 0 : s === "prepared" ? 1 : 2);
    const groups = Array.from(map.entries()).map(([key, list]) => {
      const sorted = [...list].sort((a, b) => {
        const p = priority(a.status) - priority(b.status);
        if (p !== 0) return p;
        // 같은 상태 · 최신 요청 우선 (requested_at desc)
        return String(b.requested_at ?? "").localeCompare(String(a.requested_at ?? ""));
      });
      return { key, all: list, rep: sorted[0], count: list.length };
    });
    // 그룹 정렬 · 대표 상태 우선순위 → 대표 요청 최신순
    groups.sort((a, b) => {
      const p = priority(a.rep.status) - priority(b.rep.status);
      if (p !== 0) return p;
      return String(b.rep.requested_at ?? "").localeCompare(String(a.rep.requested_at ?? ""));
    });
    return groups;
  }, [filtered]);

  const statusCounts = {
    all:      displayReqs.length,
    pending:  displayReqs.filter(r => r.status === "pending").length,
    prepared: displayReqs.filter(r => r.status === "prepared").length,
    done:     displayReqs.filter(r => r.status === "done").length,
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every(r => selectedDisplay.has(r.id));
  const handleToggleAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedDisplay(prev => { const s = new Set(prev); filtered.forEach(r => s.delete(r.id)); return s; });
    } else {
      setSelectedDisplay(prev => new Set([...prev, ...filtered.map(r => r.id)]));
    }
  };

  // 그룹 단위 선택 토글 · 그룹 내 모든 request id add/remove
  const handleToggleGroup = (all: DisplayRequest[]) => {
    const allSelected = all.every(r => selectedDisplay.has(r.id));
    setSelectedDisplay(prev => {
      const s = new Set(prev);
      if (allSelected) all.forEach(r => s.delete(r.id));
      else all.forEach(r => s.add(r.id));
      return s;
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {notifyToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-brand-deep text-white text-[14px] font-bold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 whitespace-nowrap">
          <Bell size={13} weight="fill" />{notifyToast}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <MagnifyingGlass size={15} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="상품명·구역·담당자 검색..."
          className="w-full pl-9 pr-4 h-9 text-[15px] bg-white border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-deep/20 focus:border-brand-deep transition"
        />
      </div>

      {/* Status filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {STATUS_CHIPS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-3 h-7 rounded-full text-[14px] font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              statusFilter === key
                ? "bg-brand-deep text-white shadow-sm"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
            }`}
          >
            {label}
            {statusCounts[key] > 0 && (
              <span className={`tabular-nums text-[15px] ${statusFilter === key ? "opacity-75" : "text-zinc-400"}`}>
                {statusCounts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {displayLoading && displayReqs.length > 0 && (
        <Card variant="flat" bg="bg-sky-50" borderColor="border-sky-200" rounded="md" padding="none" className="flex items-center justify-center py-1.5 mb-1">
          <Spinner tone="sky" size={11} label="새로 불러오는 중..." labelSize={14} />
        </Card>
      )}

      <ListToolbar
        total={filtered.length}
        selected={selectedDisplay.size}
        allChecked={allFilteredSelected}
        onToggleAll={handleToggleAllFiltered}
        onDeleteSelected={onDeleteSelected}
        onDeleteAll={onDeleteAll}
        onRefresh={onRefresh}
        loading={displayLoading}
        accentColor="text-blue-600"
        hideDeleteAll={!isManager}
        extraActions={
          isManager ? (
            <button
              onClick={onNotifyAll}
              disabled={notifying || statusCounts.pending === 0}
              className="flex items-center gap-1.5 text-[15px] font-semibold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] border border-brand px-2.5 h-6 rounded-md transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {notifying ? <Spinner size={11} tone="white" /> : <PaperPlaneTilt size={11} weight="fill" />}
              알림전송
            </button>
          ) : null
        }
      />

      {displayLoading && displayReqs.length === 0 ? (
        <div className="flex items-center justify-center py-8"><Spinner tone="zinc" size={14} label="로딩 중..." labelSize={12} /></div>
      ) : !displayLoading && displayReqs.length === 0 ? (
        <EmptyState title="진열 요청 없음" size="compact" />
      ) : filtered.length === 0 ? (
        <EmptyState title={search.trim() ? "검색 결과 없음" : "해당 상태 없음"} size="compact" />
      ) : (
        <div className={`${CARD_BASE} divide-y divide-zinc-50 ${displayLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
          {grouped.map(({ key, rep: r, all, count }) => {
            const isDone     = r.status === "done";
            const isPrepared = r.status === "prepared";
            const isPending  = !isDone && !isPrepared;
            const completing = completingDisplay.has(r.id);
            const productName = getProductName(r);
            const statusTone: PillTone = isDone ? "emerald" : isPrepared ? "sky" : "amber";
            const statusLabel = isDone ? "진열완료" : isPrepared ? "준비완료" : "대기";
            const borderCls   = isDone ? "border-l-emerald-300" : isPrepared ? "border-l-sky-400" : "border-l-amber-400";
            const groupSelected = all.every(x => selectedDisplay.has(x.id));

            return (
              <div
                key={key}
                className={`flex items-start gap-3 px-4 py-3.5 border-l-2 ${borderCls} transition-all duration-150 ${
                  groupSelected ? "bg-brand-tint/50" : "hover:bg-zinc-50/40"
                } ${isDone ? "opacity-60" : ""}`}
              >
                <div className="pt-0.5 shrink-0">
                  <RequestCheckbox checked={groupSelected} onChange={() => handleToggleGroup(all)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[15px] font-bold break-words leading-snug ${isDone ? "line-through text-zinc-400" : "text-zinc-800"}`}>
                          {productName}
                        </span>
                        <StatusPill tone={statusTone} size="xs" dot>{statusLabel}</StatusPill>
                        {count > 1 && (
                          <span
                            className="text-[13px] font-bold text-brand-deep bg-brand-tint px-1.5 py-0.5 rounded-md tabular-nums"
                            title={`동일 상품 요청 ${count}건 · 대기 우선 처리`}
                          >{count}건</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {(r.zone_label || r.zone_id) && (
                          <span className="bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-md text-[15px] font-semibold break-keep">
                            {r.zone_label || r.zone_id}
                          </span>
                        )}
                        {r.assigned_staff_name
                          ? <span className="text-[14px] font-semibold text-brand-deep">{r.assigned_staff_name}</span>
                          : <span className="text-[14px] text-zinc-300">미지정</span>}
                        <span className="text-[15px] text-zinc-400 tabular-nums">{fmtDate(r.requested_at)}</span>
                      </div>
                    </div>
                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0 self-center">
                      {/* 창고준비 */}
                      {(() => {
                        const prepared = !isPending;
                        const disabled = !canPrepare || completing;
                        return (
                          <button
                            onClick={() => onPrepareDisplay(r)}
                            disabled={disabled}
                            title={
                              canPrepare
                                ? prepared
                                  ? `대기로 되돌리기 (${r.prepared_by_name ?? ""}${r.prepared_at ? " · " + fmtDate(r.prepared_at) : ""})`
                                  : "창고 준비 완료 처리"
                                : "창고담당만 가능"
                            }
                            className={`text-[15px] font-semibold px-2.5 h-7 rounded-lg border transition-all inline-flex items-center gap-1 disabled:opacity-40 ${
                              disabled
                                ? "text-zinc-400 bg-zinc-50 border-zinc-200 cursor-not-allowed"
                                : prepared
                                  ? "text-sky-700 border-sky-200 bg-sky-50/60 hover:bg-sky-100 cursor-pointer"
                                  : "text-amber-600 border-amber-300 hover:bg-amber-50 cursor-pointer"
                            }`}
                          >
                            {completing ? <Spinner size={9} tone="zinc" /> : <Package size={11} />}
                            창고준비
                          </button>
                        );
                      })()}
                      {/* 진열완료 */}
                      {(() => {
                        const gated = isPending && !isAdminLevel8;
                        const disabled = !canComplete || completing || gated;
                        return (
                          <button
                            onClick={() => onCompleteDisplay(r)}
                            disabled={disabled}
                            title={
                              canComplete
                                ? isDone
                                  ? `대기로 되돌리기 (${r.completed_by_name ?? ""}${r.completed_at ? " · " + fmtDate(r.completed_at) : ""})`
                                  : gated
                                    ? "창고 준비 완료 후 진열완료 가능"
                                    : "진열 완료 처리"
                                : "진열담당만 가능"
                            }
                            className={`text-[15px] font-semibold px-2.5 h-7 rounded-lg border transition-all inline-flex items-center gap-1 disabled:opacity-40 ${
                              disabled
                                ? "text-zinc-400 bg-zinc-50 border-zinc-200 cursor-not-allowed"
                                : isDone
                                  ? "text-emerald-700 border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100 cursor-pointer"
                                  : "text-amber-600 border-amber-300 hover:bg-amber-50 cursor-pointer"
                            }`}
                          >
                            {completing ? <Spinner size={9} tone="zinc" /> : <CheckCircle size={11} />}
                            진열완료
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 2) OrderRequestTab · 발주요청 목록 + 발주 필요 상품
// ═══════════════════════════════════════════════════════════════════════════

interface OrderRequestTabProps {
  orderReqs: OrderRequest[];
  orderLoading: boolean;
  orderError: string | null;
  orderRequestError: string | null;
  selectedOrder: Set<string>;
  productsLoading: boolean;
  lowStock: ProductInfo[];
  invStockMap: Map<string, { warehouse: number | null; store: number | null; total: number }>;
  requestedCodes: Set<string>;
  requestingOrder: Set<string>;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onDeleteSelected: () => void;
  onDeleteAll: () => Promise<void> | void;
  onRefresh: () => void;
  onRequestOrder: (p: ProductInfo) => void;
}

export const OrderRequestTab: React.FC<OrderRequestTabProps> = ({
  orderReqs, orderLoading, orderError, orderRequestError,
  selectedOrder, productsLoading, lowStock, invStockMap,
  requestedCodes, requestingOrder,
  onToggleAll, onToggleOne, onDeleteSelected, onDeleteAll, onRefresh, onRequestOrder,
}) => {
  return (
    <div className="flex flex-col gap-4">
      {/* 발주 요청 목록 */}
      <div className="flex flex-col gap-2">
        <p className="text-[14px] font-bold text-red-500 uppercase tracking-widest px-1">발주 요청 목록</p>
        <ListToolbar
          total={orderReqs.length} selected={selectedOrder.size}
          allChecked={selectedOrder.size === orderReqs.length && orderReqs.length > 0}
          onToggleAll={onToggleAll}
          onDeleteSelected={onDeleteSelected}
          onDeleteAll={onDeleteAll}
          onRefresh={onRefresh} loading={orderLoading} accentColor="text-red-600"
        />
        {orderError && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-[15px] text-red-600 font-bold">
            <span>⚠ {orderError}</span>
            <button onClick={onRefresh} className="ml-auto text-red-500 underline cursor-pointer">재시도</button>
          </div>
        )}
        {orderLoading && orderReqs.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 py-1.5 mb-1 bg-red-50 border border-red-200 rounded-md">
            <Spinner size={11} tone="red" label="새로 불러오는 중..." labelSize={14} />
          </div>
        )}
        {orderLoading && orderReqs.length === 0 ? (
          <div className="flex items-center justify-center py-8"><Spinner tone="zinc" size={14} label="로딩 중..." labelSize={12} /></div>
        ) : !orderLoading && orderReqs.length === 0 && !orderError ? (
          <EmptyState title="발주 요청 없음" size="compact" />
        ) : (
          <div className={`${CARD_BASE} divide-y divide-zinc-50 ${orderLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
            {orderReqs.map(r => {
              const short = (r.optimal_stock ?? 0) - (r.current_stock ?? 0);
              const inv = invStockMap.get(r.product_code);
              return (
                <div key={r.id} className={`flex items-center gap-3 px-0.5 py-1.5 transition-all duration-150 ${selectedOrder.has(r.id) ? "bg-rose-50/50" : "hover:bg-zinc-50/60"}`}>
                  <RequestCheckbox checked={selectedOrder.has(r.id)} onChange={() => onToggleOne(r.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[14px] font-semibold text-zinc-400 shrink-0">{r.product_code}</span>
                      <span className="text-gray-300 text-[14px]">·</span>
                      <span className="text-[14px] font-bold text-zinc-800 break-keep">{r.product_name || "(상품명 없음)"}</span>
                      <span className="text-gray-300 text-[14px]">·</span>
                      <span className="text-[15px] text-zinc-500">현재 <span className="font-bold text-zinc-700">{r.current_stock ?? "-"}</span> / 적정 <span className="font-bold text-zinc-700">{r.optimal_stock ?? "-"}</span></span>
                      {inv && (
                        <>
                          <span className="text-gray-300 text-[14px]">·</span>
                          <span className="text-[15px] text-purple-600 font-bold">실재고 {inv.total}<span className="font-normal text-purple-400">(창고 {inv.warehouse ?? "-"}+매장 {inv.store ?? "-"})</span></span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-[15px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg shrink-0">-{short}개</span>
                  <span className="text-[14px] text-gray-400 shrink-0">{fmtDate(r.requested_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 발주 필요 상품 */}
      <div className="flex flex-col gap-2">
        <p className="text-[14px] font-bold text-gray-400 uppercase tracking-widest px-1">
          발주 필요 상품 <span className="normal-case font-normal">(현재고 &lt; 추천적정재고)</span>
        </p>
        {orderRequestError && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-[15px] text-red-600 font-bold">
            ⚠ {orderRequestError}
          </div>
        )}
        {productsLoading && lowStock.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 py-1.5 mb-1 bg-red-50 border border-red-200 rounded-md">
            <Spinner size={11} tone="red" label="새로 불러오는 중..." labelSize={14} />
          </div>
        )}
        {productsLoading && lowStock.length === 0 ? (
          <div className="flex items-center justify-center py-8"><Spinner tone="zinc" size={14} label="로딩 중..." labelSize={12} /></div>
        ) : !productsLoading && lowStock.length === 0 ? (
          <EmptyState title="발주 필요 상품 없음" size="compact" />
        ) : (
          <div className={`${CARD_BASE} divide-y divide-zinc-50 ${productsLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
            {lowStock.map(p => {
              const cur = Number(p.current_stock), opt = Number(p.optimal_stock);
              const code = (p as any).code ?? (p as any).product_code ?? "";
              const name = (p as any).name ?? (p as any).product_name ?? "";
              const supplier = (p as any).supplier ?? "";
              const alreadyRequested = requestedCodes.has(code);
              const busy = requestingOrder.has(code);
              return (
                <div key={code} className="flex items-center gap-3 px-0.5 py-1.5 hover:bg-zinc-50/60 transition-all duration-150">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[14px] font-semibold text-zinc-400 shrink-0">{code}</span>
                          <span className="text-gray-300 text-[14px]">·</span>
                          <span className="text-[14px] font-bold text-zinc-800 break-keep">{name || "(상품명 없음)"}</span>
                          <span className="text-gray-300 text-[14px]">·</span>
                          <span className="text-[15px] text-zinc-500">현재 <span className="font-bold text-zinc-700">{cur}</span> / 적정 <span className="font-bold text-zinc-700">{opt}</span></span>
                          {supplier && (
                            <>
                              <span className="text-gray-300 text-[14px]">·</span>
                              <span className="text-[15px] text-sky-600 font-semibold break-keep">{supplier}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-[15px] font-bold text-red-600 shrink-0">-{opt - cur}개</span>
                  {alreadyRequested ? (
                    <button onClick={() => onRequestOrder(p)} className="text-[14px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg shrink-0 cursor-pointer hover:bg-emerald-100 transition">요청됨</button>
                  ) : (
                    <button onClick={() => onRequestOrder(p)} disabled={busy}
                      className="text-[15px] font-bold text-white bg-red-500 hover:bg-red-600 px-2.5 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-50 shrink-0 flex items-center gap-1">
                      <ShoppingCart size={11} />{busy ? "..." : "발주요청 리스트에 추가"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 3) InventoryCheckTab · 실재고 차이 (요약 KPI + 목록 + 이력 로그)
// ═══════════════════════════════════════════════════════════════════════════

interface InventoryCheckTabProps {
  inventoryChecks: InventoryCheck[];
  inventoryLoading: boolean;
  selectedInventory: Set<string>;
  displayReqsCount: number;
  orderReqsCount: number;
  requestedCodes: Set<string>;
  requestingInvOrder: Set<string>;
  invLogOpen: boolean;
  setInvLogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onDeleteSelected: () => void;
  onDeleteAll: () => Promise<void> | void;
  onRefresh: () => void;
  onOrderFromInventory: (r: InventoryCheck) => void;
}

export const InventoryCheckTab: React.FC<InventoryCheckTabProps> = ({
  inventoryChecks, inventoryLoading, selectedInventory,
  displayReqsCount, orderReqsCount, requestedCodes, requestingInvOrder,
  invLogOpen, setInvLogOpen,
  onToggleAll, onToggleOne, onDeleteSelected, onDeleteAll, onRefresh, onOrderFromInventory,
}) => {
  return (
    <div className="flex flex-col gap-2">
      {/* 재고 모니터링 요약 지표 */}
      {(() => {
        const totalChecks = inventoryChecks.length;
        let mismatchCount = 0;
        for (const r of inventoryChecks) {
          // 2026-09-03 · fix · warehouse_stock(DROP) → warehouse1_stock + warehouse2_stock 합산
          const totalActual =
            (r.warehouse1_stock ?? 0) + (r.warehouse2_stock ?? 0) + (r.store_stock ?? 0) + (r.store3_stock ?? 0);
          if (r.system_stock != null && totalActual !== r.system_stock) mismatchCount++;
        }
        // 2026-09-03 · fix · "실재고 차이" KPI 가 "점검 상품"과 동일 값 (inventoryChecks.length) 표시
        //   · 이후 · "오차 건수" (실재고 ≠ 시스템재고 인 상품 수) = mismatchCount 로 통일
        const metrics = [
          { label: "점검 상품", value: totalChecks, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
          { label: "오차 건수", value: mismatchCount, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
          { label: "진열요청", value: displayReqsCount, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
          { label: "발주요청", value: orderReqsCount, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
        ];
        return (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {metrics.map(m => (
              <div key={m.label} className={`${m.bg} border ${m.border} rounded-xl px-3 py-2 shadow-sm`}>
                <p className={`text-[14px] font-bold ${m.color} opacity-80`}>{m.label}</p>
                <p className={`text-lg font-bold ${m.color} leading-tight`}>{m.value}</p>
              </div>
            ))}
          </div>
        );
      })()}
      <ListToolbar
        total={inventoryChecks.length} selected={selectedInventory.size}
        allChecked={selectedInventory.size === inventoryChecks.length && inventoryChecks.length > 0}
        onToggleAll={onToggleAll}
        onDeleteSelected={onDeleteSelected}
        onDeleteAll={onDeleteAll}
        onRefresh={onRefresh} loading={inventoryLoading} accentColor="text-purple-600"
      />
      {inventoryLoading && inventoryChecks.length > 0 && (
        <div className="flex items-center justify-center gap-1.5 py-1.5 mb-1 bg-purple-50 border border-purple-200 rounded-md">
          <Spinner size={11} tone="violet" label="새로 불러오는 중..." labelSize={14} />
        </div>
      )}
      {inventoryLoading && inventoryChecks.length === 0 ? (
        <div className="flex items-center justify-center py-8"><Spinner tone="zinc" size={14} label="로딩 중..." labelSize={12} /></div>
      ) : !inventoryLoading && inventoryChecks.length === 0 ? (
        <EmptyState title="재고 점검 항목 없음" size="compact" />
      ) : (
        <div className={`${CARD_BASE} divide-y divide-zinc-50 ${inventoryLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
          {inventoryChecks.map(r => {
            // 2026-09-03 · fix · warehouse_stock(DROP) → warehouse1_stock + warehouse2_stock 합산
            const whTotal = (r.warehouse1_stock ?? 0) + (r.warehouse2_stock ?? 0);
            const totalActual = whTotal + (r.store_stock ?? 0) + (r.store3_stock ?? 0);
            const diff = r.system_stock != null ? totalActual - r.system_stock : null;
            const isShort = diff != null && diff < 0;
            const isOver  = diff != null && diff > 0;
            return (
              <div key={r.id} className={`flex items-center gap-3 px-0.5 py-1.5 transition-all duration-150 ${selectedInventory.has(r.id) ? "bg-rose-50/50" : "hover:bg-zinc-50/60"}`}>
                <RequestCheckbox checked={selectedInventory.has(r.id)} onChange={() => onToggleOne(r.id)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[14px] font-bold text-zinc-800 break-keep">{r.product_name}</span>
                    <span className="text-gray-300 text-[14px]">·</span>
                    <span className="text-[14px] font-semibold text-zinc-400">{r.product_code}</span>
                    <span className="text-gray-300 text-[14px]">·</span>
                    <span className="text-[15px] text-zinc-500">
                      창고 <span className="font-bold text-zinc-700">{r.warehouse1_stock != null || r.warehouse2_stock != null ? whTotal : "—"}</span>
                      <span className="text-zinc-300 mx-0.5">+</span>
                      매장 <span className="font-bold text-zinc-700">{r.store_stock ?? "—"}</span>
                      <span className="text-zinc-300 mx-0.5">=</span>
                      <span className="font-bold text-purple-700">{totalActual}</span>
                    </span>
                    <span className="text-gray-300 text-[14px]">·</span>
                    <span className="text-[15px] text-zinc-500">현재고 <span className="font-bold text-zinc-700">{r.system_stock ?? "—"}</span></span>
                    {diff != null && (() => {
                      const tone: PillTone = isShort ? "rose" : isOver ? "emerald" : "zinc";
                      return (
                        <StatusPill tone={tone} size="sm">
                          {diff > 0 ? "+" : ""}{diff}
                        </StatusPill>
                      );
                    })()}
                    {r.checked_by && (
                      <>
                        <span className="text-gray-300 text-[14px]">·</span>
                        <span className="text-[14px] text-gray-400">점검자 {r.checked_by}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => onOrderFromInventory(r)}
                    disabled={requestingInvOrder.has(r.product_code)}
                    className={`text-[14px] font-bold px-2 py-1 rounded-lg transition cursor-pointer disabled:opacity-50 flex items-center gap-1 ${
                      requestedCodes.has(r.product_code)
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                        : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                    }`}
                  >
                    <ShoppingCart size={9} />
                    {requestingInvOrder.has(r.product_code) ? "..." : requestedCodes.has(r.product_code) ? "요청됨" : "발주요청"}
                  </button>
                  <span className="text-[14px] text-gray-400">{fmtDate(r.checked_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 점검 이력 로그 ── */}
      {inventoryChecks.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setInvLogOpen(p => !p)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 border border-line rounded-xl text-[15px] font-bold text-gray-500 hover:bg-gray-100 transition cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Scroll size={12} className="text-purple-400" />
              점검 이력 로그 ({inventoryChecks.length}건)
            </span>
            {invLogOpen ? <CaretUp size={13} /> : <CaretDown size={13} />}
          </button>

          {invLogOpen && (() => {
            const groups = new Map<string, InventoryCheck[]>();
            for (const r of inventoryChecks) {
              const d = new Date(r.checked_at);
              const key = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} (${["일","월","화","수","목","금","토"][d.getDay()]})`;
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(r);
            }
            return (
              <div className={`${CARD_BASE} overflow-hidden mt-1`}>
                {[...groups.entries()].map(([date, rows]) => (
                  <div key={date}>
                    <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100">
                      <span className="text-[14px] font-bold text-gray-400 uppercase tracking-wide">{date}</span>
                    </div>
                    {rows.map(r => {
                      // 2026-09-03 · fix · warehouse_stock(DROP) → warehouse1_stock + warehouse2_stock 합산
                      const whTotal = (r.warehouse1_stock ?? 0) + (r.warehouse2_stock ?? 0);
                      const totalActual = whTotal + (r.store_stock ?? 0) + (r.store3_stock ?? 0);
                      const diff = r.system_stock != null ? totalActual - r.system_stock : null;
                      const d = new Date(r.checked_at);
                      const time = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
                      return (
                        <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-purple-50/30 transition">
                          <span className="text-[14px] text-gray-400 tabular-nums shrink-0 w-10">{time}</span>
                          <div className="flex-1 min-w-0">
                            <span className="text-[14px] font-bold text-gray-800 break-keep">{r.product_name}</span>
                            <span className="text-[14px] text-gray-400">
                              창고 {r.warehouse1_stock != null || r.warehouse2_stock != null ? whTotal : "—"} + 매장 {r.store_stock ?? "—"} = <strong className="text-purple-700">{totalActual}</strong>
                              {r.system_stock != null && <> · 현재고 {r.system_stock}</>}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {diff != null && (
                              <span className={`text-[15px] font-bold px-1.5 py-0.5 rounded ${diff < 0 ? "bg-red-50 text-red-600" : diff > 0 ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
                                {diff > 0 ? "+" : ""}{diff}
                              </span>
                            )}
                            {r.checked_by && (
                              <span className="text-[14px] text-gray-400">{r.checked_by}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

    </div>
  );
};
