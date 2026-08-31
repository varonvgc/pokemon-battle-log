
param()
$lines = [System.IO.File]::ReadAllLines("index.html", [System.Text.Encoding]::UTF8)
$out = [System.Collections.Generic.List[string]]::new()
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match 'function\s+([a-zA-Z0-9_]+)') {
        $name = $matches[1]
        $out.Add("Line $($i+1): function $name")
    }
}
[System.IO.File]::WriteAllLines("functions_list.txt", $out, [System.Text.Encoding]::UTF8)
Write-Host "Success! Count: $($out.Count)"
