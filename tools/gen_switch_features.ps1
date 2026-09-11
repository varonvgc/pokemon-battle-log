[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing

$rootDir = Split-Path $PSScriptRoot -Parent
$assetsDir = Join-Path $rootDir "assets"
$iconsDir = Join-Path $assetsDir "pokemon_icons"
$rosterPath = Join-Path $assetsDir "clean_roster.json"

Write-Host "Generating Switch-specific 24x24 centered template features..." -ForegroundColor Cyan

$roster = Get-Content $rosterPath -Encoding UTF8 -Raw | ConvertFrom-Json

function Extract-SwitchFeature($fileName) {
    if (-not $fileName) { return $null }
    $src = Join-Path $iconsDir $fileName
    if (-not (Test-Path $src)) { return $null }
    
    $orig = $null
    try {
        $orig = [System.Drawing.Image]::FromFile($src)
    } catch {
        return $null
    }
    
    $w = $orig.Width; $h = $orig.Height
    $minX = $w; $maxX = 0; $minY = $h; $maxY = 0
    $fgCount = 0
    
    $rSum = 0.0; $gSum = 0.0; $bSum = 0.0
    $reddish = 0
    for ($y = 0; $y -lt $h; $y++) {
        for ($x = 0; $x -lt $w; $x++) {
            $p = $orig.GetPixel($x, $y)
            if ($p.A -gt 50) {
                $fgCount++
                $rSum += $p.R; $gSum += $p.G; $bSum += $p.B
                if ($p.R -gt ($p.G + 15) -and $p.R -gt ($p.B + 15)) { $reddish++ }
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    
    if ($fgCount -eq 0 -or $minX -ge $maxX -or $minY -ge $maxY) {
        $minX = 0; $maxX = $w - 1; $minY = 0; $maxY = $h - 1
    }
    
    $bw = ($maxX - $minX) + 1; $bh = ($maxY - $minY) + 1
    $boxArea = $bw * $bh
    $extent = if ($boxArea -gt 0) { [double]$fgCount / [double]$boxArea } else { 0.5 }
    $aspectRatio = [double]$bw / [double]$bh
    $totalColor = $rSum + $gSum + $bSum + 0.0001
    
    $crop = $orig.Clone((New-Object System.Drawing.Rectangle($minX, $minY, $bw, $bh)), $orig.PixelFormat)
    
    $bmp24 = New-Object System.Drawing.Bitmap(24, 24, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp24)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    
    # Fill slot background: Wine-red (148, 1, 63)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 148, 1, 63))
    $g.FillRectangle($brush, 0, 0, 24, 24)
    $brush.Dispose()
    
    # Center scaled bounding box inside 24x24 (max 20x20)
    $scale = [Math]::Min(20.0 / $bw, 20.0 / $bh)
    $tw = [int]($bw * $scale); $th = [int]($bh * $scale)
    $tx = [int]((24 - $tw) / 2); $ty = [int]((24 - $th) / 2)
    $g.DrawImage($crop, $tx, $ty, $tw, $th)
    $g.Dispose(); $crop.Dispose(); $orig.Dispose()
    
    # Extract 24x24 RGB bytes (576 * 3 = 1728 bytes)
    $bytes = New-Object byte[] (24 * 24 * 3)
    $bIdx = 0
    for ($y = 0; $y -lt 24; $y++) {
        for ($x = 0; $x -lt 24; $x++) {
            $p = $bmp24.GetPixel($x, $y)
            $bytes[$bIdx++] = [byte]$p.R
            $bytes[$bIdx++] = [byte]$p.G
            $bytes[$bIdx++] = [byte]$p.B
        }
    }
    $bmp24.Dispose()
    
    return @{
        aspectRatio = [Math]::Round($aspectRatio, 4)
        extent = [Math]::Round($extent, 4)
        normR = [Math]::Round(($rSum / $totalColor), 4)
        normG = [Math]::Round(($gSum / $totalColor), 4)
        normB = [Math]::Round(($bSum / $totalColor), 4)
        redRatio = if ($fgCount -gt 0) { [Math]::Round(($reddish / [double]$fgCount), 4) } else { 0.0 }
        rgb24 = [Convert]::ToBase64String($bytes)
    }
}

$features = @{}
$count = 0
foreach ($entry in $roster) {
    $feat = Extract-SwitchFeature $entry.file
    if ($feat) {
        $features[$entry.id] = $feat
        $count++
    }
}

$outPath = Join-Path $assetsDir "pokemon_switch_features.json"
$features | ConvertTo-Json -Depth 4 | Out-File $outPath -Encoding UTF8
Write-Host "Saved $count entries to assets/pokemon_switch_features.json!" -ForegroundColor Green
