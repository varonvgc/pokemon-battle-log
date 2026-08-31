
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$formatsTsUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/config/formats.ts"
$raw = (Invoke-WebRequest -Uri $formatsTsUrl -UseBasicParsing).Content

# Parse formats with section
$lines = $raw -split "\r?\n"
$currentSection = ""
$results = [System.Collections.Generic.List[object]]::new()

foreach ($line in $lines) {
    if ($line -match 'section:\s*"([^"]+)"') {
        $currentSection = $matches[1]
    }
    if ($line -match 'name:\s*"([^"]+)"') {
        $name = $matches[1]
        if ($name -match 'Reg|VGC|Regulation|Champions') {
            $results.Add([PSCustomObject]@{
                Section = $currentSection
                Name = $name
            })
        }
    }
}

$results | Format-Table -AutoSize
