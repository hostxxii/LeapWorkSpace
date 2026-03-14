// TaskProtocol — 从 runner.js 移植的脚本生成逻辑
// 本质：拼 JS 字符串 → 喂给 VmInstance::RunScript()
//
// Combined 路径对齐 runner.js:1377 — 全部变量定义在同一个 block scope，
// setup/target 在 try 块中，cleanup 在 finally 块中复用同一组引用，
// 避免 target 改坏 globalThis.leapenv 后 cleanup 取到错误对象。

#include "task_protocol.h"
#include "worker_pool.h"
#include "vm_instance.h"
#include "log.h"

#include <sstream>

namespace leapvm {
namespace service {

const std::string TaskProtocol::kUndefined = "undefined";

// Default hook blacklists (matching runner.js DEFAULT_OBJECT_BLACKLIST etc.)
static const std::vector<std::string> kDefaultObjectBlacklist = {
    "console",
    "Object", "Function", "Array", "String", "Number", "Boolean",
    "Symbol", "BigInt", "Math", "Date", "RegExp", "Error",
    "Map", "WeakMap", "Set", "WeakSet",
    "Promise", "Proxy", "Reflect",
    "JSON", "Intl",
    "ArrayBuffer", "DataView",
    "Int8Array", "Uint8Array", "Uint8ClampedArray",
    "Int16Array", "Uint16Array",
    "Int32Array", "Uint32Array",
    "Float32Array", "Float64Array",
    "BigInt64Array", "BigUint64Array"
};

static const std::vector<std::string> kDefaultPropertyBlacklist = {
    "constructor", "prototype"
};

static const std::vector<std::string> kDefaultPrefixBlacklist = {
    "__"
};

// Default builtin wrapper targets (P0: 核心检测点).
// 按优先级分层，先全量开启再用 blacklist 收紧。
// P1/P2 高频 API 默认关闭，可在 run-work-leapvm.js 中按需覆写。
static const std::vector<BuiltinWrapperTarget> kDefaultBuiltinTargets = {
    // Hook 伪装 & descriptor
    {"Function.prototype.toString",      "Function.prototype.toString"},
    {"Object.getOwnPropertyDescriptor",  "Object.getOwnPropertyDescriptor"},
    {"Object.getOwnPropertyDescriptors", "Object.getOwnPropertyDescriptors"},
    {"Object.getOwnPropertyNames",       "Object.getOwnPropertyNames"},
    {"Object.getOwnPropertySymbols",     "Object.getOwnPropertySymbols"},
    {"Object.keys",                      "Object.keys"},
    {"Reflect.ownKeys",                  "Reflect.ownKeys"},
    {"Reflect.getOwnPropertyDescriptor", "Reflect.getOwnPropertyDescriptor"},
    // 原型链
    {"Object.getPrototypeOf",            "Object.getPrototypeOf"},
    {"Reflect.getPrototypeOf",           "Reflect.getPrototypeOf"},
    {"Object.prototype.hasOwnProperty",  "Object.prototype.hasOwnProperty"},
    // toString / 类型标签
    {"Object.prototype.toString",        "Object.prototype.toString"},
    // 代码执行
    {"eval",                             "eval"},
    // 错误堆栈检测（accessor property, 风控通过 Error.stack 检查调用栈格式）
    {"Error.prototype.stack",            "Error.prototype.stack",
     BuiltinWrapperKind::kAccessor},
    // 属性定义 / 反篡改
    {"Object.defineProperty",            "Object.defineProperty"},
};

void TaskProtocol::ConfigureHooks(VmInstance* vm) {
    LEAPVM_LOG_INFO("Configuring hook rules...");
    vm->SetHookLogEnabled(true);
    vm->SetPropertyBlacklist(kDefaultObjectBlacklist,
                             kDefaultPropertyBlacklist,
                             kDefaultPrefixBlacklist);
}

void TaskProtocol::InstallBuiltinHooks(VmInstance* vm) {
    LEAPVM_LOG_INFO("Installing builtin wrapper hooks...");
    BuiltinWrapperConfig bw_config;
    bw_config.enabled = true;
    bw_config.phase = "task";
    bw_config.targets = kDefaultBuiltinTargets;
    vm->InstallBuiltinWrappers(std::move(bw_config));
}

std::string TaskProtocol::BuildBootstrapScript(const WorkerPoolConfig& config) {
    // Matching runner.js runDebugPrelude + buildBootstrapPayload
    std::ostringstream ss;
    ss << R"JS(
(function () {
  try {
    var localConsole = (typeof console !== 'undefined') ? console : {};
    localConsole.log = localConsole.log || function(){};
    localConsole.warn = localConsole.warn || function(){};
    localConsole.error = localConsole.error || function(){};
    localConsole.info = localConsole.info || function(){};
    Object.defineProperty(globalThis, 'console', {
      value: localConsole,
      writable: true,
      configurable: false,
      enumerable: true
    });
    if (typeof globalThis.leapenv === 'undefined') {
      globalThis.leapenv = {};
    }
    Object.defineProperty(globalThis, 'leapenv', {
      value: globalThis.leapenv,
      writable: true,
      enumerable: false,
      configurable: true
    });
    var leapenvOwnKeys = Object.keys(globalThis.leapenv || {});
    for (var i = 0; i < leapenvOwnKeys.length; i++) {
      var key = leapenvOwnKeys[i];
      try {
        var desc = Object.getOwnPropertyDescriptor(globalThis.leapenv, key);
        if (!desc) continue;
        if (!desc.configurable && desc.enumerable) continue;
        if ((desc.get || desc.set)) {
          Object.defineProperty(globalThis.leapenv, key, {
            get: desc.get,
            set: desc.set,
            enumerable: false,
            configurable: desc.configurable
          });
        } else {
          Object.defineProperty(globalThis.leapenv, key, {
            value: desc.value,
            writable: desc.writable,
            enumerable: false,
            configurable: desc.configurable
          });
        }
      } catch (_) {}
    }
    var bootstrap = {
      "domBackend": "dod",
      "bridgeExposureMode": "strict",
      "globalFacadeMode": "strict",
      "perfTraceEnabled": false,
      "perfDispatchCacheEnabled": false,
      "debugEnabled": false,
      "hookRuntimeSeed": {
        "active": false,
        "phase": "bundle"
      }
    };
    bootstrap.hostTimers = {
      setTimeout: (typeof globalThis.setTimeout === 'function') ? globalThis.setTimeout.bind(globalThis) : null,
      clearTimeout: (typeof globalThis.clearTimeout === 'function') ? globalThis.clearTimeout.bind(globalThis) : null,
      setInterval: (typeof globalThis.setInterval === 'function') ? globalThis.setInterval.bind(globalThis) : null,
      clearInterval: (typeof globalThis.clearInterval === 'function') ? globalThis.clearInterval.bind(globalThis) : null
    };
    try {
      Object.defineProperty(globalThis.leapenv, '__runtimeBootstrap', {
        value: bootstrap,
        writable: true,
        configurable: true,
        enumerable: false
      });
    } catch (_) {
      globalThis.leapenv.__runtimeBootstrap = bootstrap;
    }
  } catch (e) {}
})();
//# sourceURL=leapenv.debug.prelude.js
)JS";

    return ss.str();
}

std::string TaskProtocol::WrapBundleScript(const std::string& bundle_code) {
    // Matching runner.js runEnvironmentBundle wrapping
    return "try {\n" + bundle_code +
           "\n} catch (e) { try { globalThis.__envError = e; } catch(_) {} "
           "if (typeof console !== 'undefined' && console && typeof console.error === 'function') "
           "{ console.error('[env error]', e && e.stack ? e.stack : e); } throw e; }\n"
           "//# sourceURL=leapenv.bundle.exec.js";
}

std::string TaskProtocol::JsonEscape(const std::string& input) {
    std::ostringstream ss;
    ss << '"';
    for (char c : input) {
        switch (c) {
            case '"':  ss << "\\\""; break;
            case '\\': ss << "\\\\"; break;
            case '\b': ss << "\\b"; break;
            case '\f': ss << "\\f"; break;
            case '\n': ss << "\\n"; break;
            case '\r': ss << "\\r"; break;
            case '\t': ss << "\\t"; break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    char hex[8];
                    std::snprintf(hex, sizeof(hex), "\\u%04x",
                                  static_cast<unsigned int>(static_cast<unsigned char>(c)));
                    ss << hex;
                } else {
                    ss << c;
                }
                break;
        }
    }
    ss << '"';
    return ss.str();
}

const std::string& TaskProtocol::SnapshotOrUndefined(const std::string& json) {
    return json.empty() ? kUndefined : json;
}

std::string TaskProtocol::BuildTaskSetupScript(const TaskRequest& request) {
    const std::string safe_task_id = JsonEscape(request.id);
    const std::string& fp_json = SnapshotOrUndefined(request.fingerprint_json);
    const std::string& storage_json = SnapshotOrUndefined(request.storage_json);
    const std::string& doc_json = SnapshotOrUndefined(request.document_json);
    const std::string& sp_json = SnapshotOrUndefined(request.storage_policy_json);

    std::ostringstream ss;
    ss << "(function () {\n"
       << "  const __leapEnv = (typeof globalThis.leapenv !== 'undefined') ? globalThis.leapenv : null;\n"
       << "  const __leapDomService = (__leapEnv && __leapEnv.domShared) ? __leapEnv.domShared : null;\n"
       << "  const __leapRuntime = (__leapEnv && typeof __leapEnv.getRuntimeStore === 'function')\n"
       << "    ? __leapEnv.getRuntimeStore()\n"
       << "    : (__leapEnv && __leapEnv.__runtime ? __leapEnv.__runtime : null);\n"
       << "  const __leapHookRuntime = (__leapRuntime && __leapRuntime.debug) ? __leapRuntime.debug.hookRuntime : null;\n"
       << "  if (__leapHookRuntime) {\n"
       << "    __leapHookRuntime.phase = 'setup';\n"
       << "    __leapHookRuntime.active = false;\n"
       << "  }\n"
       << "  if (__leapEnv && typeof __leapEnv.beginTask === 'function') {\n"
       << "    __leapEnv.beginTask(" << safe_task_id << ");\n"
       << "  }\n"
       << "  if (__leapDomService && typeof __leapDomService.beginTaskScope === 'function') {\n"
       << "    __leapDomService.beginTaskScope(" << safe_task_id << ");\n"
       << "  }\n"
       << "  if (__leapEnv && typeof __leapEnv.applyFingerprintSnapshot === 'function') {\n"
       << "    const __leapFingerprintSnapshot = " << fp_json << ";\n"
       << "    if (typeof __leapFingerprintSnapshot !== 'undefined') {\n"
       << "      __leapEnv.applyFingerprintSnapshot(__leapFingerprintSnapshot);\n"
       << "    }\n"
       << "  }\n"
       << "  if (__leapEnv && typeof __leapEnv.applyStorageSnapshot === 'function') {\n"
       << "    const __leapStorageSnapshot = " << storage_json << ";\n"
       << "    const __leapStoragePolicy = " << sp_json << ";\n"
       << "    if (typeof __leapStorageSnapshot !== 'undefined') {\n"
       << "      __leapEnv.applyStorageSnapshot(__leapStorageSnapshot, __leapStoragePolicy);\n"
       << "    }\n"
       << "  }\n"
       << "  if (__leapEnv && typeof __leapEnv.applyDocumentSnapshot === 'function') {\n"
       << "    const __leapDocumentSnapshot = " << doc_json << ";\n"
       << "    if (typeof __leapDocumentSnapshot !== 'undefined') {\n"
       << "      __leapEnv.applyDocumentSnapshot(__leapDocumentSnapshot);\n"
       << "    }\n"
       << "  }\n"
       << "  if (__leapHookRuntime) {\n"
       << "    __leapHookRuntime.phase = 'task';\n"
       << "    __leapHookRuntime.active = true;\n"
       << "  }\n"
       << "})();";
    return ss.str();
}

std::string TaskProtocol::BuildTaskCleanupScript(const std::string& safe_task_id) {
    std::ostringstream ss;
    ss << "(function () {\n"
       << "  const __leapEnv = (typeof globalThis.leapenv !== 'undefined') ? globalThis.leapenv : null;\n"
       << "  const __leapDomService = (__leapEnv && __leapEnv.domShared) ? __leapEnv.domShared : null;\n"
       << "  const __leapRuntime = (__leapEnv && typeof __leapEnv.getRuntimeStore === 'function')\n"
       << "    ? __leapEnv.getRuntimeStore()\n"
       << "    : (__leapEnv && __leapEnv.__runtime ? __leapEnv.__runtime : null);\n"
       << "  const __leapHookRuntime = (__leapRuntime && __leapRuntime.debug) ? __leapRuntime.debug.hookRuntime : null;\n"
       << "  if (__leapHookRuntime) {\n"
       << "    try {\n"
       << "      __leapHookRuntime.active = false;\n"
       << "      __leapHookRuntime.phase = 'idle';\n"
       << "    } catch (_) {}\n"
       << "  }\n"
       << "  if (__leapEnv && typeof __leapEnv.resetSignatureTaskState === 'function') {\n"
       << "    try { __leapEnv.resetSignatureTaskState(); } catch (_) {}\n"
       << "  }\n"
       << "  if (__leapDomService && typeof __leapDomService.endTaskScope === 'function') {\n"
       << "    __leapDomService.endTaskScope(" << safe_task_id << ");\n"
       << "  }\n"
       << "  if (__leapEnv && typeof __leapEnv.endTask === 'function') {\n"
       << "    try { __leapEnv.endTask(" << safe_task_id << "); } catch (_) {}\n"
       << "  }\n"
       << "})();";
    return ss.str();
}

std::string TaskProtocol::BuildCachedTaskTargetSource(const std::string& target_script) {
    return "{\n" + target_script + "\n}";
}

std::string TaskProtocol::BuildCombinedScript(const TaskRequest& request,
                                               const WorkerPoolConfig& config) {
    // 精确对齐 runner.js:1377 Combined 路径。
    //
    // 关键语义：__leapEnv / __leapDomService / __leapRuntime / __leapHookRuntime
    // 在 block 顶部定义一次，try/finally 共享同一组引用。
    // 这样即使 target 期间改坏了 globalThis.leapenv，finally 里的清理
    // 仍然操作的是 setup 阶段捕获的对象。

    const std::string safe_task_id = JsonEscape(request.id);
    const std::string& fp_json = SnapshotOrUndefined(request.fingerprint_json);
    const std::string& storage_json = SnapshotOrUndefined(request.storage_json);
    const std::string& doc_json = SnapshotOrUndefined(request.document_json);
    const std::string& sp_json = SnapshotOrUndefined(request.storage_policy_json);

    std::ostringstream ss;
    ss << "{\n"

    // ── block-scope 共享变量 ──
       << "  const __leapEnv = (typeof globalThis.leapenv !== 'undefined') ? globalThis.leapenv : null;\n"
       << "  const __leapDomService = (__leapEnv && __leapEnv.domShared) ? __leapEnv.domShared : null;\n"
       << "  const __leapRuntime = (__leapEnv && typeof __leapEnv.getRuntimeStore === 'function')\n"
       << "    ? __leapEnv.getRuntimeStore()\n"
       << "    : (__leapEnv && __leapEnv.__runtime ? __leapEnv.__runtime : null);\n"
       << "  const __leapHookRuntime = (__leapRuntime && __leapRuntime.debug) ? __leapRuntime.debug.hookRuntime : null;\n"

    // ── try: setup + target ──
       << "  try {\n"

    // setup: hook phase
       << "    if (__leapHookRuntime) {\n"
       << "      __leapHookRuntime.phase = 'setup';\n"
       << "      __leapHookRuntime.active = false;\n"
       << "    }\n"

    // setup: beginTask + beginTaskScope
       << "    if (__leapEnv && typeof __leapEnv.beginTask === 'function') {\n"
       << "      __leapEnv.beginTask(" << safe_task_id << ");\n"
       << "    }\n"
       << "    if (__leapDomService && typeof __leapDomService.beginTaskScope === 'function') {\n"
       << "      __leapDomService.beginTaskScope(" << safe_task_id << ");\n"
       << "    }\n"

    // setup: applyFingerprintSnapshot
       << "    if (__leapEnv && typeof __leapEnv.applyFingerprintSnapshot === 'function') {\n"
       << "      const __leapFingerprintSnapshot = " << fp_json << ";\n"
       << "      if (typeof __leapFingerprintSnapshot !== 'undefined') {\n"
       << "        __leapEnv.applyFingerprintSnapshot(__leapFingerprintSnapshot);\n"
       << "      }\n"
       << "    }\n"

    // setup: applyStorageSnapshot
       << "    if (__leapEnv && typeof __leapEnv.applyStorageSnapshot === 'function') {\n"
       << "      const __leapStorageSnapshot = " << storage_json << ";\n"
       << "      const __leapStoragePolicy = " << sp_json << ";\n"
       << "      if (typeof __leapStorageSnapshot !== 'undefined') {\n"
       << "        __leapEnv.applyStorageSnapshot(__leapStorageSnapshot, __leapStoragePolicy);\n"
       << "      }\n"
       << "    }\n"

    // setup: applyDocumentSnapshot
       << "    if (__leapEnv && typeof __leapEnv.applyDocumentSnapshot === 'function') {\n"
       << "      const __leapDocumentSnapshot = " << doc_json << ";\n"
       << "      if (typeof __leapDocumentSnapshot !== 'undefined') {\n"
       << "        __leapEnv.applyDocumentSnapshot(__leapDocumentSnapshot);\n"
       << "      }\n"
       << "    }\n"

    // setup: transition hook phase to 'task'
       << "    if (__leapHookRuntime) {\n"
       << "      __leapHookRuntime.phase = 'task';\n"
       << "      __leapHookRuntime.active = true;\n"
       << "    }\n";

    // beforeScript (optional)
    if (!request.before_script.empty()) {
        ss << request.before_script << "\n";
    }

    // targetScript
    ss << request.target_script << "\n"

    // ── finally: cleanup ──
       << "  } finally {\n"

    // cleanup: disable hooks
       << "    if (__leapHookRuntime) {\n"
       << "      try {\n"
       << "        __leapHookRuntime.active = false;\n"
       << "        __leapHookRuntime.phase = 'idle';\n"
       << "      } catch (_) {}\n"
       << "    }\n"

    // cleanup: resetSignatureTaskState
       << "    if (__leapEnv && typeof __leapEnv.resetSignatureTaskState === 'function') {\n"
       << "      try { __leapEnv.resetSignatureTaskState(); } catch (_) {}\n"
       << "    }\n"

    // cleanup: endTaskScope(safeTaskId)
       << "    if (__leapDomService && typeof __leapDomService.endTaskScope === 'function') {\n"
       << "      __leapDomService.endTaskScope(" << safe_task_id << ");\n"
       << "    }\n"

    // cleanup: endTask(safeTaskId)
       << "    if (__leapEnv && typeof __leapEnv.endTask === 'function') {\n"
       << "      try { __leapEnv.endTask(" << safe_task_id << "); } catch (_) {}\n"
       << "    }\n"

       << "  }\n"
       << "}";

    return ss.str();
}

std::string TaskProtocol::BuildStandaloneCleanupScript(const std::string& safe_task_id) {
    // 独立 cleanup 脚本，用于 Combined 脚本执行失败（比如 V8 异常）后的回退清理。
    // 与 runner.js buildTaskCleanupScript(safeTaskId) 完全对齐。
    std::ostringstream ss;
    ss << "(function () {\n"
       << "  const __leapEnv = (typeof globalThis.leapenv !== 'undefined') ? globalThis.leapenv : null;\n"
       << "  const __leapDomService = (__leapEnv && __leapEnv.domShared) ? __leapEnv.domShared : null;\n"
       << "  const __leapRuntime = (__leapEnv && typeof __leapEnv.getRuntimeStore === 'function')\n"
       << "    ? __leapEnv.getRuntimeStore()\n"
       << "    : (__leapEnv && __leapEnv.__runtime ? __leapEnv.__runtime : null);\n"
       << "  const __leapHookRuntime = (__leapRuntime && __leapRuntime.debug) ? __leapRuntime.debug.hookRuntime : null;\n"
       << "  if (__leapHookRuntime) {\n"
       << "    try {\n"
       << "      __leapHookRuntime.active = false;\n"
       << "      __leapHookRuntime.phase = 'idle';\n"
       << "    } catch (_) {}\n"
       << "  }\n"
       << "  if (__leapEnv && typeof __leapEnv.resetSignatureTaskState === 'function') {\n"
       << "    try { __leapEnv.resetSignatureTaskState(); } catch (_) {}\n"
       << "  }\n"
       << "  if (__leapDomService && typeof __leapDomService.endTaskScope === 'function') {\n"
       << "    __leapDomService.endTaskScope(" << safe_task_id << ");\n"
       << "  }\n"
       << "  if (__leapEnv && typeof __leapEnv.endTask === 'function') {\n"
       << "    try { __leapEnv.endTask(" << safe_task_id << "); } catch (_) {}\n"
       << "  }\n"
       << "})();";
    return ss.str();
}

}  // namespace service
}  // namespace leapvm
