# #9 차용등록 Phase A 진행 상태 · 2026-08-31

## ✅ 완료

### 1. DB 스키마 (SQL 실행됨)
- `borrowing_parties` 테이블 · 당사자 마스터 (self/vendor/external)
- `borrowing_signatures` 테이블 · 서명·도장 감사 이력
- `borrowings` 확장 · lender_party_id · borrower_party_id · contract_no · overdue_notified_at
- `v_borrowings_full` view · JOIN 통합

### 2. Server API (커밋 c566b985)
- POST /api/borrowings · body 확장 (lender_party_id · borrower_party_id · signatures[])
- GET /api/borrowings/parties?q=... · 자동완성 (name · contact_name)
- POST /api/borrowings/parties · 당사자 신규
- POST /api/borrowings/:id/signatures · 사후 서명
- GET /api/borrowings/:id/signatures · 서명 이력

### 3. UI 프리미티브 (커밋 7b70aff7 등)
- BorrowingPartyCard · 당사자 카드 (lender=violet · borrower=emerald)
- BorrowingArrow · SVG 화살표 (그라디언트 · 상태별)
- SignatureStampSlot · 서명 + 도장 + 감사 메타
- BorrowingCard · 이력 카드 (Timeline 확장)

## 🚧 남은 UI 리팩터 (별도 세션 권장 · 8-12h)

### BorrowingPage.tsx (673 라인 · 안정성 우선)

**신규 구현 대상:**
1. 3-column 등록 폼 (Lender · Arrow · Borrower)
   - BorrowingPartyCard 재사용 · 각 클릭 · 당사자 선택/등록 모달
   - GET /api/borrowings/parties 로 자동완성
2. 이중 서명 슬롯 (등록 시)
   - SignatureStampSlot · role=lender + role=borrower
3. 이력 리스트 · BorrowingCard 로 이관
   - 기존 table → 카드형 · Timeline 확장
4. 반환 모달 · SignatureStampSlot 재사용
   - role=lender_return + borrower_return (이중 반환)

**Risk assessment**
- 기존 flow 100% 유지 필요 (대원칙)
- 신규 필드 nullable · 하위호환 (서버 API 이미 준비됨)
- 회귀 위험 · 중 (사용자 flow 붕괴 가능)
- **권장** · dedicated session · 8-12h · 스텝별 커밋 · 각 단계 TS+build+테스트

**진행 절차 (다음 세션)**
1. BorrowingPage → BorrowingPage_v2 신규 파일 병행 개발
2. 사용자 테스트 후 · 원본 파일 대체
3. 롤백 가능 · 원본 파일 백업 유지

## 사용자 안정성·정합성 대원칙 (2026-08-31)

- 모든 태스크 · TS·테스트·회귀 확인 필수
- 안정성 vs 진행 속도 · **안정성 우선**
- Phase A UI · 별도 세션 · 스텝별 검증 필수
