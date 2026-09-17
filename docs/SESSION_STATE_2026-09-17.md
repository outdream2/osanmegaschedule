# 세션 상태 · 2026-09-17 (세션 재개용)

**목적** · 세션 끊겨도 다음 세션에서 이어서 진행 가능하게 · 현재 상태 · 남은 태스크 · 컨텍스트 모두 정리

> **최우선 참조 순서**
> 1. `~/.claude/memory/MEMORY.md` + `SOP_ALWAYS_READ_FIRST.md`
> 2. 이 파일 (`docs/SESSION_STATE_2026-09-17.md`)
> 3. `docs/TASKS.md`
> 4. `docs/CODING_PRINCIPLES.md`
> 5. `docs/TEST_LIST_2026-09-11_session.md`

---

## 📊 오늘 세션 커밋 (2026-09-17 · 총 13건)

| # | 커밋 | 내용 | 태스크 |
|---|-----|-----|-----|
| 1 | `2a1f44bf` | sync-agent README · Phase 3 완료 · 최신 기능 반영 | T-AUTO-IMPORT |
| 2 | `a02cf2dd` | #191 Phase C · VendorDetailModal + BorrowingDetailPanel · Modal 프리미티브 2건 | #191 |
| 3 | `62282df0` | 유통기한 임박 등록 상품 리스트 fix (SSOT 이중 저장 · toggleExpiry) | #36 후속 |
| 4 | `7dc5ca40` | 실재고확인 스캔 카드 · 코드↔상품명 스왑 · spec 중복 제거 · 왼쪽 진열구역 | 사용자 지시 |
| 5 | `f3473c2e` | 실재고 저장 실패 감지 강화 + inventory-checks-updated 이벤트 | 사용자 크리티컬 |
| 6 | `5eafb8ae` | docs/TASKS.md · 세션 반영 | 문서 |
| 7 | `780677f5` | RealStockTablePage · 상단 툴바 · 2줄 반응형 (좁은 화면) | 사용자 지시 |
| 8 | `1f407e9c` | 캐시 헤더 fix · borrowings 3 + returnRequests 2 · no-store | 리뷰 Top 1 |
| 9 | `c351e1dd` | 유통기한 임박 · products.expiry_date legacy fallback | 사용자 재보고 |
| 10 | `bbe690a4` | 발주이력 · 카드 레이아웃 재정리 + 상단 헤더·자동 정렬 + 상세 시각 구분 | #12·#14 |
| 11 | `32c86338` | devLog 유틸 도입 · App.tsx + useReextractCell (21건 치환) | 리뷰 Top 3 |
| 12 | `04e6a2f3` | purchase_details.expiry_date DATE 컬럼 · Phase B 서버 정합 · 3소스 통합 | #17 |
| 13 | *docs* | TASKS.md·MEMORY·SOP·CODING_PRINCIPLES·신규 memory 파일 2개 갱신 | 문서 대량 |

---

## 🎯 핵심 신규 대원칙 (오늘 등재)

### 📅 문자열에 날짜 저장 금지 (2026-09-17)
- text 필드에 "유통기한: YYYY-MM-DD" 같은 라벨+날짜 문자열 저장 X
- 정식 `DATE` / `TIMESTAMPTZ` 컬럼 사용 필수
- 발견 시 · 즉시 마이그레이션 (ALTER TABLE ADD COLUMN + UPDATE 파싱)
- 파일 · `~/.claude/memory/feedback_no_date_in_text_2026-09-17.md`

### 🗓️ 유통기한 · 3소스 UNION 통합 (2026-09-17)
- SSOT · `inventory_checks.expiry_date`
- Legacy 1 · `products.expiry_date` (임포트 시 자동 저장 · 사용 중단 방향)
- Legacy 2 · `purchase_details.expiry_date` (Phase A · DATE 컬럼 · 상품입고 검수 임박)
- GET `/api/products/expiry-imminent` · 3소스 UNION + MIN(expiry_date)
- 파일 · `~/.claude/memory/project_expiry_sources_2026-09-17.md`

---

## 🟡 pending 태스크 · 다음 세션 · 오래된 순

| # | 태스크 | 우선순위 | 스펙 |
|---|-----|-------|-----|
| **#4** | #191 Phase C · Hybrid panel/modal 3파일 (VendorPaymentPanel · SupplierTab.panels · ProductDetailPanel) | 🔴 스펙 확인 필요 | 실제 Modal 아님 · 데스크탑 패널·모바일 풀스크린 · A/B/C 옵션 결정 대기 |
| **#11** | 매장진열 · 창고1/창고2 → 매장구역도 탭메뉴로 이동 | 🔴 스펙 확인 필요 | 현재 이미 탭임 · 2단 탭 구조 원하는지 확인 필요 |
| **T-RSTP-TOOLBAR** | RealStockTablePage 상단 툴바 두 줄 (2026-09-17 완료 · 커밋 `780677f5`) | ✅ 완료 | - |
| **T-WAREHOUSE-TAB** | 창고1/2 페이지 → 매장구역도 탭 통합 (스펙 확인) | 🟡 P2 | 사용자 결정 필요 |
| **리뷰 Top 4** | 최근 7일 fix 회귀 테스트 (유통기한·저장 실패 감지 등) | 🟡 P2 | 대원칙 "테스트·fix 병행" 준수 |
| **리뷰 Top 5** | 서버 large-file 분리 · parse.ts (2997) · requests.ts (1442) · products.ts (1264) | 🟡 P3 | 별도 세션 계획 |

---

## 🧪 사용자 테스트 대기 (오늘 완료 항목)

**서버 재시작 필요** (Phase A DB 마이그 · Phase B 서버 코드 반영 후 첫 실행)

1. **유통기한 임박 리스트** · 3소스 통합 확인
   - 매입 > 유통기한 임박 탭 · 기존/신규/상품입고 임박 상품 모두 노출
   - 발주필요 우측 판넬 · 동일 리스트 노출
2. **실재고 저장** · 창고/매장 수량 입력 → 저장 → DiffTab·OrderManage 등 즉시 반영
3. **스캔 카드 UI** · 상품분류코드 상단 · 상품명 하단 · spec 중복 X · 왼쪽 최근스캔 · 진열구역 표시
4. **RealStockTable** · 좁은 화면 · 툴바 2줄 정상
5. **캐시 헤더** · borrowings·return-requests GET 응답 · `Cache-Control: no-store` 확인
6. **발주이력** · 헤더 정렬 클릭 asc/desc · 카드 · 발주번호 위·공급사 아래·발주일 26/9/11
7. **상품입고 유통기한** · 검수 임박 체크 · DB `purchase_details.expiry_date` 저장 (DATE 컬럼 · not verify_note)

---

## 🗂️ 문서 파일 · 관리 목록

| 파일 | 용도 | 최근 업데이트 |
|-----|-----|--------|
| `~/.claude/memory/MEMORY.md` | 메모리 인덱스 · 대원칙 파일 링크 | 2026-09-17 (오늘) |
| `~/.claude/memory/SOP_ALWAYS_READ_FIRST.md` | 종합 대원칙 · 매 세션 최우선 | 2026-09-17 (오늘) |
| `docs/CODING_PRINCIPLES.md` | 코딩 원칙 · 대원칙 A~E | 2026-09-17 (오늘) |
| `docs/TASKS.md` | 태스크 · 완료·대기·결정 필요 | 2026-09-17 (오늘) |
| `docs/TEST_LIST_2026-09-11_session.md` | 테스트 절차 · 항목별 확인 방법 | (오늘 추가 미반영 · 다음 세션) |
| `docs/MENU_STRUCTURE.md` | 프로젝트 구조 · 메뉴·페이지 매핑 | (변화 없음) |
| `docs/SESSION_STATE_2026-09-17.md` | 이 파일 · 세션 재개용 상태 | 신설 (2026-09-17) |
| `apps/sync-agent/README.md` | Electron 자동임포트 앱 매뉴얼 | 2026-09-17 (오늘 · Phase 3 완료 반영) |

---

## 🔴 사용자 결정 대기

- **#4 Hybrid Modal 3파일** · A(그대로) / B(새 프리미티브 MobileFullscreenPanel) / C(강제 마이그레이션)
- **#11 창고1/2 탭** · 이미 탭임 · 2단 탭 구조 원하는지 확인
- **#89·#90·#91·#92** · settings 파생 · 큰 리팩터 결정

---

## 🚫 열린 이슈

- **상품등록 404** (재현 확인 필요 · 사용자)
- **웹앱 서버 로그 한글 깨짐** · Node CP949 → chcp 65001

---

## ⏸ 외부 대기

- **#42** · 발주 PDF + 카카오톡 · SolAPI 사업자등록증 발급 대기
- **#115** · real_map DB DROP SQL · Supabase Editor 실행 대기

---

## 🧭 다음 세션 시작 시 · 순서

1. `~/.claude/memory/MEMORY.md` · `SOP_ALWAYS_READ_FIRST.md` 읽기
2. 이 파일 (`docs/SESSION_STATE_2026-09-17.md`) 읽기 · 오늘 완료 · 대기 태스크 파악
3. `docs/TASKS.md` · pending 태스크 오래된 순 진행
4. TaskList · pending/in_progress 확인
5. `git log --oneline -20` · 최근 커밋 확인
6. 사용자 대기 상태 · 위 "사용자 결정 대기" · "열린 이슈" 확인
7. 자율 진행 시 · 대원칙 A~E 준수
