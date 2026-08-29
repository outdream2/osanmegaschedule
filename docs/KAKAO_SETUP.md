# 카카오 알림톡 발송 설정 가이드

> **대상 티켓**: #176 / #214 · 발주요청 · 물류팀장 카톡 전송
> **작성일**: 2026-08-29
> **현재 상태**: 뼈대(스켈레톤)만 구현 · 실제 발송은 사업자 등록 완료 후 활성화

## 1. 개요

발주요청 PDF 저장(#94) 이후, 물류팀장/공급사 담당자에게 카카오톡 알림톡을 자동 발송하기 위한 API 스켈레톤이다.

- 라우트: `POST /api/notifications/kakao-send` (`authorize(3)` 매니저 이상)
- 상태 조회: `GET /api/notifications/kakao-send/status`
- 서비스: `server/services/kakaoNotifyService.ts`
- 벤더 클라이언트: `server/lib/notification/solapiClient.ts` (기존)

환경변수 `KAKAO_API_KEY` 미설정 시 API 는 200 응답 + `{ ok: false, reason: "카카오 API 미구성" }` 을 반환한다. 프론트는 이를 감지해 배너/토스트로 안내 가능.

## 2. 필요한 환경변수

| 키 | 필수 | 설명 | 발급처 |
| --- | --- | --- | --- |
| `KAKAO_API_KEY` | Y (게이트) | 카카오 알림톡 서비스 활성 여부 게이트 · 값 자체는 임의(예: `enabled`) | 자체 설정 |
| `SOLAPI_API_KEY` | Y (Solapi) | SolAPI 콘솔 API Key | https://console.solapi.com |
| `SOLAPI_API_SECRET` | Y (Solapi) | SolAPI 콘솔 API Secret | 위와 동일 |
| `SOLAPI_SENDER_PHONE` | Y (Solapi) | 발신 전화번호 (사업자 명의 등록) | SolAPI 콘솔 · 발신번호 등록 |
| `SOLAPI_KAKAO_PFID` | Y (Solapi) | 카카오 채널 프로필 ID | SolAPI 콘솔 · 카카오 채널 연동 후 |
| `SOLAPI_KAKAO_TEMPLATE_ORDER` | N | 발주 알림톡 템플릿 ID (심사 통과 후) | 카카오 채널 · 알림톡 관리 |

> **주의**: `KAKAO_API_KEY` 는 사용자 스펙상 "카톡 기능 활성 여부" 를 표시하는 게이트 역할이다. 실제 발송은 위 `SOLAPI_*` 값들이 있어야 성공한다. 두 조건이 모두 갖춰져야 `isKakaoConfigured() === true`.

## 3. 사업자 등록 → 발송 활성화 절차

### 3-1. 사업자등록증 발급 (0~14일)
- 국세청 홈택스 (https://hometax.go.kr) 또는 세무서 방문
- 개인/법인 여부, 업종(예: 의약품 소매) 결정
- 발급 완료 후 사업자등록번호 · 대표자명 · 상호 · 주소 확인

### 3-2. SolAPI 계정 개설 & 사업자 인증 (1~3영업일)
1. https://solapi.com 회원가입
2. 마이페이지 · 사업자 인증 · 사업자등록증 사본 업로드
3. 담당자 실명 인증 (본인 명의 휴대폰)
4. 승인 완료 대기 (평일 기준 1~3일)

### 3-3. 발신번호 등록 (즉시~1일)
1. SolAPI 콘솔 · 발신번호 관리 · 신규 등록
2. 사업자 명의 유선/휴대 번호 · 통신사 확인서 업로드
3. 승인 후 `SOLAPI_SENDER_PHONE` 로 사용 (예: `05012345678`)

### 3-4. 카카오톡 채널 개설 (30분)
1. https://center-pf.kakao.com · 채널 개설 (무료)
2. 채널 이름 · 프로필 이미지 · 소개 등록
3. 검색 허용 여부 결정

### 3-5. SolAPI ↔ 카카오 채널 연동 (즉시)
1. SolAPI 콘솔 · 카카오 · 채널 연결
2. 카카오 비즈니스 계정으로 승인
3. 발급된 PFID 를 `SOLAPI_KAKAO_PFID` 에 저장

### 3-6. 알림톡 템플릿 등록 & 심사 (2~3영업일)
1. SolAPI 콘솔 · 알림톡 · 템플릿 신규 등록
2. 예시 템플릿 (발주 알림):
   ```
   [메가타운약국] 발주 요청 도착

   발주번호: #{발주번호}
   공급사: #{공급사}
   총 금액: #{총금액}
   요청일시: #{요청일시}

   상세: #{상세URL}
   ```
3. 심사 통과 후 발급된 템플릿 ID 를 `SOLAPI_KAKAO_TEMPLATE_ORDER` 에 저장
4. 변수는 반드시 `#{변수명}` 형식 (SolAPI 규격)

### 3-7. 잔액 충전 & 발송 테스트 (즉시)
1. SolAPI 콘솔 · 결제 · 10,000원 이상 충전 (건당 약 8~15원)
2. 위 env 5개 + `KAKAO_API_KEY=enabled` 설정 후 서버 재기동
3. 관리자 화면에서 발주요청 → 카톡 전송 체크박스 활성 → 실제 발송

## 4. env 설정 예시

로컬 개발 (`.env` 또는 `server/tenant.config.json`):

```env
KAKAO_API_KEY=enabled
SOLAPI_API_KEY=NCSXXXXXXXXXXXX
SOLAPI_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
SOLAPI_SENDER_PHONE=05012345678
SOLAPI_KAKAO_PFID=KA01PFxxxxxxxxxxxxxxxx
SOLAPI_KAKAO_TEMPLATE_ORDER=KA01TP2601xxxxxxxxxx
```

Render 프로덕션: Dashboard · Environment · 위 6개 키 등록 후 재배포.

## 5. 요청/응답 스펙

### 요청
```http
POST /api/notifications/kakao-send
Content-Type: application/json
Cookie: mt_auth=... (level >= 3)

{
  "to": "010-1234-5678",
  "templateId": "KA01TP2601xxxxxxxxxx",
  "variables": {
    "발주번호": "ORD-2026-001",
    "공급사": "코스트팜",
    "총금액": "1,234,000원",
    "요청일시": "2026-08-29 14:30",
    "상세URL": "https://mt.pharm/orders/ORD-2026-001"
  },
  "attachmentUrl": "https://.../order-pdf/ORD-2026-001.pdf"
}
```

### 응답 (미구성)
```json
{ "ok": false, "reason": "카카오 API 미구성" }
```

### 응답 (성공)
```json
{ "ok": true, "messageId": "M2K12345" }
```

### 응답 (벤더 실패)
```json
{ "ok": false, "reason": "잔액 부족" }
```

> 인증 실패 (`401`) · 권한 부족 (`403`) · body 검증 실패 (`400`) 만 4xx 로 반환한다. 실제 발송 실패는 `200 { ok: false }` 로 반환하여 프론트가 배너/토스트로 자연스럽게 처리할 수 있게 한다.

## 6. 향후 확장 지점

- **벤더 교체**: `server/services/kakaoNotifyService.ts` 내부의 `sendAlimtalkViaSolapi` 호출부만 다른 벤더 SDK (NHN Cloud · 알리고 · Bizppurio) 로 교체하면 라우트/스키마 변경 없이 전환 가능.
- **이력 저장**: `notifications` 테이블에 messageId · to · templateId · status 를 남겨 재전송 / 실패 재시도 지원.
- **첨부 처리**: 알림톡은 PDF 첨부 불가 · `attachmentUrl` 을 템플릿 변수로 삽입해 링크 클릭 유도. 이미지 첨부형 알림톡은 별도 템플릿 심사 필요.
- **SMS/LMS fallback**: `sendKakaoAlimtalk` 는 `fallbackToSms: true` 로 호출 · 알림톡 실패 시 자동으로 SMS 전환.
- **템플릿 다양화**: `SOLAPI_KAKAO_TEMPLATE_ORDER` 외 반품 · 결제 확인 · 입고 완료 등 여러 템플릿 · env 로 관리.
