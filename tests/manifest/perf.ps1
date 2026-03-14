@(
    @{ Name = 'gate-thread-mainline';              FilePath = 'node'; Arguments = @('tests/scripts/perf/check-thread-mainline-gate.js') }
    @{ Name = 'bench-thread-vs-process';           FilePath = 'node'; Arguments = @('tests/scripts/perf/bench-thread-vs-process.js') }
    @{ Name = 'bench-process-pool';                FilePath = 'node'; Arguments = @('tests/scripts/perf/bench-process-pool.js') }
    @{ Name = 'bench-dom-multi-scale';             FilePath = 'node'; Arguments = @('tests/scripts/perf/bench-dom-multi-scale.js') }
    @{ Name = 'bench-dom-final-shape-baseline';    FilePath = 'node'; Arguments = @('tests/scripts/perf/bench-dom-final-shape-baseline.js') }
)
