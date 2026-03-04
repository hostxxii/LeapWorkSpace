#pragma once

#include "v8_headers.h"
#include <atomic>
#include <memory>
#include <mutex>
#include <string>

namespace leapvm {

class V8Platform {
public:
    // 单例获取
    static V8Platform& Instance();

    // 只需要在进程里调用一次，通常在 main/addon 初始化时调用
    // exec_path 一般就是 argv[0]。
    void InitOnce(const char* exec_path = nullptr);

    bool IsInitialized() const { return initialized_.load(std::memory_order_acquire); }

    v8::Platform* platform() const { return platform_.get(); }

private:
    V8Platform() = default;
    ~V8Platform();

    V8Platform(const V8Platform&) = delete;
    V8Platform& operator=(const V8Platform&) = delete;

    std::unique_ptr<v8::Platform> platform_;
    std::atomic<bool> initialized_{false};
    std::mutex mutex_;
};

}  // namespace leapvm
