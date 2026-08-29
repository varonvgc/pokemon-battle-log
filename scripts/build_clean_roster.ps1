Add-Type -AssemblyName System.Drawing

$rootDir = Split-Path $PSScriptRoot -Parent
$dataDir = Join-Path $rootDir "data"
$assetsDir = Join-Path $rootDir "assets"
$iconsDir = Join-Path $assetsDir "pokemon_icons"

Write-Host "Building Clean Roster from data/pokemon.json & verified Showdown icons..." -ForegroundColor Cyan

$pkmJsonPath = Join-Path $dataDir "pokemon.json"
$pkmData = Get-Content $pkmJsonPath -Encoding UTF8 -Raw | ConvertFrom-Json

# Type name mapping
$typeMap = @{
    "ノーマル"="normal"; "ほのお"="fire"; "みず"="water"; "でんき"="electric"; "くさ"="grass"; "こおり"="ice";
    "かくとう"="fighting"; "どく"="poison"; "じめん"="ground"; "ひこう"="flying"; "エスパー"="psychic"; "むし"="bug";
    "いわ"="rock"; "ゴースト"="ghost"; "ドラゴン"="dragon"; "あく"="dark"; "はがね"="steel"; "フェアリー"="fairy"; "ステラ"="stellar"
}

$cleanRoster = @()
$seenNames = [System.Collections.Generic.HashSet[string]]::new()

foreach ($p in $pkmData) {
    if (-not $p.confirmed) { continue }
    $disp = if ($p.display) { $p.display } else { $p.name }
    if ($seenNames.Contains($disp)) { continue }
    $seenNames.Add($disp) | Out-Null

    $t1 = if ($p.type1 -and $typeMap.ContainsKey($p.type1)) { $typeMap[$p.type1] } else { "none" }
    $t2 = if ($p.type2 -and $typeMap.ContainsKey($p.type2)) { $typeMap[$p.type2] } else { "none" }

    # Determine icon file
    $iconName = $p.name.ToLower().Replace(" ", "-").Replace(".", "").Replace("'", "").Replace(":", "")
    if ($p.name -eq "ソウブレイズ") { $iconName = "ceruledge" }
    elseif ($p.name -eq "グレンアルマ") { $iconName = "armarouge" }
    elseif ($p.name -eq "オーロンゲ") { $iconName = "grimmsnarl" }
    elseif ($p.name -eq "ブリジュラス") { $iconName = "archaludon" }
    elseif ($p.name -eq "キラフロル") { $iconName = "glimmora" }
    elseif ($p.name -eq "イダイトウ") { $iconName = "basculegion" }
    elseif ($p.name -eq "ヤバソチャ") { $iconName = "sinistcha" }
    elseif ($p.name -eq "ドドゲザン") { $iconName = "kingambit" }
    elseif ($p.name -eq "オオニューラ") { $iconName = "sneasler" }
    elseif ($p.name -eq "コノヨザル") { $iconName = "annihilape" }
    elseif ($p.name -eq "リキキリン") { $iconName = "farigiraf" }
    elseif ($p.name -eq "デカヌチャン") { $iconName = "tinkaton" }

    $targetFile = "$iconName.png"
    if (-not (Test-Path (Join-Path $iconsDir $targetFile))) {
        # Check standard dex mappings
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
