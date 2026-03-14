#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace leapvm {

struct MonitorConfig {
    bool enabled = false;  // 默认关闭
};

class MonitorConfigHolder {
public:
    MonitorConfigHolder() = default;

    inline MonitorConfig& config() { return config_; }
    inline const MonitorConfig& config() const { return config_; }

private:
    MonitorConfig config_;
};

enum class MonitorOp : uint8_t {
    kGet = 0,
    kSet = 1,
    kCall = 2,
};

struct HookRule {
    std::string root;
    std::string path;
    bool log_get = false;
    bool log_set = false;
    bool log_call = false;
};

class HookRegistry {
public:
    void SetRules(std::vector<HookRule> rules);

    const HookRule* Match(const std::string& root,
                          const std::string& path) const;

    // 无规则 = 全覆盖模式（由调用方决定是否记录）
    bool IsEmpty() const;

private:
    std::vector<HookRule> rules_;
};

struct HookContext {
    MonitorOp op;
    std::string root;
    std::string path;
};

class MonitorEngine {
public:
    MonitorEngine(MonitorConfigHolder* config_holder,
                  HookRegistry* registry);

    bool ShouldLog(const HookContext& ctx,
                   const HookRule** matched_rule = nullptr) const;

    void OnHook(const HookContext& ctx) const;

private:
    MonitorConfigHolder* config_holder_;
    HookRegistry* registry_;
};

}  // namespace leapvm
