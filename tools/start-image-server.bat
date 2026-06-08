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

if "%~1"=="" ( set STORE_FOLDER=%DEFAULT_STORE_FOLDER% ) else ( set STORE_FOLDER=%~1 )
if "%~2"=="" ( set ONLINE_FOLDER=%DEFAULT_ONLINE_FOLDER% ) else ( set ONLINE_FOLDER=%~2 )

net session >nul 2>&1
if %errorLevel% neq 0 (
  echo Requesting administrator access...
  powershell -Command "Start-Process '%~f0' -ArgumentList '%STORE_FOLDER%','%ONLINE_FOLDER%' -Verb RunAs"
  exit /b
)

:: Pass paths via env vars to avoid quoting issues, then extract + run embedded PS
set ZOIS_STORE=%STORE_FOLDER%
set ZOIS_ONLINE=%ONLINE_FOLDER%
set ZOIS_BAT=%~f0

powershell -NoProfile -ExecutionPolicy Bypass -Command "$l=(Get-Content -LiteralPath $env:ZOIS_BAT); $n=($l | Select-String '^##PS##' | Select-Object -First 1).LineNumber; $f=[IO.Path]::GetTempPath()+'zois-srv.ps1'; ($l[$n..($l.Length-1)]) | Set-Content $f -Encoding UTF8; & $f -StoreFolder $env:ZOIS_STORE -OnlineFolder $env:ZOIS_ONLINE -Port 9191"
pause
exit /b

##PS##
param(
  [string]$StoreFolder = "",
  [string]$Folder = "",
  [string]$OnlineFolder = "",
  [int]$Port = 9191
)

if ($StoreFolder) { $StoreFolder = $StoreFolder.Trim() }
if ($OnlineFolder) { $OnlineFolder = $OnlineFolder.Trim() }
if ($Folder)       { $Folder       = $Folder.Trim() }

if ($StoreFolder -eq "" -and $Folder -ne "") { $StoreFolder = $Folder }

if ($StoreFolder -eq "") {
  Write-Host ""
  Write-Host "ERROR: No store folder specified."
  Write-Host "Edit this .bat file and set DEFAULT_STORE_FOLDER."
  Write-Host ""
  Read-Host "Press Enter to exit"
  exit 1
}
if (-not (Test-Path $StoreFolder)) {
  Write-Host ""
  Write-Host "ERROR: Store folder not found: $StoreFolder"
  Write-Host ""
  Write-Host "Edit this .bat file and set DEFAULT_STORE_FOLDER to your store images path."
  Write-Host "Or drag-and-drop your store images folder onto this .bat file."
  Write-Host ""
  Read-Host "Press Enter to exit"
  exit 1
}

$StoreFolder = (Resolve-Path $StoreFolder).Path
$imageExts = @('.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif')

Write-Host ""
Write-Host "Scanning store images in:"
Write-Host "  $StoreFolder"

$storeImages = Get-ChildItem $StoreFolder -File -Recurse |
  Where-Object { $imageExts -contains $_.Extension.ToLower() } |
  ForEach-Object { $_.FullName.Substring($StoreFolder.Length).TrimStart('\', '/').Replace('\', '/') }

if ($storeImages.Count -eq 0) {
  $storeManifestJson = '[]'
} else {
  $storeManifestJson = '[' + (($storeImages | ForEach-Object { '"' + $_.Replace('\','/').Replace('"','\"') + '"' }) -join ',') + ']'
}

Write-Host "  $(@($storeImages).Count) store images indexed"
if ($storeImages.Count -eq 0) {
  Write-Host "  WARNING: No images found. Check DEFAULT_STORE_FOLDER in the .bat file."
}

$onlineManifestJson = '[]'
$onlineReady = $false

if ($OnlineFolder -ne "" -and (Test-Path $OnlineFolder)) {
  $OnlineFolder = (Resolve-Path $OnlineFolder).Path
  Write-Host ""
  Write-Host "Scanning online images in:"
  Write-Host "  $OnlineFolder"

  $onlineImages = Get-ChildItem $OnlineFolder -File -Recurse |
    Where-Object { $imageExts -contains $_.Extension.ToLower() } |
    ForEach-Object { $_.FullName.Substring($OnlineFolder.Length).TrimStart('\', '/').Replace('\', '/') }

  if ($onlineImages.Count -gt 0) {
    $onlineManifestJson = '[' + (($onlineImages | ForEach-Object { '"' + $_.Replace('\','/').Replace('"','\"') + '"' }) -join ',') + ']'
  }
  $onlineReady = $true
  Write-Host "  $(@($onlineImages).Count) online images indexed"
} elseif ($OnlineFolder -ne "") {
  Write-Host ""
  Write-Host "WARNING: Online folder not found: $OnlineFolder"
  Write-Host "  Set DEFAULT_ONLINE_FOLDER in the .bat file to enable online images."
}

Write-Host ""
Write-Host "Downloading latest dashboard..."
$dashboardHtml = $null
try {
  $dashboardHtml = (Invoke-WebRequest -Uri "https://harris658.github.io/zois-dashboard/" -UseBasicParsing -TimeoutSec 15).Content
  Write-Host "  Dashboard ready"
} catch {
  Write-Host "  Could not download dashboard (check internet connection)"
}
Write-Host ""

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Sort-Object { if ($_.InterfaceAlias -match 'Ethernet|Local') { 0 } else { 1 } } |
  Select-Object -First 1).IPAddress
if (-not $ip) { $ip = "localhost" }

try {
  netsh advfirewall firewall delete rule name="ZOIS Image Server" 2>&1 | Out-Null
  netsh advfirewall firewall add rule name="ZOIS Image Server" dir=in action=allow protocol=TCP localport=$Port 2>&1 | Out-Null
} catch {}

try {
  netsh http delete urlacl url="http://+:$Port/" 2>&1 | Out-Null
  netsh http add urlacl url="http://+:$Port/" user=Everyone 2>&1 | Out-Null
} catch {}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$Port/")

try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "ERROR: Could not start server on port $Port."
  Write-Host "Try changing -Port 9191 to a different port in the .bat file."
  Write-Host ""
  Read-Host "Press Enter to exit"
  exit 1
}

Write-Host "====================================================="
Write-Host "  ZOIS Image Server is running!"
Write-Host ""
if ($dashboardHtml) {
  Write-Host "  Open this URL on your phone browser:"
  Write-Host "  http://$($ip):$Port"
  Write-Host ""
  Write-Host "  Dashboard + images load automatically."
} else {
  Write-Host "  Image server: http://$($ip):$Port"
  Write-Host "  Dashboard download failed - open GitHub link on phone instead."
}
Write-Host ""
if ($onlineReady) {
  Write-Host "  Store images  : /manifest.json"
  Write-Host "  Online images : /online/manifest.json"
} else {
  Write-Host "  Store images  : /manifest.json"
  Write-Host "  Online images : not configured (set DEFAULT_ONLINE_FOLDER in .bat)"
}
Write-Host ""
Write-Host "  Phone must be on same WiFi/network as this PC."
Write-Host "====================================================="
Write-Host ""
Write-Host "Press Ctrl+C to stop the server."
Write-Host ""

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    $res.Headers.Add("Access-Control-Allow-Origin", "*")
    $res.Headers.Add("Access-Control-Allow-Methods", "GET, OPTIONS")

    if ($req.HttpMethod -eq "OPTIONS") {
      $res.StatusCode = 204
      $res.Close()
      continue
    }

    $urlPath = [Uri]::UnescapeDataString($req.Url.LocalPath.TrimStart('/'))

    if ($urlPath -eq '' -or $urlPath -eq 'index.html') {
      if ($dashboardHtml) {
        $bytes = [Text.Encoding]::UTF8.GetBytes($dashboardHtml)
        $res.ContentType = "text/html; charset=utf-8"
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $fallback = "<html><body><h2>ZOIS Image Server</h2><p>Dashboard could not be downloaded. Open harris658.github.io/zois-dashboard on your phone.</p></body></html>"
        $bytes = [Text.Encoding]::UTF8.GetBytes($fallback)
        $res.ContentType = "text/html"
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      }
      $res.Close()
      continue
    }

    if ($urlPath -eq 'manifest.json') {
      $bytes = [Text.Encoding]::UTF8.GetBytes($storeManifestJson)
      $res.ContentType = "application/json"
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.Close()
      continue
    }

    if ($urlPath -eq 'online/manifest.json') {
      $bytes = [Text.Encoding]::UTF8.GetBytes($onlineManifestJson)
      $res.ContentType = "application/json"
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.Close()
      continue
    }

    if ($urlPath.StartsWith('online/') -and $onlineReady) {
      $relPath = $urlPath.Substring('online/'.Length)
      $filePath = Join-Path $OnlineFolder $relPath
      $resolvedPath = try { (Resolve-Path $filePath -ErrorAction Stop).Path } catch { $null }
      $onlineFolderWithSlash = $OnlineFolder.TrimEnd('\') + '\'
      if ($resolvedPath -and $resolvedPath.StartsWith($onlineFolderWithSlash) -and (Test-Path $resolvedPath -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($resolvedPath)
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
      }
      $res.Close()
      continue
    }

    $filePath = Join-Path $StoreFolder $urlPath
    $resolvedPath = try { (Resolve-Path $filePath -ErrorAction Stop).Path } catch { $null }
    $storeFolderWithSlash = $StoreFolder.TrimEnd('\') + '\'
    if ($resolvedPath -and $resolvedPath.StartsWith($storeFolderWithSlash)) {
      if (Test-Path $resolvedPath -PathType Leaf) {
        $bytes = [IO.File]::ReadAllBytes($resolvedPath)
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
      }
    } else {
      $res.StatusCode = 404
    }

    $res.Close()
  } catch {}
}
