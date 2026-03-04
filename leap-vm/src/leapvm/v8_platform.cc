#include "v8_platform.h"

namespace leapvm {

V8Platform& V8Platform::Instance() {
    static V8Platform instance;
    return instance;
}

void V8Platform::InitOnce(const char* exec_path) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (initialized_.load(std::memory_order_acquire)) return;

    //  【核心原理】静态链接的双 V8 共存
    //
    // Node.exe 有它自己的 V8（动态链接在 node.exe 内部）
    // leapvm.node 有我们的 V8（静态链接 v8_monolith.lib）
    //
    // 关键：因为是静态链接，我们的 V8 全局变量（如 v8::V8::platform_）
    // 存储在 leapvm.node 的数据段，与 Node.exe 的完全隔离！
    //
    // 所以我们 **必须** 初始化我们自己的 V8 Platform，
    // 这不会影响 Node.exe 的 V8，因为它们是两个独立的实例。

    // 1. ICU / Intl API 状态
    //  v8_monolith.lib 使用 v8_enable_i18n_support=true 编译，ICU 符号已通过
    //  U_ICU_VERSION_SUFFIX(_leapvm) rename，与 Node.js 自带 ICU 完全隔离。
#ifdef V8_ENABLE_I18N_SUPPORT
    v8::V8::InitializeICU();
#endif

    // 2. 创建我们自己的 Platform
    // 关键修复：使用 NewDefaultPlatform 而不是 NewSingleThreadedDefaultPlatform
    // Inspector 的 evaluateOnCallFrame 需要多线程平台来处理异步任务
    // 参数0表示让V8自动选择线程数
    platform_ = v8::platform::NewDefaultPlatform(
        0,  // thread_pool_size = 0 表示使用默认值（通常是 CPU 核心数）
        v8::platform::IdleTaskSupport::kDisabled,
        v8::platform::InProcessStackDumping::kDisabled
    );
    v8::V8::InitializePlatform(platform_.get());

    // 3. 初始化我们的 V8 引擎
    // 这只会初始化 v8_monolith.lib 的全局状态
    v8::V8::Initialize();

    initialized_.store(true, std::memory_order_release);
}

V8Platform::~V8Platform() {
    // Intentionally skip V8 global teardown at process shutdown.
    // Static destruction order between addon globals can trigger use-after-free
    // when Inspector/worker resources are still unwinding.
}

}  // namespace leapvm
