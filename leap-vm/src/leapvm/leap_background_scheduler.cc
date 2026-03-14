#include "leap_background_scheduler.h"

#include <chrono>
#include <utility>

namespace leapvm {

namespace {

class MetricsWrappedTask final : public v8::Task {
public:
    MetricsWrappedTask(std::unique_ptr<v8::Task> inner_task,
                       LeapPlatformMetrics* metrics)
        : inner_task_(std::move(inner_task)),
          metrics_(metrics),
          enqueued_at_(std::chrono::steady_clock::now()) {}

    void Run() override {
        const auto now = std::chrono::steady_clock::now();
        const double wait_ms = std::chrono::duration<double, std::milli>(
                                   now - enqueued_at_)
                                   .count();
        if (metrics_) {
            metrics_->OnBackgroundTaskExecuted(wait_ms);
        }
        if (inner_task_) {
            inner_task_->Run();
        }
    }

private:
    std::unique_ptr<v8::Task> inner_task_;
    LeapPlatformMetrics* metrics_ = nullptr;
    std::chrono::steady_clock::time_point enqueued_at_;
};

}  // namespace

LeapBackgroundScheduler::LeapBackgroundScheduler(
    v8::Platform* backend_platform,
    LeapDelayedTaskScheduler* delayed_scheduler,
    LeapPlatformMetrics* metrics)
    : backend_platform_(backend_platform),
      delayed_scheduler_(delayed_scheduler),
      metrics_(metrics) {}

int LeapBackgroundScheduler::NumberOfWorkerThreads() const {
    return backend_platform_ ? backend_platform_->NumberOfWorkerThreads() : 0;
}

void LeapBackgroundScheduler::PostTask(v8::TaskPriority priority,
                                       std::unique_ptr<v8::Task> task,
                                       const v8::SourceLocation& location) {
    if (!backend_platform_ || !task) {
        return;
    }

    if (metrics_) {
        metrics_->OnBackgroundTaskPosted();
    }
    backend_platform_->PostTaskOnWorkerThread(
        priority,
        std::make_unique<MetricsWrappedTask>(std::move(task), metrics_),
        location);
}

void LeapBackgroundScheduler::PostDelayedTask(v8::TaskPriority priority,
                                              std::unique_ptr<v8::Task> task,
                                              double delay_in_seconds,
                                              const v8::SourceLocation& location) {
    if (!backend_platform_ || !task) {
        return;
    }

    if (!delayed_scheduler_) {
        PostTask(priority, std::move(task), location);
        return;
    }

    auto task_holder =
        std::make_shared<std::unique_ptr<v8::Task>>(std::move(task));
    delayed_scheduler_->Schedule(delay_in_seconds, [this, priority, location, task_holder]() {
        if (!task_holder || !(*task_holder)) {
            return;
        }
        PostTask(priority, std::move(*task_holder), location);
    });
}

std::unique_ptr<v8::JobHandle> LeapBackgroundScheduler::CreateJob(
    v8::TaskPriority priority,
    std::unique_ptr<v8::JobTask> job_task,
    const v8::SourceLocation& location) {
    if (!backend_platform_) {
        return nullptr;
    }
    return backend_platform_->CreateJob(priority, std::move(job_task), location);
}

}  // namespace leapvm
