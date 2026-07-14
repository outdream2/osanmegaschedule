import { extractBusinessNumbersFromRawText, extractSupplierFromRawText } from "../../parse";
import { getVendorBizNumMap, learnVendorBusinessNumber } from "../../../productCache";
import { getSupplierAliasMap } from "../../../productCache";
import { normSupplier } from "../../match";
import type { Stage } from "../types";

// Phase 7 v2 (2026-07-14): 우선순위 재조정
//   1) 사업자번호 (공급자 role)
//   2) findVendorInText (rawText 헤더 우선 · 신뢰도 높음)
//   3) matchVendorSupplier (meta.supplier fuzzy · 안전망)
//   + 별칭 (ocr_supplier_aliases) 항상 해석
export function makeVendorMatchStage(deps: {
  matchVendorSupplier: (s: string | null | undefined) => Promise<string | null>;
  findVendorInText: (t: string | null | undefined) => Promise<string | null>;
}): Stage {
  return {
    name: "vendor-match",
    async run(ctx) {
      let vendorMatched: string | null = null;
      let matchSource: "direct+biznum" | "direct" | "biznum" | "rawText" | "name" | "alias" = "rawText";

      const aliasMap = await getSupplierAliasMap();
      const resolveAlias = (s: string | null | undefined): string | null => {
        if (!s) return null;
        const key = normSupplier(s);
        const resolved = aliasMap.get(key);
        return resolved ?? s;
      };

      // ═══════════════════════════════════════════════════════════════════
      //  Phase 8 (2026-07-14): 이중 검증 방식
      //   ① OCR 직접 추출 (상호 라벨 + 공급자 영역 회사명 패턴)
      //   ② 사업자번호 추출 + DB 조회
      //   → 두 결과 대조 · 상호 보완
      // ═══════════════════════════════════════════════════════════════════

      // ① OCR 직접 추출
      const direct = extractSupplierFromRawText(ctx.rawText ?? "");
      const directSupplier = direct.supplier ? resolveAlias(direct.supplier) : null;
      const directBizNum = direct.supplierBizNum;
      if (direct.supplier) {
        console.log(`[vendor-match/direct①] page ${ctx.page}: "${direct.supplier}"${direct.supplier !== directSupplier ? ` (alias→ "${directSupplier}")` : ""} · source=${direct.source}`);
      }

      // ② 사업자번호 추출 + DB 조회
      const bizMatches = extractBusinessNumbersFromRawText(ctx.rawText ?? "");
      const supplierBiz = bizMatches.filter(b => b.role === "supplier");
      const unknownBiz = bizMatches.filter(b => b.role === "unknown");
      const recipientBiz = bizMatches.filter(b => b.role === "recipient");
      const priorityBiz = [...supplierBiz, ...unknownBiz];
      let biznumSupplier: string | null = null;
      let biznumUsed: string | null = null;
      if (priorityBiz.length > 0) {
        const bizMap = await getVendorBizNumMap();
        for (const bm of priorityBiz) {
          const name = bizMap.get(bm.bizNum);
          if (name) {
            biznumSupplier = name;
            biznumUsed = bm.bizNum;
            console.log(`[vendor-match/biznum②] page ${ctx.page}: ${bm.bizNum} (${bm.role}) → "${name}"`);
            break;
          }
        }
      }
      if (recipientBiz.length > 0) {
        console.log(`[vendor-match] page ${ctx.page}: 수신처 사업자번호 ${recipientBiz.map(b => b.bizNum).join(", ")} · 매칭 제외`);
      }

      // ═══ 교차 검증 · 결과 채택 ═══
      const cleanForCompare = (s: string) => normSupplier(s).replace(/\(주\)|주식회사/g, "");
      if (directSupplier && biznumSupplier) {
        const dc = cleanForCompare(directSupplier);
        const bc = cleanForCompare(biznumSupplier);
        if (dc === bc || dc.includes(bc) || bc.includes(dc)) {
          // ✅ 두 로직 결과 일치 → 최고 신뢰도
          vendorMatched = biznumSupplier;   // DB 등록된 표기 사용
          matchSource = "direct+biznum";
          console.log(`[vendor-match/✅교차검증] page ${ctx.page}: ①=${directSupplier} · ②=${biznumSupplier} · 일치 → "${vendorMatched}"`);
        } else {
          // ⚠ 두 결과 불일치 · direct 우선 (명세서 원본 신뢰)
          vendorMatched = directSupplier;
          matchSource = "direct";
          console.warn(`[vendor-match/⚠️불일치] page ${ctx.page}: ①=${directSupplier} · ②=${biznumSupplier} · direct 채택`);
        }
      } else if (directSupplier) {
        vendorMatched = directSupplier;
        matchSource = "direct";
      } else if (biznumSupplier) {
        vendorMatched = biznumSupplier;
        matchSource = "biznum";
      }

      // ③ 두 검증 모두 실패 → 폴백 로직
      if (!vendorMatched) {
        vendorMatched = await deps.findVendorInText(ctx.rawText);
        if (vendorMatched) {
          matchSource = "rawText";
          console.log(`[vendor-match/rawText③] page ${ctx.page}: 폴백 "${vendorMatched}"`);
        }
      }

      // ④ 마지막 안전망: matchVendorSupplier (meta.supplier fuzzy)
      if (!vendorMatched && ctx.meta?.supplier) {
        const aliasHint = resolveAlias(ctx.meta.supplier);
        vendorMatched = await deps.matchVendorSupplier(aliasHint);
        if (vendorMatched) {
          matchSource = aliasHint !== ctx.meta.supplier ? "alias" : "name";
          console.log(`[vendor-match/${matchSource}④] page ${ctx.page}: "${ctx.meta.supplier}" → "${aliasHint}" → "${vendorMatched}"`);
        }
      }

      // 최종 별칭 해석
      if (vendorMatched) {
        const resolved = resolveAlias(vendorMatched);
        if (resolved && resolved !== vendorMatched) {
          console.log(`[vendor-match/alias-resolve] page ${ctx.page}: "${vendorMatched}" → "${resolved}"`);
          vendorMatched = resolved;
        }
      }

      // 사업자번호 학습: direct 로 상호 확정된 상태에서 사업자번호 있는데 DB 미등록 → 자동 등록
      const bizNumToLearn = directBizNum ?? (supplierBiz[0]?.bizNum);
      if (vendorMatched && bizNumToLearn && !biznumSupplier) {
        const learnResult = await learnVendorBusinessNumber(vendorMatched, bizNumToLearn);
        if (learnResult.action === "updated" || learnResult.action === "created") {
          console.log(`[vendor-match/learn] page ${ctx.page}: "${vendorMatched}" ↔ ${bizNumToLearn} (${learnResult.action})`);
        }
      }

      const meta = { ...ctx.meta };
      if (vendorMatched && vendorMatched !== meta.supplier) {
        console.log(`[vendor-match] page ${ctx.page}: "${meta.supplier ?? "(없음)"}" → "${vendorMatched}" (${matchSource})`);
        meta.supplier = vendorMatched;
      }

      return { vendorMatched: vendorMatched ?? undefined, meta };
    },
  };
}
