@echo off
title ZOIS Image Server

:: ─────────────────────────────────────────────────────────────────────────────
:: Set your images folder paths below.
:: You can also drag-and-drop folders onto this .bat file:
::   - Drag ONE folder  → used as Store images
::   - Drag TWO folders → first = Store, second = Online
:: ─────────────────────────────────────────────────────────────────────────────
set DEFAULT_STORE_FOLDER=D:\Shoper9\Images
set DEFAULT_ONLINE_FOLDER=
:: ─────────────────────────────────────────────────────────────────────────────

:: Use drag-dropped folders if provided, otherwise use defaults above
if "%~1"=="" (
  set STORE_FOLDER=%DEFAULT_STORE_FOLDER%
) else (
  set STORE_FOLDER=%~1
)

if "%~2"=="" (
  set ONLINE_FOLDER=%DEFAULT_ONLINE_FOLDER%
) else (
  set ONLINE_FOLDER=%~2
)

:: Request admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
  echo Requesting administrator access...
  powershell -Command "Start-Process '%~f0' -ArgumentList '`"%STORE_FOLDER%`"','`"%ONLINE_FOLDER%`"' -Verb RunAs"
  exit /b
)

:: Always download the latest server script from GitHub
echo Downloading latest server script...
powershell -NoProfile -Command "(New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/harris658/zois-dashboard/main/tools/image-server.ps1', '%TEMP%\zois-image-server.ps1')"
if %errorLevel% neq 0 (
  echo WARNING: Could not download script. Using local copy if available.
  copy "%~dp0image-server.ps1" "%TEMP%\zois-image-server.ps1" >nul 2>&1
)

:: Run the server
powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\zois-image-server.ps1" -StoreFolder "%STORE_FOLDER%" -OnlineFolder "%ONLINE_FOLDER%" -Port 9191
pause
