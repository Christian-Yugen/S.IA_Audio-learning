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

$config = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "package-files.json") | ConvertFrom-Json
$files = @($config.files)
$included = @($files)
foreach ($directory in $config.directories) {
    $directoryPath = Join-Path $projectRoot $directory
    $included += @(Get-ChildItem -LiteralPath $directoryPath -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
        if (-not ($relative.Split('/') | Where-Object { $_.StartsWith('.') })) { $relative }
    })
}
$required = @($manifest.background.service_worker, $manifest.action.default_popup, $manifest.side_panel.default_path)
$required += @($manifest.icons.PSObject.Properties | ForEach-Object { $_.Value })
$required += @($manifest.action.default_icon.PSObject.Properties | ForEach-Object { $_.Value })
foreach ($entry in $manifest.content_scripts) { $required += @($entry.js); $required += @($entry.css) }
foreach ($entry in $manifest.web_accessible_resources) {
    foreach ($pattern in $entry.resources) {
        if (-not ($included | Where-Object { $_ -like $pattern })) { throw "Recurso fora do pacote: $pattern" }
    }
}
foreach ($relativePath in $included) {
    $sourcePath = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw "Arquivo ausente: $relativePath" }
    if ($relativePath.EndsWith('.html')) {
        $html = Get-Content -Raw -LiteralPath $sourcePath
        foreach ($match in [regex]::Matches($html, '(?:src|href)=["'']([^"'']+)["'']')) {
            $ref = $match.Groups[1].Value
            if ($ref -notmatch ':' -and -not $ref.StartsWith('#')) {
                $parent = Split-Path -Parent $relativePath
                $required += $(if ($parent) { "$parent/$ref".Replace('\', '/') } else { $ref })
            }
        }
    }
    if ($relativePath -eq 'service-worker.js') {
        foreach ($match in [regex]::Matches((Get-Content -Raw -LiteralPath $sourcePath), '"([a-zA-Z0-9_./-]+\.js)"')) {
            $required += $match.Groups[1].Value
        }
    }
}
foreach ($ref in $required) {
    if ($ref -and $ref -notin $included) { throw "Dependência fora da allowlist: $ref" }
}

try {
    New-Item -ItemType Directory -Path $stagingPath -Force | Out-Null
    New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

    foreach ($file in $included) {
        $sourcePath = Join-Path $projectRoot $file
        $destinationPath = Join-Path $stagingPath $file
        $destinationDirectory = Split-Path -Parent $destinationPath
        New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
        Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
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
