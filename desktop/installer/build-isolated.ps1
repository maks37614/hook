param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# electron-builder must NOT run from inside desktop/ because npm may discover
# its parent package and copy the entire h00k Desktop project into app.asar.
# The NSIS installer is already bundled as one extraResource. Stage only the
# explicitly permitted launcher source in a separate runner temp directory.
if (-not $env:RUNNER_TEMP) { throw 'RUNNER_TEMP is required for isolated Windows packaging' }
$source = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '.')).Path
$stageRoot = Join-Path $env:RUNNER_TEMP ('h00k-setup-stage-' + $env:GITHUB_RUN_ID)
$stage = Join-Path $stageRoot 'installer'
$build = Join-Path $stageRoot 'build'
New-Item -ItemType Directory -Path $stage,$build -Force | Out-Null

$allow = @(
  'package.json','main.cjs','preload.cjs','install-core.cjs',
  'ui.html','ui.css','ui.js','guide.html','guide.css','guide.js','locales.json'
)
foreach ($name in $allow) {
  $src = Join-Path $source $name
  if (-not (Test-Path -LiteralPath $src -PathType Leaf)) { throw "Missing setup file: $src" }
  Copy-Item -LiteralPath $src -Destination (Join-Path $stage $name) -Force
}
$assets = Join-Path $source 'assets'
if (-not (Test-Path -LiteralPath $assets -PathType Container)) { throw "Prepared installer assets missing: $assets" }
Copy-Item -LiteralPath $assets -Destination (Join-Path $stage 'assets') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $source '..\build\h00k-installer.ico') -Destination (Join-Path $build 'h00k-installer.ico') -Force

Push-Location $stage
try {
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Isolated setup dependency installation failed' }
  npm run dist
  if ($LASTEXITCODE -ne 0) { throw 'Isolated setup packaging failed' }
} finally { Pop-Location }

$unpacked = Join-Path $stage 'dist\win-unpacked\resources'
$expectedWorker = Join-Path $unpacked 'installer-assets\h00k-worker.exe'
if (-not (Test-Path -LiteralPath $expectedWorker -PathType Leaf)) {
  throw 'NSIS worker missing from the launcher resources'
}
$allWorkers = @(Get-ChildItem -LiteralPath $unpacked -Filter 'h00k-worker.exe' -File -Recurse)
if ($allWorkers.Count -ne 1) {
  throw "Duplicate NSIS worker embedded in installer: $($allWorkers.Count) copies"
}
$asar = Join-Path $unpacked 'app.asar'
if (-not (Test-Path -LiteralPath $asar -PathType Leaf)) { throw 'Launcher app.asar missing' }
# Keep only the four Electron locale packs used by the installer. HTML
# translations live inside app.asar and are not affected by this filter.
$localeFolder = Join-Path $stage 'dist/win-unpacked/locales'
$allowedLocales = @('en-US','pl','ru','uk')
$actualLocales = @(Get-ChildItem -LiteralPath $localeFolder -Filter '*.pak' -File | ForEach-Object { $_.BaseName })
$extraLocales = @($actualLocales | Where-Object { $_ -notin $allowedLocales })
$missingLocales = @($allowedLocales | Where-Object { $_ -notin $actualLocales })
if ($extraLocales.Count -or $missingLocales.Count) {
  throw "Setup Electron locale mismatch: extras=[$($extraLocales -join ',')], missing=[$($missingLocales -join ',')]"
}
$asarBytes = (Get-Item -LiteralPath $asar).Length
if ($asarBytes -gt 30000000) {
  throw "Launcher app.asar is unexpectedly large: $asarBytes bytes"
}
$duplicateParent = Join-Path $unpacked 'app.asar.unpacked\node_modules\h00k-desktop'
if (Test-Path -LiteralPath $duplicateParent) {
  throw 'Entire parent h00k Desktop project was accidentally bundled'
}
$output = Join-Path $source 'dist'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$setups = @(Get-ChildItem -LiteralPath (Join-Path $stage 'dist') -Filter 'h00k Setup*.exe' -File)
if ($setups.Count -ne 1) { throw "Expected one compact setup executable; got $($setups.Count)" }
Copy-Item -LiteralPath $setups[0].FullName -Destination (Join-Path $output $setups[0].Name) -Force
Write-Host "PASS: isolated launcher built. app.asar $asarBytes bytes; NSIS worker copies: $($allWorkers.Count)"
Write-Host "Portable setup: $($setups[0].Name) ($($setups[0].Length) bytes); locales: $($actualLocales -join ', ')"
