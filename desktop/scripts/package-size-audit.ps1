param(
  [string]$DesktopRoot = (Join-Path $PSScriptRoot '..')
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Audit actual output of the Windows builder, never the source repository.
# Build tools, tests and design assets are not part of the installed runtime.
$desktop = (Resolve-Path -LiteralPath $DesktopRoot).Path
$core = Join-Path $desktop 'dist'
$unpacked = Join-Path $core 'win-unpacked'
$animated = Join-Path $desktop 'installer/dist'
$nsis = @(Get-ChildItem -LiteralPath $core -Filter 'h00k Desktop Setup *.exe' -File)
$portable = @(Get-ChildItem -LiteralPath $animated -Filter 'h00k Setup *.exe' -File)
if ($nsis.Count -ne 1 -or $portable.Count -ne 1) {
  throw "Expected one NSIS and one animated setup; found $($nsis.Count) and $($portable.Count)"
}
$resources = Join-Path $unpacked 'resources'
$asar = Join-Path $resources 'app.asar'
if (-not (Test-Path -LiteralPath $asar -PathType Leaf)) {
  throw 'The installed Desktop application has no app.asar'
}
$localeFolder = Join-Path $unpacked 'locales'
if (-not (Test-Path -LiteralPath $localeFolder -PathType Container)) {
  throw 'The installed Desktop is missing Electron locales'
}
$allowed = @('en-US','pl','ru','uk')
$actual = @(Get-ChildItem -LiteralPath $localeFolder -Filter '*.pak' -File | ForEach-Object { $_.BaseName })
$unwanted = @($actual | Where-Object { $_ -notin $allowed })
$missing = @($allowed | Where-Object { $_ -notin $actual })
if ($unwanted.Count -or $missing.Count) {
  throw "Electron locale mismatch. Unexpected: $($unwanted -join ','); missing: $($missing -join ',')"
}
if (Test-Path -LiteralPath (Join-Path $resources 'app.asar.unpacked/test')) {
  throw 'Desktop test fixtures have leaked into installed resources'
}

$installedFiles = @(Get-ChildItem -LiteralPath $unpacked -File -Recurse)
$installedBytes = ($installedFiles | Measure-Object -Property Length -Sum).Sum
$coreBytes = $nsis[0].Length
$animatedBytes = $portable[0].Length
$asarBytes = (Get-Item -LiteralPath $asar).Length

$result = [ordered]@{
  desktopVersion = (Get-Content -LiteralPath (Join-Path $desktop 'package.json') -Raw | ConvertFrom-Json).version
  nsisInstallerBytes = $coreBytes
  animatedInstallerBytes = $animatedBytes
  installedFiles = $installedFiles.Count
  installedBytes = $installedBytes
  desktopAsarBytes = $asarBytes
  electronLocales = $actual
  notes = 'Animated portable setup embeds a separate Electron launcher and the full NSIS installer. Values are artifact size, not RAM or live server load.'
}
$report = Join-Path $desktop 'dist/package-size-report.json'
$result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $report -Encoding utf8
Write-Host ('NSIS installer: {0:N2} MiB' -f ($coreBytes/1MB))
Write-Host ('Animated setup: {0:N2} MiB' -f ($animatedBytes/1MB))
Write-Host ('Installed Desktop: {0:N2} MiB; {1} files' -f ($installedBytes/1MB), $installedFiles.Count)
Write-Host ('Desktop app.asar: {0:N2} MiB; Electron locale packs: {1}' -f ($asarBytes/1MB), ($actual -join ', '))
Write-Host "Audit report: $report"
