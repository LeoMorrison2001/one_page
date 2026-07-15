param(
  [string]$Source = (Join-Path $PSScriptRoot '..\assets\app-icon.png'),
  [string]$Destination = (Join-Path $PSScriptRoot '..\assets\app-icon.ico')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $Source)) {
  throw "PNG 图标不存在：$Source"
}

$sourceImage = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Source))
try {
  $sizes = 16, 24, 32, 48, 64, 128, 256
  $images = foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.DrawImage($sourceImage, (New-Object System.Drawing.Rectangle 0, 0, $size, $size))
      $stream = New-Object System.IO.MemoryStream
      try {
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        ,$stream.ToArray()
      } finally {
        $stream.Dispose()
      }
    } finally {
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }

  $parent = Split-Path -Parent $Destination
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  $file = [System.IO.File]::Open($Destination, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
  try {
    $writer = New-Object System.IO.BinaryWriter $file
    try {
      $writer.Write([uint16]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]$sizes.Count)
      $offset = 6 + 16 * $sizes.Count
      for ($index = 0; $index -lt $sizes.Count; $index += 1) {
        $size = $sizes[$index]
        $bytes = $images[$index]
        $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
        $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]32)
        $writer.Write([uint32]$bytes.Length)
        $writer.Write([uint32]$offset)
        $offset += $bytes.Length
      }
      foreach ($bytes in $images) { $writer.Write($bytes) }
    } finally {
      $writer.Dispose()
    }
  } finally {
    $file.Dispose()
  }
} finally {
  $sourceImage.Dispose()
}
