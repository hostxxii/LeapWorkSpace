#pragma once

#include <string>
#include <unordered_set>
#include <vector>
#include "monitor.h"

namespace leapvm {

struct LogDetailConfig {
    bool log_type = true;
    bool log_value = true;
    bool log_func_params = true;
    bool log_call_args = true;
    bool log_call_return = true;
};

struct BlacklistConfig {
    std::unordered_set<std::string> blocked_objects;
    std::unordered_set<std::string> blocked_properties;
    std::vector<std::string> blocked_prefixes;
};

struct WhitelistConfig {
    std::unordered_set<std::string> allowed_objects;
    std::unordered_set<std::string> allowed_properties;
    std::vector<std::string> allowed_prefixes;
};

struct GlobalHookConfig {
    BlacklistConfig blacklist;
    WhitelistConfig whitelist;
    LogDetailConfig log_detail;

    std::vector<HookRule> pending_rules;
    bool pending_monitor_enabled = false;
    bool pending_monitor_enabled_set = false;
};

struct HookEventKey {
    std::string root;
    std::string path;
    MonitorOp op = MonitorOp::kGet;
};

bool ShouldEnterHookPipeline(const GlobalHookConfig& cfg, const HookEventKey& key);

}  // namespace leapvm

