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

# Recurse into all subfolders, store relative paths (using forward slashes for URLs)
$images = Get-ChildItem $Folder -File -Recurse |
  Where-Object { $imageExts -contains $_.Extension.ToLower() } |
  ForEach-Object { $_.FullName.Substring($Folder.Length).TrimStart('\', '/').Replace('\', '/') }

$manifestPath = Join-Path $Folder "manifest.json"

# Always write a valid JSON array (even if empty)
if ($images.Count -eq 0) {
  Set-Content $manifestPath '[]' -Encoding ASCII
} else {
  # Force array wrapper so single-item result stays [...] not just "string"
  $json = '[' + (($images | ForEach-Object { '"' + $_.Replace('"','\"') + '"' }) -join ',') + ']'
  Set-Content $manifestPath $json -Encoding ASCII
}

Write-Host "  $($images.Count) images indexed"
if ($images.Count -eq 0) {
  Write-Host ""
  Write-Host "  WARNING: No images found in this folder."
  Write-Host "  Make sure DEFAULT_FOLDER in start-image-server.bat points to your images folder."
}
Write-Host ""

# ── Step 2: Get local IP (prefer Ethernet) ────────────────────────────────────
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Sort-Object { if ($_.InterfaceAlias -match 'Ethernet|Local') { 0 } else { 1 } } |
  Select-Object -First 1).IPAddress

if (-not $ip) { $ip = "localhost" }

# ── Step 3: Open firewall port ────────────────────────────────────────────────
try {
  netsh advfirewall firewall delete rule name="ZOIS Image Server" 2>&1 | Out-Null
  netsh advfirewall firewall add rule name="ZOIS Image Server" dir=in action=allow protocol=TCP localport=$Port 2>&1 | Out-Null
} catch {}

# ── Step 4: Register URL with Windows HTTP API ────────────────────────────────
try {
  netsh http delete urlacl url="http://+:$Port/" 2>&1 | Out-Null
  netsh http add urlacl url="http://+:$Port/" user=Everyone 2>&1 | Out-Null
} catch {}

# ── Step 5: Start HTTP listener ───────────────────────────────────────────────
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$Port/")

try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "ERROR: Could not start server on port $Port."
  Write-Host "Try editing start-image-server.bat and changing -Port 9191 to -Port 7777"
  Write-Host ""
  Read-Host "Press Enter to exit"
  exit 1
}

Write-Host "====================================================="
Write-Host "  ZOIS Image Server is running!"
Write-Host ""
Write-Host "  Enter this URL in the ZOIS Dashboard:"
Write-Host "  http://$($ip):$Port"
Write-Host ""
Write-Host "  (Phone must be on same WiFi/network as this PC)"
Write-Host "====================================================="
Write-Host ""
Write-Host "Press Ctrl+C to stop the server."
Write-Host ""

# ── Step 6: Serve requests ────────────────────────────────────────────────────
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
    $filePath = Join-Path $Folder $urlPath

    # Security: don't serve files outside the images folder
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
      $res.StatusCode = 403
    }

    $res.Close()
  } catch {
    # Ignore individual connection errors
  }
}
