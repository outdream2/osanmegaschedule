// src/hooks/useReferenceValues.ts
// 2026-08-06 · T-DualStorage-Connect · DB DISTINCT 값 + 하드코딩 fallback 병합
// GET /api/reference-values → 5분 캐시 (서버 + 모듈 레벨)
// fetch 실패 시 하드코딩 fallback 그대로 사용

// 2026-08-16 · apiClient 마이그레이션 · 401 refresh 자동
import { useState, useEffect } from "react";
import { api } from "../lib/apiClient";
import { VENDOR_CATEGORIES } from "../constants/vendorCategories";
import { POSITIONS, RANKS, CONTRACT_TYPES, WORKPLACES } from "../constants/jobCategories";

// ── 하드코딩 fallback (deprecated·안전 보루) ─────────────────────────────────
const HC_VENDOR_CATEGORIES = Array.from(VENDOR_CATEGORIES) as string[];
const HC_POSITIONS          = Array.from(POSITIONS) as string[];
const HC_RANKS              = Array.from(RANKS) as string[];
const HC_CONTRACT_TYPES     = Array.from(CONTRACT_TYPES) as string[];
const HC_WORKPLACES         = Array.from(WORKPLACES) as string[];

function mergeUnique(hardcoded: string[], db: string[]): string[] {
  return Array.from(new Set([...hardcoded, ...db]));
}

// ── 모듈 레벨 캐시 (5분 TTL) ─────────────────────────────────────────────────
const TTL_MS = 5 * 60 * 1000;
let _cache: { data: RawValues; time: number } | null = null;
let _inflight: Promise<RawValues> | null = null;

interface RawValues {
  vendorCategories: string[];
  positions: string[];
  ranks: string[];
  contractTypes: string[];
  workplaces: string[];
}

const EMPTY_RAW: RawValues = {
  vendorCategories: [],
  positions: [],
  ranks: [],
  contractTypes: [],
  workplaces: [],
};

async function _fetchRaw(force = false): Promise<RawValues> {
  if (!force && _cache && Date.now() - _cache.time < TTL_MS) return _cache.data;
  if (_inflight) return _inflight;

  _inflight = (async () => {
    try {
      const { data } = await api.get<RawValues>("/api/reference-values");
      _cache = { data, time: Date.now() };
      return data;
    } catch (err) {
      console.warn("[useReferenceValues] fetch 실패 · 하드코딩 fallback 사용:", err);
      return EMPTY_RAW;
    } finally {
      _inflight = null;
    }
  })();

  return _inflight;
}

// ── 공개 타입 ─────────────────────────────────────────────────────────────────
export interface ReferenceValues {
  vendorCategories: string[];
  positions: string[];
  ranks: string[];
  contractTypes: string[];
  workplaces: string[];
  loading: boolean;
}

const FALLBACK: ReferenceValues = {
  vendorCategories: HC_VENDOR_CATEGORIES,
  positions: HC_POSITIONS,
  ranks: HC_RANKS,
  contractTypes: HC_CONTRACT_TYPES,
  workplaces: HC_WORKPLACES,
  loading: false,
};

function mergeRaw(raw: RawValues): ReferenceValues {
  return {
    vendorCategories: mergeUnique(HC_VENDOR_CATEGORIES, raw.vendorCategories),
    positions:        mergeUnique(HC_POSITIONS, raw.positions),
    ranks:            mergeUnique(HC_RANKS, raw.ranks),
    contractTypes:    mergeUnique(HC_CONTRACT_TYPES, raw.contractTypes),
    workplaces:       mergeUnique(HC_WORKPLACES, raw.workplaces),
    loading: false,
  };
}

// ── 훅 ────────────────────────────────────────────────────────────────────────
export function useReferenceValues(): ReferenceValues {
  const [values, setValues] = useState<ReferenceValues>(() =>
    _cache ? mergeRaw(_cache.data) : { ...FALLBACK, loading: true }
  );

  useEffect(() => {
    let cancelled = false;
    _fetchRaw().then(raw => {
      if (!cancelled) setValues(mergeRaw(raw));
    });
    return () => { cancelled = true; };
  }, []);

  return values;
}
