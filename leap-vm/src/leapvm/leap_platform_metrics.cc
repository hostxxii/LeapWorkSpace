#include "leap_platform_metrics.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace leapvm {

uint64_t LeapPlatformMetrics::ToNs(double ms) {
    if (!std::isfinite(ms) || ms <= 0) {
        return 0;
    }
    const double ns = ms * 1000000.0;
    if (ns >= static_cast<double>(std::numeric_limits<uint64_t>::max())) {
        return std::numeric_limits<uint64_t>::max();
    }
    return static_cast<uint64_t>(ns);
}

double LeapPlatformMetrics::ToMs(uint64_t ns) {
    return static_cast<double>(ns) / 1000000.0;
}

std::shared_ptr<LeapPlatformMetrics::IsolateStatsState>
LeapPlatformMetrics::GetOrCreateIsolateState(v8::Isolate* isolate) {
    if (!isolate) {
        return nullptr;
    }

    std::lock_guard<std::mutex> lock(mutex_);
    auto& slot = isolate_stats_[isolate];
    if (!slot) {
        slot = std::make_shared<IsolateStatsState>();
    }
    return slot;
}

std::shared_ptr<LeapPlatformMetrics::IsolateStatsState>
LeapPlatformMetrics::FindIsolateState(v8::Isolate* isolate) const {
    if (!isolate) {
        return nullptr;
    }

    std::lock_guard<std::mutex> lock(mutex_);
    auto it = isolate_stats_.find(isolate);
    if (it == isolate_stats_.end()) {
        return nullptr;
    }
    return it->second;
}

void LeapPlatformMetrics::RegisterIsolate(v8::Isolate* isolate) {
    (void)GetOrCreateIsolateState(isolate);
}

void LeapPlatformMetrics::UnregisterIsolate(v8::Isolate* isolate) {
    if (!isolate) {
        return;
    }

    std::lock_guard<std::mutex> lock(mutex_);
    isolate_stats_.erase(isolate);
}

void LeapPlatformMetrics::OnForegroundTaskPosted(v8::Isolate* isolate) {
    if (auto state = GetOrCreateIsolateState(isolate)) {
        state->pending_foreground_tasks.fetch_add(1, std::memory_order_relaxed);
    }
}

void LeapPlatformMetrics::OnForegroundTaskCanceled(v8::Isolate* isolate) {
    if (auto state = FindIsolateState(isolate)) {
        const size_t pending =
            state->pending_foreground_tasks.load(std::memory_order_relaxed);
        if (pending > 0) {
            state->pending_foreground_tasks.fetch_sub(1, std::memory_order_relaxed);
        }
    }
}

void LeapPlatformMetrics::OnForegroundTaskExecuted(v8::Isolate* isolate, double wait_ms) {
    if (auto state = FindIsolateState(isolate)) {
        const size_t pending =
            state->pending_foreground_tasks.load(std::memory_order_relaxed);
        if (pending > 0) {
            state->pending_foreground_tasks.fetch_sub(1, std::memory_order_relaxed);
        }
        state->foreground_wait_ns_total.fetch_add(ToNs(wait_ms), std::memory_order_relaxed);
        state->foreground_wait_samples.fetch_add(1, std::memory_order_relaxed);
    }
}

void LeapPlatformMetrics::OnBackgroundTaskPosted() {
    pending_background_tasks_.fetch_add(1, std::memory_order_relaxed);
}

void LeapPlatformMetrics::OnBackgroundTaskExecuted(double wait_ms) {
    const size_t pending = pending_background_tasks_.load(std::memory_order_relaxed);
    if (pending > 0) {
        pending_background_tasks_.fetch_sub(1, std::memory_order_relaxed);
    }
    background_wait_ns_total_.fetch_add(ToNs(wait_ms), std::memory_order_relaxed);
    background_wait_samples_.fetch_add(1, std::memory_order_relaxed);
}

void LeapPlatformMetrics::OnDelayedTaskScheduled() {
    delayed_task_count_.fetch_add(1, std::memory_order_relaxed);
}

void LeapPlatformMetrics::OnDelayedTaskCanceled() {
    const size_t pending = delayed_task_count_.load(std::memory_order_relaxed);
    if (pending > 0) {
        delayed_task_count_.fetch_sub(1, std::memory_order_relaxed);
    }
}

void LeapPlatformMetrics::OnDelayedTaskDispatched() {
    const size_t pending = delayed_task_count_.load(std::memory_order_relaxed);
    if (pending > 0) {
        delayed_task_count_.fetch_sub(1, std::memory_order_relaxed);
    }
}

void LeapPlatformMetrics::OnPump(v8::Isolate* isolate,
                                 size_t iterations,
                                 double drain_ms) {
    if (auto state = FindIsolateState(isolate)) {
        state->pump_count.fetch_add(1, std::memory_order_relaxed);
        state->pump_iterations.fetch_add(
            static_cast<uint64_t>(iterations), std::memory_order_relaxed);
        state->last_drain_ns.store(ToNs(drain_ms), std::memory_order_relaxed);
    }
}

double LeapPlatformMetrics::ComputeOverloadScore(
    const LeapPlatformIsolateStatsSnapshot& snapshot) {
    const double queue_pressure =
        static_cast<double>(snapshot.pending_foreground_tasks) * 1.5 +
        static_cast<double>(snapshot.pending_background_tasks) * 1.0 +
        static_cast<double>(snapshot.delayed_task_count) * 0.5;
    const double wait_pressure =
        std::min(snapshot.average_foreground_wait_ms / 4.0, 25.0) +
        std::min(snapshot.average_background_wait_ms / 6.0, 20.0) +
        std::min(snapshot.last_drain_ms / 3.0, 20.0);
    return queue_pressure + wait_pressure;
}

LeapPlatformIsolateStatsSnapshot LeapPlatformMetrics::GetIsolateSnapshot(
    v8::Isolate* isolate) const {
    LeapPlatformIsolateStatsSnapshot snapshot;
    snapshot.pending_background_tasks =
        pending_background_tasks_.load(std::memory_order_relaxed);
    snapshot.delayed_task_count = delayed_task_count_.load(std::memory_order_relaxed);

    const uint64_t bg_samples =
        background_wait_samples_.load(std::memory_order_relaxed);
    const uint64_t bg_total =
        background_wait_ns_total_.load(std::memory_order_relaxed);
    snapshot.average_background_wait_ms =
        bg_samples > 0 ? ToMs(bg_total) / static_cast<double>(bg_samples) : 0.0;

    if (auto state = FindIsolateState(isolate)) {
        snapshot.pending_foreground_tasks =
            state->pending_foreground_tasks.load(std::memory_order_relaxed);
        snapshot.pump_count = state->pump_count.load(std::memory_order_relaxed);
        snapshot.pump_iterations =
            state->pump_iterations.load(std::memory_order_relaxed);
        snapshot.last_drain_ms =
            ToMs(state->last_drain_ns.load(std::memory_order_relaxed));

        const uint64_t fg_samples =
            state->foreground_wait_samples.load(std::memory_order_relaxed);
        const uint64_t fg_total =
            state->foreground_wait_ns_total.load(std::memory_order_relaxed);
        snapshot.average_foreground_wait_ms =
            fg_samples > 0 ? ToMs(fg_total) / static_cast<double>(fg_samples) : 0.0;
    }

    snapshot.overload_score = ComputeOverloadScore(snapshot);
    return snapshot;
}

}  // namespace leapvm
