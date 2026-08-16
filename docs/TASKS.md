# TASKS

> 2026-08-16 세션 · #82 완료 · 대기 큐 재분류

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
- **결정 필요**: 알바 (employmentType) 별도 탭 유지? · 약사 하이라이트 유지?
- 위험도: 중 · UI 큰 변경

### #92 · 회사·브랜드 페이지 · 중복 필드 병합
- 5탭 (회사·브랜드·연락처·도장·모바일)
- **결정 필요**: 병합 방식 (약국명 = 앱이름 · 대표전화 = 연락처 · 어느쪽 우선)

### #95 · 매장진열 페이지 UI 재설계
- **파일**: `src/components/DisplayPage/DisplayPage.tsx:1849`
- UI 에이전트 계획 제출 완료 · 4개 질문:
  1. 창고1/2 구역 · zone id 매핑 or 라벨만?
  2. 매장1/2/3 구역 · zone id 매핑 or 독립?
  3. 전체 리스트 · 바코드 스캐너 연결? 별도 리스트?
  4. 합산 버튼 · 표시만? 서버 재고 업데이트?

### #109 Phase B · 색상 트리밍 (Phase A 후속 · 사용자 재검토 대기)
- violet/purple/sky · badge 전용으로 축소
- 카테고리 배지·차트 색상 · 유지
- 사용자 확정 후 진행

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

### #94 · 공급사 재고확인 페이지 신설
- 로그인 담당자 공급사 기간별 재고 · TOP 기간·계절 필터 · 리스트 헤더 자동정렬
- 규모: 큼 · 신규 페이지

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
