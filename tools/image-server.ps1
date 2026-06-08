param(
  [string]$StoreFolder = "",
  [string]$Folder = "",      # backward compat — old .bat passes -Folder
  [string]$OnlineFolder = "",
  [int]$Port = 9191
)

if ($StoreFolder -eq "" -and $Folder -ne "") { $StoreFolder = $Folder }

# ── Validate store folder ─────────────────────────────────────────────────────
if ($StoreFolder -eq "") {
  Write-Host ""
  Write-Host "ERROR: No store folder specified."
  Write-Host "Edit start-image-server.bat and set DEFAULT_STORE_FOLDER."
  Write-Host ""
  Read-Host "Press Enter to exit"
  exit 1
}
if (-not (Test-Path $StoreFolder)) {
  Write-Host ""
  Write-Host "ERROR: Store folder not found: $StoreFolder"
  Write-Host ""
  Write-Host "Edit start-image-server.bat and set DEFAULT_STORE_FOLDER to your store images path."
  Write-Host "Or drag-and-drop your store images folder onto start-image-server.bat."
  Write-Host ""
  Read-Host "Press Enter to exit"
  exit 1
}

$StoreFolder = (Resolve-Path $StoreFolder).Path
$imageExts = @('.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif')

# ── Scan store images ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Scanning store images in:"
Write-Host "  $StoreFolder"

$storeImages = Get-ChildItem $StoreFolder -File -Recurse |
  Where-Object { $imageExts -contains $_.Extension.ToLower() } |
  ForEach-Object { $_.FullName.Substring($StoreFolder.Length).TrimStart('\', '/').Replace('\', '/') }

$storeManifestPath = Join-Path $StoreFolder "manifest.json"
if ($storeImages.Count -eq 0) {
  Set-Content $storeManifestPath '[]' -Encoding ASCII
  $storeManifestJson = '[]'
} else {
  $storeManifestJson = '[' + (($storeImages | ForEach-Object { '"' + $_.Replace('\','/').Replace('"','\"') + '"' }) -join ',') + ']'
  Set-Content $storeManifestPath $storeManifestJson -Encoding ASCII
}

Write-Host "  $(@($storeImages).Count) store images indexed"
if ($storeImages.Count -eq 0) {
  Write-Host "  WARNING: No images found. Check DEFAULT_STORE_FOLDER in start-image-server.bat."
}

# ── Scan online images (optional) ─────────────────────────────────────────────
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
  Write-Host "  Set DEFAULT_ONLINE_FOLDER in start-image-server.bat to enable online images."
}

Write-Host ""

# ── Download dashboard from GitHub Pages ─────────────────────────────────────
Write-Host "Downloading latest dashboard..."
$dashboardHtml = $null
try {
  $dashboardHtml = (Invoke-WebRequest -Uri "https://harris658.github.io/zois-dashboard/" -UseBasicParsing -TimeoutSec 15).Content
  Write-Host "  Dashboard ready"
} catch {
  Write-Host "  Could not download dashboard (check internet connection)"
}
Write-Host ""

# ── Get local IP ──────────────────────────────────────────────────────────────
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Sort-Object { if ($_.InterfaceAlias -match 'Ethernet|Local') { 0 } else { 1 } } |
  Select-Object -First 1).IPAddress

if (-not $ip) { $ip = "localhost" }

# ── Open firewall port ────────────────────────────────────────────────────────
try {
  netsh advfirewall firewall delete rule name="ZOIS Image Server" 2>&1 | Out-Null
  netsh advfirewall firewall add rule name="ZOIS Image Server" dir=in action=allow protocol=TCP localport=$Port 2>&1 | Out-Null
} catch {}

# ── Register URL with Windows HTTP API ───────────────────────────────────────
try {
  netsh http delete urlacl url="http://+:$Port/" 2>&1 | Out-Null
  netsh http add urlacl url="http://+:$Port/" user=Everyone 2>&1 | Out-Null
} catch {}

# ── Start HTTP listener ───────────────────────────────────────────────────────
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$Port/")

try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "ERROR: Could not start server on port $Port."
  Write-Host "Try changing -Port 9191 to -Port 7777 in start-image-server.bat"
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
  Write-Host "  Store images  : http://$($ip):$Port/manifest.json"
  Write-Host "  Online images : http://$($ip):$Port/online/manifest.json"
} else {
  Write-Host "  Store images  : http://$($ip):$Port/manifest.json"
  Write-Host "  Online images : not configured (set DEFAULT_ONLINE_FOLDER in .bat)"
}
Write-Host ""
Write-Host "  Phone must be on same WiFi/network as this PC."
Write-Host "====================================================="
Write-Host ""
Write-Host "Press Ctrl+C to stop the server."
Write-Host ""

# ── Serve requests ────────────────────────────────────────────────────────────
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

    # ── Dashboard at root ─────────────────────────────────────────────────
    if ($urlPath -eq '' -or $urlPath -eq 'index.html') {
      if ($dashboardHtml) {
        $bytes = [Text.Encoding]::UTF8.GetBytes($dashboardHtml)
        $res.ContentType = "text/html; charset=utf-8"
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $fallback = "<html><body><h2>ZOIS Image Server</h2><p>Dashboard could not be downloaded. Open the dashboard from your phone: harris658.github.io/zois-dashboard</p></body></html>"
        $bytes = [Text.Encoding]::UTF8.GetBytes($fallback)
        $res.ContentType = "text/html"
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      }
      $res.Close()
      continue
    }

    # ── Online manifest ───────────────────────────────────────────────────
    if ($urlPath -eq 'online/manifest.json') {
      $bytes = [Text.Encoding]::UTF8.GetBytes($onlineManifestJson)
      $res.ContentType = "application/json"
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.Close()
      continue
    }

    # ── Online images ─────────────────────────────────────────────────────
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

    # ── Store images and manifest ─────────────────────────────────────────
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
  } catch {
    # Ignore individual connection errors
  }
}
