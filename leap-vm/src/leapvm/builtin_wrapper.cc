#include "builtin_wrapper.h"
#include "log.h"
#include "vm_instance.h"
#include "leap_inspector_client.h"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <sstream>
#include <string>
#include <vector>

namespace leapvm {

// ============================================================================
// Thread-local re-entrance guard
// Prevents preview/log code from re-triggering the same wrapper callbacks.
// ============================================================================
thread_local bool g_in_builtin_wrapper_callback = false;
std::atomic<uint64_t> g_builtin_hook_call_seq{0};

// ============================================================================
// Internal helpers
// ============================================================================

namespace {

// V8 value -> UTF-8 string (best-effort, no user-land calls)
static std::string V8ToUtf8(v8::Isolate* isolate,
                             v8::Local<v8::Context> context,
                             v8::Local<v8::Value> val) {
    v8::Local<v8::String> s;
    if (!val->ToString(context).ToLocal(&s)) return "";
    v8::String::Utf8Value utf8(isolate, s);
    return *utf8 ? std::string(*utf8, utf8.length()) : "";
}

// Call frame captured from V8 JS stack.
struct BwCallFrame {
    std::string func;
    std::string url;
    int line = 0;  // 1-based
    int col  = 0;  // 1-based
};

// Returns true if url belongs to leapenv infrastructure (not user target code).
static bool IsLeapInternalUrl(const std::string& url) {
    return url.find("leapenv.") != std::string::npos ||
           url.find("leapenv/") != std::string::npos ||
           url == "(unknown)";
}

// JSON escape helper for CDP strings.
static std::string EscapeForCDP(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 16);
    for (unsigned char c : s) {
        switch (c) {
        case '\\': out += "\\\\"; break;
        case '"':  out += "\\\""; break;
        case '\n': out += "\\n";  break;
        case '\r': out += "\\r";  break;
        case '\t': out += "\\t";  break;
        default:
            if (c < 0x20) {
                char b[7];
                std::snprintf(b, sizeof(b), "\\u%04x", static_cast<unsigned>(c));
                out += b;
            } else {
                out += static_cast<char>(c);
            }
            break;
        }
    }
    return out;
}

// Shallow, safe value preview (no user-land toString, no reflection on hooked APIs)
// depth: 0 = top-level call, >0 = recursive element preview (no further expansion)
static std::string SafePreview(v8::Isolate* isolate,
                                v8::Local<v8::Context> context,
                                v8::Local<v8::Value> v,
                                int depth = 0) {
    if (v->IsUndefined()) return "undefined";
    if (v->IsNull())      return "null";
    if (v->IsBoolean())   return v->BooleanValue(isolate) ? "true" : "false";
    if (v->IsNumber()) {
        double d = v->NumberValue(context).FromMaybe(0.0);
        char buf[64];
        std::snprintf(buf, sizeof(buf), "%g", d);
        return buf;
    }
    if (v->IsString()) {
        std::string s = V8ToUtf8(isolate, context, v);
        std::string out;
        out.reserve(s.size() + 2);
        out += '"';
        constexpr size_t kMaxPreviewChars = 8000;
        for (size_t i = 0; i < s.size() && i < kMaxPreviewChars; ++i) {
            char c = s[i];
            if      (c == '\n') out += "\\n";
            else if (c == '\r') out += "\\r";
            else if (c == '"')  out += "\\\"";
            else                out += c;
        }
        if (s.size() > kMaxPreviewChars) out += "...";
        out += '"';
        return out;
    }
    if (v->IsFunction()) {
        v8::Local<v8::Value> name_val = v.As<v8::Function>()->GetName();
        std::string fname;
        if (!name_val->IsUndefined() && !name_val->IsNull())
            fname = V8ToUtf8(isolate, context, name_val);
        return "function " + (fname.empty() ? "(anonymous)" : fname);
    }
    if (v->IsArray()) {
        v8::Local<v8::Array> arr = v.As<v8::Array>();
        uint32_t len = arr->Length();
        if (len == 0) return "[]";
        if (depth > 0) return "Array(" + std::to_string(len) + ")";
        // Show first 3 elements (no further recursion beyond depth+1)
        constexpr uint32_t kMaxShow = 3;
        std::string out = "[";
        uint32_t show = len < kMaxShow ? len : kMaxShow;
        for (uint32_t i = 0; i < show; ++i) {
            if (i > 0) out += ", ";
            v8::Local<v8::Value> elem;
            if (arr->Get(context, i).ToLocal(&elem)) {
                out += SafePreview(isolate, context, elem, depth + 1);
            } else {
                out += "?";
            }
        }
        if (len > kMaxShow) out += ", ...";
        out += "]";
        return out;
    }
    if (v->IsObject()) {
        v8::Local<v8::Object> obj = v.As<v8::Object>();
        std::string ctor = V8ToUtf8(isolate, context, obj->GetConstructorName());
        // For Error-like objects, show "ErrorType: message" regardless of depth.
        if (ctor.size() >= 5 &&
            ctor.compare(ctor.size() - 5, 5, "Error") == 0) {
            v8::Local<v8::String> msg_key =
                v8::String::NewFromUtf8(isolate, "message",
                                        v8::NewStringType::kNormal)
                    .ToLocalChecked();
            v8::Local<v8::Value> msg_val;
            if (obj->Get(context, msg_key).ToLocal(&msg_val) &&
                msg_val->IsString()) {
                std::string msg = V8ToUtf8(isolate, context, msg_val);
                constexpr size_t kMaxErrorMsgChars = 2000;
                if (msg.size() > kMaxErrorMsgChars) {
                    msg = msg.substr(0, kMaxErrorMsgChars) + "...";
                }
                return (ctor.empty() ? "Error" : ctor) + ": " + msg;
            }
        }
        // At depth=0, enumerate own properties to give a useful preview.
        // Nested objects (depth>0) use the compact form to avoid blowup.
        if (depth == 0) {
            v8::TryCatch tc(isolate);
            v8::Local<v8::Array> keys;
            if (!obj->GetOwnPropertyNames(context).ToLocal(&keys) || tc.HasCaught()) {
                tc.Reset();
                return (ctor.empty() ? "Object" : ctor) + " {...}";
            }
            uint32_t key_count = keys->Length();
            if (key_count == 0) {
                static const char* kProbeKeys[] = {
                    "tagName", "nodeName", "nodeType", "id", "className",
                    "type", "name", "value", "href", "src", "length"
                };
                std::string out = (ctor.empty() || ctor == "Object") ? "{" : ctor + " {";
                bool has_any = false;
                for (const char* k : kProbeKeys) {
                    v8::Local<v8::String> key_v8;
                    if (!v8::String::NewFromUtf8(isolate, k).ToLocal(&key_v8)) continue;
                    v8::Local<v8::Value> pv;
                    if (!obj->Get(context, key_v8).ToLocal(&pv) ||
                        tc.HasCaught() ||
                        pv->IsUndefined()) {
                        tc.Reset();
                        continue;
                    }
                    if (has_any) out += ", ";
                    out += std::string(k) + ": " + SafePreview(isolate, context, pv, depth + 1);
                    has_any = true;
                }
                if (!has_any) return (ctor.empty() ? "" : ctor + " ") + "{}";
                out += "}";
                return out;
            }
            constexpr uint32_t kMaxKeys = 24;
            std::string out = (ctor.empty() || ctor == "Object") ? "{" : ctor + " {";
            uint32_t show = key_count < kMaxKeys ? key_count : kMaxKeys;
            for (uint32_t i = 0; i < show; ++i) {
                if (i > 0) out += ", ";
                v8::Local<v8::Value> key;
                if (!keys->Get(context, i).ToLocal(&key)) continue;
                out += V8ToUtf8(isolate, context, key) + ": ";
                v8::Local<v8::Value> val;
                if (obj->Get(context, key).ToLocal(&val) && !tc.HasCaught()) {
                    out += SafePreview(isolate, context, val, depth + 1);
                } else {
                    tc.Reset();
                    out += "?";
                }
            }
            if (key_count > kMaxKeys) out += ", ...";
            out += "}";
            return out;
        }
        return (ctor.empty() ? "Object" : ctor) + " {...}";
    }
    return "[value]";
}

// Check whether a kind ("call"/"return"/"throw") is in cfg->operations.
// Empty operations list means all are included.
static bool KindEnabled(const BuiltinWrapperConfig* cfg,
                        const std::string& kind) {
    if (cfg->operations.empty()) return true;
    return std::find(cfg->operations.begin(), cfg->operations.end(), kind)
           != cfg->operations.end();
}

// Whitelist / blacklist matching
static bool MatchesExact(const std::vector<std::string>& list,
                         const std::string& val) {
    return std::find(list.begin(), list.end(), val) != list.end();
}
static bool MatchesPrefix(const std::vector<std::string>& prefixes,
                           const std::string& val) {
    for (const auto& p : prefixes) {
        if (!p.empty() && val.rfind(p, 0) == 0) return true;
    }
    return false;
}

// Build a CDP RemoteObject JSON string for a V8 value.
// Must be called inside g_in_builtin_wrapper_callback guard (prevents hook re-entry).
// Produces a static preview (no objectId) sufficient for DevTools to show folded objects.
static std::string BuildCDPRemoteObjectJson(v8::Isolate* isolate,
                                             v8::Local<v8::Context> context,
                                             v8::Local<v8::Value> val) {
    std::ostringstream out;
    if (val->IsUndefined()) {
        out << "{\"type\":\"undefined\"}";
    } else if (val->IsNull()) {
        out << "{\"type\":\"object\",\"subtype\":\"null\",\"value\":null}";
    } else if (val->IsBoolean()) {
        out << "{\"type\":\"boolean\",\"value\":"
            << (val->BooleanValue(isolate) ? "true" : "false") << "}";
    } else if (val->IsNumber()) {
        double d = val->NumberValue(context).FromMaybe(0.0);
        char buf[64];
        std::snprintf(buf, sizeof(buf), "%g", d);
        out << "{\"type\":\"number\",\"value\":" << d
            << ",\"description\":\"" << buf << "\"}";
    } else if (val->IsString()) {
        std::string s = V8ToUtf8(isolate, context, val);
        // Truncate very long strings for the preview
        constexpr size_t kMaxCdpStringChars = 12000;
        if (s.size() > kMaxCdpStringChars) {
            s = s.substr(0, kMaxCdpStringChars) + "...";
        }
        out << "{\"type\":\"string\",\"value\":\"" << EscapeForCDP(s) << "\"}";
    } else if (val->IsFunction()) {
        v8::Local<v8::Value> name_val = val.As<v8::Function>()->GetName();
        std::string fname;
        if (!name_val.IsEmpty() && !name_val->IsUndefined() && !name_val->IsNull())
            fname = V8ToUtf8(isolate, context, name_val);
        out << "{\"type\":\"function\",\"className\":\"Function\","
            << "\"description\":\"function " << EscapeForCDP(fname.empty() ? "(anonymous)" : fname) << "() {}\"}";
    } else if (val->IsArray()) {
        v8::Local<v8::Array> arr = val.As<v8::Array>();
        uint32_t len = arr->Length();
        constexpr uint32_t kMax = 20;
        bool overflow = len > kMax;
        uint32_t show = overflow ? kMax : len;
        std::ostringstream props;
        v8::TryCatch tc(isolate);
        for (uint32_t i = 0; i < show; ++i) {
            if (i > 0) props << ",";
            v8::Local<v8::Value> elem;
            if (!arr->Get(context, i).ToLocal(&elem) || tc.HasCaught()) {
                tc.Reset();
                props << "{\"name\":\"" << i << "\",\"type\":\"undefined\",\"value\":\"?\"}";
            } else {
                std::string p = SafePreview(isolate, context, elem, 1);
                const char* t = elem->IsString() ? "string" : elem->IsNumber() ? "number"
                              : elem->IsBoolean() ? "boolean" : elem->IsNull() ? "object"
                              : elem->IsUndefined() ? "undefined" : "object";
                props << "{\"name\":\"" << i << "\",\"type\":\"" << t
                      << "\",\"value\":\"" << EscapeForCDP(p) << "\"}";
            }
        }
        out << "{\"type\":\"object\",\"subtype\":\"array\",\"className\":\"Array\","
            << "\"description\":\"Array(" << len << ")\","
            << "\"preview\":{\"type\":\"object\",\"subtype\":\"array\","
            << "\"description\":\"Array(" << len << ")\","
            << "\"overflow\":" << (overflow ? "true" : "false") << ","
            << "\"properties\":[" << props.str() << "]}}";
    } else if (val->IsObject()) {
        v8::Local<v8::Object> obj = val.As<v8::Object>();
        // Get constructor name
        std::string ctor;
        {
            v8::TryCatch tc(isolate);
            v8::Local<v8::Value> cv;
            if (obj->Get(context, v8::String::NewFromUtf8Literal(isolate, "constructor"))
                    .ToLocal(&cv) && cv->IsFunction() && !tc.HasCaught()) {
                v8::Local<v8::Value> nv = cv.As<v8::Function>()->GetName();
                if (!nv.IsEmpty() && !nv->IsUndefined())
                    ctor = V8ToUtf8(isolate, context, nv);
            }
        }
        if (ctor == "Object") ctor.clear();
        std::string desc = ctor.empty() ? "Object" : ctor;
        // Enumerate own properties
        constexpr uint32_t kMaxKeys = 32;
        std::ostringstream props;
        bool overflow = false;
        {
            v8::TryCatch tc(isolate);
            v8::Local<v8::Array> keys;
            if (obj->GetOwnPropertyNames(context).ToLocal(&keys) && !tc.HasCaught()) {
                uint32_t kc = keys->Length();
                overflow = kc > kMaxKeys;
                uint32_t show = overflow ? kMaxKeys : kc;
                for (uint32_t i = 0; i < show; ++i) {
                    if (i > 0) props << ",";
                    v8::Local<v8::Value> key;
                    if (!keys->Get(context, i).ToLocal(&key) || tc.HasCaught()) {
                        tc.Reset();
                        continue;
                    }
                    std::string ks = V8ToUtf8(isolate, context, key);
                    v8::Local<v8::Value> v;
                    std::string vs = "?";
                    const char* vt = "undefined";
                    if (obj->Get(context, key).ToLocal(&v) && !tc.HasCaught()) {
                        vs = SafePreview(isolate, context, v, 1);
                        vt = v->IsString() ? "string" : v->IsNumber() ? "number"
                           : v->IsBoolean() ? "boolean" : v->IsNull() ? "object"
                           : v->IsUndefined() ? "undefined" : "object";
                    } else {
                        tc.Reset();
                    }
                    props << "{\"name\":\"" << EscapeForCDP(ks) << "\",\"type\":\"" << vt
                          << "\",\"value\":\"" << EscapeForCDP(vs) << "\"}";
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
                    v8::Local<v8::Value> v;
                    if (obj->Get(context, key_v8).ToLocal(&v) &&
                        !tc.HasCaught() &&
                        !v->IsUndefined()) {
                        if (!first) props << ",";
                        first = false;
                        std::string vs = SafePreview(isolate, context, v, 1);
                        const char* vt = v->IsString() ? "string" : v->IsNumber() ? "number"
                           : v->IsBoolean() ? "boolean" : v->IsNull() ? "object"
                           : v->IsUndefined() ? "undefined" : "object";
                        props << "{\"name\":\"" << EscapeForCDP(k) << "\",\"type\":\"" << vt
                              << "\",\"value\":\"" << EscapeForCDP(vs) << "\"}";
                    } else {
                        tc.Reset();
                    }
                }
            }
        }
        const std::string full_desc = SafePreview(isolate, context, val, 0);
        const std::string cdp_desc = full_desc.empty() ? desc : full_desc;
        out << "{\"type\":\"object\",\"className\":\"" << EscapeForCDP(desc) << "\","
            << "\"description\":\"" << EscapeForCDP(cdp_desc) << "\","
            << "\"preview\":{\"type\":\"object\","
            << "\"description\":\"" << EscapeForCDP(cdp_desc) << "\","
            << "\"overflow\":" << (overflow ? "true" : "false") << ","
            << "\"properties\":[" << props.str() << "]}}";
    } else {
        std::string p = SafePreview(isolate, context, val, 0);
        out << "{\"type\":\"string\",\"value\":\"" << EscapeForCDP(p) << "\"}";
    }
    return out.str();
}

// Build RemoteObject JSON with real objectId when inspector wrapping is available.
static std::string BuildHookRemoteObjectJson(v8::Isolate* isolate,
                                             v8::Local<v8::Context> context,
                                             v8::Local<v8::Value> val) {
    VmInstance* vm = static_cast<VmInstance*>(isolate->GetData(0));
    if (vm) {
        leapvm::LeapInspectorClient* client = vm->inspector_client();
        if (client) {
            std::string wrapped = client->WrapValueToRemoteObjectJson(context, val, true);
            if (!wrapped.empty()) {
                return wrapped;
            }
        }
    }
    return BuildCDPRemoteObjectJson(isolate, context, val);
}

// Collect current JS call frames from V8.
static std::vector<BwCallFrame> CollectCallFrames(v8::Isolate* isolate, int max = 12) {
    std::vector<BwCallFrame> frames;
    v8::Local<v8::StackTrace> st = v8::StackTrace::CurrentStackTrace(isolate, max);
    const int n = st->GetFrameCount();
    frames.reserve(n > 0 ? static_cast<size_t>(n) : 0u);
    for (int i = 0; i < n; ++i) {
        v8::Local<v8::StackFrame> f = st->GetFrame(isolate, i);
        v8::String::Utf8Value script(isolate, f->GetScriptNameOrSourceURL());
        v8::String::Utf8Value func(isolate, f->GetFunctionName());
        BwCallFrame frame;
        frame.func = (*func   && (*func)[0])   ? std::string(*func,   func.length())   : "(anonymous)";
        frame.url  = (*script && (*script)[0]) ? std::string(*script, script.length()) : "(unknown)";
        frame.line = f->GetLineNumber();
        frame.col  = f->GetColumn();
        frames.push_back(std::move(frame));
    }
    return frames;
}

// Format frames as "Error: headline\n    at func (url:line:col)\n..." for CLI stdout.
static std::string FormatCallFramesText(const std::string& headline,
                                         const std::vector<BwCallFrame>& frames) {
    std::string out = "Error: " + headline;
    for (const auto& f : frames) {
        char buf[512];
        std::snprintf(buf, sizeof(buf), "\n    at %s (%s:%d:%d)",
                      f.func.c_str(), f.url.c_str(), f.line, f.col);
        out += buf;
    }
    return out;
}

// Emit a hook entry directly to DevTools inspector as Runtime.consoleAPICalled.
// |prefix|      — label string shown as first arg in DevTools
// |cdp_args|    — pre-built CDP RemoteObject JSON strings for additional args
// |frames|      — raw JS frames; leading leapenv frames are skipped so DevTools
//                 links to the first user-code frame
// Returns true if the message was actually sent (at least one user-code frame).
static bool EmitBuiltinHookCDP(v8::Isolate* isolate,
                                const std::string& prefix,
                                const std::vector<std::string>& cdp_args,
                                const std::vector<BwCallFrame>& frames,
                                const char* console_type = "log") {
    VmInstance* vm = static_cast<VmInstance*>(isolate->GetData(0));
    if (!vm) return false;
    LeapInspectorClient* client = vm->inspector_client();
    if (!client) return false;

    // Find first user-code frame (skip leading leapenv infrastructure frames).
    size_t first_user = 0;
    while (first_user < frames.size() && IsLeapInternalUrl(frames[first_user].url))
        ++first_user;

    // If frames is non-empty but all internal: skip DevTools (setup/coverage noise).
    if (!frames.empty() && first_user >= frames.size()) return false;

    auto now = std::chrono::system_clock::now();
    double ts = static_cast<double>(
        std::chrono::duration_cast<std::chrono::milliseconds>(
            now.time_since_epoch()).count()) / 1000.0;

    std::ostringstream json;
    json << "{\"method\":\"Runtime.consoleAPICalled\",\"params\":{"
         << "\"type\":\"" << EscapeForCDP(console_type ? console_type : "log") << "\","
         << "\"args\":[";
    bool has_arg = false;
    if (!prefix.empty()) {
        json << "{\"type\":\"string\",\"value\":\"" << EscapeForCDP(prefix) << "\"}";
        has_arg = true;
    }
    for (const auto& a : cdp_args) {
        if (has_arg) json << ",";
        json << a;
        has_arg = true;
    }
    json << "],\"executionContextId\":1,\"timestamp\":" << ts;

    // Add stackTrace only when we have user-code frames.
    if (first_user < frames.size()) {
        json << ",\"stackTrace\":{\"description\":\"" << EscapeForCDP(prefix) << "\","
             << "\"callFrames\":[";
        bool first = true;
        for (size_t i = first_user; i < frames.size(); ++i) {
            if (!first) json << ",";
            first = false;
            const auto& f = frames[i];
            const int l0 = f.line > 0 ? f.line - 1 : 0;
            const int c0 = f.col  > 0 ? f.col  - 1 : 0;
            std::string sid = client->ResolveScriptIdForUrl(f.url);
            if (sid.empty()) sid = "0";
            json << "{\"functionName\":\"" << EscapeForCDP(f.func) << "\","
                 << "\"scriptId\":\"" << EscapeForCDP(sid) << "\","
                 << "\"url\":\"" << EscapeForCDP(f.url) << "\","
                 << "\"lineNumber\":" << l0 << ",\"columnNumber\":" << c0 << "}";
        }
        json << "]}";
    }

    json << "}}";
    client->SendToFrontend(json.str());
    return true;
}

// Read hook runtime state and decide phase match.
static v8::Local<v8::Object> ResolveHookRuntimeObject(v8::Isolate* isolate,
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
    v8::Local<v8::Value> rt_val;
    if (global->Get(context, v8::String::NewFromUtf8Literal(isolate, "__LEAP_HOOK_RUNTIME__"))
            .ToLocal(&rt_val) &&
        rt_val->IsObject()) {
        return rt_val.As<v8::Object>();
    }
    if (global->Get(context, v8::String::NewFromUtf8Literal(isolate, "__LEAP_DEBUG_JS_HOOKS_RUNTIME__"))
            .ToLocal(&rt_val) &&
        rt_val->IsObject()) {
        return rt_val.As<v8::Object>();
    }

    return v8::Local<v8::Object>();
}

static bool CheckPhase(v8::Isolate* isolate,
                       v8::Local<v8::Context> context,
                       const std::string& phase_mode) {
    if (phase_mode == "all") return true;

    v8::Local<v8::Object> rt = ResolveHookRuntimeObject(isolate, context);
    if (rt.IsEmpty()) {
        // Runtime object not yet installed -> treat as bundle phase.
        return phase_mode == "bundle";
    }

    auto get_str = [&](const char* key) -> std::string {
        v8::Local<v8::Value> v;
        if (!rt->Get(context,
                     v8::String::NewFromUtf8(isolate, key,
                                             v8::NewStringType::kNormal)
                         .ToLocalChecked())
                .ToLocal(&v))
            return "";
        return V8ToUtf8(isolate, context, v);
    };

    if (phase_mode == "task") {
        v8::Local<v8::Value> active_val;
        if (!rt->Get(context,
                     v8::String::NewFromUtf8(isolate, "active",
                                             v8::NewStringType::kNormal)
                         .ToLocalChecked())
                .ToLocal(&active_val))
            return false;
        return active_val->BooleanValue(isolate);
    }
    if (phase_mode == "bundle") {
        return get_str("phase") == "bundle";
    }
    return false;
}

// Determine base eligibility (enabled + whitelist/blacklist + phase).
// Does NOT check operations or cap – those are checked per-kind.
static bool BaseEligible(v8::Isolate* isolate,
                         v8::Local<v8::Context> context,
                         const BuiltinWrapperCallbackData* data) {
    if (leapvm::g_suppress_hook_logging) return false;
    if (leapvm::g_hook_log_depth > 1) return false;
    const BuiltinWrapperConfig* cfg = data->config;
    if (!cfg->enabled) return false;

    // Whitelist: if any rule exists, api_name must match one of them
    const auto& wl = cfg->whitelist;
    bool has_wl = !wl.api_names.empty() || !wl.api_prefixes.empty();
    if (has_wl) {
        bool in_wl = MatchesExact(wl.api_names, data->api_name) ||
                     MatchesPrefix(wl.api_prefixes, data->api_name);
        if (!in_wl) return false;
    }

    // Blacklist
    const auto& bl = cfg->blacklist;
    if (MatchesExact(bl.api_names, data->api_name) ||
        MatchesPrefix(bl.api_prefixes, data->api_name))
        return false;

    // Phase
    std::string phase_mode = cfg->phase.empty() ? "task" : cfg->phase;
    return CheckPhase(isolate, context, phase_mode);
}


// Emit a log line in the "[hook][builtin] <kind> <api_name> <detail>" format.
static void EmitLog(const std::string& kind,
                    const std::string& api_name,
                    const std::string& detail) {
    LEAPVM_LOG_INFO("[hook][builtin] %s %s %s",
                    kind.c_str(), api_name.c_str(), detail.c_str());
}

// ============================================================================
// The single V8 FunctionCallback used for ALL installed builtin wrappers.
// ============================================================================
void BuiltinWrapperCallback(const v8::FunctionCallbackInfo<v8::Value>& args) {
    // --- Re-entrance fast path: silently call original, no logging ---
    if (g_in_builtin_wrapper_callback) {
        v8::Local<v8::Value> data_val = args.Data();
        if (data_val.IsEmpty() || !data_val->IsExternal()) return;
        auto* data = static_cast<BuiltinWrapperCallbackData*>(
            data_val.As<v8::External>()->Value());
        if (!data) return;
        v8::Isolate* iso = args.GetIsolate();
        v8::Local<v8::Context> ctx = iso->GetCurrentContext();
        std::vector<v8::Local<v8::Value>> argv;
        argv.reserve(args.Length());
        for (int i = 0; i < args.Length(); ++i) argv.push_back(args[i]);
        v8::Local<v8::Value> result;
        if (data->original_fn.Get(iso)
                ->Call(ctx, args.This(),
                       static_cast<int>(argv.size()),
                       argv.empty() ? nullptr : argv.data())
                .ToLocal(&result)) {
            args.GetReturnValue().Set(result);
        }
        return;
    }

    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    struct HookDepthGuard {
        HookDepthGuard() { ++leapvm::g_hook_log_depth; }
        ~HookDepthGuard() { --leapvm::g_hook_log_depth; }
    } hook_depth_guard;

    v8::Local<v8::Value> data_val = args.Data();
    if (data_val.IsEmpty() || !data_val->IsExternal()) return;
    auto* data = static_cast<BuiltinWrapperCallbackData*>(
        data_val.As<v8::External>()->Value());
    if (!data) return;

    const BuiltinWrapperConfig* cfg = data->config;

    // --- Determine base eligibility (once per invocation) ---
    bool base_ok = BaseEligible(isolate, context, data);

    // --- Increment counter and check cap ---
    bool within_cap = true;
    if (base_ok) {
        data->event_count++;
        int n = data->event_count;
        if (cfg->max_per_api >= 0 && n == cfg->max_per_api + 1) {
            LEAPVM_LOG_INFO("[hook][builtin] %s reached cap %d",
                            data->api_name.c_str(), cfg->max_per_api);
        }
        within_cap = (cfg->max_per_api < 0 || n <= cfg->max_per_api);
    }

    bool log_call   = base_ok && within_cap && KindEnabled(cfg, "call");
    bool log_return = base_ok && within_cap && KindEnabled(cfg, "return");
    bool log_throw  = base_ok && within_cap && KindEnabled(cfg, "throw");
    uint64_t call_seq = 0;

    // --- Capture JS call-site stack once (before calling original; stack changes after) ---
    std::vector<BwCallFrame> call_frames;
    if (log_call || log_return || log_throw) {
        call_frames = CollectCallFrames(isolate);
    }

    // --- Log call (args preview) ---
    bool call_emitted_to_devtools = false;
    if (log_call) {
        g_in_builtin_wrapper_callback = true;
        // CLI text preview
        std::ostringstream cli_oss;
        cli_oss << "[";
        for (int i = 0; i < args.Length(); ++i) {
            if (i > 0) cli_oss << ", ";
            cli_oss << SafePreview(isolate, context, args[i]);
        }
        cli_oss << "]";
        const std::string args_preview = cli_oss.str();
        // CDP RemoteObject JSON for each arg (built inside guard to prevent re-entry)
        std::vector<std::string> cdp_args;
        for (int i = 0; i < args.Length(); ++i) {
            cdp_args.push_back(BuildHookRemoteObjectJson(isolate, context, args[i]));
        }
        g_in_builtin_wrapper_callback = false;

        EmitLog("call", data->api_name, cli_oss.str());
        // CLI: also log the full stack as Error text to stdout
        if (!call_frames.empty()) {
            LEAPVM_LOG_INFO("%s", FormatCallFramesText(
                "[hook][builtin] call " + data->api_name + " " + cli_oss.str(),
                call_frames).c_str());
        }
        // DevTools: header line with stack.
        bool can_emit_to_devtools = true;
        if (!call_frames.empty()) {
            can_emit_to_devtools = false;
            for (const auto& f : call_frames) {
                if (!IsLeapInternalUrl(f.url)) {
                    can_emit_to_devtools = true;
                    break;
                }
            }
        }
        if (can_emit_to_devtools) {
            if (call_seq == 0) {
                call_seq = g_builtin_hook_call_seq.fetch_add(1, std::memory_order_relaxed) + 1;
            }
            const std::string call_header =
                "[hook][builtin#" + std::to_string(call_seq) + "] call " + data->api_name;
            call_emitted_to_devtools = EmitBuiltinHookCDP(
                isolate,
                call_header,
                {},
                call_frames,
                "log");
        }
        // DevTools: args as a separate line with object previews.
        if (call_emitted_to_devtools) {
            std::vector<std::string> args_payload;
            args_payload.reserve(cdp_args.size());
            for (const auto& a : cdp_args) args_payload.push_back(a);
            EmitBuiltinHookCDP(
                isolate,
                "[hook][builtin#" + std::to_string(call_seq) + "] args:",
                args_payload,
                {},
                "log");
        }
    }

    // --- Call original function ---
    std::vector<v8::Local<v8::Value>> argv;
    argv.reserve(args.Length());
    for (int i = 0; i < args.Length(); ++i) argv.push_back(args[i]);

    v8::TryCatch try_catch(isolate);
    v8::Local<v8::Value> result;
    bool success = data->original_fn.Get(isolate)
                       ->Call(context, args.This(),
                              static_cast<int>(argv.size()),
                              argv.empty() ? nullptr : argv.data())
                       .ToLocal(&result);

    if (success) {
        // --- Log return ---
        if (log_return) {
            g_in_builtin_wrapper_callback = true;
            std::string ret_preview = SafePreview(isolate, context, result);
            std::string ret_cdp = BuildHookRemoteObjectJson(isolate, context, result);
            g_in_builtin_wrapper_callback = false;

            EmitLog("return", data->api_name, "=> " + ret_preview);
            // DevTools: return as "=> value" only (no prefix, no stack — pairs with call)
            if (call_emitted_to_devtools) {
                EmitBuiltinHookCDP(
                    isolate,
                    "[hook][builtin#" + std::to_string(call_seq) + "] =>",
                    {ret_cdp},
                    {},
                    "log");
                EmitBuiltinHookCDP(
                    isolate,
                    "[hook][builtin#" + std::to_string(call_seq) + "] --------------------------------",
                    {},
                    {},
                    "log");
            }
        }
        args.GetReturnValue().Set(result);
    } else if (try_catch.HasCaught()) {
        // --- Log throw ---
        if (log_throw) {
            g_in_builtin_wrapper_callback = true;
            std::string err_str = SafePreview(isolate, context, try_catch.Exception());
            std::string err_cdp = BuildHookRemoteObjectJson(isolate, context, try_catch.Exception());
            g_in_builtin_wrapper_callback = false;

            EmitLog("throw", data->api_name, "! " + err_str);
            if (call_emitted_to_devtools) {
                EmitBuiltinHookCDP(
                    isolate,
                    "[hook][builtin#" + std::to_string(call_seq) + "] ! " + data->api_name,
                    {err_cdp},
                    {},
                    "log");
                EmitBuiltinHookCDP(
                    isolate,
                    "[hook][builtin#" + std::to_string(call_seq) + "] --------------------------------",
                    {},
                    {},
                    "log");
            }
        }
        try_catch.ReThrow();
    }
}

// ============================================================================
// Accessor getter wrapper — wraps an accessor property's getter (e.g. Error.prototype.stack).
// Same logging logic as BuiltinWrapperCallback, but for property GET access.
// ============================================================================
void AccessorGetterWrapperCallback(const v8::FunctionCallbackInfo<v8::Value>& args) {
    // Re-entrance fast path: call original getter silently
    if (g_in_builtin_wrapper_callback) {
        v8::Local<v8::Value> data_val = args.Data();
        if (data_val.IsEmpty() || !data_val->IsExternal()) return;
        auto* data = static_cast<BuiltinWrapperCallbackData*>(
            data_val.As<v8::External>()->Value());
        if (!data) return;
        v8::Isolate* iso = args.GetIsolate();
        v8::Local<v8::Context> ctx = iso->GetCurrentContext();
        v8::Local<v8::Value> result;
        if (data->original_fn.Get(iso)
                ->Call(ctx, args.This(), 0, nullptr)
                .ToLocal(&result)) {
            args.GetReturnValue().Set(result);
        }
        return;
    }

    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    struct HookDepthGuard {
        HookDepthGuard() { ++leapvm::g_hook_log_depth; }
        ~HookDepthGuard() { --leapvm::g_hook_log_depth; }
    } hook_depth_guard;

    v8::Local<v8::Value> data_val = args.Data();
    if (data_val.IsEmpty() || !data_val->IsExternal()) return;
    auto* data = static_cast<BuiltinWrapperCallbackData*>(
        data_val.As<v8::External>()->Value());
    if (!data) return;

    bool base_ok = BaseEligible(isolate, context, data);
    bool within_cap = true;
    if (base_ok) {
        data->event_count++;
        int n = data->event_count;
        const BuiltinWrapperConfig* cfg = data->config;
        if (cfg->max_per_api >= 0 && n == cfg->max_per_api + 1) {
            LEAPVM_LOG_INFO("[hook][builtin] %s reached cap %d",
                            data->api_name.c_str(), cfg->max_per_api);
        }
        within_cap = (cfg->max_per_api < 0 || n <= cfg->max_per_api);
    }

    bool should_log = base_ok && within_cap;
    uint64_t call_seq = 0;

    std::vector<BwCallFrame> call_frames;
    if (should_log) {
        call_frames = CollectCallFrames(isolate);
        call_seq = g_builtin_hook_call_seq.fetch_add(1, std::memory_order_relaxed) + 1;

        EmitLog("GET", data->api_name, "");
    }

    // Call the original getter
    v8::TryCatch try_catch(isolate);
    v8::Local<v8::Value> result;
    bool ok = data->original_fn.Get(isolate)
                  ->Call(context, args.This(), 0, nullptr)
                  .ToLocal(&result);

    if (ok) {
        if (should_log) {
            std::string ret_preview = PreviewValue(isolate, context, result);
            EmitLog("GET", data->api_name, "=> " + ret_preview);

            // Emit to DevTools
            EmitBuiltinHookCDP(
                isolate,
                "[hook][builtin#" + std::to_string(call_seq) + "] GET " +
                    data->api_name + " => " + ret_preview,
                call_frames,
                {},
                "log");
        }
        args.GetReturnValue().Set(result);
    } else if (try_catch.HasCaught()) {
        if (should_log) {
            std::string err_preview = PreviewValue(isolate, context, try_catch.Exception());
            EmitLog("GET", data->api_name, "! " + err_preview);
        }
        try_catch.ReThrow();
    }
}

}  // namespace

// ============================================================================
// BuiltinWrapperContextRegistry
// ============================================================================

BuiltinWrapperContextRegistry::BuiltinWrapperContextRegistry(
    const BuiltinWrapperConfig& config)
    : config_(config) {}

bool BuiltinWrapperContextRegistry::ResolvePath(
    v8::Isolate* isolate,
    v8::Local<v8::Context> context,
    const std::string& path,
    v8::Local<v8::Object>* holder_out,
    std::string* key_out) {

    // Split by '.'
    std::vector<std::string> parts;
    {
        std::string::size_type start = 0, pos;
        while ((pos = path.find('.', start)) != std::string::npos) {
            parts.push_back(path.substr(start, pos - start));
            start = pos + 1;
        }
        parts.push_back(path.substr(start));
    }

    if (parts.empty() || parts[0].empty()) return false;

    if (parts.size() == 1) {
        *holder_out = context->Global();
        *key_out = parts[0];
        return true;
    }

    // Navigate from global: parts[0..n-2] are the holder chain, parts[n-1] is the key
    v8::Local<v8::Value> current = context->Global();
    for (size_t i = 0; i + 1 < parts.size(); ++i) {
        if (!current->IsObject()) return false;
        v8::Local<v8::String> k =
            v8::String::NewFromUtf8(isolate, parts[i].c_str(),
                                    v8::NewStringType::kNormal)
                .ToLocalChecked();
        if (!current.As<v8::Object>()->Get(context, k).ToLocal(&current))
            return false;
    }

    if (!current->IsObject()) return false;
    *holder_out = current.As<v8::Object>();
    *key_out = parts.back();
    return true;
}

void BuiltinWrapperContextRegistry::InstallOne(
    v8::Isolate* isolate,
    v8::Local<v8::Context> context,
    const BuiltinWrapperTarget& target) {

    v8::Local<v8::Object> holder;
    std::string key;
    if (!ResolvePath(isolate, context, target.path, &holder, &key)) {
        return;
    }

    v8::Local<v8::String> v8_key =
        v8::String::NewFromUtf8(isolate, key.c_str(),
                                v8::NewStringType::kNormal)
            .ToLocalChecked();

    if (target.kind == BuiltinWrapperKind::kAccessor) {
        // --- Accessor property wrapper (e.g. Error.prototype.stack) ---
        // Get the property descriptor to find the original getter.
        v8::Local<v8::Value> descriptor_val;
        if (!holder->GetOwnPropertyDescriptor(context, v8_key)
                 .ToLocal(&descriptor_val) ||
            !descriptor_val->IsObject()) {
            return;
        }
        v8::Local<v8::Object> descriptor = descriptor_val.As<v8::Object>();

        v8::Local<v8::String> get_str =
            v8::String::NewFromUtf8Literal(isolate, "get");
        v8::Local<v8::Value> getter_val;
        if (!descriptor->Get(context, get_str).ToLocal(&getter_val) ||
            !getter_val->IsFunction()) {
            return;
        }

        auto cb_data = std::make_unique<BuiltinWrapperCallbackData>();
        cb_data->api_name = target.name;
        cb_data->original_fn.Reset(isolate, getter_val.As<v8::Function>());
        cb_data->config = &config_;
        cb_data->event_count = 0;

        v8::Local<v8::External> ext = v8::External::New(isolate, cb_data.get());
        v8::Local<v8::Function> wrapper_getter;
        if (!v8::Function::New(context, AccessorGetterWrapperCallback, ext)
                 .ToLocal(&wrapper_getter)) {
            return;
        }

        // Preserve the original setter if any
        v8::Local<v8::String> set_str =
            v8::String::NewFromUtf8Literal(isolate, "set");
        v8::Local<v8::Value> setter_val;
        descriptor->Get(context, set_str).ToLocal(&setter_val);

        // Redefine the property with the wrapper getter
        v8::PropertyDescriptor new_desc(
            wrapper_getter,
            setter_val->IsFunction() ? setter_val.As<v8::Function>()
                                     : v8::Local<v8::Function>());
        new_desc.set_enumerable(false);
        new_desc.set_configurable(true);
        holder->DefineProperty(context, v8_key, new_desc);

        callback_data_.push_back(std::move(cb_data));
        return;
    }

    // --- Function wrapper (default path) ---
    v8::Local<v8::Value> original_val;
    if (!holder->Get(context, v8_key).ToLocal(&original_val) ||
        !original_val->IsFunction()) {
        return;
    }

    // Create callback data (heap-allocated, address-stable)
    auto cb_data = std::make_unique<BuiltinWrapperCallbackData>();
    cb_data->api_name = target.name;
    cb_data->original_fn.Reset(isolate, original_val.As<v8::Function>());
    cb_data->config = &config_;
    cb_data->event_count = 0;

    // Create wrapper function; embed pointer to cb_data via v8::External
    v8::Local<v8::External> ext = v8::External::New(isolate, cb_data.get());
    v8::Local<v8::Function> wrapper;
    if (!v8::Function::New(context, BuiltinWrapperCallback, ext)
             .ToLocal(&wrapper)) {
        return;
    }

    // Install wrapper into holder (replace original)
    if (holder->Set(context, v8_key, wrapper).IsNothing()) {
        return;
    }

    // Transfer ownership to registry (keeps data alive as long as context exists)
    callback_data_.push_back(std::move(cb_data));
}

void BuiltinWrapperContextRegistry::InstallAll(v8::Isolate* isolate,
                                               v8::Local<v8::Context> context) {
    if (!config_.enabled) {
        return;
    }
    for (const auto& target : config_.targets) {
        InstallOne(isolate, context, target);
    }
}

// ============================================================================
// BuiltinWrapperManager
// ============================================================================

void BuiltinWrapperManager::SetConfig(BuiltinWrapperConfig config) {
    config_ = std::move(config);
    configured_ = true;
}

void BuiltinWrapperManager::InstallInContext(v8::Isolate* isolate,
                                             v8::Local<v8::Context> context) {
    if (!configured_) return;
    auto registry =
        std::make_unique<BuiltinWrapperContextRegistry>(config_);
    registry->InstallAll(isolate, context);
    registries_.push_back(std::move(registry));
}

}  // namespace leapvm
