# TASKS

**규칙** (사용자 지시 · 2026-08-04):
- 완료 태스크는 이 파일에서 **삭제** (아카이브 X)
- 새 태스크 발생 즉시 이 파일에 추가
- 세션 시작 시 반드시 이 파일 read (토큰 만료로 in-memory TaskList 유실 대비)
- 매 milestone (커밋·이슈 완료) 후 이 파일 update
- **결정 대기 항목** (사용자 답변 필요) 도 이 파일에 포함 · 결정 완료 시 삭제

---

## 🚨 결정 대기 · 사용자 답변 필요 (2026-08-05)

### 진열요청 재설계 (Phase 1 시작 블로킹)

**페이지·UI**
1. **리스트 페이지 위치** · 매장관리 > 진열요청 서브탭 (UI 에이전트 추천 A안) OK?
2. **페이지·탭 이름** · "진열요청" · "진열준비" · "진열관리"?

**ScanPage 진입점**
3. **요청 버튼 위치** · 각 행 `[📅 History] [📢 요청] [🗑 삭제]` 순 OK?
4. **부족재고 자동 하이라이트** · 매장 수량 0 시 amber 강조 · 원함?
5. **부족재고 판별 기준** · 0? 임계값? 창고>0+매장=0?
6. **다중 선택 후 일괄 요청** · 하나씩만 (1단계) or 처음부터 checkbox?

**역할 판별**
7. **물류(창고) 직원 판별** · `position ∈ {창고, 물류}`? level 기반?
8. **진열 담당자 판별** · `position ∈ {진열, 매장}` + zone_assignments 매핑?
9. **관리자 강제 전환** · level≥8 · 모든 상태 되돌리기 허용?

**알림**
10. **알림 대상**:
    - pending → 창고담당 전원?
    - prepared → 해당 구역 진열담당?
    - done → 요청자·관리자?
11. **알림 채널** · 웹푸시 · DB notifications · 소리?

**데이터·정책**
12. **note 필드** · ScanPage 요청 시 · 자유 입력 or 자동 (예: "매장1 부족")?
13. **category 필드** · 상품별에서 유지? · 상품의 category 자동 채움?
14. **done 자동 정리** · 기존 7일 유지 OK?

### 근로계약서 재설계 (구현 블로킹)

15. **일반사원 계산 방식**:
    - a) 희망 세후 수령액 → 근무시간 → 시급 역산
    - b) 시급 입력 (약사와 같은 방식 · 다른 default)
    - c) 월급 직접 입력 → 임금구조 분할
16. **역산 시간 상수** · 이미지 원본 값 (기본급 209h · 연장 55.94h · 휴일 22h · 연차 10h) 고정 OK?
17. **약사 default 시급** · 주중 35,000 · 주말 40,000 · 저장 방식 (localStorage · settings 테이블 · 코드 상수)?
18. **세후 계산 · 부양가족 수** · default 1명 · 편집 가능?
19. **오른쪽 프리뷰** · UI 에이전트 자율 재디자인 or 방향 지시 (카드형·문단형·이미지 유지)?
20. **임금 세분화 8항목** · 그대로 유지 · 성과급/상여금 추가?
21. **알바/단시간** · T17 리서치 결과 (근로일별 표) 자동 표시?
22. **수습기간** · 감액률 90% 조항 자동 추가?

### 큐 대기 (이전 요청)

23. **ScanPage 반응형 wrap** · 창고1/2 아래 매장1/2/3 세로 배치 · 몇 breakpoint 부터?
24. **BarcodeScanner 제목 가로** · 어느 화면? 세로로 보이는 이유? 원하는 형태?

### 진행 순서 선택

25. **A. 진열요청 먼저** · Phase 1 서버 → Phase 2 ScanPage → Phase 3 리스트
26. **B. 근로계약서 먼저** · UI 상의 → 폼 재구현 → 프리뷰 재구성
27. **C. 병행** · 근로계약서 UI 상의는 백그라운드 · 진열요청 구현 병행

**필수 블로킹 최소 답변**: (1) 위치 · (10) 알림대상 · (15) 일반사원 계산 · (19) 프리뷰 방향 · (25-27) 진행순서

---

## 🟢 진열요청 재설계 · **전체 완료** (2026-08-05)

- StoreMap [진열요청] 버튼 제거 ✅ (`8c8f515`)
- Phase 1 서버 API ✅ (`b86f352`) · POST 확장 · PATCH /prepare · PATCH /complete
- Phase 2 ScanPage 진입점 ✅ (`d3a6504`) · 각 행 [📢 요청] · amber 강조
- Phase 3 리스트 페이지 ✅ (`7b5bc97`) · 매장관리 > 진열요청 · 구역별 그룹 · 플로우 스텝퍼

## 🟢 근로계약서 재설계 · **전체 완료** (2026-08-05)

- Phase A · 시급 DB 설정 · 이미 SettingsModal 에 존재 (재활용)
- Phase B ✅ (`5ad8ecc`) · useSettings 통합 · 직급 기본 시급 자동 로드 · 세후 실수령액 계산
- Phase C ✅ (`1aac2ff`) · 프리뷰 하이브리드 · 문단형 전환 · VerticalLabel 폐기 · PDF 안정성 (fixed hex · page-break-inside)

---

## 🟡 대기 태스크 · 우선순위 순

### 【안정성 · 보안】

### T37. JSON body parser 한도 축소 (DoS 방어)
- 현재 `server.ts` · `express.json({limit:"100mb"})` · 인증 전 단계 대용량 payload OOM 유도 가능
- 작업: 일반 API 10mb 로 축소 + 파일 업로드 라우터만 route-level 큰 한도 or multipart
- 예상 1~1.5h · rate-limiter 도입 검토

### T39. YOLO/OCR 모델 별도 서비스 분리 (OOM 방어)
- **부분 완료 · 2026-08-04**: 재고세기(YOLO) 라우터 주석처리 완료
- 남은 작업: PaddleOCR 별도 서비스 분리 검토 · Render 배포 후 실측
- 예상 4~6h · **선행: Render 배포 실측 데이터**

### T3. API 인증 미들웨어 · 서버단 세션·권한 검증
- 원인: 민감 API (PUT/DELETE) 서버단 세션/JWT 검증 부재
- 작업: `requireAuth` + `authorize(level)` 미들웨어 · 민감 라우터 적용
- 예상 2~3h · **주의**: 아키텍처 변경 크다

### 【인사·계약】

### T36. RawOcrTable 헤더 정렬 추가 (T34 audit)
- OcrPage/RawOcrTable · 3개 하위테이블 정렬 없음 (dynamic OCR 컬럼 · 복잡)
- 파일: `src/components/OcrPage/RawOcrTable.tsx:3169+`
- 예상 1~1.5h · deferred

### T19. 근로계약서 · 구글드라이브 저장 (#33)
- DB + 구글드라이브 이중 저장 · OAuth Service Account 필요
- 예상 4~6h · 선행: 아이템 O (OAuth 준비)

### T9. #164 각종 양식 페이지 (신규)
- 근로계약서·사직서 등 템플릿 CRUD · Supabase Storage
- 예상 4h · 선행: 아이템 N (테이블 생성)

### T21. 직원등록 · 이력서 업로드 + [이력서 보기]
- 사용자 재요청 (2026-08-04)
- 예상 2~2.5h · 선행: 아이템 L (SQL 실행)

### 【매입 · 재고】

### T14. 매입 서브탭 · Phase 3 ScanPage 확장
- inventory_checks · warehouse1/2·store1/2/3 컬럼 추가
- 예상 3~4h · 선행: 아이템 M (SQL) · 하위호환 필수

### T15. 매입 서브탭 · Phase 4 구역 연동 UI
- ScanPage · 매장1/2/3 아래 구역 드롭다운 · real_map 연동
- 예상 1~2h

### 【리팩터 · 성능】

### T24. 아키텍처 리팩터 · P1 dead code · **에이전트 위임 금지**
- 이전 시도: dead-code-auditor 오편집 (SalesTrendPage 파괴)
- 재시도: **수동 진행** · grep 확인 → 삭제 → TS+build 검증
- 예상 1~2h

### T25. 아키텍처 리팩터 · P2 공용 훅·폴더 이동
- useVendors 공용 훅 (12곳 중복 통합) · 폴더 이동
- 예상 2~4h

### T30-followup 공통 훅 점진 채택
- **완료**: useSortableTable 훅 · StaffManagePage · StockReconciliationTab 채택
- 남은 채택: 20파일 (useSortableTable) · 9모달 (Modal.tsx) · 48파일 (useFilterState) · 3필터바
- 각 페이지별 15~30분 · 총 8~12h · 매 파일 TS+build 검증


### T34. 헤더 자동 정렬 검증 (일부 완료)
- StaffManagePage · StockReconciliationTab 정렬 완료
- 남은: OrderManagePage · 기타 테이블 확인

### T26. select('*') → 명시적 컬럼 (20파일)
- Supabase payload 40~70% 감소 · agent 위임 가능
- 예상 1.5~2h

### T27. TanStack Query 도입 (재고관리부터)
- 페이지 재방문 <50ms · 체감 5~10배
- 예상 2h

### T28. Brotli 압축
- gzip → Brotli · 예상 0.5h

### T29. @tanstack/react-virtual + TanStack Table
- StockManage · 초기 페인트 2~5초 → 100~200ms
- 예상 3~4h

---

## 🚧 사용자 액션 대기 (BLOCKED BY USER)

| # | 항목 | 필요 액션 |
|---|------|---------|
| J | `pharmacist_menu_items` 테이블 · `pharmacist-materials` 버킷 | Supabase SQL + 버킷 생성 |
| K | `vendors` 오학습 정리 | Supabase vendors 직접 수정 |
| L | `employees.resume_url` 컬럼 (T21) | `ALTER TABLE employees ADD COLUMN resume_url TEXT;` |
| M | `inventory_checks` 스키마 확장 (T14) | warehouse1/2 · store1/2/3 컬럼 |
| N | `hr_forms` 테이블 + Storage bucket (T9) | Supabase 대시보드 |
| O | OAuth Service Account (T19) | Google OAuth + Render 환경변수 |

---

## 우선순위 흐름 (권장)

1. **결정 대기 답변** → 진열요청 or 근로계약서 재설계 즉시 시작
2. **큐 대기** · ScanPage 반응형 · BarcodeScanner 제목 (사용자 스펙 확인)
3. **인프라 (사용자 준비 후)**: T14 · T21 · T9 · T19
4. **성능 · 리팩터** · T24 → T30-followup → T26 → T27 → T28

---

## ✅ 이번 세션 완료 (참고용 · 다음 세션 시 삭제)

**진열요청 재설계 · 전체 완료**
- StoreMap [진열요청] 제거 (`8c8f515`) · Phase 1 서버 (`b86f352`) · Phase 2 ScanPage 진입점 (`d3a6504`) · Phase 3 리스트 (`7b5bc97`)

**근로계약서 재설계 · 전체 완료**
- Phase B 시급 자동로드+세후계산 (`5ad8ecc`) · Phase C 프리뷰 하이브리드 (`1aac2ff`)

**UI 개선**
- NotificationBell 반응형 fix (`ae9cf78`) · 알림 클릭 페이지 이동 (`5016383`)
- LandingPage 서브액션·> 화살표 제거 (`144b40c`)
- BarcodeScanner 제목 가로 fix (`e1fd6a7`)
- ScanPage 반응형 wrap · 창고 위 매장 아래 (`46403b1`)

**서버 · 원칙**
- T38 OCR 로그 자동 정리 · T39 YOLO 비활성 (`b9c5df0`)
- contract-master 에이전트 신규 (`.claude/agents/contract-master.md`)
- AGENT_PRINCIPLES 원칙 #11 (테스트 동시) · #12 (병렬 진행)
