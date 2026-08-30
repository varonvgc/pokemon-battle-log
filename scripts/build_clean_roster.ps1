Add-Type -AssemblyName System.Drawing

$rootDir = Split-Path $PSScriptRoot -Parent
$dataDir = Join-Path $rootDir "data"
$assetsDir = Join-Path $rootDir "assets"
$iconsDir = Join-Path $assetsDir "pokemon_icons"

Write-Host "Building Clean Roster from data/pokemon.json & verified Showdown icons..." -ForegroundColor Cyan

$pkmJsonPath = Join-Path $dataDir "pokemon.json"
$pkmData = Get-Content $pkmJsonPath -Encoding UTF8 -Raw | ConvertFrom-Json

# Type name mapping (ASCII safe)
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
$uGhost = [System.Text.RegularExpressions.Regex]::Unescape("\u30a2\u30fc\u30b9\u30c8") # ゴースト
$uGhost = [System.Text.RegularExpressions.Regex]::Unescape("\u30b4\u30fc\u30b9\u30c8")
$uDragon = [System.Text.RegularExpressions.Regex]::Unescape("\u30c9\u30e9\u30b4\u30f3")
$uDark = [System.Text.RegularExpressions.Regex]::Unescape("\u3042\u304f")
$uSteel = [System.Text.RegularExpressions.Regex]::Unescape("\u306f\u304c\u306d")
$uFairy = [System.Text.RegularExpressions.Regex]::Unescape("\u30d5\u30a7\u30a2\u30ea\u30fc")
$uStellar = [System.Text.RegularExpressions.Regex]::Unescape("\u30b9\u30c6\u30e9")

$typeMap = @{
    $uNormal="normal"; $uFire="fire"; $uWater="water"; $uElectric="electric"; $uGrass="grass"; $uIce="ice";
    $uFighting="fighting"; $uPoison="poison"; $uGround="ground"; $uFlying="flying"; $uPsychic="psychic"; $uBug="bug";
    $uRock="rock"; $uGhost="ghost"; $uDragon="dragon"; $uDark="dark"; $uSteel="steel"; $uFairy="fairy"; $uStellar="stellar"
}

$cleanRoster = @()
$seenNames = [System.Collections.Generic.HashSet[string]]::new()

$sCeruledge = [System.Text.RegularExpressions.Regex]::Unescape("\u30bd\u30a6\u30d6\u30ec\u30a4\u30ba")
$sArmarouge = [System.Text.RegularExpressions.Regex]::Unescape("\u30b0\u30ec\u30f3\u30a2\u30eb\u30de")
$sGrimmsnarl = [System.Text.RegularExpressions.Regex]::Unescape("\u30aa\u30fc\u30ed\u30f3\u30b2")
$sArchaludon = [System.Text.RegularExpressions.Regex]::Unescape("\u30d6\u30ea\u30b8\u30e5\u30e9\u30b9")
$sGlimmora = [System.Text.RegularExpressions.Regex]::Unescape("\u30ad\u30e9\u30c5\u30ed\u30eb") # キラフロル
$sGlimmora = [System.Text.RegularExpressions.Regex]::Unescape("\u30ad\u30e9\u30c4\u30ed\u30eb")
$sGlimmora = [System.Text.RegularExpressions.Regex]::Unescape("\u30ad\u30e9\u30d5\u30ed\u30eb")
$sBasculegion = [System.Text.RegularExpressions.Regex]::Unescape("\u30a4\u30c0\u30a4\u30c8\u30a6")
$sSinistcha = [System.Text.RegularExpressions.Regex]::Unescape("\u30e4\u30d0\u30bd\u30c1\u30e3")
$sKingambit = [System.Text.RegularExpressions.Regex]::Unescape("\u30c9\u30c9\u30b2\u30b6\u30f3")
$sSneasler = [System.Text.RegularExpressions.Regex]::Unescape("\u30aa\u30aa\u30cb\u30e5\u30fc\u30e9")
$sAnnihilape = [System.Text.RegularExpressions.Regex]::Unescape("\u30b3\u30ce\u30e8\u30b6\u30eb")
$sFarigiraf = [System.Text.RegularExpressions.Regex]::Unescape("\u30ea\u30ad\u30ad\u30ea\u30f3")
$sTinkaton = [System.Text.RegularExpressions.Regex]::Unescape("\u30c7\u30ab\u30cc\u30c1\u30e3\u30f3")

foreach ($p in $pkmData) {
    if (-not $p.confirmed) { continue }
    $disp = if ($p.display) { $p.display } else { $p.name }
    if ($seenNames.Contains($disp)) { continue }
    $seenNames.Add($disp) | Out-Null

    $t1 = if ($p.type1 -and $typeMap.ContainsKey($p.type1)) { $typeMap[$p.type1] } else { "none" }
    $t2 = if ($p.type2 -and $typeMap.ContainsKey($p.type2)) { $typeMap[$p.type2] } else { "none" }

    # Determine icon file
    $iconName = $p.name.ToLower().Replace(" ", "-").Replace(".", "").Replace("'", "").Replace(":", "")
    if ($p.name -eq $sCeruledge) { $iconName = "ceruledge" }
    elseif ($p.name -eq $sArmarouge) { $iconName = "armarouge" }
    elseif ($p.name -eq $sGrimmsnarl) { $iconName = "grimmsnarl" }
    elseif ($p.name -eq $sArchaludon) { $iconName = "archaludon" }
    elseif ($p.name -eq $sGlimmora) { $iconName = "glimmora" }
    elseif ($p.name -eq $sBasculegion) { $iconName = "basculegion" }
    elseif ($p.name -eq $sSinistcha) { $iconName = "sinistcha" }
    elseif ($p.name -eq $sKingambit) { $iconName = "kingambit" }
    elseif ($p.name -eq $sSneasler) { $iconName = "sneasler" }
    elseif ($p.name -eq $sAnnihilape) { $iconName = "annihilape" }
    elseif ($p.name -eq $sFarigiraf) { $iconName = "farigiraf" }
    elseif ($p.name -eq $sTinkaton) { $iconName = "tinkaton" }

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
