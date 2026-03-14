#include "leap_delayed_task_scheduler.h"

#include <cmath>

namespace leapvm {

LeapDelayedTaskScheduler::LeapDelayedTaskScheduler(LeapPlatformMetrics* metrics)
    : metrics_(metrics),
      thread_([this] { ThreadMain(); }) {}

LeapDelayedTaskScheduler::~LeapDelayedTaskScheduler() {
    {
        std::lock_guard<std::mutex> lock(mutex_);
        stopping_ = true;
    }
    cv_.notify_all();
    if (thread_.joinable()) {
        thread_.join();
    }
}

LeapDelayedTaskScheduler::TaskId LeapDelayedTaskScheduler::Schedule(
    double delay_in_seconds,
    Callback callback) {
    if (!callback) {
        return 0;
    }

    const double safe_delay =
        std::isfinite(delay_in_seconds) && delay_in_seconds > 0.0 ? delay_in_seconds : 0.0;
    const auto due_time =
        std::chrono::steady_clock::now() +
        std::chrono::milliseconds(static_cast<int64_t>(safe_delay * 1000.0));
    TaskId task_id = 0;

    {
        std::lock_guard<std::mutex> lock(mutex_);
        if (stopping_) {
            return 0;
        }
        task_id = ++next_task_id_;
        scheduled_task_ids_.insert(task_id);
        tasks_.push(ScheduledTask{
            task_id,
            due_time,
            std::move(callback),
        });
    }

    if (metrics_) {
        metrics_->OnDelayedTaskScheduled();
    }
    cv_.notify_one();
    return task_id;
}

bool LeapDelayedTaskScheduler::Cancel(TaskId task_id) {
    if (task_id == 0) {
        return false;
    }

    std::lock_guard<std::mutex> lock(mutex_);
    if (stopping_) {
        return false;
    }
    if (scheduled_task_ids_.find(task_id) == scheduled_task_ids_.end()) {
        return false;
    }
    const auto [_, inserted] = canceled_task_ids_.insert(task_id);
    if (inserted && metrics_) {
        metrics_->OnDelayedTaskCanceled();
    }
    return inserted;
}

void LeapDelayedTaskScheduler::ThreadMain() {
    std::unique_lock<std::mutex> lock(mutex_);

    while (true) {
        if (stopping_ && tasks_.empty()) {
            break;
        }

        if (tasks_.empty()) {
            cv_.wait(lock, [this] { return stopping_ || !tasks_.empty(); });
            continue;
        }

        const auto next_due = tasks_.top().due_time;
        if (cv_.wait_until(lock, next_due, [this, next_due] {
                return stopping_ || tasks_.empty() || tasks_.top().due_time != next_due;
            })) {
            continue;
        }

        ScheduledTask task = tasks_.top();
        tasks_.pop();
        scheduled_task_ids_.erase(task.id);
        if (canceled_task_ids_.erase(task.id) > 0) {
            continue;
        }
        lock.unlock();

        if (metrics_) {
            metrics_->OnDelayedTaskDispatched();
        }
        task.callback();

        lock.lock();
    }
}

}  // namespace leapvm
