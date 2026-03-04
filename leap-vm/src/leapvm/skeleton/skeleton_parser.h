#ifndef LEAPVM_SKELETON_PARSER_H
#define LEAPVM_SKELETON_PARSER_H

#include "../v8_headers.h"
#include "skeleton_types.h"
#include <memory>

namespace leapvm {
namespace skeleton {

class SkeletonParser {
public:
    static constexpr int kMinSupportedSkeletonVersion = 1;
    static constexpr int kMaxSupportedSkeletonVersion = 1;

    // Parse EnvDescriptor from JS object.
    static std::unique_ptr<EnvironmentSkeleton> ParseFromV8Object(
        v8::Isolate* isolate,
        v8::Local<v8::Context> context,
        v8::Local<v8::Object> descriptor);
};

}  // namespace skeleton
}  // namespace leapvm

#endif  // LEAPVM_SKELETON_PARSER_H
