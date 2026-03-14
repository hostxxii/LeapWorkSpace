// Skeleton Loader - 在 runtime 之后, tools 之前加载
// 负责收集所有 skeleton 描述并调用 LeapVM bridge defineEnvironmentSkeleton

(function (global) {
    const leapenv = global.leapenv || (global.leapenv = {});
    const safeConsole = (global.console && typeof global.console.log === 'function') ? global.console : null;

    function readPerfTraceBootstrapFlag() {
        const bootstrap = leapenv && leapenv.__runtimeBootstrap && typeof leapenv.__runtimeBootstrap === 'object'
            ? leapenv.__runtimeBootstrap
            : (global.__LEAP_BOOTSTRAP__ && typeof global.__LEAP_BOOTSTRAP__ === 'object'
                ? global.__LEAP_BOOTSTRAP__
                : null);
        return !!(bootstrap && bootstrap.perfTraceEnabled);
    }

    function isPerfTraceEnabled() {
        const runtime = leapenv && typeof leapenv.getRuntimeStore === 'function'
            ? leapenv.getRuntimeStore()
            : null;
        const runtimeConfig = runtime && runtime.config && typeof runtime.config === 'object'
            ? runtime.config
            : null;
        if (runtimeConfig && typeof runtimeConfig.perfTraceEnabled === 'boolean') {
            return runtimeConfig.perfTraceEnabled;
        }
        if (typeof process !== 'undefined' && process.env && process.env.LEAP_PERF_TRACE === '1') {
            return true;
        }
        return readPerfTraceBootstrapFlag();
    }

    const perfNow = (global.performance && typeof global.performance.now === 'function')
        ? function () { return global.performance.now(); }
        : function () { return Date.now(); };

    function getPerfNow() {
        return perfNow();
    }

    function recordSkeletonLoadPerf(durationMs) {
        const runtime = leapenv && typeof leapenv.getRuntimeStore === 'function'
            ? leapenv.getRuntimeStore()
            : null;
        if (!runtime || typeof runtime !== 'object' || !isPerfTraceEnabled()) {
            return;
        }
        runtime.perf = runtime.perf && typeof runtime.perf === 'object'
            ? runtime.perf
            : {};
        runtime.perf.bundle = runtime.perf.bundle && typeof runtime.perf.bundle === 'object'
            ? runtime.perf.bundle
            : {};
        runtime.perf.bundle.skeletonLoad = runtime.perf.bundle.skeletonLoad &&
            typeof runtime.perf.bundle.skeletonLoad === 'object'
            ? runtime.perf.bundle.skeletonLoad
            : { totalMs: 0, count: 0 };
        runtime.perf.bundle.skeletonLoad.totalMs += Math.max(0, durationMs);
        runtime.perf.bundle.skeletonLoad.count += 1;
    }

    // 初始化 skeleton 相关的命名空间
    leapenv.skeletonObjects = leapenv.skeletonObjects || [];
    leapenv.skeletonLoaded = false;

    // 定义加载器函数 (将在所有 skeleton 文件加载后调用)
    leapenv.loadSkeleton = function() {
        const envVersion =
            (typeof process !== 'undefined' && process.env && process.env.LEAP_ENV_VERSION) ||
            leapenv.envVersion ||
            '1.0.0';

        // 检查是否已经加载
        if (leapenv.skeletonLoaded) {
            return;
        }

        const nativeBridge = (typeof leapenv.getNativeBridge === 'function')
            ? leapenv.getNativeBridge()
            : null;

        // 检查是否在 LeapVM 环境中
        if (!nativeBridge ||
            typeof nativeBridge.defineEnvironmentSkeleton !== 'function') {
            throw new Error(
                '[leapenv][skeleton] FATAL: native bridge defineEnvironmentSkeleton not available. ' +
                'Skeleton-based environment REQUIRES LeapVM. ' +
                'Old JS def/instance approach is deprecated and removed.'
            );
        }

        // 构建 EnvDescriptor — 所有骨架直接传入，不做过滤
        const envDescriptor = {
            schemaVersion: 1,
            envVersion,
            objects: Array.isArray(leapenv.skeletonObjects) ? leapenv.skeletonObjects : []
        };

        // 调用 C++ API
        try {
            const perfStart = isPerfTraceEnabled() ? getPerfNow() : 0;
            nativeBridge.defineEnvironmentSkeleton(envDescriptor);
            if (isPerfTraceEnabled()) {
                recordSkeletonLoadPerf(getPerfNow() - perfStart);
            }
            leapenv.skeletonLoaded = true;
        } catch (err) {
            try { global.__envError = err; } catch (_) {}
            if (safeConsole && typeof safeConsole.error === 'function') {
                safeConsole.error('[leapenv][skeleton] Failed to load skeleton:', err);
            }
            throw err;
        }
    };

})(globalThis);
