#pragma once

#include <string>
#include <functional>
#include <memory>
#include <set>
#include <mutex>
#include <atomic>
#include <condition_variable>
#include <thread>

// 前置声明（避免在头文件暴露 uWebSockets）
namespace uWS {
    template <bool SSL, bool isServer, typename UserData>
    struct WebSocket;
}
struct us_listen_socket_t;

namespace leapvm {

// WebSocket Inspector 服务器（使用 uWebSockets 实现）
class WsInspectorServer {
public:
    using OnMessageCallback = std::function<void(const std::string&)>;

    // 创建服务器实例
    static std::shared_ptr<WsInspectorServer> Create(
        int port,
        const std::string& target_id,
        OnMessageCallback on_message);

    ~WsInspectorServer();

    // 启动服务器（在独立线程）
    bool Start(std::string* error_out = nullptr);

    // 停止服务器
    void Stop();

    // 向所有客户端广播消息
    void BroadcastToTarget(const std::string& message);

    // 等待至少一个连接（阻塞，类似 Node.js --inspect-brk）
    void WaitForConnection();

    int port() const { return bound_port_; }
    std::string target_id() const { return target_id_; }

private:
    WsInspectorServer(int port, const std::string& target_id, OnMessageCallback on_message);

    void RunEventLoop();    // IO 线程主循环

    int port_;
    std::string target_id_;
    OnMessageCallback on_message_;

    // uWebSockets 应用实例（使用 void* 隐藏实现细节）
    void* app_;  // 指向 uWS::App<false>*
    us_listen_socket_t* listen_socket_ = nullptr;

    // WebSocket 连接管理（前置声明的类型）
    std::mutex ws_mu_;
    std::condition_variable ws_cv_;  // 用于通知连接事件
    std::set<uWS::WebSocket<false, true, void>*> connections_;

    // IO 线程
    std::thread io_thread_;
    std::atomic<bool> running_{false};
    int bound_port_ = 0;

    std::mutex start_mu_;
    std::condition_variable start_cv_;
    bool start_reported_ = false;
    bool start_success_ = false;
    std::string start_error_;
};

}  // namespace leapvm
