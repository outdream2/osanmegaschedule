@echo off
REM scripts/auto_import/install.bat
REM 2026-08-24 · #253 · 자동 임포트 · 원클릭 설치
REM   - 관리자 권한 우클릭 실행 (Windows Task Scheduler 등록에 필요)
REM   - 폴더 자동 생성 (사용자 Downloads 하위)
REM   - Task Scheduler 등록 (10분 주기)
REM   - 즉시 1회 실행 · heartbeat 확인

setlocal
chcp 65001 > nul

echo ================================
echo 메가타운 자동 임포트 · 설치
echo ================================
echo.

REM 1. Python 확인
where python >nul 2>nul
if errorlevel 1 (
  echo [X] Python 이 설치되지 않았습니다.
  echo     python.org 에서 Python 3.8+ 설치 후 재실행.
  pause
  exit /b 1
)
echo [OK] Python 감지
python --version
echo.

REM 2. requirements 설치
echo [.] requests 라이브러리 설치 중...
python -m pip install -r "%~dp0requirements.txt" > "%~dp0logs\pip.log" 2>&1
if errorlevel 1 (
  echo [X] pip install 실패 · logs\pip.log 확인
  pause
  exit /b 1
)
echo [OK] requests 설치 완료
echo.

REM 3. 임포트 폴더 자동 생성 (Downloads 하위)
set BASE=%USERPROFILE%\Downloads\megatown-importdata
if not exist "%BASE%" mkdir "%BASE%"
if not exist "%BASE%\products" mkdir "%BASE%\products"
if not exist "%BASE%\stock"    mkdir "%BASE%\stock"
if not exist "%BASE%\purchase" mkdir "%BASE%\purchase"
echo [OK] 임포트 폴더 생성:
echo      %BASE%\products
echo      %BASE%\stock
echo      %BASE%\purchase
echo.

REM 4. config.ini 확인
if not exist "%~dp0config.ini" (
  echo [!] config.ini 없음 · config.ini.example 를 복사하여 수동 편집 필요
  echo     %~dp0config.ini.example
  copy "%~dp0config.ini.example" "%~dp0config.ini" > nul
  echo [OK] config.ini 생성 · 관리자 credential 입력 필요 (notepad 열림)
  notepad "%~dp0config.ini"
) else (
  echo [OK] config.ini 존재
)
echo.

REM 5. Task Scheduler 등록 · 10분 주기 · 관리자 권한 필요
schtasks /Query /TN "MegatownAutoImport" > nul 2>&1
if not errorlevel 1 (
  echo [!] 기존 Task 삭제
  schtasks /Delete /TN "MegatownAutoImport" /F > nul
)
schtasks /Create /TN "MegatownAutoImport" /TR "\"%~dp0run.bat\"" /SC MINUTE /MO 10 /RL HIGHEST /F > nul
if errorlevel 1 (
  echo [X] Task Scheduler 등록 실패 · 관리자 권한 실행 필요
  pause
  exit /b 1
)
echo [OK] Task Scheduler 등록 (10분 주기)
echo.

REM 6. 즉시 1회 실행
if not exist "%~dp0logs" mkdir "%~dp0logs"
echo [.] 초기 실행 중...
call "%~dp0run.bat"
echo.

echo ================================
echo 설치 완료
echo ================================
echo 1. 웹앱 · 시스템 설정 · 자동 임포트 탭 · 상태 초록불 확인
echo 2. %BASE% 하위 폴더 · xlsx 파일 넣기
echo 3. 10분 이내 자동 임포트
echo ================================
pause
endlocal
