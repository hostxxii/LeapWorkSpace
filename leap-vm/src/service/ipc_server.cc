// IPC Server — TCP Length-Prefixed JSON 协议
// 使用 POSIX socket API（Linux），后续可扩展 Windows Named Pipe
//
// 异步任务分发：run_signature 提交到 WorkerPool 并注册完成回调，
// Worker 线程完成后通过回调推入 completion queue 并写 eventfd 唤醒主循环，
// 主循环 drain completion queue 后立即发送响应。无轮询延迟。

#include "ipc_server.h"
#include "worker_pool.h"
#include "log.h"

#include <json.hpp>

#include <cerrno>
#include <csignal>
#include <cstring>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
using ssize_t = int;
#define CLOSE_SOCKET closesocket
#define SOCKET_ERROR_CODE WSAGetLastError()
#else
#include <arpa/inet.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <poll.h>
#include <sys/eventfd.h>
#include <sys/socket.h>
#include <unistd.h>
#define CLOSE_SOCKET ::close
#define SOCKET_ERROR_CODE errno
#endif

using json = nlohmann::json;

namespace leapvm {
namespace service {

namespace {
constexpr size_t kBufferCompactThresholdBytes = 64 * 1024;
}

IpcServer::IpcServer(WorkerPool& pool) : pool_(pool) {}

IpcServer::~IpcServer() {
    Stop();
}

void IpcServer::WriteU32LE(uint8_t* buf, uint32_t value) {
    buf[0] = static_cast<uint8_t>(value & 0xFF);
    buf[1] = static_cast<uint8_t>((value >> 8) & 0xFF);
    buf[2] = static_cast<uint8_t>((value >> 16) & 0xFF);
    buf[3] = static_cast<uint8_t>((value >> 24) & 0xFF);
}

uint32_t IpcServer::ReadU32LE(const uint8_t* buf) {
    return static_cast<uint32_t>(buf[0]) |
           (static_cast<uint32_t>(buf[1]) << 8) |
           (static_cast<uint32_t>(buf[2]) << 16) |
           (static_cast<uint32_t>(buf[3]) << 24);
}

bool IpcServer::Start(int port) {
#ifdef _WIN32
    WSADATA wsa_data;
    WSAStartup(MAKEWORD(2, 2), &wsa_data);
#endif

    listen_fd_ = ::socket(AF_INET, SOCK_STREAM, 0);
    if (listen_fd_ < 0) {
        LEAPVM_LOG_ERROR("IpcServer: socket() failed: %s", std::strerror(SOCKET_ERROR_CODE));
        return false;
    }

    // SO_REUSEADDR
    int opt = 1;
    ::setsockopt(listen_fd_, SOL_SOCKET, SO_REUSEADDR,
                 reinterpret_cast<const char*>(&opt), sizeof(opt));

    // Set non-blocking
#ifndef _WIN32
    int flags = ::fcntl(listen_fd_, F_GETFL, 0);
    ::fcntl(listen_fd_, F_SETFL, flags | O_NONBLOCK);
#endif

    struct sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);  // localhost only
    addr.sin_port = htons(static_cast<uint16_t>(port));

    if (::bind(listen_fd_, reinterpret_cast<struct sockaddr*>(&addr), sizeof(addr)) < 0) {
        LEAPVM_LOG_ERROR("IpcServer: bind() failed on port %d: %s",
                         port, std::strerror(SOCKET_ERROR_CODE));
        CLOSE_SOCKET(listen_fd_);
        listen_fd_ = -1;
        return false;
    }

    if (::listen(listen_fd_, 16) < 0) {
        LEAPVM_LOG_ERROR("IpcServer: listen() failed: %s", std::strerror(SOCKET_ERROR_CODE));
        CLOSE_SOCKET(listen_fd_);
        listen_fd_ = -1;
        return false;
    }

    // Create eventfd for worker→main notification (Linux only)
#ifndef _WIN32
    notify_fd_ = ::eventfd(0, EFD_NONBLOCK | EFD_CLOEXEC);
    if (notify_fd_ < 0) {
        LEAPVM_LOG_WARN("IpcServer: eventfd() failed: %s (falling back to poll timeout)",
                        std::strerror(errno));
    }
#endif

    port_ = port;
    running_.store(true, std::memory_order_release);
    return true;
}

void IpcServer::Stop() {
    if (!running_.exchange(false, std::memory_order_acq_rel)) {
        return;
    }

    // Close all client connections
    {
        std::lock_guard<std::mutex> lock(clients_mu_);
        for (auto& [fd, client] : clients_) {
            CLOSE_SOCKET(fd);
        }
        clients_.clear();
    }

    // Discard any pending completions
    {
        std::lock_guard<std::mutex> lock(completion_mu_);
        completed_tasks_.clear();
    }

    if (listen_fd_ >= 0) {
        CLOSE_SOCKET(listen_fd_);
        listen_fd_ = -1;
    }

    if (notify_fd_ >= 0) {
        CLOSE_SOCKET(notify_fd_);
        notify_fd_ = -1;
    }
}

void IpcServer::Poll(int timeout_ms) {
    if (!running_.load(std::memory_order_acquire) || listen_fd_ < 0) {
        return;
    }

    // Drain any completions from previous cycle
    DrainCompletedTasks();

#ifndef _WIN32
    // Build pollfd array: listen socket + notify_fd + all clients
    std::vector<struct pollfd> fds;
    std::vector<int> client_fds;

    fds.push_back({listen_fd_, POLLIN, 0});

    // notify_fd slot — eventfd wakes us when workers complete tasks
    int notify_slot = -1;
    if (notify_fd_ >= 0) {
        notify_slot = static_cast<int>(fds.size());
        fds.push_back({notify_fd_, POLLIN, 0});
    }

    {
        std::lock_guard<std::mutex> lock(clients_mu_);
        for (auto& [fd, client] : clients_) {
            short events = POLLIN;
            if (!client->send_buffer.empty()) {
                events |= POLLOUT;
            }
            fds.push_back({fd, events, 0});
            client_fds.push_back(fd);
        }
    }

    int ret = ::poll(fds.data(), fds.size(), timeout_ms);
    if (ret <= 0) return;

    // Check listen socket
    if (fds[0].revents & POLLIN) {
        AcceptConnections();
    }

    // Check notify_fd — drain eventfd counter and process completions
    if (notify_slot >= 0 && (fds[notify_slot].revents & POLLIN)) {
        uint64_t val;
        (void)::read(notify_fd_, &val, sizeof(val));
        DrainCompletedTasks();
    }

    // Check client sockets (starts after listen + notify slots)
    int client_start = (notify_slot >= 0) ? 2 : 1;
    for (size_t i = static_cast<size_t>(client_start); i < fds.size(); ++i) {
        if (fds[i].revents == 0) continue;

        int fd = client_fds[i - client_start];
        std::lock_guard<std::mutex> lock(clients_mu_);
        auto it = clients_.find(fd);
        if (it == clients_.end()) continue;

        if (fds[i].revents & (POLLERR | POLLHUP)) {
            LEAPVM_LOG_INFO("IpcServer: client %d disconnected", fd);
            CLOSE_SOCKET(fd);
            clients_.erase(it);
            continue;
        }

        if (fds[i].revents & POLLIN) {
            // Read data
            uint8_t buf[8192];
            ssize_t n = ::recv(fd, buf, sizeof(buf), 0);
            if (n <= 0) {
                LEAPVM_LOG_INFO("IpcServer: client %d closed connection", fd);
                CLOSE_SOCKET(fd);
                clients_.erase(it);
                continue;
            }
            it->second->recv_buffer.insert(
                it->second->recv_buffer.end(), buf, buf + n);

            // Try to process complete messages
            ProcessClient(*it->second);
        }

        if (fds[i].revents & POLLOUT) {
            auto& send_buf = it->second->send_buffer;
            if (it->second->send_offset < send_buf.size()) {
                ssize_t n = ::send(fd,
                                   send_buf.data() + it->second->send_offset,
                                   send_buf.size() - it->second->send_offset,
                                   0);
                if (n > 0) {
                    it->second->send_offset += static_cast<size_t>(n);
                    CompactSendBuffer(*it->second);
                }
            }
        }
    }
#else
    // Windows: simple select-based polling
    // TODO: implement Windows version
    (void)timeout_ms;
#endif
}

void IpcServer::AcceptConnections() {
    while (true) {
        struct sockaddr_in client_addr{};
        socklen_t addr_len = sizeof(client_addr);
        int client_fd = ::accept(listen_fd_,
                                  reinterpret_cast<struct sockaddr*>(&client_addr),
                                  &addr_len);
        if (client_fd < 0) {
            break;  // No more pending connections
        }

        // Set non-blocking
#ifndef _WIN32
        int flags = ::fcntl(client_fd, F_GETFL, 0);
        ::fcntl(client_fd, F_SETFL, flags | O_NONBLOCK);
#endif

        auto conn = std::make_unique<ClientConnection>();
        conn->fd = client_fd;

        LEAPVM_LOG_INFO("IpcServer: new client connected (fd=%d)", client_fd);

        std::lock_guard<std::mutex> lock(clients_mu_);
        clients_[client_fd] = std::move(conn);
    }
}

void IpcServer::ProcessClient(ClientConnection& client) {
    // Length-Prefixed JSON: [4 bytes uint32 LE][payload]
    while (client.recv_buffer.size() - client.recv_offset >= 4) {
        uint32_t payload_len = ReadU32LE(client.recv_buffer.data() + client.recv_offset);

        // Sanity check
        if (payload_len > 10 * 1024 * 1024) {  // 10MB max
            LEAPVM_LOG_ERROR("IpcServer: payload too large (%u bytes), closing connection",
                             payload_len);
            CLOSE_SOCKET(client.fd);
            return;
        }

        const size_t total_message_size = 4 + static_cast<size_t>(payload_len);
        if (client.recv_buffer.size() - client.recv_offset < total_message_size) {
            break;  // Incomplete message, wait for more data
        }

        std::string message(
            reinterpret_cast<const char*>(client.recv_buffer.data() + client.recv_offset + 4),
            payload_len);

        client.recv_offset += total_message_size;
        CompactReceiveBuffer(client);

        HandleMessage(client, message);
    }
}

void IpcServer::HandleMessage(ClientConnection& client, const std::string& message) {
    json response;

    try {
        json request = json::parse(message);
        std::string type = request.value("type", "");
        std::string id = request.value("id", "");

        if (type == "run_signature") {
            // Extract task fields — 对齐 runner.js executeSignatureTask 的任务形状
            json payload = request.value("payload", json::object());

            if (payload.contains("targetScript") &&
                payload["targetScript"].is_string() &&
                !payload["targetScript"].get<std::string>().empty()) {
                response["type"] = "error";
                response["id"] = id;
                response["error"] =
                    "standalone only supports preloaded target scripts; "
                    "set --target-script at server startup";
                SendResponse(client, response.dump());
                return;
            }

            TaskRequest task;
            task.id = id;
            task.before_script = payload.value("beforeRunScript", "");
            task.resource_name = payload.value("resourceName", "");

            // Snapshot 字段：直接 dump 成 JSON 字符串注入到脚本里
            // 空字符串 → 回退到启动时预加载的默认值（由 WorkerPool 处理）
            task.fingerprint_json = payload.contains("fingerprintSnapshot")
                ? payload["fingerprintSnapshot"].dump() : "";
            task.storage_json = payload.contains("storageSnapshot")
                ? payload["storageSnapshot"].dump() : "";
            task.document_json = payload.contains("documentSnapshot")
                ? payload["documentSnapshot"].dump() : "";
            task.storage_policy_json = payload.contains("storagePolicy")
                ? payload["storagePolicy"].dump() : "";

            // 如果客户端发送了 siteProfile 对象但没有单独的 snapshot 字段，
            // 则从 siteProfile 中提取各 snapshot（兼容旧客户端）。
            // 注意：当前不支持服务端 deep-merge siteProfile 模板，
            // 仅做字段级提取。
            if (payload.contains("siteProfile") && payload["siteProfile"].is_object()) {
                const auto& sp = payload["siteProfile"];
                if (task.fingerprint_json.empty() && sp.contains("fingerprintSnapshot"))
                    task.fingerprint_json = sp["fingerprintSnapshot"].dump();
                if (task.storage_json.empty() && sp.contains("storageSnapshot"))
                    task.storage_json = sp["storageSnapshot"].dump();
                if (task.document_json.empty() && sp.contains("documentSnapshot"))
                    task.document_json = sp["documentSnapshot"].dump();
                if (task.storage_policy_json.empty() && sp.contains("storagePolicy"))
                    task.storage_policy_json = sp["storagePolicy"].dump();
            }

            // 异步提交：worker 完成后通过回调推入 completion queue，
            // eventfd 唤醒主循环 → DrainCompletedTasks() 发送响应
            int client_fd = client.fd;
            pool_.SubmitTask(std::move(task),
                [this, client_fd, req_id = std::move(id)](TaskResult result) {
                    {
                        std::lock_guard<std::mutex> lock(completion_mu_);
                        completed_tasks_.push_back({client_fd, std::move(req_id), std::move(result)});
                    }
                    if (notify_fd_ >= 0) {
                        uint64_t val = 1;
                        (void)::write(notify_fd_, &val, sizeof(val));
                    }
                });
            return;  // 不发响应，等 worker 完成后由 DrainCompletedTasks 发送

        } else if (type == "get_stats") {
            auto stats = pool_.GetStats();
            response["type"] = "result";
            response["id"] = id;
            response["stats"] = {
                {"totalWorkers", stats.total_workers},
                {"idleWorkers", stats.idle_workers},
                {"busyWorkers", stats.busy_workers},
                {"recyclingWorkers", stats.recycling_workers},
                {"totalTasksCompleted", stats.total_tasks_completed},
                {"totalTasksFailed", stats.total_tasks_failed},
                {"pendingTasks", stats.pending_tasks},
                // target cache 统计
                {"targetCacheHits", stats.target_cache_hits},
                {"targetCacheMisses", stats.target_cache_misses},
                {"targetCacheRejected", stats.target_cache_rejected},
                // target 来源统计
                {"targetFromPreloaded", stats.target_from_preloaded},
                {"targetNone", stats.target_none}
            };

        } else if (type == "shutdown") {
            response["type"] = "result";
            response["id"] = id;
            response["result"] = "shutting_down";
            SendResponse(client, response.dump());
            // Trigger shutdown
            LEAPVM_LOG_INFO("IpcServer: shutdown requested via IPC");
            raise(SIGTERM);
            return;

        } else if (type == "recycle_all") {
            // TODO: implement recycle_all on WorkerPool
            response["type"] = "result";
            response["id"] = id;
            response["result"] = "recycle_requested";

        } else {
            response["type"] = "error";
            response["id"] = id;
            response["error"] = "unknown request type: " + type;
        }

    } catch (const json::exception& e) {
        response["type"] = "error";
        response["id"] = "";
        response["error"] = std::string("JSON parse error: ") + e.what();
    }

    SendResponse(client, response.dump());
}

void IpcServer::DrainCompletedTasks() {
    std::vector<CompletedTask> batch;
    {
        std::lock_guard<std::mutex> lock(completion_mu_);
        if (completed_tasks_.empty()) return;
        batch.swap(completed_tasks_);
    }

    for (auto& task : batch) {
        json response;
        response["id"] = task.request_id;
        response["durationMs"] = task.result.duration_ms;
        response["workerId"] = "worker-" + std::to_string(task.result.worker_id);

        switch (task.result.target_source) {
            case TaskResult::TargetSource::kPreloaded:
                response["targetSource"] = "preloaded"; break;
            default:
                response["targetSource"] = "none"; break;
        }
        response["targetCacheHit"] = task.result.target_cache_hit;

        if (task.result.success) {
            response["type"] = "result";
            response["result"] = task.result.result;
        } else {
            response["type"] = "error";
            response["error"] = task.result.error;
        }

        SendResponseToFd(task.client_fd, response.dump());
    }
}

void IpcServer::SendResponse(ClientConnection& client, const std::string& response) {
    uint8_t header[4];
    WriteU32LE(header, static_cast<uint32_t>(response.size()));

    if (client.send_offset == client.send_buffer.size()) {
        client.send_buffer.clear();
        client.send_offset = 0;
    } else if (client.send_offset >= kBufferCompactThresholdBytes) {
        CompactSendBuffer(client);
    }

    client.send_buffer.insert(client.send_buffer.end(), header, header + 4);
    client.send_buffer.insert(client.send_buffer.end(),
                              response.begin(), response.end());

    // Try to send immediately
    if (client.send_offset < client.send_buffer.size()) {
        ssize_t n = ::send(client.fd,
                           client.send_buffer.data() + client.send_offset,
                           client.send_buffer.size() - client.send_offset,
                           0);
        if (n > 0) {
            client.send_offset += static_cast<size_t>(n);
            CompactSendBuffer(client);
        }
    }
}

void IpcServer::SendResponseToFd(int fd, const std::string& response) {
    std::lock_guard<std::mutex> lock(clients_mu_);
    auto it = clients_.find(fd);
    if (it == clients_.end()) {
        // Client disconnected before result was ready — discard
        return;
    }
    SendResponse(*it->second, response);
}

void IpcServer::CompactReceiveBuffer(ClientConnection& client) {
    if (client.recv_offset == 0) {
        return;
    }
    if (client.recv_offset == client.recv_buffer.size()) {
        client.recv_buffer.clear();
        client.recv_offset = 0;
        return;
    }
    if (client.recv_offset < kBufferCompactThresholdBytes &&
        client.recv_offset * 2 < client.recv_buffer.size()) {
        return;
    }

    client.recv_buffer.erase(client.recv_buffer.begin(),
                             client.recv_buffer.begin() + client.recv_offset);
    client.recv_offset = 0;
}

void IpcServer::CompactSendBuffer(ClientConnection& client) {
    if (client.send_offset == 0) {
        return;
    }
    if (client.send_offset == client.send_buffer.size()) {
        client.send_buffer.clear();
        client.send_offset = 0;
        return;
    }
    if (client.send_offset < kBufferCompactThresholdBytes &&
        client.send_offset * 2 < client.send_buffer.size()) {
        return;
    }

    client.send_buffer.erase(client.send_buffer.begin(),
                             client.send_buffer.begin() + client.send_offset);
    client.send_offset = 0;
}

}  // namespace service
}  // namespace leapvm
