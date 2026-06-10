@echo off
REM ════════════════════════════════════════════════════════════════════════
REM  ZOIS Dashboard — one-click stock publisher
REM
REM  Double-click this file after updating the stock Excel. It copies the
REM  Excel into the repo's data\ folder, commits, and pushes. GitHub then
REM  rebuilds (~60s) and every installed dashboard picks up the new stock
REM  the next time it is opened.
REM
REM  ONE-TIME SETUP (edit the two lines below):
REM    STOCK_FILE  = full path to the store stock Excel on this PC
REM    ONLINE_FILE = full path to the online stock Excel (optional —
REM                  leave empty to skip)
REM ════════════════════════════════════════════════════════════════════════

set "STOCK_FILE=C:\CHANGE\ME\stock.xlsx"
set "ONLINE_FILE="

cd /d "%~dp0.."

if "%STOCK_FILE%"=="C:\CHANGE\ME\stock.xlsx" (
  echo [!] First-time setup needed: open tools\publish-data.bat in Notepad
  echo     and set STOCK_FILE to where the stock Excel lives on this PC.
  pause
  exit /b 1
)
if not exist "%STOCK_FILE%" (
  echo [!] Stock file not found: %STOCK_FILE%
  pause
  exit /b 1
)

if not exist data mkdir data

REM Copy with the original extension (.xlsx/.xls/.csv), clearing old versions
for %%F in ("%STOCK_FILE%") do set "STOCK_EXT=%%~xF"
del /q data\store.* 2>nul
copy /y "%STOCK_FILE%" "data\store%STOCK_EXT%" >nul
echo [+] Copied store stock: %STOCK_FILE%

if defined ONLINE_FILE if exist "%ONLINE_FILE%" (
  for %%F in ("%ONLINE_FILE%") do set "ONLINE_EXT=%%~xF"
  del /q data\online.* 2>nul
  copy /y "%ONLINE_FILE%" "data\online%ONLINE_EXT%" >nul
  echo [+] Copied online stock: %ONLINE_FILE%
)

git pull --rebase
git add data
git diff --cached --quiet && (
  echo.
  echo [=] No changes — published data is already up to date.
  pause
  exit /b 0
)
git commit -m "data: stock update %date% %time%"
git push
if errorlevel 1 (
  echo.
  echo [!] Push failed — check the internet connection or git login, then retry.
  pause
  exit /b 1
)

echo.
echo [✓] Published. Staff get the new stock next time they open the dashboard
echo     ^(give GitHub ~60 seconds to rebuild^).
pause
