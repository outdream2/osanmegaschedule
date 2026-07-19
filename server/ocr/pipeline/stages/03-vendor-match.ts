import { extractBusinessNumbersFromRawText, extractSupplierFromRawText } from "../../parse";
import { getVendorNames, getVendorBizNumMap, learnVendorBusinessNumber, getSupplierAliasMap, learnSupplierAlias, getProductToSuppliersMap } from "../../../productCache";
import { DEFAULT_EXCLUDED_SUPPLIERS, isExcludedBusinessNumber } from "../../excludedSuppliers";
import { normSupplier, bigramSim } from "../../match";
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

      console.log(`[vendor-match/입력] page ${ctx.page}: candidates=${JSON.stringify(direct.candidates)} · bizNum=${primaryBiz ?? "-"}`);

      let vendorMatched: string | null = null;
      let matchSource = "";
      const aliasMap = await getSupplierAliasMap();
      const vendors = await getVendorNames();
      const vendorNorms = vendors.map(v => ({ name: v, n: normSupplier(v) }));
      const bizMap = await getVendorBizNumMap();

      // ① 사업자번호 DB 조회 (exact match · score 100)
      //    수신처 blacklist (excludedSuppliers.ts) 에 있으면 아예 사용 안 함
      let biznumMatched: { db: string; score: number; from: string } | null = null;
      if (primaryBiz && isExcludedBusinessNumber(primaryBiz)) {
        console.warn(`[vendor-match/①사업자번호] ${primaryBiz} 은 수신처 blacklist · 매칭·학습 모두 스킵`);
      } else if (primaryBiz) {
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

      // ③ direct extract 최종채택 우선 정책 (2026-07-15 · 사용자 지시)
      //   extract 가 신뢰 가능한 이름 뽑았으면 그 이름으로 확정 · biznum 이 다른 회사 이름 반환해도 무시
      //   (원인: 과거 잘못 학습된 사업자번호 매핑 · 예: 3101805493 → "종옥의약품" 인데
      //          실제는 (주)대지인잠 → biznum 신뢰도 낮은 학습 데이터 방어)
      const directTrusted = direct.supplier && isTrustworthyMetaSup(direct.supplier);
      // biznum 결과가 direct extract 와 얼마나 유사한가 (다르면 오학습)
      const biznumMatchesDirect = biznumMatched && direct.supplier
        ? bigramSim(normSupplier(biznumMatched.db).replace(/\(주\)|주식회사/g, ""),
          normSupplier(direct.supplier).replace(/\(주\)|주식회사/g, "")) >= 40
        : false;
      if (biznumMatched && directTrusted && !biznumMatchesDirect) {
        console.warn(`[vendor-match/⚠️biznum-무시] page ${ctx.page}: extract="${direct.supplier}" ≠ biznum="${biznumMatched.db}" (오학습 의심 · biznum 채택 스킵)`);
      }

      const allMatches: Array<{ db: string; score: number; from: string }> = [];
      // biznum 은 direct 와 유사할 때만 포함 (또는 direct 없을 때)
      if (biznumMatched && (!directTrusted || biznumMatchesDirect)) allMatches.push(biznumMatched);
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
      } else if (directTrusted && direct.supplier) {
        // 매칭 없어도 extract 신뢰 가능하면 그대로 사용 (미상 처리 대신)
        vendorMatched = direct.supplier;
        matchSource = `extract-raw("${direct.supplier}")`;
        console.log(`[vendor-match/✅extract최종채택] page ${ctx.page}: "${direct.supplier}" (DB 매칭 없음 · extract 원본 사용)`);
      } else {
        // ③ 상품기반 fallback (2026-07-15) — rawText 에 공급자명 없어도
        //    상품명 → products.supplier 최빈값 (majority vote) 으로 유추
        //    예: 광동제약 명세서에서 공급자 라인이 잘려도 상품(광동원탕/광동쌍화탕/...)
        //        모두 products.supplier="(주)광동제약" → 자동 채택
        try {
          const nameIdx = ctx.headers.indexOf("품명");
          if (nameIdx < 0) {
            console.log(`[vendor-match/③상품기반] skip: headers 에 "품명" 없음`);
          } else {
            const productNames = Array.from(new Set(
              ctx.rows
                .map(r => Array.isArray(r) ? String(r[nameIdx] ?? "").trim() : "")
                .filter(n => n.length >= 2)
            ));
            if (productNames.length < 5) {
              console.log(`[vendor-match/③상품기반] skip: 샘플 부족 (${productNames.length}개 < 5)`);
            } else {
              // 1) exact match 우선
              const { data: exactRows, error: prodErr } = await supabase
                .from("products")
                .select("product_name,supplier")
                .in("product_name", productNames);
              if (prodErr) {
                console.warn(`[vendor-match/③상품기반] products 조회 실패:`, prodErr.message);
              } else {
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
                // 2) exact 매칭 실패한 상품명에 대해 fuzzy fallback
                //    · OCR 오탈자 대응 · 상품명 앞 4자를 접두어로 ilike 검색
                //    · 예: "광동 원탕" (실패) → "광동" 으로 시작하는 상품 조회
                const missedNames = productNames.filter(n => !matchedNames.has(n) && n.length >= 4);
                if (missedNames.length > 0 && totalHits / productNames.length < 0.5) {
                  // 매칭률 50% 미만이면 fuzzy fallback 시도
                  const prefixSet = new Set<string>();
                  for (const n of missedNames) {
                    const cleaned = n.replace(/[\s()（）\[\]]/g, "");
                    if (cleaned.length >= 3) prefixSet.add(cleaned.slice(0, 3));  // 앞 3자
                  }
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
                    if (fuzzyAdded > 0) console.log(`[vendor-match/③상품기반-fuzzy] 접두어 매칭 ${fuzzyAdded}건 추가 (총 ${totalHits}건)`);
                  }
                }
                if (totalHits === 0) {
                  console.log(`[vendor-match/③상품기반] products 매칭 0건 (샘플 ${productNames.length}개)`);
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
                    console.log(`[vendor-match/③상품기반] skip: 최빈 supplier "${topSup}" 은 수신처 blacklist`);
                  } else if (ratio >= 0.6) {
                    vendorMatched = topSup;
                    matchSource = `product-majority(${topCnt}/${totalHits})`;
                    console.log(`[vendor-match/③상품기반] ${productNames.length}개 상품 → "${topSup}" (${topCnt}/${totalHits} 우세 · ${Math.round(ratio * 100)}%)`);
                  } else {
                    console.log(`[vendor-match/③상품기반] 우세 부족: top="${topSup}" ${topCnt}/${totalHits} (${Math.round(ratio * 100)}% < 60%)`);
                  }
                }
              }
            }
          }
        } catch (e: any) {
          console.warn(`[vendor-match/③상품기반] 예외:`, e?.message);
        }

        // ④ 역인덱스 폴백 (Task #50 · 2026-07-19)
        //   ③ 상품기반 fallback 도 실패한 경우에만 동작
        //   추출된 상품명들을 getProductToSuppliersMap() 로 조회 → 최다 득표 공급사
        //   신뢰도(votes/total) < 50% 이면 채우지 않음
        if (!vendorMatched) {
          try {
            const nameIdxRl = ctx.headers.indexOf("품명");
            const rlNames = nameIdxRl >= 0
              ? Array.from(new Set(
                  ctx.rows
                    .map(r => Array.isArray(r) ? String(r[nameIdxRl] ?? "").trim().toLowerCase() : "")
                    .filter(n => n.length >= 2)
                )).slice(0, 10)
              : [];
            if (rlNames.length === 0) {
              console.log(`[vendor-match/④역인덱스] skip: 품명 없음`);
            } else {
              const rlMap = await getProductToSuppliersMap();
              const voteCounts = new Map<string, number>();
              let totalVotes = 0;
              for (const pn of rlNames) {
                const candidates = rlMap.get(pn);
                if (!candidates || candidates.length === 0) continue;
                // 1순위 공급사에만 투표 (다수결)
                const topSup = candidates[0].supplier;
                voteCounts.set(topSup, (voteCounts.get(topSup) ?? 0) + 1);
                totalVotes++;
              }
              if (totalVotes === 0) {
                console.log(`[vendor-match/④역인덱스] 역인덱스 히트 없음 (${rlNames.length}개 상품명 조회)`);
              } else {
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
                } else if (confidence >= 0.5) {
                  vendorMatched = topSup;
                  matchSource = `reverse-lookup(${topVotes}/${totalVotes})`;
                  const inferenceInfo = { source: "reverse-lookup", votes: topVotes, total: totalVotes, confidence: Math.round(confidence * 100) };
                  (ctx.meta as any).supplier_inference = inferenceInfo;
                  console.log(`[vendor-match/④역인덱스] "${topSup}" (${topVotes}/${totalVotes} · ${Math.round(confidence * 100)}%)`);
                } else {
                  console.log(`[vendor-match/④역인덱스] 신뢰도 부족: top="${topSup}" ${topVotes}/${totalVotes} (${Math.round(confidence * 100)}% < 50%) · 공란 유지`);
                }
              }
            }
          } catch (e: any) {
            console.warn(`[vendor-match/④역인덱스] 예외:`, e?.message);
          }
        }

        if (!vendorMatched) {
          console.log(`[vendor-match/③미상] page ${ctx.page}: 매칭된 후보 없음 · 공란 (사용자 입력 대기) · 이름후보=${JSON.stringify(direct.candidates)} · 사업자번호=${primaryBiz ?? "-"}`);
        }
      }

      // ④ 사업자번호 학습 (오학습 방어 강화)
      //   조건: (1) 이름 확정  (2) 사업자번호 있음  (3) DB 미등록
      //         (4) direct extract 결과가 신뢰 가능 (오학습 방지)
      //         (5) 이름이 사업자번호 근처 텍스트에 실제 등장 (같은 명세서 데이터임을 확인)
      //         (6) 수신처 blacklist 사업자번호가 아님 (핵심 안전장치)
      if (primaryBiz && isExcludedBusinessNumber(primaryBiz)) {
        console.warn(`[vendor-match/④학습-사업자번호] 스킵: ${primaryBiz} 은 수신처 blacklist (오학습 재발 방지)`);
      } else if (vendorMatched && primaryBiz && !bizMap.get(primaryBiz) && directTrusted) {
        try {
          const r = await learnVendorBusinessNumber(vendorMatched, primaryBiz);
          console.log(`[vendor-match/④학습-사업자번호] "${vendorMatched}" ↔ ${primaryBiz} (${r.action})`);
        } catch (e: any) {
          console.warn(`[vendor-match/④학습-사업자번호] 실패:`, e?.message);
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
