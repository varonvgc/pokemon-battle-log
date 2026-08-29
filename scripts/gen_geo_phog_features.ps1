Add-Type -AssemblyName System.Drawing

$rootDir = Split-Path $PSScriptRoot -Parent
$assetsDir = Join-Path $rootDir "assets"
$iconsDir = Join-Path $assetsDir "pokemon_icons"

Write-Host "Extracting 680-dim PHOG & Geometric Features for clean roster..." -ForegroundColor Cyan

$rosterPath = Join-Path $assetsDir "clean_roster.json"
$roster = Get-Content $rosterPath -Encoding UTF8 -Raw | ConvertFrom-Json

function Compute-OtsuThreshold($diffArray) {
    $hist = New-Object int[] 256
    foreach ($d in $diffArray) {
        $bin = [Math]::Min(255, [Math]::Max(0, [int]$d))
        $hist[$bin]++
    }
    $total = $diffArray.Count
    if ($total -eq 0) { return 35 }

    $sum = 0.0
    for ($i = 0; $i -lt 256; $i++) { $sum += ($i * $hist[$i]) }

    $sumB = 0.0; $wB = 0; $varMax = 0.0; $threshold = 35
    for ($t = 0; $t -lt 256; $t++) {
        $wB += $hist[$t]
        if ($wB -eq 0) { continue }
        $wF = $total - $wB
        if ($wF -eq 0) { break }

        $sumB += ($t * $hist[$t])
        $mB = $sumB / $wB
        $mF = ($sum - $sumB) / $wF
        $varBetween = [double]$wB * [double]$wF * ($mB - $mF) * ($mB - $mF)
        if ($varBetween -gt $varMax) {
            $varMax = $varBetween
            $threshold = $t
        }
    }
    return [Math]::Max(20, $threshold)
}

function Compute-PHOG680($gray, $mask) {
    $gx = New-Object double[] (32 * 32)
    $gy = New-Object double[] (32 * 32)
    $mag = New-Object double[] (32 * 32)
    $ori = New-Object double[] (32 * 32)

    for ($y = 1; $y -lt 31; $y++) {
        for ($x = 1; $x -lt 31; $x++) {
            $idx = $y * 32 + $x
            $dx = $gray[$idx + 1] - $gray[$idx - 1]
            $dy = $gray[$idx + 32] - $gray[$idx - 32]
            $mdx = ([int]$mask[$idx + 1] - [int]$mask[$idx - 1]) * 0.5
            $mdy = ([int]$mask[$idx + 32] - [int]$mask[$idx - 32]) * 0.5
            $totDx = $dx + $mdx
            $totDy = $dy + $mdy
            $m = [Math]::Sqrt($totDx * $totDx + $totDy * $totDy)
            $ang = [Math]::Atan2($totDy, $totDx)
            if ($ang -lt 0) { $ang += [Math]::PI }
            $mag[$idx] = $m
            $ori[$idx] = $ang
        }
    }

    $binSize = [Math]::PI / 8.0
    $phog = New-Object double[] 680
    $offset = 0

    foreach ($gridSize in @(1, 2, 4, 8)) {
        $cellPixels = 32 / $gridSize
        for ($cy = 0; $cy -lt $gridSize; $cy++) {
            for ($cx = 0; $cx -lt $gridSize; $cx++) {
                $cellIdx = $offset + ($cy * $gridSize + $cx) * 8
                $startX = [int]($cx * $cellPixels); $endX = [int](($cx + 1) * $cellPixels)
                $startY = [int]($cy * $cellPixels); $endY = [int](($cy + 1) * $cellPixels)

                for ($py = $startY; $py -lt $endY; $py++) {
                    for ($px = $startX; $px -lt $endX; $px++) {
                        $idx = $py * 32 + $px
                        $m = $mag[$idx]
                        if ($m -gt 0) {
                            $b = [Math]::Min(7, [int]($ori[$idx] / $binSize))
                            $phog[$cellIdx + $b] += $m
                        }
                    }
                }
            }
        }
        $offset += ($gridSize * $gridSize * 8)
    }

    $normSum = 0.0
    for ($k = 0; $k -lt 680; $k++) { $normSum += ($phog[$k] * $phog[$k]) }
    $norm = [Math]::Sqrt($normSum) + 0.000001
    $phogBytes = New-Object byte[] 680
    for ($k = 0; $k -lt 680; $k++) {
        $phogBytes[$k] = [byte]([Math]::Min(255, [int](($phog[$k] / $norm) * 255.0)))
    }
    return $phogBytes
}

function Extract-GeoPHOGFromIcon($srcPath) {
    if (-not (Test-Path $srcPath)) { return $null }
    
    $origBmp = $null
    try {
        $origBmp = [System.Drawing.Image]::FromFile($srcPath)
    } catch {
        return $null
    }

    $w = $origBmp.Width; $h = $origBmp.Height
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $bgG = [System.Drawing.Graphics]::FromImage($bmp)
    $bgG.DrawImage($origBmp, 0, 0, $w, $h)
    $bgG.Dispose(); $origBmp.Dispose()

    $isTransparentPng = $false
    for ($y = 0; $y -lt [Math]::Min(10, $h); $y++) {
        if ($bmp.GetPixel(0, $y).A -lt 50) { $isTransparentPng = $true; break }
    }

    $minX = $w; $maxX = 0; $minY = $h; $maxY = 0
    $fgCount = 0

    if ($isTransparentPng) {
        for ($y = 0; $y -lt $h; $y++) {
            for ($x = 0; $x -lt $w; $x++) {
                $p = $bmp.GetPixel($x, $y)
                if ($p.A -gt 50) {
                    $fgCount++
                    if ($x -lt $minX) { $minX = $x }
                    if ($x -gt $maxX) { $maxX = $x }
                    if ($y -lt $minY) { $minY = $y }
                    if ($y -gt $maxY) { $maxY = $y }
                }
            }
        }
    } else {
        $c1 = $bmp.GetPixel(3, 3); $c2 = $bmp.GetPixel($w - 4, 3)
        $c3 = $bmp.GetPixel(3, $h - 4); $c4 = $bmp.GetPixel($w - 4, $h - 4)
        $bgR = ($c1.R + $c2.R + $c3.R + $c4.R) / 4.0
        $bgG_val = ($c1.G + $c2.G + $c3.G + $c4.G) / 4.0
        $bgB = ($c1.B + $c2.B + $c3.B + $c4.B) / 4.0

        $diffs = New-Object double[] ($w * $h)
        $idx = 0
        for ($y = 0; $y -lt $h; $y++) {
            for ($x = 0; $x -lt $w; $x++) {
                $p = $bmp.GetPixel($x, $y)
                $dr = $p.R - $bgR; $dg = $p.G - $bgG_val; $db = $p.B - $bgB
                $diffs[$idx++] = [Math]::Sqrt($dr*$dr + $dg*$dg + $db*$db)
            }
        }
        $otsuT = Compute-OtsuThreshold $diffs

        $idx = 0
        for ($y = 0; $y -lt $h; $y++) {
            for ($x = 0; $x -lt $w; $x++) {
                if ($diffs[$idx++] -ge $otsuT) {
                    $fgCount++
                    if ($x -lt $minX) { $minX = $x }
                    if ($x -gt $maxX) { $maxX = $x }
                    if ($y -lt $minY) { $minY = $y }
                    if ($y -gt $maxY) { $maxY = $y }
                }
            }
        }
    }

    if ($fgCount -eq 0 -or $minX -ge $maxX -or $minY -ge $maxY) {
        $minX = 0; $maxX = $w - 1; $minY = 0; $maxY = $h - 1
    }

    $bw = ($maxX - $minX) + 1
    $bh = ($maxY - $minY) + 1
    $boxArea = $bw * $bh
    $extent = if ($boxArea -gt 0) { [double]$fgCount / [double]$boxArea } else { 0.5 }
    $aspectRatio = [double]$bw / [double]$bh

    $fgCrop = $bmp.Clone((New-Object System.Drawing.Rectangle($minX, $minY, $bw, $bh)), $bmp.PixelFormat)

    $t32 = New-Object System.Drawing.Bitmap(32, 32, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($t32)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    
    $scale = [Math]::Min(28.0 / $bw, 28.0 / $bh)
    $tw = [int]($bw * $scale); $th = [int]($bh * $scale)
    $tx = [int]((32 - $tw) / 2); $ty = [int]((32 - $th) / 2)
    $g.DrawImage($fgCrop, $tx, $ty, $tw, $th)
    $g.Dispose(); $fgCrop.Dispose(); $bmp.Dispose()

    $mask = New-Object byte[] (32 * 32)
    $gray = New-Object double[] (32 * 32)
    $mass32 = 0
    $idx = 0

    for ($cy = 0; $cy -lt 32; $cy++) {
        for ($cx = 0; $cx -lt 32; $cx++) {
            $p = $t32.GetPixel($cx, $cy)
            $isFg = if ($isTransparentPng) { ($p.A -gt 50) } else {
                $dr = $p.R - $bgR; $dg = $p.G - $bgG_val; $db = $p.B - $bgB
                ([Math]::Sqrt($dr*$dr + $dg*$dg + $db*$db) -ge ($otsuT * 0.75))
            }
            $mask[$idx] = if ($isFg) { [byte]255 } else { [byte]0 }
            $gray[$idx] = ($p.R * 0.299 + $p.G * 0.587 + $p.B * 0.114)
            if ($isFg) { $mass32++ }
            $idx++
        }
    }
    $t32.Dispose()

    $phogBytes = Compute-PHOG680 $gray $mask
    return @{
        phog = [Convert]::ToBase64String($phogBytes)
        extent = [math]::Round($extent, 4)
        aspectRatio = [math]::Round($aspectRatio, 4)
        areaRatio = [math]::Round(($mass32 / 1024.0), 4)
    }
}

$featuresObj = @{}
$success = 0
foreach ($entry in $roster) {
    $imgPath = Join-Path $iconsDir $entry.file
    $feat = Extract-GeoPHOGFromIcon $imgPath
    if ($feat) {
        $featuresObj[$entry.id] = $feat
        $success++
    }
}

$outPath = Join-Path $assetsDir "pokemon_geo_phog_features.json"
$featuresObj | ConvertTo-Json -Depth 5 | Out-File $outPath -Encoding UTF8
Write-Host "Generated assets/pokemon_geo_phog_features.json for $success / $($roster.Count) clean roster entries!" -ForegroundColor Green
