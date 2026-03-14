// LeapVM Standalone Server — Entry Point
// 独立 C++ 可执行服务入口，不依赖 Node.js

#include "v8_platform.h"
#include "vm_instance.h"
#include "log.h"
#include "worker_pool.h"
#include "ipc_server.h"
#include "config_loader.h"

#include <json.hpp>

#include <cstdlib>
#include <cstring>
#include <iostream>
#include <string>
#include <csignal>
#include <atomic>

namespace {

std::atomic<bool> g_shutdown_requested{false};

void SignalHandler(int sig) {
    g_shutdown_requested.store(true, std::memory_order_release);
}

struct ServerOptions {
    int workers = 4;
    int port = 9800;
    std::string bundle_path;
    std::string site_profile_path;
    std::string target_script_path;
    std::string target_version;
    int max_tasks_per_worker = 200;
    bool enable_inspector = false;
    int inspector_port = 9229;
};

void PrintUsage(const char* argv0) {
    std::fprintf(stderr,
        "Usage: %s [options]\n"
        "Options:\n"
        "  --workers N              Number of worker threads (default: 4)\n"
        "  --port PORT              TCP listen port (default: 9800)\n"
        "  --bundle PATH            Bundle JS file path\n"
        "  --site-profile PATH      Site profile JSON path (extract snapshots for pre-loading)\n"
        "  --target-script PATH     Pre-load target script (skip per-task IPC)\n"
        "  --target-version VER     Target version identifier (for cache invalidation)\n"
        "  --max-tasks-per-worker N Recycle threshold (default: 200)\n"
        "  --inspector              Enable V8 Inspector\n"
        "  --inspector-port PORT    Inspector port (default: 9229)\n"
        "  --help                   Show this help\n",
        argv0);
}

bool ParseArgs(int argc, char* argv[], ServerOptions& opts) {
    for (int i = 1; i < argc; ++i) {
        const char* arg = argv[i];
        auto next_arg = [&]() -> const char* {
            if (i + 1 < argc) return argv[++i];
            std::fprintf(stderr, "Missing value for %s\n", arg);
            return nullptr;
        };

        if (std::strcmp(arg, "--workers") == 0) {
            const char* v = next_arg();
            if (!v) return false;
            opts.workers = std::atoi(v);
        } else if (std::strcmp(arg, "--port") == 0) {
            const char* v = next_arg();
            if (!v) return false;
            opts.port = std::atoi(v);
        } else if (std::strcmp(arg, "--bundle") == 0) {
            const char* v = next_arg();
            if (!v) return false;
            opts.bundle_path = v;
        } else if (std::strcmp(arg, "--site-profile") == 0) {
            const char* v = next_arg();
            if (!v) return false;
            opts.site_profile_path = v;
        } else if (std::strcmp(arg, "--target-script") == 0) {
            const char* v = next_arg();
            if (!v) return false;
            opts.target_script_path = v;
        } else if (std::strcmp(arg, "--max-tasks-per-worker") == 0) {
            const char* v = next_arg();
            if (!v) return false;
            opts.max_tasks_per_worker = std::atoi(v);
        } else if (std::strcmp(arg, "--target-version") == 0) {
            const char* v = next_arg();
            if (!v) return false;
            opts.target_version = v;
        } else if (std::strcmp(arg, "--inspector") == 0) {
            opts.enable_inspector = true;
        } else if (std::strcmp(arg, "--inspector-port") == 0) {
            const char* v = next_arg();
            if (!v) return false;
            opts.inspector_port = std::atoi(v);
        } else if (std::strcmp(arg, "--help") == 0 || std::strcmp(arg, "-h") == 0) {
            PrintUsage(argv[0]);
            return false;
        } else {
            std::fprintf(stderr, "Unknown option: %s\n", arg);
            PrintUsage(argv[0]);
            return false;
        }
    }
    return true;
}

}  // namespace

int main(int argc, char* argv[]) {
    // 1. 日志初始化
    leapvm::InitLoggingFromEnv();

    // 2. 解析命令行参数
    ServerOptions opts;
    if (!ParseArgs(argc, argv, opts)) {
        return 1;
    }

    // 3. 安装信号处理
    std::signal(SIGINT, SignalHandler);
    std::signal(SIGTERM, SignalHandler);

    // 4. 初始化 V8 Platform（进程级单例，只调一次）
    LEAPVM_LOG_INFO("Initializing V8 Platform...");
    leapvm::V8Platform::Instance().InitOnce(argv[0]);
    LEAPVM_LOG_INFO("V8 Platform initialized.");

    // 5. 加载 bundle
    std::string bundle_code;
    if (!opts.bundle_path.empty()) {
        if (!leapvm::service::ConfigLoader::ReadFile(opts.bundle_path, bundle_code)) {
            LEAPVM_LOG_ERROR("Failed to load bundle: %s", opts.bundle_path.c_str());
            return 1;
        }
        LEAPVM_LOG_INFO("Bundle loaded: %s (%zu bytes)", opts.bundle_path.c_str(), bundle_code.size());
    }

    // 6. 加载 site profile
    std::string site_profile_json;
    if (!opts.site_profile_path.empty()) {
        if (!leapvm::service::ConfigLoader::ReadFile(opts.site_profile_path, site_profile_json)) {
            LEAPVM_LOG_ERROR("Failed to load site profile: %s", opts.site_profile_path.c_str());
            return 1;
        }
        LEAPVM_LOG_INFO("Site profile loaded: %s (%zu bytes)", opts.site_profile_path.c_str(), site_profile_json.size());
    }

    // 6b. 预加载 target script（启动时一次性读取，任务无需 IPC 传输）
    std::string preloaded_target_script;
    if (!opts.target_script_path.empty()) {
        if (!leapvm::service::ConfigLoader::ReadFile(opts.target_script_path, preloaded_target_script)) {
            LEAPVM_LOG_ERROR("Failed to load target script: %s", opts.target_script_path.c_str());
            return 1;
        }
        LEAPVM_LOG_INFO("Target script pre-loaded: %s (%zu bytes)",
                        opts.target_script_path.c_str(), preloaded_target_script.size());
    }

    // 6c. 解析 siteProfile JSON，提取 snapshot 字段用于预加载回退
    std::string preloaded_fp, preloaded_storage, preloaded_doc, preloaded_sp;
    if (!site_profile_json.empty()) {
        try {
            auto sp = nlohmann::json::parse(site_profile_json);
            if (sp.contains("fingerprintSnapshot"))
                preloaded_fp = sp["fingerprintSnapshot"].dump();
            if (sp.contains("storageSnapshot"))
                preloaded_storage = sp["storageSnapshot"].dump();
            if (sp.contains("documentSnapshot"))
                preloaded_doc = sp["documentSnapshot"].dump();
            if (sp.contains("storagePolicy"))
                preloaded_sp = sp["storagePolicy"].dump();
            LEAPVM_LOG_INFO("Site profile snapshots extracted for pre-loading "
                            "(fp=%zu, storage=%zu, doc=%zu, sp=%zu bytes)",
                            preloaded_fp.size(), preloaded_storage.size(),
                            preloaded_doc.size(), preloaded_sp.size());
        } catch (const nlohmann::json::exception& e) {
            LEAPVM_LOG_WARN("Failed to parse siteProfile for pre-loading: %s", e.what());
        }
    }

    // 7. 创建并启动 WorkerPool
    // 注意：siteProfile JSON 不整体传入 WorkerPool。
    // 启动时已将 siteProfile 解析为各 snapshot 字段（上面 6c 步骤）。
    // WorkerPool 只持有预加载的 snapshot 作为回退默认值。
    leapvm::service::WorkerPoolConfig pool_config;
    pool_config.num_workers = opts.workers;
    pool_config.max_tasks_per_worker = opts.max_tasks_per_worker;
    pool_config.bundle_code = std::move(bundle_code);
    pool_config.enable_inspector = opts.enable_inspector;
    pool_config.inspector_base_port = opts.inspector_port;

    // 预加载字段
    pool_config.preloaded_target_script = std::move(preloaded_target_script);
    pool_config.preloaded_fingerprint_json = std::move(preloaded_fp);
    pool_config.preloaded_storage_json = std::move(preloaded_storage);
    pool_config.preloaded_document_json = std::move(preloaded_doc);
    pool_config.preloaded_storage_policy_json = std::move(preloaded_sp);

    pool_config.target_version = opts.target_version;

    leapvm::service::WorkerPool pool;
    if (!pool.Start(pool_config)) {
        LEAPVM_LOG_ERROR("Failed to start WorkerPool");
        return 1;
    }
    LEAPVM_LOG_INFO("WorkerPool started with %d workers.", opts.workers);

    // 8. 启动 IPC Server
    leapvm::service::IpcServer server(pool);
    if (!server.Start(opts.port)) {
        LEAPVM_LOG_ERROR("Failed to start IPC server on port %d", opts.port);
        pool.Stop();
        return 1;
    }
    LEAPVM_LOG_INFO("IPC server listening on port %d", opts.port);

    // 9. 启动摘要
    LEAPVM_LOG_INFO("=== Startup Summary ===");
    LEAPVM_LOG_INFO("  Workers:              %d", opts.workers);
    LEAPVM_LOG_INFO("  Max tasks/worker:     %d", opts.max_tasks_per_worker);
    LEAPVM_LOG_INFO("  Target pre-loaded:    %s",
                    pool_config.preloaded_target_script.empty() ? "no" : "yes");
    LEAPVM_LOG_INFO("  Target version:       %s",
                    opts.target_version.empty() ? "(none)" : opts.target_version.c_str());
    LEAPVM_LOG_INFO("  Snapshots pre-loaded: fp=%s storage=%s doc=%s sp=%s",
                    pool_config.preloaded_fingerprint_json.empty() ? "no" : "yes",
                    pool_config.preloaded_storage_json.empty() ? "no" : "yes",
                    pool_config.preloaded_document_json.empty() ? "no" : "yes",
                    pool_config.preloaded_storage_policy_json.empty() ? "no" : "yes");

    // 10. 主循环：等待关闭信号
    LEAPVM_LOG_INFO("leapvm-server ready. Press Ctrl+C to shutdown.");
    while (!g_shutdown_requested.load(std::memory_order_acquire)) {
        server.Poll(100);  // poll with 100ms timeout
    }

    // 11. 优雅关闭
    LEAPVM_LOG_INFO("Shutting down...");
    server.Stop();
    pool.Stop();
    LEAPVM_LOG_INFO("leapvm-server stopped.");

    return 0;
}
