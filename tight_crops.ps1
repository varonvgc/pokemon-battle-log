Add-Type -AssemblyName System.Drawing

$img1Path = "C:\Users\taku0\.gemini\antigravity-ide\brain\b283aa59-c90c-4066-b2b7-1d42e54b438d\.user_uploaded\media_1787669378643.png"
$img2Path = "C:\Users\taku0\.gemini\antigravity-ide\brain\b283aa59-c90c-4066-b2b7-1d42e54b438d\.user_uploaded\media_1787669389199.png"
$iconsDir = "assets/pokemon_icons"

# Let's inspect the exact layout of Image 1 and Image 2:
# 1. Detect game screen bounds inside the image:
# Image 1 (1024x473):
# Notice top-left has camera/battery icon, top-center has "ランクバトル　ダブルバトル"
# In Switch 16:9, if Height=473, standard width is 473 * 16 / 9 = 840.88 px.
# 1024 is the smartphone screen width. The game UI is centered or spans the width.
# Let's check the opponent slots in Image 1 and Image 2.

$bmp1 = New-Object System.Drawing.Bitmap($img1Path)
$bmp2 = New-Object System.Drawing.Bitmap($img2Path)

Write-Host "Image 1: $($bmp1.Width)x$($bmp1.Height), Image 2: $($bmp2.Width)x$($bmp2.Height)"

# In Image 1:
# Opponent card right edge is at ~880px, left edge is at ~750px (Width ~130px)
# Pokemon icon is in the left portion of this card: X ~ [780, 840], Width ~ 60px
# Y positions of 6 slots:
# Slot 0: Y ~ [60, 110]
# Slot 1: Y ~ [115, 165]
# Slot 2: Y ~ [170, 220]
# Slot 3: Y ~ [225, 275]
# Slot 4: Y ~ [280, 330]
# Slot 5: Y ~ [335, 385]

# In Image 2:
# Opponent card right edge is at ~800px, left edge is at ~670px (Width ~130px)
# Pokemon icon is in the left portion: X ~ [700, 760], Width ~ 60px
# (In Image 2, opponent cards are shifted slightly left because timer/status is in center)
# Y positions of 6 slots in Image 2:
# Slot 0: Y ~ [60, 110]
# Slot 1: Y ~ [115, 165]
# Slot 2: Y ~ [170, 220]
# Slot 3: Y ~ [225, 275]
# Slot 4: Y ~ [280, 330]
# Slot 5: Y ~ [335, 385]

$outDir = "C:\Users\taku0\.gemini\antigravity-ide\brain\b283aa59-c90c-4066-b2b7-1d42e54b438d\scratch"

# Let's crop tight icon boxes for Image 1 and Image 2
Write-Host "Cropping tight icon boxes for Image 1..."
for ($i = 0; $i -lt 6; $i++) {
    $y = 60 + $i * 55
    $x = 790
    $w = 54
    $h = 50
    $rect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $c = $bmp1.Clone($rect, $bmp1.PixelFormat)
    $c.Save("$outDir\img1_tight_$i.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $c.Dispose()
}

Write-Host "Cropping tight icon boxes for Image 2..."
for ($i = 0; $i -lt 6; $i++) {
    $y = 60 + $i * 55
    $x = 710
    $w = 54
    $h = 50
    $rect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $c = $bmp2.Clone($rect, $bmp2.PixelFormat)
    $c.Save("$outDir\img2_tight_$i.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $c.Dispose()
}

$bmp1.Dispose()
$bmp2.Dispose()
