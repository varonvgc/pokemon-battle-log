# Pure ASCII Safe Comprehensive Showdown Master Sync Script (Data & Assets)
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$rootDir = $PSScriptRoot
if (Test-Path (Join-Path $rootDir "scripts")) {
    # Running from root
} elseif (Test-Path (Join-Path (Split-Path $rootDir -Parent) "scripts")) {
    # Running from scripts folder
    $rootDir = Split-Path $rootDir -Parent
}

$dataDir = Join-Path $rootDir "data"
$assetsDir = Join-Path $rootDir "assets"
$scriptsDir = Join-Path $rootDir "scripts"

if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
if (-not (Test-Path $assetsDir)) { New-Item -ItemType Directory -Path $assetsDir | Out-Null }

Write-Host "=== Pokemon Showdown Master Comprehensive Sync (Data & Assets) ===" -ForegroundColor Cyan

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

# 2. Download Showdown Text & Data Files and PokeAPI Official Master Data
Write-Host "Downloading Showdown data & PokeAPI official Japanese master files..." -ForegroundColor Cyan
$pokedexUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/pokedex.ts"
$movesUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/moves.ts"
$learnsetsUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/learnsets.ts"
$champLsUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions/learnsets.ts"
$formatsDataUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/formats-data.ts"
$champFdUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions/formats-data.ts"
$battleDexDataUrl = "https://play.pokemonshowdown.com/js/battle-dex-data.js"

$speciesCsvUrl = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv"
$formsCsvUrl = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_forms.csv"
$formNamesCsvUrl = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_form_names.csv"

$pokedexRaw = (Invoke-WebRequest -Uri $pokedexUrl -UseBasicParsing).Content
$movesRaw = (Invoke-WebRequest -Uri $movesUrl -UseBasicParsing).Content
$learnsetsRaw = (Invoke-WebRequest -Uri $learnsetsUrl -UseBasicParsing).Content
$formatsDataRaw = (Invoke-WebRequest -Uri $formatsDataUrl -UseBasicParsing).Content
$battleDexDataRaw = (Invoke-WebRequest -Uri $battleDexDataUrl -UseBasicParsing).Content

$speciesCsvRaw = (Invoke-WebRequest -Uri $speciesCsvUrl -UseBasicParsing).Content | ConvertFrom-Csv
$formsCsvRaw = (Invoke-WebRequest -Uri $formsCsvUrl -UseBasicParsing).Content | ConvertFrom-Csv
$formNamesCsvRaw = (Invoke-WebRequest -Uri $formNamesCsvUrl -UseBasicParsing).Content | ConvertFrom-Csv

$champLsRaw = ""
try {
    $champLsRaw = (Invoke-WebRequest -Uri $champLsUrl -UseBasicParsing).Content
    Write-Host "Downloaded Champions mod learnsets.ts" -ForegroundColor Green
} catch {
    Write-Warning "Could not download Champions learnsets"
}

$champFdRaw = ""
try {
    $champFdRaw = (Invoke-WebRequest -Uri $champFdUrl -UseBasicParsing).Content
    Write-Host "Downloaded Champions mod formats-data.ts" -ForegroundColor Green
} catch {
    Write-Warning "Could not download Champions formats-data"
}

# 3. Build Official Japanese Pokemon Name Map from PokeAPI
$speciesJpMap = [System.Collections.Generic.Dictionary[int, string]]::new()
foreach ($row in $speciesCsvRaw) {
    if ($row.local_language_id -eq "1" -or $row.local_language_id -eq "11") {
        $sId = [int]$row.pokemon_species_id
        if (-not $speciesJpMap.ContainsKey($sId) -or $row.local_language_id -eq "11") {
            $speciesJpMap[$sId] = $row.name
        }
    }
}
Write-Host "Loaded official Japanese Pokemon species: $($speciesJpMap.Count)" -ForegroundColor Green

# 4. Build Official Japanese Form Name Map from PokeAPI
$pokeapiFormMap = @{}
$formsDict = @{}
foreach ($f in $formsCsvRaw) {
    $formsDict[[int]$f.id] = $f.identifier.ToLower()
}
foreach ($fn in $formNamesCsvRaw) {
    if ($fn.local_language_id -in @("1", "11") -and $fn.form_name) {
        $fId = [int]$fn.pokemon_form_id
        if ($formsDict.ContainsKey($fId)) {
            $pokeapiFormMap[$formsDict[$fId]] = $fn.form_name
        }
    }
}
Write-Host "Loaded official Japanese PokeAPI forms: $($pokeapiFormMap.Count)" -ForegroundColor Green

# 5. Parse BattlePokemonIconIndexes from battle-dex-data.js
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

# 6. Parse Showdown Regulation & Tier Formats-Data (Champions Priority + SV Standard)
function Parse-FormatsData($raw) {
    $dict = @{}
    $matches = [regex]::Matches($raw, '(?ms)^\t([a-z0-9]+):\s*\{(.*?)\n\t\},')
    foreach ($m in $matches) {
        $id = $m.Groups[1].Value
        $body = $m.Groups[2].Value
        
        $tierMatch = [regex]::Match($body, 'tier:\s*"([^"]+)"')
        $tier = if ($tierMatch.Success) { $tierMatch.Groups[1].Value } else { "" }
        
        $nonstdMatch = [regex]::Match($body, 'isNonstandard:\s*"([^"]+)"')
        $nonstd = if ($nonstdMatch.Success) { $nonstdMatch.Groups[1].Value } else { "" }
        
        $dict[$id] = @{ tier = $tier; isNonstandard = $nonstd }
    }
    return $dict
}

$baseFd = Parse-FormatsData $formatsDataRaw
$champFd = if ($champFdRaw) { Parse-FormatsData $champFdRaw } else { @{} }

function Is-ConfirmedSpecies($id, $baseSpeciesId) {
    # 1. Champions mod check
    if ($champFd.ContainsKey($id)) {
        $info = $champFd[$id]
        if ($info.isNonstandard -or $info.tier -eq "Illegal") { return $false }
        if ($info.tier) { return $true }
    }
    if ($baseSpeciesId -and $champFd.ContainsKey($baseSpeciesId)) {
        $info = $champFd[$baseSpeciesId]
        if ($info.isNonstandard -or $info.tier -eq "Illegal") { return $false }
        if ($info.tier) { return $true }
    }
    
    # 2. Base SV Standard check
    if ($baseFd.ContainsKey($id)) {
        $info = $baseFd[$id]
        if ($info.isNonstandard -or $info.tier -eq "Illegal") { return $false }
        if ($info.tier) { return $true }
    }
    if ($baseSpeciesId -and $baseFd.ContainsKey($baseSpeciesId)) {
        $info = $baseFd[$baseSpeciesId]
        if ($info.isNonstandard -or $info.tier -eq "Illegal") { return $false }
        if ($info.tier) { return $true }
    }
    
    return $false
}

# 7. Read translations, local items, existing pokemon
$transPath = Join-Path $scriptsDir "translations.json"
$typeMap = @{}
$abilityMap = @{}
if (Test-Path $transPath) {
    $transData = [System.IO.File]::ReadAllText($transPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($transData.types) {
        foreach ($prop in $transData.types.PSObject.Properties) { $typeMap[$prop.Name] = $prop.Value }
    }
    if ($transData.abilities) {
        foreach ($prop in $transData.abilities.PSObject.Properties) { $abilityMap[$prop.Name] = $prop.Value }
    }
}

$localPokePath = Join-Path $dataDir "pokemon.json"
$localMovesPath = Join-Path $dataDir "moves.json"
$localItemsPath = Join-Path $dataDir "items.json"
$versionPath = Join-Path $dataDir "version.json"

$localMoves = if (Test-Path $localMovesPath) { [System.IO.File]::ReadAllText($localMovesPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json } else { @() }
$localItems = if (Test-Path $localItemsPath) { [System.IO.File]::ReadAllText($localItemsPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json } else { @() }

function Convert-TypeJp([string]$engType) {
    if ([string]::IsNullOrWhiteSpace($engType)) { return "" }
    if ($typeMap.ContainsKey($engType)) { return $typeMap[$engType] }
    return $engType
}

function Convert-AbilityJp([string]$engAbility) {
    if ([string]::IsNullOrWhiteSpace($engAbility)) { return "" }
    $norm = $engAbility.Replace([char]0x2019, [char]0x27)
    if ($abilityMap.ContainsKey($engAbility)) { return $abilityMap[$engAbility] }
    if ($abilityMap.ContainsKey($norm)) { return $abilityMap[$norm] }
    return $engAbility
}

# 8. Build Move ID to Japanese Name
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

# 9. Parse Learnsets (Champions Priority + Latest-Gen Fallback)
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

# 10. Parse Showdown Pokedex and construct Master Pokemon List
Write-Host "Constructing Pokemon Master list from Showdown pokedex.ts..." -ForegroundColor Cyan

$uNormal = [System.Text.RegularExpressions.Regex]::Unescape("\u901a\u5e38")
$uMega = [System.Text.RegularExpressions.Regex]::Unescape("\u30e1\u30ac")
$uMeganium = [System.Text.RegularExpressions.Regex]::Unescape("\u30e1\u30ac\u30cb\u30a6\u30e0")

$formJpMap = @{
    "alola" = [System.Text.RegularExpressions.Regex]::Unescape("\u30a2\u30ed\u30fc\u30e9\u306e\u3059\u304c\u305f")
    "galar" = [System.Text.RegularExpressions.Regex]::Unescape("\u30ac\u30e9\u30eb\u306e\u3059\u304c\u305f")
    "hisui" = [System.Text.RegularExpressions.Regex]::Unescape("\u30d2\u30b9\u30a4\u306e\u3059\u304c\u305f")
    "paldea" = [System.Text.RegularExpressions.Regex]::Unescape("\u30d1\u30eb\u30c7\u30a2\u306e\u3059\u304c\u305f")
    "paldeacombat" = [System.Text.RegularExpressions.Regex]::Unescape("\u30b3\u30f3\u30d0\u30c3\u30c8\u7a2e")
    "paldeablaze" = [System.Text.RegularExpressions.Regex]::Unescape("\u30d6\u30ec\u30a4\u30ba\u7a2e")
    "paldeaaqua" = [System.Text.RegularExpressions.Regex]::Unescape("\u30a6\u30a9\u30fc\u30bf\u30fc\u7a2e")
    "gmax" = [System.Text.RegularExpressions.Regex]::Unescape("\u30ad\u30e7\u30c0\u30a4\u30de\u30c3\u30af\u30b9")
    "bloodmoon" = [System.Text.RegularExpressions.Regex]::Unescape("\u30a2\u30ab\u30c4\u30ad")
    "sky" = [System.Text.RegularExpressions.Regex]::Unescape("\u30b9\u30ab\u30a4\u30d5\u30a9\u30eb\u30e0")
    "complete" = [System.Text.RegularExpressions.Regex]::Unescape("\u30d1\u30fc\u30d5\u30a7\u30af\u30c8\u30d5\u30a9\u30eb\u30e0")
    "10%" = [System.Text.RegularExpressions.Regex]::Unescape("\uff11\uff10\uff05\u30d5\u30a9\u30eb\u30e0")
    "50%" = [System.Text.RegularExpressions.Regex]::Unescape("\uff15\uff10\uff05\u30d5\u30a9\u30eb\u30e0")
    "heat" = [System.Text.RegularExpressions.Regex]::Unescape("\u30d2\u30fc\u30c8\u30ed\u30c8\u30e0")
    "wash" = [System.Text.RegularExpressions.Regex]::Unescape("\u30a6\u30a9\u30c3\u30b7\u30e5\u30ed\u30c8\u30e0")
    "frost" = [System.Text.RegularExpressions.Regex]::Unescape("\u30d5\u30ed\u30b9\u30c8\u30ed\u30c8\u30e0")
    "fan" = [System.Text.RegularExpressions.Regex]::Unescape("\u30b9\u30d4\u30f3\u30ed\u30c8\u30e0")
    "mow" = [System.Text.RegularExpressions.Regex]::Unescape("\u30ab\u30c3\u30c8\u30ed\u30c8\u30e0")
    "origin" = [System.Text.RegularExpressions.Regex]::Unescape("\u30aa\u30ea\u30b8\u30f3\u30d5\u30a9\u30eb\u30e0")
    "therian" = [System.Text.RegularExpressions.Regex]::Unescape("\u308c\u3044\u3058\u3085\u3046\u30d5\u30a9\u30eb\u30e0")
    "black" = [System.Text.RegularExpressions.Regex]::Unescape("\u30d6\u30e9\u30c3\u30af\u30ad\u30e5\u30ec\u30e0")
    "white" = [System.Text.RegularExpressions.Regex]::Unescape("\u30db\u30ef\u30a4\u30c8\u30ad\u30e5\u30ec\u30e0")
    "crowned" = [System.Text.RegularExpressions.Regex]::Unescape("\u3051\u3093\u306e\u304a\u3046")
    "rapidstrike" = [System.Text.RegularExpressions.Regex]::Unescape("\u308c\u3093\u3052\u304d\u306e\u304b\u305f")
    "singlestrike" = [System.Text.RegularExpressions.Regex]::Unescape("\u3044\u3061\u3052\u304d\u306e\u304b\u305f")
    "wellspring" = [System.Text.RegularExpressions.Regex]::Unescape("\u3044\u3069\u306e\u3081\u3093")
    "hearthflame" = [System.Text.RegularExpressions.Regex]::Unescape("\u304b\u307e\u3069\u306e\u3081\u3093")
    "cornerstone" = [System.Text.RegularExpressions.Regex]::Unescape("\u3044\u3057\u305a\u3048\u306e\u3081\u3093")
    "terastal" = [System.Text.RegularExpressions.Regex]::Unescape("\u30c6\u30e9\u30b9\u30bf\u30eb\u30d5\u30a9\u30eb\u30e0")
    "stellar" = [System.Text.RegularExpressions.Regex]::Unescape("\u30b9\u30c6\u30e9\u30d5\u30a9\u30eb\u30e0")
    "dusk" = [System.Text.RegularExpressions.Regex]::Unescape("\u305f\u305d\u304c\u308c\u306e\u3059\u304c\u305f")
    "midnight" = [System.Text.RegularExpressions.Regex]::Unescape("\u307e\u3088\u306a\u304b\u306e\u3059\u304c\u305f")
    "midday" = [System.Text.RegularExpressions.Regex]::Unescape("\u307e\u3072\u308b\u306e\u3059\u304c\u305f")
    "land" = [System.Text.RegularExpressions.Regex]::Unescape("\u30e9\u30f3\u30c9\u30d5\u30a9\u30eb\u30e0")
    "hero" = [System.Text.RegularExpressions.Regex]::Unescape("\u30ca\u30a4\u30fc\u30d6\u30d5\u30a9\u30eb\u30e0")
    "heroform" = [System.Text.RegularExpressions.Regex]::Unescape("\u30ca\u30a4\u30fc\u30d6\u30d5\u30a9\u30eb\u30e0")
    "roaming" = [System.Text.RegularExpressions.Regex]::Unescape("\u3068\u307b\u30d5\u30a9\u30eb\u30e0")
    "curly" = [System.Text.RegularExpressions.Regex]::Unescape("\u305d\u3063\u305f\u3059\u304c\u305f")
    "droopy" = [System.Text.RegularExpressions.Regex]::Unescape("\u305f\u308c\u305f\u3059\u304c\u305f")
    "stretchy" = [System.Text.RegularExpressions.Regex]::Unescape("\u306e\u3073\u305f\u3059\u304c\u305f")
    "three-segment" = [System.Text.RegularExpressions.Regex]::Unescape("\u307f\u3064\u3075\u3057\u30d5\u30a9\u30eb\u30e0")
    "two-segment" = [System.Text.RegularExpressions.Regex]::Unescape("\u3075\u305f\u3075\u3057\u30d5\u30a9\u30eb\u30e0")
    "totem" = [System.Text.RegularExpressions.Regex]::Unescape("\u306c\u3057")
    "m" = [System.Text.RegularExpressions.Regex]::Unescape("\u30aa\u30b9\u306e\u3059\u304c\u305f")
    "f" = [System.Text.RegularExpressions.Regex]::Unescape("\u30e1\u30b9\u306e\u3059\u304c\u305f")
    "shield" = [System.Text.RegularExpressions.Regex]::Unescape("\u30b7\u30fc\u30eb\u30c9\u30d5\u30a9\u30eb\u30e0")
    "blade" = [System.Text.RegularExpressions.Regex]::Unescape("\u30d6\u30ec\u30fc\u30c9\u30d5\u30a9\u30eb\u30e0")
    "eternal" = [System.Text.RegularExpressions.Regex]::Unescape("\u3048\u3044\u3048\u3093\u306e\u306f\u306a")
    "hangry" = [System.Text.RegularExpressions.Regex]::Unescape("\u306f\u3089\u307a\u3053\u3082\u3088\u3046")
    "fullbelly" = [System.Text.RegularExpressions.Regex]::Unescape("\u307e\u3093\u3077\u304f\u3082\u3088\u3046")
    "iceface" = [System.Text.RegularExpressions.Regex]::Unescape("\u30a2\u30a4\u30b9\u30d5\u30a7\u30a4\u30b9")
    "noiceface" = [System.Text.RegularExpressions.Regex]::Unescape("\u30ca\u30a4\u30b9\u30d5\u30a7\u30a4\u30b9")
    "school" = [System.Text.RegularExpressions.Regex]::Unescape("\u3080\u308c\u306e\u3059\u304c\u305f")
    "busted" = [System.Text.RegularExpressions.Regex]::Unescape("\u3070\u308c\u305f\u3059\u304c\u305f")
    "gulping" = [System.Text.RegularExpressions.Regex]::Unescape("\u3046\u306e\u30df\u30b5\u30a4\u30eb\u306e\u3059\u304c\u305f")
    "gorging" = [System.Text.RegularExpressions.Regex]::Unescape("\u30d4\u30ab\u30c1\u30e5\u30a6\u306e\u3059\u304c\u305f")
    "dada" = [System.Text.RegularExpressions.Regex]::Unescape("\u3068\u3046\u3061\u3083\u3093")
}

$idDirectDisplayMap = @{
    "basculegion" = [System.Text.RegularExpressions.Regex]::Unescape("\u30a4\u30c0\u30a4\u30c8\u30a6(\u30aa\u30b9\u306e\u3059\u304c\u305f)")
    "basculegionf" = [System.Text.RegularExpressions.Regex]::Unescape("\u30a4\u30c0\u30a4\u30c8\u30a6(\u30e1\u30b9\u306e\u3059\u304c\u305f)")
    "aegislash" = [System.Text.RegularExpressions.Regex]::Unescape("\u30ae\u30eb\u30ac\u30eb\u30c9(\u30b7\u30fc\u30eb\u30c9\u30d5\u30a9\u30eb\u30e0)")
    "aegislashblade" = [System.Text.RegularExpressions.Regex]::Unescape("\u30ae\u30eb\u30ac\u30eb\u30c9(\u30d6\u30ec\u30fc\u30c9\u30d5\u30a9\u30eb\u30e0)")
    "floetteeternal" = [System.Text.RegularExpressions.Regex]::Unescape("\u30d5\u30e9\u30a8\u30c3\u30c6(\u3048\u3044\u3048\u3093\u306e\u306f\u306a)")
    "morpeko" = [System.Text.RegularExpressions.Regex]::Unescape("\u30e2\u30eb\u307a\u30b3(\u307e\u3093\u3077\u304f\u3082\u3088\u3046)")
    "morpekohangry" = [System.Text.RegularExpressions.Regex]::Unescape("\u30e2\u30eb\u307a\u30b3(\u306f\u3089\u307a\u3053\u3082\u3088\u3046)")
    "eiscue" = [System.Text.RegularExpressions.Regex]::Unescape("\u30b3\u30aa\u30ea\u30c3\u30dd(\u30a2\u30a4\u30b9\u30d5\u30a7\u30a4\u30b9)")
    "eiscuenoice" = [System.Text.RegularExpressions.Regex]::Unescape("\u30b3\u30aa\u30ea\u30c3\u30dd(\u30ca\u30a4\u30b9\u30d5\u30a7\u30a4\u30b9)")
}

$pokeDetailedBlocks = [regex]::Matches($pokedexRaw, '(?ms)^\t([a-z0-9]+):\s*\{(.*?)\n\t\},')
$finalPokemonList = [System.Collections.Generic.List[object]]::new()
$finalLearnsets = [System.Collections.Generic.Dictionary[string, object]]::new()

$confirmedCount = 0

foreach ($pb in $pokeDetailedBlocks) {
    $sId = $pb.Groups[1].Value
    $body = $pb.Groups[2].Value
    
    $numMatch = [regex]::Match($body, 'num:\s*(-?\d+)')
    if (-not $numMatch.Success) { continue }
    $sNum = [int]$numMatch.Groups[1].Value
    if ($sNum -le 0) { continue }
    
    $nameMatch = [regex]::Match($body, 'name:\s*"([^"]+)"')
    $sName = if ($nameMatch.Success) { $nameMatch.Groups[1].Value } else { "" }
    
    $baseMatch = [regex]::Match($body, 'baseSpecies:\s*"([^"]+)"')
    $sBase = if ($baseMatch.Success) { $baseMatch.Groups[1].Value } else { "" }
    $baseSpecKey = if ($sBase) { ($sBase.ToLower() -replace '[^a-z0-9]', '') } else { "" }
    
    $formeMatch = [regex]::Match($body, 'forme:\s*"([^"]+)"')
    $sForme = if ($formeMatch.Success) { $formeMatch.Groups[1].Value } else { "" }
    
    $baseFormeMatch = [regex]::Match($body, 'baseForme:\s*"([^"]+)"')
    $sBaseForme = if ($baseFormeMatch.Success) { $baseFormeMatch.Groups[1].Value } else { "" }
    
    $typesMatch = [regex]::Match($body, 'types:\s*\[(.*?)\]')
    $sTypes = [System.Collections.Generic.List[string]]::new()
    if ($typesMatch.Success) {
        foreach ($tItem in [regex]::Matches($typesMatch.Groups[1].Value, '"([^"]+)"')) {
            $sTypes.Add($tItem.Groups[1].Value)
        }
    }
    
    $statsMatch = [regex]::Match($body, 'baseStats:\s*\{([^}]+)\}')
    $sStats = @{}
    if ($statsMatch.Success) {
        foreach ($sItem in [regex]::Matches($statsMatch.Groups[1].Value, '([a-z]+):\s*(\d+)')) {
            $sStats[$sItem.Groups[1].Value] = $sItem.Groups[2].Value
        }
    }
    
    $abMatch = [regex]::Match($body, 'abilities:\s*\{([^}]+)\}')
    $sAbilities = @{}
    if ($abMatch.Success) {
        foreach ($aItem in [regex]::Matches($abMatch.Groups[1].Value, '([01HS]):\s*"([^"]+)"')) {
            $sAbilities[$aItem.Groups[1].Value] = $aItem.Groups[2].Value
        }
    }
    
    # 1. Determine Japanese base name
    $jpBaseName = if ($speciesJpMap.ContainsKey($sNum)) { $speciesJpMap[$sNum] } else { $sName }
    
    # 2. Determine Japanese Forme and Display name
    $jpForm = $uNormal
    $cleanFormeKey = $sForme.ToLower().Replace(" ", "").Replace("-", "")
    
    $pokeapiLookupKey = ($sName.ToLower() -replace '\s+', '-').Replace("%", "")
    $pokeapiMatch = $null
    if ($pokeapiFormMap.ContainsKey($pokeapiLookupKey)) {
        $pokeapiMatch = $pokeapiFormMap[$pokeapiLookupKey]
    } elseif ($pokeapiFormMap.ContainsKey($sId)) {
        $pokeapiMatch = $pokeapiFormMap[$sId]
    }
    
    if ($idDirectDisplayMap.ContainsKey($sId)) {
        $jpDisplay = $idDirectDisplayMap[$sId]
        if ($jpDisplay -match '\((.+)\)$') {
            $jpForm = $matches[1]
        }
    } elseif ($sForme -eq "Mega") {
        $jpForm = $uMega + $jpBaseName
        $jpDisplay = "$jpBaseName($jpForm)"
    } elseif ($sForme -eq "Mega-X") {
        $jpForm = $uMega + $jpBaseName + [System.Text.RegularExpressions.Regex]::Unescape("\uff38") # 全角Ｘ
        $jpDisplay = "$jpBaseName($jpForm)"
    } elseif ($sForme -eq "Mega-Y") {
        $jpForm = $uMega + $jpBaseName + [System.Text.RegularExpressions.Regex]::Unescape("\uff39") # 全角Ｙ
        $jpDisplay = "$jpBaseName($jpForm)"
    } elseif ($sForme -eq "Mega-Z") {
        $jpForm = $uMega + $jpBaseName + [System.Text.RegularExpressions.Regex]::Unescape("\uff3a") # 全角Ｚ
        $jpDisplay = "$jpBaseName($jpForm)"
    } elseif ($typeMap.ContainsKey($sForme)) {
        $jpForm = $typeMap[$sForme]
        $jpDisplay = "$jpBaseName($jpForm)"
    } elseif ($pokeapiMatch) {
        $jpForm = $pokeapiMatch
        $jpDisplay = "$jpBaseName($jpForm)"
    } elseif ($sForme -and $formJpMap.ContainsKey($cleanFormeKey)) {
        $jpForm = $formJpMap[$cleanFormeKey]
        $jpDisplay = if ($jpForm -eq $uNormal) { $jpBaseName } else { "$jpBaseName($jpForm)" }
    } elseif ($sBaseForme -and $formJpMap.ContainsKey($sBaseForme.ToLower())) {
        $jpForm = $formJpMap[$sBaseForme.ToLower()]
        $jpDisplay = if ($jpForm -eq $uNormal) { $jpBaseName } else { "$jpBaseName($jpForm)" }
    } elseif ($sForme) {
        $jpForm = $sForme
        $jpDisplay = "$jpBaseName($jpForm)"
    } else {
        $jpDisplay = $jpBaseName
    }
    
    # 3. Types
    $t1 = if ($sTypes.Count -gt 0) { Convert-TypeJp $sTypes[0] } else { "" }
    $t2 = if ($sTypes.Count -gt 1) { Convert-TypeJp $sTypes[1] } else { "" }
    
    # 4. Stats
    $hp    = if ($sStats.ContainsKey('hp'))  { [string]$sStats['hp'] }  else { "0" }
    $atk   = if ($sStats.ContainsKey('atk')) { [string]$sStats['atk'] } else { "0" }
    $def   = if ($sStats.ContainsKey('def')) { [string]$sStats['def'] } else { "0" }
    $spatk = if ($sStats.ContainsKey('spa')) { [string]$sStats['spa'] } else { "0" }
    $spdef = if ($sStats.ContainsKey('spd')) { [string]$sStats['spd'] } else { "0" }
    $spd   = if ($sStats.ContainsKey('spe')) { [string]$sStats['spe'] } else { "0" }
    
    # 5. Abilities (0: ability1, 1 or S: ability2, H: ability_hidden)
    $ab1 = if ($sAbilities.ContainsKey('0')) { Convert-AbilityJp $sAbilities['0'] } else { "" }
    $ab2 = ""
    if ($sAbilities.ContainsKey('1')) {
        $ab2 = Convert-AbilityJp $sAbilities['1']
    } elseif ($sAbilities.ContainsKey('S')) {
        $ab2 = Convert-AbilityJp $sAbilities['S']
    }
    $abH = if ($sAbilities.ContainsKey('H')) { Convert-AbilityJp $sAbilities['H'] } else { "" }
    
    # 6. Showdown Regulation-based Confirmed Flag
    $isConfirmed = Is-ConfirmedSpecies $sId $baseSpecKey
    if ($isConfirmed) { $confirmedCount++ }
    
    # 7. Icon Index
    $iconIdx = $sNum
    if ($iconIndexes.ContainsKey($sId)) {
        $iconIdx = $iconIndexes[$sId]
    }
    
    $pObj = [PSCustomObject]@{
        no             = [string]$sNum
        name           = $jpBaseName
        form           = $jpForm
        display        = $jpDisplay
        type1          = $t1
        type2          = $t2
        hp             = $hp
        atk            = $atk
        def            = $def
        spatk          = $spatk
        spdef          = $spdef
        spd            = $spd
        ability1       = $ab1
        ability2       = $ab2
        ability_hidden = $abH
        confirmed      = $isConfirmed
        iconIndex      = $iconIdx
    }
    
    $finalPokemonList.Add($pObj)
    
    # 8. Learnsets mapping
    $movesFound = $null
    if ($rawLearnsets.ContainsKey($sId) -and $rawLearnsets[$sId].Count -gt 0) {
        $movesFound = $rawLearnsets[$sId]
    } elseif ($sBase -and $rawLearnsets.ContainsKey($sBase.ToLower()) -and $rawLearnsets[$sBase.ToLower()].Count -gt 0) {
        $movesFound = $rawLearnsets[$sBase.ToLower()]
    }
    
    if ($movesFound) {
        $finalLearnsets[$jpDisplay] = $movesFound.ToArray()
        if ($jpBaseName -and -not $finalLearnsets.ContainsKey($jpBaseName)) {
            $finalLearnsets[$jpBaseName] = $movesFound.ToArray()
        }
    }
}

# Add english raw keys for learnsets
foreach ($kv in $rawLearnsets) {
    if (-not $finalLearnsets.ContainsKey($kv.Key) -and $kv.Value.Count -gt 0) {
        $finalLearnsets[$kv.Key] = $kv.Value.ToArray()
    }
}

Write-Host "Constructed $($finalPokemonList.Count) Master Pokemon entries. ($confirmedCount confirmed based on Showdown rules)" -ForegroundColor Green

# 11. Build and generate mega_stones.json
Write-Host "Generating data/mega_stones.json mapping..." -ForegroundColor Cyan
$strMega = [System.Text.Encoding]::UTF8.GetString(@(0xE3, 0x83, 0xA1, 0xE3, 0x82, 0xAC))
$strKnight = [System.Text.Encoding]::UTF8.GetString(@(0xE3, 0x83, 0x8A, 0xE3, 0x82, 0xA4, 0xE3, 0x83, 0x88))

$megaMap = [System.Collections.Generic.Dictionary[string, string]]::new()
$megaPokes = [System.Collections.Generic.List[object]]::new()
foreach ($p in $finalPokemonList) {
    $f = [string]$p.form
    $d = [string]$p.display
    if ($f.IndexOf($strMega) -ge 0 -or $d.IndexOf($strMega) -ge 0) {
        $megaPokes.Add($p)
    }
}

$stoneItems = [System.Collections.Generic.List[string]]::new()
foreach ($it in $localItems) {
    $itStr = [string]$it
    if ($itStr.IndexOf($strKnight) -ge 0) {
        $stoneItems.Add($itStr)
    }
}

foreach ($it in $stoneItems) {
    $clean = $it.Substring(0, $it.IndexOf($strKnight))
    $isX = $it.EndsWith("X") -or $it.EndsWith([System.Text.Encoding]::UTF8.GetString(@(0xEF, 0xBC, 0xB8)))
    $isY = $it.EndsWith("Y") -or $it.EndsWith([System.Text.Encoding]::UTF8.GetString(@(0xEF, 0xBC, 0xB9)))
    $isZ = $it.EndsWith("Z") -or $it.EndsWith([System.Text.Encoding]::UTF8.GetString(@(0xEF, 0xBC, 0xBA)))
    
    $bestMatch = $null
    $bestScore = 0
    
    foreach ($mp in $megaPokes) {
        $d = [string]$mp.display
        $n = [string]$mp.name
        
        $hasX = $d.IndexOf("X") -ge 0 -or $d.IndexOf([System.Text.Encoding]::UTF8.GetString(@(0xEF, 0xBC, 0xB8))) -ge 0
        $hasY = $d.IndexOf("Y") -ge 0 -or $d.IndexOf([System.Text.Encoding]::UTF8.GetString(@(0xEF, 0xBC, 0xB9))) -ge 0
        $hasZ = $d.IndexOf("Z") -ge 0 -or $d.IndexOf([System.Text.Encoding]::UTF8.GetString(@(0xEF, 0xBC, 0xBA))) -ge 0
        
        if ($isX -and -not $hasX) { continue }
        if ($isY -and -not $hasY) { continue }
        if ($isZ -and -not $hasZ) { continue }
        if (-not $isX -and -not $isY -and -not $isZ -and ($hasX -or $hasY -or $hasZ)) { continue }
        
        $matchLen = 0
        $minLen = [Math]::Min($clean.Length, $n.Length)
        for ($i = 0; $i -lt $minLen; $i++) {
            if ($clean[$i] -eq $n[$i]) {
                $matchLen++
            } else {
                break
            }
        }
        
        if ($matchLen -ge 2 -and $matchLen -gt $bestScore) {
            $bestScore = $matchLen
            $bestMatch = $d
        }
    }
    
    if ($clean -eq [System.Text.Encoding]::UTF8.GetString(@(0xE3,0x83,0xA1,0xE3,0x82,0xAC,0xE3,0x83,0x8B,0xE3,0x82,0xA6,0xE3,0x83,0xA0))) {
        $mCand = $megaPokes | Where-Object { $_.display.IndexOf([System.Text.Encoding]::UTF8.GetString(@(0xE3,0x83,0xA1,0xE3,0x82,0xAC,0xE3,0x83,0xA1,0xE3,0x82,0xAC,0xE3,0x83,0x8B,0xE3,0x82,0xA6,0xE3,0x83,0xA0))) -ge 0 } | Select-Object -First 1
        if ($mCand) { $bestMatch = $mCand.display }
    }
    
    if ($bestMatch) {
        $megaMap[$it] = $bestMatch
    }
}

# 12. Save version.json (Unique timestamp for auto-reset in frontend)
$currentTimestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$versionObj = [PSCustomObject]@{
    version      = $currentTimestamp
    updatedAt    = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
    regulation   = "Champions (Reg M-B)"
    totalPokemon = $finalPokemonList.Count
    confirmed    = $confirmedCount
}
[System.IO.File]::WriteAllText($versionPath, ($versionObj | ConvertTo-Json -Depth 5), [System.Text.Encoding]::UTF8)
Write-Host "Saved data/version.json (Version: $currentTimestamp)" -ForegroundColor Green

# 13. Save all data files with strict UTF-8
[System.IO.File]::WriteAllText($localPokePath, ($finalPokemonList | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)
Write-Host "Saved data/pokemon.json ($($finalPokemonList.Count) total entries)" -ForegroundColor Green

[System.IO.File]::WriteAllText((Join-Path $dataDir "learnsets.json"), ($finalLearnsets | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)
Write-Host "Saved data/learnsets.json" -ForegroundColor Green

# 13. Generate Comprehensive Pokepaste Translation Map
$transScript = Join-Path $scriptsDir "generate_translation_map.ps1"
if (Test-Path $transScript) {
    & $transScript
} else {
    $transObj = [System.Collections.Generic.Dictionary[string, object]]::new()
    $transObj["moves"] = $moveNameToId
    [System.IO.File]::WriteAllText((Join-Path $dataDir "translation_map.json"), ($transObj | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)
    Write-Host "Saved fallback data/translation_map.json" -ForegroundColor Yellow
}

[System.IO.File]::WriteAllText((Join-Path $dataDir "mega_stones.json"), ($megaMap | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)
Write-Host "Saved data/mega_stones.json ($($megaMap.Count) mapped)" -ForegroundColor Green

# 14. Automatic Clean Roster & Image Recognition Feature Dictionaries Update
Write-Host "`n--- Updating Image Recognition Feature Dictionaries ---" -ForegroundColor Cyan
try {
    $rosterScript = Join-Path $scriptsDir "build_clean_roster.ps1"
    if (Test-Path $rosterScript) {
        & $rosterScript
    }
    $phogScript = Join-Path $scriptsDir "gen_geo_phog_features.ps1"
    if (Test-Path $phogScript) {
        & $phogScript
    }
} catch {
    Write-Warning "Could not update recognition features: $($_.Exception.Message)"
}

Write-Host "`n=== Comprehensive Master Sync & AI Recognition Engine Ready! ===" -ForegroundColor Cyan