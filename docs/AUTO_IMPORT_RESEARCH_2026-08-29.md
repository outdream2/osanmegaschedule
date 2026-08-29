# 자동 임포트 시스템 개선안 리서치 · 2026-08-29

**대상 태스크**: #253 (구 #77) · Phase B/C/D/F
**작성 목적**: 구현 전 스택 · 배포 방식 · 원클릭 설치 최종 결정 지원
**작성자**: research-strategist

---

## 요약 · 3줄 결론

1. **런타임**: Python(pandas·openpyxl) 대신 **Node.js + xlsx(SheetJS)** 채택 권장. 이미 서버가 Node라 검증 로직 재사용 · 유지보수 파일 1개로 통합 · PyInstaller 130MB → pkg 40MB.
2. **실행 방식**: Windows Task Scheduler(정적 스케줄) + **NSSM 백그라운드 워커**(watch-mode) 하이브리드. Docker/WSL은 약국 PC 사용자 IT 부재로 제외.
3. **설치**: **Inno Setup 6** 원클릭 installer(한글 UI · 서명 · 자동업데이트) + `install.bat` 폴백. 웹 UI 는 이미 완료된 cron 필드 대신 **cronstrue + react-js-cron-mui** 사람친화 UI로 마감.

---

## 1. 옵션 비교표

### 1.1 실행 아키텍처

| 옵션 | 설치 편의 | 유지보수 | 성능 | 개발 난이도 | 사용자(약국) 적합도 |
|---|---|---|---|---|---|
| **Windows Task Scheduler + Node.js exe** ⭐ | ★★★★★ (installer 자동 등록) | ★★★★☆ (스택 통일) | ★★★★☆ (콜드스타트 0.5s) | ★★★☆☆ | ★★★★★ |
| Windows Service (NSSM) + 워커 | ★★★★☆ (bat로 등록) | ★★★★☆ | ★★★★★ (상주) | ★★★☆☆ | ★★★★☆ (로그오프 후에도 실행) |
| Docker Desktop + cron | ★☆☆☆☆ (Docker Desktop 라이선스·설치 부담) | ★★★★★ | ★★★☆☆ | ★★★★☆ | ★☆☆☆☆ (약국PC 부적합) |
| WSL2 + systemd | ★☆☆☆☆ | ★★★★☆ | ★★★★☆ | ★★★★☆ | ★☆☆☆☆ |
| Tauri sidecar tray app | ★★★★☆ | ★★★☆☆ | ★★★★☆ | ★★★★★ (Rust 학습) | ★★★☆☆ (오버엔지니어링) |

🟢 [Prismatic On-Prem Agent Windows](https://prismatic.io/docs/integrations/connections/on-prem-agent/on-prem-agent-windows/) · 🟡 [MakeUseOf: 왜 Task Scheduler 대신 Docker](https://www.makeuseof.com/stopped-using-task-scheduler-after-switching-to-docker-containers/)

### 1.2 런타임(스크립트 언어)

| 옵션 | 배포 크기 | 콜드스타트 | 기존 스택과 통합 | 결론 |
|---|---|---|---|---|
| **Node.js 20 + pkg/nexe** ⭐ | ~40MB | 0.3s | ★★★★★ (서버 검증 코드 재사용) | **채택** |
| Python 3.12 + PyInstaller | ~130MB | 1.5s | ★☆☆☆☆ (별도 학습·이중 유지) | 제외 |
| Bun 1.x + `bun build --compile` | ~55MB | 0.1s | ★★★★☆ | 후보2 (Windows 상용성 낮음) |
| Deno 2 compile | ~90MB | 0.5s | ★★★☆☆ | 제외 |
| Rust + calamine | ~5MB | 0.05s | ★☆☆☆☆ (개발 부담) | 제외 |

🟢 [Strapi: Bun vs Node 2026 벤치](https://strapi.io/blog/bun-vs-nodejs-performance-comparison-guide) · 🟡 [Analytics Insight 비교](https://www.analyticsinsight.net/courses/bun-or-nodejs-complete-comparison-for-developers-in-2026)

### 1.3 Windows 서비스 매니저

| 옵션 | 라이선스 | Windows 11 지원 | 로그아웃 후 실행 | 결론 |
|---|---|---|---|---|
| **NSSM 2.24** ⭐ | Public Domain | ★★★★★ | O | 상주 워커용 |
| WinSW | MIT | ★★★★★ | O | 대안(YAML 설정) |
| node-windows | MIT | ★★☆☆☆ (2년 미업데이트) | △ | 제외 |
| PM2 + pm2-windows-service | AGPL | ★★★☆☆ | △ (로그인 필요 사례) | 제외 |
| Windows Task Scheduler | 기본 내장 | ★★★★★ | O (설정 시) | 정적 스케줄용 |

🟡 [Medium: PM2 vs NSSM 2026](https://medium.com/@gzthomasliang/run-pm2-as-service-on-windows-server-in-modern-way-286b9f4b8228) · 🟡 [Ptarmigan Labs 비교](https://ptarmiganlabs.com/monitoring-auto-starting-node-js-services-windows-server/)

### 1.4 원클릭 Installer

| 옵션 | 크기 | 한글 지원 | 서명 | 업데이트 | 개발 난이도 |
|---|---|---|---|---|---|
| **Inno Setup 6.3** ⭐ | ~2MB | 완벽(공식 Korean.isl) | 지원 | Inno Setup Update 스크립트 | ★★☆☆☆ |
| NSIS 3 | ~1.5MB | 지원 | 지원 | 자체 구현 | ★★★★☆ |
| MSIX | ~10MB (재배포자) | 지원 | **필수**(EV 인증서 $300+/년) | Windows Store | ★★★★★ |
| WiX Toolset v4 | ~5MB | 지원 | 지원 | 자체 구현 | ★★★★★ |

🟢 [Silent install cheatsheet](https://github.com/offlineinstallersetup/silent-install-cheatsheet) · 🟡 [AlternativeTo: Inno Setup](https://alternativeto.net/software/inno-setup/)

### 1.5 웹 UI · cron 표현

| 옵션 | UX | 라이브러리 크기 | 한국어 | 채택 |
|---|---|---|---|---|
| **react-js-cron-mui + cronstrue** ⭐ | 드롭다운 + 실시간 프리뷰("매일 오전 8시") | ~40kb | cronstrue 30+ 언어 지원 | **채택** |
| @vpfaiz/cron-builder-ui (shadcn) | 미려 · Radix UI | ~25kb | 영어 위주 | 후보 |
| 순수 시각 UI(요일 체크박스 + 시간 pick) | 최고 UX | 자체 | 완벽 | 후보(자체 개발) |
| cron 문자열 직접 입력 | 최악 | 0 | X | 제외 |

🟢 [cronstrue npm](https://www.npmjs.com/package/cronstrue) · 🟢 [@vpfaiz/cron-builder-ui](https://github.com/vpfaiz/cron-builder-ui) · 🟡 [react-js-cron-mui](https://github.com/levyitay/react-js-cron-mui)

---

## 2. 추천 스택 · 근거

### 최종 권장 조합

```
┌─ 약국 Windows PC (오산 메가타운) ────────────────────┐
│                                                        │
│  [Inno Setup Installer] ← 원클릭 설치 · 한글            │
│           │                                            │
│           ├─ Node.js 20 exe (pkg 빌드 · 40MB)          │
│           │   ├─ auto-import-worker.exe                │
│           │   └─ xlsx(SheetJS) + node-fetch            │
│           │                                            │
│           ├─ NSSM 등록 → Windows Service              │
│           │   (watch-mode · 파일 감시)                 │
│           │                                            │
│           └─ Task Scheduler 등록 (백업 스케줄)         │
│                                                        │
└────────────────────────────────────────────────────────┘
        │ HTTPS
        ▼
┌─ Render Cloud (기존 서버) ────────────────────────────┐
│  Express + Supabase                                   │
│  /api/auto-import/config  ← 이미 Phase A 완료         │
│  /api/auto-import/heartbeat                           │
│  /api/auto-import/upload                              │
└───────────────────────────────────────────────────────┘
```

### 근거

- **Node.js 채택**: 이미 서버가 Express+TypeScript · **xlsx 파싱·검증 로직을 서버와 워커가 공유** 가능. Python 도입 시 동일 로직 이중 관리(테스트 · 배포).
- **Inno Setup 채택**: Korean.isl 공식 지원 · 한글 UI 완벽 · Windows 7~11 전 버전 호환 · MSIX 는 EV 인증서 비용($300+/년) 발생.
- **NSSM + Task Scheduler 하이브리드**: NSSM 만으로 부족한 정시 백업 스케줄 커버. 두 방식 병행이 실무 표준.
- **cronstrue + react-js-cron-mui**: 이미 백엔드가 cron 표현식 저장. UI 만 사람 친화(예: "매일 오전 8:00 → `0 8 * * *`" 실시간 변환).

---

## 3. Phase 별 구현 가이드

### Phase 1 (MVP · 3-4일) · Node 워커 + install.bat

- `worker/` 신설 · `package.json` 별도 · `xlsx` `node-fetch` `cronstrue` 의존
- `worker/index.js`: 설정 fetch → 파일 감시(chokidar) → 서버 upload → 결과 rename
- **`pkg .` 빌드** → `worker.exe` 단일 파일
- `install.bat` · `schtasks /create` 로 Task Scheduler 등록 (한 줄 명령)
- 웹 UI: cron 입력창 옆 **cronstrue 프리뷰 라벨** 추가 ("매일 오전 8:00에")
- **검증**: 로컬 Windows PC 로 실측 · 매장 배포 전 dry-run

### Phase 2 (베타 · 3일) · Inno Setup + 한글 UI

- Inno Setup 스크립트 (`installer.iss`)
  - `[Languages] Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"`
  - `[Files]` worker.exe · config.json 템플릿 · README-KR.txt
  - `[Run]` schtasks 자동 등록
  - `[UninstallRun]` schtasks 자동 삭제
- 서버 `/download/auto-import-installer-1.0.exe` 정적 제공
- 웹 UI 이미 있는 [설치 파일 다운로드] 활성화

### Phase 3 (안정화 · 2일) · NSSM 백그라운드 워커

- Task Scheduler(정시) + NSSM 서비스(watch) 이중화
- `nssm install MegatownAutoImport worker.exe --mode=watch`
- 로그 로테이션 · `nssm set MegatownAutoImport AppRotateFiles 1`
- 웹 UI 실시간 heartbeat 표시(이미 60초 폴링 있음)

### Phase 4 (확장 · 선택) · 자동 업데이트 + Tray App

- **자동 업데이트**: 워커가 시작 시 서버 `/api/auto-import/version` 조회 · 신버전 있으면 다운로드+재실행
- **Tray App(선택)**: WinForms/Tauri 로 트레이 아이콘 · 우클릭 "즉시 실행" · 로그 뷰어
- **DOP · Dry-run 모드**: 파일 upload 없이 검증만 · 사용자 신뢰 확보

---

## 4. 리스크 · 완화 방안

| 리스크 | 영향 | 완화 |
|---|---|---|
| xlsx 파일 락(락 · 엑셀 열려있음) | 임포트 실패 | chokidar `awaitWriteFinish` 옵션 + 3회 재시도 |
| 사용자 폴더 권한 부족 | 서비스 실행 실패 | Inno Setup `PrivilegesRequired=admin` + `ProgramData` 폴더 사용 |
| 한글 파일명 인코딩 | 서버 400 에러 | `Buffer.from(name, 'latin1').toString('utf8')` fallback · form-data 명시 |
| Windows Defender 오탐 | pkg exe 차단 | 코드사이닝 인증서(~15만원/년) 또는 사용자에게 SmartScreen 제외 안내 |
| Render 서버 다운 | 데이터 유실 | 워커 로컬 큐 · 24시간 재시도 · heartbeat 실패 시 웹 UI 빨간 배지 |
| 스케줄 · timezone 오해 | 새벽 실행 문제 | 서버·워커 모두 `Asia/Seoul` 명시 · cronstrue `locale: 'ko_KR'` |
| pkg 빌드 실패(native module) | 빌드 파이프라인 파괴 | xlsx · node-fetch 는 pure JS · native 의존 회피 |
| 사용자가 실수로 설정 삭제 | 무한 알림 | 설정 파일 자동 백업(config.bak) · 설치본에 기본값 포함 |

---

## 5. 우리 프로젝트 맥락(megatown-staff-scheduler)

- **기존 스택 완벽 활용**: Express+TypeScript+xlsx 이미 사용중 (`/api/import/*`). 워커는 서버 코드 일부 재사용 가능 (schemas · validators).
- **Framework 원칙 준수**: 워커 UI 는 이미 `SystemSettingsPage/AutoImportSection.tsx` (Phase E 완료) 존재. cronstrue 프리뷰만 추가하면 됨 · 새 프레임워크 필요 없음.
- **Render 배포 궁합**: 서버 endpoints (Phase A 완료) · installer 는 `public/downloads/`에 정적 파일 배치 → Render 무설정.
- **회귀 리스크 0**: 워커는 신규 `worker/` 폴더 · 기존 코드 미변경. Phase B~D 착수 시 최상위 대원칙 0 (회귀 X) 위배 없음.
- **후순위 결정 유지**: TASKS.md #253 후순위 · 별도 세션 진행 권장. Phase 1 MVP 완료 후 매장 파일럿 → 안정성 확인 후 Phase 2~4.

---

## 참고 · Sources

- 🟢 [Bun vs Node 2026 벤치마크](https://strapi.io/blog/bun-vs-nodejs-performance-comparison-guide)
- 🟢 [cronstrue GitHub](https://github.com/bradymholt/cRonstrue) · [npm](https://www.npmjs.com/package/cronstrue)
- 🟢 [@vpfaiz/cron-builder-ui shadcn](https://github.com/vpfaiz/cron-builder-ui)
- 🟢 [Tauri v2 System Tray](https://v2.tauri.app/learn/system-tray/) · [Tauri Sidecar](https://v2.tauri.app/develop/sidecar/)
- 🟢 [Prismatic On-Prem Agent Windows 가이드](https://prismatic.io/docs/integrations/connections/on-prem-agent/on-prem-agent-windows/)
- 🟡 [MakeUseOf: Task Scheduler → Docker 전환기](https://www.makeuseof.com/stopped-using-task-scheduler-after-switching-to-docker-containers/)
- 🟡 [PM2 vs NSSM Windows 2026](https://medium.com/@gzthomasliang/run-pm2-as-service-on-windows-server-in-modern-way-286b9f4b8228)
- 🟡 [Ptarmigan Labs: Windows Node 서비스](https://ptarmiganlabs.com/monitoring-auto-starting-node-js-services-windows-server/)
- 🟡 [Zoho Inventory Skyvia 스케줄 임포트](https://skyvia.com/data-integration/zoho-inventory-csv-file-import-and-export)
- 🟡 [Odoo Zoho Connector 크론 스케줄](https://webkul.com/blog/odoo-zoho-inventory-connector-documentation/)
- 🟡 [Silent Install Cheatsheet · MSI/NSIS/Inno](https://github.com/offlineinstallersetup/silent-install-cheatsheet)
- 🟡 [AlternativeTo: Inno Setup 6](https://alternativeto.net/software/inno-setup/)

**총 검색 6회 · 소스 12개 · 최신성 2026년 자료 우선**
