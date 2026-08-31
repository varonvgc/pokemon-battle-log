
$targetPath = Join-Path (Get-Location).Path "index.html"
$lines = [System.IO.File]::ReadAllLines($targetPath, [System.Text.Encoding]::UTF8)

$out = @()
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match 'function\s+([a-zA-Z0-9_]+)') {
        $name = $matches[1]
        $out += "Line $($i+1): function $name"
    }
}
[System.IO.File]::WriteAllLines("C:\Users\taku0\.gemini\antigravity-ide\brain\65fad6c0-0a8c-437c-99e2-b790c467e1fa\scratch\functions.txt", $out, [System.Text.Encoding]::UTF8)
Write-Host "Wrote $($out.Count) functions to functions.txt"
