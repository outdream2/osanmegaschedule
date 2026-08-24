@echo off
REM scripts/auto_import/run.bat
REM 2026-08-24 · #253 · Task Scheduler 트리거 · auto_import.py 실행
REM   - Python 3.8+ · pip install -r requirements.txt 사전 완료 필요
REM   - stdout/stderr · logs\run.log 에 append

cd /d %~dp0
if not exist logs mkdir logs
python auto_import.py >> logs\run.log 2>&1
exit /b %ERRORLEVEL%
