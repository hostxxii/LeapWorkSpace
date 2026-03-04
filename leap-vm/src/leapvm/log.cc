#include "log.h"

#include <algorithm>
#include <cstdarg>
#include <cstring>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

namespace leapvm {

namespace {

LogConfig g_log_config;
std::mutex g_log_mutex;

bool StartsWith(const char* s, const char* prefix) {
    if (s == nullptr || prefix == nullptr) return false;
    const size_t prefix_len = std::strlen(prefix);
    return std::strncmp(s, prefix, prefix_len) == 0;
}

bool StartsWith(const std::string& s, const char* prefix) {
    return StartsWith(s.c_str(), prefix);
}

bool IsHookDetailLine(const std::string& msg) {
    return StartsWith(msg, "  type:") ||
           StartsWith(msg, "  value:") ||
           StartsWith(msg, "  params:") ||
           StartsWith(msg, "  args:") ||
           StartsWith(msg, "  return:") ||
           StartsWith(msg, "  exception:") ||
           StartsWith(msg, "  --------------------------------------------------");
}

bool IsTruthyEnv(const char* key) {
    const char* raw = std::getenv(key);
    if (!raw || !*raw) return false;
    std::string v(raw);
    std::transform(v.begin(), v.end(), v.begin(), [](unsigned char c) {
        return static_cast<char>(::tolower(c));
    });
    return v == "1" || v == "true" || v == "yes" || v == "on";
}

bool ShouldMuteDefaultInfoNoise(LogLevel level, const std::string& msg) {
    if (msg.empty()) {
        return false;
    }

    // Hide hook noise in CLI: keep DevTools hook stream, keep non-hook runtime logs.
    if (StartsWith(msg, "[hook][") ||
        StartsWith(msg, "Error: [hook][") ||
        IsHookDetailLine(msg)) {
        if (IsTruthyEnv("LEAPVM_CLI_SHOW_HOOK_LOGS")) {
            return false;
        }
        return true;
    }

    if (level == LogLevel::kInfo) {
        // Default silence for high-volume bootstrap noise. Keep warn/error visible.
        return StartsWith(msg, "[skeleton]") ||
               StartsWith(msg, "[special]") ||
               StartsWith(msg, "[A3]");
    }
    return false;
}

const char* LevelToString(LogLevel level) {
    switch (level) {
    case LogLevel::kDebug: return "debug";
    case LogLevel::kInfo:  return "info";
    case LogLevel::kWarn:  return "warn";
    case LogLevel::kError: return "error";
    case LogLevel::kOff:   return "off";
    }
    return "?";
}

LogLevel ParseLogLevel(const std::string& value) {
    std::string v(value);
    std::transform(v.begin(), v.end(), v.begin(), [](unsigned char c) {
        return static_cast<char>(::tolower(c));
    });

    if (v == "debug") return LogLevel::kDebug;
    if (v == "info") return LogLevel::kInfo;
    if (v == "warn") return LogLevel::kWarn;
    if (v == "error") return LogLevel::kError;
    if (v == "off") return LogLevel::kOff;
    return LogLevel::kInfo;
}

}  // namespace

void SetLogConfig(const LogConfig& cfg) {
    std::lock_guard<std::mutex> lock(g_log_mutex);
    g_log_config = cfg;
}

const LogConfig& GetLogConfig() {
    return g_log_config;
}

void Log(LogLevel level, const char* fmt, ...) {
    std::lock_guard<std::mutex> lock(g_log_mutex);

    if (level < g_log_config.level || g_log_config.level == LogLevel::kOff) {
        return;
    }

    va_list args;
    va_start(args, fmt);

    va_list args_size;
    va_copy(args_size, args);
    int msg_len = std::vsnprintf(nullptr, 0, fmt, args_size);
    va_end(args_size);

    std::string msg;
    if (msg_len > 0) {
        std::vector<char> buf(static_cast<size_t>(msg_len) + 1);
        std::vsnprintf(buf.data(), buf.size(), fmt, args);
        msg.assign(buf.data(), static_cast<size_t>(msg_len));
    } else {
        msg = (fmt == nullptr) ? "" : std::string(fmt);
    }
    va_end(args);

    if (ShouldMuteDefaultInfoNoise(level, msg)) {
        return;
    }

    FILE* out = (level >= LogLevel::kWarn) ? stderr : stdout;
    if (g_log_config.with_prefix) {
        std::fprintf(out, "[leapvm][%s] ", LevelToString(level));
    }
    std::fwrite(msg.data(), 1, msg.size(), out);
    std::fprintf(out, "\n");
    std::fflush(out);
}

void InitLoggingFromEnv() {
    const char* lvl = std::getenv("LEAPVM_LOG_LEVEL");
    LogConfig cfg;
    if (lvl) {
        cfg.level = ParseLogLevel(lvl);
    }
    SetLogConfig(cfg);
}

}  // namespace leapvm
