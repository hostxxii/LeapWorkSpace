// native_wrapper.h
// NativeWrapper: 通用的对象包装器,用于拦截任意JS对象的属性访问
#pragma once

#include <string>
#include <unordered_map>
#include <mutex>
#include "v8_headers.h"

namespace leapvm {

// NativeWrapper元信息
struct NativeWrapperMeta {
    std::string label;  // 例如 "window.navigator", "Element<DIV>#1"
};

// NativeWrapper注册表（单例）
class NativeWrapperRegistry {
public:
    static NativeWrapperRegistry& Instance() {
        static NativeWrapperRegistry inst;
        return inst;
    }

    // 注册一个wrapper,返回唯一ID
    uint32_t Register(const NativeWrapperMeta& meta) {
        std::lock_guard<std::mutex> lock(mutex_);
        uint32_t id = ++last_id_;
        metas_[id] = meta;
        return id;
    }

    // 根据ID获取meta信息
    bool Get(uint32_t id, NativeWrapperMeta* out) const {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = metas_.find(id);
        if (it == metas_.end()) return false;
        if (out) *out = it->second;
        return true;
    }

    // 注销wrapper
    void Unregister(uint32_t id) {
        std::lock_guard<std::mutex> lock(mutex_);
        metas_.erase(id);
    }

private:
    NativeWrapperRegistry() : last_id_(0) {}
    mutable std::mutex mutex_;
    uint32_t last_id_;
    std::unordered_map<uint32_t, NativeWrapperMeta> metas_;
};

// 创建NativeWrapper模板（带NamedPropertyHandler）
v8::Local<v8::ObjectTemplate> CreateNativeWrapperTemplate(v8::Isolate* isolate);

// 设置wrapper的内部字段（backing对象和meta ID）
void SetNativeWrapperInternalFields(
    v8::Isolate* isolate,
    v8::Local<v8::Object> wrapper,
    v8::Local<v8::Object> backing,
    uint32_t meta_id);

}  // namespace leapvm
