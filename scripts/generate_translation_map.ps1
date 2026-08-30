# Pure ASCII Safe Pokepaste Translation Map Generator
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$rootDir = Split-Path $PSScriptRoot -Parent
$dataDir = Join-Path $rootDir "data"
$scriptsDir = Join-Path $rootDir "scripts"

Write-Host "=== Generating Comprehensive Pokepaste Translation Map ===" -ForegroundColor Cyan

function toId([string]$s) {
    if (-not $s) { return "" }
    return ($s.ToLower() -replace '[^a-z0-9]', '')
}

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
    "Naive" = [System.Text.RegularExpressions.Regex]::Unescape("\u3080\u3058\u3043\u304d")
    "Naughty" = [System.Text.RegularExpressions.Regex]::Unescape("\u3084\u3093\u3061\u3083")
    "Quiet" = [System.Text.RegularExpressions.Regex]::Unescape("\u308c\u3044\u305b\u3044")
    "Quirky" = [System.Text.RegularExpressions.Regex]::Unescape("\u304d\u307e\u304dump") # will fix
    "Rash" = [System.Text.RegularExpressions.Regex]::Unescape("\u3046\u3063\u304b\u308a\u3084")
    "Relaxed" = [System.Text.RegularExpressions.Regex]::Unescape("\u306e\u3093\u304d")
    "Sassy" = [System.Text.RegularExpressions.Regex]::Unescape("\u306a\u307e\u3044\u304d")
    "Serious" = [System.Text.RegularExpressions.Regex]::Unescape("\u307e\u3058\u3081")
    "Timid" = [System.Text.RegularExpressions.Regex]::Unescape("\u304a\u304f\u3073\u3087\u3046")
}
$natures["Quirky"] = [System.Text.RegularExpressions.Regex]::Unescape("\u304d\u307e\u304f\u308c")
$natures["Naive"] = [System.Text.RegularExpressions.Regex]::Unescape("\u3080\u3058\u3083\u304d")

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
    foreach ($r in $abCsv) {
        if ($r.local_language_id -eq "9") { $abEn[$r.ability_id] = $r.name }
    }
    foreach ($r in $abCsv) {
        if ($r.local_language_id -in @("1", "11") -and $r.name) {
            $id = $r.ability_id
            if ($abEn.ContainsKey($id)) {
                $abilitiesEnToJa[$abEn[$id]] = $r.name
            }
        }
    }
} catch {
    Write-Warning "PokeAPI Ability fetch failed: $($_.Exception.Message)"
}

# 3. Items Map
Write-Host "Fetching Items..." -ForegroundColor Cyan
$itemsEnToJa = @{}
try {
    $itCsvUrl = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/item_names.csv"
    $itCsv = (Invoke-WebRequest -Uri $itCsvUrl -UseBasicParsing).Content | ConvertFrom-Csv
    $itEn = @{}
    foreach ($r in $itCsv) {
        if ($r.local_language_id -eq "9") { $itEn[$r.item_id] = $r.name }
    }
    foreach ($r in $itCsv) {
        if ($r.local_language_id -in @("1", "11") -and $r.name) {
            $id = $r.item_id
            if ($itEn.ContainsKey($id)) {
                $itemsEnToJa[$itEn[$id]] = $r.name
            }
        }
    }
} catch {
    Write-Warning "PokeAPI Item fetch failed: $($_.Exception.Message)"
}

# Custom Mega stones and items
$itemsEnToJa["Floettite"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30d5\u30e9\u30a8\u30c3\u30c6\u30ca\u30a4\u30c8")
$itemsEnToJa["Delphoxite"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30de\u30d5\u30a9\u30af\u30b7\u30fc\u30ca\u30a4\u30c8")
$itemsEnToJa["Chesnaughtite"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30d6\u30ea\u30ac\u30ed\u30f3\u30ca\u30a4\u30c8")
$itemsEnToJa["Greninjite"] = [System.Text.RegularExpressions.Regex]::Unescape("\u3094\u30c3\u30b3\u30a6\u30ac\u30ca\u30a4\u30c8") # ゲッコウガナイト
$itemsEnToJa["Greninjite"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30b2\u30c3\u30b3\u30a6\u30ac\u30ca\u30a4\u30c8")

# 4. Moves Map
Write-Host "Fetching Moves..." -ForegroundColor Cyan
$movesEnToJa = @{}
try {
    $mvCsvUrl = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/move_names.csv"
    $mvCsv = (Invoke-WebRequest -Uri $mvCsvUrl -UseBasicParsing).Content | ConvertFrom-Csv
    $mvEn = @{}
    foreach ($r in $mvCsv) {
        if ($r.local_language_id -eq "9") { $mvEn[$r.move_id] = $r.name }
    }
    foreach ($r in $mvCsv) {
        if ($r.local_language_id -in @("1", "11") -and $r.name) {
            $id = $r.move_id
            if ($mvEn.ContainsKey($id)) {
                $movesEnToJa[$mvEn[$id]] = $r.name
            }
        }
    }
} catch {
    Write-Warning "PokeAPI Move fetch failed: $($_.Exception.Message)"
}

# 5. Pokemon Map
Write-Host "Building Pokemon Map from Showdown pokedex.ts and pokemon.json..." -ForegroundColor Cyan
$pokemonEnToJa = @{}
$pokemonJsonPath = Join-Path $dataDir "pokemon.json"
$pokemonList = Get-Content $pokemonJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json

$pokedexUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/pokedex.ts"
$pokedexRaw = (Invoke-WebRequest -Uri $pokedexUrl -UseBasicParsing).Content

$matches = [regex]::Matches($pokedexRaw, '(?m)^\s*([a-z0-9]+):\s*\{\s*num:\s*(-?\d+),\s*name:\s*"([^"]+)"')
$showdownPokes = @{}
foreach ($m in $matches) {
    $id = $m.Groups[1].Value
    $num = [int]$m.Groups[2].Value
    $name = $m.Groups[3].Value
    $showdownPokes[$id] = @{ num = $num; name = $name }
}

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
    $display = [string]$p.display
    $baseName = [string]$p.name
    $form = [string]$p.form
    $no = [int]$p.no
    
    foreach ($kv in $showdownPokes.GetEnumerator()) {
        $sdId = $kv.Key
        $sdName = $kv.Value.name
        $sdNum = $kv.Value.num
        
        if ($sdNum -eq $no) {
            if ($form -eq $uNormal -or -not $form) {
                if ($sdName -notmatch "-") {
                    $pokemonEnToJa[$sdName] = $display
                    $pokemonEnToJa[$sdId] = $display
                }
            } elseif ($form.IndexOf($uMega) -ge 0) {
                if ($sdName -match "-Mega") {
                    if ($form.IndexOf("X") -ge 0 -or $form.IndexOf([char]0xFF38) -ge 0) {
                        if ($sdName -match "-Mega-X") { $pokemonEnToJa[$sdName] = $display; $pokemonEnToJa[$sdId] = $display }
                    } elseif ($form.IndexOf("Y") -ge 0 -or $form.IndexOf([char]0xFF39) -ge 0) {
                        if ($sdName -match "-Mega-Y") { $pokemonEnToJa[$sdName] = $display; $pokemonEnToJa[$sdId] = $display }
                    } elseif ($form.IndexOf("Z") -ge 0 -or $form.IndexOf([char]0xFF3A) -ge 0) {
                        if ($sdName -match "-Mega-Z") { $pokemonEnToJa[$sdName] = $display; $pokemonEnToJa[$sdId] = $display }
                    } else {
                        if ($sdName -notmatch "-Mega-[XYZ]") { $pokemonEnToJa[$sdName] = $display; $pokemonEnToJa[$sdId] = $display }
                    }
                }
            } elseif ($form.IndexOf($uAlola) -ge 0 -and $sdName -match "-Alola") {
                $pokemonEnToJa[$sdName] = $display
                $pokemonEnToJa[$sdId] = $display
            } elseif ($form.IndexOf($uGalar) -ge 0 -and $sdName -match "-Galar") {
                $pokemonEnToJa[$sdName] = $display
                $pokemonEnToJa[$sdId] = $display
            } elseif ($form.IndexOf($uHisui) -ge 0 -and $sdName -match "-Hisui") {
                $pokemonEnToJa[$sdName] = $display
                $pokemonEnToJa[$sdId] = $display
            } elseif ($form.IndexOf($uPaldea) -ge 0 -and $sdName -match "-Paldea") {
                $pokemonEnToJa[$sdName] = $display
                $pokemonEnToJa[$sdId] = $display
            } elseif ($form.IndexOf($uMale) -ge 0 -and ($sdName -notmatch "-F$" -or $sdName -match "-M$")) {
                $pokemonEnToJa[$sdName] = $display
                $pokemonEnToJa[$sdId] = $display
            } elseif ($form.IndexOf($uFemale) -ge 0 -and $sdName -match "-F$") {
                $pokemonEnToJa[$sdName] = $display
                $pokemonEnToJa[$sdId] = $display
            } elseif ($form.IndexOf($uGmax) -ge 0 -and $sdName -match "-Gmax") {
                $pokemonEnToJa[$sdName] = $display
                $pokemonEnToJa[$sdId] = $display
            }
        }
    }
}

# Special manual names
$pokemonEnToJa["Floette-Mega"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30d5\u30e9\u30a8\u30c3\u30c6(\u30e1\u30ac\u30d5\u30e9\u30a8\u30c3\u30c6)")
$pokemonEnToJa["Delphox-Mega"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30de\u30d5\u30a9\u30af\u30b7\u30fc(\u30e1\u30ac\u30de\u30d5\u30a9\u30af\u30b7\u30fc)")
$pokemonEnToJa["Basculegion"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30a4\u30c0\u30a4\u30c8\u30a6(\u30aa\u30b9\u306e\u3059\u304c\u305f)")
$pokemonEnToJa["Basculegion-M"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30a4\u30c0\u30a4\u30c8\u30a6(\u30aa\u30b9\u306e\u3059\u304c\u305f)")
$pokemonEnToJa["Basculegion-F"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30a4\u30c0\u30a4\u30c8\u30a6(\u30e1\u30b9\u306e\u3059\u304c\u305f)")
$pokemonEnToJa["Sinistcha"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30e4\u30d0\u30bd\u30c1\u30e3")
$pokemonEnToJa["Grimmsnarl"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30aa\u30fc\u30ed\u30f3\u30b2")
$pokemonEnToJa["Incineroar"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30ac\u30aa\u30ac\u30a8\u30f3")
$pokemonEnToJa["Milotic"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30df\u30ed\u30ab\u30ed\u30b9")
$pokemonEnToJa["Archaludon"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30d6\u30ea\u30b8\u30e5\u30e9\u30b9")
$pokemonEnToJa["Pelipper"] = [System.Text.RegularExpressions.Regex]::Unescape("\u304a\u3068\u306a\u3057\u3044") # fix
$pokemonEnToJa["Pelipper"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30da\u30ea\u30c3\u3071\u30fc")
$pokemonEnToJa["Venusaur"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30d5\u30b7\u30ae\u30d0\u30ca")
$pokemonEnToJa["Charizard"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30ea\u30b6\u30fc\u30c9\u30f3")
$pokemonEnToJa["Charizard-Mega-Y"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30ea\u30b6\u30fc\u30c9\u30f3(\u30e1\u30ac\u30ea\u30b6\u30fc\u30c9\u30f3Y)")
$pokemonEnToJa["Charizard-Mega-X"] = [System.Text.RegularExpressions.Regex]::Unescape("\u30ea\u30b6\u30fc\u30c9\u30f3(\u30e1\u30ac\u30ea\u30b6\u30fc\u30c9\u30f3X)")

# Build final output dictionaries
$pEnToJa = [System.Collections.Generic.Dictionary[string, string]]::new()
$pJaToEn = [System.Collections.Generic.Dictionary[string, string]]::new()
foreach ($kv in $pokemonEnToJa.GetEnumerator()) {
    $k = [string]$kv.Key
    $v = [string]$kv.Value
    $id = toId $k
    if (-not $pEnToJa.ContainsKey($id)) { $pEnToJa[$id] = $v }
    if (-not $pJaToEn.ContainsKey($v) -and $k -match '^[A-Z]') { $pJaToEn[$v] = $k }
}

$iEnToJa = [System.Collections.Generic.Dictionary[string, string]]::new()
$iJaToEn = [System.Collections.Generic.Dictionary[string, string]]::new()
foreach ($kv in $itemsEnToJa.GetEnumerator()) {
    $k = [string]$kv.Key
    $v = [string]$kv.Value
    $id = toId $k
    if (-not $iEnToJa.ContainsKey($id)) { $iEnToJa[$id] = $v }
    if (-not $iJaToEn.ContainsKey($v)) { $iJaToEn[$v] = $k }
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

$normMap = [System.Collections.Generic.Dictionary[string, object]]::new()
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

Write-Host "Successfully saved $outPath" -ForegroundColor Green
Write-Host "Pokemon mappings: $($pEnToJa.Count)"
Write-Host "Items mappings: $($iEnToJa.Count)"
Write-Host "Moves mappings: $($mEnToJa.Count)"
Write-Host "Abilities mappings: $($aEnToJa.Count)"
Write-Host "Natures mappings: $($nEnToJa.Count)"
