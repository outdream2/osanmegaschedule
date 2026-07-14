import { extractBusinessNumbersFromRawText, extractSupplierFromRawText } from "../../parse";
import { getVendorNames, getVendorBizNumMap, learnVendorBusinessNumber, getSupplierAliasMap, learnSupplierAlias } from "../../../productCache";
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

      let vendorMatched: string | null = null;
      let matchSource = "";
      const aliasMap = await getSupplierAliasMap();
      const vendors = await getVendorNames();
      const vendorNorms = vendors.map(v => ({ name: v, n: normSupplier(v) }));
      const bizMap = await getVendorBizNumMap();

      // ① 사업자번호 DB 조회 (exact match · score 100)
      let biznumMatched: { db: string; score: number; from: string } | null = null;
      if (primaryBiz) {
        const byBiz = bizMap.get(primaryBiz);
        if (byBiz) {
          biznumMatched = { db: byBiz, score: 100, from: `biznum(${primaryBiz})` };
          console.log(`[vendor-match/①사업자번호] ${primaryBiz} → "${byBiz}" (DB 매칭 · score 100)`);
        } else {
          console.log(`[vendor-match/①사업자번호] ${primaryBiz} DB 미등록 (매칭 후 학습 예정)`);
        }
      } else {
        console.log(`[vendor-match/①사업자번호] rawText 에 사업자번호 없음`);
      }

      // DB 매칭 임계치 30 (bigramSim 30% · OCR 오독 관대)
      const MATCH_THRESHOLD = 30;
      const tryMatchCandidate = (cand: string): { db: string; score: number } | null => {
        const aliasKey = normSupplier(cand);
        const aliased = aliasMap.get(aliasKey);
        if (aliased) {
          const found = vendors.find(v => normSupplier(v) === normSupplier(aliased));
          if (found) return { db: found, score: 100 };
        }
        const target = normSupplier(cand);
        let best: { db: string; score: number } | null = null;
        for (const v of vendorNorms) {
          if (!v.n || v.n.length < 2) continue;
          const s = target === v.n ? 100
            : (target.includes(v.n) || v.n.includes(target)) ? 90
            : bigramSim(target, v.n);
          if (s >= MATCH_THRESHOLD && (best === null || s > best.score)) {
            best = { db: v.name, score: s };
          }
        }
        return best;
      };

      // ② ppuPaddle 원본 meta.supplier 최우선 · DB 매칭되면 그것 확정
      //   raw OCR 이 잘 뽑았을 때 vendor-match 자체 후보로 덮어쓰는 걸 방지
      const nameMatches: Array<{ cand: string; db: string; score: number; from: string }> = [];
      const metaSup = (ctx.meta?.supplier ?? "").trim();
      let metaSupHandled = false;
      if (metaSup) {
        const mm = tryMatchCandidate(metaSup);
        if (mm) {
          nameMatches.push({ cand: metaSup, db: mm.db, score: mm.score + 20, from: `meta⭐("${metaSup}")` });
          console.log(`[vendor-match/②meta최우선] "${metaSup}" → "${mm.db}" (score ${mm.score}+20 부스트)`);
          metaSupHandled = true;
        } else {
          console.log(`[vendor-match/②meta] "${metaSup}" · DB 매칭 실패 · 다른 후보 탐색`);
        }
      }

      // ② 이름 후보 DB 매칭 (meta 확정 시 스킵 · 노이즈 픽업 방지)
      if (!metaSupHandled) {
        for (const cand of direct.candidates) {
          if (metaSup && normSupplier(cand) === normSupplier(metaSup)) continue;
          const m = tryMatchCandidate(cand);
          if (m) {
            nameMatches.push({ cand, db: m.db, score: m.score, from: `name("${cand}")` });
            console.log(`[vendor-match/②이름매칭] "${cand}" → "${m.db}" (score ${m.score})`);
          } else {
            console.log(`[vendor-match/②이름매칭] "${cand}" · 매칭 실패`);
          }
        }
      }

      // ②-b 상품명 제외 영역 토큰 스캔 (meta 확정 시 스킵 · 노이즈 방지)
      if (!metaSupHandled) {
      const nameIdxInRows = ctx.headers.indexOf("품명");
      const productNames = nameIdxInRows >= 0
        ? ctx.rows
            .map(r => Array.isArray(r) ? String(r[nameIdxInRows] ?? "").trim() : "")
            .filter(n => n.length >= 3)
        : [];
      let nonProductText = rawText;
      for (const pn of productNames) {
        // 정확 매칭 · 첫 5글자로 근사 (품명이 여러 줄로 나뉜 경우 대응)
        const core = pn.slice(0, Math.min(15, pn.length));
        if (core.length >= 3) {
          const parts = nonProductText.split(core);
          nonProductText = parts.join(" ");
        }
      }
      // 한글/영문 토큰 (2~20자 · 라벨/노이즈/수신처/이미 후보 배제)
      const seenCands = new Set(direct.candidates.map(c => normSupplier(c)));
      const tokenRegex = /[가-힣][가-힣A-Za-z0-9()·・\-]{1,19}/g;
      const extraTokens = new Set<string>();
      let tm: RegExpExecArray | null;
      while ((tm = tokenRegex.exec(nonProductText))) {
        const t = tm[0].trim().replace(/[\s·・\-]+$/, "");
        if (t.length < 3) continue;
        if (seenCands.has(normSupplier(t))) continue;
        extraTokens.add(t);
      }
      let extraMatchCount = 0;
      for (const tok of extraTokens) {
        const m = tryMatchCandidate(tok);
        if (m) {
          nameMatches.push({ cand: tok, db: m.db, score: m.score, from: `nonProduct("${tok}")` });
          extraMatchCount++;
        }
      }
      if (extraTokens.size > 0) {
        console.log(`[vendor-match/②-b비상품영역] 토큰 ${extraTokens.size}개 스캔 → DB 매칭 ${extraMatchCount}건`);
      }
      } // end !metaSupHandled

      // ③ 사업자번호 매칭 + 이름 매칭 모두 통합 · 최고점 채택
      const allMatches: Array<{ db: string; score: number; from: string }> = [];
      if (biznumMatched) allMatches.push(biznumMatched);
      allMatches.push(...nameMatches);
      if (allMatches.length > 0) {
        allMatches.sort((a, b) => b.score - a.score);
        const best = allMatches[0];
        vendorMatched = best.db;
        matchSource = best.from;
        console.log(`[vendor-match/✅최고점채택] page ${ctx.page}: "${best.db}" (score ${best.score}) · from ${best.from}`);
        if (allMatches.length > 1) {
          console.log(`[vendor-match/후보전체] ${allMatches.map(m => `${m.from}→"${m.db}"(${m.score})`).join(" · ")}`);
        }
      } else {
        console.log(`[vendor-match/③미상] page ${ctx.page}: 매칭된 후보 없음 · 공란 (사용자 입력 대기) · 이름후보=${JSON.stringify(direct.candidates)} · 사업자번호=${primaryBiz ?? "-"}`);
      }

      // ④ 사업자번호 학습: 상호 확정 + 사업자번호 있는데 DB 미등록
      if (vendorMatched && primaryBiz && !bizMap.get(primaryBiz)) {
        try {
          const r = await learnVendorBusinessNumber(vendorMatched, primaryBiz);
          console.log(`[vendor-match/④학습-사업자번호] "${vendorMatched}" ↔ ${primaryBiz} (${r.action})`);
        } catch (e: any) {
          console.warn(`[vendor-match/④학습-사업자번호] 실패:`, e?.message);
        }
      }

      // ⑤ Alias 학습: OCR 원본 이름이 DB canonical 과 다르면 alias 등록
      //   다음 스캔 시 즉시 매핑 (fuzzy 매칭 비용 절감)
      if (vendorMatched && matchSource.startsWith("name(")) {
        const rawCandMatch = matchSource.match(/name\("([^"]+)"\)/);
        const rawCand = rawCandMatch?.[1];
        if (rawCand && rawCand !== vendorMatched) {
          try {
            const r = await learnSupplierAlias(rawCand, vendorMatched);
            if (r.action === "created" || r.action === "updated") {
              console.log(`[vendor-match/⑤학습-alias] "${rawCand}" → "${vendorMatched}" (${r.action})`);
            }
          } catch (e: any) {
            console.warn(`[vendor-match/⑤학습-alias] 실패:`, e?.message);
          }
        }
      }

      // meta 반영
      const meta = { ...ctx.meta };
      if (vendorMatched) {
        if (vendorMatched !== meta.supplier) {
          console.log(`[vendor-match/최종] page ${ctx.page}: "${meta.supplier ?? "(없음)"}" → "${vendorMatched}" (${matchSource})`);
          meta.supplier = vendorMatched;
        } else {
          console.log(`[vendor-match/최종] page ${ctx.page}: "${vendorMatched}" (${matchSource}) · 변경 없음`);
        }
      } else {
        // DB 매칭 실패 → 공란 (사용자 입력 대기)
        console.log(`[vendor-match/최종] page ${ctx.page}: 미상 · 공란 처리 (사용자 입력 필요)`);
        meta.supplier = undefined;
      }

      return { vendorMatched: vendorMatched ?? undefined, meta };
    },
  };
}
