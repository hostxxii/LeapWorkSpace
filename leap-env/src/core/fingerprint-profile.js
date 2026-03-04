// src/core/fingerprint-profile.js
// 签名容器 Profile SSOT（Tier 清单 + 暴露面规则）

(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});

  function uniqueList(list) {
    const seen = Object.create(null);
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const value = String(list[i]);
      if (seen[value]) continue;
      seen[value] = true;
      out.push(value);
    }
    return out;
  }

  function toLookup(list) {
    const map = Object.create(null);
    for (let i = 0; i < list.length; i++) {
      map[String(list[i])] = true;
    }
    return map;
  }

  function cloneList(list) {
    return Array.isArray(list) ? list.slice() : [];
  }

  const TIER_A_OBJECTS = uniqueList([
    'Window.type',
    'WindowProperties.type',
    'window.instance',
    'Document.type',
    'HTMLDocument.type',
    'document.instance',
    'Location.type',
    'location.instance',
    'History.type',
    'history.instance',
    'Navigator.type',
    'navigator.instance',
    'Screen.type',
    'screen.instance',
    'Performance.type',
    'performance.instance',
    'Storage.type',
    'localStorage.instance',
    'sessionStorage.instance',
    'Event.type',
    'EventTarget.type',
    'HTMLAllCollection.type'
  ]);

  const TIER_B_OBJECTS = uniqueList([
    'DOMParser',
    'XMLSerializer',
    'MutationObserver',
    'CustomEvent',
    'MessageEvent',
    'MouseEvent',
    'KeyboardEvent',
    'XMLHttpRequest',
    'fetch'
  ]);

  const TIER_C_OBJECTS = uniqueList([
    'BroadcastChannel',
    'WebSocket',
    'Worker',
    'SharedWorker',
    'ServiceWorker',
    'IndexedDB'
  ]);

  const WINDOW_TIER_A_ALLOWLIST = uniqueList([
    'window',
    'self',
    'globalThis',
    'top',
    'parent',
    'frames',
    'document',
    'location',
    'history',
    'navigator',
    'screen',
    'performance',
    'localStorage',
    'sessionStorage',
    'origin',
    'name',
    'length',
    'closed',
    'isSecureContext',
    'document',
    'Event',
    'EventTarget',
    'HTMLAllCollection',
    'Location',
    'History',
    'Navigator',
    'Screen',
    'Performance',
    'Storage',
    'Document',
    'HTMLDocument',
    'Node',
    'Element',
    'HTMLElement',
    'HTMLDivElement',
    'HTMLSpanElement',
    'HTMLAnchorElement',
    'HTMLCanvasElement',
    'HTMLIFrameElement',
    'HTMLUnknownElement',
    'DocumentFragment',
    'Text',
    'Comment',
    'CharacterData',
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'queueMicrotask',
    'crypto',
    'atob',
    'btoa'
  ]);

  // Tier B：保留占位（当前阶段 placeholder = 保留 skeleton 暴露，不做行为改写）
  const WINDOW_PLACEHOLDER_PROPS = uniqueList([
    'DOMParser',
    'XMLSerializer',
    'MutationObserver',
    'CustomEvent',
    'MessageEvent',
    'MouseEvent',
    'KeyboardEvent',
    'XMLHttpRequest',
    'fetch'
  ]);

  const WINDOW_LEAN_HIDE_PROPS = uniqueList([
    'DOMParser',
    'XMLSerializer',
    'MutationObserver',
    'CustomEvent',
    'MessageEvent',
    'MouseEvent',
    'KeyboardEvent',
    'XMLHttpRequest',
    'fetch',
    'WebSocket',
    'Worker',
    'SharedWorker',
    'ServiceWorker',
    'BroadcastChannel'
  ]);

  function normalizeProfileName(name) {
    return String(name == null ? '' : name).trim().toLowerCase() === 'fp-occupy'
      ? 'fp-occupy'
      : 'fp-lean';
  }

  const PROFILE_RULES = {
    'fp-lean': {
      objectPolicy: {
        defaultAction: 'keep',
        allow: [],
        placeholder: [],
        hide: []
      },
      windowInstance: {
        defaultAction: 'keep',
        allowlist: WINDOW_TIER_A_ALLOWLIST,
        placeholder: [],
        hide: WINDOW_LEAN_HIDE_PROPS
      }
    },
    'fp-occupy': {
      objectPolicy: {
        defaultAction: 'keep',
        allow: [],
        placeholder: [],
        hide: []
      },
      windowInstance: {
        defaultAction: 'keep',
        allowlist: WINDOW_TIER_A_ALLOWLIST,
        placeholder: WINDOW_PLACEHOLDER_PROPS,
        hide: []
      }
    }
  };

  function buildResolvedProfile(profileName) {
    const name = normalizeProfileName(profileName);
    const base = PROFILE_RULES[name] || PROFILE_RULES['fp-lean'];
    return {
      name,
      rules: {
        objectPolicy: {
          defaultAction: base.objectPolicy.defaultAction || 'keep',
          allow: cloneList(base.objectPolicy.allow),
          placeholder: cloneList(base.objectPolicy.placeholder),
          hide: cloneList(base.objectPolicy.hide)
        },
        windowInstance: {
          defaultAction: base.windowInstance.defaultAction || 'keep',
          allowlist: cloneList(base.windowInstance.allowlist),
          placeholder: cloneList(base.windowInstance.placeholder),
          hide: cloneList(base.windowInstance.hide)
        }
      }
    };
  }

  leapenv.fingerprintProfile = leapenv.fingerprintProfile || {};
  leapenv.fingerprintProfile.tiers = {
    tierA: cloneList(TIER_A_OBJECTS),
    tierB: cloneList(TIER_B_OBJECTS),
    tierC: cloneList(TIER_C_OBJECTS)
  };
  leapenv.fingerprintProfile.lookups = {
    tierA: toLookup(TIER_A_OBJECTS),
    tierB: toLookup(TIER_B_OBJECTS),
    tierC: toLookup(TIER_C_OBJECTS)
  };
  leapenv.fingerprintProfile.profiles = {
    'fp-lean': buildResolvedProfile('fp-lean'),
    'fp-occupy': buildResolvedProfile('fp-occupy')
  };
  leapenv.fingerprintProfile.normalizeProfileName = normalizeProfileName;
  leapenv.fingerprintProfile.resolveProfile = function (profileName) {
    return buildResolvedProfile(profileName);
  };

})(globalThis);
