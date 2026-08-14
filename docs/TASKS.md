# TASKS

> 2026-08-12 세션 마감 · 대기 큐 정리 · 완료 항목은 로그만

## 🔴 대기 큐 (사용자 결정/재개 필요)

### #99 · 페이지별 최소 권한 · 트리 구조 재구성 (사이드바 메뉴 계층)
- **파일**: `src/components/PermissionsPage/PermissionsPage.tsx`
- 지금: 평면 리스트 (23개 페이지 나열)
- 목표: sideNavGroups 기반 · 그룹 헤더 (홈·스케쥴·매장·경영·설정) 접기/펼치기 · 하위 페이지 들여쓰기
- 위험도: 중 · UI 재구성 · 로직은 그대로

### #100 · 페이지별 접근 조건 · 레벨 OR 직군 (둘 중 하나 만족)
- **파일**: `src/hooks/usePagePermissions.ts` (신규) · `src/lib/permissions/index.ts` 관련
- 지금: PagePermission { read: number, write: number } · 레벨만
- 목표: PagePermission { read: number, write: number, readPositions?: string[], writePositions?: string[] } · 레벨 OR 직군 만족 시 접근
- 서버 저장 키 · 기존 그대로 (확장 필드 추가)
- UI · 각 페이지 행 · 레벨 셀렉트 + 직군 멀티체크 (팝오버)
- 위험도: 높음 · 여러 페이지 · 권한 판정 로직 통합 필요

### #101 · 직군 설정 삭제·수정 시 · employees 연동 데이터 보호
- **파일**: `src/components/PositionsSettingsPage/...` (or WorkTypeSettingsPage)
- 지금: 직군 목록 · 자유 편집 · 삭제 시 · employees.position 참조값 · orphan 됨
- 목표:
  - 삭제 시 · 사용중인 직군 · 경고 + [재매핑] 다이얼로그 (기존 값 → 새 값)
  - 이름 변경 시 · employees 참조 · 자동 rename (transaction)
  - 완전 삭제 · 아무도 사용 안 할 때만 · 활성화
- 위험도: 중 · DB 스키마 · 트랜잭션 · rollback 안전

### #102 · 페이지 권한 · 표 형식 오른쪽 정렬 · 셀렉트 겹침 fix (부분 완료 2026-08-12)
- 완료: 헤더 폰트 +4 (11→15) · 컬럼 폭 140/150 · min-w-[120px] · pr-1 오른쪽 정렬
- 남은: #99 트리 구조 진행 시 · 정렬 재확인

### #42 · 발주 · PDF 생성 + 카카오톡 자동 발송 (⏸ 사용자 대기)
- **재개 조건**: 사업자등록증 발급 → SolAPI 계정 세팅 (사업자 인증 · 카카오 채널 · 알림톡 템플릿 · API 키·env 5개)
- **완료 시**: 서버 코드 연결 (제가 진행)

### #89 · DayTimelineModal · settings.positions 자동 파생 (직군 프레임워크화 · B 옵션)
- **파일**: `src/components/DayTimelineModal/DayTimelineModal.tsx` (2704 라인)
- 3 그룹 (약사/사원/기타) 하드코딩 → settings.positions 배열 순회 · 각 별도 그룹
- **결정 필요**: 알바 (employmentType) 별도 탭 유지? · 약사 하이라이트 유지?
- 위험도: 중 · UI 큰 변경

### #90 · ContractWriterPage · JOB_CATEGORIES → settings.wageRates key 자동 파생
- **파일**: `src/components/ContractWriterPage/ContractWriterPage.tsx:3097`
- 하드코딩 `["약사","매장","창고","기타"]` → wageRates 동적
- 위험도: 높음 · 계약서 렌더 로직 · wageRates 저장 구조 연동

### #91 · SchedulePage · position 문자열 매칭 → settings 기반
- **파일**: `src/components/SchedulePage/SchedulePage.tsx:87-97`
- `position === "약사"/"물류"` 하드코딩 → settings.positions 매칭
- 위험도: 중 · 스케줄 시간 계산 로직

### #92 · 회사·브랜드 페이지 · 전체 탭 UI + 중복 필드 제거
- 5탭 (회사·브랜드·연락처·도장·모바일)
- 중복 필드 병합 (약국명 = 앱이름 · 대표전화 = 연락처)
- **결정 필요**: 병합 방식 (약국명·전화 어느 쪽 우선)

### #94 · 공급사 재고확인 페이지 신설 · 로그인 담당자 공급사 기간별 재고
- TOP · 기간·계절 필터
- 리스트 · 헤더 자동정렬 · 공통 CSS
- 신규 페이지 · 크기 큼

### #95 · 매장진열 페이지 UI 재설계 (창고/매장 스테퍼·전체리스트)
- **파일**: `src/components/DisplayPage/DisplayPage.tsx` line 1849 근처
- 좌: 매장구역도 · 우: 창고섹션·매장섹션·전체리스트·스테퍼
- UI 에이전트 계획 제출 완료 · 4개 질문 답변 필요
  1. 창고1/2 구역 · zone id 매핑 or 라벨만?
  2. 매장1/2/3 구역 · zone id 매핑 or 독립?
  3. 전체 리스트 · 바코드 스캐너 연결? 별도 리스트?
  4. 합산 버튼 · 표시만? 서버 재고 업데이트?

### #96 · 관리자 · 랜딩 거래처 카드 (공급사정보/재고확인) 접근 방식 결정
- 현재 관리자 노출됐지만 `disabled={!vendorSelf}` 로 클릭 불가
- **결정 필요**: A1 (매장>공급사 이동) / A2 (vendor 선택 모달) / A3 (원복 · isVendor 만)

### #82 · ContractWriter → ContractSettings 로직 직접 import (아키텍처 · 회귀 위험 중간)
- `src/components/ContractWriterPage/ContractWriterPage.tsx:42`
- 6개 심볼 (loadContractSettings 등) → `src/lib/contract/` 로 이관 필요
- 위험도: 중

### #73 · Dead code 실제 파일 정리 (감사 결과 기반) · 부분 완료 2026-08-14
- ✅ StockManagePage.tsx (6줄 empty shell) · index.ts · LowStockPanel.tsx (524줄 · 0 imports) 삭제 (commit `4cc2ae4`)
- ✅ ScheduleFilterBar dead prop 4개 삭제 (commit `5e50953`)
- 남은:
  - OcrPage 미사용 파일 (⚠ Gemini 코드 미터치 원칙 · 확인 필요)
  - YOLO 모델 파일 (재고세기 비활성 상태 · 재활성화 대비 유지 여부 결정 필요)
  - SalesTrendPage 는 2657줄 활성 · TASKS.md 오기 (dead 아님)
- 위험도: 낮음-중 · 각 파일별 개별 확인

### #98 · 스케쥴표 dead code · 대부분 완료 2026-08-14
- ✅ ScheduleCell·SchedulePage import 7개 · scrollDays·KNOWN_POSITIONS·totalSummaryList·attSummary 삭제
- ✅ `onScheduleUpdate` prop 삭제 (DayTimelineModal · commit `e069f0e`)
- ✅ `workplaceTab`/`todayFirst` orphan prop 4개 삭제 (ScheduleFilterBar · commit `5e50953`)
- ⚠ `displayZoneVer` · 강제 re-render 패턴 · 삭제 시 회귀 위험 · 유지
- 남은: DayTimelineModal 2704 라인 · ZoneSection/BreakTimeline/WorkerChips 파일 분리 (대형 리팩터 · 별도 태스크)

### #54 · Memory 업데이트 (세션 마감 시)
- 이번 세션 신규 요소:
  - 사이드바 V2 · 승인요청·서류작성·거래처 그룹
  - 회사·브랜드 통합 페이지
  - 시스템 설정 페이지 (env)
  - SettingsPageShell 공통 · settingsTypography 공통 CSS
  - LeavePage mode prop · leave-balance API
  - PermissionsPage 확장 (23개 페이지 권한)
- 관련 memory 파일 업데이트 필요

## ✅ 사용자 액션 완료 (2026-08-14 사용자 확인)

**SQL 실행 완료**:
- `migrations/add_employees_annual_leave_days_2026-08-12.sql` ✅
- `migrations/perf_indexes_leave_requests_2026-08-12.sql` ✅

## 📜 이번 세션 (2026-08-12) 완료 커밋 로그

### 안정화 (Critical + High 감사 fix)
- Leave 신청/승인 분리 + 잔여 배너 + 요청목록 승인 탭
- Critical/High 안정화 · POST 인증·리크·race·SSR·URL sanitize·StrictMode initializer
- 서류작성 분리 · 승인=사직서·경영=근계약서 · OcrPage/Scan/Arrival lazy · 코스트팜 tenant 문서
- 설정 API 인증 통일 (season-ranges·permissions·zone-groups)
- Handle Navigate pharmacist 타입 · BUSINESS_SUB_PAGES 정리
- 브라우저 supabase ReferenceError fix (process.env → import.meta.env)

### 프레임워크 · 설정 재구성
- 회사정보 페이지 신설 · ImageUploadField 공통 · 저작권 편집 제거
- 계절 정의 · MyPage → [설정] 이동 · 거래처 그룹 hideOnMobile
- 사이드바 폰트 +2 · chevron 크게 (CaretDown) · 아코디언 · 모바일 필터
- 브랜드 정보 → 회사정보 통합 · BrandingSettings 3섹션 탭 · QR 업로드
- 도장 파일 업로드 · PermissionsPage 페이지 목록 확장 (11→23개) · 폰트 조정
- 시스템 설정 페이지 (env 편집) · 7 카테고리 탭 · 마스킹 · 재시작 안내
- SettingsPageShell 공통 · [설정] 6개 페이지 UI 통일
- settingsTypography 공통 CSS · 폰트·입력·배지·버튼 통일
- 회사정보 + 앱브랜딩 통합 (중복 제거) · 사이드바 라벨 "회사·브랜드"

### 사이드바 정리
- 사이드바 하위 아이콘 = 그룹 아이콘 (공통헤더 톤 통일)
- 그룹 헤더 · 컬러 dot → 공통헤더와 동일 아이콘
- 로그인 정보 카드 (indigo · [이름] 만 · 배지 제거)
- 알림 ON/OFF · prefix 제거 · 여백 반
- 매장 그룹 정리 · 공급사·재고관리·상품스캔·상품도착·거래명세서 사이드바 항목 제거
- 매장구역 → 매장진열 라벨
- 구역 라벨 · 사이드바 제거

### 라우팅·페이지
- App.tsx handleNavigate pharmacist 포함 · Page union 확장
- 랜딩 · 연차 신청 → 승인요청 페이지 연결 (localStorage signal)
- 거래처 카드 lv9 관리자 노출
- PC 사이드바 접기 · localStorage 유지 · 헤더 SidebarTrigger

### 발주 관련 · Fix
- 발주 리스트 편집 수량 · 발주서 반영 (BUG FIX)
- 발주서 모달 폰트 +4 (모든 세션)
- 일괄 발주 · 공급사별 카드 → 한 리스트 + 공급사 그룹 헤더

### 사직서 · 스케쥴 정리
- ResignationWriterPage · SplitPanel 공통 컴포넌트 (좌우 폭 조절)
- Schedule dead code · 아이콘 7개 · 함수/변수 4건 삭제

### DB
- migrations/add_employees_annual_leave_days_2026-08-12.sql
- migrations/perf_indexes_leave_requests_2026-08-12.sql

---

## ❌ 취소된 항목
- **C** · StaffManagePage 오른쪽 상세 · EmployeeProfileCard 통합 (사용자 취소)
- **E Phase 2** · SplitPanel 미도입 페이지 이관 (사용자 취소)
- **에이전트 리서치 결과 추가 카테고리 8개** · 사용자 지시 "추가 카테고리 하지마"

---

## 세션 관리
- **원칙**: `docs/AGENT_PRINCIPLES.md`
- **임금**: `docs/PAYROLL_ALGORITHM.md`
- **contract-master**: `.claude/agents/contract-master.md`
- **메모리**: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
