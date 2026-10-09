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

**세션 추가 · 2026-10-09** (사용자 요청 전체 등록 · 오래된 순)

| # | 태스크 | 상세 | 상태 |
|---|-----|-----|-----|
| **#1** | **발주이력 inline expand** · 발주반품현황 → 발주이력 탭 | 날짜·공급사 행 클릭 → 아래 상세품목 inline 펼침 (모달 X) · `OrderHistoryExpandableBoard` · `/api/order-history` items[] 재사용 | ✅ 완료 (`d8480186`) |
| **#2** | **발주매입대조 UI · 좌우 심플 매칭** · 발주반품현황 → 발주매입대조 탭 | 한 행 = 좌(발주정보: 발주번호·공급사/발주일/품목·수량/발주금액) + 우(매입정보: 매입일·공급사/매입기간/품목·수량/매입금액) + 끝(판정 + 처리상태) · 매입 불일치 시 **우측 rose 톤 하이라이트** · 행 클릭 → 아래 품목 상세 + 매칭 상세 좌우 2-grid inline · 기존 테이블 (10 cols) 제거 · 기능 유지 (매입확인/이상/판정취소/담당자 이메일) · **파일 분리** `order-return/MatchOverviewSection.tsx` (large-file-critical fix) | ✅ 완료 (`d8480186`) |
| **#3** | **발주 전송 통합 플로우 (SendBulkOrderDialog 공통 모듈)** · 매우 중요 (사용자 강조 다중) | **4단계 flow**: (1) **채널 선택** 모달 (카카오톡/문자/이메일 라디오 or 탭) · (2) **담당자 정보 체크** (선택 채널에 해당 연락처 유무 · 없으면 블록 + 안내) · (3) **확인 모달** (담당자 정보 + 상품 리스트 전체 노출 → "확인" 클릭) · (4) **완료 모달** ("발주가 완료되었습니다" · 전송 결과 ACK) · 기존 integration 활용 (`server/services/kakaoNotifyService.ts`, `server/lib/notification/solapiClient.ts`) · **공통 Dialog** 로 모듈화 → #5 재조정 담당자 발송에도 재사용 | 🔴 미시작 · 설계 필요 |
| **#4** | **발주·반품 현황 페이지 로딩속도 저하 조사** · 사용자 보고 "갑자기 느려짐" | OrderReturnOverview 성능 저하 원인 조사 · 최근 변경 (TodayTasks·StockArrival·MatchOverviewSection 등) 리그레션 가능 · fetch 전수 조사 + 메모이제이션 누락 확인 · 발주 캐시 X 원칙은 유지 | 🔴 미시작 |
| **#5** | **매칭상세 재조정 flow + 발주매입재조정 페이지 (신규)** | **(a)** MatchOverviewSection inline expand 품목상세/매칭상세 라인 체크박스 · "재조정하기" → 선택 라인 → 발주매입재조정 페이지로 이동 · 처리상태 "재조정 요청중" · **(b)** 발주매입재조정 페이지 (신규): 재조정 리스트 수집 · 각 라인 수량차이·단가차이 표시 · 재조정 수량·재조정 단가 입력 · 담당자 발송 → **#3 SendBulkOrderDialog 공통 모듈 재사용** · **설계 확인 필요**: 페이지 위치 (별도 라우트 / inner tab) · DB 스키마 (신규 테이블 OR resolution_* 활용) | 🔴 미시작 · 설계 확인 중 |

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
