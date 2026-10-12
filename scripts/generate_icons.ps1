Add-Type -AssemblyName System.Drawing

$srcPath = "d:\LAPTRINH\BEEZONE-ENGLISH\public\beezone-logo.png"
$src = [System.Drawing.Image]::FromFile($srcPath)

function Resize-Image($srcImg, $w, $h, $outPath, $padRatio = 0.0) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    
    if ($padRatio -gt 0) {
        $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 245, 158, 11))
        $g.FillRectangle($bgBrush, 0, 0, $w, $h)
        $bgBrush.Dispose()
        
        $padW = [int]($w * $padRatio)
        $padH = [int]($h * $padRatio)
        $drawW = $w - ($padW * 2)
        $drawH = $h - ($padH * 2)
        $g.DrawImage($srcImg, $padW, $padH, $drawW, $drawH)
    } else {
        $g.DrawImage($srcImg, 0, 0, $w, $h)
    }
    
    $g.Dispose()
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

Resize-Image $src 192 192 "d:\LAPTRINH\BEEZONE-ENGLISH\public\icon-192.png"
Resize-Image $src 512 512 "d:\LAPTRINH\BEEZONE-ENGLISH\public\icon-512.png"
Resize-Image $src 512 512 "d:\LAPTRINH\BEEZONE-ENGLISH\public\icon-maskable-512.png" 0.12
Resize-Image $src 180 180 "d:\LAPTRINH\BEEZONE-ENGLISH\public\apple-touch-icon.png"
Resize-Image $src 64 64 "d:\LAPTRINH\BEEZONE-ENGLISH\public\favicon.png"
$src.Dispose()

Write-Host "PWA icons generated successfully!"
