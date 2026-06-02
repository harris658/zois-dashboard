param(
  [Parameter(Mandatory=$true)][string]$Folder,
  [int]$Port = 9191
)

# Validate folder
if (-not (Test-Path $Folder)) {
  Write-Host ""
  Write-Host "ERROR: Folder not found: $Folder"
  Write-Host ""
  Write-Host "Edit start-image-server.bat and set DEFAULT_FOLDER to your images folder path."
  Write-Host "Or drag-and-drop your images folder onto start-image-server.bat."
  Write-Host ""
  Read-Host "Press Enter to exit"
  exit 1
}

$Folder = (Resolve-Path $Folder).Path
$imageExts = @('.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif')

# ── Step 1: Generate manifest.json (scans all subfolders) ─────────────────────
Write-Host ""
Write-Host "Scanning images in:"
Write-Host "  $Folder"
Write-Host ""

$images = Get-ChildItem $Folder -File -Recurse |
  Where-Object { $imageExts -contains $_.Extension.ToLower() } |
  ForEach-Object { $_.FullName.Substring($Folder.Length).TrimStart('\', '/').Replace('\', '/') }

$manifestPath = Join-Path $Folder "manifest.json"

if ($images.Count -eq 0) {
  Set-Content $manifestPath '[]' -Encoding ASCII
} else {
  $json = '[' + (($images | ForEach-Object { '"' + $_.Replace('\','/').Replace('"','\"') + '"' }) -join ',') + ']'
  Set-Content $manifestPath $json -Encoding ASCII
}

Write-Host "  $(@($images).Count) images indexed"
if ($images.Count -eq 0) {
  Write-Host "  WARNING: No images found. Check DEFAULT_FOLDER in start-image-server.bat."
}
Write-Host ""

# ── Step 2: Download dashboard from GitHub Pages ──────────────────────────────
Write-Host "Downloading latest dashboard..."
$dashboardHtml = $null
try {
  $dashboardHtml = (Invoke-WebRequest -Uri "https://harris658.github.io/zois-dashboard/" -UseBasicParsing -TimeoutSec 15).Content
  Write-Host "  Dashboard ready"
} catch {
  Write-Host "  Could not download dashboard (no internet?)"
  Write-Host "  Images will still be served — open the dashboard from GitHub on your phone"
}
Write-Host ""

# ── Step 3: Get local IP (prefer Ethernet) ────────────────────────────────────
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Sort-Object { if ($_.InterfaceAlias -match 'Ethernet|Local') { 0 } else { 1 } } |
  Select-Object -First 1).IPAddress

if (-not $ip) { $ip = "localhost" }

# ── Step 4: Open firewall port ────────────────────────────────────────────────
try {
  netsh advfirewall firewall delete rule name="ZOIS Image Server" 2>&1 | Out-Null
  netsh advfirewall firewall add rule name="ZOIS Image Server" dir=in action=allow protocol=TCP localport=$Port 2>&1 | Out-Null
} catch {}

# ── Step 5: Register URL with Windows HTTP API ────────────────────────────────
try {
  netsh http delete urlacl url="http://+:$Port/" 2>&1 | Out-Null
  netsh http add urlacl url="http://+:$Port/" user=Everyone 2>&1 | Out-Null
} catch {}

# ── Step 6: Start HTTP listener ───────────────────────────────────────────────
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$Port/")

try {
  $listener.Start()
} catch {
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
  Write-Host "  Open this on your phone's browser:"
  Write-Host "  http://$($ip):$Port"
  Write-Host ""
  Write-Host "  Dashboard + images load automatically."
} else {
  Write-Host "  Image server URL: http://$($ip):$Port"
  Write-Host "  (Dashboard download failed — use GitHub link on phone)"
}
Write-Host ""
Write-Host "  (Phone must be on same WiFi/network as this PC)"
Write-Host "====================================================="
Write-Host ""
Write-Host "Press Ctrl+C to stop the server."
Write-Host ""

# ── Step 7: Serve requests ────────────────────────────────────────────────────
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

    # Serve dashboard at root
    if ($urlPath -eq '' -or $urlPath -eq 'index.html') {
      if ($dashboardHtml) {
        $bytes = [Text.Encoding]::UTF8.GetBytes($dashboardHtml)
        $res.ContentType = "text/html; charset=utf-8"
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $msg = '<html><body style="font-family:sans-serif;padding:40px"><h2>ZOIS Image Server</h2><p>Images are being served but the dashboard could not be downloaded (no internet at startup).</p><p>Open the dashboard from your phone browser: <a href="https://harris658.github.io/zois-dashboard/">harris658.github.io/zois-dashboard</a></p></body></html>'
        $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
        $res.ContentType = "text/html"
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      }
      $res.Close()
      continue
    }

    # Serve images and manifest from the images folder
    $filePath = Join-Path $Folder $urlPath
    $resolvedPath = try { (Resolve-Path $filePath -ErrorAction Stop).Path } catch { $null }
    $folderWithSlash = $Folder.TrimEnd('\') + '\'

    if ($resolvedPath -and $resolvedPath.StartsWith($folderWithSlash)) {
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
