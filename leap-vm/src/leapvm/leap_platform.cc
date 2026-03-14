#include "leap_platform.h"

#include "vm_instance.h"

namespace leapvm {

LeapPlatform::LeapPlatform(v8::Platform* backend_platform)
    : backend_platform_(backend_platform),
      delayed_scheduler_(&metrics_),
      background_scheduler_(backend_platform, &delayed_scheduler_, &metrics_) {}

void LeapPlatform::RegisterIsolate(v8::Isolate* isolate, VmInstance* owner) {
    if (!isolate) {
        return;
    }

    metrics_.RegisterIsolate(isolate);
    std::lock_guard<std::mutex> lock(mutex_);
    shutdown_isolates_.erase(isolate);
    auto& runner = foreground_runners_[isolate];
    if (!runner) {
        runner = std::make_shared<LeapForegroundTaskRunner>(
            isolate, owner, &delayed_scheduler_, &metrics_);
        return;
    }
    runner->BindOwner(owner);
}

void LeapPlatform::PrepareIsolateForShutdown(v8::Isolate* isolate) {
    if (!isolate) {
        return;
    }

    std::shared_ptr<LeapForegroundTaskRunner> runner;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        shutdown_isolates_.insert(isolate);
        auto it = foreground_runners_.find(isolate);
        if (it != foreground_runners_.end()) {
            runner = it->second;
        }
    }

    if (runner) {
        runner->Deactivate();
    }
}

void LeapPlatform::UnregisterIsolate(v8::Isolate* isolate) {
    if (!isolate) {
        return;
    }

    std::shared_ptr<LeapForegroundTaskRunner> runner;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = foreground_runners_.find(isolate);
        if (it != foreground_runners_.end()) {
            runner = it->second;
            foreground_runners_.erase(it);
        }
        // 必须同步清理 shutdown_isolates_，否则当新 isolate 被 malloc 分配到
        // 相同地址时，GetForegroundTaskRunner() 会命中 shutdown 检查返回 null，
        // 导致 V8 在 Isolate::Initialize() 中解引用 null 触发 SIGSEGV。
        shutdown_isolates_.erase(isolate);
    }

    if (runner) {
        runner->Deactivate();
    }
    metrics_.UnregisterIsolate(isolate);
}

void LeapPlatform::RecordPump(v8::Isolate* isolate,
                              size_t iterations,
                              double drain_ms) {
    metrics_.OnPump(isolate, iterations, drain_ms);
}

LeapPlatformIsolateStatsSnapshot LeapPlatform::GetIsolateStats(
    v8::Isolate* isolate) const {
    return metrics_.GetIsolateSnapshot(isolate);
}

v8::PageAllocator* LeapPlatform::GetPageAllocator() {
    return backend_platform_ ? backend_platform_->GetPageAllocator() : nullptr;
}

v8::ThreadIsolatedAllocator* LeapPlatform::GetThreadIsolatedAllocator() {
    return backend_platform_ ? backend_platform_->GetThreadIsolatedAllocator() : nullptr;
}

void LeapPlatform::OnCriticalMemoryPressure() {
    if (backend_platform_) {
        backend_platform_->OnCriticalMemoryPressure();
    }
}

int LeapPlatform::NumberOfWorkerThreads() {
    return background_scheduler_.NumberOfWorkerThreads();
}

std::shared_ptr<v8::TaskRunner> LeapPlatform::GetForegroundTaskRunner(
    v8::Isolate* isolate,
    v8::TaskPriority priority) {
    (void)priority;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = foreground_runners_.find(isolate);
        if (it != foreground_runners_.end()) {
            return it->second;
        }
        if (shutdown_isolates_.find(isolate) != shutdown_isolates_.end()) {
            return std::shared_ptr<v8::TaskRunner>();
        }
    }
    return backend_platform_
        ? backend_platform_->GetForegroundTaskRunner(isolate, priority)
        : std::shared_ptr<v8::TaskRunner>();
}

bool LeapPlatform::IdleTasksEnabled(v8::Isolate* isolate) {
    return backend_platform_ ? backend_platform_->IdleTasksEnabled(isolate) : false;
}

std::unique_ptr<v8::JobHandle> LeapPlatform::CreateJobImpl(
    v8::TaskPriority priority,
    std::unique_ptr<v8::JobTask> job_task,
    const v8::SourceLocation& location) {
    return background_scheduler_.CreateJob(priority, std::move(job_task), location);
}

std::unique_ptr<v8::ScopedBlockingCall> LeapPlatform::CreateBlockingScope(
    v8::BlockingType blocking_type) {
    return backend_platform_
        ? backend_platform_->CreateBlockingScope(blocking_type)
        : nullptr;
}

double LeapPlatform::MonotonicallyIncreasingTime() {
    return backend_platform_ ? backend_platform_->MonotonicallyIncreasingTime() : 0.0;
}

double LeapPlatform::CurrentClockTimeMillis() {
    return backend_platform_ ? backend_platform_->CurrentClockTimeMillis()
                             : v8::Platform::SystemClockTimeMillis();
}

double LeapPlatform::CurrentClockTimeMillisecondsHighResolution() {
    return backend_platform_
        ? backend_platform_->CurrentClockTimeMillisecondsHighResolution()
        : CurrentClockTimeMillis();
}

v8::Platform::StackTracePrinter LeapPlatform::GetStackTracePrinter() {
    return backend_platform_ ? backend_platform_->GetStackTracePrinter() : nullptr;
}

v8::TracingController* LeapPlatform::GetTracingController() {
    return backend_platform_ ? backend_platform_->GetTracingController() : nullptr;
}

void LeapPlatform::DumpWithoutCrashing() {
    if (backend_platform_) {
        backend_platform_->DumpWithoutCrashing();
    }
}

v8::HighAllocationThroughputObserver*
LeapPlatform::GetHighAllocationThroughputObserver() {
    static v8::HighAllocationThroughputObserver default_observer;
    return backend_platform_
        ? backend_platform_->GetHighAllocationThroughputObserver()
        : &default_observer;
}

void LeapPlatform::PostTaskOnWorkerThreadImpl(
    v8::TaskPriority priority,
    std::unique_ptr<v8::Task> task,
    const v8::SourceLocation& location) {
    background_scheduler_.PostTask(priority, std::move(task), location);
}

void LeapPlatform::PostDelayedTaskOnWorkerThreadImpl(
    v8::TaskPriority priority,
    std::unique_ptr<v8::Task> task,
    double delay_in_seconds,
    const v8::SourceLocation& location) {
    background_scheduler_.PostDelayedTask(
        priority, std::move(task), delay_in_seconds, location);
}

}  // namespace leapvm
