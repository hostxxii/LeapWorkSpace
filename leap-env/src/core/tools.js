// src/core/30-tools.js (30_tools)
// 核心工具函数

(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  leapenv.toolsFunc = leapenv.toolsFunc || {};
  const TAG_MAP = {
    html: 'HTMLHtmlElement',
    head: 'HTMLHeadElement',
    body: 'HTMLBodyElement',
    title: 'HTMLTitleElement',
    meta: 'HTMLMetaElement',
    link: 'HTMLLinkElement',
    script: 'HTMLScriptElement',
    style: 'HTMLStyleElement',
    section: 'HTMLElement',
    article: 'HTMLElement',
    header: 'HTMLElement',
    footer: 'HTMLElement',
    main: 'HTMLElement',
    nav: 'HTMLElement',
    p: 'HTMLParagraphElement',
    ul: 'HTMLUListElement',
    ol: 'HTMLOListElement',
    li: 'HTMLLIElement',
    form: 'HTMLFormElement',
    input: 'HTMLInputElement',
    button: 'HTMLButtonElement',
    textarea: 'HTMLTextAreaElement',
    select: 'HTMLSelectElement',
    option: 'HTMLOptionElement',
    img: 'HTMLImageElement',
    div: 'HTMLDivElement',
    span: 'HTMLSpanElement',
    a: 'HTMLAnchorElement',
    canvas: 'HTMLCanvasElement',
    iframe: 'HTMLIFrameElement',
  };

  leapenv.toolsFunc.getConstructorName = function(tagName) {
    if (!tagName) return 'HTMLUnknownElement';
    const key = String(tagName).toLowerCase();
    return TAG_MAP[key] || 'HTMLUnknownElement';
  };

})(globalThis);
