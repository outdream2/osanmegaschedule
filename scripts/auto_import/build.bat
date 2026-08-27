@echo off
REM scripts/auto_import/build.bat
REM 2026-08-27 · #77 · Developer build script - Create standalone EXE
REM 2026-08-27 · Fix · UTF-8 codepage · detailed errors · zip package auto
REM
REM Requirements (one-time):
REM   pip install pyinstaller requests watchdog
REM
REM Usage:
REM   Double-click build.bat OR run from CMD
REM
REM Output:
REM   dist/auto_import.exe (~15-20 MB · Python-free · distributable)
REM   dist/megatown-auto-import-portable.zip (배포용 · EXE + install/uninstall/config)

chcp 65001 > nul 2>nul
setlocal enableextensions
cd /d "%~dp0"

echo ================================
echo Megatown Auto Import - Build EXE
echo ================================
echo.

REM 1. Python check
where python >nul 2>nul
if errorlevel 1 (
  echo [X] Python not installed. Install Python 3.8+ from python.org
  pause
  exit /b 1
)
echo [OK] Python detected
python --version
echo.

REM 2. PyInstaller check
python -m pip show pyinstaller >nul 2>nul
if errorlevel 1 (
  echo [!] PyInstaller not installed. Installing...
  python -m pip install pyinstaller requests watchdog
  if errorlevel 1 (
    echo [X] Install failed
    pause
    exit /b 1
  )
)
echo [OK] PyInstaller ready
echo.

REM 3. Clean previous build
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist __pycache__ rmdir /s /q __pycache__
echo [OK] Cleaned previous build
echo.

REM 4. Build
if not exist logs mkdir logs
echo [*] Building auto_import.exe (may take 1-2 minutes)...
python -m PyInstaller auto_import.spec --clean --noconfirm > logs\build.log 2>&1
if errorlevel 1 (
  echo [X] Build failed. Details in logs\build.log
  echo.
  echo Last 15 lines of build.log:
  powershell -Command "Get-Content 'logs\build.log' -Tail 15"
  pause
  exit /b 1
)
echo [OK] Build finished
echo.

REM 5. Report + zip package auto (배포용)
if exist dist\auto_import.exe (
  echo ================================
  echo BUILD SUCCESS
  echo ================================
  echo Output: %~dp0dist\auto_import.exe
  dir dist\auto_import.exe | findstr auto_import
  echo.
  echo [*] Creating portable zip package...
  if exist dist\megatown-auto-import-portable.zip del /f /q dist\megatown-auto-import-portable.zip
  powershell -Command "Compress-Archive -Path 'dist\auto_import.exe','install.bat','uninstall.bat','config.ini.example','README.md','run.bat' -DestinationPath 'dist\megatown-auto-import-portable.zip' -Force"
  if exist dist\megatown-auto-import-portable.zip (
    echo [OK] Zip created: dist\megatown-auto-import-portable.zip
    dir dist\megatown-auto-import-portable.zip | findstr portable
  ) else (
    echo [!] Zip creation skipped (powershell Compress-Archive not available)
  )
  echo.
  echo Next steps:
  echo   1. Send dist\megatown-auto-import-portable.zip to users
  echo   2. Users unzip, right-click install.bat, run as admin
) else (
  echo [X] Build succeeded but EXE not found
  exit /b 1
)

pause
