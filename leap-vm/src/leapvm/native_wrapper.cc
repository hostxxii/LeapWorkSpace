// native_wrapper.cc
// NativeWrapper实现: 通用对象包装器 + NamedPropertyHandler
#include "native_wrapper.h"
#include "vm_instance.h"
#include "log.h"
#include <cstdio>
#include <iostream>

namespace leapvm {

using v8::Array;
using v8::Boolean;
using v8::Context;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::HandleScope;
using v8::Integer;
using v8::Isolate;
using v8::Local;
using v8::Maybe;
using v8::Name;
using v8::NewStringType;
using v8::Object;
using v8::ObjectTemplate;
using v8::PropertyCallbackInfo;
using v8::String;
using v8::Uint32;
using v8::Value;

// ============================================================================
// Thread-local re-entrance guard（防止 EmitWrapperHook 内部访问触发递归）
// 与 builtin_wrapper.cc 的 g_in_builtin_wrapper_callback 作用相同。
// ============================================================================
thread_local bool g_in_native_wrapper_hook = false;

struct NativeWrapperHookGuard {
    NativeWrapperHookGuard()  { g_in_native_wrapper_hook = true;  }
    ~NativeWrapperHookGuard() { g_in_native_wrapper_hook = false; }
};

namespace {

// Internal field indices
constexpr int kBackingFieldIndex = 0;
constexpr int kMetaIdFieldIndex  = 1;

// 从wrapper获取backing对象
Local<Object> GetBackingFromWrapper(Isolate* isolate, Local<Object> wrapper) {
    if (wrapper->InternalFieldCount() <= kBackingFieldIndex) return Local<Object>();
    Local<v8::Data> data = wrapper->GetInternalField(kBackingFieldIndex);
    if (data.IsEmpty() || !data->IsValue()) return Local<Object>();
    Local<Value> val = data.As<Value>();
    if (!val->IsObject()) return Local<Object>();
    return val.As<Object>();
}

// 从wrapper获取meta ID
uint32_t GetMetaIdFromWrapper(Isolate* isolate, Local<Object> wrapper) {
    if (wrapper->InternalFieldCount() <= kMetaIdFieldIndex) return 0;
    Local<v8::Data> data = wrapper->GetInternalField(kMetaIdFieldIndex);
    if (data.IsEmpty() || !data->IsValue()) return 0;
    Local<Value> val = data.As<Value>();
    if (!val->IsUint32()) return 0;
    return val.As<Uint32>()->Value();
}

inline VmInstance* GetVmInstanceFromIsolate(Isolate* isolate) {
    if (!isolate) return nullptr;
    return static_cast<VmInstance*>(isolate->GetData(0));
}

std::string GetWrapperLabel(Isolate* isolate, Local<Object> wrapper) {
    uint32_t meta_id = GetMetaIdFromWrapper(isolate, wrapper);
    leapvm::NativeWrapperMeta meta;
    std::string label = "unknown";
    if (leapvm::NativeWrapperRegistry::Instance().Get(meta_id, &meta)) {
        label = meta.label;
    }
    return label;
}

bool ShouldLogWrapper(Isolate* isolate,
                      const std::string& root,
                      const std::string& path,
                      MonitorOp op) {
    VmInstance* instance = GetVmInstanceFromIsolate(isolate);
    if (!instance) return false;
    HookEventKey key{root, path, op};
    if (!ShouldEnterHookPipeline(instance->hook_config(), key)) {
        return false;
    }
    HookContext ctx{op, root, path};
    return instance->monitor_engine().ShouldLog(ctx);
}

void EmitWrapperHook(Isolate* isolate,
                     const std::string& root,
                     const std::string& path,
                     MonitorOp op) {
    VmInstance* instance = GetVmInstanceFromIsolate(isolate);
    if (!instance) return;
    HookEventKey key{root, path, op};
    if (!ShouldEnterHookPipeline(instance->hook_config(), key)) {
        return;
    }
    HookContext ctx{op, root, path};
    instance->monitor_engine().OnHook(ctx);

    // ★ 重入守卫：阻止 console.log/inspector 的内部属性访问再次触发日志
    NativeWrapperHookGuard guard;
    HandleScope handle_scope(isolate);
    const char* op_str = (op == MonitorOp::kGet) ? "get"
                       : (op == MonitorOp::kSet) ? "set" : "call";
    const std::string hook_target = path.empty() ? root : (root + "." + path);
    const std::string hook_summary = "[hook][native] " + hook_target + " op=" + op_str;

    v8::Local<v8::StackTrace> js_stack =
        v8::StackTrace::CurrentStackTrace(isolate, 10);
    int frame_count = js_stack->GetFrameCount();
    std::string stack_lines;
    for (int i = 0; i < frame_count; i++) {
        v8::Local<v8::StackFrame> frame = js_stack->GetFrame(isolate, i);
        v8::String::Utf8Value script(isolate, frame->GetScriptNameOrSourceURL());
        v8::String::Utf8Value func(isolate, frame->GetFunctionName());
        int line = frame->GetLineNumber();
        int col  = frame->GetColumn();
        const char* func_str   = (*func   && (*func)[0])   ? *func   : "(anonymous)";
        const char* script_str = (*script && (*script)[0]) ? *script : "(unknown)";
        char buf[512];
        // Format like Error.stack so DevTools can linkify line/column locations.
        std::snprintf(buf, sizeof(buf), "\n    at %s (%s:%d:%d)",
                      func_str, script_str, line, col);
        stack_lines += buf;
    }
    std::string stack_error_like;
    if (!stack_lines.empty()) {
        stack_error_like = "Error: " + hook_summary + stack_lines;
    }

    // 同时输出到终端（stdout）
    if (!stack_error_like.empty()) {
        LEAPVM_LOG_INFO("%s", stack_error_like.c_str());
    }

    // 通过 V8 console.log 输出到 DevTools inspector
    v8::Local<v8::Context> v8_ctx = isolate->GetCurrentContext();
    if (v8_ctx.IsEmpty()) return;

    v8::Local<v8::String> msg_v8;
    if (!v8::String::NewFromUtf8(isolate, hook_summary.c_str()).ToLocal(&msg_v8)) return;

    v8::TryCatch try_catch(isolate);
    v8::Local<v8::Object> global = v8_ctx->Global();
    v8::Local<v8::Value> console_val;
    if (!global->Get(v8_ctx, v8::String::NewFromUtf8Literal(isolate, "console"))
             .ToLocal(&console_val) || !console_val->IsObject()) return;

    v8::Local<v8::Object> console_obj = console_val.As<v8::Object>();
    v8::Local<v8::Value> log_val;
    if (!console_obj->Get(v8_ctx, v8::String::NewFromUtf8Literal(isolate, "log"))
             .ToLocal(&log_val) || !log_val->IsFunction()) return;

    v8::Local<v8::Value> args[] = {msg_v8};
    log_val.As<v8::Function>()->Call(v8_ctx, console_obj, 1, args).IsEmpty();

    if (!stack_error_like.empty()) {
        v8::Local<v8::String> stack_v8;
        if (v8::String::NewFromUtf8(isolate, stack_error_like.c_str()).ToLocal(&stack_v8)) {
            v8::Local<v8::Value> stack_args[] = {stack_v8};
            log_val.As<v8::Function>()->Call(v8_ctx, console_obj, 1, stack_args).IsEmpty();
        }
    }
}

const LogDetailConfig& GetLogDetailConfig(Isolate* isolate) {
    VmInstance* instance = GetVmInstanceFromIsolate(isolate);
    static LogDetailConfig kDefault;
    return instance ? instance->log_detail_config() : kDefault;
}

// 将 v8::Name（字符串或 Symbol）统一归一化为 std::string key：
//   字符串键：原值返回
//   well-known symbol：@@iterator / @@toStringTag 等（description 形如 "Symbol.iterator"）
//   用户 symbol：Symbol(desc) 或 Symbol()
std::string ResolveNameKey(Isolate* isolate, Local<Name> property) {
    if (!property->IsSymbol()) {
        String::Utf8Value utf8(isolate, property);
        return *utf8 ? *utf8 : "";
    }
    Local<v8::Symbol> sym = property.As<v8::Symbol>();
    Local<Value> desc_val = sym->Description(isolate);
    if (desc_val.IsEmpty() || !desc_val->IsString()) {
        return "Symbol()";
    }
    String::Utf8Value desc_utf8(isolate, desc_val);
    const char* desc_cstr = *desc_utf8;
    if (!desc_cstr || desc_cstr[0] == '\0') {
        return "Symbol()";
    }
    std::string desc(desc_cstr);
    // well-known symbols 的 description 形如 "Symbol.iterator"
    static const std::string kWellKnownPrefix = "Symbol.";
    if (desc.size() > kWellKnownPrefix.size() &&
        desc.rfind(kWellKnownPrefix, 0) == 0) {
        return "@@" + desc.substr(kWellKnownPrefix.size());
    }
    return "Symbol(" + desc + ")";
}

// === NamedPropertyHandler 实现 ===

v8::Intercepted NativeWrapperNamedGetter(
    Local<Name> property,
    const PropertyCallbackInfo<Value>& info)
{
    Isolate* isolate = info.GetIsolate();
    HandleScope handle_scope(isolate);


    // ★ 重入快速路径：直接走 backing，不触发任何日志
    if (g_in_native_wrapper_hook) {
        Local<Object> wrapper = info.This();
        Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
        if (backing.IsEmpty()) return v8::Intercepted::kNo;
        Local<Context> ctx = isolate->GetCurrentContext();
        Local<Value> result;
        if (!backing->Get(ctx, property).ToLocal(&result))
            return v8::Intercepted::kNo;
        info.GetReturnValue().Set(result);
        return v8::Intercepted::kYes;
    }

    Local<Object> wrapper = info.This();
    Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
    if (backing.IsEmpty()) {
        return v8::Intercepted::kNo;
    }

    Local<Context> ctx = isolate->GetCurrentContext();

    std::string prop_name = ResolveNameKey(isolate, property);
    std::string label = GetWrapperLabel(isolate, wrapper);

    VmInstance* instance = GetVmInstanceFromIsolate(isolate);
    if (!instance) {
        return v8::Intercepted::kNo;
    }

    if (!ShouldEnterHookPipeline(instance->hook_config(),
                                 HookEventKey{label, prop_name, MonitorOp::kGet})) {
        return v8::Intercepted::kNo;
    }

    Local<Value> result;
    if (!backing->Get(ctx, property).ToLocal(&result)) {
        return v8::Intercepted::kNo;
    }

    bool should_log_get = ShouldLogWrapper(isolate, label, prop_name, MonitorOp::kGet);
    bool should_log_call = ShouldLogWrapper(isolate, label, prop_name, MonitorOp::kCall);
    const auto& log_detail = instance->log_detail_config();

    if (should_log_get) {
        EmitWrapperHook(isolate, label, prop_name, MonitorOp::kGet);
        if (log_detail.log_type) {
            LEAPVM_LOG_INFO("  type: %s", GetValueType(result).c_str());
        }
        if (result->IsFunction() && log_detail.log_func_params) {
            std::string params = GetFunctionParams(isolate, ctx, result.As<Function>());
            if (!params.empty()) {
                LEAPVM_LOG_INFO("  params: %s", params.c_str());
            }
        }
        if (log_detail.log_value) {
            LEAPVM_LOG_INFO("  value: %s", GetValuePreview(isolate, ctx, result).c_str());
        }
        LEAPVM_LOG_INFO("  %s", std::string(50, '-').c_str());
    }

    if (result->IsFunction() && should_log_call) {
        Local<Function> wrapped = WrapFunctionWithCallHook(
            isolate, ctx, label, prop_name, result.As<Function>());
        info.GetReturnValue().Set(wrapped);
        return v8::Intercepted::kYes;
    }

    info.GetReturnValue().Set(result);
    return v8::Intercepted::kYes;
}

v8::Intercepted NativeWrapperNamedSetter(
    Local<Name> property,
    Local<Value> value,
    const PropertyCallbackInfo<void>& info)
{
    Isolate* isolate = info.GetIsolate();
    HandleScope handle_scope(isolate);


    // ★ 重入快速路径：直接写 backing，不记日志
    if (g_in_native_wrapper_hook) {
        Local<Object> wrapper = info.This();
        Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
        if (!backing.IsEmpty()) {
            Local<Context> ctx = isolate->GetCurrentContext();
            backing->Set(ctx, property, value).Check();
        }
        return v8::Intercepted::kYes;
    }

    Local<Object> wrapper = info.This();
    Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
    if (backing.IsEmpty()) {
        return v8::Intercepted::kNo;
    }

    Local<Context> ctx = isolate->GetCurrentContext();

    std::string prop_name = ResolveNameKey(isolate, property);
    std::string label = GetWrapperLabel(isolate, wrapper);

    VmInstance* instance = GetVmInstanceFromIsolate(isolate);
    if (!instance) {
        return v8::Intercepted::kNo;
    }

    if (!ShouldEnterHookPipeline(instance->hook_config(),
                                 HookEventKey{label, prop_name, MonitorOp::kSet})) {
        return v8::Intercepted::kNo;
    }

    bool should_log_set = ShouldLogWrapper(isolate, label, prop_name, MonitorOp::kSet);
    const auto& log_detail = instance->log_detail_config();
    if (should_log_set) {
        EmitWrapperHook(isolate, label, prop_name, MonitorOp::kSet);
        if (log_detail.log_type) {
            LEAPVM_LOG_INFO("  type: %s", GetValueType(value).c_str());
        }
        if (log_detail.log_value) {
            LEAPVM_LOG_INFO("  value: %s", GetValuePreview(isolate, ctx, value).c_str());
        }
        LEAPVM_LOG_INFO("  %s", std::string(50, '-').c_str());
    }

    backing->Set(ctx, property, value).Check();
    return v8::Intercepted::kYes;
}

v8::Intercepted NativeWrapperNamedQuery(
    Local<Name> property,
    const PropertyCallbackInfo<Integer>& info)
{
    Isolate* isolate = info.GetIsolate();
    HandleScope handle_scope(isolate);


    // ★ 重入快速路径：直接查 backing
    if (g_in_native_wrapper_hook) {
        Local<Object> wrapper = info.This();
        Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
        if (backing.IsEmpty()) return v8::Intercepted::kNo;
        Local<Context> ctx = isolate->GetCurrentContext();
        bool has = backing->Has(ctx, property).FromMaybe(false);
        if (has) {
            info.GetReturnValue().Set(Integer::New(isolate, v8::PropertyAttribute::None));
            return v8::Intercepted::kYes;
        }
        return v8::Intercepted::kNo;
    }

    Local<Object> wrapper = info.This();

    std::string prop_name = ResolveNameKey(isolate, property);
    std::string label = GetWrapperLabel(isolate, wrapper);

    VmInstance* instance = GetVmInstanceFromIsolate(isolate);
    if (!instance) {
        return v8::Intercepted::kNo;
    }

    if (!ShouldEnterHookPipeline(instance->hook_config(),
                                 HookEventKey{label, prop_name, MonitorOp::kGet})) {
        return v8::Intercepted::kNo;
    }

    if (ShouldLogWrapper(isolate, label, prop_name, MonitorOp::kGet)) {
        EmitWrapperHook(isolate, label, prop_name, MonitorOp::kGet);
    }

    Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
    if (backing.IsEmpty()) return v8::Intercepted::kNo;

    Local<Context> ctx = isolate->GetCurrentContext();
    bool has = backing->Has(ctx, property).FromMaybe(false);
    if (has) {
        info.GetReturnValue().Set(Integer::New(isolate, v8::PropertyAttribute::None));
        return v8::Intercepted::kYes;
    }
    return v8::Intercepted::kNo;
}

v8::Intercepted NativeWrapperNamedDeleter(
    Local<Name> property,
    const PropertyCallbackInfo<v8::Boolean>& info)
{
    Isolate* isolate = info.GetIsolate();
    HandleScope handle_scope(isolate);


    // ★ 重入快速路径：直接从 backing 删除
    if (g_in_native_wrapper_hook) {
        Local<Object> wrapper = info.This();
        Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
        if (backing.IsEmpty()) {
            info.GetReturnValue().Set(false);
            return v8::Intercepted::kYes;
        }
        Local<Context> ctx = isolate->GetCurrentContext();
        bool success = backing->Delete(ctx, property).FromMaybe(false);
        info.GetReturnValue().Set(success);
        return v8::Intercepted::kYes;
    }

    Local<Object> wrapper = info.This();
    std::string prop_name = ResolveNameKey(isolate, property);
    std::string label = GetWrapperLabel(isolate, wrapper);

    VmInstance* instance = GetVmInstanceFromIsolate(isolate);
    if (!instance) {
        return v8::Intercepted::kNo;
    }

    if (!ShouldEnterHookPipeline(instance->hook_config(),
                                 HookEventKey{label, prop_name, MonitorOp::kSet})) {
        return v8::Intercepted::kNo;
    }

    if (ShouldLogWrapper(isolate, label, prop_name, MonitorOp::kSet)) {
        EmitWrapperHook(isolate, label, prop_name, MonitorOp::kSet);
    }

    Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
    if (backing.IsEmpty()) {
        info.GetReturnValue().Set(false);
        return v8::Intercepted::kYes;
    }

    Local<Context> ctx = isolate->GetCurrentContext();
    bool success = backing->Delete(ctx, property).FromMaybe(false);
    info.GetReturnValue().Set(success);
    return v8::Intercepted::kYes;
}

void NativeWrapperNamedEnumerator(
    const PropertyCallbackInfo<Array>& info)
{
    Isolate* isolate = info.GetIsolate();
    HandleScope handle_scope(isolate);

    Local<Object> wrapper = info.This();
    std::string label = GetWrapperLabel(isolate, wrapper);

    // ★ 重入快速路径：直接返回 backing 属性列表
    if (g_in_native_wrapper_hook) {
        Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
        if (backing.IsEmpty()) {
            info.GetReturnValue().Set(Array::New(isolate, 0));
            return;
        }
        Local<Context> ctx = isolate->GetCurrentContext();
        Local<Array> keys;
        if (!backing->GetPropertyNames(ctx).ToLocal(&keys)) {
            info.GetReturnValue().Set(Array::New(isolate, 0));
            return;
        }
        info.GetReturnValue().Set(keys);
        return;
    }

    if (ShouldLogWrapper(isolate, label, "", MonitorOp::kGet)) {
        EmitWrapperHook(isolate, label, "", MonitorOp::kGet);
    }

    Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
    if (backing.IsEmpty()) {
        info.GetReturnValue().Set(Array::New(isolate, 0));
        return;
    }

    Local<Context> ctx = isolate->GetCurrentContext();
    Local<Array> keys;
    if (!backing->GetPropertyNames(ctx).ToLocal(&keys)) {
        info.GetReturnValue().Set(Array::New(isolate, 0));
        return;
    }

    info.GetReturnValue().Set(keys);
}

// === IndexedPropertyHandler 实现 ===

v8::Intercepted NativeWrapperIndexedGetter(
    uint32_t index,
    const PropertyCallbackInfo<Value>& info)
{
    Isolate* isolate = info.GetIsolate();
    HandleScope handle_scope(isolate);

    // ★ 重入快速路径：直接走 backing
    if (g_in_native_wrapper_hook) {
        Local<Object> wrapper = info.This();
        Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
        if (backing.IsEmpty()) return v8::Intercepted::kNo;
        Local<Context> ctx = isolate->GetCurrentContext();
        Local<Value> result;
        if (!backing->Get(ctx, index).ToLocal(&result))
            return v8::Intercepted::kNo;
        info.GetReturnValue().Set(result);
        return v8::Intercepted::kYes;
    }

    Local<Object> wrapper = info.This();
    Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
    if (backing.IsEmpty()) {
        return v8::Intercepted::kNo;
    }

    Local<Context> ctx = isolate->GetCurrentContext();
    Local<Value> result;
    if (!backing->Get(ctx, index).ToLocal(&result)) {
        return v8::Intercepted::kNo;
    }

    std::string prop_name = std::to_string(index);
    std::string label = GetWrapperLabel(isolate, wrapper);
    VmInstance* instance = GetVmInstanceFromIsolate(isolate);
    if (!instance) {
        return v8::Intercepted::kNo;
    }
    if (!ShouldEnterHookPipeline(instance->hook_config(),
                                 HookEventKey{label, prop_name, MonitorOp::kGet})) {
        return v8::Intercepted::kNo;
    }
    const auto& log_detail = instance->log_detail_config();
    bool should_log_get = ShouldLogWrapper(isolate, label, prop_name, MonitorOp::kGet);
    bool should_log_call = ShouldLogWrapper(isolate, label, prop_name, MonitorOp::kCall);

    if (should_log_get) {
        EmitWrapperHook(isolate, label, prop_name, MonitorOp::kGet);
        if (log_detail.log_type) {
            LEAPVM_LOG_INFO("  type: %s", GetValueType(result).c_str());
        }
        if (result->IsFunction() && log_detail.log_func_params) {
            std::string params = GetFunctionParams(isolate, ctx, result.As<Function>());
            if (!params.empty()) {
                LEAPVM_LOG_INFO("  params: %s", params.c_str());
            }
        }
        if (log_detail.log_value) {
            LEAPVM_LOG_INFO("  value: %s", GetValuePreview(isolate, ctx, result).c_str());
        }
        LEAPVM_LOG_INFO("  %s", std::string(50, '-').c_str());
    }

    if (result->IsFunction() && should_log_call) {
        Local<Function> wrapped = WrapFunctionWithCallHook(
            isolate, ctx, label, prop_name, result.As<Function>());
        info.GetReturnValue().Set(wrapped);
        return v8::Intercepted::kYes;
    }

    info.GetReturnValue().Set(result);
    return v8::Intercepted::kYes;
}

v8::Intercepted NativeWrapperIndexedSetter(
    uint32_t index,
    Local<Value> value,
    const PropertyCallbackInfo<void>& info)
{
    Isolate* isolate = info.GetIsolate();
    HandleScope handle_scope(isolate);

    // ★ 重入快速路径：直接写 backing
    if (g_in_native_wrapper_hook) {
        Local<Object> wrapper = info.This();
        Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
        if (backing.IsEmpty()) return v8::Intercepted::kNo;
        Local<Context> ctx = isolate->GetCurrentContext();
        if (!backing->Set(ctx, index, value).FromMaybe(false))
            return v8::Intercepted::kNo;
        return v8::Intercepted::kYes;
    }

    Local<Object> wrapper = info.This();
    Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
    if (backing.IsEmpty()) {
        return v8::Intercepted::kNo;
    }

    Local<Context> ctx = isolate->GetCurrentContext();

    std::string prop_name = std::to_string(index);
    std::string label = GetWrapperLabel(isolate, wrapper);
    VmInstance* instance = GetVmInstanceFromIsolate(isolate);
    if (!instance) {
        return v8::Intercepted::kNo;
    }
    if (!ShouldEnterHookPipeline(instance->hook_config(),
                                 HookEventKey{label, prop_name, MonitorOp::kSet})) {
        return v8::Intercepted::kNo;
    }
    const auto& log_detail = instance->log_detail_config();
    bool should_log_set = ShouldLogWrapper(isolate, label, prop_name, MonitorOp::kSet);

    if (should_log_set) {
        EmitWrapperHook(isolate, label, prop_name, MonitorOp::kSet);
        if (log_detail.log_type) {
            LEAPVM_LOG_INFO("  type: %s", GetValueType(value).c_str());
        }
        if (log_detail.log_value) {
            LEAPVM_LOG_INFO("  value: %s", GetValuePreview(isolate, ctx, value).c_str());
        }
        LEAPVM_LOG_INFO("  %s", std::string(50, '-').c_str());
    }

    if (!backing->Set(ctx, index, value).FromMaybe(false)) {
        return v8::Intercepted::kNo;
    }

    return v8::Intercepted::kYes;
}

v8::Intercepted NativeWrapperIndexedQuery(
    uint32_t index,
    const PropertyCallbackInfo<Integer>& info)
{
    Isolate* isolate = info.GetIsolate();
    HandleScope handle_scope(isolate);

    // ★ 重入快速路径：直接查 backing
    if (g_in_native_wrapper_hook) {
        Local<Object> wrapper = info.This();
        Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
        if (backing.IsEmpty()) return v8::Intercepted::kNo;
        Local<Context> ctx = isolate->GetCurrentContext();
        Maybe<bool> has = backing->Has(ctx, index);
        if (has.IsNothing() || !has.FromJust()) return v8::Intercepted::kNo;
        info.GetReturnValue().Set(v8::None);
        return v8::Intercepted::kYes;
    }

    Local<Object> wrapper = info.This();
    std::string prop_name = std::to_string(index);
    std::string label = GetWrapperLabel(isolate, wrapper);

    VmInstance* instance = GetVmInstanceFromIsolate(isolate);
    if (!instance) {
        return v8::Intercepted::kNo;
    }
    if (!ShouldEnterHookPipeline(instance->hook_config(),
                                 HookEventKey{label, prop_name, MonitorOp::kGet})) {
        return v8::Intercepted::kNo;
    }

    if (ShouldLogWrapper(isolate, label, prop_name, MonitorOp::kGet)) {
        EmitWrapperHook(isolate, label, prop_name, MonitorOp::kGet);
    }

    Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
    if (backing.IsEmpty()) {
        return v8::Intercepted::kNo;
    }

    Local<Context> ctx = isolate->GetCurrentContext();
    Maybe<bool> has = backing->Has(ctx, index);
    if (has.IsNothing() || !has.FromJust()) {
        return v8::Intercepted::kNo;
    }

    info.GetReturnValue().Set(v8::None);
    return v8::Intercepted::kYes;
}

v8::Intercepted NativeWrapperIndexedDeleter(
    uint32_t index,
    const PropertyCallbackInfo<Boolean>& info)
{
    Isolate* isolate = info.GetIsolate();
    HandleScope handle_scope(isolate);

    // ★ 重入快速路径：直接从 backing 删除
    if (g_in_native_wrapper_hook) {
        Local<Object> wrapper = info.This();
        Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
        if (backing.IsEmpty()) {
            info.GetReturnValue().Set(false);
            return v8::Intercepted::kYes;
        }
        Local<Context> ctx = isolate->GetCurrentContext();
        Maybe<bool> result = backing->Delete(ctx, index);
        if (result.IsNothing()) return v8::Intercepted::kNo;
        info.GetReturnValue().Set(result.FromJust());
        return v8::Intercepted::kYes;
    }

    Local<Object> wrapper = info.This();
    std::string prop_name = std::to_string(index);
    std::string label = GetWrapperLabel(isolate, wrapper);

    VmInstance* instance = GetVmInstanceFromIsolate(isolate);
    if (!instance) {
        return v8::Intercepted::kNo;
    }
    if (!ShouldEnterHookPipeline(instance->hook_config(),
                                 HookEventKey{label, prop_name, MonitorOp::kSet})) {
        return v8::Intercepted::kNo;
    }

    if (ShouldLogWrapper(isolate, label, prop_name, MonitorOp::kSet)) {
        EmitWrapperHook(isolate, label, prop_name, MonitorOp::kSet);
    }

    Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
    if (backing.IsEmpty()) {
        return v8::Intercepted::kNo;
    }

    Local<Context> ctx = isolate->GetCurrentContext();
    Maybe<bool> result = backing->Delete(ctx, index);
    if (result.IsNothing()) {
        return v8::Intercepted::kNo;
    }

    info.GetReturnValue().Set(result.FromJust());
    return v8::Intercepted::kYes;
}

void NativeWrapperIndexedEnumerator(
    const PropertyCallbackInfo<Array>& info)
{
    Isolate* isolate = info.GetIsolate();
    HandleScope handle_scope(isolate);

    Local<Object> wrapper = info.This();
    std::string label = GetWrapperLabel(isolate, wrapper);

    // ★ 重入快速路径：直接返回 backing 索引列表
    if (g_in_native_wrapper_hook) {
        Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
        if (backing.IsEmpty()) {
            info.GetReturnValue().Set(Array::New(isolate, 0));
            return;
        }
        Local<Context> ctx = isolate->GetCurrentContext();
        Local<Array> indices;
        if (!backing->GetOwnPropertyNames(ctx).ToLocal(&indices)) {
            info.GetReturnValue().Set(Array::New(isolate, 0));
            return;
        }
        info.GetReturnValue().Set(indices);
        return;
    }

    if (ShouldLogWrapper(isolate, label, "", MonitorOp::kGet)) {
        EmitWrapperHook(isolate, label, "", MonitorOp::kGet);
    }

    Local<Object> backing = GetBackingFromWrapper(isolate, wrapper);
    if (backing.IsEmpty()) {
        info.GetReturnValue().Set(Array::New(isolate, 0));
        return;
    }

    Local<Context> ctx = isolate->GetCurrentContext();
    Local<Array> indices;
    if (!backing->GetOwnPropertyNames(ctx).ToLocal(&indices)) {
        info.GetReturnValue().Set(Array::New(isolate, 0));
        return;
    }

    info.GetReturnValue().Set(indices);
}

}  // namespace

// 创建NativeWrapper模板
v8::Local<ObjectTemplate> CreateNativeWrapperTemplate(Isolate* isolate) {
    v8::EscapableHandleScope handle_scope(isolate);

    Local<ObjectTemplate> tpl = ObjectTemplate::New(isolate);
    tpl->SetInternalFieldCount(2);  // backing + meta-id

    // V8 13.x NamedPropertyHandlerConfiguration:
    // (getter, setter, query, deleter, enumerator)
    // Descriptor is optional and not commonly used
    v8::NamedPropertyHandlerConfiguration named_config(
        NativeWrapperNamedGetter,
        NativeWrapperNamedSetter,
        NativeWrapperNamedQuery,
        NativeWrapperNamedDeleter,
        NativeWrapperNamedEnumerator);

    tpl->SetHandler(named_config);

    // IndexedPropertyHandlerConfiguration for array-like access
    v8::IndexedPropertyHandlerConfiguration indexed_config(
        NativeWrapperIndexedGetter,
        NativeWrapperIndexedSetter,
        NativeWrapperIndexedQuery,
        NativeWrapperIndexedDeleter,
        NativeWrapperIndexedEnumerator);

    tpl->SetHandler(indexed_config);

    return handle_scope.Escape(tpl);
}

// 设置wrapper的内部字段
void SetNativeWrapperInternalFields(
    Isolate* isolate,
    Local<Object> wrapper,
    Local<Object> backing,
    uint32_t meta_id)
{
    wrapper->SetInternalField(kBackingFieldIndex, backing);
    wrapper->SetInternalField(kMetaIdFieldIndex, Uint32::New(isolate, meta_id));
}

}  // namespace leapvm
