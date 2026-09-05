[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing

$rootDir = Split-Path $PSScriptRoot -Parent
$assetsDir = Join-Path $rootDir "assets"
$testDir = Join-Path $rootDir "test\switch"
$gtPath = Join-Path $rootDir "test\ground_truth.json"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " Switch 1080p Party Recognition Evaluation (24x24 MSE) " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# Load Ground Truth
$gtJson = [System.IO.File]::ReadAllText($gtPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$switchGt = $gtJson.switch

# Load Roster & Switch Features
$roster = Get-Content (Join-Path $assetsDir "clean_roster.json") -Encoding UTF8 -Raw | ConvertFrom-Json
$switchFeatJson = Get-Content (Join-Path $assetsDir "pokemon_switch_features.json") -Encoding UTF8 -Raw | ConvertFrom-Json

# Decode 24x24 Switch Features
$decodedSwitchFeat = @{}
foreach ($prop in $switchFeatJson.PSObject.Properties) {
    $decodedSwitchFeat[$prop.Name] = @{
        aspectRatio = [double]$prop.Value.aspectRatio
        extent      = [double]$prop.Value.extent
        normR       = [double]$prop.Value.normR
        normG       = [double]$prop.Value.normG
        normB       = [double]$prop.Value.normB
        bytes       = [Convert]::FromBase64String($prop.Value.rgb24)
    }
}

# Load Type Templates (assets/type_icons/template_*.png)
$typeIconsDir = Join-Path $assetsDir "type_icons"
$types = @('normal', 'fire', 'water', 'grass', 'electric', 'ice',
           'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
           'rock', 'ghost', 'dragon', 'steel', 'dark', 'fairy')
$typeTemplates = @{}
foreach ($t in $types) {
    $p = Join-Path $typeIconsDir "template_$t.png"
    if (Test-Path $p) {
        $typeTemplates[$t] = [System.Drawing.Image]::FromFile($p)
    }
}

# Type matching function (exactly matching recognition_engine.js _matchTypeIconTemplate)
function Match-TypeIcon($bmp, $x, $y, $w = 40, $h = 40) {
    $crop = $bmp.Clone((New-Object System.Drawing.Rectangle($x, $y, $w, $h)), $bmp.PixelFormat)
    $t40 = New-Object System.Drawing.Bitmap(40, 40, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($t40)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($crop, 0, 0, 40, 40)
    $g.Dispose(); $crop.Dispose()
    
    # Brightness check
    $totalBright = 0.0
    for ($cy = 0; $cy -lt 40; $cy++) {
        for ($cx = 0; $cx -lt 40; $cx++) {
            $p = $t40.GetPixel($cx, $cy)
            $totalBright += ($p.R + $p.G + $p.B) / 3.0
        }
    }
    $avgBright = $totalBright / 1600.0
    if ($avgBright -lt 60) {
        $t40.Dispose()
        return @{ type = "none"; score = 999999 }
    }
    
    $bestType = "none"; $minDiff = [double]::PositiveInfinity
    foreach ($entry in $typeTemplates.GetEnumerator()) {
        $tName = $entry.Key
        $tImg = $entry.Value
        $sumDiff = 0.0; $count = 0.0
        for ($cy = 0; $cy -lt 40; $cy++) {
            for ($cx = 0; $cx -lt 40; $cx++) {
                $tp = $tImg.GetPixel($cx, $cy)
                if ($tp.A -lt 50) { continue }
                $cp = $t40.GetPixel($cx, $cy)
                $weight = $tp.A / 255.0
                $dr = $tp.R - $cp.R; $dg = $tp.G - $cp.G; $db = $tp.B - $cp.B
                $sumDiff += ($dr*$dr*0.299 + $dg*$dg*0.587 + $db*$db*0.114) * $weight
                $count += $weight
            }
        }
        if ($count -gt 0) {
            $mse = $sumDiff / $count
            if ($mse -lt $minDiff) {
                $minDiff = $mse
                $bestType = $tName
            }
        }
    }
    $t40.Dispose()
    if ($minDiff -gt 4500) {
        return @{ type = "none"; score = $minDiff }
    }
    return @{ type = $bestType; score = $minDiff }
}

function Get-Candidates($t1, $t2) {
    $c = @()
    if ($t1 -ne 'none' -and $t2 -ne 'none') {
        $c = $roster | Where-Object { ($_.t1 -eq $t1 -and $_.t2 -eq $t2) -or ($_.t1 -eq $t2 -and $_.t2 -eq $t1) }
    }
    if ($c.Count -eq 0 -and ($t1 -ne 'none' -or $t2 -ne 'none')) {
        $single = if ($t1 -ne 'none') { $t1 } else { $t2 }
        $c = $roster | Where-Object { $_.t1 -eq $single -and (-not $_.t2 -or $_.t2 -eq 'none') }
        if ($c.Count -eq 0) {
            $c = $roster | Where-Object { $_.t1 -eq $single -or $_.t2 -eq $single }
        }
    }
    if ($c.Count -eq 0) { $c = $roster }
    return $c
}

# Extract live 24x24 centered RGB bytes from Switch frame
function Extract-Live24($bmp, $x, $y, $w, $h) {
    $crop = $bmp.Clone((New-Object System.Drawing.Rectangle($x, $y, $w, $h)), $bmp.PixelFormat)
    $bgR = 148; $bgG = 1; $bgB = 63
    
    $colFg = New-Object int[] $w
    $rowFg = New-Object int[] $h
    $rSum = 0.0; $gSum = 0.0; $bSum = 0.0
    for ($cy = 0; $cy -lt $h; $cy++) {
        for ($cx = 0; $cx -lt $w; $cx++) {
            $p = $crop.GetPixel($cx, $cy)
            $dr = $p.R - $bgR; $dg = $p.G - $bgG; $db = $p.B - $bgB
            $diff = [Math]::Sqrt($dr*$dr + $dg*$dg + $db*$db)
            if ($diff -gt 50) {
                $fgCount++
                $colFg[$cx]++
                $rowFg[$cy]++
                $rSum += $p.R; $gSum += $p.G; $bSum += $p.B
            }
        }
    }
    $noiseThresh = 8
    $minX = 0; $maxX = $w - 1; $minY = 0; $maxY = $h - 1
    for ($cx = 0; $cx -lt $w; $cx++) { if ($colFg[$cx] -ge $noiseThresh) { $minX = $cx; break } }
    for ($cx = $w - 1; $cx -ge 0; $cx--) { if ($colFg[$cx] -ge $noiseThresh) { $maxX = $cx; break } }
    for ($cy = 0; $cy -lt $h; $cy++) { if ($rowFg[$cy] -ge $noiseThresh) { $minY = $cy; break } }
    for ($cy = $h - 1; $cy -ge 0; $cy--) { if ($rowFg[$cy] -ge $noiseThresh) { $maxY = $cy; break } }

    if ($fgCount -eq 0 -or $minX -ge $maxX -or $minY -ge $maxY) {
        $minX = 0; $maxX = $w - 1; $minY = 0; $maxY = $h - 1
    }
    $bw = ($maxX - $minX) + 1; $bh = ($maxY - $minY) + 1
    $aspect = [double]$bw / [double]$bh
    $totalColor = $rSum + $gSum + $bSum + 0.0001
    
    $fgCrop = $crop.Clone((New-Object System.Drawing.Rectangle($minX, $minY, $bw, $bh)), $crop.PixelFormat)
    
    $bmp24 = New-Object System.Drawing.Bitmap(24, 24, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp24)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 148, 1, 63))
    $g.FillRectangle($brush, 0, 0, 24, 24)
    $brush.Dispose()
    
    $scale = [Math]::Min(20.0 / $bw, 20.0 / $bh)
    $tw = [int]($bw * $scale); $th = [int]($bh * $scale)
    $tx = [int]((24 - $tw) / 2); $ty = [int]((24 - $th) / 2)
    $g.DrawImage($fgCrop, $tx, $ty, $tw, $th)
    $g.Dispose(); $fgCrop.Dispose(); $crop.Dispose()
    
    $bytes = New-Object byte[] (24 * 24 * 3)
    $bIdx = 0
    for ($cy = 0; $cy -lt 24; $cy++) {
        for ($cx = 0; $cx -lt 24; $cx++) {
            $p = $bmp24.GetPixel($cx, $cy)
            $bytes[$bIdx++] = [byte]$p.R
            $bytes[$bIdx++] = [byte]$p.G
            $bytes[$bIdx++] = [byte]$p.B
        }
    }
    $bmp24.Dispose()
    
    return @{
        aspect = $aspect
        normR  = [Math]::Round(($rSum / $totalColor), 4)
        normG  = [Math]::Round(($gSum / $totalColor), 4)
        normB  = [Math]::Round(($bSum / $totalColor), 4)
        bytes  = $bytes
    }
}

# Match candidate entries against live 24x24
function Match-PokemonSwitch($live, $candidates) {
    if (-not $candidates -or $candidates.Count -eq 0) { return "???" }
    if ($candidates.Count -eq 1) { return $candidates[0].display }
    
    $bestDisplay = $candidates[0].display
    $minScore = [double]::PositiveInfinity
    $scored = @()
    
    foreach ($entry in $candidates) {
        $feat = $decodedSwitchFeat[$entry.id]
        if (-not $feat) { continue }
        
        $refBytes = $feat.bytes
        $liveBytes = $live.bytes
        
        $sumDiff = 0.0
        for ($p = 0; $p -lt 576; $p++) {
            $k = $p * 3
            $dr = [int]$liveBytes[$k] - [int]$refBytes[$k]
            $dg = [int]$liveBytes[$k+1] - [int]$refBytes[$k+1]
            $db = [int]$liveBytes[$k+2] - [int]$refBytes[$k+2]
            $sumDiff += ($dr*$dr*0.299 + $dg*$dg*0.587 + $db*$db*0.114)
        }
        $mse = $sumDiff / 576.0
        
        # Aspect ratio penalty (weight = 150)
        $aspectDiff = [Math]::Abs($live.aspect - $feat.aspectRatio)
        
        # Color distance penalty (weight = 800)
        $colorDist = [Math]::Abs($live.normR - $feat.normR) + [Math]::Abs($live.normG - $feat.normG) + [Math]::Abs($live.normB - $feat.normB)
        
        $score = $mse + (150.0 * $aspectDiff) + (800.0 * $colorDist)
        
        $scored += [PSCustomObject]@{ display = $entry.display; score = $score; mse = $mse; aspectDiff = $aspectDiff; colorDist = $colorDist }
        if ($score -lt $minScore) {
            $minScore = $score
            $bestDisplay = $entry.display
        }
    }
    $global:debugScored = $scored
    return $bestDisplay
}

# Main Evaluation Loop
$totalSlots = 0
$correctSlots = 0

foreach ($prop in $switchGt.PSObject.Properties) {
    $imgName = $prop.Name
    $gtList = $prop.Value
    $imgPath = Join-Path $testDir $imgName
    
    if (-not (Test-Path $imgPath)) {
        Write-Host "Warning: File not found $imgPath" -ForegroundColor Yellow
        continue
    }
    
    Write-Host "`n--- Evaluating: $imgName ---" -ForegroundColor Yellow
    $img = [System.Drawing.Image]::FromFile($imgPath)
    
    for ($i = 0; $i -lt 6; $i++) {
        $totalSlots++
        $gtName = $gtList[$i]
        
        $iconX = 1621; $iconY = [int](159.5 + 125.9 * $i); $iconW = 105; $iconH = 105
        $t1X = 1750; $t2X = 1801; $typeY = [int](172.0 + 126.0 * $i); $tW = 40; $tH = 40
        
        $res1 = Match-TypeIcon $img $t1X $typeY $tW $tH
        $res2 = Match-TypeIcon $img $t2X $typeY $tW $tH
        $t1 = $res1.type; $t2 = $res2.type
        
        $candidates = Get-Candidates $t1 $t2
        $live = Extract-Live24 $img $iconX $iconY $iconW $iconH
        $pred = Match-PokemonSwitch $live $candidates
        
        $normGt = $gtName.Split("(")[0].Trim()
        $normPred = $pred.Split("(")[0].Trim()
        
        $isMatch = ($normGt -eq $normPred)
        if ($isMatch) {
            $correctSlots++
            Write-Host ("  Slot {0}: [OK] Pred: {1} | GT: {2} (types: {3}, {4}, cands: {5})" -f ($i+1), $pred, $gtName, $t1, $t2, $candidates.Count) -ForegroundColor Green
        } else {
            Write-Host ("  Slot {0}: [NG] Pred: {1} != GT: {2} (types: {3}, {4}, cands: {5})" -f ($i+1), $pred, $gtName, $t1, $t2, $candidates.Count) -ForegroundColor Red
            if ($global:debugScored) {
                $global:debugScored | Sort-Object score | Select-Object -First 5 | ForEach-Object {
                    Write-Host ("      Cand: {0,-25} Score={1:F1} (MSE={2:F1}, arDiff={3:F2}, colDist={4:F3})" -f $_.display, $_.score, $_.mse, $_.aspectDiff, $_.colorDist) -ForegroundColor Yellow
                }
            }
        }
    }
    $img.Dispose()
}

Write-Host "`n========================================================" -ForegroundColor Cyan
$acc = [Math]::Round(($correctSlots / [double]$totalSlots) * 100.0, 2)
Write-Host (" TOTAL ACCURACY: {0} / {1} ({2}%)" -f $correctSlots, $totalSlots, $acc) -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
