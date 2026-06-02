@echo off
title ZOIS Image Server

:: ─────────────────────────────────────────────────────────────────────────────
:: Set your images folder path below.
:: You can also drag-and-drop your images folder onto this .bat file instead.
:: ─────────────────────────────────────────────────────────────────────────────
set DEFAULT_FOLDER=D:\Shoper9\Images
:: ─────────────────────────────────────────────────────────────────────────────

:: Use drag-dropped folder if provided, otherwise use default above
if "%~1"=="" (
  set IMAGES_FOLDER=%DEFAULT_FOLDER%
) else (
  set IMAGES_FOLDER=%~1
)

:: Request admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
  echo Requesting administrator access...
  powershell -Command "Start-Process '%~f0' -ArgumentList '%IMAGES_FOLDER%' -Verb RunAs"
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
powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\zois-image-server.ps1" -Folder "%IMAGES_FOLDER%" -Port 9191
pause
