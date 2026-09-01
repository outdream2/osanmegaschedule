# megatown-staff-scheduler

오산 메가타운 코스트팜 약국의 통합 운영 관리 웹앱 · React + Express + Supabase.

**주요 기능** · 직원 스케줄 · 근태 · 인사계약 · 재고 · 진열 · 매입 · 발주 · 반품 · OCR · 정산 · 승인 · 알림 · 게시판

---

## 빠른 시작

**전제 조건** · Node.js ≥ 20

```bash
git clone <repo-url>
cd megatown-staff-scheduler
npm install
```

`.env.local` 생성 (관리자에게 자격증명 요청):
```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
JWT_SECRET=<임의 장문 문자열>
GEMINI_API_KEY=AIzaSy...   # OCR 사용 시
```

```bash
npm run dev       # http://localhost:5173
```

---

## 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev` | Express + Vite HMR (tsx server.ts) |
| `npm run build` | Vite frontend + esbuild server (dist/) |
| `npm run build:render` | Render 배포용 (메모리 400MB cap) |
| `npm run start` | 프로덕션 실행 (dist/server.cjs) |
| `npm run lint` | tsc --noEmit (타입 검사) |
| `npm test` | Vitest 550+ 테스트 |
| `npm run test:watch` | Vitest watch 모드 |
| `npm run audit` | 프레임워크 위배 audit |
| `npm run audit:check` | audit 결과 baseline 대비 diff |

---

## 기술 스택

- **프론트엔드** · React 18 · Vite 6 · TypeScript · Tailwind CSS 4 · shadcn/ui
- **백엔드** · Node.js 20 · Express · TypeScript (tsx)
- **DB** · Supabase (PostgreSQL) · JS SDK
- **인증** · JWT (bcryptjs · jsonwebtoken)
- **OCR** · Google Gemini · ONNX Runtime (barcode)
- **알림** · Web Push · Kakao Talk API
- **테스트** · Vitest · Testing Library
- **배포** · Render

---

## 문서

**신규 개발자** · [docs/ONBOARDING.md](docs/ONBOARDING.md) 부터 시작

| 문서 | 내용 |
|------|------|
| [`docs/ONBOARDING.md`](docs/ONBOARDING.md) | 신규 개발자 3단계 가이드 (환경 → 구조 → 첫 기여) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 시스템 아키텍처 · 폴더 구조 · 데이터 흐름 |
| [`docs/FRAMEWORK.md`](docs/FRAMEWORK.md) | 프레임워크 API 레퍼런스 (완전판) |
| [`docs/API.md`](docs/API.md) | 268 endpoint 자동 스캔 목록 |
| [`docs/CODING_PRINCIPLES.md`](docs/CODING_PRINCIPLES.md) | 10대 코딩 원칙 |
| [`docs/PRINCIPLES.md`](docs/PRINCIPLES.md) | UI/UX 프리미엄 원칙 |
| [`docs/DB_SETUP.md`](docs/DB_SETUP.md) | Supabase 초기 세팅 |
| [`docs/KAKAO_SETUP.md`](docs/KAKAO_SETUP.md) | 카카오 API 연동 |

---

## 프로젝트 구조 (요약)

```
src/            React 프론트엔드 (Vite build)
  components/   43+ 프리미티브 + 페이지별 폴더
  hooks/        공용 훅 (useApiQuery · useToast · useAuth)
  lib/          도메인 로직 (apiClient · permissions · contract)
  shared/       서버 공유 Zod 스키마
server/         Express 백엔드 (tsx dev · esbuild build)
  routes/       40+ 라우트 (auth · purchase · stock · staff · ocr 등)
  middleware/   asyncHandler · errorHandler · requireAuth · zodValidate
  services/     notifications · schedule · kakao · sms
  lib/          ownershipCheck · auditLogger · pagination
docs/           개발 문서 (아키텍처 · 프레임워크 · API · 원칙)
migrations/     Supabase SQL (수동 실행)
scripts/        audit · import · migration 유틸
```

상세 구조는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 참고.

---

## 배포

Render 자동 배포 · `render.yaml` 참고. 프로덕션 환경변수는 Render 대시보드에서 관리.

---

## 프레임워크 핵심 규칙

1. **회귀 절대 X** · 기존 기능 100% 유지
2. **프레임워크 우선** · 43+ 프리미티브 재사용 · 인라인 CSS 금지
3. **DB 우선** · localStorage / KV 금지 · 도메인 데이터는 정식 테이블
4. **원본 테이블 우선** · 파생 테이블 자제 · JOIN 우선
5. **최신 트렌드** · Linear/Vercel/Notion 톤 · 파스텔 지양
6. **접근성** · aria-label · role · htmlFor · 스크린 리더 대응
7. **테스트 · TS 검증 필수** · 매 편집 `npm run lint` + `npm test`
8. **iOS · Gemini 코드 수정 금지**
9. **destructive SQL 절대 X** · DROP · TRUNCATE 사전 승인
10. **remote push · 사용자 명시 승인 후에만**

전체 원칙은 [docs/CODING_PRINCIPLES.md](docs/CODING_PRINCIPLES.md) 참고.

---

## 라이선스

Private · Internal use only.
