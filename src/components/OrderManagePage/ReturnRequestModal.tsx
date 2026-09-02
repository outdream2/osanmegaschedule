// src/components/OrderManagePage/ReturnRequestModal.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · ReturnListPanel 에서 이관
// 프레임워크: Card · StatusPill · Spinner · AccentBar · VendorCategoryBadge · apiClient
// 2026-08-25 · 사용자 지시 · 반품요청서 PDF 저장 (A4 텍스트 리포트 · 목업 톤)
import React, { useMemo, useRef, useState } from "react";
import { Truck, MessageSquare, Mail, Trash2, FileDown } from "lucide-react";
import { api, ApiError } from "../../lib/apiClient";
import { dispatchApprovalChange } from "../../lib/approvalEvents";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { Card } from "../common/Card";
import { Modal } from "../common/Modal";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import type { ReturnReasonKey, ReturnLineItem } from "./ReturnListPanel.types";
import { buildReturnNumber, todayStr } from "./ReturnListPanel.types";
import { ReturnPdfPreview } from "./ReturnPdfPreview";
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";
// 2026-08-25 · 프레임워크 · useToast (raw alert 제거)
import { useToast, toastClass } from "../../hooks/useToast";

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

export const ReturnRequestModal: React.FC<ReturnRequestModalProps> = ({ item, items, supplierInfo, onClose }) => {
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
      await api.post("/api/return-requests", payload);
      // 2026-08-18 · 반품 요청 배지 즉시 갱신
      dispatchApprovalChange("return");
      setSent(true);
      setTimeout(onClose, 1400);
    } catch (e: any) {
      const errMsg = e instanceof ApiError ? e.message : (e?.message ?? "");
      // 백엔드 미구현 · 콘솔 로그 fallback (요청 원칙 · API 스켈레톤 처리)
      console.warn("[반품요청] 네트워크 오류 · payload:", { returnNumber, requestDate, expectedDate, reason, supplier: supplierName, lines });
      setSendError(`전송 실패: ${errMsg} · 요청 내용은 콘솔에 기록됨`);
    } finally {
      setSending(false);
    }
  };

  // 2026-08-25 · 사용자 지시 · A4 텍스트 리포트 PDF 저장
  const pdfPreviewRef = useRef<HTMLDivElement | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const { toast, showError } = useToast();
  const handleSavePdf = async () => {
    const node = pdfPreviewRef.current;
    if (!node) return;
    setGeneratingPdf(true);
    try {
      const canvas = await html2canvas(node, {
        scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false,
        windowWidth: node.scrollWidth,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const imgW = pdfW;
      const imgH = (canvas.height * imgW) / canvas.width;
      if (imgH <= pdfH) {
        pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH, undefined, "FAST");
      } else {
        let yOffset = 0;
        let remaining = imgH;
        while (remaining > 0) {
          pdf.addImage(imgData, "PNG", 0, -yOffset, imgW, imgH, undefined, "FAST");
          remaining -= pdfH;
          yOffset += pdfH;
          if (remaining > 0) pdf.addPage();
        }
      }
      const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const safeSup = (supplierName || "반품요청서").replace(/[\\/:*?"<>|]/g, "_");
      pdf.save(`반품요청서_${ymd}_${safeSup}.pdf`);
    } catch (e: any) {
      console.error("[ReturnRequestModal] PDF 저장 실패:", e?.message ?? e);
      showError(`PDF 저장 실패: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <>
    {/* 2026-08-25 · Modal + 오프스크린 PDF 프리뷰 fragment wrapper */}
    {toast && (
      <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
    )}
    <Modal
      open
      onClose={() => !sending && onClose()}
      size="lg"
      closeOnBackdrop={!sending}
      closeOnEsc={!sending}
      showClose={false}
      titleAccent
      icon={
        <div className="w-10 h-10 rounded-xl bg-brand-deep flex items-center justify-center shadow-sm shrink-0">
          <Truck size={18} className="text-white" />
        </div>
      }
      title={
        <div className="min-w-0">
          <div className="text-[17px] font-bold text-ink tracking-tight flex items-center gap-2 flex-wrap">
            반품 요청서
            <StatusPill tone="rose" size="sm" dot>반품 예정 · {lines.length}건</StatusPill>
          </div>
          <div className="text-[13px] tabular-nums text-ink-soft mt-0.5 truncate">#{returnNumber}</div>
        </div>
      }
      headerRight={
        <button
          onClick={() => !sending && onClose()}
          disabled={sending}
          className="w-9 h-9 rounded-lg bg-white border border-line hover:border-brand-deep hover:bg-brand-tint text-ink-soft hover:text-brand-deep transition-colors cursor-pointer flex items-center justify-center disabled:opacity-40 shrink-0"
          aria-label="닫기"
          title="닫기 (ESC)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      }
    >
      <div className="flex flex-col overflow-hidden">
        {/* ── 반품 기본 정보 (grid 4-col) ── */}
        <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/50 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[15px]">
          <div>
            <label className="text-zinc-500 font-bold block mb-1">반품 요청일</label>
            <input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)}
              className="w-full border border-line rounded px-2 py-1 focus:outline-none focus:border-brand-deep tabular-nums"/>
          </div>
          <div>
            <label className="text-zinc-500 font-bold block mb-1">반품 예정일</label>
            <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)}
              className="w-full border border-line rounded px-2 py-1 focus:outline-none focus:border-brand-deep tabular-nums"/>
          </div>
          <div>
            <label className="text-zinc-500 font-bold block mb-1">반품 사유</label>
            <select value={reason} onChange={e => setReason(e.target.value as ReturnReasonKey)}
              className="w-full border border-line rounded px-2 py-1 focus:outline-none focus:border-brand-deep font-semibold text-zinc-700 bg-white cursor-pointer">
              <option value="재고 과다">재고 과다</option>
              <option value="유통기한 임박">유통기한 임박</option>
              <option value="저조 판매">저조 판매</option>
              <option value="기타">기타</option>
            </select>
          </div>
          <div>
            <label className="text-zinc-500 font-bold block mb-1">수신처 (공급사)</label>
            <div className="border border-line rounded px-2 py-1 bg-white text-zinc-700 font-semibold truncate" title={supplierName}>
              {supplierName || "-"}
            </div>
          </div>
        </div>

        {/* ── 공급사 정보 + 상품 테이블 ── */}
        <div className="flex-1 overflow-y-auto max-h-[45vh] px-6 py-4 space-y-3 bg-zinc-50/30">
          {multipleSuppliers && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[15px] text-amber-800 flex items-start gap-2">
              <span className="text-[15px] leading-none">⚠️</span>
              <div className="min-w-0">
                <div className="font-bold text-amber-900">
                  여러 공급사 · 대표 공급사({supplierName || uniqueSuppliers[0] || "-"})로 발송
                </div>
                <div className="mt-0.5 text-amber-700">
                  선택된 상품이 <span className="font-bold tabular-nums">{uniqueSuppliers.length}개</span> 공급사에 걸쳐 있습니다 · {uniqueSuppliers.join(" · ")}
                </div>
              </div>
            </div>
          )}
          <Card clip padding="none">
            {/* 공급사 정보 헤더 (sky·rose gradient) */}
            <div className="px-4 py-3 bg-rose-50/60 border-b border-line flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[14px] font-bold text-rose-600 bg-white border border-rose-200 rounded-full px-2 py-0.5 shrink-0">반품 요청서</span>
                <span className="text-sm font-bold text-zinc-900 truncate">{supplierName || "(공급사 미지정)"}</span>
                {vendorCategory && <VendorCategoryBadge category={vendorCategory} />}
                <span className="text-[14px] tabular-nums text-rose-600 bg-white border border-rose-200 rounded px-1.5 py-0.5 shrink-0">#{returnNumber}</span>
              </div>
              <div className="flex items-center gap-3 text-[14px] font-semibold text-zinc-500 flex-wrap">
                {supplierInfo?.contact_name && <span>👤 {supplierInfo.contact_name}</span>}
                {supplierInfo?.phone && <span className="flex items-center gap-1"><MessageSquare size={10}/>{supplierInfo.phone}</span>}
                {supplierInfo?.email && <span className="flex items-center gap-1"><Mail size={10}/>{supplierInfo.email}</span>}
              </div>
            </div>

            {/* 반품 예상 금액 카드 (rose 톤) */}
            <div className="px-4 py-3 bg-zinc-50/60 border-b border-line grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white rounded-lg border border-rose-200 p-2.5">
                <div className="text-[15px] font-bold text-rose-500 uppercase tracking-widest mb-1">이번 반품 예상 금액</div>
                <div className="text-lg font-bold text-rose-700 tabular-nums">{totalAmount > 0 ? totalAmount.toLocaleString() + "원" : "-"}</div>
                <div className="text-[15px] text-zinc-400 mt-0.5">반품수량 × 매입가 합계</div>
              </div>
              <div className="bg-white rounded-lg border border-amber-200 p-2.5">
                <div className="text-[15px] font-bold text-amber-500 uppercase tracking-widest mb-1">총 반품 수량</div>
                <div className="text-lg font-bold text-amber-700 tabular-nums">{totalQty > 0 ? `${totalQty.toLocaleString()}개` : "-"}</div>
                <div className="text-[15px] text-zinc-400 mt-0.5">라인 {lines.length}건</div>
              </div>
            </div>

            {/* 상품 테이블 */}
            <table className="w-full text-[15px]">
              <thead>
                <tr className="bg-zinc-100 text-zinc-500 font-bold uppercase tracking-wide text-[15px] border-b border-line">
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
              <tbody className="divide-y divide-zinc-100">
                {lines.map((r, iIdx) => {
                  const amount = (r.return_qty || 0) * (r.purchase_price || 0);
                  const overStock = r.return_qty > r.current_stock;
                  return (
                    <tr key={`${r.product_code}-${iIdx}`} className="hover:bg-rose-50/40">
                      <td className="p-2 text-center text-zinc-400 font-bold tabular-nums">{iIdx + 1}</td>
                      <td className="p-2 tabular-nums text-[14px] text-zinc-400">{r.product_code}</td>
                      <td className="p-2 font-bold text-zinc-800 truncate max-w-[220px]">{r.product_name}</td>
                      <td className="p-2 text-right text-zinc-600 tabular-nums">
                        {r.current_stock.toLocaleString()}
                        {r.actual_stock != null && r.actual_stock !== r.current_stock && (
                          <span className="block text-[15px] text-amber-600 font-normal leading-none mt-0.5">실 {r.actual_stock}</span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number" min={1} max={r.current_stock} value={r.return_qty}
                          onChange={e => updateLine(iIdx, { return_qty: Math.max(0, Number(e.target.value) || 0) })}
                          className={`w-16 border rounded px-1.5 py-0.5 text-right font-bold focus:outline-none focus:border-brand-deep tabular-nums ${overStock ? "border-red-400 text-red-600 bg-red-50" : "border-line text-rose-600"}`}
                          title={overStock ? "현재고를 초과합니다" : undefined}
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number" min={0} value={r.purchase_price || ""}
                          onChange={e => updateLine(iIdx, { purchase_price: e.target.value === "" ? 0 : Number(e.target.value) })}
                          placeholder="0"
                          className="w-20 border border-line rounded px-1.5 py-0.5 text-right focus:outline-none focus:border-brand-deep tabular-nums"
                        />
                      </td>
                      <td className="p-2 text-right font-bold text-rose-700 tabular-nums">
                        {amount > 0 ? `${amount.toLocaleString()}원` : "-"}
                      </td>
                      <td className="p-2">
                        <input
                          type="text" value={r.memo}
                          onChange={e => updateLine(iIdx, { memo: e.target.value })}
                          placeholder="(선택)"
                          className="w-full border border-line rounded px-1.5 py-0.5 text-[14px] focus:outline-none focus:border-brand-deep"
                        />
                      </td>
                      <td className="p-2 text-center">
                        {lines.length > 1 && (
                          <button type="button" onClick={() => removeLine(iIdx)}
                            className="text-zinc-300 hover:text-rose-600 cursor-pointer" title="이 상품 제거">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-zinc-50 border-t-2 border-zinc-300 font-bold text-[14px]">
                  <td colSpan={4} className="p-2 text-right text-zinc-500 uppercase">소계</td>
                  <td className="p-2 text-right text-rose-600 tabular-nums">{totalQty}개</td>
                  <td colSpan={1}></td>
                  <td className="p-2 text-right text-rose-700 tabular-nums">{totalAmount > 0 ? totalAmount.toLocaleString() + "원" : "-"}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </div>

        {/* 특이사항 메모 */}
        <div className="px-6 py-3 border-t border-zinc-100 bg-zinc-50/50">
          <label className="text-[15px] text-zinc-500 font-bold block mb-1">특이사항 · 요청 메모</label>
          <textarea
            value={memo} onChange={e => setMemo(e.target.value)}
            placeholder="공급사에 전달할 반품 사유·수거 요청 시간 등..."
            rows={2}
            className="w-full border border-line rounded px-2 py-1.5 text-[15px] focus:outline-none focus:border-brand-deep resize-none"
          />
          {sendError && (
            <div className="mt-2 text-[15px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
              {sendError}
            </div>
          )}
        </div>

        {/* 액션 버튼 */}
        <div className="px-6 py-4 border-t border-line bg-white flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[15px] text-zinc-500">
            총 <span className="font-bold text-zinc-800">{lines.length}개 상품</span> ·
            {" "}<span className="font-bold text-rose-700 tabular-nums">{totalQty}개</span> ·
            {" "}<span className="font-bold text-rose-700 tabular-nums">{totalAmount > 0 ? `${totalAmount.toLocaleString()}원` : "-"}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => !sending && !generatingPdf && onClose()}
              disabled={sending || generatingPdf}
              className="text-[14px] font-bold text-zinc-600 bg-white border border-zinc-300 hover:bg-zinc-50 rounded-lg px-4 py-2 cursor-pointer disabled:opacity-40"
            >취소</button>
            {/* 2026-08-25 · 사용자 지시 · 반품요청서 A4 텍스트 리포트 PDF 저장 */}
            <button
              onClick={handleSavePdf}
              disabled={sending || sent || generatingPdf || lines.length === 0}
              className="text-[14px] font-bold rounded-lg px-4 py-2 cursor-pointer shadow-sm flex items-center gap-1.5 disabled:opacity-40 text-white bg-slate-700 hover:bg-slate-800 ring-1 ring-slate-700/30"
              title="반품요청서 PDF 저장 (A4 텍스트 리포트)"
            >
              {generatingPdf ? <Spinner size={13} tone="white" /> : <FileDown size={13} strokeWidth={2.5} />}
              {generatingPdf ? "PDF 생성 중..." : "PDF 저장"}
            </button>
            <button
              onClick={send} disabled={sending || sent || generatingPdf}
              className={`text-[14px] font-bold rounded-lg px-5 py-2 cursor-pointer shadow-md flex items-center gap-2 disabled:opacity-60 border ${
                sent
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                  : "text-white bg-rose-500 hover:bg-rose-600 border-rose-700"
              }`}
            >
              {sent
                ? <><span className="inline-block w-3 h-3 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[15px] font-bold">✓</span>전송 완료</>
                : sending
                  ? <><Spinner size={13} tone="white"/>전송 중...</>
                  : "반품 요청 전송"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
    {/* 2026-08-25 · 오프스크린 PDF 프리뷰 · html2canvas 캡처 대상 */}
    <ReturnPdfPreview
      ref={pdfPreviewRef}
      returnNumber={returnNumber}
      requestDate={requestDate}
      expectedDate={expectedDate}
      reason={reason}
      supplierName={supplierName}
      supplierContact={supplierInfo?.contact_name ?? null}
      supplierPhone={supplierInfo?.phone ?? null}
      supplierEmail={supplierInfo?.email ?? null}
      lines={lines}
      memo={memo}
    />
    </>
  );
};
