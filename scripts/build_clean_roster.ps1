# Build Clean Roster from pokemon.json (Confirmed Only) with Strict Mega Exclusion
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$rootDir = Split-Path $PSScriptRoot -Parent
$dataDir = Join-Path $rootDir "data"
$assetsDir = Join-Path $rootDir "assets"
$iconsDir = Join-Path $assetsDir "pokemon_icons"

Write-Host "Building Clean Roster from data/pokemon.json & verified Showdown icons..." -ForegroundColor Cyan

$pkmJsonPath = Join-Path $dataDir "pokemon.json"
$pkmData = Get-Content $pkmJsonPath -Encoding UTF8 -Raw | ConvertFrom-Json

$uNormal = [System.Text.RegularExpressions.Regex]::Unescape("\u30ce\u30fc\u30de\u30eb")
$uFire = [System.Text.RegularExpressions.Regex]::Unescape("\u307b\u306e\u304a")
$uWater = [System.Text.RegularExpressions.Regex]::Unescape("\u307f\u305a")
$uElectric = [System.Text.RegularExpressions.Regex]::Unescape("\u3067\u3093\u304d")
$uGrass = [System.Text.RegularExpressions.Regex]::Unescape("\u304f\u3055")
$uIce = [System.Text.RegularExpressions.Regex]::Unescape("\u3053\u304a\u308a")
$uFighting = [System.Text.RegularExpressions.Regex]::Unescape("\u304b\u304f\u3068\u3046")
$uPoison = [System.Text.RegularExpressions.Regex]::Unescape("\u3069\u304f")
$uGround = [System.Text.RegularExpressions.Regex]::Unescape("\u3058\u3081\u3093")
$uFlying = [System.Text.RegularExpressions.Regex]::Unescape("\u3072\u3053\u3046")
$uPsychic = [System.Text.RegularExpressions.Regex]::Unescape("\u30a8\u30b9\u30d1\u30fc")
$uBug = [System.Text.RegularExpressions.Regex]::Unescape("\u3080\u3057")
$uRock = [System.Text.RegularExpressions.Regex]::Unescape("\u3044\u308f")
$uGhost = [System.Text.RegularExpressions.Regex]::Unescape("\u30b4\u30fc\u30b9\u30c8")
$uDragon = [System.Text.RegularExpressions.Regex]::Unescape("\u30c9\u30e9\u30b4\u30f3")
$uDark = [System.Text.RegularExpressions.Regex]::Unescape("\u3042\u304f")
$uSteel = [System.Text.RegularExpressions.Regex]::Unescape("\u306f\u304c\u306d")
$uFairy = [System.Text.RegularExpressions.Regex]::Unescape("\u30d5\u30a7\u30a2\u30ea\u30fc")

$typeMap = @{
    $uNormal = "normal"
    $uFire = "fire"
    $uWater = "water"
    $uElectric = "electric"
    $uGrass = "grass"
    $uIce = "ice"
    $uFighting = "fighting"
    $uPoison = "poison"
    $uGround = "ground"
    $uFlying = "flying"
    $uPsychic = "psychic"
    $uBug = "bug"
    $uRock = "rock"
    $uGhost = "ghost"
    $uDragon = "dragon"
    $uDark = "dark"
    $uSteel = "steel"
    $uFairy = "fairy"
}

$cleanRoster = @()
$seenNames = [System.Collections.Generic.HashSet[string]]::new()

$megaStonesPath = Join-Path $dataDir "mega_stones.json"
$megaDisplayNames = [System.Collections.Generic.HashSet[string]]::new()
if (Test-Path $megaStonesPath) {
    $megaStonesData = Get-Content $megaStonesPath -Encoding UTF8 -Raw | ConvertFrom-Json
    foreach ($prop in $megaStonesData.PSObject.Properties) {
        $megaDisplayNames.Add($prop.Value) | Out-Null
    }
}

$pokeMapPath = Join-Path $assetsDir "pokemon_map.json"
$transPath = Join-Path $dataDir "translation_map.json"

$nameToFileName = @{}
if (Test-Path $pokeMapPath) {
    $pokeMapData = Get-Content $pokeMapPath -Encoding UTF8 -Raw | ConvertFrom-Json
    foreach ($m in $pokeMapData) {
        if ($m.nameJa -and $m.fileName) {
            $nameToFileName[$m.nameJa] = $m.fileName
        }
    }
}

$jaToEnId = @{}
if (Test-Path $transPath) {
    $transData = Get-Content $transPath -Encoding UTF8 -Raw | ConvertFrom-Json
    if ($transData.pokemon_en_to_ja) {
        foreach ($prop in $transData.pokemon_en_to_ja.PSObject.Properties) {
            $enId = $prop.Name
            $jaName = $prop.Value
            $jaToEnId[$jaName] = $enId
        }
    }
}

$uMrRime = [System.Text.RegularExpressions.Regex]::Unescape("\u30d0\u30ea\u30b3\u30aa\u30eb")
$uMaushold = [System.Text.RegularExpressions.Regex]::Unescape("\u30a4\u30c3\u30ab\u30cd\u30ba\u30df")
$uPalafin = [System.Text.RegularExpressions.Regex]::Unescape("\u30a4\u30eb\u30ab\u30de\u30f3")
$uLycanMidday = [System.Text.RegularExpressions.Regex]::Unescape("\u307e\u3072\u308b")
$uLycanMid = [System.Text.RegularExpressions.Regex]::Unescape("\u307e\u3088\u306a\u304b")
$uLycanDusk = [System.Text.RegularExpressions.Regex]::Unescape("\u305f\u305d\u304c\u308c")
$uMeowMale = [System.Text.RegularExpressions.Regex]::Unescape("\u30aa\u30b9")
$uMeowFemale = [System.Text.RegularExpressions.Regex]::Unescape("\u30e1\u30b9")
$uBascMale = [System.Text.RegularExpressions.Regex]::Unescape("\u30aa\u30b9")
$uBascFemale = [System.Text.RegularExpressions.Regex]::Unescape("\u30e1\u30b9")
$uStunGalar = [System.Text.RegularExpressions.Regex]::Unescape("\u30ac\u30e9\u30eb")

foreach ($p in $pkmData) {
    if (-not $p.confirmed) { continue }
    $disp = if ($p.display) { $p.display } else { $p.name }

    # Exclude Mega Evolution forms accurately for recognition engine
    $isMega = $megaDisplayNames.Contains($disp) -or 
              ($p.form -and ($p.form -like "*メガ*" -or $p.form -like "*Mega*")) -or 
              ($p.display -and ($p.display -like "*(メガ*" -or $p.display -like "*-Mega*"))
    if ($isMega) { continue }

    if ($seenNames.Contains($disp)) { continue }
    $seenNames.Add($disp) | Out-Null

    $t1 = if ($p.type1 -and $typeMap.ContainsKey($p.type1)) { $typeMap[$p.type1] } else { "none" }
    $t2 = if ($p.type2 -and $typeMap.ContainsKey($p.type2)) { $typeMap[$p.type2] } else { "none" }

    # Determine icon file
    $targetFile = ""
    if ($nameToFileName.ContainsKey($disp)) {
        $targetFile = $nameToFileName[$disp]
    } elseif ($nameToFileName.ContainsKey($p.name)) {
        $targetFile = $nameToFileName[$p.name]
    }

    if (-not $targetFile -or -not (Test-Path (Join-Path $iconsDir $targetFile))) {
        if ($disp.Contains($uLycanMidday)) { $targetFile = "lycanroc-midday.png" }
        elseif ($disp.Contains($uLycanMid)) { $targetFile = "lycanroc-midnight.png" }
        elseif ($disp.Contains($uLycanDusk)) { $targetFile = "lycanroc-dusk.png" }
        elseif ($disp.Contains($uMeowMale) -and $p.name -eq [System.Text.RegularExpressions.Regex]::Unescape("\u30cb\u30e3\u30aa\u30cb\u30af\u30b9")) { $targetFile = "meowstic-male.png" }
        elseif ($disp.Contains($uMeowFemale) -and $p.name -eq [System.Text.RegularExpressions.Regex]::Unescape("\u30cb\u30e3\u30aa\u30cb\u30af\u30b9")) { $targetFile = "meowstic-female.png" }
        elseif ($p.name -eq [System.Text.RegularExpressions.Regex]::Unescape("\u30cb\u30e3\u30aa\u30cb\u30af\u30b9")) { $targetFile = "meowstic-male.png" }
        elseif ($disp.Contains($uStunGalar)) { $targetFile = "stunfisk.png" }
        elseif ($p.name -eq $uMrRime) { $targetFile = "mr-rime.png" }
        elseif ($disp.Contains($uBascMale) -and $p.name -eq [System.Text.RegularExpressions.Regex]::Unescape("\u30a4\u30c0\u30a4\u30c8\u30a6")) { $targetFile = "basculegion-male.png" }
        elseif ($disp.Contains($uBascFemale) -and $p.name -eq [System.Text.RegularExpressions.Regex]::Unescape("\u30a4\u30c0\u30a4\u30c8\u30a6")) { $targetFile = "basculegion-female.png" }
        elseif ($p.name -eq [System.Text.RegularExpressions.Regex]::Unescape("\u30a4\u30c0\u30a4\u30c8\u30a6")) { $targetFile = "basculegion-male.png" }
        elseif ($disp.Contains("Four")) { $targetFile = "maushold-four.png" }
        elseif ($p.name -eq $uMaushold) { $targetFile = "maushold-three.png" }
        elseif ($disp.Contains("Hero") -or $disp.Contains([System.Text.RegularExpressions.Regex]::Unescape("\u30de\u30a4\u30c6\u30a3"))) { $targetFile = "palafin-hero.png" }
        elseif ($p.name -eq $uPalafin) { $targetFile = "palafin-zero.png" }
    }

    if (-not $targetFile -or -not (Test-Path (Join-Path $iconsDir $targetFile))) {
        if ($jaToEnId.ContainsKey($disp)) {
            $enFile = "$($jaToEnId[$disp]).png"
            if (Test-Path (Join-Path $iconsDir $enFile)) { $targetFile = $enFile }
        } elseif ($jaToEnId.ContainsKey($p.name)) {
            $enFile = "$($jaToEnId[$p.name]).png"
            if (Test-Path (Join-Path $iconsDir $enFile)) { $targetFile = $enFile }
        }
    }

    if (-not $targetFile -or -not (Test-Path (Join-Path $iconsDir $targetFile))) {
        if ($p.no) {
            $numStr = [string]$p.no
            $dexFile = "dex_$numStr.png"
            if (Test-Path (Join-Path $iconsDir $dexFile)) { $targetFile = $dexFile }
        }
    }

    $id = "$($p.no)_$disp"
    $cleanRoster += [PSCustomObject]@{
        id = $id
        no = [string]$p.no
        name = $p.name
        display = $disp
        t1 = $t1
        t2 = $t2
        file = $targetFile
    }
}

$outPath = Join-Path $assetsDir "clean_roster.json"
$cleanRoster | ConvertTo-Json -Depth 5 | Out-File $outPath -Encoding UTF8
Write-Host "Generated assets/clean_roster.json with $($cleanRoster.Count) confirmed entries!" -ForegroundColor Green
