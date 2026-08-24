# Showdown Sync Script (with Champions Priority and Fallback to Latest Gen)
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$dataDir = Join-Path $PSScriptRoot "..\data"
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }

Write-Host "=== Pokemon Showdown Data Sync (Champions & Multi-Gen) ===" -ForegroundColor Cyan

# 1. Fetch Showdown data files
$pokedexUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/pokedex.ts"
$movesUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/moves.ts"
$learnsetsUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/learnsets.ts"

$champLsUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions/learnsets.ts"
$champMovesUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions/moves.ts"

Write-Host "Downloading pokedex.ts..."
$pokedexRaw = (Invoke-WebRequest -Uri $pokedexUrl -UseBasicParsing).Content

Write-Host "Downloading moves.ts..."
$movesRaw = (Invoke-WebRequest -Uri $movesUrl -UseBasicParsing).Content

Write-Host "Downloading learnsets.ts..."
$learnsetsRaw = (Invoke-WebRequest -Uri $learnsetsUrl -UseBasicParsing).Content

Write-Host "Downloading Champions mod learnsets.ts..."
$champLsRaw = ""
try {
    $champLsRaw = (Invoke-WebRequest -Uri $champLsUrl -UseBasicParsing).Content
    Write-Host "Downloaded Champions mod learnsets.ts ($($champLsRaw.Length) bytes)" -ForegroundColor Green
} catch {
    Write-Warning "Could not download Champions learnsets: $($_.Exception.Message)"
}

Write-Host "Processing data..." -ForegroundColor Green

# Read existing local data
$localPokemonFile = Join-Path $dataDir "pokemon.json"
$localMovesFile = Join-Path $dataDir "moves.json"

$localPokemon = if (Test-Path $localPokemonFile) { Get-Content $localPokemonFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { @() }
$localMoves = if (Test-Path $localMovesFile) { Get-Content $localMovesFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { @() }

# Build Move ID to Japanese Name map
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

# Build Pokemon ID to Display Name map
$pokeIdToDisplay = [System.Collections.Generic.Dictionary[string, string]]::new()
$pokeDisplayToId = [System.Collections.Generic.Dictionary[string, string]]::new()

$localByNo = @{}
foreach ($lp in $localPokemon) {
    $n = [int]$lp.no
    if (-not $localByNo.ContainsKey($n)) { $localByNo[$n] = [System.Collections.Generic.List[object]]::new() }
    $localByNo[$n].Add($lp)
}

$pokeMatches = [regex]::Matches($pokedexRaw, '(?m)^\s*([a-z0-9]+):\s*\{\s*num:\s*(-?\d+)')
foreach ($p in $pokeMatches) {
    $speciesId = $p.Groups[1].Value
    $speciesNum = [int]$p.Groups[2].Value
    
    if ($localByNo.ContainsKey($speciesNum)) {
        $cands = $localByNo[$speciesNum]
        if ($cands.Count -eq 1) {
            $disp = [string]$cands[0].display
            $pokeIdToDisplay[$speciesId] = $disp
            $pokeDisplayToId[$disp] = $speciesId
        } else {
            $matched = $false
            foreach ($cand in $cands) {
                $candForm = [string]$cand.form
                $normForm = ($candForm -replace '[^a-zA-Z0-9]', '').ToLower()
                if ($candForm -ne '通常' -and $normForm -and $speciesId.EndsWith($normForm)) {
                    $disp = [string]$cand.display
                    $pokeIdToDisplay[$speciesId] = $disp
                    $pokeDisplayToId[$disp] = $speciesId
                    $matched = $true
                    break
                }
            }
            if (-not $matched) {
                $normalCand = $cands | Where-Object { $_.form -eq '通常' -or -not $_.form } | Select-Object -First 1
                if ($normalCand) {
                    $disp = [string]$normalCand.display
                    $pokeIdToDisplay[$speciesId] = $disp
                    $pokeDisplayToId[$disp] = $speciesId
                }
            }
        }
    }
}

foreach ($lp in $localPokemon) {
    $disp = [string]$lp.display
    if ($disp -and -not $pokeDisplayToId.ContainsKey($disp)) {
        $norm = "poke" + $lp.no + ($lp.form -replace '[^a-zA-Z0-9]', '').ToLower()
        $pokeDisplayToId[$disp] = $norm
        $pokeIdToDisplay[$norm] = $disp
    }
}

Write-Host "Total pokemon mapped: $($pokeIdToDisplay.Count)"

# 2. Parse Champions Mod Learnsets First
$champLearnsets = [System.Collections.Generic.Dictionary[string, System.Collections.Generic.List[string]]]::new()
if ($champLsRaw) {
    $champSections = [regex]::Matches($champLsRaw, '(?m)^\s*([a-z0-9]+):\s*\{\s*learnset:\s*\{([^}]+)\}')
    foreach ($sec in $champSections) {
        $specKey = $sec.Groups[1].Value
        $body = $sec.Groups[2].Value
        $targetDisplay = if ($pokeIdToDisplay.ContainsKey($specKey)) { $pokeIdToDisplay[$specKey] } else { $specKey }
        
        $mList = [System.Collections.Generic.List[string]]::new()
        $mEntries = [regex]::Matches($body, '([a-z0-9]+):\s*\[(.*?)\]')
        foreach ($entry in $mEntries) {
            $moveKey = $entry.Groups[1].Value
            $mJpName = if ($moveIdToName.ContainsKey($moveKey)) { $moveIdToName[$moveKey] } else { $moveKey }
            if (-not $mList.Contains($mJpName)) {
                $mList.Add($mJpName)
            }
        }
        if ($mList.Count -gt 0) {
            $champLearnsets[$targetDisplay] = $mList
        }
    }
    Write-Host "Champions mod learnsets found for: $($champLearnsets.Count) pokemon" -ForegroundColor Cyan
}

# 3. Parse Base Learnsets (with latest-gen fallback)
Write-Host "Parsing base learnsets with latest-gen fallback..."
$learnsetsObj = [System.Collections.Generic.Dictionary[string, object]]::new()

$lsSections = [regex]::Matches($learnsetsRaw, '(?m)^\s*([a-z0-9]+):\s*\{\s*learnset:\s*\{([^}]+)\}')
foreach ($sec in $lsSections) {
    $specKey = $sec.Groups[1].Value
    $body = $sec.Groups[2].Value
    
    $targetDisplay = if ($pokeIdToDisplay.ContainsKey($specKey)) { $pokeIdToDisplay[$specKey] } else { $specKey }
    
    # Check if Champions data already exists for this pokemon
    if ($champLearnsets.ContainsKey($targetDisplay) -and $champLearnsets[$targetDisplay].Count -gt 0) {
        $learnsetsObj[$targetDisplay] = $champLearnsets[$targetDisplay].ToArray()
        continue
    }
    
    # Otherwise find highest generation available in sources
    $mEntries = [regex]::Matches($body, '([a-z0-9]+):\s*\[(.*?)\]')
    
    # First pass: find max generation number present for this pokemon
    $maxGen = 0
    foreach ($entry in $mEntries) {
        $sources = $entry.Groups[2].Value
        $genMatches = [regex]::Matches($sources, '"(\d)[A-Z0-9]*"')
        foreach ($gm in $genMatches) {
            $gNum = [int]$gm.Groups[1].Value
            if ($gNum -gt $maxGen) { $maxGen = $gNum }
        }
    }
    
    if ($maxGen -eq 0) { $maxGen = 9 } # default
    
    # Second pass: collect moves from the highest available generation
    $movesList = [System.Collections.Generic.List[string]]::new()
    foreach ($entry in $mEntries) {
        $moveKey = $entry.Groups[1].Value
        $sources = $entry.Groups[2].Value
        
        # Check if learned in maxGen (or if no generation code, allow it)
        $isMatchGen = $sources -match "`"$maxGen[A-Z0-9]*`""
        
        if ($isMatchGen) {
            $mJpName = if ($moveIdToName.ContainsKey($moveKey)) { $moveIdToName[$moveKey] } else { $moveKey }
            if (-not $movesList.Contains($mJpName)) {
                $movesList.Add($mJpName)
            }
        }
    }
    
    if ($movesList.Count -gt 0) {
        if ($learnsetsObj.ContainsKey($targetDisplay)) {
            $existing = [System.Collections.Generic.List[string]]::new([string[]]$learnsetsObj[$targetDisplay])
            foreach ($m in $movesList) {
                if (-not $existing.Contains($m)) { $existing.Add($m) }
            }
            $learnsetsObj[$targetDisplay] = $existing.ToArray()
        } else {
            $learnsetsObj[$targetDisplay] = $movesList.ToArray()
        }
    }
}

Write-Host "Total pokemon with learnset mapped: $($learnsetsObj.Count)"

# 4. Save learnsets.json
$learnsetsJson = $learnsetsObj | ConvertTo-Json -Depth 10
$learnsetsFile = Join-Path $dataDir "learnsets.json"
[System.IO.File]::WriteAllText($learnsetsFile, $learnsetsJson, [System.Text.Encoding]::UTF8)
Write-Host "Saved data/learnsets.json" -ForegroundColor Green

# 5. Save translation_map.json
$transObj = [System.Collections.Generic.Dictionary[string, object]]::new()
$transObj["pokemon"] = $pokeDisplayToId
$transObj["moves"] = $moveNameToId

$transJson = $transObj | ConvertTo-Json -Depth 10
$transFile = Join-Path $dataDir "translation_map.json"
[System.IO.File]::WriteAllText($transFile, $transJson, [System.Text.Encoding]::UTF8)
Write-Host "Saved data/translation_map.json" -ForegroundColor Green

Write-Host "`n=== Sync Complete Successfully! ===" -ForegroundColor Cyan
