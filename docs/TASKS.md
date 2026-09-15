# TASKS

**규칙**:
- 완료 태스크는 이 파일에서 **삭제** (아카이브 X)
- 새 태스크 즉시 추가
- 세션 시작 시 반드시 read
- 매 milestone 후 update
- **회귀 절대 금지** · TS + build + test 통과 후 커밋
- **리모트 푸시 · 사용자 명시 승인 시에만** (기본 로컬 커밋)
- **DB · 파생컬럼 사용 금지** · 원래 테이블 활용 최우선
- **DB 정합성 절대 유지** · 파괴적 SQL X · 스냅샷 파생 X · 마스터 참조 무결성 · UNIQUE 이중 방어 · SSOT · 매 DB 작업 체크리스트

**관련 파일:**
- 테스트 절차 · [`TEST_LIST_2026-09-11_session.md`](./TEST_LIST_2026-09-11_session.md)
- 프레임워크·원칙 · [`CODING_PRINCIPLES.md`](./CODING_PRINCIPLES.md)
- 프레임워크 감사 · [`FRAMEWORK_AUDIT.md`](./FRAMEWORK_AUDIT.md)

---

## 🔴 대원칙 (확정 · 매 태스크 준수)

- **재고자산 = 매입액 − 판매원가** (cogs)
- **실제잔고 = 매입액 − 결제액**
- **판매액 = 판매수량 × 판매단가** (xlsx total_amount 합계 컬럼 절대 사용 금지)
- **공급사 이름 · vendors 유효성 검증 필수** (자유 입력 금지 · POST/PATCH /api/products 에서 400 SUPPLIER_NOT_FOUND 반환)
- **공통 기능 = 단일 endpoint** (2026-09-14) · 같은 목적 route 중복 금지 · 신규 전 grep 필수
- **DB 정합성 절대 유지** · `feedback_db_integrity_absolute_2026-09-15.md` · 파괴적 SQL X · 스냅샷 파생 X · UNIQUE 이중 방어 · SSOT

---

## 🧪 사용자 테스트 대기 · 최신 (2026-09-15 세션)

**모든 코드 완료 · 사용자 테스트 대기.** 상세 확인 절차 · `TEST_LIST_2026-09-11_session.md` (항목 [28]~[38]).

| # | 항목 | 커밋 |
|---|-----|------|
| [28] | 탭바 전역 정렬 fix · 초광폭 밀림 해소 | `a576ea27` |
| [29] | #39 Phase A+B · 발주 진행중 접힘 카드 + 지연 tier | `2277a8a2` |
| [30] | T-SP-BULK · POST bulk shelf_positions 병합 (22 tests) | `b86a4b20` |
| [31] | #61 B안 · 지정위치 정합성 + 상품↔실재고 자동 연동 | `a75958da` |
| [32] | DB 정합성 · DELETE /api/products · 회계 이력 차단 | `8a987279` |
| [33] | T-MENU-BOTTOMNAV · BottomNav perms.hidden 필터 | `596108af` |
| [34] | T-SP-9-REST · ExpiryImminentTab 진열위치 뱃지 | `5513c8d4` |
| [35] | #191 Phase B · ShelfPositionsEditModal Modal 마이그레이션 | `04935b7b` |
| [36] | T-PROD-LABEL · 상품정보 왼쪽 리스트 · 한글 라벨 | `0860dc7f` |
| [37] | T-SP-9-REST · ZoneProductsModal 진열위치 뱃지 | `4af7a227` |
| [38] | #107·#258 · 발주 리스트 프리미엄 헤더 통계 뱃지 | `752db75b` |

---

## 🔵 진행 중 · #253 · Electron 자동 임포트 앱

**위치:** `apps/sync-agent/` · 사용자 테스트 병행

### ✅ 완료된 기능
- Electron v33 + electron-vite + electron-builder 셋업
- 트레이 상주 · 부팅 자동 시작 · 하이브리드 UI (D안)
- 로그인 · 핸드폰번호 + JWT 쿠키 인증 · 자동 refresh (15분 → 30일)
- **아이디 저장** · 다음 실행 자동 채움
- **파일 감시 모드 (chokidar · 기본)** · 새 xlsx 감지 · 10분 debounce · 자동 임포트
- **스케줄 모드** (선택 · 상호배제) · cron 프리셋
- 최신 파일 감지 · 파일명 날짜 우선 · fallback mtime
- `_processed`·`_failed` 자동 관리 · 재시도 성공 시 `_failed → _processed`
- 임포트 · 웹앱 endpoint 재사용 (`/api/upload-*`) · octet-stream + 자동 파라미터
- 로컬 큐 (JSON) · 지수 백오프 재시도
- 데이터 카운트 표시 · '상품 6287개 · 복원 7049개'
- Windows toast · 트레이 상태 색상
- 자동 업데이트 · electron-updater · GitHub Releases
- Logs 탭 · 실행 이력 · 폴더 상태 · 재시도 큐
- Copyright footer · IRUMs · (주)이룸즈

### 🧪 사용자 테스트 병행
- 로그인 · 상품 임포트 · 6287개 성공 확인
- 파일 감시 모드 · 실제 xlsx 저장 · 10분 자동 임포트 · 진행 중

### 🔲 남은 작업 (배포·안정화)
- Installer 재빌드·설치 테스트
- 서버 응답 형식 재검증
- README·매뉴얼

---

## 🟡 활성 PENDING · 자율 진행 가능

| # | 태스크 | 우선순위 | 비고 |
|---|-----|-------|-----|
| **#56** | 매장 구역 추가/제거 · X 버튼 권한 | 🟢 P4 LATER | 스펙 애매 · 확인 필요 |
| **T-SP-MASTER-UI** | 매장·창고 마스터 관리 UI (매장4·5 추가) | 🟢 P3 | 현재 KV JSON 직접 편집 · 관리자 페이지 필요 시 |
| **#149** | large-file 분리 잔여 · OcrPage(1215)·PaymentInfoTab(1513)·OrderManagePage(3089)·LandingPage(2319)·ContractWriterPage | 🟢 P3 | Framework Phase 4 잔여 · baseline 9 파일 · 대형 |
| **#115** | real_map 컬럼 DB DROP SQL 실행 · `migrations/20260904_drop_real_map.sql` | 🟡 | 사용자 · Supabase SQL Editor 직접 실행 |

---

## 🔲 승인·지시 대기 (착수 전 사용자 확인)

| # | 태스크 | 대기 사유 |
|---|-----|---------|
| **#191 Phase C** | Modal 프레임워크화 · panel/modal 이중 (VendorDetailModal·VendorPaymentPanel·BorrowingDetailPanel·SupplierTab.panels·ProductDetailPanel) | 고위험 · 5 파일 · 사용자 승인 후 |
| **#130** | 차용등록 재설계 · 양방향 화살표 | 목업 승인됨 · 부분 반영 · 구현 대기 |
| FlowTab·LossHistoryTab·DiffTab | 컬러 bg 정리 (대량) | 승인 후 순차 |
| **#254~#256** | 세션 보안 강화 · 중복 로그인 방지 · 강제 로그아웃 | 대형 · 별도 세션 · 12-18h |

---

## 🔴 사용자 결정 필요

| # | 태스크 | 결정 사항 |
|---|-----|---------|
| **#89** | DayTimelineModal · settings.positions 자동 파생 | 하드코딩 3 그룹 → settings 순회 여부 |
| **#90** | ContractWriterPage · JOB_CATEGORIES → wageRates 파생 | ContractCategory strict union 광범위 변경 |
| **#91** | SchedulePage · position 문자열 매칭 → settings | 탭 유지 vs 직군 순회 vs 하이브리드 |
| **#92** | 회사·브랜드 페이지 · 완전 통합 (5탭 → 1페이지) | 통합 여부 |
| **#107·#258 v4** | 발주 리스트 프리미엄 · 헤더 통계 뱃지 유지 여부 | 사용자 테스트 후 결정 |
| **매입이력 검색** | "테스트" vendor · 매입이력 없음 · union 표시 or 그대로 | 사용자 결정 대기 |

---

## 🚫 열린 이슈 · 사용자 재현 확인 필요

- **상품등록 404** · 네트워크 탭 URL 확인 필요 (서버 재시작 후 재현 여부)
- **웹앱 서버 로그 · 한글 깨짐** · Node 프로세스 CP949 고정 · `chcp 65001` or CC 재시작 (sync-agent 는 해결됨)

---

## ⏸ 외부 대기

- **#42** · 발주 PDF + 카카오톡 · SolAPI 사업자등록증 발급 대기

---

## 🛡️ Spring Security · 확정 상태

- ✅ S5 Audit · S7 Input Validation · S10 Refresh Token
- ⏸ S1/S2/S6/S8/S9 · defer
- ❌ S3/S4 · 취소

## 🚨 백엔드 보안 · 잔여

- 🔲 Vendor 로그인 · bcrypt 전환 또는 사용자 정책 재확정 (사용자 결정)
- ✅ 나머지 · 완료 (`/api/auth/set-password` · authorize 등)

---

## 📋 세션 완료 로그 · 최근

### 2026-09-15 (오늘)
- **웹앱 · 12 커밋** · #39·#61·T-SP-BULK·DELETE orphan·T-MENU-BOTTOMNAV·T-SP-9-REST(2)·#191 Phase B·T-PROD-LABEL·#107·#258·탭바 fix
- **sync-agent · 20+ 커밋** · Electron 앱 · 로그인·파일감시·큐·자동업데이트·copyright
- **대원칙 등재** · DB 정합성 절대 유지
- **TASKS.md 정리** · 4파일 → 2파일 (TASKS·TEST_LIST 만) · stale 정리

### 이전 세션 · 요약
- 2026-09-13~14 · 검증 세션 · #20·#36·#44·#47·#48·#50·#52·#54·#63·#64·#68·#70·#72·#73 완료 확인
- 2026-09-10 · 결제탭 전면 개편 · 재고자산/잔고 공식 확정 · 신규 API 4종
- 2026-09-08 · T-SP 세트 14커밋 · shelf_positions JSONB · T-DISPLAY-1
- 2026-09-07 · #115·#117·#119·#120·#121 · expiry_date 버그 · 가격재고 4-col
- 2026-09-06 · LIST-UI-2026 전역 폰트 +2px (30+ 커밋) · 프레임워크 100% 클린
- 2026-09-05 · large-file-warn baseline 0/790 달성
- 2026-09-04 · 공급사재고 페이지 · 스케줄표 모달 탭
- 2026-09-02 · 30+ 커밋 · 카드 결제 시스템 · 거래처 로그인
- 2026-09-01 · 서버 프레임워크 감사 · 55→23 위반
- 2026-08 · Framework Phase 4 · Unit test 2514 · Card 프리미티브 확산

---

**세션 관리:**
- 프레임워크 원칙: `src/components/common/README.md`
- 원칙 규칙: `docs/CODING_PRINCIPLES.md`
- 임금 계산: `docs/PAYROLL_ALGORITHM.md`
- 메모리: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
