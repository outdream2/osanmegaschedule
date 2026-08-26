@echo off
REM scripts/auto_import/uninstall.bat
REM 2026-08-24 · #253 · Auto Import · Uninstall
REM 2026-08-26 · Fix · ASCII only

setlocal

echo ================================
echo Megatown Auto Import - Uninstall
echo ================================
echo.

schtasks /Delete /TN "MegatownAutoImport" /F > nul 2>&1
if errorlevel 1 (
  echo [!] Task Scheduler not registered - already removed
) else (
  echo [OK] Task Scheduler removed
)
echo.
echo Folders, logs, imported.json - please delete manually:
echo   %~dp0
echo   %USERPROFILE%\Downloads\megatown-importdata
echo.
pause
endlocal
