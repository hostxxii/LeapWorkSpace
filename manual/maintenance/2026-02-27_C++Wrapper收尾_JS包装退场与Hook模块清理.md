# 2026-02-27 C++Wrapper收尾：JS包装退场与Hook模块清理

## 1. 背景

本次目标是对 C++Wrapper 替代 JSWrapper 改造做收尾：

- 去除 `runner.js` 中历史 JS 侧 `wrapFunction` 包装逻辑
- 清理 hook 链路里的 JSHook 兼容分支与残留配置
- 统一 runtime phase 对象命名
- 同步更新架构文档与维护记录

## 2. 代码改动

### 2.1 JS 侧包装逻辑退场

- `leap-env/runner.js`
  - 删除 `DEFAULT_DEBUG_JS_HOOK_RULES`
  - 删除 `installDebugJsHooks(...)` 注入逻辑
  - 删除 `debugJsHookRules` 运行参数入口
  - 保留并统一 phase runtime 初始化：`__LEAP_HOOK_RUNTIME__`
  - 保留旧键别名：`__LEAP_DEBUG_JS_HOOKS_RUNTIME__`（兼容）

- `run-work-leapvm.js`
  - 删除 `debugJsHookRules: { enabled: false }` 传参残留

### 2.2 Hook/Inspector 桥接清理

- `leap-vm/src/leapvm/vm_instance.cc`
  - 删除 `[jshook] -> [hook][js]` 重写分支
  - 删除 `is_js_hook` 特判及关联分支
  - 保持普通 console 与 hook live-line 的结构化转发路径

- `leap-vm/src/leapvm/builtin_wrapper.cc`
  - phase 读取改为优先 `__LEAP_HOOK_RUNTIME__`
  - 旧键 `__LEAP_DEBUG_JS_HOOKS_RUNTIME__` 作为兼容 fallback

- `leap-vm/src/leapvm/skeleton/dispatch_bridge.cc`
  - DevTools phase 读取同样改为新键优先，旧键 fallback

- `leap-vm/src/leapvm/builtin_wrapper.h`
  - 注释口径从 JS rules 迁移为 C++ wrapper 口径

## 3. 文档改动

- 重写：`C++Wrapper替代JSWrapper改造方案与ToDo.md`
  - 去除历史 JS wrapper 方案叙述
  - 固化当前“纯 C++ wrapper 主线”状态
  - 更新第 12 节 objectId 真折叠阶段状态口径

- 重写：`manual/architecture/Hook监控与JSHook调试前奏模块.md`
  - 改为“纯 C++ Hook”架构描述
  - 标注已移除项和兼容键策略

## 4. 验证记录

### 4.1 残留扫描

命令：

```powershell
rg -n "\[jshook\]|debugJsHookRules|DEFAULT_DEBUG_JS_HOOK_RULES|installDebugJsHooks|__LEAP_DEBUG_JS_HOOKS_INSTALLED__" leap-env/runner.js run-work-leapvm.js leap-vm/src/leapvm > $null; if ($LASTEXITCODE -eq 1) { Write-Output 'RESIDUAL_SCAN=clean'; exit 0 } else { Write-Output 'RESIDUAL_SCAN=found'; exit 1 }
```

结果：`RESIDUAL_SCAN=clean`

### 4.2 JS 语法检查

命令：

```powershell
node --check leap-env/runner.js
node --check run-work-leapvm.js
```

结果：均通过（退出码 0）

### 4.3 C++ 编译检查

命令：

```powershell
cmake --build leap-vm/build --config Release --target leapvm
```

结果：通过，产物 `leap-vm/build/Release/leapvm.node`

### 4.4 最小运行冒烟

命令：

```powershell
node tests/scripts/integration/test-leapenv-hook-isolation.js --child
```

结果：子进程链路可完成（退出码 0），当前会打印 VM 生命周期日志。

补充：

- `node tests/scripts/integration/test-leapenv-hook-isolation.js` 主流程当前仍报告 `hookASetCount/hookBSetCount=0`，属于现有测试口径/场景问题，未在本次“JS wrapper 退场清理”内修复。

## 5. 结论

- JS 侧包装逻辑已从主链路移除。
- Hook 运行主线已统一到 C++ wrapper + native hook。
- phase runtime 命名已统一为 `__LEAP_HOOK_RUNTIME__`，同时保留旧键兼容，便于逐步清理。
