#include "ws_inspector_server.h"
#include <App.h>  // uWebSockets
#include <libusockets.h>
#include <sstream>
#include "log.h"

namespace leapvm {

using UwsApp = uWS::TemplatedApp<false>;
using UwsWebSocket = uWS::WebSocket<false, true, void>;

WsInspectorServer::WsInspectorServer(
    int port,
    const std::string& target_id,
    OnMessageCallback on_message)
    : port_(port)
    , target_id_(target_id)
    , on_message_(std::move(on_message))
    , app_(nullptr) {
}

WsInspectorServer::~WsInspectorServer() {
    Stop();
}

std::shared_ptr<WsInspectorServer> WsInspectorServer::Create(
    int port,
    const std::string& target_id,
    OnMessageCallback on_message) {
    return std::shared_ptr<WsInspectorServer>(
        new WsInspectorServer(port, target_id, std::move(on_message)));
}

bool WsInspectorServer::Start(std::string* error_out) {
    if (running_.load(std::memory_order_acquire)) {
        return true;
    }

    {
        std::lock_guard<std::mutex> lock(start_mu_);
        start_reported_ = false;
        start_success_ = false;
        start_error_.clear();
        bound_port_ = 0;
        listen_socket_ = nullptr;
    }

    running_.store(true, std::memory_order_release);
    io_thread_ = std::thread([this]() { RunEventLoop(); });

    std::unique_lock<std::mutex> lock(start_mu_);
    start_cv_.wait(lock, [this]() { return start_reported_; });

    if (!start_success_) {
        running_.store(false, std::memory_order_release);
        if (error_out) {
            *error_out = start_error_;
        }
        lock.unlock();

        if (io_thread_.joinable()) {
            io_thread_.join();
        }
        if (app_) {
            delete static_cast<UwsApp*>(app_);
            app_ = nullptr;
        }

        LEAPVM_LOG_ERROR("[ws] Failed to start: %s", start_error_.c_str());
        return false;
    }

    // 不启用自定义 heartbeat 线程，使用 uWS 自带机制。
    // Inspector 仅用于调试，关闭空闲超时（idleTimeout=0）避免长时间断点时断连。
    // 注意：idleTimeout=0 时需同时关闭自动 ping，避免 uWS 内部 timeout 分量计算下溢。

    return true;
}

void WsInspectorServer::Stop() {
    if (!running_.exchange(false, std::memory_order_acq_rel)) {
        return;
    }

    if (app_) {
        auto* app = static_cast<UwsApp*>(app_);
        app->getLoop()->defer([this, app]() {
            app->close();
            listen_socket_ = nullptr;
            std::lock_guard<std::mutex> lock(ws_mu_);
            connections_.clear();
            ws_cv_.notify_all();
        });
    }

    if (io_thread_.joinable()) {
        io_thread_.join();
    }

    if (app_) {
        delete static_cast<UwsApp*>(app_);
        app_ = nullptr;
    }

}

void WsInspectorServer::RunEventLoop() {
    auto report_start_failure = [this](const std::string& error) {
        {
            std::lock_guard<std::mutex> lock(start_mu_);
            if (!start_reported_) {
                start_reported_ = true;
                start_success_ = false;
                start_error_ = error;
            }
        }
        start_cv_.notify_all();
        running_.store(false, std::memory_order_release);
    };

    try {
        auto* app = new UwsApp();
        app_ = static_cast<void*>(app);

        app->get("/json/list", [this](auto* res, auto* req) {
            std::ostringstream json;
            json << "[{"
                 << "\"id\":\"" << target_id_ << "\"," 
                 << "\"type\":\"node\"," 
                 << "\"title\":\"LeapVM\"," 
                 << "\"description\":\"LeapVM Inspector\"," 
                 << "\"webSocketDebuggerUrl\":\"ws://127.0.0.1:" << bound_port_
                 << "/" << target_id_ << "\"," 
                 << "\"devtoolsFrontendUrl\":\"devtools://devtools/bundled/inspector.html"
                 << "?ws=127.0.0.1:" << bound_port_ << "/" << target_id_ << "\""
                 << "}]";

            res->writeHeader("Content-Type", "application/json");
            res->writeHeader("Access-Control-Allow-Origin", "*");
            res->end(json.str());
        });

        app->get("/json/version", [this](auto* res, auto* req) {
            std::ostringstream json;
            json << "{"
                 << "\"Browser\":\"LeapVM/1.0\"," 
                 << "\"Protocol-Version\":\"1.3\""
                 << "}";

            res->writeHeader("Content-Type", "application/json");
            res->writeHeader("Access-Control-Allow-Origin", "*");
            res->end(json.str());
        });

        app->get("/json", [this](auto* res, auto* req) {
            std::ostringstream json;
            json << "[{"
                 << "\"id\":\"" << target_id_ << "\"," 
                 << "\"type\":\"node\"," 
                 << "\"title\":\"LeapVM\"," 
                 << "\"description\":\"LeapVM Inspector\"," 
                 << "\"webSocketDebuggerUrl\":\"ws://127.0.0.1:" << bound_port_
                 << "/" << target_id_ << "\"," 
                 << "\"devtoolsFrontendUrl\":\"devtools://devtools/bundled/inspector.html"
                 << "?ws=127.0.0.1:" << bound_port_ << "/" << target_id_ << "\""
                 << "}]";

            res->writeHeader("Content-Type", "application/json");
            res->writeHeader("Access-Control-Allow-Origin", "*");
            res->end(json.str());
        });

        std::string ws_path = "/" + target_id_;

        struct PerSocketData {};

        auto install_ws_route = [this, app](const std::string& route_path) {
            app->template ws<PerSocketData>(route_path, {
            .compression = uWS::DISABLED,
            .maxPayloadLength = 16 * 1024 * 1024,
            .idleTimeout = 0,
            .maxBackpressure = 1 * 1024 * 1024,
            .closeOnBackpressureLimit = false,
            .resetIdleTimeoutOnSend = true,
            .sendPingsAutomatically = false,

            .upgrade = nullptr,

            .open = [this](auto* ws) {
                {
                    std::lock_guard<std::mutex> lock(ws_mu_);
                    connections_.insert(reinterpret_cast<UwsWebSocket*>(ws));
                }
                ws_cv_.notify_all();
            },

            .message = [this](auto* ws, std::string_view message, uWS::OpCode opCode) {
                (void)ws;
                (void)opCode;
                std::string msg(message);

                if (on_message_) {
                    on_message_(msg);
                }
            },

            .drain = [](auto* ws) { (void)ws; },
            .ping = [](auto* ws, std::string_view) { (void)ws; },
            .pong = [](auto* ws, std::string_view) { (void)ws; },

            .close = [this](auto* ws, int code, std::string_view message) {
                (void)code;
                (void)message;
                {
                    std::lock_guard<std::mutex> lock(ws_mu_);
                    connections_.erase(reinterpret_cast<UwsWebSocket*>(ws));
                }
                ws_cv_.notify_all();
            }
            });
        };

        install_ws_route(ws_path);

        bool listen_callback_called = false;
        app->listen(port_, [this, &listen_callback_called](auto* listen_socket) {
            listen_callback_called = true;

            std::lock_guard<std::mutex> lock(start_mu_);
            start_reported_ = true;

            if (listen_socket) {
                listen_socket_ = listen_socket;
                int actual_port = us_socket_local_port(
                    0,
                    reinterpret_cast<us_socket_t*>(listen_socket));
                bound_port_ = actual_port > 0 ? actual_port : port_;
                start_success_ = true;
            } else {
                start_success_ = false;
                start_error_ = "Failed to bind Inspector WebSocket port";
                running_.store(false, std::memory_order_release);
            }

            start_cv_.notify_all();
        });

        if (!listen_callback_called) {
            report_start_failure("listen callback was not invoked");
            return;
        }

        {
            std::lock_guard<std::mutex> lock(start_mu_);
            if (!start_success_) {
                return;
            }
        }

        app->run();
    } catch (const std::exception& e) {
        report_start_failure(std::string("WS event loop exception: ") + e.what());
    } catch (...) {
        report_start_failure("Unknown WS event loop exception");
    }

    running_.store(false, std::memory_order_release);
    ws_cv_.notify_all();
}

void WsInspectorServer::BroadcastToTarget(const std::string& message) {
    if (!app_ || !running_.load(std::memory_order_acquire)) {
        return;
    }

    auto* app = static_cast<UwsApp*>(app_);
    app->getLoop()->defer([this, message]() {
        std::vector<UwsWebSocket*> sockets;
        {
            std::lock_guard<std::mutex> lock(ws_mu_);
            if (connections_.empty()) {
                return;
            }
            sockets.reserve(connections_.size());
            for (auto* ws : connections_) {
                sockets.push_back(ws);
            }
        }

        if (sockets.empty()) {
            return;
        }

        for (auto* ws : sockets) {
            ws->send(message, uWS::OpCode::TEXT);
        }
    });
}

void WsInspectorServer::WaitForConnection() {
    std::unique_lock<std::mutex> lock(ws_mu_);

    if (!connections_.empty()) {
        return;
    }

    ws_cv_.wait(lock, [this]() {
        return !connections_.empty() || !running_.load(std::memory_order_acquire);
    });
}

}  // namespace leapvm
