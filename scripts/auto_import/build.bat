@echo off
REM scripts/auto_import/build.bat
REM 2026-08-27 · #77 · Developer build script - Create standalone EXE
REM
REM Requirements (one-time):
REM   pip install pyinstaller requests watchdog
REM
REM Usage:
REM   Double-click build.bat OR run from CMD
REM
REM Output:
REM   dist/auto_import.exe (~15-20 MB · Python-free · distributable)

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
echo [*] Building auto_import.exe (may take 1-2 minutes)...
python -m PyInstaller auto_import.spec --clean --noconfirm
if errorlevel 1 (
  echo [X] Build failed
  pause
  exit /b 1
)
echo.

REM 5. Report
if exist dist\auto_import.exe (
  echo ================================
  echo BUILD SUCCESS
  echo ================================
  echo Output: %~dp0dist\auto_import.exe
  dir dist\auto_import.exe | findstr auto_import
  echo.
  echo Next steps:
  echo   1. Copy dist\auto_import.exe to distribution folder
  echo   2. Copy install.bat + uninstall.bat + config.ini.example + README.md
  echo   3. Zip and distribute to users
) else (
  echo [X] Build succeeded but EXE not found
  exit /b 1
)

pause
