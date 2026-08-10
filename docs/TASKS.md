# TASKS

## 🆕 2026-08-10 세션 · 발주 라이프사이클 (진행 중)

### 📋 사용자 확정 스펙 · 발주요청 → 발주완료

**흐름**:
1. **발주요청 리스트** · 공급사별 그룹핑
   - 각 그룹 헤더에 [발주] 버튼 (해당 공급사만 · openOrderModal(그룹라인))
   - 상단에 [일괄발주] (선택 전체 · 기존)
2. **[일괄발주]** · 모달 · 각 공급사별 카드 분리 표시 (이미 구현 · openOrderModal · bySupplier)
   - 카드마다 고유 `order_number` (`PO-YYYYMMDD-XXXX`)
   - 각각 별도 발주서
3. **확정 시 DB 저장** · 선택된 order_requests 라인들 · UPDATE
   - 같은 공급사 라인들 → 같은 `order_number` 공유
   - 다른 공급사 → 다른 `order_number`
   - `status='ordered'`, `sent_at=NOW()`, `order_qty`, `unit_price`, 수신처 스냅샷 (`supplier_contact`/`email`/`phone`), `order_date`, `desired_arrival`, `memo` 채움
4. **발주이력 탭 (신설)** · `status='ordered'` 만 · `order_number` 로 GROUP BY → 발주서 단위 리스트
   - 클릭 시 발주서 상세 (아이템·수신처·발주일)

**핵심 규칙**:
- **발주번호 = 공급사 단위** (일괄이든 개별이든 · 하나의 공급사 = 하나의 order_number)
- 발주요청 리스트에 남는 것 = `status='requested'` 만
- 발주완료된 라인은 발주이력 탭으로 이동 (요청 리스트에서 사라짐 · WHERE status='requested' 필터)

### 💾 DB · A안 (order_requests 확장 · 사용자 승인)

- 마이그레이션: `migrations/add_order_dispatch_columns_2026-08-10.sql`
- 커밋: `5e4f350`
- **⏸️ 사용자 액션 대기**: Supabase SQL Editor 에서 실행 필요
- 추가 컬럼: `status`, `order_number`, `order_qty`, `unit_price`, `supplier`, `supplier_contact/email/phone`, `order_date`, `desired_arrival`, `memo`, `sent_at`
- 인덱스 3개: order_number · status+sent_at · supplier+sent_at
- 하위 호환: 기존 row `status='requested'` 로 세팅

### 🔴 대기 큐 (TaskCreate #9~#19)

**발주요청 UI (OrderManagePage)**:
- **#9** · 공급사별 그룹 헤더 렌더
- **#10** · 공급사명 (주)/주식회사 제거 (displayVendorName)
- **#11** · 이메일/문자 체크박스 제거
- **#12** · 툴바 한줄 (PC) · 2줄 (모바일) · 일괄발주·전체선택·삭제·분류
- **#13** · 새로고침 버튼 제거
- **#17** · 공급사 그룹 헤더 [발주] 버튼 · 해당 공급사만 openOrderModal

**서버 (마이그레이션 실행 후)**:
- **#14** · 일괄발주 handler · UPDATE status='ordered' + 공급사별 order_number 부여
- **#15** · GET /api/order-history · status='ordered' · order_number GROUP · 최신순

**클라이언트**:
- **#16** · 발주이력 탭 UI 신설 (Level 2 서브탭)

**공급사별 현황 · 매입이력**:
- **#18** · 공급사별 현황 · 공급사 컬럼 · 분류 [줄바꿈] 공급사명 2줄 표시 (SupplierTab.tsx)
- **#19** · 매입이력 페이지 · 상단 컨트롤 통합 UI · 매입이력·ERP·공급사별/상품별·기간·계절·Top N (PurchaseHistoryTab.tsx · split 안 건드리지 않음)

**공급사관리 · 상세 (VendorListEditor · DisplayPage)**:
- **#20** · 공급사관리 (DisplayPage) 왼쪽 리스트 · 공급사 컬럼 · 분류 [줄바꿈] 공급사명
- **#21** · 공급사 기본정보 · 팀장이름·팀장전화번호·긴급연락처 필드 추가 (vendors 컬럼 마이그레이션 · VendorListEditor 폼)

**거래처 로그인 UX**:
- **#22** · 거래처 로그인 · 3메뉴 구성 · 방문예약 · 공급사 정보 · 재고확인 (스케줄·이슈·요청·기타 숨김)
- **#23** · 재고확인 메뉴 · 모달 · 로그인 공급사의 제품 리스트 + 각 상품 총 재고 (ERP + 실재고 합계)

### 🤖 진행 중 (백그라운드 에이전트)

- 에이전트 1 · safe-refactoring-expert · OrderManagePage · 매입주기·상세버튼 dead code 완전 정리 (5f64289 이후)
- 에이전트 2 · general-purpose · DisplayPage · 공급사관리 오른쪽 상단 등록폼 + 상세 [삭제] 버튼

### ✅ 완료 (2026-08-10 커밋)

- `8537d14` · 스캔 실재고 옵션 C 하이브리드 (모바일 카드 · PC 테이블)
- `2854cb5` · 공급사관리 CARD_BASE · 모바일도 4컬럼
- `5f64289` · 발주모달 잔고카드 제거·이전사입가·매입주기 UI 제거·[상세] 버튼 제거·전역 폰트 +2
- `5e4f350` · order_requests 컬럼 확장 마이그레이션
- `dc59330` · 매입주기·상세버튼 dead code 완전 제거 (state·필터·정렬·enrich · -145줄)
- `20b6d94` · REVERT `303068c` (공급사관리 등록폼 인라인 · 지시 밖 확대 · 사용자 원복 지시)
- `4d7bafb` · 발주요청 툴바 재구성 · 이메일/문자·새로고침 제거 · 2행 (#11·#12·#13)
- `e367a4b` · 공급사 상세 · 기본정보·공급요약 수평 배치 · VAT 별도 기본 · 미설정 제거

---

### 🎨 매입이력 페이지 · 상단 컨트롤 통합 (신규 · 2026-08-10)

**대상**: `src/components/OrderManagePage/PurchaseHistoryTab.tsx`

**통합 대상 요소** (사용자 명시):
- 매입이력 (타이틀)
- 🟢 ERP / 🟠 OCR (데이터 소스 배지)
- 뷰 모드: **공급사별** · **상품별** 토글
- 기간: 10일 · 1개월 · 2개월 · 3개월 · 4개월 · 5개월 · 6개월
- 계절: 🌸 봄 · ☀️ 여름 · 🍁 가을 · ❄️ 겨울
- Top N: 100 · 300 · 1k · 2k · 전체

**현재 상태**:
- 상단 필터바 (L760-879) · 매입이력·ERP·공급사별/상품별·새로고침 만 있음
- 기간·계절·Top N · SplitPanel 좌측 안 (L1054+) 에 위치 · 분리됨

**목표**:
- 위 6개 카테고리 · **하나의 통합 상단 툴바**로 재배치
- 예쁘고 세련되고 깔끔한 UI (사용자 반복 요청 원칙)
- 반응형 · PC 는 한줄 · 모바일은 wrap
- 원칙: split 되는 곳 (좌우 분할 컨테이너) 은 건드리지 말 것 (사용자 명시)
- **폰트 크기 통일** · 전역 스케일 +2 (index.css) 이미 반영 · 개별 크기 조정 불필요

**설계 방향 (제안 · 승인 필요)**:
- 통합 툴바 컨테이너 (CARD_BASE) · 상단 유일한 필터바
- Row 1: 타이틀 · ERP 배지 · 뷰 모드 토글 (좌) · 새로고침 (우)
- Row 2: 기간 chip 그룹 · 계절 chip 그룹 · Top N chip 그룹
- SplitPanel 은 그 아래 · 위 툴바가 상태 전달만
- 기존 기간/계절/Top N UI (split 안) · **제거** 필요 (사용자 스펙: "통합")
  · 다만 "split 건드리지마" 원칙과 충돌 가능 · 사용자 재확인 필요

**대기 이유**: 폰트 +2 로 부분 충족 · 실행 전 사용자 재확인 필요 (구조 변경 여부)

---

## 🆕 2026-08-09 세션 (진행 중)

### ✅ 완료 (16 커밋 · 로컬)

**매입이력 소스 통일** (원칙: `purchase_details` 만 사용 · OCR fallback 제거 · 사용자 원칙 확정)
- `25c212e` 매입이력 8 API · OCR fallback 제거 · queryPurchaseDetails 헬퍼 신설
- `6335a09` 놓친 endpoint · `/api/stock-manage/product-history` 소스 교체
- `75c566a` `/api/vendors?withBalances=1` · supplier_balances (파생) 제거 · 실시간 계산

**결제탭 UI 재구성** (사용자 요청 다수)
- `21d67dc` 왼쪽 5컬럼 초기 (총매입·총결제·총잔고·총판매·최근매입일)
- `c42704e` 컬럼 순서·로딩 표시·모바일 모달 스크롤
- `5ef1d9b` 우측 상단 **7행 표** (헤더+공급사 3행+판매 3행 · 월별 · 행합계)
- `b411c26` 왼쪽 4컬럼 재구성 (총재고자산·총판매액·총결제액·총잔고) · 실잔고 라벨
- `05e69fb` → `b6f7f45` 매입 제거 오해 → 원복 (지시 확대해석 사례)
- `da84a7d` 실재고액 = 실재고(w1+w2+s1+s2+s3) × 매입단가 합계 · 붉은색 톤

**공급사관리 · 구조 변경** (경영 → 매장 이동 · 검색모달 · 등록모달)
- `52eb33e` 발주 붉은 파스텔·직군 "거래처" 추가·경영 공급사관리·랜딩 공급사등록 카드
- `7bb0ec5` **공급사관리 · 경영관리 → 매장 서브탭 (7번째)** · sessionStorage 초기 진입
- `67fed93` NewVendorModal 신규 · VendorDetailModal 탭 제거 (정보 한 장) · 사업자번호 미등록 필터 제거
- `c1c1d25` VendorSearchModal 신규 · 검색 → 조회수정 or 신규등록 통합 (일단 미사용)
- `448f1ea` 거래처 로그인 시 · 본인 공급사 조회·수정 카드 · 공통 VendorDetailModal 재사용
- `a3d1463` VendorDetailModal 에 거래처 로그인 비밀번호 필드 (POST `/api/vendors/:id/set-password`)

**공용 UI + SolAPI 준비**
- `8c9b76a` PeriodSelector 공용 컴포넌트 · PERIOD_MONTHS_PRESET · PERIOD_DAYS_PRESET
- `c482e14` `908e5d9` 공급사 관리 기간 chip · 사번없음 필터 버튼 제거
- `be0349e` 비로그인 랜딩 · OSAM MEGATOWN 헤더 (반응형)
- `448f1ea` SolAPI 스켈레톤 · `npm i solapi` · `server/lib/notification/solapiClient.ts` · GET `/api/notification/solapi-status`

### 🔴 대기 (사용자 결정 · 액션 필요)

| # | 태스크 | 상태 |
|---|-------|------|
| A | **SolAPI 활성화** (옵션 1 결정됨 · 사업자 등록 후) | ⏸️ 사업자 인증·채널·템플릿·환경변수 5개 |
| B | **일괄발주 → 공급사별 발주목록 리스트업** | ✅ 확인 완료 · 이미 구현됨 (openOrderModal · bySupplier) |
| C | **실재고 스캔 시 · 중간 팝업 제거** | ✅ 커밋 `f25e425` · setScanModal 호출 제거 |
| D | **폰트 크기 하드코딩** | 🔵 답변 완료 · 렌더는 index.css 전역 스케일로 통일 · 코드 리팩토링 안전 대상 X · 시각 변화 원하면 index.css 조정 (S2) or 페이지별 조정 (S3) |

### ✅ 원격 푸시 완료 (2026-08-09 밤)
- 25 커밋 · `13088f2..f25e425` → `origin/main` · 사용자 명시 승인

### 🎨 구조 변경 요약 (2026-08-09)

**신규 컴포넌트**:
- `src/components/common/NewVendorModal.tsx` · 신규 공급사 등록 (회사명 필수 + 카테고리·담당자·전화·이메일·사업자번호·비고 · POST /api/vendors)
- `src/components/common/VendorSearchModal.tsx` · 검색 → 조회수정 or 신규등록 라우팅 (현재 랜딩에서 미사용 · 대기)
- `server/lib/notification/solapiClient.ts` · SolAPI 카카오 알림톡 클라이언트 (credentials 대기)
- `server/utils/purchaseDetailsQuery.ts` · queryPurchaseDetails 헬퍼 (7 endpoint 재사용)

**메뉴 구조 변경**:
- **매장 서브탭** · 6개 → **7개** · 신규 "공급사관리" (Building2 아이콘 · rose · level 9)
  - 발주 · 매입 · 결제 · 통계 · 입고알림 · 매장구역도 · **공급사관리** (신규)
- **경영관리** · 공급사관리 탭 · 임시 추가되었다가 매장으로 이동 (원상복구)
- **랜딩 거래처용** · 방문예약 옆 · 공급사 정보 카드 (거래처 로그인 시만 · 본인 공급사 조회·수정 모달)

**신규 API**:
- `GET /api/supplier-monthly-breakdown?supplier=X&months=N` · 7행 표 데이터 (매입·결제·판매·실재고 월별 aggregate)
- `GET /api/notification/solapi-status` · SolAPI 설정 여부 조회 (UI 배너용)

**변경 API (매입이력 원칙)**:
- `/api/supplier-purchase-detail` · OCR fallback 제거
- `/api/supplier-purchase-summary` · OCR fallback 제거
- `/api/products/purchase-history` · ocr_confirmed_items → purchase_details
- `/api/stock-manage/top-products` · 동일
- `/api/stock-manage/suppliers` · 동일
- `/api/stock-manage/product-history` · 동일
- `/api/supplier-balance/:name` · 잔고 계산 소스 · OCR → PD
- `/api/supplier-ledger` · 원장 매입 소스 · OCR → PD
- `/api/vendors?withBalances=1` · latestBalance 실시간 계산 (total_purchase · total_payment 필드 추가)

**신규 메모리 원칙**:
- `feedback_only_instructed.md` · **지시한 것만 · 임의 확장·재해석 금지** (오해 사례 이후 추가)

**변경 파일 (주요)**:
- `server/routes/purchase/supplierPayments.ts` · vendors.ts · purchaseHistory.ts · stock/stockManage.ts
- `src/components/OrderManagePage/PaymentInfoTab.tsx` · OrderManagePage.tsx
- `src/components/DisplayPage/DisplayPage.tsx` · BusinessManagePage/BusinessManagePage.tsx
- `src/components/LandingPage/LandingPage.tsx` · VendorListEditor.tsx
- `src/constants/jobCategories.ts` (거래처 추가)

---

**상태 요약** (2026-08-06 갱신 · 세션 100+ 커밋 · UI 개선 다수):
- 진행중 (백그라운드):
  · T-PROJECT-Restructure Phase 1·2 (ae105a52) · 백엔드 shim 삭제 + routes/ 10 도메인 서브폴더
  · T-PROJECT-Restructure Phase 3 (aa8ec23d) · 프론트 구조 정리
  · T-CTR-UI (a29f41d5) · 근로계약서 UI 4건 (자동계산·연차·계약유형·계좌 폭)
- 완료 (2026-08-06 세션): 100+ 로컬 커밋
  · UI/UX 개선 · 공통화·리팩토링 · 보안·타입 강화
  · dead code 정리 · 서버 응답 표준화
  · OCR 폴더 재구성 (3e7c150) · localStorage → DB 이관
  · 근로계약서 다중 개선 (v 아이콘 좌측·성명 검색·자동연동·계약조건 정리 등)
  · 결제 탭 통계 헤더·기간 조회 · 급상승 탭 재구성 (기본 최근판매·상비약 기본)
- 사용자 액션 대기 (Supabase): perf_indexes · vat_integration · loss_tracking_daily · T-CTR-3
- 검증 대기: 30+ 커밋 (2026-08-06 세션)
- 남은 큰 태스크: God Component 5개 · T-SLIM B/F · requireAuth (T3-defer)
- 보류: 1건 (T-PERF-5)
- 이번 세션 완료 · 삭제: T-CSS Phase 2 Priority A/B · T-Audit-DeadCode · T-DB-Audit · 미사용 파일 정리 · as any 서버/프론트 부분 · T-SLIM E · T-VAPID-Route · OCR 재구성 · .vercel/assets 정리 · T-CTR-SearchWorker · T-CTR-Collapse+Reset · T-CTR-Chevron(All) · T-CTR-Cleanup · payment-tab 통계 헤더 · trending 재구성 · ConfirmProvider 마운트 hotfix
- 폴더 구조 결정 (사용자 승인): **By-Feature (도메인 기반)** · 옵션 A (10 그룹 세분화)

**규칙**:
- 완료 태스크는 이 파일에서 **삭제** (아카이브 X)
- 새 태스크 즉시 추가
- **🚨 세션 시작 시 반드시 read** · 이 파일 + `docs/MENU_STRUCTURE.md` 두 개 다 (신규 대화·세션 만료 후 재개 포함)
- 매 milestone 후 update
- **회귀 절대 금지** · TS + build + test 통과 후 커밋
- **리모트 푸시 · 사용자 명시 승인 시에만** (기본 로컬 커밋)
- **DB · 파생컬럼 사용 금지** · 원래 테이블 활용이 최우선 · 사용자 명시 (2026-08-05 재강조)
  · 파생컬럼 필요 시 · 반드시 사용자 승인 후
  · 조회는 JOIN · 계산은 서버·클라이언트 로직 우선
- **문서 관리는 project-registrar 에이전트 전담** (2026-08-06)
  · 태스크·기능·구조 변경 시 · project-registrar 호출 · MENU_STRUCTURE.md + TASKS.md 반영
  · 다른 에이전트는 이 두 파일 편집 금지 (read 만 OK)
  · 정의: `.claude/agents/project-registrar.md`
- **테스트·수정 요청 워크플로우** (2026-08-06)
  1. 사용자가 테스트·수정 요청 → **즉시 TASKS.md 에 저장** (project-registrar)
  2. 해당 도메인 에이전트 · 코드 수정 (test/fix)
  3. **소스코드 변경 사항 · MENU_STRUCTURE.md 에 업데이트** (project-registrar · 날짜 기록 · CHANGELOG)
  4. TASKS.md 완료 태스크 · 삭제 (project-registrar)

---

## 🎯 UI 원칙 · 추가 (2026-08-06)

- **모든 리스트 컬럼 · 넓이 조정 가능** (사용자 명시)
  · 각 컬럼 헤더 · 우측 경계 · 드래그로 폭 조정
  · 카테고리 헤더 (그룹 헤더) · 카테고리 단위로도 조정
  · 상태 · localStorage 저장 · 다음 방문 시 유지
  · 공통 훅 or 컴포넌트 (예: useColumnResize) 로 통일

---

## 🔴 사용자 액션 대기 · Supabase SQL (2026-08-06)

### T-Migration-Indexes · Supabase SQL 실행 대기 (신규 · 2026-08-06)
- 파일: `migrations/perf_indexes_2026-08-06.sql`
- 액션: 사용자 · Supabase SQL Editor 실행
- 내용: 성능 인덱스 4개 (매입이력·상품 검색 등)

### T-VAT-Migration · Supabase SQL 실행 대기
- 파일: `migrations/vat_integration.sql`
- 액션: 사용자 · Supabase 대시보드에서 실행
- 관련 커밋: `058e92d` VendorInfo 이름 정제 + VAT 자동 추론 · `cc4ccae` VAT 기본 포함

### T-LOSS-Migration · Supabase SQL 실행 대기
- 파일: `migrations/loss_tracking_daily.sql`
- 액션: 사용자 · Supabase 대시보드에서 실행
- 관련 커밋: `fe08712` 손실추적 · `b18419b` 손실추적 컬럼 확정 · `859c37f` T-LOSS-HISTORY

---

## 🆕 신규 발견 · 추가 (2026-08-06)

### T-DB-Audit-B · 중기 마이그레이션 (미실행)
- 파일: `migrations/db_improvements_top3.sql`
- 내용: `invoice_date TEXT → DATE` 타입 변환
- 액션: 사용자 승인 · 백업 후 실행

### T-DB-Audit-C · 장기 (Render 배포 전 검토)
- 내용: `vendors` FK 정규화
- 데이터 영향 큼 · 별도 롤백 플랜 필요

### T-Inventory-Legacy-Drop · `inventory_checks` 레거시 컬럼 DROP
- dead-code-auditor 발견 (`a3a8ebf6`)
- 정합성 확인 후 · 사용자 승인 필요

---

## 🔄 진행 중 (자동 파이프라인 · 백그라운드)

### T-PROJECT-Restructure Phase 1·2 (백그라운드 · ae105a52)
- 백엔드 shim 삭제 + `server/routes/` 10 도메인 서브폴더 재구성
- 폴더 방식: **By-Feature (도메인 기반)** · 옵션 A (10 그룹 세분화) · 사용자 승인
- 코드 편집 · docs/ 미접촉 · 이 파일과 겹침 X
- 완료 알림 대기

### T-PROJECT-Restructure Phase 3 (백그라운드 · aa8ec23d)
- 프론트 구조 정리 · pages/ · components/ 도메인별 재편
- 코드 편집 · docs/ 미접촉 · 이 파일과 겹침 X
- 완료 알림 대기

### T-SLIM C · useFetch 마이그레이션 (백그라운드 · a8e3be2a)
- useFetch 훅 신규 완료 (`c9ff8e3` 부산물)
- 페이지별 fetch 패턴 → useFetch 로 마이그레이션 중
- 완료 알림 대기

### T-CSS Phase 2 Priority C · God Component 마이그레이션 (별도 태스크)
- OrderManage · ContractWriter · RawOcrTable · DisplayPage · StaffManage
- 각 파일 God Component 분해 병행 필요 (아래 God Component 항목 참고)

### T-Restructure-Phase4 · productCache · models 이동 (대기)
- dead-code-auditor 후속 · OCR 참조 정리 후 · 별도 세션
- Phase 1·2·3 완료 후 착수

### ✅ 완료 · 자동 파이프라인 앞 단계
- `f9ba80e` T-VAPID-Route · `/api/vapid-public-key` 라우터 추가 (신규 발견 완료)
- `46f7fd7` `.vercel` · `assets/.aistudio` 삭제
- `ed149cb` `server/ocr` · barcode 파일 2개 삭제
- `3e7c150` T-OCR-Restructure · OCR 폴더 기능별 서브폴더 정리
- `c9ff8e3` scripts/ 34개 일회성 파일 삭제
- Prisma · public/products.json · 미참조 이미지 삭제
- `8fdf697` T-CSS Phase 2 Priority A · SupplierTab · SalesTrendPage · BusinessManagePage
- `792835a` `80ab6ed` `481d6d5` T-CSS Phase 2 Priority B · RequestsPage · BoardPage · StaffManagePage
- `a3a8ebf6` T-Audit-DeadCode 감사 완료
- `a90269e3` T-DB-Audit 감사 완료
- `f09b191` `03ec97b` `18e1118` `c9ff8e3` 미사용 파일 정리 (11 컴포넌트/이미지 + 2 라우터 + 49 스크립트)
- `03ec97b` `9673da1` 서버 as any 265+ → 18 필수
- `7a08a33` 프론트 as any 부분 14건 제거
- `3d3de7f` T-SLIM E · 응답 shape 표준화
- `38606e8` T25 · useVendors 훅 (8 파일 -101 lines)
- `401cd2b` `4d6b703` T30-followup · useSortableTable 확대 (6 파일)
- `34a9a3f` `81ce398` `3b78425` T26 · select('*') 명시화 (31/56 · 25건 skip)
- T-CSS Phase 1 · 디자인 토큰 + 공통 컴포넌트 완료

---

## 🔍 project-architect 분석 결과 (2026-08-05)

**규모**: 107K줄 · 프론트 118 tsx / 74 ts · 서버 92 파일

**아키텍처 강점**:
- 서버-클라이언트 fetch 분리 (2개 예외: scheduleService · notificationsService)
- OCR 파이프라인 stage 분리 잘 됨
- common 컴포넌트 24개
- 도메인 훅 분리 시작 (useVendors · useSettings · useSortableTable)

**주요 문제점 · 우선순위** (10건):

| # | 카테고리 | 문제 | 시간 | 상태 |
|---|---------|------|------|-----|
| 1 | 🚨보안 | requireAuth 미들웨어 전체 비활성 (Render 시 critical) | 2h | T3-defer |
| 2 | 코드품질 | fmtWon/fmtDate 16+ 파일 중복 정의 | 3~4h | ✅ T-SLIM A 완료 (`8a5675b`) |
| 3 | 아키텍처 | God Component 5개 (RawOcrTable 5268 · ContractWriter 5256 · OrderManage 3224 · DisplayPage 2890 · StaffManage 2773) | 1~3일/파일 | 별도 · 대기 |
| 4 | 성능 | select('*') 56곳 | 4~6h | ✅ T26 부분완료 (31/56 · 25 skip) |
| 5 | 코드품질 | `as any` 서버 265+ → 18 필수 (`03ec97b`·`9673da1`) · 프론트 476건 남음 (God·OCR 제외) | 10h+ | ✅ 서버 완료 · 프론트 진행중 |
| 6 | 아키텍처 | scheduleService · frontend 번들 혼입 | 2~3h | ✅ 완료 (`3cd7aff`) |
| 7 | 보안 | password_hash · 로그인 응답 노출 위험 | 30분 | ✅ 완료 (`71a58e4`) |
| 8 | UX | window.confirm 146건 | 4~6h | ✅ T-SLIM D 완료 (`6e6690e`) |
| 9 | 유지보수 | 타입 정의 산재 | 5~8h | T-SLIM E · 대기 |
| 10 | 유지보수 | src/ 루트 · 엑셀 4개 혼입 | 10분 | ✅ 완료 (`a709c8b`) |

**즉시 실행 가능 · 잔여 1건**:
1. requireAuth 최소 적용 · 1~2h · **Render 배포 직전 재도입** (T3-defer)

**Render 배포 CRITICAL**:
- 인증 미들웨어 재도입
- JWT_SECRET 확인
- scheduleService 번들 분리
- CORS · Helmet · Rate Limit 신규

---

### T-SLIM · 공통 기능 분리·리팩토링·코드 슬림화 (2026-08-05 · 사용자)
**절대 원칙**: **기능에 절대 문제 안 생기게** · 렌더·데이터·동작 동일 유지

**후보 (project-architect 분석 후 확정)**:

**A. 유틸리티 통합** — ✅ Phase 2 완료 (`8a5675b`) · fmtWon 통합 (잔여 fmtDate/fmtNumber 미완)
- date-fns / dayjs 도입 검토 (자체 구현 대체) · 대기
- 전화번호 · 사업자번호 포맷터 · 정규식 통합 · 대기

**B. 폼·검증 통합**
- react-hook-form + zod 도입 검토
- 유효성 검증 로직 (전화번호 · 이메일 · 숫자) 통합
- 폼 필드 컴포넌트 (`TextField` · `NumberField` · `Select`) 신규

**C. 데이터 fetch 패턴 통합** — 🔄 진행중 (a8e3be2a)
- useVendors · useProducts · useEmployees 같은 도메인별 훅 (T25 useVendors 이미 완료)
- ✅ 공통 fetch 훅 `useFetch<T>(url)` 신규 (`c9ff8e3` 부산물)
- 페이지별 마이그레이션 진행 중
- 에러·로딩 상태 표준화

**D. 알림·확인·토스트 통합** — ✅ 완료 (`6e6690e`) · window.confirm 통합 · 잔여 0
- toast 상태 · 페이지마다 개별 useState → useToast 훅 or context · 대기

**E. 서버 응답 shape 정규화** — ✅ 완료 (`3d3de7f`)
- 라우터별 응답 형식 통일
- 페이지네이션 응답 통일 (T-PERF-1a/b 에서 `has_more` 등)

**F. 상수 파일 정리**
- `src/constants/` 하위 정리 · 도메인별 그룹핑
- 매직 넘버 상수화

**진행 방식**:
1. project-architect 분석 완료 → 구체 대상 리스트 파악
2. 우선순위 결정 (효과 큰 것부터)
3. 항목별 · 별도 브랜치 or 커밋 단위
4. **각 항목 · TS+테스트+build 통과 필수** · 실패 시 즉시 revert
5. UI 검증 · 각 항목마다 사용자 확인 or 자동 E2E

**예상**: 15~25h (다수 세션 · 항목별 진행)
**위험**: 중~높음 (무회귀 원칙 · 극도 신중)

### T-CSS · 공통 CSS 리팩토링 + 전체 UI 통일 (신규 · 2026-08-05 · 확장 v2)

**최상위 목표** (사용자 명시):
- **전체 통일성 있는 깔끔하고 세련된 UI**
- **글씨 크기 통일** (page 마다 [10px]/[11px]/[12px] 제각각 → 스케일 5단계로 통일)

**타이포 스케일 (신규 규칙)**:
- `text-hero` — 페이지 타이틀 (17~18px · 헤더 아이콘 옆)
- `text-body` — 본문 · 기본 (13~14px · 리스트 셀·라벨)
- `text-caption` — 서브·힌트 (11~12px · 배지·라벨·메타)
- `text-micro` — 최소 · 코드·시각 (9.5~10px · 시각·타임스탬프)
- `text-num` — 숫자 강조 (font-black tabular-nums · KPI·금액)

**색상 팔레트 정리**:
- `primary` (indigo) · `success` (emerald) · `warning` (amber) · `danger` (rose) · `info` (sky) · `neutral` (slate)
- 각 색상 · 50/100/200/500/600/700 만 사용 (다양성 제한 · 통일)


**목적**: 각 탭 페이지의 공통 부분 · 반응형 로직을 공통 CSS/컴포넌트로 통합

**대상 1 · 탭 페이지 공통 부분**:
- **페이지 헤더** (AppNavHeader 아래 · 페이지 타이틀·아이콘·설명) · 대부분 페이지 반복
- **서브탭 바** (TabBar 이미 있음 · 미채택 페이지 마이그레이션)
- **툴바** (검색·필터·새로고침·정렬 아이콘) · 페이지마다 개별 구현
- **리스트 컨테이너** (`rounded-2xl border border-slate-200 shadow-sm` 반복)
- **빈 상태** (`데이터 없음` · `로딩 중...` · 페이지마다 다른 스타일)
- **상태 배지** (pending/prepared/done · amber/sky/emerald 반복)
- **액션 버튼** (준비완료·완료·삭제·저장 · 색상 톤별 반복)
- **입력 필드** (border/focus-ring 조합 반복)
- **KPI 카드** (숫자·라벨 조합 반복)

**대상 2 · 반응형 공통 정리**:
- **breakpoint 통일**: sm/md/lg 사용 규칙 (예: 리스트 sm=1열 · md=2열 · lg=3열)
- **모달 → 바텀시트** (모바일에서 `rounded-t-2xl` · 데스크탑 `rounded-2xl` 반복)
- **SplitPanel 좌우 → 세로 스택 or 모달** (이미 있음 · 미채택 페이지 마이그레이션)
- **가로 스크롤 vs 컬럼 접기** 규칙
- **폰트 크기 스케일** (text-[10px]/[11px]/[12px] · 페이지마다 다름)
- **터치 타겟** (min-h-9 · min-w-9 통일 · 모바일 44px 규칙)

**방법론**:
1. **디자인 토큰 파일** 신규 (`src/styles/tokens.ts`)
   - `CARD_BASE`, `TOOLBAR_BASE`, `INPUT_BASE`, `BUTTON_PRIMARY`, `BADGE_PENDING/PREPARED/DONE` 등
2. **공통 컴포넌트 확장**:
   - `PageHeader` 신규 (제목·아이콘·설명·서브탭 슬롯)
   - `Toolbar` 신규 (검색·필터·액션 슬롯)
   - `StatusBadge` 신규 (status prop · 색상 자동)
   - `EmptyState` · `LoadingState` 신규
3. **반응형 유틸**:
   - `useBreakpoint()` 훅 (필요 시)
   - CSS 유틸 클래스 (Tailwind config 확장 or `@apply`)
4. **파일별 마이그레이션**:
   - 재고관리 → 매입관리 → 진열요청 → 근로계약서 → 스케줄 → 경영관리 순
   - 파일 단위 · 회귀 시 즉시 revert

**효과**:
- 코드 -1000~1500줄
- 디자인 통일성 · 다크모드 대비
- 새 페이지 추가 시 · 3~5 컴포넌트 조립으로 완성
- 반응형 일관성

**위험**: 낮음~중 (className 변경 · 렌더 동일 유지)

**예상**: 10~15h (여러 파일 · 파일별 순차 · 다수 세션 가능)

**방식**: mobile-ui-designer 위임 · 파일별 · 회귀 즉시 revert 가능

### T-PERF-5 · 가상 스크롤 (react-window) · 보류
- 5000+ 행 리스트에서 필요 · 현재 페이지네이션으로 렌더 수십 행
- 나중 필요 시 재검토
- 예상 2~3h · 위험 낮음

---

## 🔴 사용자 실 UI 검증 대기 (2026-08-05 커밋)

| 커밋 | 태스크 | 검증 |
|------|-------|-----|
| `2d799bc` | T-C · 근로계약서 CMS 서버 이전 완결 | 설정 페이지 → 조항 편집 저장 → 다른 브라우저 확인 |
| `3f4e57e` | T-C · CMS 서버 이전 초기 | 상동 |
| `f444d21` | T-PERF-1b · 매입이력 페이지네이션 | 매입이력 첫 로드 속도 |
| `480b9e4` | T-PERF-1a · 재고관리 캐시 | 재고관리 재방문 즉시 반영 |
| `bf35419` | YOLO 완전 제거 (-946 lines) | 재고세기 버튼 사라짐 확인 |
| `f5217d9` | T37 · JSON body 10MB | DoS 방어 · 정상 요청 영향 없음 |
| `ecf84b4` | T-SCAN-1 · RequestsPage 진열요청 3단계 표 | 요청 메뉴 진열요청 탭 |
| `9cd8d27` | 스캔 모달 컴팩트 5칸 | 스캔 → 창1/2·매1/2/3 한 화면 |
| `24d57cd` | T-SCAN-4-a · 매장별 [요청] | 매장 슬롯 미니 버튼 |
| `2621b87` | T-SCAN-4-b · 표 재구성 | 요청메뉴 진열요청 표 컬럼 |
| `ff04638` | T-CTR-12 · 세전월급 자동 | 근로계약서 자동 채움 |
| `92a25bb` | T-SCAN-2 · ProductInfoCard | 세로 제목 방지 |
| `9851d10` | T-SCAN-3 · 삑소리 강화 | 2톤 · 진동 |
| `49e34e5` | T-UI-1 · ProductDetailPanel | 태블릿 fullscreen |
| `89612ac` | 매입 서브탭 파이차트+필터 | 원형차트 3종 · 기간필터 |

---

## ✅ 사용자 SQL 실행 완료 (2026-08-05)

- ✅ `contract_clauses` 테이블 생성 (T-C 대응)
- ✅ 인덱스 SQL Block A (재고관리·매입이력·상품·실재고·진열요청)
- ⏳ 인덱스 Block B (pg_trgm + trigram · 상품 검색 5~10배 · 선택)
- ⏳ zone_labels 테이블 생성 (아직 안 하셨으면 · `migrations/create_zone_labels_2026-08-05.sql`)

## ⏸️ 사용자 액션 대기 (Supabase 대시보드)

### T-CTR-3 · Supabase SQL
```sql
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS contract_type TEXT,
  ADD COLUMN IF NOT EXISTS contract_start DATE,
  ADD COLUMN IF NOT EXISTS contract_end DATE,
  ADD COLUMN IF NOT EXISTS probation_end_date DATE;
ALTER TABLE employee_contracts
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
```

| # | 항목 | 액션 |
|---|------|-----|
| J | pharmacist-materials 버킷 | Supabase 대시보드 |
| K | vendors 오학습 정리 (page 6) | vendors 테이블 직접 |
| L | employees.resume_url 컬럼 | `ALTER TABLE employees ADD COLUMN resume_url TEXT;` |

---

## 🚨 T3-defer · Render 배포 직전 재도입

- 원본 T3 (`0bce40e`) 설계 버그 원복 (`7cd406c`)
- 재도입 시 필수: 각 라우터 명시 경로 mount · public 분리 · E2E 테스트
- `server/middleware/requireAuth.ts` · `/api/auth/me` · `issueToken` 유지 중

---

## 세션 관리

- **원칙**: `docs/AGENT_PRINCIPLES.md`
- **임금**: `docs/PAYROLL_ALGORITHM.md`
- **contract-master**: `.claude/agents/contract-master.md`
- **메모리**: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
- **2026-08-05 세션**: 로컬 커밋 30+ · 리모트 푸시 2회 (`97ef77d` · `ecf84b4`)
- **이후 리모트 push · 명시 승인 시에만**
