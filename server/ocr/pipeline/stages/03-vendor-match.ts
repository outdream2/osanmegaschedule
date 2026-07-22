import { extractBusinessNumbersFromRawText, extractSupplierFromRawText } from "../../parse";
import { getVendorNames, getVendorBizNumMap, learnVendorBusinessNumber, getSupplierAliasMap, learnSupplierAlias, getProductToSuppliersMap } from "../../../productCache";
import { DEFAULT_EXCLUDED_SUPPLIERS, isExcludedBusinessNumber } from "../../excludedSuppliers";
import { normSupplier, bigramSim, supplierSim } from "../../match";
import { supabase } from "../../../../src/supabase/client";
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

      console.log(`[vendor-match/입력 · v2026-07-21-v5] page ${ctx.page}: candidates=${JSON.stringify(direct.candidates)} · bizNum=${primaryBiz ?? "-"}`);

      let vendorMatched: string | null = null;
      let matchSource = "";
      const aliasMap = await getSupplierAliasMap();
      const vendors = await getVendorNames();
      const vendorNorms = vendors.map(v => ({ name: v, n: normSupplier(v) }));
      const bizMap = await getVendorBizNumMap();

      // ① 사업자번호 DB 조회 (exact match · score 100)
      //   2026-07-21 강화: primaryBiz 만이 아닌 · rawText 내 발견된 모든 biznum 시도
      //   role=recipient 는 명시 제외 · role=unknown 도 시도 (라벨 없어도 vendor 등록번호일 수 있음)
      //   blacklist 는 recipient 명시 대상만 · unknown 은 시도 후 매칭 성공 시 채택
      let biznumMatched: { db: string; score: number; from: string } | null = null;
      const allBiznumsToTry = bizList
        .filter(b => b.role !== "recipient")
        .map(b => b.bizNum)
        .filter(bn => !isExcludedBusinessNumber(bn));
      console.log(`[vendor-match/①사업자번호] page ${ctx.page}: bizList=${JSON.stringify(bizList)} · 시도목록=${JSON.stringify(allBiznumsToTry)}`);
      for (const bnCand of allBiznumsToTry) {
        const byBiz = bizMap.get(bnCand);
        if (byBiz) {
          biznumMatched = { db: byBiz, score: 100, from: `biznum(${bnCand})` };
          console.log(`[vendor-match/①사업자번호] ✅ 성공: ${bnCand} → "${byBiz}"`);
          break;
        } else {
          console.log(`[vendor-match/①사업자번호] ${bnCand} · bizMap 미등록 · 다음 후보 시도`);
        }
      }
      if (!biznumMatched && allBiznumsToTry.length === 0) {
        if (primaryBiz && isExcludedBusinessNumber(primaryBiz)) {
          console.warn(`[vendor-match/①사업자번호] 실패-모두blacklist: primaryBiz=${primaryBiz} · 수신처 blacklist 만 있음`);
        } else {
          console.log(`[vendor-match/①사업자번호] 실패-없음: rawText 에 유효 사업자번호 없음`);
        }
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
      // 2026-07-20: via 필드로 매칭 출처 명시 (alias vs exact vs fuzzy)
      //   → 하위 sort 에서 엄격한 우선순위 적용 (사업자번호 > alias > exact > fuzzy > 상품기반)
      const tryMatchCandidate = (cand: string): { db: string; score: number; via: "alias" | "exact" | "fuzzy" } | null => {
        // D: alias 결과도 실제 vendor 존재 여부 확인 · 오염된 alias 방어
        const aliasKey = normSupplier(cand);
        const aliased = aliasMap.get(aliasKey);
        if (aliased) {
          const aliasedNorm = normSupplier(aliased);
          const found = vendors.find(v => normSupplier(v) === aliasedNorm);
          if (found) return { db: found, score: 100, via: "alias" };
          console.warn(`[vendor-match/alias-invalid] "${cand}" → alias "${aliased}" 이 vendors DB 에 없음 · alias 무시`);
        }
        const target = normSupplier(cand);
        let best: { db: string; score: number; via: "exact" | "fuzzy" } | null = null;
        for (const v of vendorNorms) {
          if (!v.n || v.n.length < 2) continue;
          let s: number;
          let via: "exact" | "fuzzy";
          if (target === v.n) { s = 100; via = "exact"; }
          else {
            // 2026-07-22 · supplierSim = max(diceSim, jaroWinkler, tokenSetRatio) · 회사명 정확도 향상
            const bs = supplierSim(target, v.n);
            const isSubstr = target.includes(v.n) || v.n.includes(target);
            s = isSubstr ? Math.max(substringScore(target, v.n), bs) : bs;
            via = "fuzzy";
          }
          if (s >= MATCH_THRESHOLD && (best === null || s > best.score)) {
            best = { db: v.name, score: s, via };
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
      const nameMatches: Array<{ cand: string; db: string; score: number; from: string; via: "alias" | "exact" | "fuzzy" }> = [];
      const metaSup = (ctx.meta?.supplier ?? "").trim();
      let metaSupHandled = false;
      console.log(`[vendor-match/②이름매칭] page ${ctx.page}: 후보 리스트 · meta="${metaSup || "(없음)"}" · direct.candidates=${JSON.stringify(direct.candidates)} · vendorNorms 수=${vendorNorms.length}`);
      if (metaSup) {
        const mm = tryMatchCandidate(metaSup);
        const trusted = isTrustworthyMetaSup(metaSup);
        if (mm) {
          const boost = trusted ? 20 : 0;
          nameMatches.push({ cand: metaSup, db: mm.db, score: mm.score + boost, from: `meta${trusted ? "⭐" : ""}("${metaSup}")`, via: mm.via });
          console.log(`[vendor-match/②meta] 성공: "${metaSup}" → "${mm.db}" (score ${mm.score}${boost > 0 ? `+${boost}⭐` : " · 부스트X"} · trusted=${trusted})`);
          metaSupHandled = true;
        } else {
          console.log(`[vendor-match/②meta] 실패: "${metaSup}" · DB 매칭 없음 · trusted=${trusted} · threshold=${MATCH_THRESHOLD} · vendors ${vendorNorms.length}개 대상 전부 미달 · 다른 후보 탐색`);
        }
      } else {
        console.log(`[vendor-match/②meta] skip: meta.supplier 비어 있음`);
      }

      // ② 이름 후보 DB 매칭 (meta 확정 시 스킵 · 노이즈 픽업 방지)
      if (!metaSupHandled) {
        if (direct.candidates.length === 0) {
          console.log(`[vendor-match/②이름매칭] skip: direct.candidates 가 비어 있음 (extractSupplierFromRawText 에서 후보 없음)`);
        }
        for (const cand of direct.candidates) {
          if (metaSup && normSupplier(cand) === normSupplier(metaSup)) continue;
          const m = tryMatchCandidate(cand);
          if (m) {
            nameMatches.push({ cand, db: m.db, score: m.score, from: `name("${cand}")`, via: m.via });
            console.log(`[vendor-match/②이름매칭] 성공: "${cand}" → "${m.db}" (score ${m.score})`);
          } else {
            // 최고 점수 후보도 함께 표시 (임계값 미달 원인 파악)
            const normCand = normSupplier(cand);
            let debugBest: { db: string; score: number } | null = null;
            for (const v of vendorNorms) {
              if (!v.n || v.n.length < 2) continue;
              const bs = normCand === v.n ? 100 : supplierSim(normCand, v.n);
              if (debugBest === null || bs > debugBest.score) debugBest = { db: v.name, score: bs };
            }
            console.log(`[vendor-match/②이름매칭] 실패: "${cand}" (norm="${normCand}") · threshold=${MATCH_THRESHOLD} · 최고점 후보="${debugBest?.db ?? "없음"}" (score=${debugBest?.score ?? 0})`);
          }
        }
      } else {
        console.log(`[vendor-match/②이름매칭] skip: metaSupHandled=true · direct.candidates 스캔 생략`);
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
            nameMatches.push({ cand: tok, db: m.db, score: m.score, from: `nonProduct("${tok}")`, via: m.via });
            extraMatchCount++;
          }
        }
        if (extraTokens.size > 0) {
          console.log(`[vendor-match/②-b비상품영역] 토큰 ${extraTokens.size}개 스캔 → DB 매칭 ${extraMatchCount}건`);
        }
      } // end !metaSupHandled

      // ③ direct extract 최종채택 우선 정책 (2026-07-15 · 사용자 지시)
      //   extract 가 신뢰 가능한 이름 뽑았으면 그 이름으로 확정 · biznum 이 다른 회사 이름 반환해도 무시
      //   (원인: 과거 잘못 학습된 사업자번호 매핑 · 예: 3101805493 → "종옥의약품" 인데
      //          실제는 (주)대지인잠 → biznum 신뢰도 낮은 학습 데이터 방어)
      const directTrusted = direct.supplier && isTrustworthyMetaSup(direct.supplier);
      // biznum 결과가 direct extract 와 얼마나 유사한가 (다르면 오학습)
      const biznumMatchesDirect = biznumMatched && direct.supplier
        ? supplierSim(normSupplier(biznumMatched.db).replace(/\(주\)|주식회사/g, ""),
          normSupplier(direct.supplier).replace(/\(주\)|주식회사/g, "")) >= 40
        : false;
      if (biznumMatched && directTrusted && !biznumMatchesDirect) {
        console.warn(`[vendor-match/⚠️biznum-무시] page ${ctx.page}: extract="${direct.supplier}" ≠ biznum="${biznumMatched.db}" (오학습 의심 · biznum 채택 스킵)`);
      }

      // 2026-07-22: 사업자번호 무조건 최우선 (사용자 재확인)
      //   원문: "사업자번호로 공급사 먼저 찾아. ocr추출, 사업번호 확인, 상품 역검색"
      //   biznum 이 vendors DB 매칭되면 · direct extract 와 다르더라도 채택 (biznum 은 정부 등록 고유 번호)
      //   오학습 방어는 B-3 (eq exact match) + B-2 (근접 컨텍스트 검증) 에서 처리 · 여기서 스킵 X
      type MatchEntry = { db: string; score: number; from: string; via?: "alias" | "exact" | "fuzzy" };
      const allMatches: MatchEntry[] = [];
      if (biznumMatched) {
        allMatches.push(biznumMatched);
        if (directTrusted && !biznumMatchesDirect) {
          console.warn(`[vendor-match/⚠️biznum-우선]  page ${ctx.page}: extract="${direct.supplier}" vs biznum="${biznumMatched.db}" 다르지만 · 사업자번호 우선 정책 · biznum 채택 (오학습 의심 시 vendors DB 수동 확인 필요)`);
        }
      }
      allMatches.push(...nameMatches);
      if (allMatches.length > 0) {
        const tierOf = (m: MatchEntry): number => {
          if (m.from.startsWith("biznum")) return 1;
          if (m.via === "alias") return 2;
          if (m.via === "exact") return 3;
          return 4; // fuzzy or unlabeled
        };
        allMatches.sort((a, b) => {
          const ta = tierOf(a), tb = tierOf(b);
          if (ta !== tb) return ta - tb; // 낮은 tier = 높은 우선순위
          return b.score - a.score;
        });
        const best = allMatches[0];
        vendorMatched = best.db;
        matchSource = best.from;
        console.log(`[vendor-match/✅최고점채택] page ${ctx.page}: "${best.db}" (score ${best.score}) · from ${best.from}`);
        if (allMatches.length > 1) {
          console.log(`[vendor-match/후보전체] ${allMatches.map(m => `${m.from}→"${m.db}"(${m.score})`).join(" · ")}`);
        }
      } else {
        // 2026-07-20 fix: extract-raw 는 ③/④ 폴백 이후로 이동 (역방향 매칭 우선)
        //   기존 로직: directTrusted 이면 ③/④ 스킵 → 상품기반 역추적 기능이 무력화되던 버그
        //   개선: 항상 ③ 상품기반 → ④ 역인덱스 시도 · 실패 시에만 extract-raw
        // ③ 상품기반 fallback (2026-07-15) — rawText 에 공급자명 없어도
        //    상품명 → products.supplier 최빈값 (majority vote) 으로 유추
        //    예: 광동제약 명세서에서 공급자 라인이 잘려도 상품(광동원탕/광동쌍화탕/...)
        //        모두 products.supplier="(주)광동제약" → 자동 채택
        try {
          const nameIdx = ctx.headers.indexOf("품명");
          if (nameIdx < 0) {
            console.log(`[vendor-match/③상품기반] skip: headers 에 "품명" 없음 · headers=${JSON.stringify(ctx.headers)}`);
          } else {
            const productNames = Array.from(new Set(
              ctx.rows
                .map(r => Array.isArray(r) ? String(r[nameIdx] ?? "").trim() : "")
                .filter(n => n.length >= 2)
            ));
            console.log(`[vendor-match/③상품기반] page ${ctx.page}: 시도 · 상품명 ${productNames.length}개 · 샘플=${JSON.stringify(productNames.slice(0, 5))}`);
            // 2026-07-21: 임계값 5 → 2 완화 (거래명세서 소규모(2-4행)도 상품기반 매칭 가능하게)
            //   실사례: 코스트팜 명세서 2행(광동원탕/광동쌍화탕) → 광동제약 매칭 필요
            if (productNames.length < 2) {
              console.log(`[vendor-match/③상품기반] skip: 샘플 부족 (${productNames.length}개 < 2) · 최소 2개 필요`);
            } else {
              // 1) exact match 우선
              const { data: exactRows, error: prodErr } = await supabase
                .from("products")
                .select("product_name,supplier")
                .in("product_name", productNames);
              if (prodErr) {
                console.warn(`[vendor-match/③상품기반] products 조회 실패:`, prodErr.message);
              } else {
                const exactHitCount = (exactRows ?? []).length;
                console.log(`[vendor-match/③상품기반] exact 조회 결과: ${exactHitCount}건 히트 / ${productNames.length}개 조회`);
                const supplierCounts = new Map<string, number>();
                let totalHits = 0;
                const matchedNames = new Set<string>();
                for (const row of (exactRows ?? [])) {
                  const sup = String((row as any).supplier ?? "").trim();
                  const pn = String((row as any).product_name ?? "").trim();
                  if (!sup) continue;
                  supplierCounts.set(sup, (supplierCounts.get(sup) ?? 0) + 1);
                  matchedNames.add(pn);
                  totalHits++;
                }
                if (supplierCounts.size > 0) {
                  const voteSummary = Array.from(supplierCounts.entries()).map(([s, c]) => `"${s}"=${c}`).join(", ");
                  console.log(`[vendor-match/③상품기반] exact 득표: ${voteSummary}`);
                }
                // 2) exact 매칭 실패한 상품명에 대해 fuzzy fallback
                //    · OCR 오탈자 대응 · 상품명 앞 4자를 접두어로 ilike 검색
                //    · 예: "광동 원탕" (실패) → "광동" 으로 시작하는 상품 조회
                const missedNames = productNames.filter(n => !matchedNames.has(n) && n.length >= 4);
                const exactMatchRatio = productNames.length > 0 ? totalHits / productNames.length : 0;
                console.log(`[vendor-match/③상품기반] exact 매칭률=${Math.round(exactMatchRatio * 100)}% · missedNames=${missedNames.length}개 · fuzzy 발동 기준(<50%): ${exactMatchRatio < 0.5 ? "YES" : "NO"}`);
                if (missedNames.length > 0 && exactMatchRatio < 0.5) {
                  // 매칭률 50% 미만이면 fuzzy fallback 시도
                  const prefixSet = new Set<string>();
                  for (const n of missedNames) {
                    const cleaned = n.replace(/[\s()（）\[\]]/g, "");
                    if (cleaned.length >= 3) prefixSet.add(cleaned.slice(0, 3));  // 앞 3자
                  }
                  console.log(`[vendor-match/③상품기반-fuzzy] 접두어 ${prefixSet.size}개로 ILIKE 조회 시작 · prefixes=${JSON.stringify(Array.from(prefixSet).slice(0, 10))}`);
                  // OR 조건으로 병합 (Supabase 는 or() 사용)
                  const orExpr = Array.from(prefixSet).map(p => `product_name.ilike.${p}%`).join(",");
                  if (orExpr) {
                    const { data: fuzzyRows } = await supabase
                      .from("products")
                      .select("product_name,supplier")
                      .or(orExpr)
                      .limit(500);
                    let fuzzyAdded = 0;
                    for (const row of (fuzzyRows ?? [])) {
                      const sup = String((row as any).supplier ?? "").trim();
                      const pn = String((row as any).product_name ?? "").trim();
                      if (!sup || matchedNames.has(pn)) continue;
                      // OCR 상품명과 DB 상품명 앞 3자 매치되면 count
                      const cleanedDb = pn.replace(/[\s()（）\[\]]/g, "");
                      if ([...prefixSet].some(p => cleanedDb.startsWith(p))) {
                        supplierCounts.set(sup, (supplierCounts.get(sup) ?? 0) + 1);
                        matchedNames.add(pn);
                        totalHits++;
                        fuzzyAdded++;
                      }
                    }
                    if (fuzzyAdded > 0) {
                      const fuzzyVoteSummary = Array.from(supplierCounts.entries()).map(([s, c]) => `"${s}"=${c}`).join(", ");
                      console.log(`[vendor-match/③상품기반-fuzzy] 접두어 매칭 ${fuzzyAdded}건 추가 (총 ${totalHits}건) · 득표: ${fuzzyVoteSummary}`);
                    } else {
                      console.log(`[vendor-match/③상품기반-fuzzy] 접두어 매칭 0건 · DB 에 해당 접두어 상품 없음`);
                    }
                  }
                }
                if (totalHits === 0) {
                  console.log(`[vendor-match/③상품기반] 실패: products 매칭 0건 · exact ${exactHitCount}건 · fuzzy 후에도 0건 · 샘플 ${productNames.length}개 중 미스=${missedNames.length}개`);
                } else {
                  let topSup = "";
                  let topCnt = 0;
                  for (const [sup, cnt] of supplierCounts) {
                    if (cnt > topCnt) { topSup = sup; topCnt = cnt; }
                  }
                  // 수신처 blacklist 체크 (excludedSuppliers)
                  const envRaw = (process.env.OCR_EXCLUDED_SUPPLIERS ?? "") + "|" + (process.env.OCR_RECIPIENT_COMPANY ?? "");
                  const envExtra = envRaw.split(/[|,]/).map(s => s.trim()).filter(Boolean);
                  const excludedNorms = new Set([...DEFAULT_EXCLUDED_SUPPLIERS, ...envExtra].map(s => normSupplier(s)));
                  const topNorm = normSupplier(topSup);
                  const isBlacklisted = topNorm && [...excludedNorms].some(en => en && (topNorm === en || topNorm.includes(en) || en.includes(topNorm)));
                  const ratio = topCnt / totalHits;
                  if (isBlacklisted) {
                    console.log(`[vendor-match/③상품기반] 실패-blacklist: 최빈 supplier "${topSup}" 은 수신처 blacklist · ${topCnt}/${totalHits}표`);
                  } else if (ratio >= 0.5) {
                    vendorMatched = topSup;
                    matchSource = `product-majority(${topCnt}/${totalHits})`;
                    console.log(`[vendor-match/③상품기반] 성공: ${productNames.length}개 상품 → "${topSup}" (${topCnt}/${totalHits} · ${Math.round(ratio * 100)}%)`);
                  } else {
                    const allVotes = Array.from(supplierCounts.entries()).map(([s, c]) => `"${s}"=${c}`).join(", ");
                    console.log(`[vendor-match/③상품기반] 실패-우세부족: top="${topSup}" ${topCnt}/${totalHits} (${Math.round(ratio * 100)}% < 50%) · 전체득표: ${allVotes}`);
                  }
                }
              }
            }
          }
        } catch (e: any) {
          console.warn(`[vendor-match/③상품기반] 예외:`, e?.message);
        }

        // ④ 역인덱스 폴백 (Task #50 · 2026-07-19)
        //   ③ 상품기반 fallback 도 실패한 경우에만 동작 (샘플 부족 포함)
        //   추출된 상품명들을 getProductToSuppliersMap() 로 조회 → 최다 득표 공급사
        //   신뢰도(votes/total) < 30% 이면 채우지 않음 (임계값 40→30% 하향)
        if (!vendorMatched) {
          try {
            const nameIdxRl = ctx.headers.indexOf("품명");
            // Stage 3 와 달리 품목 수 하한 없음 (1개라도 히트 가능)
            const rlNamesRaw = nameIdxRl >= 0
              ? Array.from(new Set(
                  ctx.rows
                    .map(r => Array.isArray(r) ? String(r[nameIdxRl] ?? "").trim() : "")
                    .filter(n => n.length >= 2)
                ))
              : [];
            // 역인덱스 키는 toLowerCase · 원본도 함께 보관 (진단 로그용)
            const rlNames = rlNamesRaw.map(n => n.toLowerCase());
            if (rlNames.length === 0) {
              console.log(`[vendor-match/④역인덱스] skip: 품명 없음`);
            } else {
              const rlMap = await getProductToSuppliersMap();
              console.log(`[vendor-match/④역인덱스] 역인덱스 Map 크기=${rlMap.size} · 조회 상품=${rlNames.length}개: ${JSON.stringify(rlNamesRaw.slice(0, 5))}`);
              const voteCounts = new Map<string, number>();
              let totalVotes = 0;
              const hitNames: string[] = [];
              const missNames: string[] = [];
              for (let i = 0; i < rlNames.length; i++) {
                const pn = rlNames[i];
                const candidates = rlMap.get(pn);
                if (!candidates || candidates.length === 0) {
                  missNames.push(rlNamesRaw[i]);
                  continue;
                }
                // 1순위 공급사에만 투표 (다수결)
                const topSup = candidates[0].supplier;
                voteCounts.set(topSup, (voteCounts.get(topSup) ?? 0) + 1);
                totalVotes++;
                hitNames.push(rlNamesRaw[i]);
              }
              // ④-b · ILIKE 부분매칭 폴백 (2026-07-19)
              //   exact 매칭 hit 0 시 · products 테이블에 상품명 부분 매칭 · supplier 취합
              //   예: OCR "광동원탕" → SELECT supplier FROM products WHERE product_name ILIKE '%광동원탕%'
              if (totalVotes === 0 && rlNamesRaw.length > 0) {
                console.log(`[vendor-match/④-b ILIKE] exact 매칭 실패 · products 테이블 ILIKE 조회 시작 (${rlNamesRaw.length}개)`);
                for (let i = 0; i < rlNamesRaw.length; i++) {
                  const rawName = rlNamesRaw[i];
                  if (rawName.length < 3) continue; // 너무 짧은 이름 스킵
                  try {
                    const { data, error } = await supabase
                      .from("products")
                      .select("supplier")
                      .ilike("product_name", `%${rawName}%`)
                      .not("supplier", "is", null)
                      .limit(3);
                    if (error || !data || data.length === 0) {
                      if (!missNames.includes(rawName)) missNames.push(rawName);
                      continue;
                    }
                    // 첫번째 supplier 로 투표 (products 는 canonical 데이터)
                    const supHit = String((data[0] as any).supplier ?? "").trim();
                    if (supHit) {
                      voteCounts.set(supHit, (voteCounts.get(supHit) ?? 0) + 1);
                      totalVotes++;
                      if (!hitNames.includes(rawName)) hitNames.push(rawName);
                    }
                  } catch (e: any) {
                    console.warn(`[vendor-match/④-b ILIKE] "${rawName}" 예외:`, e?.message);
                  }
                }
                console.log(`[vendor-match/④-b ILIKE] 완료 · 히트 ${hitNames.length}건 (총 ${totalVotes}표)`);
              }
              if (totalVotes === 0) {
                console.log(`[vendor-match/④역인덱스] 역인덱스 히트 없음 (${rlNames.length}개 조회 · 미스: ${JSON.stringify(missNames.slice(0, 5))})`);
              } else {
                console.log(`[vendor-match/④역인덱스] 히트 ${hitNames.length}건: ${JSON.stringify(hitNames.slice(0, 5))} · 미스: ${JSON.stringify(missNames.slice(0, 5))}`);
                let topSup = "";
                let topVotes = 0;
                for (const [sup, cnt] of voteCounts) {
                  if (cnt > topVotes) { topSup = sup; topVotes = cnt; }
                }
                const confidence = topVotes / totalVotes;
                // 수신처 blacklist 체크
                const envRaw2 = (process.env.OCR_EXCLUDED_SUPPLIERS ?? "") + "|" + (process.env.OCR_RECIPIENT_COMPANY ?? "");
                const envExtra2 = envRaw2.split(/[|,]/).map(s => s.trim()).filter(Boolean);
                const excludedNorms2 = new Set([...DEFAULT_EXCLUDED_SUPPLIERS, ...envExtra2].map(s => normSupplier(s)));
                const topNorm2 = normSupplier(topSup);
                const isBlacklisted2 = topNorm2 && [...excludedNorms2].some(en => en && (topNorm2 === en || topNorm2.includes(en) || en.includes(topNorm2)));
                if (isBlacklisted2) {
                  console.log(`[vendor-match/④역인덱스] skip: 최빈 supplier "${topSup}" 수신처 blacklist`);
                } else if (confidence >= 0.3) {
                  vendorMatched = topSup;
                  matchSource = `reverse-lookup(${topVotes}/${totalVotes})`;
                  const inferenceInfo = { source: "reverse-lookup", votes: topVotes, total: totalVotes, confidence: Math.round(confidence * 100) };
                  (ctx.meta as any).supplier_inference = inferenceInfo;
                  console.log(`[vendor-match/④역인덱스] "${topSup}" (${topVotes}/${totalVotes} · ${Math.round(confidence * 100)}%)`);
                } else {
                  console.log(`[vendor-match/④역인덱스] 신뢰도 부족: top="${topSup}" ${topVotes}/${totalVotes} (${Math.round(confidence * 100)}% < 30%) · 공란 유지`);
                }
              }
            }
          } catch (e: any) {
            console.warn(`[vendor-match/④역인덱스] 예외:`, e?.message);
          }
        }

        // 2026-07-21 순서 재배치 · v5 (상품앞2자다수결) 를 extract-raw 보다 먼저!
        //   기존 버그: direct.candidates 에 노이즈("광동 아주" 등) 하나만 있어도 v5 스킵되고 노이즈 채택
        //   개선: DB 기반 v5 를 최우선 · extract-raw 는 v5/v6 모두 실패한 뒤에만
        // 5.0: v5 상품앞2자 다수결 (DB 기반 · 가장 신뢰)
        if (!vendorMatched) {
          const nameIdx5 = ctx.headers.indexOf("품명");
          console.log(`[vendor-match/v5-diag] page ${ctx.page}: nameIdx5=${nameIdx5} · headers=${JSON.stringify(ctx.headers)}`);
          if (nameIdx5 >= 0) {
            const productNames5: string[] = ctx.rows
              .map(r => Array.isArray(r) ? String(r[nameIdx5] ?? "").trim() : "")
              .filter(n => n.length >= 2 && /[가-힣]/.test(n));  // 한글 있는 것만 (숫자코드 배제)
            console.log(`[vendor-match/v5-diag] productNames5=${JSON.stringify(productNames5)}`);
            const prefixesUsed: string[] = [];
            const votesByVendor = new Map<string, number>();
            for (const pn of productNames5) {
              const productPrefix = pn.replace(/[\s()（）\[\]0-9A-Za-z]/g, "").slice(0, 2);  // 한글만 남기고 2자
              prefixesUsed.push(productPrefix);
              if (productPrefix.length < 2) continue;
              for (const v of vendorNorms) {
                if (!v.n || v.n.length < 2) continue;
                const isExcluded = DEFAULT_EXCLUDED_SUPPLIERS.some(ex => normSupplier(ex) === v.n);
                if (isExcluded) continue;
                if (v.n.startsWith(productPrefix)) {
                  votesByVendor.set(v.name, (votesByVendor.get(v.name) ?? 0) + 1);
                }
              }
            }
            console.log(`[vendor-match/v5-diag] prefixes=${JSON.stringify(prefixesUsed)} · vendorNorms 개수=${vendorNorms.length} · votes=${JSON.stringify(Array.from(votesByVendor.entries()))}`);
            if (votesByVendor.size > 0) {
              let bestVendor = "";
              let bestVotes = 0;
              for (const [name, votes] of votesByVendor) {
                if (votes > bestVotes) { bestVendor = name; bestVotes = votes; }
              }
              // 1표라도 있으면 채택 (DB에 있는 정확한 이름이므로)
              vendorMatched = bestVendor;
              matchSource = `product-prefix-vote(${bestVotes}/${productNames5.length})`;
              console.log(`[vendor-match/✅상품앞2자다수결] page ${ctx.page}: "${bestVendor}" (${bestVotes}/${productNames5.length}상품 매칭)`);
            } else {
              console.log(`[vendor-match/v5-실패] 어떤 vendor 도 상품 앞2자와 매칭 없음`);
            }
          } else {
            console.log(`[vendor-match/v5-실패] 헤더에 "품명" 없음`);
          }
        }

        // 5.1: extract-raw fallback (v5/v6 모두 실패한 뒤 · 마지막 수단)
        if (!vendorMatched) {
          const fallbackCandidates = [
            direct.supplier,
            direct.candidates[0],
            metaSup,
            ...direct.candidates.slice(1),
          ].filter((s): s is string => typeof s === "string" && s.trim().length >= 2);
          if (fallbackCandidates.length > 0) {
            const fallbackSup = fallbackCandidates[0].trim();
            vendorMatched = fallbackSup;
            matchSource = `extract-raw("${fallbackSup}")${directTrusted ? "" : "·untrusted"}`;
            console.log(`[vendor-match/✅extract최종폴백] page ${ctx.page}: "${fallbackSup}" (후보=${JSON.stringify(fallbackCandidates)})`);
          }
        }

        // 2026-07-21 v6 · 절대 실패 방지 최종 폴백: rawText 전체에서 vendor 이름 (or prefix) 스캔
        //   상품이 없거나 상품기반 실패했을 때도 · rawText 어딘가에 vendor 이름 조각 있으면 채택
        if (!vendorMatched) {
          const rtNorm = rawText.replace(/\s+/g, "");
          console.log(`[vendor-match/v6-diag] rtNorm 길이=${rtNorm.length} · vendorNorms 개수=${vendorNorms.length}`);
          let bestVendorName = "";
          let bestVendorLen = 0;
          const fullMatches: string[] = [];
          const prefixMatches: string[] = [];
          for (const v of vendorNorms) {
            if (!v.n || v.n.length < 2) continue;
            const isExcluded = DEFAULT_EXCLUDED_SUPPLIERS.some(ex => normSupplier(ex) === v.n);
            if (isExcluded) continue;
            // full name 포함 → 최우선 (긴 이름 우선)
            if (rtNorm.includes(v.n)) {
              fullMatches.push(v.name);
              if (v.n.length > bestVendorLen) {
                bestVendorName = v.name;
                bestVendorLen = v.n.length;
              }
            }
          }
          // full 매치 없으면 앞 3자 prefix 로 폴백
          console.log(`[vendor-match/v6-diag] full 매칭 ${fullMatches.length}건=${JSON.stringify(fullMatches.slice(0, 5))}`);
          if (!bestVendorName) {
            for (const v of vendorNorms) {
              if (!v.n || v.n.length < 3) continue;
              const isExcluded = DEFAULT_EXCLUDED_SUPPLIERS.some(ex => normSupplier(ex) === v.n);
              if (isExcluded) continue;
              const prefix3 = v.n.slice(0, 3);
              if (rtNorm.includes(prefix3)) {
                prefixMatches.push(`${v.name}(prefix="${prefix3}")`);
                if (v.n.length > bestVendorLen) {
                  bestVendorName = v.name;
                  bestVendorLen = v.n.length;
                }
              }
            }
            console.log(`[vendor-match/v6-diag] prefix3 매칭 ${prefixMatches.length}건=${JSON.stringify(prefixMatches.slice(0, 5))}`);
          }
          // 2026-07-21 v6.5: 2자 prefix 도 시도 (마지막 폴백 · 광동제약 → "광동" 등)
          if (!bestVendorName) {
            const prefix2Matches: string[] = [];
            for (const v of vendorNorms) {
              if (!v.n || v.n.length < 2) continue;
              const isExcluded = DEFAULT_EXCLUDED_SUPPLIERS.some(ex => normSupplier(ex) === v.n);
              if (isExcluded) continue;
              const prefix2 = v.n.slice(0, 2);
              if (rtNorm.includes(prefix2)) {
                prefix2Matches.push(`${v.name}(prefix2="${prefix2}")`);
                if (v.n.length > bestVendorLen) {
                  bestVendorName = v.name;
                  bestVendorLen = v.n.length;
                }
              }
            }
            console.log(`[vendor-match/v6-diag] prefix2 매칭 ${prefix2Matches.length}건=${JSON.stringify(prefix2Matches.slice(0, 5))}`);
          }
          if (bestVendorName) {
            vendorMatched = bestVendorName;
            matchSource = `rawtext-scan("${bestVendorName}")`;
            console.log(`[vendor-match/✅rawtext최종스캔] page ${ctx.page}: "${bestVendorName}" (rawText 전체 스캔 매칭)`);
          } else {
            console.log(`[vendor-match/v6-실패] rawText 에 vendor 이름·prefix 매칭 없음 · rawText 샘플="${rtNorm.slice(0, 200)}"`);
          }
        }

        if (!vendorMatched) {
          console.error(`[vendor-match/❌완전실패] page ${ctx.page}: 5-stage 모두 실패 · 이름후보=${JSON.stringify(direct.candidates)} · 사업자번호=${primaryBiz ?? "-"} · rawText길이=${rawText.length}`);
          console.error(`[vendor-match/❌완전실패] vendorNorms 샘플 (앞 5개)=${JSON.stringify(vendorNorms.slice(0, 5).map(v => v.n))}`);
        }
      }

      // ④ 사업자번호 학습 (오학습 방어 강화)
      //   조건: (1) 이름 확정  (2) 사업자번호 있음  (3) DB 미등록
      //         (4) direct extract 결과가 신뢰 가능 (오학습 방지)
      //         (5) 2026-07-22 · 근접 컨텍스트 검증 · rawText 에서 primaryBiz 위치 ±200자 안에 vendor 이름 실제 등장
      //             (예전 오학습: 5848801771 이 "엘앤바이오랩" 라인에 있는데 "앤바이오" 로 잘못 학습된 케이스 방어)
      //         (6) 수신처 blacklist 사업자번호가 아님 (핵심 안전장치)
      const nearbyContextHasVendor = (rawText: string, biz: string, vendor: string): boolean => {
        const bizFormatted = biz.length === 10
          ? `${biz.slice(0, 3)}-${biz.slice(3, 5)}-${biz.slice(5)}`
          : biz;
        const patterns = [biz, bizFormatted];
        for (const p of patterns) {
          const idx = rawText.indexOf(p);
          if (idx < 0) continue;
          const context = rawText.slice(Math.max(0, idx - 200), idx + 200);
          // vendor 이름 앞 3자 이상 (짧으면 전체) 근접 등장 확인
          const key = vendor.replace(/\s+/g, "").replace(/^\(주\)|^\(株\)|^주식회사/, "").trim();
          if (!key) return false;
          const searchKey = key.length >= 4 ? key.slice(0, Math.min(6, key.length)) : key;
          const contextNoSpace = context.replace(/\s+/g, "");
          if (contextNoSpace.includes(searchKey)) return true;
        }
        return false;
      };

      if (primaryBiz && isExcludedBusinessNumber(primaryBiz)) {
        console.warn(`[vendor-match/④학습-사업자번호] 스킵: ${primaryBiz} 은 수신처 blacklist (오학습 재발 방지)`);
      } else if (vendorMatched && primaryBiz && !bizMap.get(primaryBiz) && directTrusted) {
        // 2026-07-22: 근접 컨텍스트 검증 추가
        const nearby = nearbyContextHasVendor(ctx.rawText ?? "", primaryBiz, vendorMatched);
        if (!nearby) {
          console.warn(`[vendor-match/④학습-사업자번호] ⚠ 근접 컨텍스트 검증 실패: ${primaryBiz} 근처(±200자)에 "${vendorMatched}" 미등장 · 오학습 방지 · 학습 스킵`);
        } else {
          try {
            const r = await learnVendorBusinessNumber(vendorMatched, primaryBiz);
            console.log(`[vendor-match/④학습-사업자번호] "${vendorMatched}" ↔ ${primaryBiz} (${r.action}) · 근접검증 통과`);
          } catch (e: any) {
            console.warn(`[vendor-match/④학습-사업자번호] 실패:`, e?.message);
          }
        }
      } else if (vendorMatched && primaryBiz && !bizMap.get(primaryBiz)) {
        console.log(`[vendor-match/④학습-사업자번호] 스킵 (direct 신뢰도 부족 · 오학습 방지) · "${vendorMatched}" ↔ ${primaryBiz}`);
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

      // 스테이지별 결과 요약 (디버깅용)
      const stageResult = {
        "①biz-num": biznumMatched
          ? `success(${biznumMatched.db})`
          : primaryBiz
            ? (isExcludedBusinessNumber(primaryBiz) ? "fail-blacklist" : "fail-db-miss")
            : "fail-not-detected",
        "②name-match": nameMatches.length > 0
          ? `success(${nameMatches.map(m => `${m.db}@${m.score}`).join(",")})`
          : (direct.candidates.length > 0 ? `fail-below-${MATCH_THRESHOLD}%` : "fail-no-candidates"),
        "③product-based": matchSource.startsWith("product-majority") ? `success(${matchSource})` : "fail-or-skip",
        "④reverse-index": matchSource.startsWith("reverse-lookup") ? `success(${matchSource})` : "not-reached-or-skip",
      };
      console.log(`[vendor-match/최종요약] page ${ctx.page}: vendor="${vendorMatched ?? "(미상)"}" · source="${matchSource || "(없음)"}" · stages=${JSON.stringify(stageResult)}`);

      if (vendorMatched) {
        if (vendorMatched !== meta.supplier) {
          console.log(`[vendor-match/최종] page ${ctx.page}: "${meta.supplier ?? "(없음)"}" → "${vendorMatched}" (${matchSource})`);
          meta.supplier = vendorMatched;
        } else {
          console.log(`[vendor-match/최종] page ${ctx.page}: "${vendorMatched}" (${matchSource}) · 변경 없음`);
        }
      } else {
        // DB 매칭 실패 → 공란 (사용자 입력 대기)
        console.log(`[vendor-match/최종] page ${ctx.page}: 미상 · 공란 처리 (사용자 입력 필요) · 이름후보=${JSON.stringify(direct.candidates)} · 사업자번호=${primaryBiz ?? "-"}`);
        meta.supplier = undefined;
      }

      return { vendorMatched: vendorMatched ?? undefined, meta };
    },
  };
}
