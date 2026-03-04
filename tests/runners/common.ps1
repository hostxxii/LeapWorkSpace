Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-TestsRoot {
    return Split-Path -Parent $PSScriptRoot
}

function Get-RepoRoot {
    return Split-Path -Parent (Get-TestsRoot)
}

function New-RunContext {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Profile
    )

    $testsRoot = Get-TestsRoot
    $repoRoot = Get-RepoRoot
    $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $runName = '{0}_{1}' -f $timestamp, $Profile
    $runDir = Join-Path $testsRoot ('results\' + $runName)
    $outputsDir = Join-Path $runDir 'outputs'

    New-Item -ItemType Directory -Force -Path $runDir | Out-Null
    New-Item -ItemType Directory -Force -Path $outputsDir | Out-Null

    return [ordered]@{
        Profile        = $Profile
        RepoRoot       = $repoRoot
        TestsRoot      = $testsRoot
        RunDir         = $runDir
        OutputsDir     = $outputsDir
        CommandsLog    = Join-Path $runDir 'commands.log'
        SummaryFile    = Join-Path $runDir 'summary.txt'
        JsonSummary    = Join-Path $runDir 'summary.json'
        EnvSnapshot    = Join-Path $runDir 'env.snapshot.txt'
        PerfSummary    = Join-Path $runDir 'perf-summary.md'
        StartedAt      = (Get-Date)
    }
}

function Format-CommandLine {
    param(
        [string] $FilePath,
        [string[]] $Arguments
    )

    $parts = @($FilePath) + @($Arguments)
    return ($parts | ForEach-Object {
        if ($_ -match '\s') { '"' + $_ + '"' } else { $_ }
    }) -join ' '
}

function Write-CommandsLogHeader {
    param([System.Collections.IDictionary] $Context)

    $lines = @(
        ('profile={0}' -f $Context.Profile)
        ('repoRoot={0}' -f $Context.RepoRoot)
        ('runDir={0}' -f $Context.RunDir)
        ('startedAt={0:o}' -f $Context.StartedAt)
        ''
    )
    Set-Content -Path $Context.CommandsLog -Value $lines -Encoding UTF8
}

function Add-CommandsLogLine {
    param(
        [System.Collections.IDictionary] $Context,
        [string] $Line
    )
    Add-Content -Path $Context.CommandsLog -Value $Line -Encoding UTF8
}

function Write-EnvSnapshot {
    param([System.Collections.IDictionary] $Context)

    $snapshot = New-Object System.Collections.Generic.List[string]
    $snapshot.Add(('capturedAt={0:o}' -f (Get-Date)))
    $snapshot.Add(('profile={0}' -f $Context.Profile))
    $snapshot.Add(('repoRoot={0}' -f $Context.RepoRoot))
    $snapshot.Add(('pwd={0}' -f (Get-Location).Path))
    $snapshot.Add('')

    try {
        $nodeVersion = & node -v 2>$null
        if ($LASTEXITCODE -eq 0 -and $nodeVersion) {
            $snapshot.Add(('node={0}' -f $nodeVersion.Trim()))
        }
    } catch {}

    try {
        $npmVersion = & npm -v 2>$null
        if ($LASTEXITCODE -eq 0 -and $npmVersion) {
            $snapshot.Add(('npm={0}' -f $npmVersion.Trim()))
        }
    } catch {}

    $snapshot.Add('')
    $snapshot.Add('[selected_env]')

    $importantPatterns = @(
        '^LEAP_'
        '^NODE_'
        '^UV_THREADPOOL_SIZE$'
        '^CI$'
    )

    Get-ChildItem Env: |
        Sort-Object Name |
        ForEach-Object {
            $name = $_.Name
            $matched = $false
            foreach ($pattern in $importantPatterns) {
                if ($name -match $pattern) {
                    $matched = $true
                    break
                }
            }
            if ($matched) {
                $snapshot.Add(('{0}={1}' -f $name, $_.Value))
            }
        }

    Set-Content -Path $Context.EnvSnapshot -Value $snapshot -Encoding UTF8
}

function Get-ManifestCommands {
    param(
        [Parameter(Mandatory = $true)]
        [string] $ManifestPath
    )

    $commands = & $ManifestPath
    if ($null -eq $commands) {
        return @()
    }

    return @($commands)
}

function Invoke-CommandSpec {
    param(
        [Parameter(Mandatory = $true)]
        [System.Collections.IDictionary] $Context,
        [Parameter(Mandatory = $true)]
        [hashtable] $CommandSpec,
        [Parameter(Mandatory = $true)]
        [int] $Index,
        [switch] $ManualOnly
    )

    if (-not $CommandSpec.ContainsKey('Name')) {
        throw "Command spec missing 'Name'."
    }
    if (-not $CommandSpec.ContainsKey('FilePath')) {
        throw "Command spec missing 'FilePath'."
    }
    if (-not $CommandSpec.ContainsKey('Arguments')) {
        $CommandSpec.Arguments = @()
    }

    $name = [string] $CommandSpec.Name
    $filePath = [string] $CommandSpec.FilePath
    $arguments = @($CommandSpec.Arguments)
    $commandLine = Format-CommandLine -FilePath $filePath -Arguments $arguments
    $stdoutFile = Join-Path $Context.OutputsDir ('{0:00}_{1}.stdout.log' -f $Index, $name)
    $stderrFile = Join-Path $Context.OutputsDir ('{0:00}_{1}.stderr.log' -f $Index, $name)

    $started = Get-Date
    Add-CommandsLogLine -Context $Context -Line ('[{0:o}] START {1}' -f $started, $commandLine)

    if ($ManualOnly) {
        Set-Content -Path $stdoutFile -Value @(
            'MANUAL STEP (not executed automatically)'
            ('Command: {0}' -f $commandLine)
        ) -Encoding UTF8
        Set-Content -Path $stderrFile -Value @() -Encoding UTF8
        $ended = Get-Date
        $durationMs = [int] (($ended - $started).TotalMilliseconds)
        Add-CommandsLogLine -Context $Context -Line ('[{0:o}] SKIP  exit=manual durationMs={1} name={2}' -f $ended, $durationMs, $name)
        return [ordered]@{
            Index      = $Index
            Name       = $name
            Command    = $commandLine
            ExitCode   = $null
            Status     = 'manual'
            StartedAt  = $started
            EndedAt    = $ended
            DurationMs = $durationMs
            StdoutFile = $stdoutFile
            StderrFile = $stderrFile
        }
    }

    Push-Location $Context.RepoRoot
    try {
        $proc = Start-Process `
            -FilePath $filePath `
            -ArgumentList $arguments `
            -WorkingDirectory $Context.RepoRoot `
            -NoNewWindow `
            -PassThru `
            -Wait `
            -RedirectStandardOutput $stdoutFile `
            -RedirectStandardError $stderrFile
        $exitCode = [int] $proc.ExitCode
    } finally {
        Pop-Location
    }

    $ended = Get-Date
    $durationMs = [int] (($ended - $started).TotalMilliseconds)
    Add-CommandsLogLine -Context $Context -Line ('[{0:o}] END   exit={1} durationMs={2} name={3}' -f $ended, $exitCode, $durationMs, $name)

    return [ordered]@{
        Index      = $Index
        Name       = $name
        Command    = $commandLine
        ExitCode   = $exitCode
        Status     = $(if ($exitCode -eq 0) { 'pass' } else { 'fail' })
        StartedAt  = $started
        EndedAt    = $ended
        DurationMs = $durationMs
        StdoutFile = $stdoutFile
        StderrFile = $stderrFile
    }
}

function Write-Summary {
    param(
        [Parameter(Mandatory = $true)]
        [System.Collections.IDictionary] $Context,
        [Parameter(Mandatory = $true)]
        [object[]] $Results
    )

    $total = $Results.Count
    $pass = @($Results | Where-Object { $_.Status -eq 'pass' }).Count
    $fail = @($Results | Where-Object { $_.Status -eq 'fail' }).Count
    $manual = @($Results | Where-Object { $_.Status -eq 'manual' }).Count

    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add(('profile={0}' -f $Context.Profile))
    $lines.Add(('runDir={0}' -f $Context.RunDir))
    $lines.Add(('startedAt={0:o}' -f $Context.StartedAt))
    $lines.Add(('endedAt={0:o}' -f (Get-Date)))
    $lines.Add(('total={0}' -f $total))
    $lines.Add(('pass={0}' -f $pass))
    $lines.Add(('fail={0}' -f $fail))
    $lines.Add(('manual={0}' -f $manual))
    $lines.Add('')
    $lines.Add('[results]')

    foreach ($result in $Results) {
        $exitToken = if ($null -eq $result.ExitCode) { 'manual' } else { [string] $result.ExitCode }
        $lines.Add(('{0} | {1} | exit={2} | {3}ms' -f $result.Status, $result.Name, $exitToken, $result.DurationMs))
    }

    if ($fail -gt 0) {
        $lines.Add('')
        $lines.Add('[failures]')
        foreach ($result in ($Results | Where-Object { $_.Status -eq 'fail' })) {
            $lines.Add(('{0} -> {1}' -f $result.Name, $result.StdoutFile))
            $lines.Add(('{0} -> {1}' -f $result.Name, $result.StderrFile))
        }
    }

    Set-Content -Path $Context.SummaryFile -Value $lines -Encoding UTF8
}

function Write-JsonSummary {
    param(
        [Parameter(Mandatory = $true)]
        [System.Collections.IDictionary] $Context,
        [Parameter(Mandatory = $true)]
        [object[]] $Results
    )

    $endedAt = Get-Date
    $total = $Results.Count
    $pass = @($Results | Where-Object { $_.Status -eq 'pass' }).Count
    $fail = @($Results | Where-Object { $_.Status -eq 'fail' }).Count
    $manual = @($Results | Where-Object { $_.Status -eq 'manual' }).Count

    $resultItems = @(
        foreach ($result in $Results) {
            [ordered]@{
                index      = [int] $result.Index
                name       = [string] $result.Name
                status     = [string] $result.Status
                exitCode   = $(if ($null -eq $result.ExitCode) { $null } else { [int] $result.ExitCode })
                durationMs = [int] $result.DurationMs
                startedAt  = ('{0:o}' -f $result.StartedAt)
                endedAt    = ('{0:o}' -f $result.EndedAt)
                command    = [string] $result.Command
                stdoutFile = [string] $result.StdoutFile
                stderrFile = [string] $result.StderrFile
            }
        }
    )

    $payload = [ordered]@{
        schemaVersion = 1
        profile       = [string] $Context.Profile
        repoRoot      = [string] $Context.RepoRoot
        testsRoot     = [string] $Context.TestsRoot
        runDir        = [string] $Context.RunDir
        startedAt     = ('{0:o}' -f $Context.StartedAt)
        endedAt       = ('{0:o}' -f $endedAt)
        counts        = [ordered]@{
            total  = [int] $total
            pass   = [int] $pass
            fail   = [int] $fail
            manual = [int] $manual
        }
        artifacts     = [ordered]@{
            summaryTxt   = [string] $Context.SummaryFile
            commandsLog  = [string] $Context.CommandsLog
            envSnapshot  = [string] $Context.EnvSnapshot
            perfSummary  = $(if (Test-Path $Context.PerfSummary) { [string] $Context.PerfSummary } else { $null })
        }
        failures      = @(
            foreach ($result in $Results | Where-Object { $_.Status -eq 'fail' }) {
                [ordered]@{
                    name       = [string] $result.Name
                    stdoutFile = [string] $result.StdoutFile
                    stderrFile = [string] $result.StderrFile
                }
            }
        )
        results       = $resultItems
    }

    $json = $payload | ConvertTo-Json -Depth 8
    Set-Content -Path $Context.JsonSummary -Value $json -Encoding UTF8
}

function New-PerfSummary {
    param(
        [Parameter(Mandatory = $true)]
        [System.Collections.IDictionary] $Context,
        [Parameter(Mandatory = $true)]
        [object[]] $Results
    )

    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add(('# Perf Summary ({0})' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')))
    $lines.Add('')
    $lines.Add(('Run Dir: `{0}`' -f $Context.RunDir))
    $lines.Add('')
    $lines.Add('| Script | Status | Exit | Duration(ms) |')
    $lines.Add('| --- | --- | --- | ---: |')
    foreach ($result in $Results) {
        $exitToken = if ($null -eq $result.ExitCode) { 'manual' } else { [string] $result.ExitCode }
        $lines.Add(('| {0} | {1} | {2} | {3} |' -f $result.Name, $result.Status, $exitToken, $result.DurationMs))
    }

    $lines.Add('')
    $lines.Add('## Key Output Hints')
    $lines.Add('')

    foreach ($result in $Results) {
        $lines.Add(('### {0}' -f $result.Name))
        $lines.Add(('- stdout: `{0}`' -f $result.StdoutFile))
        $lines.Add(('- stderr: `{0}`' -f $result.StderrFile))

        $snippets = @()
        if (Test-Path $result.StdoutFile) {
            $matches = Select-String -Path $result.StdoutFile -Pattern 'throughput|ops/s|latency|p50|p95|p99|rss|memory|qps|req/s' -CaseSensitive:$false -ErrorAction SilentlyContinue
            if ($matches) {
                $snippets = @($matches | Select-Object -First 8 | ForEach-Object { $_.Line.Trim() })
            }
        }

        if ($snippets.Count -gt 0) {
            foreach ($line in $snippets) {
                $escaped = $line -replace '\|', '\|'
                $lines.Add(('- `{0}`' -f $escaped))
            }
        } else {
            $lines.Add('- (No auto-extracted metrics; inspect stdout log manually)')
        }

        $lines.Add('')
    }

    Set-Content -Path $Context.PerfSummary -Value $lines -Encoding UTF8
}

function Invoke-ManifestRun {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('smoke', 'full', 'perf')]
        [string] $Profile,
        [Parameter(Mandatory = $true)]
        [string] $ManifestPath
    )

    $context = New-RunContext -Profile $Profile
    Write-CommandsLogHeader -Context $context
    Write-EnvSnapshot -Context $context
    $commands = Get-ManifestCommands -ManifestPath $ManifestPath

    $results = New-Object System.Collections.Generic.List[object]
    $i = 1
    foreach ($command in $commands) {
        $results.Add((Invoke-CommandSpec -Context $context -CommandSpec $command -Index $i))
        $i++
    }

    $resultsArray = $results.ToArray()
    Write-Summary -Context $context -Results $resultsArray
    if ($Profile -eq 'perf') {
        New-PerfSummary -Context $context -Results $resultsArray
    }
    Write-JsonSummary -Context $context -Results $resultsArray

    $failCount = @($resultsArray | Where-Object { $_.Status -eq 'fail' }).Count
    Write-Host ('[{0}] runDir={1} fail={2}' -f $Profile, $context.RunDir, $failCount)
    return [PSCustomObject]@{
        Context   = $context
        Results   = $resultsArray
        FailCount = $failCount
    }
}

function Invoke-ManualRun {
    param(
        [Parameter(Mandatory = $true)]
        [object[]] $Commands
    )

    $context = New-RunContext -Profile 'manual'
    Write-CommandsLogHeader -Context $context
    Write-EnvSnapshot -Context $context

    $results = New-Object System.Collections.Generic.List[object]
    $i = 1
    foreach ($command in @($Commands)) {
        $results.Add((Invoke-CommandSpec -Context $context -CommandSpec $command -Index $i -ManualOnly))
        $i++
    }

    $resultsArray = $results.ToArray()
    Write-Summary -Context $context -Results $resultsArray
    Write-JsonSummary -Context $context -Results $resultsArray
    Write-Host ('[manual] runDir={0} (listed {1} commands)' -f $context.RunDir, $results.Count)
    return [PSCustomObject]@{
        Context   = $context
        Results   = $resultsArray
        FailCount = 0
    }
}
