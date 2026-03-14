#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <functional>
#include <future>
#include <memory>
#include <mutex>
#include <queue>
#include <string>
#include <thread>
#include <vector>

namespace leapvm {
class VmInstance;

namespace service {

struct WorkerPoolConfig {
    int num_workers = 4;
    int max_tasks_per_worker = 200;
    std::string bundle_code;
    bool enable_inspector = false;
    int inspector_base_port = 9229;

    // 预加载字段（启动时一次性加载，任务缺失时回退）
    // 注意：siteProfile 不在这里整体存储。启动时由 main.cc 解析 siteProfile JSON，
    // 提取各 snapshot 字段存入下面的 preloaded_*_json。
    // 这样做的原因：siteProfile 的语义是"每任务动态覆盖"，不是"启动时固定值"。
    // 预加载的 snapshot 只是默认回退值，任何任务都可以用自己的 snapshot 覆盖。
    std::string preloaded_target_script;
    std::string preloaded_fingerprint_json;
    std::string preloaded_storage_json;
    std::string preloaded_document_json;
    std::string preloaded_storage_policy_json;

    // target 版本标识（可选）。用于 target cache 失效判定。
    // 如果为空，则不做版本检查，仅靠 source 内容匹配。
    std::string target_version;
};

struct TaskRequest {
    std::string id;
    std::string target_script;      // 内部解析后的 target script（由 preloaded target 填充）
    std::string before_script;      // 可选：调试/特殊兼容用，不作为常规传参方式
    std::string resource_name;

    // Snapshot JSON literals — 直接注入到 JS 脚本中
    // 空字符串 → 回退到启动时预加载值；预加载也为空则注入 undefined
    // 注意：这些是独立的 snapshot 字段，不是完整 siteProfile。
    // 当前不支持服务端 deep-merge siteProfile 模板。
    std::string fingerprint_json;      // fingerprintSnapshot
    std::string storage_json;          // storageSnapshot
    std::string document_json;         // documentSnapshot
    std::string storage_policy_json;   // storagePolicy
};

struct TaskResult {
    std::string id;
    bool success = false;
    std::string result;
    std::string error;
    double duration_ms = 0.0;
    int worker_id = -1;

    // 可观测性字段
    enum class TargetSource { kNone, kPreloaded };
    TargetSource target_source = TargetSource::kNone;
    bool target_cache_hit = false;     // target code cache 是否命中
};

class WorkerPool {
public:
    WorkerPool();
    ~WorkerPool();

    WorkerPool(const WorkerPool&) = delete;
    WorkerPool& operator=(const WorkerPool&) = delete;

    bool Start(const WorkerPoolConfig& config);
    void Stop();

    using TaskCompletionCallback = std::function<void(TaskResult)>;
    void SubmitTask(TaskRequest request, TaskCompletionCallback on_complete);

    struct PoolStats {
        int total_workers = 0;
        int idle_workers = 0;
        int busy_workers = 0;
        int recycling_workers = 0;
        uint64_t total_tasks_completed = 0;
        uint64_t total_tasks_failed = 0;
        size_t pending_tasks = 0;

        // target cache 统计（所有 worker 汇总）
        uint64_t target_cache_hits = 0;
        uint64_t target_cache_misses = 0;
        uint64_t target_cache_rejected = 0;

        // target 来源统计
        uint64_t target_from_preloaded = 0;
        uint64_t target_none = 0;
    };
    PoolStats GetStats() const;

private:
    enum class WorkerState {
        kIdle,
        kBusy,
        kRecycling,
        kStopped,
    };

    struct ResolvedTaskExecution {
        TaskRequest request;
        const std::string* target_script = nullptr;
        const std::string* cached_source = nullptr;
        uint64_t target_hash = 0;
        size_t target_size = 0;
        std::string owned_cached_source;
    };

    struct WorkerSlot {
        int id = -1;
        std::thread thread;
        std::unique_ptr<VmInstance> vm;

        std::mutex task_mu;
        std::condition_variable task_cv;
        std::queue<std::pair<TaskRequest, TaskCompletionCallback>> pending;

        std::atomic<WorkerState> state{WorkerState::kStopped};
        uint64_t tasks_handled = 0;
        bool should_stop = false;

        // Per-worker target cache 统计
        uint64_t cache_hits = 0;
        uint64_t cache_misses = 0;
        uint64_t cache_rejected = 0;

        // Per-worker target 来源统计
        uint64_t from_preloaded = 0;
        uint64_t from_none = 0;
    };

    void WorkerThread(WorkerSlot* slot);
    bool InitWorkerVm(WorkerSlot* slot);
    TaskResult ExecuteTask(WorkerSlot* slot, const TaskRequest& request);
    ResolvedTaskExecution ResolveTaskExecution(WorkerSlot* slot,
                                               const TaskRequest& request,
                                               TaskResult* result);
    bool ExecuteSplitCachedTask(WorkerSlot* slot,
                                const TaskRequest& request,
                                ResolvedTaskExecution* resolved,
                                TaskResult* result,
                                std::string* run_result,
                                std::string* run_error);
    bool ExecuteCombinedTask(WorkerSlot* slot,
                             const TaskRequest& request,
                             ResolvedTaskExecution* resolved,
                             std::string* run_result,
                             std::string* run_error);
    void RecycleWorker(WorkerSlot* slot);
    bool ShouldUseSplitCachedTaskExecution(const std::string& target_script) const;

    WorkerPoolConfig config_;
    std::vector<std::unique_ptr<WorkerSlot>> workers_;

    // Wrapped bundle (generated once in Start(), reused by all workers)
    std::string wrapped_bundle_;

    // Prebuilt target artifacts for the preloaded execution path.
    std::string preloaded_target_cached_source_;
    std::string preloaded_target_resource_name_;
    uint64_t preloaded_target_hash_ = 0;

    // Code cache (compiled once in Start(), shared read-only across workers)
    std::vector<uint8_t> code_cache_;
    bool code_cache_valid_ = false;

    // Target code cache (compiled once in Start(), shared read-only across workers)
    // Parallel to code_cache_ — same strategy for target script as for bundle.
    std::vector<uint8_t> target_code_cache_;
    bool target_code_cache_valid_ = false;

    // Atomic round-robin counter (lock-free dispatch)
    std::atomic<uint64_t> next_worker_{0};

    std::atomic<bool> running_{false};
    std::atomic<uint64_t> total_completed_{0};
    std::atomic<uint64_t> total_failed_{0};
    std::string inspector_target_prefix_;
};

}  // namespace service
}  // namespace leapvm
