@echo off
REM scripts/auto_import/install.bat
REM 2026-08-24 · #253 · Auto Import · One-Click Install
REM 2026-08-26 · Fix · ASCII only (Korean text broke on some CMD encodings)
REM 2026-08-27 · Fix · admin elevation auto · file existence check · UTF-8 codepage
REM   - Run as Administrator (needed for Task Scheduler)
REM   - Creates folders under user Downloads
REM   - Registers Task Scheduler (10 min interval)
REM   - Runs once immediately

chcp 65001 > nul 2>nul
setlocal enableextensions

REM 0. Admin check + auto elevate
net session >nul 2>&1
if errorlevel 1 (
  echo [!] Administrator privileges required.
  echo     Requesting elevation...
  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

echo ================================
echo Megatown Auto Import - Install
echo ================================
echo Script folder: %~dp0
echo.

REM 0.5. Required files check
set MISSING=0
for %%F in (auto_import.py requirements.txt run.bat config.ini.example) do (
  if not exist "%~dp0%%F" (
    echo [X] Missing file: %%F
    set MISSING=1
  )
)
if "%MISSING%"=="1" (
  echo.
  echo Please extract the full installer zip and re-run.
  pause
  exit /b 1
)
echo [OK] All required files present
echo.

REM 1. Python check
where python >nul 2>nul
if errorlevel 1 (
  echo [X] Python not installed.
  echo     Please install Python 3.8+ from https://python.org and re-run.
  echo     Or use PyInstaller EXE version (no Python needed).
  pause
  exit /b 1
)
echo [OK] Python detected
python --version
echo.

REM 2. requirements install
if not exist "%~dp0logs" mkdir "%~dp0logs"
echo [.] Installing Python packages (requests, watchdog)...
python -m pip install --upgrade pip > "%~dp0logs\pip.log" 2>&1
python -m pip install -r "%~dp0requirements.txt" >> "%~dp0logs\pip.log" 2>&1
if errorlevel 1 (
  echo [X] pip install failed. Details in logs\pip.log
  echo.
  echo Last 10 lines of pip.log:
  powershell -Command "Get-Content '%~dp0logs\pip.log' -Tail 10"
  pause
  exit /b 1
)
echo [OK] Python packages installed
echo.

REM 3. Import folders (under Downloads)
set BASE=%USERPROFILE%\Downloads\megatown-importdata
if not exist "%BASE%" mkdir "%BASE%"
if not exist "%BASE%\products" mkdir "%BASE%\products"
if not exist "%BASE%\stock"    mkdir "%BASE%\stock"
if not exist "%BASE%\purchase" mkdir "%BASE%\purchase"
echo [OK] Import folders created:
echo      %BASE%\products
echo      %BASE%\stock
echo      %BASE%\purchase
echo.

REM 4. config.ini check
if not exist "%~dp0config.ini" (
  echo [!] config.ini not found. Copying from example...
  copy "%~dp0config.ini.example" "%~dp0config.ini" > nul
  echo [OK] config.ini created. Please edit admin credentials (notepad opens).
  notepad "%~dp0config.ini"
) else (
  echo [OK] config.ini exists
)
echo.

REM 5. Task Scheduler register (10 min interval, needs admin)
schtasks /Query /TN "MegatownAutoImport" > nul 2>&1
if not errorlevel 1 (
  echo [!] Removing existing Task
  schtasks /Delete /TN "MegatownAutoImport" /F > nul
)
schtasks /Create /TN "MegatownAutoImport" /TR "\"%~dp0run.bat\"" /SC MINUTE /MO 10 /RL HIGHEST /F > nul
if errorlevel 1 (
  echo [X] Task Scheduler registration failed. Run as Administrator.
  pause
  exit /b 1
)
echo [OK] Task Scheduler registered (10 min interval)
echo.

REM 6. Run once now
echo [.] Initial run...
call "%~dp0run.bat"
echo.

echo ================================
echo Install complete
echo ================================
echo 1. Web app - System Settings - Auto Import tab - check green status
echo 2. Drop xlsx files into subfolders of %BASE%
echo 3. Auto imported within 10 minutes
echo ================================
pause
endlocal
