#ifndef LEAPVM_SKELETON_TYPES_H
#define LEAPVM_SKELETON_TYPES_H

#include <map>
#include <memory>
#include <string>
#include <vector>

namespace leapvm {
namespace skeleton {

// Dispatch metadata passed to stub callbacks.
struct DispatchMeta {
    std::string obj_name;
    std::string prop_name;
    std::string call_type;  // "apply" | "get" | "set"
    bool brand_check = false;
    std::string brand;      // expected brand for Illegal invocation checks

    DispatchMeta(const std::string& obj,
                 const std::string& prop,
                 const std::string& type,
                 bool check_brand,
                 const std::string& brand_name)
        : obj_name(obj), prop_name(prop), call_type(type),
          brand_check(check_brand), brand(brand_name) {}
};

// Property kinds supported by the skeleton system.
enum class PropertyKind {
    DATA,
    METHOD,
    ACCESSOR
};

// Property owner location.
enum class PropertyOwner {
    CONSTRUCTOR,
    PROTOTYPE,
    INSTANCE
};

// Base descriptor for all property types.
struct PropertyDescriptor {
    std::string name;
    PropertyKind kind;
    PropertyOwner owner;
    bool enumerable = true;
    bool configurable = true;

    virtual ~PropertyDescriptor() = default;
};

// Data property descriptor.
struct DataProperty : PropertyDescriptor {
    std::string value_type;  // "string" | "number" | "boolean" | "null" | "undefined"
    std::string value;       // Stringified value
    bool writable = false;
};

// Method property descriptor.
struct MethodProperty : PropertyDescriptor {
    std::string dispatch_obj;
    std::string dispatch_prop;
    bool brand_check = false;
    std::string brand;
    int length = 0;  // Function length, -1 means unset
};

// Accessor property descriptor.
struct AccessorProperty : PropertyDescriptor {
    bool has_getter = false;
    bool has_setter = false;
    std::string getter_obj;
    std::string getter_prop;
    std::string setter_obj;
    std::string setter_prop;
    bool brand_check = false;
    std::string brand;
};

// Object skeleton descriptor.
struct ObjectSkeleton {
    std::string name;
    std::string ctor_name;
    std::string instance_name;
    std::string brand;      // brand name for Illegal invocation checks
    bool ctor_illegal = false;
    bool expose_ctor = true;  // whether to expose constructor to global object

    // Super class name (immediate parent only, not the full chain)
    std::string super_type;

    // Property descriptors.
    std::vector<std::unique_ptr<PropertyDescriptor>> properties;
};

// Environment skeleton descriptor.
struct EnvironmentSkeleton {
    int schema_version = 0;
    std::string env_version;
    std::vector<ObjectSkeleton> objects;
};

}  // namespace skeleton
}  // namespace leapvm

#endif  // LEAPVM_SKELETON_TYPES_H
