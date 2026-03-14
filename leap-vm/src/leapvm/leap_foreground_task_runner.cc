#include "leap_foreground_task_runner.h"

#include "vm_instance.h"

#include <algorithm>
#include <chrono>
#include <utility>

namespace leapvm {

class LeapForegroundTaskRunner::ForegroundTaskEnvelope {
public:
    ForegroundTaskEnvelope(v8::Isolate* isolate,
                           LeapPlatformMetrics* metrics,
                           std::shared_ptr<std::atomic<bool>> active,
                           std::unique_ptr<v8::Task> task)
        : isolate_(isolate),
          metrics_(metrics),
          active_(std::move(active)),
          task_(std::move(task)),
          enqueued_at_(std::chrono::steady_clock::now()) {}

    void Run() {
        const double wait_ms = std::chrono::duration<double, std::milli>(
                                   std::chrono::steady_clock::now() - enqueued_at_)
                                   .count();
        if (metrics_) {
            metrics_->OnForegroundTaskExecuted(isolate_, wait_ms);
        }
        if (!active_ || !active_->load(std::memory_order_acquire) || !task_) {
            return;
        }
        task_->Run();
    }

    void Cancel() {
        if (metrics_) {
            metrics_->OnForegroundTaskCanceled(isolate_);
        }
    }

private:
    v8::Isolate* isolate_ = nullptr;
    LeapPlatformMetrics* metrics_ = nullptr;
    std::shared_ptr<std::atomic<bool>> active_;
    std::unique_ptr<v8::Task> task_;
    std::chrono::steady_clock::time_point enqueued_at_;
};

struct LeapForegroundTaskRunner::PendingDelayedTask {
    LeapDelayedTaskScheduler::TaskId task_id = 0;
};

LeapForegroundTaskRunner::LeapForegroundTaskRunner(
    v8::Isolate* isolate,
    VmInstance* owner,
    LeapDelayedTaskScheduler* delayed_scheduler,
    LeapPlatformMetrics* metrics)
    : isolate_(isolate),
      delayed_scheduler_(delayed_scheduler),
      metrics_(metrics),
      active_(std::make_shared<std::atomic<bool>>(true)),
      owner_(owner) {}

void LeapForegroundTaskRunner::BindOwner(VmInstance* owner) {
    std::lock_guard<std::mutex> lock(owner_mutex_);
    owner_ = owner;
    active_->store(owner != nullptr, std::memory_order_release);
}

void LeapForegroundTaskRunner::Deactivate() {
    active_->store(false, std::memory_order_release);
    {
        std::lock_guard<std::mutex> lock(owner_mutex_);
        owner_ = nullptr;
    }

    std::vector<std::shared_ptr<PendingDelayedTask>> delayed_tasks;
    {
        std::lock_guard<std::mutex> delayed_lock(delayed_tasks_mutex_);
        delayed_tasks.swap(delayed_tasks_);
    }

    if (!delayed_scheduler_) {
        return;
    }

    for (const auto& delayed_task : delayed_tasks) {
        if (!delayed_task || delayed_task->task_id == 0) {
            continue;
        }
        delayed_scheduler_->Cancel(delayed_task->task_id);
    }
}

void LeapForegroundTaskRunner::PostTaskImpl(std::unique_ptr<v8::Task> task,
                                            const v8::SourceLocation& location) {
    (void)location;
    if (!task) {
        return;
    }
    if (metrics_) {
        metrics_->OnForegroundTaskPosted(isolate_);
    }
    EnqueueTask(std::make_shared<ForegroundTaskEnvelope>(
        isolate_, metrics_, active_, std::move(task)));
}

void LeapForegroundTaskRunner::PostNonNestableTaskImpl(
    std::unique_ptr<v8::Task> task,
    const v8::SourceLocation& location) {
    PostTaskImpl(std::move(task), location);
}

void LeapForegroundTaskRunner::PostDelayedTaskImpl(
    std::unique_ptr<v8::Task> task,
    double delay_in_seconds,
    const v8::SourceLocation& location) {
    (void)location;
    if (!task) {
        return;
    }
    if (metrics_) {
        metrics_->OnForegroundTaskPosted(isolate_);
    }
    ScheduleDelayedTask(
        std::make_shared<ForegroundTaskEnvelope>(
            isolate_, metrics_, active_, std::move(task)),
        delay_in_seconds);
}

void LeapForegroundTaskRunner::PostNonNestableDelayedTaskImpl(
    std::unique_ptr<v8::Task> task,
    double delay_in_seconds,
    const v8::SourceLocation& location) {
    PostDelayedTaskImpl(std::move(task), delay_in_seconds, location);
}

void LeapForegroundTaskRunner::EnqueueTask(
    std::shared_ptr<ForegroundTaskEnvelope> task) {
    VmInstance* owner = nullptr;
    {
        std::lock_guard<std::mutex> lock(owner_mutex_);
        owner = owner_;
    }
    if (!owner || !task) {
        if (task) {
            task->Cancel();
        }
        return;
    }

    if (!owner->PostTask([task = std::move(task)](v8::Isolate* isolate,
                                                  v8::Local<v8::Context> context) {
            (void)isolate;
            (void)context;
            task->Run();
        })) {
        task->Cancel();
    }
}

void LeapForegroundTaskRunner::ScheduleDelayedTask(
    std::shared_ptr<ForegroundTaskEnvelope> task,
    double delay_in_seconds) {
    if (!task) {
        return;
    }
    if (!delayed_scheduler_) {
        EnqueueTask(std::move(task));
        return;
    }

    auto self = shared_from_this();
    auto delayed_task = std::make_shared<PendingDelayedTask>();
    const LeapDelayedTaskScheduler::TaskId task_id =
        delayed_scheduler_->Schedule(
            delay_in_seconds,
            [self, task = std::move(task), delayed_task]() mutable {
                self->ForgetDelayedTask(delayed_task);
                self->EnqueueTask(std::move(task));
            });
    if (task_id == 0) {
        task->Cancel();
        return;
    }
    delayed_task->task_id = task_id;

    {
        std::lock_guard<std::mutex> lock(delayed_tasks_mutex_);
        delayed_tasks_.push_back(std::move(delayed_task));
    }
}

void LeapForegroundTaskRunner::ForgetDelayedTask(
    const std::shared_ptr<PendingDelayedTask>& task) {
    if (!task) {
        return;
    }
    std::lock_guard<std::mutex> lock(delayed_tasks_mutex_);
    delayed_tasks_.erase(
        std::remove(delayed_tasks_.begin(), delayed_tasks_.end(), task),
        delayed_tasks_.end());
}

}  // namespace leapvm
