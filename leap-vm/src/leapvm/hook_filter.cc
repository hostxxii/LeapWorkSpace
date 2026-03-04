#include "hook_filter.h"

#include <algorithm>

namespace leapvm {
namespace {

std::string ComposeObjectPath(const HookEventKey& key) {
    if (key.root.empty()) {
        return key.path;
    }
    if (key.path.empty()) {
        return key.root;
    }
    return key.root + "." + key.path;
}

std::string ExtractPropName(const HookEventKey& key) {
    if (key.path.empty()) {
        return "";
    }
    auto pos = key.path.find_last_of('.');
    if (pos == std::string::npos) {
        return key.path;
    }
    return key.path.substr(pos + 1);
}

bool MatchPrefix(const std::vector<std::string>& prefixes,
                 const std::string& value) {
    for (const auto& prefix : prefixes) {
        if (!prefix.empty() && value.rfind(prefix, 0) == 0) {
            return true;
        }
    }
    return false;
}

bool MatchObjectList(const std::unordered_set<std::string>& list,
                     const std::string& object_path) {
    for (const auto& item : list) {
        if (item.empty()) {
            continue;
        }
        const std::string expected = "window." + item;
        if (object_path == expected ||
            object_path.rfind(expected + ".", 0) == 0) {
            return true;
        }
    }
    return false;
}

}  // namespace

bool ShouldEnterHookPipeline(const GlobalHookConfig& cfg,
                             const HookEventKey& key) {
    const std::string object_path = ComposeObjectPath(key);
    const std::string prop_name = ExtractPropName(key);

    // Whitelist gating
    if (!cfg.whitelist.allowed_objects.empty() &&
        !MatchObjectList(cfg.whitelist.allowed_objects, object_path)) {
        return false;
    }
    if (!cfg.whitelist.allowed_properties.empty() &&
        cfg.whitelist.allowed_properties.count(prop_name) == 0) {
        return false;
    }
    if (!cfg.whitelist.allowed_prefixes.empty() &&
        !MatchPrefix(cfg.whitelist.allowed_prefixes, prop_name)) {
        return false;
    }

    // Blacklist filters
    if (MatchObjectList(cfg.blacklist.blocked_objects, object_path)) {
        return false;
    }
    if (cfg.blacklist.blocked_properties.count(prop_name) > 0) {
        return false;
    }
    if (MatchPrefix(cfg.blacklist.blocked_prefixes, prop_name)) {
        return false;
    }

    return true;
}

}  // namespace leapvm

