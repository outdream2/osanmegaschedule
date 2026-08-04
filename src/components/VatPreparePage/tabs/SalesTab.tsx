// src/components/VatPreparePage/tabs/SalesTab.tsx
// 2026-08-04 · Phase 1 · 부가세 매출 탭
//   - localStorage 기반 매출 입력 (useSalesLocal)
//   - 입력 폼: 매출일 · 유형 · 과세 여부 · 총액 · 상대명 · 메모
//   - 월별 요약 테이블 (과세/면세/카드/현금/세금계산서)
//   - 입력 리스트 (수정·삭제)
//   - Phase 2 · DB 이전 예정 (안내 배너 표시)

import React, { useMemo, useState } from "react";
import {
  Plus, Trash2, Pencil, Save, X, Info, Calendar, ReceiptText, Wallet,
  Landmark, AlertCircle,
} from "lucide-react";
import {
  useSalesLocal,
  SALE_TYPE_OPTIONS,
  DEFAULT_TAXABLE_BY_TYPE,
  calcOutputVat,
  calcSupply,
  type SaleType,
  type SalesEntry,
} from "../hooks/useSalesLocal";

const fmt = (n: number) => n.toLocaleString("ko-KR");

interface SalesTabProps {
  /** 조회 기간 · 부가세 신고 기간 필터 · YYYY-MM-DD */
  fromDate: string;
  toDate: string;
  /** 상단 KPI 갱신용 콜백 (매출 합계 · 매출세액 · 매출건수) */
  onAggregateChange?: (agg: {
    taxableSales: number;
    exemptSales: number;
    outputVat: number;
    salesRowCount: number;
  }) => void;
}

const SalesTab: React.FC<SalesTabProps> = ({ fromDate, toDate, onAggregateChange }) => {
  const sales = useSalesLocal({ from: fromDate, to: toDate });

  // 상위 KPI 갱신
  React.useEffect(() => {
    onAggregateChange?.({
      taxableSales: sales.taxableSales,
      exemptSales: sales.exemptSales,
      outputVat: sales.outputVat,
      salesRowCount: sales.salesRowCount,
    });
  }, [sales.taxableSales, sales.exemptSales, sales.outputVat, sales.salesRowCount, onAggregateChange]);

  // ── 입력 폼 상태 ─────────────────────────────────────────────
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [form, setForm] = useState<{
    sale_date: string;
    sale_type: SaleType;
    taxable: boolean;
    total_amount: string; // 입력 중에는 string
    customer_name: string;
    memo: string;
  }>({
    sale_date: todayISO,
    sale_type: "카드매출",
    taxable: true,
    total_amount: "",
    customer_name: "",
    memo: "",
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<SalesEntry>>({});

  const previewVat = useMemo(() => {
    if (!form.taxable) return 0;
    const total = Number(form.total_amount);
    if (!Number.isFinite(total) || total <= 0) return 0;
    return Math.round(total / 11);
  }, [form.taxable, form.total_amount]);

  const previewSupply = useMemo(() => {
    const total = Number(form.total_amount);
    if (!Number.isFinite(total) || total <= 0) return 0;
    return form.taxable ? total - previewVat : total;
  }, [form.taxable, form.total_amount, previewVat]);

  const handleTypeChange = (t: SaleType) => {
    setForm(prev => ({
      ...prev,
      sale_type: t,
      // 유형 변경 시 과세 여부 자동 세팅 (사용자 override 가능)
      taxable: DEFAULT_TAXABLE_BY_TYPE[t],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const total = Number(form.total_amount);
    if (!form.sale_date) return alert("매출일을 선택하세요");
    if (!Number.isFinite(total) || total <= 0) return alert("총액을 올바르게 입력하세요");

    sales.add({
      sale_date: form.sale_date,
      sale_type: form.sale_type,
      taxable: form.taxable,
      total_amount: total,
      customer_name: form.customer_name.trim() || undefined,
      memo: form.memo.trim() || undefined,
    });

    // 폼 리셋 (매출일·유형·과세 여부는 유지 · 반복 입력 편의)
    setForm(prev => ({
      ...prev,
      total_amount: "",
      customer_name: "",
      memo: "",
    }));
  };

  const startEdit = (row: SalesEntry) => {
    setEditingId(row.id);
    setEditForm({
      sale_date: row.sale_date,
      sale_type: row.sale_type,
      taxable: row.taxable,
      total_amount: row.total_amount,
      customer_name: row.customer_name ?? "",
      memo: row.memo ?? "",
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    const total = Number(editForm.total_amount);
    if (!Number.isFinite(total) || total <= 0) return alert("총액을 올바르게 입력하세요");
    sales.update(editingId, {
      sale_date: editForm.sale_date as string,
      sale_type: editForm.sale_type as SaleType,
      taxable: Boolean(editForm.taxable),
      total_amount: total,
      customer_name: (editForm.customer_name as string) || undefined,
      memo: (editForm.memo as string) || undefined,
    });
    setEditingId(null);
    setEditForm({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleDelete = (id: string) => {
    if (!confirm("이 매출을 삭제하시겠습니까? 되돌릴 수 없습니다.")) return;
    sales.remove(id);
    if (editingId === id) cancelEdit();
  };

  // ── 렌더 ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 min-h-0">
      {/* Phase 1 안내 배너 */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-[11px] text-amber-800">
        <Info size={14} className="mt-0.5 shrink-0" />
        <div className="leading-relaxed">
          <b>Phase 1 · 브라우저 저장</b> · 매출 데이터는 현재 이 브라우저에만 저장됩니다. 다른 기기에서는 보이지 않고, 브라우저 캐시 삭제 시 유실됩니다.
          <b> Phase 2 에서 DB 저장</b>으로 전환 예정입니다.
          <br />
          <span className="text-amber-700">본 계산은 참고용이며, 실제 신고는 반드시 세무사 검토 후 진행하세요.</span>
        </div>
      </div>

      {/* 입력 폼 */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-slate-200 shadow-sm p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <Plus size={14} className="text-rose-500" />
          <div className="text-[13px] font-black text-slate-800">매출 신규 입력</div>
          <div className="text-[10px] text-slate-400 ml-auto">Enter 로 저장</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          {/* 매출일 */}
          <div className="md:col-span-1">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">매출일</label>
            <input
              type="date"
              value={form.sale_date}
              onChange={e => setForm(prev => ({ ...prev, sale_date: e.target.value }))}
              className="w-full h-9 px-2 text-[12px] border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-rose-400"
              required
            />
          </div>

          {/* 매출 유형 */}
          <div className="md:col-span-1">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">유형</label>
            <select
              value={form.sale_type}
              onChange={e => handleTypeChange(e.target.value as SaleType)}
              className="w-full h-9 px-2 text-[12px] border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-rose-400"
            >
              {SALE_TYPE_OPTIONS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* 과세/면세 토글 */}
          <div className="md:col-span-1">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">과세 여부</label>
            <div className="flex h-9 border border-slate-300 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, taxable: true }))}
                className={`flex-1 text-[12px] font-bold transition ${
                  form.taxable ? "bg-rose-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                과세
              </button>
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, taxable: false }))}
                className={`flex-1 text-[12px] font-bold transition border-l border-slate-300 ${
                  !form.taxable ? "bg-slate-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                면세
              </button>
            </div>
          </div>

          {/* 총액 */}
          <div className="md:col-span-1">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              총액 (원)
              <span className="text-slate-400 font-normal ml-1">VAT 포함</span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={form.total_amount}
              onChange={e => setForm(prev => ({ ...prev, total_amount: e.target.value }))}
              placeholder="0"
              className="w-full h-9 px-2 text-[12px] text-right tabular-nums border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-rose-400"
              required
            />
          </div>

          {/* 상대명 */}
          <div className="md:col-span-1">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              상대명
              <span className="text-slate-400 font-normal ml-1">선택</span>
            </label>
            <input
              type="text"
              value={form.customer_name}
              onChange={e => setForm(prev => ({ ...prev, customer_name: e.target.value }))}
              placeholder="세금계산서 발행 시"
              className="w-full h-9 px-2 text-[12px] border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-rose-400"
            />
          </div>

          {/* 메모 */}
          <div className="md:col-span-1">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              메모
              <span className="text-slate-400 font-normal ml-1">선택</span>
            </label>
            <input
              type="text"
              value={form.memo}
              onChange={e => setForm(prev => ({ ...prev, memo: e.target.value }))}
              className="w-full h-9 px-2 text-[12px] border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-rose-400"
            />
          </div>
        </div>

        {/* 계산 프리뷰 + 저장 버튼 */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
            <span>
              <b className="text-slate-700">공급가액</b>
              {" · "}
              <span className="tabular-nums font-bold text-slate-800">{fmt(previewSupply)}</span>원
            </span>
            <span>
              <b className="text-slate-700">매출세액</b>
              {" · "}
              <span className="tabular-nums font-bold text-rose-700">{fmt(previewVat)}</span>원
            </span>
            {!form.taxable && (
              <span className="text-slate-500">
                <AlertCircle size={11} className="inline mb-0.5 mr-0.5" />
                면세 매출 · 부가세 0
              </span>
            )}
          </div>
          <button
            type="submit"
            className="ml-auto h-9 px-5 text-[12px] font-black rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition cursor-pointer flex items-center gap-1.5"
          >
            <Plus size={14} />
            매출 추가
          </button>
        </div>
      </form>

      {/* 월별 요약 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Calendar size={14} className="text-rose-500" />
          <div className="text-[13px] font-black text-slate-800">월별 매출 요약</div>
          <div className="text-[10px] font-bold text-slate-500 ml-auto">
            {fmt(sales.monthlySummary.length)}개월 · {fmt(sales.salesRowCount)}건
          </div>
        </div>
        <div className="overflow-x-auto">
          {sales.monthlySummary.length === 0 ? (
            <div className="py-8 text-center text-[11px] text-slate-300">
              이번 기간 매출 없음 · 위에서 입력하세요
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2 font-bold">월</th>
                  <th className="text-right px-2 py-2 font-bold">과세 공급가</th>
                  <th className="text-right px-2 py-2 font-bold">면세 매출</th>
                  <th className="text-right px-2 py-2 font-bold">매출세액</th>
                  <th className="text-right px-2 py-2 font-bold">카드</th>
                  <th className="text-right px-2 py-2 font-bold">현금</th>
                  <th className="text-right px-2 py-2 font-bold">세금계산서</th>
                  <th className="text-right px-2 py-2 font-bold">건수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sales.monthlySummary.map(m => (
                  <tr key={m.month} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-bold text-slate-800 tabular-nums">{m.month}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-700">{fmt(m.taxable)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-500">{fmt(m.exempt)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-black text-rose-700">{fmt(m.outputVat)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-600">{fmt(m.cardTotal)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-600">{fmt(m.cashTotal)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-600">{fmt(m.taxInvoiceTotal)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-500">{fmt(m.rowCount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-black text-slate-800">
                <tr>
                  <td className="px-3 py-2">합계</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(sales.taxableSales)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(sales.exemptSales)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-rose-700">{fmt(sales.outputVat)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmt(sales.monthlySummary.reduce((s, r) => s + r.cardTotal, 0))}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmt(sales.monthlySummary.reduce((s, r) => s + r.cashTotal, 0))}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmt(sales.monthlySummary.reduce((s, r) => s + r.taxInvoiceTotal, 0))}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(sales.salesRowCount)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* 입력 리스트 (수정·삭제) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <ReceiptText size={14} className="text-rose-500" />
          <div className="text-[13px] font-black text-slate-800">매출 입력 이력</div>
          <div className="text-[10px] font-bold text-slate-500 ml-auto">{fmt(sales.entries.length)}건</div>
        </div>
        <div className="overflow-x-auto max-h-[45vh] overflow-y-auto">
          {sales.entries.length === 0 ? (
            <div className="py-8 text-center text-[11px] text-slate-300">이번 기간 입력 매출 없음</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2 font-bold">매출일</th>
                  <th className="text-left px-2 py-2 font-bold">유형</th>
                  <th className="text-center px-2 py-2 font-bold">과세</th>
                  <th className="text-right px-2 py-2 font-bold">총액</th>
                  <th className="text-right px-2 py-2 font-bold">공급가액</th>
                  <th className="text-right px-2 py-2 font-bold">매출세액</th>
                  <th className="text-left px-2 py-2 font-bold">상대명</th>
                  <th className="text-left px-2 py-2 font-bold">메모</th>
                  <th className="px-2 py-2 w-[90px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sales.entries.map(row => {
                  const editing = editingId === row.id;
                  const supply = calcSupply(row);
                  const vat = calcOutputVat(row);
                  return (
                    <tr key={row.id} className={editing ? "bg-rose-50" : "hover:bg-slate-50"}>
                      <td className="px-3 py-1.5 tabular-nums">
                        {editing ? (
                          <input
                            type="date"
                            value={editForm.sale_date as string}
                            onChange={e => setEditForm(prev => ({ ...prev, sale_date: e.target.value }))}
                            className="h-7 px-1 text-[11px] border border-slate-300 rounded"
                          />
                        ) : (
                          <span className="text-slate-700">{row.sale_date}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {editing ? (
                          <select
                            value={editForm.sale_type as SaleType}
                            onChange={e => setEditForm(prev => ({ ...prev, sale_type: e.target.value as SaleType }))}
                            className="h-7 px-1 text-[11px] border border-slate-300 rounded"
                          >
                            {SALE_TYPE_OPTIONS.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-700 font-semibold">{row.sale_type}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {editing ? (
                          <input
                            type="checkbox"
                            checked={Boolean(editForm.taxable)}
                            onChange={e => setEditForm(prev => ({ ...prev, taxable: e.target.checked }))}
                          />
                        ) : row.taxable ? (
                          <span className="text-[10px] font-bold text-rose-700">과세</span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-500">면세</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-bold text-slate-800">
                        {editing ? (
                          <input
                            type="number"
                            value={editForm.total_amount as number}
                            onChange={e => setEditForm(prev => ({ ...prev, total_amount: Number(e.target.value) }))}
                            className="w-24 h-7 px-1 text-[11px] text-right tabular-nums border border-slate-300 rounded"
                          />
                        ) : (
                          fmt(row.total_amount)
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{fmt(supply)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-rose-700">{fmt(vat)}</td>
                      <td className="px-2 py-1.5 text-slate-600">
                        {editing ? (
                          <input
                            type="text"
                            value={(editForm.customer_name as string) ?? ""}
                            onChange={e => setEditForm(prev => ({ ...prev, customer_name: e.target.value }))}
                            className="w-full h-7 px-1 text-[11px] border border-slate-300 rounded"
                          />
                        ) : (
                          row.customer_name ?? <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-slate-500 text-[11px] max-w-[200px] truncate" title={row.memo}>
                        {editing ? (
                          <input
                            type="text"
                            value={(editForm.memo as string) ?? ""}
                            onChange={e => setEditForm(prev => ({ ...prev, memo: e.target.value }))}
                            className="w-full h-7 px-1 text-[11px] border border-slate-300 rounded"
                          />
                        ) : (
                          row.memo ?? <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {editing ? (
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              type="button"
                              onClick={saveEdit}
                              title="저장"
                              className="h-7 w-7 flex items-center justify-center rounded bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer"
                            >
                              <Save size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              title="취소"
                              className="h-7 w-7 flex items-center justify-center rounded bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              type="button"
                              onClick={() => startEdit(row)}
                              title="수정"
                              className="h-7 w-7 flex items-center justify-center rounded bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(row.id)}
                              title="삭제"
                              className="h-7 w-7 flex items-center justify-center rounded bg-rose-100 text-rose-600 hover:bg-rose-200 cursor-pointer"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 약국 매출 유형 안내 */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-start gap-2 text-[11px] text-slate-600">
        <Landmark size={14} className="mt-0.5 text-slate-500 shrink-0" />
        <div className="leading-relaxed">
          <b className="text-slate-700">약국 매출 유형 안내</b>
          <span className="mx-1 text-slate-400">·</span>
          <b>과세 매출</b> (일반 OTC · 의약외품 · 카드/현금 매출) · 매출세액 10% 반영
          <span className="mx-1 text-slate-400">·</span>
          <b>면세 매출</b> (처방 조제료 · 전문의약품 조제분) · 부가세 없음 · 매출세액 0
          <span className="mx-1 text-slate-400">·</span>
          유형 변경 시 과세 여부가 자동 세팅되며, 필요 시 수동 조정 가능
        </div>
      </div>

      {/* 예상 매출세액 요약 (하단) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={13} className="text-rose-600" />
            <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wide">과세 공급가액</div>
          </div>
          <div className="text-[20px] font-black text-rose-700 tabular-nums">{fmt(sales.taxableSales)}<span className="text-[12px] ml-1">원</span></div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={13} className="text-slate-600" />
            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">면세 매출</div>
          </div>
          <div className="text-[20px] font-black text-slate-700 tabular-nums">{fmt(sales.exemptSales)}<span className="text-[12px] ml-1">원</span></div>
        </div>
        <div className="bg-rose-100 border border-rose-300 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <ReceiptText size={13} className="text-rose-700" />
            <div className="text-[11px] font-bold text-rose-800 uppercase tracking-wide">매출세액 합계</div>
          </div>
          <div className="text-[20px] font-black text-rose-800 tabular-nums">{fmt(sales.outputVat)}<span className="text-[12px] ml-1">원</span></div>
        </div>
      </div>
    </div>
  );
};

export default SalesTab;
export { SalesTab };
