#pragma once

#include "v8_headers.h"

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>
#include <unordered_map>

namespace leapvm {

struct LeapPlatformIsolateStatsSnapshot {
    size_t pending_foreground_tasks = 0;
    size_t pending_background_tasks = 0;
    size_t delayed_task_count = 0;
    uint64_t pump_count = 0;
    uint64_t pump_iterations = 0;
    double average_foreground_wait_ms = 0.0;
    double average_background_wait_ms = 0.0;
    double last_drain_ms = 0.0;
    double overload_score = 0.0;
};

class LeapPlatformMetrics {
public:
    LeapPlatformMetrics() = default;

    void RegisterIsolate(v8::Isolate* isolate);
    void UnregisterIsolate(v8::Isolate* isolate);

    void OnForegroundTaskPosted(v8::Isolate* isolate);
    void OnForegroundTaskCanceled(v8::Isolate* isolate);
    void OnForegroundTaskExecuted(v8::Isolate* isolate, double wait_ms);
    void OnBackgroundTaskPosted();
    void OnBackgroundTaskExecuted(double wait_ms);
    void OnDelayedTaskScheduled();
    void OnDelayedTaskCanceled();
    void OnDelayedTaskDispatched();
    void OnPump(v8::Isolate* isolate, size_t iterations, double drain_ms);

    LeapPlatformIsolateStatsSnapshot GetIsolateSnapshot(v8::Isolate* isolate) const;

private:
    struct IsolateStatsState {
        std::atomic<size_t> pending_foreground_tasks{0};
        std::atomic<uint64_t> pump_count{0};
        std::atomic<uint64_t> pump_iterations{0};
        std::atomic<uint64_t> foreground_wait_ns_total{0};
        std::atomic<uint64_t> foreground_wait_samples{0};
        std::atomic<uint64_t> last_drain_ns{0};
    };

    std::shared_ptr<IsolateStatsState> GetOrCreateIsolateState(v8::Isolate* isolate);
    std::shared_ptr<IsolateStatsState> FindIsolateState(v8::Isolate* isolate) const;

    static uint64_t ToNs(double ms);
    static double ToMs(uint64_t ns);
    static double ComputeOverloadScore(const LeapPlatformIsolateStatsSnapshot& snapshot);

    mutable std::mutex mutex_;
    std::unordered_map<v8::Isolate*, std::shared_ptr<IsolateStatsState>> isolate_stats_;

    std::atomic<size_t> pending_background_tasks_{0};
    std::atomic<size_t> delayed_task_count_{0};
    std::atomic<uint64_t> background_wait_ns_total_{0};
    std::atomic<uint64_t> background_wait_samples_{0};
};

}  // namespace leapvm
