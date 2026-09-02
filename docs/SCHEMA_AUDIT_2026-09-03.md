# Zod Schema · Server Route · Client Payload · 3자 정렬 감사

**작성**: 2026-09-03
**배경**: 사용자 리포트 · '한달전 되던 기능이 안 됨' · 프레임워크화 부작용 조사

---

## 🎯 근본 원인 · Zod validateBody 확산

### 시점
2026-08-29 ~ 09-01 · 프레임워크 · asyncHandler + validateBody + shared schema · **P2·P3 확산**

관련 커밋:
- `71f7771c` P2 확산 · 설정·발주요청 도메인 (**주범**)
- `168cb5c3` P2b · 알림·실재고·존미스매치
- `cd675781` P3 · OCR + board + display-requests
- `51b21d5c` P3 · kakaoSend + systemConfig
- `7b913686` vendors/products/stockArrivals 7건
- `2f050e42` settings/display/contractClauses/lossTracking
- `fd105b25` schedules/invoiceImages/synonyms/pharmacist/notifications
- `3d8ef673` board/ocr-match/parse-local
- `f983b9c9` schedules/ocr/products

### 문제 패턴
```
[한달 전]
POST /api/xxx
  const b = req.body;                    // raw · 형식 자유
  handler(b.field1, b.field2)            // 정상 동작

[Zod 확산 후]
POST /api/xxx
  validateBody(SomeSchema)               // 스키마 검증
  const b = req.body;                    // Zod에 의해 필터링/스트립됨
  handler(b.field1, b.field2)            // 스키마와 실제 클라 페이로드 불일치 시
                                          //   → 400 VALIDATION · 로직 실행 X
                                          //   → 필드 스트립 · undefined · 저장 안 됨
```

### 발생 패턴 · 3가지
1. **형식 완전 역전** · `channels: array ↔ object` · `bySupplier: record ↔ array`
2. **필드 이름 불일치** · `fromYear/toYear ↔ targetYear/Month`
3. **필드 누락** · `team_leader_name · emergency_contact · vat_included` 정의 X → Zod strip

---

## 🔴 발견 & 즉시 fix 완료 (오늘 3건)

| Schema | Endpoint | 문제 | Fix 커밋 |
|---|---|---|---|
| **BulkSendOrderSchema** | POST /api/order-requests/bulk-send | channels: array/object 역전 · bySupplier: record/array 역전 | `2117d1a1` |
| **UpdateVendorSchema** | PATCH /api/vendors/:id | team_leader_name/phone · emergency_contact · vat_included 4필드 누락 (Zod strip) | `6054522b` |
| **CopyScheduleSchema** | POST /api/schedules/copy | fromYear/fromMonth/toYear/toMonth vs targetYear/targetMonth 완전 불일치 | `c8b004be` |

## 🔴 관련 · 발주 flow 5중 fix (같은 근본 원인 파생)

| 커밋 | 내용 | 방어 층 |
|---|---|---|
| `aa9db925` | UUID `BigInt()` SyntaxError · try/catch 감춰짐 | JS layer |
| `3d178ed3` | RPC bulk_send_order_requests · UUID 시그니처 fix | DB layer |
| `cc7698e2` | Fallback UPDATE 안전망 | Backup layer |
| `e137f9e6` | 미완료 dialog 복원 | UX layer |
| `79daf3c5` | POST /api/order-requests · 재요청 시 status 리셋 | Business layer |
| `2b906c01` | 이메일 실 발송 nodemailer | Feature layer |

---

## 🟡 잠재 리스크 (105 endpoint 中 · 위 3개 외 사용자 미리포트)

### 조사 방법
사용자 사용 빈도 높은 endpoint 우선 · schema-controller-client 3자 정렬 검증 필요.

### 검증 완료 (문제 없음)
- LoginSchema · VendorLoginSchema · ChangePasswordSchema · SetPasswordSchema
- CreateEmployeeSchema · UpdateEmployeeSchema
- CreateProductSchema · UpdateProductSchema
- CreateReservationSchema · CreateLeaveRequestSchema

### 미확인 · 사용 시 발견 가능 리스크
- Board · comments · posts · uploads (18 endpoint)
- OCR · templates · synonyms · confirmed items (12 endpoint)
- HR forms · contracts (5 endpoint)
- Zone · labels · assignments · groups (7 endpoint)

---

## 📋 재발 방지 · 프레임워크 원칙

### 신규 API 추가 시 3자 필수 정렬
```typescript
// 1. src/shared/schemas/xxx.ts · schema 정의
export const XxxSchema = z.object({ 
  targetYear: z.number(),     // ← 클라와 정확히 일치
  targetMonth: z.number(),
});

// 2. server/controllers/xxxController.ts · destructure
const { targetYear, targetMonth } = req.body;   // ← schema와 정확히 일치

// 3. src/lib/xxxApi.ts 또는 컴포넌트 · POST body
await api.post("/api/xxx", { targetYear, targetMonth });   // ← 3자 동일
```

### 테스트 도구
- `scripts/audit-schema-routes.mjs` · validateBody 사용 endpoint 목록
- 각 endpoint 마다 · curl 테스트 · client 형식 검증
- vitest · schema.test.ts · 실제 client 페이로드 예시로 parse 성공 확인

### 사용자 리포트 · 즉시 확인 방법
```bash
# 서버 로그 · "expected X, received Y" · Zod validation error 확인
# curl 로 실제 client body 재현 · 400 응답 여부 확인
```

---

## 요약

**"프레임워크화 때문인가?"** · **Yes · Zod validateBody 확산 시 · schema 정의가 실제 형식과 어긋난 것이 근본 원인.**

- 발견 3건 · 오늘 모두 fix
- 잠재 리스크 · 100+ endpoint · 사용자 사용 시마다 검증 필요
- 재발 방지 · 신규 endpoint · schema-controller-client 3자 정렬 원칙 · 문서화
