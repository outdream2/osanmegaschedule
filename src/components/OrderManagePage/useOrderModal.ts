// src/components/OrderManagePage/useOrderModal.ts
// 2026-08-23 · Framework Phase 4 · 발주서 모달 상태·핸들러 훅 분리
import { useState } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import type { OrderRequest } from "./OrderManagePage.types";
import type { OrderModalItem, OrderModalSupplier, OrderModalState } from "./OrderModal";

interface UseOrderModalOptions {
  allProductsMap: Record<string, any>;
  orderQtyOverride: Map<string, number>;
  findVendorByName: (name: string) => any;
  openSupplierInfo: (name: string | null | undefined) => void;
  loadOrderReqs: () => Promise<void>;
  setSelectedOrder: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function useOrderModal({
  allProductsMap,
  orderQtyOverride,
  findVendorByName,
  openSupplierInfo,
  loadOrderReqs,
  setSelectedOrder,
}: UseOrderModalOptions) {
  const { showError, showSuccess } = useToast();
  const confirm = useConfirm();

  const [sendingBulk, setSendingBulk] = useState(false);
  const [bulkChannels] = useState<{ email: boolean; sms: boolean; kakao: boolean }>({ email: false, sms: false, kakao: true });
  const [orderModal, setOrderModal] = useState<OrderModalState | null>(null);
  const [notifyLogisticsLeader, setNotifyLogisticsLeader] = useState(true);
  // 2026-08-29 · 사용자 지시 · 발주 발송 시 · 로컬 PDF 자동 저장 · 기본 true
  const [autoPdfOnSend, setAutoPdfOnSend] = useState(true);

  const openOrderModal = (rows: OrderRequest[]) => {
    if (rows.length === 0) return;
    const today = new Date();
    const ymdNow = today.toISOString().slice(0, 10);
    const genOrderNumber = () => `PO-${ymdNow.replace(/-/g, "")}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const bySupplier = new Map<string, OrderModalSupplier>();
    for (const r of rows) {
      const codeVars = [r.product_code, r.product_code.replace(/^0+/, ""), r.product_code.padStart(8, "0")];
      const prod = codeVars.map(c => allProductsMap[c]).find(Boolean) as any;
      const resolvedSupplier: string = (prod?.supplier || r.supplier || "").trim() || "(공급사 미지정)";
      const vendor = findVendorByName(resolvedSupplier);
      const sup = resolvedSupplier;
      if (!bySupplier.has(sup)) {
        bySupplier.set(sup, {
          supplier: sup, order_number: genOrderNumber(),
          supplier_contact: vendor?.contact_name || r.supplier_contact || prod?.supplier_contact || null,
          supplier_email:   vendor?.email        || r.supplier_email   || null,
          supplier_phone:   vendor?.phone        || r.supplier_phone   || null,
          balance: r.balance ?? null, ocr_balance: r.ocr_balance ?? null, items: [],
        });
      }
      const need = (r.optimal_stock ?? 0) - (r.current_stock ?? 0);
      // 2026-09-02 · #76 · fix · orderQtyOverride key 통일 · product_code 우선 · id fallback
      //   · 발주필요 · OrderNeedTable · product_code 로 저장 · 이 모달에서 조회 실패로 finalQty 잘못됨
      const override = orderQtyOverride.get(r.product_code) ?? orderQtyOverride.get(r.id);
      const finalQty = (override != null && override > 0) ? override : Math.max(1, need);
      bySupplier.get(sup)!.items.push({
        order_request_id: r.id, product_code: r.product_code, product_name: r.product_name,
        current_stock: r.current_stock, optimal_stock: r.optimal_stock, order_qty: finalQty, memo: "",
      });
    }
    const orderNumber = `PO-${ymdNow.replace(/-/g, "")}-BULK-${String(Math.floor(Math.random() * 900) + 100)}`;
    const arrival = new Date(today.getTime() + 3 * 86400000).toISOString().slice(0, 10);
    const suppliersList = [...bySupplier.values()].map(s => ({ ...s, ocr_loading: true, ocr_statements: [] as any[] }));

    // 이전 사입단가 조회
    (async () => {
      try {
        const codes = Array.from(new Set(suppliersList.flatMap(s => s.items.map(it => it.product_code)).filter(Boolean)));
        if (codes.length === 0) return;
        const { data: j } = await api.get<any>(`/api/products/purchase-history?codes=${encodeURIComponent(codes.join(","))}&limit=1`);
        const hist = j?.history ?? {};
        setOrderModal(prev => {
          if (!prev) return prev;
          return { ...prev, suppliers: prev.suppliers.map(s => ({ ...s, items: s.items.map(it => {
            const prev_unit_price = hist[it.product_code]?.latest_unit_price ?? null;
            return { ...it, prev_unit_price, unit_price: it.unit_price ?? prev_unit_price ?? null };
          }) })) };
        });
      } catch { /* ignore */ }
    })();

    // OCR 거래명세서 조회
    Promise.all(suppliersList.map(async (s) => {
      if (s.supplier === "(공급사 미지정)") return { supplier: s.supplier, items: [] as any[] };
      try {
        const { data } = await api.get<any>(`/api/ocr-confirmed-items?supplier=${encodeURIComponent(s.supplier)}&hasBalance=true`);
        return { supplier: s.supplier, items: Array.isArray(data?.items) ? data.items : [] };
      } catch { return { supplier: s.supplier, items: [] as any[] }; }
    })).then((results) => {
      setOrderModal(prev => {
        if (!prev) return prev;
        const map = new Map<string, any[]>(results.map(r => [r.supplier, r.items]));
        return { ...prev, suppliers: prev.suppliers.map(s => {
          const items = map.get(s.supplier) ?? [];
          const sorted = [...items].sort((a: any, b: any) => String(b.saved_at).localeCompare(String(a.saved_at)));
          const latestBalance = sorted.find((it: any) => it.balance != null)?.balance ?? null;
          return { ...s, ocr_loading: false, ocr_statements: sorted.slice(0, 10), ocr_balance: latestBalance };
        }) };
      });
    });

    setOrderModal({ orderNumber, orderDate: ymdNow, desiredArrival: arrival, memo: "", channels: { ...bulkChannels }, suppliers: suppliersList });
  };

  const updateModalItem = (supIdx: number, itemIdx: number, patch: Partial<OrderModalItem>) => {
    setOrderModal(prev => {
      if (!prev) return prev;
      const suppliers = prev.suppliers.map((s, i) => i !== supIdx ? s : {
        ...s, items: s.items.map((it, j) => j !== itemIdx ? it : { ...it, ...patch }),
      });
      return { ...prev, suppliers };
    });
  };

  const submitOrderModal = async () => {
    if (!orderModal) return;
    if (!orderModal.channels.email && !orderModal.channels.sms && !orderModal.channels.kakao) { showError("이메일·문자·카카오톡 중 하나 이상 선택해주세요."); return; }
    const totalItems = orderModal.suppliers.reduce((n, s) => n + s.items.length, 0);
    const proceed = await confirm({ message: `${orderModal.suppliers.length}개 공급사 · ${totalItems}개 상품에 발주서 ${orderModal.suppliers.length}건을 각각 발송합니다.\n\n계속하시겠습니까?` });
    if (!proceed) return;
    setSendingBulk(true);
    try {
      const submissions = orderModal.suppliers.map(async (s) => {
        try {
          const { data: body } = await api.post<any>("/api/order-requests/bulk-send", {
            order_number: s.order_number, order_date: orderModal.orderDate,
            desired_arrival: orderModal.desiredArrival, memo: s.memo ?? orderModal.memo,
            channels: orderModal.channels,
            bySupplier: [{ supplier: s.supplier, supplier_contact: s.supplier_contact, supplier_email: s.supplier_email, supplier_phone: s.supplier_phone,
              items: s.items.map(it => ({ order_request_id: it.order_request_id, product_code: it.product_code, product_name: it.product_name,
                current_stock: it.current_stock, optimal_stock: it.optimal_stock,
                needed_qty: (it.optimal_stock ?? 0) - (it.current_stock ?? 0), order_qty: it.order_qty, memo: it.memo })) }],
          });
          const outcomes = Array.isArray(body?.results?.[0]?.outcomes) ? body.results[0].outcomes as string[] : [];
          // 2026-09-02 · #76+ · fix · realSent 로직 재정렬 · 사용자 리포트 "발주 발송 안 돼"
          //   · 이전 · /skipped\(/ 만 매칭 · 실제 sent 는 false 로 오판 · '발송된 채널 없음' 오류
          //   · 이후 · :sent (실제 전송) 또는 skipped(...) (환경 미구성 dev) · DB dispatch 저장 성공이면 OK
          //   · body.ok === true (서버 확정) 우선 · outcomes 는 diagnostic
          const bodyOk = body?.ok === true || body?.results?.[0]?.dispatch_id != null;
          const anySent = outcomes.some(o => /:sent(\s|$)/.test(o));
          const anySkippedDev = outcomes.some(o => /skipped\(/.test(o));
          const realSent = bodyOk || anySent || anySkippedDev;
          return { supplier: s.supplier, order_number: s.order_number, ok: realSent, status: 200, error: !realSent ? "발송된 채널 없음 · 이메일·전화·카카오 미등록" : null, outcomes };
        } catch (e: any) {
          const errMsg = e instanceof ApiError ? e.message : (e?.message ?? String(e));
          return { supplier: s.supplier, order_number: s.order_number, ok: false, status: (e instanceof ApiError ? e.status : 0), error: `네트워크 오류: ${errMsg}`, outcomes: [] as string[] };
        }
      });
      const results = await Promise.all(submissions);
      const succeeded = results.filter(r => r.ok).length;
      const failed = results.filter(r => !r.ok);
      const missingByReason = (r: typeof failed[number]) => {
        const missing: string[] = [];
        if (r.outcomes.some(o => /email:no_recipient/.test(o))) missing.push("이메일");
        if (r.outcomes.some(o => /sms:no_recipient/.test(o))) missing.push("전화번호");
        if (r.outcomes.some(o => /kakao:no_recipient/.test(o))) missing.push("카카오 수신처 (전화번호)");
        return missing;
      };
      const summaryLines = [
        `✅ 성공: ${succeeded}건 / ❌ 실패: ${failed.length}건`, "",
        ...results.filter(r => r.ok).map(r => `✅ ${r.supplier} → #${r.order_number}${r.outcomes.length > 0 ? ` · ${r.outcomes.join(" · ")}` : ""}`),
        ...(failed.length > 0 ? ["", "❌ 실패 상세:", ...failed.map(r => {
          const missing = missingByReason(r);
          if (missing.length > 0) return `  · ${r.supplier}: ${missing.join(" · ")}이(가) 없습니다`;
          return `  · ${r.supplier} (#${r.order_number})${r.error ? ` · ${r.error}` : ""}${r.outcomes.length > 0 ? ` · ${r.outcomes.join(", ")}` : ""}`;
        })] : []),
      ].join("\n");
      showSuccess(`발주서 ${orderModal.suppliers.length}건 발송 결과\n\n${summaryLines}`);
      const needsEdit = failed.filter(r => missingByReason(r).length > 0);
      for (const r of needsEdit) {
        const missing = missingByReason(r);
        const proceed2 = await confirm({ title: `${r.supplier}`, message: `${missing.join(" · ")}이(가) 없습니다.\n공급사 정보 수정 페이지로 이동하시겠습니까?` });
        if (proceed2) { openSupplierInfo(r.supplier); break; }
      }
      setOrderModal(null);
      setSelectedOrder(new Set());
      loadOrderReqs();
    } catch (err: any) {
      showError(`❌ 발주 발송 오류: ${err?.message ?? err}`);
    } finally { setSendingBulk(false); }
  };

  return {
    orderModal, setOrderModal,
    sendingBulk,
    notifyLogisticsLeader, setNotifyLogisticsLeader,
    openOrderModal,
    updateModalItem,
    submitOrderModal,
  };
}
