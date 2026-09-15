# 메가타운 자동임포트 (sync-agent)

Windows 데스크탑 앱 · xlsx 파일 자동 임포트 도구.

## 목적

관리자 (약사) 가 로컬 폴더에 xlsx 파일 (상품·재고·매입) 을 넣으면 · 스케줄에 따라 · 서버 API 를 통해 자동으로 Supabase 에 임포트.

## 스택

- **Electron v33** · Chromium + Node.js 22
- **electron-vite** · 개발·빌드 통합
- **React 19** · TypeScript · Tailwind
- **electron-builder** · NSIS installer · GitHub Releases 자동 배포
- **electron-updater** · 자동 업데이트
- **auto-launch** · 부팅 자동 시작
- **keytar** · Windows Credential Manager (refresh token)
- **node-cron** · 파일별 스케줄러
- **axios** · 서버 API 호출 (multipart)

## 개발

```bash
cd apps/sync-agent
npm install
npm run dev
```

## 빌드

```bash
# 로컬 빌드 (테스트)
npm run build:win

# 빌드 + GitHub Releases 자동 업로드
npm run build:win:publish
```

산출물 · `apps/sync-agent/release/megatown-sync-agent-{version}-setup.exe`

## 배포

`electron-builder.yml` · `publish.provider: github` 설정.
GitHub Personal Access Token · `GH_TOKEN` 환경변수 필요.

## 아키텍처

- **웹앱 서버 API 호출** · `/api/upload-{products|stock|purchase-details}` (기존 endpoint 재사용)
- 웹앱 인증 flow · Email + Password → JWT + refresh token
- 로컬 큐 (node:sqlite) · 서버 다운 시 재시도

## Phase 계획

- **Phase 1** · 셋업 · 트레이 · 자동 시작 · UI 스켈레톤 (완료)
- **Phase 2** · 로그인 · 폴더 지정 · 스케줄 · xlsx 업로드 (진행 중)
- **Phase 3** · 로컬 큐 · 재시도 · 자동 업데이트 · 배포 (마지막)

## 코드 서명

**미서명 (사용자 결정 · 2026-09-15)** · SmartScreen · 첫 실행 시 · "실행" 클릭 필요.
