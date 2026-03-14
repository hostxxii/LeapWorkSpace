#pragma once

#include "worker_pool.h"

#include <atomic>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace leapvm {
namespace service {

// TCP-based IPC Server using Length-Prefixed JSON protocol.
// Protocol: [4 bytes uint32 LE payload_length][UTF-8 JSON payload]
//
// Request types:
//   {"type":"run_signature","id":"req-1","payload":{...}}
//   {"type":"get_stats","id":"req-2"}
//   {"type":"shutdown","id":"req-3"}
//   {"type":"recycle_all","id":"req-4"}
//
// Response:
//   {"type":"result","id":"req-1","result":"...","durationMs":17,"workerId":"worker-3"}
//   {"type":"error","id":"req-1","error":"..."}
class IpcServer {
public:
    explicit IpcServer(WorkerPool& pool);
    ~IpcServer();

    IpcServer(const IpcServer&) = delete;
    IpcServer& operator=(const IpcServer&) = delete;

    bool Start(int port);
    void Stop();

    // Poll for events (call from main loop). timeout_ms = max wait time.
    void Poll(int timeout_ms);

private:
    struct ClientConnection {
        int fd = -1;
        std::vector<uint8_t> recv_buffer;
        std::vector<uint8_t> send_buffer;
        size_t recv_offset = 0;
        size_t send_offset = 0;
    };

    // Completed task pushed by worker threads via callback
    struct CompletedTask {
        int client_fd;
        std::string request_id;
        TaskResult result;
    };

    void AcceptConnections();
    void ProcessClient(ClientConnection& client);
    void HandleMessage(ClientConnection& client, const std::string& message);
    void SendResponse(ClientConnection& client, const std::string& response);
    void SendResponseToFd(int fd, const std::string& response);
    void DrainCompletedTasks();
    void CompactReceiveBuffer(ClientConnection& client);
    void CompactSendBuffer(ClientConnection& client);

    static void WriteU32LE(uint8_t* buf, uint32_t value);
    static uint32_t ReadU32LE(const uint8_t* buf);

    WorkerPool& pool_;
    int listen_fd_ = -1;
    int port_ = 0;
    std::atomic<bool> running_{false};

    std::mutex clients_mu_;
    std::unordered_map<int, std::unique_ptr<ClientConnection>> clients_;

    // Completion queue — workers push results here via callback, main thread drains
    std::mutex completion_mu_;
    std::vector<CompletedTask> completed_tasks_;

    // eventfd for waking poll() immediately when tasks complete (Linux only)
    int notify_fd_ = -1;
};

}  // namespace service
}  // namespace leapvm
