# TASKS

**세션 시작 · 2026-09-25** · 태스크 관리 재편성 · 3 카테고리

**규칙**
- 완료 태스크 · 이 파일에서 **삭제** (아카이브 X · 이전 이력은 `TASKS_ARCHIVE_2026-09-25.md` 참조)
- 신규 태스크 즉시 추가 · 카테고리 별 번호 시퀀스
- 세션 시작 시 반드시 read
- 매 milestone 후 update
- **회귀 절대 금지** · TS + build + test 통과 후 커밋
- **리모트 푸시 · 사용자 명시 승인 시에만** (기본 로컬 커밋)
- **DB · 파생컬럼 사용 금지** · 원래 테이블 활용 최우선
- **DB 정합성 절대 유지** · 파괴적 SQL X · 스냅샷 파생 X · SSOT

**태스크 번호 규칙 (2026-09-25 재편)**
- **신규 태스크** · `#N` · 시퀀스 시작 · #1
- **UI 태스크** · `UI-N` · 시퀀스 시작 · UI-1
- **에러 태스크** · `E-N` · 시퀀스 시작 · E-1

**관련 파일**
- 테스트 절차 · `TEST_LIST_2026-09-11_session.md`
- 프레임워크 원칙 · `CODING_PRINCIPLES.md`
- 프레임워크 감사 · `FRAMEWORK_AUDIT.md`
- 이전 태스크 아카이브 · `TASKS_ARCHIVE_2026-09-25.md`

---

## 🔴 대원칙 (확정 · 매 태스크 준수)

- **재고자산 = 매입액 − 판매원가** (cogs)
- **실제잔고 = 매입액 − 결제액**
- **판매액 = 판매수량 × 판매단가**
- **공급사 이름 · vendors 유효성 검증 필수** (자유 입력 금지)
- **공통 기능 = 단일 endpoint** · 신규 전 grep 필수
- **DB 정합성 절대 유지** · 파괴적 SQL X · SSOT
- **유통기한 · 3소스 통합** · SSOT=inventory_checks.expiry_date
- **문자열에 날짜 저장 금지** · 정식 DATE 컬럼 사용
- **말줄임표 금지** · 폭 확장 or 줄바꿈
- **반응형 · md: 이하 카드 전환** 대원칙
- **첫 탭 default** · 페이지 진입 시 첫 탭 자동 활성 · localStorage 복원 X
- **UI 목업 참조** · `docs/UI_MOCKUP_2026-08-21.html` · 모든 UI 작업 필수 참조
- **한글 IME 우선** · KO_INPUT_PROPS (`src/lib/koreanInput.ts`)
- **폰트 +2 default** · 40대+ 가독성

---

## 🆕 신규 태스크 (기능 추가)

<!-- #1 ✅ · 발주매입대조 시스템 (Three-Way Match) · 왼쪽=발주이력 화면 재사용 · 오른쪽=매입 크로스체크 · [매입확인]/[매입이상]/[Undo] + 이상 메모 모달 · 이상목록 탭 (4 exception_type) · 5커밋 · 사용자 테스트 대기 · 2026-09-27 -->
<!-- (없음 · 신규 태스크) -->

---

## 🎨 UI 태스크 (디자인·레이아웃·폰트)

| # | 태스크 | 우선순위 | 비고 |
|---|-----|-----|-----|
| **UI-1** | **결제 탭 · 카드별결제내역 왼쪽 · 결제카드등록 오른쪽** (사용자 지시 · 2026-09-25) | ✅ 완료 (`_pending_`) | PAYMENT_DEFAULT_TABS 순서 스왑 |

---

## 🐞 에러 태스크 (버그·회귀)

| # | 태스크 | 우선순위 | 비고 |
|---|-----|-----|-----|
<!-- E-1 ✅ · 근본 fix · ActiveNav Context SSOT · 사이드 채널 (localStorage/CustomEvent) 제거 · buildBreadcrumb 정공법 lookup · 7커밋 · 2026-09-27 -->
<!-- E-2 ✅ · 공급사별 결제내역 · 재고자산·판매액 · cogs 통일 · 기간 정합 · 2026-09-25 -->
<!-- E-3 ✅ · 32개 이중화 그룹 · 4개 테이블 통합 완료 · 2026-09-25 -->
(현재 · 대기 에러 없음)

---

## 🔒 사용자 액션 대기 (Supabase SQL · 환경)

| 항목 | 조치 | 필요성 |
|-----|-----|-----|
| **E-002-fix** · Google OAuth refresh_token | OAuth Playground · `src/keys/google-oauth.json` 갱신 | Drive 저장 필요 시 |
| **P1-2** · push_tokens 테이블 | Supabase SQL Editor · `migrations/20260921_push_tokens.sql` | iOS 앱 푸시 필요 시 |
| **E-007** · display_requests requester | Supabase SQL Editor · `migrations/20260920_display_requests_requester.sql` | 진열요청 이력 정확도 |
| **#327-2** · drive_links 컬럼 | Supabase SQL Editor · `migrations/20260921_drive_links.sql` | 근로계약서 링크 저장 |

---

## 🧪 사용자 테스트 대기 (서버 재시작 후)

이전 세션 (2026-09-24) · 46 커밋 반영 확인 필요:
- 발주이력 UI (날짜 그룹핑 · 담당자 인라인 · 매입확인 버튼)
- 발주필요 (수량 옆 단가·금액 · 스크롤 헤더)
- 상품정보 (모달 배치 재사용 · 메모·category 분리)
- 판매추천 판넬 (폰트 +2 · 이벤트 아코디언 · 상품추가 모달)
- 거래처 발주이력 (`#352` · vendor 로그인 · 자기 발주만)
- 앱 세션 유지 (RTR · 90일 rolling)
- 앱·웹 뱃지 통일 (unread-count endpoint)
- 세션 만료 배너 크게

**상세** · `TASKS_ARCHIVE_2026-09-25.md` 참조

---

## 📎 배포

- 리모트 푸시 · 명시 재요청 시만 실행
- 로컬 · 46+ 커밋 준비됨 · 리모트 X 유지
