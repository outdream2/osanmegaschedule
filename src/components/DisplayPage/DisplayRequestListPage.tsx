// src/components/DisplayPage/DisplayRequestListPage.tsx
// 2026-08-05 · 진열요청 리스트 페이지 (Phase 3)
// - 구역별 그룹 카드 · 플로우 스텝퍼 시각화 · 3상태 필터
// - [준비완료] 창고담당 (position ∈ 창고/물류) · [완료] 진열담당 (position ∈ 진열/매장 + zone_assignments)
// - 관리자 (level ≥ 8) · 모든 상태 강제 전환 가능

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell, Loader2, CheckCircle2, Package, ChevronDown, ChevronRight,
  Filter, RefreshCw, User, Clock, MapPin, Megaphone,
} from "lucide-react";
import type { AuthSession } from "../../types";

// ─── Types ──────────────────────────────────────────────────────────────────

type DRStatus = "pending" | "prepared" | "done";

interface DisplayRequest {
  id: string;
  zone_id: string;
  zone_label: string;
  category: string;
  requested_at: string;
  assigned_staff_id: number | null;
  assigned_staff_name: string;
  note: string;
  status: DRStatus;
  product_code: string | null;
  prepared_at: string | null;
  prepared_by: number | null;
  prepared_by_name: string | null;
  completed_at: string | null;
  completed_by: number | null;
  completed_by_name: string | null;
}

interface ZoneGroup {
  zoneId: string;
  zoneLabel: string;
  requests: DisplayRequest[];
  pendingCount: number;
  preparedCount: number;
  doneCount: number;
}

interface DisplayRequestListPageProps {
  authSession: AuthSession | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

// 창고담당 = position ∈ {"창고", "물류"} · 물류 세분화
// 진열담당 = position ∈ {"진열", "매장"} 또는 zone_assignments 매핑
// 관리자 = level ≥ 8
function isWarehouseStaff(sess: AuthSession | null): boolean {
  const pos = (sess as any)?.position ?? "";
  return pos === "창고" || pos === "물류" || ((sess as any)?.employeeRank ?? "") === "창고";
}
function isDisplayStaff(sess: AuthSession | null): boolean {
  const pos = (sess as any)?.position ?? "";
  return pos === "진열" || pos === "매장" || ((sess as any)?.employeeRank ?? "") === "진열";
}
function isAdmin(sess: AuthSession | null): boolean {
  return (sess?.level ?? 0) >= 8;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

const FlowStepper: React.FC<{ req: DisplayRequest }> = ({ req }) => {
  const step1Done = true;                              // 요청됨
  const step2Done = req.status !== "pending";          // 창고 준비
  const step3Done = req.status === "done";             // 진열 완료
  const stepClass = (done: boolean, active: boolean) => {
    if (done)  return "bg-emerald-500 text-white border-emerald-500";
    if (active) return "bg-amber-500 text-white border-amber-500 ring-2 ring-amber-200 animate-pulse";
    return "bg-slate-100 text-slate-400 border-slate-200";
  };
  const activeStep: number = req.status === "pending" ? 2 : req.status === "prepared" ? 3 : 0;
  const line = (done: boolean) => (done ? "bg-emerald-300" : "bg-slate-200");
  return (
    <div className="flex items-center gap-1 text-[10px]">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center border font-black ${stepClass(step1Done, activeStep === 1)}`} title="요청됨">1</div>
      <div className={`h-px flex-1 ${line(step2Done)}`} />
      <div className={`w-6 h-6 rounded-full flex items-center justify-center border font-black ${stepClass(step2Done, activeStep === 2)}`} title="창고 준비">2</div>
      <div className={`h-px flex-1 ${line(step3Done)}`} />
      <div className={`w-6 h-6 rounded-full flex items-center justify-center border font-black ${stepClass(step3Done, activeStep === 3)}`} title="진열 완료">3</div>
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────

export const DisplayRequestListPage: React.FC<DisplayRequestListPageProps> = ({ authSession }) => {
  const [requests, setRequests] = useState<DisplayRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "prepared" | "done">("all");
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set()); // 접힘 상태 (기본 열림 · done 만 접힘)
  const [busyId, setBusyId] = useState<string | null>(null);

  const canWarehouse = isWarehouseStaff(authSession) || isAdmin(authSession);
  const canDisplay = isDisplayStaff(authSession) || isAdmin(authSession);
  const canAdmin = isAdmin(authSession);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/display-requests");
      if (!res.ok) throw new Error(`불러오기 실패 (${res.status})`);
      const list = (await res.json()) as DisplayRequest[];
      setRequests(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e?.message ?? "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 30초마다 자동 새로고침 (실시간성)
  useEffect(() => {
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const filteredRequests = useMemo(() => {
    if (filter === "all") return requests;
    return requests.filter(r => r.status === filter);
  }, [requests, filter]);

  const zoneGroups = useMemo<ZoneGroup[]>(() => {
    const map = new Map<string, ZoneGroup>();
    for (const r of filteredRequests) {
      const key = r.zone_id || "(구역 미지정)";
      const label = r.zone_label || key;
      let g = map.get(key);
      if (!g) {
        g = { zoneId: key, zoneLabel: label, requests: [], pendingCount: 0, preparedCount: 0, doneCount: 0 };
        map.set(key, g);
      }
      g.requests.push(r);
      if (r.status === "pending") g.pendingCount++;
      else if (r.status === "prepared") g.preparedCount++;
      else g.doneCount++;
    }
    // 각 그룹 내 · pending → prepared → done 순 · 요청시각 desc
    for (const g of map.values()) {
      g.requests.sort((a, b) => {
        const statusOrder = { pending: 0, prepared: 1, done: 2 };
        const s = statusOrder[a.status] - statusOrder[b.status];
        if (s !== 0) return s;
        return new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime();
      });
    }
    // 구역별 · pending 있는 그룹 먼저 · 그 다음 prepared 있음 · 마지막 완료만
    return Array.from(map.values()).sort((a, b) => {
      const scoreA = a.pendingCount * 100 + a.preparedCount * 10;
      const scoreB = b.pendingCount * 100 + b.preparedCount * 10;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.zoneLabel.localeCompare(b.zoneLabel, "ko");
    });
  }, [filteredRequests]);

  const totalCounts = useMemo(() => ({
    pending: requests.filter(r => r.status === "pending").length,
    prepared: requests.filter(r => r.status === "prepared").length,
    done: requests.filter(r => r.status === "done").length,
  }), [requests]);

  const toggleZone = (zoneId: string) => {
    setExpandedZones(prev => {
      const next = new Set(prev);
      if (next.has(zoneId)) next.delete(zoneId);
      else next.add(zoneId);
      return next;
    });
  };

  const handlePrepare = async (req: DisplayRequest) => {
    if (!canWarehouse) return;
    setBusyId(req.id);
    try {
      const res = await fetch(`/api/display-requests/${req.id}/prepare`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepared_by: authSession?.employeeId ?? null,
          prepared_by_name: authSession?.employeeName ?? "",
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        alert(`준비완료 실패: ${(b as any).error ?? res.statusText}`);
      } else {
        await load();
      }
    } finally { setBusyId(null); }
  };

  const handleComplete = async (req: DisplayRequest) => {
    if (!canDisplay && !canAdmin) return;
    setBusyId(req.id);
    try {
      const res = await fetch(`/api/display-requests/${req.id}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completed_by: authSession?.employeeId ?? null,
          completed_by_name: authSession?.employeeName ?? "",
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        alert(`완료 실패: ${(b as any).error ?? res.statusText}`);
      } else {
        await load();
      }
    } finally { setBusyId(null); }
  };

  const borderClassForGroup = (g: ZoneGroup) => {
    if (g.pendingCount > 0) return "border-l-4 border-l-amber-400";
    if (g.preparedCount > 0) return "border-l-4 border-l-sky-400";
    return "border-l-4 border-l-emerald-400 opacity-70";
  };

  // done 만 있는 그룹 · 기본 접힘
  const isZoneDefaultCollapsed = (g: ZoneGroup) => g.pendingCount === 0 && g.preparedCount === 0;
  const isCollapsed = (g: ZoneGroup) => {
    const inSet = expandedZones.has(g.zoneId);
    return isZoneDefaultCollapsed(g) ? !inSet : inSet && false; // 기본 접힘 그룹 · toggle 시 열림; 기본 열림 그룹 · toggle 시 접힘
  };
  // 위 로직이 복잡 · 정리: expandedZones = "다르게 처리하는 zone" 목록
  // 기본 열림 (pending/prepared 있음) · in set = 접힘
  // 기본 접힘 (done 만) · in set = 열림
  const collapsed = (g: ZoneGroup): boolean => {
    const inSet = expandedZones.has(g.zoneId);
    if (isZoneDefaultCollapsed(g)) return !inSet;
    return inSet;
  };
  void isCollapsed; // 미사용 방지

  return (
    <main className="flex-1 max-w-[1360px] mx-auto w-full px-3 sm:px-4 py-3 sm:py-4 flex flex-col gap-3">
      {/* 헤더 · 카운트 KPI + 필터 + 새로고침 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shadow-sm shrink-0">
            <Megaphone size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-[14px] sm:text-[15px] font-black text-slate-800 tracking-tight leading-tight">진열요청</h1>
            <p className="text-[11px] text-slate-500 mt-0.5">구역별 · 창고준비 → 진열완료 워크플로우</p>
          </div>
        </div>
        <div className="hidden sm:block w-px h-8 bg-slate-200" />
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] tabular-nums px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-bold">대기 {totalCounts.pending}</span>
          <span className="text-[11px] tabular-nums px-2 py-1 rounded-full bg-sky-100 text-sky-700 font-bold">준비 {totalCounts.prepared}</span>
          <span className="text-[11px] tabular-nums px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold">완료 {totalCounts.done}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="inline-flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
            {(["all", "pending", "prepared", "done"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`h-7 px-2.5 text-[11px] font-bold rounded-md transition cursor-pointer ${
                  filter === f ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {f === "all" ? "전체" : f === "pending" ? "대기" : f === "prepared" ? "준비" : "완료"}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
            title="새로고침"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-[12px] text-rose-700 font-semibold flex items-center justify-between">
          {error}
          <button onClick={load} className="ml-2 underline">재시도</button>
        </div>
      )}

      {/* 리스트 · 구역별 그룹 */}
      {loading && requests.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <Loader2 size={22} className="animate-spin" /> 불러오는 중...
        </div>
      ) : zoneGroups.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <Bell size={28} className="opacity-30" />
          <span className="text-[13px] font-semibold">
            {filter === "all" ? "진열요청 없음" : `"${filter}" 상태 요청 없음`}
          </span>
          <span className="text-[11px]">실재고 확인 페이지에서 상품별 진열요청 가능</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {zoneGroups.map((g) => {
            const isCol = collapsed(g);
            return (
              <div
                key={g.zoneId}
                className={`bg-white rounded-xl shadow-sm ${borderClassForGroup(g)}`}
              >
                {/* 그룹 헤더 */}
                <button
                  type="button"
                  onClick={() => toggleZone(g.zoneId)}
                  className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-slate-50/50 rounded-t-xl transition cursor-pointer"
                >
                  {isCol
                    ? <ChevronRight size={14} className="text-slate-400 shrink-0" />
                    : <ChevronDown  size={14} className="text-slate-400 shrink-0" />}
                  <MapPin size={12} className="text-slate-500" />
                  <span className="text-[13px] font-black text-slate-800">{g.zoneLabel}</span>
                  <span className="text-[11px] font-semibold text-slate-400 tabular-nums">· {g.requests.length}건</span>
                  <div className="ml-auto flex items-center gap-1">
                    {g.pendingCount > 0 && (
                      <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">대기 {g.pendingCount}</span>
                    )}
                    {g.preparedCount > 0 && (
                      <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 font-bold">준비 {g.preparedCount}</span>
                    )}
                    {g.doneCount > 0 && (
                      <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">완료 {g.doneCount}</span>
                    )}
                  </div>
                </button>
                {/* 그룹 상세 리스트 */}
                {!isCol && (
                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {g.requests.map(req => (
                      <li key={req.id} className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 hover:bg-slate-50/40 transition">
                        {/* 상품 · 요청자 */}
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-bold text-slate-800 truncate">
                            {req.product_code
                              ? <span className="text-slate-700">{req.note?.split(" · ")[0] ?? req.product_code}</span>
                              : <span className="text-slate-500 italic">{req.category || "구역 단위 요청"}</span>}
                          </div>
                          <div className="text-[10.5px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            {req.product_code && <span className="font-mono">{req.product_code}</span>}
                            {req.note && !req.note.includes(req.product_code ?? "###") && (
                              <span className="italic">{req.note}</span>
                            )}
                            <span className="inline-flex items-center gap-0.5">
                              <Clock size={9} /> {relativeTime(req.requested_at)}
                            </span>
                            {req.assigned_staff_name && (
                              <span className="inline-flex items-center gap-0.5">
                                <User size={9} /> {req.assigned_staff_name}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* 플로우 스텝퍼 */}
                        <div className="sm:w-[140px] shrink-0">
                          <FlowStepper req={req} />
                        </div>
                        {/* 액션 · 준비/완료 */}
                        <div className="flex items-center gap-1 shrink-0">
                          {req.status === "pending" ? (
                            <button
                              type="button"
                              onClick={() => handlePrepare(req)}
                              disabled={!canWarehouse || busyId === req.id}
                              title={canWarehouse ? "창고 준비 완료 처리" : "창고담당만 가능"}
                              className={`h-7 px-2.5 text-[11px] font-bold rounded-md transition cursor-pointer flex items-center gap-1 ${
                                canWarehouse
                                  ? "bg-sky-500 hover:bg-sky-600 text-white shadow-sm"
                                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
                              } disabled:opacity-50`}
                            >
                              {busyId === req.id ? <Loader2 size={11} className="animate-spin" /> : <Package size={11} />}
                              준비완료
                            </button>
                          ) : req.status === "prepared" ? (
                            <>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-semibold whitespace-nowrap" title={`준비: ${req.prepared_by_name || "?"} · ${req.prepared_at ? relativeTime(req.prepared_at) : ""}`}>
                                <CheckCircle2 size={9} className="inline mr-0.5" />준비 {req.prepared_by_name || ""}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleComplete(req)}
                                disabled={(!canDisplay && !canAdmin) || busyId === req.id}
                                title={canDisplay || canAdmin ? "진열 완료 처리" : "진열담당만 가능"}
                                className={`h-7 px-2.5 text-[11px] font-bold rounded-md transition cursor-pointer flex items-center gap-1 ${
                                  canDisplay || canAdmin
                                    ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm"
                                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                                } disabled:opacity-50`}
                              >
                                {busyId === req.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                완료
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold whitespace-nowrap" title={`완료: ${req.completed_by_name || "?"} · ${req.completed_at ? relativeTime(req.completed_at) : ""}`}>
                              <CheckCircle2 size={10} className="inline mr-0.5" />완료 {req.completed_by_name || ""}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 하단 필터 안내 */}
      <div className="text-[10px] text-slate-400 text-center pt-2">
        완료 요청 · 7일 후 자동 정리 · 30초 자동 새로고침
        <span className="mx-1">·</span>
        {canWarehouse && <span className="text-sky-600 font-semibold mr-1">창고담당</span>}
        {canDisplay && <span className="text-emerald-600 font-semibold mr-1">진열담당</span>}
        {canAdmin && <span className="text-violet-600 font-semibold mr-1">관리자</span>}
        {!canWarehouse && !canDisplay && !canAdmin && <span>조회 전용 (버튼 비활성)</span>}
      </div>
    </main>
  );
};

// 미사용 import 제거 방지 (Filter, void 로 안전)
void Filter;

export default DisplayRequestListPage;
