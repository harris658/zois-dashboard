@echo off
title ZOIS Image Server

:: ─────────────────────────────────────────────────────────────────────────────
:: Set your images folder path below.
:: You can also drag-and-drop your images folder onto this .bat file instead.
:: ─────────────────────────────────────────────────────────────────────────────
set DEFAULT_FOLDER=C:\ZOIS Images\Products
:: ─────────────────────────────────────────────────────────────────────────────

:: Use drag-dropped folder if provided, otherwise use default above
if "%~1"=="" (
  set IMAGES_FOLDER=%DEFAULT_FOLDER%
) else (
  set IMAGES_FOLDER=%~1
)

:: Request admin privileges (needed so other devices can connect)
net session >nul 2>&1
if %errorLevel% neq 0 (
  echo Requesting administrator access...
  powershell -Command "Start-Process '%~f0' -ArgumentList '%IMAGES_FOLDER%' -Verb RunAs"
  exit /b
)

:: Launch the PowerShell server script
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0image-server.ps1" -Folder "%IMAGES_FOLDER%"
pause
