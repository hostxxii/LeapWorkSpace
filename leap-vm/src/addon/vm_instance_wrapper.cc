#include "vm_instance_wrapper.h"

#include <chrono>
#include <cstring>
#include <string>
#include <utility>
#include <vector>

namespace leapvm::addon {

namespace {

bool ParseForceGcOption(const Napi::CallbackInfo& info) {
    if (info.Length() < 1) {
        return false;
    }
    if (info[0].IsBoolean()) {
        return info[0].As<Napi::Boolean>().Value();
    }
    if (info[0].IsObject()) {
        Napi::Object obj = info[0].As<Napi::Object>();
        if (obj.Has("forceGc") && obj.Get("forceGc").IsBoolean()) {
            return obj.Get("forceGc").As<Napi::Boolean>().Value();
        }
    }
    return false;
}

Napi::Object ToJsRuntimeStats(Napi::Env env, const VmRuntimeStats& stats) {
    Napi::Object out = Napi::Object::New(env);
    out.Set("vmPendingTaskCount", Napi::Number::New(env, static_cast<double>(stats.pending_task_count)));
    out.Set("vmTimerCount", Napi::Number::New(env, static_cast<double>(stats.timer_count)));
    out.Set("vmTimerQueueSize", Napi::Number::New(env, static_cast<double>(stats.timer_queue_size)));
    out.Set("vmStaleTimerQueueCount", Napi::Number::New(env, static_cast<double>(stats.stale_timer_queue_count)));
    out.Set("vmDomWrapperCacheSize", Napi::Number::New(env, static_cast<double>(stats.dom_wrapper_cache_size)));
    out.Set("vmPendingDomWrapperCleanupCount", Napi::Number::New(env, static_cast<double>(stats.pending_dom_wrapper_cleanup_count)));
    out.Set("vmChildFrameCount", Napi::Number::New(env, static_cast<double>(stats.child_frame_count)));
    out.Set("vmChildFrameDispatchFnCount", Napi::Number::New(env, static_cast<double>(stats.child_frame_dispatch_fn_count)));
    out.Set("vmMainDispatchFnCached", Napi::Number::New(env, static_cast<double>(stats.main_dispatch_fn_cached)));
    out.Set("domDocumentCount", Napi::Number::New(env, static_cast<double>(stats.dom_document_count)));
    out.Set("domTaskScopeCount", Napi::Number::New(env, static_cast<double>(stats.dom_task_scope_count)));
    out.Set("domHandleCount", Napi::Number::New(env, static_cast<double>(stats.dom_handle_count)));
    out.Set("skeletonCount", Napi::Number::New(env, static_cast<double>(stats.skeleton_count)));
    out.Set("skeletonTemplateCount", Napi::Number::New(env, static_cast<double>(stats.skeleton_template_count)));
    out.Set("skeletonDispatchMetaCount", Napi::Number::New(env, static_cast<double>(stats.skeleton_dispatch_meta_count)));
    out.Set("skeletonBrandCompatCacheSize", Napi::Number::New(env, static_cast<double>(stats.skeleton_brand_compat_cache_size)));
    out.Set("v8TotalHeapSize", Napi::Number::New(env, static_cast<double>(stats.v8_total_heap_size)));
    out.Set("v8TotalHeapSizeExecutable", Napi::Number::New(env, static_cast<double>(stats.v8_total_heap_size_executable)));
    out.Set("v8TotalPhysicalSize", Napi::Number::New(env, static_cast<double>(stats.v8_total_physical_size)));
    out.Set("v8TotalAvailableSize", Napi::Number::New(env, static_cast<double>(stats.v8_total_available_size)));
    out.Set("v8UsedHeapSize", Napi::Number::New(env, static_cast<double>(stats.v8_used_heap_size)));
    out.Set("v8HeapSizeLimit", Napi::Number::New(env, static_cast<double>(stats.v8_heap_size_limit)));
    out.Set("v8MallocedMemory", Napi::Number::New(env, static_cast<double>(stats.v8_malloced_memory)));
    out.Set("v8PeakMallocedMemory", Napi::Number::New(env, static_cast<double>(stats.v8_peak_malloced_memory)));
    out.Set("v8ExternalMemory", Napi::Number::New(env, static_cast<double>(stats.v8_external_memory)));
    out.Set("v8TotalGlobalHandlesSize", Napi::Number::New(env, static_cast<double>(stats.v8_total_global_handles_size)));
    out.Set("v8UsedGlobalHandlesSize", Napi::Number::New(env, static_cast<double>(stats.v8_used_global_handles_size)));
    out.Set("v8NumberOfNativeContexts", Napi::Number::New(env, static_cast<double>(stats.v8_number_of_native_contexts)));
    out.Set("v8NumberOfDetachedContexts", Napi::Number::New(env, static_cast<double>(stats.v8_number_of_detached_contexts)));
    out.Set("v8CodeAndMetadataSize", Napi::Number::New(env, static_cast<double>(stats.v8_code_and_metadata_size)));
    out.Set("v8BytecodeAndMetadataSize", Napi::Number::New(env, static_cast<double>(stats.v8_bytecode_and_metadata_size)));
    out.Set("v8ExternalScriptSourceSize", Napi::Number::New(env, static_cast<double>(stats.v8_external_script_source_size)));
    out.Set("v8CpuProfilerMetadataSize", Napi::Number::New(env, static_cast<double>(stats.v8_cpu_profiler_metadata_size)));
    out.Set("v8OldSpaceUsedSize", Napi::Number::New(env, static_cast<double>(stats.v8_old_space_used_size)));
    out.Set("v8OldSpacePhysicalSize", Napi::Number::New(env, static_cast<double>(stats.v8_old_space_physical_size)));
    out.Set("v8NewSpaceUsedSize", Napi::Number::New(env, static_cast<double>(stats.v8_new_space_used_size)));
    out.Set("v8NewSpacePhysicalSize", Napi::Number::New(env, static_cast<double>(stats.v8_new_space_physical_size)));
    out.Set("v8CodeSpaceUsedSize", Napi::Number::New(env, static_cast<double>(stats.v8_code_space_used_size)));
    out.Set("v8CodeSpacePhysicalSize", Napi::Number::New(env, static_cast<double>(stats.v8_code_space_physical_size)));
    out.Set("v8MapSpaceUsedSize", Napi::Number::New(env, static_cast<double>(stats.v8_map_space_used_size)));
    out.Set("v8MapSpacePhysicalSize", Napi::Number::New(env, static_cast<double>(stats.v8_map_space_physical_size)));
    out.Set("v8LargeObjectSpaceUsedSize", Napi::Number::New(env, static_cast<double>(stats.v8_large_object_space_used_size)));
    out.Set("v8LargeObjectSpacePhysicalSize", Napi::Number::New(env, static_cast<double>(stats.v8_large_object_space_physical_size)));
    out.Set("v8TrackedHeapObjectTypeCount", Napi::Number::New(env, static_cast<double>(stats.v8_tracked_heap_object_type_count)));
    out.Set("v8HeapObjectStatsAvailable", Napi::Number::New(env, static_cast<double>(stats.v8_heap_object_stats_available)));
    Napi::Array top_heap_types = Napi::Array::New(env, stats.v8_top_heap_object_types.size());
    for (size_t i = 0; i < stats.v8_top_heap_object_types.size(); ++i) {
        const auto& entry = stats.v8_top_heap_object_types[i];
        Napi::Object item = Napi::Object::New(env);
        item.Set("type", Napi::String::New(env, entry.type));
        item.Set("subType", Napi::String::New(env, entry.sub_type));
        item.Set("count", Napi::Number::New(env, static_cast<double>(entry.count)));
        item.Set("size", Napi::Number::New(env, static_cast<double>(entry.size)));
        top_heap_types.Set(i, item);
    }
    out.Set("v8TopHeapObjectTypes", top_heap_types);
    return out;
}

bool ParseStringArray(const Napi::Value& value, std::vector<std::string>* out) {
    if (!out || value.IsEmpty() || !value.IsArray()) {
        return false;
    }

    Napi::Array arr = value.As<Napi::Array>();
    uint32_t len = arr.Length();
    out->clear();
    out->reserve(len);

    for (uint32_t i = 0; i < len; ++i) {
        Napi::Value item = arr[i];
        if (item.IsString()) {
            out->push_back(item.As<Napi::String>().Utf8Value());
        }
    }

    return true;
}

struct InspectorOptions {
    int port = 9229;
    std::string target_id = "leapvm-target-1";
    bool wait_for_connection = false;
    bool has_port_override = false;
};

InspectorOptions ParseInspectorOptions(const Napi::Value& value) {
    InspectorOptions options;
    if (value.IsEmpty() || !value.IsObject()) {
        return options;
    }

    Napi::Object obj = value.As<Napi::Object>();

    if (obj.Has("port") && obj.Get("port").IsNumber()) {
        options.port = obj.Get("port").As<Napi::Number>().Int32Value();
        options.has_port_override = true;
    }

    if (obj.Has("inspectorPort") && obj.Get("inspectorPort").IsNumber()) {
        options.port = obj.Get("inspectorPort").As<Napi::Number>().Int32Value();
        options.has_port_override = true;
    }

    if (obj.Has("targetId") && obj.Get("targetId").IsString()) {
        options.target_id = obj.Get("targetId").As<Napi::String>().Utf8Value();
    }

    if (obj.Has("inspectorTargetId") && obj.Get("inspectorTargetId").IsString()) {
        options.target_id = obj.Get("inspectorTargetId").As<Napi::String>().Utf8Value();
    }

    if (obj.Has("waitForInspectorConnection") && obj.Get("waitForInspectorConnection").IsBoolean()) {
        options.wait_for_connection = obj.Get("waitForInspectorConnection").As<Napi::Boolean>().Value();
    }

    return options;
}

}  // namespace

Napi::Function VmInstanceWrapper::Init(Napi::Env env) {
    Napi::Function ctor = DefineClass(env, "VmInstance", {
        InstanceMethod("runScript", &VmInstanceWrapper::RunScript),
        InstanceMethod("createCodeCache", &VmInstanceWrapper::CreateCodeCache),
        InstanceMethod("runScriptWithCache", &VmInstanceWrapper::RunScriptWithCache),
        InstanceMethod("runLoop", &VmInstanceWrapper::RunLoop),
        InstanceMethod("getRuntimeStats", &VmInstanceWrapper::GetRuntimeStats),
        InstanceMethod("shutdown", &VmInstanceWrapper::Shutdown),
        InstanceMethod("setMonitorEnabled", &VmInstanceWrapper::SetMonitorEnabled),
        InstanceMethod("setHookLogEnabled", &VmInstanceWrapper::SetHookLogEnabled),
        InstanceMethod("setPropertyBlacklist", &VmInstanceWrapper::SetPropertyBlacklist),
        InstanceMethod("setPropertyWhitelist", &VmInstanceWrapper::SetPropertyWhitelist),
        InstanceMethod("enableInspector", &VmInstanceWrapper::EnableInspector),
        InstanceMethod("waitForInspectorConnection", &VmInstanceWrapper::WaitForInspectorConnection),
        InstanceMethod("installBuiltinWrappers", &VmInstanceWrapper::InstallBuiltinWrappers),
    });

    return ctor;
}

VmInstanceWrapper::VmInstanceWrapper(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<VmInstanceWrapper>(info) {
    Napi::Env env = info.Env();
    vm_ = std::make_unique<VmInstance>();

    if (info.Length() < 1 || !info[0].IsObject()) {
        return;
    }

    InspectorOptions inspector_options = ParseInspectorOptions(info[0]);
    if (!inspector_options.has_port_override) {
        return;
    }

    if (!vm_->InitInspector(inspector_options.port, inspector_options.target_id)) {
        Napi::Error::New(env, "Failed to initialize inspector").ThrowAsJavaScriptException();
        return;
    }

    if (inspector_options.wait_for_connection) {
        vm_->WaitForInspectorConnection();
    }
}

VmInstanceWrapper::~VmInstanceWrapper() {
    vm_.reset();
}

void VmInstanceWrapper::EnsureAlive(const Napi::Env& env) const {
    if (vm_) {
        return;
    }
    Napi::Error::New(env, "VmInstance has been shutdown").ThrowAsJavaScriptException();
}

Napi::Value VmInstanceWrapper::RunScript(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    EnsureAlive(env);
    if (!vm_) {
        return env.Null();
    }

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "String expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string script_code = info[0].As<Napi::String>().Utf8Value();
    std::string resource_name;
    if (info.Length() >= 2 && info[1].IsString()) {
        resource_name = info[1].As<Napi::String>().Utf8Value();
    }
    std::string result;
    std::string error;
    bool success = vm_->RunScript(script_code, result, &error, resource_name);

    if (!success) {
        Napi::Error::New(env, error.empty() ? "RunScript failed" : error).ThrowAsJavaScriptException();
        return env.Null();
    }

    return Napi::String::New(env, result);
}

Napi::Value VmInstanceWrapper::CreateCodeCache(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    EnsureAlive(env);
    if (!vm_) {
        return env.Null();
    }

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "String expected (script source)").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string script_code = info[0].As<Napi::String>().Utf8Value();
    std::string resource_name;
    if (info.Length() >= 2 && info[1].IsString()) {
        resource_name = info[1].As<Napi::String>().Utf8Value();
    }

    std::vector<uint8_t> cache_data;
    std::string error;
    bool success = vm_->CreateCodeCache(script_code, cache_data, &error, resource_name);

    if (!success) {
        Napi::Error::New(env, error.empty() ? "CreateCodeCache failed" : error)
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    auto buffer = Napi::Buffer<uint8_t>::Copy(env, cache_data.data(), cache_data.size());
    return buffer;
}

Napi::Value VmInstanceWrapper::RunScriptWithCache(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    EnsureAlive(env);
    if (!vm_) {
        return env.Null();
    }

    // args: (scriptSource: string, cacheBuffer: Buffer, resourceName?: string)
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsBuffer()) {
        Napi::TypeError::New(env, "Expected (string, Buffer[, string])")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string script_code = info[0].As<Napi::String>().Utf8Value();
    auto cache_buf = info[1].As<Napi::Buffer<uint8_t>>();
    std::string resource_name;
    if (info.Length() >= 3 && info[2].IsString()) {
        resource_name = info[2].As<Napi::String>().Utf8Value();
    }

    std::string result;
    std::string error;
    bool cache_rejected = false;
    bool success = vm_->RunScriptWithCache(
        script_code,
        cache_buf.Data(), cache_buf.Length(),
        result, &cache_rejected, &error, resource_name);

    if (!success) {
        Napi::Error::New(env, error.empty() ? "RunScriptWithCache failed" : error)
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    return Napi::String::New(env, result);
}

Napi::Value VmInstanceWrapper::RunLoop(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    EnsureAlive(env);
    if (!vm_) {
        return env.Undefined();
    }

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Number expected (max duration in ms)").ThrowAsJavaScriptException();
        return env.Null();
    }

    int64_t max_ms = info[0].As<Napi::Number>().Int64Value();
    if (max_ms < 0) {
        max_ms = 0;
    }

    vm_->RunLoopOnce(std::chrono::milliseconds(max_ms));
    return env.Undefined();
}

Napi::Value VmInstanceWrapper::GetRuntimeStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    EnsureAlive(env);
    if (!vm_) {
        return env.Null();
    }
    return ToJsRuntimeStats(env, vm_->GetRuntimeStats(ParseForceGcOption(info)));
}

Napi::Value VmInstanceWrapper::Shutdown(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    vm_.reset();
    return env.Undefined();
}

Napi::Value VmInstanceWrapper::SetMonitorEnabled(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    EnsureAlive(env);
    if (!vm_) {
        return env.Undefined();
    }

    if (info.Length() < 1 || !info[0].IsBoolean()) {
        Napi::TypeError::New(env, "setMonitorEnabled expects a boolean parameter")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    bool enabled = info[0].As<Napi::Boolean>().Value();
    vm_->SetMonitorEnabled(enabled);
    return env.Undefined();
}

Napi::Value VmInstanceWrapper::SetHookLogEnabled(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    EnsureAlive(env);
    if (!vm_) {
        return env.Undefined();
    }

    if (info.Length() < 1 || !info[0].IsBoolean()) {
        Napi::TypeError::New(env, "setHookLogEnabled expects a boolean parameter")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    bool enabled = info[0].As<Napi::Boolean>().Value();
    vm_->SetHookLogEnabled(enabled);
    return env.Undefined();
}

Napi::Value VmInstanceWrapper::SetPropertyBlacklist(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    EnsureAlive(env);
    if (!vm_) {
        return env.Undefined();
    }

    std::vector<std::string> objects;
    std::vector<std::string> properties;
    std::vector<std::string> prefixes;

    if (info.Length() >= 1) {
        ParseStringArray(info[0], &objects);
    }
    if (info.Length() >= 2) {
        ParseStringArray(info[1], &properties);
    }
    if (info.Length() >= 3) {
        ParseStringArray(info[2], &prefixes);
    }

    vm_->SetPropertyBlacklist(objects, properties, prefixes);
    return env.Undefined();
}

Napi::Value VmInstanceWrapper::SetPropertyWhitelist(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    EnsureAlive(env);
    if (!vm_) {
        return env.Undefined();
    }

    std::vector<std::string> objects;
    std::vector<std::string> properties;
    std::vector<std::string> prefixes;

    if (info.Length() >= 1) {
        ParseStringArray(info[0], &objects);
    }
    if (info.Length() >= 2) {
        ParseStringArray(info[1], &properties);
    }
    if (info.Length() >= 3) {
        ParseStringArray(info[2], &prefixes);
    }

    vm_->SetPropertyWhitelist(objects, properties, prefixes);
    return env.Undefined();
}

Napi::Value VmInstanceWrapper::EnableInspector(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    EnsureAlive(env);
    if (!vm_) {
        return env.Null();
    }

    InspectorOptions options;
    if (info.Length() >= 1) {
        options = ParseInspectorOptions(info[0]);
    }

    if (!vm_->InitInspector(options.port, options.target_id)) {
        Napi::Error::New(env, "Failed to initialize inspector").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (options.wait_for_connection) {
        vm_->WaitForInspectorConnection();
    }

    Napi::Object result = Napi::Object::New(env);
    result.Set("port", Napi::Number::New(env, vm_->inspector_port()));
    result.Set("targetId", Napi::String::New(env, vm_->inspector_target_id()));
    return result;
}

Napi::Value VmInstanceWrapper::WaitForInspectorConnection(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    EnsureAlive(env);
    if (!vm_) {
        return env.Undefined();
    }

    vm_->WaitForInspectorConnection();
    return env.Undefined();
}

Napi::Value VmInstanceWrapper::InstallBuiltinWrappers(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    EnsureAlive(env);
    if (!vm_) {
        return env.Undefined();
    }

    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "installBuiltinWrappers expects a config object")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object cfg_obj = info[0].As<Napi::Object>();
    BuiltinWrapperConfig cfg;

    // enabled
    if (cfg_obj.Has("enabled") && cfg_obj.Get("enabled").IsBoolean()) {
        cfg.enabled = cfg_obj.Get("enabled").As<Napi::Boolean>().Value();
    }

    // phase
    if (cfg_obj.Has("phase") && cfg_obj.Get("phase").IsString()) {
        cfg.phase = cfg_obj.Get("phase").As<Napi::String>().Utf8Value();
    }

    // operations: string[]
    if (cfg_obj.Has("operations") && cfg_obj.Get("operations").IsArray()) {
        Napi::Array ops = cfg_obj.Get("operations").As<Napi::Array>();
        for (uint32_t i = 0; i < ops.Length(); ++i) {
            Napi::Value item = ops[i];
            if (item.IsString()) {
                cfg.operations.push_back(item.As<Napi::String>().Utf8Value());
            }
        }
    }

    // whitelist / blacklist helper
    auto parse_filter_list = [](const Napi::Object& parent,
                                const char* key,
                                BuiltinWrapperFilterList& out) {
        if (!parent.Has(key) || !parent.Get(key).IsObject()) return;
        Napi::Object list_obj = parent.Get(key).As<Napi::Object>();

        auto read_str_array = [&](const char* field,
                                  std::vector<std::string>& target) {
            if (!list_obj.Has(field) || !list_obj.Get(field).IsArray()) return;
            Napi::Array arr = list_obj.Get(field).As<Napi::Array>();
            for (uint32_t i = 0; i < arr.Length(); ++i) {
                Napi::Value item = arr[i];
                if (item.IsString()) {
                    target.push_back(item.As<Napi::String>().Utf8Value());
                }
            }
        };
        read_str_array("apiNames",    out.api_names);
        read_str_array("apiPrefixes", out.api_prefixes);
    };

    parse_filter_list(cfg_obj, "whitelist", cfg.whitelist);
    parse_filter_list(cfg_obj, "blacklist",  cfg.blacklist);

    // maxPerApi: number | null  →  -1 means unlimited
    cfg.max_per_api = -1;
    if (cfg_obj.Has("maxPerApi")) {
        Napi::Value v = cfg_obj.Get("maxPerApi");
        if (v.IsNumber()) {
            cfg.max_per_api = v.As<Napi::Number>().Int32Value();
        }
        // null → keep -1
    }

    // targets: Array<{name: string, path: string}>
    if (cfg_obj.Has("targets") && cfg_obj.Get("targets").IsArray()) {
        Napi::Array targets_arr = cfg_obj.Get("targets").As<Napi::Array>();
        for (uint32_t i = 0; i < targets_arr.Length(); ++i) {
            Napi::Value elem = targets_arr[i];
            if (!elem.IsObject()) continue;
            Napi::Object t = elem.As<Napi::Object>();
            BuiltinWrapperTarget target;
            if (t.Has("name") && t.Get("name").IsString()) {
                target.name = t.Get("name").As<Napi::String>().Utf8Value();
            }
            if (t.Has("path") && t.Get("path").IsString()) {
                target.path = t.Get("path").As<Napi::String>().Utf8Value();
            }
            if (!target.name.empty() && !target.path.empty()) {
                cfg.targets.push_back(std::move(target));
            }
        }
    }

    vm_->InstallBuiltinWrappers(std::move(cfg));
    return env.Undefined();
}

}  // namespace leapvm::addon
