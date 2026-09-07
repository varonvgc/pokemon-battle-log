param(
    [int]$Port = 8000,
    [string]$Root = ""
)

if (-not $Root) {
    if ($PSScriptRoot) {
        $Root = Split-Path -Parent $PSScriptRoot
    } else {
        $Root = (Get-Location).Path
    }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")

try {
    $listener.Start()
    Write-Host "=================================================" -ForegroundColor Green
    Write-Host " [Web Server Started]" -ForegroundColor Green
    Write-Host " URL: http://localhost:$Port/test/video_test_runner.html" -ForegroundColor Cyan
    Write-Host " Root Directory: $Root" -ForegroundColor Yellow
    Write-Host " Press Ctrl+C to stop." -ForegroundColor Gray
    Write-Host "=================================================" -ForegroundColor Green
} catch {
    Write-Host "Failed to start listener on port $Port : $_" -ForegroundColor Red
    exit 1
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".mjs"  = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".mp4"  = "video/mp4"
    ".webm" = "video/webm"
    ".wasm" = "application/wasm"
    ".ico"  = "image/x-icon"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            $req = $context.Request
            $res = $context.Response
            $res.AddHeader("Access-Control-Allow-Origin", "*")
            $res.AddHeader("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS")
            $res.AddHeader("Access-Control-Allow-Headers", "*")

            if ($req.HttpMethod -eq "OPTIONS") {
                $res.StatusCode = 200
                $res.Close()
                continue
            }

            $rawUrl = $req.Url.AbsolutePath
            $decodedUrl = [System.Uri]::UnescapeDataString($rawUrl)
            if ($decodedUrl -eq "/" -or $decodedUrl -eq "") {
                $decodedUrl = "/index.html"
            }

            $relPath = $decodedUrl.TrimStart("/\").Replace("/", "\")
            $filePath = Join-Path $Root $relPath

            if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
                $res.StatusCode = 404
                $res.ContentType = "text/plain; charset=utf-8"
                if ($req.HttpMethod -ne "HEAD") {
                    $buf = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $decodedUrl")
                    $res.ContentLength64 = $buf.Length
                    $res.OutputStream.Write($buf, 0, $buf.Length)
                }
                $res.Close()
                continue
            }

            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
            $res.ContentType = $contentType
            $res.AddHeader("Accept-Ranges", "bytes")

            $fileInfo = New-Object System.IO.FileInfo($filePath)
            $fileLen = $fileInfo.Length

            $rangeHeader = $req.Headers["Range"]
            if ($rangeHeader -and $rangeHeader -match "bytes=(\d*)-(\d*)") {
                $startStr = $matches[1]
                $endStr = $matches[2]
                $start = if ($startStr) { [int64]$startStr } else { 0 }
                $end = if ($endStr) { [int64]$endStr } else { $fileLen - 1 }
                if ($end -ge $fileLen) { $end = $fileLen - 1 }

                $length = $end - $start + 1
                $res.StatusCode = 206
                $res.AddHeader("Content-Range", "bytes $start-$end/$fileLen")
                $res.ContentLength64 = $length

                if ($req.HttpMethod -ne "HEAD") {
                    $fs = [System.IO.File]::OpenRead($filePath)
                    try {
                        $fs.Seek($start, [System.IO.SeekOrigin]::Begin) | Out-Null
                        $buf = New-Object byte[] 65536
                        $bytesRem = $length
                        while ($bytesRem -gt 0) {
                            $toRead = [System.Math]::Min($buf.Length, $bytesRem)
                            $read = $fs.Read($buf, 0, $toRead)
                            if ($read -le 0) { break }
                            $res.OutputStream.Write($buf, 0, $read)
                            $bytesRem -= $read
                        }
                    } finally {
                        $fs.Close()
                    }
                }
            } else {
                $res.StatusCode = 200
                $res.ContentLength64 = $fileLen
                if ($req.HttpMethod -ne "HEAD") {
                    $fs = [System.IO.File]::OpenRead($filePath)
                    try {
                        $buf = New-Object byte[] 65536
                        while ($true) {
                            $read = $fs.Read($buf, 0, $buf.Length)
                            if ($read -le 0) { break }
                            $res.OutputStream.Write($buf, 0, $read)
                        }
                    } finally {
                        $fs.Close()
                    }
                }
            }
            $res.Close()
        } catch {
            try { $context.Response.Abort() } catch {}
        }
    }
} finally {
    $listener.Stop()
}
