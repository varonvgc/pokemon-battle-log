$trans = [System.IO.File]::ReadAllText("scripts/translations.json", [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$m = $trans.abilities."Mind's Eye"
Write-Host "Mind's Eye in translations.json: '$m'"

# ガチグマの各プロパティ
$p = [System.IO.File]::ReadAllText("data/pokemon.json", [System.Text.Encoding]::UTF8) | ConvertFrom-Json | Where-Object { $_.no -eq "901" }
foreach ($x in $p) {
    Write-Host "[$($x.display)] 1:'$($x.ability1)', 2:'$($x.ability2)', H:'$($x.ability_hidden)'"
}
