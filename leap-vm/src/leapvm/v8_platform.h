#pragma once

#include "v8_headers.h"
#include "leap_platform_metrics.h"
#include <atomic>
#include <cstddef>
#include <limits>
#include <memory>
#include <mutex>
#include <string>

namespace leapvm {

class LeapPlatform;
class VmInstance;

class V8Platform {
public:
    // 单例获取
    static V8Platform& Instance();

    // 只需要在进程里调用一次，通常在 main/addon 初始化时调用
    // exec_path 一般就是 argv[0]。
    void InitOnce(const char* exec_path = nullptr);

    bool IsInitialized() const { return initialized_.load(std::memory_order_acquire); }

    v8::Platform* platform() const;
    v8::Platform* backend_platform() const;

    void RegisterIsolate(v8::Isolate* isolate, VmInstance* owner);
    void PrepareIsolateForShutdown(v8::Isolate* isolate);
    void UnregisterIsolate(v8::Isolate* isolate);
    size_t DrainMessageLoop(
        v8::Isolate* isolate,
        v8::platform::MessageLoopBehavior behavior =
            v8::platform::MessageLoopBehavior::kDoNotWait,
        size_t max_iterations = std::numeric_limits<size_t>::max());
    LeapPlatformIsolateStatsSnapshot GetIsolateStats(v8::Isolate* isolate) const;

private:
    V8Platform() = default;
    ~V8Platform();

    V8Platform(const V8Platform&) = delete;
    V8Platform& operator=(const V8Platform&) = delete;

    std::unique_ptr<v8::Platform> backend_platform_;
    std::unique_ptr<LeapPlatform> platform_;
    std::atomic<bool> initialized_{false};
    mutable std::mutex mutex_;
};

}  // namespace leapvm
