# 차용 등록 재설계 리포트 · #130 · 2026-08-30

> **목표**: 양방향 화살표 · 이중 서명·도장 · 별도 감사 테이블 · Ramp/Brex/Notion 2026 프리미엄
> **모드**: 설계·목업 제안 · 코드 수정 X · 승인 후 별도 세션에서 구현
> **선행 문서**: `docs/BORROWING_RESEARCH_2026-08-29.md` (대안 비교) · Phase 1 (반환 서명 · 마이그레이션) 이미 부분 반영됨

---

## 1. 현재 구조 분석

### 파일 · 스키마 현황
- **UI**: `src/components/OrderManagePage/BorrowingPage.tsx` (669줄) — 폼 · 리스트 · ReturnModal
- **API**: `server/routes/payment/borrowings.ts` — GET / POST / PATCH / PATCH `:id/return` / DELETE
- **DB**: `supabase/migrations/20260825_borrowings_table.sql` (초기) + `20260829_borrowings_return_fields.sql` (반환 5필드 확장)
- **공용**: `src/components/common/SignaturePad.tsx` (2026-08-29 이관 완료)

### 현재 UI 한계 (요구 대비)
| 요구 사항 | 현재 상태 | 갭 |
|---|---|---|
| 양방향 화살표 시각 | direction 토글 + 리스트 컬럼에 ArrowRight/ArrowLeft 아이콘 (텍스트) | 폼에서 두 당사자 카드·화살표 없음 |
| **양측 서명 각각** | 등록 서명 1개 + 반환 서명 1개 (반환 시점만) | 계약 체결 시점의 **이중 서명 (Lender + Borrower) 부재** |
| 도장 (인감) 렌더링 | 없음 | 이미지 도장 오버레이 / 계약서 톤 부재 |
| 별도 DB (borrowers/lenders/signatures) | 단일 테이블 flat 컬럼 | 감사·조회 분리 부족 |
| 프리미엄 톤 (Ramp/Brex/Notion) | 브랜드 그라디언트 · Card top accent | 카드형 리스트 · Timeline · 이중 서명 시각화 부재 |

### 결정적 문제
1. **계약 체결 시점 양측 서명 부재** — 현재 `signature_url` 1개만 저장 → 대여자·차용자 중 누가 서명했는지 모호
2. **당사자 정보 flat 컬럼** — `supplier` TEXT 하나만 · 담당자·연락처·소속·직책 부재 → 감사·연락 곤란
3. **화살표 방향 시각이 폼 밖** — 등록 시 "누가 → 누구에게" 직관 낮음
4. **도장 (인감)** — 한국 계약 관행 대비 부재 · 서명 이미지만 있음

---

## 2. 재설계 방향

### 2-1. UX 컨셉 (3-Column 계약서 톤)
```
┌─────────────────────────────────────────────────┐
│  [LENDER · 대여자]  ═══상품·수량═══>  [BORROWER · 차용자]│
│    (violet chip)     방향 SVG        (emerald chip)  │
│   담당자·연락처     상품·금액 배지    담당자·연락처  │
├─────────────────────────────────────────────────┤
│  [대여자 서명·도장]  |  [차용자 서명·도장]  ← 이중 서명 │
│   서명 + 인감 오버레이   서명 + 인감 오버레이         │
│   IP · 시각 자동 기록    IP · 시각 자동 기록         │
├─────────────────────────────────────────────────┤
│  [감사 증적 안내 · ESIGN/eIDAS 준수 배너]           │
└─────────────────────────────────────────────────┘
```

### 2-2. 색상 (당사자 구분)
- **LENDER (대여자)**: violet #7C3AED / `bg #F3EEFF` — 상품·자금 내주는 쪽
- **BORROWER (차용자)**: emerald #059669 / `bg #ECFDF5` — 상품·자금 받는 쪽
- **화살표**: violet → emerald 그라디언트 (실선 = open · 왕복 점선 = settled)
- **도장**: 빨강 원형 #DC2626 · Ma Shan Zheng / Nanum Pen Script 폰트 · 회전 -8°

### 2-3. 이력 리스트 (카드형)
- 카드 1행 = 1계약 = `[Lender chip] → [상품·금액 배지] → [Borrower chip] | 상태 pill · 액션`
- 확장 시 Timeline (계약 → 알림 → 반환) · Linear Audit Log 스타일
- 방향 필터 (전체 / ↑ 빌려줌 / ↓ 빌림), 상태 필터 (전체 / 미해결 / 기한초과 / 정산완료)

### 2-4. 신규 프리미티브 (framework)
- **`BorrowingPartyCard`** — 당사자 카드 (avatar · 이름 · 담당자 · 연락처)
- **`BorrowingArrow`** — SVG 방향 화살표 · 그라디언트 · 반전 애니메이션
- **`SignatureStampSlot`** — SignaturePad + Stamp overlay + 감사 메타 (IP·시각) 조합
- **`BorrowingCard`** — 카드형 리스트 아이템 · Timeline 확장

---

## 3. DB 스키마 제안 (별도 테이블 분리)

### 3-1. 원칙
- **원본 테이블 우선 · 파생 자제** — 기존 `borrowings` 유지 · 부가 정보만 분리
- **사용자 승인 필수** — 대원칙 `feedback_original_table_first.md` 위배 소지 → 승인 후 진행
- **JOIN 최소** — 리스트 조회 시 view 로 flat 제공 (`v_borrowings_full`)

### 3-2. 스키마 (SQL 초안)

```sql
-- ═══════════════════════════════════════════════════════
-- 1) borrowings (기존 유지 · 확장 컬럼 5개 추가)
-- ═══════════════════════════════════════════════════════
-- 이미 존재: id · created_at · direction · supplier · product_code · product_name
--          qty · unit_price · due_date · note · signature_url · status
--          settled_at · created_by · created_by_id
--          return_signature_url · returned_by · returned_by_id · returned_at · return_note
--
-- 신규 추가 (당사자·감사 링크):
ALTER TABLE public.borrowings
  ADD COLUMN IF NOT EXISTS lender_party_id     BIGINT REFERENCES borrowing_parties(id),
  ADD COLUMN IF NOT EXISTS borrower_party_id   BIGINT REFERENCES borrowing_parties(id),
  ADD COLUMN IF NOT EXISTS contract_no         TEXT UNIQUE,  -- BRW-2026-0001 자동 부여
  ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMPTZ;  -- 기한초과 알림 이력

-- ═══════════════════════════════════════════════════════
-- 2) borrowing_parties (당사자 · 재사용)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.borrowing_parties (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  party_type    TEXT NOT NULL CHECK (party_type IN ('self','vendor','external')),
  -- self = 자기 약국 · vendor = 등록 공급사 (vendors FK) · external = 외부 개인/기타
  vendor_id     BIGINT REFERENCES vendors(id),   -- party_type='vendor' 시
  employee_id   BIGINT REFERENCES employees(id), -- party_type='self' 시
  name          TEXT NOT NULL,      -- 회사/약국명
  contact_name  TEXT,                -- 담당자
  contact_phone TEXT,
  contact_email TEXT,
  address       TEXT,
  memo          TEXT
);
CREATE INDEX IF NOT EXISTS idx_borrowing_parties_type ON public.borrowing_parties(party_type);
CREATE INDEX IF NOT EXISTS idx_borrowing_parties_vendor ON public.borrowing_parties(vendor_id);

-- ═══════════════════════════════════════════════════════
-- 3) borrowing_signatures (서명·도장 감사 이력 · 여러 개 가능)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.borrowing_signatures (
  id             BIGSERIAL PRIMARY KEY,
  borrowing_id   BIGINT NOT NULL REFERENCES borrowings(id) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK (role IN ('lender','borrower','lender_return','borrower_return','witness')),
  signer_name    TEXT NOT NULL,
  signer_id      BIGINT,                -- employees.id (있으면)
  party_id       BIGINT REFERENCES borrowing_parties(id),
  signature_url  TEXT NOT NULL,          -- dataURL 또는 storage URL
  stamp_url      TEXT,                    -- 도장 이미지 (선택)
  signed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address     INET,
  user_agent     TEXT,
  intent_text    TEXT                     -- "본 차용 내용에 동의합니다" 등 (ESIGN)
);
CREATE INDEX IF NOT EXISTS idx_borrowing_sig_borrowing ON public.borrowing_signatures(borrowing_id);
CREATE INDEX IF NOT EXISTS idx_borrowing_sig_role      ON public.borrowing_signatures(role);

-- ═══════════════════════════════════════════════════════
-- 4) v_borrowings_full (조회용 view · JOIN 우선 원칙)
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_borrowings_full AS
SELECT
  b.*,
  lp.name          AS lender_name,
  lp.contact_name  AS lender_contact,
  lp.contact_phone AS lender_phone,
  bp.name          AS borrower_name,
  bp.contact_name  AS borrower_contact,
  bp.contact_phone AS borrower_phone,
  (SELECT jsonb_agg(row_to_json(s.*)) FROM borrowing_signatures s WHERE s.borrowing_id = b.id) AS signatures
FROM borrowings b
LEFT JOIN borrowing_parties lp ON lp.id = b.lender_party_id
LEFT JOIN borrowing_parties bp ON bp.id = b.borrower_party_id;

NOTIFY pgrst, 'reload schema';
```

### 3-3. 마이그레이션 전략
1. **Phase 0 (기존 유지)**: `20260825` · `20260829` — 이미 반영
2. **Phase A (당사자·서명 분리)**: 신규 마이그레이션 `20260830_borrowing_parties_signatures.sql`
3. **백필 (선택)**: 기존 `borrowings.supplier` → `borrowing_parties` seed · CLI 스크립트 1회
4. **롤백**: `DROP TABLE borrowing_signatures, borrowing_parties` + view drop · borrowings 원본 무손상

### 3-4. API 변경 제안 (Phase A)
```
POST   /api/borrowings/parties        · 당사자 upsert (name+phone dedup)
GET    /api/borrowings/parties?q=...  · 자동완성 검색
POST   /api/borrowings                · body 확장: lender_party_id, borrower_party_id, signatures[]
                                        signatures = [{role, signature_url, stamp_url?, intent_text}]
POST   /api/borrowings/:id/signatures · 반환 서명 등 사후 추가
GET    /api/borrowings?view=full      · v_borrowings_full 사용 (기본 유지 · flag 로 전환)
```

---

## 4. UI 목업 위치

- **파일**: `docs/UI_MOCKUP_BORROWING_REDESIGN_2026-08-30.html`
- **섹션**:
  1. Header + KPI 4개 (미해결·기한초과·정산완료·미해결총액)
  2. 세그먼트 (신규 등록 / 이력 검색) + 상태 pill 요약
  3. **등록 카드** — 3-column (Lender / Arrow / Borrower) + 이중 서명·도장 슬롯
  4. **이력 리스트** — 카드형 3종 (미해결 · 기한초과 · 정산완료 with Timeline)
  5. **반환 처리 모달** — 서명 필수 UI
- **폰트**: Pretendard (본문) + Ma Shan Zheng / Nanum Pen Script (서명·도장)
- **색**: violet #7C3AED (lender) · emerald #059669 (borrower) · brand-deep #0A2E4A (액션)

---

## 5. 예상 비용·리스크

| 항목 | 규모 |
|---|---|
| 구현 시간 (Phase A 완전 이행) | **16-24h** (프리미티브 4개 + Party 자동완성 + 이중 서명 + view + 백필) |
| 최소 구현 (당사자 flat 유지 · 이중 서명만) | **8-10h** |
| DB 마이그레이션 | 1개 파일 · rollback 안전 |
| 회귀 위험 | ⚠ 중 · 기존 리스트 컬럼·API 계약 유지 시 낮음 · view 도입 시 select 재작성 필요 |

### 리스크
- ⚠ **파생 컬럼 원칙** (`feedback_original_table_first.md`) — `borrowing_parties` 는 원본 성격 · but 5개 신규 컬럼 (borrowings)+2 테이블 → **사용자 명시 승인 필수**
- ⚠ **iOS 서명 캔버스** — 이중 서명 시 페이지 스크롤 잠금 필요 (touch-action:none)
- ⚠ **도장 이미지 소스** — Employee 프로필에 stamp_url 컬럼 없음 → 즉석 그리기 or 파일 업로드 UX 결정 필요
- ⚠ **당사자 자동완성** — vendors 테이블과 별도 party 존재 (개인 차용) 케이스 처리 정책 필요

---

## 6. 결정 요청 (승인 필요)

1. **DB 분리 채택 여부** · 별도 `borrowing_parties` · `borrowing_signatures` 테이블 생성 → **✅ 승인 필요**
2. **UI 재설계 채택 여부** · 3-column 계약서 톤 + 이중 서명·도장 → **✅ 승인 필요**
3. **최소 구현 vs 완전 이행** (8h vs 16-24h) 선택
4. **도장 (인감) 처리** · 즉석 그리기 · 이미지 업로드 · 텍스트 렌더링 중 택 1
5. **당사자 자동완성 소스** · `vendors` FK 재사용 · 별도 party 테이블 seed
6. **contract_no 부여 규칙** · `BRW-YYYY-NNNN` 자동 채번 여부

---

## 7. 관련 파일 (절대 경로)

- `D:\antigravity_projects\megatown-staff-scheduler\src\components\OrderManagePage\BorrowingPage.tsx`
- `D:\antigravity_projects\megatown-staff-scheduler\server\routes\payment\borrowings.ts`
- `D:\antigravity_projects\megatown-staff-scheduler\supabase\migrations\20260825_borrowings_table.sql`
- `D:\antigravity_projects\megatown-staff-scheduler\supabase\migrations\20260829_borrowings_return_fields.sql`
- `D:\antigravity_projects\megatown-staff-scheduler\src\components\common\SignaturePad.tsx`
- `D:\antigravity_projects\megatown-staff-scheduler\docs\BORROWING_RESEARCH_2026-08-29.md` (선행 리서치)
- `D:\antigravity_projects\megatown-staff-scheduler\docs\UI_MOCKUP_LOAN_2026-08-26.html` (v1 목업 · 참고)
- `D:\antigravity_projects\megatown-staff-scheduler\docs\UI_MOCKUP_BORROWING_REDESIGN_2026-08-30.html` (**신규 v2 목업**)

---

*작성: 2026-08-30 · Claude Opus 4.7 (1M) · 병렬 진행 · 승인 대기*
