#include "skeleton_parser.h"

#include <stdexcept>
#include <string>
#include <vector>
#include "../log.h"

using leapvm::skeleton::AccessorProperty;
using leapvm::skeleton::DataProperty;
using leapvm::skeleton::EnvironmentSkeleton;
using leapvm::skeleton::MethodProperty;
using leapvm::skeleton::ObjectSkeleton;
using leapvm::skeleton::PropertyDescriptor;
using leapvm::skeleton::PropertyKind;
using leapvm::skeleton::PropertyOwner;

namespace {

inline v8::Local<v8::String> V8String(v8::Isolate* isolate, const std::string& value) {
    return v8::String::NewFromUtf8(isolate, value.c_str(), v8::NewStringType::kNormal)
        .ToLocalChecked();
}

std::string ToUtf8(v8::Isolate* isolate,
                   v8::Local<v8::Context> context,
                   v8::Local<v8::Value> value) {
    v8::Local<v8::String> str;
    if (!value->ToString(context).ToLocal(&str)) {
        return "";
    }
    v8::String::Utf8Value utf8(isolate, str);
    if (*utf8) {
        return std::string(*utf8, utf8.length());
    }
    return "";
}

std::string GetStringProp(v8::Isolate* isolate,
                          v8::Local<v8::Context> context,
                          v8::Local<v8::Object> obj,
                          const char* key,
                          const std::string& fallback = "") {
    v8::Local<v8::Value> val;
    if (!obj->Get(context, V8String(isolate, key)).ToLocal(&val)) {
        return fallback;
    }
    if (!val->IsString()) {
        return fallback;
    }
    return ToUtf8(isolate, context, val);
}

bool GetBoolProp(v8::Isolate* isolate,
                 v8::Local<v8::Context> context,
                 v8::Local<v8::Object> obj,
                 const char* key,
                 bool fallback) {
    v8::Local<v8::Value> val;
    if (!obj->Get(context, V8String(isolate, key)).ToLocal(&val)) {
        return fallback;
    }
    if (val->IsBoolean()) {
        return val->BooleanValue(isolate);
    }
    return fallback;
}

int GetIntProp(v8::Isolate* isolate,
               v8::Local<v8::Context> context,
               v8::Local<v8::Object> obj,
               const char* key,
               int fallback) {
    v8::Local<v8::Value> val;
    if (!obj->Get(context, V8String(isolate, key)).ToLocal(&val)) {
        return fallback;
    }
    if (!val->IsNumber()) {
        return fallback;
    }
    return static_cast<int>(val->Int32Value(context).FromMaybe(fallback));
}

PropertyOwner ParseOwner(const std::string& owner) {
    if (owner == "constructor") return PropertyOwner::CONSTRUCTOR;
    if (owner == "prototype") return PropertyOwner::PROTOTYPE;
    return PropertyOwner::INSTANCE;
}

PropertyKind ParseKind(const std::string& kind) {
    if (kind == "method") return PropertyKind::METHOD;
    if (kind == "accessor") return PropertyKind::ACCESSOR;
    return PropertyKind::DATA;
}

std::string DetectValueType(v8::Local<v8::Value> value) {
    if (value->IsString()) return "string";
    if (value->IsNumber()) return "number";
    if (value->IsBoolean()) return "boolean";
    if (value->IsNull()) return "null";
    if (value->IsUndefined()) return "undefined";
    return "undefined";
}

std::string ValueToString(v8::Isolate* isolate,
                          v8::Local<v8::Context> context,
                          v8::Local<v8::Value> value,
                          const std::string& value_type) {
    if (value_type == "string") {
        return ToUtf8(isolate, context, value);
    }
    if (value_type == "number") {
        v8::Maybe<double> maybe = value->NumberValue(context);
        if (maybe.IsJust()) {
            return std::to_string(maybe.FromJust());
        }
    }
    if (value_type == "boolean") {
        return value->BooleanValue(isolate) ? "true" : "false";
    }
    if (value_type == "null") {
        return "null";
    }
    return "undefined";
}

void ApplyAttributes(v8::Isolate* isolate,
                     v8::Local<v8::Context> context,
                     v8::Local<v8::Object> source,
                     PropertyDescriptor* target) {
    v8::Local<v8::Value> attrs_val;
    if (!source->Get(context, V8String(isolate, "attributes")).ToLocal(&attrs_val) ||
        !attrs_val->IsObject()) {
        return;
    }

    v8::Local<v8::Object> attrs_obj = attrs_val.As<v8::Object>();
    target->enumerable = GetBoolProp(isolate, context, attrs_obj, "enumerable", target->enumerable);
    target->configurable = GetBoolProp(isolate, context, attrs_obj, "configurable", target->configurable);
}

}  // namespace

namespace leapvm {
namespace skeleton {

std::unique_ptr<EnvironmentSkeleton> SkeletonParser::ParseFromV8Object(
    v8::Isolate* isolate,
    v8::Local<v8::Context> context,
    v8::Local<v8::Object> descriptor) {

    auto env = std::make_unique<EnvironmentSkeleton>();

    if (descriptor.IsEmpty()) {
        return env;
    }

    env->schema_version = GetIntProp(isolate, context, descriptor, "schemaVersion", 1);
    env->env_version = GetStringProp(isolate, context, descriptor, "envVersion", "");

    v8::Local<v8::Value> objects_val;
    if (!descriptor->Get(context, V8String(isolate, "objects")).ToLocal(&objects_val) ||
        !objects_val->IsArray()) {
        LEAPVM_LOG_WARN("[skeleton] descriptor.objects is missing or not an array");
        return env;
    }

    v8::Local<v8::Array> objects = objects_val.As<v8::Array>();

    for (uint32_t i = 0; i < objects->Length(); ++i) {
        v8::Local<v8::Value> obj_val;
        if (!objects->Get(context, i).ToLocal(&obj_val) || !obj_val->IsObject()) {
            continue;
        }

        v8::Local<v8::Object> obj = obj_val.As<v8::Object>();
        ObjectSkeleton skeleton;

        skeleton.name = GetStringProp(isolate, context, obj, "name");
        skeleton.ctor_name = GetStringProp(isolate, context, obj, "ctorName");
        skeleton.instance_name = GetStringProp(isolate, context, obj, "instanceName");
        skeleton.brand = GetStringProp(isolate, context, obj, "brand", skeleton.name);
        skeleton.ctor_illegal = GetBoolProp(isolate, context, obj, "ctorIllegal", false);
        skeleton.expose_ctor = GetBoolProp(isolate, context, obj, "exposeCtor", true);
        if (skeleton.brand.empty()) {
            skeleton.brand = skeleton.name;
        }

        // Read super field (immediate parent class name)
        // Can be: null (no parent), undefined (no parent), or a string (parent name)
        v8::Local<v8::Value> super_val;
        if (obj->Get(context, V8String(isolate, "super")).ToLocal(&super_val)) {
            if (super_val->IsString()) {
                skeleton.super_type = ToUtf8(isolate, context, super_val);
            }
            // If super is null or undefined, super_type remains empty (no inheritance)
        }

        v8::Local<v8::Value> props_val;
        if (obj->Get(context, V8String(isolate, "props")).ToLocal(&props_val) &&
            props_val->IsObject()) {
            v8::Local<v8::Object> props_obj = props_val.As<v8::Object>();
            v8::Local<v8::Array> prop_names;
            if (props_obj->GetPropertyNames(context).ToLocal(&prop_names)) {
                for (uint32_t k = 0; k < prop_names->Length(); ++k) {
                    v8::Local<v8::Value> prop_key_val;
                    if (!prop_names->Get(context, k).ToLocal(&prop_key_val) ||
                        !prop_key_val->IsString()) {
                        continue;
                    }

                    std::string prop_name = ToUtf8(isolate, context, prop_key_val);
                    v8::Local<v8::Value> prop_desc_val;
                    if (!props_obj->Get(context, prop_key_val).ToLocal(&prop_desc_val) ||
                        !prop_desc_val->IsObject()) {
                        continue;
                    }

                    v8::Local<v8::Object> prop_desc = prop_desc_val.As<v8::Object>();
                    std::string owner_str = GetStringProp(isolate, context, prop_desc, "owner", "instance");
                    std::string kind_str = GetStringProp(isolate, context, prop_desc, "kind", "data");

                    PropertyOwner owner = ParseOwner(owner_str);
                    PropertyKind kind = ParseKind(kind_str);

                    if (kind == PropertyKind::DATA) {
                        auto data_prop = std::make_unique<DataProperty>();
                        data_prop->name = prop_name;
                        data_prop->owner = owner;
                        data_prop->kind = kind;

                        ApplyAttributes(isolate, context, prop_desc, data_prop.get());

                        v8::Local<v8::Value> attrs_val;
                        if (prop_desc->Get(context, V8String(isolate, "attributes")).ToLocal(&attrs_val) &&
                            attrs_val->IsObject()) {
                            v8::Local<v8::Object> attrs_obj = attrs_val.As<v8::Object>();
                            data_prop->writable = GetBoolProp(
                                isolate, context, attrs_obj, "writable", data_prop->writable);
                        }

                        std::string value_type = GetStringProp(isolate, context, prop_desc, "valueType");
                        v8::Local<v8::Value> value_val;
                        if (!prop_desc->Get(context, V8String(isolate, "value")).ToLocal(&value_val)) {
                            value_val = v8::Undefined(isolate);
                        }

                        if (value_type.empty()) {
                            value_type = DetectValueType(value_val);
                        }

                        data_prop->value_type = value_type;
                        data_prop->value = ValueToString(isolate, context, value_val, value_type);

                        skeleton.properties.push_back(std::move(data_prop));
                    } else if (kind == PropertyKind::METHOD) {
                        auto method_prop = std::make_unique<MethodProperty>();
                        method_prop->name = prop_name;
                        method_prop->owner = owner;
                        method_prop->kind = kind;
                        method_prop->length = GetIntProp(isolate, context, prop_desc, "length", -1);
                        method_prop->brand_check = GetBoolProp(isolate, context, prop_desc, "brandCheck", false);
                        method_prop->brand = GetStringProp(isolate, context, prop_desc, "brand", skeleton.brand);
                        if (method_prop->brand.empty()) {
                            method_prop->brand = skeleton.brand;
                        }

                        ApplyAttributes(isolate, context, prop_desc, method_prop.get());

                        v8::Local<v8::Value> dispatch_val;
                        if (prop_desc->Get(context, V8String(isolate, "dispatch")).ToLocal(&dispatch_val) &&
                            dispatch_val->IsObject()) {
                            v8::Local<v8::Object> dispatch_obj = dispatch_val.As<v8::Object>();
                            method_prop->dispatch_obj = GetStringProp(
                                isolate, context, dispatch_obj, "objName", skeleton.name);
                            method_prop->dispatch_prop = GetStringProp(
                                isolate, context, dispatch_obj, "propName", prop_name);
                        } else {
                            method_prop->dispatch_obj = skeleton.name;
                            method_prop->dispatch_prop = prop_name;
                        }

                        skeleton.properties.push_back(std::move(method_prop));
                    } else if (kind == PropertyKind::ACCESSOR) {
                        auto accessor_prop = std::make_unique<AccessorProperty>();
                        accessor_prop->name = prop_name;
                        accessor_prop->owner = owner;
                        accessor_prop->kind = kind;
                        accessor_prop->brand_check = GetBoolProp(isolate, context, prop_desc, "brandCheck", false);
                        accessor_prop->brand = GetStringProp(isolate, context, prop_desc, "brand", skeleton.brand);
                        if (accessor_prop->brand.empty()) {
                            accessor_prop->brand = skeleton.brand;
                        }

                        ApplyAttributes(isolate, context, prop_desc, accessor_prop.get());

                        v8::Local<v8::Value> dispatch_val;
                        if (prop_desc->Get(context, V8String(isolate, "dispatch")).ToLocal(&dispatch_val) &&
                            dispatch_val->IsObject()) {
                            v8::Local<v8::Object> dispatch_obj = dispatch_val.As<v8::Object>();

                            v8::Local<v8::Value> getter_val;
                            if (dispatch_obj->Get(context, V8String(isolate, "getter")).ToLocal(&getter_val) &&
                                getter_val->IsObject()) {
                                v8::Local<v8::Object> getter_obj = getter_val.As<v8::Object>();
                                accessor_prop->has_getter = true;
                                accessor_prop->getter_obj = GetStringProp(
                                    isolate, context, getter_obj, "objName", skeleton.name);
                                accessor_prop->getter_prop = GetStringProp(
                                    isolate, context, getter_obj, "propName", prop_name);
                            }

                            v8::Local<v8::Value> setter_val;
                            if (dispatch_obj->Get(context, V8String(isolate, "setter")).ToLocal(&setter_val) &&
                                setter_val->IsObject()) {
                                v8::Local<v8::Object> setter_obj = setter_val.As<v8::Object>();
                                accessor_prop->has_setter = true;
                                accessor_prop->setter_obj = GetStringProp(
                                    isolate, context, setter_obj, "objName", skeleton.name);
                                accessor_prop->setter_prop = GetStringProp(
                                    isolate, context, setter_obj, "propName", prop_name);
                            }
                        }

                        skeleton.properties.push_back(std::move(accessor_prop));
                    }
                }
            }
        }

        env->objects.push_back(std::move(skeleton));
    }

    return env;
}

}  // namespace skeleton
}  // namespace leapvm
