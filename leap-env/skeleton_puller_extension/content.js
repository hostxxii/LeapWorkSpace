(function () {
  // ==========================================
  // 1. 基础配置与过滤表 (V8 Built-ins)
  // ==========================================
  const V8_GLOBALS = new Set([
    "Object",
    "Function",
    "Boolean",
    "Symbol",
    "Error",
    "EvalError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "TypeError",
    "URIError",
    "AggregateError",
    "Number",
    "BigInt",
    "String",
    "RegExp",
    "Date",
    "Math",
    "JSON",
    "Reflect",
    "Proxy",
    "Atomics",
    "Intl",
    "Promise",
    "Array",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "WeakRef",
    "FinalizationRegistry",
    "ArrayBuffer",
    "SharedArrayBuffer",
    "DataView",
    "Int8Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "Int16Array",
    "Uint16Array",
    "Int32Array",
    "Uint32Array",
    "Float32Array",
    "Float64Array",
    "BigInt64Array",
    "BigUint64Array",
    "eval",
    "isFinite",
    "isNaN",
    "parseFloat",
    "parseInt",
    "encodeURI",
    "encodeURIComponent",
    "decodeURI",
    "decodeURIComponent",
    "escape",
    "unescape",
    "WebAssembly",
    "globalThis",
    "Infinity",
    "NaN",
    "undefined",
    "Iterator",
  ]);

  const PULL_SCRIPT_INJECTED = new Set([
    "generateSkeleton",
    "generateInstanceSkeleton",
    "batchPull",
    "downloadBundle",
    "downloadAll",
    "__PULL_RESULTS__",
  ]);

  function isV8BuiltinOnWindow(name) {
    return V8_GLOBALS.has(name);
  }

  // ==========================================
  // 2. 拉取清单
  // ==========================================
  const PULL_LIST = [
    // ─── 基础原型链 ───
    { ctor: "EventTarget", instance: null },
    { ctor: "Node", instance: null },
    { ctor: "CharacterData", instance: null },
    { ctor: "Text", instance: null },
    { ctor: "Comment", instance: null },
    { ctor: "Document", instance: null },
    { ctor: "DocumentFragment", instance: null },
    { ctor: "Element", instance: null },

    // ─── DOM 集合 ───
    { ctor: "NamedNodeMap", instance: null },
    { ctor: "NodeList", instance: null },
    { ctor: "DOMTokenList", instance: null },
    { ctor: "HTMLCollection", instance: null },
    { ctor: "HTMLAllCollection", instance: null },

    // ─── HTML 元素 ───
    { ctor: "HTMLElement", instance: null },
    { ctor: "HTMLAnchorElement", instance: null },
    { ctor: "HTMLCanvasElement", instance: null },
    { ctor: "HTMLDivElement", instance: null },
    { ctor: "HTMLIFrameElement", instance: null },
    { ctor: "HTMLScriptElement", instance: null },
    { ctor: "HTMLSpanElement", instance: null },
    { ctor: "HTMLUnknownElement", instance: null },
    { ctor: "HTMLDocument", instance: "document" },
    { ctor: 'HTMLHtmlElement', instance: null },
    { ctor: 'HTMLHeadElement', instance: null },
    { ctor: 'HTMLBodyElement', instance: null },
    { ctor: 'HTMLTitleElement', instance: null },
    { ctor: 'HTMLMetaElement', instance: null },
    { ctor: 'HTMLLinkElement', instance: null },
    { ctor: 'HTMLStyleElement', instance: null },
    { ctor: 'HTMLFormElement', instance: null },
    { ctor: 'HTMLInputElement', instance: null },
    { ctor: 'HTMLButtonElement', instance: null },
    { ctor: 'HTMLTextAreaElement', instance: null },
    { ctor: 'HTMLSelectElement', instance: null },
    { ctor: 'HTMLOptionElement', instance: null },
    { ctor: 'HTMLImageElement', instance: null },
    { ctor: 'HTMLParagraphElement', instance: null },
    { ctor: 'HTMLUListElement', instance: null },
    { ctor: 'HTMLOListElement', instance: null },
    { ctor: 'HTMLLIElement', instance: null },  
    // ─── 事件 ───
    { ctor: "Event", instance: null },

    // ─── 浏览器 API ───
    { ctor: "Navigator", instance: "navigator" },
    { ctor: "Screen", instance: "screen" },
    { ctor: "History", instance: "history" },
    { ctor: "Location", instance: "location" },
    { ctor: "Performance", instance: "performance" },

    // ─── 存储 (同类型多实例) ───
    { ctor: "Storage", instance: "localStorage" },
    { ctor: "Storage", instance: "sessionStorage", instanceOnly: true },

    // ─── 通信 ───
    { ctor: "MessageChannel", instance: null },
    { ctor: "MessagePort", instance: null },

    // ─── 插件 / MIME ───
    { ctor: "Plugin", instance: null },
    { ctor: "PluginArray", instance: null },
    { ctor: "MimeType", instance: null },
    { ctor: "MimeTypeArray", instance: null },

    // ─── 权限 ───
    { ctor: "PermissionStatus", instance: null },

    // ─── Canvas / WebGL ───
    { ctor: "CanvasRenderingContext2D", instance: null },
    { ctor: "WebGLRenderingContext", instance: null },

    // ─── 特殊对象 ───
    { ctor: "Window", instance: "window" },
    { ctor: "WindowProperties", instance: null },

    // ─── 以下为扩展区域, 按需添加 ───
  ];

  // ==========================================
  // 3. 辅助工具函数
  // ==========================================
  const WK_SYMBOL_MAP = new Map([
    [Symbol.iterator, "iterator"],
    [Symbol.asyncIterator, "asyncIterator"],
    [Symbol.toStringTag, "toStringTag"],
    [Symbol.unscopables, "unscopables"],
    [Symbol.hasInstance, "hasInstance"],
    [Symbol.toPrimitive, "toPrimitive"],
  ]);

  function encodeSymbol(sym) {
    const wkName = WK_SYMBOL_MAP.get(sym);
    if (!wkName) return null;
    return "@@" + wkName;
  }

  function toValueType(val) {
    if (val === null) return { type: "null", value: "null" };
    const t = typeof val;
    if (t === "undefined") return { type: "undefined", value: "undefined" };
    if (t === "string") return { type: "string", value: val };
    if (t === "number") return { type: "number", value: String(val) };
    if (t === "boolean")
      return { type: "boolean", value: val ? "true" : "false" };
    return { type: "undefined", value: "undefined" };
  }

  function makePropKey(prop) {
    if (typeof prop === "symbol") {
      return encodeSymbol(prop);
    }
    return String(prop);
  }

  function isIllegalInvocationError(err) {
    const msg = (err && err.message) || String(err);
    return /Illegal invocation/i.test(msg);
  }

  function checkCtorIllegal(Ctor) {
    if (!Ctor) return false;
    try {
      new Ctor();
      return false;
    } catch (e) {
      return /Illegal constructor/i.test((e && e.message) || String(e));
    }
  }

  function getTagName(obj) {
    const tag = Object.prototype.toString.call(obj);
    const m = tag.match(/\[object (.+)\]/);
    return m ? m[1] : undefined;
  }

  // ==========================================
  // 4. 核心抓取逻辑 (精确模式, 无需安全模式)
  // ==========================================
  // document_start + MAIN world: 站点脚本尚未执行, call({}) 探测完全安全

  function collectPropsFromTarget(target, owner, objectName, propsAccumulator) {
    if (!target) return;
    const ownKeys = Reflect.ownKeys(target);

    for (const prop of ownKeys) {
      if (prop === "prototype" && owner === "constructor") continue;
      if (
        owner === "constructor" &&
        ["name", "length", "caller", "arguments"].includes(prop)
      )
        continue;
      if (owner === "prototype" && prop === "constructor") continue;

      const key = makePropKey(prop);
      if (!key) continue;
      if (
        owner === "instance" &&
        objectName === "Window" &&
        (isV8BuiltinOnWindow(key) || PULL_SCRIPT_INJECTED.has(key))
      )
        continue;

      let desc;
      try {
        desc = Object.getOwnPropertyDescriptor(target, prop);
      } catch (e) {
        continue;
      }
      if (!desc) continue;

      const entry = { owner, attributes: {} };
      if ("enumerable" in desc) entry.attributes.enumerable = !!desc.enumerable;
      if ("configurable" in desc)
        entry.attributes.configurable = !!desc.configurable;

      if (typeof desc.get === "function" || typeof desc.set === "function") {
        entry.kind = "accessor";
        let needsBrand = false;
        if (desc.get) {
          try {
            desc.get.call({});
          } catch (e) {
            if (isIllegalInvocationError(e)) needsBrand = true;
          }
        }
        if (!needsBrand && desc.set) {
          try {
            desc.set.call({}, undefined);
          } catch (e) {
            if (isIllegalInvocationError(e)) needsBrand = true;
          }
        }

        entry.brandCheck = needsBrand;
        entry.dispatch = {};
        if (desc.get)
          entry.dispatch.getter = {
            objName: objectName,
            propName: key,
            callType: "get",
          };
        if (desc.set)
          entry.dispatch.setter = {
            objName: objectName,
            propName: key,
            callType: "set",
          };
      } else if (typeof desc.value === "function") {
        entry.kind = "method";
        entry.length = desc.value.length;
        let needsBrand = false;
        try {
          desc.value.call({});
        } catch (e) {
          needsBrand = isIllegalInvocationError(e);
        }
        entry.brandCheck = needsBrand;
        entry.dispatch = {
          objName: objectName,
          propName: key,
          callType: "apply",
        };
        entry.attributes.writable = !!desc.writable;
      } else {
        entry.kind = "data";
        const vt = toValueType(desc.value);
        entry.valueType = vt.type;
        entry.value = vt.value;
        entry.attributes.writable = !!desc.writable;
      }
      propsAccumulator[key] = entry;
    }
  }

  function findHiddenPrototype(name) {
    let p = window;
    while (p) {
      const tagName = getTagName(p);
      if (tagName === name) {
        return { proto: p, ctor: null };
      }
      p = Object.getPrototypeOf(p);
    }
    return null;
  }

  function generateSkeletonInternal(objectName, customInstancePath) {
    let Ctor, Proto, Inst;
    let exposeCtor = true;

    try {
      if (window[objectName]) Ctor = window[objectName];
      else exposeCtor = false;
    } catch (e) {}

    if (!Ctor) {
      const found = findHiddenPrototype(objectName);
      if (found) {
        Proto = found.proto;
        Ctor = found.ctor;
        exposeCtor = false;
      }
    }

    const defaultInstanceName =
      objectName.charAt(0).toLowerCase() + objectName.slice(1);

    const shouldTryInstance = customInstancePath !== null;

    const scrapeExpression = shouldTryInstance
      ? typeof customInstancePath === "string" && customInstancePath !== ""
        ? customInstancePath
        : defaultInstanceName
      : "";

    let jsonInstanceName = "";
    if (customInstancePath === undefined) {
      jsonInstanceName = defaultInstanceName;
    } else if (customInstancePath === null) {
      jsonInstanceName = "";
    } else {
      const lastDot = customInstancePath.lastIndexOf(".");
      jsonInstanceName =
        lastDot >= 0
          ? customInstancePath.slice(lastDot + 1)
          : customInstancePath;
    }

    let validInstance = false;
    if (shouldTryInstance) {
      try {
        let maybeInst;
        if (!scrapeExpression.includes(".")) {
          maybeInst = window[scrapeExpression];
        } else {
          maybeInst = eval(scrapeExpression);
        }
        if (maybeInst !== undefined && maybeInst !== null) {
          validInstance = true;
          Inst = maybeInst;
        }
      } catch (e) {}
    }

    if (!Proto && Ctor) Proto = Ctor.prototype;

    if (!Proto) {
      return null;
    }

    let superName = null;
    if (Proto) {
      const parentProto = Object.getPrototypeOf(Proto);
      if (parentProto && parentProto !== Object.prototype) {
        const tagName = getTagName(parentProto);
        if (tagName && tagName !== "Object") {
          superName = tagName;
        } else if (
          parentProto.constructor &&
          parentProto.constructor.name &&
          parentProto.constructor.name !== "Object"
        ) {
          superName = parentProto.constructor.name;
        }
      }
    }

    const ctorProps = {};
    const protoProps = {};
    const instanceProps = {};

    if (Ctor)
      collectPropsFromTarget(Ctor, "constructor", objectName, ctorProps);
    collectPropsFromTarget(Proto, "prototype", objectName, protoProps);
    if (Inst)
      collectPropsFromTarget(Inst, "instance", objectName, instanceProps);

    return {
      name: objectName,
      ctorName: objectName,
      instanceName: validInstance ? jsonInstanceName : "",
      brand: objectName,
      ctorIllegal: checkCtorIllegal(Ctor),
      exposeCtor: !!exposeCtor,
      super: superName,
      propsByOwner: {
        constructor: ctorProps,
        prototype: protoProps,
        instance: instanceProps,
      },
    };
  }

  // ==========================================
  // 5. 输出格式化
  // ==========================================
  function formatOutput(skeleton) {
    if (!skeleton) return "";

    const varName =
      (skeleton.name || "Skeleton").replace(/[^A-Za-z0-9_$]/g, "_") +
      "_skeleton";

    return (
      "(function (global) {" +
      "  const leapenv = global.leapenv || (global.leapenv = {});" +
      "  leapenv.skeletonObjects = leapenv.skeletonObjects || [];" +
      `  const ${varName} = ` +
      JSON.stringify(skeleton, null, 2).replace(/^/gm, "  ") +
      ";" +
      `  leapenv.skeletonObjects.push(${varName});` +
      "})(globalThis);\n"
    );
  }

  function _buildTypeObj(ctorName, base) {
    return {
      name: ctorName + ".type",
      ctorName: base.ctorName,
      instanceName: "",
      brand: base.brand,
      ctorIllegal: base.ctorIllegal,
      exposeCtor: base.exposeCtor,
      super: base.super,
      props: {
        ...base.propsByOwner.constructor,
        ...base.propsByOwner.prototype,
      },
    };
  }

  function _buildInstanceObj(ctorName, base) {
    if (!base.instanceName) return null;
    return {
      name: base.instanceName + ".instance",
      instanceName: base.instanceName,
      brand: ctorName,
      super: ctorName,
      ctorName: "",
      exposeCtor: false,
      ctorIllegal: false,
      props: { ...base.propsByOwner.instance },
    };
  }

  // ==========================================
  // 6. 批量拉取 (document_start 阶段同步执行)
  // ==========================================
  // document_start 阶段站点脚本未执行, 同步拉取不会卡页面
  // 拉取完成后将结果缓存, 等 DOM ready 后再提供下载

  function batchPull(list) {
    const pullList = list || PULL_LIST;
    const results = [];
    const succeeded = [];
    const failed = [];

    for (let i = 0; i < pullList.length; i++) {
      const entry = pullList[i];
      const { ctor, instance, instanceOnly } = entry;

      let customInstancePath;
      if (instance === null) {
        customInstancePath = null;
      } else if (typeof instance === "string" && instance !== "") {
        customInstancePath = instance;
      } else {
        customInstancePath = undefined;
      }

      const base = generateSkeletonInternal(ctor, customInstancePath);
      if (!base) {
        failed.push(ctor);
        continue;
      }

      if (!instanceOnly) {
        const typeObj = _buildTypeObj(ctor, base);
        const typeContent = formatOutput(typeObj);
        const typeFilename = ctor + ".type.skeleton.js";
        results.push({
          path: "type/" + typeFilename,
          filename: typeFilename,
          content: typeContent,
        });
      }

      const instanceObj = _buildInstanceObj(ctor, base);
      if (instanceObj) {
        const instanceContent = formatOutput(instanceObj);
        const instanceFilename =
          base.instanceName + ".instance.skeleton.js";
        results.push({
          path: "instance/" + instanceFilename,
          filename: instanceFilename,
          content: instanceContent,
        });
      }

      succeeded.push(ctor);
    }

    window.__PULL_RESULTS__ = results;
    return { results, succeeded, failed };
  }

  // ==========================================
  // 7. 文件下载 (需要 DOM ready)
  // ==========================================

  function _ensureBody() {
    if (document.body) return Promise.resolve();
    return new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    });
  }

  function _downloadFile(filename, content) {
    const blob = new Blob([content], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadBundle() {
    await _ensureBody();
    const results = window.__PULL_RESULTS__;
    if (!results || results.length === 0) {
      console.error("[Pull] 没有拉取结果, 请先刷新页面让扩展自动拉取");
      return;
    }

    const bundle = {};
    for (const r of results) {
      bundle[r.path] = r.content;
    }

    const bundleContent = JSON.stringify(bundle, null, 2);
    _downloadFile("skeleton_bundle.json", bundleContent);

    console.log(
      "%c[Download] skeleton_bundle.json 已下载 (" +
        results.length +
        " 个文件)",
      "color:#00ff00; font-weight:bold;"
    );
    console.log("");
    console.log("使用以下 Node.js 命令拆分到 skeleton 目录:");
    console.log("─".repeat(55));
    console.log(
      `cd leap-env/src/skeleton && node -e "` +
        `const fs=require('fs'),path=require('path'),b=require('./skeleton_bundle.json');` +
        `for(const[f,c]of Object.entries(b)){` +
        `fs.mkdirSync(path.dirname(f),{recursive:true});` +
        `fs.writeFileSync(f,c);` +
        `console.log('  wrote',f)` +
        `}"`
    );
    console.log("─".repeat(55));

    return results;
  }

  async function downloadAll() {
    await _ensureBody();
    const results = window.__PULL_RESULTS__;
    if (!results || results.length === 0) {
      console.error("[Pull] 没有拉取结果, 请先刷新页面让扩展自动拉取");
      return;
    }

    console.log(
      "%c[Download] 开始下载 " + results.length + " 个文件...",
      "color:#00ff00; font-weight:bold;"
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      _downloadFile(r.filename, r.content);
      console.log(`  [${i + 1}/${results.length}] ${r.filename}`);
      if (i < results.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    console.log(
      "%c[Download] 全部下载完成!",
      "color:#00ff00; font-weight:bold;"
    );

    return results;
  }

  // ==========================================
  // 8. 立即执行拉取 (document_start 阶段)
  // ==========================================
  const t0 = performance.now();
  const { results, succeeded, failed } = batchPull();
  const elapsed = (performance.now() - t0).toFixed(1);

  // ==========================================
  // 9. 单独生成骨架 (供控制台手动调用)
  // ==========================================

  /**
   * 生成 type skeleton + instance skeleton
   * @param {string} ctorName       构造函数名，如 'Navigator'
   * @param {string|null} [instancePath]
   *   - 省略   : 默认首字母小写 (如 'navigator')
   *   - 字符串  : 自定义路径 (如 'document', 'localStorage')
   *   - null   : 不生成 instance skeleton
   */
  function generateSkeleton(ctorName, instancePath) {
    if (!ctorName) {
      console.error(
        "用法: generateSkeleton('Navigator') | generateSkeleton('Storage', 'localStorage') | generateSkeleton('EventTarget', null)"
      );
      return "";
    }

    let customInstancePath;
    if (instancePath === null) {
      customInstancePath = null;
    } else if (typeof instancePath === "string" && instancePath !== "") {
      customInstancePath = instancePath;
    } else {
      customInstancePath = undefined;
    }

    const base = generateSkeletonInternal(ctorName, customInstancePath);
    if (!base) return "";

    const typeCode = formatOutput(_buildTypeObj(ctorName, base));
    const instanceObj = _buildInstanceObj(ctorName, base);
    const instanceCode = instanceObj ? formatOutput(instanceObj) : null;

    let output = "// ===== TYPE SKELETON =====\n" + typeCode;
    console.log("// ===== TYPE SKELETON =====");
    console.log(typeCode);

    if (instanceCode) {
      output += "\n\n\n// ===== INSTANCE SKELETON =====\n" + instanceCode;
      console.log("\n\n// ===== INSTANCE SKELETON =====");
      console.log(instanceCode);
    }

    return output;
  }

  /**
   * 仅生成 instance skeleton (复用已有 type 时使用)
   * @param {string} ctorName      构造函数名，如 'Storage'
   * @param {string} instancePath  实例路径，如 'sessionStorage'
   */
  function generateInstanceSkeleton(ctorName, instancePath) {
    if (!ctorName || !instancePath) {
      console.error(
        "用法: generateInstanceSkeleton('Storage', 'sessionStorage')"
      );
      return "";
    }

    const base = generateSkeletonInternal(ctorName, instancePath);
    if (!base) return "";

    const instanceObj = _buildInstanceObj(ctorName, base);
    if (!instanceObj) {
      console.warn("[Pull] 未能获取到实例，跳过输出");
      return "";
    }

    const instanceCode = formatOutput(instanceObj);
    console.log("// ===== INSTANCE SKELETON (仅实例) =====");
    console.log(instanceCode);
    return instanceCode;
  }

  // 暴露接口供控制台调用
  window.generateSkeleton = generateSkeleton;
  window.generateInstanceSkeleton = generateInstanceSkeleton;
  window.downloadBundle = downloadBundle;
  window.downloadAll = downloadAll;
  window.batchPull = batchPull;

  // 延迟到 DOM ready 打印结果 (document_start 阶段 console 可能还没就绪)
  const printSummary = () => {
    console.log(
      "%c[Leap Pull Extension] 拉取完成 (精确模式, document_start)",
      "color:#00ff00; font-weight:bold; font-size:14px;"
    );
    console.log("═".repeat(55));
    console.log(
      `  成功: ${succeeded.length}/${succeeded.length + failed.length} 项, 生成 ${results.length} 个文件, 耗时 ${elapsed}ms`
    );
    if (failed.length > 0) {
      console.warn("  失败:", failed);
    }
    console.log("");
    console.log("  generateSkeleton('Navigator')           → type + instance");
    console.log("  generateSkeleton('EventTarget', null)    → 仅 type");
    console.log("  generateSkeleton('Storage', 'localStorage') → 指定实例");
    console.log("  generateInstanceSkeleton('Storage', 'sessionStorage')");
    console.log("                                           → 仅 instance");
    console.log("  copy(generateSkeleton('Screen'))         → 生成并复制");
    console.log("  downloadBundle()                         → 下载全部 JSON");
    console.log("  downloadAll()                            → 逐个下载 .js");
    console.log("═".repeat(55));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", printSummary, {
      once: true,
    });
  } else {
    printSummary();
  }
})();
