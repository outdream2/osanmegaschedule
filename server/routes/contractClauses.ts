// server/routes/contractClauses.ts
// T-C · 2026-08-05
// 근로계약서 각 호(조항) CMS · localStorage → Supabase 서버 이전
//
// 배경:
//   - 기존: ContractSettingsPage 에서 6종 조항(임금단서/근로시간/휴일/징계/기타/개인정보) 을
//           localStorage("contractClauses:v1") 에 저장 → 관리자 브라우저마다 다름
//   - 개선: contract_clauses 테이블 · 모든 관리자·모든 기기 동일 값 공유
//
// 스키마 (마이그레이션: migrations/create_contract_clauses_2026-08-05.sql):
//   CREATE TABLE contract_clauses (
//     clause_key   TEXT PRIMARY KEY,   -- wageClauses | workTimeClauses | ... (6종)
//     content      JSONB NOT NULL,     -- string[] (각 항목 텍스트)
//     updated_by   INT,                -- employees.id
//     updated_at   TIMESTAMPTZ DEFAULT NOW()
//   );
//
// 엔드포인트:
//   GET  /api/contract-clauses               → 6종 전체 반환 (없는 것은 default fallback)
//   PUT  /api/contract-clauses/:key          → 단일 조항 upsert  body: { content, updated_by }
//   PUT  /api/contract-clauses               → 일괄 upsert       body: { clauses: { [key]: string[] }, updated_by }
//
// 안전성:
//   - 유효 clause_key 만 허용 (whitelist)
//   - content 는 string[] 검증 (문자열만 · 배열 · 각 원소 최대 4000자)
//   - 인증 미들웨어 없음 (server.ts 주석 참조 · 사내용 · Render 배포 시 재도입 예정)

import { Router } from "express";
import { supabase } from "../../src/supabase/client";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// 허용 clause_key (ContractSettingsPage 의 ClauseGroupKey 와 반드시 일치)
// ─────────────────────────────────────────────────────────────────────────────

const CLAUSE_KEYS = [
  "wageClauses",
  "workTimeClauses",
  "holidayClauses",
  "disciplineClauses",
  "etcClauses",
  "privacyClauses",
] as const;

type ClauseKey = typeof CLAUSE_KEYS[number];

const CLAUSE_KEY_SET = new Set<string>(CLAUSE_KEYS);

// 서버는 default 데이터를 알지 못한다 (프론트에서 병합) · 없으면 빈 배열 반환
// → 프론트 로더가 배열이 비어있으면 DEFAULT_CLAUSES 로 fallback

// ─────────────────────────────────────────────────────────────────────────────
// 유효성 검사
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ITEM_LEN = 4000;   // 조항 1개 최대 길이 (여유 있게)
const MAX_ITEMS    = 200;    // 그룹 당 최대 항목 수 (실용상 20 내외)

function normalizeContent(input: any): string[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length > MAX_ITEMS) return null;
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") return null;
    if (v.length > MAX_ITEM_LEN) return null;
    out.push(v);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/contract-clauses  · 6종 전체 반환
//   응답: { [clauseKey]: string[] }   (없는 key 는 빈 배열 → 프론트 default fallback)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/api/contract-clauses", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("contract_clauses")
      .select("clause_key, content");
    if (error) throw new Error(error.message);

    const out: Record<ClauseKey, string[]> = {
      wageClauses: [],
      workTimeClauses: [],
      holidayClauses: [],
      disciplineClauses: [],
      etcClauses: [],
      privacyClauses: [],
    };

    for (const row of data ?? []) {
      const k = row?.clause_key;
      if (!k || !CLAUSE_KEY_SET.has(k)) continue;
      const arr = normalizeContent(row.content);
      if (arr) out[k as ClauseKey] = arr;
    }

    res.json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "조회 실패" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/contract-clauses/:key  · 단일 조항 upsert
//   body: { content: string[], updated_by?: number }
// ─────────────────────────────────────────────────────────────────────────────

router.put("/api/contract-clauses/:key", async (req, res) => {
  try {
    const key = String(req.params.key ?? "");
    if (!CLAUSE_KEY_SET.has(key)) {
      return res.status(400).json({ error: `유효하지 않은 clause_key: ${key}` });
    }
    const { content, updated_by } = req.body ?? {};
    const normalized = normalizeContent(content);
    if (!normalized) {
      return res.status(400).json({ error: "content 는 string[] · 각 원소 4000자 이하 · 최대 200개" });
    }
    const updatedById = Number.isFinite(Number(updated_by)) ? Number(updated_by) : null;

    const { error } = await supabase
      .from("contract_clauses")
      .upsert({
        clause_key: key,
        content: normalized,
        updated_by: updatedById,
        updated_at: new Date().toISOString(),
      }, { onConflict: "clause_key" });
    if (error) throw new Error(error.message);

    res.json({ ok: true, key, count: normalized.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "저장 실패" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/contract-clauses  · 일괄 upsert (여러 key 동시)
//   body: { clauses: { [key]: string[] }, updated_by?: number }
// ─────────────────────────────────────────────────────────────────────────────

router.put("/api/contract-clauses", async (req, res) => {
  try {
    const { clauses, updated_by } = req.body ?? {};
    if (!clauses || typeof clauses !== "object" || Array.isArray(clauses)) {
      return res.status(400).json({ error: "clauses 는 { [key]: string[] } 객체여야 합니다" });
    }
    const updatedById = Number.isFinite(Number(updated_by)) ? Number(updated_by) : null;
    const now = new Date().toISOString();

    const rows: Array<{ clause_key: string; content: string[]; updated_by: number | null; updated_at: string }> = [];
    for (const [key, val] of Object.entries(clauses)) {
      if (!CLAUSE_KEY_SET.has(key)) {
        return res.status(400).json({ error: `유효하지 않은 clause_key: ${key}` });
      }
      const normalized = normalizeContent(val);
      if (!normalized) {
        return res.status(400).json({ error: `content 형식 오류 (${key})` });
      }
      rows.push({ clause_key: key, content: normalized, updated_by: updatedById, updated_at: now });
    }

    if (rows.length === 0) return res.json({ ok: true, count: 0 });

    const { error } = await supabase
      .from("contract_clauses")
      .upsert(rows, { onConflict: "clause_key" });
    if (error) throw new Error(error.message);

    res.json({ ok: true, count: rows.length, keys: rows.map(r => r.clause_key) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "일괄 저장 실패" });
  }
});

export default router;
