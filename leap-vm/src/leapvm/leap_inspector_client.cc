#include "leap_inspector_client.h"
#include "vm_instance.h"
#include "ws_inspector_server.h"
#include "v8_platform.h"
#include <v8-inspector-protocol.h>
#include <crdtp/json.h>
#include <libplatform/libplatform.h>
#include "log.h"
#include <iostream>
#include <chrono>
#include <thread>
#include <cstdlib>
#include <algorithm>
#include <vector>

namespace leapvm {
namespace {

bool IsDebuggerEnableMessage(const std::string& message) {
    return message.find("\"method\":\"Debugger.enable\"") != std::string::npos ||
           message.find("\"method\": \"Debugger.enable\"") != std::string::npos;
}

bool IsDebuggerScriptParsedNotification(const std::string& message) {
    return message.find("\"method\":\"Debugger.scriptParsed\"") != std::string::npos ||
           message.find("\"method\": \"Debugger.scriptParsed\"") != std::string::npos;
}

bool ExtractJsonStringField(const std::string& json,
                            const std::string& key,
                            std::string* out) {
    if (!out) return false;
    const std::string needle = "\"" + key + "\"";
    size_t key_pos = json.find(needle);
    if (key_pos == std::string::npos) return false;
    size_t colon = json.find(':', key_pos + needle.size());
    if (colon == std::string::npos) return false;
    size_t q1 = json.find('"', colon + 1);
    if (q1 == std::string::npos) return false;
    size_t i = q1 + 1;
    std::string val;
    val.reserve(64);
    while (i < json.size()) {
        char c = json[i++];
        if (c == '\\') {
            if (i >= json.size()) break;
            char esc = json[i++];
            switch (esc) {
            case '"': val.push_back('"'); break;
            case '\\': val.push_back('\\'); break;
            case '/': val.push_back('/'); break;
            case 'b': val.push_back('\b'); break;
            case 'f': val.push_back('\f'); break;
            case 'n': val.push_back('\n'); break;
            case 'r': val.push_back('\r'); break;
            case 't': val.push_back('\t'); break;
            case 'u':
                // 简化处理：跳过 \uXXXX，保留原样占位，脚本 URL 基本不会出现该情况
                if (i + 3 < json.size()) {
                    i += 4;
                }
                break;
            default:
                val.push_back(esc);
                break;
            }
            continue;
        }
        if (c == '"') {
            *out = std::move(val);
            return true;
        }
        val.push_back(c);
    }
    return false;
}

std::string BasenameLike(const std::string& url) {
    size_t p = url.find_last_of("/\\");
    return (p == std::string::npos) ? url : url.substr(p + 1);
}

int ResolveInspectorReadyWaitMs() {
    constexpr int kDefaultWaitMs = 200;
    constexpr int kMaxWaitMs = 5000;
    const char* raw = std::getenv("LEAPVM_INSPECTOR_READY_WAIT_MS");
    if (!raw || !*raw) {
        return kDefaultWaitMs;
    }

    char* end = nullptr;
    long parsed = std::strtol(raw, &end, 10);
    if (end == raw || (end && *end != '\0')) {
        LEAPVM_LOG_WARN("[inspector] Invalid LEAPVM_INSPECTOR_READY_WAIT_MS='%s', fallback to %dms",
                        raw, kDefaultWaitMs);
        return kDefaultWaitMs;
    }

    if (parsed < 0) {
        parsed = 0;
    } else if (parsed > kMaxWaitMs) {
        parsed = kMaxWaitMs;
    }
    return static_cast<int>(parsed);
}

constexpr char kHookObjectGroup[] = "leapvm-hook-values";

}  // namespace

// ============================================================================
// InspectorChannelImpl
// ============================================================================

InspectorChannelImpl::InspectorChannelImpl(LeapInspectorClient* client)
    : client_(client) {}

void InspectorChannelImpl::sendResponse(int callId, std::unique_ptr<v8_inspector::StringBuffer> message) {
    std::string msg = LeapInspectorClient::ToString(message->string());
    LEAPVM_LOG_DEBUG("[inspector] sendResponse (callId=%d): %s...", callId,
                     msg.substr(0, 100).c_str());
    client_->SendToFrontend(msg);
}

void InspectorChannelImpl::sendNotification(std::unique_ptr<v8_inspector::StringBuffer> message) {
    std::string msg = LeapInspectorClient::ToString(message->string());
    LEAPVM_LOG_DEBUG("[inspector] sendNotification: %s...", msg.substr(0, 100).c_str());
    client_->ObserveProtocolNotification(msg);
    client_->SendToFrontend(msg);
}

void InspectorChannelImpl::flushProtocolNotifications() {
    // 默认不需要实现（V8 内部使用）
}

// ============================================================================
// LeapInspectorClient
// ============================================================================

LeapInspectorClient::LeapInspectorClient(v8::Isolate* isolate, VmInstance* owner, PostVmTaskFn post_vm_task)
    : isolate_(isolate)
    , owner_(owner)
    , post_vm_task_(std::move(post_vm_task)) {
    LEAPVM_LOG_DEBUG("[inspector] LeapInspectorClient created");
}

LeapInspectorClient::~LeapInspectorClient() {
    if (ws_server_) {
        ws_server_->Stop();
        ws_server_.reset();
    }
    LEAPVM_LOG_DEBUG("[inspector] LeapInspectorClient destroyed");
}

void LeapInspectorClient::CreateInspectorSession() {
    auto channel = std::make_unique<InspectorChannelImpl>(this);
    v8_inspector::StringView empty_state;
    session_ = inspector_->connectShared(
        1,
        channel.release(),
        empty_state,
        v8_inspector::V8Inspector::kFullyTrusted,
        v8_inspector::V8Inspector::kNotWaitingForDebugger
    );
}

void LeapInspectorClient::ResetFrontendState() {
    debugger_enable_seen_.store(false, std::memory_order_release);
    debugger_enable_processed_.store(false, std::memory_order_release);
    dispatching_message_ = false;
    pending_protocol_messages_.clear();
    {
        std::lock_guard<std::mutex> lock(script_index_mutex_);
        script_id_by_url_.clear();
    }
}

void LeapInspectorClient::HandleFrontendStateChange(bool connected, uint64_t generation) {
    if (shutting_down_.load(std::memory_order_acquire)) {
        return;
    }

    if (!connected) {
        LEAPVM_LOG_INFO("[inspector] Frontend disconnected (generation=%llu)",
                        static_cast<unsigned long long>(generation));
        debugger_enable_seen_.store(false, std::memory_order_release);
        debugger_enable_processed_.store(false, std::memory_order_release);
        {
            std::lock_guard<std::mutex> lock(script_index_mutex_);
            script_id_by_url_.clear();
        }
        quitMessageLoopOnPause();
        return;
    }

    LEAPVM_LOG_INFO("[inspector] Frontend connected (generation=%llu)",
                    static_cast<unsigned long long>(generation));
    if (generation <= 1) {
        return;
    }

    post_vm_task_([this, generation](v8::Isolate* isolate, v8::Local<v8::Context> context) {
        (void)isolate;
        if (shutting_down_.load(std::memory_order_acquire) || context.IsEmpty()) {
            return;
        }
        RecreateSessionForFrontend(generation, context);
    });
}

void LeapInspectorClient::RecreateSessionForFrontend(uint64_t generation,
                                                     v8::Local<v8::Context> context) {
    if (!inspector_ || context.IsEmpty()) {
        return;
    }

    LEAPVM_LOG_INFO("[inspector] Recreating V8 inspector session for frontend generation=%llu",
                    static_cast<unsigned long long>(generation));
    quitMessageLoopOnPause();
    if (session_) {
        session_->stop();
        v8_inspector::StringView object_group(
            reinterpret_cast<const uint8_t*>(kHookObjectGroup),
            sizeof(kHookObjectGroup) - 1);
        session_->releaseObjectGroup(object_group);
        session_.reset();
    }
    ResetFrontendState();
    CreateInspectorSession();
}

void LeapInspectorClient::Initialize(v8::Local<v8::Context> context) {
    LEAPVM_LOG_INFO("[inspector] Initializing V8 Inspector...");

    // 创建 V8Inspector 实例
    inspector_ = v8_inspector::V8Inspector::create(isolate_, this);

    // 通知 Inspector 上下文已创建
    // contextGroupId = 1（默认）
    v8_inspector::StringView context_name = v8_inspector::StringView(
        reinterpret_cast<const uint8_t*>("leapvm-context"), 14);
    inspector_->contextCreated(v8_inspector::V8ContextInfo(context, 1, context_name));

    // 创建 Inspector 会话
    CreateInspectorSession();

    LEAPVM_LOG_INFO("[inspector] V8 Inspector initialized successfully");
}

void LeapInspectorClient::DispatchInspectorMessage(const std::string& message) {
    if (shutting_down_.load(std::memory_order_acquire)) {
        return;
    }
    if (!session_) {
        LEAPVM_LOG_ERROR("[inspector] Error: session not initialized");
        return;
    }

    // 防止重入：不要丢消息，入队等待当前 dispatch 完成后继续处理
    if (dispatching_message_) {
        LEAPVM_LOG_WARN("[inspector] Reentry into DispatchInspectorMessage, queueing message");
        pending_protocol_messages_.push_back(message);
        return;
    }

    dispatching_message_ = true;
    pending_protocol_messages_.push_back(message);

    while (!pending_protocol_messages_.empty()) {
        std::string current = std::move(pending_protocol_messages_.front());
        pending_protocol_messages_.pop_front();

        LEAPVM_LOG_DEBUG("[inspector] Dispatching message: %s...", current.substr(0, 100).c_str());

        // 注意：不要在这里创建 HandleScope 或 SealHandleScope！
        // Inspector 的 dispatchProtocolMessage 会在内部创建需要的 scope
        // 参考 Node.js: session_->Dispatch() 直接调用，没有额外的 scope

        v8_inspector::StringView message_view(
            reinterpret_cast<const uint8_t*>(current.c_str()),
            current.size());

        LEAPVM_LOG_DEBUG("[inspector] Calling dispatchProtocolMessage...");
        const bool is_debugger_enable = IsDebuggerEnableMessage(current);
        // DevTools object expansion (Runtime.getProperties / evaluate helpers)
        // may touch hooked paths. These accesses are inspector-driven and must
        // not re-enter hook logging.
        struct SuppressHookLoggingGuard {
            bool previous;
            explicit SuppressHookLoggingGuard(bool prev) : previous(prev) {}
            ~SuppressHookLoggingGuard() { leapvm::g_suppress_hook_logging = previous; }
        };
        const bool prev_suppress = leapvm::g_suppress_hook_logging;
        leapvm::g_suppress_hook_logging = true;
        SuppressHookLoggingGuard suppress_guard(prev_suppress);
        session_->dispatchProtocolMessage(message_view);
        if (is_debugger_enable) {
            debugger_enable_processed_.store(true, std::memory_order_release);
        }
        LEAPVM_LOG_DEBUG("[inspector] Message dispatched successfully");
    }

    dispatching_message_ = false;
}

void LeapInspectorClient::SendToFrontend(const std::string& message) {
    const size_t kPreviewChars = 600;
    const std::string preview = message.substr(0, kPreviewChars);
    LEAPVM_LOG_DEBUG("[inspector] SendToFrontend: %s%s",
                     preview.c_str(),
                     message.size() > kPreviewChars ? "..." : "");

    if (ws_server_) {
        ws_server_->BroadcastToTarget(message);
    }
}

bool LeapInspectorClient::AttachToWebSocket(int port, const std::string& target_id) {
    LEAPVM_LOG_INFO("[inspector] Attaching to WebSocket (port=%d, target=%s)", port, target_id.c_str());
    shutting_down_.store(false, std::memory_order_release);
    debugger_enable_seen_.store(false, std::memory_order_release);
    debugger_enable_processed_.store(false, std::memory_order_release);

    auto self = this;
    ws_server_ = WsInspectorServer::Create(
        port,
        target_id,
        [self](const std::string& msg) {
            if (self->shutting_down_.load(std::memory_order_acquire)) {
                return;
            }
            if (IsDebuggerEnableMessage(msg)) {
                self->debugger_enable_seen_.store(true, std::memory_order_release);
            }
            // WebSocket 收到消息后，投递任务到 VM 线程处理
            self->post_vm_task_(
                [self, msg](v8::Isolate* isolate, v8::Local<v8::Context> context) {
                    if (self->shutting_down_.load(std::memory_order_acquire)) {
                        return;
                    }
                    LEAPVM_LOG_DEBUG("[inspector] Processing Inspector message in VM task");

                    try {
                        self->DispatchInspectorMessage(msg);
                        LEAPVM_LOG_DEBUG("[inspector] Inspector message processed successfully");
                    } catch (const std::exception& e) {
                        LEAPVM_LOG_ERROR("[inspector] C++ Exception: %s", e.what());
                    } catch (...) {
                        LEAPVM_LOG_ERROR("[inspector] Unknown exception");
                    }
                });
        },
        [self](bool connected, uint64_t generation) {
            self->HandleFrontendStateChange(connected, generation);
        });

    std::string start_error;
    if (!ws_server_->Start(&start_error)) {
        LEAPVM_LOG_ERROR("[inspector] Failed to start WebSocket server: %s", start_error.c_str());
        ws_server_.reset();
        return false;
    }

    bound_port_ = ws_server_->port();
    target_id_ = ws_server_->target_id();
    LEAPVM_LOG_INFO("[inspector] WebSocket attached successfully (port=%d)", bound_port_);
    return true;
}

std::string LeapInspectorClient::WrapValueToRemoteObjectJson(
    v8::Local<v8::Context> context,
    v8::Local<v8::Value> value,
    bool generate_preview) {
    if (shutting_down_.load(std::memory_order_acquire)) return std::string();
    if (!session_) return std::string();
    if (context.IsEmpty() || value.IsEmpty()) return std::string();

    v8_inspector::StringView object_group(
        reinterpret_cast<const uint8_t*>(kHookObjectGroup),
        sizeof(kHookObjectGroup) - 1);

    std::unique_ptr<v8_inspector::protocol::Runtime::API::RemoteObject> remote =
        session_->wrapObject(context, value, object_group, generate_preview);
    if (!remote) return std::string();

    std::vector<uint8_t> cbor;
    remote->AppendSerialized(&cbor);
    if (cbor.empty()) return std::string();

    std::string json;
    const v8_crdtp::Status status = v8_crdtp::json::ConvertCBORToJSON(
        v8_crdtp::span<uint8_t>(cbor.data(), cbor.size()), &json);
    if (!status.ok()) {
        LEAPVM_LOG_DEBUG("[inspector] ConvertCBORToJSON failed: %s",
                         status.ToASCIIString().c_str());
        return std::string();
    }
    return json;
}

void LeapInspectorClient::Shutdown(v8::Local<v8::Context> context) {
    if (shutting_down_.exchange(true, std::memory_order_acq_rel)) {
        return;
    }

    paused_.store(false, std::memory_order_release);

    if (ws_server_) {
        ws_server_->Stop();
        ws_server_.reset();
    }

    pending_protocol_messages_.clear();
    debugger_enable_seen_.store(false, std::memory_order_release);
    debugger_enable_processed_.store(false, std::memory_order_release);

    if (session_) {
        session_->stop();
        v8_inspector::StringView object_group(
            reinterpret_cast<const uint8_t*>(kHookObjectGroup),
            sizeof(kHookObjectGroup) - 1);
        session_->releaseObjectGroup(object_group);
        session_.reset();
    }

    if (inspector_ && !context.IsEmpty()) {
        inspector_->resetContextGroup(1);
        inspector_->contextDestroyed(context);
    }
    inspector_.reset();

    if (isolate_) {
        while (V8Platform::Instance().DrainMessageLoop(
                   isolate_,
                   v8::platform::MessageLoopBehavior::kDoNotWait) > 0) {
            // Drain pending inspector/platform tasks before isolate teardown.
        }
        isolate_->PerformMicrotaskCheckpoint();
        while (V8Platform::Instance().DrainMessageLoop(
                   isolate_,
                   v8::platform::MessageLoopBehavior::kDoNotWait) > 0) {
            // Final drain after microtasks.
        }
        isolate_->LowMemoryNotification();
        while (V8Platform::Instance().DrainMessageLoop(
                   isolate_,
                   v8::platform::MessageLoopBehavior::kDoNotWait) > 0) {
            // Drain follow-up GC tasks.
        }
    }

    {
        std::lock_guard<std::mutex> lock(script_index_mutex_);
        script_id_by_url_.clear();
    }
    bound_port_ = 0;
    target_id_.clear();
}

bool LeapInspectorClient::TryWrapValueToRemoteObjectJson(
    v8::Local<v8::Context> context,
    v8::Local<v8::Value> value,
    bool generate_preview,
    std::string* out_json) {
    if (!out_json) return false;
    *out_json = WrapValueToRemoteObjectJson(context, value, generate_preview);
    return !out_json->empty();
}

void LeapInspectorClient::ObserveProtocolNotification(const std::string& message) {
    if (!IsDebuggerScriptParsedNotification(message)) {
        return;
    }

    std::string script_id;
    std::string url;
    if (!ExtractJsonStringField(message, "scriptId", &script_id)) {
        return;
    }
    if (!ExtractJsonStringField(message, "url", &url)) {
        return;
    }
    if (url.empty()) {
        return;
    }

    {
        std::lock_guard<std::mutex> lock(script_index_mutex_);
        script_id_by_url_[url] = script_id;
        const std::string base = BasenameLike(url);
        if (!base.empty() && base != url) {
            // 辅助匹配：栈里有时只有 basename。
            script_id_by_url_[base] = script_id;
        }
    }
    LEAPVM_LOG_DEBUG("[inspector] indexed scriptParsed url=%s scriptId=%s",
                     url.c_str(), script_id.c_str());
}

std::string LeapInspectorClient::ResolveScriptIdForUrl(const std::string& url) const {
    if (url.empty()) return std::string();

    std::lock_guard<std::mutex> lock(script_index_mutex_);
    auto it = script_id_by_url_.find(url);
    if (it != script_id_by_url_.end()) {
        return it->second;
    }

    const std::string base = BasenameLike(url);
    it = script_id_by_url_.find(base);
    if (it != script_id_by_url_.end()) {
        return it->second;
    }

    // 最后兜底：suffix 匹配（避免 URL 形式不一致）
    for (const auto& kv : script_id_by_url_) {
        const std::string& known = kv.first;
        if (known.size() <= url.size() &&
            url.compare(url.size() - known.size(), known.size(), known) == 0) {
            return kv.second;
        }
    }
    return std::string();
}

void LeapInspectorClient::runMessageLoopOnPause(int contextGroupId) {
    LEAPVM_LOG_INFO("[inspector] runMessageLoopOnPause (contextGroupId=%d)", contextGroupId);

    paused_ = true;

    // 嵌套消息循环：参考 Node.js 的实现模式
    // 关键：等待并处理 VmInstance 任务队列中的任务
    while (paused_) {
        // 关键修复：先泵送平台消息队列
        // evaluateOnCallFrame 等操作依赖于平台任务的执行
        while (V8Platform::Instance().DrainMessageLoop(
                   isolate_,
                   v8::platform::MessageLoopBehavior::kDoNotWait) > 0) {
            // 循环执行所有待处理的平台消息
        }

        // 等待并处理一个任务（带超时）
        // 这会阻塞等待新任务到达，类似 Node.js 的 WaitForFrontendEvent()
        owner_->WaitForAndProcessOneTask(std::chrono::milliseconds(100));

        // 执行微任务检查点以确保 Inspector 响应被发送
        isolate_->PerformMicrotaskCheckpoint();
    }

    LEAPVM_LOG_INFO("[inspector] runMessageLoopOnPause exited");
}

void LeapInspectorClient::quitMessageLoopOnPause() {
    LEAPVM_LOG_INFO("[inspector] quitMessageLoopOnPause");

    paused_ = false;
}

void LeapInspectorClient::runIfWaitingForDebugger(int contextGroupId) {
    LEAPVM_LOG_DEBUG("[inspector] runIfWaitingForDebugger (contextGroupId=%d)", contextGroupId);
    // 默认实现：不等待调试器
}

std::string LeapInspectorClient::ToString(const v8_inspector::StringView& view) {
    if (view.is8Bit()) {
        return std::string(reinterpret_cast<const char*>(view.characters8()), view.length());
    } else {
        // 16-bit 字符需要转换为 UTF-8
        // 简化实现：假设都是 ASCII
        std::string result;
        result.reserve(view.length());
        for (size_t i = 0; i < view.length(); ++i) {
            result.push_back(static_cast<char>(view.characters16()[i]));
        }
        return result;
    }
}

void LeapInspectorClient::WaitForConnection() {
    LEAPVM_LOG_INFO("[inspector] Waiting for DevTools to connect...");

    if (!ws_server_) {
        LEAPVM_LOG_ERROR("[inspector] Error: WebSocket server not initialized");
        return;
    }

    // 等待至少一个连接
    ws_server_->WaitForConnection();

    const int wait_ms = ResolveInspectorReadyWaitMs();
    LEAPVM_LOG_INFO("[inspector] DevTools connected! Waiting for debugger initialization (up to %dms)...",
                    wait_ms);

    // 优先等待 Debugger.enable 被 VM 线程实际处理；仅在超时时兜底继续执行。
    // 这样可以保留 --inspect-brk 可靠性，同时减少固定 500ms 体感停顿。
    if (wait_ms > 0 &&
        !debugger_enable_processed_.load(std::memory_order_acquire)) {
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(wait_ms);
        while (std::chrono::steady_clock::now() < deadline) {
            if (debugger_enable_processed_.load(std::memory_order_acquire)) {
                break;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }

    if (!debugger_enable_processed_.load(std::memory_order_acquire)) {
        if (debugger_enable_seen_.load(std::memory_order_acquire)) {
            LEAPVM_LOG_WARN("[inspector] Debugger.enable observed but not confirmed in time; continuing.");
        } else {
            LEAPVM_LOG_WARN("[inspector] Debugger.enable not observed in wait window; continuing.");
        }
    }

    LEAPVM_LOG_INFO("[inspector] Debugger ready to execute.");
}

}  // namespace leapvm
