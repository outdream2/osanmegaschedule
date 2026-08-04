# TASKS

**규칙** (사용자 지시 · 2026-08-04):
- 완료 태스크는 이 파일에서 **삭제** (아카이브 X)
- 새 태스크 발생 즉시 이 파일에 추가
- 세션 시작 시 반드시 이 파일 read (토큰 만료로 in-memory TaskList 유실 대비)
- 매 milestone (커밋·이슈 완료) 후 이 파일 update

**출처**: `MEMORY.md` 인덱스 · `project_task_status_2026-08-04.md` · `project_hr_contract_queue.md` · `project_arch_refactor_plan.md` · `project_purchase_tab_spec.md` · `project_purchase_history_ux.md` · `project_contract_essentials_research.md` · 사용자 메시지 (2026-08-04)

---

## 🔴 진행중

- (없음)

---

## 🟡 대기 · 우선순위 순

### 【안정성 · 보안】

### T37. JSON body parser 한도 축소 (DoS 방어)
- 현재 `server.ts` · `express.json({limit:"200mb"})` · 인증 전 단계에서 대용량 payload 로 OOM 유도 가능 (DoS)
- 작업: (1) 일반 API 10mb 로 축소 (2) 파일 업로드 라우터 (contracts·hrForms·invoiceImages·board) 만 별도 route-level 큰 한도 or multipart
- 예상 1~1.5h · 라우터 감사 필요

### T39. YOLO/OCR 모델 별도 서비스 분리 (OOM 방어)
- ONNX Runtime + PaddleOCR 로 메인 Node 서버가 상당 RAM 점유
- **부분 완료 · 2026-08-04**: 재고세기(YOLO) 라우터·loadStockCountModel 주석처리 완료 (사용자 요청)
- 남은 작업: PaddleOCR (layout_server.py) 는 별도 서비스로 분리 검토 · Render 배포 후 실측
- 예상 4~6h · **선행: Render 배포 실측 데이터 확보**

### T3. API 인증 미들웨어 · 서버단 세션·권한 검증 도입
- 원인: `PUT /api/schedules` · `DELETE /api/employees/:id` 등 민감 API 서버단 세션/JWT 검증 부재 · Postman 등으로 프론트 우회 가능
- 작업: 공통 `requireAuth` + `authorize(level)` 미들웨어 · 민감 라우터 적용
- 파일: `server/index.ts` · `server/middleware/auth.ts` (신규)
- 예상 2~3h · **주의**: 아키텍처 변경 크다 · 사용자 확인 후 진행

### 【인사·계약】

### T6. #29 근로계약서 조항 카테고리별 이해체크 재설계
- 매 항목 X · **카테고리별 하나씩** "위의 내용을 이해하고 동의함" 방식
- ClauseAck 시스템 재설계
- 예상 3~4h · 큰 리팩터

### (T16-T18 근로계약서 3건 · 완료 · 이미지 원본대로 유지)
- T18 서명란 · 이미 갑/을 인적사항 완전 (주민번호·성명·주소·전화·계좌·이메일)
- T16 휴게시간 · breakStart/breakEnd 필드 추가 (선택 입력) · UI 편집기 · 표 그대로 유지
- T17 근로일별 표 · **사용자 지시 "이미지대로" · single-row 유지** · 알바용 별도 표 미추가

### T36. RawOcrTable 헤더 정렬 추가 (T34 audit)
- OcrPage/RawOcrTable · 3개 하위테이블 (발주·재고·손실액) · 정렬 없음
- 파일: `src/components/OcrPage/RawOcrTable.tsx:3169+`
- 예상 1~1.5h

### T19. 근로계약서 · 구글드라이브 저장 (#33)
- DB 저장 + 구글드라이브 이중 저장 · OAuth Service Account · Google Drive API
- 예상 4~6h · 인프라 큰 작업
- 선행: 사용자가 OAuth 준비 · Render 환경변수 (아이템 O)

### T8. #163 직원목록 컬럼 확장 (StaffManagePage)
- 컬럼 4개 추가: 근로계약서(보기 버튼) · 계약유형 · 근속기간 · 인사평가
- 우측 상세 모달 · 위 4개 반영
- 예상 3h

### T9. #164 각종 양식 페이지 (신규)
- 근로계약서·사직서 등 템플릿 CRUD · Supabase Storage
- DB: `hr_forms` 테이블 신규
- 예상 4h · 선행: 사용자가 테이블 생성 (아이템 N)

### T21. 직원등록 · 이력서 업로드 + [이력서 보기] 버튼 (#45)
- 사용자 재요청 (2026-08-04): 직원등록시 업로드 · 조회시 [이력서] 버튼
- DB: `employees.resume_url` 컬럼 · Supabase Storage bucket
- 예상 2~2.5h · 선행: 사용자 SQL 실행 (아이템 L)

### ~~T31. 직원상세 · 근무타입 옆 계약타입 표기~~ ✅ 이미 구현
- `StaffManagePage.tsx:1398-1434` · 직책 → 계약유형(autoContractBadge) → 근무타입(schedule_type) 순 배치

### T32. 연차내역 통합 UI · 평가·코멘트 저장 (연차승인 부분과 연동)
- 부분 완료: usedLeaves 렌더 · performance_rating · employees.memo 산발적 존재
- 남은 작업: 통합 UI · 승인부분과 연동
- 예상 2h

### 【매입 · 재고】

### T14. 매입 서브탭 · Phase 3 ScanPage 확장 · DB 스키마 (창고1/2·매장1/2/3)
- inventory_checks · warehouse1/2·store1/2/3 컬럼 (or JSON) 추가
- products.real_map 확장 · 매장별 구역
- 예상 3~4h · 선행: 사용자 SQL 실행 (아이템 M) · 하위호환 필수

### T15. 매입 서브탭 · Phase 4 구역 연동 UI
- ScanPage · 매장1/2/3 아래 구역 드롭다운 · real_map 연동
- 예상 1~2h

### T11. #167 결제정보 서브탭 확장 (PaymentInfoTab)
- 현재 재고잔고 KPI 명확화 · 상품별 매입이력 그루핑
- 예상 2h

### T23. 매입이력 UX · Phase A~C (좌 카드+우 KPI+탭 3개)
- Phase A: 좌측 vendor 카드 (스파크라인·SKU수) 1.5h
- Phase B: 우측 상단 정보+KPI 2h
- Phase C: 우측 하단 탭 3개 (원장·집계·추이) 2h
- 총 4~6h · 스파크라인 virtualize · RPC N+1 통합

### 【약사·기타 UI】

### T20. 약사전용 재구성 (#43 · 사용자 재요청 2026-08-04)
- 좌측: 카테고리 + 하위메뉴 등록
- 우측: 매칭된 PDF만 표시 (현재 하위메뉴 리스트, PDF는 모달)
- 큰 재구조 · 예상 4~5h

### 【리팩터 · 성능】

### T24. 아키텍처 리팩터 · P1 즉시 (dead code) · **에이전트 위임 금지**
- 이전 시도: dead-code-auditor 에이전트가 SalesTrendPage 오편집 (LossTrackerTab · 다른 모듈에서 참조 중인데 삭제 시도) · 종료됨
- 재시도: **수동 진행 필수** · 각 파일별로 grep으로 참조 확인 → 삭제 → TS+build 검증
- 대상: InventorySalesPage (orphan · 실제 확인 필요) · dead exports (사용여부 재확인)
- 예상 1~2h · 각 단계 강제 verification

### T25. 아키텍처 리팩터 · P2 (공용 훅 · 폴더 이동)
- useVendors 공용 훅 (12곳 중복 통합) · DisplayPage 스케줄 fetch 훅 분리 · Trending·Category·Order 폴더 이동
- 예상 2~4h

### T30. 공통 CSS 리팩터 · 잔여 검증
- 공통 컴포넌트 16개 · 대부분 마이그레이션됨 (Modal · SplitPanel · TabBar · ListLoading 등)
- 세부 페이지 잔여 항목 검증 · 사용자 재요청 (2026-08-04)
- 예상 1~2h

### T34. 헤더 자동 정렬 · 전체 리스트 검증
- 사용자 원칙 (feedback_ui_principles) · 모든 리스트 · 헤더 클릭 asc/desc 토글 · 활성 컬럼 화살표 표시 · 예외 없음
- 검증 대상: OrderManagePage · StaffManagePage · 모든 테이블
- 예상 1~2h

### T26. select('*') → 명시적 컬럼 (20개 파일)
- Supabase 쿼리 최적화 · payload 40~70% 감소
- agent 위임 가능 · 예상 1.5~2h

### T27. TanStack Query 도입 (재고관리 페이지부터)
- 페이지 재방문 <50ms · 캐시 히트 · 체감 5~10배
- 예상 2h

### T28. Brotli 압축 + shrink-ray-current
- gzip → Brotli · 청크 크기 추적
- 예상 0.5h

### T29. @tanstack/react-virtual + TanStack Table (StockManage)
- 가상 스크롤 + 고급 테이블 · 초기 페인트 2~5초 → 100~200ms
- 예상 3~4h

---

## 🚧 사용자 액션 대기 (BLOCKED BY USER)

| # | 항목 | 필요 액션 |
|---|------|---------|
| J | `pharmacist_menu_items` 테이블 · `pharmacist-materials` 버킷 | Supabase 대시보드 · SQL + 버킷 생성 |
| K | `vendors` 오학습 정리 (page 6 · 5848801771 → 앤바이오) | Supabase 대시보드 · vendors 직접 수정 |
| L | `employees.resume_url` 컬럼 (T21 전제) | Supabase SQL: `ALTER TABLE employees ADD COLUMN resume_url TEXT;` |
| M | `inventory_checks` 스키마 확장 (T14 전제) | Supabase SQL · warehouse1/2 · store1/2/3 컬럼 |
| N | `hr_forms` 테이블 + Storage bucket (T9 전제) | Supabase 대시보드 |
| O | OAuth Service Account (T19 · 구글드라이브 전제) | Google OAuth 설정 · Render 환경변수 |

---

## 우선순위 흐름 (권장)

1. **다음**: T3 인증 미들웨어 (사용자 확인 필요 · 아키텍처 큼) or T6 조항 이해체크
2. **법규 필수**: T16 (휴게시간) → T17 (근로일별 시간표) → T18 (서명란)
3. **인프라 (사용자 준비 후)**: T14 매입 Phase 3 · T21 이력서 · T9 양식 · T19 구글드라이브
4. **성능 · 리팩터** (큐 완료 후): T24 → T26 → T27 → T28 → T30 → T25 → T29

---

## ✅ 이번 세션 완료 (다음 갱신 시 삭제)

- (없음)
