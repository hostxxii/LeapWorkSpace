#pragma once

#include "leap_platform_metrics.h"

#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <queue>
#include <thread>
#include <unordered_set>
#include <vector>

namespace leapvm {

class LeapDelayedTaskScheduler {
public:
    using Callback = std::function<void()>;
    using TaskId = uint64_t;

    explicit LeapDelayedTaskScheduler(LeapPlatformMetrics* metrics);
    ~LeapDelayedTaskScheduler();

    TaskId Schedule(double delay_in_seconds, Callback callback);
    bool Cancel(TaskId task_id);

private:
    struct ScheduledTask {
        uint64_t id = 0;
        std::chrono::steady_clock::time_point due_time;
        Callback callback;
    };

    struct ScheduledTaskCompare {
        bool operator()(const ScheduledTask& lhs, const ScheduledTask& rhs) const {
            if (lhs.due_time != rhs.due_time) {
                return lhs.due_time > rhs.due_time;
            }
            return lhs.id > rhs.id;
        }
    };

    void ThreadMain();

    LeapPlatformMetrics* metrics_ = nullptr;
    std::mutex mutex_;
    std::condition_variable cv_;
    std::priority_queue<
        ScheduledTask,
        std::vector<ScheduledTask>,
        ScheduledTaskCompare>
        tasks_;
    std::thread thread_;
    bool stopping_ = false;
    uint64_t next_task_id_ = 0;
    std::unordered_set<TaskId> scheduled_task_ids_;
    std::unordered_set<TaskId> canceled_task_ids_;
};

}  // namespace leapvm
