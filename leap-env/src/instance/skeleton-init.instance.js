// Skeleton Initialization - 在 skeleton 定义加载后, 其他 instance 之前执行
// 负责调用 leapenv.loadSkeleton() 来创建 C++ 壳

(function (global) {
    const leapenv = global.leapenv || (global.leapenv = {});

    // 确保 loadSkeleton 函数已定义
    if (typeof leapenv.loadSkeleton !== 'function') {
        throw new Error('[leapenv][skeleton-init] leapenv.loadSkeleton not found, skeleton not loaded');
    }

    // 调用 skeleton loader
    leapenv.loadSkeleton();

    // Skeleton 加载后，Window 上的部分 API 可能由原生 stub 暴露为
    // 非构造函数；这里统一安装可构造包装，确保 `new XMLHttpRequest()`
    // 等调用路径可用。
    if (typeof leapenv.installConstructibleWindowWrappers === 'function') {
        leapenv.installConstructibleWindowWrappers();
    }

    // I-1: dispatch 路由一致性校验
    // 仅在宿主显式注入 globalThis.__LEAP_DEV__ = true 时才运行，
    // 避免 16 个 pool worker 每次启动均触发 1673 条警告和 1ms 校验开销。
    // 开启方法：在 beforeRunScript 中加 `globalThis.__LEAP_DEV__ = true;`
    if (typeof globalThis.__LEAP_DEV__ !== 'undefined' && globalThis.__LEAP_DEV__ &&
        typeof leapenv.validateDispatchRoutes === 'function') {
        leapenv.validateDispatchRoutes();
    }

    // 修复错误的原型链
    if (global.Window && global.EventTarget) {
        Object.setPrototypeOf(global.Window, global.EventTarget);
    }

    // 收敛 leapenv 外露面（Phase 1）：将 globalThis.leapenv 替换为最小 facade。
    // 内部完整 leapenv 仍由各模块闭包持有，不影响运行时功能。
    if (typeof leapenv.finalizeFacade === 'function') {
        try { leapenv.finalizeFacade(); } catch (_) {}
    }
    if (typeof leapenv.lockdownGlobalFacade === 'function') {
        try { leapenv.lockdownGlobalFacade(); } catch (_) {}
    }

})(globalThis);
