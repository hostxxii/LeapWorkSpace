#include "monitor.h"
#include "log.h"

namespace {

inline const char* MonitorOpToString(leapvm::MonitorOp op) {
    switch (op) {
    case leapvm::MonitorOp::kGet:  return "get";
    case leapvm::MonitorOp::kSet:  return "set";
    case leapvm::MonitorOp::kCall: return "call";
    }
    return "unknown";
}

inline bool PathMatches(const std::string& rule_path, const std::string& path) {
    if (rule_path.empty() || rule_path == "*") {
        return true;
    }
    return rule_path == path;
}

}  // namespace

namespace leapvm {

void HookRegistry::SetRules(std::vector<HookRule> rules) {
    rules_ = std::move(rules);
}

bool HookRegistry::IsEmpty() const {
    return rules_.empty();
}

const HookRule* HookRegistry::Match(const std::string& root,
                                    const std::string& path) const {
    for (const auto& rule : rules_) {
        if (!rule.root.empty() && rule.root != root && rule.root != "*") {
            continue;
        }
        if (!PathMatches(rule.path, path)) {
            continue;
        }
        return &rule;
    }
    return nullptr;
}

MonitorEngine::MonitorEngine(MonitorConfigHolder* config_holder,
                             HookRegistry* registry)
    : config_holder_(config_holder), registry_(registry) {}

bool MonitorEngine::ShouldLog(const HookContext& ctx,
                              const HookRule** matched_rule) const {
    if (!config_holder_ || !registry_) {
        return false;
    }

    const auto& cfg = config_holder_->config();
    if (!cfg.enabled) {
        return false;
    }

    const HookRule* rule = registry_->Match(ctx.root, ctx.path);
    if (!rule) {
        // ★ 全覆盖模式：无任何规则时记录所有事件；
        // 有规则但未命中时跳过（精确白名单模式）。
        // 黑名单过滤由 ShouldLogWrapper 的 ShouldEnterHookPipeline 调用负责。
        return registry_->IsEmpty();
    }

    bool enabled = false;
    switch (ctx.op) {
    case MonitorOp::kGet:  enabled = rule->log_get;  break;
    case MonitorOp::kSet:  enabled = rule->log_set;  break;
    case MonitorOp::kCall: enabled = rule->log_call; break;
    }

    if (matched_rule) {
        *matched_rule = rule;
    }
    return enabled;
}

void MonitorEngine::OnHook(const HookContext& ctx) const {
    if (!ShouldLog(ctx)) {
        return;
    }

    LEAPVM_LOG_INFO("[hook][native] root=%s path=%s op=%s",
                    ctx.root.c_str(),
                    ctx.path.c_str(),
                    MonitorOpToString(ctx.op));
}

}  // namespace leapvm
