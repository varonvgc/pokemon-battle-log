function Check-FileParens($path) {
    $content = Get-Content $path -Raw
    $openB = ($content.ToCharArray() | Where-Object { $_ -eq '{' }).Count
    $closeB = ($content.ToCharArray() | Where-Object { $_ -eq '}' }).Count
    $openP = ($content.ToCharArray() | Where-Object { $_ -eq '(' }).Count
    $closeP = ($content.ToCharArray() | Where-Object { $_ -eq ')' }).Count
    Write-Host "$path -> Curlys: $openB vs $closeB | Parens: $openP vs $closeP"
}
Check-FileParens 'scripts\auto_mode_controller.js'
Check-FileParens 'scripts\recognition_engine.js'
