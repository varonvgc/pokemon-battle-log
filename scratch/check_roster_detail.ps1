$r = Get-Content -Raw 'assets\clean_roster.json' | ConvertFrom-Json
Write-Host "Total in clean_roster: $($r.Count)"
$pory = $r | Where-Object { $_.name -like '*ポリゴン*' -or $_.id -like '*porygon*' }
Write-Host "Porygon matches: $($pory.Count)"
$pory | ForEach-Object { Write-Host "  Found: $($_.id) / $($_.name) / $($_.display) / $($_.file)" }

$norm = $r | Where-Object { $_.t1 -eq 'normal' -and $_.t2 -eq 'none' }
Write-Host "Normal single count: $($norm.Count)"
$norm | ForEach-Object { Write-Host "  Normal single: $($_.display) (file: $($_.file))" }

$mawile = $r | Where-Object { $_.name -like '*クチート*' -or $_.id -like '*mawile*' }
Write-Host "Mawile matches: $($mawile.Count)"
$mawile | ForEach-Object { Write-Host "  Mawile: $($_.id) / $($_.name) / $($_.display) / $($_.file)" }

$steelFairy = $r | Where-Object { ($_.t1 -eq 'steel' -and $_.t2 -eq 'fairy') -or ($_.t1 -eq 'fairy' -and $_.t2 -eq 'steel') }
Write-Host "Steel/Fairy count: $($steelFairy.Count)"
$steelFairy | ForEach-Object { Write-Host "  Steel/Fairy: $($_.display) (file: $($_.file))" }
