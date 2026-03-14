Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')

$manifestPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'manifest\perf.ps1'
$result = Invoke-ManifestRun -Profile 'perf' -ManifestPath $manifestPath

if ($result.FailCount -gt 0) {
    exit 1
}
