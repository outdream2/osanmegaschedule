# TASKS

**규칙** (사용자 지시 · 2026-08-04):
- 완료 태스크는 이 파일에서 **삭제** (아카이브 X)
- 새 태스크 발생 즉시 이 파일에 추가
- 세션 시작 시 반드시 이 파일 read (토큰 만료로 in-memory TaskList 유실 대비)
- 매 milestone (커밋·이슈 완료) 후 이 파일 update

---

## 🔴 진행 중 (백그라운드 에이전트)

- 매입 서브탭 · 3탭 공통 기간 필터 + 원형차트 3종 (mobile-ui-designer)
- 바코드 UI 반응형 검토 (mobile-ui-designer · 리포트만)
- 임금계산 4-col 요약 · 이미지 표 형식 (contract-master 스타일)
- 근로계약서 왼쪽 폼 UI 세련 재디자인 (mobile-ui-designer)

---

## 🟡 대기 · 큰 작업

### T-C · 근로계약서 · 각 호 내용 편집 CMS (미착수)
- 임금 단서 5개 · 징계 13개 · 기타 5개 · 개인정보 4분류
- 저장 · settings 테이블 or contract_clauses 신규
- 예상 4~5h

### T3. API 인증 미들웨어
- 원인: 민감 API 서버단 세션 검증 부재
- 작업: requireAuth + authorize(level) · 라우터 적용
- 예상 2~3h · **아키텍처 큰 변경 · 사용자 확인 필요**

### T37. JSON body parser 한도 축소 (DoS 방어)
- 현재 100mb · 인증 전 대용량 payload OOM 유도 가능
- 작업: 일반 API 10mb · 파일 업로드 route-level or multipart
- 예상 1~1.5h · rate-limiter 도입 검토

### T39. YOLO/OCR 모델 분리 (OOM 방어)
- **부분 완료**: YOLO 재고세기 비활성
- 남은: PaddleOCR 별도 서비스 분리 · Render 실측 필요
- 예상 4~6h

### T27. TanStack Query 도입 (선택)
- 재고관리부터 · 페이지 재방문 <50ms
- 예상 2h · **사용자 확인 필요**

### T29. TanStack Table (선택)
- StockManage · 초기 페인트 2~5초 → 100~200ms
- 예상 3~4h · **사용자 확인 필요**

---

## 🟢 리팩터 · 성능 (자율 가능)

### T24. P1 dead code (수동)
- 각 파일 grep 확인 후 삭제 · **에이전트 위임 금지** (이전 파괴 사례)
- 완료: StoreMap 1786줄 (`282bac5`)
- 남은: 개별 파일 확인
- 예상 1~2h

### T25. P2 리팩터 (공용 훅·폴더 이동)
- useVendors 공용 훅 (12곳 중복 통합)
- 폴더 정리
- 예상 2~4h

### T26. select('*') → 명시적 컬럼
- Supabase payload 40~70% 감소
- 20파일 · 예상 1.5~2h

### T30-followup. 훅 점진 채택
- 완료: useSortableTable · StaffManagePage · StockReconciliationTab
- 남은: 20파일 (useSortableTable) · 9모달 (Modal.tsx) · 48파일 (useFilterState)
- 각 파일 15~30분 · 총 8~12h

### T34. 헤더 자동 정렬 검증 (일부)
- 완료: StaffManagePage · StockReconciliationTab
- 남은: OrderManagePage · 기타 테이블

### T36. RawOcrTable 정렬 (deferred · 복잡)
- 3개 dynamic OCR 컬럼 · 정렬 없음
- 예상 1~1.5h

---

## 🚧 사용자 액션 대기 (BLOCKED BY USER)

| # | 항목 | 필요 액션 |
|---|------|---------|
| J | pharmacist-materials 버킷 | Supabase 대시보드 (T20 관련) |
| K | vendors 오학습 정리 (page 6) | Supabase vendors 직접 수정 |
| P | T3 API 인증 승인? | Y/N |
| R | T27 TanStack Query 도입? | Y/N |
| Q | Remote push 60+ 커밋 | Y/N 시점 |

---

## 우선순위 흐름 (권장)

1. **결정 대기 답변** (T3 · T27 · Remote push)
2. **자율 리팩터** · T30-followup → T26 → T24 → T25
3. **인프라 (Render 배포 후)** · T39 실측 · T37 rate-limiter
4. **큰 신규** · T-C 조항 CMS (사용자 승인 후)

---

## 세션 관리 · 참고

- **원칙 문서**: `docs/AGENT_PRINCIPLES.md` · #1~#12
- **contract-master 에이전트**: `.claude/agents/contract-master.md`
- **메모리**: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
- **오늘 세션 커밋**: 60+ 로컬 · remote push 대기
