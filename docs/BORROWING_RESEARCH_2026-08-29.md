# 차용등록 페이지 재설계 리서치 · 2026-08-29

> #130 · 사용자 지시 · 양방향 화살표 · 각각 서명 · 별도 DB · 최신 트렌드
> 완료 시 · 사용자 A/B/C 선택 후 · Phase 1 착수

---

## 요약 (Executive Summary)

- **문제 핵심**: 기존 `BorrowingPage.tsx` · 단일 서명 · 방향은 토글만 · 반환 이력 부재 · "양방향" 시각화 없음
- **권장 대안 Top 3**:
  1. **Timeline+Duo-Signature 카드형 재설계** (권장) · 기존 스키마 확장 · react-signature-canvas 도입
  2. **분할 화면 (2-Pane: 발생/반환) + Kanban 상태 흐름** · 대규모 개편
  3. **최소 개선** · 반환 서명만 추가 · 기존 UI 유지
- **예상 비용**: 1순위 기준 **8-12h** · 백엔드 마이그레이션 1개 · 프론트 컴포넌트 3-4개 신규

---

## 1. 현재 상태 분석

- `src/components/OrderManagePage/BorrowingPage.tsx` (642 lines) · SignaturePad 인라인 Canvas · **단일 서명**
- `supabase/migrations/20260825_borrowings_table.sql` · `signature_url TEXT` 1개만 · **반환 서명 필드 없음**
- `server/routes/payment/borrowings.ts` · POST/PATCH/DELETE 존재
- **결정적 문제**: `status='settled'` 처리 시 반환 서명·반환자·반환일시 기록 X → 감사 목적 불충족

### 업계 용어 (검색 힌트)
- 영어: "consignment loan" · "goods on loan" · "inter-company borrowing" · "IOU inventory transfer"
- 유사 도메인: **Equipment Checkout** · **Inventory Transfer Order** · **Chain of Custody**

---

## 2. 참고 사례 (다중 소스 · 신뢰도 표기)

| 사례 | 특징 | 신뢰도 |
|---|---|---|
| **InvGate Equipment Checkout** | 대출/반환 2단계 워크플로우 · 각 단계 확인 필드 · "collection process" 별도 태스크화 | 🟢 [invgate.com](https://blog.invgate.com/equipment-check-out-system) |
| **Connect2 Checkout Form** | 대여자/관리자 각각 서명 · "condition on return" 별도 필드 | 🟡 [connect2software.com](https://www.connect2software.com/equipment-checkout-form/) |
| **PrimeRx PrimeCENTRAL** | 약국 체인 지점간 재고 이동 · 중앙 관리 UI | 🟡 [intuitionlabs.ai](https://intuitionlabs.ai/articles/pharmacy-management-systems-guide) |
| **Linear Audit Log** | Timeline 형태 · 이벤트별 시간/행위자 명시 · 필터링 | 🟢 [linear.app/docs/audit-log](https://linear.app/docs/audit-log) |
| **eSign.AI Equipment Forms** | ESIGN Act·eIDAS 준수 · 서명 시 intent/consent/integrity 3요소 기록 | 🟡 [esign.ai](https://www.esign.ai/blog/electronic-equipment-checkout-return-forms) |
| **react-signature-canvas (agilgur5)** | 100% TS · signature_pad 최신 wrap · <150 LoC · 활발 유지보수 | 🟢 [github.com/agilgur5](https://github.com/agilgur5/react-signature-canvas) |

---

## 3. 대안 비교

| 대안 | 장점 | 단점 | 비용 | 학습 난이도 |
|---|---|---|:-:|:-:|
| **A. Timeline+Duo-Signature** ⭐ | 감사요건 충족 · 기존 스키마 확장만 · 프레임워크 재사용 | 반환 UI 추가 필요 | 무료 | 낮음 |
| **B. 2-Pane + Kanban** | 시각적 강렬 · 상태 흐름 명확 | 오버엔지니어링 (월 5-10건) · 40대+ 학습부담 | 무료 | 중간 |
| **C. 최소 개선 (반환 서명만)** | 최저 리스크 · 1-2시간 | "양방향 화살표" 요구 미충족 · 감사 이력 여전히 약함 | 무료 | 매우 낮음 |

---

## 4. 실행 계획

### 🥇 1순위: Timeline + Duo-Signature 카드형 (**권장**)

**왜 최고**:
1. 사용자 4대 요구 모두 충족 (양방향 시각화 · 이중서명 · 감사보존 · 최신UI)
2. 기존 스키마 최소 확장으로 회귀 위험 낮음
3. 프레임워크 (Card·StatusPill·TableListWrap) 100% 재사용

**UI 컨셉** (Linear/Notion 톤):
```
┌────────────────────────────────────────────┐
│ [카드형 리스트 · 확장 가능]                    │
│ ┌────────────────────────────────────────┐ │
│ │ [약국]  ──── 감기약 10개 ────>  [A공급사]│ │
│ │        (borrow · 8/25)                  │ │
│ │  서명: 김약사 [보기]  기한: 8/30         │ │
│ │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─          │ │
│ │ [약국]  <──── 감기약 10개 ────  [A공급사]│ │
│ │        (return · 8/28) [정산완료]        │ │
│ │  서명: 홍약사 [보기]                      │ │
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

- **화살표**: SVG 아님 · `lucide-react`의 `ArrowRight`/`ArrowLeft` (기존 스택 · 추가 의존성 0)
- **색상**: 차용=amber · 반환=emerald (기존 statusPillProps 톤 유지)
- **Timeline**: 카드 내 세로 `divider` + 두 이벤트 표시 (Linear audit log 스타일)

**실행 단계**:

1. **DB 마이그레이션 신규** (`supabase/migrations/20260829_borrowings_return_fields.sql`):
```sql
ALTER TABLE public.borrowings
  ADD COLUMN IF NOT EXISTS return_signature_url TEXT,
  ADD COLUMN IF NOT EXISTS returned_by          TEXT,
  ADD COLUMN IF NOT EXISTS returned_by_id       BIGINT,
  ADD COLUMN IF NOT EXISTS returned_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_note          TEXT;

CREATE INDEX IF NOT EXISTS idx_borrowings_returned_at
  ON public.borrowings (returned_at DESC);

NOTIFY pgrst, 'reload schema';
```
- 기존 컬럼 유지 · `ADD IF NOT EXISTS` · 회귀 0

2. **shared/schemas/borrowing.ts** · Zod 스키마 확장 (return_* 필드 추가)

3. **SignaturePad 프리미티브 추출**:
   - `src/components/common/SignaturePad.tsx` · 현재 인라인 서명 로직 공용화
   - 프레임워크 원칙 (3곳 이상 반복 = 즉시 추출)

4. **BorrowingCard.tsx** 신규 · 카드형 렌더링 · 화살표 SVG-free

5. **ReturnModal.tsx** 신규 · 반환 처리 시 서명 필수 + 반환자 자동 채움

6. **API 확장**:
   ```
   PATCH /api/borrowings/:id/return   (신규 · 반환 처리 + 서명 필수)
   ```

7. **BorrowingPage.tsx** · 카드형/테이블 뷰 토글 (기존 테이블 유지 · fallback)

**예상 시간**: **8-12h**

**롤백 계획**:
- 마이그레이션은 `ADD COLUMN` 만 · 롤백 안전
- 카드 뷰는 feature flag `useBorrowingCardView` (localStorage) 로 on/off
- 문제 시 테이블 뷰 fallback

**서명 라이브러리**: `react-signature-canvas` (agilgur5 fork · TS 완비 · signature_pad 기반) 도입 · 기존 인라인 canvas 대체
```bash
npm i react-signature-canvas @types/react-signature-canvas
```

**서명 저장**: 🟢 **Supabase Storage URL 방식** (base64 DB 직접 저장 X)
- 근거: base64 TEXT 컬럼 저장 시 (1) 로우 크기 ~100KB (2) CDN 서빙 불가 (3) 조회 시 payload 증가
- 방식: `borrowings/{id}/borrow_sig.png` · `borrowings/{id}/return_sig.png` 버킷 경로 · URL 만 DB 저장
- Fallback: Storage 미설정 환경 · base64 dataURL 저장 허용 (호환)

---

### 🥈 2순위: 2-Pane 분할 + Kanban 흐름 (Trello 스타일)

**왜 차선**: 시각적 임팩트 최고 · Attio/Linear 최신 트렌드 부합 (progressive disclosure) 하지만 **월 5-10건 규모에 과잉설계**

- 좌측 "미해결" 컬럼 · 우측 "정산완료" 컬럼
- 드래그 시 반환 서명 모달 자동 팝업
- 라이브러리: `@dnd-kit/core` (react 19 호환)
- **리스크**: 40대+ 사용자 드래그 UX 학습 부담 · 모바일 드래그 오조작

**롤백**: 대규모 변경이라 롤백 복잡 · Phase 3 이후 검토 권장

---

### 🥉 3순위: 최소 개선 (반환 서명만 추가)

**왜 3순위**: 사용자 요구 "양방향 화살표 시각화" 미충족 · 감사 이력은 확보

**실행 단계**:
1. DB 마이그레이션 (1순위와 동일)
2. `onPatch(id, {status:'settled'})` 호출 전 서명 모달 강제
3. 리스트 서명 컬럼 · 차용/반환 2개 서명 아이콘 병렬 표시

**시간**: 2-3h

---

## 5. 리스크·함정

- ⚠ **회귀 방지**: `signature_url` 컬럼명 유지 필수 · 기존 등록 데이터 존중 · 신규 `return_signature_url` 는 별도
- ⚠ **파생 컬럼 원칙**: 대원칙 `feedback_original_table_first.md` 준수 · 신규 컬럼 5개는 **사용자 승인 필요**
- ⚠ **말줄임표 금지**: 카드형 UI 에서 `truncate` 클래스 사용 금지 · 폭 확장 or 줄바꿈
- ⚠ **iOS 서명 캔버스**: `touch-action: none` + `passive: false` 필수 (기존 코드 반영됨)
- ⚠ **Supabase Storage 미설정**: 프로젝트 storage 버킷 실존 여부 확인 필요 (없으면 base64 fallback)
- ⚠ **반환 후 취소**: `returned_at` 있는데 `status='cancelled'` 로 되돌리기 정책 결정 필요 (감사 관점: 취소 이력만 추가 · 원본 유지)

---

## 6. 프로젝트 맥락 (megatown-staff-scheduler)

### 프레임워크 재사용 (docs/FRAMEWORK.md)
- **Card · StatusPill · EmptyState · Spinner · TableListWrap · SearchBar · PeriodSelector · InlineLabel** · 이미 사용 유지
- **useToast · useConfirm · useVendors** · 재사용
- **신규 프리미티브 후보**: `SignaturePad` (인라인 → `src/components/common/SignaturePad.tsx` 이관)

### API 계약 (기존 유지 + 확장)
```ts
// server/routes/payment/borrowings.ts (기존)
POST   /api/borrowings              // 등록 (차용/대여)
PATCH  /api/borrowings/:id          // 상태 변경
DELETE /api/borrowings/:id

// 신규 추가
PATCH  /api/borrowings/:id/return   // 반환 처리 + 서명 필수 (분리 엔드포인트로 감사 명확)
```

### Render 배포 궁합
- Supabase Storage 사용 시 · Render env `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 이미 세팅됨
- 서명 이미지 · public 버킷 X · **signed URL 1h 만료** 권장 (개인정보 · 감사증적)

### 사용자 특성 반영
- 폰트 대원칙 (`feedback_font_plus2_default.md`) · 카드 내 이벤트 라벨 `text-[15px]+` 준수
- 40대+ 약사 대상 · 아이콘 크기 `size={16-18}` · 색상 대비 WCAG AA 이상
- 모바일 서명 · signature_pad 는 stylus/finger 자동 감지

---

## 7. 관련 파일 (절대 경로)

- `D:\antigravity_projects\megatown-staff-scheduler\src\components\OrderManagePage\BorrowingPage.tsx` — 대상 페이지
- `D:\antigravity_projects\megatown-staff-scheduler\supabase\migrations\20260825_borrowings_table.sql` — 기존 스키마
- `D:\antigravity_projects\megatown-staff-scheduler\server\routes\payment\borrowings.ts` — 백엔드 라우트
- `D:\antigravity_projects\megatown-staff-scheduler\docs\FRAMEWORK.md` — 프레임워크 원칙

---

## 🔴 결정 요청 사항 (사용자 승인 필요)

1. **1순위 채택 여부** (Timeline+Duo-Signature 카드형)
2. **DB 신규 컬럼 5개 승인** (return_signature_url · returned_by · returned_by_id · returned_at · return_note) · 대원칙 (원본 우선) 상 사용자 명시 승인 필수
3. **서명 저장 방식**: Supabase Storage URL vs base64 dataURL (권장: Storage · fallback base64)
4. **서명 라이브러리**: react-signature-canvas 도입 vs 기존 인라인 유지 (권장: 도입 · 프레임워크 관점 SignaturePad 프리미티브)

---

## Sources

- [InvGate Equipment Check-Out System](https://blog.invgate.com/equipment-check-out-system)
- [Connect2 Equipment Checkout Forms](https://www.connect2software.com/equipment-checkout-form/)
- [eSign.AI Equipment Checkout Return Forms](https://www.esign.ai/blog/electronic-equipment-checkout-return-forms)
- [Pharmacy Management Systems Guide · IntuitionLabs](https://intuitionlabs.ai/articles/pharmacy-management-systems-guide)
- [Linear Audit Log Docs](https://linear.app/docs/audit-log)
- [Top 7 Timeline Visualization Components 2026](https://dev.to/lenormor/top-7-timeline-visualization-components-for-modern-web-apps-in-2026-420l)
- [react-signature-canvas · agilgur5 (GitHub)](https://github.com/agilgur5/react-signature-canvas)
- [Supabase Storage vs base64 · Discussion #6838](https://github.com/orgs/supabase/discussions/6838)
- [supa_audit · Generic Table Auditing](https://github.com/supabase/supa_audit)
- [7 SaaS UI Design Trends for 2026](https://www.saasui.design/blog/7-saas-ui-design-trends-2026)
