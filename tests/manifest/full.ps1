$commands = @(
    @{ Name = 'leapvm-api';                        FilePath = 'node'; Arguments = @('tests/scripts/leapvm/test_api.js') }
    @{ Name = 'leapvm-timers';                     FilePath = 'node'; Arguments = @('tests/scripts/leapvm/test_timers.js') }
    @{ Name = 'leapvm-globalthis';                 FilePath = 'node'; Arguments = @('tests/scripts/leapvm/test_globalthis.js') }
    @{ Name = 'leapenv-new-features';              FilePath = 'node'; Arguments = @('tests/scripts/integration/test-leapenv-new-features.js') }
    @{ Name = 'leapenv-hook-isolation';            FilePath = 'node'; Arguments = @('tests/scripts/integration/test-leapenv-hook-isolation.js') }
    @{ Name = 'leapenv-thread-pool-stability';     FilePath = 'node'; Arguments = @('tests/scripts/integration/test-leapenv-thread-pool-stability.js') }
    @{ Name = 'leapenv-dom-minimal';               FilePath = 'node'; Arguments = @('tests/scripts/integration/test-leapenv-dom-minimal.js') }
    @{ Name = 'leapenv-dom-m2-minimal';            FilePath = 'node'; Arguments = @('tests/scripts/integration/test-leapenv-dom-m2-minimal.js') }
    @{ Name = 'leapenv-dom-m3-minimal';            FilePath = 'node'; Arguments = @('tests/scripts/integration/test-leapenv-dom-m3-minimal.js') }
    @{ Name = 'leapenv-dom-handle-guard';          FilePath = 'node'; Arguments = @('tests/scripts/integration/test-leapenv-dom-handle-guard.js') }
    @{ Name = 'leapenv-dom-native-trace';          FilePath = 'node'; Arguments = @('tests/scripts/integration/test-leapenv-dom-native-trace.js') }
    @{ Name = 'leapenv-dom-native-ssot';           FilePath = 'node'; Arguments = @('tests/scripts/integration/test-leapenv-dom-native-ssot-consistency.js') }
    @{ Name = 'leapenv-dom-pool-isolation';        FilePath = 'node'; Arguments = @('tests/scripts/integration/test-leapenv-dom-pool-isolation.js') }
    @{ Name = 'leapenv-dom-memory-leak';           FilePath = 'node'; Arguments = @('tests/scripts/integration/test-leapenv-dom-memory-leak.js') }
    @{ Name = 'leapenv-dod-layout';                FilePath = 'node'; Arguments = @('tests/scripts/integration/test-leapenv-dod-layout.js') }
    @{ Name = 'leapenv-dod-integration';           FilePath = 'node'; Arguments = @('tests/scripts/integration/test-leapenv-dod-integration.js') }
    @{ Name = 'leapenv-dod-converter';             FilePath = 'node'; Arguments = @('tests/scripts/integration/test-leapenv-dod-converter.js') }
    @{ Name = 'leapenv-iframe';                    FilePath = 'node'; Arguments = @('tests/scripts/integration/test-leapenv-iframe.js') }
)

if ($Env:LEAP_ENABLE_UNSTABLE_THREADPOOL_DOD -eq '1') {
    $commands += @{
        Name = 'leapenv-threadpool-dod'
        FilePath = 'node'
        Arguments = @('tests/scripts/integration/test-leapenv-threadpool-dod.js')
    }
}

$commands
