param(
    [string]$OutputDirectory = "dist"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectRoot "manifest.json"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$version = $manifest.version
$outputRoot = Join-Path $projectRoot $OutputDirectory
$archivePath = Join-Path $outputRoot "sia-extension-$version.zip"
$stagingPath = Join-Path $outputRoot ".staging-$([guid]::NewGuid())"

$files = @(
    "manifest.json",
    "content.js",
    "sync-engine.js",
    "dom-fallback.js",
    "popup.html",
    "popup.css",
    "popup.js",
    "sidepanel.html",
    "sidepanel.css",
    "sidepanel.js",
    "service-worker.js",
        "offscreen.html",
        "offscreen.js",
        "platform-adapters/caption-input.js",
        "platform-adapters/platform-router.js",
        "platform-adapters/core-event-bridge.js",
        "platform-adapters/core-diagnostic-state.js",
        "platform-adapters/udemy/udemy-host.js",
        "platform-adapters/udemy/udemy-adapter.js",
        "platform-adapters/udemy/udemy-adapter-contract.js"
)

try {
    New-Item -ItemType Directory -Path $stagingPath -Force | Out-Null
    New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

    foreach ($file in $files) {
        Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $stagingPath
    }
    Copy-Item -LiteralPath (Join-Path $projectRoot "icons") -Destination $stagingPath -Recurse
    Copy-Item -LiteralPath (Join-Path $projectRoot "neural-tts") -Destination $stagingPath -Recurse

    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }
    Compress-Archive -Path (Join-Path $stagingPath "*") -DestinationPath $archivePath

    Write-Output "Pacote criado: $archivePath"
} finally {
    if (Test-Path -LiteralPath $stagingPath) {
        Remove-Item -LiteralPath $stagingPath -Recurse -Force
    }
}
