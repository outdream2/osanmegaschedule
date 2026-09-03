// 2026-08-22 · Framework Phase 4 · VendorListEditor.tsx large-file 분리
// VendorDetailModal · 공급사 상세 편집 모달 (탭: 정보/결제/매입이력)
//   · 자동 저장 · 매입이력 · 결제 등록 · 삭제 · 총재고 계산
//   · 관련 helpers: METHOD_OPTIONS · Field · SectionTitle · StatCard
// 2026-08-26 · large-file 분리 · VendorDetailApprovalBanner/PaymentPanel/PurchasePanel 이관

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { useConfirm } from "../../hooks/useConfirm";
import { useToast, toastClass } from "../../hooks/useToast";
import {
  Check, X, Building2, ChevronRight,
} from "lucide-react";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { Spinner } from "../common/Spinner";
import { GradientAccent } from "../common/GradientAccent";
import type { Vendor, EditDraft } from "./VendorListEditor.types";
import {
  vatDraftVal, emptyDraft, fmtWon, inputCls,
  normalizeBizNum, formatBizNum, formatBizNumProgressive,
} from "./VendorListEditor.utils";
// 2026-09-02 · 사용자 지시 · 주문방식 dropdown · xlsx 마스터
import { VENDOR_ORDER_METHODS, findOrderMethodUrl } from "../../data/vendorOrderMethods";
import { ExternalLink } from "lucide-react";
import { PaymentRegisterModal } from "./PaymentRegisterModal";
// 2026-08-22 · helpers 별도 파일 이관
import { Field, SectionTitle } from "./VendorDetailModal.helpers";
// 2026-08-25 · Framework Phase 4 · large-file 분리 · inline 타입 7개 이관
import type {
  PurchaseRow, VendorSummary, SupplierBalanceInfo,
  PaymentRow, LedgerRow, DetailTab, ApprovalStatus,
} from "./VendorDetailModal.types";
// 2026-08-26 · large-file 분리 · 서브패널 이관
import { VendorDetailApprovalBanner } from "./VendorDetailApprovalBanner";
// 2026-08-29 · 사용자 지시 · 승인요청 코멘트·버튼 · 거래처 로그인일 때만
import { useAuth } from "../../hooks/useAuth";
import { VendorDetailPaymentPanel } from "./VendorDetailPaymentPanel";
import { VendorDetailPurchasePanel } from "./VendorDetailPurchasePanel";

export const VendorDetailModal: React.FC<{
  vendor: Vendor;
  onClose: () => void;
  onSaved: () => void;
  panel?: boolean;
}> = ({ vendor, onClose, onSaved, panel }) => {
  const confirm = useConfirm();
  const { toast, showSuccess, showError } = useToast();
  // 2026-08-29 · 사용자 지시 · 승인요청 코멘트·버튼 · 거래처 로그인일 때만 노출
  const { session } = useAuth();
  const isVendorLogin = session?.role === "vendor";

  const [draft, setDraft] = useState<EditDraft>(emptyDraft(vendor));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // 2026-08-26 · #192 · 승인 요청 상태
  const [approvalRequesting, setApprovalRequesting] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | undefined>(
    (vendor as any)?.approval_status,
  );
  // 2026-08-10 · 사용자 요청 · 자동 저장 · draft 변경 800ms 후 자동 PATCH · '저장됨' toast (2s)
  const isFirstRenderRef = useRef(true);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [purchLoading, setPurchLoading] = useState(false);
  const [summary, setSummary] = useState<VendorSummary | null>(null);
  // 2026-08-10 · 총재고 = 상품별 · ERP current_stock × 최근 사입단가 합산
  //   1) /api/products-map · 전체 상품 map · 이 공급사 것만 filter
  //   2) /api/products/purchase-history?codes=... · latest_unit_price 조회
  //   3) 합산
  const [vendorTotalStock, setVendorTotalStock] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    if (!vendor?.company_name) return;
    (async () => {
      try {
        const { data: map } = await api.get<any>(`/api/products-map`);
        // 공급사 매칭 · (주) · vat 미포함 정제 후 비교
        const target = vendor.company_name.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim();
        const items: Array<{ code: string; qty: number }> = [];
        for (const [code, p] of Object.entries<any>(map)) {
          const supp = String(p?.supplier ?? "").replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim();
          if (!supp) continue;
          if (supp === target || supp.includes(target) || target.includes(supp)) {
            items.push({ code: String(code), qty: Number(p?.current_stock ?? 0) || 0 });
          }
        }
        if (items.length === 0) { if (alive) setVendorTotalStock(0); return; }
        const codes = items.map(i => i.code);
        // batch fetch · 200개씩 (URL 길이 제한)
        const CHUNK = 200;
        const hist: Record<string, any> = {};
        for (let i = 0; i < codes.length; i += CHUNK) {
          const chunk = codes.slice(i, i + CHUNK);
          const { data: d2 } = await api.get<any>(`/api/products/purchase-history?codes=${encodeURIComponent(chunk.join(","))}&limit=1`);
          Object.assign(hist, d2?.history ?? {});
        }
        const total = items.reduce((s, it) => {
          const price = Number(hist[it.code]?.latest_unit_price ?? 0) || 0;
          return s + it.qty * price;
        }, 0);
        if (alive) setVendorTotalStock(total);
      } catch {
        if (alive) setVendorTotalStock(null);
      }
    })();
    return () => { alive = false; };
  }, [vendor?.company_name]);
  const [activeTab, setActiveTab] = useState<DetailTab>("info");
  // 결제·잔고 데이터
  const [balanceInfo, setBalanceInfo] = useState<SupplierBalanceInfo | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [payMsg, setPayMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);

  // ESC · 배경 클릭 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 결제·잔고 로드 (payment 탭 · info 탭 KPI 용도)
  const loadPaymentData = useCallback(async () => {
    setPaymentLoading(true);
    try {
      const supplierEnc = encodeURIComponent(vendor.company_name);
      const [balRes, payRes, ledgerRes] = await Promise.all([
        api.get<any>(`/api/supplier-balance/${supplierEnc}`).catch(() => null),
        api.get<any>(`/api/supplier-payments?supplier=${supplierEnc}&days=3650`).catch(() => null),
        api.get<any>(`/api/supplier-ledger?supplier=${supplierEnc}&days=3650`).catch(() => null),
      ]);
      if (balRes) setBalanceInfo(balRes.data);
      if (payRes) setPayments(Array.isArray(payRes.data?.rows) ? payRes.data.rows : []);
      if (ledgerRes) setLedgerRows(Array.isArray(ledgerRes.data?.rows) ? ledgerRes.data.rows : []);
    } catch (e) {
      console.error("결제·잔고 로드 실패:", e);
    } finally {
      setPaymentLoading(false);
    }
  }, [vendor.company_name]);

  useEffect(() => { loadPaymentData(); }, [loadPaymentData]);

  // 결제 삭제
  const handleDeletePayment = async (id: number) => {
    if (!await confirm({ message: "결제 기록을 삭제하시겠습니까? 배분(allocations) 도 함께 삭제됩니다.", danger: true })) return;
    try {
      await api.del(`/api/supplier-payments/${id}`);
      setPayMsg({ type: "ok", text: "삭제 완료" });
      showSuccess("결제 기록이 삭제되었습니다");
      await loadPaymentData();
    } catch (e: any) {
      const msg = `삭제 실패: ${e?.message ?? e}`;
      setPayMsg({ type: "err", text: msg });
      showError(msg);
    }
  };

  // 매입 이력 · 통계 로드
  useEffect(() => {
    setPurchLoading(true);
    (async () => {
      try {
        const { data: j } = await api.get<any>(`/api/purchase-details?supplier=${encodeURIComponent(vendor.company_name)}&limit=1000`);
        const rows: PurchaseRow[] = Array.isArray(j.rows) ? j.rows : [];
        setPurchases(rows.slice(0, 30));
        const totalAmount = rows.reduce((s, r) => s + (Number(r.total ?? r.amount) || 0), 0);
        const totalQty    = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
        const uniqueCodes = new Set(rows.map(r => String(r.product_code)));
        const dates       = rows.map(r => String(r.purchase_date)).filter(Boolean).sort();
        setSummary({
          totalAmount, totalQty,
          uniqueProducts: uniqueCodes.size,
          latestDate:   dates[dates.length - 1] ?? null,
          earliestDate: dates[0] ?? null,
          count: rows.length,
        });
      } catch { setPurchases([]); setSummary(null); }
      finally { setPurchLoading(false); }
    })();
  }, [vendor.id, vendor.company_name]);

  const isDirty = useMemo(() => (
    draft.company_name    !== (vendor.company_name    ?? "") ||
    draft.business_number !== (vendor.business_number ?? "") ||
    draft.contact_name    !== (vendor.contact_name    ?? "") ||
    draft.phone           !== (vendor.phone           ?? "") ||
    draft.email           !== (vendor.email           ?? "") ||
    draft.category        !== (vendor.category        ?? "") ||
    draft.note            !== (vendor.note            ?? "") ||
    draft.vat_included    !== vatDraftVal(vendor) ||
    // #54 · 팀장·긴급연락처 3필드 dirty 체크 (승인 필수 항목이므로 저장 판정 정확도 필요)
    draft.team_leader_name  !== (vendor.team_leader_name  ?? "") ||
    draft.team_leader_phone !== (vendor.team_leader_phone ?? "") ||
    draft.emergency_contact !== (vendor.emergency_contact ?? "") ||
    // 2026-08-23 · #178 Phase D · 5 신규 필드 dirty 체크
    draft.order_method    !== (vendor.order_method    ?? "") ||
    draft.region          !== (vendor.region          ?? "") ||
    draft.invoice_method  !== (vendor.invoice_method  ?? "") ||
    draft.order_status    !== (vendor.order_status    ?? "") ||
    draft.special_notes   !== (vendor.special_notes   ?? "")
  ), [vendor, draft]);

  // 2026-08-10 · 자동 저장 · draft 변경 감지 · 800ms debounce · handleSave 호출 · 저장 후 2s 후 msg 사라짐
  useEffect(() => {
    if (isFirstRenderRef.current) { isFirstRenderRef.current = false; return; }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      handleSave();
    }, 800);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  // saveMsg 2초 후 자동 사라짐
  useEffect(() => {
    if (!saveMsg) return;
    const t = setTimeout(() => setSaveMsg(null), 2000);
    return () => clearTimeout(t);
  }, [saveMsg]);

  const handleSave = async () => {
    const bnDigits = normalizeBizNum(draft.business_number);
    if (bnDigits && bnDigits.length !== 10) {
      setSaveMsg({ type: "err", text: "사업자번호는 10자리 숫자여야 합니다" });
      return;
    }
    if (!draft.company_name.trim()) {
      setSaveMsg({ type: "err", text: "회사명은 필수입니다" });
      return;
    }
    setSaving(true); setSaveMsg(null);
    try {
      await api.patch(`/api/vendors/${vendor.id}`, {
        // 2026-07-22: 'email' 컬럼이 Supabase vendors 스키마에 없어 저장 실패 · 페이로드에서 제외
        //   (UI 는 유지 · 나중에 DB 마이그레이션 시 다시 활성)
        company_name:    draft.company_name.trim(),
        business_number: bnDigits || null,
        contact_name:    draft.contact_name.trim() || null,
        phone:           draft.phone.trim() || null,
        category:        draft.category.trim() || null,
        note:            draft.note.trim() || null,
        // 2026-08-03 · #193 · VAT 포함 여부 (unset → null)
        vat_included:    draft.vat_included === "included" ? true : draft.vat_included === "excluded" ? false : null,
        // 2026-08-10 · #21 · 팀장·긴급연락처 (마이그레이션 실행 전엔 서버 저장 실패해도 프론트 정상)
        team_leader_name:  draft.team_leader_name.trim()  || null,
        team_leader_phone: draft.team_leader_phone.trim() || null,
        emergency_contact: draft.emergency_contact.trim() || null,
        // 2026-08-23 · #178 Phase D · 5 신규 필드 (마이그레이션 미실행 시 서버 fallback)
        order_method:   draft.order_method.trim()   || null,
        region:         draft.region.trim()         || null,
        invoice_method: draft.invoice_method.trim() || null,
        order_status:   draft.order_status.trim()   || null,
        special_notes:  draft.special_notes.trim()  || null,
      });
      setSaveMsg({ type: "ok", text: "저장 완료" });
      showSuccess("저장되었습니다");
      // 2026-07-30 · 사용자 요청 · 분류(category) 저장 시 · 리스트 배지 즉시 반영 이벤트
      try { window.dispatchEvent(new CustomEvent("vendors-changed")); } catch { /* ignore */ }
      onSaved();
    } catch (e: any) {
      const msg = `저장 실패: ${e?.message ?? e}`;
      setSaveMsg({ type: "err", text: msg });
      showError(msg);
    } finally {
      setSaving(false);
    }
  };

  // 2026-09-02 · 사용자 지시 · 필수 5필드로 축소
  //   이메일(발주용) · 사업자번호 · 팀장 이름 · 팀장 연락처 · 긴급 연락처
  //   주문방식·특이사항·비고 은 필수에서 제외 (선택 입력)
  const REQUIRED_TOTAL = 5;
  const missingRequired = (() => {
    const missing: string[] = [];
    if (!draft.email.trim()) missing.push("이메일(발주용)");
    if (!draft.business_number.trim()) missing.push("사업자번호");
    if (!draft.team_leader_name.trim()) missing.push("팀장 이름");
    if (!draft.team_leader_phone.trim()) missing.push("팀장 연락처");
    if (!draft.emergency_contact.trim()) missing.push("긴급 연락처");
    return missing;
  })();
  // 2026-09-02 · 사용자 지시 · panel 조건 제거 · vendor 로그인 시 항상 활성 판정
  const canRequestApproval = isVendorLogin && approvalStatus !== "approved" && missingRequired.length === 0;

  const handleApprovalRequest = async () => {
    if (missingRequired.length > 0) {
      setSaveMsg({ type: "err", text: `필수 항목 미입력: ${missingRequired.join(" · ")}` });
      return;
    }
    setApprovalRequesting(true);
    setSaveMsg(null);
    try {
      // 저장 먼저 (dirty 상태면) · 승인 요청은 저장 후 진행
      if (isDirty) {
        await handleSave();
      }
      await api.post(`/api/vendors/${vendor.id}/approval-request`, {});
      setApprovalStatus("pending");
      setSaveMsg({ type: "ok", text: "관리자 승인 요청 완료 · 승인 완료 시 알림" });
      showSuccess("승인 요청 완료 · 관리자 확인 대기");
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : (e?.message ?? "승인 요청 실패");
      setSaveMsg({ type: "err", text: msg });
      showError(`승인 요청 실패 · ${msg}`);
    } finally {
      setApprovalRequesting(false);
    }
  };

  // ── 래퍼: panel 모드는 인라인 · 기본은 backdrop 모달 ──
  // 2026-08-17 v2 · Modal 통일 (panel 모드 아닌 경우 backdrop-brand)
  const backdropCls = panel
    ? "relative bg-white rounded-xl border border-line shadow-sm flex flex-col overflow-hidden min-h-0 flex-1"
    : "fixed inset-0 z-50 backdrop-brand flex items-center justify-center p-2 sm:p-4";

  const innerCls = panel
    ? "relative flex flex-col flex-1 min-h-0 overflow-hidden"
    : "relative bg-white rounded-2xl shadow-brand-modal w-full max-w-5xl h-[95vh] md:h-auto md:min-h-[85vh] md:max-h-[92vh] flex flex-col overflow-hidden";

  return (
    <div className={backdropCls} onClick={panel ? undefined : onClose}>
      <div
        className={innerCls}
        onClick={panel ? undefined : (e => e.stopPropagation())}
      >
        {/* ── 헤더 · v9 · 상단 gradient accent · glass style (2026-08-24) */}
        <div className="relative flex items-start justify-between px-6 py-4 border-b border-line bg-white shrink-0 gap-3">
          {/* v9 · 상단 2px gradient */}
          <GradientAccent size="thin" className="z-10" />
          {/* 2026-08-10 · 사용자 요청 · 분류 위 · 공급사명 아래 · 옆에 사업자·담당·전화 (PC 한줄 · 모바일 2줄) */}
          <div className="min-w-0 flex-1">
            {/* 분류 · 위쪽 별도 라인 */}
            <div className="mb-1"><VendorCategoryBadge category={vendor.category} /></div>
            {/* 공급사명 + 사업자·담당·전화 · PC 한줄 · 모바일 wrap */}
            <div className="flex items-baseline gap-x-4 gap-y-1 flex-wrap text-[17px]">
              <div className="text-[20px] font-bold text-zinc-900 leading-tight break-words shrink-0">{vendor.company_name}</div>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-zinc-400 font-semibold">사업자</span>
                {vendor.business_number
                  ? <span className="font-semibold text-zinc-800 tabular-nums font-mono">{formatBizNum(vendor.business_number)}</span>
                  : <span className="text-zinc-300 italic">미등록</span>}
              </span>
              <span className="text-zinc-200 hidden sm:inline">·</span>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-zinc-400 font-semibold">담당</span>
                {vendor.contact_name
                  ? <span className="font-semibold text-zinc-800">{vendor.contact_name}</span>
                  : <span className="text-zinc-300 italic">미등록</span>}
              </span>
              <span className="text-zinc-200 hidden sm:inline">·</span>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-zinc-400 font-semibold">전화</span>
                {vendor.phone
                  ? (
                    <a
                      href={`tel:${String(vendor.phone).replace(/[^0-9+]/g, "")}`}
                      onClick={e => e.stopPropagation()}
                      className="font-semibold text-zinc-800 hover:text-emerald-700 hover:underline tabular-nums"
                    >
                      {vendor.phone}
                    </a>
                  )
                  : <span className="text-zinc-300 italic">미등록</span>}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white hover:bg-zinc-100 border border-line flex items-center justify-center text-zinc-500 shrink-0 ml-3 transition"
            title="닫기 (ESC)"
          >
            <X size={15} />
          </button>
        </div>

        {/* 2026-08-09 · 사용자 요청 · 결제·잔고 · 매입이력 탭 제거 · 정보 한 장으로만 */}
        {/* 서브탭 UI 제거됨 · 정보 필드만 렌더 */}

        {/* ── 본문 ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">

          {/* 2026-09-02 · 사용자 지시 · vendor 로그인 · panel 불문 항상 표시 */}
          {isVendorLogin && (
            <VendorDetailApprovalBanner
              approvalStatus={approvalStatus}
              missingCount={missingRequired.length}
            />
          )}

          {/* ─── 정보 (탭 제거 · 한 장) ─── */}
          {(() => { void activeTab; return null; })()}
          {(true) && (
          <>
          {/* 2026-09-02 · 사용자 지시 · 공급 요약 (총재고·총상품·총매입) 섹션 제거 · vendor 화면 단순화 */}

          {/* 2026-08-10 · 사용자 요청 · 결제정보 · VAT 포함/별도 · 2체크박스 (하나만 활성) */}
          <div className="mb-4 pb-1.5 border-b border-zinc-100">
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
              <div className="flex items-center gap-2 shrink-0">
                <span className="w-1 h-4 rounded-full bg-amber-500 shrink-0" />
                <span className="text-[18px] font-bold text-amber-700">결제 정보</span>
              </div>
              <span className="text-[14px] text-zinc-400 shrink-0">거래명세서 금액</span>
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={draft.vat_included === "included"}
                  onChange={() => setDraft({ ...draft, vat_included: "included" })}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
                <span className={`text-[16px] font-semibold ${draft.vat_included === "included" ? "text-emerald-700" : "text-zinc-500"}`}>부가세 포함</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={draft.vat_included === "excluded"}
                  onChange={() => setDraft({ ...draft, vat_included: "excluded" })}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
                <span className={`text-[16px] font-semibold ${draft.vat_included === "excluded" ? "text-amber-700" : "text-zinc-500"}`}>부가세 별도</span>
              </label>
            </div>
          </div>

          {/* 2026-08-10 · 기본정보 단일 컬럼 · 공급요약 위로 이동됨 */}
          <div className="space-y-4">

            {/* Left · 기본 정보 편집 · 2026-09-02 · 2필드/행 · 컴팩트 · 5필드 accent */}
            <div className="space-y-3">
              <SectionTitle icon={<Building2 size={13} />} title="기본 정보" color="sky" />

              {/* 2026-09-02 · 사용자 지시 · 승인 필수 5필드 안내 (거래처 로그인 · 미승인 시만) · 색깔 통일 (emerald) */}
              {isVendorLogin && approvalStatus !== "approved" && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-[17px] leading-relaxed">
                  <div className="text-zinc-700">
                    <span className="inline-flex items-center gap-1 font-bold text-blue-700"><span className="w-2 h-2 rounded-full bg-blue-600" />파란색</span> 표시된 <span className="font-bold text-zinc-900">5개 항목</span>을 모두 입력하신 후 <span className="font-bold text-blue-700">[승인 요청]</span> 버튼을 누르시면 · 관리자 승인 완료 후 <span className="font-bold text-blue-700">당사 재고 현황</span>을 조회하실 수 있습니다.
                  </div>
                  <div className="mt-2 text-[16px] font-semibold text-blue-700">
                    사업자번호 · 이메일(발주용) · 팀장 이름 · 팀장 연락처 · 긴급 연락처
                  </div>
                </div>
              )}

              {/* Row 1 · 회사명 (readonly) | 공급자분류 | 주문방식 (dropdown + 바로가기) */}
              <div className="grid grid-cols-3 gap-3">
                <Field label="회사명" required>
                  <input
                    type="text"
                    value={draft.company_name}
                    readOnly
                    className={`${inputCls} bg-zinc-50 cursor-not-allowed text-zinc-700`}
                    title="공급사명 · 관리자만 수정 가능"
                  />
                </Field>
                <Field label="공급자분류">
                  <select
                    value={draft.category}
                    onChange={e => setDraft({ ...draft, category: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">(없음)</option>
                    <option value="위탁">위탁</option>
                    <option value="선결제">선결제</option>
                    <option value="60회전">60회전</option>
                    <option value="90회전">90회전</option>
                    <option value="기타">기타</option>
                  </select>
                </Field>
                <Field label="주문방식">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={draft.order_method}
                      onChange={e => setDraft({ ...draft, order_method: e.target.value })}
                      placeholder="목록·직접 입력"
                      list="vendor-order-methods"
                      className={`${inputCls} flex-1 min-w-0`}
                    />
                    <datalist id="vendor-order-methods">
                      {VENDOR_ORDER_METHODS.map(m => (
                        <option key={m.name} value={m.name} />
                      ))}
                    </datalist>
                    {(() => {
                      const url = findOrderMethodUrl(draft.order_method);
                      return (
                        <a
                          href={url ?? "#"}
                          target={url ? "_blank" : undefined}
                          rel={url ? "noopener noreferrer" : undefined}
                          onClick={e => { if (!url) e.preventDefault(); }}
                          aria-disabled={!url}
                          className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[14px] font-semibold shrink-0 transition ${
                            url
                              ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                              : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
                          }`}
                          title={url ?? "URL 미등록 주문방식"}
                        >
                          <ExternalLink size={12} />
                          바로가기
                        </a>
                      );
                    })()}
                  </div>
                </Field>
              </div>

              {/* Row 2 · 사업자번호 [indigo] | 담당자 이름 (readonly) | 담당자 연락처 (readonly) */}
              <div className="grid grid-cols-3 gap-3">
                <Field label="사업자번호" accent="blue">
                  <input
                    type="text"
                    value={formatBizNumProgressive(draft.business_number)}
                    onChange={e => setDraft({ ...draft, business_number: normalizeBizNum(e.target.value) })}
                    placeholder="000-00-00000"
                    className={`${inputCls} font-mono tracking-wider`}
                    maxLength={12}
                    inputMode="numeric"
                  />
                </Field>
                <Field label="담당자 이름" required>
                  <input
                    type="text"
                    value={draft.contact_name}
                    readOnly
                    className={`${inputCls} bg-zinc-50 cursor-not-allowed text-zinc-700`}
                    title="담당자 이름 · 관리자만 수정 가능"
                  />
                </Field>
                <Field label="담당자 연락처">
                  <input
                    type="text"
                    value={draft.phone}
                    readOnly
                    className={`${inputCls} bg-zinc-50 cursor-not-allowed text-zinc-700`}
                    title="담당자 연락처 · 로그인 ID · 관리자만 수정 가능"
                  />
                </Field>
              </div>

              {/* Row 3 · 이메일(발주용) [indigo] | 팀장 이름 [indigo] | 팀장 연락처 [indigo] */}
              <div className="grid grid-cols-3 gap-3">
                <Field label="이메일 (발주용)" accent="blue">
                  <input
                    type="email"
                    value={draft.email}
                    onChange={e => setDraft({ ...draft, email: e.target.value })}
                    placeholder="orders@company.com"
                    className={inputCls}
                  />
                </Field>
                <Field label="팀장 이름" accent="blue">
                  <input type="text" value={draft.team_leader_name}
                    onChange={e => setDraft({ ...draft, team_leader_name: e.target.value })}
                    placeholder="담당자와 별개" className={inputCls} />
                </Field>
                <Field label="팀장 연락처" accent="blue">
                  <input type="text" value={draft.team_leader_phone}
                    onChange={e => setDraft({ ...draft, team_leader_phone: e.target.value })}
                    placeholder="010-0000-0000" className={inputCls} />
                </Field>
              </div>

              {/* Row 4 · 긴급 연락처 [indigo] | (empty) | (empty) */}
              <div className="grid grid-cols-3 gap-3">
                <Field label="긴급 연락처" accent="blue">
                  <input type="text" value={draft.emergency_contact}
                    onChange={e => setDraft({ ...draft, emergency_contact: e.target.value })}
                    placeholder="야간·주말·비상" className={inputCls} />
                </Field>
                <div />
                <div />
              </div>

              {/* Row 5 · 발주 특이사항 · textarea full · 구분선 */}
              <div className="pt-3 mt-1 border-t border-zinc-100">
                <Field label="발주 특이사항">
                  <textarea
                    value={draft.special_notes}
                    onChange={e => setDraft({ ...draft, special_notes: e.target.value })}
                    placeholder="월요일 발주 X · 최소주문 · 결제 조건 등"
                    className={`${inputCls} h-[84px] resize-none border-amber-200 focus:border-amber-500 focus:ring-amber-200`}
                  />
                </Field>
              </div>
            </div>

            {/* 2026-08-10 · 사용자 요청 · 결제·잔고·매입이력 탭 안내 문구 제거 */}
          </div>
          </>
          )}

          {/* ─── 결제·잔고 탭 ─── */}
          {activeTab === "payment" && (
            <VendorDetailPaymentPanel
              balanceInfo={balanceInfo}
              payments={payments}
              paymentLoading={paymentLoading}
              ledgerRows={ledgerRows}
              payMsg={payMsg}
              onRegister={() => setShowPayModal(true)}
              onRefresh={loadPaymentData}
              onDeletePayment={handleDeletePayment}
            />
          )}

          {/* ─── 매입이력 탭 · 2026-08-04 공통 PurchaseHistoryList 사용 ─── */}
          {activeTab === "purchase" && (
            <VendorDetailPurchasePanel
              purchases={purchases}
              purchLoading={purchLoading}
            />
          )}

        </div>

        {/* ── 푸터 · 저장/닫기 ── */}
        <div className="px-5 py-3 border-t border-line bg-zinc-50/80 flex items-center gap-2 flex-wrap shrink-0">
          {saveMsg && (
            <span className={`inline-flex items-center gap-1 text-[14px] font-bold ${saveMsg.type === "ok" ? "text-emerald-600" : "text-rose-600"}`}>
              {saveMsg.type === "ok"
                ? <Check size={13} strokeWidth={3} />
                : <X size={13} strokeWidth={3} />}
              {saveMsg.text}
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="h-8 px-4 text-[14px] font-semibold bg-white border border-zinc-300 hover:bg-zinc-50 rounded-lg text-zinc-700 transition cursor-pointer"
          >
            닫기
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="inline-flex items-center gap-1.5 h-8 px-5 text-[14px] font-bold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition shadow-sm cursor-pointer"
          >
            {saving ? <Spinner size={12} tone="white" /> : <Check size={12} strokeWidth={2.5} />}
            저장
          </button>
          {/* 2026-09-02 · 사용자 지시 · [승인 요청] 버튼 · vendor 로그인 · panel 불문 항상 표시 */}
          {isVendorLogin && approvalStatus !== "approved" && (
            <button
              onClick={handleApprovalRequest}
              disabled={!canRequestApproval || approvalRequesting || saving}
              className={`inline-flex items-center gap-1.5 h-9 px-5 text-[15px] font-bold rounded-lg transition shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                canRequestApproval
                  ? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white ring-2 ring-blue-300/40"
                  : "bg-zinc-300 text-zinc-500"
              }`}
              title={missingRequired.length > 0 ? `필수 항목 미입력: ${missingRequired.join(" · ")}` : "관리자에게 승인 요청 발송"}
            >
              {approvalRequesting ? <Spinner size={12} tone="white" /> : <Check size={13} strokeWidth={2.5} />}
              {approvalStatus === "pending" ? "재요청" : "승인 요청"}
              {missingRequired.length > 0 && (
                <span className="ml-1 text-[13px] font-semibold tabular-nums opacity-80">({REQUIRED_TOTAL - missingRequired.length}/{REQUIRED_TOTAL})</span>
              )}
            </button>
          )}
        </div>

        {/* 결제 등록 모달 (2026-07-31) */}
        {showPayModal && (
          <PaymentRegisterModal
            supplierName={vendor.company_name}
            onClose={() => setShowPayModal(false)}
            onSaved={async () => {
              setShowPayModal(false);
              setPayMsg({ type: "ok", text: "결제 등록 완료" });
              showSuccess("결제가 등록되었습니다");
              await loadPaymentData();
            }}
          />
        )}

        {/* toast */}
        {toast && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10002] pointer-events-none">
            <div className={toastClass(toast.tone)}>{toast.message}</div>
          </div>
        )}
      </div>
    </div>
  );
};

