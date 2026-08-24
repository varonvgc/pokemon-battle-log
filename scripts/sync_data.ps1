# Showdown Sync Script (UTF-8 Clean)
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$dataDir = Join-Path $PSScriptRoot "..\data"
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }

Write-Host "=== Pokemon Showdown Data Sync ===" -ForegroundColor Cyan

# 1. Read existing local data with strict UTF-8
$localPokePath = Join-Path $dataDir "pokemon.json"
$localMovesPath = Join-Path $dataDir "moves.json"

$localPokeJson = [System.IO.File]::ReadAllText($localPokePath, [System.Text.Encoding]::UTF8)
$localMovesJson = [System.IO.File]::ReadAllText($localMovesPath, [System.Text.Encoding]::UTF8)

$localPokemon = $localPokeJson | ConvertFrom-Json
$localMoves = $localMovesJson | ConvertFrom-Json

Write-Host "Loaded local pokemon: $($localPokemon.Count), local moves: $($localMoves.Count)"

# 2. Fetch Showdown data files
$pokedexUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/pokedex.ts"
$movesUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/moves.ts"
$learnsetsUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/learnsets.ts"
$champLsUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions/learnsets.ts"

Write-Host "Downloading Showdown data..."
$pokedexRaw = (Invoke-WebRequest -Uri $pokedexUrl -UseBasicParsing).Content
$movesRaw = (Invoke-WebRequest -Uri $movesUrl -UseBasicParsing).Content
$learnsetsRaw = (Invoke-WebRequest -Uri $learnsetsUrl -UseBasicParsing).Content

$champLsRaw = ""
try {
    $champLsRaw = (Invoke-WebRequest -Uri $champLsUrl -UseBasicParsing).Content
    Write-Host "Downloaded Champions mod learnsets.ts" -ForegroundColor Green
} catch {
    Write-Warning "Could not download Champions learnsets"
}

# 3. Build Move ID to Japanese Name
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

# 4. Parse Base Learnsets
Write-Host "Parsing base learnsets (with latest-gen fallback)..."
$rawLearnsets = [System.Collections.Generic.Dictionary[string, System.Collections.Generic.List[string]]]::new()

$lsSections = [regex]::Matches($learnsetsRaw, '(?m)^\s*([a-z0-9]+):\s*\{\s*learnset:\s*\{([^}]+)\}')
foreach ($sec in $lsSections) {
    $specKey = $sec.Groups[1].Value
    $body = $sec.Groups[2].Value
    
    $mEntries = [regex]::Matches($body, '([a-z0-9]+):\s*\[(.*?)\]')
    
    # Find max generation
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

# 5. Override / Merge with Champions Mod
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

# 6. Map Showdown species num to baseId
$numToBaseId = [System.Collections.Generic.Dictionary[int, string]]::new()
$pokeSections = [regex]::Matches($pokedexRaw, '(?m)^\s*([a-z0-9]+):\s*\{\s*num:\s*(-?\d+)')
foreach ($ps in $pokeSections) {
    $id = $ps.Groups[1].Value
    $num = [int]$ps.Groups[2].Value
    if (-not $numToBaseId.ContainsKey($num)) {
        $numToBaseId[$num] = $id
    }
}

# 7. Map each localPokemon item to its learnset
Write-Host "Mapping learnsets for all pokemon displays..."
$finalLearnsets = [System.Collections.Generic.Dictionary[string, object]]::new()

foreach ($lp in $localPokemon) {
    $disp = [string]$lp.display
    $name = [string]$lp.name
    $num = [int]$lp.no
    $form = [string]$lp.form
    
    $movesFound = $null
    
    if ($numToBaseId.ContainsKey($num)) {
        $baseId = $numToBaseId[$num]
        
        # Check form-specific id first
        if ($form -and $form -ne '通常') {
            $normForm = ($form -replace '[^a-zA-Z0-9]', '').ToLower()
            $candId = $baseId + $normForm
            if ($rawLearnsets.ContainsKey($candId) -and $rawLearnsets[$candId].Count -gt 0) {
                $movesFound = $rawLearnsets[$candId]
            }
        }
        
        # Fallback to baseId
        if (-not $movesFound -and $rawLearnsets.ContainsKey($baseId) -and $rawLearnsets[$baseId].Count -gt 0) {
            $movesFound = $rawLearnsets[$baseId]
        }
    }
    
    if ($movesFound) {
        $finalLearnsets[$disp] = $movesFound.ToArray()
        if ($name -and -not $finalLearnsets.ContainsKey($name)) {
            $finalLearnsets[$name] = $movesFound.ToArray()
        }
    }
}

# Add raw english keys as well
foreach ($kv in $rawLearnsets) {
    if (-not $finalLearnsets.ContainsKey($kv.Key) -and $kv.Value.Count -gt 0) {
        $finalLearnsets[$kv.Key] = $kv.Value.ToArray()
    }
}

Write-Host "Total entries in final learnset: $($finalLearnsets.Count)" -ForegroundColor Green

# 8. Save learnsets.json with UTF-8 encoding
$learnsetsJson = $finalLearnsets | ConvertTo-Json -Depth 10
$learnsetsFile = Join-Path $dataDir "learnsets.json"
[System.IO.File]::WriteAllText($learnsetsFile, $learnsetsJson, [System.Text.Encoding]::UTF8)
Write-Host "Saved data/learnsets.json successfully." -ForegroundColor Green

Write-Host "`n=== Sync Complete Successfully! ===" -ForegroundColor Cyan
