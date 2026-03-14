Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')

$commands = @(
    @{ Name = 'leapvm-inspect-brk'; FilePath = 'node'; Arguments = @('leap-vm/scripts/test_inspect_brk.js') }
)

$null = Invoke-ManualRun -Commands $commands
