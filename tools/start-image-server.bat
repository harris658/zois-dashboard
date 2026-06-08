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
  powershell -Command "Start-Process '%~f0' -ArgumentList '%STORE_FOLDER%','%ONLINE_FOLDER%' -Verb RunAs"
  exit /b
)

:: Download the latest server script from GitHub
echo Downloading latest server script...
set PS1_DEST=%TEMP%\zois-image-server.ps1
set PS1_URL=https://raw.githubusercontent.com/harris658/zois-dashboard/main/tools/image-server.ps1

:: Try WebClient with TLS 1.2 first
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('%PS1_URL%', '%PS1_DEST%')"

:: If file still missing, try Invoke-WebRequest
if not exist "%PS1_DEST%" (
  powershell -NoProfile -Command "Invoke-WebRequest -Uri '%PS1_URL%' -OutFile '%PS1_DEST%' -UseBasicParsing"
)

:: If still missing, try local copy
if not exist "%PS1_DEST%" (
  echo WARNING: Download failed. Trying local copy...
  copy "%~dp0image-server.ps1" "%PS1_DEST%" >nul 2>&1
)

:: If nothing worked, bail with a clear message
if not exist "%PS1_DEST%" (
  echo.
  echo ERROR: Could not download image-server.ps1.
  echo Download it manually from:
  echo   https://github.com/harris658/zois-dashboard/blob/main/tools/image-server.ps1
  echo Place it in the same folder as this .bat file and try again.
  echo.
  pause
  exit /b 1
)

:: Run the server
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1_DEST%" -StoreFolder "%STORE_FOLDER%" -OnlineFolder "%ONLINE_FOLDER%" -Port 9191
pause
