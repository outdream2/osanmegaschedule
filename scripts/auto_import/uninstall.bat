@echo off
REM scripts/auto_import/uninstall.bat
REM 2026-08-24 · #253 · 자동 임포트 · 제거

setlocal
chcp 65001 > nul

echo ================================
echo 메가타운 자동 임포트 · 제거
echo ================================
echo.

schtasks /Delete /TN "MegatownAutoImport" /F > nul 2>&1
if errorlevel 1 (
  echo [!] Task Scheduler 등록되지 않음 · 이미 제거됨
) else (
  echo [OK] Task Scheduler 제거
)
echo.
echo 폴더 · 로그 · imported.json · 수동 삭제 필요:
echo   %~dp0
echo   %USERPROFILE%\Downloads\megatown-importdata
echo.
pause
endlocal
