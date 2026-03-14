#ifndef LEAPVM_SKELETON_REGISTRY_H
#define LEAPVM_SKELETON_REGISTRY_H

#include "../v8_headers.h"
#include "skeleton_builder.h"
#include "skeleton_types.h"
#include <map>
#include <memory>
#include <set>
#include <string>
#include <unordered_map>
#include <vector>

namespace leapvm {
class VmInstance;
namespace dom { class DomManager; }
namespace skeleton {

// Manage FunctionTemplates and object construction based on skeleton descriptors.
class SkeletonRegistry {
public:
    SkeletonRegistry(v8::Isolate* isolate, v8::Local<v8::Context> context);
    ~SkeletonRegistry() = default;

    size_t skeleton_count() const { return skeletons_.size(); }
    size_t template_count() const { return templates_.size(); }
    size_t dispatch_meta_count() const { return dispatch_metas_.size(); }
    size_t brand_compat_cache_size() const { return brand_compat_cache_.size(); }

    // Register a single object skeleton.
    void RegisterSkeleton(ObjectSkeleton skeleton);

    // Three-phase build aligned with Chromium bindings.
    void BuildPhase1_CreateTemplates();
    void BuildPhase2_SetupInheritance();
    void BuildPhase3_DefinePropertiesAndInstances();

    v8::Local<v8::FunctionTemplate> GetTemplate(const std::string& name);
    v8::Local<v8::Object> CreateInstanceByCtorName(const std::string& ctor_name);
    std::string GetBrandByCtorName(const std::string& ctor_name) const;
    bool IsBrandCompatible(const std::string& receiver_brand,
                           const std::string& expected_brand) const;
    void SetBrand(v8::Local<v8::Object> target, const std::string& brand);
    void SetDomManager(leapvm::dom::DomManager* dm) { dom_manager_ = dm; }
    void SetVmInstance(leapvm::VmInstance* vm) { vm_instance_ = vm; }

    // Deep-copy all registered skeletons (in skeleton_order_) into |target|.
    // Used to initialize child-frame SkeletonRegistries with the same type
    // definitions as the main frame, preserving registration order.
    void ReplaySkeletonsTo(SkeletonRegistry* target) const;

    // Apply instance-level skeleton properties to an arbitrary existing object.
    // Looks up the instance skeleton whose instanceName matches |instance_name|,
    // then calls AddPropertyToObject for every INSTANCE-owned property.
    // Used to give per-task dynamic objects (e.g. per-task HTMLDocument) the same
    // C++ interceptors that the global singleton receives from CreateInstanceFromInstanceSkeleton.
    void ApplyInstanceSkeletonToObject(const std::string& instance_name,
                                       v8::Local<v8::Object> target);
    v8::Local<v8::Object> CreateTrustedEventInstance(
        const std::string& type,
        v8::Local<v8::Object> init = v8::Local<v8::Object>());
    v8::Local<v8::Private> GetAllDocIdKey();

private:
    v8::Isolate* isolate_;
    v8::Global<v8::Context> context_;

    std::unordered_map<std::string, ObjectSkeleton> skeletons_;
    std::vector<std::string> skeleton_order_;
    std::map<std::string, v8::Global<v8::FunctionTemplate>> templates_;
    std::vector<std::unique_ptr<DispatchMeta>> dispatch_metas_;

    // Helper functions to distinguish skeleton types
    static bool IsTypeSkeleton(const ObjectSkeleton& skeleton);
    static bool IsInstanceSkeleton(const ObjectSkeleton& skeleton);

    void CreateTemplate(const std::string& name);
    std::string FindSkeletonName(const std::string& ctor_name);
    bool HasInstanceSkeletonForType(const std::string& type_name) const;
    void ExposeTypeConstructorIfNeeded(const std::string& name);
    void SetupInheritanceRecursive(const std::string& name, std::set<std::string>& processed);
    void SetupInheritance(const std::string& name);
    void DefineProperties(const std::string& name);
    void CreateInstance(const std::string& name);
    void CreateInstanceFromInstanceSkeleton(const std::string& name);

    DispatchMeta* CreateDispatchMeta(const std::string& obj,
                                     const std::string& prop,
                                     const std::string& type,
                                     bool brand_check,
                                     const std::string& brand);

    void DefineGlobalProperty(const std::string& key, v8::Local<v8::Value> value);
    void AddPropertyToObject(v8::Local<v8::Object> target,
                             const PropertyDescriptor* prop);
    v8::PropertyAttribute BuildAttributeFlags(const PropertyDescriptor* prop,
                                              bool writable_default = true) const;
    void SetupEventIsTrustedProperty(v8::Local<v8::FunctionTemplate> tmpl);
    void SetupDocumentAllProperty(v8::Local<v8::FunctionTemplate> tmpl);
    void InstallDocumentAllOnObject(v8::Local<v8::Object> target);
    void InitHTMLAllCollectionTemplate();
    void InstallHTMLAllCollectionMethodsOnObject(v8::Local<v8::Object> collection);
    v8::Local<v8::Private> GetIsTrustedKey();
    v8::Local<v8::Private> GetAllCollectionCacheKey();
    std::string ResolveElementCtorName(const std::string& tag_name) const;
    v8::Local<v8::Object> WrapDomElementForAll(uint32_t doc_id, uint32_t node_id);

    static void EventConstructorCallback(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void ConstructibleTypeConstructorCallback(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void IsTrustedGetterCallback(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void DocumentAllGetterCallback(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void DocumentAllNativeGetter(v8::Local<v8::Name>, const v8::PropertyCallbackInfo<v8::Value>& info);
    static void AllCollectionLengthGetterCallback(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void AllCollectionLengthNativeGetter(v8::Local<v8::Name>, const v8::PropertyCallbackInfo<v8::Value>& info);
    static void AllCollectionItemCallback(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void AllCollectionNamedItemCallback(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void AllCollectionIteratorCallback(const v8::FunctionCallbackInfo<v8::Value>& args);
    static v8::Intercepted AllCollectionIndexedGetter(
        uint32_t index,
        const v8::PropertyCallbackInfo<v8::Value>& info);
    static v8::Intercepted AllCollectionNamedGetter(
        v8::Local<v8::Name> name,
        const v8::PropertyCallbackInfo<v8::Value>& info);

    v8::Global<v8::Private> brand_key_;
    v8::Global<v8::Private> is_trusted_key_;
    leapvm::dom::DomManager* dom_manager_ = nullptr;
    leapvm::VmInstance* vm_instance_ = nullptr;
    v8::Global<v8::ObjectTemplate> html_all_collection_tpl_;
    v8::Global<v8::Private> all_doc_id_key_;
    v8::Global<v8::Private> all_dm_key_;
    v8::Global<v8::Private> all_collection_cache_key_;
    v8::Local<v8::Private> GetBrandKey();
    v8::Local<v8::String> BrandString(const std::string& brand);

    // O2: Brand 兼容性结果缓存，避免每次调用 IsBrandCompatible 都重复遍历继承链
    mutable std::unordered_map<std::string, bool> brand_compat_cache_;
};

}  // namespace skeleton
}  // namespace leapvm

#endif  // LEAPVM_SKELETON_REGISTRY_H
