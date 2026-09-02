// src/components/OcrPage/ConfirmedRecordsTab.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · OcrPage 에서 이관
// 프레임워크: Card · Modal · Spinner · StatusPill · IconTile · useConfirm · useToast · toastClass
import React from "react";
import axios from "axios";
import { Trash2, RefreshCw, FileText } from "lucide-react";
import { useConfirm } from "../../hooks/useConfirm";
import { useToast, toastClass } from "../../hooks/useToast";
import { IconTile } from "../common/IconTile";
import { Modal } from "../common/Modal";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import type { ConfirmedRecord } from "./OcrPage.types";
import { fmtNum, toNum } from "./OcrPage.types";

export const ConfirmedRecordsTab: React.FC = () => {
  const confirm = useConfirm();
  // 2026-08-21 · Framework Phase 3 · alert → useToast
  const { toast, showError } = useToast();
  const [dateFilter, setDateFilter] = React.useState<string>("");
  const [supplierFilter, setSupplierFilter] = React.useState<string>("");
  const [showBalanceOnly, setShowBalanceOnly] = React.useState<boolean>(false);
  const [items, setItems] = React.useState<ConfirmedRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  // 공급처 잔고 히스토리 팝업 상태
  const [balanceHistory, setBalanceHistory] = React.useState<{ supplier: string; items: ConfirmedRecord[] } | null>(null);
  const [balanceHistoryLoading, setBalanceHistoryLoading] = React.useState(false);
  // 2026-07-28 · 그룹핑 (invoice_date + supplier) · 상세보기 확장 · 이미지 모달 (사용자 요청)
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());
  const [imageModalUrl, setImageModalUrl] = React.useState<string | null>(null);
  const [imageModalTitle, setImageModalTitle] = React.useState<string>("");
  // 2026-07-28 · 사용자 요청 · 선택 삭제 (그룹 · 개별 record)
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = React.useState(false);

  const fetchItems = React.useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = new URLSearchParams();
      if (dateFilter) params.set("date", dateFilter);
      if (supplierFilter.trim()) params.set("supplier", supplierFilter.trim());
      if (showBalanceOnly) params.set("hasBalance", "true");
      const res = await axios.get(`/api/ocr-confirmed-items?${params.toString()}`);
      const items: ConfirmedRecord[] = Array.isArray(res.data?.items) ? res.data.items : [];
      // 2026-07-28 · 진단 로그 (이미지 없음 원인 파악 · 이미지 있는/없는 건수 · 첫 3개 샘플)
      const withImg = items.filter(x => !!x.image_url).length;
      console.log(`[ConfirmedRecordsTab] 조회 완료 · 총 ${items.length}건 · image_url 있음 ${withImg}건 · 없음 ${items.length - withImg}건`);
      if (items.length > 0) {
        console.log(`[ConfirmedRecordsTab] 샘플 첫 항목:`, {
          id: items[0].id, supplier: items[0].supplier, product_name: items[0].product_name,
          image_url: items[0].image_url, image_public_id: items[0].image_public_id,
          keys: Object.keys(items[0]),
        });
      }
      setItems(items);
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e?.message ?? "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [dateFilter, supplierFilter, showBalanceOnly]);

  const openBalanceHistory = React.useCallback(async (supplier: string) => {
    if (!supplier) return;
    setBalanceHistory({ supplier, items: [] });
    setBalanceHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("supplier", supplier);
      params.set("hasBalance", "true");
      const res = await axios.get(`/api/ocr-confirmed-items?${params.toString()}`);
      const list: ConfirmedRecord[] = Array.isArray(res.data?.items) ? res.data.items : [];
      setBalanceHistory({ supplier, items: list });
    } catch (e: any) {
      // 조회 실패해도 팝업은 유지 (빈 목록)
      setBalanceHistory({ supplier, items: [] });
    } finally {
      setBalanceHistoryLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (id: number) => {
    if (!await confirm({ message: "이 항목을 삭제하시겠습니까?", danger: true })) return;
    setDeletingId(id);
    try {
      await axios.delete(`/api/ocr-confirmed-items/${id}`);
      setItems(prev => prev.filter(x => x.id !== id));
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    } catch (e: any) {
      showError(e?.response?.data?.error ?? e?.message ?? "삭제 실패");
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!await confirm({ message: `선택한 ${selectedIds.size}건을 삭제하시겠습니까?`, danger: true })) return;
    setBulkDeleting(true);
    const ids = [...selectedIds];
    let ok = 0, fail = 0;
    // 병렬 삭제 · 실패는 개별 카운트
    await Promise.all(ids.map(async (id) => {
      try {
        await axios.delete(`/api/ocr-confirmed-items/${id}`);
        ok++;
      } catch { fail++; }
    }));
    setItems(prev => prev.filter(x => !selectedIds.has(x.id)));
    setSelectedIds(new Set());
    setBulkDeleting(false);
    if (fail > 0) showError(`${ok}건 삭제 · ${fail}건 실패`);
  };

  const toggleSelectId = (id: number) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelectGroup = (recordIds: number[], allSelected: boolean) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (allSelected) recordIds.forEach(id => n.delete(id));
      else recordIds.forEach(id => n.add(id));
      return n;
    });
  };

  const toggleSelectAll = (allIds: number[], allSelected: boolean) => {
    setSelectedIds(allSelected ? new Set() : new Set(allIds));
  };

  const supplierOptions = React.useMemo(
    () => [...new Set(items.map(x => x.supplier).filter(Boolean))].sort(),
    [items],
  );
  const grandTotal = items.reduce((s, x) => s + toNum(x.amount), 0);

  // 2026-07-28 · 사용자 요청 · 명세서 단위 그룹핑 (invoice_date + supplier)
  interface GroupInfo {
    key: string;
    invoiceDate: string;
    supplier: string;
    records: ConfirmedRecord[];
    count: number;
    total: number;
    imageUrl: string | null;
  }
  const groups: GroupInfo[] = React.useMemo(() => {
    const m = new Map<string, GroupInfo>();
    for (const x of items) {
      const invD = x.invoice_date || x.saved_at?.slice(0, 10) || "미상";
      const supp = x.supplier || "미상";
      const key = `${invD}||${supp}`;
      if (!m.has(key)) {
        m.set(key, {
          key, invoiceDate: invD, supplier: supp,
          records: [], count: 0, total: 0,
          imageUrl: x.image_url || null,
        });
      }
      const g = m.get(key)!;
      g.records.push(x);
      g.count += 1;
      g.total += toNum(x.amount);
      if (!g.imageUrl && x.image_url) g.imageUrl = x.image_url;
    }
    return [...m.values()].sort((a, b) => (b.invoiceDate + b.supplier).localeCompare(a.invoiceDate + a.supplier));
  }, [items]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  return (
    <div className="flex-1 w-full mx-auto px-3 sm:px-4 py-4 flex flex-col gap-3">
      <Card clip padding="none">
        <div className="px-4 py-3 border-b border-zinc-100 bg-rose-50 flex items-center gap-2 flex-wrap">
          <FileText size={13} className="text-rose-600" />
          <span className="text-xs font-bold text-rose-800">거래명세서 조회</span>
          <span className="text-[15px] text-rose-500">저장된 확정 항목을 조회·삭제합니다{dateFilter ? "" : " (기본: 최근 30일)"}</span>
          <button
            onClick={fetchItems}
            disabled={loading}
            className="ml-auto p-1 rounded-lg hover:bg-rose-100 cursor-pointer disabled:opacity-40"
            title="새로고침"
          >
            <RefreshCw size={13} className={`text-rose-400 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-zinc-100 bg-zinc-50 flex flex-wrap gap-2 items-center">
          <label className="flex items-center gap-1.5 text-[15px] font-bold text-gray-600">
            날짜
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="border border-line rounded px-2 py-1 text-xs outline-none focus:border-brand-deep bg-white"
            />
          </label>
          {dateFilter && (
            <button
              onClick={() => setDateFilter("")}
              className="text-[14px] text-gray-400 hover:text-gray-600 underline cursor-pointer"
            >날짜 해제</button>
          )}
          <label className="flex items-center gap-1.5 text-[15px] font-bold text-gray-600">
            공급처
            <input
              type="text"
              list="ocr-conf-supplier-list"
              value={supplierFilter}
              onChange={e => setSupplierFilter(e.target.value)}
              placeholder="공급처명 검색"
              className="border border-line rounded px-2 py-1 text-xs outline-none focus:border-brand-deep bg-white min-w-[160px]"
            />
            <datalist id="ocr-conf-supplier-list">
              {supplierOptions.map(s => <option key={s} value={s} />)}
            </datalist>
          </label>
          {supplierFilter && (
            <button
              onClick={() => setSupplierFilter("")}
              className="text-[14px] text-gray-400 hover:text-gray-600 underline cursor-pointer"
            >공급처 해제</button>
          )}
          <label className="flex items-center gap-1.5 text-[15px] font-bold text-gray-600 cursor-pointer select-none ml-2">
            <input
              type="checkbox"
              checked={showBalanceOnly}
              onChange={e => setShowBalanceOnly(e.target.checked)}
              className="accent-orange-500"
            />
            <span className={showBalanceOnly ? "text-orange-700" : ""}>잔고만 보기</span>
          </label>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="ml-auto inline-flex items-center gap-1 text-[15px] font-bold text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-40 rounded px-2.5 py-1 cursor-pointer shadow-sm"
              title={`선택한 ${selectedIds.size}건 삭제`}
            >
              {bulkDeleting ? <Spinner size={12} /> : <Trash2 size={12} />}
              선택삭제 <span className="bg-white text-rose-600 rounded px-1 ml-0.5">{selectedIds.size}</span>
            </button>
          )}
          <span className={`text-[15px] text-gray-500 font-bold ${selectedIds.size > 0 ? "ml-2" : "ml-auto"}`}>
            {items.length}건{grandTotal > 0 && <span className="ml-2 text-rose-600">총 {fmtNum(grandTotal)}원</span>}
          </span>
        </div>

        {err && (
          <div className="px-4 py-2 text-[15px] text-rose-700 bg-rose-50 border-b border-rose-100 font-semibold">
            {err}
          </div>
        )}

        {loading && items.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 py-1.5 bg-rose-50 border-b border-rose-200 sticky top-0 z-10">
            <Spinner size={11} tone="rose" label="새로 불러오는 중..." labelSize={14} />
          </div>
        )}
        {loading && items.length === 0 ? (
          <div className="px-4 py-10 flex items-center justify-center"><Spinner tone="zinc" label="불러오는 중..." labelSize={12} /></div>
        ) : !loading && items.length === 0 ? (
          <div className="px-4 py-10 text-center text-gray-400 text-xs">
            저장된 항목이 없습니다.
          </div>
        ) : (
          <div className={`overflow-x-auto ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
            {/* 2026-07-28 · 사용자 요청 · 명세서 그룹핑 (date + supplier) · 상세보기 · 이미지보기 */}
            <table className="w-full text-xs border-collapse">
              {/* 2026-08-24 · v3 확산 · thead · bg zinc-100/70 · Attio 톤 · rose 제거 */}
              <thead>
                <tr className="bg-zinc-100/70 border-b border-line text-[13px] sm:text-[14px] font-bold text-zinc-500 uppercase tracking-wider">
                  <th className="px-2 py-2.5 w-8 text-center">
                    {(() => {
                      const allIds = items.map(x => x.id);
                      const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
                      return (
                        <input type="checkbox"
                          checked={allSelected}
                          onChange={() => toggleSelectAll(allIds, allSelected)}
                          className="w-3.5 h-3.5 accent-brand-deep cursor-pointer"
                          title={allSelected ? "전체 해제" : "전체 선택"}
                        />
                      );
                    })()}
                  </th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap w-28">거래일</th>
                  <th className="px-3 py-2.5 text-left">공급사</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">건수</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">합계</th>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap">이미지</th>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap">상세</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g => {
                  const isExpanded = expandedGroups.has(g.key);
                  const recordIds = g.records.map(r => r.id);
                  const groupAllSelected = recordIds.length > 0 && recordIds.every(id => selectedIds.has(id));
                  const groupSomeSelected = !groupAllSelected && recordIds.some(id => selectedIds.has(id));
                  return (
                    <React.Fragment key={g.key}>
                      <tr className={`border-t border-gray-100 hover:bg-rose-50/30 ${groupAllSelected ? "bg-rose-50/60" : "bg-white"}`}>
                        <td className="px-2 py-2 text-center">
                          <input type="checkbox"
                            checked={groupAllSelected}
                            ref={el => { if (el) el.indeterminate = groupSomeSelected; }}
                            onChange={() => toggleSelectGroup(recordIds, groupAllSelected)}
                            className="w-3.5 h-3.5 accent-rose-500 cursor-pointer"
                            title={groupAllSelected ? "이 명세서 해제" : "이 명세서 전체 선택"}
                          />
                        </td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap tabular-nums text-[14px]">{g.invoiceDate}</td>
                        <td className="px-3 py-2 text-sky-700 font-bold whitespace-nowrap">{g.supplier}</td>
                        <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap tabular-nums">{g.count}건</td>
                        <td className="px-3 py-2 text-right font-bold text-amber-700 whitespace-nowrap tabular-nums">{fmtNum(g.total)}원</td>
                        <td className="px-3 py-2 text-center">
                          {g.imageUrl ? (
                            <button type="button"
                              onClick={() => { setImageModalUrl(g.imageUrl); setImageModalTitle(`${g.invoiceDate} · ${g.supplier}`); }}
                              className="text-[15px] font-bold text-indigo-600 hover:text-white hover:bg-brand-deep border border-indigo-300 rounded px-2 py-0.5 transition cursor-pointer"
                              title="거래명세서 이미지 보기"
                            >🖼 보기</button>
                          ) : (
                            <span className="text-gray-300 text-[14px] cursor-help"
                              title="이미지 URL 이 저장되지 않은 항목입니다.&#10;가능 원인:&#10; · DB 컬럼 image_url 미존재 (Supabase ALTER TABLE 필요)&#10; · 컬럼 추가 이전에 저장된 오래된 항목&#10; · Cloudinary 업로드 실패 (원본 저장 시 콘솔 로그 확인)">이미지 없음</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button type="button"
                            onClick={() => toggleGroup(g.key)}
                            className={`text-[15px] font-bold rounded px-2 py-0.5 transition cursor-pointer ${isExpanded ? "text-white bg-rose-500 hover:bg-rose-600" : "text-rose-700 border border-rose-300 hover:bg-rose-50"}`}
                          >
                            {isExpanded ? "▲ 접기" : "▼ 상세보기"}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-zinc-50/60 border-t border-line">
                          <td colSpan={7} className="px-3 py-2">
                            {/* 명세서 메타 정보 요약 */}
                            <div className="flex flex-wrap items-center gap-3 pb-2 mb-2 border-b border-line text-[15px]">
                              <span className="font-bold text-zinc-600">거래일 <span className="text-zinc-900 tabular-nums">{g.invoiceDate}</span></span>
                              <span className="font-bold text-zinc-600">공급사 <span className="text-sky-700">{g.supplier}</span></span>
                              <span className="font-bold text-zinc-600">품목 <span className="text-gray-800">{g.count}건</span></span>
                              <span className="font-bold text-zinc-600">합계 <span className="text-amber-700">{fmtNum(g.total)}원</span></span>
                              {g.records[0]?.saved_at && (
                                <span className="font-bold text-zinc-500">저장일 <span className="text-zinc-700 tabular-nums">{g.records[0].saved_at.slice(0, 10)}</span></span>
                              )}
                              {g.imageUrl && (
                                <button type="button"
                                  onClick={() => { setImageModalUrl(g.imageUrl); setImageModalTitle(`${g.invoiceDate} · ${g.supplier}`); }}
                                  className="ml-auto text-[14px] font-bold text-indigo-600 hover:text-white hover:bg-brand-deep border border-indigo-300 rounded px-2 py-0.5 transition cursor-pointer"
                                >🖼 이미지</button>
                              )}
                            </div>
                            <table className="w-full text-[15px] border-collapse">
                              <thead>
                                <tr className="bg-zinc-100 border-b border-line">
                                  <th className="px-2 py-1.5 w-8 text-center" />
                                  <th className="px-2 py-1.5 text-left font-bold text-zinc-700">품명·코드</th>
                                  <th className="px-2 py-1.5 text-right font-bold text-zinc-700 w-16">수량</th>
                                  <th className="px-2 py-1.5 text-right font-bold text-zinc-700 w-20">단가</th>
                                  <th className="px-2 py-1.5 text-right font-bold text-zinc-700 w-24">금액</th>
                                  <th className="px-2 py-1.5 text-right font-bold text-zinc-700 w-20">잔고</th>
                                  <th className="px-2 py-1.5 text-left font-bold text-zinc-700 w-28">유통기한</th>
                                  <th className="px-2 py-1.5 text-left font-bold text-zinc-700 w-36">메모</th>
                                  <th className="px-2 py-1.5 w-8" />
                                </tr>
                              </thead>
                              <tbody>
                                {g.records.map(x => (
                                  <tr key={x.id} className={`border-t border-gray-100 ${selectedIds.has(x.id) ? "bg-rose-50/50" : "hover:bg-white"}`}>
                                    <td className="px-2 py-1.5 text-center">
                                      <input type="checkbox"
                                        checked={selectedIds.has(x.id)}
                                        onChange={() => toggleSelectId(x.id)}
                                        className="w-3 h-3 accent-rose-500 cursor-pointer"
                                      />
                                    </td>
                                    <td className="px-2 py-1.5 font-semibold text-gray-800">
                                      <div className="flex flex-col">
                                        <span className="break-words">{x.product_name}</span>
                                        {x.product_code && <span className="text-[14px] text-gray-400 font-mono">{x.product_code}</span>}
                                      </div>
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-gray-700 whitespace-nowrap tabular-nums">{fmtNum(x.quantity)}</td>
                                    <td className="px-2 py-1.5 text-right text-gray-700 whitespace-nowrap tabular-nums">{fmtNum(x.unit_price)}</td>
                                    <td className="px-2 py-1.5 text-right font-bold text-amber-700 whitespace-nowrap tabular-nums">{fmtNum(x.amount)}</td>
                                    <td className="px-2 py-1.5 text-right font-bold text-orange-600 whitespace-nowrap tabular-nums">
                                      {toNum(x.balance) > 0 ? (
                                        <button type="button" onClick={() => openBalanceHistory(x.supplier)} className="hover:underline hover:text-orange-800 cursor-pointer" title={`${x.supplier} 잔고 히스토리`}>
                                          {fmtNum(x.balance)}
                                        </button>
                                      ) : fmtNum(x.balance)}
                                    </td>
                                    <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap text-[14px] tabular-nums">{x.expiry_date ?? ""}</td>
                                    <td className="px-2 py-1.5 text-gray-500 text-[14px] break-words">{x.memo ?? ""}</td>
                                    <td className="px-2 py-1.5 text-right">
                                      <button onClick={() => handleDelete(x.id)} disabled={deletingId === x.id} className="p-1 text-gray-300 hover:text-rose-500 cursor-pointer disabled:opacity-40" title="삭제">
                                        {deletingId === x.id ? <Spinner size={11} /> : <Trash2 size={11} />}
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 2026-07-28 · 이미지 모달 · Cloudinary 저장된 거래명세서 이미지 */}
      {/* 2026-08-23 #191 · Modal primitive 마이그레이션 */}
      <Modal
        open={!!imageModalUrl}
        onClose={() => setImageModalUrl(null)}
        title={imageModalTitle}
        backdropIntensity="brand-strong"
        size="full"
      >
        {imageModalUrl && (
          <div className="-m-5 flex items-center justify-center p-4 bg-black/10 rounded-b-2xl">
            <img src={imageModalUrl} alt="거래명세서" className="max-w-full max-h-[80vh] object-contain rounded shadow-2xl" />
          </div>
        )}
      </Modal>

      {/* ── 공급처 잔고 히스토리 모달 · 2026-08-18 · <Modal> 프레임워크 통합 */}
      <Modal
        open={!!balanceHistory}
        onClose={() => setBalanceHistory(null)}
        size="sm"
        titleAccent
        icon={<IconTile icon={<FileText size={14} />} tone="orange" size="md" />}
        title={
          <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
            <span className="text-[16px] font-bold text-ink tracking-tight break-words whitespace-normal">
              {balanceHistory?.supplier} 잔고 히스토리
            </span>
          </div>
        }
        headerRight={
          balanceHistory ? (
            <StatusPill tone="amber" size="md">{balanceHistory.items.length}건</StatusPill>
          ) : undefined
        }
      >
        {balanceHistoryLoading ? (
          <div className="py-8 flex items-center justify-center"><Spinner tone="zinc" label="불러오는 중..." labelSize={13} /></div>
        ) : !balanceHistory || balanceHistory.items.length === 0 ? (
          <div className="py-8 text-center text-ink-soft text-[13px]">
            잔고가 기록된 항목이 없습니다.
          </div>
        ) : (
          <table className="w-full text-[13px] border-collapse">
            <thead className="sticky top-0 bg-white">
              <tr className="bg-orange-50/60 border-b border-orange-100">
                <th className="px-3 py-2 text-left font-bold text-orange-800 whitespace-nowrap">저장일</th>
                <th className="px-3 py-2 text-left font-bold text-orange-800">품명</th>
                <th className="px-3 py-2 text-right font-bold text-orange-800 whitespace-nowrap">잔고</th>
              </tr>
            </thead>
            <tbody>
              {balanceHistory.items.map(it => (
                <tr key={it.id} className="border-t border-line/50 hover:bg-orange-50/30">
                  <td className="px-3 py-2 text-ink-soft whitespace-nowrap">{it.saved_at}</td>
                  <td className="px-3 py-2 font-semibold text-ink">
                    <span className="break-words">{it.product_name}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-orange-700 whitespace-nowrap tabular-nums">
                    {fmtNum(it.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
      {/* 2026-08-21 · Framework Phase 3 · toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </div>
  );
};
