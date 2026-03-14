#pragma once

#include <cstdarg>
#include <mutex>
#include <string>

namespace leapvm {

enum class LogLevel {
    kDebug = 0,
    kInfo = 1,
    kWarn = 2,
    kError = 3,
    kOff = 4,
};

struct LogConfig {
    LogLevel level = LogLevel::kInfo;
    bool with_prefix = true;
};

void SetLogConfig(const LogConfig& cfg);
const LogConfig& GetLogConfig();

// Core logging entry.
void Log(LogLevel level, const char* fmt, ...);

// Helper to init from env var LEAPVM_LOG_LEVEL
void InitLoggingFromEnv();

#define LEAPVM_LOG_DEBUG(fmt, ...) ::leapvm::Log(::leapvm::LogLevel::kDebug, fmt, ##__VA_ARGS__)
#define LEAPVM_LOG_INFO(fmt, ...)  ::leapvm::Log(::leapvm::LogLevel::kInfo, fmt, ##__VA_ARGS__)
#define LEAPVM_LOG_WARN(fmt, ...)  ::leapvm::Log(::leapvm::LogLevel::kWarn, fmt, ##__VA_ARGS__)
#define LEAPVM_LOG_ERROR(fmt, ...) ::leapvm::Log(::leapvm::LogLevel::kError, fmt, ##__VA_ARGS__)

}  // namespace leapvm

