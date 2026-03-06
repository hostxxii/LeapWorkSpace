# C3 减初始化实验

- 结果：跳过独立实验
- 原因：Worker 内多任务已复用同一 VmInstance/Isolate/Context；当前主要问题是 shutdown 不闭环，不是每任务重复初始化。

## 证据

- leap-env/src/pool/thread-worker.js: handleInit() 中 initializeEnvironment() 只在 worker 初始化时调用一次
- leap-env/src/pool/thread-worker.js: handleRunSignature() 仅执行 executeSignatureTask()，不会重建环境
- leap-vm/src/leapvm/vm_instance.cc: VmInstance 在 worker 生命周期内创建一次主 Context
- benchmarks/report/lifecycle-audit.md: 第 5 次审计已确认任务间复用同一 Context

- JSON 结果：benchmarks/results/experiment-c3-reduce-init-20260306_200428.json
