#pragma once

#include <napi.h>
#include "../leapvm/vm_instance.h"
#include <memory>

namespace leapvm::addon {

class VmInstanceWrapper : public Napi::ObjectWrap<VmInstanceWrapper> {
public:
    static Napi::Function Init(Napi::Env env);

    explicit VmInstanceWrapper(const Napi::CallbackInfo& info);
    ~VmInstanceWrapper() override;

    VmInstance* instance() const { return vm_.get(); }

private:
    static Napi::FunctionReference constructor_;

    std::unique_ptr<VmInstance> vm_;

    void EnsureAlive(const Napi::Env& env) const;

    Napi::Value RunScript(const Napi::CallbackInfo& info);
    Napi::Value RunLoop(const Napi::CallbackInfo& info);
    Napi::Value Shutdown(const Napi::CallbackInfo& info);
    Napi::Value SetMonitorEnabled(const Napi::CallbackInfo& info);
    Napi::Value SetHookLogEnabled(const Napi::CallbackInfo& info);
    Napi::Value SetPropertyBlacklist(const Napi::CallbackInfo& info);
    Napi::Value SetPropertyWhitelist(const Napi::CallbackInfo& info);
    Napi::Value EnableInspector(const Napi::CallbackInfo& info);
    Napi::Value WaitForInspectorConnection(const Napi::CallbackInfo& info);
    Napi::Value InstallBuiltinWrappers(const Napi::CallbackInfo& info);
};

}  // namespace leapvm::addon