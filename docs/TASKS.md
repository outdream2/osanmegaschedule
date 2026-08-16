# TASKS

> 2026-08-16 세션 · #82 완료 · 대기 큐 재분류

## 🛡️ Spring Security 대비 · 사용자 결정 진행중 (2026-08-16)

### 결정 저장
- **S3 · Account Lockout** · ❌ 취소 (사용자 지시 · 하지마)
- **S4 · Password Policy** · ❌ 유지 (D · 최소 4자 · 사용자 편의)
- **S5 · Audit Logging** · ✅ 완료 (`00b725c` · 관리자 작업만 · winston 30일)
- **S7 · Input Validation** · ✅ 완료 (`52ee393` · Zod · auth 4 route)
- **S10 · Refresh Token** · ✅ 완료 (`f434e1d` · Access 15분 + Refresh 30일)
- **S1·S2·S6·S8·S9** · ⏸ **defer 확정** (사용자 결정 2026-08-16 · "보안 이 정도면 충분")
  - S1 CSRF · SameSite Lax 로 방어됨
  - S2 CSP · Helmet default 로 기본 방어
  - S6 JWT RS256 · HS256 도 안전
  - S8 2FA · 사내 30명 과잉
  - S9 다중 세션 · DB 필요 · 규모 불필요

## 🎨 UI 결정 진행중

### 결정 저장
- **#3 · UI 색상 통일** (랜딩+사이드+헤더) · ✅ 지금 진행 (A) · SIDE_NAV_GROUPS 매핑

## 🆕 신규 태스크

### #122 · 사번 자동 생성 (신규 등록 시)
- 사용자 지시 (2026-08-16) · "사번은 신규등록시 자동으로 만들고"
- EmployeeFormModal · create 모드 · employee_number 자동 생성 로직
- 규칙 결정 필요 (예: MEGA-YYYY-NNN · 또는 순차번호 등)

### #132 · 연차신청 버튼 · 테두리·여백 반으로 (2026-08-17)
- 사용자 지시 · "연차신청버튼과 테두리 여백반으로 줄여"
- 파일: `src/components/LeavePage/LeavePage.tsx` · 연차 신청 form 버튼

### #133 · 랜딩페이지 UI 개선 Phase 5 (2026-08-17)
- 사용자 재요청 · "랜딩페이지 ui개선"
- 이전 #130 4 Phase 완료 · 추가 개선 요구
- 범위: 로그인 카드/모달 통일 · 카카오 채널 카드 · 관리자 헤더 divider · 여백 audit

### #134 · 랜딩페이지 아이콘 리디자인 (2026-08-17)
- 사용자 지시 · "랜딩페이지 아이콘 안예쁘다"
- MenuCard 아이콘 · Phosphor icons · size/weight/color 개선
- 헤더 로고 (Pharmacy cross SVG) · 개선

### #135 · 랜딩페이지 전격 개선 (2026-08-17)
- 사용자 지시 · "마음에 안드네 뭔가 전격 개선"
- 이전 Phase 1-4 미흡 · 근본적 리디자인 요구
- 범위: 브랜드 hero 크게 · 카드 간격/타이포/색상 최신화 · 시각적 노이즈 감소
- **주의**: UI 대원칙 준수 (초고해상도·깔끔·세련·최신 · 파스텔·그라디언트·다색 지양)

### #136 · UI 프레임워크화 검토 (2026-08-17)
- 사용자 지시 · "UI 프레임워크화 검토"
- 반복되는 UI 패턴 · 공용 컴포넌트 추출 검토
- 후보: PageHeader · ModalShell · FormField · SubmitButton 등

### #131 · 페이지설정 · 메뉴 안보이기 (uncheck) 안 됨 · 🐛 버그 (2026-08-17)
- 사용자 지시 · "페이지설정에서 메뉴 안보이기(uncheck) 안돼"
- **증상**: PermissionsPage 에서 페이지 · 보기/숨기기 컬럼 체크 해제 반영 안 됨
- **파일**: `src/components/PermissionsPage/PermissionsPage.tsx` · `src/hooks/usePagePermissions.ts` · 서버 `/api/permissions`
- **원칙**: 프레임워크 기반 (usePagePermissions · api.post) · test_bugfix_principle · 즉시 재현·수정

### #130 · 랜딩페이지 전체 UI 개선 (2026-08-17)
- 사용자 지시 (2026-08-17) · "랜딩페이지 전체 UI개선"
- **범위**:
  - 무지개 gradient 카드 (`내 요청목록`) · 다른 카드와 통일감 없음 · 정리
  - 로그인 카드 (직원 + 거래처) · 디자인 통일 · 세련된 spacing/typography
  - 헤더/브랜드 영역 · 가시성·정렬 재검토
  - 관리자 도구 그룹 vs 직원용 그룹 · 시각적 구분 개선
  - 비로그인 상태 (재고검색·공사중 배너) · 인터랙션 개선
  - 모바일 반응형 검토 (3col/4col/5col grid 활용도)
- **금지**: MenuCard 컴포넌트 구조 파괴 X · 색상 팔레트 (SIDE_NAV_GROUPS 통일) 유지 X → 유지
- **자율 진행 시 원칙**: 안전한 정리·통일부터 · 대규모 재디자인은 사용자 확인
- **파일**: `src/components/LandingPage/LandingPage.tsx` (2492줄)

## 🚨 보안·안정성 감사 (2026-08-16 진행중)

### #112 · 백엔드 보안 · 안정성 fix 배치
- **1. `/api/auth/set-password` 인증 없음** (auth.ts:82) · 아무나 다른 직원 비번 변경 가능 · **최우선** · `authorize(9)` 추가
- **2. Vendor 로그인 · phone + "00"** (auth.ts:43-80) · 취약 · **bcrypt 전환** (vendors 테이블 password_hash 컬럼 추가 필요 · 마이그레이션 SQL 필요) · 또는 사용자 정책 재확정
- **4. tsconfig.json exclude 누락** · `["dist", "node_modules", "coverage", "uploads", "logs"]` 추가
- **5. Supabase 부팅 크래시** (client.ts:16) · `throw` → try/catch null fallback · 서버 부팅 성공 · API 호출 시 500
- **3. requireAuth 재활성화** · **면밀 검토 필요** · 이전에 주석 처리한 이유 확인 후 · 안전한 형태로 복원
- **6. 100MB JSON limit** · multer multipart 로 전환 · 별도 큰 리팩터

## 🟠 진행 중 (세션 유실 시 이어서)

### #111 · 페이지 설정 · 사이드바 구조 그대로 반영 · subTab 단위 개별 권한 (2026-08-16 진행중)
- **파일**:
  - `src/types.ts` · PagePermissions 인덱스 시그니처 (완료 · commit 대기)
  - `src/lib/permissions.ts` · subTab context 지원 helper (TODO)
  - `src/components/layout/sideNavGroups.ts` · canAccessItem 복합키 조회 (TODO · 부분)
  - `src/components/PermissionsPage/PermissionsPage.tsx` · SIDE_NAV item 순회 · 표 형식 · 체크박스 (TODO)
  - `src/components/layout/SideNav.tsx` · usePagePermissions 이미 연결 (완료)
- **저장 키**: `{pageKey}:{subTab}` (예: `display:purchase-order`) · subTab 없으면 `{pageKey}`
- **UI 요구사항** (사용자 지시 2026-08-16):
  1. 사이드바 구조 그대로 표시 (스케쥴 1개→헤더=행 · 매장 6개→트리)
  2. 1개짜리 그룹 (스케쥴·홈·계정 등) · 그룹 헤더가 곧 행 · 하위메뉴 X
  3. 여러개 그룹 · 각 subTab 별로 독립 설정 (매장 6·승인요청 3·경영 4)
  4. **보기/숨기기 컬럼 = 읽기최소 앞에 헤더** · 각 행 · 체크박스
  5. **전체 표 형식** · Grid: [체크박스 | 페이지명 | 읽기 | 쓰기]
- **판정 로직**:
  - `canReadPage(session, perms, pageKey, subTab?)` · 복합키 우선 · 없으면 pageKey fallback
  - `canAccessItem` (SideNav) · `${item.key}:${item.subTab}` 조회 · fallback
- **회귀 위험**: 중 · 여러 페이지 · DisplayPage/ApprovalRequestPage 등 페이지 내부 subTab 접근 판정은 별도 후속

## 🔴 사용자 결정 필요 (답변 후 진행)

### #89 · DayTimelineModal · settings.positions 자동 파생 (B 옵션)
- **파일**: `src/components/DayTimelineModal/DayTimelineModal.tsx` (2704 라인)
- 3 그룹 (약사/사원/기타) 하드코딩 → settings.positions 배열 순회
- **결정 (2026-08-16)**:
  - ✅ 알바 · position 으로 흡수 · 사용자가 직군에 "알바" 추가 완료
  - ✅ 약사 · 글씨색 눈에 띄게 강조 · 빨간색 제외 (violet 또는 sky 톤)
- 위험도: 중 · UI 큰 변경

### #92 · 회사·브랜드 페이지 · 완전 통합
- 현재 5탭 (회사·브랜드·연락처·도장·모바일) → **하나로 통합** (사용자 결정 2026-08-16)
- 필드 중복 완전 제거 · 단일 페이지 · 섹션 구분
- 약국명 = 앱이름 · 대표전화 = 연락처 · 하나만 사용

### #95 · 실재고입력 페이지 UI 재설계 · **다음 세션 defer** (사용자 결정 · B · 2026-08-16)
- 현재 · ScanPage 이미 5분할 (창고1/2/매장1/2/3) · 테이블 형식 · 저장 로직 완비
- 요청 · UX 재배치 (product-major → location-major grouped grid)
- 사유 · 2-3h UX 재디자인 + 사용자 테스트 필요 · 세션 여유 시 진행
- **파일**: `src/components/ScanPage/ScanPage.tsx` (실재고입력)
- **데이터**: 창고1·2 / 매장1·2·3 → **실재고 테이블 저장** · ERP 구역 컬럼 연동
- **UI 스펙**:
  - 그리드 정렬 · 각 위치별 3행:
    - 첫행 · 위치
    - 다음행 · 구역
    - 3가지 값 · 기존재고(저장된) 위 · 추가할 갯수 아래 · 확정갯수 마지막
  - **창고 부분 위 · 매장 부분 아래** · 각 그룹 접기/펼치기
  - **합산 버튼** · 합산값 → 실재고 수량 (DB 저장)
  - **하단** · [진열요청] 버튼 · [위치불일치] 버튼
  - 예쁘고 가시성 좋게 · 세련된 디자인
- **Q3 답변**: 매장진열리스트 (DisplayPage) 는 지금 리스트 그대로 사용 · 별도 리스트 신규 X
  - 단 · 진열요청이 있었던 상품이 표시되어야 함 (필터 or 강조 표시)

### #109 Phase B · 색상 트리밍 (스킵 · 색상 통일 후 재검토)
- 사용자 결정 (2026-08-16) · B · 스킵
- 랜딩+사이드+헤더 색상 통일 (SIDE_NAV_GROUPS 매핑) 완료 후 · 재검토
- violet/purple/sky badge 전용 축소는 · 그 결과 보고 결정

## 🟡 자율진행 가능 (규모/위험 명시 · 사용자 승인 시 착수)

### #90 · ContractWriterPage · JOB_CATEGORIES → settings.wageRates 자동 파생
- **파일**: `src/components/ContractWriterPage/ContractWriterPage.tsx:3097`
- 하드코딩 `["약사","매장","창고","기타"]` → wageRates 동적
- 위험도: 높음 · 계약서 렌더·wageRates 저장 구조 연동

### #91 · SchedulePage · position 문자열 매칭 → settings 기반 (재검토 필요)
- **파일**: `src/components/SchedulePage/SchedulePage.tsx`
- ⚠ 실제 스캔 · 하드코딩 30+ 곳 (line 87-88, 213, 317, 375, 392, 521, 1042, 1051, 1121, 1239, 1243-1251, 1261-1262, 1346-1348, 1491, 1495, 2014 등)
- 데이터 모델 변경 필요 (scheduleTypes.hoursByPosition 맵) · positionTab 필터 재정의
- 위험도: **높음** · 스케줄 = critical business logic · 대형 리팩터
- 재산정: TASKS.md 스코프 (line 87-97) 대비 실제 훨씬 큼

### #94 · 공급사 재고확인 페이지 신설 · A안 확정 (2026-08-16)
- **방향**: A · Vendor 전용 (본인 공급사 상품 · 기간별 재고)
- **기존**: `VendorStockModal.tsx` (177줄 · 상품+재고+검색만) · MVP 완료 상태
- **확장 요구**:
  - TOP · 기간 필터 (date range)
  - TOP · 계절 필터 (봄·여름·가을·겨울 · useSeasonRanges)
  - 리스트 · 헤더 자동정렬 (useSortableTable)
  - 공통 CSS · TEXT.body/label 등 · 신규 P1 스케일 사용
- **구현 방식 옵션**:
  - A1 · Modal 확장 (VendorStockModal 에 필터·정렬 추가) · 소-중
  - A2 · 전용 페이지 신규 (`VendorStockPage.tsx`) · 중-대
- 규모: 중 · 1-2시간

### DayTimelineModal 대형 리팩터 (#98 후속)
- 2704 라인 → ZoneSection/BreakTimeline/WorkerChips 파일 분리
- 위험도: 중-높음 · 대형 리팩터

## ⏸ 외부 대기 (사용자 액션·외부 인프라)

### #42 · 발주 · PDF 생성 + 카카오톡 자동 발송
- **재개 조건**: 사업자등록증 발급 → SolAPI 계정 세팅 (사업자 인증 · 카카오 채널 · 알림톡 템플릿 · API 키·env 5개)
- **완료 시**: 서버 코드 연결 (자동 진행)

## 🟢 부분/대부분 완료 (참고 · 잔여 확인 필요)

### #73 · Dead code 실제 파일 정리 · 부분 완료
- ✅ StockManagePage 3파일 (commit `4cc2ae4` · LowStockPanel 524줄 포함)
- ✅ ScheduleFilterBar dead prop 4개 (commit `5e50953`)
- 남은:
  - OcrPage 미사용 파일 (⚠ Gemini 코드 미터치 원칙 · 확인 필요)
  - YOLO 모델 파일 (재고세기 비활성 상태 · 재활성화 대비 유지 여부 결정)
  - SalesTrendPage 는 2657줄 활성 (dead 아님 · 오기 삭제됨)

### #102 · 페이지 권한 · 표 형식 정렬 · 완료 (2026-08-12)
- ✅ 헤더 폰트 +4 · 컬럼 폭 140/150 · 오른쪽 정렬
- ✅ #99 트리 구조 완료 · 정렬 유지 확인 (2026-08-16)

### #99 · 페이지별 최소 권한 · 트리 구조 재구성 · 완료 (2026-08-12/13)
- ✅ SIDE_NAV_GROUPS 기반 · 그룹 접기/펼치기 (collapsedGroups + localStorage)
- ✅ 페이지 pl-6 들여쓰기 · └ tree 시각화
- ✅ 미분류 페이지 → "기타" 그룹
- TASKS.md stale 이었음 · 실제로 이미 구현됨 (line 14, 86-101, 321-350, 487-577)

### #101 · 직군 삭제·수정 시 employees 데이터 보호 · 완료 (2026-08-12)
- ✅ `removePositionAt` · 사용중 · 재매핑 대상 prompt · transaction · orphan 방지
- ✅ `commitEditPosition` · 이름 변경 · confirm · employees 자동 rename (transaction)
- 파일: `src/components/PermissionsPage/PermissionsPage.tsx:131-204`

### #96 · 랜딩 거래처 카드 관리자 접근 방식 · 완료 (2026-08-12) · A1 선택
- ✅ 관리자 · display>vendor-manage 페이지 이동 (localStorage subtab 힌트)
- ✅ vendor · 본인 정보/재고 모달
- 파일: `src/components/LandingPage/LandingPage.tsx:1465-1509`

### #54 · Memory 업데이트 (세션 마감 시 정례)
- 이번 세션 신규: 사이드바 V2 · 회사·브랜드 통합 · SystemSettingsPage · SettingsPageShell · LeavePage mode · PermissionsPage 23개
- + 2026-08-16 신규: `src/lib/contract/` 모듈 · `.split-container` PC 80% 폭

## 📜 완료 로그

### 2026-08-17 세션 (대규모 프레임워크 · 커밋 55+)
- **프레임워크 완성** · asyncHandler 100% (37/37 route) · apiClient 100% (Gemini 제외) · shared 10 schema + 8 dto
- **테스트** · 103 tests · 11 files · vitest node+jsdom
- **문서** · FRAMEWORK.md v1.7 (1048+ 라인)
- **버그 fix** · #131 페이지 uncheck (admin lockout 방지)
- **UI 개선** · #130 랜딩 4 Phase (무지개 카드 · 로그인 모달 bg fix · 그룹 헤더 · 공사중)
- **UI** · 약사 색상 violet → blue (사용자 요청)
- **분리** · LandingPage StockSearch 컴포넌트 (-161 라인)
- **대원칙 메모리 추가** · feedback_framework_first_coding.md · feedback_framework_compliance.md
- Access+Refresh JWT · envValidation · errorReporter (Sentry 준비) · MenuCard (12 카드 통합)

### 2026-08-16 세션 (커밋 5건)
- `5e50953` #98 · ScheduleFilterBar dead prop 4개 삭제
- `4cc2ae4` #73 · StockManagePage 3파일 삭제 (LowStockPanel 524줄 포함)
- `c01bf0e` #110 A · SplitPanel PC 뷰포트 80% 폭 · 중앙 정렬
- `bf7acbe` docs · TASKS.md 갱신
- `752d796` #82 · pure logic → `src/lib/contract/index.ts` · Page 상호의존 제거

### 2026-08-14 사용자 액션 완료
- SQL migration 2건 실행: `add_employees_annual_leave_days` · `perf_indexes_leave_requests`

### 2026-08-13 색상 프레임워크
- `d5daa31` #109 Phase A · slate → zinc 전역 치환 (138 파일)
- `80b5cc0` #109 Phase 1 · 버튼 스타일 · 2025 SaaS 트렌드

### 2026-08-12 (이전 세션 · 요약)
- Leave 신청/승인 분리 · Critical/High 안정화 · 서류작성 분리 · 사이드바 V2 · SystemSettingsPage · SettingsPageShell · settingsTypography · 회사·브랜드 통합 · 발주 리스트 편집 수량 fix · 일괄 발주 통합 · ResignationWriterPage SplitPanel

---

## ❌ 취소된 항목
- **C** · StaffManagePage 오른쪽 상세 · EmployeeProfileCard 통합
- **E Phase 2** · SplitPanel 미도입 페이지 이관
- **에이전트 리서치 추가 카테고리 8개** ("추가 카테고리 하지마")

## 세션 관리
- **원칙**: `docs/AGENT_PRINCIPLES.md`
- **임금**: `docs/PAYROLL_ALGORITHM.md`
- **contract-master**: `.claude/agents/contract-master.md`
- **메모리**: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
