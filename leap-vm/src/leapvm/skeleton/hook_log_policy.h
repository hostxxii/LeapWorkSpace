#ifndef LEAPVM_SKELETON_HOOK_LOG_POLICY_H
#define LEAPVM_SKELETON_HOOK_LOG_POLICY_H

#include "../v8_headers.h"
#include <string>
#include <vector>

namespace leapvm {

class VmInstance;

namespace skeleton {
namespace hooklog {

struct HookStackFrame {
    std::string function_name;
    std::string url;
    int line = 1;   // 1-based
    int column = 1; // 1-based
};

std::vector<HookStackFrame> CaptureHookStackFrames(v8::Isolate* isolate,
                                                   int max_frames = 12);

bool IsInternalUrl(const std::string& url);
bool HasUserFrame(const std::vector<HookStackFrame>& frames);
bool HasDevtoolsEvalFrame(const std::vector<HookStackFrame>& frames);
bool IsRuntimeTaskActive(v8::Isolate* isolate, v8::Local<v8::Context> context);
bool ShouldSuppressHookNoise(v8::Isolate* isolate,
                             v8::Local<v8::Context> context,
                             VmInstance* vm,
                             const std::vector<HookStackFrame>& frames);

}  // namespace hooklog
}  // namespace skeleton
}  // namespace leapvm

#endif  // LEAPVM_SKELETON_HOOK_LOG_POLICY_H
