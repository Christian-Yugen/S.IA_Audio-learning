@echo off
cd /d "%~dp0"
where ffmpeg >nul 2>nul
if errorlevel 1 (
 echo Instale FFmpeg e adicione ao PATH antes de continuar.
 pause
 exit /b 1
)
if not exist .venv python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
if errorlevel 1 (
 pause
 exit /b 1
)
.venv\Scripts\python server.py --model base
pause
