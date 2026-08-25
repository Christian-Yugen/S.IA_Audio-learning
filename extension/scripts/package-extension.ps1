[CmdletBinding()]
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
    "platform-selection.js",
    "platform-selection-bootstrap.js",
    "offscreen.html",
    "offscreen.js",
    "platform-adapters/caption-input.js",
    "platform-adapters/platform-router.js",
    "platform-adapters/core-event-bridge.js",
    "platform-adapters/core-diagnostic-state.js",
    "platform-adapters/udemy/shaka-caption-bridge.js",
    "platform-adapters/udemy/udemy-host.js",
    "platform-adapters/udemy/udemy-adapter.js",
    "platform-adapters/udemy/udemy-adapter-contract.js",
    "platform-adapters/youtube/youtube-adapter-contract.js",
    "platform-adapters/youtube/youtube-adapter.js",
    "platform-adapters/youtube/youtube-caption-aggregator.js",
    "platform-adapters/youtube/youtube-caption-parser.js",
    "platform-adapters/youtube/youtube-caption-bridge.js",
    "platform-adapters/youtube/youtube-host.js"
)

try {
    New-Item -ItemType Directory -Path $stagingPath -Force | Out-Null
    New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

    foreach ($file in $files) {
        $sourcePath = Join-Path $projectRoot $file
        $destinationPath = Join-Path $stagingPath $file
        $destinationDirectory = Split-Path -Parent $destinationPath
        New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
        Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
    }

    foreach ($directory in @("icons", "neural-tts")) {
        $sourceDirectory = Join-Path $projectRoot $directory
        $destinationDirectory = Join-Path $stagingPath $directory
        Copy-Item -LiteralPath $sourceDirectory -Destination $destinationDirectory -Recurse -Force
    }

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
