#include "skeleton_registry.h"

#include "dispatch_bridge.h"
#include "hook_log_policy.h"
#include "../dom_core.h"
#include "../leap_inspector_client.h"
#include "../log.h"
#include "../vm_instance.h"
#include <chrono>
#include <sstream>
#include <utility>
#include <set>
#include <vector>

namespace {

inline v8::Local<v8::String> V8String(v8::Isolate* isolate, const std::string& value) {
    return v8::String::NewFromUtf8(isolate, value.c_str(), v8::NewStringType::kNormal)
        .ToLocalChecked();
}

inline v8::Local<v8::Name> ToPropertyName(v8::Isolate* isolate, const std::string& key) {
    // Keep mapping in sync with skeleton_builder.cc for instance-install path.
    if (key == "@@toStringTag") return v8::Symbol::GetToStringTag(isolate);
    if (key == "@@iterator") return v8::Symbol::GetIterator(isolate);
    if (key == "@@asyncIterator") return v8::Symbol::GetAsyncIterator(isolate);
    if (key == "@@hasInstance") return v8::Symbol::GetHasInstance(isolate);
    if (key == "@@isConcatSpreadable") return v8::Symbol::GetIsConcatSpreadable(isolate);
    if (key == "@@match") return v8::Symbol::GetMatch(isolate);
    if (key == "@@replace") return v8::Symbol::GetReplace(isolate);
    if (key == "@@search") return v8::Symbol::GetSearch(isolate);
    if (key == "@@split") return v8::Symbol::GetSplit(isolate);
    if (key == "@@toPrimitive") return v8::Symbol::GetToPrimitive(isolate);
    if (key == "@@unscopables") return v8::Symbol::GetUnscopables(isolate);
    return V8String(isolate, key);
}

inline bool IteratorNameShouldBeValues(const std::string& dispatch_obj) {
    return dispatch_obj == "DOMTokenList" ||
           dispatch_obj == "HTMLAllCollection" ||
           dispatch_obj == "HTMLCollection" ||
           dispatch_obj == "MimeTypeArray" ||
           dispatch_obj == "NamedNodeMap" ||
           dispatch_obj == "NodeList" ||
           dispatch_obj == "Plugin" ||
           dispatch_obj == "PluginArray";
}

inline v8::Local<v8::Private> BrandKey(v8::Isolate* isolate,
                                       v8::Global<v8::Private>& cache) {
    if (cache.IsEmpty()) {
        cache.Reset(isolate, v8::Private::ForApi(
            isolate, v8::String::NewFromUtf8Literal(isolate, "[[leapvm_brand]]")));
    }
    return cache.Get(isolate);
}

inline v8::Local<v8::Private> ApiPrivateKey(v8::Isolate* isolate,
                                            v8::Global<v8::Private>& cache,
                                            const char* name) {
    if (cache.IsEmpty()) {
        cache.Reset(isolate, v8::Private::ForApi(
            isolate, v8::String::NewFromUtf8(isolate, name, v8::NewStringType::kNormal)
                .ToLocalChecked()));
    }
    return cache.Get(isolate);
}

leapvm::skeleton::SkeletonRegistry* UnwrapRegistryFromCallbackData(
        v8::Isolate* isolate, v8::Local<v8::Value> data) {
    if (data.IsEmpty() || !data->IsExternal()) {
        return nullptr;
    }
    return static_cast<leapvm::skeleton::SkeletonRegistry*>(
        data.As<v8::External>()->Value());
}

inline leapvm::VmInstance* GetVmInstanceFromIsolate(v8::Isolate* isolate) {
    if (!isolate) return nullptr;
    return static_cast<leapvm::VmInstance*>(isolate->GetData(0));
}

inline std::string EscapeForSymbolCdp(const std::string& s);
inline void EmitSymbolHookCdpLine(leapvm::LeapInspectorClient* client,
                                  const std::string& headline,
                                  const std::string* value_cdp = nullptr);
using HookStackFrame = leapvm::skeleton::hooklog::HookStackFrame;

inline bool EmitSpecialHookStackToInspector(leapvm::LeapInspectorClient* client,
                                            const std::string& headline,
                                            const std::vector<std::string>& cdp_args,
                                            const std::vector<HookStackFrame>& frames,
                                            bool require_user_frame,
                                            const char* console_type = "log") {
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
         << "\"type\":\"" << EscapeForSymbolCdp(console_type ? console_type : "log") << "\","
         << "\"args\":[{"
         << "\"type\":\"string\","
         << "\"value\":\"" << EscapeForSymbolCdp(headline) << "\""
         << "}";
    for (const auto& arg : cdp_args) {
        json << "," << arg;
    }
    json << "],"
         << "\"executionContextId\":1,"
         << "\"timestamp\":" << timestamp;

    if (has_user_frames) {
        json << ",\"stackTrace\":{"
             << "\"description\":\"" << EscapeForSymbolCdp(headline) << "\","
             << "\"callFrames\":[";
        for (size_t i = first_user; i < frames.size(); ++i) {
            if (i > first_user) json << ',';
            const HookStackFrame& frame = frames[i];
            const int line0 = frame.line > 0 ? (frame.line - 1) : 0;
            const int col0 = frame.column > 0 ? (frame.column - 1) : 0;
            std::string script_id = client->ResolveScriptIdForUrl(frame.url);
            if (script_id.empty()) {
                script_id = "0";
            }
            json << "{"
                 << "\"functionName\":\"" << EscapeForSymbolCdp(frame.function_name) << "\","
                 << "\"scriptId\":\"" << EscapeForSymbolCdp(script_id) << "\","
                 << "\"url\":\"" << EscapeForSymbolCdp(frame.url) << "\","
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

inline void EmitSpecialNativeGetHookWithValue(v8::Isolate* isolate,
                                               v8::Local<v8::Context> ctx,
                                               const std::string& root,
                                               const std::string& path,
                                               v8::Local<v8::Value> value) {
    auto* vm = GetVmInstanceFromIsolate(isolate);
    if (!vm) return;
    if (leapvm::g_suppress_hook_logging) return;
    if (leapvm::g_hook_log_depth > 1) return;

    leapvm::HookEventKey key{root, path, leapvm::MonitorOp::kGet};
    if (!leapvm::ShouldEnterHookPipeline(vm->hook_config(), key)) {
        return;
    }

    leapvm::HookContext hook_ctx{leapvm::MonitorOp::kGet, root, path};
    if (!vm->monitor_engine().ShouldLog(hook_ctx)) {
        return;
    }

    const std::vector<HookStackFrame> hook_frames =
        leapvm::skeleton::hooklog::CaptureHookStackFrames(isolate, 12);
    if (leapvm::skeleton::hooklog::ShouldSuppressHookNoise(isolate, ctx, vm, hook_frames)) {
        return;
    }

    vm->monitor_engine().OnHook(hook_ctx);

    // Mirror special native getter events to DevTools console stream so they
    // are visible alongside regular [hook][native#N] dispatch logs.
    if (auto* client = vm->inspector_client()) {
        const bool can_emit_to_devtools = leapvm::skeleton::hooklog::HasUserFrame(hook_frames);

        struct SuppressHookLoggingGuard {
            bool previous;
            explicit SuppressHookLoggingGuard(bool prev) : previous(prev) {}
            ~SuppressHookLoggingGuard() { leapvm::g_suppress_hook_logging = previous; }
        };
        const bool prev_suppress = leapvm::g_suppress_hook_logging;
        leapvm::g_suppress_hook_logging = true;
        SuppressHookLoggingGuard suppress_guard(prev_suppress);

        std::string value_cdp;
        const bool force_html_all_function_view = (root == "Document" && path == "all");
        if (force_html_all_function_view) {
            value_cdp = "{\"type\":\"function\",\"className\":\"Function\","
                        "\"description\":\"function () { [native code] }\"}";
        }

        if (value_cdp.empty() && !ctx.IsEmpty() && !value.IsEmpty()) {
            // Prefer inspector-native wrapping for accurate preview/objectId.
            value_cdp = client->WrapValueToRemoteObjectJson(ctx, value, true);
        }

        if (value_cdp.empty() && !value.IsEmpty()) {
            if (value->IsUndefined()) {
                value_cdp = "{\"type\":\"undefined\"}";
            } else if (value->IsNull()) {
                value_cdp = "{\"type\":\"object\",\"subtype\":\"null\",\"value\":null}";
            } else if (value->IsString()) {
                v8::String::Utf8Value sv(isolate, value);
                std::string s = *sv ? std::string(*sv, sv.length()) : "";
                value_cdp = "{\"type\":\"string\",\"value\":\"" + EscapeForSymbolCdp(s) + "\"}";
            } else if (value->IsNumber()) {
                double d = value->NumberValue(ctx).FromMaybe(0.0);
                char buf[64];
                std::snprintf(buf, sizeof(buf), "%g", d);
                value_cdp = std::string("{\"type\":\"number\",\"value\":") + buf + "}";
            } else if (value->IsBoolean()) {
                value_cdp = value->BooleanValue(isolate)
                    ? "{\"type\":\"boolean\",\"value\":true}"
                    : "{\"type\":\"boolean\",\"value\":false}";
            } else if (value->IsObject()) {
                std::string class_name = "Object";
                if (root == "Document" && path == "all") {
                    class_name = "HTMLAllCollection";
                } else {
                    v8::String::Utf8Value cn(isolate, value.As<v8::Object>()->GetConstructorName());
                    if (*cn && cn.length() > 0) {
                        class_name = std::string(*cn, cn.length());
                    }
                }
                value_cdp = "{\"type\":\"object\",\"className\":\""
                            + EscapeForSymbolCdp(class_name) + "\"}";
            } else if (value->IsFunction()) {
                v8::String::Utf8Value fn(isolate, value.As<v8::Function>()->GetName());
                std::string n = *fn ? std::string(*fn, fn.length()) : "";
                value_cdp = "{\"type\":\"function\",\"className\":\"Function\","
                            "\"description\":\"function "
                            + EscapeForSymbolCdp(n.empty() ? "(anonymous)" : n)
                            + "() {}\"}";
            }
        }
        if (value_cdp.empty()) {
            value_cdp = "{\"type\":\"undefined\"}";
        }

        using leapvm::skeleton::DispatchBridge;
        const uint64_t seq = DispatchBridge::NextHookSeq();
        const std::string pfx = "[hook][native#" + std::to_string(seq) + "]";
        if (can_emit_to_devtools) {
            const bool get_line_emitted = EmitSpecialHookStackToInspector(
                client,
                pfx + " get " + root + "." + path,
                {},
                hook_frames,
                true,
                "log");
            if (get_line_emitted) {
                EmitSpecialHookStackToInspector(client, pfx + " =>", {value_cdp}, {}, false, "log");
                EmitSpecialHookStackToInspector(client, pfx + " --------------------------------", {}, {}, false, "log");
            }
        }
    }

    const auto& log_detail = vm->log_detail_config();
    if (log_detail.log_type) {
        LEAPVM_LOG_INFO("  type: %s", leapvm::GetValueType(value).c_str());
    }
    if (log_detail.log_value) {
        const bool prev_suppress = leapvm::g_suppress_hook_logging;
        leapvm::g_suppress_hook_logging = true;
        std::string preview = leapvm::GetValuePreview(isolate, ctx, value);
        leapvm::g_suppress_hook_logging = prev_suppress;
        LEAPVM_LOG_INFO("  value: %s", preview.c_str());
    }
    LEAPVM_LOG_INFO("  %s", std::string(50, '-').c_str());
}

void InitConstructedInstanceBrand(
        const v8::FunctionCallbackInfo<v8::Value>& args) {
    if (!args.IsConstructCall()) {
        return;
    }

    v8::Isolate* isolate = args.GetIsolate();
    auto* self = UnwrapRegistryFromCallbackData(isolate, args.Data());
    if (!self) {
        return;
    }

    v8::Local<v8::Object> instance = args.This();
    if (instance.IsEmpty()) {
        return;
    }

    v8::String::Utf8Value ctor_name_utf8(isolate, instance->GetConstructorName());
    if (!*ctor_name_utf8 || ctor_name_utf8.length() <= 0) {
        return;
    }

    std::string ctor_name(*ctor_name_utf8, ctor_name_utf8.length());
    self->SetBrand(instance, self->GetBrandByCtorName(ctor_name));
}

void IllegalConstructorCallback(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    std::string name = "Object";
    if (!args.Data().IsEmpty() && args.Data()->IsString()) {
        v8::String::Utf8Value utf8(isolate, args.Data());
        if (*utf8) name = *utf8;
    }
    std::string msg = name + ": Illegal constructor";
    isolate->ThrowException(v8::Exception::TypeError(
        v8::String::NewFromUtf8(isolate, msg.c_str(), v8::NewStringType::kNormal)
            .ToLocalChecked()));
}

// Re-entrance guard: prevents the NamedPropertyHandler from re-triggering
// while we do info.This()->Get(ctx, property) to read the property value.
thread_local bool g_in_skeleton_symbol_hook = false;

// Minimal JSON string escaper for CDP payloads (no external dependency).
inline std::string EscapeForSymbolCdp(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 8);
    for (unsigned char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:
                if (c < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out += static_cast<char>(c);
                }
                break;
        }
    }
    return out;
}

inline void EmitSymbolHookCdpLine(leapvm::LeapInspectorClient* client,
                                  const std::string& headline,
                                  const std::string* value_cdp) {
    if (!client) return;
    auto now = std::chrono::system_clock::now();
    double ts = static_cast<double>(
        std::chrono::duration_cast<std::chrono::milliseconds>(
            now.time_since_epoch()).count()) / 1000.0;

    std::ostringstream json;
    json << "{\"method\":\"Runtime.consoleAPICalled\","
         << "\"params\":{"
         << "\"type\":\"log\","
         << "\"args\":["
         << "{\"type\":\"string\",\"value\":\""
         << EscapeForSymbolCdp(headline) << "\"}";
    if (value_cdp && !value_cdp->empty()) {
        json << "," << *value_cdp;
    }
    json << "],\"executionContextId\":1,"
         << "\"timestamp\":" << ts
         << "}}";
    client->SendToFrontend(json.str());
}

// Intercepts symbol-key property accesses on skeleton object instances.
// String-key accesses are handled by per-property SetAccessorProperty callbacks;
// this handler observes all symbol-key accesses and logs them without intercepting
// the actual value (always returns kNo so V8 continues normal prototype lookup).
v8::Intercepted SkeletonSymbolNamedGetter(
        v8::Local<v8::Name> property,
        const v8::PropertyCallbackInfo<v8::Value>& info) {
    if (!property->IsSymbol() || g_in_skeleton_symbol_hook) {
        return v8::Intercepted::kNo;
    }

    v8::Isolate* isolate = info.GetIsolate();

    // Normalize symbol to display name: @@iterator, @@toStringTag, Symbol(desc), Symbol()
    v8::Local<v8::Symbol> sym = property.As<v8::Symbol>();
    v8::Local<v8::Value> desc_val = sym->Description(isolate);
    std::string sym_key;
    if (!desc_val.IsEmpty() && desc_val->IsString()) {
        v8::String::Utf8Value desc_utf8(isolate, desc_val);
        const char* desc_cstr = *desc_utf8;
        if (desc_cstr && desc_cstr[0] != '\0') {
            std::string desc(desc_cstr);
            static const std::string kWellKnownPrefix = "Symbol.";
            if (desc.size() > kWellKnownPrefix.size() &&
                desc.rfind(kWellKnownPrefix, 0) == 0) {
                sym_key = "@@" + desc.substr(kWellKnownPrefix.size());
            } else {
                sym_key = "Symbol(" + desc + ")";
            }
        } else {
            sym_key = "Symbol()";
        }
    } else {
        sym_key = "Symbol()";
    }

    // Root name from constructor (e.g. "Navigator", "Screen")
    v8::String::Utf8Value ctor_utf8(isolate, info.This()->GetConstructorName());
    std::string root = (*ctor_utf8 && ctor_utf8.length() > 0)
        ? std::string(*ctor_utf8, ctor_utf8.length())
        : "Object";

    leapvm::VmInstance* vm = GetVmInstanceFromIsolate(isolate);
    if (!vm) return v8::Intercepted::kNo;
    v8::Local<v8::Context> ctx = isolate->GetCurrentContext();
    if (ctx.IsEmpty()) return v8::Intercepted::kNo;

    leapvm::HookEventKey key{root, sym_key, leapvm::MonitorOp::kGet};
    if (!leapvm::ShouldEnterHookPipeline(vm->hook_config(), key)) {
        return v8::Intercepted::kNo;
    }

    leapvm::HookContext hook_ctx{leapvm::MonitorOp::kGet, root, sym_key};
    if (!vm->monitor_engine().ShouldLog(hook_ctx)) {
        return v8::Intercepted::kNo;
    }

    const std::vector<HookStackFrame> hook_frames =
        leapvm::skeleton::hooklog::CaptureHookStackFrames(isolate, 12);
    if (leapvm::skeleton::hooklog::ShouldSuppressHookNoise(isolate, ctx, vm, hook_frames)) {
        return v8::Intercepted::kNo;
    }
    if (!leapvm::skeleton::hooklog::HasUserFrame(hook_frames)) {
        return v8::Intercepted::kNo;
    }

    vm->monitor_engine().OnHook(hook_ctx);  // terminal log

    leapvm::LeapInspectorClient* client = vm->inspector_client();
    if (!client) return v8::Intercepted::kNo;

    // Read the actual property value via normal prototype lookup.
    // The re-entrance guard ensures the handler returns kNo immediately on
    // re-entry, so V8 falls through to the prototype chain naturally.
    std::string val_cdp;
    g_in_skeleton_symbol_hook = true;
    v8::Local<v8::Value> prop_value;
    {
        v8::TryCatch tc(isolate);
        (void)info.This()->Get(ctx, property).ToLocal(&prop_value);
    }
    g_in_skeleton_symbol_hook = false;

    // Build CDP RemoteObject inline — avoids WrapValueToRemoteObjectJson
    // which may call SendToFrontend internally and disrupt our emit sequence.
    if (!prop_value.IsEmpty()) {
        if (prop_value->IsUndefined()) {
            val_cdp = "{\"type\":\"undefined\"}";
        } else if (prop_value->IsNull()) {
            val_cdp = "{\"type\":\"object\",\"subtype\":\"null\",\"value\":null}";
        } else if (prop_value->IsString()) {
            v8::String::Utf8Value sv(isolate, prop_value);
            std::string s = *sv ? std::string(*sv, sv.length()) : "";
            val_cdp = "{\"type\":\"string\",\"value\":\"" + EscapeForSymbolCdp(s) + "\"}";
        } else if (prop_value->IsNumber()) {
            double d = prop_value->NumberValue(ctx).FromMaybe(0.0);
            char buf[64];
            std::snprintf(buf, sizeof(buf), "%g", d);
            val_cdp = std::string("{\"type\":\"number\",\"value\":") + buf + "}";
        } else if (prop_value->IsBoolean()) {
            val_cdp = prop_value->BooleanValue(isolate)
                ? "{\"type\":\"boolean\",\"value\":true}"
                : "{\"type\":\"boolean\",\"value\":false}";
        } else if (prop_value->IsFunction()) {
            v8::String::Utf8Value fn(isolate, prop_value.As<v8::Function>()->GetName());
            std::string n = *fn ? std::string(*fn, fn.length()) : "";
            val_cdp = "{\"type\":\"function\",\"className\":\"Function\","
                      "\"description\":\"function "
                      + EscapeForSymbolCdp(n.empty() ? "(anonymous)" : n)
                      + "() {}\"}";
        } else {
            v8::String::Utf8Value cn(isolate, prop_value.As<v8::Object>()->GetConstructorName());
            std::string ctor = *cn ? std::string(*cn, cn.length()) : "Object";
            val_cdp = "{\"type\":\"object\",\"className\":\""
                      + EscapeForSymbolCdp(ctor) + "\"}";
        }
    }
    if (val_cdp.empty()) {
        val_cdp = "{\"type\":\"undefined\"}";
    }

    // Keep symbol hook output shape consistent with regular native hooks:
    // get -> => value -> divider (same seq for all three lines).
    using leapvm::skeleton::DispatchBridge;
    const uint64_t seq = DispatchBridge::NextHookSeq();
    const std::string pfx = "[hook][native#" + std::to_string(seq) + "]";

    EmitSymbolHookCdpLine(client, pfx + " get " + root + "." + sym_key);
    EmitSymbolHookCdpLine(client, pfx + " =>", &val_cdp);
    EmitSymbolHookCdpLine(client, pfx + " --------------------------------");

    return v8::Intercepted::kNo;
}

}  // namespace

namespace {

// Deep-clone a PropertyDescriptor (polymorphic).
std::unique_ptr<leapvm::skeleton::PropertyDescriptor> ClonePropertyDescriptor(
        const leapvm::skeleton::PropertyDescriptor* src) {
    using namespace leapvm::skeleton;
    switch (src->kind) {
    case PropertyKind::DATA: {
        auto* dp = static_cast<const DataProperty*>(src);
        auto clone = std::make_unique<DataProperty>();
        clone->name = dp->name;
        clone->kind = dp->kind;
        clone->owner = dp->owner;
        clone->enumerable = dp->enumerable;
        clone->configurable = dp->configurable;
        clone->value_type = dp->value_type;
        clone->value = dp->value;
        clone->writable = dp->writable;
        return clone;
    }
    case PropertyKind::METHOD: {
        auto* mp = static_cast<const MethodProperty*>(src);
        auto clone = std::make_unique<MethodProperty>();
        clone->name = mp->name;
        clone->kind = mp->kind;
        clone->owner = mp->owner;
        clone->enumerable = mp->enumerable;
        clone->configurable = mp->configurable;
        clone->dispatch_obj = mp->dispatch_obj;
        clone->dispatch_prop = mp->dispatch_prop;
        clone->brand_check = mp->brand_check;
        clone->brand = mp->brand;
        clone->length = mp->length;
        return clone;
    }
    case PropertyKind::ACCESSOR: {
        auto* ap = static_cast<const AccessorProperty*>(src);
        auto clone = std::make_unique<AccessorProperty>();
        clone->name = ap->name;
        clone->kind = ap->kind;
        clone->owner = ap->owner;
        clone->enumerable = ap->enumerable;
        clone->configurable = ap->configurable;
        clone->has_getter = ap->has_getter;
        clone->has_setter = ap->has_setter;
        clone->getter_obj = ap->getter_obj;
        clone->getter_prop = ap->getter_prop;
        clone->setter_obj = ap->setter_obj;
        clone->setter_prop = ap->setter_prop;
        clone->brand_check = ap->brand_check;
        clone->brand = ap->brand;
        return clone;
    }
    }
    // Should not reach here.
    return nullptr;
}

// Deep-clone an ObjectSkeleton (including all PropertyDescriptor children).
leapvm::skeleton::ObjectSkeleton CloneObjectSkeleton(
        const leapvm::skeleton::ObjectSkeleton& src) {
    using namespace leapvm::skeleton;
    ObjectSkeleton clone;
    clone.name = src.name;
    clone.ctor_name = src.ctor_name;
    clone.instance_name = src.instance_name;
    clone.brand = src.brand;
    clone.ctor_illegal = src.ctor_illegal;
    clone.expose_ctor = src.expose_ctor;
    clone.super_type = src.super_type;
    clone.properties.reserve(src.properties.size());
    for (const auto& prop : src.properties) {
        clone.properties.push_back(ClonePropertyDescriptor(prop.get()));
    }
    return clone;
}

}  // namespace

namespace leapvm {
namespace skeleton {

SkeletonRegistry::SkeletonRegistry(v8::Isolate* isolate, v8::Local<v8::Context> context)
    : isolate_(isolate) {
    context_.Reset(isolate_, context);
}

void SkeletonRegistry::RegisterSkeleton(ObjectSkeleton skeleton) {
    std::string name = skeleton.name;
    if (skeletons_.find(name) == skeletons_.end()) {
        skeleton_order_.push_back(name);
    }
    skeletons_[name] = std::move(skeleton);
}

v8::Local<v8::FunctionTemplate> SkeletonRegistry::GetTemplate(const std::string& name) {
    auto it = templates_.find(name);
    if (it == templates_.end()) {
        return v8::Local<v8::FunctionTemplate>();
    }
    return it->second.Get(isolate_);
}

// Static helper: Check if skeleton is a type definition (*.type)
bool SkeletonRegistry::IsTypeSkeleton(const ObjectSkeleton& skeleton) {
    const std::string& name = skeleton.name;
    return name.size() > 5 && name.rfind(".type") == name.size() - 5;
}

// Static helper: Check if skeleton is an instance definition (*.instance)
bool SkeletonRegistry::IsInstanceSkeleton(const ObjectSkeleton& skeleton) {
    const std::string& name = skeleton.name;
    return name.size() > 9 && name.rfind(".instance") == name.size() - 9;
}

void SkeletonRegistry::BuildPhase1_CreateTemplates() {
    LEAPVM_LOG_INFO("[skeleton] Phase 1: Creating FunctionTemplates...");

    for (const auto& name : skeleton_order_) {
        const auto& skeleton = skeletons_.at(name);
        // Only create templates for type skeletons, skip instance skeletons
        if (!IsTypeSkeleton(skeleton)) {
            LEAPVM_LOG_DEBUG("[skeleton] [Phase1] Skipping non-type skeleton: %s", name.c_str());
            continue;
        }
        CreateTemplate(name);
    }
}

void SkeletonRegistry::BuildPhase2_SetupInheritance() {
    LEAPVM_LOG_INFO("[skeleton] Phase 2: Setting up inheritance...");

    // Use a set to track which types have had inheritance set up
    std::set<std::string> processed;

    // Process each type with recursive parent-first ordering
    // Only process type skeletons, skip instance skeletons
    for (const auto& name : skeleton_order_) {
        const auto& skeleton = skeletons_.at(name);
        if (!IsTypeSkeleton(skeleton)) {
            LEAPVM_LOG_DEBUG("[skeleton] [Phase2] Skipping non-type skeleton: %s", name.c_str());
            continue;
        }
        SetupInheritanceRecursive(name, processed);
    }
}

void SkeletonRegistry::BuildPhase3_DefinePropertiesAndInstances() {
    LEAPVM_LOG_INFO("[skeleton] Phase 3: Defining properties and creating instances...");

    // Step 3.1: Define properties for all type skeletons
    LEAPVM_LOG_DEBUG("[skeleton] [Phase3.1] Defining properties for type skeletons...");
    for (const auto& name : skeleton_order_) {
        const auto& skeleton = skeletons_.at(name);
        if (!IsTypeSkeleton(skeleton)) continue;
        DefineProperties(name);
    }

    // Step 3.2: Create instances from both type and instance skeletons.
    // skeleton_order_ preserves registration order: window.instance is registered
    // first (by generate-entry.js), so it runs before other BOM singletons and
    // writes all Chrome-order keys to the global before they can be pre-empted.
    LEAPVM_LOG_DEBUG("[skeleton] [Phase3.2] Creating instances...");
    for (const auto& name : skeleton_order_) {
        const auto& skeleton = skeletons_.at(name);

        if (IsTypeSkeleton(skeleton)) {
            // Legacy mode: type skeleton with instanceName (can be phased out)
            if (!skeleton.instance_name.empty()) {
                LEAPVM_LOG_DEBUG("[skeleton] [Phase3.2] Creating instance from type skeleton: %s", name.c_str());
                CreateInstance(name);
            }
        } else if (IsInstanceSkeleton(skeleton)) {
            // New mode: dedicated instance skeleton
            LEAPVM_LOG_DEBUG("[skeleton] [Phase3.2] Creating instance from instance skeleton: %s", name.c_str());
            CreateInstanceFromInstanceSkeleton(name);
        }
    }

    // Step 3.3: Expose constructors for all type skeletons that declare expose_ctor.
    // Must run unconditionally after Phase 3.2: Window.instance processing overwrites
    // constructors like Navigator/HTMLDocument with dispatch stubs. Phase 3.3 restores
    // them to proper constructors with correct prototype chains.
    // Note: ExposeTypeConstructorIfNeeded checks expose_ctor / ctor_name internally.
    LEAPVM_LOG_DEBUG("[skeleton] [Phase3.3] Exposing constructors for type skeletons...");
    for (const auto& name : skeleton_order_) {
        const auto& skeleton = skeletons_.at(name);
        if (!IsTypeSkeleton(skeleton)) continue;
        if (!skeleton.instance_name.empty()) continue;

        ExposeTypeConstructorIfNeeded(name);
    }
}

DispatchMeta* SkeletonRegistry::CreateDispatchMeta(const std::string& obj,
                                                   const std::string& prop,
                                                   const std::string& type,
                                                   bool brand_check,
                                                   const std::string& brand) {
    auto meta = std::make_unique<DispatchMeta>(obj, prop, type, brand_check, brand);
    DispatchMeta* ptr = meta.get();
    dispatch_metas_.push_back(std::move(meta));
    return ptr;
}

void SkeletonRegistry::CreateTemplate(const std::string& name) {
    const ObjectSkeleton& skeleton = skeletons_[name];
    v8::Local<v8::FunctionTemplate> tmpl = v8::FunctionTemplate::New(isolate_);

    // Use ctor_name (e.g., "Window") instead of internal name (e.g., "Window.type")
    // for correct prototype chain display
    std::string class_name = skeleton.ctor_name.empty() ? skeleton.name : skeleton.ctor_name;
    tmpl->SetClassName(V8String(isolate_, class_name));

    // Generic constructor init for constructible skeleton types:
    // ensure instances created via `new Xxx()` receive a brand tag just like
    // instances created through createSkeletonInstance()/CreateInstanceByCtorName().
    if (!skeleton.ctor_illegal && !skeleton.ctor_name.empty()) {
        v8::Local<v8::External> self_ext = v8::External::New(isolate_, this);
        tmpl->SetCallHandler(ConstructibleTypeConstructorCallback, self_ext);
    }

    templates_[name].Reset(isolate_, tmpl);

    LEAPVM_LOG_DEBUG("[skeleton] [templates] created %s (className: %s)",
                     name.c_str(), class_name.c_str());
}

std::string SkeletonRegistry::FindSkeletonName(const std::string& ctor_name) {
    // Try exact match first
    if (skeletons_.count(ctor_name)) {
        return ctor_name;
    }

    // Try with .type suffix (common case: super_type="EventTarget" should find "EventTarget.type")
    std::string with_type_suffix = ctor_name + ".type";
    if (skeletons_.count(with_type_suffix)) {
        return with_type_suffix;
    }

    // Not found
    return "";
}

bool SkeletonRegistry::HasInstanceSkeletonForType(const std::string& type_name) const {
    if (type_name.empty()) return false;

    for (const auto& pair : skeletons_) {
        const ObjectSkeleton& skeleton = pair.second;
        if (!IsInstanceSkeleton(skeleton)) continue;

        if (skeleton.super_type == type_name) {
            return true;
        }
    }
    return false;
}

void SkeletonRegistry::ExposeTypeConstructorIfNeeded(const std::string& name) {
    auto it = skeletons_.find(name);
    if (it == skeletons_.end()) return;

    const ObjectSkeleton& skeleton = it->second;
    if (!skeleton.expose_ctor || skeleton.ctor_name.empty()) {
        return;
    }

    v8::Local<v8::FunctionTemplate> tmpl = GetTemplate(name);
    if (tmpl.IsEmpty()) return;

    auto context = context_.Get(isolate_);
    v8::Local<v8::Function> ctor;
    if (!tmpl->GetFunction(context).ToLocal(&ctor) || ctor.IsEmpty()) {
        return;
    }

    v8::Local<v8::Value> proto_val;
    (void)ctor->Get(context, V8String(isolate_, "prototype")).ToLocal(&proto_val);

    v8::Local<v8::Function> exposed_ctor = ctor;
    if (skeleton.ctor_illegal) {
        exposed_ctor = v8::Function::New(
            context, IllegalConstructorCallback,
            V8String(isolate_, skeleton.ctor_name)).ToLocalChecked();
        exposed_ctor->SetName(V8String(isolate_, skeleton.ctor_name));
        if (!proto_val.IsEmpty() && proto_val->IsObject()) {
            exposed_ctor->Set(context, V8String(isolate_, "prototype"), proto_val).Check();
            proto_val.As<v8::Object>()
                ->Set(context, V8String(isolate_, "constructor"), exposed_ctor).Check();
        }
    } else if (!proto_val.IsEmpty() && proto_val->IsObject()) {
        proto_val.As<v8::Object>()
            ->Set(context, V8String(isolate_, "constructor"), exposed_ctor).Check();
    }

    DefineGlobalProperty(skeleton.ctor_name, exposed_ctor);
    LEAPVM_LOG_DEBUG("[skeleton] [Phase3.3] Exposed constructor '%s' from '%s'%s",
                     skeleton.ctor_name.c_str(),
                     name.c_str(),
                     skeleton.ctor_illegal ? " [Illegal]" : "");
}

void SkeletonRegistry::SetupInheritanceRecursive(const std::string& name,
                                                  std::set<std::string>& processed) {
    // Skip if already processed
    if (processed.count(name)) {
        return;
    }

    // Mark as processed immediately to prevent infinite recursion
    processed.insert(name);

    auto it = skeletons_.find(name);
    if (it == skeletons_.end()) {
        LEAPVM_LOG_WARN("[skeleton] Skeleton not found: %s", name.c_str());
        return;
    }

    const ObjectSkeleton& skeleton = it->second;

    // If has super_type, recursively process parent first
    if (!skeleton.super_type.empty()) {
        std::string parent_skeleton_name = FindSkeletonName(skeleton.super_type);
        if (!parent_skeleton_name.empty()) {
            SetupInheritanceRecursive(parent_skeleton_name, processed);
        } else {
            LEAPVM_LOG_WARN("[skeleton] Parent skeleton not found for super_type: %s (required by %s)",
                            skeleton.super_type.c_str(), name.c_str());
        }
    }

    // Now set up this type's inheritance
    SetupInheritance(name);
}

void SkeletonRegistry::SetupInheritance(const std::string& name) {
    const ObjectSkeleton& skeleton = skeletons_[name];

    // If no super_type specified, no inheritance needed
    if (skeleton.super_type.empty()) {
        LEAPVM_LOG_DEBUG("[skeleton] [%s] No super class, skipping inheritance", name.c_str());
        return;
    }

    // Find parent skeleton name (may need to add .type suffix)
    std::string parent_skeleton_name = FindSkeletonName(skeleton.super_type);
    if (parent_skeleton_name.empty()) {
        LEAPVM_LOG_ERROR("[skeleton] Parent skeleton not found for super_type: %s (required by %s)",
                         skeleton.super_type.c_str(), name.c_str());
        return;
    }

    v8::Local<v8::FunctionTemplate> parent_tmpl = GetTemplate(parent_skeleton_name);
    v8::Local<v8::FunctionTemplate> child_tmpl = GetTemplate(name);

    if (parent_tmpl.IsEmpty()) {
        LEAPVM_LOG_ERROR("[skeleton] Parent template not found: %s (required by %s)",
                         parent_skeleton_name.c_str(), name.c_str());
        return;
    }

    if (child_tmpl.IsEmpty()) {
        LEAPVM_LOG_ERROR("[skeleton] Child template not found: %s", name.c_str());
        return;
    }

    // Set up inheritance
    child_tmpl->Inherit(parent_tmpl);

    LEAPVM_LOG_INFO("[skeleton] [inherit] %s extends %s", name.c_str(), parent_skeleton_name.c_str());
}

void SkeletonRegistry::DefineProperties(const std::string& name) {
    const ObjectSkeleton& skeleton = skeletons_[name];
    v8::Local<v8::FunctionTemplate> tmpl = GetTemplate(name);
    if (tmpl.IsEmpty()) return;

    LEAPVM_LOG_DEBUG("[skeleton] [%s] Defining properties...", name.c_str());

    auto context = context_.Get(isolate_);
    auto make_meta = [this](const std::string& obj,
                            const std::string& prop,
                            const std::string& type,
                            bool brand_check,
                            const std::string& brand) {
        return CreateDispatchMeta(obj, prop, type, brand_check, brand);
    };

    for (const auto& prop : skeleton.properties) {
        v8::Local<v8::Template> target;

        if (prop->owner == PropertyOwner::CONSTRUCTOR) {
            target = tmpl;
        } else if (prop->owner == PropertyOwner::PROTOTYPE) {
            target = tmpl->PrototypeTemplate();
        } else {
            // INSTANCE properties
            // For Window, skip - we'll add them manually in CreateInstance
            // because Window reuses existing global object instead of creating new instance
            if (name == "Window") {
                continue;
            }
            target = tmpl->InstanceTemplate();
        }

        SkeletonBuilder::AddProperty(isolate_, context, target, prop.get(), make_meta);
    }

    // Install symbol-key interceptor on InstanceTemplate for all non-Window skeletons.
    // Keep kNone so existing symbol properties (e.g. @@toStringTag) still pass through
    // this interceptor; string keys are immediately ignored in SkeletonSymbolNamedGetter.
    if (name != "Window") {
        v8::NamedPropertyHandlerConfiguration cfg(
            SkeletonSymbolNamedGetter,
            nullptr,  // setter
            nullptr,  // query
            nullptr,  // deleter
            nullptr,  // enumerator
            v8::Local<v8::Value>(),
            v8::PropertyHandlerFlags::kNone);
        tmpl->InstanceTemplate()->SetHandler(cfg);
    }

    // Proto-only hidden ctor nodes (mixins like WindowProperties) should not
    // expose an own prototype.constructor property.
    if (!skeleton.expose_ctor && skeleton.instance_name.empty()) {
        v8::Local<v8::Function> ctor;
        if (tmpl->GetFunction(context).ToLocal(&ctor) && !ctor.IsEmpty()) {
            v8::Local<v8::Value> proto_val;
            if (ctor->Get(context, V8String(isolate_, "prototype")).ToLocal(&proto_val) &&
                proto_val->IsObject()) {
                proto_val.As<v8::Object>()
                    ->Delete(context, V8String(isolate_, "constructor"))
                    .FromMaybe(false);
            }
        }
    }

    if (name == "Event.type") {
        SetupEventIsTrustedProperty(tmpl);
    }
    // document.all is installed directly on the document instance object
    // (via InstallDocumentAllOnObject in CreateInstanceFromInstanceSkeleton /
    // ApplyInstanceSkeletonToObject) rather than on the InstanceTemplate.
    // Installing on InstanceTemplate causes a V8 fatal CHECK during property
    // access ("GetInstanceCallHandler() is undefined") for FunctionTemplates
    // created without an explicit call handler.

}

v8::PropertyAttribute SkeletonRegistry::BuildAttributeFlags(const PropertyDescriptor* prop,
                                                            bool writable_default) const {
    v8::PropertyAttribute attr = v8::None;

    bool writable = writable_default;
    if (prop->kind == PropertyKind::DATA) {
        writable = static_cast<const DataProperty*>(prop)->writable;
    }

    if (!writable) {
        attr = static_cast<v8::PropertyAttribute>(attr | v8::ReadOnly);
    }
    if (!prop->enumerable) {
        attr = static_cast<v8::PropertyAttribute>(attr | v8::DontEnum);
    }
    if (!prop->configurable) {
        attr = static_cast<v8::PropertyAttribute>(attr | v8::DontDelete);
    }

    return attr;
}

v8::Local<v8::Private> SkeletonRegistry::GetBrandKey() {
    return BrandKey(isolate_, brand_key_);
}

v8::Local<v8::Private> SkeletonRegistry::GetIsTrustedKey() {
    return ApiPrivateKey(isolate_, is_trusted_key_, "leapvm:isTrusted");
}

v8::Local<v8::Private> SkeletonRegistry::GetAllDocIdKey() {
    return ApiPrivateKey(isolate_, all_doc_id_key_, "leapvm:docId");
}

v8::Local<v8::Private> SkeletonRegistry::GetAllCollectionCacheKey() {
    return ApiPrivateKey(isolate_, all_collection_cache_key_, "leapvm:documentAllCache");
}

v8::Local<v8::String> SkeletonRegistry::BrandString(const std::string& brand) {
    return v8::String::NewFromUtf8(isolate_, brand.c_str(), v8::NewStringType::kNormal)
        .ToLocalChecked();
}

void SkeletonRegistry::SetBrand(v8::Local<v8::Object> target, const std::string& brand) {
    if (brand.empty()) return;
    auto context = context_.Get(isolate_);
    v8::Local<v8::Private> key = GetBrandKey();
    target->SetPrivate(context, key, BrandString(brand)).Check();
}

void SkeletonRegistry::EventConstructorCallback(
        const v8::FunctionCallbackInfo<v8::Value>& args) {
    InitConstructedInstanceBrand(args);

    if (!args.IsConstructCall()) {
        return;
    }
    auto* self = UnwrapRegistryFromCallbackData(args.GetIsolate(), args.Data());
    if (!self) {
        return;
    }
    v8::Isolate* isolate = args.GetIsolate();
    auto ctx = isolate->GetCurrentContext();
    args.This()->SetPrivate(ctx, self->GetIsTrustedKey(), v8::False(isolate)).Check();
}

void SkeletonRegistry::ConstructibleTypeConstructorCallback(
        const v8::FunctionCallbackInfo<v8::Value>& args) {
    InitConstructedInstanceBrand(args);
}

void SkeletonRegistry::IsTrustedGetterCallback(
        const v8::FunctionCallbackInfo<v8::Value>& args) {
    if (args.Data().IsEmpty() || !args.Data()->IsExternal()) {
        args.GetReturnValue().Set(v8::False(args.GetIsolate()));
        return;
    }
    auto* self = static_cast<SkeletonRegistry*>(
        args.Data().As<v8::External>()->Value());
    v8::Isolate* isolate = args.GetIsolate();
    if (!self) {
        args.GetReturnValue().Set(v8::False(isolate));
        return;
    }
    auto ctx = isolate->GetCurrentContext();
    v8::Local<v8::Value> value;
    if (args.This()->GetPrivate(ctx, self->GetIsTrustedKey()).ToLocal(&value) &&
        value->IsBoolean()) {
        args.GetReturnValue().Set(value);
        return;
    }
    args.GetReturnValue().Set(v8::False(isolate));
}

void SkeletonRegistry::SetupEventIsTrustedProperty(v8::Local<v8::FunctionTemplate> tmpl) {
    if (tmpl.IsEmpty()) {
        return;
    }
    (void)GetIsTrustedKey();
    v8::Local<v8::External> self_ext = v8::External::New(isolate_, this);
    tmpl->SetCallHandler(EventConstructorCallback, self_ext);

    v8::Local<v8::FunctionTemplate> getter_tmpl =
        v8::FunctionTemplate::New(isolate_, IsTrustedGetterCallback, self_ext);
    tmpl->InstanceTemplate()->SetAccessorProperty(
        V8String(isolate_, "isTrusted"),
        getter_tmpl,
        v8::Local<v8::FunctionTemplate>(),
        static_cast<v8::PropertyAttribute>(v8::DontDelete));
}

void SkeletonRegistry::DefineGlobalProperty(const std::string& key,
                                            v8::Local<v8::Value> value) {
    auto context = context_.Get(isolate_);
    v8::Local<v8::Object> global_proxy = context->Global();
    v8::Local<v8::String> name = V8String(isolate_, key);

    global_proxy->DefineOwnProperty(context, name, value).Check();

    v8::Local<v8::Value> proto_val = global_proxy->GetPrototype();
    if (!proto_val.IsEmpty() && proto_val->IsObject()) {
        proto_val.As<v8::Object>()->DefineOwnProperty(context, name, value).Check();
    }
}

void SkeletonRegistry::AddPropertyToObject(v8::Local<v8::Object> target,
                                           const PropertyDescriptor* prop) {
    auto context = context_.Get(isolate_);
    v8::Local<v8::Object> global_proxy = context->Global();
    bool is_global_proxy = target->StrictEquals(global_proxy);

    switch (prop->kind) {
    case PropertyKind::DATA: {
        const auto* data_prop = static_cast<const DataProperty*>(prop);
        v8::Local<v8::Value> value;

        if (data_prop->value_type == "string") {
            value = v8::String::NewFromUtf8(
                isolate_, data_prop->value.c_str(), v8::NewStringType::kNormal)
                .ToLocalChecked();
        } else if (data_prop->value_type == "number") {
            value = v8::Number::New(isolate_, std::stod(data_prop->value));
        } else if (data_prop->value_type == "boolean") {
            value = v8::Boolean::New(isolate_, data_prop->value == "true");
        } else if (data_prop->value_type == "null") {
            value = v8::Null(isolate_);
        } else {
            value = v8::Undefined(isolate_);
        }

        v8::Local<v8::Name> name = ToPropertyName(isolate_, prop->name);

        if (is_global_proxy) {
            // For global proxy, use CreateDataProperty to bypass NamedPropertyHandler
            // (same approach as vm_instance.cc uses for window/self/etc)
            target->CreateDataProperty(context, name, value).Check();
        } else {
            auto attr = BuildAttributeFlags(prop, data_prop->writable);
            target->DefineOwnProperty(context, name, value, attr).Check();
        }
        break;
    }
    case PropertyKind::METHOD: {
        const auto* method_prop = static_cast<const MethodProperty*>(prop);
        DispatchMeta* meta = CreateDispatchMeta(
            method_prop->dispatch_obj, method_prop->dispatch_prop, "apply",
            method_prop->brand_check, method_prop->brand);
        v8::Local<v8::External> data = v8::External::New(isolate_, meta);
        v8::Local<v8::FunctionTemplate> fn_tmpl =
            v8::FunctionTemplate::New(isolate_, DispatchBridge::StubCallback, data);
        v8::Local<v8::Name> prop_name = ToPropertyName(isolate_, prop->name);
        v8::Local<v8::String> fn_name = V8String(isolate_, prop->name);
        if (prop->name == "@@iterator" &&
            IteratorNameShouldBeValues(method_prop->dispatch_obj)) {
            // Browser iterator functions typically expose name "values".
            fn_name = V8String(isolate_, "values");
        }
        fn_tmpl->SetClassName(fn_name);
        // Keep parity with browser Web API methods: non-constructible, no own prototype.
        fn_tmpl->RemovePrototype();

        if (method_prop->length >= 0) {
            fn_tmpl->SetLength(method_prop->length);
        }

        v8::Local<v8::Function> fn =
            fn_tmpl->GetFunction(context).ToLocalChecked();
        fn->SetName(fn_name);
        if (is_global_proxy) {
            target->CreateDataProperty(context, prop_name, fn).Check();
        } else {
            auto attr = BuildAttributeFlags(prop);
            target->DefineOwnProperty(context, prop_name, fn, attr).Check();
        }
        break;
    }
    case PropertyKind::ACCESSOR: {
        const auto* accessor_prop = static_cast<const AccessorProperty*>(prop);
        v8::Local<v8::Function> getter_fn;
        v8::Local<v8::Function> setter_fn;

        if (accessor_prop->has_getter) {
            DispatchMeta* getter_meta = CreateDispatchMeta(
                accessor_prop->getter_obj, accessor_prop->getter_prop, "get",
                accessor_prop->brand_check, accessor_prop->brand);
            v8::Local<v8::External> getter_data = v8::External::New(isolate_, getter_meta);
            v8::Local<v8::FunctionTemplate> getter_tmpl =
                v8::FunctionTemplate::New(isolate_, DispatchBridge::StubCallback, getter_data);
            getter_fn = getter_tmpl->GetFunction(context).ToLocalChecked();
        }

        if (accessor_prop->has_setter) {
            DispatchMeta* setter_meta = CreateDispatchMeta(
                accessor_prop->setter_obj, accessor_prop->setter_prop, "set",
                accessor_prop->brand_check, accessor_prop->brand);
            v8::Local<v8::External> setter_data = v8::External::New(isolate_, setter_meta);
            v8::Local<v8::FunctionTemplate> setter_tmpl =
                v8::FunctionTemplate::New(isolate_, DispatchBridge::StubCallback, setter_data);
            setter_fn = setter_tmpl->GetFunction(context).ToLocalChecked();
        }

        v8::Local<v8::Name> name = ToPropertyName(isolate_, prop->name);
        if (is_global_proxy) {
            // For global, use default attributes (no attr parameter)
            target->SetAccessorProperty(name, getter_fn, setter_fn);
        } else {
            auto attr = BuildAttributeFlags(prop);
            target->SetAccessorProperty(name, getter_fn, setter_fn, attr);
        }
        break;
    }
    }
}

void SkeletonRegistry::CreateInstance(const std::string& name) {
    const ObjectSkeleton& skeleton = skeletons_[name];
    v8::Local<v8::FunctionTemplate> tmpl = GetTemplate(name);
    if (tmpl.IsEmpty()) return;

    auto context = context_.Get(isolate_);
    v8::Local<v8::Function> ctor;
    (void)tmpl->GetFunction(context).ToLocal(&ctor);  // may remain empty if creation fails

    // Special-case Window: reuse existing global object.
    if (skeleton.name == "Window") {
        v8::Local<v8::Object> global_obj = context->Global();

        auto set_alias = [&](const char* name) {
            v8::Local<v8::String> key = V8String(isolate_, name);
            global_obj->CreateDataProperty(context, key, global_obj).Check();
        };

        set_alias("window");
        set_alias("self");
        set_alias("top");
        set_alias("parent");
        set_alias("frames");

        // First, add prototype properties to Window.prototype
        v8::Local<v8::Value> proto_val;
        if (ctor->Get(context, V8String(isolate_, "prototype")).ToLocal(&proto_val) &&
            proto_val->IsObject()) {
            v8::Local<v8::Object> proto_obj = proto_val.As<v8::Object>();

            for (const auto& prop : skeleton.properties) {
                if (prop->owner == PropertyOwner::PROTOTYPE) {
                    AddPropertyToObject(proto_obj, prop.get());
                }
            }

            // Set the prototype chain: window.__proto__ = Window.prototype
            // NOTE: Do NOT use SetPrototype on global proxy - it clears properties!
            // Instead, get the real global object and set prototype on it
            v8::Local<v8::Value> real_global_val = global_obj->GetPrototype();
            if (!real_global_val.IsEmpty() && real_global_val->IsObject()) {
                v8::Local<v8::Object> real_global = real_global_val.As<v8::Object>();
                real_global->SetPrototype(context, proto_obj).Check();
            }

            // Now add instance properties directly using CreateDataProperty
            // to bypass NamedPropertyHandler (similar to how window/self/etc are set)
            for (const auto& prop : skeleton.properties) {
                if (prop->owner == PropertyOwner::INSTANCE) {
                    AddPropertyToObject(global_obj, prop.get());
                }
            }
        }

        // Ensure window.navigator alias points to the global navigator instance (if any).
        v8::Local<v8::String> navigator_name = V8String(isolate_, "navigator");
        v8::Local<v8::Value> navigator_val;
        if (context->Global()->Get(context, navigator_name).ToLocal(&navigator_val)) {
            global_obj->CreateDataProperty(context, navigator_name, navigator_val).Check();
        }

        // Brand tag for Illegal invocation checks.
        SetBrand(global_obj, skeleton.brand.empty() ? skeleton.name : skeleton.brand);
        v8::Local<v8::Value> proto_val2 = global_obj->GetPrototype();
        if (!proto_val2.IsEmpty() && proto_val2->IsObject()) {
            SetBrand(proto_val2.As<v8::Object>(), skeleton.brand.empty() ? skeleton.name : skeleton.brand);
        }

        if (skeleton.expose_ctor && !skeleton.ctor_name.empty() && !ctor.IsEmpty()) {
            v8::Local<v8::Value> proto_val3;
            (void)ctor->Get(context, V8String(isolate_, "prototype")).ToLocal(&proto_val3);
            v8::Local<v8::Function> exposed_ctor = ctor;
            if (skeleton.ctor_illegal) {
                exposed_ctor = v8::Function::New(
                    context, IllegalConstructorCallback,
                    V8String(isolate_, skeleton.name)).ToLocalChecked();
                exposed_ctor->SetName(V8String(isolate_, skeleton.name));
                if (!proto_val3.IsEmpty() && proto_val3->IsObject()) {
                    exposed_ctor->Set(context, V8String(isolate_, "prototype"), proto_val3).Check();
                    proto_val3.As<v8::Object>()
                        ->Set(context, V8String(isolate_, "constructor"), exposed_ctor).Check();
                }
            }
            DefineGlobalProperty(skeleton.ctor_name, exposed_ctor);
        }

        LEAPVM_LOG_INFO("[skeleton] Window bound to existing global object");
        return;
    }

    // Normal objects.
    if (skeleton.instance_name.empty() && !skeleton.expose_ctor) {
        // Proto-only nodes (e.g., WindowProperties) - skip instance/ctor exposure.
        return;
    }

    v8::Local<v8::Object> instance;
    if (skeleton.ctor_illegal) {
        // Bypass calling into user-visible constructor: create via InstanceTemplate.
        v8::Local<v8::ObjectTemplate> itmpl = tmpl->InstanceTemplate();
        if (!itmpl.IsEmpty()) {
            (void)itmpl->NewInstance(context).ToLocal(&instance);
        }
    } else if (!ctor.IsEmpty()) {
        (void)ctor->NewInstance(context).ToLocal(&instance);
    }
    if (instance.IsEmpty()) {
        return;
    }

    if (!skeleton.instance_name.empty()) {
        DefineGlobalProperty(skeleton.instance_name, instance);
        LEAPVM_LOG_INFO("[skeleton] Created global %s (%s)",
                        skeleton.instance_name.c_str(), name.c_str());

        // Store instance in leapenv.nativeInstances so JS can access the singleton
        // even after window.instance.skeleton overwrites the global accessor.
        {
            v8::Local<v8::String> leapenv_key = V8String(isolate_, "leapenv");
            v8::Local<v8::Value> leapenv_val;
            if (context->Global()->Get(context, leapenv_key).ToLocal(&leapenv_val)
                    && leapenv_val->IsObject()) {
                v8::Local<v8::Object> leapenv_obj = leapenv_val.As<v8::Object>();
                v8::Local<v8::String> ni_key = V8String(isolate_, "nativeInstances");
                v8::Local<v8::Value> ni_val;
                v8::Local<v8::Object> ni_obj;
                if (!leapenv_obj->Get(context, ni_key).ToLocal(&ni_val)
                        || !ni_val->IsObject()) {
                    ni_obj = v8::Object::New(isolate_);
                    leapenv_obj->Set(context, ni_key, ni_obj).Check();
                } else {
                    ni_obj = ni_val.As<v8::Object>();
                }
                ni_obj->Set(context,
                            V8String(isolate_, skeleton.instance_name),
                            instance).Check();
            }
        }
    }

    // Brand tag for Illegal invocation checks.
    SetBrand(instance, skeleton.brand.empty() ? skeleton.name : skeleton.brand);

    if (!skeleton.ctor_name.empty() && !ctor.IsEmpty()) {
        v8::Local<v8::Value> proto_val;
        (void)ctor->Get(context, V8String(isolate_, "prototype")).ToLocal(&proto_val);
        v8::Local<v8::Function> exposed_ctor = ctor;
        if (skeleton.ctor_illegal) {
            exposed_ctor = v8::Function::New(
                context, IllegalConstructorCallback,
                V8String(isolate_, skeleton.name)).ToLocalChecked();
            exposed_ctor->SetName(V8String(isolate_, skeleton.name));
            if (!proto_val.IsEmpty() && proto_val->IsObject()) {
                exposed_ctor->Set(context, V8String(isolate_, "prototype"), proto_val).Check();
                proto_val.As<v8::Object>()
                    ->Set(context, V8String(isolate_, "constructor"), exposed_ctor).Check();
            }
        } else if (!proto_val.IsEmpty() && proto_val->IsObject()) {
            // Ensure constructor points back.
            proto_val.As<v8::Object>()
                ->Set(context, V8String(isolate_, "constructor"), exposed_ctor).Check();
        }
        if (skeleton.expose_ctor) {
            DefineGlobalProperty(skeleton.ctor_name, exposed_ctor);
            LEAPVM_LOG_INFO("[skeleton] Exposed global %s (constructor)%s",
                            skeleton.ctor_name.c_str(),
                            skeleton.ctor_illegal ? " [Illegal]" : "");
        }
    }
}

v8::Local<v8::Object> SkeletonRegistry::CreateInstanceByCtorName(const std::string& ctor_name) {
    auto context = context_.Get(isolate_);

    for (const auto& pair : skeletons_) {
        const ObjectSkeleton& skeleton = pair.second;
        if (skeleton.ctor_name != ctor_name) {
            continue;
        }

        v8::Local<v8::FunctionTemplate> tmpl = GetTemplate(skeleton.name);
        if (tmpl.IsEmpty()) {
            return v8::Local<v8::Object>();
        }

        v8::Local<v8::Function> ctor;
        (void)tmpl->GetFunction(context).ToLocal(&ctor);
        v8::Local<v8::Object> instance;

        if (skeleton.name == "Window") {
            v8::Local<v8::Object> global_obj = context->Global();
            SetBrand(global_obj, skeleton.brand.empty() ? skeleton.name : skeleton.brand);
            return global_obj;
        }

        if (skeleton.ctor_illegal) {
            v8::Local<v8::ObjectTemplate> itmpl = tmpl->InstanceTemplate();
            if (!itmpl.IsEmpty()) {
                (void)itmpl->NewInstance(context).ToLocal(&instance);
            }
        } else if (!ctor.IsEmpty()) {
            (void)ctor->NewInstance(context).ToLocal(&instance);
        }

        if (instance.IsEmpty()) {
            return v8::Local<v8::Object>();
        }

        SetBrand(instance, skeleton.brand.empty() ? skeleton.name : skeleton.brand);
        return instance;
    }

    return v8::Local<v8::Object>();
}

v8::Local<v8::Object> SkeletonRegistry::CreateTrustedEventInstance(
        const std::string& type,
        v8::Local<v8::Object> init) {
    auto ctx = context_.Get(isolate_);
    v8::Local<v8::FunctionTemplate> tmpl = GetTemplate("Event.type");
    if (tmpl.IsEmpty()) {
        return v8::Local<v8::Object>();
    }

    v8::Local<v8::Function> ctor;
    if (!tmpl->GetFunction(ctx).ToLocal(&ctor) || ctor.IsEmpty()) {
        return v8::Local<v8::Object>();
    }

    v8::Local<v8::Value> argv[2];
    argv[0] = V8String(isolate_, type);
    int argc = 1;
    if (!init.IsEmpty()) {
        argv[1] = init;
        argc = 2;
    }

    v8::Local<v8::Object> event;
    if (!ctor->NewInstance(ctx, argc, argv).ToLocal(&event) || event.IsEmpty()) {
        return v8::Local<v8::Object>();
    }

    event->SetPrivate(ctx, GetIsTrustedKey(), v8::True(isolate_)).Check();
    return event;
}

std::string SkeletonRegistry::GetBrandByCtorName(const std::string& ctor_name) const {
    for (const auto& pair : skeletons_) {
        const ObjectSkeleton& skeleton = pair.second;
        if (skeleton.ctor_name == ctor_name) {
            return skeleton.brand.empty() ? skeleton.name : skeleton.brand;
        }
    }
    return ctor_name;
}

std::string SkeletonRegistry::ResolveElementCtorName(const std::string& tag_name) const {
    const std::string upper = tag_name;
    if (upper == "DIV") return "HTMLDivElement";
    if (upper == "SPAN") return "HTMLSpanElement";
    if (upper == "A") return "HTMLAnchorElement";
    if (upper == "CANVAS") return "HTMLCanvasElement";
    if (upper == "IFRAME") return "HTMLIFrameElement";
    return "HTMLElement";
}

v8::Local<v8::Object> SkeletonRegistry::WrapDomElementForAll(uint32_t doc_id, uint32_t node_id) {
    if (dom_manager_ == nullptr) {
        return v8::Local<v8::Object>();
    }
    const uint32_t generation = dom_manager_->GetNodeGeneration(doc_id, node_id);
    if (generation == 0) {
        return v8::Local<v8::Object>();
    }

    std::string ctor_name = ResolveElementCtorName(dom_manager_->GetNodeTagName(doc_id, node_id));
    auto ctx = context_.Get(isolate_);

    if (vm_instance_ != nullptr) {
        v8::Local<v8::Object> cached = vm_instance_->GetCachedDomWrapper(
            ctx, doc_id, node_id, generation, ctor_name);
        if (!cached.IsEmpty()) {
            return cached;
        }
    }

    v8::Local<v8::Object> wrapped = CreateInstanceByCtorName(ctor_name);
    if (wrapped.IsEmpty() && ctor_name != "HTMLElement") {
        wrapped = CreateInstanceByCtorName("HTMLElement");
    }
    if (wrapped.IsEmpty()) {
        wrapped = CreateInstanceByCtorName("HTMLUnknownElement");
    }
    if (wrapped.IsEmpty()) {
        return v8::Local<v8::Object>();
    }

    if (vm_instance_ != nullptr) {
        vm_instance_->CacheDomWrapper(isolate_, doc_id, node_id, generation, ctor_name, wrapped);
    }
    return wrapped;
}

void SkeletonRegistry::DocumentAllGetterCallback(
        const v8::FunctionCallbackInfo<v8::Value>& args) {
    if (args.Data().IsEmpty() || !args.Data()->IsExternal()) {
        return;
    }
    auto* self = static_cast<SkeletonRegistry*>(args.Data().As<v8::External>()->Value());
    if (!self || self->dom_manager_ == nullptr) {
        return;
    }

    auto* isolate = args.GetIsolate();
    auto ctx = isolate->GetCurrentContext();
    v8::Local<v8::Object> document_obj = args.This();

    v8::Local<v8::Value> cached_val;
    if (document_obj->GetPrivate(ctx, self->GetAllCollectionCacheKey()).ToLocal(&cached_val) &&
        cached_val->IsObject()) {
        args.GetReturnValue().Set(cached_val);
        return;
    }

    uint32_t doc_id = 1;
    v8::Local<v8::Value> doc_id_val;
    if (document_obj->GetPrivate(ctx, self->GetAllDocIdKey()).ToLocal(&doc_id_val) &&
        doc_id_val->IsUint32()) {
        doc_id = doc_id_val.As<v8::Uint32>()->Value();
    }

    self->InitHTMLAllCollectionTemplate();
    v8::Local<v8::ObjectTemplate> tpl = self->html_all_collection_tpl_.Get(isolate);
    if (tpl.IsEmpty()) {
        return;
    }
    v8::Local<v8::Object> collection;
    if (!tpl->NewInstance(ctx).ToLocal(&collection) || collection.IsEmpty()) {
        return;
    }

    // Install 'length' on the instance (not template) to avoid MarkAsUndetectable +
    // template API accessor V8 CHECK crash.
    v8::Local<v8::External> self_ext_for_len = v8::External::New(isolate, self);
    collection->SetNativeDataProperty(ctx, V8String(isolate, "length"),
                                      AllCollectionLengthNativeGetter, nullptr,
                                      self_ext_for_len,
                                      static_cast<v8::PropertyAttribute>(v8::DontDelete)).Check();
    self->InstallHTMLAllCollectionMethodsOnObject(collection);
    self->SetBrand(collection, "HTMLAllCollection");
    {
        v8::Local<v8::Value> ctor_val;
        if (ctx->Global()->Get(ctx, V8String(isolate, "HTMLAllCollection")).ToLocal(&ctor_val) &&
            ctor_val->IsObject()) {
            v8::Local<v8::Value> proto_val;
            if (ctor_val.As<v8::Object>()->Get(ctx, V8String(isolate, "prototype")).ToLocal(&proto_val) &&
                proto_val->IsObject()) {
                collection->SetPrototype(ctx, proto_val.As<v8::Object>()).Check();
            }
        }
        collection->DefineOwnProperty(
            ctx,
            v8::Symbol::GetToStringTag(isolate),
            V8String(isolate, "HTMLAllCollection"),
            static_cast<v8::PropertyAttribute>(v8::ReadOnly | v8::DontEnum)).Check();
    }

    v8::Local<v8::Private> dm_key = ApiPrivateKey(isolate, self->all_dm_key_, "leapvm:allDM");
    collection->SetPrivate(ctx, dm_key, v8::External::New(isolate, self->dom_manager_)).Check();
    collection->SetPrivate(ctx, self->GetAllDocIdKey(),
                           v8::Uint32::NewFromUnsigned(isolate, doc_id)).Check();

    document_obj->SetPrivate(ctx, self->GetAllCollectionCacheKey(), collection).Check();
    args.GetReturnValue().Set(collection);
}

// PropertyCallbackInfo 版本：用于 Object::SetNativeDataProperty
// static
void SkeletonRegistry::DocumentAllNativeGetter(
        v8::Local<v8::Name>,
        const v8::PropertyCallbackInfo<v8::Value>& info) {
    if (info.Data().IsEmpty() || !info.Data()->IsExternal()) {
        LEAPVM_LOG_WARN("[document.all] getter: data is empty or not External, returning undefined");
        return;
    }
    auto* self = static_cast<SkeletonRegistry*>(info.Data().As<v8::External>()->Value());
    if (!self || self->dom_manager_ == nullptr) {
        LEAPVM_LOG_WARN("[document.all] getter: self=%p dom_manager_=%p, returning undefined",
                        (void*)self, (void*)(self ? self->dom_manager_ : nullptr));
        return;
    }

    auto* isolate = info.GetIsolate();
    auto ctx = isolate->GetCurrentContext();
    v8::Local<v8::Object> document_obj = info.This();

    v8::Local<v8::Value> cached_val;
    if (document_obj->GetPrivate(ctx, self->GetAllCollectionCacheKey()).ToLocal(&cached_val) &&
        cached_val->IsObject()) {
        EmitSpecialNativeGetHookWithValue(isolate, ctx, "Document", "all", cached_val);
        info.GetReturnValue().Set(cached_val);
        return;
    }

    uint32_t doc_id = 1;
    v8::Local<v8::Value> doc_id_val;
    if (document_obj->GetPrivate(ctx, self->GetAllDocIdKey()).ToLocal(&doc_id_val) &&
        doc_id_val->IsUint32()) {
        doc_id = doc_id_val.As<v8::Uint32>()->Value();
    }

    self->InitHTMLAllCollectionTemplate();
    v8::Local<v8::ObjectTemplate> tpl = self->html_all_collection_tpl_.Get(isolate);
    if (tpl.IsEmpty()) {
        LEAPVM_LOG_WARN("[document.all] getter: html_all_collection_tpl_ is empty, returning undefined");
        return;
    }
    v8::Local<v8::Object> collection;
    if (!tpl->NewInstance(ctx).ToLocal(&collection) || collection.IsEmpty()) {
        LEAPVM_LOG_WARN("[document.all] getter: NewInstance failed, returning undefined");
        return;
    }

    // Install 'length' directly on the collection instance.
    // MarkAsUndetectable() + any template-level API accessor causes a V8 CHECK crash in
    // NewInstance(), so we install it here on the instance using Object::SetNativeDataProperty.
    v8::Local<v8::External> self_ext = v8::External::New(isolate, self);
    collection->SetNativeDataProperty(ctx, V8String(isolate, "length"),
                                      AllCollectionLengthNativeGetter, nullptr,
                                      self_ext,
                                      static_cast<v8::PropertyAttribute>(v8::DontDelete)).Check();
    self->InstallHTMLAllCollectionMethodsOnObject(collection);
    self->SetBrand(collection, "HTMLAllCollection");
    {
        v8::Local<v8::Value> ctor_val;
        if (ctx->Global()->Get(ctx, V8String(isolate, "HTMLAllCollection")).ToLocal(&ctor_val) &&
            ctor_val->IsObject()) {
            v8::Local<v8::Value> proto_val;
            if (ctor_val.As<v8::Object>()->Get(ctx, V8String(isolate, "prototype")).ToLocal(&proto_val) &&
                proto_val->IsObject()) {
                collection->SetPrototype(ctx, proto_val.As<v8::Object>()).Check();
            }
        }
        collection->DefineOwnProperty(
            ctx,
            v8::Symbol::GetToStringTag(isolate),
            V8String(isolate, "HTMLAllCollection"),
            static_cast<v8::PropertyAttribute>(v8::ReadOnly | v8::DontEnum)).Check();
    }

    v8::Local<v8::Private> dm_key = ApiPrivateKey(isolate, self->all_dm_key_, "leapvm:allDM");
    collection->SetPrivate(ctx, dm_key, v8::External::New(isolate, self->dom_manager_)).Check();
    collection->SetPrivate(ctx, self->GetAllDocIdKey(),
                           v8::Uint32::NewFromUnsigned(isolate, doc_id)).Check();

    document_obj->SetPrivate(ctx, self->GetAllCollectionCacheKey(), collection).Check();
    LEAPVM_LOG_DEBUG("[document.all] getter: returning HTMLAllCollection (doc_id=%u)", doc_id);
    EmitSpecialNativeGetHookWithValue(isolate, ctx, "Document", "all", collection);
    info.GetReturnValue().Set(collection);
}

void SkeletonRegistry::AllCollectionLengthGetterCallback(
        const v8::FunctionCallbackInfo<v8::Value>& args) {
    if (args.Data().IsEmpty() || !args.Data()->IsExternal()) {
        args.GetReturnValue().Set(0);
        return;
    }
    auto* self = static_cast<SkeletonRegistry*>(args.Data().As<v8::External>()->Value());
    if (!self) {
        args.GetReturnValue().Set(0);
        return;
    }
    auto* isolate = args.GetIsolate();
    auto ctx = isolate->GetCurrentContext();
    v8::Local<v8::Object> collection = args.This();

    v8::Local<v8::Private> dm_key = ApiPrivateKey(isolate, self->all_dm_key_, "leapvm:allDM");
    v8::Local<v8::Value> dm_val;
    if (!collection->GetPrivate(ctx, dm_key).ToLocal(&dm_val) || !dm_val->IsExternal()) {
        args.GetReturnValue().Set(0);
        return;
    }
    auto* dm = static_cast<leapvm::dom::DomManager*>(dm_val.As<v8::External>()->Value());
    uint32_t doc_id = 1;
    v8::Local<v8::Value> doc_id_val;
    if (collection->GetPrivate(ctx, self->GetAllDocIdKey()).ToLocal(&doc_id_val) &&
        doc_id_val->IsUint32()) {
        doc_id = doc_id_val.As<v8::Uint32>()->Value();
    }
    args.GetReturnValue().Set(static_cast<uint32_t>(dm->GetAllElementIds(doc_id).size()));
}

// PropertyCallbackInfo version for use with ObjectTemplate::SetNativeDataProperty
// (SetAccessorProperty + FunctionTemplate on standalone ObjectTemplate causes V8 CHECK crash)
// static
void SkeletonRegistry::AllCollectionLengthNativeGetter(
        v8::Local<v8::Name>,
        const v8::PropertyCallbackInfo<v8::Value>& info) {
    if (info.Data().IsEmpty() || !info.Data()->IsExternal()) {
        info.GetReturnValue().Set(0);
        return;
    }
    auto* self = static_cast<SkeletonRegistry*>(info.Data().As<v8::External>()->Value());
    if (!self) {
        info.GetReturnValue().Set(0);
        return;
    }
    auto* isolate = info.GetIsolate();
    auto ctx = isolate->GetCurrentContext();
    v8::Local<v8::Object> collection = info.This();

    v8::Local<v8::Private> dm_key = ApiPrivateKey(isolate, self->all_dm_key_, "leapvm:allDM");
    v8::Local<v8::Value> dm_val;
    if (!collection->GetPrivate(ctx, dm_key).ToLocal(&dm_val) || !dm_val->IsExternal()) {
        info.GetReturnValue().Set(0);
        return;
    }
    auto* dm = static_cast<leapvm::dom::DomManager*>(dm_val.As<v8::External>()->Value());
    uint32_t doc_id = 1;
    v8::Local<v8::Value> doc_id_val;
    if (collection->GetPrivate(ctx, self->GetAllDocIdKey()).ToLocal(&doc_id_val) &&
        doc_id_val->IsUint32()) {
        doc_id = doc_id_val.As<v8::Uint32>()->Value();
    }
    uint32_t length = static_cast<uint32_t>(dm->GetAllElementIds(doc_id).size());
    EmitSpecialNativeGetHookWithValue(isolate, ctx, "HTMLAllCollection", "length",
                                      v8::Uint32::NewFromUnsigned(isolate, length));
    info.GetReturnValue().Set(length);
}

void SkeletonRegistry::AllCollectionItemCallback(
        const v8::FunctionCallbackInfo<v8::Value>& args) {
    if (args.Data().IsEmpty() || !args.Data()->IsExternal()) {
        args.GetReturnValue().SetNull();
        return;
    }
    auto* self = static_cast<SkeletonRegistry*>(args.Data().As<v8::External>()->Value());
    if (!self) {
        args.GetReturnValue().SetNull();
        return;
    }
    v8::Isolate* isolate = args.GetIsolate();
    auto ctx = isolate->GetCurrentContext();
    v8::Local<v8::Object> collection = args.This();

    v8::Local<v8::Private> dm_key = ApiPrivateKey(isolate, self->all_dm_key_, "leapvm:allDM");
    v8::Local<v8::Value> dm_val;
    if (!collection->GetPrivate(ctx, dm_key).ToLocal(&dm_val) || !dm_val->IsExternal()) {
        args.GetReturnValue().SetNull();
        return;
    }
    auto* dm = static_cast<leapvm::dom::DomManager*>(dm_val.As<v8::External>()->Value());
    uint32_t doc_id = 1;
    v8::Local<v8::Value> doc_id_val;
    if (collection->GetPrivate(ctx, self->GetAllDocIdKey()).ToLocal(&doc_id_val) &&
        doc_id_val->IsUint32()) {
        doc_id = doc_id_val.As<v8::Uint32>()->Value();
    }

    if (args.Length() < 1) {
        args.GetReturnValue().SetNull();
        return;
    }

    // Legacy quirk: item(string) behaves like named lookup.
    if (args[0]->IsString()) {
        v8::String::Utf8Value key_utf8(isolate, args[0]);
        if (!*key_utf8) {
            args.GetReturnValue().SetNull();
            return;
        }
        uint32_t node_id = dm->FindElementByIdOrName(doc_id, std::string(*key_utf8));
        if (node_id == 0) {
            args.GetReturnValue().SetNull();
            return;
        }
        v8::Local<v8::Object> elem = self->WrapDomElementForAll(doc_id, node_id);
        if (elem.IsEmpty()) {
            args.GetReturnValue().SetNull();
        } else {
            args.GetReturnValue().Set(elem);
        }
        return;
    }

    double index_num = args[0]->NumberValue(ctx).FromMaybe(-1);
    if (!(index_num >= 0)) {
        args.GetReturnValue().SetNull();
        return;
    }
    uint32_t index = static_cast<uint32_t>(index_num);
    const auto ids = dm->GetAllElementIds(doc_id);
    if (index >= ids.size()) {
        args.GetReturnValue().SetNull();
        return;
    }
    v8::Local<v8::Object> elem = self->WrapDomElementForAll(doc_id, ids[index]);
    if (elem.IsEmpty()) {
        args.GetReturnValue().SetNull();
    } else {
        args.GetReturnValue().Set(elem);
    }
}

void SkeletonRegistry::AllCollectionNamedItemCallback(
        const v8::FunctionCallbackInfo<v8::Value>& args) {
    if (args.Data().IsEmpty() || !args.Data()->IsExternal()) {
        args.GetReturnValue().SetNull();
        return;
    }
    auto* self = static_cast<SkeletonRegistry*>(args.Data().As<v8::External>()->Value());
    if (!self) {
        args.GetReturnValue().SetNull();
        return;
    }
    v8::Isolate* isolate = args.GetIsolate();
    auto ctx = isolate->GetCurrentContext();
    v8::Local<v8::Object> collection = args.This();

    v8::Local<v8::Private> dm_key = ApiPrivateKey(isolate, self->all_dm_key_, "leapvm:allDM");
    v8::Local<v8::Value> dm_val;
    if (!collection->GetPrivate(ctx, dm_key).ToLocal(&dm_val) || !dm_val->IsExternal()) {
        args.GetReturnValue().SetNull();
        return;
    }
    auto* dm = static_cast<leapvm::dom::DomManager*>(dm_val.As<v8::External>()->Value());
    uint32_t doc_id = 1;
    v8::Local<v8::Value> doc_id_val;
    if (collection->GetPrivate(ctx, self->GetAllDocIdKey()).ToLocal(&doc_id_val) &&
        doc_id_val->IsUint32()) {
        doc_id = doc_id_val.As<v8::Uint32>()->Value();
    }

    if (args.Length() < 1) {
        args.GetReturnValue().SetNull();
        return;
    }
    v8::Local<v8::String> key_str;
    if (!args[0]->ToString(ctx).ToLocal(&key_str)) {
        args.GetReturnValue().SetNull();
        return;
    }
    v8::String::Utf8Value key_utf8(isolate, key_str);
    if (!*key_utf8) {
        args.GetReturnValue().SetNull();
        return;
    }

    uint32_t node_id = dm->FindElementByIdOrName(doc_id, std::string(*key_utf8));
    if (node_id == 0) {
        args.GetReturnValue().SetNull();
        return;
    }

    v8::Local<v8::Object> elem = self->WrapDomElementForAll(doc_id, node_id);
    if (elem.IsEmpty()) {
        args.GetReturnValue().SetNull();
    } else {
        args.GetReturnValue().Set(elem);
    }
}

void SkeletonRegistry::AllCollectionIteratorCallback(
        const v8::FunctionCallbackInfo<v8::Value>& args) {
    if (args.Data().IsEmpty() || !args.Data()->IsExternal()) {
        return;
    }
    auto* self = static_cast<SkeletonRegistry*>(args.Data().As<v8::External>()->Value());
    if (!self) {
        return;
    }
    v8::Isolate* isolate = args.GetIsolate();
    auto ctx = isolate->GetCurrentContext();
    v8::Local<v8::Object> collection = args.This();

    v8::Local<v8::Private> dm_key = ApiPrivateKey(isolate, self->all_dm_key_, "leapvm:allDM");
    v8::Local<v8::Value> dm_val;
    if (!collection->GetPrivate(ctx, dm_key).ToLocal(&dm_val) || !dm_val->IsExternal()) {
        return;
    }
    auto* dm = static_cast<leapvm::dom::DomManager*>(dm_val.As<v8::External>()->Value());
    uint32_t doc_id = 1;
    v8::Local<v8::Value> doc_id_val;
    if (collection->GetPrivate(ctx, self->GetAllDocIdKey()).ToLocal(&doc_id_val) &&
        doc_id_val->IsUint32()) {
        doc_id = doc_id_val.As<v8::Uint32>()->Value();
    }

    const auto ids = dm->GetAllElementIds(doc_id);
    v8::Local<v8::Array> snapshot = v8::Array::New(isolate, static_cast<int>(ids.size()));
    for (uint32_t i = 0; i < ids.size(); ++i) {
        v8::Local<v8::Object> elem = self->WrapDomElementForAll(doc_id, ids[i]);
        if (!elem.IsEmpty()) {
            snapshot->Set(ctx, i, elem).Check();
        }
    }

    v8::Local<v8::Value> iter_fn_val;
    if (!snapshot->Get(ctx, v8::Symbol::GetIterator(isolate)).ToLocal(&iter_fn_val) ||
        !iter_fn_val->IsFunction()) {
        return;
    }
    v8::Local<v8::Function> iter_fn = iter_fn_val.As<v8::Function>();
    v8::Local<v8::Value> iter;
    if (iter_fn->Call(ctx, snapshot, 0, nullptr).ToLocal(&iter)) {
        args.GetReturnValue().Set(iter);
    }
}

v8::Intercepted SkeletonRegistry::AllCollectionIndexedGetter(
        uint32_t index,
        const v8::PropertyCallbackInfo<v8::Value>& info) {
    if (info.Data().IsEmpty() || !info.Data()->IsExternal()) {
        return v8::Intercepted::kNo;
    }
    auto* self = static_cast<SkeletonRegistry*>(info.Data().As<v8::External>()->Value());
    if (!self) {
        return v8::Intercepted::kNo;
    }
    auto* isolate = info.GetIsolate();
    auto ctx = isolate->GetCurrentContext();
    v8::Local<v8::Object> collection = info.This();

    v8::Local<v8::Private> dm_key = ApiPrivateKey(isolate, self->all_dm_key_, "leapvm:allDM");
    v8::Local<v8::Value> dm_val;
    if (!collection->GetPrivate(ctx, dm_key).ToLocal(&dm_val) || !dm_val->IsExternal()) {
        return v8::Intercepted::kNo;
    }
    auto* dm = static_cast<leapvm::dom::DomManager*>(dm_val.As<v8::External>()->Value());

    uint32_t doc_id = 1;
    v8::Local<v8::Value> doc_id_val;
    if (collection->GetPrivate(ctx, self->GetAllDocIdKey()).ToLocal(&doc_id_val) &&
        doc_id_val->IsUint32()) {
        doc_id = doc_id_val.As<v8::Uint32>()->Value();
    }

    const auto ids = dm->GetAllElementIds(doc_id);
    if (index >= ids.size()) {
        return v8::Intercepted::kNo;
    }
    v8::Local<v8::Object> elem = self->WrapDomElementForAll(doc_id, ids[index]);
    if (!elem.IsEmpty()) {
        info.GetReturnValue().Set(elem);
        return v8::Intercepted::kYes;
    }
    return v8::Intercepted::kNo;
}

v8::Intercepted SkeletonRegistry::AllCollectionNamedGetter(
        v8::Local<v8::Name> name,
        const v8::PropertyCallbackInfo<v8::Value>& info) {
    if (name->IsSymbol() || info.Data().IsEmpty() || !info.Data()->IsExternal()) {
        return v8::Intercepted::kNo;
    }
    auto* self = static_cast<SkeletonRegistry*>(info.Data().As<v8::External>()->Value());
    if (!self) {
        return v8::Intercepted::kNo;
    }
    auto* isolate = info.GetIsolate();
    auto ctx = isolate->GetCurrentContext();
    v8::String::Utf8Value key_utf8(isolate, name);
    if (!*key_utf8) {
        return v8::Intercepted::kNo;
    }
    const std::string key(*key_utf8);
    if (key == "length") {
        return v8::Intercepted::kNo;
    }

    v8::Local<v8::Object> collection = info.This();
    v8::Local<v8::Private> dm_key = ApiPrivateKey(isolate, self->all_dm_key_, "leapvm:allDM");
    v8::Local<v8::Value> dm_val;
    if (!collection->GetPrivate(ctx, dm_key).ToLocal(&dm_val) || !dm_val->IsExternal()) {
        return v8::Intercepted::kNo;
    }
    auto* dm = static_cast<leapvm::dom::DomManager*>(dm_val.As<v8::External>()->Value());

    uint32_t doc_id = 1;
    v8::Local<v8::Value> doc_id_val;
    if (collection->GetPrivate(ctx, self->GetAllDocIdKey()).ToLocal(&doc_id_val) &&
        doc_id_val->IsUint32()) {
        doc_id = doc_id_val.As<v8::Uint32>()->Value();
    }
    const uint32_t node_id = dm->FindElementByIdOrName(doc_id, key);
    if (node_id == 0) {
        return v8::Intercepted::kNo;
    }
    v8::Local<v8::Object> elem = self->WrapDomElementForAll(doc_id, node_id);
    if (!elem.IsEmpty()) {
        info.GetReturnValue().Set(elem);
        return v8::Intercepted::kYes;
    }
    return v8::Intercepted::kNo;
}

void SkeletonRegistry::InitHTMLAllCollectionTemplate() {
    if (!html_all_collection_tpl_.IsEmpty()) {
        return;
    }

    (void)GetAllDocIdKey();
    (void)GetAllCollectionCacheKey();
    (void)ApiPrivateKey(isolate_, all_dm_key_, "leapvm:allDM");

    v8::Local<v8::ObjectTemplate> tpl = v8::ObjectTemplate::New(isolate_);
    // V8 requires undetectable objects to also have an instance call handler.
    // Without it, ObjectTemplate::NewInstance() fatal-CHECKs on "GetInstanceCallHandler()
    // is undefined". We set a handler that throws TypeError (matching browser behavior:
    // `document.all()` throws "not a function").
    tpl->SetCallAsFunctionHandler(
        [](const v8::FunctionCallbackInfo<v8::Value>& args) {
            auto* isolate = args.GetIsolate();
            isolate->ThrowException(v8::Exception::TypeError(
                v8::String::NewFromUtf8Literal(isolate, "document.all is not a function")));
        });
    tpl->MarkAsUndetectable();

    v8::Local<v8::External> self_ext = v8::External::New(isolate_, this);

    tpl->SetHandler(v8::IndexedPropertyHandlerConfiguration(
        AllCollectionIndexedGetter,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        self_ext,
        v8::PropertyHandlerFlags::kNone));

    tpl->SetHandler(v8::NamedPropertyHandlerConfiguration(
        AllCollectionNamedGetter,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        self_ext,
        v8::PropertyHandlerFlags::kOnlyInterceptStrings));

    // NOTE: Do NOT use SetNativeDataProperty or SetAccessorProperty on this template.
    // MarkAsUndetectable() combined with any API accessor on an ObjectTemplate causes
    // a V8 fatal CHECK ("GetInstanceCallHandler() is undefined") in NewInstance().
    // The 'length' property is installed on each collection INSTANCE after NewInstance()
    // via Object::SetNativeDataProperty (see DocumentAllNativeGetter / DocumentAllGetterCallback).

    html_all_collection_tpl_.Reset(isolate_, tpl);
}

void SkeletonRegistry::InstallHTMLAllCollectionMethodsOnObject(v8::Local<v8::Object> collection) {
    if (collection.IsEmpty()) {
        return;
    }
    auto ctx = context_.Get(isolate_);
    if (ctx.IsEmpty()) {
        return;
    }

    v8::Local<v8::External> self_ext = v8::External::New(isolate_, this);
    v8::Local<v8::Object> define_target = collection;
    v8::Local<v8::Value> ctor_val;
    if (ctx->Global()->Get(ctx, V8String(isolate_, "HTMLAllCollection")).ToLocal(&ctor_val) &&
        ctor_val->IsObject()) {
        v8::Local<v8::Value> proto_val;
        if (ctor_val.As<v8::Object>()->Get(ctx, V8String(isolate_, "prototype")).ToLocal(&proto_val) &&
            proto_val->IsObject()) {
            define_target = proto_val.As<v8::Object>();
        }
    }

    auto define_method = [&](v8::Local<v8::Name> key,
                             v8::FunctionCallback cb,
                             int length) {
        v8::Local<v8::FunctionTemplate> fn_tmpl =
            v8::FunctionTemplate::New(isolate_, cb, self_ext);
        v8::Local<v8::String> method_name;
        bool is_iterator_method = false;
        if (key->IsString()) {
            method_name = key.As<v8::String>();
        } else if (key->IsSymbol()) {
            v8::Local<v8::Symbol> symbol_key = key.As<v8::Symbol>();
            if (symbol_key->StrictEquals(v8::Symbol::GetIterator(isolate_))) {
                // Browser behavior: @@iterator function is named "values".
                method_name = V8String(isolate_, "values");
                is_iterator_method = true;
            }
        }
        // Keep iterator callback stable even if symbol identity checks vary.
        if (cb == AllCollectionIteratorCallback && method_name.IsEmpty()) {
            method_name = V8String(isolate_, "values");
            is_iterator_method = true;
        }
        if (!method_name.IsEmpty()) {
            fn_tmpl->SetClassName(method_name);
        }
        // Align with browser Web API methods: non-constructible, no own prototype.
        fn_tmpl->RemovePrototype();
        if (length >= 0) {
            fn_tmpl->SetLength(length);
        }
        v8::Local<v8::Function> fn;
        if (!fn_tmpl->GetFunction(ctx).ToLocal(&fn) || fn.IsEmpty()) {
            return;
        }
        define_target->DefineOwnProperty(
            ctx,
            key,
            fn,
            static_cast<v8::PropertyAttribute>(v8::DontEnum)).Check();
        if (!method_name.IsEmpty()) {
            // DefineOwnProperty on symbol keys may infer "@@iterator"; override to "values".
            fn->SetName(method_name);
            if (is_iterator_method) {
                // Force V8 to realize any lazy inferred function name first.
                v8::Local<v8::Value> _ignored_name;
                (void)fn->Get(ctx, V8String(isolate_, "name")).ToLocal(&_ignored_name);
                (void)fn->DefineOwnProperty(
                    ctx,
                    V8String(isolate_, "name"),
                    method_name,
                    static_cast<v8::PropertyAttribute>(v8::ReadOnly | v8::DontEnum))
                    .FromMaybe(false);
            }
        }
    };

    define_method(V8String(isolate_, "item"), AllCollectionItemCallback, 1);
    define_method(V8String(isolate_, "namedItem"), AllCollectionNamedItemCallback, 1);
    define_method(v8::Symbol::GetIterator(isolate_), AllCollectionIteratorCallback, 0);
}

void SkeletonRegistry::SetupDocumentAllProperty(v8::Local<v8::FunctionTemplate> tmpl) {
    // Intentionally empty: document.all is now installed directly on each document
    // instance via InstallDocumentAllOnObject(), called from CreateInstanceFromInstanceSkeleton
    // and ApplyInstanceSkeletonToObject. Installing on InstanceTemplate causes a V8 fatal
    // CHECK ("GetInstanceCallHandler() is undefined") when the property is accessed on an
    // instance of a FunctionTemplate created without an explicit call handler.
    (void)tmpl;
}

void SkeletonRegistry::InstallDocumentAllOnObject(v8::Local<v8::Object> target) {
    if (target.IsEmpty() || dom_manager_ == nullptr) {
        return;
    }
    InitHTMLAllCollectionTemplate();
    auto ctx = context_.Get(isolate_);
    v8::Local<v8::External> self_ext = v8::External::New(isolate_, this);
    // Use Object::SetNativeDataProperty (not ObjectTemplate::SetNativeDataProperty) to
    // install directly on the specific instance object. This avoids V8's internal
    // FunctionTemplate validation that fires when InstanceTemplate API accessors are
    // accessed on instances of a template without a call handler.
    auto result = target->SetNativeDataProperty(
        ctx,
        V8String(isolate_, "all"),
        DocumentAllNativeGetter,
        nullptr,
        self_ext,
        static_cast<v8::PropertyAttribute>(v8::DontDelete));
    if (result.IsNothing() || !result.FromJust()) {
        LEAPVM_LOG_WARN("[special] document.all: failed to install on instance");
        return;
    }
    LEAPVM_LOG_INFO("[special] document.all: installed on document instance (Object::SetNativeDataProperty)");
}

bool SkeletonRegistry::IsBrandCompatible(const std::string& receiver_brand,
                                         const std::string& expected_brand) const {
    // O2: 先查缓存，命中直接返回
    std::string cache_key = receiver_brand + "|" + expected_brand;
    auto cache_it = brand_compat_cache_.find(cache_key);
    if (cache_it != brand_compat_cache_.end()) {
        return cache_it->second;
    }

    auto normalize = [](const std::string& input) -> std::string {
        if (input.size() > 5 && input.rfind(".type") == input.size() - 5) {
            return input.substr(0, input.size() - 5);
        }
        if (input.size() > 9 && input.rfind(".instance") == input.size() - 9) {
            return input.substr(0, input.size() - 9);
        }
        return input;
    };

    std::string expected = normalize(expected_brand);
    std::string current = normalize(receiver_brand);
    bool result = false;

    if (!expected.empty() && !current.empty()) {
        if (current == expected) {
            result = true;
        } else {
            std::set<std::string> visited;
            while (!current.empty() && !visited.count(current)) {
                visited.insert(current);
                if (current == expected) { result = true; break; }

                const ObjectSkeleton* matched_type = nullptr;
                for (const auto& pair : skeletons_) {
                    const ObjectSkeleton& skeleton = pair.second;
                    if (!IsTypeSkeleton(skeleton)) continue;

                    const std::string skeleton_brand = normalize(
                        skeleton.brand.empty() ? skeleton.ctor_name : skeleton.brand);
                    const std::string skeleton_ctor = normalize(skeleton.ctor_name);
                    const std::string skeleton_name = normalize(skeleton.name);

                    if (skeleton_brand == current ||
                        skeleton_ctor == current ||
                        skeleton_name == current) {
                        matched_type = &skeleton;
                        break;
                    }
                }

                if (!matched_type) break;
                current = normalize(matched_type->super_type);
            }
        }
    }

    // O2: 写入缓存
    brand_compat_cache_[cache_key] = result;
    return result;
}

void SkeletonRegistry::CreateInstanceFromInstanceSkeleton(const std::string& name) {
    const ObjectSkeleton& skeleton = skeletons_[name];

    // Skip if no instance name specified
    if (skeleton.instance_name.empty()) {
        LEAPVM_LOG_DEBUG("[skeleton] [%s] instance_name empty, skip", name.c_str());
        return;
    }

    auto context = context_.Get(isolate_);

    // Step 1: Find the corresponding type skeleton
    std::string type_skeleton_name = FindSkeletonName(skeleton.super_type);
    if (type_skeleton_name.empty()) {
        LEAPVM_LOG_ERROR("[skeleton] [%s] super_type '%s' not found for instance",
                         name.c_str(), skeleton.super_type.c_str());
        return;
    }

    v8::Local<v8::FunctionTemplate> type_tmpl = GetTemplate(type_skeleton_name);
    if (type_tmpl.IsEmpty()) {
        LEAPVM_LOG_ERROR("[skeleton] [%s] type template '%s' not found",
                         name.c_str(), type_skeleton_name.c_str());
        return;
    }

    v8::Local<v8::Function> ctor;
    if (!type_tmpl->GetFunction(context).ToLocal(&ctor)) {
        LEAPVM_LOG_ERROR("[skeleton] [%s] Failed to get constructor from type template '%s'",
                         name.c_str(), type_skeleton_name.c_str());
        return;
    }

    // Debug: Check prototype chain is correctly set
    v8::Local<v8::Value> proto_val;
    if (ctor->Get(context, V8String(isolate_, "prototype")).ToLocal(&proto_val) &&
        proto_val->IsObject()) {
        v8::Local<v8::Object> proto_obj = proto_val.As<v8::Object>();
        v8::Local<v8::Value> proto_proto = proto_obj->GetPrototype();
        if (!proto_proto.IsEmpty() && proto_proto->IsObject()) {
            v8::Local<v8::Object> proto_proto_obj = proto_proto.As<v8::Object>();
            v8::Local<v8::Value> ctor_val;
            if (proto_proto_obj->Get(context, V8String(isolate_, "constructor")).ToLocal(&ctor_val) &&
                ctor_val->IsFunction()) {
                v8::Local<v8::Function> proto_proto_ctor = ctor_val.As<v8::Function>();
                v8::Local<v8::Value> name_val = proto_proto_ctor->GetName();
                v8::String::Utf8Value name_str(isolate_, name_val);
                LEAPVM_LOG_DEBUG("[skeleton] [%s] %s.prototype.__proto__.constructor.name = %s",
                                name.c_str(), skeleton.super_type.c_str(), *name_str);
            }
        }
    }

    v8::Local<v8::Object> instance;

    // Step 2: Window special case - reuse global object
    if (skeleton.instance_name == "window" && skeleton.brand == "Window") {
        LEAPVM_LOG_INFO("[skeleton] [%s] Creating Window instance (special case: reuse global)", name.c_str());

        v8::Local<v8::Object> global_proxy = context->Global();
        instance = global_proxy;

        // T19: Verify Phase3 bind target is this registry's own context global,
        // not the main context when running in a child frame.
        LEAPVM_LOG_DEBUG("[skeleton] [%s] Phase3 Window bind: context_==current? %s",
                         name.c_str(),
                         (context == isolate_->GetCurrentContext()) ? "yes" : "NO (mismatch!)");

        // Set window/self/top/parent/frames aliases
        auto set_alias = [&](const char* alias_name) {
            v8::Local<v8::String> key = V8String(isolate_, alias_name);
            global_proxy->CreateDataProperty(context, key, global_proxy).Check();
        };

        set_alias("window");
        set_alias("self");
        set_alias("top");
        set_alias("parent");
        set_alias("frames");

        // Get Window.prototype
        v8::Local<v8::Value> proto_val;
        if (ctor->Get(context, V8String(isolate_, "prototype")).ToLocal(&proto_val) &&
            proto_val->IsObject()) {
            v8::Local<v8::Object> proto_obj = proto_val.As<v8::Object>();

            // Set prototype chain: window.__proto__ = Window.prototype
            // NOTE: Set on real global object, not proxy
            v8::Local<v8::Value> real_global_val = global_proxy->GetPrototype();
            if (!real_global_val.IsEmpty() && real_global_val->IsObject()) {
                v8::Local<v8::Object> real_global = real_global_val.As<v8::Object>();
                real_global->SetPrototype(context, proto_obj).Check();
                LEAPVM_LOG_DEBUG("[skeleton] [%s] Set real_global.__proto__ = Window.prototype", name.c_str());
            }
        }

        // Set brand
        SetBrand(instance, skeleton.brand.empty() ? skeleton.super_type : skeleton.brand);

        // Also set brand on the real global object
        v8::Local<v8::Value> real_global_val = global_proxy->GetPrototype();
        if (!real_global_val.IsEmpty() && real_global_val->IsObject()) {
            SetBrand(real_global_val.As<v8::Object>(), skeleton.brand.empty() ? skeleton.super_type : skeleton.brand);
        }

    } else {
        // Step 3: Normal instance - create via type template
        LEAPVM_LOG_DEBUG("[skeleton] [%s] Creating normal instance via type template '%s'",
                         name.c_str(), type_skeleton_name.c_str());

        v8::Local<v8::ObjectTemplate> instance_tmpl = type_tmpl->InstanceTemplate();
        if (instance_tmpl.IsEmpty()) {
            LEAPVM_LOG_ERROR("[skeleton] [%s] Instance template is empty", name.c_str());
            return;
        }

        if (!instance_tmpl->NewInstance(context).ToLocal(&instance)) {
            LEAPVM_LOG_ERROR("[skeleton] [%s] Failed to create instance", name.c_str());
            return;
        }

        // Set brand
        SetBrand(instance, skeleton.brand.empty() ? skeleton.super_type : skeleton.brand);
    }

    if (instance.IsEmpty()) {
        LEAPVM_LOG_ERROR("[skeleton] [%s] Instance creation failed", name.c_str());
        return;
    }

    // Install document.all natively on HTMLDocument instances.
    // Done here (on the specific instance object) rather than on the InstanceTemplate
    // to avoid a V8 fatal CHECK that fires when accessing InstanceTemplate API accessors
    // on FunctionTemplates created without a call handler.
    if (type_skeleton_name == "HTMLDocument.type") {
        InstallDocumentAllOnObject(instance);
    }

    // Step 4: Add instance properties
    for (const auto& prop : skeleton.properties) {
        if (prop->owner == PropertyOwner::INSTANCE) {
            // Skip 'console' property - it's already set by vm_instance.cc
            if (prop->name == "console") {
                LEAPVM_LOG_DEBUG("[skeleton] [%s] Skipping 'console' property (already set by C++)",
                                name.c_str());
                continue;
            }
            AddPropertyToObject(instance, prop.get());
        }
    }

    // Step 5: Expose instance to global scope
    if (!skeleton.instance_name.empty()) {
        DefineGlobalProperty(skeleton.instance_name, instance);
        LEAPVM_LOG_INFO("[skeleton] [%s] Instance '%s' created and exposed to global",
                        name.c_str(), skeleton.instance_name.c_str());

        // Store in leapenv.nativeInstances so JS can retrieve the exact native singleton
        {
            v8::Local<v8::Context> ctx = isolate_->GetCurrentContext();
            v8::Local<v8::String> leapenv_key = V8String(isolate_, "leapenv");
            v8::Local<v8::Value> leapenv_val;
            if (ctx->Global()->Get(ctx, leapenv_key).ToLocal(&leapenv_val)
                    && leapenv_val->IsObject()) {
                v8::Local<v8::Object> leapenv_obj = leapenv_val.As<v8::Object>();
                v8::Local<v8::String> ni_key = V8String(isolate_, "nativeInstances");
                v8::Local<v8::Value> ni_val;
                v8::Local<v8::Object> ni_obj;
                if (!leapenv_obj->Get(ctx, ni_key).ToLocal(&ni_val) || !ni_val->IsObject()) {
                    ni_obj = v8::Object::New(isolate_);
                    leapenv_obj->Set(ctx, ni_key, ni_obj).Check();
                } else {
                    ni_obj = ni_val.As<v8::Object>();
                }
                ni_obj->Set(ctx, V8String(isolate_, skeleton.instance_name), instance).Check();
            }
        }
    }

    // Step 6: Expose constructor if needed (from the type skeleton)
    auto type_it = skeletons_.find(type_skeleton_name);
    if (type_it != skeletons_.end()) {
        const ObjectSkeleton& type_skeleton = type_it->second;

        if (type_skeleton.expose_ctor && !type_skeleton.ctor_name.empty() && !ctor.IsEmpty()) {
            v8::Local<v8::Value> proto_val;
            (void)ctor->Get(context, V8String(isolate_, "prototype")).ToLocal(&proto_val);

            v8::Local<v8::Function> exposed_ctor = ctor;

            // If constructor is illegal, wrap it
            if (type_skeleton.ctor_illegal) {
                exposed_ctor = v8::Function::New(
                    context, IllegalConstructorCallback,
                    V8String(isolate_, type_skeleton.ctor_name)).ToLocalChecked();
                exposed_ctor->SetName(V8String(isolate_, type_skeleton.ctor_name));

                if (!proto_val.IsEmpty() && proto_val->IsObject()) {
                    exposed_ctor->Set(context, V8String(isolate_, "prototype"), proto_val).Check();
                    proto_val.As<v8::Object>()
                        ->Set(context, V8String(isolate_, "constructor"), exposed_ctor).Check();
                }
            }

            DefineGlobalProperty(type_skeleton.ctor_name, exposed_ctor);
            LEAPVM_LOG_DEBUG("[skeleton] [%s] Exposed constructor '%s' to global",
                            name.c_str(), type_skeleton.ctor_name.c_str());
        }
    }
}

void SkeletonRegistry::ApplyInstanceSkeletonToObject(
        const std::string& instance_name, v8::Local<v8::Object> target) {
    if (target.IsEmpty() || instance_name.empty()) {
        return;
    }

    // Find the instance skeleton whose super_type matches the given ctor_name.
    // JS passes ctorName (e.g. "HTMLDocument") directly; instance skeletons store
    // the corresponding type name in super_type, so this lookup is fully automatic.
    for (const auto& pair : skeletons_) {
        const ObjectSkeleton& skeleton = pair.second;
        if (!IsInstanceSkeleton(skeleton)) {
            continue;
        }
        if (skeleton.super_type != instance_name) {
            continue;
        }

        LEAPVM_LOG_DEBUG("[skeleton] ApplyInstanceSkeletonToObject: applying '%s' to object",
                         skeleton.name.c_str());

        for (const auto& prop : skeleton.properties) {
            if (prop->owner == PropertyOwner::INSTANCE) {
                // Skip 'console' - already managed by vm_instance.cc
                if (prop->name == "console") {
                    continue;
                }
                AddPropertyToObject(target, prop.get());
            }
        }

        // Install document.all for HTMLDocument-based instances (e.g., per-task documents).
        if (instance_name == "HTMLDocument") {
            InstallDocumentAllOnObject(target);
        }
        return;
    }

    // No instance skeleton for this ctor - normal for most DOM types (e.g. HTMLDivElement)
}

void SkeletonRegistry::ReplaySkeletonsTo(SkeletonRegistry* target) const {
    // Iterate in skeleton_order_ to guarantee deterministic replay order.
    for (const auto& name : skeleton_order_) {
        auto it = skeletons_.find(name);
        if (it == skeletons_.end()) continue;
        target->RegisterSkeleton(CloneObjectSkeleton(it->second));
    }
    LEAPVM_LOG_INFO("[skeleton] ReplaySkeletonsTo: replayed %zu skeletons",
                    skeleton_order_.size());
}

}  // namespace skeleton
}  // namespace leapvm
