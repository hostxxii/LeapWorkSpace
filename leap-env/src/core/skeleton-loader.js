// Skeleton Loader - 在 runtime 之后, tools 之前加载
// 负责收集所有 skeleton 描述并调用 LeapVM bridge defineEnvironmentSkeleton

(function (global) {
    const leapenv = global.leapenv || (global.leapenv = {});
    const safeConsole = (global.console && typeof global.console.log === 'function') ? global.console : null;

    // 初始化 skeleton 相关的命名空间
    leapenv.skeletonObjects = leapenv.skeletonObjects || [];
    leapenv.skeletonLoaded = false;

    function cloneSkeletonObjectWithProps(skeleton, nextProps) {
        const cloned = {};
        const keys = Object.keys(skeleton || {});
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            cloned[key] = skeleton[key];
        }
        cloned.props = nextProps;
        return cloned;
    }

    function toLookup(list) {
        const map = Object.create(null);
        if (!Array.isArray(list)) return map;
        for (let i = 0; i < list.length; i++) {
            map[String(list[i])] = true;
        }
        return map;
    }

    function resolveProfileAction(name, policy) {
        if (!policy) return 'keep';
        const key = String(name);
        if (policy.allow && policy.allow[key]) return 'allow';
        if (policy.hide && policy.hide[key]) return 'hide';
        if (policy.placeholder && policy.placeholder[key]) return 'placeholder';
        return policy.defaultAction || 'keep';
    }

    function filterWindowInstanceProps(props, rawPolicy, stats) {
        if (!props || typeof props !== 'object') {
            return props;
        }

        const policy = rawPolicy || {};
        const lookupPolicy = {
            defaultAction: policy.defaultAction || 'keep',
            allow: toLookup(policy.allowlist || []),
            placeholder: toLookup(policy.placeholder || []),
            hide: toLookup(policy.hide || [])
        };

        const keys = Object.keys(props);
        const nextProps = {};
        let changed = false;

        for (let i = 0; i < keys.length; i++) {
            const propName = keys[i];
            const action = resolveProfileAction(propName, lookupPolicy);

            if (action === 'hide') {
                changed = true;
                if (stats) stats.hiddenWindowProps += 1;
                continue;
            }

            if (action === 'placeholder' && stats) {
                stats.placeholderWindowProps += 1;
            }
            if (action === 'allow' && stats) {
                stats.allowlistedWindowProps += 1;
            }

            nextProps[propName] = props[propName];
        }

        if (!changed) {
            return props;
        }

        return nextProps;
    }

    function filterSkeletonObjectsForProfile(objects) {
        const source = Array.isArray(objects) ? objects : [];
        const fp = leapenv.fingerprintProfile;
        const config = leapenv.config || {};
        const profileName = config.signatureProfile || 'fp-lean';
        const stats = {
            profileName,
            inputObjects: source.length,
            outputObjects: 0,
            hiddenObjects: 0,
            hiddenWindowProps: 0,
            placeholderWindowProps: 0,
            allowlistedWindowProps: 0
        };

        if (!fp || typeof fp.resolveProfile !== 'function') {
            stats.outputObjects = source.length;
            return { objects: source, stats };
        }

        const resolved = fp.resolveProfile(profileName);
        const rules = (resolved && resolved.rules) || {};
        const objectPolicy = {
            defaultAction: (rules.objectPolicy && rules.objectPolicy.defaultAction) || 'keep',
            allow: toLookup(rules.objectPolicy && rules.objectPolicy.allow),
            placeholder: toLookup(rules.objectPolicy && rules.objectPolicy.placeholder),
            hide: toLookup(rules.objectPolicy && rules.objectPolicy.hide)
        };

        const filtered = [];
        for (let i = 0; i < source.length; i++) {
            const skeleton = source[i];
            const skeletonName = skeleton && skeleton.name ? String(skeleton.name) : '';
            const objectAction = resolveProfileAction(skeletonName, objectPolicy);
            if (objectAction === 'hide') {
                stats.hiddenObjects += 1;
                continue;
            }

            if (skeletonName === 'window.instance') {
                const nextProps = filterWindowInstanceProps(
                    skeleton.props,
                    rules.windowInstance,
                    stats
                );
                if (nextProps !== skeleton.props) {
                    filtered.push(cloneSkeletonObjectWithProps(skeleton, nextProps));
                } else {
                    filtered.push(skeleton);
                }
                continue;
            }

            filtered.push(skeleton);
        }

        stats.profileName = (resolved && resolved.name) || stats.profileName;
        stats.outputObjects = filtered.length;
        leapenv.lastSkeletonProfileStats = stats;
        return { objects: filtered, stats };
    }

    leapenv.filterSkeletonObjectsForProfile = filterSkeletonObjectsForProfile;

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

        // 构建 EnvDescriptor
        const filterResult = filterSkeletonObjectsForProfile(leapenv.skeletonObjects);

        const envDescriptor = {
            schemaVersion: 1,
            envVersion,
            objects: filterResult.objects
        };

        // 调用 C++ API
        try {
            nativeBridge.defineEnvironmentSkeleton(envDescriptor);
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
