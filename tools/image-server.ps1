param(
  [Parameter(Mandatory=$true)][string]$Folder,
  [int]$Port = 8080
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

# ── Step 1: Generate manifest.json ───────────────────────────────────────────
Write-Host ""
Write-Host "Scanning images in:"
Write-Host "  $Folder"
Write-Host ""

$images = Get-ChildItem $Folder -File |
  Where-Object { $imageExts -contains $_.Extension.ToLower() } |
  Select-Object -ExpandProperty Name

$manifestPath = Join-Path $Folder "manifest.json"
$images | ConvertTo-Json -Compress | Set-Content $manifestPath -Encoding UTF8

Write-Host "  $($images.Count) images indexed"
Write-Host ""

# ── Step 2: Get local IP ──────────────────────────────────────────────────────
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -First 1).IPAddress

if (-not $ip) { $ip = "localhost" }

# ── Step 3: Register URL with Windows (needed for network access) ─────────────
try {
  netsh http add urlacl url="http://+:$Port/" user=Everyone 2>&1 | Out-Null
} catch {}

# ── Step 4: Start HTTP listener ───────────────────────────────────────────────
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$Port/")

try {
  $listener.Start()
} catch {
  Write-Host "ERROR: Could not start server."
  Write-Host "Make sure you ran start-image-server.bat as Administrator."
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
Write-Host "  (Both devices must be on the same WiFi)"
Write-Host "====================================================="
Write-Host ""
Write-Host "Press Ctrl+C to stop the server."
Write-Host ""

# ── Step 5: Serve requests ────────────────────────────────────────────────────
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
    if ($resolvedPath -and $resolvedPath.StartsWith($Folder)) {
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
