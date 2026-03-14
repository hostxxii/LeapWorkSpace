// WorkerPool — C++ 线程池管理 N 个 VmInstance
// 对标 leap-env/src/pool/thread-pool.js

#include "worker_pool.h"
#include "vm_instance.h"
#include "v8_platform.h"
#include "task_protocol.h"
#include "config_loader.h"
#include "log.h"

#include <chrono>
#include <sstream>
#include <string_view>
#include <unistd.h>

namespace leapvm {
namespace service {

namespace {
constexpr size_t kTaskExecutionCacheMinSourceLength = 32 * 1024;

uint64_t HashTargetSource(std::string_view source) {
    constexpr uint64_t kOffsetBasis = 1469598103934665603ULL;
    constexpr uint64_t kPrime = 1099511628211ULL;

    uint64_t hash = kOffsetBasis;
    for (unsigned char c : source) {
        hash ^= static_cast<uint64_t>(c);
        hash *= kPrime;
    }
    return hash;
}

std::string BuildInspectorTargetPrefix() {
    const auto now = std::chrono::system_clock::now().time_since_epoch();
    const auto micros = std::chrono::duration_cast<std::chrono::microseconds>(now).count();

    std::ostringstream oss;
    oss << "leapvm-" << static_cast<long long>(getpid()) << "-" << micros;
    return oss.str();
}
}

WorkerPool::WorkerPool() = default;

WorkerPool::~WorkerPool() {
    Stop();
}

bool WorkerPool::Start(const WorkerPoolConfig& config) {
    if (running_.load(std::memory_order_acquire)) {
        LEAPVM_LOG_WARN("WorkerPool already running");
        return false;
    }

    config_ = config;
    inspector_target_prefix_.clear();
    preloaded_target_cached_source_.clear();
    preloaded_target_resource_name_.clear();
    preloaded_target_hash_ = 0;

    if (config_.enable_inspector) {
        inspector_target_prefix_ = BuildInspectorTargetPrefix();
    }

    if (!config_.preloaded_target_script.empty()) {
        preloaded_target_hash_ = HashTargetSource(config_.preloaded_target_script);
        if (ShouldUseSplitCachedTaskExecution(config_.preloaded_target_script)) {
            preloaded_target_cached_source_ =
                TaskProtocol::BuildCachedTaskTargetSource(config_.preloaded_target_script);
        }
        preloaded_target_resource_name_ = config_.target_version.empty()
            ? "preloaded-target"
            : "preloaded-target@" + config_.target_version;
    }

    // Generate code caches (bundle + target) once, shared read-only across all workers.
    // 关键：必须用 WrapBundleScript 包装后的源码生成 cache，
    // 因为 worker 执行的是 wrapped 版本，V8 要求源码完全一致。
    {
        auto temp_vm = std::make_unique<VmInstance>();
        std::string error;

        // Bundle code cache
        if (!config_.bundle_code.empty()) {
            wrapped_bundle_ = TaskProtocol::WrapBundleScript(config_.bundle_code);
            LEAPVM_LOG_INFO("Generating bundle code cache from wrapped bundle (%zu bytes)...",
                            wrapped_bundle_.size());

            if (temp_vm->CreateCodeCache(wrapped_bundle_, code_cache_, &error,
                                         "leapenv-bundle.js")) {
                code_cache_valid_ = true;
                LEAPVM_LOG_INFO("Bundle code cache generated: %zu bytes", code_cache_.size());
            } else {
                LEAPVM_LOG_WARN("Failed to generate bundle code cache: %s", error.c_str());
                code_cache_valid_ = false;
            }
        }

        // Target code cache (parallel strategy: compile once, share all)
        if (!preloaded_target_cached_source_.empty()) {
            LEAPVM_LOG_INFO("Generating target code cache from preloaded target (%zu bytes)...",
                            preloaded_target_cached_source_.size());
            error.clear();

            if (temp_vm->CreateCodeCache(preloaded_target_cached_source_,
                                         target_code_cache_, &error,
                                         preloaded_target_resource_name_)) {
                target_code_cache_valid_ = true;
                LEAPVM_LOG_INFO("Target code cache generated: %zu bytes",
                                target_code_cache_.size());
            } else {
                LEAPVM_LOG_WARN("Failed to generate target code cache: %s", error.c_str());
                target_code_cache_valid_ = false;
            }
        }
        // temp_vm destructor runs here — same thread new + destroy
    }

    running_.store(true, std::memory_order_release);

    // Create and start workers
    workers_.reserve(config_.num_workers);
    for (int i = 0; i < config_.num_workers; ++i) {
        auto slot = std::make_unique<WorkerSlot>();
        slot->id = i;
        slot->state.store(WorkerState::kStopped, std::memory_order_release);
        auto* slot_ptr = slot.get();
        slot->thread = std::thread([this, slot_ptr] { WorkerThread(slot_ptr); });
        workers_.push_back(std::move(slot));
    }

    // Wait for all workers to become idle (VM initialized)
    for (auto& slot : workers_) {
        while (slot->state.load(std::memory_order_acquire) == WorkerState::kStopped) {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }

    return true;
}

void WorkerPool::Stop() {
    if (!running_.exchange(false, std::memory_order_acq_rel)) {
        return;
    }

    LEAPVM_LOG_INFO("WorkerPool stopping...");

    // Signal all workers to stop
    for (auto& slot : workers_) {
        {
            std::lock_guard<std::mutex> lock(slot->task_mu);
            slot->should_stop = true;
        }
        slot->task_cv.notify_one();
    }

    // Join all threads
    for (auto& slot : workers_) {
        if (slot->thread.joinable()) {
            slot->thread.join();
        }
    }

    workers_.clear();
    LEAPVM_LOG_INFO("WorkerPool stopped.");
}

void WorkerPool::SubmitTask(TaskRequest request, TaskCompletionCallback on_complete) {
    if (!running_.load(std::memory_order_acquire)) {
        TaskResult result;
        result.id = request.id;
        result.success = false;
        result.error = "WorkerPool is not running";
        on_complete(std::move(result));
        return;
    }

    // Lock-free round-robin dispatch
    size_t idx = next_worker_.fetch_add(1, std::memory_order_relaxed) % workers_.size();

    auto& slot = workers_[idx];
    {
        std::lock_guard<std::mutex> lock(slot->task_mu);
        slot->pending.push({std::move(request), std::move(on_complete)});
    }
    slot->task_cv.notify_one();
}

WorkerPool::PoolStats WorkerPool::GetStats() const {
    PoolStats stats;
    stats.total_workers = static_cast<int>(workers_.size());
    stats.total_tasks_completed = total_completed_.load(std::memory_order_relaxed);
    stats.total_tasks_failed = total_failed_.load(std::memory_order_relaxed);

    for (auto& slot : workers_) {
        auto state = slot->state.load(std::memory_order_relaxed);
        switch (state) {
            case WorkerState::kIdle: ++stats.idle_workers; break;
            case WorkerState::kBusy: ++stats.busy_workers; break;
            case WorkerState::kRecycling: ++stats.recycling_workers; break;
            default: break;
        }
        std::lock_guard<std::mutex> lock(slot->task_mu);
        stats.pending_tasks += slot->pending.size();

        // 汇总 per-worker cache 统计
        stats.target_cache_hits += slot->cache_hits;
        stats.target_cache_misses += slot->cache_misses;
        stats.target_cache_rejected += slot->cache_rejected;
        stats.target_from_preloaded += slot->from_preloaded;
        stats.target_none += slot->from_none;
    }

    return stats;
}

void WorkerPool::WorkerThread(WorkerSlot* slot) {
    LEAPVM_LOG_INFO("Worker %d: starting...", slot->id);

    // Initialize VmInstance on this thread (same thread new + destroy)
    if (!InitWorkerVm(slot)) {
        LEAPVM_LOG_ERROR("Worker %d: failed to initialize VM, exiting.", slot->id);
        slot->state.store(WorkerState::kStopped, std::memory_order_release);
        return;
    }

    slot->state.store(WorkerState::kIdle, std::memory_order_release);
    LEAPVM_LOG_INFO("Worker %d: ready.", slot->id);

    while (running_.load(std::memory_order_acquire)) {
        std::pair<TaskRequest, TaskCompletionCallback> task_pair;

        // Wait for task
        {
            std::unique_lock<std::mutex> lock(slot->task_mu);
            slot->task_cv.wait(lock, [&] {
                return !slot->pending.empty() || slot->should_stop;
            });

            if (slot->should_stop && slot->pending.empty()) {
                break;
            }

            if (slot->pending.empty()) continue;

            task_pair = std::move(slot->pending.front());
            slot->pending.pop();
        }

        // Execute task
        slot->state.store(WorkerState::kBusy, std::memory_order_release);

        TaskResult result = ExecuteTask(slot, task_pair.first);
        result.worker_id = slot->id;

        if (result.success) {
            total_completed_.fetch_add(1, std::memory_order_relaxed);
        } else {
            total_failed_.fetch_add(1, std::memory_order_relaxed);
        }

        task_pair.second(std::move(result));

        slot->tasks_handled++;

        // Recycle if threshold reached
        if (config_.max_tasks_per_worker > 0 &&
            static_cast<int>(slot->tasks_handled) >= config_.max_tasks_per_worker) {
            RecycleWorker(slot);
        }

        slot->state.store(WorkerState::kIdle, std::memory_order_release);
    }

    // Cleanup: destroy VM on the same thread that created it
    LEAPVM_LOG_INFO("Worker %d: shutting down (handled %lu tasks)...",
                    slot->id, static_cast<unsigned long>(slot->tasks_handled));

    slot->vm.reset();
    slot->state.store(WorkerState::kStopped, std::memory_order_release);
    LEAPVM_LOG_INFO("Worker %d: stopped.", slot->id);
}

bool WorkerPool::InitWorkerVm(WorkerSlot* slot) {
    slot->vm = std::make_unique<VmInstance>();

    // Inspector 必须在所有脚本执行之前初始化，
    // 否则 V8 不会追踪 bootstrap/bundle 的编译事件，
    // DevTools 连接后 Debugger.enable 收不到 scriptParsed 回调 → Sources 面板为空。
    if (config_.enable_inspector) {
        int port = config_.inspector_base_port + slot->id;
        std::string target_id = inspector_target_prefix_.empty()
            ? ("leapvm-worker-" + std::to_string(slot->id))
            : (inspector_target_prefix_ + "-worker-" + std::to_string(slot->id));
        if (slot->vm->InitInspector(port, target_id)) {
            LEAPVM_LOG_INFO("Worker %d: inspector on port %d — waiting for DevTools connection...",
                            slot->id, slot->vm->inspector_port());
            // 阻塞等待 DevTools 连接 + Debugger.enable 处理完成。
            // 这样后续 bootstrap/bundle 编译时 V8 Inspector 已经在线，
            // DevTools 实时接收 scriptParsed 事件 → Sources 面板可见。
            slot->vm->WaitForInspectorConnection();
            LEAPVM_LOG_INFO("Worker %d: DevTools connected, resuming initialization.", slot->id);
        } else {
            LEAPVM_LOG_WARN("Worker %d: failed to initialize inspector on port %d", slot->id, port);
        }
    }

    if (config_.bundle_code.empty()) {
        // No bundle — basic VM, just verify it works
        std::string result, error;
        if (!slot->vm->RunScript("'leapvm-ready'", result, &error)) {
            LEAPVM_LOG_ERROR("Worker %d: VM smoke test failed: %s", slot->id, error.c_str());
            return false;
        }
        return true;
    }

    // Configure hooks (matching runner.js configureHooks)
    TaskProtocol::ConfigureHooks(slot->vm.get());

    // Generate and run bootstrap + bundle
    std::string bootstrap_script = TaskProtocol::BuildBootstrapScript(config_);
    std::string result, error;

    if (!slot->vm->RunScript(bootstrap_script, result, &error, "leapvm-bootstrap.js")) {
        LEAPVM_LOG_ERROR("Worker %d: bootstrap failed: %s", slot->id, error.c_str());
        return false;
    }

    // Run bundle with code cache — 复用 Start() 中预包装的 wrapped_bundle_
    if (code_cache_valid_ && !code_cache_.empty()) {
        bool cache_rejected = false;
        if (!slot->vm->RunScriptWithCache(wrapped_bundle_, code_cache_.data(),
                                          code_cache_.size(), result,
                                          &cache_rejected, &error,
                                          "leapenv-bundle.js")) {
            LEAPVM_LOG_ERROR("Worker %d: bundle execution failed: %s", slot->id, error.c_str());
            return false;
        }
        if (cache_rejected) {
            LEAPVM_LOG_WARN("Worker %d: code cache rejected, fell back to normal compilation",
                            slot->id);
        }
    } else {
        if (!slot->vm->RunScript(wrapped_bundle_, result, &error, "leapenv-bundle.js")) {
            LEAPVM_LOG_ERROR("Worker %d: bundle execution failed: %s", slot->id, error.c_str());
            return false;
        }
    }

    // Install builtin wrapper hooks after bundle — atob/btoa etc. are defined by bundle.
    TaskProtocol::InstallBuiltinHooks(slot->vm.get());

    LEAPVM_LOG_INFO("Worker %d: environment initialized.", slot->id);
    return true;
}

TaskResult WorkerPool::ExecuteTask(WorkerSlot* slot, const TaskRequest& request) {
    TaskResult result;
    result.id = request.id;

    auto start = std::chrono::steady_clock::now();
    auto resolved = ResolveTaskExecution(slot, request, &result);

    std::string run_result, run_error;
    const bool success = ShouldUseSplitCachedTaskExecution(*resolved.target_script)
        ? ExecuteSplitCachedTask(slot, request, &resolved, &result, &run_result, &run_error)
        : ExecuteCombinedTask(slot, request, &resolved, &run_result, &run_error);

    result.success = success;
    if (success) {
        result.result = std::move(run_result);
    } else {
        result.error = std::move(run_error);
    }

    auto end = std::chrono::steady_clock::now();
    result.duration_ms = std::chrono::duration<double, std::milli>(end - start).count();

    return result;
}

WorkerPool::ResolvedTaskExecution WorkerPool::ResolveTaskExecution(WorkerSlot* slot,
                                                                   const TaskRequest& request,
                                                                   TaskResult* result) {
    ResolvedTaskExecution resolved;
    resolved.request.id = request.id;
    resolved.request.before_script = request.before_script;
    resolved.request.resource_name = request.resource_name;
    resolved.request.fingerprint_json = request.fingerprint_json.empty()
        ? config_.preloaded_fingerprint_json
        : request.fingerprint_json;
    resolved.request.storage_json = request.storage_json.empty()
        ? config_.preloaded_storage_json
        : request.storage_json;
    resolved.request.document_json = request.document_json.empty()
        ? config_.preloaded_document_json
        : request.document_json;
    resolved.request.storage_policy_json = request.storage_policy_json.empty()
        ? config_.preloaded_storage_policy_json
        : request.storage_policy_json;

    if (!request.before_script.empty()) {
        LEAPVM_LOG_INFO("Worker %d: task '%s' has beforeRunScript (%zu bytes, debug mode)",
                        slot->id, request.id.c_str(), request.before_script.size());
    }

    if (!config_.preloaded_target_script.empty()) {
        resolved.target_script = &config_.preloaded_target_script;
        resolved.cached_source = preloaded_target_cached_source_.empty()
            ? nullptr
            : &preloaded_target_cached_source_;
        resolved.target_hash = preloaded_target_hash_;
        resolved.target_size = config_.preloaded_target_script.size();
        result->target_source = TaskResult::TargetSource::kPreloaded;
        slot->from_preloaded++;
        return resolved;
    }

    static const std::string kEmptyTarget;
    resolved.target_script = &kEmptyTarget;
    result->target_source = TaskResult::TargetSource::kNone;
    slot->from_none++;
    LEAPVM_LOG_WARN("Worker %d: task '%s' has no preloaded target script",
                    slot->id, request.id.c_str());
    return resolved;
}

bool WorkerPool::ExecuteSplitCachedTask(WorkerSlot* slot,
                                        const TaskRequest& request,
                                        ResolvedTaskExecution* resolved,
                                        TaskResult* result,
                                        std::string* run_result,
                                        std::string* run_error) {
    const std::string safe_task_id = TaskProtocol::JsonEscape(request.id);
    const std::string setup_script = TaskProtocol::BuildTaskSetupScript(resolved->request);
    const std::string cleanup_script = TaskProtocol::BuildTaskCleanupScript(safe_task_id);

    bool success = slot->vm->RunScript(setup_script,
                                       *run_result,
                                       run_error,
                                       "leapenv.task.setup.cached.js");
    if (success && !request.before_script.empty()) {
        success = slot->vm->RunScript(request.before_script,
                                      *run_result,
                                      run_error,
                                      "leapenv.task.before.cached.js");
    }

    if (success) {
        if (resolved->cached_source == nullptr) {
            resolved->owned_cached_source =
                TaskProtocol::BuildCachedTaskTargetSource(*resolved->target_script);
            resolved->cached_source = &resolved->owned_cached_source;
        }

        // Consume shared target code cache (compiled once in Start(), read-only)
        if (target_code_cache_valid_ && !target_code_cache_.empty()) {
            result->target_cache_hit = true;
            slot->cache_hits++;
            bool cache_rejected = false;
            success = slot->vm->RunScriptWithCache(*resolved->cached_source,
                                                   target_code_cache_.data(),
                                                   target_code_cache_.size(),
                                                   *run_result,
                                                   &cache_rejected,
                                                   run_error,
                                                   request.resource_name);
            if (cache_rejected) {
                LEAPVM_LOG_WARN(
                    "Worker %d: shared target cache REJECTED for resource '%s', "
                    "falling back to uncached execution",
                    slot->id, request.resource_name.c_str());
                result->target_cache_hit = false;
                slot->cache_hits--;
                slot->cache_rejected++;
                // Shared cache is read-only — don't clear it.
                // Fall back to uncached execution for this worker.
                success = slot->vm->RunScript(*resolved->cached_source,
                                              *run_result,
                                              run_error,
                                              request.resource_name);
            }
        } else {
            result->target_cache_hit = false;
            slot->cache_misses++;
            success = slot->vm->RunScript(*resolved->cached_source,
                                          *run_result,
                                          run_error,
                                          request.resource_name);
        }
    }

    std::string cleanup_result;
    std::string cleanup_error;
    const bool cleanup_ok = slot->vm->RunScript(cleanup_script,
                                                cleanup_result,
                                                &cleanup_error,
                                                "leapenv.task.cleanup.cached.js");
    if (!cleanup_ok && success) {
        *run_error = std::move(cleanup_error);
        return false;
    }

    return success;
}

bool WorkerPool::ExecuteCombinedTask(WorkerSlot* slot,
                                     const TaskRequest& request,
                                     ResolvedTaskExecution* resolved,
                                     std::string* run_result,
                                     std::string* run_error) {
    resolved->request.target_script = *resolved->target_script;
    std::string combined_script = TaskProtocol::BuildCombinedScript(resolved->request, config_);
    if (slot->vm->RunScript(combined_script, *run_result, run_error, "signature-task.js")) {
        return true;
    }

    const std::string safe_task_id = TaskProtocol::JsonEscape(request.id);
    const std::string fallback_cleanup = TaskProtocol::BuildStandaloneCleanupScript(safe_task_id);
    std::string cleanup_result;
    std::string cleanup_error;
    slot->vm->RunScript(fallback_cleanup, cleanup_result, &cleanup_error, "cleanup-fallback.js");
    return false;
}

void WorkerPool::RecycleWorker(WorkerSlot* slot) {
    LEAPVM_LOG_INFO("Worker %d: recycling after %lu tasks "
                    "(cache: %lu hits, %lu misses, %lu rejected; "
                    "target: %lu preloaded, %lu none)...",
                    slot->id, static_cast<unsigned long>(slot->tasks_handled),
                    static_cast<unsigned long>(slot->cache_hits),
                    static_cast<unsigned long>(slot->cache_misses),
                    static_cast<unsigned long>(slot->cache_rejected),
                    static_cast<unsigned long>(slot->from_preloaded),
                    static_cast<unsigned long>(slot->from_none));
    slot->state.store(WorkerState::kRecycling, std::memory_order_release);

    // Destroy old VM (same thread)
    slot->vm.reset();
    slot->tasks_handled = 0;
    // 注意：cache_hits/misses/rejected 和 from_* 统计不清零，
    // 它们是 worker 生命周期内的累计值，供 GetStats 汇总。

    // Create new VM (shared code caches are preserved across recycle)
    if (!InitWorkerVm(slot)) {
        LEAPVM_LOG_ERROR("Worker %d: failed to reinitialize VM after recycle!", slot->id);
        // Worker will exit on next loop iteration due to null vm
    }

    LEAPVM_LOG_INFO("Worker %d: recycled (shared target cache preserved).", slot->id);
}

bool WorkerPool::ShouldUseSplitCachedTaskExecution(const std::string& target_script) const {
    return !target_script.empty() &&
           target_script.size() >= kTaskExecutionCacheMinSourceLength;
}

}  // namespace service
}  // namespace leapvm
