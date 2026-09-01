# 신규 개발자 온보딩

**작성 · 2026-09-01 · P3 종합 개선**

이 문서는 megatown-staff-scheduler 프로젝트에 처음 참여하는 개발자를 위한 3단계 가이드다. 실행 → 구조 이해 → 첫 기여까지 최단 경로를 제시한다.

---

## 1단계 · 개발환경 세팅 (30분)

### 필수 도구
- **Node.js** ≥ 20 (`engines.node` · package.json)
- **npm** (Node 번들)
- **Git** + Git Bash (Windows) 또는 PowerShell
- **VS Code** (권장) · TypeScript / Tailwind CSS IntelliSense 확장

### 설치
```bash
git clone <repo-url>
cd megatown-staff-scheduler
npm install
```

### 환경변수 (.env.local)
루트에 `.env.local` 파일 생성:
```env
# Supabase (필수)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# Gemini OCR (선택 · OCR 기능 사용 시)
GEMINI_API_KEY=AIzaSy...

# JWT 서명 (필수)
JWT_SECRET=<장문의 임의 문자열>

# 벤더 로그인 비밀번호 suffix (선택)
VENDOR_PW_SUFFIX=<임의>
```

Supabase 자격증명은 관리자에게 요청. 상세는 `docs/DB_SETUP.md` 참고.

### 실행
```bash
npm run dev       # tsx server.ts · Express + Vite HMR
```
브라우저에서 http://localhost:5173 접속. Vite dev server 가 API 프록시.

### 첫 검증
```bash
npm run lint      # tsc --noEmit · 타입 검사
npm test          # vitest run · 550+ 테스트
npm run audit     # scripts/audit-framework.cjs · 프레임워크 위배 체크
```
세 명령 모두 성공하면 세팅 완료.

---

## 2단계 · 프로젝트 구조 이해 (1~2시간)

### 최상위
```
megatown-staff-scheduler/
├─ src/                  # React 프론트엔드
├─ server/               # Express 백엔드 (routes · middleware · services · lib · utils)
├─ server.ts             # Express 진입점
├─ shared/               # 서버·클라이언트 공유 (types · schemas)
├─ scripts/              # 유틸 스크립트 (audit · import · migration)
├─ docs/                 # 개발 문서 (본 파일 포함)
├─ migrations/           # Supabase SQL 마이그레이션
├─ supabase/             # Supabase 클라이언트 설정
├─ sql/                  # 백업·복원용 SQL
└─ vite.config.ts        # Vite 빌드 설정
```

### 프론트엔드 (`src/`)
```
src/
├─ App.tsx              # 최상위 라우팅 · Page enum · SidebarProvider
├─ main.tsx             # ReactDOM.render + Toast + ErrorBoundary
├─ components/
│  ├─ common/           # 43+ 프리미티브 (Modal · Button · Card · Table 등)
│  ├─ layout/           # AppNavHeader · SideNav · sideNavGroups
│  ├─ ui/               # shadcn/ui 원본 (수정 자제)
│  └─ <PageName>/       # 페이지별 (LandingPage · SchedulePage · OcrPage 등)
├─ hooks/               # 공용 훅 (useApiQuery · useToast · useAuth · useConfirm)
├─ lib/                 # 도메인 로직 · apiClient · storageKeys · contract · permissions
├─ shared/              # 서버 공유 스키마 · types
├─ styles/              # tokens.ts · CSS 토큰
└─ supabase/            # 클라이언트 SDK 설정
```

### 백엔드 (`server/`)
```
server/
├─ routes/              # 40+ 라우트 파일 · 도메인별 서브폴더
│  ├─ auth/             # 로그인 · JWT · SSO
│  ├─ board/            # 게시판
│  ├─ daily/            # 연차 · 점심
│  ├─ display/          # 진열 요청 · 존 배정
│  ├─ ocr/              # 이미지 OCR · Gemini · 매칭
│  ├─ payment/          # 차용
│  ├─ purchase/         # 매입 · 공급사 · 결제 · VAT
│  ├─ reference/        # 참조 데이터
│  ├─ schedule/         # 스케줄 · 예약
│  ├─ settings/         # 앱 설정 · 시스템
│  ├─ staff/            # 직원 · 계약 · 인사
│  └─ stock/            # 재고 · 입고 · 상품 · 손실
├─ middleware/          # asyncHandler · errorHandler · requireAuth · zodValidate
├─ services/            # notificationsService · scheduleService · kakaoService
├─ lib/                 # ownershipCheck · auditLogger · pagination
└─ utils/               # supabaseFetchAll · purchaseDetailsQuery
```

### 데이터 흐름 (예: 진열 요청 조회)
1. **UI** · `DisplayPage/RealStockTablePage.tsx` · `useApiQuery("/api/display-requests")`
2. **HTTP** · `src/lib/apiClient.ts` · axios + 401 자동 로그아웃
3. **Express** · `server.ts` → `server/routes/display/requests.ts` (`router.get`)
4. **Auth** · `requireAuth` · JWT 검증 (세션 만료 시 401)
5. **Validation** · `validateBody(Schema)` · Zod (POST 만)
6. **Supabase** · `supabase.from("display_requests").select(...)` · PostgreSQL
7. **응답** · `res.json(rows)` · asyncHandler 가 에러 자동 catch

### 프레임워크 원칙
1. **회귀 절대 X** · 기존 기능 보존 필수
2. **프레임워크 우선** · 43+ 프리미티브 · 신규 인라인 금지
3. **DB 우선** · localStorage / KV 금지 · 도메인 데이터는 정식 테이블
4. **원본 테이블 우선** · 파생 테이블 자제 · JOIN 우선
5. **최신 UI 트렌드** · Linear / Vercel / Notion 톤 · 파스텔 지양

자세한 원칙은 `docs/CODING_PRINCIPLES.md` 참고.

---

## 3단계 · 첫 기여 (1일)

### 워크플로우
```bash
# 1. 최신 main 동기화
git fetch origin main
git checkout main

# 2. 브랜치 생성 (선택 · 로컬만 유지 가능)
git checkout -b feat/my-first-fix

# 3. 작업 · 매 단계 검증
npm run lint     # 타입 검사
npm test         # 회귀 방지

# 4. 로컬 커밋 (remote push 절대 X · 사용자 명시 승인 필수)
git add <changed-files>
git commit -m "<type>(<scope>): <제목>"
```

### 커밋 메시지 규칙
```
<type>(<scope>): <제목 · 한국어 가능>

<본문 · 왜 · 무엇을 · 검증 결과>
```
**type** · `feat` · `fix` · `refactor` · `perf` · `docs` · `test` · `chore`
**scope** · 도메인 (예: `a11y` · `supabase` · `ui` · `framework`)

예시:
```
feat(a11y): Modal describedBy prop · aria-describedby 지원

Modal 프리미티브에 describedBy optional prop 추가.
54 tests 통과 · 하위호환 유지.
```

### 첫 태스크 후보 (난이도 순)
1. **문서 오탈자 수정** · docs/*.md · 5분
2. **console.log 정리** · 프로덕션 log 제거 · 30분
3. **테스트 추가** · Modal.test.tsx 참고 · 새 프리미티브 · 1시간
4. **프리미티브 사용처 확산** · Card / Spinner / Modal 인라인 → 프리미티브 · 2~4시간

### 코드 리뷰 체크리스트
- [ ] `npm run lint` 성공
- [ ] `npm test` 성공 (관련 파일 우선)
- [ ] `npm run audit` warning 증가 없음
- [ ] 프레임워크 프리미티브 사용 (인라인 css 최소)
- [ ] iOS 네이티브 코드 (src/ios/) 수정 없음
- [ ] Gemini SDK 코드 수정 없음
- [ ] destructive SQL (DROP · TRUNCATE) 없음
- [ ] remote push 없음 (로컬 커밋만)

---

## 참고 문서

| 문서 | 내용 |
|------|------|
| `docs/ARCHITECTURE.md` | 시스템 아키텍처 · 폴더 구조 · 데이터 흐름 |
| `docs/FRAMEWORK.md` | 프레임워크 API 레퍼런스 (서버·클라이언트) |
| `docs/API.md` | 268 endpoint 자동 스캔 목록 |
| `docs/CODING_PRINCIPLES.md` | 코딩 원칙 (10대 규칙) |
| `docs/TASKS_HANDBOOK.md` | 태스크 처리 규칙 |
| `docs/PRINCIPLES.md` | UI/UX 프리미엄 원칙 |
| `docs/DB_SETUP.md` | Supabase 초기 설정 |
| `docs/KAKAO_SETUP.md` | 카카오 API 연동 |
| `docs/MENU_STRUCTURE.md` | 메뉴·페이지 계층 |

---

## 문제 해결 · FAQ

**Q. `npm install` 이 실패해요.**
A. Node 20 이상 확인 (`node --version`). node_modules 삭제 후 재시도.

**Q. Supabase 연결 실패**
A. `.env.local` VITE_SUPABASE_URL · ANON_KEY 확인. 관리자에게 SERVICE_ROLE_KEY 요청.

**Q. 테스트가 느려요.**
A. 첫 실행은 vitest transform 캐시 빌드로 30~60초 소요. 이후는 5~10초.

**Q. 브라우저에서 404**
A. Vite dev server (5173) 로 접속. `npm run dev` 로그 확인.

**Q. TypeScript 에러가 zod/locales 관련**
A. 프로젝트 tsconfig 는 이 문제를 우회. 개별 파일 TS 검사 대신 `npm run lint` 사용.

---

## 도움 요청

- 코드 오너: `git log` · 최근 커밋 작성자 확인
- 이슈 트래커: `docs/TASKS.md` · 진행 중 태스크 목록
- 세션 이력: `docs/SESSION_STATUS_*.md` · 과거 작업 로그
