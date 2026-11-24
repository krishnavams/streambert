# Draws the Samsung TV app icon (tizen/icon.png): a bold red "S" on near-black
# with a soft red glow, in the style of streaming-app tiles. Windows only
# (uses System.Drawing). Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File tizen\tools\make-icon.ps1
Add-Type -AssemblyName System.Drawing

$size = 512
$out = Join-Path $PSScriptRoot "..\icon.png"

$bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# background: near-black, full bleed so any tile crop looks right
$g.Clear([System.Drawing.ColorTranslator]::FromHtml("#0b0b0b"))

# soft red glow rising from the bottom
$glow = New-Object System.Drawing.Drawing2D.GraphicsPath
$glow.AddEllipse(-120, 250, 752, 520)
$pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush $glow
$pgb.CenterColor = [System.Drawing.Color]::FromArgb(120, 229, 9, 20)
$pgb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 229, 9, 20))
$g.FillPath($pgb, $glow)

# the letter, as a path so it can be centred on its real outline
$family = New-Object System.Drawing.FontFamily "Impact"
$letter = New-Object System.Drawing.Drawing2D.GraphicsPath
$letter.AddString("S", $family, 0, 400, (New-Object System.Drawing.PointF 0, 0), [System.Drawing.StringFormat]::GenericDefault)
$b = $letter.GetBounds()
$m = New-Object System.Drawing.Drawing2D.Matrix
$m.Translate((($size - $b.Width) / 2) - $b.X, 218 - ($b.Height / 2) - $b.Y)
$letter.Transform($m)
$b = $letter.GetBounds()

# drop shadow
$shadow = $letter.Clone()
$sm = New-Object System.Drawing.Drawing2D.Matrix
$sm.Translate(0, 10)
$shadow.Transform($sm)
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(150, 0, 0, 0))), $shadow)

# red gradient fill
$rect = New-Object System.Drawing.RectangleF $b.X, $b.Y, $b.Width, $b.Height
$fill = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.ColorTranslator]::FromHtml("#ff3b3b")), ([System.Drawing.ColorTranslator]::FromHtml("#b3060f")), 90
$g.FillPath($fill, $letter)

# thin highlight along the outline
$g.DrawPath((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(70, 255, 255, 255)), 2), $letter)

# wordmark
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$font = New-Object System.Drawing.Font "Arial", 34, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString("S T R E A M B E R T", $font, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(235, 255, 255, 255))), (New-Object System.Drawing.RectangleF 0, 418, $size, 50), $fmt)

$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "Wrote $out"
