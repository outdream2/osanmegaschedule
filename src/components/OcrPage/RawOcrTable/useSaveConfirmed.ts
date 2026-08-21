/**
 * useSaveConfirmed.ts
 * 확정표 저장 로직 · handleSaveConfirmed 훅
 * 2026-07-28 · RawOcrTable 2라운드 리팩터에서 분리
 *
 * 의존성이 많아 그룹핑된 props struct 로 전달받음:
 *   rowData   · 행/헤더/인덱스
 *   supplierData · 공급처 관련
 *   matchData · 매칭 상태
 *   balanceData · 잔고/할인
 *   filterData · 삭제/숨김 필터
 */
import { useCallback } from "react";
import { TIMING } from "../../../constants/timing";
import type { ConfirmedItem, MatchedItem, BarcodeProduct, CandidateInfo } from "./types";
import { parseNumber } from "./utils";
// 2026-08-21 · Framework Phase 3 · fetch → apiClient
import { api, ApiError } from "../../../lib/apiClient";

// ── 타입 정의 ──────────────────────────────────────────────────────────────

type ToastPayload = { type: "success" | "error"; msg: string } | null;

interface RowData {
  effectiveDispRows: (string | number | null)[][];
  pageNums: number[];
  dispHeaders: string[];
  nameIdx: number;
  amtIdx: number;
  ocrSuppIdx: number;
  ocrQtyIdx: number;
  ocrPriIdx: number;
}

interface SupplierData {
  rawSupplierByPage: Record<number, string>;
  supplierOverrides: Record<number, string>;
  globalSupplier: string;
  missingSupplierPages: number[];
  structuredPages: { page: number; meta: { supplier?: string; date?: string; total?: number } }[];
}

interface MatchData {
  matchItems: (MatchedItem | null)[] | null;
  cancelledRows: Set<number>;
  selectedCands: Record<number, CandidateInfo | undefined>;
  cancelledAutoMap: Set<number>;
  autoSynonymMatches: Record<number, { code: string; name: string } | undefined>;
  barcodeAutoMap: Record<number, BarcodeProduct | null | undefined>;
  cancelledAutoSyn: Set<number>;
  overrides: Record<number, string>;
}

interface BalanceData {
  pageSupplierBalances: Record<number, number>;
  pageBalanceOverride: Record<number, number>;
  pageBalanceFromConfig: Map<number, number>;
  discountApplyMode: Record<number, "before" | "after">;
  pageSubtotalChoices: Record<number, "stated" | "computed" | "custom">;
  erpCellEdits: Record<number, Record<string, string>>;
  confirmedAt: string;
}

interface FilterData {
  permanentlyDeletedRawRows: Set<number>;
  hiddenRawRows: Set<number>;
  isRowDbDeleted: (ri: number) => boolean;
}

export interface UseSaveConfirmedProps {
  onSaveConfirmed: ((items: ConfirmedItem[]) => Promise<void>) | undefined;
  pageImages?: string[];
  rowData: RowData;
  supplierData: SupplierData;
  matchData: MatchData;
  balanceData: BalanceData;
  filterData: FilterData;
  getPageDiscount: (pn: number) => { amount: number; label: string; isEstimated?: boolean; valid?: boolean } | null;
  getPageDisplayTotal: (pn: number) => number;
  setSaveConfirmedToast: (v: ToastPayload) => void;
  setSavingConfirmed: (v: boolean) => void;
}

// ── 훅 ─────────────────────────────────────────────────────────────────────

export function useSaveConfirmed({
  onSaveConfirmed,
  pageImages,
  rowData,
  supplierData,
  matchData,
  balanceData,
  filterData,
  getPageDiscount,
  getPageDisplayTotal,
  setSaveConfirmedToast,
  setSavingConfirmed,
}: UseSaveConfirmedProps) {
  const {
    effectiveDispRows, pageNums, dispHeaders, nameIdx, amtIdx, ocrSuppIdx, ocrQtyIdx, ocrPriIdx,
  } = rowData;

  const {
    rawSupplierByPage, supplierOverrides, globalSupplier, missingSupplierPages, structuredPages,
  } = supplierData;

  const {
    matchItems, cancelledRows, selectedCands, cancelledAutoMap,
    autoSynonymMatches, barcodeAutoMap, cancelledAutoSyn, overrides,
  } = matchData;

  const {
    pageSupplierBalances, pageBalanceOverride, pageBalanceFromConfig,
    discountApplyMode, pageSubtotalChoices, erpCellEdits, confirmedAt,
  } = balanceData;

  const { permanentlyDeletedRawRows, hiddenRawRows, isRowDbDeleted } = filterData;

  const handleSaveConfirmed = useCallback(async (filterPage?: number) => {
    if (!onSaveConfirmed || nameIdx < 0) return;
    if (missingSupplierPages.length > 0) {
      // 2026-08-21 · Framework Phase 3 · window.alert 제거 (blocking) · setSaveConfirmedToast 로 대체
      const pagesLabel = missingSupplierPages.join(", ");
      setSaveConfirmedToast({ type: "error", msg: `공급사 미입력 (${pagesLabel}번 페이지) · 1차보정에서 공급처 셀을 클릭해 입력하세요` });
      setTimeout(() => setSaveConfirmedToast(null), TIMING.TOAST_MEDIUM);
      return;
    }
    const expiryIdx = dispHeaders.indexOf("유통기한");
    const items: ConfirmedItem[] = [];
    effectiveDispRows.forEach((row, ri) => {
      const pn = pageNums[ri];
      if (filterPage != null && pn !== filterPage) return;
      // 2026-07-24 · 사용자 요청 "1차 삭제행 · 2차보정 절대 안 나오게 · 보정의 의미가 그런거잖아"
      //   handleSaveConfirmed 도 · 삭제·숨김·DB필터 행 완전 배제
      if (permanentlyDeletedRawRows.has(ri)) return;
      if (isRowDbDeleted(ri)) return;
      if (hiddenRawRows.has(ri)) return;
      const pageData = structuredPages.find(p => p.page === pn);
      // 공급처
      const rowSupp = ocrSuppIdx >= 0 ? String(row[ocrSuppIdx] ?? "").trim() : "";
      const supplier = (
        rawSupplierByPage[pn] !== undefined ? rawSupplierByPage[pn] :
        supplierOverrides[ri] !== undefined ? supplierOverrides[ri] :
        rowSupp || pageData?.meta.supplier || globalSupplier || ""
      ).trim();
      // 품명 (매칭 우선, 취소 상태 반영)
      const origName = String(row[nameIdx] ?? "").trim();
      const m = matchItems ? (cancelledRows.has(ri) ? null : (selectedCands[ri] ?? matchItems[ri]?.matched ?? null)) : null;
      const autoSyn = cancelledAutoMap.has(ri) ? undefined : autoSynonymMatches[ri];
      const bc = cancelledAutoMap.has(ri) ? null : (barcodeAutoMap[ri] ?? null);
      const productName = (cancelledAutoSyn.has(ri) || cancelledAutoMap.has(ri))
        ? (overrides[ri] ?? origName)
        : (overrides[ri] ?? m?.name ?? autoSyn?.name ?? bc?.name ?? origName);
      if (!supplier || !productName) return;
      const productCode = m?.code ?? autoSyn?.code ?? bc?.code ?? undefined;
      // 수량/단가/금액 — 2차 보정(erpCellEdits) 우선 반영
      const numOrUndef = (n: number): number | undefined => Number.isFinite(n) && n !== 0 ? n : undefined;
      const erpEdits = erpCellEdits[ri];
      const qtyEditV = erpEdits?.["OCR수량"] ?? erpEdits?.["수량"];
      const priEditV = erpEdits?.["단가"];
      const amtEditV = erpEdits?.["금액"];
      const qty = qtyEditV !== undefined
        ? numOrUndef(parseNumber(qtyEditV))
        : (ocrQtyIdx >= 0 ? numOrUndef(parseNumber(row[ocrQtyIdx])) : undefined);
      const pri = priEditV !== undefined
        ? numOrUndef(parseNumber(priEditV))
        : (ocrPriIdx >= 0 ? numOrUndef(parseNumber(row[ocrPriIdx])) : undefined);
      let amt: number | undefined;
      if (amtEditV !== undefined) amt = numOrUndef(parseNumber(amtEditV));
      // 2차보정 원복 (2026-07-18): 수량/단가 편집 있으면 금액 자동계산 (확정표 저장 시)
      else if ((qtyEditV !== undefined || priEditV !== undefined) && qty && pri && qty > 0 && pri > 0) {
        amt = Math.round(qty * pri);
      }
      else {
        const rawA = amtIdx >= 0 ? parseNumber(row[amtIdx]) : 0;
        if (rawA > 0) amt = numOrUndef(rawA);
        else if (qty && pri && qty > 0 && pri > 0) amt = Math.round(qty * pri);
        else amt = undefined;
      }
      // 유통기한 — erpCellEdits > OCR row > 매칭 정보
      const expiry = erpEdits?.["유통기한"] !== undefined
        ? String(erpEdits["유통기한"]).trim()
        : (expiryIdx >= 0 && row[expiryIdx] != null && String(row[expiryIdx]).trim()
            ? String(row[expiryIdx]).trim()
            : (m?.expiryDate ?? bc?.expiryDate ?? undefined));
      // 잔고 — 사용자 저장(pageSupplierBalances) > override > config 값
      const bal = pageSupplierBalances[pn] ?? pageBalanceOverride[pn] ?? pageBalanceFromConfig.get(pn);
      // raw
      const rawObj: Record<string, unknown> = {};
      dispHeaders.forEach((h, ci) => { rawObj[h] = row[ci] ?? null; });
      rawObj.__page = pn;
      if (pageData?.meta.date) rawObj.__date = pageData.meta.date;
      // 2026-07-22 · 에누리/차액/할인 금액 저장 (요구: 저장 시 꼭 넣어야)
      //   페이지별 discount 정보를 raw_json 에 __discount_* 필드로 포함
      //   applyMode: 사용자가 "적용 전" or "적용 후" 로 선택한 표시 모드
      const pageDisc = getPageDiscount(pn);
      if (pageDisc && pageDisc.amount > 0) {
        rawObj.__discount_amount = pageDisc.amount;
        rawObj.__discount_label = pageDisc.label;
        if (pageDisc.isEstimated) rawObj.__discount_estimated = true;
        rawObj.__discount_apply_mode = discountApplyMode[pn] ?? "before";
      }
      // 페이지 소계 · 사용자 선택 (stated/computed/custom) 도 참조용 저장
      const pageSubtotal = getPageDisplayTotal(pn);
      if (pageSubtotal > 0) rawObj.__page_subtotal = pageSubtotal;
      if (pageSubtotalChoices[pn]) rawObj.__page_subtotal_choice = pageSubtotalChoices[pn];

      // 거래명세서 원본 날짜 (meta.date) — 페이지별로 추출
      const invoiceDate = pageData?.meta.date ? String(pageData.meta.date).trim() : undefined;

      // 확정일: 셀 편집(erpCellEdits[ri]["확정일"]) 우선, 없으면 전체 confirmedAt
      const confirmedDate = (erpCellEdits[ri]?.["확정일"] ?? confirmedAt ?? "").trim() || undefined;
      items.push({
        supplier,
        product_name: String(productName),
        product_code: productCode ? String(productCode) : undefined,
        quantity: qty,
        unit_price: pri,
        amount: amt,
        balance: bal != null && Number.isFinite(bal) ? bal : undefined,
        expiry_date: expiry ? String(expiry) : undefined,
        memo: undefined,
        confirmed_at: confirmedDate,
        invoice_date: invoiceDate,
        raw_json: rawObj,
      });
    });

    if (items.length === 0) {
      setSaveConfirmedToast({ type: "error", msg: "저장할 항목이 없습니다." });
      setTimeout(() => setSaveConfirmedToast(null), TIMING.TOAST_SHORT);
      return;
    }

    setSavingConfirmed(true);
    try {
      // ── 페이지별 이미지 Cloudinary 병렬 업로드 (선택적) ─────────────
      // items 각각의 raw_json.__page 를 통해 pageNum 을 알고 있으므로
      // 저장 대상 페이지들 unique 목록만 뽑아 Promise.all 로 병렬 업로드
      // 업로드 실패는 items 저장에 영향 없음 (image 는 optional)
      const uniquePages = Array.from(
        new Set(items.map(it => Number((it.raw_json as any)?.__page)).filter(n => Number.isFinite(n) && n > 0))
      );
      const pageImagesMap = new Map<number, { url: string; public_id: string }>();
      if (pageImages && pageImages.length > 0 && uniquePages.length > 0) {
        setSaveConfirmedToast({ type: "success", msg: `명세서 이미지 업로드 중... (${uniquePages.length}장)` });
        const uploadResults = await Promise.allSettled(
          uniquePages.map(async (pn) => {
            const dataUrl = pageImages[pn - 1];
            if (!dataUrl || !dataUrl.startsWith("data:image/")) return null;
            // 2026-08-21 · Framework Phase 3 · fetch → apiClient
            try {
              const { data: d } = await api.post<{ url?: string; public_id?: string }>("/api/invoice-images/upload", { data_url: dataUrl, page: pn });
              return { pn, url: String(d.url ?? ""), public_id: String(d.public_id ?? "") };
            } catch (err: unknown) {
              const msg = err instanceof ApiError ? `${err.status} ${err.message}` : String((err as any)?.message ?? err);
              throw new Error(`p.${pn} 업로드 실패: ${msg}`);
            }
          })
        );
        let uploadedCount = 0;
        let failedCount = 0;
        uploadResults.forEach((r) => {
          if (r.status === "fulfilled" && r.value && r.value.url) {
            pageImagesMap.set(r.value.pn, { url: r.value.url, public_id: r.value.public_id });
            uploadedCount++;
          } else if (r.status === "rejected") {
            failedCount++;
            console.warn(`[handleSaveConfirmed] 이미지 업로드 실패: ${r.reason?.message ?? r.reason}`);
          }
        });
        if (failedCount > 0) {
          console.warn(`[handleSaveConfirmed] 이미지 ${uploadedCount}장 업로드 · ${failedCount}장 실패 (items 저장은 계속)`);
        } else {
          console.log(`[handleSaveConfirmed] 이미지 ${uploadedCount}장 업로드 완료`);
        }
      }

      // items 에 image_url · image_public_id 병합
      const itemsWithImages: ConfirmedItem[] = items.map((it) => {
        const pn = Number((it.raw_json as any)?.__page);
        const img = Number.isFinite(pn) ? pageImagesMap.get(pn) : undefined;
        if (!img) return it;
        return { ...it, image_url: img.url, image_public_id: img.public_id };
      });

      await onSaveConfirmed(itemsWithImages);
      const imgNote = pageImagesMap.size > 0 ? ` · 이미지 ${pageImagesMap.size}장 첨부` : "";
      setSaveConfirmedToast({ type: "success", msg: `저장 완료! (${items.length}건${imgNote})` });
    } catch (e: any) {
      setSaveConfirmedToast({ type: "error", msg: e?.message ?? "저장 실패" });
    } finally {
      setSavingConfirmed(false);
      setTimeout(() => setSaveConfirmedToast(null), TIMING.TOAST_SHORT);
    }
  }, [
    onSaveConfirmed, nameIdx, dispHeaders, effectiveDispRows, pageNums, structuredPages,
    ocrSuppIdx, rawSupplierByPage, supplierOverrides, globalSupplier, matchItems, cancelledRows,
    selectedCands, cancelledAutoMap, autoSynonymMatches, barcodeAutoMap, cancelledAutoSyn,
    overrides, ocrQtyIdx, ocrPriIdx, amtIdx, pageBalanceFromConfig,
    erpCellEdits, pageSupplierBalances, pageBalanceOverride, confirmedAt, missingSupplierPages,
    pageImages, permanentlyDeletedRawRows, hiddenRawRows, isRowDbDeleted,
    getPageDiscount, getPageDisplayTotal, discountApplyMode, pageSubtotalChoices,
    setSaveConfirmedToast, setSavingConfirmed,
  ]);

  return { handleSaveConfirmed };
}
