#pragma once

#include <string>
#include <vector>

namespace leapvm {
class VmInstance;

namespace service {

struct WorkerPoolConfig;
struct TaskRequest;

// TaskProtocol — 从 runner.js 移植的脚本生成逻辑
// 本质：拼 JS 字符串 → 喂给 VmInstance::RunScript()
class TaskProtocol {
public:
    // Configure hooks on VmInstance (matching runner.js configureHooks)
    static void ConfigureHooks(VmInstance* vm);

    // Install builtin wrapper hooks (must be called AFTER bundle execution)
    static void InstallBuiltinHooks(VmInstance* vm);

    // Build the __runtimeBootstrap injection script (matching runDebugPrelude)
    static std::string BuildBootstrapScript(const WorkerPoolConfig& config);

    // Wrap bundle code with try/catch (matching runEnvironmentBundle)
    static std::string WrapBundleScript(const std::string& bundle_code);

    // Build the Combined script — single RunScript call for the entire task.
    // Matches runner.js Combined path (runner.js:1377).
    // setup + beforeScript + targetScript in try, cleanup in finally,
    // all sharing the same __leapEnv/__leapDomService/__leapHookRuntime scope.
    static std::string BuildCombinedScript(const TaskRequest& request,
                                           const WorkerPoolConfig& config);

    // Build setup/cleanup scripts for split-cached execution.
    static std::string BuildTaskSetupScript(const TaskRequest& request);
    static std::string BuildTaskCleanupScript(const std::string& safe_task_id);

    // Wrap the target script to match runner.js split-cached source shape.
    static std::string BuildCachedTaskTargetSource(const std::string& target_script);

    // Build standalone cleanup script (for error recovery when combined fails mid-way).
    // safeTaskId is a JSON-escaped string, e.g. "\"task-123\""
    static std::string BuildStandaloneCleanupScript(const std::string& safe_task_id);

    // JSON string escape for safe injection into JS code.
    // Returns a quoted string, e.g. "hello" → "\"hello\""
    static std::string JsonEscape(const std::string& input);

private:
    // Helper: returns the JSON literal for a snapshot field.
    // Returns "undefined" if the input is empty.
    static const std::string& SnapshotOrUndefined(const std::string& json);
    static const std::string kUndefined;
};

}  // namespace service
}  // namespace leapvm
