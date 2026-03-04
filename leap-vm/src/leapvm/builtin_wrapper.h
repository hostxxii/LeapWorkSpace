#pragma once

#include "v8_headers.h"
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

namespace leapvm {

// Per-target configuration for C++ builtin wrappers.
struct BuiltinWrapperTarget {
    std::string name;  // 显示名（用于日志），如 "JSON.stringify"
    std::string path;  // 安装路径（点分），如 "JSON.stringify"
};

struct BuiltinWrapperFilterList {
    std::vector<std::string> api_names;
    std::vector<std::string> api_prefixes;
};

// Full config for C++ builtin wrappers.
struct BuiltinWrapperConfig {
    bool enabled = false;
    std::string phase = "task";           // "task" | "bundle" | "all"
    std::vector<std::string> operations;  // ["call", "return", "throw"]; empty = all
    BuiltinWrapperFilterList whitelist;
    BuiltinWrapperFilterList blacklist;
    int max_per_api = -1;                 // -1 = unlimited
    std::vector<BuiltinWrapperTarget> targets;
};

// Owned by BuiltinWrapperContextRegistry; one instance per installed target.
// Its address is stored in the v8::External of the wrapper function, so it
// must not move or be destroyed while the wrapper function is reachable.
struct BuiltinWrapperCallbackData {
    std::string api_name;
    v8::Global<v8::Function> original_fn;
    const BuiltinWrapperConfig* config;  // non-owning; owned by Manager
    int event_count = 0;                 // per-API invocation counter

    BuiltinWrapperCallbackData() = default;
    ~BuiltinWrapperCallbackData() { original_fn.Reset(); }

    // Address-stable: non-copyable, non-movable
    BuiltinWrapperCallbackData(const BuiltinWrapperCallbackData&) = delete;
    BuiltinWrapperCallbackData& operator=(const BuiltinWrapperCallbackData&) = delete;
};

// Per-context registry: owns all callback data for one V8 context.
class BuiltinWrapperContextRegistry {
public:
    explicit BuiltinWrapperContextRegistry(const BuiltinWrapperConfig& config);
    ~BuiltinWrapperContextRegistry() = default;

    // Install all configured targets in the given context. VM-thread only.
    void InstallAll(v8::Isolate* isolate, v8::Local<v8::Context> context);

private:
    const BuiltinWrapperConfig& config_;

    // Owns all callback data (lifetime must cover wrapper function lifetime)
    std::vector<std::unique_ptr<BuiltinWrapperCallbackData>> callback_data_;

    // Resolve "A.B.C" to (holder = A.B object, key = "C") on the global object.
    bool ResolvePath(v8::Isolate* isolate,
                     v8::Local<v8::Context> context,
                     const std::string& path,
                     v8::Local<v8::Object>* holder_out,
                     std::string* key_out);

    void InstallOne(v8::Isolate* isolate,
                    v8::Local<v8::Context> context,
                    const BuiltinWrapperTarget& target);
};

// Owned by VmInstance; manages config + per-context registries.
class BuiltinWrapperManager {
public:
    BuiltinWrapperManager() = default;
    ~BuiltinWrapperManager() = default;

    void SetConfig(BuiltinWrapperConfig config);
    bool is_configured() const { return configured_; }
    const BuiltinWrapperConfig& config() const { return config_; }

    // Install wrappers in a context. Must be called on the VM thread.
    void InstallInContext(v8::Isolate* isolate, v8::Local<v8::Context> context);

private:
    BuiltinWrapperConfig config_;
    bool configured_ = false;
    std::vector<std::unique_ptr<BuiltinWrapperContextRegistry>> registries_;
};

}  // namespace leapvm
