param(
  [Parameter(Mandatory = $true)]
  [string]$Installer,
  [Parameter(Mandatory = $true)]
  [string]$RobotIcon
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Installer = (Resolve-Path -LiteralPath $Installer).Path
$RobotIcon = (Resolve-Path -LiteralPath $RobotIcon).Path
Add-Type -AssemblyName System.Drawing

# Check the actual icon embedded in the NSIS setup executable, NOT merely the
# source .ico or the icon of h00k Desktop after installation.
$embedded = [System.Drawing.Icon]::ExtractAssociatedIcon($Installer)
if ($null -eq $embedded) { throw 'Setup EXE has no extractable icon resource' }
$sourceIcon = $null
$actualBitmap = $null
$expectedBitmap = $null

try {
  $sourceIcon = [System.Drawing.Icon]::new($RobotIcon, $embedded.Size)
  $actualBitmap = $embedded.ToBitmap()
  $expectedBitmap = $sourceIcon.ToBitmap()
  if ($actualBitmap.Width -ne $expectedBitmap.Width -or $actualBitmap.Height -ne $expectedBitmap.Height) {
    throw "Icon sizes differ: setup=$($actualBitmap.Size), robot=$($expectedBitmap.Size)"
  }

  # Compare opaque robot pixels; matching transparent background alone is not
  # sufficient to certify the presence of the correct robot in Explorer.
  $opaque = 0
  $matched = 0
  $brightEyes = 0
  for ($y=0; $y -lt $expectedBitmap.Height; $y++) {
    for ($x=0; $x -lt $expectedBitmap.Width; $x++) {
      $want = $expectedBitmap.GetPixel($x, $y)
      if ($want.A -lt 80) { continue }
      $got = $actualBitmap.GetPixel($x, $y)
      $opaque++
      $delta = [Math]::Abs([int]$want.R - [int]$got.R) +
        [Math]::Abs([int]$want.G - [int]$got.G) +
        [Math]::Abs([int]$want.B - [int]$got.B)
      if ($got.A -ge 80 -and $delta -le 55) { $matched++ }
      if ($got.R -lt 180 -and $got.G -gt 140 -and $got.B -gt 170) { $brightEyes++ }
    }
  }
  if ($opaque -lt 20) { throw "Source robot image has too few visible pixels ($opaque)" }
  $similarity = $matched / $opaque
  Write-Host ("Setup robot icon: {0}x{1}, matching visible pixels: {2:P1}, cyan pixels: {3}" -f
    $actualBitmap.Width, $actualBitmap.Height, $similarity, $brightEyes)
  if ($similarity -lt 0.75 -or $brightEyes -lt 6) {
    throw 'Setup .exe does not embed the expected h00k robot icon; NSIS icon resource differs'
  }
} finally {
  if ($null -ne $actualBitmap) { $actualBitmap.Dispose() }
  if ($null -ne $expectedBitmap) { $expectedBitmap.Dispose() }
  if ($null -ne $sourceIcon) { $sourceIcon.Dispose() }
  $embedded.Dispose()
}
