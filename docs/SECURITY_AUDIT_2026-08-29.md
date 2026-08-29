# 보안 감사 보고서 · 2026-08-29

감사 범위: auth.ts (SSO #174) · server.ts · requireAuth.ts · vendorPassword.ts · settings.ts · hrForms.ts · schedules.ts · vendors.ts · App.tsx SSO 소비

---

## 1. 취약점 요약

| 심각도 | ID | 취약점 | 파일:라인 | 우선순위 |
|--------|----|----|----|----|
| High | S1 | `change-password` IDOR · 본인 검증 없음 | auth.ts:197 | 즉시 |
| High | S2 | `POST /api/vendors` · authorize 없음 · requireAuth 만 의존 | vendors.ts:221 | 즉시 |
| High | S3 | `POST /api/hr-forms` · authorize 없음 · 임의 직원이 문서 업로드 가능 | hrForms.ts:125 | 즉시 |
| High | S4 | `POST /api/employees` · authorize 없음 | schedules.ts:22 | 즉시 |
| Medium | S5 | SSO 토큰 · 재사용 방지 없음 (one-time 소비 미구현) | auth.ts:128 | 단기 |
| Medium | S6 | `POST /api/blocked-slots` · `POST /api/zones` · authorize 없음 | settings.ts:163,199 | 단기 |
| Medium | S7 | vendor 비밀번호 상수 파생 · 타이밍 공격 가능 | vendorPassword.ts:48 | 단기 |
| Medium | S8 | bcrypt rounds = 10 (권고 최소 12) | auth.ts:97, 213 | 단기 |
| Medium | S9 | `POST /api/upload-vendors` · ADMIN_PIN 평문 쿼리 비교 | vendors.ts:25 | 단기 |
| Low | S10 | SSO 토큰 URL 노출 · HTTPS 미적용 시 전송 중 탈취 가능 | App.tsx:92 | 장기 |
| Low | S11 | Helmet 비활성화 유지 중 · XSS·클릭재킹 헤더 없음 | server.ts:103 | 장기 |
| Info | S12 | SUPABASE_KEY 파생 JWT_SECRET · key rotation 시 전체 세션 무효화 위험 | requireAuth.ts:39 | 인지 |

---

## 2. 상세 분석

### S1 · High · change-password IDOR (auth.ts:197)

**문제**: `POST /api/auth/change-password`는 Zod 검증과 bcrypt 현재 비밀번호 확인을 수행하지만 `authorize()` 미들웨어가 없다. 즉 인증된 모든 사용자(level 1~9)가 body에 `employeeId`를 임의 값으로 세팅해 다른 직원의 비밀번호를 변경할 수 있다. 단, 현재 비밀번호를 알아야 하므로 현실 착취 난이도는 높다. 그러나 엔드포인트 자체가 본인(sub)인지 검증하지 않는다는 점은 IDOR 패턴이다.

**공격 시나리오**: 인증된 level 1 직원 A가 "관리자 비밀번호를 모른다"는 전제 하에 위협은 낮지만, social engineering으로 currentPassword 획득 시 타인 계정 탈취 가능.

**수정안**:
```ts
// auth.ts:197 · authorize(1) + 본인 또는 관리자 게이트 추가
router.post("/api/auth/change-password",
  authorize(1),           // 로그인 필수
  validateBody(ChangePasswordSchema),
  asyncHandler(async (req, res) => {
    const session = getSession(req)!;
    const idNum = ...;
    // 본인(sub)이 아니면 admin(9) 이상이어야
    if (session.sub !== idNum && (session.level ?? 0) < 9) {
      throw forbidden("본인 비밀번호만 변경할 수 있습니다");
    }
    ...
  })
);
```

---

### S2 · High · POST /api/vendors · authorize 없음 (vendors.ts:221)

**문제**: `POST /api/vendors` (거래처 신규 등록)는 `validateBody(CreateVendorSchema)`만 적용되어 있고 `authorize()` 가 없다. `requireAuth` 글로벌 미들웨어는 로그인 여부만 확인하므로 level 1 직원(아르바이트)도 공급사를 등록할 수 있다.

**수정안**: `router.post("/api/vendors", authorize(5), validateBody(...), ...)`

---

### S3 · High · POST /api/hr-forms · authorize 없음 (hrForms.ts:125)

**문제**: 근로계약서·사직서·서약서 등 민감 HR 문서 업로드가 인증된 모든 레벨에서 가능하다. `DELETE /api/hr-forms/:id`만 `authorize(9)`로 보호되어 있다.

**수정안**: `router.post("/api/hr-forms", authorize(5), validateBody(...), ...)` — 매니저 이상만 업로드 허용.

---

### S4 · High · POST /api/employees · authorize 없음 (schedules.ts:22)

**문제**: 직원 신규 등록 엔드포인트에 authorize가 없다. requireAuth 글로벌만 적용되어 있어 level 1도 직원을 생성할 수 있다.

**수정안**: `router.post("/api/employees", authorize(9), ...)` — scheduleController.createEmployee 호출 유지.

---

### S5 · Medium · SSO 토큰 재사용 방지 없음 (auth.ts:128)

**문제**: `POST /api/auth/sso-consume`은 JWT 서명 검증 + `typ==="sso"` 체크만 한다. 같은 sso 토큰을 5분 내에 여러 번 POST하면 매번 새 쿠키가 발급된다. 이메일·메신저로 URL을 공유받은 제3자도 5분 내에 세션 탈취 가능.

**공격 시나리오**:  
1. 직원이 `?sso=TOKEN`이 포함된 URL을 업무 메신저에 실수로 붙여넣음  
2. 공격자가 5분 내에 해당 URL 접속 → 완전한 세션 발급  
3. 원래 직원도 같은 토큰으로 접속 성공 → 두 세션이 동시에 유효

**수정안**: Supabase `app_settings` 또는 서버 인메모리 Set에 소비된 sso jti(jwt id)를 기록하고 중복 소비를 거부한다.
```ts
// sso-token 발급 시 · jti 포함
const ssoToken = jwt.sign(
  { sub: ..., typ: "sso", jti: crypto.randomUUID() },
  JWT_SECRET, { expiresIn: "5m" }
);

// sso-consume 시 · jti 중복 검사
const usedSsoJtis = new Set<string>();  // 서버 메모리 (재시작 시 초기화 허용)
if (usedSsoJtis.has(decoded.jti)) throw unauthorized("SSO 토큰 이미 사용됨");
usedSsoJtis.add(decoded.jti);
// 5분 후 자동 만료이므로 Set 크기 관리: 만료 시간 기록 후 주기적 정리
```

---

### S6 · Medium · POST /api/blocked-slots · POST /api/zones · authorize 없음 (settings.ts:163, 199)

**문제**: 스케줄 차단 슬롯과 구역 배정 쓰기가 로그인된 모든 사용자에게 열려 있다. level 1 직원이 타인 스케줄 슬롯을 임의 차단 가능.

**수정안**:
- `POST /api/blocked-slots` → `authorize(5)` (매니저 이상)
- `POST /api/zones` → `authorize(5)` (매니저 이상)

---

### S7 · Medium · vendor 비밀번호 타이밍 공격 (vendorPassword.ts:48)

**문제**: `verifyVendorPassword`가 `cleanInput === expected` 문자열 직접 비교를 사용한다. JavaScript 문자열 `===`는 길이가 같으면 선형 비교라 타이밍 공격(timing attack) 이론적 가능성이 있다. 단, vendor 비밀번호 자체가 핸드폰+suffix 파생이라 구조가 이미 예측 가능하므로 실질 위험도는 낮다.

**수정안**: `crypto.timingSafeEqual(Buffer.from(cleanInput), Buffer.from(expected))` 사용.

---

### S8 · Medium · bcrypt rounds = 10 (auth.ts:97, 213)

**문제**: `set-password` (line 97)와 `change-password` (line 213) 모두 `bcrypt.hash(password, 10)`을 사용한다. OWASP 권고는 최소 12라운드(2026년 기준 14 권장).

**수정안**: `const BCRYPT_ROUNDS = 12;` 상수 정의 후 적용. 성능 영향: 12라운드 시 ~300ms/hash · 로그인/비밀번호변경 빈도 낮아 서버 부하 미미.

---

### S9 · Medium · ADMIN_PIN 평문 쿼리 비교 (vendors.ts:25)

**문제**: `POST /api/upload-vendors`의 인증이 `adminKey === (process.env.ADMIN_PIN ?? "1234")` 평문 비교로 처리된다. 기본값 `"1234"`가 하드코딩되어 있어 env 미설정 시 누구나 공급사 데이터를 대량 덮어쓸 수 있다. 이 엔드포인트는 `requireAuth` 이전에 `vendors.ts`가 마운트되지 않으므로 글로벌 requireAuth 보호를 받고 있으나 `managerId` 경로는 레벨 검증만 있어 IDOR 위험도 존재.

**수정안**: ADMIN_PIN 경로 제거하고 `authorize(9)` 미들웨어로 단일화.
```ts
router.post("/api/upload-vendors",
  authorize(9),  // JWT 기반 · ADMIN_PIN 경로 삭제
  express.raw({ type: "application/octet-stream", limit: "20mb" }),
  ...
)
```

---

### S10 · Low · SSO 토큰 URL 노출 (App.tsx:92)

**문제**: `?sso=JWT_TOKEN` 형태로 전체 JWT가 URL에 노출된다. 서버 액세스 로그, 브라우저 히스토리, Referer 헤더에 기록될 수 있다. App.tsx의 `finally` 블록에서 URL을 정리하고 있어 브라우저 주소창에는 잔류하지 않는다. HTTPS 적용 시 전송 중 탈취는 차단된다.

**현재 완화**: URL 정리 로직 적용됨 (App.tsx:112-114). HTTPS(Render 배포) 시 실질 위험 낮음.

---

### S11 · Low · Helmet 비활성화 (server.ts:103-119)

**문제**: iOS Safari getUserMedia 문제로 Helmet이 주석 처리된 상태. XSS 방어에 핵심인 `X-Content-Type-Options`, `X-Frame-Options` (클릭재킹 방지), `Referrer-Policy` 헤더가 없다.

**현황**: `dangerouslySetInnerHTML` 미사용 확인 (그렙 결과 0건). 직접 XSS 위험은 현재 낮음.

**수정안**: CSP, COEP, COOP 제외하고 클릭재킹·MIME sniff 헤더만 수동 설정.
```ts
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
```

---

### S12 · Info · SUPABASE_KEY 파생 JWT_SECRET

**문제 아님, 인지 사항**: JWT_SECRET을 `HMAC-SHA256(SUPABASE_KEY, "mt-jwt-v1")`로 파생하는 로직(requireAuth.ts:39)은 Render 배포 편의를 위한 설계이나, SUPABASE_KEY 교체 시 모든 활성 세션이 즉시 무효화된다. 또한 SUPABASE_KEY가 탈취되면 JWT_SECRET도 파생 가능하다.

**권고**: Render 배포 시 `JWT_SECRET`을 별도 env로 명시 설정 권장.

---

## 3. 회귀 확인

- auth.ts SSO 신규 코드: authorize(1) 적용 확인 (sso-token), sso-consume은 미인증 의도적 설계 (신규 브라우저 = 로그인 없음)
- requireAuth 글로벌 미들웨어: server.ts:201 위치 유지 확인
- POST /api/settings: authorize(9) 확인 (이전 감사 Critical 해결)
- POST /api/permissions: authorize(9) 확인
- bcrypt.compare 전 password_hash delete 처리: auth.ts:31, 211 확인 (메모리 노출 방지)

---

## 4. 즉시 조치 항목 (4건)

```
S1 · auth.ts:197 · change-password IDOR · authorize(1) + sub 검증 추가
S2 · vendors.ts:221 · POST /api/vendors · authorize(5) 추가
S3 · hrForms.ts:125 · POST /api/hr-forms · authorize(5) 추가
S4 · schedules.ts:22 · POST /api/employees · authorize(9) 추가
```

단기 조치 (S5-S9)는 Render 배포 전 완료 권장.
