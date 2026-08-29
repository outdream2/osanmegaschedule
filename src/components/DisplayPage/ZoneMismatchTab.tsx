// src/components/DisplayPage/ZoneMismatchTab.tsx
// 2026-08-25 · 사용자 지시 · 매장구역 안 배치구역 불일치 탭 (RequestsPage 에서 이관)
//   · /api/zone-mismatches · GET · DELETE
//   · 상품별 · 전산 spec_zone vs 실제 real_zone · 불일치 목록
// 2026-08-25 v2 · 사용자 지시 · 표형식 · TableListWrap 프리미티브 적용
// 2026-08-25 v3 · 사용자 지시 · 인라인 편집 (상품명 · 전산구역 · 실제구역) + 폰트 +3

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Trash2, Check, Pencil, X as XIcon, ChevronDown, ChevronRight } from "lucide-react";
// 2026-08-29 · #165 Phase A · SearchBar 프리미티브
import { SearchBar } from "../common/SearchBar";
// 2026-08-29 · 사용자 지시 · 상품명 검색 · 통일 로직
import { matchesProductQuery } from "../../lib/productMatch";
import { api, ApiError } from "../../lib/apiClient";
import { Card } from "../common/Card";
import { EmptyState } from "../common/EmptyState";
import { Spinner } from "../common/Spinner";
import { TableListWrap, tableHeadCls, tableThCls, tableTdCls } from "../common/TableList";
import { useToast, toastClass } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
// 2026-08-29 · #154 Phase 1 · 판매중 3-way 필터
import { useSaleStatusFilter } from "../../hooks/useSaleStatusFilter";
import { SaleStatusFilter } from "../common/SaleStatusFilter";

interface ZoneMismatch {
  id: string;
  product_code: string;
  product_name: string;
  category_code?: string | null; // 2026-08-26 · 사용자 지시 · 분류코드
  spec_zone: string;
  real_zone: string;
  sale_status?: string | null; // 2026-08-29 · #154 Phase 1 · 3-way 필터용
  registered_at: string;
}

type EditField = "product_name" | "spec_zone" | "real_zone";

function fmtDate(s: string): string {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// products PATCH 필드 매핑 · zone-mismatch 컬럼명 → products 컬럼명
const fieldToProductsColumn = (f: EditField): string => (
  f === "spec_zone" ? "spec"
  : f === "real_zone" ? "real_map"
  : "product_name"
);

export const ZoneMismatchTab: React.FC = () => {
  const [rows, setRows] = useState<ZoneMismatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; field: EditField } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // 2026-08-26 · #124 · 사용자 지시 · 검색 기능
  const [search, setSearch] = useState("");
  // 2026-08-29 · #189 · 체크박스 bulk 선택 · 그룹 접기/펼치기 (기본 펼침)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [collapsedZones, setCollapsedZones] = useState<Set<string>>(new Set());
  const { toast, showError, showSuccess } = useToast();
  const confirm = useConfirm();
  // 2026-08-29 · #154 Phase 1 · 3-way 판매중 필터 (전체/판매중/판매중지)
  const { value: saleFilter, setValue: setSaleFilter, matches: saleMatches } = useSaleStatusFilter({ storageKey: "zoneMismatch.saleFilter" });

  const toggleSelected = (id: string) => setSelectedIds(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleZone = (zone: string) => setCollapsedZones(prev => {
    const n = new Set(prev);
    if (n.has(zone)) n.delete(zone); else n.add(zone);
    return n;
  });

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    api.get<{ rows?: ZoneMismatch[] } | ZoneMismatch[]>("/api/zone-mismatches")
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : (data?.rows ?? []);
        setRows(list);
      })
      .catch((e: unknown) => {
        const msg = e instanceof ApiError ? e.message : (e as any)?.message ?? "네트워크 오류";
        setError(msg);
        showError(`배치구역 불일치 조회 실패: ${msg}`);
      })
      .finally(() => setLoading(false));
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const deleteOne = async (id: string) => {
    const target = rows.find(r => r.id === id);
    const label = target ? target.product_name : `#${id}`;
    if (!await confirm({ message: `${label} · 배치구역 불일치 기록 삭제?`, danger: true })) return;
    try {
      await api.del(`/api/zone-mismatches/${id}`);
      setRows(prev => prev.filter(r => r.id !== id));
      showSuccess("삭제되었습니다");
    } catch (e: any) {
      showError(`삭제 실패: ${e?.message ?? "네트워크 오류"}`);
    }
  };

  const deleteAll = async () => {
    if (rows.length === 0) return;
    if (!await confirm({ message: `전체 ${rows.length}건 삭제할까요?`, danger: true })) return;
    try {
      await Promise.all(rows.map(r => api.del(`/api/zone-mismatches/${r.id}`)));
      setRows([]);
      setSelectedIds(new Set());
      showSuccess(`${rows.length}건 삭제되었습니다`);
    } catch (e: any) {
      showError(`일괄 삭제 실패: ${e?.message ?? "네트워크 오류"}`);
      load();
    }
  };

  // 2026-08-29 · #189 · 선택 삭제 (bulk)
  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!await confirm({ message: `선택된 ${selectedIds.size}건 삭제할까요?`, danger: true })) return;
    const targetIds = Array.from(selectedIds);
    try {
      await Promise.all(targetIds.map(id => api.del(`/api/zone-mismatches/${id}`)));
      setRows(prev => prev.filter(r => !selectedIds.has(r.id)));
      setSelectedIds(new Set());
      showSuccess(`${targetIds.length}건 삭제되었습니다`);
    } catch (e: any) {
      showError(`선택 삭제 실패: ${e?.message ?? "네트워크 오류"}`);
      load();
    }
  };

  const startEdit = (row: ZoneMismatch, field: EditField) => {
    setEditing({ id: row.id, field });
    const cur = field === "product_name" ? row.product_name
              : field === "spec_zone"    ? row.spec_zone
              :                            row.real_zone;
    setEditValue(cur === "미지정" ? "" : String(cur ?? ""));
  };
  const cancelEdit = () => { setEditing(null); setEditValue(""); };

  const commitEdit = async () => {
    if (!editing) return;
    const row = rows.find(r => r.id === editing.id);
    if (!row) { cancelEdit(); return; }
    const value = editValue.trim();
    setSavingKey(`${editing.id}:${editing.field}`);
    try {
      const col = fieldToProductsColumn(editing.field);
      await api.patch(`/api/products/${encodeURIComponent(row.product_code)}`, { [col]: value === "" ? null : value });
      setRows(prev => prev.map(r => (
        r.id === row.id
          ? { ...r,
              product_name: editing.field === "product_name" ? value : r.product_name,
              spec_zone:    editing.field === "spec_zone"    ? (value || "미지정") : r.spec_zone,
              real_zone:    editing.field === "real_zone"    ? value : r.real_zone,
            }
          : r
      )));
      showSuccess("저장되었습니다");
      cancelEdit();
    } catch (e: any) {
      showError(`저장 실패: ${e?.message ?? "네트워크 오류"}`);
    } finally {
      setSavingKey(null);
    }
  };

  // 2026-08-26 · 사용자 지시 · 전산구역·실제위치 둘 다 있는 것만 표시 (하나라도 없으면 미배정 페이지로)
  const sorted = useMemo(() => {
    const isValidZone = (v: string | null | undefined) =>
      !!v && String(v).trim() !== "" && String(v).trim() !== "미지정";
    const bothPresent = rows.filter(r => isValidZone(r.spec_zone) && isValidZone(r.real_zone));
    // 2026-08-29 · #154 Phase 1 · 3-way 판매중 필터 적용 (sale_status null 이면 "all" 만 통과)
    const saleFiltered = bothPresent.filter(r => saleMatches(r.sale_status));
    // 2026-08-29 · 통일 로직 · matchesProductQuery + 구역 필드 (spec_zone·real_zone) 추가 매칭
    const q = search.trim().toLowerCase();
    const filtered = q
      ? saleFiltered.filter(r =>
          matchesProductQuery(r, search) ||
          String(r.spec_zone ?? "").toLowerCase().includes(q) ||
          String(r.real_zone ?? "").toLowerCase().includes(q)
        )
      : saleFiltered;
    return [...filtered].sort((a, b) => (b.registered_at ?? "").localeCompare(a.registered_at ?? ""));
  }, [rows, search, saleMatches]);

  // 2026-08-29 · #189 · 구역별 정렬·그룹핑 (real_zone 기준 · 정합성 우선)
  //   · Map 은 insertion order 유지 · 정렬된 zone key 순으로 삽입
  const groups = useMemo(() => {
    const g = new Map<string, ZoneMismatch[]>();
    const sortedByZone = [...sorted].sort((a, b) =>
      String(a.real_zone ?? "").localeCompare(String(b.real_zone ?? ""), "ko", { numeric: true })
    );
    for (const r of sortedByZone) {
      const zone = String(r.real_zone ?? "미지정");
      if (!g.has(zone)) g.set(zone, []);
      g.get(zone)!.push(r);
    }
    return g;
  }, [sorted]);

  // 그룹별 · 전체 선택 판정 · 클릭 시 · 그 그룹 rows 만 · 선택/해제 토글
  const isZoneAllSelected = (zoneRows: ZoneMismatch[]) =>
    zoneRows.length > 0 && zoneRows.every(r => selectedIds.has(r.id));
  const toggleZoneAll = (zoneRows: ZoneMismatch[]) => setSelectedIds(prev => {
    const n = new Set(prev);
    const allSel = zoneRows.every(r => n.has(r.id));
    if (allSel) zoneRows.forEach(r => n.delete(r.id));
    else zoneRows.forEach(r => n.add(r.id));
    return n;
  });
  const isAllSelected = sorted.length > 0 && sorted.every(r => selectedIds.has(r.id));
  const toggleAll = () => setSelectedIds(prev => {
    if (sorted.every(r => prev.has(r.id))) return new Set();
    return new Set(sorted.map(r => r.id));
  });

  const inputCls = "w-full h-8 px-2 rounded-md border border-brand-deep bg-white text-[17px] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-tint";

  const renderEditable = (row: ZoneMismatch, field: EditField, display: React.ReactNode, extraCls = ""): React.ReactNode => {
    const isEditing = editing?.id === row.id && editing?.field === field;
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")  { e.preventDefault(); commitEdit(); }
              if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
            }}
            className={inputCls}
            disabled={savingKey === `${row.id}:${field}`}
          />
          <button
            type="button"
            onClick={commitEdit}
            disabled={savingKey === `${row.id}:${field}`}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-40"
            title="저장 (Enter)"
          >
            {savingKey === `${row.id}:${field}` ? <Spinner size={12} tone="white" /> : <Check size={13} />}
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            disabled={savingKey === `${row.id}:${field}`}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md bg-white border border-line hover:bg-zinc-50 text-zinc-500 cursor-pointer disabled:opacity-40"
            title="취소 (Esc)"
          >
            <XIcon size={13} />
          </button>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => startEdit(row, field)}
        className={`group inline-flex items-center gap-1.5 text-left hover:bg-brand-tint/40 rounded-md px-1.5 py-0.5 cursor-pointer transition ${extraCls}`}
        title="클릭하여 편집"
      >
        <span>{display}</span>
        <Pencil size={11} className="text-zinc-300 group-hover:text-brand-deep transition opacity-0 group-hover:opacity-100" />
      </button>
    );
  };

  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
      {/* 2026-08-25 · 사용자 지시 · 폰트 +3 · 전체 텍스트 사이즈 상향 */}
      <div className="flex flex-col gap-3">
        {/* 헤더 툴바 */}
        <div className="flex items-center gap-2 flex-wrap px-1">
          <AlertTriangle size={21} className="text-rose-500 shrink-0" />
          <span className="text-[20px] font-bold text-ink tracking-tight">배치구역 불일치</span>
          <span className="text-[18px] tabular-nums font-semibold text-ink-soft">
            {loading ? <Spinner size={13} tone="rose" className="inline" /> : `${sorted.length}${search ? `/${rows.length}` : ""}건`}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {/* 2026-08-29 · #154 Phase 1 · 판매중 3-way 필터 */}
            <SaleStatusFilter value={saleFilter} onChange={setSaleFilter} />
            {/* 2026-08-29 · #165 Phase A · SearchBar 프리미티브 · 결과 카운트·최근 검색 */}
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="상품명·코드·구역 검색"
              resultCount={sorted.length}
              historyKey="megatown_zonemismatch_search"
              accent="rose"
            />
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-white border border-line text-[16px] font-bold text-ink-soft hover:bg-zinc-50 hover:border-brand-deep hover:text-brand-deep transition cursor-pointer disabled:opacity-40"
              title="새로고침"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> 새로고침
            </button>
            {/* 2026-08-29 · #189 · 선택 삭제 · 선택된 것만 · 개수 뱃지 */}
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={deleteSelected}
                disabled={loading}
                className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-amber-500 text-white text-[16px] font-bold hover:bg-amber-600 shadow-sm transition cursor-pointer disabled:opacity-40"
                title="선택 삭제"
              >
                <Trash2 size={13} /> 선택 삭제 <span className="ml-1 px-1.5 py-0.5 rounded-md bg-white/25 text-[13px] tabular-nums">{selectedIds.size}</span>
              </button>
            )}
            {rows.length > 0 && (
              <button
                type="button"
                onClick={deleteAll}
                disabled={loading}
                className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-rose-500 text-white text-[16px] font-bold hover:bg-rose-600 shadow-sm transition cursor-pointer disabled:opacity-40"
                title="전체 삭제"
              >
                <Trash2 size={13} /> 전체 삭제
              </button>
            )}
          </div>
        </div>

        {/* 리스트 */}
        {loading && rows.length === 0 ? (
          <Card padding="none" className="flex items-center justify-center py-12">
            <Spinner size={16} tone="rose" label="배치구역 불일치 로딩 중..." labelSize={17} />
          </Card>
        ) : error ? (
          <Card variant="flat" bg="bg-rose-50" borderColor="border-rose-200" padding="md" className="text-[17px] text-rose-700 font-semibold">
            ⚠ {error}
            <button onClick={load} className="ml-2 underline cursor-pointer">다시 시도</button>
          </Card>
        ) : rows.length === 0 ? (
          <Card padding="none" className="py-12">
            <EmptyState
              icon={AlertTriangle}
              title="배치구역 불일치 없음"
              hint="전산 구역과 실제 배치가 모두 일치합니다"
              size="normal"
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {/* 2026-08-29 · #189 · 전체 선택 헤더 (구역별 그룹 위) */}
            <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50/60 border border-line rounded-lg">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleAll}
                className="w-4 h-4 accent-brand-deep cursor-pointer"
                aria-label="전체 선택"
              />
              <span className="text-[15px] font-semibold text-ink-soft">전체 {sorted.length}건</span>
              {selectedIds.size > 0 && (
                <span className="ml-auto text-[14px] font-bold text-amber-700">
                  {selectedIds.size}건 선택됨
                </span>
              )}
            </div>

            {/* 2026-08-29 · #189 · 구역별 그룹 · 기본 펼침 · 접기 지원 */}
            {Array.from(groups.entries()).map(([zone, zoneRows]) => {
              const collapsed = collapsedZones.has(zone);
              const zoneSelAll = isZoneAllSelected(zoneRows);
              return (
                <TableListWrap key={zone}>
                  {/* 그룹 헤더 · 접기·전체선택·구역 라벨·건수 */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-rose-50/40 border-b border-rose-200/60">
                    <button
                      type="button"
                      onClick={() => toggleZone(zone)}
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-rose-100/60 text-rose-500 cursor-pointer"
                      aria-label={collapsed ? "펼치기" : "접기"}
                    >
                      {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                    </button>
                    <input
                      type="checkbox"
                      checked={zoneSelAll}
                      onChange={() => toggleZoneAll(zoneRows)}
                      className="w-4 h-4 accent-rose-500 cursor-pointer"
                      aria-label={`${zone} 전체 선택`}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="text-[17px] font-bold text-rose-700">📍 {zone}</span>
                    <span className="text-[15px] font-semibold text-rose-500 tabular-nums">{zoneRows.length}건</span>
                  </div>
                  {!collapsed && (
                    <table className="w-full border-collapse">
                      <thead className={tableHeadCls("text-[15px]")}>
                        <tr>
                          <th className={tableThCls("center")} style={{ width: "5%" }}></th>
                          <th className={tableThCls("left")} style={{ width: "12%" }}>분류코드</th>
                          <th className={tableThCls("left")} style={{ width: "28%" }}>상품명</th>
                          <th className={tableThCls("left")} style={{ width: "16%" }}>상품코드</th>
                          <th className={tableThCls("center")} style={{ width: "13%" }}>전산 구역</th>
                          <th className={tableThCls("center")} style={{ width: "11%" }}>등록일</th>
                          <th className={tableThCls("center")} style={{ width: "7%" }}>삭제</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {zoneRows.map(m => (
                          <tr key={m.id} className={`hover:bg-zinc-50/60 transition text-[17px] ${selectedIds.has(m.id) ? "bg-amber-50/40" : ""}`}>
                            <td className={tableTdCls("center")}>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(m.id)}
                                onChange={() => toggleSelected(m.id)}
                                className="w-4 h-4 accent-brand-deep cursor-pointer"
                                aria-label="선택"
                              />
                            </td>
                            <td className={tableTdCls("left", "font-mono text-[14px] text-zinc-500 tabular-nums")}>
                              {m.category_code ?? "-"}
                            </td>
                            <td className={tableTdCls("left", "font-bold text-zinc-800 break-keep")}>
                              {renderEditable(m, "product_name", m.product_name)}
                            </td>
                            <td className={tableTdCls("left", "font-mono text-[15px] text-zinc-500")}>{m.product_code}</td>
                            <td className={tableTdCls("center", "font-semibold text-zinc-700")}>
                              {renderEditable(m, "spec_zone",
                                m.spec_zone === "미지정"
                                  ? <span className="text-zinc-400">미지정</span>
                                  : m.spec_zone
                              )}
                            </td>
                            <td className={tableTdCls("center", "text-[15px] text-zinc-500 tabular-nums")}>{fmtDate(m.registered_at)}</td>
                            <td className={tableTdCls("center")}>
                              <button
                                type="button"
                                onClick={() => deleteOne(m.id)}
                                className="inline-flex w-8 h-8 items-center justify-center rounded-lg text-zinc-300 hover:text-rose-500 hover:bg-rose-50 transition cursor-pointer"
                                title="삭제"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </TableListWrap>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

export default ZoneMismatchTab;
