#include "dispatch_bridge.h"

#include <chrono>
#include <cstdio>
#include <iostream>
#include <algorithm>
#include <atomic>
#include <cstdlib>
#include <sstream>
#include <string>
#include <vector>
#include "../vm_instance.h"
#include "../leap_inspector_client.h"
#include "../monitor.h"
#include "../log.h"
#include "hook_log_policy.h"
#include "skeleton_registry.h"

namespace leapvm {
namespace skeleton {
struct DispatchMeta;
}
}

namespace {

using leapvm::skeleton::DispatchMeta;
using leapvm::HookContext;
using leapvm::HookEventKey;
using leapvm::MonitorOp;
using leapvm::ShouldEnterHookPipeline;
using leapvm::VmInstance;
using HookStackFrame = leapvm::skeleton::hooklog::HookStackFrame;

inline VmInstance* GetVmInstance(v8::Isolate* isolate);

inline v8::Local<v8::String> V8String(v8::Isolate* isolate, const std::string& value) {
    return v8::String::NewFromUtf8(isolate, value.c_str(), v8::NewStringType::kNormal)
        .ToLocalChecked();
}

inline std::string BuildHookCallstackText(v8::Isolate* isolate,
                                          const std::string& headline,
                                          int max_frames = 12) {
    v8::Local<v8::StackTrace> js_stack =
        v8::StackTrace::CurrentStackTrace(isolate, max_frames);
    const int frame_count = js_stack->GetFrameCount();
    if (frame_count <= 0) {
        return std::string();
    }

    std::ostringstream out;
    out << "Error: " << headline;

    for (int i = 0; i < frame_count; ++i) {
        v8::Local<v8::StackFrame> frame = js_stack->GetFrame(isolate, i);
        v8::String::Utf8Value script(isolate, frame->GetScriptNameOrSourceURL());
        v8::String::Utf8Value func(isolate, frame->GetFunctionName());

        const char* func_str = (*func && (*func)[0]) ? *func : "(anonymous)";
        const char* script_str = (*script && (*script)[0]) ? *script : "(unknown)";
        const int line = frame->GetLineNumber();
        const int col = frame->GetColumn();

        out << "\n    at " << func_str
            << " (" << script_str << ":" << line << ":" << col << ")";
    }

    return out.str();
}

inline std::string EscapeForJsonLite(const std::string& input) {
    std::string out;
    out.reserve(input.size() + 16);
    for (char c : input) {
        switch (c) {
        case '\\': out += "\\\\"; break;
        case '\"': out += "\\\""; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default:
            if (static_cast<unsigned char>(c) < 0x20) {
                char buf[7];
                std::snprintf(buf, sizeof(buf), "\\u%04x",
                              static_cast<unsigned char>(c));
                out += buf;
            } else {
                out += c;
            }
            break;
        }
    }
    return out;
}

thread_local bool g_in_dispatch_cdp_emit = false;
std::atomic<uint64_t> g_native_hook_call_seq{0};

inline std::string V8ValueToUtf8(v8::Isolate* isolate,
                                 v8::Local<v8::Context> context,
                                 v8::Local<v8::Value> value) {
    v8::Local<v8::String> str;
    if (!value->ToString(context).ToLocal(&str)) return "";
    v8::String::Utf8Value utf8(isolate, str);
    return *utf8 ? std::string(*utf8, utf8.length()) : "";
}

inline std::string SafePreviewForCDP(v8::Isolate* isolate,
                                     v8::Local<v8::Context> context,
                                     v8::Local<v8::Value> value,
                                     int depth = 0) {
    if (value->IsUndefined()) return "undefined";
    if (value->IsNull()) return "null";
    if (value->IsBoolean()) return value->BooleanValue(isolate) ? "true" : "false";
    if (value->IsNumber()) {
        double d = value->NumberValue(context).FromMaybe(0.0);
        char buf[64];
        std::snprintf(buf, sizeof(buf), "%g", d);
        return buf;
    }
    if (value->IsString()) {
        std::string s = V8ValueToUtf8(isolate, context, value);
        constexpr size_t kMaxPreviewChars = 12000;
        if (s.size() > kMaxPreviewChars) {
            s = s.substr(0, kMaxPreviewChars) + "...";
        }
        return s;
    }
    if (value->IsFunction()) {
        std::string name = V8ValueToUtf8(isolate, context, value.As<v8::Function>()->GetName());
        return "function " + (name.empty() ? "(anonymous)" : name);
    }
    if (value->IsArray()) {
        v8::Local<v8::Array> arr = value.As<v8::Array>();
        const uint32_t len = arr->Length();
        if (depth > 0) return "Array(" + std::to_string(len) + ")";
        std::string out = "[";
        const uint32_t show = len < 8 ? len : 8;
        for (uint32_t i = 0; i < show; ++i) {
            if (i > 0) out += ", ";
            v8::Local<v8::Value> elem;
            out += (arr->Get(context, i).ToLocal(&elem))
                ? SafePreviewForCDP(isolate, context, elem, depth + 1)
                : "?";
        }
        if (len > show) out += ", ...";
        out += "]";
        return out;
    }
    if (value->IsObject()) {
        v8::Local<v8::Object> obj = value.As<v8::Object>();
        std::string ctor = V8ValueToUtf8(isolate, context, obj->GetConstructorName());
        if (ctor.empty()) ctor = "Object";
        if (depth > 0) return ctor + " {...}";

        v8::TryCatch tc(isolate);
        v8::Local<v8::Array> keys;
        if (!obj->GetOwnPropertyNames(context).ToLocal(&keys) || tc.HasCaught()) {
            tc.Reset();
            return ctor + " {...}";
        }
        const uint32_t count = keys->Length();
        if (count == 0) {
            static const char* kProbeKeys[] = {
                "tagName", "nodeName", "nodeType", "id", "className",
                "type", "name", "value", "href", "src", "length"
            };
            std::string out = (ctor == "Object") ? "{" : (ctor + " {");
            bool has_any = false;
            for (const char* k : kProbeKeys) {
                v8::Local<v8::String> key_v8;
                if (!v8::String::NewFromUtf8(isolate, k).ToLocal(&key_v8)) continue;
                v8::Local<v8::Value> prop_val;
                if (!obj->Get(context, key_v8).ToLocal(&prop_val) ||
                    tc.HasCaught() ||
                    prop_val->IsUndefined()) {
                    tc.Reset();
                    continue;
                }
                if (has_any) out += ", ";
                out += std::string(k) + ": " + SafePreviewForCDP(isolate, context, prop_val, depth + 1);
                has_any = true;
            }
            if (!has_any) return ctor == "Object" ? "{}" : (ctor + " {}");
            out += "}";
            return out;
        }

        constexpr uint32_t kMaxKeys = 16;
        const uint32_t show = count < kMaxKeys ? count : kMaxKeys;
        std::string out = (ctor == "Object") ? "{" : (ctor + " {");
        for (uint32_t i = 0; i < show; ++i) {
            if (i > 0) out += ", ";
            v8::Local<v8::Value> key;
            if (!keys->Get(context, i).ToLocal(&key) || tc.HasCaught()) {
                tc.Reset();
                continue;
            }
            const std::string key_str = V8ValueToUtf8(isolate, context, key);
            out += key_str + ": ";
            v8::Local<v8::Value> prop_val;
            if (obj->Get(context, key).ToLocal(&prop_val) && !tc.HasCaught()) {
                out += SafePreviewForCDP(isolate, context, prop_val, depth + 1);
            } else {
                tc.Reset();
                out += "?";
            }
        }
        if (count > show) out += ", ...";
        out += "}";
        return out;
    }
    return "[value]";
}

// Build a CDP RemoteObject JSON fragment for one value.
// Produces static preview data (no objectId) so DevTools can render foldable objects.
inline std::string BuildCDPRemoteObjectJson(v8::Isolate* isolate,
                                            v8::Local<v8::Context> context,
                                            v8::Local<v8::Value> value) {
    std::ostringstream out;
    if (value->IsUndefined()) {
        out << "{\"type\":\"undefined\"}";
    } else if (value->IsNull()) {
        out << "{\"type\":\"object\",\"subtype\":\"null\",\"value\":null}";
    } else if (value->IsBoolean()) {
        out << "{\"type\":\"boolean\",\"value\":"
            << (value->BooleanValue(isolate) ? "true" : "false") << "}";
    } else if (value->IsNumber()) {
        const double d = value->NumberValue(context).FromMaybe(0.0);
        char buf[64];
        std::snprintf(buf, sizeof(buf), "%g", d);
        out << "{\"type\":\"number\",\"value\":" << d
            << ",\"description\":\"" << buf << "\"}";
    } else if (value->IsString()) {
        std::string str = V8ValueToUtf8(isolate, context, value);
        out << "{\"type\":\"string\",\"value\":\"" << EscapeForJsonLite(str) << "\"}";
    } else if (value->IsFunction()) {
        std::string name = V8ValueToUtf8(isolate, context, value.As<v8::Function>()->GetName());
        out << "{\"type\":\"function\",\"className\":\"Function\","
            << "\"description\":\"function "
            << EscapeForJsonLite(name.empty() ? "(anonymous)" : name)
            << "() {}\"}";
    } else if (value->IsArray()) {
        v8::Local<v8::Array> arr = value.As<v8::Array>();
        const uint32_t len = arr->Length();
        const uint32_t show = len < 20 ? len : 20;
        const bool overflow = len > show;
        std::ostringstream props;
        for (uint32_t i = 0; i < show; ++i) {
            if (i > 0) props << ",";
            v8::Local<v8::Value> elem;
            if (!arr->Get(context, i).ToLocal(&elem)) {
                props << "{\"name\":\"" << i << "\",\"type\":\"undefined\",\"value\":\"?\"}";
                continue;
            }
            const std::string preview = SafePreviewForCDP(isolate, context, elem, 1);
            const char* type = elem->IsString() ? "string"
                : elem->IsNumber() ? "number"
                : elem->IsBoolean() ? "boolean"
                : elem->IsNull() ? "object"
                : elem->IsUndefined() ? "undefined"
                : "object";
            props << "{\"name\":\"" << i << "\",\"type\":\"" << type
                  << "\",\"value\":\"" << EscapeForJsonLite(preview) << "\"}";
        }
        out << "{\"type\":\"object\",\"subtype\":\"array\",\"className\":\"Array\","
            << "\"description\":\"Array(" << len << ")\","
            << "\"preview\":{\"type\":\"object\",\"subtype\":\"array\","
            << "\"description\":\"Array(" << len << ")\","
            << "\"overflow\":" << (overflow ? "true" : "false") << ","
            << "\"properties\":[" << props.str() << "]}}";
    } else if (value->IsObject()) {
        v8::Local<v8::Object> obj = value.As<v8::Object>();
        std::string ctor = V8ValueToUtf8(isolate, context, obj->GetConstructorName());
        if (ctor.empty()) ctor = "Object";

        std::ostringstream props;
        bool overflow = false;
        v8::TryCatch tc(isolate);
        v8::Local<v8::Array> keys;
        if (obj->GetOwnPropertyNames(context).ToLocal(&keys) && !tc.HasCaught()) {
            const uint32_t count = keys->Length();
            const uint32_t show = count < 32 ? count : 32;
            overflow = count > show;
            for (uint32_t i = 0; i < show; ++i) {
                if (i > 0) props << ",";
                v8::Local<v8::Value> key;
                if (!keys->Get(context, i).ToLocal(&key) || tc.HasCaught()) {
                    tc.Reset();
                    continue;
                }
                const std::string key_str = V8ValueToUtf8(isolate, context, key);
                v8::Local<v8::Value> prop_val;
                std::string preview = "?";
                const char* type = "undefined";
                if (obj->Get(context, key).ToLocal(&prop_val) && !tc.HasCaught()) {
                    preview = SafePreviewForCDP(isolate, context, prop_val, 1);
                    type = prop_val->IsString() ? "string"
                        : prop_val->IsNumber() ? "number"
                        : prop_val->IsBoolean() ? "boolean"
                        : prop_val->IsNull() ? "object"
                        : prop_val->IsUndefined() ? "undefined"
                        : "object";
                } else {
                    tc.Reset();
                }
                props << "{\"name\":\"" << EscapeForJsonLite(key_str) << "\",\"type\":\""
                      << type << "\",\"value\":\"" << EscapeForJsonLite(preview) << "\"}";
            }
        }
        if (props.str().empty()) {
            static const char* kProbeKeys[] = {
                "tagName", "nodeName", "nodeType", "id", "className",
                "type", "name", "value", "href", "src", "length"
            };
            bool first = true;
            for (const char* k : kProbeKeys) {
                v8::Local<v8::String> key_v8;
                if (!v8::String::NewFromUtf8(isolate, k).ToLocal(&key_v8)) continue;
                v8::Local<v8::Value> prop_val;
                if (obj->Get(context, key_v8).ToLocal(&prop_val) &&
                    !tc.HasCaught() &&
                    !prop_val->IsUndefined()) {
                    if (!first) props << ",";
                    first = false;
                    const std::string preview = SafePreviewForCDP(isolate, context, prop_val, 1);
                    const char* type = prop_val->IsString() ? "string"
                        : prop_val->IsNumber() ? "number"
                        : prop_val->IsBoolean() ? "boolean"
                        : prop_val->IsNull() ? "object"
                        : prop_val->IsUndefined() ? "undefined"
                        : "object";
                    props << "{\"name\":\"" << EscapeForJsonLite(k) << "\",\"type\":\""
                          << type << "\",\"value\":\"" << EscapeForJsonLite(preview) << "\"}";
                } else {
                    tc.Reset();
                }
            }
        }

        std::string desc = SafePreviewForCDP(isolate, context, value, 0);
        if (desc.empty()) desc = ctor;
        out << "{\"type\":\"object\",\"className\":\"" << EscapeForJsonLite(ctor) << "\","
            << "\"description\":\"" << EscapeForJsonLite(desc) << "\","
            << "\"preview\":{\"type\":\"object\",\"description\":\""
            << EscapeForJsonLite(desc) << "\",\"overflow\":"
            << (overflow ? "true" : "false") << ",\"properties\":["
            << props.str() << "]}}";
    } else {
        out << "{\"type\":\"string\",\"value\":\""
            << EscapeForJsonLite(SafePreviewForCDP(isolate, context, value))
            << "\"}";
    }
    return out.str();
}

// Build RemoteObject JSON with real objectId when inspector wrapping is available.
inline std::string BuildDispatchRemoteObjectJson(v8::Isolate* isolate,
                                                 v8::Local<v8::Context> context,
                                                 v8::Local<v8::Value> value) {
    VmInstance* vm = GetVmInstance(isolate);
    if (vm) {
        leapvm::LeapInspectorClient* client = vm->inspector_client();
        if (client) {
            std::string wrapped = client->WrapValueToRemoteObjectJson(context, value, true);
            if (!wrapped.empty()) {
                return wrapped;
            }
        }
    }
    return BuildCDPRemoteObjectJson(isolate, context, value);
}

inline bool EmitHookStackToInspector(VmInstance* vm,
                                     const std::string& headline,
                                     const std::vector<std::string>& cdp_args,
                                     const std::vector<HookStackFrame>& frames,
                                     bool require_user_frame,
                                     const char* console_type = "log") {
    if (!vm) return false;
    leapvm::LeapInspectorClient* client = vm->inspector_client();
    if (!client) return false;

    auto now = std::chrono::system_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()).count();
    double timestamp = static_cast<double>(ms) / 1000.0;

    bool has_user_frames = false;
    size_t first_user = 0;
    if (!frames.empty()) {
        while (first_user < frames.size() &&
               leapvm::skeleton::hooklog::IsInternalUrl(frames[first_user].url)) {
            ++first_user;
        }
        has_user_frames = first_user < frames.size();
        if (!has_user_frames && require_user_frame) {
            return false;
        }
    }

    std::ostringstream json;
    json << "{"
         << "\"method\":\"Runtime.consoleAPICalled\","
         << "\"params\":{"
         << "\"type\":\"" << EscapeForJsonLite(console_type ? console_type : "log") << "\","
         << "\"args\":[{"
         << "\"type\":\"string\","
         << "\"value\":\"" << EscapeForJsonLite(headline) << "\""
         << "}";
    for (const auto& arg : cdp_args) {
        json << "," << arg;
    }
    json << "],"
         << "\"executionContextId\":1,"
         << "\"timestamp\":" << timestamp;

    if (has_user_frames) {
        json << ",\"stackTrace\":{"
             << "\"description\":\"" << EscapeForJsonLite(headline) << "\","
             << "\"callFrames\":[";
        for (size_t i = first_user; i < frames.size(); ++i) {
            if (i > first_user) json << ',';
            const HookStackFrame& f = frames[i];
            const int line0 = f.line > 0 ? (f.line - 1) : 0;
            const int col0 = f.column > 0 ? (f.column - 1) : 0;
            std::string script_id = client->ResolveScriptIdForUrl(f.url);
            if (script_id.empty()) {
                script_id = "0";
            }
            json << "{"
                 << "\"functionName\":\"" << EscapeForJsonLite(f.function_name) << "\","
                 << "\"scriptId\":\"" << EscapeForJsonLite(script_id) << "\","
                 << "\"url\":\"" << EscapeForJsonLite(f.url) << "\","
                 << "\"lineNumber\":" << line0 << ","
                 << "\"columnNumber\":" << col0
                 << "}";
        }
        json << "]"
             << "}";
    }

    json << "}"
         << "}";
    client->SendToFrontend(json.str());
    return true;
}

inline const char* DispatchCallTypeToHookOpLabel(const std::string& call_type) {
    if (call_type == "get") return "get";
    if (call_type == "set") return "set";
    return "call";
}

inline bool AllowDevtoolsEvalHookLogs() {
    const char* raw = std::getenv("LEAPVM_ALLOW_DEVTOOLS_EVAL_HOOK_LOGS");
    if (!raw || !*raw) return false;
    std::string v(raw);
    std::transform(v.begin(), v.end(), v.begin(), [](unsigned char c) {
        return static_cast<char>(::tolower(c));
    });
    return v == "1" || v == "true" || v == "yes" || v == "on";
}

inline v8::Local<v8::Object> ResolveHookRuntimeObject(v8::Isolate* isolate,
                                                      v8::Local<v8::Context> context) {
    if (context.IsEmpty()) return v8::Local<v8::Object>();

    v8::Local<v8::Object> global = context->Global();
    v8::Local<v8::Value> leapenv_val;
    if (global->Get(context, v8::String::NewFromUtf8Literal(isolate, "leapenv"))
            .ToLocal(&leapenv_val) &&
        leapenv_val->IsObject()) {
        v8::Local<v8::Object> leapenv = leapenv_val.As<v8::Object>();
        v8::Local<v8::Value> runtime_val;
        if (leapenv->Get(context, v8::String::NewFromUtf8Literal(isolate, "__runtime"))
                .ToLocal(&runtime_val) &&
            runtime_val->IsObject()) {
            v8::Local<v8::Object> runtime_obj = runtime_val.As<v8::Object>();
            v8::Local<v8::Value> debug_val;
            if (runtime_obj->Get(context, v8::String::NewFromUtf8Literal(isolate, "debug"))
                    .ToLocal(&debug_val) &&
                debug_val->IsObject()) {
                v8::Local<v8::Object> debug_obj = debug_val.As<v8::Object>();
                v8::Local<v8::Value> hook_runtime_val;
                if (debug_obj->Get(context, v8::String::NewFromUtf8Literal(isolate, "hookRuntime"))
                        .ToLocal(&hook_runtime_val) &&
                    hook_runtime_val->IsObject()) {
                    return hook_runtime_val.As<v8::Object>();
                }
            }
        }
    }

    // Legacy fallback.
    v8::Local<v8::Value> runtime_val;
    if (global->Get(context, v8::String::NewFromUtf8Literal(isolate, "__LEAP_HOOK_RUNTIME__"))
            .ToLocal(&runtime_val) &&
        runtime_val->IsObject()) {
        return runtime_val.As<v8::Object>();
    }
    if (global->Get(context, v8::String::NewFromUtf8Literal(isolate, "__LEAP_DEBUG_JS_HOOKS_RUNTIME__"))
            .ToLocal(&runtime_val) &&
        runtime_val->IsObject()) {
        return runtime_val.As<v8::Object>();
    }

    return v8::Local<v8::Object>();
}

inline std::string GetHookPhaseForDevtools(v8::Isolate* isolate,
                                           v8::Local<v8::Context> context) {
    v8::Local<v8::Object> runtime_obj = ResolveHookRuntimeObject(isolate, context);
    if (runtime_obj.IsEmpty()) return "bootstrap";
    v8::Local<v8::Value> phase_val;
    if (!runtime_obj->Get(context, v8::String::NewFromUtf8Literal(isolate, "phase"))
             .ToLocal(&phase_val) ||
        !phase_val->IsString()) {
        return "bootstrap";
    }

    v8::String::Utf8Value phase_utf8(isolate, phase_val);
    if (!*phase_utf8 || phase_utf8.length() == 0) return "bootstrap";
    return std::string(*phase_utf8, phase_utf8.length());
}

inline bool EmitTextToConsole(v8::Isolate* isolate,
                              v8::Local<v8::Context> context,
                              const std::string& text) {
    if (context.IsEmpty() || text.empty()) return false;

    v8::TryCatch try_catch(isolate);
    v8::Local<v8::Object> global = context->Global();

    v8::Local<v8::Value> console_val;
    if (!global->Get(context, v8::String::NewFromUtf8Literal(isolate, "console"))
             .ToLocal(&console_val) ||
        !console_val->IsObject()) {
        return false;
    }

    v8::Local<v8::Object> console_obj = console_val.As<v8::Object>();
    v8::Local<v8::Value> log_val;
    if (!console_obj->Get(context, v8::String::NewFromUtf8Literal(isolate, "log"))
             .ToLocal(&log_val) ||
        !log_val->IsFunction()) {
        return false;
    }

    v8::Local<v8::String> msg_v8;
    if (!v8::String::NewFromUtf8(isolate, text.c_str()).ToLocal(&msg_v8)) {
        return false;
    }

    v8::Local<v8::Value> call_args[] = { msg_v8 };
    return !log_val.As<v8::Function>()->Call(context, console_obj, 1, call_args).IsEmpty();
}


inline v8::Local<v8::Private> BrandKey(v8::Isolate* isolate) {
    // IMPORTANT: do not cache v8::Private in a process-global static handle.
    // In worker_threads, multiple isolates coexist; reusing a handle created
    // by isolate A inside isolate B can trigger access violations.
    return v8::Private::ForApi(
        isolate, v8::String::NewFromUtf8Literal(isolate, "[[leapvm_brand]]"));
}

inline bool CheckBrand(v8::Isolate* isolate,
                       v8::Local<v8::Context> context,
                       v8::Local<v8::Value> recv,
                       const DispatchMeta* meta) {
    if (!meta->brand_check) {
        return true;
    }
    // Window 全局对象在 Proxy/real_global 上的品牌标记可能存在兼容性差异，
    // 这里直接放行，避免误触发 Illegal invocation。
    if (meta->brand == "Window") {
        return true;
    }
    if (recv.IsEmpty() || !recv->IsObject()) {
        return false;
    }

    v8::Local<v8::Object> obj = recv.As<v8::Object>();

    // 有些对象（例如全局 proxy 与 real_global）可能把 brand 标签写在原型链上，
    // 因此需要同时检查自身和原型，避免 brandCheck 误报 Illegal invocation。
    auto check_one = [&](v8::Local<v8::Object> target) -> bool {
        if (target.IsEmpty()) return false;
        v8::Local<v8::Value> brand_val;
        if (!target->GetPrivate(context, BrandKey(isolate)).ToLocal(&brand_val)) {
            return false;
        }
        if (!brand_val->IsString()) {
            return false;
        }
        v8::String::Utf8Value utf8(isolate, brand_val);
        if (!*utf8) {
            return false;
        }
        std::string receiver_brand(*utf8, utf8.length());
        if (meta->brand == receiver_brand) {
            return true;
        }

        VmInstance* instance = GetVmInstance(isolate);
        if (!instance) {
            return false;
        }

        if (instance->skeleton_registry() &&
            instance->skeleton_registry()->IsBrandCompatible(
                receiver_brand, meta->brand)) {
            return true;
        }

        // A3/T11: same-origin child-frame brand fallback.
        // When receiver and caller are across same-origin frame contexts,
        // main-registry-only check can be insufficient.
        return instance->IsSameOriginBrandCompatible(
            context, target, receiver_brand, meta->brand);
    };

    if (check_one(obj)) {
        return true;
    }

    v8::Local<v8::Value> proto_val = obj->GetPrototype();
    if (!proto_val.IsEmpty() && proto_val->IsObject()) {
        if (check_one(proto_val.As<v8::Object>())) {
            return true;
        }
    }

    return false;
}

inline void ThrowIllegalInvocation(v8::Isolate* isolate, const std::string& name) {
    std::string msg = name + ": Illegal invocation";
    isolate->ThrowException(v8::Exception::TypeError(
        v8::String::NewFromUtf8(isolate, msg.c_str(), v8::NewStringType::kNormal)
            .ToLocalChecked()));
}

inline VmInstance* GetVmInstance(v8::Isolate* isolate) {
    if (!isolate) return nullptr;
    return static_cast<VmInstance*>(isolate->GetData(0));
}

inline MonitorOp CallTypeToOp(const std::string& call_type) {
    if (call_type == "get") return MonitorOp::kGet;
    if (call_type == "set") return MonitorOp::kSet;
    return MonitorOp::kCall;
}

inline void EmitMonitorIfNeeded(v8::Isolate* isolate, const DispatchMeta* meta) {
    VmInstance* instance = GetVmInstance(isolate);
    if (!instance || !meta) return;

    HookEventKey key{meta->obj_name, meta->prop_name, CallTypeToOp(meta->call_type)};
    if (!ShouldEnterHookPipeline(instance->hook_config(), key)) {
        return;
    }

    HookContext ctx{
        CallTypeToOp(meta->call_type),
        meta->obj_name,
        meta->prop_name
    };
    if (instance->monitor_engine().ShouldLog(ctx)) {
        instance->monitor_engine().OnHook(ctx);
    }
}

inline bool ShouldLogDispatchMonitor(v8::Isolate* isolate,
                                     v8::Local<v8::Context> context,
                                     const DispatchMeta* meta,
                                     HookContext* out_ctx) {
    if (leapvm::g_suppress_hook_logging) {
        return false;
    }
    // Keep only top-level hooks to reduce one-call-many-log noise.
    if (leapvm::g_hook_log_depth > 1) {
        return false;
    }
    if (g_in_dispatch_cdp_emit) {
        return false;
    }
    VmInstance* instance = GetVmInstance(isolate);
    if (!instance || !meta) return false;
    if (auto* inspector = instance->inspector_client()) {
        if (inspector->is_paused() &&
            !leapvm::skeleton::hooklog::AllowPausedHookLogs()) {
            return false;
        }
    }
    if (!leapvm::skeleton::hooklog::IsRuntimeTaskActive(isolate, context)) {
        return false;
    }

    HookEventKey key{meta->obj_name, meta->prop_name, CallTypeToOp(meta->call_type)};
    if (!ShouldEnterHookPipeline(instance->hook_config(), key)) {
        return false;
    }

    HookContext ctx{
        CallTypeToOp(meta->call_type),
        meta->obj_name,
        meta->prop_name
    };
    if (out_ctx) {
        *out_ctx = ctx;
    }
    return instance->monitor_engine().ShouldLog(ctx);
}

inline void LogDispatchCallArgsIfNeeded(v8::Isolate* isolate,
                                        v8::Local<v8::Context> context,
                                        const DispatchMeta* meta,
                                        const v8::FunctionCallbackInfo<v8::Value>& args) {
    VmInstance* instance = GetVmInstance(isolate);
    if (!instance || !meta) return;
    const auto& log_detail = instance->log_detail_config();
    if (!log_detail.log_call_args || args.Length() <= 0) return;

    std::ostringstream arg_out;
    arg_out << "  args: [";
    for (int i = 0; i < args.Length(); ++i) {
        if (i > 0) arg_out << ", ";
        arg_out << leapvm::GetValuePreview(isolate, context, args[i]);
    }
    arg_out << "]";
    LEAPVM_LOG_INFO("%s", arg_out.str().c_str());
}

inline void LogDispatchSetValueIfNeeded(v8::Isolate* isolate,
                                        v8::Local<v8::Context> context,
                                        const v8::FunctionCallbackInfo<v8::Value>& args) {
    VmInstance* instance = GetVmInstance(isolate);
    if (!instance || args.Length() <= 0) return;
    const auto& log_detail = instance->log_detail_config();
    if (log_detail.log_type) {
        LEAPVM_LOG_INFO("  type: %s", leapvm::GetValueType(args[0]).c_str());
    }
    if (log_detail.log_value) {
        LEAPVM_LOG_INFO("  value: %s", leapvm::GetValuePreview(isolate, context, args[0]).c_str());
    }
}

inline void LogDispatchGetResultIfNeeded(v8::Isolate* isolate,
                                         v8::Local<v8::Context> context,
                                         v8::Local<v8::Value> result) {
    VmInstance* instance = GetVmInstance(isolate);
    if (!instance) return;
    const auto& log_detail = instance->log_detail_config();
    if (log_detail.log_type) {
        LEAPVM_LOG_INFO("  type: %s", leapvm::GetValueType(result).c_str());
    }
    if (result->IsFunction() && log_detail.log_func_params) {
        std::string params = leapvm::GetFunctionParams(isolate, context, result.As<v8::Function>());
        if (!params.empty()) {
            LEAPVM_LOG_INFO("  params: (%s)", params.c_str());
        }
    }
    if (log_detail.log_value) {
        LEAPVM_LOG_INFO("  value: %s", leapvm::GetValuePreview(isolate, context, result).c_str());
    }
}

inline void LogDispatchCallReturnIfNeeded(v8::Isolate* isolate,
                                          v8::Local<v8::Context> context,
                                          v8::Local<v8::Value> result) {
    VmInstance* instance = GetVmInstance(isolate);
    if (!instance) return;
    const auto& log_detail = instance->log_detail_config();
    if (log_detail.log_call_return) {
        LEAPVM_LOG_INFO("  return: %s", leapvm::GetValuePreview(isolate, context, result).c_str());
    }
}

inline void LogDispatchDivider() {
    LEAPVM_LOG_INFO("  %s", std::string(50, '-').c_str());
}

// 读取 dispatch 缺失时的处理模式：warn | throw | silent
std::string GetDispatchMode(v8::Isolate* isolate, v8::Local<v8::Context> context) {
    v8::Local<v8::Object> global = context->Global();
    v8::Local<v8::Value> leapenv_val;
    if (!global->Get(context, V8String(isolate, "leapenv")).ToLocal(&leapenv_val) ||
        !leapenv_val->IsObject()) {
        return "warn";
    }

    v8::Local<v8::Object> leapenv = leapenv_val.As<v8::Object>();
    v8::Local<v8::Value> config_val;
    if (!leapenv->Get(context, V8String(isolate, "config")).ToLocal(&config_val) ||
        !config_val->IsObject()) {
        return "warn";
    }

    v8::Local<v8::Object> config = config_val.As<v8::Object>();
    v8::Local<v8::Value> mode_val;
    if (!config->Get(context, V8String(isolate, "dispatchMissingMode")).ToLocal(&mode_val) ||
        !mode_val->IsString()) {
        return "warn";
    }

    v8::String::Utf8Value utf8(isolate, mode_val);
    if (*utf8) return std::string(*utf8);
    return "warn";
}

// Resolve dispatch function from leapenv.__runtime.bridge.dispatch.
inline v8::Local<v8::Function> ResolveDispatchFn(v8::Isolate* isolate,
                                                 v8::Local<v8::Context> context) {
    v8::Local<v8::Object> global = context->Global();
    v8::Local<v8::Value> leapenv_val;
    if (global->Get(context, V8String(isolate, "leapenv")).ToLocal(&leapenv_val) &&
        leapenv_val->IsObject()) {
        v8::Local<v8::Object> leapenv = leapenv_val.As<v8::Object>();
        v8::Local<v8::Value> runtime_val;
        if (leapenv->Get(context, V8String(isolate, "__runtime")).ToLocal(&runtime_val) &&
            runtime_val->IsObject()) {
            v8::Local<v8::Object> runtime = runtime_val.As<v8::Object>();
            v8::Local<v8::Value> bridge_val;
            if (runtime->Get(context, V8String(isolate, "bridge")).ToLocal(&bridge_val) &&
                bridge_val->IsObject()) {
                v8::Local<v8::Object> bridge = bridge_val.As<v8::Object>();
                v8::Local<v8::Value> dispatch_val;
                if (bridge->Get(context, V8String(isolate, "dispatch")).ToLocal(&dispatch_val) &&
                    dispatch_val->IsFunction()) {
                    return dispatch_val.As<v8::Function>();
                }
            }
        }
    }

    return v8::Local<v8::Function>();
}

// Retrieve dispatch from cache (VmInstance); fall back to runtime-store lookup
// on first call and populate the cache for subsequent invocations.
inline v8::Local<v8::Function> GetDispatchFn(v8::Isolate* isolate,
                                              v8::Local<v8::Context> context) {
    VmInstance* instance = GetVmInstance(isolate);
    if (instance) {
        v8::Local<v8::Function> cached = instance->GetCachedDispatchFn(isolate);
        if (!cached.IsEmpty()) return cached;
    }

    // First call after bundle load: resolve and cache.
    v8::Local<v8::Function> fn = ResolveDispatchFn(isolate, context);
    if (fn.IsEmpty()) {
        return v8::Local<v8::Function>();
    }
    if (instance) {
        instance->CacheDispatchFn(isolate, fn);
    }
    return fn;
}

}  // namespace

namespace leapvm {
namespace skeleton {

void DispatchBridge::StubCallback(const v8::FunctionCallbackInfo<v8::Value>& args) {
    // I-9: 性能采样 — 记录 StubCallback 开始时间
    auto t_start = std::chrono::steady_clock::now();

    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    struct HookDepthGuard {
        HookDepthGuard() { ++leapvm::g_hook_log_depth; }
        ~HookDepthGuard() { --leapvm::g_hook_log_depth; }
    } hook_depth_guard;

    // I-6: 析构安全门 — VmInstance 正在释放时直接返回，防止访问已释放的 DispatchMeta
    VmInstance* vm = GetVmInstance(isolate);
    if (!vm || vm->is_disposing()) {
        args.GetReturnValue().Set(v8::Undefined(isolate));
        return;
    }

    if (args.Data().IsEmpty() || !args.Data()->IsExternal()) {
        args.GetReturnValue().Set(v8::Undefined(isolate));
        return;
    }

    auto* meta = static_cast<DispatchMeta*>(args.Data().As<v8::External>()->Value());
    if (!meta) {
        args.GetReturnValue().Set(v8::Undefined(isolate));
        return;
    }

    // Check brand BEFORE any other operations
    if (!CheckBrand(isolate, context, args.This(), meta)) {
        ThrowIllegalInvocation(isolate, meta->obj_name);
        return;
    }

    const auto& log_detail = vm->log_detail_config();

    // 先记录监控（header）
    HookContext monitor_ctx{CallTypeToOp(meta->call_type), meta->obj_name, meta->prop_name};
    bool should_log_dispatch = ShouldLogDispatchMonitor(isolate, context, meta, &monitor_ctx);
    const std::string phase = GetHookPhaseForDevtools(isolate, context);
    const bool devtools_task_phase = (phase == "task");
    uint64_t call_seq = 0;
    auto ensure_call_seq = [&]() -> uint64_t {
        if (call_seq == 0) {
            call_seq = g_native_hook_call_seq.fetch_add(1, std::memory_order_relaxed) + 1;
        }
        return call_seq;
    };
    std::vector<HookStackFrame> hook_frames;
    if (should_log_dispatch) {
        hook_frames = leapvm::skeleton::hooklog::CaptureHookStackFrames(isolate, 12);
        if (leapvm::skeleton::hooklog::ShouldSuppressHookNoise(isolate, context, vm, hook_frames)) {
            // Suppress DevTools console-eval noise on dispatch hooks.
            should_log_dispatch = false;
            hook_frames.clear();
        } else {
            vm->monitor_engine().OnHook(monitor_ctx);
            const std::string hook_headline =
                std::string("[hook][native] root=") + meta->obj_name +
                " path=" + meta->prop_name + " op=" + DispatchCallTypeToHookOpLabel(meta->call_type);
            if (!hook_frames.empty()) {
                // CLI 始终输出，便于离线回溯。
                LEAPVM_LOG_INFO("%s", BuildHookCallstackText(isolate, hook_headline, 12).c_str());
            }
        }
    }
    bool can_emit_to_devtools = leapvm::skeleton::hooklog::HasUserFrame(hook_frames);
    if (!can_emit_to_devtools &&
        leapvm::skeleton::hooklog::HasDevtoolsEvalFrame(hook_frames) &&
        AllowDevtoolsEvalHookLogs()) {
        can_emit_to_devtools = true;
    }

    // 从缓存获取 dispatch 函数（首次调用时从 runtime store 查找并缓存）
    v8::Local<v8::Function> dispatch_fn = GetDispatchFn(isolate, context);
    if (dispatch_fn.IsEmpty()) {
        // dispatch 缺失，说明环境初始化有问题
        LEAPVM_LOG_ERROR("[LeapVM] dispatch function not found! Environment not initialized properly.");
        args.GetReturnValue().Set(v8::Undefined(isolate));
        return;
    }

    // 准备 dispatch 参数: (typeName, propName, actionType, ...args)
    std::vector<v8::Local<v8::Value>> dispatch_args;
    dispatch_args.reserve(3 + args.Length());

    // 参数 1: typeName
    dispatch_args.push_back(V8String(isolate, meta->obj_name));

    // 参数 2: propName
    dispatch_args.push_back(V8String(isolate, meta->prop_name));

    // 参数 3: actionType (GET/SET/CALL)
    std::string action_type;
    if (meta->call_type == "get") {
        action_type = "GET";
    } else if (meta->call_type == "set") {
        action_type = "SET";
    } else if (meta->call_type == "apply") {
        action_type = "CALL";
    } else {
        action_type = "GET";  // fallback
    }
    dispatch_args.push_back(V8String(isolate, action_type));

    // 参数 4+: 原始调用的参数 (对于方法和setter)
    if (meta->call_type == "apply" || meta->call_type == "set") {
        for (int i = 0; i < args.Length(); ++i) {
            dispatch_args.push_back(args[i]);
        }
    }

    if (should_log_dispatch) {
        if (meta->call_type == "apply") {
            LogDispatchCallArgsIfNeeded(isolate, context, meta, args);
            if (devtools_task_phase && log_detail.log_call_args && can_emit_to_devtools) {
                std::vector<std::string> cdp_args;
                cdp_args.reserve(args.Length() > 0 ? static_cast<size_t>(args.Length()) : 0u);
                g_in_dispatch_cdp_emit = true;
                for (int i = 0; i < args.Length(); ++i) {
                    cdp_args.push_back(BuildDispatchRemoteObjectJson(isolate, context, args[i]));
                }
                g_in_dispatch_cdp_emit = false;
                const std::string prefix =
                    "[hook][native#" + std::to_string(ensure_call_seq()) + "] call " +
                    meta->obj_name + "." + meta->prop_name;
                const bool call_line_emitted = EmitHookStackToInspector(
                    vm, prefix, {}, hook_frames, true, "log");
                if (call_line_emitted && !cdp_args.empty()) {
                    std::vector<std::string> args_payload;
                    args_payload.reserve(cdp_args.size());
                    for (const auto& a : cdp_args) args_payload.push_back(a);
                    EmitHookStackToInspector(
                        vm,
                        "[hook][native#" + std::to_string(ensure_call_seq()) + "] args:",
                        args_payload,
                        {},
                        false,
                        "log");
                }
            }
        } else if (meta->call_type == "set") {
            LogDispatchSetValueIfNeeded(isolate, context, args);
            if (devtools_task_phase && args.Length() > 0 && log_detail.log_value && can_emit_to_devtools) {
                g_in_dispatch_cdp_emit = true;
                const std::string set_arg = BuildDispatchRemoteObjectJson(isolate, context, args[0]);
                g_in_dispatch_cdp_emit = false;
                const std::string prefix =
                    "[hook][native#" + std::to_string(ensure_call_seq()) + "] set " +
                    meta->obj_name + "." + meta->prop_name;
                const bool set_line_emitted = EmitHookStackToInspector(
                    vm, prefix, {}, hook_frames, true, "log");
                if (set_line_emitted) {
                    EmitHookStackToInspector(
                        vm,
                        "[hook][native#" + std::to_string(ensure_call_seq()) + "] args:",
                        {set_arg},
                        {},
                        false,
                        "log");
                }
            }
        }
    }

    // 调用 dispatch.call(this, typeName, propName, actionType, ...args)
    v8::TryCatch try_catch(isolate);
    v8::MaybeLocal<v8::Value> maybe_result = dispatch_fn->Call(
        context,
        args.This(),  // this 绑定到原始调用者
        static_cast<int>(dispatch_args.size()),
        dispatch_args.data()
    );

    if (try_catch.HasCaught()) {
        if (should_log_dispatch) {
            LEAPVM_LOG_ERROR("  exception: %s",
                             leapvm::GetValuePreview(isolate, context, try_catch.Exception()).c_str());
            if (devtools_task_phase && can_emit_to_devtools) {
                g_in_dispatch_cdp_emit = true;
                const std::string ex = BuildDispatchRemoteObjectJson(isolate, context, try_catch.Exception());
                g_in_dispatch_cdp_emit = false;
                const std::string prefix =
                    "[hook][native#" + std::to_string(ensure_call_seq()) + "] throw " +
                    meta->obj_name + "." + meta->prop_name;
                EmitHookStackToInspector(
                    vm,
                    prefix,
                    {ex},
                    hook_frames,
                    false);
                EmitHookStackToInspector(
                    vm,
                    "[hook][native#" + std::to_string(ensure_call_seq()) + "] --------------------------------",
                    {},
                    {},
                    false,
                    "log");
            }
            LogDispatchDivider();
        }
        try_catch.ReThrow();
        return;
    }

    v8::Local<v8::Value> result;
    if (maybe_result.ToLocal(&result)) {
        if (should_log_dispatch) {
            if (meta->call_type == "get") {
                LogDispatchGetResultIfNeeded(isolate, context, result);
                if (devtools_task_phase && can_emit_to_devtools) {
                    g_in_dispatch_cdp_emit = true;
                    const std::string ret = BuildDispatchRemoteObjectJson(isolate, context, result);
                    g_in_dispatch_cdp_emit = false;
                    const std::string get_prefix = "[hook][native#" + std::to_string(ensure_call_seq()) +
                        "] get " + meta->obj_name + "." + meta->prop_name;
                    const bool get_emitted = EmitHookStackToInspector(
                        vm,
                        get_prefix,
                        {},
                        hook_frames,
                        true);
                    if (get_emitted) {
                        EmitHookStackToInspector(
                            vm,
                            "[hook][native#" + std::to_string(ensure_call_seq()) + "] =>",
                            {ret},
                            {},
                            false,
                            "log");
                        EmitHookStackToInspector(
                            vm,
                            "[hook][native#" + std::to_string(ensure_call_seq()) + "] --------------------------------",
                            {},
                            {},
                            false,
                            "log");
                    }
                }
                LogDispatchDivider();
            } else if (meta->call_type == "apply") {
                LogDispatchCallReturnIfNeeded(isolate, context, result);
                if (devtools_task_phase && log_detail.log_call_return && can_emit_to_devtools) {
                    g_in_dispatch_cdp_emit = true;
                    const std::string ret = BuildDispatchRemoteObjectJson(isolate, context, result);
                    g_in_dispatch_cdp_emit = false;
                    EmitHookStackToInspector(
                        vm,
                        "[hook][native#" + std::to_string(ensure_call_seq()) + "] =>",
                        {ret},
                        {},
                        false,
                        "log");
                    EmitHookStackToInspector(
                        vm,
                        "[hook][native#" + std::to_string(ensure_call_seq()) + "] --------------------------------",
                        {},
                        {},
                        false,
                        "log");
                }
                LogDispatchDivider();
            } else if (meta->call_type == "set") {
                if (devtools_task_phase && can_emit_to_devtools) {
                    g_in_dispatch_cdp_emit = true;
                    const std::string ret = BuildDispatchRemoteObjectJson(isolate, context, result);
                    g_in_dispatch_cdp_emit = false;
                    // Setter return is usually undefined; emit only when non-undefined to reduce noise.
                    if (!result->IsUndefined()) {
                        EmitHookStackToInspector(
                            vm,
                            "[hook][native#" + std::to_string(ensure_call_seq()) + "] =>",
                            {ret},
                            {},
                            false,
                            "log");
                    }
                    EmitHookStackToInspector(
                        vm,
                        "[hook][native#" + std::to_string(ensure_call_seq()) + "] --------------------------------",
                        {},
                        {},
                        false,
                        "log");
                }
                LogDispatchDivider();
            }
        }
        args.GetReturnValue().Set(result);
    } else if (should_log_dispatch) {
        LogDispatchDivider();
    }

    // I-9: 性能采样 — 记录本次 StubCallback 耗时并按 10000 次采样输出
    auto t_end = std::chrono::steady_clock::now();
    int64_t ns = std::chrono::duration_cast<std::chrono::nanoseconds>(t_end - t_start).count();
    vm->RecordStubCallSample(ns, meta->obj_name, meta->prop_name);
}

uint64_t DispatchBridge::NextHookSeq() {
    return g_native_hook_call_seq.fetch_add(1, std::memory_order_relaxed) + 1;
}

}  // namespace skeleton
}  // namespace leapvm
