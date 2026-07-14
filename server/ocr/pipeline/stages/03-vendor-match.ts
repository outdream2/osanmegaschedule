import { extractBusinessNumbersFromRawText, extractSupplierFromRawText } from "../../parse";
import { getVendorNames, getVendorBizNumMap, learnVendorBusinessNumber, getSupplierAliasMap } from "../../../productCache";
import { normSupplier, bigramSim } from "../../match";
import type { Stage } from "../types";

// Phase 10 (2026-07-14): 공급사 추출 → DB 매칭 (80%↑) → 안되면 다음 후보
//   1) parse.extractSupplierFromRawText 로 후보 리스트 확보 (상호·(주)·회사명패턴)
//   2) 각 후보를 vendors DB 와 fuzzy match (bigramSim ≥ 80)
//   3) 첫 매칭 후보 채택 (canonical DB 이름 사용)
//   4) 매칭 실패해도 raw 후보는 meta.supplier 로 유지 (수동 확인용)
//   5) 사업자번호 있으면 DB 조회 · 없으면 학습 등록
export function makeVendorMatchStage(_deps: {
  matchVendorSupplier: (s: string | null | undefined) => Promise<string | null>;
  findVendorInText: (t: string | null | undefined) => Promise<string | null>;
}): Stage {
  return {
    name: "vendor-match",
    async run(ctx) {
      const rawText = ctx.rawText ?? "";
      const direct = extractSupplierFromRawText(rawText);
      const bizList = extractBusinessNumbersFromRawText(rawText);
      const supplierBiz = bizList.filter(b => b.role !== "recipient");
      const primaryBiz = supplierBiz[0]?.bizNum ?? direct.supplierBizNum ?? null;

      console.log(`[vendor-match/입력] page ${ctx.page}: candidates=${JSON.stringify(direct.candidates)} · bizNum=${primaryBiz ?? "-"}`);

      // ① 사업자번호로 즉시 조회 (있으면 최고 신뢰)
      let vendorMatched: string | null = null;
      let matchSource = "";
      if (primaryBiz) {
        const bizMap = await getVendorBizNumMap();
        const byBiz = bizMap.get(primaryBiz);
        if (byBiz) {
          vendorMatched = byBiz;
          matchSource = "biznum";
          console.log(`[vendor-match/①사업자번호] ${primaryBiz} → "${byBiz}" (DB 매칭)`);
        } else {
          console.log(`[vendor-match/①사업자번호] ${primaryBiz} DB 미등록 (직후 학습 예정)`);
        }
      }

      // ② 후보 리스트 DB 매칭 (bigramSim ≥ 80)
      const aliasMap = await getSupplierAliasMap();
      const vendors = await getVendorNames();
      const vendorNorms = vendors.map(v => ({ name: v, n: normSupplier(v) }));

      const tryMatchCandidate = (cand: string): { db: string; score: number } | null => {
        // 별칭 우선
        const aliasKey = normSupplier(cand);
        const aliased = aliasMap.get(aliasKey);
        if (aliased) {
          const found = vendors.find(v => normSupplier(v) === normSupplier(aliased));
          if (found) return { db: found, score: 100 };
        }
        // fuzzy
        const target = normSupplier(cand);
        let best: { db: string; score: number } | null = null;
        for (const v of vendorNorms) {
          if (!v.n || v.n.length < 2) continue;
          const s = target === v.n ? 100
            : (target.includes(v.n) || v.n.includes(target)) ? 90
            : bigramSim(target, v.n);
          if (s >= 80 && (best === null || s > best.score)) {
            best = { db: v.name, score: s };
          }
        }
        return best;
      };

      if (!vendorMatched && direct.candidates.length > 0) {
        for (const cand of direct.candidates) {
          const m = tryMatchCandidate(cand);
          if (m) {
            vendorMatched = m.db;
            matchSource = `db-fuzzy(${m.score})`;
            console.log(`[vendor-match/②DB매칭] "${cand}" → "${m.db}" (score ${m.score})`);
            break;
          } else {
            console.log(`[vendor-match/②DB매칭] "${cand}" · DB 매칭 실패 · 다음 후보`);
          }
        }
      }

      // ③ DB 매칭 실패 → OCR 원본 후보 첫번째 그대로 사용 (미상 방지)
      if (!vendorMatched && direct.candidates.length > 0) {
        vendorMatched = direct.candidates[0];
        matchSource = "ocr-raw";
        console.log(`[vendor-match/③OCR원본] "${vendorMatched}" (DB 미매칭 · 수동 확인 필요)`);
      }

      // ④ 사업자번호 학습: 상호 확정 + 사업자번호 있는데 DB 미등록
      if (vendorMatched && primaryBiz) {
        const bizMap = await getVendorBizNumMap();
        if (!bizMap.get(primaryBiz)) {
          try {
            const r = await learnVendorBusinessNumber(vendorMatched, primaryBiz);
            if (r.action === "created" || r.action === "updated") {
              console.log(`[vendor-match/④학습] "${vendorMatched}" ↔ ${primaryBiz} (${r.action})`);
            } else {
              console.log(`[vendor-match/④학습] "${vendorMatched}" ↔ ${primaryBiz} (${r.action})`);
            }
          } catch (e: any) {
            console.warn(`[vendor-match/④학습] 실패:`, e?.message);
          }
        }
      }

      // meta 반영
      const meta = { ...ctx.meta };
      if (vendorMatched && vendorMatched !== meta.supplier) {
        console.log(`[vendor-match/최종] page ${ctx.page}: "${meta.supplier ?? "(없음)"}" → "${vendorMatched}" (${matchSource})`);
        meta.supplier = vendorMatched;
      } else if (vendorMatched) {
        console.log(`[vendor-match/최종] page ${ctx.page}: "${vendorMatched}" (${matchSource}) · 변경 없음`);
      } else {
        console.log(`[vendor-match/최종] page ${ctx.page}: 미상 (후보·biznum 모두 실패)`);
      }

      return { vendorMatched: vendorMatched ?? undefined, meta };
    },
  };
}
