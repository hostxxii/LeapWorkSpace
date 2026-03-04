#include "skeleton_builder.h"

#include "dispatch_bridge.h"
#include "../log.h"
#include <string>
#include <unordered_set>

namespace {

inline v8::Local<v8::String> V8String(v8::Isolate* isolate, const std::string& value) {
    return v8::String::NewFromUtf8(isolate, value.c_str(), v8::NewStringType::kNormal)
        .ToLocalChecked();
}

inline v8::Local<v8::Name> ToPropertyName(v8::Isolate* isolate, const std::string& key) {
    // Support common well-known Symbols using "@@" prefix.
    if (key == "@@toStringTag") return v8::Symbol::GetToStringTag(isolate);
    if (key == "@@iterator") return v8::Symbol::GetIterator(isolate);
    if (key == "@@asyncIterator") return v8::Symbol::GetAsyncIterator(isolate);
    if (key == "@@hasInstance") return v8::Symbol::GetHasInstance(isolate);
    if (key == "@@isConcatSpreadable") return v8::Symbol::GetIsConcatSpreadable(isolate);
    if (key == "@@match") return v8::Symbol::GetMatch(isolate);
    // GetMatchAll/GetSpecies 在当前 V8 版本中不存在，降级为普通字符串属性
    // if (key == "@@matchAll") return v8::Symbol::GetMatchAll(isolate);
    if (key == "@@replace") return v8::Symbol::GetReplace(isolate);
    if (key == "@@search") return v8::Symbol::GetSearch(isolate);
    // if (key == "@@species") return v8::Symbol::GetSpecies(isolate);
    if (key == "@@split") return v8::Symbol::GetSplit(isolate);
    if (key == "@@toPrimitive") return v8::Symbol::GetToPrimitive(isolate);
    if (key == "@@unscopables") return v8::Symbol::GetUnscopables(isolate);
    return V8String(isolate, key);
}

inline bool IteratorNameShouldBeValues(const std::string& dispatch_obj) {
    return dispatch_obj == "DOMTokenList" ||
           dispatch_obj == "HTMLAllCollection" ||
           dispatch_obj == "HTMLCollection" ||
           dispatch_obj == "MimeTypeArray" ||
           dispatch_obj == "NamedNodeMap" ||
           dispatch_obj == "NodeList" ||
           dispatch_obj == "Plugin" ||
           dispatch_obj == "PluginArray";
}

inline bool MethodShouldBeConstructible(const leapvm::skeleton::MethodProperty* prop) {
    if (!prop) return false;
    if (prop->dispatch_obj != "Window") return false;
    static const std::unordered_set<std::string> kConstructibleWindowApis = {
        "XMLHttpRequest",
        "XMLHttpRequestUpload",
        "XMLHttpRequestEventTarget",
        "DOMParser",
        "XMLSerializer",
        "MutationObserver",
        "CustomEvent",
        "MessageEvent",
        "MouseEvent",
        "KeyboardEvent",
        "Option",
        "Image",
        "Audio"
    };
    if (kConstructibleWindowApis.count(prop->dispatch_prop) > 0) {
        return true;
    }
    return kConstructibleWindowApis.count(prop->name) > 0;
}

inline v8::PropertyAttribute BuildAttr(bool enumerable, bool configurable, bool writable) {
    v8::PropertyAttribute attr = v8::None;
    if (!writable) {
        attr = static_cast<v8::PropertyAttribute>(attr | v8::ReadOnly);
    }
    if (!enumerable) {
        attr = static_cast<v8::PropertyAttribute>(attr | v8::DontEnum);
    }
    if (!configurable) {
        attr = static_cast<v8::PropertyAttribute>(attr | v8::DontDelete);
    }
    return attr;
}

}  // namespace

namespace leapvm {
namespace skeleton {

void SkeletonBuilder::AddProperty(
    v8::Isolate* isolate,
    v8::Local<v8::Context> context,
    v8::Local<v8::Template> target,
    const PropertyDescriptor* prop,
    const DispatchMetaFactory& make_meta) {

    switch (prop->kind) {
    case PropertyKind::DATA:
        AddDataProperty(isolate, context, target,
                        static_cast<const DataProperty*>(prop));
        break;
    case PropertyKind::METHOD:
        AddMethodProperty(isolate, context, target,
                          static_cast<const MethodProperty*>(prop),
                          make_meta);
        break;
    case PropertyKind::ACCESSOR:
        AddAccessorProperty(isolate, context, target,
                            static_cast<const AccessorProperty*>(prop),
                            make_meta);
        break;
    }
}

void SkeletonBuilder::AddDataProperty(
    v8::Isolate* isolate,
    v8::Local<v8::Context> context,
    v8::Local<v8::Template> target,
    const DataProperty* prop) {

    v8::Local<v8::Value> value;

    if (prop->value_type == "string") {
        value = v8::String::NewFromUtf8(isolate, prop->value.c_str(),
                                        v8::NewStringType::kNormal).ToLocalChecked();
    } else if (prop->value_type == "number") {
        value = v8::Number::New(isolate, std::stod(prop->value));
    } else if (prop->value_type == "boolean") {
        value = v8::Boolean::New(isolate, prop->value == "true");
    } else if (prop->value_type == "null") {
        value = v8::Null(isolate);
    } else if (prop->value_type == "undefined") {
        value = v8::Undefined(isolate);
    } else {
        value = v8::Undefined(isolate);
    }

    v8::Local<v8::Name> prop_name = ToPropertyName(isolate, prop->name);
    auto attr = BuildAttr(prop->enumerable, prop->configurable, prop->writable);

    target->Set(prop_name, value, attr);

    LEAPVM_LOG_DEBUG("[skeleton] [data] %s = %s", prop->name.c_str(), prop->value.c_str());
}

void SkeletonBuilder::AddMethodProperty(
    v8::Isolate* isolate,
    v8::Local<v8::Context> context,
    v8::Local<v8::Template> target,
    const MethodProperty* prop,
    const DispatchMetaFactory& make_meta) {
    (void)context;

    DispatchMeta* meta = make_meta(
        prop->dispatch_obj,
        prop->dispatch_prop,
        "apply",
        prop->brand_check,
        prop->brand);
    v8::Local<v8::External> data = v8::External::New(isolate, meta);
    v8::Local<v8::FunctionTemplate> fn_tmpl =
        v8::FunctionTemplate::New(isolate, DispatchBridge::StubCallback, data);

    v8::Local<v8::String> method_name = V8String(isolate, prop->name);
    if (prop->name == "@@iterator" && IteratorNameShouldBeValues(prop->dispatch_obj)) {
        // Browser shape: collection [Symbol.iterator].name is typically "values".
        method_name = V8String(isolate, "values");
    }
    fn_tmpl->SetClassName(method_name);
    // Most Web API methods are non-constructors, but a subset of
    // Window-exposed constructor-like APIs must keep [[Construct]].
    if (!MethodShouldBeConstructible(prop)) {
        fn_tmpl->RemovePrototype();
    }

    if (prop->length >= 0) {
        fn_tmpl->SetLength(prop->length);
    }

    auto attr = BuildAttr(prop->enumerable, prop->configurable, true);
    v8::Local<v8::Name> prop_name = ToPropertyName(isolate, prop->name);
    target->Set(prop_name, fn_tmpl, attr);

    LEAPVM_LOG_DEBUG("[skeleton] [method] %s (stub, type: %s, dispatch: %s)",
                     prop->name.c_str(),
                     prop->dispatch_obj.c_str(),
                     prop->dispatch_prop.c_str());
}

void SkeletonBuilder::AddAccessorProperty(
    v8::Isolate* isolate,
    v8::Local<v8::Context> context,
    v8::Local<v8::Template> target,
    const AccessorProperty* prop,
    const DispatchMetaFactory& make_meta) {
    (void)context;

    v8::Local<v8::FunctionTemplate> getter_tmpl;
    v8::Local<v8::FunctionTemplate> setter_tmpl;

    if (prop->has_getter) {
        DispatchMeta* getter_meta = make_meta(
            prop->getter_obj,
            prop->getter_prop,
            "get",
            prop->brand_check,
            prop->brand);
        v8::Local<v8::External> getter_data = v8::External::New(isolate, getter_meta);
        getter_tmpl = v8::FunctionTemplate::New(
            isolate, DispatchBridge::StubCallback, getter_data);
    }

    if (prop->has_setter) {
        DispatchMeta* setter_meta = make_meta(
            prop->setter_obj,
            prop->setter_prop,
            "set",
            prop->brand_check,
            prop->brand);
        v8::Local<v8::External> setter_data = v8::External::New(isolate, setter_meta);
        setter_tmpl = v8::FunctionTemplate::New(
            isolate, DispatchBridge::StubCallback, setter_data);
    }

    v8::Local<v8::Name> prop_name = ToPropertyName(isolate, prop->name);
    auto attr = BuildAttr(prop->enumerable, prop->configurable, true);

    target->SetAccessorProperty(prop_name, getter_tmpl, setter_tmpl, attr);

    LEAPVM_LOG_DEBUG("[skeleton] [accessor] %s (stub, getter=%s, setter=%s)",
                     prop->name.c_str(),
                     prop->has_getter ? "yes" : "no",
                     prop->has_setter ? "yes" : "no");
}

}  // namespace skeleton
}  // namespace leapvm
