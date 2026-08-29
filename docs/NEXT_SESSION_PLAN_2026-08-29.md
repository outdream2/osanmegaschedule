# 다음 세션 진행 계획 · 2026-08-29 마무리 시점

## 📊 이번 세션 · 총 로컬 커밋 34개 · Remote push 대기

---

## 🎯 5 조사 agent · 완료 · 근거 확보

### #122 · 시스템설정 목업 · Phase 1-6
- 현재 v2 준수 **70%** · Phase 1·4 낮은 위험 · Phase 5 사용자 확인 필요
- 진행 순서 · Phase 1 → 4 → 2 → 3 → 6 → 5
- 총 8h

### #154 + #165 · 판매중 필터·검색 확산
- 실제 확산 대상 · **6-8개 페이지** (30+ → 대폭 축소)
- Phase 1 · SaleStatusFilter · UnassignedProductsTab · ZoneMismatchTab (2h · 극저 위험)
- Phase 2 · ProductSearchInput · FlowTab · LandingPage::StockSearch (4h)

### #177 + #178 · 직군·직급·팀장
- **DB 마이그 불필요** · position/rank 컬럼 이미 존재
- **B안 확정** (사용자) · position별 팀장 · "물류팀장"·"약사팀장" 이미 등록
- Phase 1 · SettingsModal 탭 신설 (1-2h · 낮음)
- Phase 2 · 서버 검증 · position "팀장" 포함 시 유일성 (30m)

### #182 + #185 · 근로계약서·직원 연동 🔴 크리티컬
- **DTO 불일치** · `src/shared/dtos/employees.ts` vs `src/types.ts` vs `StaffManagePage/types.ts`
- **필드 손실 위험** · `working_hours_per_week`·`break_time_minutes`·`primary_focus` 등
- Phase A · DTO 일치화 (2-3h · 🔴 높음 · **최우선**)
- Phase B~E · 8-10h 총

### #186 · 상품상세 목업 · A안 추천
- Attio Sticky Hero + Section Stack · UI_MOCKUP_2026-08-21 톤 100% 일치
- `ProductDetailHero.tsx` 신설 · 60라인 · sticky top
- 4-6h · 회귀 낮음 (기존 ProductBasicInfoPanel 유지 · 감싸기만)

---

## 🎯 다음 세션 · 우선순위 (안전순)

### 1순위 · #182 Phase A · DTO 일치화 🔴
- **최우선** · 다른 태스크 · 편집 회귀 위험
- fresh 컨텍스트 · 정밀 진행 · 2-3h

### 2순위 · #178 서버 검증 (30m · 짧고 안전)
- POST/PUT `/api/employees` · position "팀장" 유일성
- position별 (물류팀장 · 약사팀장 · 진열팀장 등)

### 3순위 · #186 A안 · ProductDetailHero (4-6h · 낮은 위험)
- 사용자 명시 승인 · Attio Hero + Section
- 기존 API/훅 무영향 · UI 만 변경

### 4순위 · #177 Phase 1 · SettingsModal 탭 신설 (1-2h · 낮음)
- Phase A DTO 완료 후 · 안전

### 5순위 · #154 Phase 1 · SaleStatusFilter 확산 (2h · 극저)
- UnassignedProductsTab · ZoneMismatchTab

### 6순위 · #122 Phase 1·4 · 시스템설정 UI (2.5h · 낮음)
- 타이포 · Accent color

---

## 🔴 사용자 대기 · 미실행

- **Remote push** · 34 커밋 · 명시 지시 시 · `git push origin main`

---

## 📁 참조 파일

- `docs/SESSION_STATUS_2026-08-29_v2.md` · 이번 세션 종합
- `docs/PRODUCT_QUERY_STANDARD.md` · #170 표준
- `docs/MENU_STRUCTURE.md` · 최신 구조 (15차)
- `docs/FRAMEWORK_AUDIT.md` · 4 violations
- `docs/UI_MOCKUP_SETTINGS_SHELL_V2_2026-08-26.html` · #122 목업
- `docs/UI_MOCKUP_2026-08-21.html` · 프리미티브 표준

---

## 🎯 대원칙 준수 (memory)

- **회귀 절대 X** · `feedback_no_regression_top.md`
- **원본 테이블 우선** · `feedback_original_table_first.md`
- **프레임워크 필수** · `feedback_framework_mandatory.md`
- **탭 메뉴 · TabBar 프리미티브** · 목업 디자인 반영
- **Remote push · 명시 지시 시만** · `feedback_remote_push_strict_2026-08-28.md`
