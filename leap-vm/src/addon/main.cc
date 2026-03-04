#include <napi.h>
#include <node_api.h>

#include "../leapvm/log.h"
#include "../leapvm/v8_platform.h"
#include "../leapvm/vm_instance.h"
#include "vm_instance_wrapper.h"

#include <atomic>
#include <chrono>
#include <memory>
#include <string>
#include <vector>

namespace {

struct AddonData {
    std::unique_ptr<leapvm::VmInstance> default_vm;
    std::atomic<uint64_t> inspector_target_seq{0};
};

void DeleteAddonData(napi_env env, void* data, void* hint) {
    (void)env;
    (void)hint;
    delete static_cast<AddonData*>(data);
}

AddonData* GetAddonData(Napi::Env env) {
    AddonData* data = nullptr;
    napi_status status = napi_get_instance_data(env, reinterpret_cast<void**>(&data));
    if (status != napi_ok || !data) {
        Napi::Error::New(env, "Addon instance data is not initialized").ThrowAsJavaScriptException();
        return nullptr;
    }
    return data;
}

std::string NextInspectorTargetId(AddonData* data) {
    if (!data) {
        return "leapvm-target-1";
    }
    uint64_t id = data->inspector_target_seq.fetch_add(1, std::memory_order_relaxed) + 1;
    return std::string("leapvm-target-") + std::to_string(id);
}

leapvm::VmInstance* GetOrCreateDefaultVm(Napi::Env env) {
    AddonData* data = GetAddonData(env);
    if (!data) {
        return nullptr;
    }
    if (!data->default_vm) {
        data->default_vm = std::make_unique<leapvm::VmInstance>();
    }
    return data->default_vm.get();
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
    std::string target_id;
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

Napi::Value RunScript(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "String expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    leapvm::VmInstance* vm = GetOrCreateDefaultVm(env);
    if (!vm) {
        return env.Null();
    }

    std::string resource_name;
    if (info.Length() >= 2 && info[1].IsString()) {
        resource_name = info[1].As<Napi::String>().Utf8Value();
    }
    std::string result;
    std::string error;
    bool success = vm->RunScript(info[0].As<Napi::String>().Utf8Value(), result, &error, resource_name);
    if (!success) {
        Napi::Error::New(env, error.empty() ? "RunScript failed" : error).ThrowAsJavaScriptException();
        return env.Null();
    }
    return Napi::String::New(env, result);
}

Napi::Value RunLoop(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Number expected (max duration in ms)").ThrowAsJavaScriptException();
        return env.Null();
    }

    leapvm::VmInstance* vm = GetOrCreateDefaultVm(env);
    if (!vm) {
        return env.Null();
    }

    int64_t max_ms = info[0].As<Napi::Number>().Int64Value();
    if (max_ms < 0) {
        max_ms = 0;
    }

    vm->RunLoopOnce(std::chrono::milliseconds(max_ms));
    return env.Undefined();
}

Napi::Value Shutdown(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    AddonData* data = GetAddonData(env);
    if (!data) {
        return env.Undefined();
    }
    data->default_vm.reset();
    return env.Undefined();
}

Napi::Value EnableHighResTimer(const Napi::CallbackInfo& info) {
    leapvm::VmInstance::EnableHighResolutionTimer();
    return info.Env().Undefined();
}

Napi::Value DisableHighResTimer(const Napi::CallbackInfo& info) {
    leapvm::VmInstance::DisableHighResolutionTimer();
    return info.Env().Undefined();
}

Napi::Value SetPropertyBlacklist(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    leapvm::VmInstance* vm = GetOrCreateDefaultVm(env);
    if (!vm) {
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

    vm->SetPropertyBlacklist(objects, properties, prefixes);
    return env.Undefined();
}

Napi::Value SetPropertyWhitelist(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    leapvm::VmInstance* vm = GetOrCreateDefaultVm(env);
    if (!vm) {
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

    vm->SetPropertyWhitelist(objects, properties, prefixes);
    return env.Undefined();
}

Napi::Value SetMonitorEnabled(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    leapvm::VmInstance* vm = GetOrCreateDefaultVm(env);
    if (!vm) {
        return env.Undefined();
    }

    if (info.Length() < 1 || !info[0].IsBoolean()) {
        Napi::TypeError::New(env, "setMonitorEnabled expects a boolean parameter")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    bool enabled = info[0].As<Napi::Boolean>().Value();
    vm->SetMonitorEnabled(enabled);
    return env.Undefined();
}

Napi::Value SetHookLogEnabled(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    leapvm::VmInstance* vm = GetOrCreateDefaultVm(env);
    if (!vm) {
        return env.Undefined();
    }

    if (info.Length() < 1 || !info[0].IsBoolean()) {
        Napi::TypeError::New(env, "setHookLogEnabled expects a boolean parameter")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    bool enabled = info[0].As<Napi::Boolean>().Value();
    vm->SetHookLogEnabled(enabled);
    return env.Undefined();
}

Napi::Value InstallBuiltinWrappers(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    leapvm::VmInstance* vm = GetOrCreateDefaultVm(env);
    if (!vm) {
        return env.Undefined();
    }

    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "installBuiltinWrappers expects a config object")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object cfg_obj = info[0].As<Napi::Object>();
    leapvm::BuiltinWrapperConfig cfg;

    if (cfg_obj.Has("enabled") && cfg_obj.Get("enabled").IsBoolean()) {
        cfg.enabled = cfg_obj.Get("enabled").As<Napi::Boolean>().Value();
    }

    if (cfg_obj.Has("phase") && cfg_obj.Get("phase").IsString()) {
        cfg.phase = cfg_obj.Get("phase").As<Napi::String>().Utf8Value();
    }

    if (cfg_obj.Has("operations") && cfg_obj.Get("operations").IsArray()) {
        Napi::Array ops = cfg_obj.Get("operations").As<Napi::Array>();
        for (uint32_t i = 0; i < ops.Length(); ++i) {
            Napi::Value item = ops[i];
            if (item.IsString()) {
                cfg.operations.push_back(item.As<Napi::String>().Utf8Value());
            }
        }
    }

    auto parse_filter_list = [](const Napi::Object& parent,
                                const char* key,
                                leapvm::BuiltinWrapperFilterList& out) {
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

        read_str_array("apiNames", out.api_names);
        read_str_array("apiPrefixes", out.api_prefixes);
    };

    parse_filter_list(cfg_obj, "whitelist", cfg.whitelist);
    parse_filter_list(cfg_obj, "blacklist", cfg.blacklist);

    cfg.max_per_api = -1;
    if (cfg_obj.Has("maxPerApi")) {
        Napi::Value v = cfg_obj.Get("maxPerApi");
        if (v.IsNumber()) {
            cfg.max_per_api = v.As<Napi::Number>().Int32Value();
        }
    }

    if (cfg_obj.Has("targets") && cfg_obj.Get("targets").IsArray()) {
        Napi::Array targets_arr = cfg_obj.Get("targets").As<Napi::Array>();
        for (uint32_t i = 0; i < targets_arr.Length(); ++i) {
            Napi::Value elem = targets_arr[i];
            if (!elem.IsObject()) continue;
            Napi::Object t = elem.As<Napi::Object>();
            leapvm::BuiltinWrapperTarget target;
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

    vm->InstallBuiltinWrappers(std::move(cfg));
    return env.Undefined();
}

Napi::Value EnableInspector(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    AddonData* data = GetAddonData(env);
    if (!data) {
        return env.Null();
    }

    leapvm::VmInstance* vm = GetOrCreateDefaultVm(env);
    if (!vm) {
        return env.Null();
    }

    InspectorOptions options;
    if (info.Length() >= 1) {
        options = ParseInspectorOptions(info[0]);
    }
    if (options.target_id.empty()) {
        options.target_id = NextInspectorTargetId(data);
    }

    if (!vm->InitInspector(options.port, options.target_id)) {
        Napi::Error::New(env, "Failed to initialize inspector").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (options.wait_for_connection) {
        vm->WaitForInspectorConnection();
    }

    Napi::Object result = Napi::Object::New(env);
    result.Set("port", Napi::Number::New(env, vm->inspector_port()));
    result.Set("targetId", Napi::String::New(env, vm->inspector_target_id()));
    return result;
}

Napi::Value WaitForInspectorConnection(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    leapvm::VmInstance* vm = GetOrCreateDefaultVm(env);
    if (!vm) {
        return env.Null();
    }

    vm->WaitForInspectorConnection();
    return env.Undefined();
}

Napi::Value RunScriptWithInspectorBrk(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "First argument must be script string")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    AddonData* data = GetAddonData(env);
    if (!data) {
        return env.Null();
    }

    leapvm::VmInstance* vm = GetOrCreateDefaultVm(env);
    if (!vm) {
        return env.Null();
    }

    std::string code = info[0].As<Napi::String>().Utf8Value();
    int port = 9229;
    std::string filename = "debug_script.js";
    std::string target_id = NextInspectorTargetId(data);

    if (info.Length() >= 2 && info[1].IsObject()) {
        Napi::Object opts = info[1].As<Napi::Object>();
        if (opts.Has("port") && opts.Get("port").IsNumber()) {
            port = opts.Get("port").As<Napi::Number>().Int32Value();
        }
        if (opts.Has("filename") && opts.Get("filename").IsString()) {
            filename = opts.Get("filename").As<Napi::String>().Utf8Value();
        }
        if (opts.Has("targetId") && opts.Get("targetId").IsString()) {
            target_id = opts.Get("targetId").As<Napi::String>().Utf8Value();
        }
    }

    if (!vm->InitInspector(port, target_id)) {
        Napi::Error::New(env, "Failed to initialize inspector").ThrowAsJavaScriptException();
        return env.Null();
    }

    LEAPVM_LOG_INFO("=== LeapVM Inspector Break Mode ===");
    LEAPVM_LOG_INFO("[Devtools] Inspector enabled on port %d", vm->inspector_port());
    LEAPVM_LOG_INFO("[Devtools] Open this URL in Chrome:");
    LEAPVM_LOG_INFO("[Devtools]   devtools://devtools/bundled/inspector.html?ws=localhost:%d/devtools/page/%s",
                    vm->inspector_port(), vm->inspector_target_id().c_str());
    LEAPVM_LOG_INFO("[Devtools] Waiting for DevTools to connect...");

    vm->WaitForInspectorConnection();

    LEAPVM_LOG_INFO("[Devtools] DevTools connected! Starting script...");

    std::string final_code = code;
    if (!filename.empty()) {
        final_code.append("\n//# sourceURL=" + filename + "\n");
    }

    std::string result;
    std::string error;
    bool ok = vm->RunScript(final_code, result, &error);

    if (!ok) {
        Napi::Error::New(env, error.empty() ? "RunScript failed" : error)
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    LEAPVM_LOG_INFO("[Devtools] Script finished. VM will keep running.");
    return Napi::Boolean::New(env, ok);
}

}  // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    leapvm::InitLoggingFromEnv();
    leapvm::V8Platform::Instance().InitOnce(nullptr);

    AddonData* addon_data = nullptr;
    napi_status get_status = napi_get_instance_data(env, reinterpret_cast<void**>(&addon_data));
    if (get_status != napi_ok || !addon_data) {
        addon_data = new AddonData();
        napi_status set_status = napi_set_instance_data(env, addon_data, DeleteAddonData, nullptr);
        if (set_status != napi_ok) {
            delete addon_data;
            Napi::Error::New(env, "Failed to set addon instance data").ThrowAsJavaScriptException();
            return exports;
        }
    }

    exports.Set(Napi::String::New(env, "VmInstance"), leapvm::addon::VmInstanceWrapper::Init(env));

    exports.Set(Napi::String::New(env, "runScript"), Napi::Function::New(env, RunScript));
    exports.Set(Napi::String::New(env, "runLoop"), Napi::Function::New(env, RunLoop));
    exports.Set(Napi::String::New(env, "enableHighResTimer"), Napi::Function::New(env, EnableHighResTimer));
    exports.Set(Napi::String::New(env, "disableHighResTimer"), Napi::Function::New(env, DisableHighResTimer));
    exports.Set(Napi::String::New(env, "shutdown"), Napi::Function::New(env, Shutdown));
    exports.Set(Napi::String::New(env, "setMonitorEnabled"), Napi::Function::New(env, SetMonitorEnabled));
    exports.Set(Napi::String::New(env, "setHookLogEnabled"), Napi::Function::New(env, SetHookLogEnabled));
    exports.Set(Napi::String::New(env, "installBuiltinWrappers"), Napi::Function::New(env, InstallBuiltinWrappers));
    exports.Set(Napi::String::New(env, "setPropertyBlacklist"), Napi::Function::New(env, SetPropertyBlacklist));
    exports.Set(Napi::String::New(env, "setPropertyWhitelist"), Napi::Function::New(env, SetPropertyWhitelist));
    exports.Set(Napi::String::New(env, "runScriptWithInspectorBrk"), Napi::Function::New(env, RunScriptWithInspectorBrk));
    exports.Set(Napi::String::New(env, "enableInspector"), Napi::Function::New(env, EnableInspector));
    exports.Set(Napi::String::New(env, "waitForInspectorConnection"), Napi::Function::New(env, WaitForInspectorConnection));

    return exports;
}

NODE_API_MODULE(leapvm, Init)
