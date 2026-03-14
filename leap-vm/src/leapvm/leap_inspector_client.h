#pragma once

#include "v8_headers.h"
#include <v8-inspector.h>
#include <memory>
#include <string>
#include <atomic>
#include <functional>
#include <deque>
#include <mutex>
#include <unordered_map>

namespace leapvm {

// 前置声明
class VmInstance;
class WsInspectorServer;

// Inspector 通道实现：负责将 Inspector 消息发送到前端（DevTools）
class InspectorChannelImpl : public v8_inspector::V8Inspector::Channel {
public:
    explicit InspectorChannelImpl(class LeapInspectorClient* client);
    ~InspectorChannelImpl() override = default;

    // V8Inspector::Channel 接口
    void sendResponse(int callId, std::unique_ptr<v8_inspector::StringBuffer> message) override;
    void sendNotification(std::unique_ptr<v8_inspector::StringBuffer> message) override;
    void flushProtocolNotifications() override;

private:
    LeapInspectorClient* client_;
};

// Inspector 客户端：实现 V8InspectorClient 接口
class LeapInspectorClient : public v8_inspector::V8InspectorClient {
public:
    // PostVmTaskFn: 投递任务到 VM 线程的函数类型
    using PostVmTaskFn = std::function<void(std::function<void(v8::Isolate*, v8::Local<v8::Context>)>)>;

    LeapInspectorClient(v8::Isolate* isolate, VmInstance* owner, PostVmTaskFn post_vm_task);
    ~LeapInspectorClient() override;

    // 初始化 Inspector（在 VM 线程调用）
    void Initialize(v8::Local<v8::Context> context);

    // 处理来自 DevTools 的消息（在 VM 线程调用）
    void DispatchInspectorMessage(const std::string& message);

    // 发送消息到前端（InspectorChannelImpl 会调用此函数）
    void SendToFrontend(const std::string& message);
    // 捕获 Inspector 通知中的脚本元数据（例如 Debugger.scriptParsed）
    void ObserveProtocolNotification(const std::string& message);
    // 按 URL 查找 DevTools scriptId，供自定义 stackTrace 可点击跳转使用。
    std::string ResolveScriptIdForUrl(const std::string& url) const;
    // Wrap a V8 value as a full inspector RemoteObject JSON fragment.
    // Returns empty string when wrapping/serialization fails.
    std::string WrapValueToRemoteObjectJson(v8::Local<v8::Context> context,
                                            v8::Local<v8::Value> value,
                                            bool generate_preview = true);
    // Compatibility wrapper for existing call sites.
    bool TryWrapValueToRemoteObjectJson(v8::Local<v8::Context> context,
                                        v8::Local<v8::Value> value,
                                        bool generate_preview,
                                        std::string* out_json);

    // 连接到 WebSocket 服务器
    bool AttachToWebSocket(int port, const std::string& target_id);
    // Must be called on VM thread before isolate/context teardown.
    void Shutdown(v8::Local<v8::Context> context);

    // V8InspectorClient 接口实现
    void runMessageLoopOnPause(int contextGroupId) override;
    void quitMessageLoopOnPause() override;
    void runIfWaitingForDebugger(int contextGroupId) override;

    // 工具函数：将 StringView 转为 std::string
    static std::string ToString(const v8_inspector::StringView& view);

    // 等待 DevTools 连接（类似 Node.js 的 --inspect-brk）
    void WaitForConnection();
    int bound_port() const { return bound_port_; }
    const std::string& target_id() const { return target_id_; }
    bool is_paused() const { return paused_.load(std::memory_order_acquire); }

private:
    void CreateInspectorSession();
    void ResetFrontendState();
    void HandleFrontendStateChange(bool connected, uint64_t generation);
    void RecreateSessionForFrontend(uint64_t generation,
                                    v8::Local<v8::Context> context);

    v8::Isolate* isolate_;
    VmInstance* owner_;
    PostVmTaskFn post_vm_task_;

    // V8 Inspector 实例
    std::unique_ptr<v8_inspector::V8Inspector> inspector_;
    std::shared_ptr<v8_inspector::V8InspectorSession> session_;

    // WebSocket 服务器
    std::shared_ptr<WsInspectorServer> ws_server_;
    int bound_port_ = 0;
    std::string target_id_;

    // 暂停标志（用于嵌套消息循环）
    std::atomic<bool> paused_ = false;
    // DevTools 初始化状态：用于缩短 waitForInspectorConnection 的固定等待时长。
    std::atomic<bool> debugger_enable_seen_ = false;
    std::atomic<bool> debugger_enable_processed_ = false;
    std::atomic<bool> shutting_down_ = false;

    // 防止重入标志（参考 Node.js 的 dispatching_messages_）
    bool dispatching_message_ = false;
    std::deque<std::string> pending_protocol_messages_;
    mutable std::mutex script_index_mutex_;
    std::unordered_map<std::string, std::string> script_id_by_url_;
};

}  // namespace leapvm
