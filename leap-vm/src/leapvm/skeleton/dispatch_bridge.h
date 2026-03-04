#ifndef LEAPVM_SKELETON_DISPATCH_BRIDGE_H
#define LEAPVM_SKELETON_DISPATCH_BRIDGE_H

#include "../v8_headers.h"
#include "skeleton_types.h"

namespace leapvm {
namespace skeleton {

// Bridge that routes V8 function callbacks to leapenv.innerFunc implementations.
class DispatchBridge {
public:
    // Stub callback installed on all skeleton method/accessor stubs; invokes the JS dispatch bridge.
    static void StubCallback(const v8::FunctionCallbackInfo<v8::Value>& args);
    // Increment and return the global native hook sequence counter.
    // Shared with skeleton symbol interceptors so all hook log lines share one numbering sequence.
    static uint64_t NextHookSeq();
};

}  // namespace skeleton
}  // namespace leapvm

#endif  // LEAPVM_SKELETON_DISPATCH_BRIDGE_H
