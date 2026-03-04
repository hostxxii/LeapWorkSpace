#include "hook_log_policy.h"

#include "../leap_inspector_client.h"
#include "../vm_instance.h"
#include <algorithm>
#include <cstdlib>

namespace leapvm {
namespace skeleton {
namespace hooklog {

std::vector<HookStackFrame> CaptureHookStackFrames(v8::Isolate* isolate,
                                                   int max_frames) {
    std::vector<HookStackFrame> frames;
    if (!isolate) return frames;

    v8::Local<v8::StackTrace> js_stack =
        v8::StackTrace::CurrentStackTrace(isolate, max_frames);
    const int frame_count = js_stack->GetFrameCount();
    frames.reserve(frame_count > 0 ? static_cast<size_t>(frame_count) : 0u);
    for (int i = 0; i < frame_count; ++i) {
        v8::Local<v8::StackFrame> frame = js_stack->GetFrame(isolate, i);
        v8::String::Utf8Value script(isolate, frame->GetScriptNameOrSourceURL());
        v8::String::Utf8Value func(isolate, frame->GetFunctionName());

        HookStackFrame out;
        out.function_name = (*func && (*func)[0]) ? std::string(*func, func.length())
                                                  : "(anonymous)";
        out.url = (*script && (*script)[0]) ? std::string(*script, script.length())
                                            : "(unknown)";
        out.line = frame->GetLineNumber();
        out.column = frame->GetColumn();
        frames.push_back(std::move(out));
    }
    return frames;
}

bool IsInternalUrl(const std::string& url) {
    if (url.find("leapenv.") != std::string::npos ||
        url.find("leapenv/") != std::string::npos) {
        return true;
    }
    return url == "(unknown)" ||
           url == "debugger eval code" ||
           url.find("debugger eval code") == 0 ||
           url.find("VM") == 0 ||
           url.find("evalmachine.<anonymous>") != std::string::npos ||
           url.find("devtools://") != std::string::npos ||
           url.find("inspector://") != std::string::npos ||
           url.find("extensions::") != std::string::npos ||
           url.find("node:internal") == 0;
}

bool HasUserFrame(const std::vector<HookStackFrame>& frames) {
    for (const auto& frame : frames) {
        if (!IsInternalUrl(frame.url)) {
            return true;
        }
    }
    return false;
}

bool HasDevtoolsEvalFrame(const std::vector<HookStackFrame>& frames) {
    for (const auto& frame : frames) {
        const std::string& url = frame.url;
        if (url == "debugger eval code" ||
            url.find("debugger eval code") == 0 ||
            url.find("devtools://") != std::string::npos ||
            url.find("inspector://") != std::string::npos ||
            url.find("VM") == 0 ||
            url.find("evalmachine.<anonymous>") != std::string::npos) {
            return true;
        }
    }
    return false;
}

bool AllowDevtoolsEvalHookLogs() {
    const char* raw = std::getenv("LEAPVM_ALLOW_DEVTOOLS_EVAL_HOOK_LOGS");
    if (!raw || !*raw) return false;
    std::string v(raw);
    std::transform(v.begin(), v.end(), v.begin(), [](unsigned char c) {
        return static_cast<char>(::tolower(c));
    });
    return v == "1" || v == "true" || v == "yes" || v == "on";
}

v8::Local<v8::Object> ResolveHookRuntimeObject(v8::Isolate* isolate,
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

bool IsRuntimeTaskActive(v8::Isolate* isolate, v8::Local<v8::Context> context) {
    v8::Local<v8::Object> runtime_obj = ResolveHookRuntimeObject(isolate, context);
    if (runtime_obj.IsEmpty()) return false;
    v8::Local<v8::Value> phase_val;
    if (!runtime_obj->Get(context, v8::String::NewFromUtf8Literal(isolate, "phase"))
             .ToLocal(&phase_val) ||
        !phase_val->IsString()) {
        return false;
    }
    v8::String::Utf8Value phase_utf8(isolate, phase_val);
    if (!*phase_utf8 || phase_utf8.length() == 0) return false;
    const std::string phase(*phase_utf8, phase_utf8.length());
    if (phase != "task") return false;

    v8::Local<v8::Value> active_val;
    if (!runtime_obj->Get(context, v8::String::NewFromUtf8Literal(isolate, "active"))
             .ToLocal(&active_val)) {
        return false;
    }
    return active_val->BooleanValue(isolate);
}

bool ShouldSuppressHookNoise(v8::Isolate* isolate,
                             v8::Local<v8::Context> context,
                             VmInstance* vm,
                             const std::vector<HookStackFrame>& frames) {
    if (!vm) return true;
    if (auto* inspector = vm->inspector_client()) {
        if (inspector->is_paused()) {
            return true;
        }
    }
    if (!IsRuntimeTaskActive(isolate, context)) {
        return true;
    }
    if (HasDevtoolsEvalFrame(frames)) {
        return !AllowDevtoolsEvalHookLogs();
    }
    return false;
}

}  // namespace hooklog
}  // namespace skeleton
}  // namespace leapvm
