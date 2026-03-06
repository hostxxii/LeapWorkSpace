#pragma once

#include "v8_headers.h"
#include <chrono>
#include <condition_variable>
#include <functional>
#include <future>
#include <memory>
#include <mutex>
#include <queue>
#include <string>
#include <thread>
#include <tuple>
#include <unordered_map>
#include <vector>
#include "hook_filter.h"
#include "monitor.h"
#include "dom_core.h"
#include "builtin_wrapper.h"

namespace leapvm {
namespace skeleton {
class SkeletonRegistry;
}  // namespace skeleton

class LeapInspectorClient;

// Temporary per-thread guard used when inspector/console serialization probes
// object properties. Hook pipelines must skip logging while this is true.
extern thread_local bool g_suppress_hook_logging;
// Per-thread hook nesting depth. Top-level user hook is depth=1.
// Nested hooks triggered by internal operations should usually be suppressed.
extern thread_local int g_hook_log_depth;

// Hook 记录辅助工具（供 NativeWrapper / skeleton bridge 共享）
std::string GetValueType(v8::Local<v8::Value> v);
std::string GetValuePreview(v8::Isolate* isolate,
                            v8::Local<v8::Context> context,
                            v8::Local<v8::Value> value);
std::string GetFunctionParams(v8::Isolate* isolate,
                              v8::Local<v8::Context> context,
                              v8::Local<v8::Function> func);
v8::Local<v8::Function> WrapFunctionWithCallHook(
    v8::Isolate* isolate,
    v8::Local<v8::Context> context,
    const std::string& root,
    const std::string& path,
    v8::Local<v8::Function> original_func);

// Timer task structure
struct TimerTask {
    enum class Kind {
        kFunction,
        kStringCode,
    };

    uint64_t id = 0;
    std::chrono::steady_clock::time_point due_time;

    bool is_interval = false;
    std::chrono::milliseconds interval{0};

    int nesting_level = 0;        // setTimeout nesting level
    bool canceled = false;        // clearTimeout / clearInterval flag
    v8::Global<v8::Context> owner_ctx;  // context in which timer was created

    Kind kind = Kind::kFunction;

    // Callback: function or string code
    v8::Global<v8::Function> callback;
    std::string code;

    // Only used when kind == kFunction && setTimeout/setInterval(fn, delay, ...args)
    std::vector<v8::Global<v8::Value>> args;
};

// Comparator for priority queue (earlier due_time = higher priority; FIFO by id on tie)
struct TimerTaskCompare {
    bool operator()(const std::shared_ptr<TimerTask>& a,
                    const std::shared_ptr<TimerTask>& b) const {
        if (a->due_time != b->due_time) return a->due_time > b->due_time;
        return a->id > b->id;  // Same due_time: smaller id = registered first = higher priority
    }
};

struct VmRuntimeStats {
    struct HeapObjectTypeStat {
        std::string type;
        std::string sub_type;
        size_t count = 0;
        size_t size = 0;
    };

    size_t pending_task_count = 0;
    size_t timer_count = 0;
    size_t timer_queue_size = 0;
    size_t stale_timer_queue_count = 0;
    size_t dom_wrapper_cache_size = 0;
    size_t pending_dom_wrapper_cleanup_count = 0;
    size_t child_frame_count = 0;
    size_t child_frame_dispatch_fn_count = 0;
    size_t main_dispatch_fn_cached = 0;
    size_t dom_document_count = 0;
    size_t dom_task_scope_count = 0;
    size_t dom_handle_count = 0;
    size_t skeleton_count = 0;
    size_t skeleton_template_count = 0;
    size_t skeleton_dispatch_meta_count = 0;
    size_t skeleton_brand_compat_cache_size = 0;
    size_t v8_total_heap_size = 0;
    size_t v8_total_heap_size_executable = 0;
    size_t v8_total_physical_size = 0;
    size_t v8_total_available_size = 0;
    size_t v8_used_heap_size = 0;
    size_t v8_heap_size_limit = 0;
    size_t v8_malloced_memory = 0;
    size_t v8_peak_malloced_memory = 0;
    size_t v8_external_memory = 0;
    size_t v8_total_global_handles_size = 0;
    size_t v8_used_global_handles_size = 0;
    size_t v8_number_of_native_contexts = 0;
    size_t v8_number_of_detached_contexts = 0;
    size_t v8_code_and_metadata_size = 0;
    size_t v8_bytecode_and_metadata_size = 0;
    size_t v8_external_script_source_size = 0;
    size_t v8_cpu_profiler_metadata_size = 0;
    size_t v8_old_space_used_size = 0;
    size_t v8_old_space_physical_size = 0;
    size_t v8_new_space_used_size = 0;
    size_t v8_new_space_physical_size = 0;
    size_t v8_code_space_used_size = 0;
    size_t v8_code_space_physical_size = 0;
    size_t v8_map_space_used_size = 0;
    size_t v8_map_space_physical_size = 0;
    size_t v8_large_object_space_used_size = 0;
    size_t v8_large_object_space_physical_size = 0;
    size_t v8_tracked_heap_object_type_count = 0;
    size_t v8_heap_object_stats_available = 0;
    std::vector<HeapObjectTypeStat> v8_top_heap_object_types;
};

// Independent VM instance (one isolate/context per instance)
class VmInstance {
public:
    VmInstance();
    ~VmInstance();

    // --- Lifecycle / Thread ---
    v8::Isolate* isolate() const { return isolate_; }
    v8::Local<v8::Context> GetContext() const;
    using Task = std::function<void(v8::Isolate*, v8::Local<v8::Context>)>;
    void PostTask(Task task);
    bool WaitForAndProcessOneTask(std::chrono::milliseconds timeout);

    // --- Script execution ---
    bool RunScript(const std::string& source_utf8,
                   std::string& result_out,
                   std::string* error_out = nullptr,
                   const std::string& resource_name = "");

    // Code Cache: compile script and produce V8 code cache bytes.
    // Returns true on success; cache_out receives the raw cache data.
    bool CreateCodeCache(const std::string& source_utf8,
                         std::vector<uint8_t>& cache_out,
                         std::string* error_out = nullptr,
                         const std::string& resource_name = "");

    // Code Cache: run script consuming a previously generated code cache.
    // Falls back to normal compilation if the cache is rejected.
    bool RunScriptWithCache(const std::string& source_utf8,
                            const uint8_t* cache_data,
                            size_t cache_length,
                            std::string& result_out,
                            bool* cache_rejected_out = nullptr,
                            std::string* error_out = nullptr,
                            const std::string& resource_name = "");

    void RunLoopOnce(std::chrono::milliseconds max_duration);
    VmRuntimeStats GetRuntimeStats(bool force_gc = false);

    // --- Skeleton / Env integration ---
    v8::Local<v8::Object> InternalWrapObject(
        v8::Isolate* isolate,
        v8::Local<v8::Context> context,
        v8::Local<v8::Object> backing_object,
        const std::string& label,
        const std::string& brand);
    skeleton::SkeletonRegistry* skeleton_registry() { return skeleton_registry_.get(); }

    // --- Monitor / Hooks ---
    MonitorConfig& monitor_config();
    HookRegistry& hook_registry();
    MonitorEngine& monitor_engine();
    void SetHookLogEnabled(bool enabled);
    void SetMonitorEnabled(bool enabled);

    // --- C++ Builtin Wrapper subsystem ---
    BuiltinWrapperManager& builtin_wrapper_manager() { return builtin_wrapper_manager_; }
    void InstallBuiltinWrappers(BuiltinWrapperConfig config);

    void SetPropertyBlacklist(const std::vector<std::string>& objects,
                              const std::vector<std::string>& properties,
                              const std::vector<std::string>& prefixes);
    void SetPropertyWhitelist(const std::vector<std::string>& objects,
                              const std::vector<std::string>& properties,
                              const std::vector<std::string>& prefixes);
    void ApplyPendingHookConfig();
    GlobalHookConfig& hook_config() { return hook_config_; }
    const GlobalHookConfig& hook_config() const { return hook_config_; }
    LogDetailConfig& log_detail_config() { return hook_config_.log_detail; }
    const LogDetailConfig& log_detail_config() const { return hook_config_.log_detail; }
    dom::DomManager& dom_manager() { return dom_manager_; }
    const dom::DomManager& dom_manager() const { return dom_manager_; }

    // --- Child frame (iframe) support ---

    // Per-context dispatch function cache (replaces single dispatch_fn_).
    // Called by dispatch_bridge after a successful bundle execution.
    void CacheDispatchFn(v8::Isolate* isolate, v8::Local<v8::Function> fn);
    // Returns the dispatch function for the given context, or tries the
    // global lookup cache.  Returns empty handle if not yet populated.
    v8::Local<v8::Function> GetCachedDispatchFn(v8::Isolate* isolate) const;
    // Per-context variant: cache/retrieve for a specific context.
    void CacheDispatchFnForContext(v8::Local<v8::Context> ctx,
                                   v8::Local<v8::Function> fn);
    v8::Local<v8::Function> GetDispatchFnForContext(
        v8::Local<v8::Context> ctx) const;

    // Number of child frames.
    size_t child_frame_count() const { return child_frames_.size(); }

    // Access the skeleton registry for brand-compat checks across frames.
    // Returns the child frame's registry if |ctx| belongs to a child, else
    // the main registry.
    skeleton::SkeletonRegistry* SkeletonRegistryForContext(
        v8::Local<v8::Context> ctx);
    // Same-origin cross-context brand fallback used by dispatch bridge.
    // Returns true only when caller/receiver are in same-origin child-frame scope
    // and at least one eligible registry marks the brand as compatible.
    bool IsSameOriginBrandCompatible(v8::Local<v8::Context> caller_ctx,
                                     v8::Local<v8::Object> receiver_obj,
                                     const std::string& receiver_brand,
                                     const std::string& expected_brand) const;
    v8::Local<v8::Object> GetCachedDomWrapper(v8::Local<v8::Context> context,
                                              uint32_t doc_id,
                                              uint32_t node_id,
                                              uint32_t generation,
                                              const std::string& ctor_name);
    void CacheDomWrapper(v8::Isolate* isolate,
                         uint32_t doc_id,
                         uint32_t node_id,
                         uint32_t generation,
                         const std::string& ctor_name,
                         v8::Local<v8::Object> wrapper);

    // --- Inspector ---
    bool InitInspector(int port = 9229, const std::string& target_id = "leapvm-target-1");
    void WaitForInspectorConnection();
    LeapInspectorClient* inspector_client() const { return inspector_client_.get(); }
    int inspector_port() const { return inspector_port_; }
    const std::string& inspector_target_id() const { return inspector_target_id_; }

    // --- Utilities ---
    static VmInstance* UnwrapFromData(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void EnableHighResolutionTimer();
    static void DisableHighResolutionTimer();

    // I-6: 析构安全门查询
    bool is_disposing() const { return is_disposing_; }

    // I-9: StubCallback 性能采样记录
    void RecordStubCallSample(int64_t ns, const std::string& obj, const std::string& prop);

private:
    struct DomWrapperCacheKey {
        uint32_t doc_id = 0;
        uint32_t node_id = 0;
        uint32_t generation = 0;
        std::string ctor_name;

        bool operator==(const DomWrapperCacheKey& other) const {
            return std::tie(doc_id, node_id, generation, ctor_name) ==
                   std::tie(other.doc_id, other.node_id, other.generation, other.ctor_name);
        }
    };

    struct DomWrapperCacheKeyHash {
        size_t operator()(const DomWrapperCacheKey& key) const {
            size_t h = std::hash<uint32_t>{}(key.doc_id);
            h ^= (std::hash<uint32_t>{}(key.node_id) + 0x9e3779b9 + (h << 6) + (h >> 2));
            h ^= (std::hash<uint32_t>{}(key.generation) + 0x9e3779b9 + (h << 6) + (h >> 2));
            h ^= (std::hash<std::string>{}(key.ctor_name) + 0x9e3779b9 + (h << 6) + (h >> 2));
            return h;
        }
    };

    struct DomWrapperCacheEntry {
        uint64_t serial = 0;
        v8::Global<v8::Object> wrapper;
    };

    struct DomWrapperWeakPayload {
        VmInstance* self = nullptr;
        DomWrapperCacheKey key;
        uint64_t serial = 0;
    };

    v8::Isolate* isolate_ = nullptr;
    v8::Global<v8::Context> context_;
    std::unique_ptr<v8::ArrayBuffer::Allocator> allocator_;

    // Timer queue and management
    using TimerQueue = std::priority_queue<
        std::shared_ptr<TimerTask>,
        std::vector<std::shared_ptr<TimerTask>>,
        TimerTaskCompare>;

    TimerQueue timer_queue_;
    std::unordered_map<uint64_t, std::shared_ptr<TimerTask>> timers_by_id_;
    uint64_t next_timer_id_ = 0;

    // Context EmbedderData slot used to store per-context timer nesting level.
    // Must not conflict with other embedder data users.
    static constexpr int kTimerNestingLevelSlot = 0;
    static int GetTimerNestingLevel(v8::Local<v8::Context> ctx);
    static void SetTimerNestingLevel(v8::Local<v8::Context> ctx, int level);

    uint64_t AddTimeoutFunction(
        v8::Local<v8::Context> owner_ctx,
        v8::Local<v8::Function> cb,
        std::chrono::milliseconds delay,
        int nesting_level,
        std::vector<v8::Global<v8::Value>>&& args,
        bool is_interval);

    uint64_t AddTimerString(
        v8::Local<v8::Context> owner_ctx,
        v8::Local<v8::String> code,
        std::chrono::milliseconds delay,
        int nesting_level,
        bool is_interval);

    bool ClearTimer(uint64_t id);

    // V8 callbacks
    static void NativeSetTimeout(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void NativeClearTimeout(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void NativeSetInterval(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void NativeClearInterval(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void NativeDefineEnvironmentSkeleton(const v8::FunctionCallbackInfo<v8::Value>& args);

    // --- Child frame native callbacks ---
    static void NativeCreateChildFrame(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void NativeDestroyChildFrame(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void NativeNavigateChildFrame(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void NativeGetChildFrameCount(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void NativeGetChildFrameProxy(const v8::FunctionCallbackInfo<v8::Value>& args);

    // Helper functions
    void InstallConsole(v8::Local<v8::Context> context);
    void InstallTimers(v8::Local<v8::Context> context);
    void InstallNativeWrapper(v8::Local<v8::Context> context);
    void CallFunctionWithArgs(
        v8::Local<v8::Function> fn,
        const std::vector<v8::Local<v8::Value>>& argv);
    void RunStringCode(const std::string& code);

    // VM 线程管理
    void StartVmThread();
    void StopVmThread();
    void ThreadMain();

    // VM 线程相关成员
    std::thread vm_thread_;
    std::mutex task_mu_;
    std::condition_variable task_cv_;
    std::queue<Task> task_queue_;
    bool vm_thread_running_ = false;
    bool vm_thread_ready_ = false;  // VM线程是否已完成V8 scope初始化

    // Inspector 相关
    std::unique_ptr<LeapInspectorClient> inspector_client_;
    int inspector_port_ = 0;
    std::string inspector_target_id_;

    // Skeleton registry (lifetime bound to VmInstance)
    std::unique_ptr<skeleton::SkeletonRegistry> skeleton_registry_;

    MonitorConfigHolder monitor_config_holder_;
    HookRegistry hook_registry_;
    MonitorEngine monitor_engine_{ &monitor_config_holder_, &hook_registry_ };
    dom::DomManager dom_manager_;
    BuiltinWrapperManager builtin_wrapper_manager_;
    std::unordered_map<DomWrapperCacheKey, DomWrapperCacheEntry, DomWrapperCacheKeyHash> dom_wrapper_cache_;
    uint64_t next_dom_wrapper_serial_ = 1;

    // GC 弱回调的延迟清理队列（仅在 RunLoopOnce 末尾消费，无需加锁）
    struct PendingDomWrapperCleanup {
        DomWrapperCacheKey key;
        uint64_t serial = 0;
    };
    std::vector<PendingDomWrapperCleanup> pending_dom_wrapper_cleanup_;

    GlobalHookConfig hook_config_;

    // --- Child frame (iframe) data ---
    struct ChildFrame {
        std::string url;
        bool same_origin = true;
        v8::Global<v8::Context> context;
        std::unique_ptr<skeleton::SkeletonRegistry> registry;
        v8::Global<v8::Function> dispatch_fn;  // per-context dispatch cache
    };
    // 基于 ID 的 map，支持 O(1) 删除；ID 单调递增，槽位永不复用
    std::unordered_map<int, ChildFrame> child_frames_;
    int next_child_frame_id_ = 0;

    // Saved ObjectTemplate used to create the main context.
    // Reused for creating child-frame contexts with the same shape.
    v8::Global<v8::ObjectTemplate> global_template_;

    // Bundle source captured when NativeDefineEnvironmentSkeleton is called.
    // Replayed in child contexts to set up the full JS environment.
    std::string bundle_source_;
    // Temporary: holds the source of the currently executing RunScript call
    // so NativeDefineEnvironmentSkeleton can capture it as bundle_source_.
    std::string pending_script_source_;

    // Per-context dispatch function cache (main context entry).
    v8::Global<v8::Function> dispatch_fn_;

    // Child-frame VM-thread-only helpers.
    int CreateChildFrameOnVmThread(const std::string& url, bool same_origin);
    bool DestroyChildFrameOnVmThread(int frame_id);
    bool NavigateChildFrameOnVmThread(int index, const std::string& url);
    v8::Local<v8::Object> GetChildFrameProxyOnVmThread(
        v8::Local<v8::Context> caller_ctx, int index);
    bool RunScriptInContextInternal(v8::Local<v8::Context> ctx,
                                    const std::string& source,
                                    const std::string& resource_name = "");
    static std::string ComputeOriginKey(const std::string& url);
    void SetupChildContextGlobals(v8::Local<v8::Context> child_ctx);

    // Indexed property handler for window[n] -> frames[n].
    static v8::Intercepted FramesIndexedGetter(
        uint32_t index,
        const v8::PropertyCallbackInfo<v8::Value>& info);

    // I-6: 析构安全标志，StubCallback 在此标志为 true 时立即返回
    bool is_disposing_ = false;

    // I-9: StubCallback 性能采样计数器（每 10000 次采样一次）
    uint64_t stub_call_count_ = 0;
    int64_t stub_call_total_ns_ = 0;

    v8::Local<v8::Object> GetCachedDomWrapperByKey(v8::Local<v8::Context> context,
                                                   const DomWrapperCacheKey& key);
    void CacheDomWrapperByKey(v8::Isolate* isolate,
                              const DomWrapperCacheKey& key,
                              v8::Local<v8::Object> wrapper);
    void OnDomWrapperCollected(const DomWrapperCacheKey& key, uint64_t serial);
    static void OnDomWrapperWeakCallback(const v8::WeakCallbackInfo<DomWrapperWeakPayload>& info);
};

}  // namespace leapvm
