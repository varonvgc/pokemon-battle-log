
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
$formatsTsUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/config/formats.ts"
$raw = (Invoke-WebRequest -Uri $formatsTsUrl -UseBasicParsing).Content

# Extract format names
$matches = [regex]::Matches($raw, 'name:\s*"([^"]+)"')
$regFormats = @()
foreach ($m in $matches) {
    $name = $m.Groups[1].Value
    if ($name -match 'Regulation|VGC|Champions') {
        $regFormats += $name
    }
}
Write-Host "Found $($regFormats.Count) regulation/VGC/Champions formats:"
$regFormats | ForEach-Object { Write-Host " - $_" }
