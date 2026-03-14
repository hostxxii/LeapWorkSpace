// src/entry.js
// ⚠️ 此文件由 generate-entry.js 自动生成，请勿手动编辑
// 自动扫描并按以下顺序加载所有模块：
//   1. core/ - 核心运行时 (runtime → config → tools → loader)
//   2. skeleton/type/ - 类型壳（父类优先）
//   3. skeleton/instance/ - 实例壳
//   4. impl/ - 实现层
//   5. instance/ - 实例层


// ========== 1. 核心运行时 (core/) ==========
import '../core/runtime.js';
import '../core/config.js';
import '../core/tools.js';
import '../core/skeleton-loader.js';

// ========== 2. 类型壳 (skeleton/type/) ==========
import '../skeleton/type/CanvasRenderingContext2D.type.skeleton.js';
import '../skeleton/type/Crypto.type.skeleton.js';
import '../skeleton/type/DOMTokenList.type.skeleton.js';
import '../skeleton/type/Event.type.skeleton.js';
import '../skeleton/type/EventTarget.type.skeleton.js';
import '../skeleton/type/History.type.skeleton.js';
import '../skeleton/type/HTMLAllCollection.type.skeleton.js';
import '../skeleton/type/HTMLCollection.type.skeleton.js';
import '../skeleton/type/Location.type.skeleton.js';
import '../skeleton/type/MessageChannel.type.skeleton.js';
import '../skeleton/type/MessagePort.type.skeleton.js';
import '../skeleton/type/MimeType.type.skeleton.js';
import '../skeleton/type/MimeTypeArray.type.skeleton.js';
import '../skeleton/type/NamedNodeMap.type.skeleton.js';
import '../skeleton/type/Navigator.type.skeleton.js';
import '../skeleton/type/Node.type.skeleton.js';
import '../skeleton/type/CharacterData.type.skeleton.js';
import '../skeleton/type/Comment.type.skeleton.js';
import '../skeleton/type/Document.type.skeleton.js';
import '../skeleton/type/DocumentFragment.type.skeleton.js';
import '../skeleton/type/Element.type.skeleton.js';
import '../skeleton/type/HTMLDocument.type.skeleton.js';
import '../skeleton/type/HTMLElement.type.skeleton.js';
import '../skeleton/type/HTMLAnchorElement.type.skeleton.js';
import '../skeleton/type/HTMLBodyElement.type.skeleton.js';
import '../skeleton/type/HTMLButtonElement.type.skeleton.js';
import '../skeleton/type/HTMLCanvasElement.type.skeleton.js';
import '../skeleton/type/HTMLDivElement.type.skeleton.js';
import '../skeleton/type/HTMLFormElement.type.skeleton.js';
import '../skeleton/type/HTMLHeadElement.type.skeleton.js';
import '../skeleton/type/HTMLHtmlElement.type.skeleton.js';
import '../skeleton/type/HTMLIFrameElement.type.skeleton.js';
import '../skeleton/type/HTMLImageElement.type.skeleton.js';
import '../skeleton/type/HTMLInputElement.type.skeleton.js';
import '../skeleton/type/HTMLLIElement.type.skeleton.js';
import '../skeleton/type/HTMLLinkElement.type.skeleton.js';
import '../skeleton/type/HTMLMetaElement.type.skeleton.js';
import '../skeleton/type/HTMLOListElement.type.skeleton.js';
import '../skeleton/type/HTMLOptionElement.type.skeleton.js';
import '../skeleton/type/HTMLParagraphElement.type.skeleton.js';
import '../skeleton/type/HTMLScriptElement.type.skeleton.js';
import '../skeleton/type/HTMLSelectElement.type.skeleton.js';
import '../skeleton/type/HTMLSpanElement.type.skeleton.js';
import '../skeleton/type/HTMLStyleElement.type.skeleton.js';
import '../skeleton/type/HTMLTextAreaElement.type.skeleton.js';
import '../skeleton/type/HTMLTitleElement.type.skeleton.js';
import '../skeleton/type/HTMLUListElement.type.skeleton.js';
import '../skeleton/type/HTMLUnknownElement.type.skeleton.js';
import '../skeleton/type/NodeList.type.skeleton.js';
import '../skeleton/type/Performance.type.skeleton.js';
import '../skeleton/type/PermissionStatus.type.skeleton.js';
import '../skeleton/type/Plugin.type.skeleton.js';
import '../skeleton/type/PluginArray.type.skeleton.js';
import '../skeleton/type/Screen.type.skeleton.js';
import '../skeleton/type/Storage.type.skeleton.js';
import '../skeleton/type/Text.type.skeleton.js';
import '../skeleton/type/WebGLRenderingContext.type.skeleton.js';
import '../skeleton/type/WindowProperties.type.skeleton.js';
import '../skeleton/type/Window.type.skeleton.js';

// ========== 3. 实例壳 (skeleton/instance/) ==========
import '../skeleton/instance/window.instance.skeleton.js';
import '../skeleton/instance/crypto.instance.skeleton.js';
import '../skeleton/instance/document.instance.skeleton.js';
import '../skeleton/instance/history.instance.skeleton.js';
import '../skeleton/instance/localStorage.instance.skeleton.js';
import '../skeleton/instance/location.instance.skeleton.js';
import '../skeleton/instance/navigator.instance.skeleton.js';
import '../skeleton/instance/performance.instance.skeleton.js';
import '../skeleton/instance/screen.instance.skeleton.js';
import '../skeleton/instance/sessionStorage.instance.skeleton.js';

// ========== 4. 实现层 (impl/) ==========
import '../impl/00-dom-shared.impl.js';
import '../impl/CharacterData.impl.js';
import '../impl/Crypto.impl.js';
import '../impl/CryptoJS.impl.js';
import '../impl/Document.impl.js';
import '../impl/DocumentFragment.impl.js';
import '../impl/dod-layout-engine.js';
import '../impl/DOMTokenList.impl.js';
import '../impl/Element.impl.js';
import '../impl/Event.impl.js';
import '../impl/EventTarget.impl.js';
import '../impl/History.impl.js';
import '../impl/HTMLAllCollection.impl.js';
import '../impl/HTMLCanvasElement.impl.js';
import '../impl/HTMLCollection.impl.js';
import '../impl/HTMLDocument.impl.js';
import '../impl/HTMLElement.impl.js';
import '../impl/HTMLIFrameElement.impl.js';
import '../impl/HTMLScriptElement.impl.js';
import '../impl/Location.impl.js';
import '../impl/MessageChannel.impl.js';
import '../impl/MessagePort.impl.js';
import '../impl/NamedNodeMap.impl.js';
import '../impl/Navigator.impl.js';
import '../impl/NavigatorBrands.impl.js';
import '../impl/Node.impl.js';
import '../impl/NodeList.impl.js';
import '../impl/Performance.impl.js';
import '../impl/Screen.impl.js';
import '../impl/Storage.impl.js';
import '../impl/Text.impl.js';
import '../impl/Window.impl.js';

// ========== 5. 实例层 (instance/) ==========
import '../instance/host-log.js';
import '../instance/signature-task.instance.js';
import '../instance/skeleton-init.instance.js';
// ========== 初始化完成 ==========
