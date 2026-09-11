# 테스트 리스트 · 2026-09-11 자율 세션

사용자 자리 비운 3-4시간 자율 작업 · 매 태스크 · 테스트 방법 안내.

> **필수 · 시작 전** · 서버 재시작 (Ctrl+C · npm run dev) · 백엔드 fix 배포

---

## #125·#127 · 결제입력 · supplier-ledger SSOT 통합 ✅
**커밋** · eed237b6 · 8e6a2ea2

### 배경
이전 · 5개 endpoint (order-history + purchase-details + supplier-balances-map + supplier-payments + top-sales) · 값 미스매치 (광동제약 · 매입 0원 vs 잔고 188M).

### 해결
매입/결제/잔고 · **하나의 endpoint** (`/api/supplier-ledger`) · 정합성 100%.

### 테스트 절차
1. **결제입력 페이지** 진입
2. **광동제약** 선택 · 상단 KPI 카드:
   - 총 매입 (전체) · N원 · 발주 M건 · 결제 K원
   - 잔고 · 상태 라벨 (미지급 sky / 선지급 rose / 완납 emerald)
3. **테스트 공급사** 선택 · 다음 값 확인:
   - 총 매입 · **57,500원**
   - 총 결제 · **2,775,000원**
   - 잔고 · **-2,717,500원** · **선지급 (붉은색)**
4. **우측 매입내역 탭** · 상품명/수량/단가/금액 정상 표시
5. **우측 결제내역 탭** · 결제일/금액/방법/메모 정상 표시
6. **우측 발주내역 탭** · 발주 이력 (order-history · 유지)
7. **우측 판매내역 탭** · 판매 이력 (top-sales · 유지)

### 예상 결과
- 미스매치 X · 상단 KPI = 우측 매입/결제 리스트 합계 = 잔고 정확
- 캐시 X · 결제 등록 후 · 즉시 반영

---

## #116 · 연차 스케쥴 · KST off-by-one + 에러 삼킴 제거 ✅
**커밋** · 8e6a2ea2 (KST fix) · 5f1b68bc (에러 삼킴 제거)

### 배경
- `.toISOString().slice(0, 10)` UTC 변환 · KST 하루 밀림
- `.catch(() => null)` · schedules INSERT 실패 시 · 조용히 무시 · 사용자 알림 없음

### 해결
- `src/lib/kstDate.ts` + `server/lib/kstDate.ts` 신규 헬퍼 (`getKstYmd`, `nextKstYmd`, `compareYmd`)
- leave.ts · 문자열 기반 while loop · Date 변환 X
- `.catch(() => null)` 제거 · try/catch + 자세한 로그 · 실패 시 500 반환

### 테스트 절차

**A · 연차신청 폼 기본값 (LeavePage)**
1. 오전 9시 이전 · 연차신청 페이지 열기 (KST 새벽)
2. 시작일/종료일 · 오늘 KST 날짜로 정확히 표시
3. → 이전 · 전날 표시 · 지금 · 오늘 표시

**B · 연차 승인 (관리자)**
1. 승인요청 페이지 · 연차 신청 승인
2. 서버 콘솔에 로그 · `[LEAVE APPROVE] emp=X type=월차 dates=[YYYY-MM-DD] · N건 스케쥴 반영`
3. 스케쥴표 (일일) · 해당 날짜 · 해당 직원 · 연차(월차) 표시
4. 하루 밀림 X · 신청한 그 날짜 정확히

**C · 실패 시 (기대)**
1. schedules INSERT 실패 시 · 클라이언트 · 500 에러 · 명확한 메시지
2. 서버 콘솔 · `[LEAVE APPROVE FAILED] ... <에러>` 자세히

### DB 확인 (선택)
```
node scripts/check-leave-schedule-sync.mjs
```
최근 승인 연차 vs schedules 매칭 확인.

---

## #131 · 연차승인 페이지 · UI 리디자인 ✅
**커밋** · 8fd95ac4

### 배경
기존 · 낡은 grid-cols-2 탭 · border-l-2 색색 · 촌스러움. Linear/Vercel/Notion 2026 톤 미달.

### 해결
- **TabBar 프리미티브** · level=2 · 프레임워크 통일
- **이니셜 아바타** · status tone (amber/emerald/rose) · ring-1
- **이름 + 연차 유형 chip** · 브랜드 톤
- **기간** · CalendarDays + tabular-nums
- **사유** · MessageSquareText 인용문
- **메모** · StickyNote (indigo)
- **검토하기** · Linear-톤 zinc-900 (green-50 촌스러움 제거)
- **승인/반려** · emerald-600 / rose-600 · 명확 대비

### 테스트 절차
1. **관리자 로그인** · 승인요청 페이지 (요청목록) · 연차승인 탭
2. **탭 확인** · TabBar · 승인 대기 (amber badge · pulse) · 전체 목록
3. **리스트 아이템 각각:**
   - 이니셜 아바타 · 이름 첫 글자 · 배경색 · 상태에 맞음
   - 이름 (17px bold · 진함)
   - 연차 유형 chip (brand-tint · rounded-full)
   - 기간 · 아이콘 + 날짜 · 단일 · 구간 자동 표시
   - 사유 · 인용문 스타일 · 있으면
   - 메모 · indigo · 있으면
   - 신청일 · 하단 · 12px muted
   - 상태 pill · 오른쪽 상단
4. **검토하기 클릭 (pending 만):**
   - 인라인 확장 · 메모 입력 + 승인/반려 버튼
   - 승인 · emerald · 반려 · rose · 취소
5. **hover** · 카드 · 살짝 border 진해짐 · shadow 미세 (Linear-톤)

### 예상 결과
- 촌스러움 X · Linear/Vercel/Notion 2026 톤
- 프레임워크 통일 (TabBar · Card · StatusPill · 아이콘)
- 40대+ 가독성 · 폰트 계층 명확 (17/14/13/12)

### 회귀 체크
- 승인 · 반려 · 취소 · 검토하기 · 모두 동작 (기능 100% 유지 · className 만 변경)

---

## 진행 중 태스크 (완료 시 추가)
