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

      // DB 매칭 임계치 60 (B: 30→60 · 오매칭 억제 · 사업자번호는 exact 100)
      const MATCH_THRESHOLD = 60;
      // substring 매칭: 길이 비율 페널티 (A · 짧은 substring 오매칭 방지)
      const substringScore = (a: string, b: string): number => {
        const short = Math.min(a.length, b.length);
        const long = Math.max(a.length, b.length);
        if (long === 0) return 0;
        return Math.round(30 + (short / long) * 60);
      };
      const tryMatchCandidate = (cand: string): { db: string; score: number } | null => {
        // D: alias 결과도 실제 vendor 존재 여부 확인 · 오염된 alias 방어
        const aliasKey = normSupplier(cand);
        const aliased = aliasMap.get(aliasKey);
        if (aliased) {
          const aliasedNorm = normSupplier(aliased);
          const found = vendors.find(v => normSupplier(v) === aliasedNorm);
          if (found) return { db: found, score: 100 };
          console.warn(`[vendor-match/alias-invalid] "${cand}" → alias "${aliased}" 이 vendors DB 에 없음 · alias 무시`);
        }
        const target = normSupplier(cand);
        let best: { db: string; score: number } | null = null;
        for (const v of vendorNorms) {
          if (!v.n || v.n.length < 2) continue;
          let s: number;
          if (target === v.n) s = 100;
          else {
            const bs = bigramSim(target, v.n);
            const isSubstr = target.includes(v.n) || v.n.includes(target);
            s = isSubstr ? Math.max(substringScore(target, v.n), bs) : bs;
          }
          if (s >= MATCH_THRESHOLD && (best === null || s > best.score)) {
            best = { db: v.name, score: s };
          }
        }
        return best;
      };

      // B: metaSup 자체 신뢰도 판정 · 노이즈이면 부스트 안 함
      //   회사 접미어(제약/약품/바이오/…) 또는 (주)/㈜ 있으면 신뢰
      //   순수 라벨/카테고리("종옥의약품" 이 우연히 접미어 "의약품" 있어 통과할 수 있으므로
      //   접미어 앞에 진짜 회사명 부분이 있는지도 검증)
      const isTrustworthyMetaSup = (s: string): boolean => {
        if (!s || s.length < 3) return false;
        const HARD_NOISE = /^(?:종\s*[목옥의]|업\s*[태EH의]|등\s*[록둥의]|성\s*명|대\s*표|사\s*업\s*장|주\s*소|담\s*당|전\s*화|팩\s*스|공\s*급|매\s*입|수\s*신|법\s*인|거\s*래처|발\s*[급행])/;
        if (HARD_NOISE.test(s)) return false;
        // 회사 접미어 있어야 신뢰
        const SUFFIX = /(?:제약|약품|양행|바이오|팜(?![약])|메디|헬스케?어|화학|테크|랩(?!탑)|사이언스|(?:주식|합자|합명|유한)회사|\(주\)|㈜)/;
        return SUFFIX.test(s);
      };

      // ② ppuPaddle 원본 meta.supplier 최우선 · DB 매칭되면 그것 확정
      //   B: metaSup 자체가 신뢰 가능할 때만 +20 부스트 (노이즈 metaSup 방어)
      const nameMatches: Array<{ cand: string; db: string; score: number; from: string }> = [];
      const metaSup = (ctx.meta?.supplier ?? "").trim();
      let metaSupHandled = false;
      if (metaSup) {
        const mm = tryMatchCandidate(metaSup);
        if (mm) {
          const trusted = isTrustworthyMetaSup(metaSup);
          const boost = trusted ? 20 : 0;
          nameMatches.push({ cand: metaSup, db: mm.db, score: mm.score + boost, from: `meta${trusted ? "⭐" : ""}("${metaSup}")` });
          console.log(`[vendor-match/②meta] "${metaSup}" → "${mm.db}" (score ${mm.score}${trusted ? "+20⭐" : " · 부스트X"} · trusted=${trusted})`);
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
