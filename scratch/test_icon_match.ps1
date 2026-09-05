Add-Type -AssemblyName System.Drawing

# 1. 相手1体目のアイコン切り出し (x: 1620.8, y: 159.5, w: 104.6, h: 104.6)
# 41秒のフレーム画像を取得 (ffmpeg or 既存キャプチャ)
$imgSrc = "C:\Users\taku0\.gemini\antigravity-ide\brain\95c0b38b-052c-4051-a76f-eef77034bf5c\scratch\battle_frame_1080p.png"
if (-not (Test-Path $imgSrc)) {
    Write-Host "Frame not found: $imgSrc"
    exit
}

$bmp = [System.Drawing.Bitmap]::FromFile($imgSrc)
$cropX = [int][Math]::Round(1620.8)
$cropY = [int][Math]::Round(159.5)
$cropW = [int][Math]::Round(104.6)
$cropH = [int][Math]::Round(104.6)

$cropBmp = New-Object System.Drawing.Bitmap(64, 64)
$g = [System.Drawing.Graphics]::FromImage($cropBmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($bmp, (New-Object System.Drawing.Rectangle(0, 0, 64, 64)), $cropX, $cropY, $cropW, $cropH, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()

$cropOut = "C:\Users\taku0\.gemini\antigravity-ide\brain\95c0b38b-052c-4051-a76f-eef77034bf5c\scratch\crop_slot1.png"
$cropBmp.Save($cropOut, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved crop slot 1 to $cropOut"

# テンプレート画像との比較
$iconsDir = "assets\pokemon_icons"
$templates = @("mawile.png", "klefki.png", "tinkaton.png")

foreach ($tName in $templates) {
    $tPath = Join-Path $iconsDir $tName
    if (-not (Test-Path $tPath)) { continue }
    $tBmpOrig = [System.Drawing.Bitmap]::FromFile($tPath)
    $tBmp = New-Object System.Drawing.Bitmap(64, 64)
    $tg = [System.Drawing.Graphics]::FromImage($tBmp)
    $tg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $tg.DrawImage($tBmpOrig, 0, 0, 64, 64)
    $tg.Dispose()
    $tBmpOrig.Dispose()

    $sumDiff = 0.0
    $weight = 0.0

    for ($y = 0; $y -lt 64; $y++) {
        for ($x = 0; $x -lt 64; $x++) {
            $c1 = $cropBmp.GetPixel($x, $y)
            $c2 = $tBmp.GetPixel($x, $y)

            $a = $c2.A
            if ($a -lt 40) { continue }
            $w = $a / 255.0

            $dr = $c2.R - $c1.R
            $dg = $c2.G - $c1.G
            $db = $c2.B - $c1.B

            $diff = ($dr*$dr*0.299 + $dg*$dg*0.587 + $db*$db*0.114) * $w
            $sumDiff += $diff
            $weight += $w
        }
    }
    $tBmp.Dispose()
    $avg = if ($weight -gt 0) { $sumDiff / $weight } else { 999999 }
    Write-Host "$tName MSE: $avg (weight: $weight)"
}

$cropBmp.Dispose()
$bmp.Dispose()
