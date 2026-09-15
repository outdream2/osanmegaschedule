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

---

> 2026-09-15 · **8 로컬 커밋** · 탭바 전역 정렬 fix · #39 Phase A+B (발주 라이프사이클 · OrderInProgressCard + 지연 tier) · T-SP-BULK (POST bulk shelf_positions 병합 · 22 tests) · #61 B안 (지정위치 정합성 · products.spec 완전 제거 · 상품↔실재고 자동 연동) · DB 정합성 절대 유지 대원칙 등재
> 2026-09-10 · 대량 완료 · #35·#37·#38·#40·#41·#42·#45·#46·#49·#51·#57·#58·#59·#60·#62·#65·#66·#67·#69·#71·#72(부분)·#73(부분) · 결제탭 전면 개편 · 재고자산/잔고 확정 공식 · 신규 API 4종
> 2026-09-08 · T-SP 세트 14커밋 · inventory_checks.shelf_positions JSONB · T-DISPLAY-1 · #12 · #13 · T-MENU 완료
> 2026-09-07 · #115·#117·#119·#120·#121 · expiry_date 버그 · 가격재고 4-col · 이슈리스트 PC 한줄
> 2026-09-06 · LIST-UI-2026 전역 폰트 +2px (30+ 커밋) · SplitRightHeader·SplitRightLoading 신설 · 프레임워크 100% 클린
> 2026-09-05 · RawOcrTable·PurchaseHistoryTab large-file-warn 제거 · audit 위반 0/790 100% 클린
> 2026-09-04 · 공급사재고 전용 페이지 · 스케줄표 모달 탭 · contract_type Zod strip 수정
> 2026-09-02 (오후 자율) · 30+ 커밋 · 카드 결제 시스템 · 거래처 로그인 · 발주 flow 3중 fix
> 2026-09-02 · 14 커밋 · 4 신규 프리미티브 · 11 미사용 삭제 · 판매대시보드 차트 7종
> 2026-09-01 · 서버 프레임워크 감사 완료 · validateBody+authorize 32건 · 55→23 위반 (58% 감소)
> 2026-08-29 · #193·#196·#198·#200·#197 · 22 로컬커밋 · MENU_STRUCTURE 15차
> 이전: 2026-08-18~08-23 · Framework Phase 4 · 리모트 push 6회 완료 · test 2514+
>
> **원칙 규칙**: 완료 태스크는 삭제 · 신규 태스크는 상단 등록 · 진행중은 명확히 표시

---

## 🎯 활성 PENDING (2026-09-15 기준)

### 🔴 대원칙 (확정)

- **재고자산 = 매입액 − 판매원가** (cogs)
- **실제잔고 = 매입액 − 결제액**
- **판매액 = 판매수량 × 판매단가** (xlsx total_amount 합계 컬럼 절대 사용 금지)
- **공급사 이름 · vendors 유효성 검증 필수** (자유 입력 금지 · POST/PATCH /api/products 에서 400 SUPPLIER_NOT_FOUND 반환)
- **공통 기능 = 단일 endpoint** (2026-09-14 사용자 명시) · 같은 목적 route 중복 금지 · 신규 전 grep 필수
- **DB 정합성 절대 유지** · `feedback_db_integrity_absolute_2026-09-15.md` · 파괴적 SQL X · 스냅샷 파생 X · 마스터 참조 무결성 · UNIQUE 이중 방어 · SSOT

### 🟡 PENDING · v14 잔여

| # | 태스크 | 우선순위 | 비고 |
|---|-----|--------|------|
| **#56** | 매장 구역 추가/제거 · X 버튼 권한 | 🟢 P4 (LATER) | 맨 뒤 우선순위 |
| ~~**T-PROD-LABEL**~~ | ✅ 완료 · 왼쪽 리스트 · 한글 라벨 텍스트 · 상품명·코드·공급사·카테고리·적정재고·현재고 · `0860dc7f` (2026-09-15) | — | — |

### 🟡 PENDING · v13 잔여

| # | 태스크 | 우선순위 | 비고 |
|---|-----|--------|------|
| **T-SP-9-REST** | 진열위치 뱃지 확산 · ExpiryImminentTab · ZoneProductsModal 완료 · 나머지 (CategoryTab·CriticalTab · location 표시 없음 · SalesTrendPage·FlowTab hidden 모달 · 실무 임팩트 미미) | 🟢 P3 (완료) | `5513c8d4` (ExpiryImminentTab) + `4af7a227` (ZoneProductsModal) |
| **T-SP-MASTER-UI** | 매장·창고 마스터 관리 UI (매장4·5 추가) | 🟢 P3 | 현재는 KV JSON 직접 편집 · 관리자 페이지 필요 시 |

### 🟡 PENDING · v12 잔여

| # | 태스크 | 우선순위 | 비고 |
|---|-----|--------|------|
| **#115** | real_map 컬럼 DB DROP SQL 실행 · `migrations/20260904_drop_real_map.sql` · Supabase SQL Editor | 🟡 | 사용자 직접 실행 |

### 🟡 PENDING · 대형 백로그

| # | 태스크 | 우선순위 | 비고 |
|---|-----|--------|------|
| **#253** | 자동 임포트 · **Electron 앱** (apps/sync-agent) · 진행 중 · 테스트 단계 | 🔵 진행 | Phase A (서버) + Phase E (웹 UI) 완료 · Phase B (Electron) · 사용자 테스트 병행 (2026-09-15) |
<!-- 2026-09-15 · #193 Phase 2 · 완료 확인 · 이미 wiring 완비 · server/lib/optimalStock.ts L184-187 KV 조회 · OptimalStockPeriodSection.tsx L112-121 setDays → runRecalc 자동 · 3 이벤트 dispatch → 9 파일 리스너 자동 반영 -->
| **#149** | large-file 분리 잔여 · OcrPage(1215)·PaymentInfoTab(1513)·OrderManagePage(3089)·LandingPage(2319)·ContractWriterPage | 🟢 P3 | Framework Phase 4 잔여 |

### 🔲 다음 진행 대기 (승인·지시 대기)

| # | 태스크 | 대기 사유 |
|---|-----|--------|
| **#107·#258** | 발주 리스트 프리미엄 UI (GroupedListPanel v3) | 목업 승인 완료 · Phase 2 구현 대기 |
<!-- 2026-09-15 · #253 · Python 방식 폐기 · Electron 앱으로 전환 · apps/sync-agent · 진행 중 (위 표 참조) -->
| FlowTab·LossHistoryTab·DiffTab | 컬러 bg 정리 (대량) | 승인 후 순차 |
| **#254~#256** | 세션 보안 강화 · 중복 로그인 방지 · 강제 로그아웃 | 대형 · 별도 세션 |
| **#191 Phase C** | Modal 프레임워크화 · panel/modal 이중 (VendorDetailModal·VendorPaymentPanel·BorrowingDetailPanel·SupplierTab.panels·ProductDetailPanel) | 고위험 · 사용자 승인 후 · Phase B 완료 (`04935b7b`) |

### 🔴 사용자 결정 필요

| # | 태스크 | 결정 사항 |
|---|-----|--------|
| **#89** | DayTimelineModal · settings.positions 자동 파생 | 하드코딩 3 그룹 → settings 순회 여부 |
| **#92** | 회사·브랜드 페이지 · 완전 통합 (5탭 → 1페이지) | 통합 여부 |
| **#90** | ContractWriterPage · JOB_CATEGORIES → wageRates 파생 | ContractCategory strict union 광범위 변경 · 재결정 필요 |
| **#91** | SchedulePage · position 문자열 매칭 → settings | 탭 유지 vs 직군 순회 vs 하이브리드 |
| **매입이력 검색** | "테스트" vendor · 매입이력 없음 · 클라이언트 union 표시 or 그대로 | 사용자 결정 대기 |

### 🚫 열린이슈 · 확인 대기

- **상품등록 404** · 네트워크 탭 URL 확인 필요 (서버 재시작 후 재현 여부)
- **터미널 한글 깨짐** · Node 프로세스 CP949 고정 · `chcp 65001` or CC 재시작

### ⏸ 외부 대기

- **#42** · 발주 PDF + 카카오톡 · 사업자등록증 발급 대기 (SolAPI)

---

## 🔵 진행 중 · #253 · Electron 자동 임포트 앱 (2026-09-15)

**위치:** `apps/sync-agent/`

### ✅ 완료된 기능
- Electron v33 + electron-vite + electron-builder 셋업
- 트레이 상주 · 부팅 자동 시작 · 하이브리드 UI (D안 · 좌·우·더블 클릭)
- 로그인 · 핸드폰번호 + JWT 쿠키 인증 · 자동 refresh (15분 → 30일)
- **아이디 저장** · 다음 실행 자동 채움 · savedPhone
- 폴더 지정 UI · 3 파일 (상품·재고·매입)
- **파일 감시 모드 (chokidar · 기본)** · 새 xlsx 파일 감지 · 10분 debounce · 자동 임포트
- **스케줄 모드** (선택) · cron 프리셋 (매 5분·1시간·매일 08:00 등)
- 두 모드 상호배제 · Settings 라디오 · UI 자동 비활성
- 최신 파일 감지 · 파일명 날짜 (YYYY-MM-DD) 우선 · fallback mtime
- `_processed`·`_failed` 폴더 자동 관리 · 재시도 성공 시 `_failed → _processed`
- 임포트 · 웹앱 endpoint (`/api/upload-{products|stock|purchase-details}`) · octet-stream + managerId·snapshot_date 등 자동 파라미터
- 로컬 큐 (JSON) · 지수 백오프 재시도 · 5xx·429·network 오류
- 데이터 카운트 표시 · '상품 6287개 · 복원 7049개' 등
- Windows toast 알림 · 트레이 상태 색상 (idle·syncing·success·error)
- 자동 업데이트 · electron-updater · GitHub Releases
- Logs 탭 · 실행 이력 · 폴더 상태 (대기·처리됨·실패 카운트) · 재시도 큐 시각화
- Copyright footer · IRUMs · (주)이룸즈

### 🧪 사용자 테스트 병행 (진행 중)
- 로그인 · 핸드폰번호 정상 작동 확인
- 상품 임포트 성공 (`count: 6287, restored: 7049`) 확인됨
- 파일 감시 모드 · 실제 xlsx 저장 시 · 10분 후 자동 임포트 · 대기 중
- Google Drive 폴더 사용 · 인식 정상 확인

### 🔲 남은 작업 (배포·안정화)
- 실 배포 · installer 재빌드 후 · 사용자 설치 테스트
- 서버 endpoint 응답 형식 재검증 (실제 서버 응답 vs 파싱)
- 스케줄 모드 · UI 사용자 테스트
- README · 사용자 매뉴얼

---

## 🛡️ Spring Security · defer 확정 (2026-08-16)

- ✅ S5 Audit · S7 Input Validation · S10 Refresh Token
- ⏸ S1/S2/S6/S8/S9 · defer
- ❌ S3/S4 · 취소

## 🚨 백엔드 보안 · 잔여 (#112)

1. ✅ `/api/auth/set-password` · `authorize(9)` 추가 (`9d53756f`)
2. 🔲 Vendor 로그인 · bcrypt 전환 또는 사용자 정책 재확정 (사용자 결정)
3. ✅ requireAuth 재활성화 · 서버 마운트 완료 (2026-08-16)
4. ✅ tsconfig.json exclude 정비
5. ✅ Supabase 부팅 크래시 · warn 격하
6. ✅ 100MB JSON limit · route-level

---

## 📋 세션별 완료 요약 로그

### 2026-09-15
| 커밋 | 내용 |
|-----|------|
| `a576ea27` | 탭바 전역 정렬 fix · 초광폭 밀림 해소 |
| `2277a8a2` | #39 Phase A+B · 발주 진행중 카드 + 지연 tier · 업계 표준 |
| `b86a4b20` | T-SP-BULK · POST bulk shelf_positions 병합 · 22 tests |
| `a75958da` | #61 B안 · 지정위치 정합성 · products.spec 제거 · 상품↔실재고 자동 연동 |
| `8a987279` | DELETE /api/products · DB 정합성 · 회계 이력 차단 + orphan cleanup |
| `596108af` | T-MENU-BOTTOMNAV · BottomNav perms.hidden 필터 추가 |
| `5513c8d4` | T-SP-9-REST · ExpiryImminentTab 진열위치 뱃지 확산 |

### 2026-09-13 ~ 09-14
| # | 태스크 | 커밋 |
|---|-----|------|
| **#20** | 상품 모달 창고·매장 수평 배치 | `bb3c2647` 확인 |
| **#36** | 유통기한 임박 SSOT | `d4a2d823`+`a698b4fe` |
| **#44** | 매장구역도 저장 오류 | `f64ffbd7` |
| **#47** | 결제-차용 약국 사업장 자동 | `9f4f80c0`·`935a5957`·`b58a6295` |
| **#48** | 상품검색 최근 검색어 3개 | `a0025044` |
| **#50** | 승인요청 페이지 UI 통일 | `84078012`·`afe7f6f5`·`0b29dedd`·`7dec1c36` |
| **#52·#54** | 이벤트 관리 UI | `5434854d` |
| **#53·#55** | 발주필요 배너 | `bc097349`·`c65e7310` |
| **#63** | 공급사 이름 무결성 | `62e3830e` |
| **#64** | 상품정보 편집 모달 PATCH | `33628f2f`·`49c93f99`·`89fd973c` |
| **#68** | 공급사별 결제내역 검색창 통일 | `033890ed` |
| **#70** | 공급사별 결제내역 Spinner | `a698b4fe` |
| **#72·#73** | 재고자산·판매액 SSOT 감사 | `5ae4339a`·`cae5d072`·`7b79d5b0`·`19382a81`·`1cbbb722` |

### 2026-09-10
| 커밋 | 내용 |
|-----|------|
| `1bede008` | #64·#65·#67 · ProductCreateModal 편집 모드 · 잔고 셀 색상 |
| `9de3de02` | #69·#70 · 판매내역 상품별 aggregate |
| `c4cce17b` | #66 · 월별 판매액 실제 연결 |
| `2bcaa825` | #71 · 결제탭 통합 툴바 |
| `1ed40cae` | #72(부분) · 재고자산·잔고 확정 공식 + supplier-balances-map |
| `1cbbb722` | #72·#73 · 판매액=sale_qty×sale_price |
| `19382a81` + `7b79d5b0` | #73 · topSales·snapshotSummary 판매액 fix |
| 이전 커밋들 | #35·#37·#38·#40·#41·#42·#45·#46·#49·#51·#57·#58·#59·#60·#62·#65·#66·#67 |

### 2026-09-08 (T-SP 세트 · 14커밋)
| 커밋 | 내용 |
|-----|------|
| `6e67a551` | T-SP-1·2·3 · shelf_positions JSONB · KV storage_locations |
| `d7a2712e` | T-SP-4·6 · 자동배정 + 프리미티브 3종 |
| `14db14d7` | T-SP-7 · ProductInfoPage 상세 진열위치 섹션 |
| `b6e70ae3` | T-SP-8 · InventoryEditPanel zone stepper |
| `3ab74edb`+`4a9820d5` | T-SP-9 · shelf-positions-map API + 6개 파일 뱃지 |
| `b503c640` | 백필 fix · 판매중 상품만 자동배정 |
| `7d8f0cca` | 상세위치 중복방지 · (display_location, location_detail) 유일 |
| `61f663d2` | #14 · UI 실시간 중복 검증 + GET /api/inventory-checks/shelf-conflict |
| `393390ce` | #12 · 매장구역도 14×8 rectangular grid |
| `d14e7bb4` | 승인요청 통합 · 사직서승인 탭 · 5개 탭 permission gate |
| `c48d3d26` | T-MENU-1 · TodayStatusPanel permission gate 통합 |
| `48281a30` | #13 · 카운터존 EVENT 라벨 |
| `18373232` | 판매대시보드 · 판매중 상품만 · 미지정구역 fix |

### 2026-09-07
| 커밋 | 내용 |
|-----|------|
| `03d4a1f3` | arrivals currentStock null→0 |
| `b3fb1e48` | 알림종 버그 수정 · 상품정보 UI 개편 |
| `b1ee07f3` | 가격재고 4-col stat grid |
| `072aedb7` | expiry_date 버그 · 유통기한 임박 탭 · 검수완료 등록 |
| `7b9ad077` | #116 · supplier_name 필터 서버측 |

### 2026-09-06
| 커밋 | 내용 |
|-----|------|
| `c8b7b547` | #261 · SplitRightHeader + SplitRightLoading 신설 |
| `c03965cb`+`30b29655` | LIST-UI-2026 +2px global 전체 완료 |
| `c7cb2635` | audit 위반 0/790 · 100% 클린 |

### 2026-09-05 ~ 09-04
| 커밋 | 내용 |
|-----|------|
| `a92cf530` | #73 matchHangul→matchesProductQuery 통일 |
| `97458c9a` | 공급사 모달 즉시닫힘 버그 2건 · 사이드메뉴 관리자 노출 |
| `4fa30090` | 발주요청 항목 발주필요 숨김 · bulk-send 미전송 시 ordered 마킹 금지 |
| `7adf338e` | 공급사재고 전용 페이지 VendorStockPage |
| `732a69fa` | contract_type HR 필드 PUT Zod strip 수정 |
| `0f49a8a7` | 스케줄표 모달 탭 순서 · 스케줄설정 페이지 |

### 2026-09-02 ~ 09-01 (원격 push 이전)
- `9d78457e` · 서버 프레임워크 감사 100% 완료 (리모트 push 이후 금지)
- 2026-09-02 · 14 커밋 · 4 신규 프리미티브 · 11 삭제 · 판매대시보드 차트 7종
- 2026-09-02 오후 · 30+ 커밋 · 카드결제 · 거래처로그인 · 발주 flow fix

### 2026-08-29 (원격 push 이전 마지막 대량)
- `c8c198c3` 이후 · 리모트 push 사용자 명시 재요청만
- #193·#196·#198·#200·#197 · 22 로컬커밋 · purchase_details 통합 · MENU_STRUCTURE 15차

### 2026-08-18 ~ 08-28
- Framework Phase 4 · large-file 분리 · test 2514+ · 리모트 push 6회 (사용자 승인)
- #151~#175 · Spinner/Card/Modal/SplitPanel/SplitListPanel 프리미티브 확산
- 마지막 리모트 push `013920a` (2026-08-18) 이후 · 원격 push 금지

---

## ⚙️ Framework 현황 (2026-09-06 기준)

- **audit 위반**: 0/790 (100% 클린)
- **large-file warn**: 완전 탈출
- **test**: 3355/3355 통과 (2026-09-14)
- **프리미티브**: 43+ (Card·Modal·Spinner·SplitPanel·SplitListPanel·SearchBar·StatusPill·CategoryChips·ListPanel·ListRow·ShelfPositionInput·ShelfPositionsBadge 등)

### 잔여 large-file 대상 (별도 세션 · P3)
| 파일 | 현재 줄 |
|------|---------|
| OcrPage | ~1215 |
| PaymentInfoTab | ~1513 |
| OrderManagePage | ~3089 |
| LandingPage | ~2319 |
| ContractWriterPage | 2680+ (critical) |

---

## 📋 세션 관리

- **프레임워크 원칙**: `src/components/common/README.md`
- **원칙 규칙**: `docs/AGENT_PRINCIPLES.md`
- **임금 계산**: `docs/PAYROLL_ALGORITHM.md`
- **메모리**: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
- **테스트 리스트**: `docs/TEST_LIST_2026-09-11_session.md`
