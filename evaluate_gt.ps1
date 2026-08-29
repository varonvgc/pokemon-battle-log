Add-Type -AssemblyName System.Drawing

# -------------------------------------------------------------
# Ultimate Universal Geometric Pokemon Battle Log Evaluator v16
# (Otsu Thresholding + 680-dim PHOG + Solidity/Extent Descriptors)
# -------------------------------------------------------------

$gt = Get-Content 'test/ground_truth.json' -Encoding UTF8 -Raw | ConvertFrom-Json
$roster = Get-Content 'assets/clean_roster.json' -Encoding UTF8 -Raw | ConvertFrom-Json
$typeFeatAfterJson = Get-Content 'assets/type_features.json' -Raw | ConvertFrom-Json
$typeFeatBeforeJson = Get-Content 'assets/type_features_before.json' -Raw | ConvertFrom-Json
$geoJson = Get-Content 'assets/pokemon_geo_phog_features.json' -Raw | ConvertFrom-Json
$badgeFeatJson = Get-Content 'assets/badge_features.json' -Raw | ConvertFrom-Json

# Decode Type Features
$typeFeatAfterDecoded = @{}
foreach ($prop in $typeFeatAfterJson.PSObject.Properties) {
    if ($prop.Name -ne 'stellar' -and $prop.Name -ne 'none') {
        $typeFeatAfterDecoded[$prop.Name] = [Convert]::FromBase64String($prop.Value)
    }
}

$typeFeatBeforeDecoded = @{}
foreach ($prop in $typeFeatBeforeJson.PSObject.Properties) {
    if ($prop.Name -ne 'stellar' -and $prop.Name -ne 'none') {
        $typeFeatBeforeDecoded[$prop.Name] = [Convert]::FromBase64String($prop.Value)
    }
}

# Decode Geometric PHOG Features
$geoDecoded = @{}
foreach ($prop in $geoJson.PSObject.Properties) {
    $obj = $prop.Value
    $geoDecoded[$prop.Name] = @{
        phog = [Convert]::FromBase64String($obj.phog)
        extent = [double]$obj.extent
        aspectRatio = [double]$obj.aspectRatio
        areaRatio = [double]$obj.areaRatio
    }
}

# Decode Badge Features
$badgeFeaturesDecoded = @{}
foreach ($prop in $badgeFeatJson.PSObject.Properties) {
    $badgeFeaturesDecoded[$prop.Name] = [Convert]::FromBase64String($prop.Value)
}

function Normalize-PokeName($name) {
    if (-not $name) { return "" }
    return $name.Split("(")[0].Split([char]0xFF08)[0].Trim()
}

function Match-TypeTemplate($bmp, $x, $y, $w, $h, $dict) {
    if ($x -lt 0 -or $y -lt 0 -or ($x + $w) -gt $bmp.Width -or ($y + $h) -gt $bmp.Height) { 
        return @{ type="none"; score=999999999 } 
    }
    $crop = $bmp.Clone((New-Object System.Drawing.Rectangle($x, $y, $w, $h)), $bmp.PixelFormat)
    $t20 = New-Object System.Drawing.Bitmap(20, 20)
    $g = [System.Drawing.Graphics]::FromImage($t20)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($crop, 0, 0, 20, 20); $g.Dispose(); $crop.Dispose()
    
    $b = New-Object byte[] (20 * 20 * 4); $i = 0
    $rSum = 0; $gSum = 0; $bSum = 0
    for ($cy = 0; $cy -lt 20; $cy++) {
        for ($cx = 0; $cx -lt 20; $cx++) {
            $p = $t20.GetPixel($cx, $cy)
            $b[$i++] = [byte]$p.R; $b[$i++] = [byte]$p.G; $b[$i++] = [byte]$p.B; $b[$i++] = [byte]$p.A
            $rSum += $p.R; $gSum += $p.G; $bSum += $p.B
        }
    }
    $t20.Dispose()

    $meanR = $rSum / 400.0; $meanG = $gSum / 400.0; $meanB = $bSum / 400.0

    $bestType = "none"; $bestScore = 999999999.0
    foreach ($entry in $dict.GetEnumerator()) {
        $tb = $entry.Value; $diff = 0.0; $tbR = 0; $tbG = 0; $tbB = 0
        for ($k = 0; $k -lt 1600; $k += 4) {
            $dr = $b[$k] - $tb[$k]; $dg = $b[$k+1] - $tb[$k+1]; $db = $b[$k+2] - $tb[$k+2]
            $diff += ($dr*$dr + $dg*$dg + $db*$db)
            $tbR += $tb[$k]; $tbG += $tb[$k+1]; $tbB += $tb[$k+2]
        }
        $tbMeanR = $tbR / 400.0; $tbMeanG = $tbG / 400.0; $tbMeanB = $tbB / 400.0
        $dmr = $meanR - $tbMeanR; $dmg = $meanG - $tbMeanG; $dmb = $meanB - $tbMeanB
        $meanDiff = ($dmr*$dmr + $dmg*$dmg + $dmb*$dmb)

        $totalScore = $diff + (100.0 * $meanDiff)
        if ($totalScore -lt $bestScore) { $bestScore = $totalScore; $bestType = $entry.Key }
    }
    return @{ type=$bestType; score=$bestScore }
}

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

function Compute-PHOG680Live($gray, $mask) {
    $gx = New-Object double[] (32 * 32); $gy = New-Object double[] (32 * 32)
    $mag = New-Object double[] (32 * 32); $ori = New-Object double[] (32 * 32)

    for ($y = 1; $y -lt 31; $y++) {
        for ($x = 1; $x -lt 31; $x++) {
            $idx = $y * 32 + $x
            $dx = $gray[$idx + 1] - $gray[$idx - 1]
            $dy = $gray[$idx + 32] - $gray[$idx - 32]
            $mdx = ([int]$mask[$idx + 1] - [int]$mask[$idx - 1]) * 0.5
            $mdy = ([int]$mask[$idx + 32] - [int]$mask[$idx - 32]) * 0.5
            $totDx = $dx + $mdx; $totDy = $dy + $mdy
            $m = [Math]::Sqrt($totDx * $totDx + $totDy * $totDy)
            $ang = [Math]::Atan2($totDy, $totDx)
            if ($ang -lt 0) { $ang += [Math]::PI }
            $mag[$idx] = $m; $ori[$idx] = $ang
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

function Extract-LiveGeoPHOG($bmp, $x, $y, $w, $h) {
    if ($x -lt 0 -or $y -lt 0 -or ($x + $w) -gt $bmp.Width -or ($y + $h) -gt $bmp.Height) { return $null }
    $cropBmp = $bmp.Clone((New-Object System.Drawing.Rectangle($x, $y, $w, $h)), $bmp.PixelFormat)

    # 1. Background color from corners
    $cw = $cropBmp.Width; $ch = $cropBmp.Height
    $c1 = $cropBmp.GetPixel(3, 3); $c2 = $cropBmp.GetPixel($cw - 4, 3)
    $c3 = $cropBmp.GetPixel(3, $ch - 4); $c4 = $cropBmp.GetPixel($cw - 4, $ch - 4)
    $bgR = ($c1.R + $c2.R + $c3.R + $c4.R) / 4.0
    $bgG = ($c1.G + $c2.G + $c3.G + $c4.G) / 4.0
    $bgB = ($c1.B + $c2.B + $c3.B + $c4.B) / 4.0

    # 2. Difference Map and Otsu thresholding
    $diffs = New-Object double[] ($cw * $ch)
    $idx = 0
    for ($cy = 0; $cy -lt $ch; $cy++) {
        for ($cx = 0; $cx -lt $cw; $cx++) {
            $p = $cropBmp.GetPixel($cx, $cy)
            $dr = $p.R - $bgR; $dg = $p.G - $bgG; $db = $p.B - $bgB
            $diffs[$idx++] = [Math]::Sqrt($dr*$dr + $dg*$dg + $db*$db)
        }
    }
    $otsuT = Compute-OtsuThreshold $diffs

    $minX = $cw; $maxX = 0; $minY = $ch; $maxY = 0
    $fgCount = 0
    $idx = 0
    for ($cy = 0; $cy -lt $ch; $cy++) {
        for ($cx = 0; $cx -lt $cw; $cx++) {
            if ($diffs[$idx++] -ge $otsuT) {
                $fgCount++
                if ($cx -lt $minX) { $minX = $cx }
                if ($cx -gt $maxX) { $maxX = $cx }
                if ($cy -lt $minY) { $minY = $cy }
                if ($cy -gt $maxY) { $maxY = $cy }
            }
        }
    }
    if ($fgCount -eq 0 -or $minX -ge $maxX -or $minY -ge $maxY) {
        $minX = 0; $maxX = $cw - 1; $minY = 0; $maxY = $ch - 1
    }

    $bw = ($maxX - $minX) + 1; $bh = ($maxY - $minY) + 1
    $boxArea = $bw * $bh
    $liveExtent = if ($boxArea -gt 0) { [double]$fgCount / [double]$boxArea } else { 0.5 }
    $liveAspect = [double]$bw / [double]$bh
    $fgCrop = $cropBmp.Clone((New-Object System.Drawing.Rectangle($minX, $minY, $bw, $bh)), $cropBmp.PixelFormat)

    # 3. 32x32 Normalized
    $t32 = New-Object System.Drawing.Bitmap(32, 32)
    $g = [System.Drawing.Graphics]::FromImage($t32)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    
    $scale = [Math]::Min(28.0 / $bw, 28.0 / $bh)
    $tw = [int]($bw * $scale); $th = [int]($bh * $scale)
    $tx = [int]((32 - $tw) / 2); $ty = [int]((32 - $th) / 2)
    $g.DrawImage($fgCrop, $tx, $ty, $tw, $th)
    $g.Dispose(); $fgCrop.Dispose(); $cropBmp.Dispose()

    $mask = New-Object byte[] (32 * 32)
    $gray = New-Object double[] (32 * 32)
    $mass32 = 0
    $idx = 0
    for ($cy = 0; $cy -lt 32; $cy++) {
        for ($cx = 0; $cx -lt 32; $cx++) {
            $p = $t32.GetPixel($cx, $cy)
            $dr = $p.R - $bgR; $dg = $p.G - $bgG; $db = $p.B - $bgB
            $diff = [Math]::Sqrt($dr*$dr + $dg*$dg + $db*$db)
            $isFg = ($diff -ge ($otsuT * 0.75))
            $mask[$idx] = if ($isFg) { [byte]255 } else { [byte]0 }
            $gray[$idx] = ($p.R * 0.299 + $p.G * 0.587 + $p.B * 0.114)
            if ($isFg) { $mass32++ }
            $idx++
        }
    }
    $t32.Dispose()

    $livePhog = Compute-PHOG680Live $gray $mask
    return @{
        phog = $livePhog
        extent = $liveExtent
        aspectRatio = $liveAspect
        areaRatio = ($mass32 / 1024.0)
    }
}

function Match-PokemonGeoPHOGUniversal($bmp, $x, $y, $w, $h, $candidateEntries) {
    if ($candidateEntries.Count -eq 0) { return "???" }
    if ($candidateEntries.Count -eq 1) { return $candidateEntries[0].display }

    $live = Extract-LiveGeoPHOG $bmp $x $y $w $h
    if (-not $live) { return $candidateEntries[0].display }
    $livePhog = $live.phog
    $liveAspect = $live.aspectRatio
    $liveExtent = $live.extent
    $liveArea = $live.areaRatio

    $bestDisplay = ""; $bestDist = 999999999.0
    foreach ($entry in $candidateEntries) {
        $ref = if ($geoDecoded.ContainsKey($entry.id)) { $geoDecoded[$entry.id] } else { $null }
        if (-not $ref) { continue }
        $refPhog = $ref.phog
        $refAspect = $ref.aspectRatio
        $refExtent = $ref.extent
        $refArea = $ref.areaRatio

        # 1. 680-dim PHOG L1 Distance
        $distPhog = 0.0
        for ($k = 0; $k -lt 680; $k++) {
            $distPhog += [Math]::Abs([int]$livePhog[$k] - [int]$refPhog[$k])
        }

        # 2. Geometric Shape Penalties (Aspect Ratio, Extent/Solidity, Normalized Area)
        $aspectRatioDiff = [Math]::Abs($liveAspect - $refAspect)
        $extentDiff = [Math]::Abs($liveExtent - $refExtent)
        $areaDiff = [Math]::Abs($liveArea - $refArea)

        $totalDist = $distPhog + (380.0 * $aspectRatioDiff) + (420.0 * $extentDiff) + (250.0 * $areaDiff)

        if ($totalDist -lt $bestDist) {
            $bestDist = $totalDist
            $bestDisplay = $entry.display
        }
    }
    if ($bestDisplay) { return $bestDisplay }
    return $candidateEntries[0].display
}

function Get-CandidateEntriesStrict($t1, $t2) {
    $cEntries = @()
    if ($t1 -ne "none" -and $t2 -ne "none") {
        foreach ($r in $roster) {
            if (($r.t1 -eq $t1 -and $r.t2 -eq $t2) -or ($r.t1 -eq $t2 -and $r.t2 -eq $t1)) {
                $cEntries += $r
            }
        }
    }
    if ($cEntries.Count -eq 0 -and ($t1 -ne "none" -or $t2 -ne "none")) {
        $singleType = if ($t1 -ne "none") { $t1 } else { $t2 }
        foreach ($r in $roster) {
            if ($r.t1 -eq $singleType -and ($r.t2 -eq "none" -or -not $r.t2)) {
                $cEntries += $r
            }
        }
        if ($cEntries.Count -eq 0) {
            foreach ($r in $roster) {
                if ($r.t1 -eq $singleType -or $r.t2 -eq $singleType) {
                    $cEntries += $r
                }
            }
        }
    }
    if ($cEntries.Count -eq 0) { $cEntries = $roster }
    return $cEntries
}

function Get-SlotNumberAccurateLocal($bmp, $slotY) {
    $crop = $bmp.Clone((New-Object System.Drawing.Rectangle(505, ($slotY + 15), 70, 85)), $bmp.PixelFormat)
    $t20 = New-Object System.Drawing.Bitmap(20, 20)
    $g = [System.Drawing.Graphics]::FromImage($t20)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($crop, 0, 0, 20, 20); $g.Dispose(); $crop.Dispose()

    $b = New-Object byte[] (20 * 20); $idx = 0
    $whiteCount = 0
    for ($cy = 0; $cy -lt 20; $cy++) {
        for ($cx = 0; $cx -lt 20; $cx++) {
            $p = $t20.GetPixel($cx, $cy)
            $lum = ($p.R * 0.299 + $p.G * 0.587 + $p.B * 0.114)
            $isWhite = ($lum -gt 180)
            $b[$idx++] = if ($isWhite) { [byte]255 } else { [byte]0 }
            if ($isWhite) { $whiteCount++ }
        }
    }
    $t20.Dispose()

    if ($whiteCount -lt 150) { return 0 }

    $bestNum = 0; $bestDiff = 999999999
    foreach ($strNum in @("1", "2", "3", "4")) {
        $ref = $badgeFeaturesDecoded[$strNum]
        $diff = 0
        for ($k = 0; $k -lt 400; $k++) { $diff += [Math]::Abs([int]$b[$k] - [int]$ref[$k]) }
        if ($diff -lt $bestDiff) { $bestDiff = $diff; $bestNum = [int]$strNum }
    }
    return $bestNum
}

function Get-TeamMemberTypeInfoFromRoster($myTeamList) {
    $list = @()
    foreach ($pName in $myTeamList) {
        $norm = Normalize-PokeName $pName
        $matchedR = $null
        foreach ($r in $roster) {
            if ($r.display -eq $pName -or $r.name -eq $pName) { $matchedR = $r; break }
        }
        if (-not $matchedR) {
            foreach ($r in $roster) {
                if ((Normalize-PokeName $r.name) -eq $norm -or (Normalize-PokeName $r.display) -eq $norm) {
                    $matchedR = $r; break
                }
            }
        }
        if ($matchedR) {
            $list += [PSCustomObject]@{ name = $pName; t1 = $matchedR.t1; t2 = $matchedR.t2 }
        } else {
            $list += [PSCustomObject]@{ name = $pName; t1 = "none"; t2 = "none" }
        }
    }
    return $list
}

function Resolve-MySelectionFull($bmp, $myTeamList) {
    $slot0Y = 160; $slotPitch = 137
    $teamTypeInfo = Get-TeamMemberTypeInfoFromRoster $myTeamList

    $selectedSlotIndices = @{}
    for ($i = 0; $i -lt 6; $i++) {
        $sy = $slot0Y + $i * $slotPitch
        $num = Get-SlotNumberAccurateLocal $bmp $sy
        if ($num -ge 1 -and $num -le 4) {
            $selectedSlotIndices[$num] = $i
        }
    }

    $slotTypes = @()
    for ($i = 0; $i -lt 6; $i++) {
        $sy = $slot0Y + $i * $slotPitch
        $t1X = 710; $t2X = 765; $tY = $sy + 12; $tW = 45; $tH = 45
        $res1 = Match-TypeTemplate $bmp $t1X $tY $tW $tH $typeFeatAfterDecoded
        $res2 = Match-TypeTemplate $bmp $t2X $tY $tW $tH $typeFeatAfterDecoded
        $t1 = if ($res1.score -lt 12000000) { $res1.type } else { "none" }
        $t2 = if ($res2.score -lt 12000000) { $res2.type } else { "none" }
        $slotTypes += [PSCustomObject]@{ index = $i; t1 = $t1; t2 = $t2; res1 = $res1; res2 = $res2 }
    }

    $costMatrix = New-Object 'double[,]' 6, 6
    for ($slotIdx = 0; $slotIdx -lt 6; $slotIdx++) {
        $st = $slotTypes[$slotIdx]
        for ($teamIdx = 0; $teamIdx -lt 6; $teamIdx++) {
            $m = if ($teamIdx -lt $teamTypeInfo.Count) { $teamTypeInfo[$teamIdx] } else { @{t1="none"; t2="none"} }
            $cost = 1000.0
            
            if ($st.t1 -ne "none" -and $st.t2 -ne "none") {
                if (($m.t1 -eq $st.t1 -and $m.t2 -eq $st.t2) -or ($m.t1 -eq $st.t2 -and $m.t2 -eq $st.t1)) {
                    $cost = ($st.res1.score + $st.res2.score) / 1000000.0
                } elseif ($m.t1 -eq $st.t1 -or $m.t2 -eq $st.t1 -or $m.t1 -eq $st.t2 -or $m.t2 -eq $st.t2) {
                    $cost = 50.0 + ($st.res1.score / 1000000.0)
                }
            } elseif ($st.t2 -ne "none") {
                if ($m.t1 -eq $st.t2 -and ($m.t2 -eq "none" -or -not $m.t2)) {
                    $cost = ($st.res2.score) / 1000000.0
                } elseif ($m.t1 -eq $st.t2 -or $m.t2 -eq $st.t2) {
                    $cost = 60.0 + ($st.res2.score / 1000000.0)
                }
            }
            $costMatrix[$slotIdx, $teamIdx] = $cost
        }
    }

    $slotToTeam = @{}
    $assignedTeams = @()
    for ($step = 0; $step -lt 6; $step++) {
        $minCost = 999999.0; $bestSlot = -1; $bestTeam = -1
        for ($s = 0; $s -lt 6; $s++) {
            if ($slotToTeam.ContainsKey($s)) { continue }
            for ($t = 0; $t -lt 6; $t++) {
                if ($assignedTeams.Contains($t)) { continue }
                if ($costMatrix[$s, $t] -lt $minCost) {
                    $minCost = $costMatrix[$s, $t]
                    $bestSlot = $s; $bestTeam = $t
                }
            }
        }
        if ($bestSlot -ne -1 -and $bestTeam -ne -1) {
            $slotToTeam[$bestSlot] = $bestTeam
            $assignedTeams += $bestTeam
        }
    }

    $resultSelection = @{1=""; 2=""; 3=""; 4=""}
    foreach ($num in @(1, 2, 3, 4)) {
        if ($selectedSlotIndices.ContainsKey($num)) {
            $sIdx = $selectedSlotIndices[$num]
            if ($slotToTeam.ContainsKey($sIdx)) {
                $tIdx = $slotToTeam[$sIdx]
                $resultSelection[$num] = $myTeamList[$tIdx]
            }
        }
    }
    return $resultSelection
}

# -------------------------------------------------------------
# RUN EVALUATION
# -------------------------------------------------------------
$report = @()
$report += "======================================================="
$report += "      ULTIMATE POKEMON BATTLE LOG EVALUATION v16       "
$report += "      (Otsu Thresholding + 680-dim PHOG + Extent)      "
$report += "======================================================="

# --- 1. BEFORE MODE (Battle Selection Screen) ---
$report += ""
$report += "--- [1] BEFORE MODE (Battle Selection Screen) ---"
$totalBeforeSlots = 0; $correctBeforeSlots = 0

foreach ($prop in $gt.before.PSObject.Properties) {
    $imgName = $prop.Name
    $expected = $prop.Value
    $imgPath = "test/before/$imgName"
    if (-not (Test-Path $imgPath)) { continue }

    $bmp = New-Object System.Drawing.Bitmap($imgPath)
    $slot0Y = 137; $slotPitch = 137
    $iconX = 1955; $iconW = 130; $iconYOff = 5; $iconH = 105
    $t1X = 2117; $t1YOff = 12; $t2X = 2173; $t2YOff = 12; $tW = 45; $tH = 45

    $rowResults = @()
    $imgCorrect = 0

    for ($i = 0; $i -lt 6; $i++) {
        $slotY = $slot0Y + $i * $slotPitch
        $res1 = Match-TypeTemplate $bmp $t1X ($slotY + $t1YOff) $tW $tH $typeFeatBeforeDecoded
        $res2 = Match-TypeTemplate $bmp $t2X ($slotY + $t2YOff) $tW $tH $typeFeatBeforeDecoded
        $t1 = if ($res1.score -lt 8000000) { $res1.type } else { "none" }
        $t2 = if ($res2.score -lt 8000000) { $res2.type } else { "none" }

        $cEntries = Get-CandidateEntriesStrict $t1 $t2
        $pName = Match-PokemonGeoPHOGUniversal $bmp $iconX ($slotY + $iconYOff) $iconW $iconH $cEntries

        $expName = $expected[$i]
        $isMatch = (Normalize-PokeName $pName) -eq (Normalize-PokeName $expName)
        $totalBeforeSlots++
        if ($isMatch) { $correctBeforeSlots++; $imgCorrect++ }

        $mark = if ($isMatch) { "OK" } else { "NG" }
        $rowResults += "S" + ($i+1) + ": " + $pName + " (GT:" + $expName + ") [" + $mark + "]"
    }
    $bmp.Dispose()
    
    $accStr = "$imgCorrect/6"
    $resJoined = $rowResults -join " | "
    $report += "[$imgName] ($accStr) | $resJoined"
}

$beforePct = if ($totalBeforeSlots -gt 0) { [math]::Round(($correctBeforeSlots / $totalBeforeSlots) * 100, 1) } else { 0 }
$report += ""
$report += "BEFORE Overall Accuracy: $correctBeforeSlots / $totalBeforeSlots ($beforePct %)"

# --- 2. AFTER MODE (My Selection & Opponent) ---
$report += ""
$report += "--- [2] AFTER MODE (Battle Preparation Screen) ---"
$totalAfterOppSlots = 0; $correctAfterOppSlots = 0
$totalSelectedSlots = 0; $correctSelectedSlots = 0
$perfectMatches = 0; $totalMatches = 0

foreach ($prop in $gt.after.PSObject.Properties) {
    $imgName = $prop.Name
    $afterData = $prop.Value
    $imgPath = "test/after/$imgName"
    if (-not (Test-Path $imgPath)) { continue }

    $bmp = New-Object System.Drawing.Bitmap($imgPath)
    $slot0Y = 160; $slotPitch = 137

    # (A) Opponent 6 Pokemon (Right Panel: Optimized margin X=1765, W=115, YOff=10, H=95)
    $iconX = 1765; $iconW = 115; $iconYOff = 10; $iconH = 95
    $t1X = 1912; $t1YOff = 12; $t2X = 1970; $t2YOff = 12; $tW = 45; $tH = 45

    $oppResults = @()
    $oppCorrect = 0
    $expOpp = $afterData.opponent

    for ($i = 0; $i -lt 6; $i++) {
        $slotY = $slot0Y + $i * $slotPitch
        $res1 = Match-TypeTemplate $bmp $t1X ($slotY + $t1YOff) $tW $tH $typeFeatAfterDecoded
        $res2 = Match-TypeTemplate $bmp $t2X ($slotY + $t2YOff) $tW $tH $typeFeatAfterDecoded
        $t1 = if ($res1.score -lt 15000000) { $res1.type } else { "none" }
        $t2 = if ($res2.score -lt 15000000) { $res2.type } else { "none" }

        $cEntries = Get-CandidateEntriesStrict $t1 $t2
        $pName = Match-PokemonGeoPHOGUniversal $bmp $iconX ($slotY + $iconYOff) $iconW $iconH $cEntries

        $expName = if ($expOpp -and $expOpp.Count -gt $i) { $expOpp[$i] } else { "" }
        $isMatch = (Normalize-PokeName $pName) -eq (Normalize-PokeName $expName)
        $totalAfterOppSlots++
        if ($isMatch) { $correctAfterOppSlots++; $oppCorrect++ }

        $mark = if ($isMatch) { "OK" } else { "NG" }
        $oppResults += "S" + ($i+1) + ": " + $pName + " (GT:" + $expName + ") [" + $mark + "]"
    }

    # (B) My Selection (Generic 1-to-1 Assignment)
    $myTeam = $afterData.my_team
    $gtSelection = $afterData.my_selection
    $detectedSelection = Resolve-MySelectionFull $bmp $myTeam
    $bmp.Dispose()

    $predArr = @($detectedSelection[1], $detectedSelection[2], $detectedSelection[3], $detectedSelection[4])
    $selMatchCount = 0
    $selDetails = @()
    for ($pos = 0; $pos -lt 4; $pos++) {
        $pred = $predArr[$pos]
        $gtPos = if ($gtSelection -and $gtSelection.Count -gt $pos) { $gtSelection[$pos] } else { "" }
        $isOk = (Normalize-PokeName $pred) -eq (Normalize-PokeName $gtPos)
        $totalSelectedSlots++
        if ($isOk) { $correctSelectedSlots++; $selMatchCount++ }
        $mark = if ($isOk) { "OK" } else { "NG" }
        $posName = switch ($pos) { 0 {"先発1"}; 1 {"先発2"}; 2 {"後発1"}; 3 {"後発2"} }
        $selDetails += $posName + ": " + $pred + " (GT: " + $gtPos + ") [" + $mark + "]"
    }

    $totalMatches++
    if ($selMatchCount -eq 4) { $perfectMatches++ }

    $oppAccStr = "$oppCorrect/6"
    $selAccStr = "$selMatchCount/4"
    $oppJoined = $oppResults -join " | "
    $selJoined = $selDetails -join " | "
    $report += "[$imgName] Opp: ($oppAccStr) | $oppJoined"
    $report += "             Sel: ($selAccStr) | $selJoined"
}

$afterOppPct = if ($totalAfterOppSlots -gt 0) { [math]::Round(($correctAfterOppSlots / $totalAfterOppSlots) * 100, 1) } else { 0 }
$selPct = if ($totalSelectedSlots -gt 0) { [math]::Round(($correctSelectedSlots / $totalSelectedSlots) * 100, 1) } else { 0 }
$perfPct = if ($totalMatches -gt 0) { [math]::Round(($perfectMatches / $totalMatches) * 100, 1) } else { 0 }

$report += ""
$report += "======================================================="
$report += "FINAL ACCURACY SUMMARY:"
$report += "  BEFORE Mode (Opponent 6): $correctBeforeSlots / $totalBeforeSlots ($beforePct %)"
$report += "  AFTER Mode (Opponent 6):  $correctAfterOppSlots / $totalAfterOppSlots ($afterOppPct %)"
$report += "  My Selection Slot:        $correctSelectedSlots / $totalSelectedSlots ($selPct %)"
$report += "  My Selection Match 100%:  $perfectMatches / $totalMatches ($perfPct %)"
$report += "======================================================="

$report | Out-File "eval_report.txt" -Encoding UTF8
$report | ForEach-Object { Write-Host $_ }
