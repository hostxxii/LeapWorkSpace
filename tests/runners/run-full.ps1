Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')

$manifestPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'manifest\full.ps1'
$result = Invoke-ManifestRun -Profile 'full' -ManifestPath $manifestPath

if ($result.FailCount -gt 0) {
    exit 1
}
