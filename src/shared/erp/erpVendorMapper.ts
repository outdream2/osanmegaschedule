// src/shared/erp/erpVendorMapper.ts
// 2026-10-06 · ERP BuyCustomer_List → vendors table payload
// 2026-10-06 · 사용자 확정 2차 (merge policy)
//   · VENDOR sync 한정 · "이름 matching 금지" 정책 변경
//   · 3단계 매칭: CtCode → CorpBizNo exact → normalized name exact
//   · AMBIGUOUS (복수 후보) · CODE_CONFLICT (기존 supplier_code 와 다름) 는 SKIP
//   · DELETE 금지 · WEB-only 필드 보존 · ERP null → WEB 값 보존
//
// 매핑 보류 (사용자 지시 · 샘플 부족 · 의미 불일치):
//   · President (대표자) ≠ vendors.contact_name (담당자)  → 저장 안 함
//   · Mobile (108/108 중 1건만) · 담당자 휴대폰 여부 불명 → 저장 안 함
//   · TaxTypeName ("과세유형") ≠ vendors.vat_included ("가격 VAT 포함 여부") → 저장 안 함

export interface ErpVendorRow {
  CtCode?: unknown;         // identity · supplier_code
  CorpNameView?: unknown;   // 거래처명 → company_name
  CorpBizNo?: unknown;      // 사업자번호 → business_number
  Phone?: unknown;          // 전화 → phone
  Email?: unknown;          // 이메일 → email
  ScateName?: unknown;      // 공급사 소분류 → category
  Remark?: unknown;         // 비고 → note
  [k: string]: unknown;
}

/**
 * vendors 테이블에서 ERP 가 소유하는 6개 필드.
 *
 * 2026-10-06 (사용자 확인): Supabase vendors 테이블에 `supplier_code` 컬럼이 없음.
 * 따라서 ERP CtCode 는 vendors 안에 저장하지 않고, logical identity 로만 사용 (매칭 결과 추적용).
 * 매 sync 마다 bizno + normalized name 2단계로 재매칭.
 */
export interface VendorErpPayload {
  company_name: string | null;
  business_number: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  note: string | null;
}

/** ERP row 의 logical identity (CtCode) 추출 · 리포트/로깅용 (DB 저장 X) */
export function extractVendorIdentity(r: ErpVendorRow): string | null {
  if (r.CtCode == null) return null;
  const s = String(r.CtCode).trim();
  return s === "" ? null : s;
}

/** INSERT/비교용 payload · ERP 가 소유하는 6개 필드만 · supplier_code 제외 (schema 없음) */
export function buildVendorErpPayload(r: ErpVendorRow): VendorErpPayload | null {
  // CtCode 유효성 체크만 수행 (payload 에는 포함 X)
  if (extractVendorIdentity(r) === null) return null;

  const str = (v: unknown): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };

  return {
    company_name: str(r.CorpNameView),
    business_number: str(r.CorpBizNo),
    phone: str(r.Phone),
    email: str(r.Email),
    category: str(r.ScateName),
    note: str(r.Remark),
  };
}

/** CHANGED 비교 대상 (ERP OWNED 6개) */
export const VENDOR_ERP_COMPARE_FIELDS = [
  "company_name",
  "business_number",
  "phone",
  "email",
  "category",
  "note",
] as const;

export type VendorErpField = typeof VENDOR_ERP_COMPARE_FIELDS[number];

/**
 * UPDATE patch 생성.
 * 사용자 지시:
 *   · ERP 값이 non-null/non-empty 인 필드만 포함
 *   · ERP 값이 null/empty 면 patch 에서 omit → WEB 값 보존 (null overwrite 방지)
 * 반환값이 빈 객체 { } 면 UPDATE 할 것이 없다는 뜻.
 */
export function buildVendorErpPatch(erp: VendorErpPayload): Partial<Record<VendorErpField, string>> {
  const patch: Partial<Record<VendorErpField, string>> = {};
  for (const f of VENDOR_ERP_COMPARE_FIELDS) {
    const v = erp[f];
    if (v != null && v !== "") patch[f] = v;
  }
  return patch;
}

export interface VendorFieldChange {
  readonly field: VendorErpField;
  readonly db: string | null;
  readonly erp: string;
}

/**
 * ERP vs DB 변경 필드 추출.
 * 사용자 지시:
 *   · ERP 가 null/empty 면 비교 자체를 skip (UPDATE 대상이 아니므로)
 *   · ERP 가 non-null 인데 DB 와 다르면 → CHANGED 로 간주
 *   · 공백 정규화는 하지 않음 (ERP 값을 그대로 반영)
 */
export function diffVendorPayload(
  dbRow: Record<string, unknown>,
  erp: VendorErpPayload,
): VendorFieldChange[] {
  const changes: VendorFieldChange[] = [];
  for (const f of VENDOR_ERP_COMPARE_FIELDS) {
    const erpVal = erp[f];
    if (erpVal == null || erpVal === "") continue;
    const dbRaw = dbRow[f];
    const dbVal = dbRaw == null ? null : String(dbRaw);
    if (dbVal !== erpVal) {
      changes.push({ field: f, db: dbVal, erp: erpVal });
    }
  }
  return changes;
}

// ────────────────────────────────────────────────────────────────────────────
// 2026-10-06 · 사용자 승인 2차 · merge policy helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * 사업자번호 정규화 · 숫자만 남김.
 *   "123-45-67890" → "1234567890"
 *   null/empty → null
 *
 * 2026-10-06 · dummy 번호 처리 (ERP 쪽 미등록 vendor 는 "0000000000" 로 들어옴 · 108개 중 103개):
 *   · 전부 0 인 경우 → null (매칭 skip · 허위 매칭 방지)
 *   · 자리수 부족 (한국 사업자번호 10자리 미만) → null
 */
export function normalizeBusinessNumber(bz: unknown): string | null {
  if (bz == null) return null;
  const digits = String(bz).replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (/^0+$/.test(digits)) return null;    // dummy: 전부 0
  if (digits.length < 10) return null;     // 한국 사업자번호 10자리 미만 skip
  return digits;
}

/**
 * 공급사명 정규화 · 법인 표기 + 공백 + 일반 punctuation 제거 · lowercase.
 * 사용자 승인 범위:
 *   · trim · lowercase · whitespace 제거 · 일반 punctuation 제거
 *   · "(주)" "㈜" "주식회사" "(유)" "유한회사" "(사)" "사단법인" 제거
 * 금지:
 *   · includes · startsWith · Levenshtein · similarity · 초성 · AI 판단
 *   · normalized exact equality 비교까지만 허용
 *
 * 예:
 *   "종근당" / "(주)종근당" / "㈜ 종근당"  → "종근당"
 *   "광동제약" / "(주)광동제약"           → "광동제약"
 */
export function normalizeVendorName(name: unknown): string | null {
  if (name == null) return null;
  let s = String(name).toLowerCase().trim();
  if (!s) return null;
  // 법인 표기 제거 (대소문자 이미 소문자화 · 괄호 포함 전체 매칭)
  s = s
    .replace(/\(주\)/g, "")
    .replace(/㈜/g, "")
    .replace(/주식회사/g, "")
    .replace(/\(유\)/g, "")
    .replace(/유한회사/g, "")
    .replace(/\(사\)/g, "")
    .replace(/사단법인/g, "");
  // 공백 제거
  s = s.replace(/\s+/g, "");
  // 일반 punctuation 제거
  s = s.replace(/[.,·\-_()\[\]{}'"!?@#$%^&*+=:;\\/]/g, "");
  return s.length > 0 ? s : null;
}

/**
 * 매칭 결과 분류 (사용자 승인 2차 · 2026-10-06).
 *
 * Supabase vendors 에 supplier_code 컬럼이 없으므로 PRIORITY 1 (code exact) 는 제거.
 *   · MATCH_BIZNO: business_number normalized unique match → UPDATE
 *   · MATCH_NORMALIZED_NAME: normalized company_name unique match → UPDATE
 *   · NEW: 매칭 실패 → INSERT
 *   · AMBIGUOUS: 복수 후보 → SKIP (자동 머지 금지)
 *   · BIZNO_CONFLICT: name 매칭됐지만 bizno 서로 다름 → SKIP (수동 검토)
 */
export type VendorMatchKind =
  | "MATCH_BIZNO"
  | "MATCH_NORMALIZED_NAME"
  | "NEW"
  | "AMBIGUOUS"
  | "BIZNO_CONFLICT";
