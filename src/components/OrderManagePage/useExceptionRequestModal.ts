// src/components/OrderManagePage/useExceptionRequestModal.ts
// 2026-09-27 · 사용자 지시 · 발주이상 요청서 발송 hook
//   · 참고 · useOrderModal.ts (유사 구조 · 발주요청)
//   · 사용자 · 이상 라인 여러개 선택 → 공급사별 그룹핑 → 채널 선택 → 발송
//
// 대원칙:
//   · 프레임워크 · useToast · useConfirm · apiClient · Vendor lookup
//   · 세션 발송 완료 set · localStorage X (대원칙)
//   · 캐시 X (발주 대원칙)
//   · try/catch + prefix 로그 (대원칙)

import React, { useCallback, useState } from "react";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { ApiError } from "../../lib/apiClient";
import { getErrorMessage } from "../../lib/errorMessage";
import { displayVendorName } from "../../utils/vendorNameNormalize";
import {
  sendExceptionRequestsBulk,
  type OrderMatchRow,
} from "../../lib/api/orderPurchaseMatchApi";
import type { Vendor } from "../../hooks/useVendors";
import type { ExceptionType } from "../../shared/schemas/orderPurchaseMatch";

// ═══════════════════════════════════════════════════════════════
// 모달 상태 타입
// ═══════════════════════════════════════════════════════════════
export interface ExceptionRequestModalItem {
  order_id: string | number;
  product_code: string;
  product_name: string | null;
  order_qty: number;
  unit_price: number | null;
  purchase_qty: number;
  purchase_avg_price: number | null;
  purchase_date: string | null;
  exception_type: ExceptionType | string | null;
  exception_note: string | null;
  diff_desc: string;
}

export interface ExceptionRequestModalSupplier {
  supplier: string;
  supplierDisplay: string;
  supplier_contact: string | null;
  supplier_email: string | null;
  supplier_phone: string | null;
  items: ExceptionRequestModalItem[];
}

export interface ExceptionRequestModalState {
  suppliers: ExceptionRequestModalSupplier[];
  channels: { email: boolean; sms: boolean; kakao: boolean };
  memo: string;
}

// ═══════════════════════════════════════════════════════════════
// 유틸 · 이상 라인 · Diff 문구 계산 (모달 표시용)
// ═══════════════════════════════════════════════════════════════
function calcDiffDesc(r: OrderMatchRow): string {
  const orderQty = Number(r.order_qty ?? 0);
  const purchaseTotalQty = Number(r.purchase_total_qty ?? 0);
  const orderPrice = r.unit_price;
  const avgPrice = r.purchase_avg_price;
  if ((r.purchase_matches ?? []).length === 0) return "매입 이력 없음";
  const qtyDiff = purchaseTotalQty - orderQty;
  if (qtyDiff !== 0) return `수량 차이 ${qtyDiff > 0 ? "+" : ""}${qtyDiff}개`;
  if (orderPrice && avgPrice && orderPrice > 0) {
    const pct = ((avgPrice - orderPrice) / orderPrice) * 100;
    if (Math.abs(pct) > 0.5) return `단가 차이 ${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
  }
  return "";
}

// ═══════════════════════════════════════════════════════════════
// 훅
// ═══════════════════════════════════════════════════════════════
interface UseExceptionRequestModalOptions {
  findVendorByName: (name: string) => Vendor | undefined;
  onSent?: (sentOrderIds: Set<string>) => void;
}

export function useExceptionRequestModal({
  findVendorByName,
  onSent,
}: UseExceptionRequestModalOptions) {
  const { showError, showSuccess } = useToast();
  const confirm = useConfirm();

  const [exceptionModal, setExceptionModal] = useState<ExceptionRequestModalState | null>(null);
  const [sendingBulk, setSendingBulk] = useState(false);
  // 세션 발송 완료 set · localStorage X · 페이지 새로고침 시 초기화 (대원칙 · 발주요청 캐시 X)
  const [sentOrderIds, setSentOrderIds] = useState<Set<string>>(new Set());

  const openExceptionRequestModal = useCallback(
    (rows: OrderMatchRow[]) => {
      if (rows.length === 0) return;
      // 공급사별 그룹핑
      const bySupplier = new Map<string, ExceptionRequestModalSupplier>();
      for (const r of rows) {
        const supName = (r.supplier ?? "").trim() || "(공급사 미지정)";
        const supKey = supName;
        if (!bySupplier.has(supKey)) {
          const vendor = findVendorByName(supName);
          bySupplier.set(supKey, {
            supplier: supName,
            supplierDisplay: displayVendorName(supName) || supName,
            supplier_contact: vendor?.contact_name ?? null,
            supplier_email: vendor?.email ?? null,
            supplier_phone: vendor?.phone ?? null,
            items: [],
          });
        }
        bySupplier.get(supKey)!.items.push({
          order_id: r.id,
          product_code: r.product_code,
          product_name: r.product_name,
          order_qty: Number(r.order_qty ?? 0),
          unit_price: r.unit_price,
          purchase_qty: Number(r.purchase_total_qty ?? 0),
          purchase_avg_price: r.purchase_avg_price,
          purchase_date: r.purchase_matches?.[0]?.purchase_date ?? null,
          exception_type: (r.exception_type ?? r.auto_exception_type) as ExceptionType | string | null,
          exception_note: r.exception_note,
          diff_desc: calcDiffDesc(r),
        });
      }

      setExceptionModal({
        suppliers: Array.from(bySupplier.values()),
        channels: { email: true, sms: false, kakao: false },
        memo: "",
      });
    },
    [findVendorByName],
  );

  const closeExceptionRequestModal = useCallback(() => {
    if (sendingBulk) return;
    setExceptionModal(null);
  }, [sendingBulk]);

  const toggleChannel = useCallback((channel: "email" | "sms" | "kakao") => {
    setExceptionModal((prev) => {
      if (!prev) return prev;
      return { ...prev, channels: { ...prev.channels, [channel]: !prev.channels[channel] } };
    });
  }, []);

  const setMemo = useCallback((memo: string) => {
    setExceptionModal((prev) => (prev ? { ...prev, memo: memo.slice(0, 1000) } : prev));
  }, []);

  const submitExceptionRequestModal = useCallback(async () => {
    if (!exceptionModal) return;
    const totalItems = exceptionModal.suppliers.reduce((s, g) => s + g.items.length, 0);
    const totalSuppliers = exceptionModal.suppliers.length;
    const noChannel =
      !exceptionModal.channels.email && !exceptionModal.channels.sms && !exceptionModal.channels.kakao;

    // 확인창 · 공급사 · 담당자 · 건수 요약 (발주요청 확인창과 유사 · 사용자 익숙)
    const preSendDetails: React.ReactNode = React.createElement(
      "div",
      { className: "space-y-3 text-[15px]" },
      React.createElement(
        "div",
        {
          className:
            "rounded-lg border border-amber-300 bg-amber-50/70 px-3 py-2 text-[14px] text-amber-900 font-semibold",
        },
        `${totalSuppliers}개 공급사 · 총 ${totalItems}건 이상 요청서 발송 예정`,
      ),
      React.createElement(
        "div",
        { className: "flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1" },
        ...exceptionModal.suppliers.map((s, si) => {
          const contactBits: string[] = [];
          if (s.supplier_contact) contactBits.push(String(s.supplier_contact));
          if (s.supplier_phone) contactBits.push(String(s.supplier_phone));
          else if (s.supplier_email) contactBits.push(String(s.supplier_email));
          const contactLine =
            contactBits.length > 0 ? contactBits.join(" · ") : "담당자·연락처 미등록";
          const contactMissing = contactBits.length === 0;
          return React.createElement(
            "div",
            {
              key: `pre-ex-sup-${si}`,
              className: "rounded-lg border border-line bg-white px-3 py-2",
            },
            React.createElement(
              "div",
              { className: "flex items-center justify-between mb-1" },
              React.createElement("b", { className: "text-[15px] text-zinc-800" }, s.supplierDisplay),
              React.createElement(
                "span",
                { className: "text-[13px] font-bold text-amber-700 tabular-nums" },
                `${s.items.length}건`,
              ),
            ),
            React.createElement(
              "div",
              {
                className: `text-[13px] font-semibold ${
                  contactMissing ? "text-rose-700" : "text-zinc-500"
                }`,
              },
              contactLine,
            ),
          );
        }),
      ),
      noChannel
        ? React.createElement(
            "div",
            {
              className:
                "text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2 leading-relaxed",
            },
            "발송 채널이 선택되지 않았습니다. 결과는 기록되지 않고 저장만 됩니다.",
          )
        : React.createElement(
            "div",
            { className: "text-[14px] text-zinc-600" },
            "위 공급사 담당자에게 이상 요청서를 발송합니다.",
          ),
      React.createElement(
        "div",
        { className: "text-[14px] text-zinc-500 font-semibold" },
        "발송 후 되돌릴 수 없습니다. 계속하시겠습니까?",
      ),
    );
    const proceed = await confirm({
      title: "발주이상 요청서 발송",
      message: preSendDetails as any,
      confirmLabel: "발송",
      cancelLabel: "취소",
    });
    if (!proceed) return;

    setSendingBulk(true);
    try {
      const payload = {
        channels: exceptionModal.channels,
        memo: exceptionModal.memo.trim() || null,
        bySupplier: exceptionModal.suppliers.map((s) => ({
          supplier: s.supplier,
          supplier_contact: s.supplier_contact,
          supplier_email: s.supplier_email,
          supplier_phone: s.supplier_phone,
          order_ids: s.items.map((it) => it.order_id),
        })),
      };
      const resp = await sendExceptionRequestsBulk(payload);

      // 결과 · 채널별 outcomes 파싱 (발주요청과 동일 패턴)
      const anyRealSent = resp.results.some((r) =>
        r.outcomes.some((o) => /:sent(\s|$)/.test(o)),
      );

      type ChannelState = {
        channel: string;
        status: "sent" | "no_recipient" | "no_env" | "error";
        label: string;
        icon: string;
      };
      const channelStates: ChannelState[] = [];
      const collect = (name: "email" | "sms" | "kakao", label: string) => {
        if (!exceptionModal.channels[name]) return;
        const anySent = resp.results.some((r) =>
          r.outcomes.some((o) => new RegExp(`^${name}:sent`).test(o)),
        );
        const anyRcpt = resp.results.some((r) =>
          r.outcomes.some((o) => new RegExp(`${name}:no_recipient`).test(o)),
        );
        const anyEnv = resp.results.some((r) =>
          r.outcomes.some((o) =>
            new RegExp(`${name}:(no_env|no_smtp_env|no_gateway_env|no_template|skipped)`).test(o),
          ),
        );
        if (anySent) channelStates.push({ channel: name, status: "sent", label, icon: "OK" });
        else if (anyRcpt)
          channelStates.push({ channel: name, status: "no_recipient", label, icon: "!" });
        else if (anyEnv)
          channelStates.push({ channel: name, status: "no_env", label, icon: "!" });
        else channelStates.push({ channel: name, status: "error", label, icon: "!" });
      };
      collect("email", "이메일");
      collect("sms", "문자");
      collect("kakao", "카카오톡");

      const reasonLabel: Record<ChannelState["status"], string> = {
        sent: "정상 발송됨",
        no_recipient: "수신처 정보 없음 (공급사 등록 필요)",
        no_env: "환경 미설정 (개발중 · 서버 관리자 문의)",
        error: "발송 실패",
      };

      const dialogMessage: React.ReactNode = React.createElement(
        "div",
        { className: "space-y-3 text-[15px]" },
        React.createElement(
          "div",
          {
            className:
              "flex flex-col gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3",
          },
          ...resp.results.map((r, idx) =>
            React.createElement(
              "div",
              {
                key: `ex-sum-${idx}`,
                className: "text-[15px] text-emerald-900 leading-relaxed",
              },
              React.createElement("b", { className: "text-emerald-700" }, r.supplier),
              " · ",
              React.createElement("b", { className: "tabular-nums" }, `${r.item_count}건`),
              " 이상 요청 처리",
            ),
          ),
        ),
        React.createElement(
          "ul",
          { className: "flex flex-col gap-2 rounded-lg border border-line bg-zinc-50/50 p-3" },
          ...channelStates.map((cs) =>
            React.createElement(
              "li",
              {
                key: cs.channel,
                className: `flex items-center gap-2 text-[15px] ${
                  cs.status === "sent"
                    ? "text-emerald-700"
                    : cs.status === "no_env"
                      ? "text-amber-700"
                      : "text-rose-700"
                }`,
              },
              React.createElement("span", { className: "font-bold w-16" }, cs.label),
              React.createElement("span", { className: "text-[14px]" }, reasonLabel[cs.status]),
            ),
          ),
        ),
        !anyRealSent &&
          !noChannel &&
          React.createElement(
            "div",
            {
              className:
                "text-[13px] text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-2 py-1.5",
            },
            "실제 발송된 채널이 없습니다. 서버 환경 설정 · 공급사 연락처 등록 필요.",
          ),
      );

      await confirm({
        title: anyRealSent ? "발주이상 요청서 발송 완료" : "발주이상 요청서 · 확인 필요",
        message: dialogMessage,
        confirmLabel: "확인",
        cancelLabel: "닫기",
        danger: !anyRealSent && !noChannel,
      });

      // 세션 발송 완료 · sentOrderIds set 에 order_id 모두 추가
      const newSentIds = new Set<string>(sentOrderIds);
      for (const r of resp.results) {
        for (const oid of r.order_ids) newSentIds.add(String(oid));
      }
      setSentOrderIds(newSentIds);
      onSent?.(newSentIds);

      showSuccess("발주이상 요청서 발송 처리 완료");
      setExceptionModal(null);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : getErrorMessage(e, "발송 실패");
      showError(msg);
    } finally {
      setSendingBulk(false);
    }
  }, [exceptionModal, confirm, sentOrderIds, onSent, showError, showSuccess]);

  return {
    exceptionModal,
    sendingBulk,
    sentOrderIds,
    openExceptionRequestModal,
    closeExceptionRequestModal,
    toggleChannel,
    setMemo,
    submitExceptionRequestModal,
  };
}
