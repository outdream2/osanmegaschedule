# 메가타운 자동 임포트 · 설치 안내

## 개요
Windows PC 에 설치하여 · 로컬 폴더의 xlsx 파일을 자동으로 서버에 임포트하는 스크립트.

## 요구사항
- Windows 10/11
- Python 3.8+ ([python.org](https://www.python.org/downloads/) 에서 다운로드)
- 관리자 (lv9) 계정 · 웹앱 로그인

## 설치 (원클릭)

1. **7개 파일 다운로드** · 웹앱 시스템 설정 · 자동 임포트 탭 · 파일 개별 링크
   - `auto_import.py`
   - `config.ini.example`
   - `install.bat`
   - `uninstall.bat`
   - `run.bat`
   - `requirements.txt`
   - `README.md`

2. **한 폴더에 저장** (예: `D:\megatown-auto-import\`)

3. **install.bat 우클릭 · 관리자 권한 실행**
   - Python 설치 확인
   - requests 라이브러리 자동 설치
   - Downloads 하위 임포트 폴더 자동 생성
     - `%USERPROFILE%\Downloads\megatown-importdata\products`
     - `%USERPROFILE%\Downloads\megatown-importdata\stock`
     - `%USERPROFILE%\Downloads\megatown-importdata\purchase`
   - config.ini 없으면 자동 복사 · 관리자 credential 입력 (notepad 자동 열림)
   - Windows Task Scheduler 등록 (10분 주기)
   - 즉시 1회 실행 · 로그 확인

4. **웹앱 확인** · 시스템 설정 · 자동 임포트 · 상태 초록불 (heartbeat 수신)

## 사용

- xlsx 파일을 해당 폴더에 넣기:
  - 상품 · `products` 폴더 (파일명 자유)
  - 재고 · `stock` 폴더 (파일명: `stock_YYYYMMDD_YYYYMMDD.xlsx` 권장)
  - 매입 · `purchase` 폴더 (파일명: `purchase_YYYYMMDD_YYYYMMDD.xlsx` 권장)
- 웹앱 · 자동 임포트 활성화 (토글 ON)
- 카테고리별 · interval 설정 (10분 ~ 매일)
  - 매일 선택 시 · 실행 시각 (HH:MM) 지정

## 파일 처리 결과
- 성공 · `_processed/` 로 자동 이동 (표준 파일명 rename)
- 실패 · `_failed/` 로 이동 · `.log` 함께

## 이력 · 로그
- 로컬 · `logs/auto_import_YYYY-MM-DD.log` (스크립트 실행)
- 서버 · 시스템 설정 · 자동 임포트 · 상태 표시 (마지막 실행 · 처리 건수 · 에러)

## 제거
- `uninstall.bat` 실행 · Task Scheduler 제거
- 폴더 · 로그 · imported.json 수동 삭제

## 트러블슈팅

**Q. 상태가 오프라인 (빨간불)**
- PC 켜져 있는지 확인
- Task Scheduler 등록 확인 (`taskschd.msc` · MegatownAutoImport)
- `logs/run.log` 확인 · 에러 있으면 다음 항목 참고

**Q. 로그인 실패**
- config.ini · admin_phone · admin_password 확인
- 관리자 (lv9) 계정 이어야 함

**Q. 서버 config 조회 실패 (401/403)**
- config.ini credential 재확인
- 웹앱 로그인 · lv9 확인

**Q. 파일이 임포트 되지 않음**
- 파일명 규칙 확인 · stock/purchase 는 날짜 필요
- 폴더 경로 · 웹앱 설정 값과 일치 확인
- interval 미경과 · logs 에서 "skip" 확인

**Q. 매일 실행이 지연됨**
- interval=1440 · daily_times 시각 도달 후 · 다음 Task Scheduler tick (최대 10분 지연)
