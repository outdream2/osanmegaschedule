// src/components/DisplayPage/DisplayRequestListPage.tsx
// 2026-08-05 · 진열요청 리스트 페이지 (Phase 3)
// - 데스크탑 5컬럼 테이블 · 모바일 카드 형식
// - 상품명 · 위치 · 담당자 · 창고상황 · 완료 컬럼
// - 상태별 색상: pending amber · prepared sky · done emerald
// - [준비완료] 창고담당 (position ∈ 창고/물류) · [완료] 진열담당 (position ∈ 진열/매장 + zone_assignments)
// - 관리자 (level ≥ 8) · 모든 상태 강제 전환 가능

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell, Loader2, CheckCircle2, Package, ChevronDown, ChevronRight,
  RefreshCw, User, Clock, MapPin, Megaphone, XCircle,
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

/** note 필드에서 상품명 추출. "XXX 진열 요청" 형태면 앞부분 반환 */
function extractProductName(req: DisplayRequest): string {
  if (req.note) {
    const m = req.note.match(/^(.+?) 진열 요청$/);
    if (m) return m[1];
    // note 앞부분이 상품명일 경우
    const parts = req.note.split(" · ");
    if (parts[0]) return parts[0];
  }
  return req.product_code ?? "";
}

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

// ─── Status Badge ────────────────────────────────────────────────────────────

const StatusChip: React.FC<{ status: DRStatus }> = ({ status }) => {
  if (status === "pending")
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap">
        <Clock size={9} /> 대기
      </span>
    );
  if (status === "prepared")
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5 whitespace-nowrap">
        <Package size={9} /> 준비완료
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 whitespace-nowrap">
      <CheckCircle2 size={9} /> 완료
    </span>
  );
};

// ─── Row left border color by group dominant status ──────────────────────────

function rowBorderClass(status: DRStatus): string {
  if (status === "pending")  return "border-l-2 border-l-amber-400";
  if (status === "prepared") return "border-l-2 border-l-sky-400";
  return "border-l-2 border-l-emerald-300";
}

// ─── Main Component ─────────────────────────────────────────────────────────

export const DisplayRequestListPage: React.FC<DisplayRequestListPageProps> = ({ authSession }) => {
  const [requests, setRequests] = useState<DisplayRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "prepared" | "done">("all");
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const canWarehouse = isWarehouseStaff(authSession) || isAdmin(authSession);
  const canDisplay   = isDisplayStaff(authSession)   || isAdmin(authSession);
  const canAdmin     = isAdmin(authSession);

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
      const key   = r.zone_id || "(구역 미지정)";
      const label = r.zone_label || key;
      let g = map.get(key);
      if (!g) {
        g = { zoneId: key, zoneLabel: label, requests: [], pendingCount: 0, preparedCount: 0, doneCount: 0 };
        map.set(key, g);
      }
      g.requests.push(r);
      if (r.status === "pending")   g.pendingCount++;
      else if (r.status === "prepared") g.preparedCount++;
      else g.doneCount++;
    }
    for (const g of map.values()) {
      g.requests.sort((a, b) => {
        const statusOrder = { pending: 0, prepared: 1, done: 2 };
        const s = statusOrder[a.status] - statusOrder[b.status];
        if (s !== 0) return s;
        return new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime();
      });
    }
    return Array.from(map.values()).sort((a, b) => {
      const scoreA = a.pendingCount * 100 + a.preparedCount * 10;
      const scoreB = b.pendingCount * 100 + b.preparedCount * 10;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.zoneLabel.localeCompare(b.zoneLabel, "ko");
    });
  }, [filteredRequests]);

  const totalCounts = useMemo(() => ({
    pending:  requests.filter(r => r.status === "pending").length,
    prepared: requests.filter(r => r.status === "prepared").length,
    done:     requests.filter(r => r.status === "done").length,
  }), [requests]);

  const toggleZone = (zoneId: string) => {
    setExpandedZones(prev => {
      const next = new Set(prev);
      if (next.has(zoneId)) next.delete(zoneId);
      else next.add(zoneId);
      return next;
    });
  };

  // 기본 접힘: done 만 있는 그룹
  const isZoneDefaultCollapsed = (g: ZoneGroup) => g.pendingCount === 0 && g.preparedCount === 0;
  const collapsed = (g: ZoneGroup): boolean => {
    const inSet = expandedZones.has(g.zoneId);
    if (isZoneDefaultCollapsed(g)) return !inSet;
    return inSet;
  };

  const handlePrepare = async (req: DisplayRequest) => {
    if (!canWarehouse) return;
    setBusyId(req.id);
    try {
      const res = await fetch(`/api/display-requests/${req.id}/prepare`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepared_by:      authSession?.employeeId  ?? null,
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
          completed_by:      authSession?.employeeId  ?? null,
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
    if (g.pendingCount > 0)  return "border-l-4 border-l-amber-400";
    if (g.preparedCount > 0) return "border-l-4 border-l-sky-400";
    return "border-l-4 border-l-emerald-400 opacity-70";
  };

  // ── 액션 셀 ────────────────────────────────────────────────────────────────
  const ActionCell: React.FC<{ req: DisplayRequest }> = ({ req }) => {
    const busy = busyId === req.id;
    if (req.status === "pending") {
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => handlePrepare(req)}
            disabled={!canWarehouse || busy}
            title={canWarehouse ? "창고 준비 완료 처리" : "창고담당만 가능"}
            className={`h-7 px-2.5 text-[11px] font-bold rounded-md transition flex items-center gap-1 ${
              canWarehouse
                ? "bg-sky-500 hover:bg-sky-600 text-white shadow-sm cursor-pointer"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            } disabled:opacity-50`}
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Package size={11} />}
            준비완료
          </button>
          {canAdmin && (
            <button
              type="button"
              onClick={() => handleComplete(req)}
              disabled={busy}
              title="관리자 · 바로 완료"
              className="h-7 px-2 text-[10px] font-bold rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-700 transition cursor-pointer disabled:opacity-50"
            >
              {busy ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
            </button>
          )}
        </div>
      );
    }
    if (req.status === "prepared") {
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => handleComplete(req)}
            disabled={(!canDisplay && !canAdmin) || busy}
            title={canDisplay || canAdmin ? "진열 완료 처리" : "진열담당만 가능"}
            className={`h-7 px-2.5 text-[11px] font-bold rounded-md transition flex items-center gap-1 ${
              canDisplay || canAdmin
                ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm cursor-pointer"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            } disabled:opacity-50`}
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
            완료
          </button>
        </div>
      );
    }
    // done
    return (
      <span className="text-[10px] text-emerald-600 font-semibold whitespace-nowrap inline-flex items-center gap-0.5">
        <CheckCircle2 size={10} className="inline" />
        {req.completed_by_name && <span>{req.completed_by_name}</span>}
        {req.completed_at && <span className="text-slate-400">{relativeTime(req.completed_at)}</span>}
      </span>
    );
  };

  // ── 창고상황 셀 (창고 준비 상황 표시) ────────────────────────────────────
  const WarehouseCell: React.FC<{ req: DisplayRequest }> = ({ req }) => {
    if (req.status === "pending") {
      return (
        <span className="text-[11px] text-amber-600 font-semibold whitespace-nowrap">
          준비 전
        </span>
      );
    }
    if (req.status === "prepared" || req.status === "done") {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-sky-700 font-bold whitespace-nowrap inline-flex items-center gap-0.5">
            <CheckCircle2 size={9} className="inline" /> 창고 준비
          </span>
          {req.prepared_by_name && (
            <span className="text-[10px] text-slate-400">{req.prepared_by_name}{req.prepared_at ? ` · ${relativeTime(req.prepared_at)}` : ""}</span>
          )}
        </div>
      );
    }
    return null;
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="flex-1 max-w-[1360px] mx-auto w-full px-3 sm:px-4 py-3 sm:py-4 flex flex-col gap-3">

      {/* 헤더 · KPI 카운트 + 필터 + 새로고침 */}
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
        {/* KPI 카운트 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] tabular-nums px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-bold">대기 {totalCounts.pending}</span>
          <span className="text-[11px] tabular-nums px-2 py-1 rounded-full bg-sky-100 text-sky-700 font-bold">준비 {totalCounts.prepared}</span>
          <span className="text-[11px] tabular-nums px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold">완료 {totalCounts.done}</span>
        </div>
        {/* 필터 + 새로고침 */}
        <div className="ml-auto flex items-center gap-1.5">
          <div className="inline-flex bg-slate-100 rounded-lg p-0.5 gap-0.5 flex-wrap">
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
          <span className="flex items-center gap-1"><XCircle size={13} /> {error}</span>
          <button onClick={load} className="ml-2 underline cursor-pointer">재시도</button>
        </div>
      )}

      {/* 리스트 · 구역별 그룹 */}
      {loading && requests.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <Loader2 size={22} className="animate-spin" />
          <span className="text-[13px]">불러오는 중...</span>
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
                  className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-slate-50/60 rounded-t-xl transition cursor-pointer"
                >
                  {isCol
                    ? <ChevronRight size={14} className="text-slate-400 shrink-0" />
                    : <ChevronDown  size={14} className="text-slate-400 shrink-0" />}
                  <MapPin size={12} className="text-slate-500 shrink-0" />
                  <span className="text-[13px] font-black text-slate-800">{g.zoneLabel}</span>
                  <span className="text-[11px] font-semibold text-slate-400 tabular-nums">· {g.requests.length}건</span>
                  <div className="ml-auto flex items-center gap-1 flex-wrap justify-end">
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

                {/* 그룹 상세 */}
                {!isCol && (
                  <div className="border-t border-slate-100">
                    {/* ── 데스크탑 테이블 (sm 이상) ─────────────────────────── */}
                    <table className="hidden sm:table w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                          <th className="px-3 py-2 w-[30%]">상품명</th>
                          <th className="px-3 py-2 w-[12%]">위치</th>
                          <th className="px-3 py-2 w-[14%]">담당자</th>
                          <th className="px-3 py-2 w-[20%]">창고상황</th>
                          <th className="px-3 py-2 w-[24%]">완료</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {g.requests.map(req => {
                          const productName = extractProductName(req);
                          return (
                            <tr
                              key={req.id}
                              className={`hover:bg-slate-50/60 transition ${rowBorderClass(req.status)}`}
                            >
                              {/* 상품명 */}
                              <td className="px-3 py-2.5 align-top">
                                <div className="flex flex-col gap-0.5">
                                  <div className="text-[12.5px] font-bold text-slate-800 leading-tight break-words whitespace-normal">
                                    {productName
                                      ? productName
                                      : <span className="text-slate-400 italic">{req.category || "구역 단위 요청"}</span>}
                                  </div>
                                  {req.product_code && (
                                    <span className="text-[10px] text-slate-400 tabular-nums">{req.product_code}</span>
                                  )}
                                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                    <StatusChip status={req.status} />
                                    <span className="text-[10px] text-slate-400 inline-flex items-center gap-0.5">
                                      <Clock size={8} /> {relativeTime(req.requested_at)}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              {/* 위치 */}
                              <td className="px-3 py-2.5 align-top">
                                <span className="text-[12px] font-bold text-slate-700 whitespace-nowrap inline-flex items-center gap-0.5">
                                  <MapPin size={10} className="text-slate-400" />
                                  {req.zone_id || "-"}
                                </span>
                                {req.zone_label && req.zone_label !== req.zone_id && (
                                  <div className="text-[10px] text-slate-400 mt-0.5 leading-tight break-words whitespace-normal">{req.zone_label}</div>
                                )}
                              </td>
                              {/* 담당자 */}
                              <td className="px-3 py-2.5 align-top">
                                <span className="text-[12px] text-slate-700 whitespace-nowrap inline-flex items-center gap-0.5">
                                  <User size={10} className="text-slate-400" />
                                  {req.assigned_staff_name || <span className="text-slate-400 italic">미지정</span>}
                                </span>
                              </td>
                              {/* 창고상황 */}
                              <td className="px-3 py-2.5 align-top">
                                <WarehouseCell req={req} />
                              </td>
                              {/* 완료 (액션) */}
                              <td className="px-3 py-2.5 align-top">
                                <ActionCell req={req} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* ── 모바일 카드 형식 (sm 미만) ────────────────────────── */}
                    <ul className="sm:hidden divide-y divide-slate-100">
                      {g.requests.map(req => {
                        const productName = extractProductName(req);
                        return (
                          <li
                            key={req.id}
                            className={`px-3 py-3 flex flex-col gap-2 hover:bg-slate-50/40 transition ${rowBorderClass(req.status)}`}
                          >
                            {/* 상단: 상품명 + 상태칩 */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-bold text-slate-800 leading-tight break-words whitespace-normal">
                                  {productName
                                    ? productName
                                    : <span className="text-slate-400 italic">{req.category || "구역 단위 요청"}</span>}
                                </div>
                                {req.product_code && (
                                  <span className="text-[10px] text-slate-400 tabular-nums">{req.product_code}</span>
                                )}
                              </div>
                              <StatusChip status={req.status} />
                            </div>

                            {/* 메타: 위치 · 담당자 · 요청시각 */}
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-[11px] text-slate-600 font-semibold inline-flex items-center gap-0.5">
                                <MapPin size={9} className="text-slate-400" />
                                {req.zone_id || "구역 미지정"}
                                {req.zone_label && req.zone_label !== req.zone_id && ` · ${req.zone_label}`}
                              </span>
                              {req.assigned_staff_name && (
                                <span className="text-[11px] text-slate-500 inline-flex items-center gap-0.5">
                                  <User size={9} /> {req.assigned_staff_name}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400 inline-flex items-center gap-0.5">
                                <Clock size={8} /> {relativeTime(req.requested_at)}
                              </span>
                            </div>

                            {/* 창고상황 + 액션 */}
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex-1">
                                <WarehouseCell req={req} />
                              </div>
                              <ActionCell req={req} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 하단 안내 */}
      <div className="text-[10px] text-slate-400 text-center pt-1 pb-2">
        완료 요청 · 7일 후 자동 정리 · 30초 자동 새로고침
        <span className="mx-1">·</span>
        {canWarehouse && <span className="text-sky-600 font-semibold mr-1">창고담당</span>}
        {canDisplay   && <span className="text-emerald-600 font-semibold mr-1">진열담당</span>}
        {canAdmin     && <span className="text-violet-600 font-semibold mr-1">관리자</span>}
        {!canWarehouse && !canDisplay && !canAdmin && <span>조회 전용 (버튼 비활성)</span>}
      </div>
    </main>
  );
};

export default DisplayRequestListPage;
