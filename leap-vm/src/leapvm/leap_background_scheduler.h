#pragma once

#include "leap_delayed_task_scheduler.h"
#include "v8_headers.h"

#include <memory>

namespace leapvm {

class LeapBackgroundScheduler {
public:
    LeapBackgroundScheduler(v8::Platform* backend_platform,
                            LeapDelayedTaskScheduler* delayed_scheduler,
                            LeapPlatformMetrics* metrics);

    int NumberOfWorkerThreads() const;

    void PostTask(v8::TaskPriority priority,
                  std::unique_ptr<v8::Task> task,
                  const v8::SourceLocation& location);

    void PostDelayedTask(v8::TaskPriority priority,
                         std::unique_ptr<v8::Task> task,
                         double delay_in_seconds,
                         const v8::SourceLocation& location);

    std::unique_ptr<v8::JobHandle> CreateJob(
        v8::TaskPriority priority,
        std::unique_ptr<v8::JobTask> job_task,
        const v8::SourceLocation& location);

private:
    v8::Platform* backend_platform_ = nullptr;
    LeapDelayedTaskScheduler* delayed_scheduler_ = nullptr;
    LeapPlatformMetrics* metrics_ = nullptr;
};

}  // namespace leapvm
