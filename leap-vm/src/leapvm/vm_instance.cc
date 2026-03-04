#include "vm_instance.h"
#include "v8_platform.h"
#include "native_wrapper.h"
#include "skeleton/skeleton_parser.h"
#include "skeleton/skeleton_registry.h"
#include "leap_inspector_client.h"
#include "log.h"
#include "hook_filter.h"
#include <libplatform/libplatform.h>
#include <iostream>
#include <sstream>
#include <cstdio>
#include <string>
#include <cstring>
#include <thread>
#include <iterator>
#include <algorithm>
#include <atomic>
#include <cctype>
#include <limits>
#include <optional>
#include <unordered_set>
#include <vector>

#if defined(LEAPVM_HAS_LEXBOR) && LEAPVM_HAS_LEXBOR
#include <lexbor/html/html.h>
#include <lexbor/dom/dom.h>
#endif

#ifdef _WIN32
#include <windows.h>
#include <timeapi.h>
#pragma comment(lib, "winmm.lib")
#endif

namespace leapvm {
thread_local bool g_suppress_hook_logging = false;
thread_local int g_hook_log_depth = 0;
}  // namespace leapvm

// ============================================================================
// 匿名命名空间：内部辅助函数
// ============================================================================
namespace {
using leapvm::Log;
using leapvm::LogLevel;

void InstallWindow(v8::Local<v8::Context> context);

// 把任意 JS 值转成 UTF-8 字符串
std::string ToUtf8String(v8::Isolate* isolate,
                         v8::Local<v8::Context> context,
                         v8::Local<v8::Value> value) {
    v8::Local<v8::String> str;
    if (!value->ToString(context).ToLocal(&str)) {
        return "[[toString error]]";
    }
    v8::String::Utf8Value utf8(isolate, str);
    if (*utf8) {
        return std::string(*utf8, utf8.length());
    }
    return std::string();
}

// 简单的 JSON 字符串转义（用于发送到 DevTools）
std::string EscapeForJson(const std::string& input) {
    std::string out;
    out.reserve(input.size() + 16);

    for (char c : input) {
        switch (c) {
        case '\\':
            out += "\\\\";
            break;
        case '\"':
            out += "\\\"";
            break;
        case '\n':
            out += "\\n";
            break;
        case '\r':
            out += "\\r";
            break;
        case '\t':
            out += "\\t";
            break;
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

std::string SafePreviewForConsoleJson(v8::Isolate* isolate,
                                      v8::Local<v8::Context> context,
                                      v8::Local<v8::Value> value,
                                      int depth = 0) {
    if (value->IsUndefined()) return "undefined";
    if (value->IsNull()) return "null";
    if (value->IsBoolean()) return value->BooleanValue(isolate) ? "true" : "false";
    if (value->IsNumber()) {
        const double d = value->NumberValue(context).FromMaybe(0.0);
        char buf[64];
        std::snprintf(buf, sizeof(buf), "%g", d);
        return buf;
    }
    if (value->IsString()) {
        std::string s = ToUtf8String(isolate, context, value);
        constexpr size_t kMaxPreviewChars = 12000;
        if (s.size() > kMaxPreviewChars) s = s.substr(0, kMaxPreviewChars) + "...";
        return s;
    }
    if (value->IsFunction()) {
        std::string name = ToUtf8String(isolate, context, value.As<v8::Function>()->GetName());
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
            out += arr->Get(context, i).ToLocal(&elem)
                ? SafePreviewForConsoleJson(isolate, context, elem, depth + 1)
                : "?";
        }
        if (len > show) out += ", ...";
        out += "]";
        return out;
    }
    if (value->IsObject()) {
        v8::Local<v8::Object> obj = value.As<v8::Object>();
        std::string ctor = ToUtf8String(isolate, context, obj->GetConstructorName());
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
                out += std::string(k) + ": " +
                       SafePreviewForConsoleJson(isolate, context, prop_val, depth + 1);
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
            const std::string key_str = ToUtf8String(isolate, context, key);
            out += key_str + ": ";
            v8::Local<v8::Value> prop_val;
            if (obj->Get(context, key).ToLocal(&prop_val) && !tc.HasCaught()) {
                out += SafePreviewForConsoleJson(isolate, context, prop_val, depth + 1);
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

std::string BuildConsoleRemoteObjectJson(v8::Isolate* isolate,
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
        std::string s = ToUtf8String(isolate, context, value);
        constexpr size_t kMaxStringChars = 12000;
        if (s.size() > kMaxStringChars) s = s.substr(0, kMaxStringChars) + "...";
        out << "{\"type\":\"string\",\"value\":\"" << EscapeForJson(s) << "\"}";
    } else if (value->IsFunction()) {
        std::string name = ToUtf8String(isolate, context, value.As<v8::Function>()->GetName());
        out << "{\"type\":\"function\",\"className\":\"Function\","
            << "\"description\":\"function " << EscapeForJson(name.empty() ? "(anonymous)" : name) << "() {}\"}";
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
            const std::string preview = SafePreviewForConsoleJson(isolate, context, elem, 1);
            const char* type = elem->IsString() ? "string"
                : elem->IsNumber() ? "number"
                : elem->IsBoolean() ? "boolean"
                : elem->IsNull() ? "object"
                : elem->IsUndefined() ? "undefined"
                : "object";
            props << "{\"name\":\"" << i << "\",\"type\":\"" << type
                  << "\",\"value\":\"" << EscapeForJson(preview) << "\"}";
        }
        out << "{\"type\":\"object\",\"subtype\":\"array\",\"className\":\"Array\","
            << "\"description\":\"Array(" << len << ")\","
            << "\"preview\":{\"type\":\"object\",\"subtype\":\"array\","
            << "\"description\":\"Array(" << len << ")\","
            << "\"overflow\":" << (overflow ? "true" : "false") << ","
            << "\"properties\":[" << props.str() << "]}}";
    } else if (value->IsObject()) {
        v8::Local<v8::Object> obj = value.As<v8::Object>();
        std::string ctor = ToUtf8String(isolate, context, obj->GetConstructorName());
        if (ctor.empty()) ctor = "Object";

        const bool prev_suppress = leapvm::g_suppress_hook_logging;
        leapvm::g_suppress_hook_logging = true;

        std::ostringstream props;
        bool overflow = false;
        uint32_t prop_count = 0;
        auto append_prop = [&](const std::string& key_str, v8::Local<v8::Value> prop_val) {
            if (prop_count > 0) props << ",";
            std::string preview = SafePreviewForConsoleJson(isolate, context, prop_val, 1);
            const char* type = prop_val->IsString() ? "string"
                : prop_val->IsNumber() ? "number"
                : prop_val->IsBoolean() ? "boolean"
                : prop_val->IsNull() ? "object"
                : prop_val->IsUndefined() ? "undefined"
                : "object";
            props << "{\"name\":\"" << EscapeForJson(key_str) << "\",\"type\":\""
                  << type << "\",\"value\":\"" << EscapeForJson(preview) << "\"}";
            ++prop_count;
        };

        v8::TryCatch tc(isolate);
        v8::Local<v8::Array> keys;
        if (obj->GetOwnPropertyNames(context).ToLocal(&keys) && !tc.HasCaught()) {
            const uint32_t count = keys->Length();
            const uint32_t show = count < 32 ? count : 32;
            overflow = count > show;
            for (uint32_t i = 0; i < show; ++i) {
                v8::Local<v8::Value> key;
                if (!keys->Get(context, i).ToLocal(&key) || tc.HasCaught()) {
                    tc.Reset();
                    continue;
                }
                const std::string key_str = ToUtf8String(isolate, context, key);
                v8::Local<v8::Value> prop_val;
                if (obj->Get(context, key).ToLocal(&prop_val) && !tc.HasCaught()) {
                    append_prop(key_str, prop_val);
                } else {
                    tc.Reset();
                    if (prop_count > 0) props << ",";
                    props << "{\"name\":\"" << EscapeForJson(key_str)
                          << "\",\"type\":\"undefined\",\"value\":\"?\"}";
                    ++prop_count;
                }
            }
        }

        // Host objects like HTMLElement often have zero own enumerable props.
        // Probe a small stable key set so DevTools preview still shows useful fields.
        if (prop_count == 0) {
            static const char* kProbeKeys[] = {
                "tagName", "nodeName", "nodeType", "id", "className",
                "type", "name", "value", "href", "src", "length"
            };
            for (const char* k : kProbeKeys) {
                v8::Local<v8::Value> prop_val;
                v8::Local<v8::String> key_v8;
                if (!v8::String::NewFromUtf8(isolate, k).ToLocal(&key_v8)) continue;
                if (obj->Get(context, key_v8).ToLocal(&prop_val) &&
                    !tc.HasCaught() &&
                    !prop_val->IsUndefined()) {
                    append_prop(k, prop_val);
                } else {
                    tc.Reset();
                }
            }
        }

        std::string desc = SafePreviewForConsoleJson(isolate, context, value, 0);
        if (desc.empty()) desc = ctor;
        out << "{\"type\":\"object\",\"className\":\"" << EscapeForJson(ctor) << "\","
            << "\"description\":\"" << EscapeForJson(desc) << "\","
            << "\"preview\":{\"type\":\"object\",\"description\":\"" << EscapeForJson(desc)
            << "\",\"overflow\":" << (overflow ? "true" : "false")
            << ",\"properties\":[" << props.str() << "]}}";
        leapvm::g_suppress_hook_logging = prev_suppress;
    } else {
        out << "{\"type\":\"string\",\"value\":\""
            << EscapeForJson(SafePreviewForConsoleJson(isolate, context, value))
            << "\"}";
    }
    return out.str();
}

struct ConsoleStackFrame {
    std::string function_name;
    std::string url;
    int line = 0;   // 1-based
    int column = 0; // 1-based
};

// Returns true if |url| is a leapenv infrastructure URL, not user target code.
static bool IsLeapInternalUrl(const std::string& url) {
    return url.find("leapenv.") != std::string::npos ||
           url.find("leapenv/") != std::string::npos ||
           url == "(unknown)";
}

std::string TrimLeftAscii(const std::string& s) {
    size_t i = 0;
    while (i < s.size() && (s[i] == ' ' || s[i] == '\t')) ++i;
    return s.substr(i);
}

std::string StripConsolePrefixForErrorLine(const std::string& s) {
    if (s.rfind("[console][", 0) != 0) {
        return s;
    }
    size_t sp = s.find(' ');
    if (sp == std::string::npos || sp + 1 >= s.size()) {
        return s;
    }
    return s.substr(sp + 1);
}

bool ParseFrameLocation(const std::string& location,
                        std::string* out_url,
                        int* out_line,
                        int* out_column) {
    if (!out_url || !out_line || !out_column) return false;
    size_t last_colon = location.rfind(':');
    if (last_colon == std::string::npos) return false;
    size_t second_last_colon = location.rfind(':', last_colon - 1);
    if (second_last_colon == std::string::npos) return false;

    const std::string line_s = location.substr(second_last_colon + 1,
                                               last_colon - second_last_colon - 1);
    const std::string col_s = location.substr(last_colon + 1);
    if (line_s.empty() || col_s.empty()) return false;
    if (!std::all_of(line_s.begin(), line_s.end(),
                     [](unsigned char c) { return std::isdigit(c) != 0; })) return false;
    if (!std::all_of(col_s.begin(), col_s.end(),
                     [](unsigned char c) { return std::isdigit(c) != 0; })) return false;

    *out_url = location.substr(0, second_last_colon);
    *out_line = std::stoi(line_s);
    *out_column = std::stoi(col_s);
    return !out_url->empty();
}

bool ParseConsoleStackFrameLine(const std::string& raw, ConsoleStackFrame* out) {
    if (!out) return false;
    std::string s = TrimLeftAscii(raw);
    if (s.rfind("at ", 0) != 0) return false;
    s = s.substr(3);  // strip "at "
    if (s.empty()) return false;

    std::string function_name;
    std::string location;

    if (!s.empty() && s.back() == ')') {
        size_t pos = s.rfind(" (");
        if (pos != std::string::npos) {
            function_name = s.substr(0, pos);
            location = s.substr(pos + 2, s.size() - pos - 3); // drop " (" and trailing ")"
        } else {
            location = s;
        }
    } else {
        location = s;
    }

    std::string url;
    int line = 0;
    int col = 0;
    if (!ParseFrameLocation(location, &url, &line, &col)) {
        return false;
    }

    out->function_name = function_name;
    out->url = url;
    out->line = line;
    out->column = col;
    return true;
}

bool BuildConsoleStackTraceJsonFragment(const std::string& line,
                                        std::string* out_json_fragment,
                                        leapvm::LeapInspectorClient* inspector = nullptr) {
    if (!out_json_fragment) return false;
    *out_json_fragment = std::string();
    if (line.empty()) return false;

    std::vector<std::string> lines;
    {
        size_t start = 0;
        while (start <= line.size()) {
            size_t end = line.find('\n', start);
            if (end == std::string::npos) {
                lines.push_back(line.substr(start));
                break;
            }
            lines.push_back(line.substr(start, end - start));
            start = end + 1;
        }
    }
    if (lines.empty()) return false;

    std::string first = StripConsolePrefixForErrorLine(lines[0]);
    if (first.rfind("Error:", 0) != 0) {
        return false;
    }

    std::vector<ConsoleStackFrame> frames;
    frames.reserve(lines.size() > 1 ? lines.size() - 1 : 0);
    for (size_t i = 1; i < lines.size(); ++i) {
        ConsoleStackFrame frame;
        if (ParseConsoleStackFrameLine(lines[i], &frame)) {
            frames.push_back(frame);
        }
    }
    if (frames.empty()) {
        return false;
    }

    // Skip leading leapenv infrastructure frames so DevTools links to user code.
    // Bail entirely if all frames are internal (e.g. pure setup hooks).
    size_t first_user = 0;
    while (first_user < frames.size() && IsLeapInternalUrl(frames[first_user].url))
        ++first_user;
    if (first_user >= frames.size()) {
        return false;
    }

    std::ostringstream json;
    json << ",\"stackTrace\":{"
         << "\"description\":\"" << EscapeForJson(first) << "\","
         << "\"callFrames\":[";
    for (size_t i = first_user; i < frames.size(); ++i) {
        if (i > first_user) json << ',';
        const auto& f = frames[i];
        const int line0 = f.line > 0 ? (f.line - 1) : 0;
        const int col0 = f.column > 0 ? (f.column - 1) : 0;
        std::string script_id = "0";
        if (inspector) {
            std::string resolved = inspector->ResolveScriptIdForUrl(f.url);
            if (!resolved.empty()) {
                script_id = resolved;
            }
        }
        json << "{"
             << "\"functionName\":\"" << EscapeForJson(f.function_name) << "\","
             << "\"scriptId\":\"" << EscapeForJson(script_id) << "\","
             << "\"url\":\"" << EscapeForJson(f.url) << "\","
             << "\"lineNumber\":" << line0 << ","
             << "\"columnNumber\":" << col0
             << "}";
    }
    json << "]"
         << "}";

    *out_json_fragment = json.str();
    return true;
}

// 通用的 console 打印实现
void ConsolePrint(const v8::FunctionCallbackInfo<v8::Value>& args,
                  const char* level) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    std::vector<std::string> parts;
    parts.reserve(args.Length() > 0 ? static_cast<size_t>(args.Length()) : 0u);
    for (int i = 0; i < args.Length(); ++i) {
        const bool prev_suppress = leapvm::g_suppress_hook_logging;
        leapvm::g_suppress_hook_logging = true;
        parts.push_back(SafePreviewForConsoleJson(isolate, context, args[i]));
        leapvm::g_suppress_hook_logging = prev_suppress;
    }

    std::ostringstream oss;
    oss << "[console][" << level << "] ";
    for (int i = 0; i < args.Length(); ++i) {
        if (i > 0) oss << ' ';
        oss << parts[static_cast<size_t>(i)];
    }

    const std::string line = oss.str();

    LogLevel log_level = LogLevel::kInfo;
    if (std::strcmp(level, "warn") == 0) {
        log_level = LogLevel::kWarn;
    } else if (std::strcmp(level, "error") == 0) {
        log_level = LogLevel::kError;
    }
    Log(log_level, "%s", line.c_str());

    // 如果已启用 Inspector，则把日志同步给 DevTools Console
    leapvm::VmInstance* self = nullptr;
    v8::Local<v8::Value> data = args.Data();
    if (!data.IsEmpty() && data->IsExternal()) {
        self = static_cast<leapvm::VmInstance*>(
            data.As<v8::External>()->Value());
    }
    if (!self) {
        self = static_cast<leapvm::VmInstance*>(isolate->GetData(0));
    }
    if (!self) {
        return;
    }

    leapvm::LeapInspectorClient* client = self->inspector_client();
    if (!client) {
        return;
    }

    auto build_arg_json = [&](v8::Local<v8::Value> v) -> std::string {
        std::string wrapped = client->WrapValueToRemoteObjectJson(context, v, true);
        if (!wrapped.empty()) {
            return wrapped;
        }
        return BuildConsoleRemoteObjectJson(isolate, context, v);
    };

    std::string stack_trace_json_fragment;
    const bool has_structured_stack =
        BuildConsoleStackTraceJsonFragment(line, &stack_trace_json_fragment, client);

    // Filter JS-side setup noise from DevTools (skeleton loading, env fixes, checks).
    // These are useful for CLI debugging but clutter the DevTools console.
    {
        const auto& l = line;
        if (l.find("[leapenv][skeleton]") != std::string::npos ||
            l.find("[leapenv][check]") != std::string::npos ||
            l.find("[leapenv][bundle]") != std::string::npos ||
            l.find("[LeapEnv]") != std::string::npos ||
            (l.find("[Fix]") != std::string::npos && l.find("[hook]") == std::string::npos)) {
            return;
        }
    }

    // For hook live-lines (emitted as console.log(prefix, ...values)), keep the
    // original values when forwarding to DevTools instead of flattening to one string.
    std::string hook_prefix;
    if (args.Length() > 0 && args[0]->IsString()) {
        hook_prefix = ToUtf8String(isolate, context, args[0]);
    }
    const bool is_hook_live_line =
        args.Length() > 1 &&
        !hook_prefix.empty() &&
        hook_prefix.rfind("[hook][", 0) == 0;

    const char* type = "log";
    if (std::strcmp(level, "warn") == 0) {
        type = "warning";
    } else if (std::strcmp(level, "error") == 0) {
        type = "error";
    }

    auto now = std::chrono::system_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()).count();
    double timestamp = static_cast<double>(ms) / 1000.0;

    if (is_hook_live_line) {
        LEAPVM_LOG_DEBUG("[console-live] hook-prefix=%s argc=%d arg1_is_object=%d arg1_is_string=%d",
                         hook_prefix.c_str(),
                         args.Length(),
                         (args.Length() > 1 && args[1]->IsObject()) ? 1 : 0,
                         (args.Length() > 1 && args[1]->IsString()) ? 1 : 0);
        std::ostringstream json;
        json << "{"
             << "\"method\":\"Runtime.consoleAPICalled\","
             << "\"params\":{"
             << "\"type\":\"" << type << "\","
             << "\"args\":[";
        bool has_arg = false;
        json << "{\"type\":\"string\",\"value\":\"" << EscapeForJson(hook_prefix) << "\"}";
        has_arg = true;
        for (int i = 1; i < args.Length(); ++i) {
            if (has_arg) json << ",";
            json << build_arg_json(args[i]);
            has_arg = true;
        }
        json << "],"
             << "\"executionContextId\":1,"
             << "\"timestamp\":" << timestamp
             << stack_trace_json_fragment
             << "}"
             << "}";
        client->SendToFrontend(json.str());
        return;
    }

    // Compute DevTools display value: strip [console][log] prefix for all messages,
    // and additionally strip "Error: " prefix for structured-stack hook messages.
    std::string inspector_value;
    if (has_structured_stack) {
        size_t nl = line.find('\n');
        inspector_value = (nl == std::string::npos) ? line : line.substr(0, nl);
        inspector_value = StripConsolePrefixForErrorLine(inspector_value);
        if (inspector_value.rfind("Error: ", 0) == 0) {
            inspector_value = inspector_value.substr(7);
        }
    } else {
        inspector_value = StripConsolePrefixForErrorLine(line);
    }

    std::ostringstream args_json;
    bool has_args = false;
    if (has_structured_stack) {
        args_json << "{\"type\":\"string\",\"value\":\"" << EscapeForJson(inspector_value) << "\"}";
        has_args = true;
    } else if (args.Length() > 0) {
        for (int i = 0; i < args.Length(); ++i) {
            if (has_args) args_json << ",";
            args_json << build_arg_json(args[i]);
            has_args = true;
        }
    }
    if (!has_args) {
        args_json << "{\"type\":\"string\",\"value\":\"" << EscapeForJson(inspector_value) << "\"}";
        has_args = true;
    }

    std::ostringstream json;
    json << "{"
         << "\"method\":\"Runtime.consoleAPICalled\","
         << "\"params\":{"
         << "\"type\":\"" << type << "\","
         << "\"args\":[" << args_json.str() << "],"
         << "\"executionContextId\":1,"
         << "\"timestamp\":" << timestamp
         << stack_trace_json_fragment
         << "}"
         << "}";

    client->SendToFrontend(json.str());
}

void ConsoleLogCallback(const v8::FunctionCallbackInfo<v8::Value>& args) {
    ConsolePrint(args, "log");
}

void ConsoleWarnCallback(const v8::FunctionCallbackInfo<v8::Value>& args) {
    ConsolePrint(args, "warn");
}

void ConsoleErrorCallback(const v8::FunctionCallbackInfo<v8::Value>& args) {
    ConsolePrint(args, "error");
}

void WindowConstructorCallback(const v8::FunctionCallbackInfo<v8::Value>& info) {
    v8::Isolate* isolate = info.GetIsolate();
    isolate->ThrowException(
        v8::Exception::TypeError(
            v8::String::NewFromUtf8Literal(isolate, "Illegal constructor: Window")));
}

void InstallWindow(v8::Local<v8::Context> context) {
    v8::Isolate* isolate = context->GetIsolate();
    v8::HandleScope handle_scope(isolate);

    v8::Local<v8::Object> global = context->Global();

    v8::Local<v8::FunctionTemplate> ctor_tpl =
        v8::FunctionTemplate::New(isolate, WindowConstructorCallback);
    ctor_tpl->SetClassName(v8::String::NewFromUtf8Literal(isolate, "Window"));
    ctor_tpl->InstanceTemplate()->SetInternalFieldCount(1);

    v8::Local<v8::Function> ctor =
        ctor_tpl->GetFunction(context).ToLocalChecked();

    bool ok = global->Set(
        context,
        v8::String::NewFromUtf8Literal(isolate, "Window"),
        ctor).FromMaybe(false);
    if (!ok) {
        LEAPVM_LOG_WARN("Failed to install Window constructor on global");
    }

    v8::Local<v8::Value> proto_val =
        ctor->Get(context, v8::String::NewFromUtf8Literal(isolate, "prototype"))
            .ToLocalChecked();

    if (proto_val->IsObject()) {
        v8::Local<v8::Object> proto_obj = proto_val.As<v8::Object>();

        // 注意：context->Global() 是 JSGlobalProxy，真实 global 在它的 [[Prototype]] 上。
        // 这里只负责把内部 global 接到 Window.prototype，不在其上挂任何属性。
        v8::Local<v8::Value> internal_global_val = global->GetPrototype();
        if (!internal_global_val.IsEmpty() && internal_global_val->IsObject()) {
            v8::Local<v8::Object> internal_global = internal_global_val.As<v8::Object>();
            ok = internal_global->SetPrototype(context, proto_obj).FromMaybe(false);
            if (!ok) {
                LEAPVM_LOG_WARN("Failed to set Window prototype on internal global");
            }
        }

        ok = proto_obj->Set(
            context,
            v8::String::NewFromUtf8Literal(isolate, "constructor"),
            ctor).FromMaybe(false);
        if (!ok) {
            LEAPVM_LOG_WARN("Failed to set Window.prototype.constructor");
        }
    }
}

}  // namespace (anonymous helpers for console/window)

namespace leapvm {

// ============================================================================
// Hook 过滤 + 工具函数（供 NativeWrapper/Window handler 使用）
// ============================================================================

namespace {

VmInstance* GetVmInstanceFromIsolate(v8::Isolate* isolate) {
    if (!isolate) return nullptr;
    return static_cast<VmInstance*>(isolate->GetData(0));
}

const LogDetailConfig& GetLogDetailConfigForInstance(VmInstance* instance) {
    static LogDetailConfig kDefaultLogDetail;
    return instance ? instance->log_detail_config() : kDefaultLogDetail;
}

bool ShouldEnterHookForInstance(VmInstance* instance, const HookEventKey& key) {
    if (g_suppress_hook_logging) return false;
    if (!instance) return false;
    return ShouldEnterHookPipeline(instance->hook_config(), key);
}

bool ShouldLogHook(v8::Isolate* isolate,
                   const std::string& root,
                   const std::string& path,
                   MonitorOp op) {
    VmInstance* instance = GetVmInstanceFromIsolate(isolate);
    if (!instance) return false;
    HookEventKey key{root, path, op};
    if (!ShouldEnterHookForInstance(instance, key)) {
        return false;
    }
    HookContext ctx{op, root, path};
    return instance->monitor_engine().ShouldLog(ctx);
}

void EmitMonitorHook(v8::Isolate* isolate, const HookContext& ctx) {
    VmInstance* instance = GetVmInstanceFromIsolate(isolate);
    if (!instance) {
        return;
    }
    HookEventKey key{ctx.root, ctx.path, ctx.op};
    if (!ShouldEnterHookForInstance(instance, key)) {
        return;
    }
    instance->monitor_engine().OnHook(ctx);
}

bool ShouldEnterHookPipeline(v8::Isolate* isolate,
                             const std::string& root,
                             const std::string& path,
                             MonitorOp op) {
    VmInstance* instance = GetVmInstanceFromIsolate(isolate);
    return ShouldEnterHookForInstance(instance, HookEventKey{root, path, op});
}

const LogDetailConfig& GetLogDetailConfigForIsolate(v8::Isolate* isolate) {
    return GetLogDetailConfigForInstance(GetVmInstanceFromIsolate(isolate));
}

}  // namespace

// 把 V8 值的类型名做个简单映射，方便日志里看
std::string GetValueType(v8::Local<v8::Value> v) {
    if (v->IsUndefined()) return "undefined";
    if (v->IsNull()) return "null";
    if (v->IsBoolean()) return "boolean";
    if (v->IsNumber()) return "number";
    if (v->IsString()) return "string";
    if (v->IsFunction()) return "function";
    if (v->IsArray()) return "array";
    if (v->IsObject()) return "object";
    return "other";
}

// 做一个简易的字符串转义。max_len=0 表示不截断。
std::string EscapePreview(const std::string& s, std::size_t max_len = 0) {
    std::string out;
    out.reserve(max_len == 0 ? s.size() : (std::min)(max_len, s.size()));
    const bool unlimited = (max_len == 0);
    for (char c : s) {
        if (c == '\n' || c == '\r') {
            out += "\\n";
        } else if (c == '"') {
            out += "\\\"";
        } else if (static_cast<unsigned char>(c) < 0x20) {
            out += '?';
        } else {
            out += c;
        }
        if (!unlimited && out.size() >= max_len) break;
    }
    if (!unlimited && s.size() > max_len) {
        out += "...";
    }
    return out;
}

// 安全地获取值的预览信息（包括函数签名）
std::string GetValuePreview(v8::Isolate* isolate,
                            v8::Local<v8::Context> context,
                            v8::Local<v8::Value> value) {
    if (value->IsUndefined()) {
        return "undefined";
    } else if (value->IsNull()) {
        return "null";
    } else if (value->IsBoolean()) {
        return value->BooleanValue(isolate) ? "true" : "false";
    } else if (value->IsNumber()) {
        const double num = value->NumberValue(context).ToChecked();
        char buf[64];
        std::snprintf(buf, sizeof(buf), "%g", num);
        return buf;
    } else if (value->IsString()) {
        std::string str = ToUtf8String(isolate, context, value);
        return "\"" + EscapePreview(str, 0) + "\"";
    } else if (value->IsFunction()) {
        // 对于函数，尝试获取函数名和参数
        v8::Local<v8::Function> func = value.As<v8::Function>();

        // 获取函数名
        v8::Local<v8::Value> name_val = func->GetName();
        std::string func_name;
        if (!name_val->IsUndefined() && !name_val->IsNull()) {
            func_name = ToUtf8String(isolate, context, name_val);
        }
        if (func_name.empty()) {
            func_name = "anonymous";
        }

        // 获取参数个数
        int length = func->Get(context,
                              v8::String::NewFromUtf8(isolate, "length",
                                                     v8::NewStringType::kNormal)
                                  .ToLocalChecked())
                        .ToLocalChecked()
                        ->Int32Value(context)
                        .ToChecked();

        // 尝试获取函数toString来解析参数名
        v8::Local<v8::Value> to_string_result;
        std::string params_preview;
        if (func->ToString(context).ToLocal(&to_string_result)) {
            std::string func_str = ToUtf8String(isolate, context, to_string_result);
            // 简单解析：找到 function 和 { 之间的部分
            size_t func_pos = func_str.find("function");
            size_t open_paren = func_str.find('(', func_pos != std::string::npos ? func_pos : 0);
            size_t close_paren = func_str.find(')', open_paren);
            if (open_paren != std::string::npos && close_paren != std::string::npos) {
                params_preview = func_str.substr(open_paren + 1, close_paren - open_paren - 1);
                // 清理参数字符串
                for (auto& c : params_preview) {
                    if (c == '\n' || c == '\r') c = ' ';
                }
            }
        }

        if (params_preview.empty()) {
            // 如果无法解析参数名，就用参数个数
            params_preview = length == 0 ? "" : (std::to_string(length) + " params");
        }

        return "function " + func_name + "(" + params_preview + ")";
    } else if (value->IsArray()) {
        return SafePreviewForConsoleJson(isolate, context, value, 0);
    } else if (value->IsObject()) {
        const bool prev_suppress = leapvm::g_suppress_hook_logging;
        leapvm::g_suppress_hook_logging = true;
        std::string preview = SafePreviewForConsoleJson(isolate, context, value, 0);
        leapvm::g_suppress_hook_logging = prev_suppress;
        return preview;
    }

    return "[unknown]";
}

// 提取函数的参数列表（只返回参数部分，如 "a, b, c"）
std::string GetFunctionParams(v8::Isolate* isolate,
                              v8::Local<v8::Context> context,
                              v8::Local<v8::Function> func) {
    v8::Local<v8::Value> to_string_result;
    if (func->ToString(context).ToLocal(&to_string_result)) {
        std::string func_str = ToUtf8String(isolate, context, to_string_result);
        // 找到 ( 和 ) 之间的部分
        size_t open_paren = func_str.find('(');
        size_t close_paren = func_str.find(')', open_paren);
        if (open_paren != std::string::npos && close_paren != std::string::npos) {
            std::string params = func_str.substr(open_paren + 1, close_paren - open_paren - 1);
            // 清理空白
            for (auto& c : params) {
                if (c == '\n' || c == '\r') c = ' ';
            }
            return params;
        }
    }

    // 失败时返回参数个数
    int length = func->Get(context,
                          v8::String::NewFromUtf8(isolate, "length",
                                                 v8::NewStringType::kNormal)
                              .ToLocalChecked())
                    .ToLocalChecked()
                    ->Int32Value(context)
                    .FromMaybe(0);
    if (length == 0) return "";
    return std::to_string(length) + " params";
}

// PropertyAttribute 转成可读字符串（相当于 descriptor 信息）
std::string AttributesToString(v8::PropertyAttribute attr) {
    if (attr == v8::None) return "Writable,Enumerable,Configurable";

    std::string out;
    if (attr & v8::ReadOnly)   out += "ReadOnly,";
    if (attr & v8::DontEnum)   out += "DontEnum,";
    if (attr & v8::DontDelete) out += "DontDelete,";

    if (!out.empty() && out.back() == ',') {
        out.pop_back();
    }
    return out.empty() ? "None" : out;
}

// Symbol 安全处理：Name -> std::string
std::string ToUtf8Name(v8::Isolate* isolate,
                       v8::Local<v8::Context> context,
                       v8::Local<v8::Name> name) {
    // Symbol 处理
    if (name->IsSymbol()) {
        v8::Local<v8::Symbol> sym = name.As<v8::Symbol>();
        v8::Local<v8::Value> desc = sym->Description(isolate);
        if (!desc->IsUndefined()) {
            v8::String::Utf8Value utf8(isolate, desc);
            if (*utf8) {
                return std::string("Symbol(") + *utf8 + ")";
            }
        }
        return "Symbol()";
    }

    // 普通字符串
    return ToUtf8String(isolate, context, name.As<v8::Value>());
}

// window/self/top/parent/frames 的 getter：永远返回 Holder 本身
void WindowSelfAccessorGetter(v8::Local<v8::Name> property,
                              const v8::PropertyCallbackInfo<v8::Value>& info) {
    (void)property;
    info.GetReturnValue().Set(info.Holder());
}

// ================== 函数调用 Hook ==================

// 存储原始函数和属性名的结构
struct FunctionWrapperData {
    v8::Global<v8::Function> original_func;
    std::string root;
    std::string path;
};

// 包装函数的回调
void WrappedFunctionCallback(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    // 从 Data 中获取原始函数和属性名
    v8::Local<v8::Value> data_val = args.Data();
    if (data_val.IsEmpty() || !data_val->IsExternal()) {
        return;
    }
    v8::Local<v8::External> data_ext = data_val.As<v8::External>();
    FunctionWrapperData* data = static_cast<FunctionWrapperData*>(data_ext->Value());
    if (!data) {
        return;
    }

    bool should_log_call = ShouldLogHook(isolate, data->root, data->path, MonitorOp::kCall);
    const auto& log_detail = GetLogDetailConfigForIsolate(isolate);
    HookContext ctx{MonitorOp::kCall, data->root, data->path};
    EmitMonitorHook(isolate, ctx);

    // 记录参数
    if (should_log_call && log_detail.log_call_args && args.Length() > 0) {
        std::ostringstream arg_out;
        arg_out << "[hook] CALL " << data->root << "." << data->path << "\n  args: [";
        for (int i = 0; i < args.Length(); ++i) {
            if (i > 0) arg_out << ", ";
            arg_out << GetValuePreview(isolate, context, args[i]);
        }
        arg_out << "]";
        LEAPVM_LOG_INFO("%s", arg_out.str().c_str());
    }

    // 调用原始函数
    v8::Local<v8::Function> original = data->original_func.Get(isolate);
    v8::TryCatch try_catch(isolate);

    std::vector<v8::Local<v8::Value>> argv;
    for (int i = 0; i < args.Length(); ++i) {
        argv.push_back(args[i]);
    }

    v8::Local<v8::Value> result;
    bool success = original->Call(context, args.This(),
                                   args.Length(),
                                   argv.empty() ? nullptr : argv.data())
                      .ToLocal(&result);

    if (success) {
        // 记录返回值
        if (should_log_call && log_detail.log_call_return) {
            LEAPVM_LOG_INFO("  return: %s", GetValuePreview(isolate, context, result).c_str());
            LEAPVM_LOG_INFO("  %s", std::string(50, '-').c_str());
        }
        args.GetReturnValue().Set(result);
    } else {
        // 函数抛出异常
        if (try_catch.HasCaught()) {
            if (should_log_call) {
                LEAPVM_LOG_ERROR("  exception: %s",
                                 ToUtf8String(isolate, context, try_catch.Exception()).c_str());
                LEAPVM_LOG_INFO("  %s", std::string(50, '-').c_str());
            }
            try_catch.ReThrow();
        }
    }
}

// 包装函数以拦截调用
v8::Local<v8::Function> WrapFunctionWithCallHook(
    v8::Isolate* isolate,
    v8::Local<v8::Context> context,
    const std::string& root,
    const std::string& path,
    v8::Local<v8::Function> original_func) {

    // 创建数据对象
    FunctionWrapperData* data = new FunctionWrapperData();
    data->original_func.Reset(isolate, original_func);
    data->root = root;
    data->path = path;

    // 创建包装函数
    v8::Local<v8::External> data_ext = v8::External::New(isolate, data);
    v8::Local<v8::Function> wrapped =
        v8::Function::New(context, WrappedFunctionCallback, data_ext)
            .ToLocalChecked();

    return wrapped;
}

// ============================================================================
// 匿名命名空间：Window Handler 和其他内部函数
// ============================================================================
namespace {

// GET: 访问 window.xxx
v8::Intercepted WindowNamedGetter(v8::Local<v8::Name> property,
                                  const v8::PropertyCallbackInfo<v8::Value>& info) {
    auto* isolate = info.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    auto context = isolate->GetCurrentContext();

    // 优化点1：Symbol 属性直接跳过，不 Hook
    if (property->IsSymbol()) {
        return v8::Intercepted::kNo;  // 不拦截，让 V8 自己处理
    }

    std::string prop = ToUtf8Name(isolate, context, property);

    // 优化点2：过滤 - 在任何日志输出之前检查
    if (!ShouldEnterHookPipeline(isolate, "window", prop, MonitorOp::kGet)) {
        return v8::Intercepted::kNo;  // 过滤掉，直接跳过
    }

    bool should_log_get = ShouldLogHook(isolate, "window", prop, MonitorOp::kGet);
    bool should_log_call = ShouldLogHook(isolate, "window", prop, MonitorOp::kCall);
    const auto& log_detail = GetLogDetailConfigForIsolate(isolate);

    // 获取实际属性值
    v8::Local<v8::Object> holder = info.Holder();
    v8::Local<v8::Value> value;

    v8::Local<v8::String> key = v8::String::NewFromUtf8(
        isolate, prop.c_str(), v8::NewStringType::kNormal).ToLocalChecked();

    if (!holder->GetRealNamedProperty(context, key).ToLocal(&value)) {
        if (should_log_get) {
            leapvm::HookContext ctx{leapvm::MonitorOp::kGet, "window", prop};
            EmitMonitorHook(isolate, ctx);
        }
        return v8::Intercepted::kNo;
    }

    // 记录 GET 日志（新格式：多行 + 分割线）
    if (should_log_get) {
        HookContext ctx{MonitorOp::kGet, "window", prop};
        EmitMonitorHook(isolate, ctx);

        if (log_detail.log_type) {
            LEAPVM_LOG_INFO("  type: %s", GetValueType(value).c_str());
        }

        if (value->IsFunction() && log_detail.log_func_params) {
            v8::Local<v8::Function> func = value.As<v8::Function>();
            std::string params = GetFunctionParams(isolate, context, func);
            LEAPVM_LOG_INFO("  params: (%s)", params.c_str());
        }

        if (log_detail.log_value) {
            LEAPVM_LOG_INFO("  value: %s", GetValuePreview(isolate, context, value).c_str());
        }

        // 【新增】分割线
        LEAPVM_LOG_INFO("  %s", std::string(50, '-').c_str());
    }

    // 如果是函数且需要拦截调用，返回包装函数
    if (value->IsFunction() && should_log_call) {
        v8::Local<v8::Function> original_func = value.As<v8::Function>();
        v8::Local<v8::Function> wrapped = WrapFunctionWithCallHook(
            isolate, context, "window", prop, original_func);
        info.GetReturnValue().Set(wrapped);
        return v8::Intercepted::kYes;  // 拦截，返回包装函数
    }

    // 返回真实属性值
    info.GetReturnValue().Set(value);
    return v8::Intercepted::kYes;
}

// SET: window.xxx = value
v8::Intercepted WindowNamedSetter(v8::Local<v8::Name> property,
                                  v8::Local<v8::Value> value,
                                  const v8::PropertyCallbackInfo<void>& info) {
    auto* isolate = info.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    auto context = isolate->GetCurrentContext();

    // Symbol 属性直接放行
    if (property->IsSymbol()) {
        return v8::Intercepted::kNo;
    }

    std::string prop = ToUtf8Name(isolate, context, property);

    // 只做日志/监控，不修改写入路径
    bool should_log = ShouldLogHook(isolate, "window", prop, MonitorOp::kSet);
    if (should_log) {
        HookContext ctx{MonitorOp::kSet, "window", prop};
        EmitMonitorHook(isolate, ctx);
    }

    // 不拦截，交回给 V8 默认行为
    return v8::Intercepted::kNo;
}

// QUERY: 用于 `prop in window` / Object.getOwnPropertyDescriptor
v8::Intercepted WindowNamedQuery(v8::Local<v8::Name> property,
                                 const v8::PropertyCallbackInfo<v8::Integer>& info) {
    auto* isolate = info.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    auto context = isolate->GetCurrentContext();

    // Symbol 处理
    if (property->IsSymbol()) {
        return v8::Intercepted::kNo;
    }

    std::string prop = ToUtf8Name(isolate, context, property);

    // 提前判断
    bool should_log = ShouldLogHook(isolate, "window", prop, leapvm::MonitorOp::kGet);

    // 只记录，不拦截
    if (should_log) {
        leapvm::HookContext ctx{leapvm::MonitorOp::kGet, "window", prop};
        EmitMonitorHook(isolate, ctx);
    }

    // 不拦截，让 V8 正常处理
    return v8::Intercepted::kNo;
}

// DELETE: delete window.xxx
v8::Intercepted WindowNamedDeleter(v8::Local<v8::Name> property,
                                   const v8::PropertyCallbackInfo<v8::Boolean>& info) {
    auto* isolate = info.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    auto context = isolate->GetCurrentContext();

    // Symbol 处理
    if (property->IsSymbol()) {
        return v8::Intercepted::kNo;
    }

    std::string prop = ToUtf8Name(isolate, context, property);

    // 提前判断
    bool should_log = ShouldLogHook(isolate, "window", prop, MonitorOp::kSet);

    // 只记录，不拦截
    if (should_log) {
        HookContext ctx{MonitorOp::kSet, "window", prop};
        EmitMonitorHook(isolate, ctx);
    }

    // 不拦截，让 V8 正常处理
    return v8::Intercepted::kNo;
}

// ENUM: for...in / Object.keys(window)
void WindowNamedEnumerator(const v8::PropertyCallbackInfo<v8::Array>& info) {
    // 提前判断 - 枚举操作用 "window" 作为路径
    bool should_log = ShouldLogHook(info.GetIsolate(), "window", "", MonitorOp::kGet);

    if (should_log) {
        HookContext ctx{MonitorOp::kGet, "window", ""};
        EmitMonitorHook(info.GetIsolate(), ctx);
    }

    // 不设置返回值，让 V8 使用默认的枚举行为
}

// DEFINE: Object.defineProperty / 赋值产生的新属性描述
v8::Intercepted WindowNamedDefiner(v8::Local<v8::Name> property,
                                   const v8::PropertyDescriptor& desc,
                                   const v8::PropertyCallbackInfo<void>& info) {
    auto* isolate = info.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    auto context = isolate->GetCurrentContext();

    // 仅处理数据属性，其他情况交给默认路径
    v8::Local<v8::Value> value = desc.value();
    if (value.IsEmpty()) {
        return v8::Intercepted::kNo;
    }

    v8::Local<v8::String> key;
    if (!property->ToString(context).ToLocal(&key)) {
        return v8::Intercepted::kNo;
    }

    info.This()->CreateDataProperty(context, key, value).FromMaybe(false);
    return v8::Intercepted::kYes;
}

}  // namespace (end of anonymous namespace for Window handlers)

// ==========================
//  Lifecycle / Thread
// ==========================

#ifdef _WIN32
static std::atomic<int> g_high_res_ref_count{0};
static std::mutex g_high_res_timer_mu;
static UINT g_high_res_timer_period = 1;
#endif

void VmInstance::EnableHighResolutionTimer() {
#ifdef _WIN32
    const int prev = g_high_res_ref_count.fetch_add(1, std::memory_order_acq_rel);
    if (prev == 0) {
        std::lock_guard<std::mutex> lock(g_high_res_timer_mu);
        TIMECAPS tc;
        if (timeGetDevCaps(&tc, sizeof(TIMECAPS)) != TIMERR_NOERROR) {
            g_high_res_ref_count.fetch_sub(1, std::memory_order_acq_rel);
            LEAPVM_LOG_ERROR("Failed to query high resolution timer caps");
            return;
        }
        g_high_res_timer_period = tc.wPeriodMin;
        MMRESULT begin_result = timeBeginPeriod(g_high_res_timer_period);
        if (begin_result != TIMERR_NOERROR) {
            g_high_res_ref_count.fetch_sub(1, std::memory_order_acq_rel);
            LEAPVM_LOG_ERROR("Failed to enable high resolution timer (code=%u)", begin_result);
            return;
        }
        LEAPVM_LOG_INFO("High resolution timer enabled (period: %u ms)", g_high_res_timer_period);
    }
#else
    LEAPVM_LOG_WARN("高精度定时器仅在 Windows 上可用");
#endif
}

void VmInstance::DisableHighResolutionTimer() {
#ifdef _WIN32
    const int prev = g_high_res_ref_count.fetch_sub(1, std::memory_order_acq_rel);
    if (prev <= 0) {
        g_high_res_ref_count.store(0, std::memory_order_release);
        LEAPVM_LOG_WARN("DisableHighResolutionTimer called with ref_count=%d", prev);
        return;
    }

    if (prev == 1) {
        std::lock_guard<std::mutex> lock(g_high_res_timer_mu);
        MMRESULT end_result = timeEndPeriod(g_high_res_timer_period);
        if (end_result != TIMERR_NOERROR) {
            LEAPVM_LOG_ERROR("Failed to disable high resolution timer (code=%u)", end_result);
            return;
        }
        LEAPVM_LOG_INFO("High resolution timer disabled");
    }
#endif
}

// ============================================================================
// VmInstance 构造/析构函数
// ============================================================================

VmInstance::VmInstance() {
    LEAPVM_LOG_INFO("Creating VmInstance...");

    // 1. 创建独立的内存分配器
    // 每个 VmInstance 都有自己的 ArrayBuffer 分配器
    LEAPVM_LOG_DEBUG("Creating ArrayBuffer allocator");
    allocator_.reset(v8::ArrayBuffer::Allocator::NewDefaultAllocator());

    v8::Isolate::CreateParams create_params;
    create_params.array_buffer_allocator = allocator_.get();

    // 启用 Inspector 支持所需的标志
    // 参考 Node.js: 确保允许原子等待（用于调试器暂停）
    create_params.allow_atomics_wait = true;

    // 2. 创建 Isolate
    // 这会调用 leapvm.node 内部静态链接的 v8::Isolate::New()
    // 由于 /WHOLEARCHIVE 强制链接，确保使用 v8_monolith.lib 的实现
    LEAPVM_LOG_INFO("Creating Isolate (independent V8 instance)");
    isolate_ = v8::Isolate::New(create_params);
    isolate_->SetData(0, this);
    ApplyPendingHookConfig();

    {
        v8::Isolate::Scope isolate_scope(isolate_);
        v8::HandleScope handle_scope(isolate_);

        v8::Local<v8::ObjectTemplate> global =
            v8::ObjectTemplate::New(isolate_);

        // 🔥 给 Global 对象预留 1 个 InternalField，用于存放 "Window" 类型标记
        // 这样 DispatchBridge 的 UniversalGetter 才能识别 window 对象
        global->SetInternalFieldCount(1);

        // 预建 leapenv 结构，避免拦截器阻止 JS 创建
        v8::Local<v8::ObjectTemplate> leapenv_tpl =
            v8::ObjectTemplate::New(isolate_);
        auto add_empty_child = [&](const char* name) {
            leapenv_tpl->Set(
                v8::String::NewFromUtf8(isolate_, name,
                                        v8::NewStringType::kNormal)
                    .ToLocalChecked(),
                v8::ObjectTemplate::New(isolate_));
        };
        add_empty_child("config");
        add_empty_child("toolsFunc");
        add_empty_child("impl");
        add_empty_child("innerFunc");
        add_empty_child("memory");
        global->Set(v8::String::NewFromUtf8Literal(isolate_, "leapenv"),
                    leapenv_tpl);

        // 1) 给 context->Global() 挂上 NamedPropertyHandler（C++ 版 Proxy）
        // 用于监控写入，不改变 JS 语义，不访问代理背后的内部 global
        LEAPVM_LOG_DEBUG("Setting up NamedPropertyHandler (Hook system)");
        global->SetHandler(v8::NamedPropertyHandlerConfiguration(
            nullptr,  // getter
            WindowNamedSetter,
            nullptr,  // query
            nullptr,  // deleter
            nullptr,  // enumerator
            nullptr,  // definer
            nullptr,  // descriptor
            v8::Local<v8::Value>(),
            v8::PropertyHandlerFlags::kNonMasking));

        // A3: IndexedPropertyHandler for window[n] -> child frames
        global->SetHandler(v8::IndexedPropertyHandlerConfiguration(
            FramesIndexedGetter,
            nullptr,  // setter
            nullptr,  // query
            nullptr,  // deleter
            nullptr,  // enumerator
            v8::Local<v8::Value>(),
            v8::PropertyHandlerFlags::kNonMasking));

        // A3: Save global template for child-frame context creation
        global_template_.Reset(isolate_, global);

        // 2) 创建 Context
        LEAPVM_LOG_DEBUG("Creating Context with global template");
        v8::Local<v8::Context> context =
            v8::Context::New(isolate_, nullptr, global);

        // 3) 在创建 Context 后，手动设置所有自引用属性
        // 这样确保 window === self === globalThis === top === parent === frames
        {
            v8::Context::Scope context_scope(context);
            v8::Local<v8::Object> global_obj = context->Global();

            LEAPVM_LOG_DEBUG("Setting up global aliases (window, self, globalThis...)");
            auto add_self_reference = [&](const char* name) {
                v8::Local<v8::String> key =
                    v8::String::NewFromUtf8(isolate_, name,
                                           v8::NewStringType::kInternalized)
                        .ToLocalChecked();
                // 使用 CreateDataProperty 绕过拦截器，直接写到 context->Global()
                global_obj->CreateDataProperty(context, key, global_obj).Check();
            };

            add_self_reference("window");
            add_self_reference("self");
            add_self_reference("top");
            add_self_reference("parent");
            add_self_reference("frames");
            add_self_reference("globalThis");

            // 预建 leapenv 结构，避免拦截器阻止 JS 创建
            v8::Local<v8::Object> leapenv_obj = v8::Object::New(isolate_);
            global_obj->CreateDataProperty(
                context,
                v8::String::NewFromUtf8Literal(isolate_, "leapenv"),
                leapenv_obj).Check();

            auto add_child_object = [&](v8::Local<v8::Object> parent, const char* name) {
                v8::Local<v8::Object> child = v8::Object::New(isolate_);
                parent->CreateDataProperty(
                    context,
                    v8::String::NewFromUtf8(isolate_, name,
                                            v8::NewStringType::kNormal).ToLocalChecked(),
                    child).Check();
                return child;
            };

            add_child_object(leapenv_obj, "config");
            add_child_object(leapenv_obj, "toolsFunc");
            add_child_object(leapenv_obj, "impl");
            add_child_object(leapenv_obj, "innerFunc");
            v8::Local<v8::Object> memory_obj = add_child_object(leapenv_obj, "memory");

            // memory.privateData = new WeakMap()
            v8::Local<v8::Value> weakmap_ctor_val;
            if (global_obj->Get(context,
                                v8::String::NewFromUtf8Literal(isolate_, "WeakMap"))
                    .ToLocal(&weakmap_ctor_val) &&
                weakmap_ctor_val->IsFunction()) {
                v8::Local<v8::Function> weakmap_ctor = weakmap_ctor_val.As<v8::Function>();
                v8::Local<v8::Value> weakmap_instance;
                if (weakmap_ctor->NewInstance(context).ToLocal(&weakmap_instance) &&
                    weakmap_instance->IsObject()) {
                    memory_obj->CreateDataProperty(
                        context,
                        v8::String::NewFromUtf8Literal(isolate_, "privateData"),
                        weakmap_instance).Check();
                }
            }
        }

        // 4) 安装 Window 构造函数 + 原型链
        // 🔥 注释掉旧的 InstallWindow，改为在 Skeleton 加载后通过 InstallGlobals 设置
        // 这样可以避免与 Skeleton 定义的 Window 冲突
        LEAPVM_LOG_DEBUG("Skipping old InstallWindow (will be done via Skeleton)");
        // InstallWindow(context);

        // 5) 安装 console / timer API（原逻辑不变）
        LEAPVM_LOG_DEBUG("Installing console API");
        InstallConsole(context);
        LEAPVM_LOG_DEBUG("Installing timer APIs (setTimeout, setInterval)");
        InstallTimers(context);
        LEAPVM_LOG_DEBUG("Installing native wrapper ($native.wrapObject)");
        InstallNativeWrapper(context);

        context_.Reset(isolate_, context);
    }

    // 6) 启动 VM 线程（在 Isolate 和 Context 初始化完成后）
    LEAPVM_LOG_INFO("Starting VM thread for timer execution");
    StartVmThread();

    LEAPVM_LOG_INFO("VmInstance created successfully!");
    LEAPVM_LOG_INFO("========================================");
}

VmInstance::~VmInstance() {
    LEAPVM_LOG_INFO("[shutdown] VmInstance dtor begin");
    // I-6: 设置析构标志，StubCallback 检测到此标志后立即返回，防止 UAF
    is_disposing_ = true;

    // Inspector must be torn down on VM thread before isolate disposal.
    if (inspector_client_ && vm_thread_running_) {
        std::promise<void> inspector_done;
        auto inspector_done_future = inspector_done.get_future();
        PostTask([this, &inspector_done](v8::Isolate* isolate, v8::Local<v8::Context> context) {
            (void)isolate;
            if (inspector_client_) {
                inspector_client_->Shutdown(context);
            }
            inspector_done.set_value();
        });
        inspector_done_future.wait();
    }
    inspector_client_.reset();
    LEAPVM_LOG_INFO("[shutdown] inspector torn down");
    inspector_port_ = 0;
    inspector_target_id_.clear();

    // 1. 停止 VM 线程（ThreadMain 退出前会清理所有 Global 句柄）
    LEAPVM_LOG_INFO("[shutdown] stopping VM thread");
    StopVmThread();
    LEAPVM_LOG_INFO("[shutdown] VM thread stopped");

    // 清理 DOM wrapper 弱缓存（防御性清理：正常情况下 ThreadMain 已清空）
    // 若有残余，使用 ClearWeak 取回 payload 指针并释放，避免内存泄漏。
    for (auto& pair : dom_wrapper_cache_) {
        auto* payload = pair.second.wrapper.ClearWeak<DomWrapperWeakPayload>();
        delete payload;
        pair.second.wrapper.Reset();
    }
    dom_wrapper_cache_.clear();
    LEAPVM_LOG_INFO("[shutdown] dom wrapper cache cleared");

    // 2. 在释放 DispatchMeta 之前先泵送平台消息队列
    //    确保 V8 内部所有待处理平台任务在 DispatchMeta 仍有效时运行完毕
    //    修复了 "Check failed: group->reference_count_.load() == 1" 崩溃
    if (isolate_) {
        v8::Locker locker(isolate_);
        v8::Isolate::Scope isolate_scope(isolate_);
        v8::HandleScope handle_scope(isolate_);
        while (v8::platform::PumpMessageLoop(
                V8Platform::Instance().platform(),
                isolate_,
                v8::platform::MessageLoopBehavior::kDoNotWait)) {
            // 继续泵送直到队列为空
        }
        isolate_->LowMemoryNotification();
        while (v8::platform::PumpMessageLoop(
                V8Platform::Instance().platform(),
                isolate_,
                v8::platform::MessageLoopBehavior::kDoNotWait)) {
            // 再次泵送，确保 GC/弱回调后续任务被清空
        }
    }
    LEAPVM_LOG_INFO("[shutdown] platform queue drained");

    // 3. 清理 child frames and skeleton registry
    //    Child frame registries must be cleared before main skeleton_registry_
    for (auto& [id, cf] : child_frames_) {
        cf.dispatch_fn.Reset();
        cf.registry.reset();
        cf.context.Reset();
    }
    child_frames_.clear();
    global_template_.Reset();

    //    释放 DispatchMeta 等持久对象
    //    此时平台队列已空，is_disposing_ 为 true，StubCallback 不会再访问 meta
    skeleton_registry_.reset();
    LEAPVM_LOG_INFO("[shutdown] skeleton registry cleared");

    // 4. 此时 VM 线程已停止，所有 Global 句柄已清理，平台消息队列已清空
    //    安全地在主线程 Dispose Isolate
    if (isolate_) {
        LEAPVM_LOG_INFO("[shutdown] disposing isolate");
        isolate_->Dispose();
        isolate_ = nullptr;
    }
    allocator_.reset();
    LEAPVM_LOG_INFO("[shutdown] VmInstance dtor end");
}

v8::Local<v8::Object> VmInstance::GetCachedDomWrapper(v8::Local<v8::Context> context,
                                                      uint32_t doc_id,
                                                      uint32_t node_id,
                                                      uint32_t generation,
                                                      const std::string& ctor_name) {
    DomWrapperCacheKey key;
    key.doc_id = doc_id;
    key.node_id = node_id;
    key.generation = generation;
    key.ctor_name = ctor_name;
    return GetCachedDomWrapperByKey(context, key);
}

v8::Local<v8::Object> VmInstance::GetCachedDomWrapperByKey(v8::Local<v8::Context> context,
                                                           const DomWrapperCacheKey& key) {
    (void)context;
    auto it = dom_wrapper_cache_.find(key);
    if (it == dom_wrapper_cache_.end() || it->second.wrapper.IsEmpty()) {
        return v8::Local<v8::Object>();
    }
    return it->second.wrapper.Get(isolate_);
}

void VmInstance::CacheDomWrapper(v8::Isolate* isolate,
                                 uint32_t doc_id,
                                 uint32_t node_id,
                                 uint32_t generation,
                                 const std::string& ctor_name,
                                 v8::Local<v8::Object> wrapper) {
    DomWrapperCacheKey key;
    key.doc_id = doc_id;
    key.node_id = node_id;
    key.generation = generation;
    key.ctor_name = ctor_name;
    CacheDomWrapperByKey(isolate, key, wrapper);
}

void VmInstance::CacheDomWrapperByKey(v8::Isolate* isolate,
                                      const DomWrapperCacheKey& key,
                                      v8::Local<v8::Object> wrapper) {
    auto existing = dom_wrapper_cache_.find(key);
    if (existing != dom_wrapper_cache_.end()) {
        existing->second.wrapper.Reset();
        dom_wrapper_cache_.erase(existing);
    }

    DomWrapperCacheEntry entry;
    entry.serial = next_dom_wrapper_serial_++;
    entry.wrapper.Reset(isolate, wrapper);

    auto* payload = new DomWrapperWeakPayload();
    payload->self = this;
    payload->key = key;
    payload->serial = entry.serial;

    entry.wrapper.SetWeak(payload, &VmInstance::OnDomWrapperWeakCallback, v8::WeakCallbackType::kParameter);
    dom_wrapper_cache_.emplace(key, std::move(entry));
}

void VmInstance::OnDomWrapperCollected(const DomWrapperCacheKey& key, uint64_t serial) {
    auto it = dom_wrapper_cache_.find(key);
    if (it == dom_wrapper_cache_.end()) {
        return;
    }
    if (it->second.serial != serial) {
        return;
    }
    it->second.wrapper.Reset();
    dom_wrapper_cache_.erase(it);
}

void VmInstance::OnDomWrapperWeakCallback(const v8::WeakCallbackInfo<DomWrapperWeakPayload>& info) {
    DomWrapperWeakPayload* payload = info.GetParameter();
    if (!payload) {
        return;
    }
    // 不在 GC 回调中直接 erase（违反 V8 First-pass 规范），只入队
    // 由 RunLoopOnce 末尾统一消费，此时不在任何迭代中，erase 安全
    if (payload->self) {
        payload->self->pending_dom_wrapper_cleanup_.push_back(
            {payload->key, payload->serial});
    }
    delete payload;
}

v8::Local<v8::Context> VmInstance::GetContext() const {
    return context_.Get(isolate_);
}

// ==========================
//  Monitor / Hooks
// ==========================

MonitorConfig& VmInstance::monitor_config() {
    return monitor_config_holder_.config();
}

HookRegistry& VmInstance::hook_registry() {
    return hook_registry_;
}

MonitorEngine& VmInstance::monitor_engine() {
    return monitor_engine_;
}

void VmInstance::ApplyPendingHookConfig() {
    if (hook_config_.pending_monitor_enabled_set) {
        monitor_config_holder_.config().enabled = hook_config_.pending_monitor_enabled;
    }
    if (!hook_config_.pending_rules.empty()) {
        hook_registry_.SetRules(hook_config_.pending_rules);
    }
}

void VmInstance::SetMonitorEnabled(bool enabled) {
    monitor_config_holder_.config().enabled = enabled;
}

void VmInstance::InstallBuiltinWrappers(BuiltinWrapperConfig config) {
    std::promise<void> done_promise;
    auto future = done_promise.get_future();

    PostTask([this, config = std::move(config), &done_promise]
             (v8::Isolate* isolate, v8::Local<v8::Context> context) mutable {
        builtin_wrapper_manager_.SetConfig(std::move(config));
        builtin_wrapper_manager_.InstallInContext(isolate, context);
        done_promise.set_value();
    });

    future.get();
}

void VmInstance::InstallConsole(v8::Local<v8::Context> context) {
    if (!isolate_) return;

    v8::Isolate* isolate = isolate_;
    v8::HandleScope handle_scope(isolate);

    // 把当前 VmInstance 指针作为 data 传入，方便在回调中取回
    v8::Local<v8::External> data =
        v8::External::New(isolate, this);

    // 1. 创建 console 对象模板
    v8::Local<v8::ObjectTemplate> console_t =
        v8::ObjectTemplate::New(isolate);

    console_t->Set(
        v8::String::NewFromUtf8(isolate, "log",
                                v8::NewStringType::kNormal)
            .ToLocalChecked(),
        v8::FunctionTemplate::New(isolate, ConsoleLogCallback, data));

    console_t->Set(
        v8::String::NewFromUtf8(isolate, "warn",
                                v8::NewStringType::kNormal)
            .ToLocalChecked(),
        v8::FunctionTemplate::New(isolate, ConsoleWarnCallback, data));

    console_t->Set(
        v8::String::NewFromUtf8(isolate, "error",
                                v8::NewStringType::kNormal)
            .ToLocalChecked(),
        v8::FunctionTemplate::New(isolate, ConsoleErrorCallback, data));

    // 2. 在当前 Context 中实例化 console 对象
    v8::Local<v8::Object> console_obj;
    if (!console_t->NewInstance(context).ToLocal(&console_obj)) {
        LEAPVM_LOG_ERROR("Failed to create console object");
        return;
    }

    // 3. 只挂到 context->Global()（JS 视角唯一的 window/globalThis）
    v8::Local<v8::Object> global_obj = context->Global();

    v8::Local<v8::String> console_key =
        v8::String::NewFromUtf8(isolate, "console",
                                v8::NewStringType::kNormal)
            .ToLocalChecked();

    bool ok = global_obj
        ->Set(context, console_key, console_obj)
        .FromMaybe(false);

    if (!ok) {
        LEAPVM_LOG_ERROR("Failed to install console on global");
    } else {
        LEAPVM_LOG_DEBUG("console installed on global");
    }
}

// ==========================
//  Script execution
// ==========================

bool VmInstance::RunScript(const std::string& source_utf8,
                           std::string& result_out,
                           std::string* error_out,
                           const std::string& resource_name) {
    if (!isolate_) return false;

    // 使用 promise + future 保持同步语义
    std::promise<bool> done_promise;
    auto future = done_promise.get_future();

    // 将执行逻辑包装成任务投递到 VM 线程
    PostTask([this, source_utf8, resource_name, &result_out, error_out, &done_promise]
             (v8::Isolate* isolate, v8::Local<v8::Context> context) {
        // A3: Store pending source so NativeDefineEnvironmentSkeleton can capture it
        pending_script_source_ = source_utf8;

        // 原 RunScript 逻辑搬到这里
        v8::HandleScope handle_scope(isolate);
        v8::Context::Scope context_scope(context);
        v8::TryCatch try_catch(isolate);

        bool success = false;

        v8::Local<v8::String> source;
        if (!v8::String::NewFromUtf8(isolate,
                                     source_utf8.c_str(),
                                     v8::NewStringType::kNormal)
                 .ToLocal(&source)) {
            if (error_out) *error_out = "Failed to create source string";
            done_promise.set_value(false);
            return;
        }

        // A1: ScriptOrigin — 给脚本设置来源 URL，使堆栈显示真实的文件名
        std::string effective_name = resource_name.empty()
            ? "https://www.example.com/js/main.js"
            : resource_name;
        v8::Local<v8::String> res_name =
            v8::String::NewFromUtf8(isolate, effective_name.c_str(),
                                    v8::NewStringType::kNormal)
                .ToLocalChecked();
        v8::ScriptOrigin origin(res_name);

        v8::Local<v8::Script> script;
        if (!v8::Script::Compile(context, source, &origin).ToLocal(&script)) {
            // 🔍 调试信息：打印源码长度和完整内容
            fprintf(stderr, "\n[RunScript] ❌ Compile failed!\n");
            fprintf(stderr, "[RunScript] Source length: %zu bytes\n", source_utf8.size());

            // 如果源码很短（<500字符），显示完整内容；否则显示前200和后200字符
            if (source_utf8.size() <= 500) {
                fprintf(stderr, "[RunScript] Full source: >>>%s<<<\n",
                        source_utf8.c_str());
            } else {
                std::string preview_start = source_utf8.substr(0, 200);
                std::string preview_end = source_utf8.substr(source_utf8.size() - 200);
                fprintf(stderr, "[RunScript] Source preview (first 200 chars): >>>%s<<<\n",
                        preview_start.c_str());
                fprintf(stderr, "[RunScript] ... (truncated %zu chars) ...\n",
                        source_utf8.size() - 400);
                fprintf(stderr, "[RunScript] Source preview (last 200 chars): >>>%s<<<\n",
                        preview_end.c_str());
            }
            fprintf(stderr, "\n");
            fflush(stderr);

            if (error_out) {
                // 获取详细的编译错误信息
                if (try_catch.HasCaught()) {
                    v8::Local<v8::Message> message = try_catch.Message();
                    if (!message.IsEmpty()) {
                        v8::String::Utf8Value exception(isolate, try_catch.Exception());
                        v8::String::Utf8Value sourceline(isolate,
                            message->GetSourceLine(context).ToLocalChecked());

                        // 安全获取行号，避免 line 0 的误导
                        int linenum = 0;
                        if (message->GetLineNumber(context).To(&linenum) && linenum > 0) {
                            std::string error_msg = *exception ? *exception : "Compile error";
                            error_msg += " at line " + std::to_string(linenum);
                            error_msg += ": " + std::string(*sourceline ? *sourceline : "");
                            *error_out = error_msg;
                        } else {
                            // 行号无效或为0，不显示行号信息
                            std::string error_msg = *exception ? *exception : "Compile error";
                            if (*sourceline && std::string(*sourceline).length() > 0) {
                                error_msg += ": " + std::string(*sourceline);
                            }
                            *error_out = error_msg;
                        }
                    } else {
                        v8::String::Utf8Value exception(isolate, try_catch.Exception());
                        *error_out = *exception ? *exception : "Compile error";
                    }
                } else {
                    *error_out = "Compile error (no exception caught)";
                }
            }
            done_promise.set_value(false);
            return;
        }

        v8::Local<v8::Value> result;
        if (!script->Run(context).ToLocal(&result)) {
            if (error_out) {
                v8::String::Utf8Value message(isolate, try_catch.Exception());
                *error_out = *message ? *message : "Runtime error";
            }
            done_promise.set_value(false);
            return;
        }

        // I-7: 显式驱动微任务队列，确保 Promise.then 等微任务在 RunScript 返回前执行
        isolate->PerformMicrotaskCheckpoint();

        v8::String::Utf8Value utf8(isolate, result);
        result_out.assign(*utf8 ? *utf8 : "", utf8.length());
        pending_script_source_.clear();
        done_promise.set_value(true);
    });

    // 阻塞等待任务完成（维持原有同步语义）
    return future.get();
}

// ============================================================================
// Timer Implementation
// ============================================================================

void VmInstance::InstallTimers(v8::Local<v8::Context> context) {
    v8::Isolate* isolate = context->GetIsolate();
    v8::HandleScope handle_scope(isolate);

    v8::Local<v8::External> data = v8::External::New(isolate, this);

    auto bind = [&](const char* name, v8::FunctionCallback cb) {
        v8::Local<v8::FunctionTemplate> tmpl =
            v8::FunctionTemplate::New(isolate, cb, data);
        v8::Local<v8::Function> fn =
            tmpl->GetFunction(context).ToLocalChecked();

        v8::Local<v8::String> name_str =
            v8::String::NewFromUtf8(isolate, name, v8::NewStringType::kNormal)
                .ToLocalChecked();

        context->Global()
            ->CreateDataProperty(context, name_str, fn)
            .Check();
    };

    bind("setTimeout",      NativeSetTimeout);
    bind("clearTimeout",    NativeClearTimeout);
    bind("setInterval",     NativeSetInterval);
    bind("clearInterval",   NativeClearInterval);
}

v8::Local<v8::Object> VmInstance::InternalWrapObject(
    v8::Isolate* isolate,
    v8::Local<v8::Context> context,
    v8::Local<v8::Object> backing_object,
    const std::string& label,
    const std::string& brand) {

    v8::EscapableHandleScope handle_scope(isolate);

    leapvm::NativeWrapperMeta meta{label};
    uint32_t meta_id = leapvm::NativeWrapperRegistry::Instance().Register(meta);

    v8::Local<v8::ObjectTemplate> tpl = leapvm::CreateNativeWrapperTemplate(isolate);
    v8::Local<v8::Object> wrapper;
    if (!tpl->NewInstance(context).ToLocal(&wrapper)) {
        return v8::Local<v8::Object>();
    }

    leapvm::SetNativeWrapperInternalFields(isolate, wrapper, backing_object, meta_id);

    if (!brand.empty() && skeleton_registry_) {
        skeleton_registry_->SetBrand(wrapper, brand);
    }

    return handle_scope.Escape(wrapper);
}

// Native wrapObject callback (exposed in LeapVM global scope)
static void NativeWrapObjectCallback(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    // 1. 参数检查
    if (args.Length() < 1 || !args[0]->IsObject()) {
        isolate->ThrowException(v8::String::NewFromUtf8(isolate, "First argument must be an object").ToLocalChecked());
        return;
    }

    VmInstance* self = VmInstance::UnwrapFromData(args);
    if (!self) {
        args.GetReturnValue().Set(v8::Undefined(isolate));
        return;
    }

    v8::Local<v8::Object> backing = args[0].As<v8::Object>();

    // 2. 获取可选的 label 参数
    std::string label = "object";
    if (args.Length() >= 2 && args[1]->IsString()) {
        v8::String::Utf8Value label_utf8(isolate, args[1]);
        if (*label_utf8) {
            label = std::string(*label_utf8);
        }
    }

    std::string brand;
    if (args.Length() >= 3 && args[2]->IsString()) {
        v8::String::Utf8Value brand_utf8(isolate, args[2]);
        if (*brand_utf8) {
            brand = std::string(*brand_utf8);
        }
    }

    v8::Local<v8::Object> wrapper = self->InternalWrapObject(isolate, context, backing, label, brand);
    if (wrapper.IsEmpty()) {
        isolate->ThrowException(v8::String::NewFromUtf8(isolate, "Failed to create wrapper object").ToLocalChecked());
        return;
    }

    args.GetReturnValue().Set(wrapper);
}

static void NativeSetMonitorEnabled(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);

    VmInstance* self = VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    bool enabled = false;
    if (args.Length() >= 1 && args[0]->IsBoolean()) {
        enabled = args[0]->BooleanValue(isolate);
    }

    self->SetMonitorEnabled(enabled);
}

bool ParseNodeHandle(v8::Isolate* isolate,
                     v8::Local<v8::Context> context,
                     v8::Local<v8::Value> input,
                     leapvm::dom::NodeHandle* out_handle);

static void NativeCreateSkeletonInstance(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    VmInstance* self = VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    if (args.Length() < 1 || !args[0]->IsString()) {
        isolate->ThrowException(v8::String::NewFromUtf8(isolate, "ctorName (string) required", v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    std::string ctor_name = ToUtf8String(isolate, context, args[0]);
    std::string label = ctor_name;
    if (args.Length() >= 2 && args[1]->IsString()) {
        label = ToUtf8String(isolate, context, args[1]);
    }

    std::optional<leapvm::dom::NodeHandle> cache_handle;
    if (args.Length() >= 3 && args[2]->IsObject()) {
        leapvm::dom::NodeHandle handle;
        if (ParseNodeHandle(isolate, context, args[2], &handle)) {
            cache_handle = handle;
        }
    }

    if (cache_handle.has_value()) {
        v8::Local<v8::Object> cached = self->GetCachedDomWrapper(
            context,
            cache_handle->doc_id,
            cache_handle->node_id,
            cache_handle->generation,
            ctor_name);
        if (!cached.IsEmpty()) {
            args.GetReturnValue().Set(cached);
            return;
        }
    }

    auto* registry = self->skeleton_registry();
    if (!registry) {
        isolate->ThrowException(v8::String::NewFromUtf8(isolate, "skeleton registry not initialized", v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    v8::Local<v8::Object> real = registry->CreateInstanceByCtorName(ctor_name);
    if (real.IsEmpty()) {
        args.GetReturnValue().Set(v8::Undefined(isolate));
        return;
    }

    if (cache_handle.has_value()) {
        self->CacheDomWrapper(
            isolate,
            cache_handle->doc_id,
            cache_handle->node_id,
            cache_handle->generation,
            ctor_name,
            real);
    }

    // 直接返回 Skeleton 实例，不再包装 NativeWrapper
    // Skeleton 实例已经具备 InternalField[0]=TypeName 和 UniversalGetter，可以直接工作
    args.GetReturnValue().Set(real);
}

// __applyInstanceSkeleton__(targetObj, instanceName)
// Applies all INSTANCE-owned properties from the named instance skeleton onto targetObj.
// This provides the missing Layer 2 (AddPropertyToObject) for dynamically created objects
// (e.g. per-task HTMLDocument) that bypass CreateInstanceFromInstanceSkeleton.
static void NativeApplyInstanceSkeleton(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    VmInstance* self = VmInstance::UnwrapFromData(args);
    if (!self) {
        args.GetReturnValue().Set(v8::Boolean::New(isolate, false));
        return;
    }

    if (args.Length() < 2 || !args[0]->IsObject() || !args[1]->IsString()) {
        isolate->ThrowException(v8::String::NewFromUtf8(isolate,
            "__applyInstanceSkeleton__(obj, instanceName) - two arguments required",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    v8::Local<v8::Object> target = args[0].As<v8::Object>();
    std::string instance_name = ToUtf8String(isolate, context, args[1]);

    auto* registry = self->skeleton_registry();
    if (!registry) {
        args.GetReturnValue().Set(v8::Boolean::New(isolate, false));
        return;
    }

    registry->ApplyInstanceSkeletonToObject(instance_name, target);
    args.GetReturnValue().Set(v8::Boolean::New(isolate, true));
}

struct NativeHtmlToken {
    enum class Kind {
        kOpen,
        kClose
    };

    Kind kind = Kind::kOpen;
    std::string tag_name;
    std::vector<std::pair<std::string, std::string>> attrs;
    bool self_closing = false;
};

inline bool IsHtmlSpace(char c) {
    switch (c) {
    case ' ':
    case '\n':
    case '\r':
    case '\t':
    case '\f':
    case '\v':
        return true;
    default:
        return false;
    }
}

std::string TrimAscii(const std::string& input) {
    size_t begin = 0;
    size_t end = input.size();
    while (begin < end && IsHtmlSpace(input[begin])) {
        ++begin;
    }
    while (end > begin && IsHtmlSpace(input[end - 1])) {
        --end;
    }
    return input.substr(begin, end - begin);
}

std::string ToLowerAscii(const std::string& input) {
    std::string out = input;
    std::transform(out.begin(), out.end(), out.begin(),
        [](unsigned char ch) { return static_cast<char>(std::tolower(ch)); });
    return out;
}

size_t FindTagEnd(const std::string& html, size_t from) {
    bool in_quote = false;
    char quote = 0;
    for (size_t i = from; i < html.size(); ++i) {
        char c = html[i];
        if (in_quote) {
            if (c == quote) {
                in_quote = false;
            }
            continue;
        }
        if (c == '"' || c == '\'') {
            in_quote = true;
            quote = c;
            continue;
        }
        if (c == '>') {
            return i;
        }
    }
    return std::string::npos;
}

size_t ReadTagLikeName(const std::string& html, size_t from, std::string* out_name) {
    size_t i = from;
    while (i < html.size()) {
        char c = html[i];
        if (IsHtmlSpace(c) || c == '/' || c == '>' || c == '=') {
            break;
        }
        ++i;
    }
    if (out_name) {
        *out_name = html.substr(from, i - from);
    }
    return i;
}

void ParseAttributeChunk(const std::string& chunk,
                         std::vector<std::pair<std::string, std::string>>* out_attrs) {
    if (!out_attrs) {
        return;
    }

    size_t i = 0;
    while (i < chunk.size()) {
        while (i < chunk.size() && (IsHtmlSpace(chunk[i]) || chunk[i] == '/')) {
            ++i;
        }
        if (i >= chunk.size()) {
            break;
        }

        size_t name_begin = i;
        while (i < chunk.size()) {
            char c = chunk[i];
            if (IsHtmlSpace(c) || c == '=' || c == '/' || c == '>') {
                break;
            }
            ++i;
        }
        if (i <= name_begin) {
            ++i;
            continue;
        }
        std::string name = chunk.substr(name_begin, i - name_begin);

        while (i < chunk.size() && IsHtmlSpace(chunk[i])) {
            ++i;
        }

        std::string value;
        if (i < chunk.size() && chunk[i] == '=') {
            ++i;
            while (i < chunk.size() && IsHtmlSpace(chunk[i])) {
                ++i;
            }

            if (i < chunk.size() && (chunk[i] == '"' || chunk[i] == '\'')) {
                char quote = chunk[i++];
                size_t value_begin = i;
                while (i < chunk.size() && chunk[i] != quote) {
                    ++i;
                }
                value = chunk.substr(value_begin, i - value_begin);
                if (i < chunk.size() && chunk[i] == quote) {
                    ++i;
                }
            } else {
                size_t value_begin = i;
                while (i < chunk.size()) {
                    char c = chunk[i];
                    if (IsHtmlSpace(c) || c == '/' || c == '>') {
                        break;
                    }
                    ++i;
                }
                value = chunk.substr(value_begin, i - value_begin);
            }
        }

        out_attrs->emplace_back(std::move(name), std::move(value));
    }
}

bool IsVoidTag(const std::string& lower_tag_name) {
    static const std::unordered_set<std::string> kVoidTags = {
        "area", "base", "br", "col", "embed", "hr",
        "img", "input", "link", "meta", "param",
        "source", "track", "wbr"
    };
    return kVoidTags.find(lower_tag_name) != kVoidTags.end();
}

void ParseHtmlIntoTokens(const std::string& html, std::vector<NativeHtmlToken>* out_tokens) {
    if (!out_tokens) {
        return;
    }

    size_t i = 0;
    while (i < html.size()) {
        if (html[i] != '<') {
            ++i;
            continue;
        }

        if (i + 3 < html.size() && html.compare(i, 4, "<!--") == 0) {
            size_t end = html.find("-->", i + 4);
            if (end == std::string::npos) {
                break;
            }
            i = end + 3;
            continue;
        }

        if (i + 1 < html.size() && (html[i + 1] == '!' || html[i + 1] == '?')) {
            size_t end = FindTagEnd(html, i + 1);
            if (end == std::string::npos) {
                break;
            }
            i = end + 1;
            continue;
        }

        if (i + 1 < html.size() && html[i + 1] == '/') {
            size_t cursor = i + 2;
            while (cursor < html.size() && IsHtmlSpace(html[cursor])) {
                ++cursor;
            }
            std::string tag_name;
            cursor = ReadTagLikeName(html, cursor, &tag_name);

            size_t end = FindTagEnd(html, cursor);
            if (end == std::string::npos) {
                break;
            }
            i = end + 1;

            tag_name = ToLowerAscii(TrimAscii(tag_name));
            if (tag_name.empty()) {
                continue;
            }

            NativeHtmlToken token;
            token.kind = NativeHtmlToken::Kind::kClose;
            token.tag_name = std::move(tag_name);
            out_tokens->push_back(std::move(token));
            continue;
        }

        size_t cursor = i + 1;
        while (cursor < html.size() && IsHtmlSpace(html[cursor])) {
            ++cursor;
        }
        std::string tag_name;
        cursor = ReadTagLikeName(html, cursor, &tag_name);
        tag_name = ToLowerAscii(TrimAscii(tag_name));
        if (tag_name.empty()) {
            ++i;
            continue;
        }

        size_t end = FindTagEnd(html, cursor);
        if (end == std::string::npos) {
            break;
        }

        std::string attr_chunk = html.substr(cursor, end - cursor);
        size_t tail = attr_chunk.size();
        while (tail > 0 && IsHtmlSpace(attr_chunk[tail - 1])) {
            --tail;
        }

        bool self_closing = false;
        if (tail > 0 && attr_chunk[tail - 1] == '/') {
            self_closing = true;
            --tail;
        }
        attr_chunk = attr_chunk.substr(0, tail);

        NativeHtmlToken token;
        token.kind = NativeHtmlToken::Kind::kOpen;
        token.tag_name = std::move(tag_name);
        token.self_closing = self_closing || IsVoidTag(token.tag_name);
        ParseAttributeChunk(attr_chunk, &token.attrs);
        out_tokens->push_back(std::move(token));

        i = end + 1;
    }
}

bool CallMethodSafe(v8::Isolate* isolate,
                    v8::Local<v8::Context> context,
                    v8::Local<v8::Object> receiver,
                    const char* method_name,
                    int argc,
                    v8::Local<v8::Value>* argv,
                    v8::Local<v8::Value>* out_result) {
    v8::TryCatch try_catch(isolate);
    v8::Local<v8::String> method_key =
        v8::String::NewFromUtf8(isolate, method_name, v8::NewStringType::kNormal)
            .ToLocalChecked();

    v8::Local<v8::Value> method_val;
    if (!receiver->Get(context, method_key).ToLocal(&method_val) || !method_val->IsFunction()) {
        if (try_catch.HasCaught()) {
            try_catch.Reset();
        }
        return false;
    }

    v8::Local<v8::Function> method_fn = method_val.As<v8::Function>();
    v8::Local<v8::Value> result;
    if (!method_fn->Call(context, receiver, argc, argv).ToLocal(&result)) {
        if (try_catch.HasCaught()) {
            try_catch.Reset();
        }
        return false;
    }

    if (out_result) {
        *out_result = result;
    }
    return true;
}

std::string ReadNodeTagNameLower(v8::Isolate* isolate,
                                 v8::Local<v8::Context> context,
                                 v8::Local<v8::Object> node) {
    v8::TryCatch try_catch(isolate);

    auto read_prop = [&](const char* key) -> std::string {
        v8::Local<v8::String> prop_key =
            v8::String::NewFromUtf8(isolate, key, v8::NewStringType::kNormal)
                .ToLocalChecked();
        v8::Local<v8::Value> value;
        if (!node->Get(context, prop_key).ToLocal(&value) || !value->IsString()) {
            return std::string();
        }
        return ToUtf8String(isolate, context, value);
    };

    std::string tag_name = TrimAscii(read_prop("tagName"));
    if (tag_name.empty()) {
        tag_name = TrimAscii(read_prop("nodeName"));
    }

    if (try_catch.HasCaught()) {
        try_catch.Reset();
    }

    return ToLowerAscii(tag_name);
}

void BuildDomByNativeHtmlParser(v8::Isolate* isolate,
                                v8::Local<v8::Context> context,
                                v8::Local<v8::Object> document_node,
                                const std::string& html_text) {
    std::vector<NativeHtmlToken> tokens;
    ParseHtmlIntoTokens(html_text, &tokens);
    if (tokens.empty()) {
        return;
    }

    std::vector<v8::Local<v8::Object>> stack;
    stack.reserve(tokens.size() + 1);
    stack.push_back(document_node);

    for (const auto& token : tokens) {
        if (token.kind == NativeHtmlToken::Kind::kClose) {
            for (size_t idx = stack.size(); idx > 1; --idx) {
                size_t node_idx = idx - 1;
                std::string open_tag = ReadNodeTagNameLower(isolate, context, stack[node_idx]);
                if (open_tag == token.tag_name) {
                    stack.resize(node_idx);
                    break;
                }
            }
            continue;
        }

        v8::Local<v8::Value> create_argv[1] = {
            v8::String::NewFromUtf8(isolate, token.tag_name.c_str(), v8::NewStringType::kNormal)
                .ToLocalChecked()
        };
        v8::Local<v8::Value> element_val;
        if (!CallMethodSafe(isolate, context, document_node, "createElement", 1, create_argv, &element_val)) {
            continue;
        }
        if (!element_val->IsObject()) {
            continue;
        }

        v8::Local<v8::Object> element_node = element_val.As<v8::Object>();
        for (const auto& attr : token.attrs) {
            v8::Local<v8::Value> attr_argv[2] = {
                v8::String::NewFromUtf8(isolate, attr.first.c_str(), v8::NewStringType::kNormal)
                    .ToLocalChecked(),
                v8::String::NewFromUtf8(isolate, attr.second.c_str(), v8::NewStringType::kNormal)
                    .ToLocalChecked()
            };
            (void)CallMethodSafe(isolate, context, element_node, "setAttribute", 2, attr_argv, nullptr);
        }

        v8::Local<v8::Object> parent_node = stack.back();
        v8::Local<v8::Value> append_argv[1] = { element_node };
        if (!CallMethodSafe(isolate, context, parent_node, "appendChild", 1, append_argv, nullptr)) {
            continue;
        }

        if (!token.self_closing) {
            stack.push_back(element_node);
        }
    }
}

#if defined(LEAPVM_HAS_LEXBOR) && LEAPVM_HAS_LEXBOR
void BuildDomFromLexborChildren(v8::Isolate* isolate,
                                v8::Local<v8::Context> context,
                                v8::Local<v8::Object> document_node,
                                v8::Local<v8::Object> parent_node,
                                lxb_dom_node_t* first_child) {
    for (lxb_dom_node_t* node = first_child; node != nullptr; node = node->next) {
        if (node->type != LXB_DOM_NODE_TYPE_ELEMENT) {
            continue;
        }

        lxb_dom_element_t* element = lxb_dom_interface_element(node);
        size_t tag_len = 0;
        const lxb_char_t* tag_ptr = lxb_dom_element_qualified_name(element, &tag_len);
        if (tag_ptr == nullptr || tag_len == 0) {
            continue;
        }

        std::string tag_name(reinterpret_cast<const char*>(tag_ptr), tag_len);
        tag_name = ToLowerAscii(tag_name);

        v8::Local<v8::Value> create_argv[1] = {
            v8::String::NewFromUtf8(isolate, tag_name.c_str(), v8::NewStringType::kNormal)
                .ToLocalChecked()
        };

        v8::Local<v8::Value> element_val;
        if (!CallMethodSafe(isolate, context, document_node, "createElement", 1, create_argv, &element_val)) {
            continue;
        }
        if (!element_val->IsObject()) {
            continue;
        }

        v8::Local<v8::Object> js_element_node = element_val.As<v8::Object>();

        for (lxb_dom_attr_t* attr = lxb_dom_element_first_attribute(element);
             attr != nullptr;
             attr = lxb_dom_element_next_attribute(attr)) {
            size_t attr_name_len = 0;
            size_t attr_value_len = 0;
            const lxb_char_t* attr_name_ptr = lxb_dom_attr_qualified_name(attr, &attr_name_len);
            const lxb_char_t* attr_value_ptr = lxb_dom_attr_value(attr, &attr_value_len);
            if (attr_name_ptr == nullptr || attr_name_len == 0) {
                continue;
            }

            std::string attr_name(reinterpret_cast<const char*>(attr_name_ptr), attr_name_len);
            std::string attr_value;
            if (attr_value_ptr != nullptr && attr_value_len > 0) {
                attr_value.assign(reinterpret_cast<const char*>(attr_value_ptr), attr_value_len);
            }

            v8::Local<v8::Value> attr_argv[2] = {
                v8::String::NewFromUtf8(isolate, attr_name.c_str(), v8::NewStringType::kNormal)
                    .ToLocalChecked(),
                v8::String::NewFromUtf8(isolate, attr_value.c_str(), v8::NewStringType::kNormal)
                    .ToLocalChecked()
            };
            (void)CallMethodSafe(isolate, context, js_element_node, "setAttribute", 2, attr_argv, nullptr);
        }

        v8::Local<v8::Value> append_argv[1] = { js_element_node };
        if (!CallMethodSafe(isolate, context, parent_node, "appendChild", 1, append_argv, nullptr)) {
            continue;
        }

        if (node->first_child != nullptr) {
            BuildDomFromLexborChildren(isolate, context, document_node, js_element_node, node->first_child);
        }
    }
}

bool BuildDomByLexborParser(v8::Isolate* isolate,
                            v8::Local<v8::Context> context,
                            v8::Local<v8::Object> document_node,
                            const std::string& html_text) {
    lxb_html_document_t* lex_doc = lxb_html_document_create();
    if (lex_doc == nullptr) {
        return false;
    }

    const auto* html_ptr = reinterpret_cast<const lxb_char_t*>(html_text.data());
    lxb_status_t status = lxb_html_document_parse(lex_doc, html_ptr, html_text.size());
    if (status != LXB_STATUS_OK) {
        lxb_html_document_destroy(lex_doc);
        return false;
    }

    lxb_dom_node_t* lex_root = lxb_dom_interface_node(lex_doc);
    if (lex_root != nullptr && lex_root->first_child != nullptr) {
        BuildDomFromLexborChildren(isolate, context, document_node, document_node, lex_root->first_child);
    }

    lxb_html_document_destroy(lex_doc);
    return true;
}
#endif

bool ParseNodeHandle(v8::Isolate* isolate,
                     v8::Local<v8::Context> context,
                     v8::Local<v8::Value> input,
                     leapvm::dom::NodeHandle* out_handle) {
    if (!out_handle || input.IsEmpty() || !input->IsObject()) {
        return false;
    }

    v8::Local<v8::Object> obj = input.As<v8::Object>();
    auto read_u32 = [&](v8::Local<v8::String> key, uint32_t* out) -> bool {
        if (!out) return false;
        v8::Local<v8::Value> v;
        if (!obj->Get(context, key).ToLocal(&v) || !v->IsUint32()) {
            return false;
        }
        uint32_t n = v.As<v8::Uint32>()->Value();
        if (n == 0) {
            return false;
        }
        *out = n;
        return true;
    };

    return read_u32(v8::String::NewFromUtf8Literal(isolate, "docId"), &out_handle->doc_id) &&
           read_u32(v8::String::NewFromUtf8Literal(isolate, "nodeId"), &out_handle->node_id) &&
           read_u32(v8::String::NewFromUtf8Literal(isolate, "generation"), &out_handle->generation);
}

v8::Local<v8::Object> NodeHandleToJs(v8::Isolate* isolate,
                                     v8::Local<v8::Context> context,
                                     const leapvm::dom::NodeHandle& handle) {
    v8::Local<v8::Object> out = v8::Object::New(isolate);
    out->Set(context,
             v8::String::NewFromUtf8Literal(isolate, "docId"),
             v8::Integer::NewFromUnsigned(isolate, handle.doc_id)).Check();
    out->Set(context,
             v8::String::NewFromUtf8Literal(isolate, "nodeId"),
             v8::Integer::NewFromUnsigned(isolate, handle.node_id)).Check();
    out->Set(context,
             v8::String::NewFromUtf8Literal(isolate, "generation"),
             v8::Integer::NewFromUnsigned(isolate, handle.generation)).Check();
    return out;
}

bool ParseOptionalParentHandle(v8::Isolate* isolate,
                               v8::Local<v8::Context> context,
                               v8::Local<v8::Value> input,
                               std::optional<leapvm::dom::NodeHandle>* out_parent) {
    if (!out_parent) {
        return false;
    }
    if (input.IsEmpty() || input->IsNull() || input->IsUndefined()) {
        *out_parent = std::nullopt;
        return true;
    }
    leapvm::dom::NodeHandle parsed;
    if (!ParseNodeHandle(isolate, context, input, &parsed)) {
        return false;
    }
    *out_parent = parsed;
    return true;
}

enum class DomApplyOpCode : uint32_t {
    kSetStyle = 1,
    kAppendChild = 2,
    kRemoveChild = 3,
    kCreateElement = 4,
    kSetStyleBatch = 5,
};

bool TryParsePackedStyle(const std::string& key,
                         const std::string& value,
                         uint32_t* out_style_code,
                         int32_t* out_packed_value) {
    if (!out_style_code || !out_packed_value) {
        return false;
    }

    if (key == "position") {
        if (value == "relative") {
            *out_style_code = 1;
            *out_packed_value = 1;
            return true;
        }
        if (value == "absolute") {
            *out_style_code = 1;
            *out_packed_value = 2;
            return true;
        }
        if (value == "static") {
            *out_style_code = 1;
            *out_packed_value = 3;
            return true;
        }
        if (value == "fixed") {
            *out_style_code = 1;
            *out_packed_value = 4;
            return true;
        }
        return false;
    }

    uint32_t style_code = 0;
    if (key == "left") {
        style_code = 2;
    } else if (key == "top") {
        style_code = 3;
    } else if (key == "width") {
        style_code = 4;
    } else if (key == "height") {
        style_code = 5;
    } else {
        return false;
    }

    size_t start = 0;
    size_t end = value.size();
    while (start < end && std::isspace(static_cast<unsigned char>(value[start]))) {
        ++start;
    }
    while (end > start && std::isspace(static_cast<unsigned char>(value[end - 1]))) {
        --end;
    }
    if (start >= end) {
        return false;
    }
    if (end - start >= 2) {
        const char c0 = static_cast<char>(std::tolower(static_cast<unsigned char>(value[end - 2])));
        const char c1 = static_cast<char>(std::tolower(static_cast<unsigned char>(value[end - 1])));
        if (c0 == 'p' && c1 == 'x') {
            end -= 2;
            while (end > start && std::isspace(static_cast<unsigned char>(value[end - 1]))) {
                --end;
            }
            if (start >= end) {
                return false;
            }
        }
    }

    bool negative = false;
    if (value[start] == '+' || value[start] == '-') {
        negative = (value[start] == '-');
        ++start;
        if (start >= end) {
            return false;
        }
    }

    int64_t parsed = 0;
    for (size_t i = start; i < end; ++i) {
        const unsigned char ch = static_cast<unsigned char>(value[i]);
        if (ch < '0' || ch > '9') {
            return false;
        }
        parsed = parsed * 10 + static_cast<int64_t>(ch - '0');
        if (parsed > static_cast<int64_t>((std::numeric_limits<int32_t>::max)()) + 1) {
            return false;
        }
    }

    if (negative) {
        parsed = -parsed;
    }
    if (parsed < static_cast<int64_t>((std::numeric_limits<int32_t>::min)()) ||
        parsed > static_cast<int64_t>((std::numeric_limits<int32_t>::max)())) {
        return false;
    }

    *out_style_code = style_code;
    *out_packed_value = static_cast<int32_t>(parsed);
    return true;
}

bool ReadOpU32(v8::Local<v8::Context> context,
               v8::Local<v8::Array> op,
               uint32_t index,
               uint32_t* out,
               bool allow_zero) {
    if (!out) {
        return false;
    }
    v8::Local<v8::Value> value;
    if (!op->Get(context, index).ToLocal(&value) || !value->IsUint32()) {
        return false;
    }
    const uint32_t parsed = value.As<v8::Uint32>()->Value();
    if (!allow_zero && parsed == 0) {
        return false;
    }
    *out = parsed;
    return true;
}

bool ParseParentFromFastParts(uint32_t doc_id,
                              uint32_t parent_node_id,
                              uint32_t parent_generation,
                              std::optional<leapvm::dom::NodeHandle>* out_parent) {
    if (!out_parent || doc_id == 0) {
        return false;
    }
    if (parent_node_id == 0) {
        if (parent_generation != 0) {
            return false;
        }
        *out_parent = std::nullopt;
        return true;
    }
    if (parent_generation == 0) {
        return false;
    }
    leapvm::dom::NodeHandle parent_handle;
    parent_handle.doc_id = doc_id;
    parent_handle.node_id = parent_node_id;
    parent_handle.generation = parent_generation;
    *out_parent = parent_handle;
    return true;
}

v8::Local<v8::Array> StringVectorToArray(v8::Isolate* isolate,
                                         v8::Local<v8::Context> context,
                                         const std::vector<std::string>& values) {
    v8::Local<v8::Array> out = v8::Array::New(isolate, static_cast<int>(values.size()));
    for (uint32_t i = 0; i < values.size(); ++i) {
        out->Set(
            context,
            i,
            v8::String::NewFromUtf8(isolate, values[i].c_str(), v8::NewStringType::kNormal).ToLocalChecked()).Check();
    }
    return out;
}

v8::Local<v8::Object> SnapshotNodeToV8(v8::Isolate* isolate,
                                       v8::Local<v8::Context> context,
                                       const leapvm::dom::TraceSnapshotNode& snapshot) {
    v8::Local<v8::Object> out = v8::Object::New(isolate);
    out->Set(
        context,
        v8::String::NewFromUtf8(isolate, "nodeType", v8::NewStringType::kNormal).ToLocalChecked(),
        v8::Integer::New(isolate, snapshot.node_type)).Check();
    out->Set(
        context,
        v8::String::NewFromUtf8(isolate, "nodeName", v8::NewStringType::kNormal).ToLocalChecked(),
        v8::String::NewFromUtf8(isolate, snapshot.node_name.c_str(), v8::NewStringType::kNormal).ToLocalChecked()).Check();
    out->Set(
        context,
        v8::String::NewFromUtf8(isolate, "tagName", v8::NewStringType::kNormal).ToLocalChecked(),
        v8::String::NewFromUtf8(isolate, snapshot.tag_name.c_str(), v8::NewStringType::kNormal).ToLocalChecked()).Check();
    out->Set(
        context,
        v8::String::NewFromUtf8(isolate, "id", v8::NewStringType::kNormal).ToLocalChecked(),
        v8::String::NewFromUtf8(isolate, snapshot.id.c_str(), v8::NewStringType::kNormal).ToLocalChecked()).Check();
    out->Set(
        context,
        v8::String::NewFromUtf8(isolate, "className", v8::NewStringType::kNormal).ToLocalChecked(),
        v8::String::NewFromUtf8(isolate, snapshot.class_name.c_str(), v8::NewStringType::kNormal).ToLocalChecked()).Check();
    out->Set(
        context,
        v8::String::NewFromUtf8(isolate, "textContent", v8::NewStringType::kNormal).ToLocalChecked(),
        v8::String::NewFromUtf8(isolate, snapshot.text_content.c_str(), v8::NewStringType::kNormal).ToLocalChecked()).Check();
    out->Set(
        context,
        v8::String::NewFromUtf8(isolate, "path", v8::NewStringType::kNormal).ToLocalChecked(),
        v8::String::NewFromUtf8(isolate, snapshot.path.c_str(), v8::NewStringType::kNormal).ToLocalChecked()).Check();

    v8::Local<v8::Object> rect = v8::Object::New(isolate);
    rect->Set(
        context,
        v8::String::NewFromUtf8(isolate, "x", v8::NewStringType::kNormal).ToLocalChecked(),
        v8::Number::New(isolate, snapshot.rect.x)).Check();
    rect->Set(
        context,
        v8::String::NewFromUtf8(isolate, "y", v8::NewStringType::kNormal).ToLocalChecked(),
        v8::Number::New(isolate, snapshot.rect.y)).Check();
    rect->Set(
        context,
        v8::String::NewFromUtf8(isolate, "width", v8::NewStringType::kNormal).ToLocalChecked(),
        v8::Number::New(isolate, snapshot.rect.width)).Check();
    rect->Set(
        context,
        v8::String::NewFromUtf8(isolate, "height", v8::NewStringType::kNormal).ToLocalChecked(),
        v8::Number::New(isolate, snapshot.rect.height)).Check();
    rect->Set(
        context,
        v8::String::NewFromUtf8(isolate, "right", v8::NewStringType::kNormal).ToLocalChecked(),
        v8::Number::New(isolate, snapshot.rect.x + snapshot.rect.width)).Check();
    rect->Set(
        context,
        v8::String::NewFromUtf8(isolate, "bottom", v8::NewStringType::kNormal).ToLocalChecked(),
        v8::Number::New(isolate, snapshot.rect.y + snapshot.rect.height)).Check();
    out->Set(
        context,
        v8::String::NewFromUtf8(isolate, "rect", v8::NewStringType::kNormal).ToLocalChecked(),
        rect).Check();

    v8::Local<v8::Object> attrs = v8::Object::New(isolate);
    for (const auto& pair : snapshot.attrs) {
        attrs->Set(
            context,
            v8::String::NewFromUtf8(isolate, pair.first.c_str(), v8::NewStringType::kNormal).ToLocalChecked(),
            v8::String::NewFromUtf8(isolate, pair.second.c_str(), v8::NewStringType::kNormal).ToLocalChecked()).Check();
    }
    out->Set(
        context,
        v8::String::NewFromUtf8(isolate, "attrs", v8::NewStringType::kNormal).ToLocalChecked(),
        attrs).Check();

    v8::Local<v8::Array> children = v8::Array::New(isolate, static_cast<int>(snapshot.children.size()));
    for (uint32_t i = 0; i < snapshot.children.size(); ++i) {
        children->Set(context, i, SnapshotNodeToV8(isolate, context, snapshot.children[i])).Check();
    }
    out->Set(
        context,
        v8::String::NewFromUtf8(isolate, "children", v8::NewStringType::kNormal).ToLocalChecked(),
        children).Check();
    return out;
}

std::string TraceValueType(v8::Local<v8::Value> value) {
    if (value->IsNull()) {
        return "null";
    }
    if (value->IsArray()) {
        return "array";
    }
    if (value->IsObject()) {
        return "object";
    }
    if (value->IsBoolean()) {
        return "boolean";
    }
    if (value->IsNumber()) {
        return "number";
    }
    if (value->IsString()) {
        return "string";
    }
    if (value->IsUndefined()) {
        return "undefined";
    }
    return "other";
}

v8::Local<v8::Object> MakeTraceDiff(v8::Isolate* isolate,
                                    v8::Local<v8::Context> context,
                                    const std::string& path,
                                    const std::string& reason,
                                    v8::Local<v8::Value> expected,
                                    v8::Local<v8::Value> actual) {
    v8::Local<v8::Object> out = v8::Object::New(isolate);
    out->Set(
        context,
        v8::String::NewFromUtf8(isolate, "path", v8::NewStringType::kNormal).ToLocalChecked(),
        v8::String::NewFromUtf8(isolate, path.c_str(), v8::NewStringType::kNormal).ToLocalChecked()).Check();
    out->Set(
        context,
        v8::String::NewFromUtf8(isolate, "reason", v8::NewStringType::kNormal).ToLocalChecked(),
        v8::String::NewFromUtf8(isolate, reason.c_str(), v8::NewStringType::kNormal).ToLocalChecked()).Check();
    out->Set(
        context,
        v8::String::NewFromUtf8(isolate, "expected", v8::NewStringType::kNormal).ToLocalChecked(),
        expected).Check();
    out->Set(
        context,
        v8::String::NewFromUtf8(isolate, "actual", v8::NewStringType::kNormal).ToLocalChecked(),
        actual).Check();
    return out;
}

v8::Local<v8::Value> FindFirstTraceDiff(v8::Isolate* isolate,
                                        v8::Local<v8::Context> context,
                                        v8::Local<v8::Value> actual,
                                        v8::Local<v8::Value> expected,
                                        const std::string& path) {
    const std::string current_path = path.empty() ? "$" : path;
    const std::string expected_type = TraceValueType(expected);
    const std::string actual_type = TraceValueType(actual);

    if (expected_type != actual_type) {
        return MakeTraceDiff(
            isolate, context, current_path, "type mismatch", expected, actual);
    }

    if (expected_type == "array") {
        v8::Local<v8::Array> expected_arr = expected.As<v8::Array>();
        v8::Local<v8::Array> actual_arr = actual.As<v8::Array>();
        if (expected_arr->Length() != actual_arr->Length()) {
            return MakeTraceDiff(
                isolate,
                context,
                current_path + ".length",
                "array length mismatch",
                v8::Integer::NewFromUnsigned(isolate, expected_arr->Length()),
                v8::Integer::NewFromUnsigned(isolate, actual_arr->Length()));
        }
        for (uint32_t i = 0; i < expected_arr->Length(); ++i) {
            v8::Local<v8::Value> expected_item;
            v8::Local<v8::Value> actual_item;
            if (!expected_arr->Get(context, i).ToLocal(&expected_item) ||
                !actual_arr->Get(context, i).ToLocal(&actual_item)) {
                continue;
            }
            v8::Local<v8::Value> child_diff = FindFirstTraceDiff(
                isolate, context, actual_item, expected_item, current_path + "[" + std::to_string(i) + "]");
            if (!child_diff->IsNullOrUndefined()) {
                return child_diff;
            }
        }
        return v8::Null(isolate);
    }

    if (expected_type == "object") {
        v8::Local<v8::Object> expected_obj = expected.As<v8::Object>();
        v8::Local<v8::Object> actual_obj = actual.As<v8::Object>();

        v8::Local<v8::Array> expected_keys_arr;
        v8::Local<v8::Array> actual_keys_arr;
        if (!expected_obj->GetOwnPropertyNames(context).ToLocal(&expected_keys_arr) ||
            !actual_obj->GetOwnPropertyNames(context).ToLocal(&actual_keys_arr)) {
            return MakeTraceDiff(
                isolate, context, current_path, "object read error", expected, actual);
        }

        std::vector<std::string> expected_keys;
        std::vector<std::string> actual_keys;
        expected_keys.reserve(expected_keys_arr->Length());
        actual_keys.reserve(actual_keys_arr->Length());

        for (uint32_t i = 0; i < expected_keys_arr->Length(); ++i) {
            v8::Local<v8::Value> key;
            if (!expected_keys_arr->Get(context, i).ToLocal(&key)) {
                continue;
            }
            expected_keys.push_back(ToUtf8String(isolate, context, key));
        }
        for (uint32_t i = 0; i < actual_keys_arr->Length(); ++i) {
            v8::Local<v8::Value> key;
            if (!actual_keys_arr->Get(context, i).ToLocal(&key)) {
                continue;
            }
            actual_keys.push_back(ToUtf8String(isolate, context, key));
        }
        std::sort(expected_keys.begin(), expected_keys.end());
        std::sort(actual_keys.begin(), actual_keys.end());

        if (expected_keys != actual_keys) {
            return MakeTraceDiff(
                isolate,
                context,
                current_path + ".__keys__",
                "object keys mismatch",
                StringVectorToArray(isolate, context, expected_keys),
                StringVectorToArray(isolate, context, actual_keys));
        }

        for (const std::string& key : expected_keys) {
            v8::Local<v8::Value> expected_value;
            v8::Local<v8::Value> actual_value;
            if (!expected_obj->Get(
                    context,
                    v8::String::NewFromUtf8(isolate, key.c_str(), v8::NewStringType::kNormal).ToLocalChecked())
                     .ToLocal(&expected_value) ||
                !actual_obj->Get(
                    context,
                    v8::String::NewFromUtf8(isolate, key.c_str(), v8::NewStringType::kNormal).ToLocalChecked())
                     .ToLocal(&actual_value)) {
                continue;
            }

            v8::Local<v8::Value> diff = FindFirstTraceDiff(
                isolate, context, actual_value, expected_value, current_path + "." + key);
            if (!diff->IsNullOrUndefined()) {
                return diff;
            }
        }

        return v8::Null(isolate);
    }

    if (!actual->StrictEquals(expected)) {
        return MakeTraceDiff(
            isolate, context, current_path, "value mismatch", expected, actual);
    }

    return v8::Null(isolate);
}

static void NativeDomCreateDocument(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    leapvm::VmInstance* self = leapvm::VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    std::string task_id = "task-default";
    if (args.Length() >= 1 && !args[0]->IsNullOrUndefined()) {
        task_id = ToUtf8String(isolate, context, args[0]);
        if (task_id.empty()) {
            task_id = "task-default";
        }
    }

    uint32_t doc_id = self->dom_manager().CreateDocument(task_id);
    args.GetReturnValue().Set(v8::Integer::NewFromUnsigned(isolate, doc_id));
}

static void NativeDomBindDocumentNativeDocId(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    leapvm::VmInstance* self = leapvm::VmInstance::UnwrapFromData(args);
    if (!self) {
        args.GetReturnValue().Set(v8::Boolean::New(isolate, false));
        return;
    }
    if (args.Length() < 2 || !args[0]->IsObject() || !args[1]->IsUint32()) {
        args.GetReturnValue().Set(v8::Boolean::New(isolate, false));
        return;
    }
    auto* registry = self->skeleton_registry();
    if (!registry) {
        args.GetReturnValue().Set(v8::Boolean::New(isolate, false));
        return;
    }
    v8::Local<v8::Object> doc_obj = args[0].As<v8::Object>();
    const uint32_t doc_id = args[1].As<v8::Uint32>()->Value();
    const bool ok = doc_obj->SetPrivate(
        context, registry->GetAllDocIdKey(), v8::Uint32::NewFromUnsigned(isolate, doc_id))
        .FromMaybe(false);
    args.GetReturnValue().Set(v8::Boolean::New(isolate, ok));
}

static void NativeDomCreateElement(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    leapvm::VmInstance* self = leapvm::VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    if (args.Length() < 2 || !args[0]->IsNumber()) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate, "dom.createElement(docId, tag) requires number + string",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    uint32_t doc_id = static_cast<uint32_t>(args[0]->Uint32Value(context).FromMaybe(0));
    std::string tag_name = ToUtf8String(isolate, context, args[1]);
    leapvm::dom::NodeHandle handle;
    if (!self->dom_manager().CreateElement(doc_id, tag_name, &handle)) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate, "dom.createElement failed: invalid docId",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    args.GetReturnValue().Set(NodeHandleToJs(isolate, context, handle));
}

static void NativeDomAppendChild(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    leapvm::VmInstance* self = leapvm::VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    if (args.Length() < 3 || !args[0]->IsNumber()) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate,
            "dom.appendChild(docId, parentHandle|null, childHandle) requires number + handle",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    uint32_t doc_id = static_cast<uint32_t>(args[0]->Uint32Value(context).FromMaybe(0));
    std::optional<leapvm::dom::NodeHandle> parent_handle;
    if (!ParseOptionalParentHandle(isolate, context, args[1], &parent_handle)) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate, "dom.appendChild: invalid parentHandle", v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    leapvm::dom::NodeHandle child_handle;
    if (!ParseNodeHandle(isolate, context, args[2], &child_handle)) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate, "dom.appendChild: invalid childHandle", v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    bool ok = self->dom_manager().AppendChild(doc_id, parent_handle, child_handle);
    args.GetReturnValue().Set(v8::Boolean::New(isolate, ok));
}

static void NativeDomAppendChildFast(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    leapvm::VmInstance* self = leapvm::VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    if (args.Length() < 5 ||
        !args[0]->IsUint32() ||
        !args[1]->IsUint32() ||
        !args[2]->IsUint32() ||
        !args[3]->IsUint32() ||
        !args[4]->IsUint32()) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate,
            "dom.appendChildFast(docId, parentNodeId, parentGeneration, childNodeId, childGeneration) requires uint32 args",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    const uint32_t doc_id = args[0].As<v8::Uint32>()->Value();
    const uint32_t parent_node_id = args[1].As<v8::Uint32>()->Value();
    const uint32_t parent_generation = args[2].As<v8::Uint32>()->Value();
    const uint32_t child_node_id = args[3].As<v8::Uint32>()->Value();
    const uint32_t child_generation = args[4].As<v8::Uint32>()->Value();

    if (doc_id == 0 || child_node_id == 0 || child_generation == 0) {
        args.GetReturnValue().Set(v8::Boolean::New(isolate, false));
        return;
    }

    std::optional<leapvm::dom::NodeHandle> parent_handle = std::nullopt;
    if (parent_node_id != 0) {
        if (parent_generation == 0) {
            args.GetReturnValue().Set(v8::Boolean::New(isolate, false));
            return;
        }
        leapvm::dom::NodeHandle parsed_parent;
        parsed_parent.doc_id = doc_id;
        parsed_parent.node_id = parent_node_id;
        parsed_parent.generation = parent_generation;
        parent_handle = parsed_parent;
    }

    leapvm::dom::NodeHandle child_handle;
    child_handle.doc_id = doc_id;
    child_handle.node_id = child_node_id;
    child_handle.generation = child_generation;

    bool ok = self->dom_manager().AppendChild(doc_id, parent_handle, child_handle);
    args.GetReturnValue().Set(v8::Boolean::New(isolate, ok));
}

static void NativeDomRemoveChild(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    leapvm::VmInstance* self = leapvm::VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    if (args.Length() < 3 || !args[0]->IsNumber()) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate,
            "dom.removeChild(docId, parentHandle|null, childHandle) requires number + handle",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    uint32_t doc_id = static_cast<uint32_t>(args[0]->Uint32Value(context).FromMaybe(0));
    std::optional<leapvm::dom::NodeHandle> parent_handle;
    if (!ParseOptionalParentHandle(isolate, context, args[1], &parent_handle)) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate, "dom.removeChild: invalid parentHandle", v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    leapvm::dom::NodeHandle child_handle;
    if (!ParseNodeHandle(isolate, context, args[2], &child_handle)) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate, "dom.removeChild: invalid childHandle", v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    bool ok = self->dom_manager().RemoveChild(doc_id, parent_handle, child_handle);
    args.GetReturnValue().Set(v8::Boolean::New(isolate, ok));
}

static void NativeDomRemoveChildFast(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    leapvm::VmInstance* self = leapvm::VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    if (args.Length() < 5 ||
        !args[0]->IsUint32() ||
        !args[1]->IsUint32() ||
        !args[2]->IsUint32() ||
        !args[3]->IsUint32() ||
        !args[4]->IsUint32()) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate,
            "dom.removeChildFast(docId, parentNodeId, parentGeneration, childNodeId, childGeneration) requires uint32 args",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    const uint32_t doc_id = args[0].As<v8::Uint32>()->Value();
    const uint32_t parent_node_id = args[1].As<v8::Uint32>()->Value();
    const uint32_t parent_generation = args[2].As<v8::Uint32>()->Value();
    const uint32_t child_node_id = args[3].As<v8::Uint32>()->Value();
    const uint32_t child_generation = args[4].As<v8::Uint32>()->Value();

    if (doc_id == 0 || child_node_id == 0 || child_generation == 0) {
        args.GetReturnValue().Set(v8::Boolean::New(isolate, false));
        return;
    }

    std::optional<leapvm::dom::NodeHandle> parent_handle = std::nullopt;
    if (parent_node_id != 0) {
        if (parent_generation == 0) {
            args.GetReturnValue().Set(v8::Boolean::New(isolate, false));
            return;
        }
        leapvm::dom::NodeHandle parsed_parent;
        parsed_parent.doc_id = doc_id;
        parsed_parent.node_id = parent_node_id;
        parsed_parent.generation = parent_generation;
        parent_handle = parsed_parent;
    }

    leapvm::dom::NodeHandle child_handle;
    child_handle.doc_id = doc_id;
    child_handle.node_id = child_node_id;
    child_handle.generation = child_generation;

    bool ok = self->dom_manager().RemoveChild(doc_id, parent_handle, child_handle);
    args.GetReturnValue().Set(v8::Boolean::New(isolate, ok));
}

static void NativeDomSetStyle(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    leapvm::VmInstance* self = leapvm::VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    if (args.Length() < 4 || !args[0]->IsNumber()) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate, "dom.setStyle(docId, handle, name, value) requires 4 args",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    uint32_t doc_id = static_cast<uint32_t>(args[0]->Uint32Value(context).FromMaybe(0));
    leapvm::dom::NodeHandle handle;
    if (!ParseNodeHandle(isolate, context, args[1], &handle)) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate, "dom.setStyle: invalid handle", v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    const std::string name = ToUtf8String(isolate, context, args[2]);
    const std::string value = ToUtf8String(isolate, context, args[3]);
    bool ok = self->dom_manager().SetStyle(doc_id, handle, name, value);
    args.GetReturnValue().Set(v8::Boolean::New(isolate, ok));
}

static void NativeDomSetStyleFast(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    leapvm::VmInstance* self = leapvm::VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    if (args.Length() < 5 || !args[0]->IsUint32() || !args[1]->IsUint32() || !args[2]->IsUint32()) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate, "dom.setStyleFast(docId, nodeId, generation, name, value) requires uint32 handle args",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    const uint32_t doc_id = args[0].As<v8::Uint32>()->Value();
    const uint32_t node_id = args[1].As<v8::Uint32>()->Value();
    const uint32_t generation = args[2].As<v8::Uint32>()->Value();
    if (doc_id == 0 || node_id == 0 || generation == 0) {
        args.GetReturnValue().Set(v8::Boolean::New(isolate, false));
        return;
    }

    leapvm::dom::NodeHandle handle;
    handle.doc_id = doc_id;
    handle.node_id = node_id;
    handle.generation = generation;

    const std::string name = ToUtf8String(isolate, context, args[3]);
    const std::string value = ToUtf8String(isolate, context, args[4]);
    bool ok = self->dom_manager().SetStyle(doc_id, handle, name, value);
    args.GetReturnValue().Set(v8::Boolean::New(isolate, ok));
}

static void NativeDomSetStylesFast(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    leapvm::VmInstance* self = leapvm::VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    if (args.Length() < 4 || !args[0]->IsUint32() || !args[1]->IsUint32() || !args[2]->IsUint32() || !args[3]->IsObject()) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate, "dom.setStylesFast(docId, nodeId, generation, styles) requires uint32 handle + object",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    const uint32_t doc_id = args[0].As<v8::Uint32>()->Value();
    const uint32_t node_id = args[1].As<v8::Uint32>()->Value();
    const uint32_t generation = args[2].As<v8::Uint32>()->Value();
    if (doc_id == 0 || node_id == 0 || generation == 0) {
        args.GetReturnValue().Set(v8::Boolean::New(isolate, false));
        return;
    }

    leapvm::dom::NodeHandle handle;
    handle.doc_id = doc_id;
    handle.node_id = node_id;
    handle.generation = generation;

    v8::Local<v8::Object> styles_obj = args[3].As<v8::Object>();
    v8::Local<v8::Array> keys;
    if (!styles_obj->GetOwnPropertyNames(context).ToLocal(&keys)) {
        args.GetReturnValue().Set(v8::Boolean::New(isolate, false));
        return;
    }

    bool ok = true;
    const uint32_t length = keys->Length();
    for (uint32_t i = 0; i < length; ++i) {
        v8::Local<v8::Value> key_val;
        if (!keys->Get(context, i).ToLocal(&key_val)) {
            ok = false;
            break;
        }
        v8::Local<v8::Value> value_val;
        if (!styles_obj->Get(context, key_val).ToLocal(&value_val)) {
            ok = false;
            break;
        }

        const std::string name = ToUtf8String(isolate, context, key_val);
        const std::string value = ToUtf8String(isolate, context, value_val);
        if (!self->dom_manager().SetStyle(doc_id, handle, name, value)) {
            ok = false;
            break;
        }
    }

    args.GetReturnValue().Set(v8::Boolean::New(isolate, ok));
}

// NativeDomApplyOps removed – replaced by NativeDomSubmitTreeSpec (spec path)

static void NativeDomGetLayoutRect(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    leapvm::VmInstance* self = leapvm::VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    if (args.Length() < 2 || !args[0]->IsNumber()) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate, "dom.getLayoutRect(docId, handle) requires number + handle",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    uint32_t doc_id = static_cast<uint32_t>(args[0]->Uint32Value(context).FromMaybe(0));
    leapvm::dom::NodeHandle handle;
    if (!ParseNodeHandle(isolate, context, args[1], &handle)) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate, "dom.getLayoutRect: invalid handle", v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    leapvm::dom::LayoutRect rect;
    if (!self->dom_manager().GetLayoutRect(doc_id, handle, &rect)) {
        args.GetReturnValue().Set(v8::Null(isolate));
        return;
    }

    v8::Local<v8::Object> out = v8::Object::New(isolate);
    out->Set(context,
             v8::String::NewFromUtf8Literal(isolate, "x"),
             v8::Number::New(isolate, rect.x)).Check();
    out->Set(context,
             v8::String::NewFromUtf8Literal(isolate, "y"),
             v8::Number::New(isolate, rect.y)).Check();
    out->Set(context,
             v8::String::NewFromUtf8Literal(isolate, "width"),
             v8::Number::New(isolate, rect.width)).Check();
    out->Set(context,
             v8::String::NewFromUtf8Literal(isolate, "height"),
             v8::Number::New(isolate, rect.height)).Check();
    args.GetReturnValue().Set(out);
}

static void NativeDomGetLayoutRectFast(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    leapvm::VmInstance* self = leapvm::VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    if (args.Length() < 3 || !args[0]->IsUint32() || !args[1]->IsUint32() || !args[2]->IsUint32()) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate, "dom.getLayoutRectFast(docId, nodeId, generation) requires uint32 args",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    const uint32_t doc_id = args[0].As<v8::Uint32>()->Value();
    const uint32_t node_id = args[1].As<v8::Uint32>()->Value();
    const uint32_t generation = args[2].As<v8::Uint32>()->Value();
    if (doc_id == 0 || node_id == 0 || generation == 0) {
        args.GetReturnValue().Set(v8::Null(isolate));
        return;
    }

    leapvm::dom::NodeHandle handle;
    handle.doc_id = doc_id;
    handle.node_id = node_id;
    handle.generation = generation;

    leapvm::dom::LayoutRect rect;
    if (!self->dom_manager().GetLayoutRect(doc_id, handle, &rect)) {
        args.GetReturnValue().Set(v8::Null(isolate));
        return;
    }

    v8::Local<v8::Object> out = v8::Object::New(isolate);
    out->Set(context,
             v8::String::NewFromUtf8Literal(isolate, "x"),
             v8::Number::New(isolate, rect.x)).Check();
    out->Set(context,
             v8::String::NewFromUtf8Literal(isolate, "y"),
             v8::Number::New(isolate, rect.y)).Check();
    out->Set(context,
             v8::String::NewFromUtf8Literal(isolate, "width"),
             v8::Number::New(isolate, rect.width)).Check();
    out->Set(context,
             v8::String::NewFromUtf8Literal(isolate, "height"),
             v8::Number::New(isolate, rect.height)).Check();
    args.GetReturnValue().Set(out);
}

static void NativeDomGetLayoutRectsFast(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    leapvm::VmInstance* self = leapvm::VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    if (args.Length() < 2 || !args[0]->IsUint32()) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate, "dom.getLayoutRectsFast(docId, handles) requires uint32 docId + handles",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    const uint32_t doc_id = args[0].As<v8::Uint32>()->Value();
    if (doc_id == 0) {
        args.GetReturnValue().Set(v8::Null(isolate));
        return;
    }

    std::vector<leapvm::dom::NodeHandle> handles;
    bool parsed_ok = true;

    if (args[1]->IsUint32Array()) {
        v8::Local<v8::Uint32Array> flat = args[1].As<v8::Uint32Array>();
        const uint32_t flat_len = static_cast<uint32_t>(flat->Length());
        if ((flat_len % 2) != 0) {
            parsed_ok = false;
        } else {
            handles.reserve(flat_len / 2);
            for (uint32_t i = 0; i < flat_len; i += 2) {
                v8::Local<v8::Value> node_id_val;
                v8::Local<v8::Value> generation_val;
                if (!flat->Get(context, i).ToLocal(&node_id_val) ||
                    !flat->Get(context, i + 1).ToLocal(&generation_val) ||
                    !node_id_val->IsUint32() ||
                    !generation_val->IsUint32()) {
                    parsed_ok = false;
                    break;
                }

                const uint32_t node_id = node_id_val.As<v8::Uint32>()->Value();
                const uint32_t generation = generation_val.As<v8::Uint32>()->Value();
                leapvm::dom::NodeHandle handle;
                handle.doc_id = doc_id;
                handle.node_id = node_id;
                handle.generation = generation;
                handles.push_back(handle);
            }
        }
    } else if (args[1]->IsArray()) {
        v8::Local<v8::Array> input = args[1].As<v8::Array>();
        const uint32_t count = input->Length();
        handles.reserve(count);
        for (uint32_t i = 0; i < count; ++i) {
            v8::Local<v8::Value> handle_val;
            if (!input->Get(context, i).ToLocal(&handle_val)) {
                parsed_ok = false;
                break;
            }

            leapvm::dom::NodeHandle handle;
            if (handle_val->IsArray()) {
                v8::Local<v8::Array> pair = handle_val.As<v8::Array>();
                uint32_t node_id = 0;
                uint32_t generation = 0;
                if (pair->Length() < 2 ||
                    !ReadOpU32(context, pair, 0, &node_id, false) ||
                    !ReadOpU32(context, pair, 1, &generation, false)) {
                    parsed_ok = false;
                    break;
                }
                handle.doc_id = doc_id;
                handle.node_id = node_id;
                handle.generation = generation;
            } else {
                if (!ParseNodeHandle(isolate, context, handle_val, &handle)) {
                    parsed_ok = false;
                    break;
                }
                if (handle.doc_id != doc_id) {
                    parsed_ok = false;
                    break;
                }
            }
            handles.push_back(handle);
        }
    } else {
        parsed_ok = false;
    }

    if (!parsed_ok) {
        args.GetReturnValue().Set(v8::Null(isolate));
        return;
    }

    const size_t rect_count = handles.size();
    v8::Local<v8::ArrayBuffer> buffer = v8::ArrayBuffer::New(isolate, rect_count * 4 * sizeof(double));
    double* output = static_cast<double*>(buffer->Data());
    for (size_t i = 0; i < rect_count; ++i) {
        leapvm::dom::LayoutRect rect;
        const bool got = self->dom_manager().GetLayoutRect(doc_id, handles[i], &rect);
        output[(i * 4) + 0] = got ? rect.x : 0;
        output[(i * 4) + 1] = got ? rect.y : 0;
        output[(i * 4) + 2] = got ? rect.width : 0;
        output[(i * 4) + 3] = got ? rect.height : 0;
    }

    v8::Local<v8::Float64Array> out = v8::Float64Array::New(buffer, 0, rect_count * 4);
    args.GetReturnValue().Set(out);
}

static void NativeDomSnapshotDocument(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    leapvm::VmInstance* self = leapvm::VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    if (args.Length() < 1 || !args[0]->IsNumber()) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate, "dom.snapshotDocument(docId) requires number",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    uint32_t doc_id = static_cast<uint32_t>(args[0]->Uint32Value(context).FromMaybe(0));
    leapvm::dom::TraceSnapshotNode snapshot;
    if (!self->dom_manager().SnapshotDocument(doc_id, &snapshot)) {
        args.GetReturnValue().Set(v8::Null(isolate));
        return;
    }

    args.GetReturnValue().Set(SnapshotNodeToV8(isolate, context, snapshot));
}

static void NativeDomTraceFirstDiff(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    leapvm::VmInstance* self = leapvm::VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    if (args.Length() < 2 || !args[0]->IsNumber()) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate, "dom.traceFirstDiff(docId, expected) requires number + expected",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    uint32_t doc_id = static_cast<uint32_t>(args[0]->Uint32Value(context).FromMaybe(0));
    leapvm::dom::TraceSnapshotNode snapshot;
    if (!self->dom_manager().SnapshotDocument(doc_id, &snapshot)) {
        args.GetReturnValue().Set(v8::Null(isolate));
        return;
    }

    v8::Local<v8::Value> actual = SnapshotNodeToV8(isolate, context, snapshot);
    v8::Local<v8::Value> expected = args[1];

    if (expected->IsString()) {
        v8::Local<v8::Value> parsed;
        if (v8::JSON::Parse(context, expected.As<v8::String>()).ToLocal(&parsed)) {
            expected = parsed;
        }
    }

    v8::Local<v8::Value> diff = FindFirstTraceDiff(isolate, context, actual, expected, "$");
    const bool matched = diff->IsNullOrUndefined();

    v8::Local<v8::Object> out = v8::Object::New(isolate);
    out->Set(
        context,
        v8::String::NewFromUtf8(isolate, "matched", v8::NewStringType::kNormal).ToLocalChecked(),
        v8::Boolean::New(isolate, matched)).Check();
    out->Set(
        context,
        v8::String::NewFromUtf8(isolate, "firstDiff", v8::NewStringType::kNormal).ToLocalChecked(),
        matched ? v8::Null(isolate) : diff).Check();
    out->Set(
        context,
        v8::String::NewFromUtf8(isolate, "actual", v8::NewStringType::kNormal).ToLocalChecked(),
        actual).Check();
    out->Set(
        context,
        v8::String::NewFromUtf8(isolate, "expected", v8::NewStringType::kNormal).ToLocalChecked(),
        expected).Check();
    args.GetReturnValue().Set(out);
}

static void NativeDomReleaseDocument(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    leapvm::VmInstance* self = leapvm::VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    if (args.Length() < 1 || !args[0]->IsNumber()) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate, "dom.releaseDocument(docId) requires number",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    uint32_t doc_id = static_cast<uint32_t>(args[0]->Uint32Value(context).FromMaybe(0));
    bool ok = self->dom_manager().ReleaseDocument(doc_id);
    args.GetReturnValue().Set(v8::Boolean::New(isolate, ok));
}

static void NativeDomReleaseTaskScope(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    leapvm::VmInstance* self = leapvm::VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    std::string task_id = "task-default";
    if (args.Length() >= 1 && !args[0]->IsNullOrUndefined()) {
        task_id = ToUtf8String(isolate, context, args[0]);
        if (task_id.empty()) {
            task_id = "task-default";
        }
    }
    size_t released = self->dom_manager().ReleaseTaskScope(task_id);
    args.GetReturnValue().Set(v8::Integer::NewFromUnsigned(isolate, static_cast<uint32_t>(released)));
}

static void NativeDomParseHTMLIntoDocument(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    leapvm::VmInstance* self = leapvm::VmInstance::UnwrapFromData(args);
    if (!self) {
        return;
    }

    if (args.Length() < 2) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate,
            "dom.parseHTMLIntoDocument(documentNode|docId, htmlText) requires 2 args",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    std::string html_text = ToUtf8String(isolate, context, args[1]);
    if (args[0]->IsNumber()) {
        uint32_t doc_id = static_cast<uint32_t>(args[0]->Uint32Value(context).FromMaybe(0));
        bool ok = self->dom_manager().ParseHTMLIntoDocument(doc_id, html_text);
        args.GetReturnValue().Set(v8::Boolean::New(isolate, ok));
        return;
    }

    if (!args[0]->IsObject()) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate,
            "dom.parseHTMLIntoDocument(documentNode|docId, htmlText): first arg must be object or number",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    v8::Local<v8::Object> document_node = args[0].As<v8::Object>();

    bool parsed = false;
#if defined(LEAPVM_HAS_LEXBOR) && LEAPVM_HAS_LEXBOR
    parsed = BuildDomByLexborParser(isolate, context, document_node, html_text);
#endif
    if (!parsed) {
        BuildDomByNativeHtmlParser(isolate, context, document_node, html_text);
    }

    args.GetReturnValue().Set(v8::Boolean::New(isolate, true));
}

// Binary Tree Spec V1: submit full tree spec, get layout results in-place
static void NativeDomSubmitTreeSpec(
    const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);

    VmInstance* self = VmInstance::UnwrapFromData(args);
    if (!self) {
        args.GetReturnValue().Set(v8::Undefined(isolate));
        return;
    }

    if (args.Length() < 2 || !args[0]->IsArrayBuffer() || !args[1]->IsUint32()) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate, "dom.submitTreeSpec requires (ArrayBuffer, uint32 nodeCount)",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    auto ab = args[0].As<v8::ArrayBuffer>();
    uint32_t* data = reinterpret_cast<uint32_t*>(
        ab->GetBackingStore()->Data());
    uint32_t node_count = args[1].As<v8::Uint32>()->Value();

    self->dom_manager().BuildTreeFromSpec(data, node_count);
    // Results are written back into the ArrayBuffer in-place; return undefined.
    args.GetReturnValue().Set(v8::Undefined(isolate));
}

void VmInstance::InstallNativeWrapper(v8::Local<v8::Context> context) {
    if (!isolate_) {
        return;
    }

    v8::Isolate* isolate = isolate_;
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Object> global = context->Global();

    // Create leapvm object using ObjectTemplate
    v8::Local<v8::ObjectTemplate> leapvm_tpl = v8::ObjectTemplate::New(isolate);
    v8::Local<v8::Object> leapvm_obj;
    if (!leapvm_tpl->NewInstance(context).ToLocal(&leapvm_obj)) {
        return;
    }

    // Create wrapObject function
    v8::Local<v8::External> data = v8::External::New(isolate, this);
    v8::Local<v8::FunctionTemplate> wrap_tmpl =
        v8::FunctionTemplate::New(isolate, NativeWrapObjectCallback, data);

    v8::Local<v8::FunctionTemplate> create_skel_tmpl =
        v8::FunctionTemplate::New(isolate, NativeCreateSkeletonInstance, data);

    v8::Local<v8::FunctionTemplate> apply_instance_skel_tmpl =
        v8::FunctionTemplate::New(isolate, NativeApplyInstanceSkeleton, data);

    v8::Local<v8::FunctionTemplate> set_monitor_tmpl =
        v8::FunctionTemplate::New(isolate, NativeSetMonitorEnabled, data);

    v8::Local<v8::FunctionTemplate> dom_parse_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomParseHTMLIntoDocument, data);
    v8::Local<v8::FunctionTemplate> dom_create_doc_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomCreateDocument, data);
    v8::Local<v8::FunctionTemplate> dom_bind_doc_id_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomBindDocumentNativeDocId, data);
    v8::Local<v8::FunctionTemplate> dom_create_elem_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomCreateElement, data);
    v8::Local<v8::FunctionTemplate> dom_append_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomAppendChild, data);
    v8::Local<v8::FunctionTemplate> dom_append_fast_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomAppendChildFast, data);
    v8::Local<v8::FunctionTemplate> dom_remove_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomRemoveChild, data);
    v8::Local<v8::FunctionTemplate> dom_remove_fast_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomRemoveChildFast, data);
    v8::Local<v8::FunctionTemplate> dom_set_style_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomSetStyle, data);
    v8::Local<v8::FunctionTemplate> dom_set_style_fast_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomSetStyleFast, data);
    v8::Local<v8::FunctionTemplate> dom_set_styles_fast_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomSetStylesFast, data);
    v8::Local<v8::FunctionTemplate> dom_submit_tree_spec_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomSubmitTreeSpec, data);
    v8::Local<v8::FunctionTemplate> dom_get_rect_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomGetLayoutRect, data);
    v8::Local<v8::FunctionTemplate> dom_get_rect_fast_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomGetLayoutRectFast, data);
    v8::Local<v8::FunctionTemplate> dom_get_rects_fast_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomGetLayoutRectsFast, data);
    v8::Local<v8::FunctionTemplate> dom_snapshot_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomSnapshotDocument, data);
    v8::Local<v8::FunctionTemplate> dom_trace_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomTraceFirstDiff, data);
    v8::Local<v8::FunctionTemplate> dom_release_doc_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomReleaseDocument, data);
    v8::Local<v8::FunctionTemplate> dom_release_scope_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDomReleaseTaskScope, data);

    v8::Local<v8::Function> wrap_fn;
    if (!wrap_tmpl->GetFunction(context).ToLocal(&wrap_fn)) {
        return;
    }

    v8::Local<v8::Function> create_skel_fn;
    if (!create_skel_tmpl->GetFunction(context).ToLocal(&create_skel_fn)) {
        return;
    }

    v8::Local<v8::Function> apply_instance_skel_fn;
    if (!apply_instance_skel_tmpl->GetFunction(context).ToLocal(&apply_instance_skel_fn)) {
        return;
    }

    v8::Local<v8::Function> set_monitor_fn;
    if (!set_monitor_tmpl->GetFunction(context).ToLocal(&set_monitor_fn)) {
        return;
    }

    v8::Local<v8::Function> dom_parse_fn;
    if (!dom_parse_tmpl->GetFunction(context).ToLocal(&dom_parse_fn)) {
        return;
    }
    v8::Local<v8::Function> dom_create_doc_fn;
    if (!dom_create_doc_tmpl->GetFunction(context).ToLocal(&dom_create_doc_fn)) {
        return;
    }
    v8::Local<v8::Function> dom_bind_doc_id_fn;
    if (!dom_bind_doc_id_tmpl->GetFunction(context).ToLocal(&dom_bind_doc_id_fn)) {
        return;
    }
    v8::Local<v8::Function> dom_create_elem_fn;
    if (!dom_create_elem_tmpl->GetFunction(context).ToLocal(&dom_create_elem_fn)) {
        return;
    }
    v8::Local<v8::Function> dom_append_fn;
    if (!dom_append_tmpl->GetFunction(context).ToLocal(&dom_append_fn)) {
        return;
    }
    v8::Local<v8::Function> dom_append_fast_fn;
    if (!dom_append_fast_tmpl->GetFunction(context).ToLocal(&dom_append_fast_fn)) {
        return;
    }
    v8::Local<v8::Function> dom_remove_fn;
    if (!dom_remove_tmpl->GetFunction(context).ToLocal(&dom_remove_fn)) {
        return;
    }
    v8::Local<v8::Function> dom_remove_fast_fn;
    if (!dom_remove_fast_tmpl->GetFunction(context).ToLocal(&dom_remove_fast_fn)) {
        return;
    }
    v8::Local<v8::Function> dom_set_style_fn;
    if (!dom_set_style_tmpl->GetFunction(context).ToLocal(&dom_set_style_fn)) {
        return;
    }
    v8::Local<v8::Function> dom_set_style_fast_fn;
    if (!dom_set_style_fast_tmpl->GetFunction(context).ToLocal(&dom_set_style_fast_fn)) {
        return;
    }
    v8::Local<v8::Function> dom_set_styles_fast_fn;
    if (!dom_set_styles_fast_tmpl->GetFunction(context).ToLocal(&dom_set_styles_fast_fn)) {
        return;
    }
    v8::Local<v8::Function> dom_submit_tree_spec_fn;
    if (!dom_submit_tree_spec_tmpl->GetFunction(context).ToLocal(&dom_submit_tree_spec_fn)) {
        return;
    }
    v8::Local<v8::Function> dom_get_rect_fn;
    if (!dom_get_rect_tmpl->GetFunction(context).ToLocal(&dom_get_rect_fn)) {
        return;
    }
    v8::Local<v8::Function> dom_get_rect_fast_fn;
    if (!dom_get_rect_fast_tmpl->GetFunction(context).ToLocal(&dom_get_rect_fast_fn)) {
        return;
    }
    v8::Local<v8::Function> dom_get_rects_fast_fn;
    if (!dom_get_rects_fast_tmpl->GetFunction(context).ToLocal(&dom_get_rects_fast_fn)) {
        return;
    }
    v8::Local<v8::Function> dom_snapshot_fn;
    if (!dom_snapshot_tmpl->GetFunction(context).ToLocal(&dom_snapshot_fn)) {
        return;
    }
    v8::Local<v8::Function> dom_trace_fn;
    if (!dom_trace_tmpl->GetFunction(context).ToLocal(&dom_trace_fn)) {
        return;
    }
    v8::Local<v8::Function> dom_release_doc_fn;
    if (!dom_release_doc_tmpl->GetFunction(context).ToLocal(&dom_release_doc_fn)) {
        return;
    }
    v8::Local<v8::Function> dom_release_scope_fn;
    if (!dom_release_scope_tmpl->GetFunction(context).ToLocal(&dom_release_scope_fn)) {
        return;
    }

    // defineEnvironmentSkeleton (skeleton builder entrypoint)
    v8::Local<v8::FunctionTemplate> define_env_tmpl =
        v8::FunctionTemplate::New(isolate, NativeDefineEnvironmentSkeleton, data);
    v8::Local<v8::Function> define_env_fn;
    if (!define_env_tmpl->GetFunction(context).ToLocal(&define_env_fn)) {
        return;
    }

    // Set wrapObject on leapvm object
    v8::Local<v8::String> wrap_name =
        v8::String::NewFromUtf8(isolate, "wrapObject", v8::NewStringType::kNormal)
            .ToLocalChecked();

    if (!leapvm_obj->Set(context, wrap_name, wrap_fn).FromMaybe(false)) {
        return;
    }

    leapvm_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "createSkeletonInstance", v8::NewStringType::kNormal).ToLocalChecked(),
        create_skel_fn).Check();

    leapvm_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "setMonitorEnabled", v8::NewStringType::kNormal).ToLocalChecked(),
        set_monitor_fn).Check();

    // Set defineEnvironmentSkeleton on leapvm object
    v8::Local<v8::String> define_env_name =
        v8::String::NewFromUtf8(isolate, "defineEnvironmentSkeleton", v8::NewStringType::kNormal)
            .ToLocalChecked();

    if (!leapvm_obj->Set(context, define_env_name, define_env_fn).FromMaybe(false)) {
        return;
    }

    // Set $native.dom namespace for native DOM helpers
    v8::Local<v8::ObjectTemplate> dom_tpl = v8::ObjectTemplate::New(isolate);
    v8::Local<v8::Object> dom_obj;
    if (!dom_tpl->NewInstance(context).ToLocal(&dom_obj)) {
        return;
    }
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "parseHTMLIntoDocument", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_parse_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "createDocument", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_create_doc_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "bindDocumentNativeDocId", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_bind_doc_id_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "createElement", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_create_elem_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "appendChild", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_append_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "appendChildFast", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_append_fast_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "removeChild", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_remove_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "removeChildFast", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_remove_fast_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "setStyle", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_set_style_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "setStyleFast", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_set_style_fast_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "setStylesFast", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_set_styles_fast_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "submitTreeSpec", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_submit_tree_spec_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "getLayoutRect", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_get_rect_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "getLayoutRectFast", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_get_rect_fast_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "getLayoutRectsFast", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_get_rects_fast_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "snapshotDocument", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_snapshot_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "traceFirstDiff", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_trace_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "releaseDocument", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_release_doc_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "releaseTaskScope", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_release_scope_fn).Check();
    dom_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "backend", v8::NewStringType::kNormal).ToLocalChecked(),
        v8::String::NewFromUtf8(isolate, "native-core", v8::NewStringType::kNormal).ToLocalChecked()
    ).Check();
    leapvm_obj->Set(
        context,
        v8::String::NewFromUtf8(isolate, "dom", v8::NewStringType::kNormal).ToLocalChecked(),
        dom_obj).Check();

    // $native.createTrustedEvent(type [, init])
    {
        v8::Local<v8::External> vm_ext = v8::External::New(isolate, this);
        v8::Local<v8::FunctionTemplate> create_trusted_event_tmpl =
            v8::FunctionTemplate::New(
                isolate,
                [](const v8::FunctionCallbackInfo<v8::Value>& args) {
                    v8::Isolate* isolate = args.GetIsolate();
                    v8::HandleScope handle_scope(isolate);
                    v8::Local<v8::Context> context = isolate->GetCurrentContext();
                    if (args.Data().IsEmpty() || !args.Data()->IsExternal()) {
                        args.GetReturnValue().SetNull();
                        return;
                    }
                    auto* vm = static_cast<VmInstance*>(args.Data().As<v8::External>()->Value());
                    if (!vm) {
                        args.GetReturnValue().SetNull();
                        return;
                    }
                    if (args.Length() < 1 || !args[0]->IsString()) {
                        isolate->ThrowException(v8::Exception::TypeError(
                            v8::String::NewFromUtf8Literal(
                                isolate, "createTrustedEvent: first arg must be event type string")));
                        return;
                    }
                    auto* registry = vm->skeleton_registry();
                    if (!registry) {
                        args.GetReturnValue().SetNull();
                        return;
                    }
                    std::string type = ToUtf8String(isolate, context, args[0]);
                    v8::Local<v8::Object> init_obj;
                    if (args.Length() >= 2 && args[1]->IsObject()) {
                        init_obj = args[1].As<v8::Object>();
                    }
                    v8::Local<v8::Object> event =
                        registry->CreateTrustedEventInstance(type, init_obj);
                    if (event.IsEmpty()) {
                        args.GetReturnValue().SetNull();
                    } else {
                        args.GetReturnValue().Set(event);
                    }
                },
                vm_ext);
        v8::Local<v8::Function> create_trusted_event_fn;
        if (!create_trusted_event_tmpl->GetFunction(context).ToLocal(&create_trusted_event_fn)) {
            return;
        }
        leapvm_obj->Set(
            context,
            v8::String::NewFromUtf8(isolate, "createTrustedEvent", v8::NewStringType::kNormal).ToLocalChecked(),
            create_trusted_event_fn).Check();
    }

    // Set $native on global (changed from 'leapvm' to avoid confusion)
    v8::Local<v8::String> namespace_name =
        v8::String::NewFromUtf8(isolate, "$native", v8::NewStringType::kNormal)
            .ToLocalChecked();

    global->CreateDataProperty(context, namespace_name, leapvm_obj).Check();

    // 暴露 __createNative__ 到 globalThis，用于 JS 侧创建带 InternalField 的原生对象
    v8::Local<v8::String> create_native_name =
        v8::String::NewFromUtf8(isolate, "__createNative__", v8::NewStringType::kNormal)
            .ToLocalChecked();
    global->CreateDataProperty(context, create_native_name, create_skel_fn).Check();

    // 暴露 __applyInstanceSkeleton__ 到 globalThis
    // 用于给动态创建的对象（如 per-task HTMLDocument）补装 instance 级 C++ 拦截器（Layer 2）
    v8::Local<v8::String> apply_instance_skel_name =
        v8::String::NewFromUtf8(isolate, "__applyInstanceSkeleton__", v8::NewStringType::kNormal)
            .ToLocalChecked();
    global->CreateDataProperty(context, apply_instance_skel_name, apply_instance_skel_fn).Check();

    // A3: Register child-frame native functions
    auto register_global_fn = [&](const char* name,
                                  v8::FunctionCallback callback) {
        v8::Local<v8::FunctionTemplate> tmpl =
            v8::FunctionTemplate::New(isolate, callback, data);
        v8::Local<v8::Function> fn;
        if (tmpl->GetFunction(context).ToLocal(&fn)) {
            global->CreateDataProperty(
                context,
                v8::String::NewFromUtf8(isolate, name,
                                        v8::NewStringType::kNormal).ToLocalChecked(),
                fn).Check();
        }
    };
    register_global_fn("__createChildFrame__", NativeCreateChildFrame);
    register_global_fn("__destroyChildFrame__", NativeDestroyChildFrame);
    register_global_fn("__navigateChildFrame__", NativeNavigateChildFrame);
    register_global_fn("__getChildFrameCount__", NativeGetChildFrameCount);
    register_global_fn("__getChildFrameProxy__", NativeGetChildFrameProxy);
}

VmInstance* VmInstance::UnwrapFromData(
    const v8::FunctionCallbackInfo<v8::Value>& args) {
    auto data = args.Data();
    if (!data.IsEmpty() && data->IsExternal()) {
        return static_cast<VmInstance*>(data.As<v8::External>()->Value());
    }
    return static_cast<VmInstance*>(args.GetIsolate()->GetData(0));
}

// ==========================
//  Skeleton / Env integration
// ==========================

void VmInstance::NativeDefineEnvironmentSkeleton(
    const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    VmInstance* self = UnwrapFromData(args);
    if (!self) {
        args.GetReturnValue().Set(v8::Undefined(isolate));
        return;
    }

    if (args.Length() < 1 || !args[0]->IsObject()) {
        isolate->ThrowException(v8::String::NewFromUtf8(
            isolate,
            "defineEnvironmentSkeleton requires an object argument",
            v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    v8::Local<v8::Object> descriptor = args[0].As<v8::Object>();

    LEAPVM_LOG_INFO("========= Loading Environment Skeleton =========");

    std::unique_ptr<skeleton::EnvironmentSkeleton> env_skeleton;
    try {
        env_skeleton = skeleton::SkeletonParser::ParseFromV8Object(
            isolate, context, descriptor);
    } catch (const std::exception& e) {
        LEAPVM_LOG_ERROR("Failed to parse environment skeleton: %s", e.what());
        isolate->ThrowException(v8::Exception::Error(
            v8::String::NewFromUtf8(isolate, e.what(), v8::NewStringType::kNormal).ToLocalChecked()));
        return;
    }

    // A3: Determine if this is a child-frame context.
    // If so, store the registry in the child frame, not the main VmInstance.
    skeleton::SkeletonRegistry* target_registry = nullptr;
    bool is_child_context = false;
    for (auto& [id, cf] : self->child_frames_) {
        if (cf.context == context) {
            is_child_context = true;
            cf.registry = std::make_unique<skeleton::SkeletonRegistry>(isolate, context);
            target_registry = cf.registry.get();
            LEAPVM_LOG_INFO("[A3] Building skeleton for child frame context");
            break;
        }
    }

    if (!is_child_context) {
        self->skeleton_registry_ =
            std::make_unique<skeleton::SkeletonRegistry>(isolate, context);
        target_registry = self->skeleton_registry_.get();
    }

    if (target_registry) {
        target_registry->SetDomManager(&self->dom_manager_);
        target_registry->SetVmInstance(self);
    }

    for (auto& obj : env_skeleton->objects) {
        target_registry->RegisterSkeleton(std::move(obj));
    }

    target_registry->BuildPhase1_CreateTemplates();
    target_registry->BuildPhase2_SetupInheritance();
    target_registry->BuildPhase3_DefinePropertiesAndInstances();

    // A3/T19: child-context safety check for Window binding target.
    // Fail fast if child and main globals are accidentally aliased/polluted.
    if (is_child_context) {
        v8::Local<v8::Context> main_ctx = self->context_.Get(isolate);
        v8::Local<v8::Object> child_global = context->Global();
        v8::Local<v8::Object> main_global = main_ctx->Global();

        if (child_global->StrictEquals(main_global)) {
            isolate->ThrowException(v8::Exception::Error(
                v8::String::NewFromUtf8Literal(
                    isolate,
                    "[A3] Phase3 binding check failed: child global equals main global")));
            return;
        }

        v8::Local<v8::Value> child_window_val;
        if (!child_global->Get(context, v8::String::NewFromUtf8Literal(isolate, "window"))
                 .ToLocal(&child_window_val) ||
            !child_window_val->IsObject() ||
            !child_window_val.As<v8::Object>()->StrictEquals(child_global)) {
            isolate->ThrowException(v8::Exception::Error(
                v8::String::NewFromUtf8Literal(
                    isolate,
                    "[A3] Phase3 binding check failed: child window alias is invalid")));
            return;
        }
    }

    LEAPVM_LOG_INFO("========= Skeleton loaded successfully =========");

    // A3: Capture the bundle source for child-frame replay (main context only).
    if (!is_child_context &&
        !self->pending_script_source_.empty() && self->bundle_source_.empty()) {
        self->bundle_source_ = self->pending_script_source_;
        LEAPVM_LOG_INFO("[A3] Captured bundle source (%zu bytes) for child-frame replay",
                        self->bundle_source_.size());
    }

    args.GetReturnValue().Set(v8::Boolean::New(isolate, true));
}

int VmInstance::GetTimerNestingLevel(v8::Local<v8::Context> ctx) {
    v8::Local<v8::Value> val = ctx->GetEmbedderData(kTimerNestingLevelSlot);
    if (val.IsEmpty() || !val->IsNumber()) return 0;
    return static_cast<int>(val.As<v8::Number>()->Value());
}

void VmInstance::SetTimerNestingLevel(v8::Local<v8::Context> ctx, int level) {
    v8::Isolate* isolate = ctx->GetIsolate();
    ctx->SetEmbedderData(kTimerNestingLevelSlot,
                         v8::Integer::New(isolate, level));
}

uint64_t VmInstance::AddTimeoutFunction(
    v8::Local<v8::Context> owner_ctx,
    v8::Local<v8::Function> cb,
    std::chrono::milliseconds delay,
    int nesting_level,
    std::vector<v8::Global<v8::Value>>&& args,
    bool is_interval) {

    auto task = std::make_shared<TimerTask>();
    task->id = ++next_timer_id_;
    task->due_time = std::chrono::steady_clock::now() + delay;
    task->is_interval = is_interval;
    task->interval = delay;
    task->nesting_level = nesting_level;
    task->kind = TimerTask::Kind::kFunction;
    task->callback.Reset(isolate_, cb);
    task->args = std::move(args);
    task->owner_ctx.Reset(isolate_, owner_ctx);

    timer_queue_.push(task);
    timers_by_id_.emplace(task->id, task);

    return task->id;
}

uint64_t VmInstance::AddTimerString(
    v8::Local<v8::Context> owner_ctx,
    v8::Local<v8::String> code,
    std::chrono::milliseconds delay,
    int nesting_level,
    bool is_interval) {

    auto task = std::make_shared<TimerTask>();
    task->id = ++next_timer_id_;
    task->due_time = std::chrono::steady_clock::now() + delay;
    task->is_interval = is_interval;
    task->interval = delay;
    task->nesting_level = nesting_level;
    task->kind = TimerTask::Kind::kStringCode;
    task->owner_ctx.Reset(isolate_, owner_ctx);

    v8::String::Utf8Value utf8(isolate_, code);
    if (*utf8) {
        task->code.assign(*utf8, utf8.length());
    }

    timer_queue_.push(task);
    timers_by_id_.emplace(task->id, task);

    return task->id;
}

bool VmInstance::ClearTimer(uint64_t id) {
    auto it = timers_by_id_.find(id);
    if (it == timers_by_id_.end()) {
        return false;
    }

    auto task = it->second;
    task->canceled = true;

    // Release persistent handles immediately for GC
    task->owner_ctx.Reset();
    if (task->kind == TimerTask::Kind::kFunction) {
        task->callback.Reset();
        for (auto& g : task->args) {
            g.Reset();
        }
        task->args.clear();
    }

    timers_by_id_.erase(it);
    return true;
}

void VmInstance::NativeSetTimeout(
    const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);

    VmInstance* self = UnwrapFromData(args);
    if (!self) return;

    if (args.Length() < 1) {
        isolate->ThrowException(
            v8::String::NewFromUtf8(isolate,
                "setTimeout requires at least one argument",
                v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    v8::Local<v8::Value> cb_val = args[0];
    bool is_fn  = cb_val->IsFunction();
    bool is_str = cb_val->IsString();

    if (!is_fn && !is_str) {
        isolate->ThrowException(
            v8::String::NewFromUtf8(isolate,
                "setTimeout first argument must be a function or string",
                v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    // delay can be omitted; non-number treated as 0
    double delay_ms_double = 0.0;
    if (args.Length() >= 2) {
        delay_ms_double = args[1]
            ->NumberValue(context)
            .FromMaybe(0.0);
    }
    if (delay_ms_double < 0) delay_ms_double = 0.0;

    // ---- Nesting level & 4ms clamp ----
    // 读取当前 Context 的嵌套深度（由 RunLoopOnce 在执行定时器时写入 EmbedderData）
    int nesting_level = GetTimerNestingLevel(context);

    if (nesting_level >= 5 && delay_ms_double < 4.0) {
        delay_ms_double = 4.0;
    }

    auto delay_ms = std::chrono::milliseconds(
        static_cast<int64_t>(delay_ms_double + 0.5));

    uint64_t id = 0;

    if (is_fn) {
        v8::Local<v8::Function> cb = cb_val.As<v8::Function>();

        // Collect extra arguments: setTimeout(fn, delay, arg1, arg2, ...)
        std::vector<v8::Global<v8::Value>> stored_args;
        if (args.Length() > 2) {
            stored_args.reserve(args.Length() - 2);
            for (int i = 2; i < args.Length(); ++i) {
                stored_args.emplace_back(isolate, args[i]);
            }
        }

        id = self->AddTimeoutFunction(
            context,
            cb,
            delay_ms,
            nesting_level,
            std::move(stored_args),
            /*is_interval=*/false);
    } else {
        // String version: setTimeout("code", delay)
        v8::Local<v8::String> code = cb_val.As<v8::String>();
        id = self->AddTimerString(
            context,
            code,
            delay_ms,
            nesting_level,
            /*is_interval=*/false);
    }

    args.GetReturnValue().Set(
        v8::Number::New(isolate, static_cast<double>(id)));
}

void VmInstance::NativeSetInterval(
    const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);

    VmInstance* self = UnwrapFromData(args);
    if (!self) return;

    if (args.Length() < 1) {
        isolate->ThrowException(
            v8::String::NewFromUtf8(isolate,
                "setInterval requires at least one argument",
                v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    v8::Local<v8::Value> cb_val = args[0];

    bool is_fn  = cb_val->IsFunction();
    bool is_str = cb_val->IsString();

    if (!is_fn && !is_str) {
        isolate->ThrowException(
            v8::String::NewFromUtf8(isolate,
                "setInterval first argument must be a function or string",
                v8::NewStringType::kNormal).ToLocalChecked());
        return;
    }

    double delay_ms_double = 0.0;
    if (args.Length() >= 2) {
        delay_ms_double = args[1]
            ->NumberValue(context)
            .FromMaybe(0.0);
    }
    if (delay_ms_double < 0) delay_ms_double = 0.0;

    auto delay_ms = std::chrono::milliseconds(
        static_cast<int64_t>(delay_ms_double + 0.5));

    // interval does not use nesting clamp, level = 0
    int nesting_level = 0;

    uint64_t id = 0;

    if (is_fn) {
        v8::Local<v8::Function> cb = cb_val.As<v8::Function>();

        std::vector<v8::Global<v8::Value>> stored_args;
        if (args.Length() > 2) {
            stored_args.reserve(args.Length() - 2);
            for (int i = 2; i < args.Length(); ++i) {
                stored_args.emplace_back(isolate, args[i]);
            }
        }

        id = self->AddTimeoutFunction(
            context,
            cb,
            delay_ms,
            nesting_level,
            std::move(stored_args),
            /*is_interval=*/true);
    } else {
        v8::Local<v8::String> code = cb_val.As<v8::String>();
        id = self->AddTimerString(
            context,
            code,
            delay_ms,
            nesting_level,
            /*is_interval=*/true);
    }

    args.GetReturnValue().Set(
        v8::Number::New(isolate, static_cast<double>(id)));
}

void VmInstance::NativeClearTimeout(
    const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);

    VmInstance* self = UnwrapFromData(args);
    if (!self) return;

    if (args.Length() < 1 || !args[0]->IsNumber()) {
        // Browser silently fails on wrong arguments
        return;
    }

    uint64_t id = static_cast<uint64_t>(
        args[0].As<v8::Number>()->Value());
    self->ClearTimer(id);
}

void VmInstance::NativeClearInterval(
    const v8::FunctionCallbackInfo<v8::Value>& args) {
    // Same behavior as clearTimeout
    NativeClearTimeout(args);
}

void VmInstance::CallFunctionWithArgs(
    v8::Local<v8::Function> fn,
    const std::vector<v8::Local<v8::Value>>& argv) {

    v8::Isolate* isolate = isolate_;
    v8::HandleScope handle_scope(isolate);

    auto context = context_.Get(isolate);
    v8::Context::Scope context_scope(context);

    v8::TryCatch try_catch(isolate);

    v8::Local<v8::Value>* raw_argv =
        argv.empty()
            ? nullptr
            : const_cast<v8::Local<v8::Value>*>(argv.data());

    (void)fn->Call(context, context->Global(),
                   static_cast<int>(argv.size()), raw_argv);

    if (try_catch.HasCaught()) {
        v8::String::Utf8Value msg(isolate, try_catch.Exception());
        LEAPVM_LOG_ERROR("[timer] %s", *msg ? *msg : "<exception>");
        // Don't throw back to JS, don't terminate VM
    }
}

void VmInstance::RunStringCode(const std::string& code) {
    v8::Isolate* isolate = isolate_;
    v8::HandleScope handle_scope(isolate);

    auto context = context_.Get(isolate);
    v8::Context::Scope context_scope(context);

    v8::TryCatch try_catch(isolate);

    v8::Local<v8::String> src =
        v8::String::NewFromUtf8(
            isolate,
            code.c_str(),
            v8::NewStringType::kNormal,
            static_cast<int>(code.size()))
        .ToLocalChecked();

    v8::Local<v8::Script> script;
    if (!v8::Script::Compile(context, src).ToLocal(&script)) {
        if (try_catch.HasCaught()) {
            v8::String::Utf8Value msg(isolate, try_catch.Exception());
            LEAPVM_LOG_ERROR("[timer] compile: %s", *msg ? *msg : "<exception>");
        }
        return;
    }

    (void)script->Run(context);
    if (try_catch.HasCaught()) {
        v8::String::Utf8Value msg(isolate, try_catch.Exception());
        LEAPVM_LOG_ERROR("[timer] run: %s", *msg ? *msg : "<exception>");
    }
}

void VmInstance::RunLoopOnce(std::chrono::milliseconds max_duration) {
    if (!isolate_) return;

    // 使用 promise + future 保持同步语义
    std::promise<void> done_promise;
    auto future = done_promise.get_future();

    // 将定时器处理逻辑包装成任务投递到 VM 线程
    PostTask([this, max_duration, &done_promise]
             (v8::Isolate* isolate, v8::Local<v8::Context> context) {
        // 原 RunLoopOnce 逻辑搬到这里
        v8::HandleScope handle_scope(isolate);

        auto deadline = std::chrono::steady_clock::now() + max_duration;

        while (!timer_queue_.empty()) {
            auto now = std::chrono::steady_clock::now();
            if (now > deadline) {
                break;
            }

            auto task = timer_queue_.top();

            if (task->due_time > now) {
                // Nearest task not yet due, sleep until it's due or deadline
                auto time_to_task = task->due_time - now;
                auto time_to_deadline = deadline - now;
                auto sleep_duration = (time_to_task < time_to_deadline) ? time_to_task : time_to_deadline;
                auto sleep_ms = std::chrono::duration_cast<std::chrono::milliseconds>(sleep_duration);
                if (sleep_ms.count() > 0) {
                    std::this_thread::sleep_for(sleep_ms);
                }
                continue;  // Check again after sleeping
            }

            timer_queue_.pop();

            if (task->canceled) {
                // Already cleared by clearTimeout / clearInterval
                continue;
            }

            {
                v8::HandleScope handle_scope(isolate);

                // 使用定时器归属的 Context；若未设置（旧路径）则退到主 context
                v8::Local<v8::Context> task_ctx = task->owner_ctx.IsEmpty()
                    ? context
                    : task->owner_ctx.Get(isolate);
                v8::Context::Scope context_scope(task_ctx);

                // 将当前 Context 的嵌套深度提升到 task->nesting_level + 1，
                // 以便该回调内调用 setTimeout 时能读取到正确的层级
                int prev_level = GetTimerNestingLevel(task_ctx);
                SetTimerNestingLevel(task_ctx, task->nesting_level + 1);

                if (task->kind == TimerTask::Kind::kFunction) {
                    v8::Local<v8::Function> cb =
                        task->callback.Get(isolate);

                    std::vector<v8::Local<v8::Value>> argv;
                    argv.reserve(task->args.size());
                    for (auto& g : task->args) {
                        argv.push_back(g.Get(isolate));
                    }

                    CallFunctionWithArgs(cb, argv);
                } else {
                    RunStringCode(task->code);
                }

                // 恢复嵌套深度
                SetTimerNestingLevel(task_ctx, prev_level);

                // Run microtasks after each callback for Promise.then compatibility
                isolate->PerformMicrotaskCheckpoint();
            }

            // Handle lifecycle: interval reschedule; timeout release
            if (task->is_interval && !task->canceled) {
                // Reschedule from the previous due_time to match browser drift-free behavior.
                // If the callback ran late and the ideal next time is already in the past,
                // fall back to now + interval to avoid queuing an immediately-due task.
                auto ideal_next = task->due_time + task->interval;
                auto current_now = std::chrono::steady_clock::now();
                task->due_time = (ideal_next > current_now) ? ideal_next : current_now + task->interval;
                timer_queue_.push(task);
                // Already in timers_by_id_, no need to re-insert
            } else {
                // One-time task: remove from map and release persistent handles
                timers_by_id_.erase(task->id);
                task->owner_ctx.Reset();
                if (task->kind == TimerTask::Kind::kFunction) {
                    task->callback.Reset();
                    for (auto& g : task->args) {
                        g.Reset();
                    }
                    task->args.clear();
                }
            }

            // Exit if time slice used up
            now = std::chrono::steady_clock::now();
            if (now > deadline) break;
        }

        // Run microtasks one more time at the end
        isolate->PerformMicrotaskCheckpoint();

        // 统一处理 GC 弱回调积累的延迟清理请求
        // 此时不在任何 dom_wrapper_cache_ 迭代中，erase 操作是安全的
        if (!pending_dom_wrapper_cleanup_.empty()) {
            for (auto& cleanup : pending_dom_wrapper_cleanup_) {
                auto it = dom_wrapper_cache_.find(cleanup.key);
                if (it != dom_wrapper_cache_.end() &&
                    it->second.serial == cleanup.serial) {
                    it->second.wrapper.Reset();
                    dom_wrapper_cache_.erase(it);
                }
            }
            pending_dom_wrapper_cleanup_.clear();
        }

        done_promise.set_value();
    });

    // 阻塞等待任务完成（维持原有同步语义）
    future.get();
}

void VmInstance::SetHookLogEnabled(bool enabled) {
    hook_config_.pending_monitor_enabled = enabled;
    hook_config_.pending_monitor_enabled_set = true;
    ApplyPendingHookConfig();
}

void VmInstance::SetPropertyBlacklist(const std::vector<std::string>& objects,
                                      const std::vector<std::string>& properties,
                                      const std::vector<std::string>& prefixes) {
    // 替换语义：完全覆盖之前的配置
    hook_config_.blacklist.blocked_objects.clear();
    hook_config_.blacklist.blocked_properties.clear();
    hook_config_.blacklist.blocked_prefixes.clear();

    // 设置对象黑名单
    for (const auto& obj : objects) {
        if (!obj.empty()) {
            hook_config_.blacklist.blocked_objects.insert(obj);
        }
    }

    // 设置属性黑名单
    for (const auto& prop : properties) {
        if (!prop.empty()) {
            hook_config_.blacklist.blocked_properties.insert(prop);
        }
    }

    // 设置前缀黑名单
    for (const auto& prefix : prefixes) {
        if (!prefix.empty()) {
            hook_config_.blacklist.blocked_prefixes.push_back(prefix);
        }
    }
}

void VmInstance::SetPropertyWhitelist(const std::vector<std::string>& objects,
                                      const std::vector<std::string>& properties,
                                      const std::vector<std::string>& prefixes) {
    // 替换语义：完全覆盖之前的配置
    hook_config_.whitelist.allowed_objects.clear();
    hook_config_.whitelist.allowed_properties.clear();
    hook_config_.whitelist.allowed_prefixes.clear();

    // 设置对象白名单
    for (const auto& obj : objects) {
        if (!obj.empty()) {
            hook_config_.whitelist.allowed_objects.insert(obj);
        }
    }

    for (const auto& prop : properties) {
        if (!prop.empty()) {
            hook_config_.whitelist.allowed_properties.insert(prop);
        }
    }

    for (const auto& prefix : prefixes) {
        if (!prefix.empty()) {
            hook_config_.whitelist.allowed_prefixes.push_back(prefix);
        }
    }
}

// ============================================================================
// VM 线程实现
// ============================================================================

void VmInstance::StartVmThread() {
    // 使用unique_lock在整个函数中持有锁，避免两次加锁的间隙
    std::unique_lock<std::mutex> lock(task_mu_);

    if (vm_thread_running_) {
        return;  // 已经启动
    }

    vm_thread_running_ = true;
    vm_thread_ready_ = false;  // 重置ready标志
    vm_thread_ = std::thread([this] { ThreadMain(); });

    // 等待VM线程完成V8 scope初始化
    // 使用condition variable等待，确保scope完全建立后再返回
    task_cv_.wait(lock, [this] { return vm_thread_ready_; });
}

// I-9: StubCallback 性能采样 — 每 10000 次记录一次平均耗时
void VmInstance::RecordStubCallSample(int64_t ns,
                                      const std::string& obj,
                                      const std::string& prop) {
    stub_call_total_ns_ += ns;
    uint64_t count = ++stub_call_count_;
    if (count % 10000 == 0) {
        double avg_ns = static_cast<double>(stub_call_total_ns_) / 10000.0;
        LEAPVM_LOG_INFO("[LeapVM][PerfSample] StubCallback avg=%.0f ns, "
                        "count=%llu, last=%s.%s",
                        avg_ns,
                        static_cast<unsigned long long>(count),
                        obj.c_str(),
                        prop.c_str());
        stub_call_total_ns_ = 0;  // 重置窗口累计值
    }
}

void VmInstance::StopVmThread() {
    {
        std::lock_guard<std::mutex> lock(task_mu_);
        if (!vm_thread_running_) {
            return;  // 未启动
        }
        vm_thread_running_ = false;
        task_cv_.notify_all();
    }

    if (vm_thread_.joinable()) {
        vm_thread_.join();
    }
}

// ============================================================================
// A3: Child Frame (iframe) Support
// ============================================================================

// Per-context dispatch function caching (replaces single dispatch_fn_).

void VmInstance::CacheDispatchFn(v8::Isolate* isolate, v8::Local<v8::Function> fn) {
    // Check if this is for a child frame context.
    v8::Local<v8::Context> current = isolate->GetCurrentContext();
    for (auto& [id, cf] : child_frames_) {
        if (cf.context == current) {
            cf.dispatch_fn.Reset(isolate, fn);
            return;
        }
    }
    // Main context.
    dispatch_fn_.Reset(isolate, fn);
}

v8::Local<v8::Function> VmInstance::GetCachedDispatchFn(v8::Isolate* isolate) const {
    // Check current context against child frames.
    v8::Local<v8::Context> current = isolate->GetCurrentContext();
    for (const auto& [id, cf] : child_frames_) {
        if (cf.context == current) {
            if (cf.dispatch_fn.IsEmpty()) return v8::Local<v8::Function>();
            return cf.dispatch_fn.Get(isolate);
        }
    }
    if (dispatch_fn_.IsEmpty()) return v8::Local<v8::Function>();
    return dispatch_fn_.Get(isolate);
}

void VmInstance::CacheDispatchFnForContext(v8::Local<v8::Context> ctx,
                                           v8::Local<v8::Function> fn) {
    for (auto& [id, cf] : child_frames_) {
        if (cf.context == ctx) {
            cf.dispatch_fn.Reset(isolate_, fn);
            return;
        }
    }
    dispatch_fn_.Reset(isolate_, fn);
}

v8::Local<v8::Function> VmInstance::GetDispatchFnForContext(
        v8::Local<v8::Context> ctx) const {
    for (const auto& [id, cf] : child_frames_) {
        if (cf.context == ctx) {
            if (cf.dispatch_fn.IsEmpty()) return v8::Local<v8::Function>();
            return cf.dispatch_fn.Get(isolate_);
        }
    }
    if (dispatch_fn_.IsEmpty()) return v8::Local<v8::Function>();
    return dispatch_fn_.Get(isolate_);
}

skeleton::SkeletonRegistry* VmInstance::SkeletonRegistryForContext(
        v8::Local<v8::Context> ctx) {
    for (auto& [id, cf] : child_frames_) {
        if (cf.context == ctx) {
            return cf.registry.get();
        }
    }
    return skeleton_registry_.get();
}

bool VmInstance::IsSameOriginBrandCompatible(
        v8::Local<v8::Context> caller_ctx,
        v8::Local<v8::Object> receiver_obj,
        const std::string& receiver_brand,
        const std::string& expected_brand) const {
    if (receiver_obj.IsEmpty() || receiver_brand.empty() || expected_brand.empty()) {
        return false;
    }

    v8::Local<v8::Context> receiver_ctx;
    if (!receiver_obj->GetCreationContext().ToLocal(&receiver_ctx)) {
        return false;
    }

    auto find_child_frame = [&](v8::Local<v8::Context> ctx) -> const ChildFrame* {
        for (const auto& [id, cf] : child_frames_) {
            if (cf.context == ctx) {
                return &cf;
            }
        }
        return nullptr;
    };

    const ChildFrame* caller_frame = find_child_frame(caller_ctx);
    const ChildFrame* receiver_frame = find_child_frame(receiver_ctx);

    // Fallback is only for same-origin child-frame scope.
    if (!caller_frame && !receiver_frame) {
        return false;
    }
    if ((caller_frame && !caller_frame->same_origin) ||
        (receiver_frame && !receiver_frame->same_origin)) {
        return false;
    }

    auto check_registry = [&](const skeleton::SkeletonRegistry* registry) -> bool {
        return registry &&
               registry->IsBrandCompatible(receiver_brand, expected_brand);
    };

    // Prefer receiver-side registry first.
    if (receiver_frame && check_registry(receiver_frame->registry.get())) {
        return true;
    }
    if (caller_frame && caller_frame != receiver_frame &&
        check_registry(caller_frame->registry.get())) {
        return true;
    }

    // If one side is main context, allow main registry fallback.
    v8::Local<v8::Context> main_ctx = context_.Get(isolate_);
    if ((caller_ctx == main_ctx || receiver_ctx == main_ctx) &&
        check_registry(skeleton_registry_.get())) {
        return true;
    }

    return false;
}

// Compute origin key: "scheme://host[:port]" from a URL string.
std::string VmInstance::ComputeOriginKey(const std::string& url) {
    // Simple URL origin extraction: scheme://host[:port]
    auto scheme_end = url.find("://");
    if (scheme_end == std::string::npos) return url;
    auto host_start = scheme_end + 3;
    auto path_start = url.find('/', host_start);
    if (path_start == std::string::npos) return url;
    return url.substr(0, path_start);
}

// Execute a script in a specific context (VM thread only, no PostTask).
bool VmInstance::RunScriptInContextInternal(v8::Local<v8::Context> ctx,
                                            const std::string& source,
                                            const std::string& resource_name) {
    v8::HandleScope handle_scope(isolate_);
    v8::Context::Scope context_scope(ctx);
    v8::TryCatch try_catch(isolate_);

    v8::Local<v8::String> v8_source;
    if (!v8::String::NewFromUtf8(isolate_, source.c_str(),
                                  v8::NewStringType::kNormal,
                                  static_cast<int>(source.size()))
             .ToLocal(&v8_source)) {
        LEAPVM_LOG_ERROR("[A3] RunScriptInContextInternal: failed to create source string");
        return false;
    }

    std::string effective_name = resource_name.empty()
        ? "child-frame://init.js" : resource_name;
    v8::Local<v8::String> res_name =
        v8::String::NewFromUtf8(isolate_, effective_name.c_str(),
                                v8::NewStringType::kNormal).ToLocalChecked();
    v8::ScriptOrigin origin(res_name);

    v8::Local<v8::Script> script;
    if (!v8::Script::Compile(ctx, v8_source, &origin).ToLocal(&script)) {
        if (try_catch.HasCaught()) {
            v8::String::Utf8Value err(isolate_, try_catch.Exception());
            LEAPVM_LOG_ERROR("[A3] RunScriptInContextInternal compile error: %s",
                             *err ? *err : "(unknown)");
        }
        return false;
    }

    v8::Local<v8::Value> result;
    if (!script->Run(ctx).ToLocal(&result)) {
        if (try_catch.HasCaught()) {
            v8::String::Utf8Value err(isolate_, try_catch.Exception());
            LEAPVM_LOG_ERROR("[A3] RunScriptInContextInternal runtime error: %s",
                             *err ? *err : "(unknown)");
        }
        return false;
    }

    isolate_->PerformMicrotaskCheckpoint();
    return true;
}

// Set up basic globals (leapenv structure, self-references) in a child context.
void VmInstance::SetupChildContextGlobals(v8::Local<v8::Context> child_ctx) {
    v8::HandleScope handle_scope(isolate_);
    v8::Context::Scope ctx_scope(child_ctx);
    v8::Local<v8::Object> global_obj = child_ctx->Global();

    // Self-references
    auto add_self_ref = [&](const char* name) {
        v8::Local<v8::String> key =
            v8::String::NewFromUtf8(isolate_, name,
                                    v8::NewStringType::kInternalized).ToLocalChecked();
        global_obj->CreateDataProperty(child_ctx, key, global_obj).Check();
    };
    add_self_ref("window");
    add_self_ref("self");
    add_self_ref("globalThis");

    // parent/top point to main context global
    auto main_ctx = context_.Get(isolate_);
    v8::Local<v8::Object> main_global = main_ctx->Global();
    global_obj->CreateDataProperty(
        child_ctx,
        v8::String::NewFromUtf8Literal(isolate_, "parent"),
        main_global).Check();
    global_obj->CreateDataProperty(
        child_ctx,
        v8::String::NewFromUtf8Literal(isolate_, "top"),
        main_global).Check();
    global_obj->CreateDataProperty(
        child_ctx,
        v8::String::NewFromUtf8Literal(isolate_, "frames"),
        global_obj).Check();

    // leapenv structure
    v8::Local<v8::Object> leapenv_obj = v8::Object::New(isolate_);
    global_obj->CreateDataProperty(
        child_ctx,
        v8::String::NewFromUtf8Literal(isolate_, "leapenv"),
        leapenv_obj).Check();

    auto add_child_object = [&](v8::Local<v8::Object> parent, const char* name) {
        v8::Local<v8::Object> child = v8::Object::New(isolate_);
        parent->CreateDataProperty(
            child_ctx,
            v8::String::NewFromUtf8(isolate_, name,
                                    v8::NewStringType::kNormal).ToLocalChecked(),
            child).Check();
        return child;
    };

    add_child_object(leapenv_obj, "config");
    add_child_object(leapenv_obj, "toolsFunc");
    add_child_object(leapenv_obj, "impl");
    add_child_object(leapenv_obj, "innerFunc");
    v8::Local<v8::Object> memory_obj = add_child_object(leapenv_obj, "memory");

    // memory.privateData = new WeakMap()
    v8::Local<v8::Value> weakmap_ctor_val;
    if (global_obj->Get(child_ctx,
                        v8::String::NewFromUtf8Literal(isolate_, "WeakMap"))
            .ToLocal(&weakmap_ctor_val) &&
        weakmap_ctor_val->IsFunction()) {
        v8::Local<v8::Function> weakmap_ctor = weakmap_ctor_val.As<v8::Function>();
        v8::Local<v8::Value> weakmap_instance;
        if (weakmap_ctor->NewInstance(child_ctx).ToLocal(&weakmap_instance) &&
            weakmap_instance->IsObject()) {
            memory_obj->CreateDataProperty(
                child_ctx,
                v8::String::NewFromUtf8Literal(isolate_, "privateData"),
                weakmap_instance).Check();
        }
    }
}

// Create a child frame (D4 flow). Returns frame index, or -1 on failure.
int VmInstance::CreateChildFrameOnVmThread(const std::string& url,
                                           bool same_origin) {
    if (bundle_source_.empty()) {
        LEAPVM_LOG_ERROR("[A3] Cannot create child frame: no bundle source captured");
        return -1;
    }
    if (global_template_.IsEmpty()) {
        LEAPVM_LOG_ERROR("[A3] Cannot create child frame: no global template saved");
        return -1;
    }

    LEAPVM_LOG_INFO("[A3] Creating child frame #%d url=%s same_origin=%d",
                    next_child_frame_id_, url.c_str(), same_origin);

    v8::HandleScope handle_scope(isolate_);

    // 1. Create child context using same global template
    v8::Local<v8::ObjectTemplate> global_tmpl = global_template_.Get(isolate_);
    v8::Local<v8::Context> child_ctx =
        v8::Context::New(isolate_, nullptr, global_tmpl);

    if (child_ctx.IsEmpty()) {
        LEAPVM_LOG_ERROR("[A3] Failed to create child context");
        return -1;
    }

    // 2. Set SecurityToken (same-origin shares token with main context)
    auto main_ctx = context_.Get(isolate_);
    if (same_origin) {
        child_ctx->SetSecurityToken(main_ctx->GetSecurityToken());
    } else {
        std::string origin_key = ComputeOriginKey(url);
        v8::Local<v8::String> token =
            v8::String::NewFromUtf8(isolate_, origin_key.c_str(),
                                    v8::NewStringType::kNormal).ToLocalChecked();
        child_ctx->SetSecurityToken(token);
    }

    // 3. Set up globals (leapenv, self-refs, parent/top)
    SetupChildContextGlobals(child_ctx);

    // 4. Install Console/Timers/NativeWrapper in child context
    {
        v8::Context::Scope ctx_scope(child_ctx);
        InstallConsole(child_ctx);
        InstallTimers(child_ctx);
        InstallNativeWrapper(child_ctx);
    }

    // 5. Store the ChildFrame entry BEFORE running the bundle, so that
    //    NativeDefineEnvironmentSkeleton can detect the child context and
    //    store the registry in this entry (not overwrite main registry).
    ChildFrame cf;
    cf.url = url;
    cf.same_origin = same_origin;
    cf.context.Reset(isolate_, child_ctx);
    // cf.registry will be populated by NativeDefineEnvironmentSkeleton

    int index = next_child_frame_id_++;
    child_frames_.emplace(index, std::move(cf));

    // 6. Execute bundle in child context.
    //    The bundle will call NativeDefineEnvironmentSkeleton, which will
    //    detect the child context and build the skeleton registry for it.
    LEAPVM_LOG_INFO("[A3] Executing bundle in child context (%zu bytes)...",
                    bundle_source_.size());
    if (!RunScriptInContextInternal(child_ctx, bundle_source_,
                                    "child-frame://leapenv.bundle.js")) {
        LEAPVM_LOG_ERROR("[A3] Failed to execute bundle in child context");
        // Remove the partially created child frame
        child_frames_.erase(index);
        return -1;
    }

    // 7. Set location.href in child context.
    // Use property assignment so LocationImpl setter updates its internal state;
    // do not use Object.defineProperty which bypasses the impl state map.
    {
        v8::Context::Scope ctx_scope(child_ctx);
        const std::string normalized_url = url.empty() ? "about:blank" : url;
        v8::Local<v8::Object> global_obj = child_ctx->Global();
        v8::Local<v8::Value> location_val;
        if (global_obj->Get(child_ctx, v8::String::NewFromUtf8Literal(isolate_, "location"))
                .ToLocal(&location_val) &&
            location_val->IsObject()) {
            v8::Local<v8::Object> location_obj = location_val.As<v8::Object>();
            v8::Local<v8::String> href_val;
            if (v8::String::NewFromUtf8(isolate_, normalized_url.c_str(),
                                        v8::NewStringType::kNormal)
                    .ToLocal(&href_val)) {
                if (!location_obj
                         ->Set(child_ctx,
                               v8::String::NewFromUtf8Literal(isolate_, "href"),
                               href_val)
                         .FromMaybe(false)) {
                    LEAPVM_LOG_WARN("[A3] Failed to set child frame location.href");
                }
            }
        }
    }

    LEAPVM_LOG_INFO("[A3] Child frame #%d created successfully", index);
    return index;
}

// Navigate an existing child frame (update URL only, reuse context).
bool VmInstance::NavigateChildFrameOnVmThread(int index,
                                              const std::string& url) {
    auto it = child_frames_.find(index);
    if (it == child_frames_.end()) {
        LEAPVM_LOG_ERROR("[A3] NavigateChildFrame: frame %d not found", index);
        return false;
    }

    ChildFrame& cf = it->second;
    cf.url = url;

    v8::HandleScope handle_scope(isolate_);
    auto child_ctx = cf.context.Get(isolate_);
    v8::Context::Scope ctx_scope(child_ctx);

    const std::string normalized_url = url.empty() ? "about:blank" : url;
    v8::Local<v8::Object> global_obj = child_ctx->Global();
    v8::Local<v8::Value> location_val;
    if (global_obj->Get(child_ctx, v8::String::NewFromUtf8Literal(isolate_, "location"))
            .ToLocal(&location_val) &&
        location_val->IsObject()) {
        v8::Local<v8::Object> location_obj = location_val.As<v8::Object>();
        v8::Local<v8::String> href_val;
        if (v8::String::NewFromUtf8(isolate_, normalized_url.c_str(),
                                    v8::NewStringType::kNormal)
                .ToLocal(&href_val)) {
            if (!location_obj
                     ->Set(child_ctx,
                           v8::String::NewFromUtf8Literal(isolate_, "href"),
                           href_val)
                     .FromMaybe(false)) {
                LEAPVM_LOG_WARN("[A3] Failed to navigate child frame location.href");
            }
        }
    }

    LEAPVM_LOG_INFO("[A3] Child frame #%d navigated to %s", index, url.c_str());
    return true;
}

// Get the child frame's global proxy for JS access (same-origin only).
v8::Local<v8::Object> VmInstance::GetChildFrameProxyOnVmThread(
        v8::Local<v8::Context> caller_ctx, int index) {
    auto it = child_frames_.find(index);
    if (it == child_frames_.end()) {
        return v8::Local<v8::Object>();
    }

    const ChildFrame& cf = it->second;

    // For cross-origin, return null (v1: no SecurityError, just null)
    if (!cf.same_origin) {
        return v8::Local<v8::Object>();
    }

    v8::HandleScope handle_scope(isolate_);
    auto child_ctx = cf.context.Get(isolate_);
    return child_ctx->Global();
}

// IndexedPropertyHandler: window[0], window[1], etc. -> child frame globals
v8::Intercepted VmInstance::FramesIndexedGetter(
        uint32_t index,
        const v8::PropertyCallbackInfo<v8::Value>& info) {
    v8::Isolate* isolate = info.GetIsolate();
    VmInstance* vm = static_cast<VmInstance*>(isolate->GetData(0));
    auto fit = vm ? vm->child_frames_.find(static_cast<int>(index))
                  : vm->child_frames_.end();
    if (!vm || fit == vm->child_frames_.end()) {
        return v8::Intercepted::kNo;  // Let V8 handle normally
    }

    const ChildFrame& cf = fit->second;
    if (!cf.same_origin) {
        info.GetReturnValue().Set(v8::Null(isolate));
        return v8::Intercepted::kYes;
    }

    v8::HandleScope handle_scope(isolate);
    auto child_ctx = cf.context.Get(isolate);
    info.GetReturnValue().Set(child_ctx->Global());
    return v8::Intercepted::kYes;
}

// --- Native callbacks for JS-side iframe support ---

void VmInstance::NativeCreateChildFrame(
        const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);

    VmInstance* self = UnwrapFromData(args);
    if (!self) {
        args.GetReturnValue().Set(v8::Integer::New(isolate, -1));
        return;
    }

    if (args.Length() < 1 || !args[0]->IsString()) {
        isolate->ThrowException(v8::Exception::TypeError(
            v8::String::NewFromUtf8Literal(isolate,
                "__createChildFrame__ requires a URL string")));
        return;
    }

    v8::String::Utf8Value url_utf8(isolate, args[0]);
    std::string url = *url_utf8 ? std::string(*url_utf8) : "";

    bool same_origin = true;
    if (args.Length() >= 2 && args[1]->IsBoolean()) {
        same_origin = args[1]->BooleanValue(isolate);
    }

    int index = self->CreateChildFrameOnVmThread(url, same_origin);
    args.GetReturnValue().Set(v8::Integer::New(isolate, index));
}

bool VmInstance::DestroyChildFrameOnVmThread(int frame_id) {
    auto it = child_frames_.find(frame_id);
    if (it == child_frames_.end()) {
        LEAPVM_LOG_WARN("[A3] DestroyChildFrame: frame %d not found", frame_id);
        return false;
    }

    // 先重置所有 v8::Global 句柄，解除对 V8 堆的引用
    {
        v8::HandleScope hs(isolate_);
        it->second.context.Reset();
        it->second.dispatch_fn.Reset();
        it->second.registry.reset();
    }

    // 从 map 中移除
    child_frames_.erase(it);

    LEAPVM_LOG_INFO("[A3] Child frame %d destroyed, remaining: %zu",
                    frame_id, child_frames_.size());
    return true;
}

void VmInstance::NativeDestroyChildFrame(
        const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);

    VmInstance* self = UnwrapFromData(args);
    if (!self) {
        args.GetReturnValue().Set(v8::Boolean::New(isolate, false));
        return;
    }

    if (args.Length() < 1 || !args[0]->IsNumber()) {
        args.GetReturnValue().Set(v8::Boolean::New(isolate, false));
        return;
    }

    int frame_id = static_cast<int>(
        args[0].As<v8::Number>()->Value());
    bool ok = self->DestroyChildFrameOnVmThread(frame_id);
    args.GetReturnValue().Set(v8::Boolean::New(isolate, ok));
}

void VmInstance::NativeNavigateChildFrame(
        const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);

    VmInstance* self = UnwrapFromData(args);
    if (!self) {
        args.GetReturnValue().Set(v8::Boolean::New(isolate, false));
        return;
    }

    if (args.Length() < 2 || !args[0]->IsNumber() || !args[1]->IsString()) {
        args.GetReturnValue().Set(v8::Boolean::New(isolate, false));
        return;
    }

    int index = args[0]->Int32Value(isolate->GetCurrentContext()).FromMaybe(-1);
    v8::String::Utf8Value url_utf8(isolate, args[1]);
    std::string url = *url_utf8 ? std::string(*url_utf8) : "";

    bool ok = self->NavigateChildFrameOnVmThread(index, url);
    args.GetReturnValue().Set(v8::Boolean::New(isolate, ok));
}

void VmInstance::NativeGetChildFrameCount(
        const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    VmInstance* self = UnwrapFromData(args);
    if (!self) {
        args.GetReturnValue().Set(v8::Integer::New(isolate, 0));
        return;
    }
    args.GetReturnValue().Set(
        v8::Integer::New(isolate, static_cast<int>(self->child_frames_.size())));
}

void VmInstance::NativeGetChildFrameProxy(
        const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);

    VmInstance* self = UnwrapFromData(args);
    if (!self) {
        args.GetReturnValue().Set(v8::Null(isolate));
        return;
    }

    if (args.Length() < 1 || !args[0]->IsNumber()) {
        args.GetReturnValue().Set(v8::Null(isolate));
        return;
    }

    int index = args[0]->Int32Value(isolate->GetCurrentContext()).FromMaybe(-1);
    v8::Local<v8::Context> caller_ctx = isolate->GetCurrentContext();
    v8::Local<v8::Object> proxy =
        self->GetChildFrameProxyOnVmThread(caller_ctx, index);

    if (proxy.IsEmpty()) {
        args.GetReturnValue().Set(v8::Null(isolate));
    } else {
        args.GetReturnValue().Set(proxy);
    }
}

// ============================================================================

void VmInstance::ThreadMain() {
    // VM 线程主循环：处理任务队列
    // 所有 V8 操作都在这个线程中执行

    if (!isolate_) {
        LEAPVM_LOG_ERROR("[vm_thread] Error: isolate is null");
        return;
    }

    // 当 isolate 在创建线程之外的线程上使用时，必须先获取 Locker
    // 否则 V8 线程本地数据未初始化，行为未定义（会出现偶发编译失败/崩溃）
    v8::Locker locker(isolate_);
    v8::Isolate::Scope isolate_scope(isolate_);
    v8::HandleScope handle_scope(isolate_);
    auto ctx = context_.Get(isolate_);
    v8::Context::Scope ctx_scope(ctx);

    // 验证Context真的可用：尝试编译一个简单脚本
    // 这确保Context的内部状态完全准备好，避免后续编译失败
    {
        v8::TryCatch try_catch(isolate_);
        v8::Local<v8::String> test_source;
        if (v8::String::NewFromUtf8(isolate_, "1", v8::NewStringType::kNormal)
                .ToLocal(&test_source)) {
            v8::Local<v8::Script> test_script;
            v8::Script::Compile(ctx, test_source).ToLocal(&test_script);
        }
    }

    // 泵送平台消息队列，处理Context初始化可能产生的任何异步任务
    while (v8::platform::PumpMessageLoop(
            V8Platform::Instance().platform(),
            isolate_,
            v8::platform::MessageLoopBehavior::kDoNotWait)) {
        // 继续泵送直到队列为空
    }

    // V8 scope初始化完成且Context已验证可用，通知主线程可以开始投递任务
    {
        std::lock_guard<std::mutex> lock(task_mu_);
        vm_thread_ready_ = true;
        task_cv_.notify_all();
    }

    while (true) {
        Task task;
        {
            std::unique_lock<std::mutex> lock(task_mu_);
            task_cv_.wait(lock, [this] {
                return !task_queue_.empty() || !vm_thread_running_;
            });

            // 退出条件：停止标志 && 队列为空
            if (!vm_thread_running_ && task_queue_.empty()) {
                break;
            }

            if (task_queue_.empty()) {
                continue;
            }

            task = std::move(task_queue_.front());
            task_queue_.pop();
        }

        // 执行任务（在锁外执行，避免阻塞其他投递者）
        try {
            task(isolate_, ctx);
        } catch (const std::exception& e) {
            LEAPVM_LOG_ERROR("[vm_thread] Task exception: %s", e.what());
        } catch (...) {
            LEAPVM_LOG_ERROR("[vm_thread] Unknown task exception");
        }
    }

    // VM 线程退出前：清理所有定时器的 Global 句柄
    // 这确保了句柄的创建和销毁在同一线程
    {
        v8::HandleScope handle_scope(isolate_);

        while (!timer_queue_.empty()) {
            timer_queue_.pop();
        }

        for (auto& pair : timers_by_id_) {
            auto& task = pair.second;
            if (task->kind == TimerTask::Kind::kFunction) {
                task->callback.Reset();
                for (auto& g : task->args) {
                    g.Reset();
                }
                task->args.clear();
            }
        }
        timers_by_id_.clear();

        // 清理 DOM wrapper 弱缓存（必须在持有 V8 Locker 时清理）
        // 通过 ClearWeak<> 取回 payload 指针并释放，防止析构函数里
        // Reset() 时留下孤立的 payload，也防止 isolate 在有待处理弱
        // 引用时被 Dispose，从而消除 "Check failed: node->IsInUse()" 崩溃。
        for (auto& pair : dom_wrapper_cache_) {
            auto* payload = pair.second.wrapper.ClearWeak<DomWrapperWeakPayload>();
            delete payload;
            pair.second.wrapper.Reset();
        }
        dom_wrapper_cache_.clear();

        // 清理 dispatch_fn_ 缓存句柄
        dispatch_fn_.Reset();

        // 清理 Context
        context_.Reset();
    }
}

void VmInstance::PostTask(Task task) {
    std::lock_guard<std::mutex> lock(task_mu_);
    task_queue_.push(std::move(task));
    task_cv_.notify_one();
}

// LEGACY: 保留给 Inspector 暂停循环使用，未来多实例化需重新设计。
bool VmInstance::WaitForAndProcessOneTask(std::chrono::milliseconds timeout) {
    if (!isolate_) return false;

    // 可能在 Inspector 线程被调用，也需要 Locker 来注册线程本地数据
    v8::Locker locker(isolate_);

    // 关键修复：先泵送平台消息队列
    // Inspector 的 evaluateOnCallFrame 等操作会向平台投递前台任务
    // 必须先执行这些任务，否则 Inspector 会进入非法状态导致崩溃
    while (v8::platform::PumpMessageLoop(
            V8Platform::Instance().platform(),
            isolate_,
            v8::platform::MessageLoopBehavior::kDoNotWait)) {
        // 循环执行所有待处理的平台消息
    }

    Task task;
    {
        std::unique_lock<std::mutex> lock(task_mu_);

        // 等待任务到达或超时
        if (task_queue_.empty()) {
            if (task_cv_.wait_for(lock, timeout, [this]{ return !task_queue_.empty(); })) {
                // 有任务到达
            } else {
                // 超时
                return false;
            }
        }

        // 取出任务
        task = std::move(task_queue_.front());
        task_queue_.pop();
    }

    // 执行任务
    // 创建 HandleScope 以确保任务执行期间的 handle 管理
    v8::HandleScope handle_scope(isolate_);
    auto ctx = context_.Get(isolate_);
    try {
        task(isolate_, ctx);
    } catch (const std::exception& e) {
        LEAPVM_LOG_ERROR("[vm] Task exception: %s", e.what());
    } catch (...) {
        LEAPVM_LOG_ERROR("[vm] Unknown task exception");
    }

    // 再次泵送消息，处理任务执行过程中产生的新消息
    while (v8::platform::PumpMessageLoop(
            V8Platform::Instance().platform(),
            isolate_,
            v8::platform::MessageLoopBehavior::kDoNotWait)) {
        // 循环执行所有待处理的平台消息
    }

    return true;
}

// ==========================
//  Inspector integration
// ==========================

bool VmInstance::InitInspector(int port, const std::string& target_id) {
    if (!isolate_) {
        LEAPVM_LOG_ERROR("[inspector] Error: isolate is null");
        return false;
    }

    if (inspector_client_) {
        LEAPVM_LOG_WARN("[inspector] Warning: inspector already initialized");
        return true;
    }

    LEAPVM_LOG_INFO("Initializing inspector...");

    // 创建 LeapInspectorClient，传入 PostTask 函数
    inspector_client_ = std::make_unique<LeapInspectorClient>(
        isolate_,
        this,
        [this](auto task) { this->PostTask(std::move(task)); }
    );

    // 在 VM 线程中初始化 Inspector
    std::promise<void> done;
    auto future = done.get_future();

    PostTask([this, &done](v8::Isolate* isolate, v8::Local<v8::Context> context) {
        inspector_client_->Initialize(context);
        done.set_value();
    });

    future.get();

    // 启动 WebSocket 服务器（在主线程，因为它有自己的 IO 线程）
    if (!inspector_client_->AttachToWebSocket(port, target_id)) {
        inspector_client_.reset();
        LEAPVM_LOG_ERROR("[inspector] Failed to attach WebSocket server");
        return false;
    }
    inspector_port_ = inspector_client_->bound_port();
    inspector_target_id_ = inspector_client_->target_id();

    LEAPVM_LOG_INFO("Inspector initialized successfully");
    return true;
}

void VmInstance::WaitForInspectorConnection() {
    if (!inspector_client_) {
        LEAPVM_LOG_ERROR("[inspector] Error: Inspector not initialized. Call InitInspector() first.");
        return;
    }
    inspector_client_->WaitForConnection();
}

}  // namespace leapvm
