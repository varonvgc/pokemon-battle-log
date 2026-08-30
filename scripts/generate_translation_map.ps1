# Pure ASCII Safe Robust Pokepaste Translation Map Generator
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$rootDir = Split-Path $PSScriptRoot -Parent
$dataDir = Join-Path $rootDir "data"
$scriptsDir = Join-Path $rootDir "scripts"

Write-Host "=== Generating Comprehensive Pokepaste Translation Map ===" -ForegroundColor Cyan

function toId([string]$s) {
    if (-not $s) { return "" }
    return ($s.ToLower() -replace '[^a-z0-9]', '')
}

function normalizeFullWidth([string]$s) {
    if (-not $s) { return "" }
    $fwX = [System.Text.Encoding]::UTF8.GetString(@(0xEF, 0xBC, 0xB8)) # Ｘ
    $s = $s.Replace($fwX, "X")
    $fwY = [System.Text.Encoding]::UTF8.GetString(@(0xEF, 0xBC, 0xB9)) # Ｙ
    $s = $s.Replace($fwY, "Y")
    $fwZ = [System.Text.Encoding]::UTF8.GetString(@(0xEF, 0xBC, 0xBA)) # Ｚ
    $s = $s.Replace($fwZ, "Z")
    return $s
}

$fwX = [System.Text.Encoding]::UTF8.GetString(@(0xEF, 0xBC, 0xB8))
$fwY = [System.Text.Encoding]::UTF8.GetString(@(0xEF, 0xBC, 0xB9))
$fwZ = [System.Text.Encoding]::UTF8.GetString(@(0xEF, 0xBC, 0xBA))

# 1. Natures Map
$natures = @{
    "Adamant" = [System.Text.RegularExpressions.Regex]::Unescape("\u3044\u3058\u3063\u3071\u308a")
    "Bashful" = [System.Text.RegularExpressions.Regex]::Unescape("\u3066\u308c\u3084")
    "Bold" = [System.Text.RegularExpressions.Regex]::Unescape("\u305a\u3076\u3068\u3044")
    "Brave" = [System.Text.RegularExpressions.Regex]::Unescape("\u3086\u3046\u304b\u3093")
    "Calm" = [System.Text.RegularExpressions.Regex]::Unescape("\u304a\u3060\u3084\u304b")
    "Careful" = [System.Text.RegularExpressions.Regex]::Unescape("\u3057\u3093\u3061\u3087\u3046")
    "Docile" = [System.Text.RegularExpressions.Regex]::Unescape("\u3059\u306a\u304a")
    "Gentle" = [System.Text.RegularExpressions.Regex]::Unescape("\u304a\u3068\u306a\u3057\u3044")
    "Hardy" = [System.Text.RegularExpressions.Regex]::Unescape("\u304c\u3093\u3070\u308a\u3084")
    "Hasty" = [System.Text.RegularExpressions.Regex]::Unescape("\u305b\u3063\u304b\u3061")
    "Impish" = [System.Text.RegularExpressions.Regex]::Unescape("\u308f\u3093\u3071\u304f")
    "Jolly" = [System.Text.RegularExpressions.Regex]::Unescape("\u3088\u3046\u304d")
    "Lax" = [System.Text.RegularExpressions.Regex]::Unescape("\u306e\u3046\u3066\u3093\u304d")
    "Lonely" = [System.Text.RegularExpressions.Regex]::Unescape("\u3055\u307f\u3057\u304c\u308a")
    "Mild" = [System.Text.RegularExpressions.Regex]::Unescape("\u304a\u3063\u3068\u308a")
    "Modest" = [System.Text.RegularExpressions.Regex]::Unescape("\u3072\u304b\u3048\u3081")
    "Naive" = [System.Text.RegularExpressions.Regex]::Unescape("\u3080\u3058\u3083\u304d")
    "Naughty" = [System.Text.RegularExpressions.Regex]::Unescape("\u3084\u3093\u3061\u3083")
    "Quiet" = [System.Text.RegularExpressions.Regex]::Unescape("\u308c\u3044\u305b\u3044")
    "Quirky" = [System.Text.RegularExpressions.Regex]::Unescape("\u304d\u307e\u304f\u308c")
    "Rash" = [System.Text.RegularExpressions.Regex]::Unescape("\u3046\u3063\u304b\u308a\u3084")
    "Relaxed" = [System.Text.RegularExpressions.Regex]::Unescape("\u306e\u3093\u304d")
    "Sassy" = [System.Text.RegularExpressions.Regex]::Unescape("\u306a\u307e\u3044\u304d")
    "Serious" = [System.Text.RegularExpressions.Regex]::Unescape("\u307e\u3058\u3081")
    "Timid" = [System.Text.RegularExpressions.Regex]::Unescape("\u304a\u304f\u3073\u3087\u3046")
}

# 2. Abilities Map
Write-Host "Fetching Abilities..." -ForegroundColor Cyan
$abilitiesEnToJa = @{}
$existingTranslationsPath = Join-Path $scriptsDir "translations.json"
if (Test-Path $existingTranslationsPath) {
    $trJson = Get-Content $existingTranslationsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($trJson.abilities) {
        foreach ($prop in $trJson.abilities.PSObject.Properties) {
            $abilitiesEnToJa[$prop.Name] = [string]$prop.Value
        }
    }
}
try {
    $abCsvUrl = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/ability_names.csv"
    $abCsv = (Invoke-WebRequest -Uri $abCsvUrl -UseBasicParsing).Content | ConvertFrom-Csv
    $abEn = @{}
    foreach ($r in $abCsv) { if ($r.local_language_id -eq "9") { $abEn[$r.ability_id] = $r.name } }
    foreach ($r in $abCsv) {
        if ($r.local_language_id -in @("1", "11") -and $r.name) {
            $id = $r.ability_id
            if ($abEn.ContainsKey($id)) { $abilitiesEnToJa[$abEn[$id]] = $r.name }
        }
    }
} catch {
    Write-Warning "PokeAPI Ability fetch failed: $($_.Exception.Message)"
}

# 3. Moves Map
Write-Host "Fetching Moves..." -ForegroundColor Cyan
$movesEnToJa = @{}
try {
    $mvCsvUrl = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/move_names.csv"
    $mvCsv = (Invoke-WebRequest -Uri $mvCsvUrl -UseBasicParsing).Content | ConvertFrom-Csv
    $mvEn = @{}
    foreach ($r in $mvCsv) { if ($r.local_language_id -eq "9") { $mvEn[$r.move_id] = $r.name } }
    foreach ($r in $mvCsv) {
        if ($r.local_language_id -in @("1", "11") -and $r.name) {
            $id = $r.move_id
            if ($mvEn.ContainsKey($id)) { $movesEnToJa[$mvEn[$id]] = $r.name }
        }
    }
} catch {
    Write-Warning "PokeAPI Move fetch failed: $($_.Exception.Message)"
}

# Custom special moves
$movesEnToJa["Matcha Gotcha"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30b7\u30e3\u30ab\u30b7\u30e3\u30ab\u307b\u3046")
$movesEnToJa["Syrup Bomb"] = [System.Text.RegularExpressions.Regex]::Unescape("\u307f\u3064\u3081\u304c\u307d\u3093")
$movesEnToJa["Ivy Cudgel"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30c4\u30bf\u3053\u3093\u307c\u3046")
$movesEnToJa["Blood Moon"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30d6\u30e9\u30c3\u30c9\u30e0\u30fc\u30f3")
$movesEnToJa["Thunderclap"] = [System.Text.RegularExpressions.Regex]::Unescape("\u3058\u3093\u3089\u3044")
$movesEnToJa["Tachyon Cutter"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30bf\u30ad\u30aa\u30f3\u30ab\u30c3\u30bf\u30fc")
$movesEnToJa["Electro Shot"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30a8\u30ec\u30af\u30c8\u30ed\u30d3\u30fc\u30e0")

# 4. Download Showdown Data (Pokedex & Items)
Write-Host "Downloading Showdown Master Data..." -ForegroundColor Cyan
$pokedexUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/pokedex.ts"
$pokedexRaw = (Invoke-WebRequest -Uri $pokedexUrl -UseBasicParsing).Content

$itemsTsUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/items.ts"
$champItemsUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions/items.ts"
$itemsTsRaw = (Invoke-WebRequest -Uri $itemsTsUrl -UseBasicParsing).Content
$champItemsRaw = ""
try { $champItemsRaw = (Invoke-WebRequest -Uri $champItemsUrl -UseBasicParsing).Content } catch {}
$allShowdownItemsRaw = $itemsTsRaw + "`n" + $champItemsRaw

# Parse Showdown items (e.g. name: "Charizardite Y", megaStone: "Charizard-Mega-Y", megaEvolves: "Charizard")
$sdMegaItems = [System.Collections.Generic.Dictionary[string, string]]::new() # MegaPokemonName -> ItemName
$sdItemNameToClean = [System.Collections.Generic.Dictionary[string, string]]::new() # id -> proper ItemName

$itemMatches = [regex]::Matches($allShowdownItemsRaw, '(?m)^\s*([a-z0-9]+):\s*\{([^}]+)\}')
foreach ($im in $itemMatches) {
    $iKey = $im.Groups[1].Value
    $body = $im.Groups[2].Value
    $nmMatch = [regex]::Match($body, 'name:\s*"([^"]+)"')
    if ($nmMatch.Success) {
        $iName = $nmMatch.Groups[1].Value
        $sdItemNameToClean[$iKey] = $iName
        
        $msMatch = [regex]::Match($body, 'megaStone:\s*"([^"]+)"')
        if ($msMatch.Success) {
            $msName = $msMatch.Groups[1].Value
            $sdMegaItems[$msName] = $iName
            $sdMegaItems[(toId $msName)] = $iName
        }
    }
}

# 5. Build Pokemon Map
Write-Host "Building Pokemon Map..." -ForegroundColor Cyan
$pokemonEnToJa = @{}
$pokemonJaToEn = [System.Collections.Generic.Dictionary[string, string]]::new()

$pokemonJsonPath = Join-Path $dataDir "pokemon.json"
$pokemonList = Get-Content $pokemonJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json

# Showdown pokedex map (num -> entries, id -> proper name)
$sdPokes = @{}
$pMatches = [regex]::Matches($pokedexRaw, '(?m)^\s*([a-z0-9]+):\s*\{\s*num:\s*(-?\d+),\s*name:\s*"([^"]+)"')
foreach ($m in $pMatches) {
    $sdId = $m.Groups[1].Value
    $sdNum = [int]$m.Groups[2].Value
    $sdName = $m.Groups[3].Value
    $sdPokes[$sdId] = @{ num = $sdNum; name = $sdName }
}

# PokeAPI Japanese species names
$speciesCsvUrl = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv"
$speciesCsvRaw = (Invoke-WebRequest -Uri $speciesCsvUrl -UseBasicParsing).Content | ConvertFrom-Csv
$specJpMap = @{}
$specEnMap = @{}
foreach ($r in $speciesCsvRaw) {
    $sId = [int]$r.pokemon_species_id
    if ($r.local_language_id -eq "9") { $specEnMap[$sId] = $r.name }
    if ($r.local_language_id -in @("1", "11") -and $r.name) {
        if (-not $specJpMap.ContainsKey($sId) -or $r.local_language_id -eq "11") {
            $specJpMap[$sId] = $r.name
        }
    }
}

# Base species 1:1 mapping (Pelipper <-> ペリッパー, Grimmsnarl <-> オーロンゲ, etc.)
foreach ($sId in $specEnMap.Keys) {
    if ($specJpMap.ContainsKey($sId)) {
        $en = $specEnMap[$sId]
        $ja = $specJpMap[$sId]
        $pokemonEnToJa[$en] = $ja
        $pokemonEnToJa[(toId $en)] = $ja
        $pokemonJaToEn[$ja] = $en
    }
}

# Process each Pokemon in pokemon.json (Formes, Megas, etc.)
$uNormal = [System.Text.RegularExpressions.Regex]::Unescape("\u901a\u5e38")
$uMega = [System.Text.RegularExpressions.Regex]::Unescape("\u30e1\u30ac")
$uAlola = [System.Text.RegularExpressions.Regex]::Unescape("\u30a2\u30ed\u30fc\u30e9")
$uGalar = [System.Text.RegularExpressions.Regex]::Unescape("\u30ac\u30e9\u30eb")
$uHisui = [System.Text.RegularExpressions.Regex]::Unescape("\u30d2\u30b9\u30a4")
$uPaldea = [System.Text.RegularExpressions.Regex]::Unescape("\u30d1\u30eb\u30c7\u30a2")
$uMale = [System.Text.RegularExpressions.Regex]::Unescape("\u30aa\u30b9\u306e\u3059\u304c\u305f")
$uFemale = [System.Text.RegularExpressions.Regex]::Unescape("\u30e1\u30b9\u306e\u3059\u304c\u305f")
$uGmax = [System.Text.RegularExpressions.Regex]::Unescape("\u30ad\u30e7\u30c0\u30a4\u30de\u30c3\u30af\u30b9")

foreach ($p in $pokemonList) {
    $disp = [string]$p.display
    $baseName = [string]$p.name
    $form = [string]$p.form
    $no = [int]$p.no

    foreach ($kv in $sdPokes.GetEnumerator()) {
        $sdId = $kv.Key
        $sdName = $kv.Value.name
        $sdNum = $kv.Value.num

        if ($sdNum -eq $no) {
            $isMatch = $false
            if ($form -eq $uNormal -or -not $form) {
                if ($sdName -notmatch "-") { $isMatch = $true }
            } elseif ($form.IndexOf($uMega) -ge 0) {
                if ($sdName -match "-Mega") {
                    $hasX = $form.IndexOf("X") -ge 0 -or $form.IndexOf($fwX) -ge 0
                    $hasY = $form.IndexOf("Y") -ge 0 -or $form.IndexOf($fwY) -ge 0
                    $hasZ = $form.IndexOf("Z") -ge 0 -or $form.IndexOf($fwZ) -ge 0

                    if ($hasX -and $sdName -match "-Mega-X") { $isMatch = $true }
                    elseif ($hasY -and $sdName -match "-Mega-Y") { $isMatch = $true }
                    elseif ($hasZ -and $sdName -match "-Mega-Z") { $isMatch = $true }
                    elseif (-not $hasX -and -not $hasY -and -not $hasZ -and $sdName -notmatch "-Mega-[XYZ]") { $isMatch = $true }
                }
            } elseif ($form.IndexOf($uAlola) -ge 0 -and $sdName -match "-Alola") { $isMatch = $true }
            elseif ($form.IndexOf($uGalar) -ge 0 -and $sdName -match "-Galar") { $isMatch = $true }
            elseif ($form.IndexOf($uHisui) -ge 0 -and $sdName -match "-Hisui") { $isMatch = $true }
            elseif ($form.IndexOf($uPaldea) -ge 0 -and $sdName -match "-Paldea") { $isMatch = $true }
            elseif ($form.IndexOf($uMale) -ge 0 -and ($sdName -notmatch "-F$" -or $sdName -match "-M$")) { $isMatch = $true }
            elseif ($form.IndexOf($uFemale) -ge 0 -and $sdName -match "-F$") { $isMatch = $true }
            elseif ($form.IndexOf($uGmax) -ge 0 -and $sdName -match "-Gmax") { $isMatch = $true }

            if ($isMatch) {
                $pokemonEnToJa[$sdName] = $disp
                $pokemonEnToJa[$sdId] = $disp
                $pokemonJaToEn[$disp] = $sdName

                $normDisp = normalizeFullWidth $disp
                if ($normDisp -ne $disp) {
                    $pokemonJaToEn[$normDisp] = $sdName
                }
            }
        }
    }
}

# Explicit form aliases
$aliasMap = @{
    "Floette-Mega" = [System.Text.RegularExpressions.Regex]::Unescape("\u30d5\u30e9\u30a8\u30c3\u30c6(\u30e1\u30ac\u30d5\u30e9\u30a8\u30c3\u30c6)")
    "Delphox-Mega" = [System.Text.RegularExpressions.Regex]::Unescape("\u30de\u30d5\u30a9\u30af\u30b7\u30fc(\u30e1\u30ac\u30de\u30d5\u30a9\u30af\u30b7\u30fc)")
    "Chesnaught-Mega" = [System.Text.RegularExpressions.Regex]::Unescape("\u30d6\u30ea\u30ac\u30ed\u30f3(\u30e1\u30ac\u30d6\u30ea\u30ac\u30ed\u30f3)")
    "Greninja-Mega" = [System.Text.RegularExpressions.Regex]::Unescape("\u30b2\u30c3\u30b3\u30a6\u30ac(\u30e1\u30ac\u30b2\u30c3\u30b3\u30a6\u30ac)")
    "Charizard-Mega-X" = [System.Text.RegularExpressions.Regex]::Unescape("\u30ea\u30b6\u30fc\u30c9\u30f3(\u30e1\u30ac\u30ea\u30b6\u30fc\u30c9\u30f3X)")
    "Charizard-Mega-Y" = [System.Text.RegularExpressions.Regex]::Unescape("\u30ea\u30b6\u30fc\u30c9\u30f3(\u30e1\u30ac\u30ea\u30b6\u30fc\u30c9\u30f3Y)")
    "Basculegion" = [System.Text.RegularExpressions.Regex]::Unescape("\u30a4\u30c0\u30a4\u30c8\u30a6(\u30aa\u30b9\u306e\u3059\u304c\u305f)")
    "Basculegion-M" = [System.Text.RegularExpressions.Regex]::Unescape("\u30a4\u30c0\u30a4\u30c8\u30a6(\u30aa\u30b9\u306e\u3059\u304c\u305f)")
    "Basculegion-F" = [System.Text.RegularExpressions.Regex]::Unescape("\u30a4\u30c0\u30a4\u30c8\u30a6(\u30e1\u30b9\u306e\u3059\u304c\u305f)")
    "Urshifu-Single-Strike" = [System.Text.RegularExpressions.Regex]::Unescape("\u30a6\u30fc\u30e9\u30aa\u30b9(\u3044\u3061\u3052\u304d\u306e\u304b\u305f)")
    "Urshifu-Rapid-Strike" = [System.Text.RegularExpressions.Regex]::Unescape("\u30a6\u30fc\u30e9\u30aa\u30b9(\u308c\u3093\u3052\u304d\u306e\u304b\u305f)")
    "Ogerpon" = [System.Text.RegularExpressions.Regex]::Unescape("\u30aa\u30fc\u30ac\u307d\u30f3")
}
foreach ($k in $aliasMap.Keys) {
    $v = $aliasMap[$k]
    $pokemonEnToJa[$k] = $v
    $pokemonEnToJa[(toId $k)] = $v
    $pokemonJaToEn[$v] = $k
    $fwV = $v.Replace("X", $fwX).Replace("Y", $fwY).Replace("Z", $fwZ)
    if ($fwV -ne $v) { $pokemonJaToEn[$fwV] = $k }
}

# 6. Build Robust Items Map
Write-Host "Building Robust Items Map..." -ForegroundColor Cyan
$itemsEnToJa = @{}
$itemsJaToEn = [System.Collections.Generic.Dictionary[string, string]]::new()

# Load PokeAPI Item names
try {
    $itCsvUrl = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/item_names.csv"
    $itCsv = (Invoke-WebRequest -Uri $itCsvUrl -UseBasicParsing).Content | ConvertFrom-Csv
    $itEn = @{}
    foreach ($r in $itCsv) { if ($r.local_language_id -eq "9") { $itEn[$r.item_id] = $r.name } }
    foreach ($r in $itCsv) {
        if ($r.local_language_id -in @("1", "11") -and $r.name) {
            $id = $r.item_id
            if ($itEn.ContainsKey($id)) {
                $enName = $itEn[$id]
                $jaName = $r.name
                $itemsEnToJa[$enName] = $jaName
                $itemsEnToJa[(toId $enName)] = $jaName
                $itemsJaToEn[$jaName] = $enName
            }
        }
    }
} catch {
    Write-Warning "PokeAPI Item fetch failed: $($_.Exception.Message)"
}

# Load mega_stones.json to map all Mega stones accurately
$megaStonesPath = Join-Path $dataDir "mega_stones.json"
if (Test-Path $megaStonesPath) {
    $msJson = Get-Content $megaStonesPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($prop in $msJson.PSObject.Properties) {
        $jaStone = $prop.Name
        $jaMegaPoke = [string]$prop.Value

        # Find English Mega Pokemon Name
        $enMegaPoke = if ($pokemonJaToEn.ContainsKey($jaMegaPoke)) { $pokemonJaToEn[$jaMegaPoke] } else { $null }
        if (-not $enMegaPoke) {
            $hwPoke = normalizeFullWidth $jaMegaPoke
            if ($pokemonJaToEn.ContainsKey($hwPoke)) { $enMegaPoke = $pokemonJaToEn[$hwPoke] }
        }

        # Match with Showdown Mega Item
        $enItem = $null
        if ($enMegaPoke -and $sdMegaItems.ContainsKey($enMegaPoke)) {
            $enItem = $sdMegaItems[$enMegaPoke]
        } elseif ($enMegaPoke -and $sdMegaItems.ContainsKey((toId $enMegaPoke))) {
            $enItem = $sdMegaItems[(toId $enMegaPoke)]
        }

        # If not found by megaStone, match by item name heuristics in Showdown
        if (-not $enItem) {
            $cleanStone = normalizeFullWidth $jaStone
            $uCharX = [System.Text.RegularExpressions.Regex]::Unescape("\u30ea\u30b6\u30fc\u30c9\u30ca\u30a4\u30c8X")
            $uCharY = [System.Text.RegularExpressions.Regex]::Unescape("\u30ea\u30b6\u30fc\u30c9\u30ca\u30a4\u30c8Y")
            $uMewX = [System.Text.RegularExpressions.Regex]::Unescape("\u30df\u30e5\u30a6\u30c4\u30ca\u30a4\u30c8X")
            $uMewY = [System.Text.RegularExpressions.Regex]::Unescape("\u30df\u30e5\u30a6\u30c4\u30ca\u30a4\u30c8Y")
            $uAbsolZ = [System.Text.RegularExpressions.Regex]::Unescape("\u30a2\u30d6\u30bd\u30eb\u30ca\u30a4\u30c8Z")
            $uGarchompZ = [System.Text.RegularExpressions.Regex]::Unescape("\u30ac\u30d6\u30ea\u30a2\u30b9\u30ca\u30a4\u30c8Z")
            $uDelphox1 = [System.Text.RegularExpressions.Regex]::Unescape("\u30de\u30d5\u30a9\u30af\u30b7\u30ca\u30a4\u30c8")
            $uDelphox2 = [System.Text.RegularExpressions.Regex]::Unescape("\u30de\u30d5\u30a9\u30af\u30b7\u30fc\u30ca\u30a4\u30c8")
            $uStaraptor = [System.Text.RegularExpressions.Regex]::Unescape("\u30e0\u30af\u30db\u30fc\u30af\u30ca\u30a4\u30c8")
            $uFloette = [System.Text.RegularExpressions.Regex]::Unescape("\u30d5\u30e9\u30a8\u30c3\u30c6\u30ca\u30a4\u30c8")
            $uChesnaught = [System.Text.RegularExpressions.Regex]::Unescape("\u30d6\u30ea\u30ac\u30ed\u30f3\u30ca\u30a4\u30c8")
            $uGreninja = [System.Text.RegularExpressions.Regex]::Unescape("\u30b2\u30c3\u30b3\u30a6\u30ac\u30ca\u30a4\u30c8")

            if ($cleanStone -eq $uCharX) { $enItem = "Charizardite X" }
            elseif ($cleanStone -eq $uCharY) { $enItem = "Charizardite Y" }
            elseif ($cleanStone -eq $uMewX) { $enItem = "Mewtwonite X" }
            elseif ($cleanStone -eq $uMewY) { $enItem = "Mewtwonite Y" }
            elseif ($cleanStone -eq $uAbsolZ) { $enItem = "Absolite Z" }
            elseif ($cleanStone -eq $uGarchompZ) { $enItem = "Garchompite Z" }
            elseif ($cleanStone -eq $uDelphox1 -or $cleanStone -eq $uDelphox2) { $enItem = "Delphoxite" }
            elseif ($cleanStone -eq $uStaraptor) { $enItem = "Staraptorite" }
            elseif ($cleanStone -eq $uFloette) { $enItem = "Floettite" }
            elseif ($cleanStone -eq $uChesnaught) { $enItem = "Chesnaughtite" }
            elseif ($cleanStone -eq $uGreninja) { $enItem = "Greninjite" }
        }

        if ($enItem) {
            $itemsJaToEn[$jaStone] = $enItem
            $itemsEnToJa[$enItem] = $jaStone
            $itemsEnToJa[(toId $enItem)] = $jaStone

            $hwStone = normalizeFullWidth $jaStone
            if ($hwStone -ne $jaStone) {
                $itemsJaToEn[$hwStone] = $enItem
            }
            $fwStone = $jaStone.Replace("X", $fwX).Replace("Y", $fwY).Replace("Z", $fwZ)
            if ($fwStone -ne $jaStone) {
                $itemsJaToEn[$fwStone] = $enItem
            }
        }
    }
}

# Common item aliases
$uDelphox1 = [System.Text.RegularExpressions.Regex]::Unescape("\u30de\u30d5\u30a9\u30af\u30b7\u30ca\u30a4\u30c8")
$uDelphox2 = [System.Text.RegularExpressions.Regex]::Unescape("\u30de\u30d5\u30a9\u30af\u30b7\u30fc\u30ca\u30a4\u30c8")
$uStaraptor = [System.Text.RegularExpressions.Regex]::Unescape("\u30e0\u30af\u30db\u30fc\u30af\u30ca\u30a4\u30c8")

$itemsJaToEn[$uDelphox1] = "Delphoxite"
$itemsJaToEn[$uDelphox2] = "Delphoxite"
$itemsEnToJa["delphoxite"] = $uDelphox1
$itemsJaToEn[$uStaraptor] = "Staraptorite"
$itemsEnToJa["staraptorite"] = $uStaraptor
$itemsEnToJa["staraptite"] = $uStaraptor

# 7. Final Master Assembly
$normMap = [System.Collections.Generic.Dictionary[string, object]]::new()

$pEnToJa = [System.Collections.Generic.Dictionary[string, string]]::new()
$pJaToEn = [System.Collections.Generic.Dictionary[string, string]]::new()
foreach ($kv in $pokemonEnToJa.GetEnumerator()) {
    $id = toId $kv.Key
    if (-not $pEnToJa.ContainsKey($id)) { $pEnToJa[$id] = [string]$kv.Value }
}
foreach ($kv in $pokemonJaToEn.GetEnumerator()) {
    $k = [string]$kv.Key
    $v = [string]$kv.Value
    $pJaToEn[$k] = $v
}

$iEnToJa = [System.Collections.Generic.Dictionary[string, string]]::new()
$iJaToEn = [System.Collections.Generic.Dictionary[string, string]]::new()
foreach ($kv in $itemsEnToJa.GetEnumerator()) {
    $id = toId $kv.Key
    if (-not $iEnToJa.ContainsKey($id)) { $iEnToJa[$id] = [string]$kv.Value }
}
foreach ($kv in $itemsJaToEn.GetEnumerator()) {
    $k = [string]$kv.Key
    $v = [string]$kv.Value
    $iJaToEn[$k] = $v
}

$mEnToJa = [System.Collections.Generic.Dictionary[string, string]]::new()
$mJaToEn = [System.Collections.Generic.Dictionary[string, string]]::new()
foreach ($kv in $movesEnToJa.GetEnumerator()) {
    $k = [string]$kv.Key
    $v = [string]$kv.Value
    $id = toId $k
    if (-not $mEnToJa.ContainsKey($id)) { $mEnToJa[$id] = $v }
    if (-not $mJaToEn.ContainsKey($v)) { $mJaToEn[$v] = $k }
}

$aEnToJa = [System.Collections.Generic.Dictionary[string, string]]::new()
$aJaToEn = [System.Collections.Generic.Dictionary[string, string]]::new()
foreach ($kv in $abilitiesEnToJa.GetEnumerator()) {
    $k = [string]$kv.Key
    $v = [string]$kv.Value
    $id = toId $k
    if (-not $aEnToJa.ContainsKey($id)) { $aEnToJa[$id] = $v }
    if (-not $aJaToEn.ContainsKey($v)) { $aJaToEn[$v] = $k }
}

$nEnToJa = [System.Collections.Generic.Dictionary[string, string]]::new()
$nJaToEn = [System.Collections.Generic.Dictionary[string, string]]::new()
foreach ($kv in $natures.GetEnumerator()) {
    $k = [string]$kv.Key
    $v = [string]$kv.Value
    $id = toId $k
    $nEnToJa[$id] = $v
    $nJaToEn[$v] = $k
}

$normMap["pokemon_en_to_ja"] = $pEnToJa
$normMap["pokemon_ja_to_en"] = $pJaToEn
$normMap["items_en_to_ja"] = $iEnToJa
$normMap["items_ja_to_en"] = $iJaToEn
$normMap["moves_en_to_ja"] = $mEnToJa
$normMap["moves_ja_to_en"] = $mJaToEn
$normMap["abilities_en_to_ja"] = $aEnToJa
$normMap["abilities_ja_to_en"] = $aJaToEn
$normMap["natures_en_to_ja"] = $nEnToJa
$normMap["natures_ja_to_en"] = $nJaToEn

$outJson = $normMap | ConvertTo-Json -Depth 5
$outPath = Join-Path $dataDir "translation_map.json"
[System.IO.File]::WriteAllText($outPath, $outJson, [System.Text.Encoding]::UTF8)

Write-Host "Successfully generated robust translation_map.json" -ForegroundColor Green
Write-Host "Pokemon Ja->En: $($pJaToEn.Count) / En->Ja: $($pEnToJa.Count)"
Write-Host "Items Ja->En: $($iJaToEn.Count) / En->Ja: $($iEnToJa.Count)"
Write-Host "Moves Ja->En: $($mJaToEn.Count) / En->Ja: $($mEnToJa.Count)"
Write-Host "Abilities Ja->En: $($aJaToEn.Count) / En->Ja: $($aEnToJa.Count)"
Write-Host "Natures Ja->En: $($nJaToEn.Count) / En->Ja: $($nEnToJa.Count)"
