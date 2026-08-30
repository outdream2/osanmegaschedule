# 대형 태스크 진행 상태 리포트 · 2026-08-31

> **목적**: #9 · #10 · #11 · #13 · #14 · #16 대형 태스크 · 안전한 순차 진행을 위한 스코프 정리 · 사용자 검토용
> **작성**: 자율 진행 시점 · 세션 계속 시 이 문서 우선 참조

---

## #9 · #130 · 차용등록 재설계 · **Phase A 진행 · SQL 대기**

- 리포트 · `docs/BORROWING_REDESIGN_2026-08-30.md`
- 목업 · `docs/UI_MOCKUP_BORROWING_REDESIGN_2026-08-30.html`
- **신규**: `supabase/migrations/20260831_borrowing_parties_signatures.sql`
  - borrowing_parties · 당사자 마스터
  - borrowing_signatures · 서명·도장 감사
  - borrowings 확장 · lender/borrower_party_id, contract_no, overdue_notified_at
  - v_borrowings_full · 조회 view

### 다음 단계 (사용자 승인 필요)
1. **SQL 실행** (Supabase editor) · 롤백 SQL 포함
2. Phase A 코드 · BorrowingPartyCard · BorrowingArrow · SignatureStampSlot · BorrowingCard 프리미티브 4개
3. `server/routes/payment/borrowings.ts` 확장 · POST body {lender_party_id, borrower_party_id, signatures[]}
4. UI · 3-column 계약서 톤 (Lender / Arrow / Borrower)

**예상 시간**: 최소 구현 8-10h · 완전 이행 16-24h

---

## #10 · 전체 데이터 정합성 · **부분 진행**

### 완료 (2026-08-30)
- ✅ zone_defs 정리 (Option 1) · 54 rows · location 100% · assignee 17건 이관
- ✅ zone_defs.assignee 컬럼 신규 · zone_assignments 이관
- ✅ zone_defs 라벨 정규화

### 진행 대기 (사용자 승인 필요)
- ❓ products.location · display_location · real_map 세 필드 정합성 검증 · #13 과 연동
- ❓ purchase_details vs orders vs receiving 3-way 일치성 검증
- ❓ vendor 매핑 (supplier vs vendor.company_name) 전수 검증

---

## #11 · 같은 기능 endpoint 통일 · **부분 진행**

### 완료
- ✅ `matchesSupplierQuery` 프리미티브 · lib/supplierMatch.ts
- ✅ `matchesProductQuery` 프리미티브 · lib/productMatch.ts
- ✅ OrderHistoryTab · BorrowingPage 확산

### 진행 대기 · 남은 후보 (grep 기준)
- ExpiryImminentTab · placeholder "상품·공급사·구역 검색" · 아직 개별 로직
- BorrowingPage 등록 폼 (form) · 검색 없음
- DisplayPage/RealStockTablePage · L518 검색 · 인라인 로직
- UnassignedProductsTab · L129 검색 · 인라인 로직
- 각 페이지의 인라인 supplier.includes(q) 패턴 · 약 8~12개 파일

### 접근
- 각 파일에서 `.filter(r => r.supplier?.toLowerCase().includes(q))` 패턴 → `matchesSupplierQuery` 교체
- 안전 · 필터 로직만 변경 · UI 무영향

---

## #13 · real_map → location 리팩터 · **부분 진행 · 135건**

### 현황
- real_map 총 사용: 135건 (src/ 기준)
- 스코프 원칙: **real_map 는 실재고 스캔 (ScanPage) + 배치구역 불일치 (mismatches) 만 유지 · 그 외 전부 location 통합**

### 위치 카테고리
| 카테고리 | 파일수 | 조치 |
|---|---|---|
| 실재고 스캔 (유지) | ~20 | 그대로 |
| 배치구역 불일치 (유지) | ~5 | 그대로 |
| 표시·조회 (변경 대상) | ~110 | location 우선 · real_map fallback |

### 안전 진행 방법
- 각 파일별 `product.real_map` → `product.location ?? product.real_map` 로 fallback 추가 (하위호환 보존)
- 이후 fallback 제거 (2단계)

---

## #14 · 광범위 KV → 정식 DB 테이블 이관 · **낮은 우선순위**

### 현황 조사
localStorage 사용처 다수 · 대부분 UI 프리퍼런스 · 도메인 데이터 아님

| 카테고리 | 예시 | 조치 |
|---|---|---|
| 세션 · 인증 | megatown_auth_session | 유지 (localStorage 적합) |
| UI 프리퍼런스 | sidebar.open · tab 선택 · 폭 저장 | 유지 |
| 검색 이력 | recent search | 유지 |
| 카메라 캐시 | android_best_camera_id | 유지 |
| **도메인 캐시** | ContractSettingsPage JOB_WAGES_KEY · CONTRACT_CLAUSES_KEY | ⚠ 확인 필요 |

### 판단
- 대부분 UI 프리퍼런스 · 이관 불필요
- Contract 관련 KV 캐시 · DB 원본 있으면 삭제 가능 (조사 필요)

---

## #16 · API 파일 · 프레임워크 통합 재구성 · **낮은 우선순위 · 정리 리팩터**

### 현황
- server/routes/ 하위 · 40+ 라우트 파일
- 중복 패턴:
  - supabase.from("products") · 여러 파일 (stock/products.ts · display/mismatches.ts · display/requests.ts 등)
  - supabase.from("vendors") · 다수
  - authorize + asyncHandler 패턴 · 정형화됨

### 접근 (승인 필요)
- 각 도메인 · 단일 라우트 파일 원칙 (products.ts · vendors.ts · zone_defs.ts)
- 크로스 도메인 헬퍼 (findProduct · getVendor) · lib/serverUtils.ts 로 추출
- 대형 리팩터 · 별도 세션 필수

---

## 요약

| # | 상태 | 다음 단계 | 소요 |
|---|---|---|---|
| 9  | SQL 준비 완료 | 사용자 SQL 실행 → Phase A 코드 | 8-24h |
| 10 | 부분 진행 | products.location 정합성 조사 | 4-8h |
| 11 | 부분 진행 | 8-12 파일 matchesSupplierQuery 확산 | 2-3h |
| 13 | 부분 진행 | 110 파일 location fallback 추가 | 6-10h |
| 14 | 우선순위 낮음 | ContractSettingsPage KV 조사 | 2-4h |
| 16 | 우선순위 낮음 | 도메인 라우트 통합 계획 | 별도 세션 |

**추천 순서 (안전 우선)**:
1. #11 (endpoint 통일 확산) · 2-3h · 리스크 낮음
2. #9 Phase A (SQL 실행 후 코드) · 8-24h · 사용자 승인 필요
3. #13 (real_map → location fallback) · 6-10h · 하위호환 유지
4. #10 (데이터 정합성 검증) · 4-8h · 조사 위주
5. #14, #16 · 별도 세션
