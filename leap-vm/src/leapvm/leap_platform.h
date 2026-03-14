#pragma once

#include "leap_background_scheduler.h"
#include "leap_foreground_task_runner.h"
#include "leap_platform_metrics.h"
#include "v8_headers.h"

#include <memory>
#include <mutex>
#include <unordered_map>
#include <unordered_set>

namespace leapvm {

class VmInstance;

class LeapPlatform final : public v8::Platform {
public:
    explicit LeapPlatform(v8::Platform* backend_platform);
    ~LeapPlatform() override = default;

    void RegisterIsolate(v8::Isolate* isolate, VmInstance* owner);
    void PrepareIsolateForShutdown(v8::Isolate* isolate);
    void UnregisterIsolate(v8::Isolate* isolate);
    void RecordPump(v8::Isolate* isolate, size_t iterations, double drain_ms);

    LeapPlatformIsolateStatsSnapshot GetIsolateStats(v8::Isolate* isolate) const;

    v8::PageAllocator* GetPageAllocator() override;
    v8::ThreadIsolatedAllocator* GetThreadIsolatedAllocator() override;
    void OnCriticalMemoryPressure() override;
    int NumberOfWorkerThreads() override;
    std::shared_ptr<v8::TaskRunner> GetForegroundTaskRunner(
        v8::Isolate* isolate,
        v8::TaskPriority priority) override;
    bool IdleTasksEnabled(v8::Isolate* isolate) override;
    std::unique_ptr<v8::JobHandle> CreateJobImpl(
        v8::TaskPriority priority,
        std::unique_ptr<v8::JobTask> job_task,
        const v8::SourceLocation& location) override;
    std::unique_ptr<v8::ScopedBlockingCall> CreateBlockingScope(
        v8::BlockingType blocking_type) override;
    double MonotonicallyIncreasingTime() override;
    double CurrentClockTimeMillis() override;
    double CurrentClockTimeMillisecondsHighResolution() override;
    v8::Platform::StackTracePrinter GetStackTracePrinter() override;
    v8::TracingController* GetTracingController() override;
    void DumpWithoutCrashing() override;
    v8::HighAllocationThroughputObserver* GetHighAllocationThroughputObserver() override;

protected:
    void PostTaskOnWorkerThreadImpl(v8::TaskPriority priority,
                                    std::unique_ptr<v8::Task> task,
                                    const v8::SourceLocation& location) override;
    void PostDelayedTaskOnWorkerThreadImpl(v8::TaskPriority priority,
                                           std::unique_ptr<v8::Task> task,
                                           double delay_in_seconds,
                                           const v8::SourceLocation& location) override;

private:
    v8::Platform* backend_platform_ = nullptr;
    LeapPlatformMetrics metrics_;
    LeapDelayedTaskScheduler delayed_scheduler_;
    LeapBackgroundScheduler background_scheduler_;

    mutable std::mutex mutex_;
    std::unordered_set<v8::Isolate*> shutdown_isolates_;
    std::unordered_map<v8::Isolate*, std::shared_ptr<LeapForegroundTaskRunner>>
        foreground_runners_;
};

}  // namespace leapvm
