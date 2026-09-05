Add-Type -AssemblyName System.Drawing
$b = [System.Drawing.Bitmap]::FromFile('C:\Users\taku0\.gemini\antigravity-ide\brain\95c0b38b-052c-4051-a76f-eef77034bf5c\.user_uploaded\media_1788601761945.png')
Write-Host "Dims: $($b.Width) x $($b.Height)"
$b.Dispose()
