#ifndef LEAPVM_SKELETON_BUILDER_H
#define LEAPVM_SKELETON_BUILDER_H

#include "../v8_headers.h"
#include "skeleton_types.h"
#include <functional>

namespace leapvm {
namespace skeleton {

using DispatchMetaFactory =
    std::function<DispatchMeta*(const std::string&, const std::string&, const std::string&, bool, const std::string&)>;

class SkeletonBuilder {
public:
    // Define a property on a V8 template target (constructor/prototype/instance).
    static void AddProperty(
        v8::Isolate* isolate,
        v8::Local<v8::Context> context,
        v8::Local<v8::Template> target,
        const PropertyDescriptor* prop,
        const DispatchMetaFactory& make_meta);

private:
    static void AddDataProperty(
        v8::Isolate* isolate,
        v8::Local<v8::Context> context,
        v8::Local<v8::Template> target,
        const DataProperty* prop);

    static void AddMethodProperty(
        v8::Isolate* isolate,
        v8::Local<v8::Context> context,
        v8::Local<v8::Template> target,
        const MethodProperty* prop,
        const DispatchMetaFactory& make_meta);

    static void AddAccessorProperty(
        v8::Isolate* isolate,
        v8::Local<v8::Context> context,
        v8::Local<v8::Template> target,
        const AccessorProperty* prop,
        const DispatchMetaFactory& make_meta);
};

}  // namespace skeleton
}  // namespace leapvm

#endif  // LEAPVM_SKELETON_BUILDER_H
