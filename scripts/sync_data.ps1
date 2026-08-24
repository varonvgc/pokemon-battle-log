# Pure ASCII Safe Comprehensive Showdown Sync Script
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$rootDir = Split-Path $PSScriptRoot -Parent
$dataDir = Join-Path $rootDir "data"
$assetsDir = Join-Path $rootDir "assets"

if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
if (-not (Test-Path $assetsDir)) { New-Item -ItemType Directory -Path $assetsDir | Out-Null }

Write-Host "=== Pokemon Showdown Comprehensive Sync (Data & Assets) ===" -ForegroundColor Cyan

# 1. Download Latest Sprite Sheets
Write-Host "Downloading latest sprite sheets to assets/..." -ForegroundColor Cyan
$spriteSheetUrl = "https://play.pokemonshowdown.com/sprites/pokemonicons-sheet.png"
$pokeballSheetUrl = "https://play.pokemonshowdown.com/sprites/pokemonicons-pokeball-sheet.png"

$spritePath = Join-Path $assetsDir "pokemonicons-sheet.png"
$pokeballPath = Join-Path $assetsDir "pokemonicons-pokeball-sheet.png"

try {
    Invoke-WebRequest -Uri $spriteSheetUrl -OutFile $spritePath -UseBasicParsing
    Write-Host "Saved assets/pokemonicons-sheet.png" -ForegroundColor Green
    Invoke-WebRequest -Uri $pokeballSheetUrl -OutFile $pokeballPath -UseBasicParsing
    Write-Host "Saved assets/pokemonicons-pokeball-sheet.png" -ForegroundColor Green
} catch {
    Write-Warning "Could not download sprite sheets: $($_.Exception.Message)"
}

# 2. Download Showdown Text & Data Files
Write-Host "Downloading Showdown data..." -ForegroundColor Cyan
$pokedexUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/pokedex.ts"
$movesUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/moves.ts"
$learnsetsUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/learnsets.ts"
$champLsUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions/learnsets.ts"
$battleDexDataUrl = "https://play.pokemonshowdown.com/js/battle-dex-data.js"

$pokedexRaw = (Invoke-WebRequest -Uri $pokedexUrl -UseBasicParsing).Content
$movesRaw = (Invoke-WebRequest -Uri $movesUrl -UseBasicParsing).Content
$learnsetsRaw = (Invoke-WebRequest -Uri $learnsetsUrl -UseBasicParsing).Content
$battleDexDataRaw = (Invoke-WebRequest -Uri $battleDexDataUrl -UseBasicParsing).Content

$champLsRaw = ""
try {
    $champLsRaw = (Invoke-WebRequest -Uri $champLsUrl -UseBasicParsing).Content
    Write-Host "Downloaded Champions mod learnsets.ts" -ForegroundColor Green
} catch {
    Write-Warning "Could not download Champions learnsets"
}

# 3. Parse BattlePokemonIconIndexes from battle-dex-data.js
Write-Host "Parsing BattlePokemonIconIndexes (forme icon offsets)..." -ForegroundColor Cyan
$iconIndexes = [System.Collections.Generic.Dictionary[string, int]]::new()

$iconIdxMatch = [regex]::Match($battleDexDataRaw, '(?s)BattlePokemonIconIndexes\s*=\s*\{([^}]+)\}')
if ($iconIdxMatch.Success) {
    $entries = $iconIdxMatch.Groups[1].Value -split ','
    foreach ($entry in $entries) {
        if ($entry -match '^\s*([a-z0-9]+)\s*:\s*(.+)$') {
            $key = $matches[1].Trim()
            $valExpr = $matches[2].Trim()
            if ($valExpr -match '(\d+)\s*\+\s*(\d+)') {
                $iconIndexes[$key] = [int]$matches[1] + [int]$matches[2]
            } elseif ($valExpr -match '^\d+$') {
                $iconIndexes[$key] = [int]$valExpr
            }
        }
    }
}
Write-Host "Extracted forme icon indexes: $($iconIndexes.Count)" -ForegroundColor Green

# 4. Read local pokemon and moves with strict UTF8
$localPokePath = Join-Path $dataDir "pokemon.json"
$localMovesPath = Join-Path $dataDir "moves.json"

$localPokemon = [System.IO.File]::ReadAllText($localPokePath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$localMoves = [System.IO.File]::ReadAllText($localMovesPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json

# 5. Build Move ID to Japanese Name
$moveIdToName = [System.Collections.Generic.Dictionary[string, string]]::new()
$moveNameToId = [System.Collections.Generic.Dictionary[string, string]]::new()

$moveMatches = [regex]::Matches($movesRaw, '(?m)^\s*([a-z0-9]+):\s*\{\s*num:\s*(-?\d+)')
foreach ($m in $moveMatches) {
    $mId = $m.Groups[1].Value
    $mNum = [int]$m.Groups[2].Value
    
    if ($mNum -gt 0 -and $mNum -le $localMoves.Count) {
        $jpName = [string]$localMoves[$mNum - 1].name
        $moveIdToName[$mId] = $jpName
        $moveNameToId[$jpName] = $mId
    } else {
        $moveIdToName[$mId] = $mId
        $moveNameToId[$mId] = $mId
    }
}

# 6. Parse Learnsets (Champions Priority + Latest-Gen Fallback)
Write-Host "Parsing learnsets..." -ForegroundColor Cyan
$rawLearnsets = [System.Collections.Generic.Dictionary[string, System.Collections.Generic.List[string]]]::new()

$lsSections = [regex]::Matches($learnsetsRaw, '(?m)^\s*([a-z0-9]+):\s*\{\s*learnset:\s*\{([^}]+)\}')
foreach ($sec in $lsSections) {
    $specKey = $sec.Groups[1].Value
    $body = $sec.Groups[2].Value
    
    $mEntries = [regex]::Matches($body, '([a-z0-9]+):\s*\[(.*?)\]')
    
    $maxGen = 0
    foreach ($entry in $mEntries) {
        $sources = $entry.Groups[2].Value
        $genMatches = [regex]::Matches($sources, '"(\d)[A-Z0-9]*"')
        foreach ($gm in $genMatches) {
            $gNum = [int]$gm.Groups[1].Value
            if ($gNum -gt $maxGen) { $maxGen = $gNum }
        }
    }
    if ($maxGen -eq 0) { $maxGen = 9 }
    
    $mList = [System.Collections.Generic.List[string]]::new()
    foreach ($entry in $mEntries) {
        $moveKey = $entry.Groups[1].Value
        $sources = $entry.Groups[2].Value
        
        $isMatchGen = $sources -match "`"$maxGen[A-Z0-9]*`""
        if ($isMatchGen) {
            $mJpName = if ($moveIdToName.ContainsKey($moveKey)) { $moveIdToName[$moveKey] } else { $moveKey }
            if (-not $mList.Contains($mJpName)) {
                $mList.Add($mJpName)
            }
        }
    }
    $rawLearnsets[$specKey] = $mList
}

if ($champLsRaw) {
    $champSections = [regex]::Matches($champLsRaw, '(?m)^\s*([a-z0-9]+):\s*\{\s*learnset:\s*\{([^}]+)\}')
    foreach ($sec in $champSections) {
        $specKey = $sec.Groups[1].Value
        $body = $sec.Groups[2].Value
        
        $mList = [System.Collections.Generic.List[string]]::new()
        $mEntries = [regex]::Matches($body, '([a-z0-9]+):\s*\[(.*?)\]')
        foreach ($entry in $mEntries) {
            $moveKey = $entry.Groups[1].Value
            $mJpName = if ($moveIdToName.ContainsKey($moveKey)) { $moveIdToName[$moveKey] } else { $moveKey }
            if (-not $mList.Contains($mJpName)) {
                $mList.Add($mJpName)
            }
        }
        $rawLearnsets[$specKey] = $mList
    }
}

# 7. Map Pokedex Species: group species by num
$pokedexSpeciesByNum = [System.Collections.Generic.Dictionary[int, System.Collections.Generic.List[object]]]::new()

$pokeBlocks = [regex]::Matches($pokedexRaw, '(?m)^\s*([a-z0-9]+):\s*\{\s*num:\s*(-?\d+)(?:,\s*name:\s*"([^"]+)")?(?:[^{}]*?baseSpecies:\s*"([^"]+)")?(?:[^{}]*?forme:\s*"([^"]+)")?')
foreach ($pb in $pokeBlocks) {
    $sId = $pb.Groups[1].Value
    $sNum = [int]$pb.Groups[2].Value
    $sName = $pb.Groups[3].Value
    $sBase = $pb.Groups[4].Value
    $sForme = $pb.Groups[5].Value
    
    $obj = @{
        id = $sId
        num = $sNum
        name = $sName
        baseSpecies = $sBase
        forme = $sForme
    }
    
    if (-not $pokedexSpeciesByNum.ContainsKey($sNum)) {
        $pokedexSpeciesByNum[$sNum] = [System.Collections.Generic.List[object]]::new()
    }
    $pokedexSpeciesByNum[$sNum].Add($obj)
}

# 8. Assign iconIndex and build final learnsets
Write-Host "Updating pokemon.json with iconIndex and generating learnsets.json..." -ForegroundColor Cyan
$finalLearnsets = [System.Collections.Generic.Dictionary[string, object]]::new()

# Group local pokemon by no
$localByNo = [System.Collections.Generic.Dictionary[int, System.Collections.Generic.List[object]]]::new()
foreach ($lp in $localPokemon) {
    $n = [int]$lp.no
    if (-not $localByNo.ContainsKey($n)) {
        $localByNo[$n] = [System.Collections.Generic.List[object]]::new()
    }
    $localByNo[$n].Add($lp)
}

foreach ($nKey in $localByNo.Keys) {
    $cands = $localByNo[$nKey]
    $showdownSpecies = if ($pokedexSpeciesByNum.ContainsKey($nKey)) { $pokedexSpeciesByNum[$nKey] } else { @() }
    
    $baseShowdown = $showdownSpecies | Where-Object { -not $_.baseSpecies -or $_.id -eq $_.baseSpecies.ToLower() } | Select-Object -First 1
    if (-not $baseShowdown -and $showdownSpecies.Count -gt 0) { $baseShowdown = $showdownSpecies[0] }
    $baseId = if ($baseShowdown) { $baseShowdown.id } else { "" }
    
    for ($cIdx = 0; $cIdx -lt $cands.Count; $cIdx++) {
        $cand = $cands[$cIdx]
        $disp = [string]$cand.display
        $pName = [string]$cand.name
        
        $resolvedId = $baseId
        $iconIdx = $nKey # default is national dex no
        
        if ($cIdx -eq 0) {
            # Base form
            $resolvedId = $baseId
            if ($iconIndexes.ContainsKey($baseId)) {
                $iconIdx = $iconIndexes[$baseId]
            }
        } elseif ($cIdx -lt $showdownSpecies.Count) {
            # Corresponding forme by index
            $matchedS = $showdownSpecies[$cIdx]
            $resolvedId = $matchedS.id
            if ($iconIndexes.ContainsKey($matchedS.id)) {
                $iconIdx = $iconIndexes[$matchedS.id]
            }
        } else {
            # If extra forms beyond showdown list, use base
            $resolvedId = $baseId
        }
        
        # Set iconIndex property
        $cand | Add-Member -NotePropertyName "iconIndex" -NotePropertyValue $iconIdx -Force
        
        # Get learnset
        $movesFound = $null
        if ($resolvedId -and $rawLearnsets.ContainsKey($resolvedId) -and $rawLearnsets[$resolvedId].Count -gt 0) {
            $movesFound = $rawLearnsets[$resolvedId]
        } elseif ($baseId -and $rawLearnsets.ContainsKey($baseId) -and $rawLearnsets[$baseId].Count -gt 0) {
            $movesFound = $rawLearnsets[$baseId]
        }
        
        if ($movesFound) {
            $finalLearnsets[$disp] = $movesFound.ToArray()
            if ($pName -and -not $finalLearnsets.ContainsKey($pName)) {
                $finalLearnsets[$pName] = $movesFound.ToArray()
            }
        }
    }
}

# Add english raw keys
foreach ($kv in $rawLearnsets) {
    if (-not $finalLearnsets.ContainsKey($kv.Key) -and $kv.Value.Count -gt 0) {
        $finalLearnsets[$kv.Key] = $kv.Value.ToArray()
    }
}

# 9. Save all data files with UTF-8
[System.IO.File]::WriteAllText($localPokePath, ($localPokemon | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)
Write-Host "Updated and saved data/pokemon.json with iconIndex" -ForegroundColor Green

[System.IO.File]::WriteAllText((Join-Path $dataDir "learnsets.json"), ($finalLearnsets | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)
Write-Host "Saved data/learnsets.json" -ForegroundColor Green

$transObj = [System.Collections.Generic.Dictionary[string, object]]::new()
$transObj["moves"] = $moveNameToId
[System.IO.File]::WriteAllText((Join-Path $dataDir "translation_map.json"), ($transObj | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)
Write-Host "Saved data/translation_map.json" -ForegroundColor Green

Write-Host "`n=== Comprehensive Sync Complete Successfully! ===" -ForegroundColor Cyan