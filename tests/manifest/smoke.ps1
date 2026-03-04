@(
    @{ Name = 'leapvm-api';            FilePath = 'node'; Arguments = @('tests/scripts/leapvm/test_api.js') }
    @{ Name = 'leapvm-timers';         FilePath = 'node'; Arguments = @('tests/scripts/leapvm/test_timers.js') }
    @{ Name = 'leapvm-globalthis';     FilePath = 'node'; Arguments = @('tests/scripts/leapvm/test_globalthis.js') }
    @{ Name = 'leapenv-new-features';  FilePath = 'node'; Arguments = @('tests/scripts/integration/test-leapenv-new-features.js') }
    @{ Name = 'leapenv-hook-isolation';FilePath = 'node'; Arguments = @('tests/scripts/integration/test-leapenv-hook-isolation.js') }
)
