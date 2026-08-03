# Priority 6 · UUID → BIGSERIAL PK 교체 분석 리포트

작성일: 2026-08-03  
상태: **분석만 · 실행 X · 사용자 결정 후 별도 태스크**

---

## 배경

아래 4개 테이블이 UUID PK를 사용하고 있으나 Supabase Auth와 연동하지 않으므로 UUID의 주요 이점(분산 생성, auth.users 연동)을 활용하지 않는다. BIGSERIAL(시퀀스 PK)은 B-tree 인덱스 캐시 효율이 높고, URL/디버그 가독성이 좋으며, JOIN 비교 비용이 낮다.

---

## 대상 테이블별 분석

### 1. `leave_requests`

| 항목 | 내용 |
|------|------|
| 현재 PK | `id uuid DEFAULT gen_random_uuid()` |
| Migration SQL | `create_leave_requests.sql` |
| 서버 사용 | `server/routes/leave.ts` |
| 클라이언트 사용 | `src/components/LeavePage/LeavePage.tsx` |

**FK 참조**: 없음 (다른 테이블이 `leave_requests.id`를 외래 키로 참조하지 않음)

**서버 코드 id 사용 패턴**:
- `PUT /api/leave-requests/:id` · `eq("id", req.params.id)` — UUID 문자열을 그대로 전달
- `DELETE /api/leave-requests/:id` · 동일

**클라이언트 id 사용 패턴**:
- `tag: leave-new-${data?.id}` — push notification tag (문자열 이어붙이기만)
- 행 삭제 시 `id` 를 URL에 포함해 fetch

**전환 난이도**: 낮음 — FK 없음, id는 단순 URL 파라미터 및 태그 접두어로만 사용. 클라이언트/서버 모두 id 타입을 문자열로 취급하므로 BIGSERIAL로 변경해도 코드 수정 불필요.

---

### 2. `display_requests`

| 항목 | 내용 |
|------|------|
| 현재 PK | `id uuid DEFAULT gen_random_uuid()` |
| Migration SQL | `create_request_tables.sql` |
| 서버 사용 | `server/routes/requests.ts` |
| 클라이언트 사용 | `src/components/DisplayPage/DisplayPage.tsx`, `src/components/RequestsPage.tsx` |

**FK 참조**: 없음

**서버 코드 id 사용 패턴**:
- `PATCH /api/display-requests/:id` · `eq("id", req.params.id)`
- `DELETE /api/display-requests/:id` · 동일
- `tag: disp-req-${data?.id}` · push tag
- `tag: disp-done-${req.params.id}` · push tag

**클라이언트 id 사용 패턴**:
- `DisplayPage.tsx` 내 행 삭제/완료 처리 시 `id` 를 URL에 포함해 fetch

**전환 난이도**: 낮음 — FK 없음, id는 URL 파라미터 및 push tag에서만 사용. 타입 불일치 위험 없음.

---

### 3. `order_requests`

| 항목 | 내용 |
|------|------|
| 현재 PK | `id uuid DEFAULT gen_random_uuid()` |
| Migration SQL | `create_request_tables.sql` |
| 서버 사용 | `server/routes/requests.ts` |
| 클라이언트 사용 | `src/components/RequestsPage.tsx`, `src/components/ProductArrivalPage.tsx` (간접) |

**FK 참조**: 없음. `product_arrival_items` 비교 기능이 `order_requests`를 읽지만 `order_requests.id`를 FK로 저장하지 않음.

**서버 코드 id 사용 패턴**:
- `DELETE /api/order-requests/:id` · `eq("id", req.params.id)`
- upsert 로직: `select("id")` 후 `existing.id` 로 update — UUID 문자열 그대로 사용

**클라이언트 id 사용 패턴**:
- 발주 삭제 시 `id` URL 파라미터
- `ProductArrivalsPage` 비교 결과에서 `order_id` 필드로 표시 (디스플레이 전용)

**전환 난이도**: 낮음 — FK 없음. 단, upsert 패턴(`select id` → `update by id`)은 BIGSERIAL이어도 동일하게 동작.

---

### 4. `zone_mismatches`

| 항목 | 내용 |
|------|------|
| 현재 PK | `id uuid DEFAULT gen_random_uuid()` |
| Migration SQL | `create_request_tables.sql` |
| 서버 사용 | `server/routes/mismatches.ts` |
| 클라이언트 사용 | `src/components/RequestsPage.tsx` |

**FK 참조**: 없음. `UNIQUE (product_code)` 제약이 실질적 중복 방지 키 역할을 함.

**서버 코드 id 사용 패턴**:
- DELETE · upsert 시 `product_code` 기준으로만 조작 → `id`는 거의 사용되지 않음

**전환 난이도**: 가장 낮음 — `product_code` UNIQUE 제약이 실질 PK 역할. id는 조회 외 미사용.

---

## 공통 전환 절차 (테이블당)

아래는 테이블 한 개 기준 안전 절차. **4개 테이블 각각에 순서대로 적용**.

```sql
-- 단계별 실행 · 각 단계 확인 후 진행

-- Step 1: 신규 BIGSERIAL 컬럼 추가 (무중단)
ALTER TABLE <table> ADD COLUMN IF NOT EXISTS id_new BIGSERIAL;

-- Step 2: 기존 데이터 확인 (행 수 · id_new 채워졌는지)
SELECT COUNT(*), MIN(id_new), MAX(id_new) FROM <table>;

-- Step 3: 기존 PK 제약 제거
ALTER TABLE <table> DROP CONSTRAINT <table>_pkey;

-- Step 4: 기존 id 컬럼 제거
ALTER TABLE <table> DROP COLUMN id;

-- Step 5: id_new → id 리네임
ALTER TABLE <table> RENAME COLUMN id_new TO id;

-- Step 6: 새 PK 추가
ALTER TABLE <table> ADD PRIMARY KEY (id);

-- Step 7: 확인
\d <table>
```

**주의사항**:
- Step 3~5 사이 짧은 다운타임 발생 가능 (Supabase 트래픽 낮은 시간대 권장)
- BIGSERIAL 값은 신규 레코드부터 적용 · 기존 UUID 레코드는 자동 순번 할당
- 클라이언트/서버에서 id를 `string`으로 선언한 부분은 `number`로 변경 불필요 (Supabase JS 클라이언트가 BIGINT를 string으로 반환하는 경우가 있음 — 검증 후 결정)

---

## 클라이언트 코드 수정 필요 여부

| 테이블 | 서버 코드 수정 | 클라이언트 코드 수정 |
|--------|--------------|------------------|
| `leave_requests` | 불필요 | 불필요 |
| `display_requests` | 불필요 | 불필요 |
| `order_requests` | 불필요 | 불필요 |
| `zone_mismatches` | 불필요 | 불필요 |

모든 경우에 id는 URL 파라미터 또는 문자열 태그 접두어로만 사용되므로, BIGSERIAL 숫자 값도 동일하게 동작한다.

---

## 권고 우선순위

1. **`zone_mismatches`** 먼저 — id 사용이 가장 적음, `product_code` UNIQUE가 실질 식별자
2. **`order_requests`** — FK 없음, upsert 로직 영향 없음
3. **`display_requests`** — FK 없음, 트래픽 보통
4. **`leave_requests`** — FK 없음, 승인 워크플로우 있으므로 트래픽 낮은 시간 권장

---

## 결론

4개 테이블 모두 UUID를 BIGSERIAL로 교체해도 기존 코드 수정이 불필요하다. 다만 PK 교체는 짧은 테이블 잠금을 수반하므로 사용자가 시점을 직접 결정 후 별도 태스크로 진행 권장.

**실행 X · 이 문서는 분석 리포트만.**
