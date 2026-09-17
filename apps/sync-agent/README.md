# 메가타운 자동임포트 (sync-agent)

Windows 데스크탑 앱 · 로컬 xlsx 파일을 감시·자동 임포트 · Supabase 반영.

## 목적

관리자(약사)가 로컬 폴더에 xlsx 파일(상품·재고·매입 등)을 저장하면 · 파일 감시 or 스케줄에 따라 · 웹앱 서버 API 를 통해 자동으로 Supabase 로 임포트.
클라우드(예: Google Drive) 폴더도 로컬 sync 폴더로 다뤄지면 그대로 감시.

## 주요 기능

- 트레이 상주 · 부팅 자동 시작 · 하이브리드 UI (D안 · 트레이 + 요약창)
- **로그인** · 핸드폰번호 + JWT 쿠키 인증 · 자동 refresh (15분 → 30일)
- **아이디 저장** · 다음 실행 시 자동 채움
- **파일 감시 모드 (chokidar · 기본)** · 새 xlsx 감지 · 10분 debounce · 자동 임포트
- **스케줄 모드 (선택 · 상호배제)** · cron 프리셋
- **최신 파일 감지** · 파일명 날짜(YYYYMMDD 등) 우선 · fallback mtime
- `_processed` / `_failed` 자동 관리 · 재시도 성공 시 `_failed → _processed`
- **웹앱 endpoint 재사용** · `/api/upload-products` · `/api/upload-stock` · `/api/upload-purchase-details`
  - octet-stream + managerId 파라미터 · 웹앱 UploadDataModal 과 동일 흐름
- **로컬 재시도 큐 (JSON)** · 지수 백오프 · 서버 다운·네트워크 오류 대응
- **데이터 카운트** · '상품 6287개 · 복원 7049개' 등 실행 결과 표시
- **Windows toast** · 트레이 상태 색상 (idle / running / success / error)
- **자동 업데이트** · electron-updater · GitHub Releases
- **Logs 탭** · 실행 이력 · 폴더 상태 · 재시도 큐
- Copyright footer · IRUMs · (주)이룸즈

## 스택

- **Electron v33** · Chromium + Node.js 22
- **electron-vite** · 개발·빌드 통합
- **React 19** · TypeScript · Tailwind 3
- **electron-builder** · NSIS installer · GitHub Releases 자동 배포
- **electron-updater** · 자동 업데이트
- **auto-launch** · 부팅 자동 시작
- **chokidar** · 파일 감시
- **node-cron** · 스케줄 모드
- **axios** · 서버 API 호출 (multipart / octet-stream)

## 개발

```bash
cd apps/sync-agent
npm install
npm run dev        # 개발 서버 · Electron DevTools 로드
npm run typecheck  # tsc --noEmit (node + web)
```

## 빌드

```bash
npm run build:win           # 로컬 빌드 (테스트) · --publish never
npm run build:win:publish   # 빌드 + GitHub Releases 업로드 · --publish always
```

산출물 · `apps/sync-agent/release/megatown-sync-agent-{version}-setup.exe`

## 배포

`electron-builder.yml` · `publish.provider: github` 설정.
GitHub Personal Access Token · `GH_TOKEN` 환경변수 필요 (Releases 업로드용).

## 아키텍처

- **웹앱 서버 API 재사용** · 별도 서버 API 를 만들지 않고 · 기존 `/api/upload-*` endpoint 그대로 호출 (SSOT · 단일 endpoint 원칙)
- **인증** · 웹앱과 동일 · 핸드폰번호 + password → JWT 쿠키
- **refresh token** · Windows Credential Manager 로 안전 보관 (keytar)
- **로컬 큐** · JSON 파일 (재시도 · 지수 백오프)

## 사용자 가이드 (관리자용 요약)

1. 설치 · `megatown-sync-agent-{version}-setup.exe` 실행 (SmartScreen "실행" 클릭)
2. 최초 실행 · 핸드폰번호 + 비밀번호 로그인 (아이디 저장 옵션)
3. 감시 폴더 지정 · 로컬 폴더 or Google Drive 로컬 sync 폴더
4. 파일 감시 모드 · 새 xlsx 저장하면 10분 debounce 후 자동 임포트
5. 실행 결과 · 트레이 아이콘 색상 + Windows toast + Logs 탭
6. 실패 시 · `_failed` 폴더 이동 · 재시도 큐가 자동 재시도 (지수 백오프)

## Phase 계획 · 진행 상황

- **Phase 1** ✅ 셋업 · 트레이 · 자동 시작 · UI 스켈레톤
- **Phase 2** ✅ 로그인 · 폴더 지정 · 스케줄 · xlsx 업로드
- **Phase 3** ✅ 로컬 큐 · 재시도 · 자동 업데이트 · 배포
- **Phase 4** 🔄 파일 감시(chokidar) · 자동 refresh · UX 폴리싱 · 사용자 테스트 병행

## 코드 서명

**미서명 (사용자 결정 · 2026-09-15)** · SmartScreen · 첫 실행 시 · "실행" 클릭 필요.
