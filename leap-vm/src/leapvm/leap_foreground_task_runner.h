#pragma once

#include "leap_delayed_task_scheduler.h"
#include "v8_headers.h"

#include <atomic>
#include <memory>
#include <mutex>
#include <vector>

namespace leapvm {

class VmInstance;

class LeapForegroundTaskRunner final
    : public v8::TaskRunner,
      public std::enable_shared_from_this<LeapForegroundTaskRunner> {
public:
    LeapForegroundTaskRunner(v8::Isolate* isolate,
                             VmInstance* owner,
                             LeapDelayedTaskScheduler* delayed_scheduler,
                             LeapPlatformMetrics* metrics);

    bool IdleTasksEnabled() override { return false; }
    bool NonNestableTasksEnabled() const override { return true; }
    bool NonNestableDelayedTasksEnabled() const override { return true; }

    void BindOwner(VmInstance* owner);
    void Deactivate();

protected:
    void PostTaskImpl(std::unique_ptr<v8::Task> task,
                      const v8::SourceLocation& location) override;
    void PostNonNestableTaskImpl(std::unique_ptr<v8::Task> task,
                                 const v8::SourceLocation& location) override;
    void PostDelayedTaskImpl(std::unique_ptr<v8::Task> task,
                             double delay_in_seconds,
                             const v8::SourceLocation& location) override;
    void PostNonNestableDelayedTaskImpl(
        std::unique_ptr<v8::Task> task,
        double delay_in_seconds,
        const v8::SourceLocation& location) override;

private:
    class ForegroundTaskEnvelope;
    struct PendingDelayedTask;

    void EnqueueTask(std::shared_ptr<ForegroundTaskEnvelope> task);
    void ScheduleDelayedTask(std::shared_ptr<ForegroundTaskEnvelope> task,
                             double delay_in_seconds);
    void ForgetDelayedTask(const std::shared_ptr<PendingDelayedTask>& task);

    v8::Isolate* isolate_ = nullptr;
    LeapDelayedTaskScheduler* delayed_scheduler_ = nullptr;
    LeapPlatformMetrics* metrics_ = nullptr;
    std::shared_ptr<std::atomic<bool>> active_;
    mutable std::mutex owner_mutex_;
    VmInstance* owner_ = nullptr;
    mutable std::mutex delayed_tasks_mutex_;
    std::vector<std::shared_ptr<PendingDelayedTask>> delayed_tasks_;
};

}  // namespace leapvm
