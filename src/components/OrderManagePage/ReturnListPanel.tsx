// src/components/OrderManagePage/ReturnListPanel.tsx
// 반품필요 탭을 독립 컴포넌트로 추출 (2026-07-31 · 탭 스왑 · StockManagePage 이동용)
// 기존 OrderManagePage의 return 탭 state/fetch/JSX 를 그대로 캡슐화
// 2026-08-03 · 반품 요청서 모달 · 발주서 스타일로 재설계 (#188)
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVendors } from "../../hooks/useVendors";
import { Loader2, Package, PackageCheck, RefreshCw, Search, Truck, ChevronRight, ChevronDown, Mail, MessageSquare, Send, Trash2 } from "lucide-react";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import type { ProductInfo as ProductInfoType } from "../../lib/productsCache";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
// T-CSS Phase 2 · 2026-08-06
import { CARD_BASE } from "../../styles/tokens";
import { EmptyState } from "../common/EmptyState";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";

// ── 반품 요청서 모달 (발주서 포맷) · 2026-08-03 ─────────────────────────
type ReturnReasonKey = "재고 과다" | "유통기한 임박" | "저조 판매" | "기타";
interface ReturnLineItem {
  product_code: string;
  product_name: string;
  current_stock: number;
  actual_stock: number | null;
  return_qty: number;
  purchase_price: number;
  memo: string;
  // 스냅샷 · 서버 전송용
  purchase_cycle: number | null;
  sale_qty_month: number | null;
  sale_qty_60d: number | null;
  sale_qty_90d: number | null;
}
interface ReturnRequestModalProps {
  item: any;                            // 트리거된 단일 상품 (기본)
  items?: any[];                        // 일괄 반품 · 선택 상품 배열 (있으면 우선)
  supplierInfo: {                       // 공급사 담당자 정보 (useVendors)
    contact_name: string | null;
    phone: string | null;
    email: string | null;
    category: string | null;
  } | null;
  onClose: () => void;
}

// 반품 번호 자동 생성 · REQ-YYYYMMDD-NNN (모달 open 시 1회)
function buildReturnNumber(): string {
  const now = new Date();
  const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rnd = String(Math.floor(Math.random() * 900) + 100); // 100~999
  return `REQ-${yyyymmdd}-${rnd}`;
}
function todayStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ReturnRequestModal: React.FC<ReturnRequestModalProps> = ({ item, items, supplierInfo, onClose }) => {
  // 반품 번호 · 모달 열림 시 1회 고정
  const returnNumber = useMemo(() => buildReturnNumber(), []);
  const [requestDate, setRequestDate] = useState<string>(() => todayStr(0));
  const [expectedDate, setExpectedDate] = useState<string>(() => todayStr(3));
  const [reason, setReason] = useState<ReturnReasonKey>(() => {
    // 매입주기 90 이상이면 저조 판매 · 그 외 재고 과다
    return item?.purchase_cycle != null && item.purchase_cycle >= 90 ? "저조 판매" : "재고 과다";
  });
  const [memo, setMemo] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // 반품 상품 리스트 · 초기값 · items 있으면 배열 매핑 · 없으면 단일 item
  const [lines, setLines] = useState<ReturnLineItem[]>(() => {
    const source: any[] = Array.isArray(items) && items.length > 0 ? items : [item];
    return source.map(it => ({
      product_code: String(it.product_code ?? ""),
      product_name: String(it.product_name ?? ""),
      current_stock: Number(it.current_stock ?? 0),
      actual_stock: it.actual_stock != null ? Number(it.actual_stock) : null,
      return_qty: Math.max(1, Number(it.current_stock ?? 0)),
      purchase_price: Number(it.purchase_price ?? 0),
      memo: "",
      purchase_cycle: it.purchase_cycle != null ? Number(it.purchase_cycle) : null,
      sale_qty_month: it.sale_qty_month != null ? Number(it.sale_qty_month) : null,
      sale_qty_60d:   it.sale_qty_60d   != null ? Number(it.sale_qty_60d)   : null,
      sale_qty_90d:   it.sale_qty_90d   != null ? Number(it.sale_qty_90d)   : null,
    }));
  });

  // 여러 공급사 감지 · items 기반 unique supplier count
  const uniqueSuppliers = useMemo(() => {
    const source: any[] = Array.isArray(items) && items.length > 0 ? items : [item];
    const set = new Set<string>();
    for (const it of source) {
      const s = String(it?.supplier ?? "").trim();
      if (s) set.add(s);
    }
    return Array.from(set);
  }, [items, item]);
  const multipleSuppliers = uniqueSuppliers.length > 1;

  const updateLine = (idx: number, patch: Partial<ReturnLineItem>) =>
    setLines(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  const removeLine = (idx: number) =>
    setLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  const totalQty    = lines.reduce((n, r) => n + (r.return_qty || 0), 0);
  const totalAmount = lines.reduce((n, r) => n + ((r.return_qty || 0) * (r.purchase_price || 0)), 0);

  const supplierName = String(item.supplier ?? "");
  const vendorCategory: string | null = item.vendorCategory ?? supplierInfo?.category ?? null;

  const send = async () => {
    if (sending || sent) return;
    setSendError(null);
    // 검증 · return_qty > 0 · current_stock 초과 금지
    for (const r of lines) {
      if (!(r.return_qty > 0)) { setSendError(`"${r.product_name}" · 반품 수량은 1 이상`); return; }
      if (r.return_qty > r.current_stock) { setSendError(`"${r.product_name}" · 반품 수량이 현재고(${r.current_stock})를 초과`); return; }
    }
    setSending(true);
    try {
      // 첫번째 line 은 기존 API 계약을 유지 · 여러 상품일 경우 items 배열 전송
      const primary = lines[0];
      const payload: Record<string, any> = {
        return_number: returnNumber,
        request_date: requestDate,
        expected_date: expectedDate,
        reason,
        memo: memo.trim() || null,
        supplier: supplierName || null,
        supplier_contact: supplierInfo?.contact_name ?? null,
        supplier_phone:   supplierInfo?.phone ?? null,
        supplier_email:   supplierInfo?.email ?? null,
        // 기존 · 단일 상품 계약 유지 (하위 호환)
        product_code: primary.product_code,
        product_name: primary.product_name,
        qty: primary.return_qty,
        note: (primary.memo || memo).trim() || null,
        purchase_cycle: primary.purchase_cycle,
        sale_qty_month: primary.sale_qty_month,
        sale_qty_60d:   primary.sale_qty_60d,
        sale_qty_90d:   primary.sale_qty_90d,
        current_stock:  primary.current_stock,
        actual_stock:   primary.actual_stock,
        purchase_price: primary.purchase_price,
        // 신규 · 다중 상품 배열 (백엔드가 이 필드를 인식하면 items 우선 사용)
        items: lines.map(r => ({
          product_code: r.product_code,
          product_name: r.product_name,
          qty: r.return_qty,
          purchase_price: r.purchase_price,
          amount: r.return_qty * r.purchase_price,
          current_stock: r.current_stock,
          actual_stock:  r.actual_stock,
          memo: r.memo || null,
          purchase_cycle: r.purchase_cycle,
          sale_qty_month: r.sale_qty_month,
          sale_qty_60d:   r.sale_qty_60d,
          sale_qty_90d:   r.sale_qty_90d,
        })),
        total_qty:    totalQty,
        total_amount: totalAmount,
      };
      const res = await fetch("/api/return-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSent(true);
        setTimeout(onClose, 1400);
      } else {
        // 백엔드 미구현 · 콘솔 로그 fallback (요청 원칙 · API 스켈레톤 처리)
        console.warn("[반품요청] API 실패 · payload:", payload);
        setSendError(`전송 실패 (${res.status}) · 요청 내용은 콘솔에 기록됨`);
      }
    } catch (e: any) {
      console.warn("[반품요청] 네트워크 오류 · payload:", { returnNumber, requestDate, expectedDate, reason, supplier: supplierName, lines });
      setSendError(`네트워크 오류: ${e?.message ?? ""} · 요청 내용은 콘솔에 기록됨`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      onClick={() => !sending && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8 flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── 헤더 · rose·pink 그라디언트 ── */}
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-rose-50 via-pink-50 to-orange-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-md shrink-0">
              <Truck size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-black text-slate-900 flex items-center gap-2 flex-wrap">
                반품 요청서
                <span className="text-[10px] font-black text-rose-700 bg-white border border-rose-300 rounded-full px-2 py-0.5 tabular-nums">
                  반품 예정 · {lines.length}건
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">#{returnNumber}</div>
            </div>
          </div>
          <button
            onClick={() => !sending && onClose()}
            disabled={sending}
            className="text-slate-400 hover:text-slate-700 text-3xl font-black w-9 h-9 rounded-lg hover:bg-white/70 cursor-pointer flex items-center justify-center disabled:opacity-40 shrink-0"
            title="닫기"
          >×</button>
        </div>

        {/* ── 반품 기본 정보 (grid 4-col) ── */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
          <div>
            <label className="text-slate-500 font-black block mb-1">반품 요청일</label>
            <input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)}
              className="w-full border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-rose-400 font-mono"/>
          </div>
          <div>
            <label className="text-slate-500 font-black block mb-1">반품 예정일</label>
            <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)}
              className="w-full border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-rose-400 font-mono"/>
          </div>
          <div>
            <label className="text-slate-500 font-black block mb-1">반품 사유</label>
            <select value={reason} onChange={e => setReason(e.target.value as ReturnReasonKey)}
              className="w-full border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-rose-400 font-semibold text-slate-700 bg-white cursor-pointer">
              <option value="재고 과다">재고 과다</option>
              <option value="유통기한 임박">유통기한 임박</option>
              <option value="저조 판매">저조 판매</option>
              <option value="기타">기타</option>
            </select>
          </div>
          <div>
            <label className="text-slate-500 font-black block mb-1">수신처 (공급사)</label>
            <div className="border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 font-semibold truncate" title={supplierName}>
              {supplierName || "-"}
            </div>
          </div>
        </div>

        {/* ── 공급사 정보 + 상품 테이블 ── */}
        <div className="flex-1 overflow-y-auto max-h-[45vh] px-6 py-4 space-y-3 bg-slate-50/30">
          {multipleSuppliers && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 flex items-start gap-2">
              <span className="text-[13px] leading-none">⚠️</span>
              <div className="min-w-0">
                <div className="font-black text-amber-900">
                  여러 공급사 · 대표 공급사({supplierName || uniqueSuppliers[0] || "-"})로 발송
                </div>
                <div className="mt-0.5 text-amber-700">
                  선택된 상품이 <span className="font-black tabular-nums">{uniqueSuppliers.length}개</span> 공급사에 걸쳐 있습니다 · {uniqueSuppliers.join(" · ")}
                </div>
              </div>
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            {/* 공급사 정보 헤더 (sky·rose gradient) */}
            <div className="px-4 py-3 bg-gradient-to-r from-sky-50 to-rose-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-black text-rose-600 bg-white border border-rose-200 rounded-full px-2 py-0.5 shrink-0">반품 요청서</span>
                <span className="text-sm font-black text-slate-900 truncate">{supplierName || "(공급사 미지정)"}</span>
                {vendorCategory && <VendorCategoryBadge category={vendorCategory} />}
                <span className="text-[10px] font-mono text-rose-600 bg-white border border-rose-200 rounded px-1.5 py-0.5 shrink-0">#{returnNumber}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-500 flex-wrap">
                {supplierInfo?.contact_name && <span>👤 {supplierInfo.contact_name}</span>}
                {supplierInfo?.phone && <span className="flex items-center gap-1"><MessageSquare size={10}/>{supplierInfo.phone}</span>}
                {supplierInfo?.email && <span className="flex items-center gap-1"><Mail size={10}/>{supplierInfo.email}</span>}
              </div>
            </div>

            {/* 반품 예상 금액 카드 (rose 톤) */}
            <div className="px-4 py-3 bg-slate-50/60 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white rounded-lg border border-rose-200 p-2.5">
                <div className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1">이번 반품 예상 금액</div>
                <div className="text-lg font-black text-rose-700 font-mono">{totalAmount > 0 ? totalAmount.toLocaleString() + "원" : "-"}</div>
                <div className="text-[9px] text-slate-400 mt-0.5">반품수량 × 매입가 합계</div>
              </div>
              <div className="bg-white rounded-lg border border-amber-200 p-2.5">
                <div className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">총 반품 수량</div>
                <div className="text-lg font-black text-amber-700 font-mono">{totalQty > 0 ? `${totalQty.toLocaleString()}개` : "-"}</div>
                <div className="text-[9px] text-slate-400 mt-0.5">라인 {lines.length}건</div>
              </div>
            </div>

            {/* 상품 테이블 */}
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-slate-500 font-black uppercase tracking-wide text-[9px] border-b border-slate-200">
                  <th className="text-center p-2 w-8">#</th>
                  <th className="text-left p-2 w-24">상품코드</th>
                  <th className="text-left p-2">상품명</th>
                  <th className="text-right p-2 w-14">현재고</th>
                  <th className="text-right p-2 w-20">반품수량</th>
                  <th className="text-right p-2 w-20">매입가</th>
                  <th className="text-right p-2 w-24">반품 금액</th>
                  <th className="text-left p-2 w-24">비고</th>
                  <th className="text-center p-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((r, iIdx) => {
                  const amount = (r.return_qty || 0) * (r.purchase_price || 0);
                  const overStock = r.return_qty > r.current_stock;
                  return (
                    <tr key={`${r.product_code}-${iIdx}`} className="hover:bg-rose-50/40">
                      <td className="p-2 text-center text-slate-400 font-black tabular-nums">{iIdx + 1}</td>
                      <td className="p-2 font-mono text-[10px] text-slate-400 tabular-nums">{r.product_code}</td>
                      <td className="p-2 font-bold text-slate-800 truncate max-w-[220px]">{r.product_name}</td>
                      <td className="p-2 text-right font-mono text-slate-600 tabular-nums">
                        {r.current_stock.toLocaleString()}
                        {r.actual_stock != null && r.actual_stock !== r.current_stock && (
                          <span className="block text-[9px] text-amber-600 font-normal leading-none mt-0.5">실 {r.actual_stock}</span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number" min={1} max={r.current_stock} value={r.return_qty}
                          onChange={e => updateLine(iIdx, { return_qty: Math.max(0, Number(e.target.value) || 0) })}
                          className={`w-16 border rounded px-1.5 py-0.5 text-right font-mono font-black focus:outline-none focus:border-rose-400 tabular-nums ${overStock ? "border-red-400 text-red-600 bg-red-50" : "border-slate-200 text-rose-600"}`}
                          title={overStock ? "현재고를 초과합니다" : undefined}
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number" min={0} value={r.purchase_price || ""}
                          onChange={e => updateLine(iIdx, { purchase_price: e.target.value === "" ? 0 : Number(e.target.value) })}
                          placeholder="0"
                          className="w-20 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono focus:outline-none focus:border-rose-400 tabular-nums"
                        />
                      </td>
                      <td className="p-2 text-right font-mono font-black text-rose-700 tabular-nums">
                        {amount > 0 ? `${amount.toLocaleString()}원` : "-"}
                      </td>
                      <td className="p-2">
                        <input
                          type="text" value={r.memo}
                          onChange={e => updateLine(iIdx, { memo: e.target.value })}
                          placeholder="(선택)"
                          className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:border-rose-400"
                        />
                      </td>
                      <td className="p-2 text-center">
                        {lines.length > 1 && (
                          <button type="button" onClick={() => removeLine(iIdx)}
                            className="text-slate-300 hover:text-rose-600 cursor-pointer" title="이 상품 제거">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-300 font-black text-[10px]">
                  <td colSpan={4} className="p-2 text-right text-slate-500 uppercase">소계</td>
                  <td className="p-2 text-right text-rose-600 font-mono tabular-nums">{totalQty}개</td>
                  <td colSpan={1}></td>
                  <td className="p-2 text-right text-rose-700 font-mono tabular-nums">{totalAmount > 0 ? totalAmount.toLocaleString() + "원" : "-"}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* 특이사항 메모 */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
          <label className="text-[11px] text-slate-500 font-black block mb-1">특이사항 · 요청 메모</label>
          <textarea
            value={memo} onChange={e => setMemo(e.target.value)}
            placeholder="공급사에 전달할 반품 사유·수거 요청 시간 등..."
            rows={2}
            className="w-full border border-slate-200 rounded px-2 py-1.5 text-[11px] focus:outline-none focus:border-rose-400 resize-none"
          />
          {sendError && (
            <div className="mt-2 text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
              {sendError}
            </div>
          )}
        </div>

        {/* 액션 버튼 */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[11px] text-slate-500">
            총 <span className="font-black text-slate-800">{lines.length}개 상품</span> ·
            {" "}<span className="font-black text-rose-700 tabular-nums">{totalQty}개</span> ·
            {" "}<span className="font-black text-rose-700 tabular-nums">{totalAmount > 0 ? `${totalAmount.toLocaleString()}원` : "-"}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => !sending && onClose()}
              disabled={sending}
              className="text-[12px] font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg px-4 py-2 cursor-pointer disabled:opacity-40"
            >취소</button>
            <button
              onClick={send} disabled={sending || sent}
              className={`text-[12px] font-black rounded-lg px-5 py-2 cursor-pointer shadow-md flex items-center gap-2 disabled:opacity-60 border ${
                sent
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                  : "text-white bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 border-rose-700"
              }`}
            >
              {sent
                ? <><span className="inline-block w-3 h-3 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[9px] font-black">✓</span>전송 완료</>
                : sending
                  ? <><Loader2 size={13} className="animate-spin"/>전송 중...</>
                  : <><Send size={13}/>반품 요청 전송</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ReturnListPanelProps {
  /** 공급사명 클릭 시 공급사 상세 모달 열기 콜백 */
  onSupplierClick?: (name: string) => void;
}

// ── ReturnListPanel (메인 export) ────────────────────────────────────────
export const ReturnListPanel: React.FC<ReturnListPanelProps> = ({ onSupplierClick }) => {
  // ── state ──────────────────────────────────────────────────────────────
  // 2026-08-03 · 반품필요 컬럼 재편 · 실재고 컬럼 추가 · 1/2/3달 판매량 컬럼 (판매액 제거)
  type ReturnItem = {
    product_code: string;
    product_name: string;
    supplier: string | null;
    purchase_cycle: number | null;
    sale_qty_cycle: number;
    sale_qty_month: number | null;   // 최근 30일 (1달)
    sale_qty_60d: number | null;     // 최근 60일 (2달) · 2026-08-03 추가
    sale_qty_90d: number | null;     // 최근 90일 (3달) · 2026-08-03 추가
    last_purchase_date: string | null;
    last_purchase_qty: number | null;
    current_stock: number;
    actual_stock: number | null;     // 실재고 · inventory_checks 최신값 합계 · 2026-08-03 추가
    purchase_price: number;
  };
  const [returnList, setReturnList] = useState<ReturnItem[]>([]);
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnCycleMin, setReturnCycleMin] = useState<number>(90);
  const [returnSalesMax, setReturnSalesMax] = useState<number>(5);
  // 2026-08-06 · 3개월 판매 조건 신규 (사용자 요청 · 반품필요 반응형 UI)
  const [returnSalesQuarterMax, setReturnSalesQuarterMax] = useState<number>(15);
  // 2026-07-31 · 사용자 요청 · 공급사 검색 필터 (부분일치 · 대소문자 무시)
  const [returnSupplierSearch, setReturnSupplierSearch] = useState<string>("");
  type ReturnCategoryFilter = "전체" | "위탁" | "선결제" | "60일회전" | "90일회전" | "기타";
  const [returnCategoryFilter, setReturnCategoryFilter] = useState<ReturnCategoryFilter>("전체");

  type ReturnSortKey = "product_name" | "supplier" | "current_stock" | "actual_stock" | "purchase_cycle" | "sale_qty_month" | "sale_qty_60d" | "sale_qty_90d" | "last_purchase_date" | "last_purchase_qty" | "stock_value";
  const [returnSortKey, setReturnSortKey] = useState<ReturnSortKey>("purchase_cycle");
  const [returnSortDir, setReturnSortDir] = useState<"asc" | "desc">("desc");
  const handleReturnSort = (k: ReturnSortKey) => {
    if (returnSortKey === k) setReturnSortDir(d => d === "asc" ? "desc" : "asc");
    else { setReturnSortKey(k); setReturnSortDir("asc"); }
  };
  const retArrow = (k: ReturnSortKey) => returnSortKey !== k ? " ⇅" : returnSortDir === "asc" ? " ▲" : " ▼";

  const loadReturnList = useCallback(async () => {
    setReturnLoading(true);
    try {
      // 2026-08-03 · 병렬 · top-sales (반품필요 원본) + inventory-checks (실재고 컬럼용)
      const [salesRes, invRes] = await Promise.all([
        fetch("/api/stock-manage/top-sales?months=6&limit=5000&sort=sale&dir=desc"),
        fetch("/api/inventory-checks").catch(() => null),
      ]);
      if (!salesRes.ok) throw new Error(String(salesRes.status));
      const data = await salesRes.json();
      const rows: any[] = Array.isArray(data?.rows) ? data.rows : [];

      // 실재고 맵 · product_code 별 최신 · warehouse1+warehouse2+store1+store2+store3
      //   레거시 fallback · warehouse_stock + store_stock + store_stock_2
      const actualByCode = new Map<string, number>();
      if (invRes && invRes.ok) {
        try {
          const invRaw: any[] = await invRes.json().catch(() => []);
          const latestByCode = new Map<string, any>();
          for (const r of Array.isArray(invRaw) ? invRaw : []) {
            const code = String(r?.product_code ?? "").trim();
            if (!code) continue;
            if (!latestByCode.has(code)) latestByCode.set(code, r); // API 는 checked_at desc 로 이미 정렬
          }
          latestByCode.forEach((row, code) => {
            const num = (v: any) => Number.isFinite(Number(v)) ? Number(v) : 0;
            const w1 = row.warehouse1_stock ?? row.warehouse_stock ?? 0;
            const w2 = row.warehouse2_stock ?? 0;
            const s1 = row.store_stock ?? 0;         // store_stock == store1
            const s2 = row.store_stock_2 ?? 0;
            const s3 = row.store3_stock ?? 0;
            // hasAny · 아무 값도 없으면 skip (실재고 정보 없음 · null 유지)
            if (row.warehouse1_stock == null && row.warehouse2_stock == null &&
                row.warehouse_stock == null && row.store_stock == null &&
                row.store_stock_2 == null && row.store3_stock == null) {
              return;
            }
            actualByCode.set(code, num(w1) + num(w2) + num(s1) + num(s2) + num(s3));
          });
        } catch (e: any) {
          console.warn("[반품필요] 실재고 파싱 실패:", e?.message);
        }
      }

      const items: ReturnItem[] = rows.map(r => {
        const cnt = Number(r.purchase_count ?? 0);
        const first = String(r.first_purchase_date ?? "");
        const last = String(r.last_purchase_date ?? "");
        let cycle: number | null = null;
        if (cnt >= 2 && first && last && first !== last) {
          const days = Math.round((new Date(last).getTime() - new Date(first).getTime()) / (86400 * 1000));
          cycle = cnt > 1 ? Math.round(days / (cnt - 1)) : null;
        }
        const code = String(r.product_code ?? "");
        // 실재고 조회 · 원본 code + stripped(앞자리 0 제거) 두 키 모두 시도
        const stripped = code.replace(/^0+/, "");
        const actual = actualByCode.has(code) ? (actualByCode.get(code) ?? null)
                     : actualByCode.has(stripped) ? (actualByCode.get(stripped) ?? null)
                     : null;
        return {
          product_code: code,
          product_name: String(r.product_name ?? ""),
          supplier: r.supplier ?? null,
          purchase_cycle: cycle,
          sale_qty_cycle: Number(r.sale_qty_cycle ?? 0),
          sale_qty_month: r.sale_qty_month != null ? Number(r.sale_qty_month) : (r.sale_qty_1m != null ? Number(r.sale_qty_1m) : null),
          sale_qty_60d:   r.sale_qty_60d   != null ? Number(r.sale_qty_60d)   : null,
          sale_qty_90d:   r.sale_qty_90d   != null ? Number(r.sale_qty_90d)   : null,
          last_purchase_date: r.last_purchase_date ?? null,
          last_purchase_qty: r.last_purchase_qty != null ? Number(r.last_purchase_qty) : (r.last_snapshot_qty != null ? Number(r.last_snapshot_qty) : null),
          current_stock: Number(r.current_stock ?? r.closing_stock ?? 0),
          actual_stock: actual,
          purchase_price: Number(r.purchase_price ?? 0),
        };
      });
      const filtered = items.filter(x => {
        if (x.current_stock <= 0) return false;
        if (x.purchase_cycle != null && x.purchase_cycle >= returnCycleMin && x.sale_qty_cycle <= returnSalesMax && (x.sale_qty_90d ?? 0) <= returnSalesQuarterMax) return true;
        return false;
      });
      filtered.sort((a, b) => (b.purchase_cycle ?? 0) - (a.purchase_cycle ?? 0));
      setReturnList(filtered);
      // 매입 탭 · 반품필요 서브탭 배지용 · 필터링 전 원본 갯수
      try { window.dispatchEvent(new CustomEvent("return-need-count", { detail: { count: filtered.length } })); } catch { /**/ }
    } catch (e: any) {
      console.warn("[반품필요] 로드 실패:", e?.message);
      setReturnList([]);
    } finally {
      setReturnLoading(false);
    }
  }, [returnCycleMin, returnSalesMax]);

  // 마운트 시 자동 로드
  useEffect(() => { loadReturnList(); }, [loadReturnList]);

  // ── 공급사 카테고리 맵 (배지용) · 공용 훅 ──────────────────────────────
  const { vendorMap, vendorCategoryMap } = useVendors();

  // ── 우측 패널 (상품 상세) ───────────────────────────────────────────────
  const [returnSelectedProduct, setReturnSelectedProduct] = useState<{ code: string; name: string } | null>(null);
  const [returnPanelFull, setReturnPanelFull] = useState<Record<string, any> | null>(null);
  const [returnPanelLoading, setReturnPanelLoading] = useState(false);
  const [returnPanelError, setReturnPanelError] = useState<string | null>(null);
  const [returnDetailTab, setReturnDetailTab] = useState<"info" | "purchase" | "sales">("info");
  const [returnPanelWidth, setReturnPanelWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("megatown_return_panel_w")); return Number.isFinite(v) && v > 0 ? v : 560; } catch { return 560; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_return_panel_w", String(returnPanelWidth)); } catch {} }, [returnPanelWidth]);
  const returnPanelWidthRef = useRef(returnPanelWidth);
  useEffect(() => { returnPanelWidthRef.current = returnPanelWidth; }, [returnPanelWidth]);
  const returnResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onReturnResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    returnResizeRef.current = { startX: e.clientX, startW: returnPanelWidthRef.current };
    const move = (ev: MouseEvent) => { const r = returnResizeRef.current; if (!r) return; setReturnPanelWidth(Math.min(1000, Math.max(320, r.startW + (ev.clientX - r.startX)))); };
    const up = () => { returnResizeRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  useEffect(() => {
    if (!returnSelectedProduct) { setReturnPanelFull(null); setReturnPanelError(null); return; }
    setReturnPanelLoading(true); setReturnPanelError(null);
    (async () => {
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(returnSelectedProduct.code)}`);
        if (res.ok) setReturnPanelFull(await res.json());
        else { const b = await res.json().catch(() => ({})); setReturnPanelError(b.error ?? `조회 실패 (${res.status})`); }
      } catch (e: any) { setReturnPanelError(e?.message ?? "네트워크 오류"); }
      finally { setReturnPanelLoading(false); }
    })();
  }, [returnSelectedProduct]);

  // ── 그룹 접기 ──────────────────────────────────────────────────────────
  const [returnGroupCollapsed, setReturnGroupCollapsed] = useState<Set<string>>(new Set());
  const toggleReturnGroup = (g: string) => setReturnGroupCollapsed(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const isReturnGroupCollapsed = (g: string) => returnGroupCollapsed.has(g);

  // ── 반품요청 모달 ────────────────────────────────────────────────────────
  const [returnRequestItem, setReturnRequestItem] = useState<any | null>(null);
  // 일괄 반품 · 선택 상품 배열 (있으면 모달 items props 로 전달)
  const [returnRequestItems, setReturnRequestItems] = useState<any[] | null>(null);

  // ── 일괄 반품 · 체크박스 선택 (세션 state · localStorage 없음) ───────────
  const [returnSelected, setReturnSelected] = useState<Set<string>>(new Set());
  const toggleReturnRow = (code: string) => setReturnSelected(prev => {
    const n = new Set(prev);
    if (n.has(code)) n.delete(code); else n.add(code);
    return n;
  });

  // ── 필터+정렬 완료 rows · 헤더 전체선택과 body map 이 공유 ──────────────
  const filteredSortedRows = useMemo(() => {
    const q = returnSupplierSearch.trim().toLowerCase();
    return [...returnList].filter(x => {
      if (q && !String(x.supplier ?? "").toLowerCase().includes(q)) return false;
      if (returnCategoryFilter !== "전체") {
        const cat = vendorCategoryMap[String(x.supplier ?? "").trim()] ?? null;
        if (cat !== returnCategoryFilter) return false;
      }
      return true;
    }).sort((a, b) => {
      const dir = returnSortDir === "asc" ? 1 : -1;
      switch (returnSortKey) {
        case "product_name":       return dir * String(a.product_name).localeCompare(String(b.product_name), "ko");
        case "supplier":           return dir * String(a.supplier ?? "").localeCompare(String(b.supplier ?? ""), "ko");
        case "current_stock":      return dir * (a.current_stock - b.current_stock);
        case "actual_stock":       return dir * ((a.actual_stock ?? -1) - (b.actual_stock ?? -1));
        case "purchase_cycle":     return dir * ((a.purchase_cycle ?? 0) - (b.purchase_cycle ?? 0));
        case "sale_qty_month":     return dir * ((a.sale_qty_month ?? 0) - (b.sale_qty_month ?? 0));
        case "sale_qty_60d":       return dir * ((a.sale_qty_60d ?? 0) - (b.sale_qty_60d ?? 0));
        case "sale_qty_90d":       return dir * ((a.sale_qty_90d ?? 0) - (b.sale_qty_90d ?? 0));
        case "last_purchase_date": return dir * String(a.last_purchase_date ?? "").localeCompare(String(b.last_purchase_date ?? ""));
        case "last_purchase_qty":  return dir * ((a.last_purchase_qty ?? 0) - (b.last_purchase_qty ?? 0));
        case "stock_value":        return dir * ((a.current_stock * a.purchase_price) - (b.current_stock * b.purchase_price));
        default:                   return 0;
      }
    });
  }, [returnList, returnSupplierSearch, returnCategoryFilter, vendorCategoryMap, returnSortKey, returnSortDir]);

  // 전체 선택 · 필터 후 rows 기준
  const visibleCodes = useMemo(() => filteredSortedRows.map(x => x.product_code), [filteredSortedRows]);
  const allChecked = visibleCodes.length > 0 && visibleCodes.every(c => returnSelected.has(c));
  const someChecked = visibleCodes.some(c => returnSelected.has(c)) && !allChecked;
  const toggleAllReturn = () => setReturnSelected(prev => {
    if (allChecked) {
      // 전부 선택된 상태 → 화면에 보이는 것만 해제
      const n = new Set(prev);
      visibleCodes.forEach(c => n.delete(c));
      return n;
    }
    // 하나라도 미선택 → 화면에 보이는 것 전부 추가
    const n = new Set(prev);
    visibleCodes.forEach(c => n.add(c));
    return n;
  });

  // 필터/데이터 바뀔 때 · 사라진 code 는 선택에서 제거 (stale 방지)
  useEffect(() => {
    setReturnSelected(prev => {
      if (prev.size === 0) return prev;
      const codes = new Set(returnList.map(x => x.product_code));
      let changed = false;
      const n = new Set<string>();
      prev.forEach(c => { if (codes.has(c)) n.add(c); else changed = true; });
      return changed ? n : prev;
    });
  }, [returnList]);

  // 일괄 반품 버튼 · 선택된 상품들을 모달로 전달
  const openBulkReturnModal = () => {
    if (returnSelected.size === 0) return;
    const selectedItems = returnList
      .filter(x => returnSelected.has(x.product_code))
      .map(x => ({
        ...x,
        vendorCategory: x.supplier ? (vendorCategoryMap[x.supplier.trim()] ?? null) : null,
      }));
    if (selectedItems.length === 0) return;
    setReturnRequestItems(selectedItems);
    // 대표 아이템 (모달의 item props 는 여전히 필수 · 첫번째 사용)
    setReturnRequestItem(selectedItems[0]);
  };

  // ── 컬럼 리사이저 (메인 반품필요 리스트 테이블) ─────────────────────────
  // 2026-08-06 · v3 · 현재고·실재고 제거 · 판매 3컬럼 통합 · localStorage 캐시 무효화
  const { getWidth, resizerProps: colResizerProps } = useColumnResize("returnList_v4", {
    num:          { default: 28,  min: 24, max: 60  },
    name:         { default: 300, min: 160, max: 480 },
    supplier:     { default: 120, min: 70, max: 240 },
    stock_value:  { default: 100, min: 60, max: 180 },
    purchase_cycle:{ default: 120, min: 80, max: 220 },
    sales_qty:    { default: 140, min: 90, max: 240 },
    action:       { default: 64,  min: 52, max: 100 },
  });

  // ── 렌더 ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2">
      {/* ── 상단 필터바 ── */}
      <div className={`${CARD_BASE} px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2`}>
        <div className="flex items-center gap-1.5">
          <PackageCheck size={14} className="text-rose-500 shrink-0" />
          <span className="text-[13px] font-semibold text-slate-800">반품필요</span>
          {(() => {
            const q = returnSupplierSearch.trim().toLowerCase();
            const filteredCount = returnList.filter(x => {
              if (q && !String(x.supplier ?? "").toLowerCase().includes(q)) return false;
              if (returnCategoryFilter !== "전체") {
                const cat = vendorCategoryMap[String(x.supplier ?? "").trim()] ?? null;
                if (cat !== returnCategoryFilter) return false;
              }
              return true;
            }).length;
            const isFiltered = !!q || returnCategoryFilter !== "전체";
            return (
              <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 rounded-full px-2 py-0.5 border border-rose-200 tabular-nums">
                {isFiltered ? `${filteredCount}/${returnList.length}` : returnList.length}건
              </span>
            );
          })()}
        </div>
        {/* 2026-08-06 · 반응형 · 3조건 한 줄 강제 · nowrap 그룹 · shrink-0 (사용자 요청) */}
        <div className="flex items-center gap-1.5 flex-nowrap shrink-0 basis-full sm:basis-auto">
          <label className="inline-flex items-center gap-1 text-[11px] text-slate-600 shrink-0">
            <span className="font-medium text-slate-500">매입주기</span>
            <input
              type="number"
              value={returnCycleMin}
              onChange={e => setReturnCycleMin(Math.max(0, Number(e.target.value) || 0))}
              className="w-11 h-7 px-1.5 text-[11px] border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 tabular-nums text-right transition"
            />
            <span className="text-slate-500 whitespace-nowrap">일 ↑</span>
          </label>
          <label className="inline-flex items-center gap-1 text-[11px] text-slate-600 shrink-0">
            <span className="font-medium text-slate-500">1M판매</span>
            <input
              type="number"
              value={returnSalesMax}
              onChange={e => setReturnSalesMax(Math.max(0, Number(e.target.value) || 0))}
              className="w-11 h-7 px-1.5 text-[11px] border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 tabular-nums text-right transition"
            />
            <span className="text-slate-500 whitespace-nowrap">개 ↑</span>
          </label>
          <label className="inline-flex items-center gap-1 text-[11px] text-slate-600 shrink-0">
            <span className="font-medium text-slate-500">3M판매</span>
            <input
              type="number"
              value={returnSalesQuarterMax}
              onChange={e => setReturnSalesQuarterMax(Math.max(0, Number(e.target.value) || 0))}
              className="w-11 h-7 px-1.5 text-[11px] border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 tabular-nums text-right transition"
            />
            <span className="text-slate-500 whitespace-nowrap">개 ↑</span>
          </label>
        </div>
        {/* 분류 세그먼트 필터 */}
        <div className="flex flex-wrap bg-slate-50 border border-slate-200 rounded-md p-0.5 gap-0.5">
          {(["전체", "위탁", "선결제", "60일회전", "90일회전", "기타"] as const).map(cat => (
            <button key={cat} onClick={() => setReturnCategoryFilter(cat)}
              className={`h-7 px-2.5 text-[11px] font-semibold rounded transition cursor-pointer ${
                returnCategoryFilter === cat
                  ? cat === "전체" ? "bg-slate-700 text-white shadow-sm"
                  : cat === "위탁" ? "bg-violet-500 text-white shadow-sm"
                  : cat === "선결제" ? "bg-rose-500 text-white shadow-sm"
                  : cat === "60일회전" ? "bg-emerald-500 text-white shadow-sm"
                  : cat === "90일회전" ? "bg-teal-500 text-white shadow-sm"
                  : "bg-slate-500 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}>{cat}</button>
          ))}
        </div>
        {/* 2026-07-31 · 사용자 요청 · 공급사 검색 · 검색한 공급사 제품만 표시 */}
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={returnSupplierSearch}
            onChange={e => setReturnSupplierSearch(e.target.value)}
            placeholder="공급사명 검색"
            className="w-40 h-7 pl-7 pr-2 text-[11px] border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 transition"
          />
        </div>
        {/* 일괄 반품 신청 · 2026-08-03 · 선택 상품 있을 때만 활성 */}
        <button
          type="button"
          onClick={openBulkReturnModal}
          disabled={returnSelected.size === 0}
          className={`ml-auto inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-black transition cursor-pointer border ${
            returnSelected.size > 0
              ? "text-white bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 border-rose-700 shadow-sm active:scale-95"
              : "text-slate-400 bg-slate-50 border-slate-200 cursor-not-allowed"
          }`}
          title={returnSelected.size > 0 ? `선택된 ${returnSelected.size}개 상품 일괄 반품 신청` : "체크박스로 상품을 선택하세요"}
        >
          <Truck size={12} strokeWidth={2.5} />
          일괄 반품 ({returnSelected.size})
        </button>
        <button
          type="button"
          onClick={loadReturnList}
          disabled={returnLoading}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-300 text-slate-400 hover:text-rose-500 transition disabled:opacity-40 cursor-pointer"
          title="다시 조회"
        >
          <RefreshCw size={13} className={returnLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ── 좌우 split 레이아웃 ── */}
      <div className="flex flex-col lg:flex-row lg:min-h-[520px] gap-0">

        {/* 좌측: 리스트 */}
        <div
          className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
          style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? returnPanelWidth : undefined }}
        >
          <section className={`${CARD_BASE} overflow-hidden flex flex-col min-h-0`}>
            {/* 로딩 / 빈 상태 */}
            {returnLoading && returnList.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-slate-400 text-xs font-bold gap-2">
                <Loader2 size={14} className="animate-spin" />불러오는 중...
              </div>
            ) : returnList.length === 0 ? (
              <div className="py-12 text-center text-[11px] text-slate-300">
                조건에 맞는 반품필요 상품 없음
              </div>
            ) : (
              <div className={`overflow-auto flex-1 min-h-0 ${returnLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
                <table className="w-full text-xs" style={{ tableLayout: "fixed" }}>
                  <thead className="sticky top-0 bg-white z-10">
                    {/* 그룹 컬러 헤더 · 2026-08-03 · 재고 그룹 (현재고·실재고·재고금액) · 판매 그룹 (1/2/3달) */}
                    <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider">
                      <th className="bg-slate-50 w-7" />
                      {/* 상품정보 (sky) */}
                      <th colSpan={isReturnGroupCollapsed("info") ? 1 : 2}
                        className="text-center py-1.5 bg-sky-50 text-sky-700 border-l border-r border-slate-100 cursor-pointer select-none hover:bg-sky-100 transition"
                        onClick={() => toggleReturnGroup("info")}
                        title={isReturnGroupCollapsed("info") ? "상품정보 펼치기" : "상품정보 접기"}>
                        <span className="inline-flex items-center gap-1">
                          {isReturnGroupCollapsed("info") ? <ChevronRight size={12} /> : <ChevronDown size={12} />}상품정보
                        </span>
                      </th>
                      {/* 재고 (amber) · 재고금액 (2026-08-06 · 현재고·실재고 제거) */}
                      <th colSpan={1}
                        className="text-center py-1.5 bg-amber-50 text-amber-700 border-l border-r border-slate-100 cursor-pointer select-none hover:bg-amber-100 transition"
                        onClick={() => toggleReturnGroup("stock")}
                        title={isReturnGroupCollapsed("stock") ? "재고금액 펼치기" : "재고금액 접기"}>
                        <span className="inline-flex items-center gap-1">
                          {isReturnGroupCollapsed("stock") ? <ChevronRight size={12} /> : <ChevronDown size={12} />}재고
                        </span>
                      </th>
                      {/* 매입 (emerald) */}
                      <th colSpan={1}
                        className="text-center py-1.5 bg-emerald-50 text-emerald-700 border-l border-r border-slate-100 cursor-pointer select-none hover:bg-emerald-100 transition"
                        onClick={() => toggleReturnGroup("purchase")}
                        title={isReturnGroupCollapsed("purchase") ? "매입 펼치기" : "매입 접기"}>
                        <span className="inline-flex items-center gap-1">
                          {isReturnGroupCollapsed("purchase") ? <ChevronRight size={12} /> : <ChevronDown size={12} />}매입
                        </span>
                      </th>
                      {/* 판매 (rose) · 1/2/3 달 판매량 · 통합 컬럼 (2026-08-06) */}
                      <th colSpan={1}
                        className="text-center py-1.5 bg-rose-50 text-rose-700 border-l border-r border-slate-100 cursor-pointer select-none hover:bg-rose-100 transition"
                        onClick={() => toggleReturnGroup("sales")}
                        title={isReturnGroupCollapsed("sales") ? "판매 펼치기" : "판매 접기"}>
                        <span className="inline-flex items-center gap-1">
                          {isReturnGroupCollapsed("sales") ? <ChevronRight size={12} /> : <ChevronDown size={12} />}판매
                        </span>
                      </th>
                      {/* 액션 (slate) */}
                      <th className="text-center py-1.5 bg-slate-100 text-slate-600 border-l border-slate-100">액션</th>
                    </tr>
                    {/* 서브 헤더 */}
                    <tr className="border-b border-slate-100 text-[11px] text-slate-400 uppercase tracking-wider">
                      <th className="relative text-center px-0.5 py-1.5 bg-slate-50/60"
                        style={{ width: getWidth("num"), minWidth: getWidth("num") }}>
                        #
                        <span {...colResizerProps("num")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                      </th>
                      {isReturnGroupCollapsed("info") ? (
                        <th className="bg-sky-50/20 w-4"></th>
                      ) : (
                        <>
                          <th onClick={() => handleReturnSort("product_name")} title="상품명 정렬"
                            className="relative text-left px-1 py-1.5 cursor-pointer hover:bg-sky-50 select-none bg-sky-50/30"
                            style={{ width: getWidth("name"), minWidth: getWidth("name") }}>
                            상품{retArrow("product_name")}
                            <span {...colResizerProps("name")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                          </th>
                          <th onClick={() => handleReturnSort("supplier")} title="공급사 정렬"
                            className="relative text-left px-0.5 py-1.5 cursor-pointer hover:bg-sky-50 select-none bg-sky-50/30"
                            style={{ width: getWidth("supplier"), minWidth: getWidth("supplier") }}>
                            공급사{retArrow("supplier")}
                            <span {...colResizerProps("supplier")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                          </th>
                        </>
                      )}
                      {/* 재고 서브 · 재고금액만 (2026-08-06 · 현재고·실재고 제거) */}
                      {isReturnGroupCollapsed("stock") ? (
                        <th className="bg-amber-50/20 w-4"></th>
                      ) : (
                        <th onClick={() => handleReturnSort("stock_value")} title="재고금액 정렬"
                          className="relative text-right px-1 py-1.5 bg-amber-50/40 text-indigo-700 cursor-pointer hover:bg-amber-100 select-none"
                          style={{ width: getWidth("stock_value"), minWidth: getWidth("stock_value") }}>
                          재고금액{retArrow("stock_value")}
                          <span {...colResizerProps("stock_value")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                        </th>
                      )}
                      {isReturnGroupCollapsed("purchase") ? (
                        <th className="bg-emerald-50/20 w-4"></th>
                      ) : (
                        <th onClick={() => handleReturnSort("purchase_cycle")} title="매입주기 정렬"
                          className="relative text-right px-1 py-1.5 bg-emerald-50/40 text-emerald-700 cursor-pointer hover:bg-emerald-100 select-none"
                          style={{ width: getWidth("purchase_cycle"), minWidth: getWidth("purchase_cycle") }}>
                          <span className="flex flex-col items-end leading-none gap-0.5">
                            <span>매입주기{retArrow("purchase_cycle")}</span>
                            <span className="text-[9px] text-slate-400 font-normal">최근매입일·량</span>
                          </span>
                          <span {...colResizerProps("purchase_cycle")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                        </th>
                      )}
                      {/* 판매 서브 · 1/2/3 달 판매량 통합 · 클릭 시 1달 기준 정렬 (2026-08-06) */}
                      {isReturnGroupCollapsed("sales") ? (
                        <th className="bg-rose-50/20 w-4"></th>
                      ) : (
                        <th onClick={() => handleReturnSort("sale_qty_month")} title="1달 / 2달 / 3달 판매량 · 클릭 시 1달 기준 정렬"
                          className="relative text-right px-1 py-1.5 bg-rose-50/40 text-rose-600 cursor-pointer hover:bg-rose-100 select-none tabular-nums"
                          style={{ width: getWidth("sales_qty"), minWidth: getWidth("sales_qty") }}>
                          1/2/3달{retArrow("sale_qty_month")}
                          <span {...colResizerProps("sales_qty")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                        </th>
                      )}
                      <th className="relative text-center px-0.5 py-1.5 bg-slate-50/60 text-slate-500 cursor-default select-none"
                        style={{ width: getWidth("action"), minWidth: getWidth("action") }}>
                        반품
                        <span {...colResizerProps("action")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {[...returnList].filter(x => {
                      const q = returnSupplierSearch.trim().toLowerCase();
                      if (q && !String(x.supplier ?? "").toLowerCase().includes(q)) return false;
                      if (returnCategoryFilter !== "전체") {
                        const cat = vendorCategoryMap[String(x.supplier ?? "").trim()] ?? null;
                        if (cat !== returnCategoryFilter) return false;
                      }
                      return true;
                    }).sort((a, b) => {
                      const dir = returnSortDir === "asc" ? 1 : -1;
                      switch (returnSortKey) {
                        case "product_name":    return dir * String(a.product_name).localeCompare(String(b.product_name), "ko");
                        case "supplier":        return dir * String(a.supplier ?? "").localeCompare(String(b.supplier ?? ""), "ko");
                        case "current_stock":   return dir * (a.current_stock - b.current_stock);
                        case "actual_stock":    return dir * ((a.actual_stock ?? -1) - (b.actual_stock ?? -1));
                        case "purchase_cycle":  return dir * ((a.purchase_cycle ?? 0) - (b.purchase_cycle ?? 0));
                        case "sale_qty_month":  return dir * ((a.sale_qty_month ?? 0) - (b.sale_qty_month ?? 0));
                        case "sale_qty_60d":    return dir * ((a.sale_qty_60d ?? 0) - (b.sale_qty_60d ?? 0));
                        case "sale_qty_90d":    return dir * ((a.sale_qty_90d ?? 0) - (b.sale_qty_90d ?? 0));
                        case "last_purchase_date": return dir * String(a.last_purchase_date ?? "").localeCompare(String(b.last_purchase_date ?? ""));
                        case "last_purchase_qty":  return dir * ((a.last_purchase_qty ?? 0) - (b.last_purchase_qty ?? 0));
                        case "stock_value":     return dir * ((a.current_stock * a.purchase_price) - (b.current_stock * b.purchase_price));
                        default:                return 0;
                      }
                    }).map((x, i) => {
                      const isSelected = returnSelectedProduct?.code === x.product_code;
                      return (
                        <tr
                          key={x.product_code}
                          className={`transition cursor-pointer ${isSelected ? "bg-rose-50/60 ring-1 ring-inset ring-rose-200" : "hover:bg-orange-50/30"}`}
                          onClick={() => { setReturnSelectedProduct({ code: x.product_code, name: x.product_name }); setReturnDetailTab("info"); }}
                        >
                          <td className="px-0.5 py-1.5 text-center text-slate-400 tabular-nums text-[11px] bg-slate-50/60 align-top">{i + 1}</td>
                          {isReturnGroupCollapsed("info") ? (
                            <td className="bg-sky-50/10 w-4"></td>
                          ) : (
                            <>
                              <td className="px-1 py-1.5 align-top bg-sky-50/20">
                                <div className="flex flex-col leading-tight">
                                  <button
                                    type="button"
                                    className="text-[12px] font-semibold text-sky-700 hover:underline text-left break-words whitespace-normal cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); setReturnSelectedProduct({ code: x.product_code, name: x.product_name }); setReturnDetailTab("info"); }}
                                    title="상품정보 보기"
                                  >{x.product_name}</button>
                                  <span className="text-[10px] text-slate-400 tabular-nums">{x.product_code}</span>
                                </div>
                              </td>
                              <td className="px-0.5 py-1.5 align-top bg-sky-50/10">
                                <div className="flex flex-col leading-tight">
                                  {x.supplier && <VendorCategoryBadge category={vendorCategoryMap[x.supplier.trim()] ?? null} />}
                                  {onSupplierClick && x.supplier ? (
                                    <button
                                      type="button"
                                      className="text-[12px] font-semibold text-sky-700 hover:underline text-left whitespace-nowrap cursor-pointer"
                                      onClick={(e) => { e.stopPropagation(); onSupplierClick(x.supplier!); }}
                                      title="공급사 정보 조회·수정"
                                    >{x.supplier}</button>
                                  ) : (
                                    <span className="text-[12px] font-semibold text-sky-700 whitespace-nowrap">{x.supplier ?? "-"}</span>
                                  )}
                                </div>
                              </td>
                            </>
                          )}
                          {/* 재고 그룹 · 재고금액만 (2026-08-06 · 현재고·실재고 제거) */}
                          {isReturnGroupCollapsed("stock") ? (
                            <td className="bg-amber-50/20 w-4"></td>
                          ) : (
                            <td className="text-right px-1 py-1.5 tabular-nums font-black text-[12px] text-indigo-700 bg-amber-50/20 align-top">
                              {x.current_stock > 0 && x.purchase_price > 0 ? `${(x.current_stock * x.purchase_price).toLocaleString()}` : "-"}
                            </td>
                          )}
                          {isReturnGroupCollapsed("purchase") ? (
                            <td className="bg-emerald-50/20 w-4"></td>
                          ) : (
                            <td
                              className="text-right px-1 py-1.5 tabular-nums bg-emerald-50/30 align-top cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); setReturnSelectedProduct({ code: x.product_code, name: x.product_name }); setReturnDetailTab("purchase"); }}
                              title="매입이력 보기"
                            >
                              <span className="font-black text-[12px] text-emerald-700 hover:underline">
                                {x.purchase_cycle != null ? `${x.purchase_cycle}일` : "-"}
                              </span>
                              {/* 2026-08-06 · 최근 매입일 · M/D 짧은 포맷 · 최근 매입량 함께 */}
                              <span className="block text-[10px] text-slate-500 leading-snug mt-0.5 font-normal tabular-nums">
                                {x.last_purchase_date ? (() => {
                                  const [_, m, d] = x.last_purchase_date.split("-");
                                  return `${Number(m)}/${Number(d)}`;
                                })() : "-"}
                                {x.last_purchase_qty != null && (
                                  <> · <span>{x.last_purchase_qty}개</span></>
                                )}
                              </span>
                            </td>
                          )}
                          {/* 판매 그룹 · 1/2/3 달 판매량 · 통합 셀 (2026-08-06) */}
                          {isReturnGroupCollapsed("sales") ? (
                            <td className="bg-rose-50/20 w-4"></td>
                          ) : (
                            <td
                              className="text-right px-1 py-1.5 tabular-nums bg-rose-50/20 align-top cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); setReturnSelectedProduct({ code: x.product_code, name: x.product_name }); setReturnDetailTab("sales"); }}
                              title="1달 / 2달 / 3달 판매량"
                            >
                              <span className="font-black text-[12px] text-rose-700 hover:underline">
                                {x.sale_qty_month != null ? x.sale_qty_month.toLocaleString() : "-"}
                                <span className="text-slate-300 font-normal"> / </span>
                                {x.sale_qty_60d != null ? x.sale_qty_60d.toLocaleString() : "-"}
                                <span className="text-slate-300 font-normal"> / </span>
                                {x.sale_qty_90d != null ? x.sale_qty_90d.toLocaleString() : "-"}
                              </span>
                            </td>
                          )}
                          <td className="text-center px-1 py-1.5 align-top bg-slate-50/30">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setReturnRequestItem({ ...x, vendorCategory: x.supplier ? (vendorCategoryMap[x.supplier.trim()] ?? null) : null }); }}
                              className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-semibold text-white bg-rose-500 hover:bg-rose-600 border border-rose-600 transition-colors cursor-pointer active:scale-95 whitespace-nowrap"
                              title="반품요청"
                            >
                              <Truck size={11} strokeWidth={2} />반품
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {returnList.length === 0 && (
                      <tr><td colSpan={11} className="text-center text-[11px] text-slate-300 py-6">검색 결과 없음</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* 리사이즈 핸들 (데스크탑만) */}
        <div onMouseDown={onReturnResizeStart}
          className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-slate-200 hover:bg-rose-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
          title="드래그하여 폭 조절">
          <span className="text-[9px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
        </div>

        {/* 우측: 상품 상세 패널 · 탭 전환 */}
        {returnPanelLoading ? (
          <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0">
            <div className={`${CARD_BASE} flex-1 min-h-[400px]`}>
              <EmptyState title="불러오는 중..." size="normal" />
            </div>
          </div>
        ) : returnPanelError ? (
          <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-red-700">
              <div className="font-bold mb-1">조회 실패</div>
              <div className="text-[11px] font-mono">{returnPanelError}</div>
            </div>
          </div>
        ) : returnPanelFull ? (
          <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0 overflow-y-auto">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden shrink-0">
              <div className="flex border-b border-slate-200 bg-slate-50/50">
                {([
                  { k: "info" as const,     label: "상품정보",   color: "text-sky-700 border-sky-500"     },
                  { k: "purchase" as const, label: "매입이력",   color: "text-emerald-700 border-emerald-500" },
                  { k: "sales" as const,    label: "판매정보",   color: "text-rose-700 border-rose-500"   },
                ] as const).map(({ k, label, color }) => (
                  <button key={k} type="button"
                    onClick={() => setReturnDetailTab(k)}
                    className={`flex-1 min-h-[40px] py-2 px-3 text-[13px] font-black border-b-2 transition cursor-pointer ${returnDetailTab === k ? color : "text-slate-400 border-transparent hover:text-slate-600"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="px-3 py-1.5 flex items-center gap-2 border-b border-slate-100">
                <span className="text-[11px] font-bold text-slate-500 truncate">{returnSelectedProduct?.name}</span>
                <button type="button" onClick={() => { setReturnSelectedProduct(null); setReturnPanelFull(null); }}
                  className="ml-auto text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer shrink-0">닫기</button>
              </div>
            </div>

            {returnDetailTab === "info" && (
              <ProductDetailRightPanel
                selected={({
                  code: (returnPanelFull as any).product_code ?? (returnPanelFull as any).code ?? (returnSelectedProduct?.code ?? ""),
                  name: (returnPanelFull as any).product_name ?? (returnPanelFull as any).name ?? (returnSelectedProduct?.name ?? ""),
                  spec: (returnPanelFull as any).spec ?? "",
                  ...returnPanelFull,
                  realMap: (returnPanelFull as any).realMap ?? (returnPanelFull as any).real_map ?? null,
                } as ProductInfoType)}
                onClose={() => { setReturnSelectedProduct(null); setReturnPanelFull(null); }}
                onProductUpdate={(u) => setReturnPanelFull(prev => prev ? { ...prev, ...u } : prev)}
                onRealMapUpdate={(v) => setReturnPanelFull(prev => prev ? { ...prev, real_map: v, realMap: v } : prev)}
                showChart={false}
                context="order-manage"
                editable={true}
                emptySub="상세 정보가 표시됩니다"
              />
            )}
            {returnDetailTab === "purchase" && (
              <ProductDetailRightPanel
                selected={({
                  code: (returnPanelFull as any).product_code ?? (returnPanelFull as any).code ?? (returnSelectedProduct?.code ?? ""),
                  name: (returnPanelFull as any).product_name ?? (returnPanelFull as any).name ?? (returnSelectedProduct?.name ?? ""),
                  spec: (returnPanelFull as any).spec ?? "",
                  ...returnPanelFull,
                  realMap: (returnPanelFull as any).realMap ?? (returnPanelFull as any).real_map ?? null,
                } as ProductInfoType)}
                onClose={() => { setReturnSelectedProduct(null); setReturnPanelFull(null); }}
                onProductUpdate={(u) => setReturnPanelFull(prev => prev ? { ...prev, ...u } : prev)}
                onRealMapUpdate={(v) => setReturnPanelFull(prev => prev ? { ...prev, real_map: v, realMap: v } : prev)}
                showChart={true}
                context="order-manage"
                editable={false}
                emptySub="매입이력이 표시됩니다"
              />
            )}
            {returnDetailTab === "sales" && (
              <ProductDetailRightPanel
                selected={({
                  code: (returnPanelFull as any).product_code ?? (returnPanelFull as any).code ?? (returnSelectedProduct?.code ?? ""),
                  name: (returnPanelFull as any).product_name ?? (returnPanelFull as any).name ?? (returnSelectedProduct?.name ?? ""),
                  spec: (returnPanelFull as any).spec ?? "",
                  ...returnPanelFull,
                  realMap: (returnPanelFull as any).realMap ?? (returnPanelFull as any).real_map ?? null,
                } as ProductInfoType)}
                onClose={() => { setReturnSelectedProduct(null); setReturnPanelFull(null); }}
                onProductUpdate={(u) => setReturnPanelFull(prev => prev ? { ...prev, ...u } : prev)}
                onRealMapUpdate={(v) => setReturnPanelFull(prev => prev ? { ...prev, real_map: v, realMap: v } : prev)}
                showChart={true}
                context="order-manage"
                editable={false}
                emptySub="판매정보가 표시됩니다"
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0">
            <div className={`${CARD_BASE} flex-1 min-h-[400px]`}>
              <EmptyState icon={Package} title="상품을 클릭하세요" hint="상품명 → 상품정보 · 매입주기 → 매입이력 · 판매량 → 판매정보" />
            </div>
          </div>
        )}
      </div>

      {/* 반품 요청서 모달 · 2026-08-03 · 발주서 스타일 재설계 */}
      {returnRequestItem && (() => {
        const supKey = String(returnRequestItem.supplier ?? "").trim();
        const vendor = supKey ? vendorMap[supKey] : undefined;
        const supplierInfo = vendor
          ? { contact_name: vendor.contact_name, phone: vendor.phone, email: vendor.email, category: vendor.category }
          : { contact_name: null, phone: null, email: null, category: returnRequestItem.vendorCategory ?? null };
        return (
          <ReturnRequestModal
            item={returnRequestItem}
            supplierInfo={supplierInfo}
            onClose={() => setReturnRequestItem(null)}
          />
        );
      })()}
    </div>
  );
};

export default ReturnListPanel;
