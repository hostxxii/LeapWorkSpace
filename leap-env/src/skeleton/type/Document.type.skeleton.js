(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const Document_type_skeleton =   {
    "name": "Document.type",
    "ctorName": "Document",
    "instanceName": "",
    "brand": "Document",
    "ctorIllegal": false,
    "exposeCtor": true,
    "super": "Node",
    "props": {
      "parseHTMLUnsafe": {
        "owner": "constructor",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": false,
        "dispatch": {
          "objName": "Document",
          "propName": "parseHTMLUnsafe",
          "callType": "apply"
        }
      },
      "implementation": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "implementation",
            "callType": "get"
          }
        }
      },
      "URL": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "URL",
            "callType": "get"
          }
        }
      },
      "documentURI": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "documentURI",
            "callType": "get"
          }
        }
      },
      "compatMode": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "compatMode",
            "callType": "get"
          }
        }
      },
      "characterSet": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "characterSet",
            "callType": "get"
          }
        }
      },
      "charset": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "charset",
            "callType": "get"
          }
        }
      },
      "inputEncoding": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "inputEncoding",
            "callType": "get"
          }
        }
      },
      "contentType": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "contentType",
            "callType": "get"
          }
        }
      },
      "doctype": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "doctype",
            "callType": "get"
          }
        }
      },
      "documentElement": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "documentElement",
            "callType": "get"
          }
        }
      },
      "xmlEncoding": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "xmlEncoding",
            "callType": "get"
          }
        }
      },
      "xmlVersion": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "xmlVersion",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "xmlVersion",
            "callType": "set"
          }
        }
      },
      "xmlStandalone": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "xmlStandalone",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "xmlStandalone",
            "callType": "set"
          }
        }
      },
      "domain": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "domain",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "domain",
            "callType": "set"
          }
        }
      },
      "referrer": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "referrer",
            "callType": "get"
          }
        }
      },
      "cookie": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "cookie",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "cookie",
            "callType": "set"
          }
        }
      },
      "lastModified": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "lastModified",
            "callType": "get"
          }
        }
      },
      "readyState": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "readyState",
            "callType": "get"
          }
        }
      },
      "title": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "title",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "title",
            "callType": "set"
          }
        }
      },
      "dir": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "dir",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "dir",
            "callType": "set"
          }
        }
      },
      "body": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "body",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "body",
            "callType": "set"
          }
        }
      },
      "head": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "head",
            "callType": "get"
          }
        }
      },
      "images": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "images",
            "callType": "get"
          }
        }
      },
      "embeds": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "embeds",
            "callType": "get"
          }
        }
      },
      "plugins": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "plugins",
            "callType": "get"
          }
        }
      },
      "links": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "links",
            "callType": "get"
          }
        }
      },
      "forms": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "forms",
            "callType": "get"
          }
        }
      },
      "scripts": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "scripts",
            "callType": "get"
          }
        }
      },
      "currentScript": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "currentScript",
            "callType": "get"
          }
        }
      },
      "defaultView": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "defaultView",
            "callType": "get"
          }
        }
      },
      "designMode": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "designMode",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "designMode",
            "callType": "set"
          }
        }
      },
      "onreadystatechange": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": false,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onreadystatechange",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onreadystatechange",
            "callType": "set"
          }
        }
      },
      "anchors": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "anchors",
            "callType": "get"
          }
        }
      },
      "applets": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "applets",
            "callType": "get"
          }
        }
      },
      "fgColor": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "fgColor",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "fgColor",
            "callType": "set"
          }
        }
      },
      "linkColor": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "linkColor",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "linkColor",
            "callType": "set"
          }
        }
      },
      "vlinkColor": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "vlinkColor",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "vlinkColor",
            "callType": "set"
          }
        }
      },
      "alinkColor": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "alinkColor",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "alinkColor",
            "callType": "set"
          }
        }
      },
      "bgColor": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "bgColor",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "bgColor",
            "callType": "set"
          }
        }
      },
      "all": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "all",
            "callType": "get"
          }
        }
      },
      "scrollingElement": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "scrollingElement",
            "callType": "get"
          }
        }
      },
      "onpointerlockchange": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onpointerlockchange",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onpointerlockchange",
            "callType": "set"
          }
        }
      },
      "onpointerlockerror": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onpointerlockerror",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onpointerlockerror",
            "callType": "set"
          }
        }
      },
      "hidden": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "hidden",
            "callType": "get"
          }
        }
      },
      "visibilityState": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "visibilityState",
            "callType": "get"
          }
        }
      },
      "wasDiscarded": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "wasDiscarded",
            "callType": "get"
          }
        }
      },
      "prerendering": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "prerendering",
            "callType": "get"
          }
        }
      },
      "featurePolicy": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "featurePolicy",
            "callType": "get"
          }
        }
      },
      "webkitVisibilityState": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "webkitVisibilityState",
            "callType": "get"
          }
        }
      },
      "webkitHidden": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "webkitHidden",
            "callType": "get"
          }
        }
      },
      "onbeforecopy": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onbeforecopy",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onbeforecopy",
            "callType": "set"
          }
        }
      },
      "onbeforecut": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onbeforecut",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onbeforecut",
            "callType": "set"
          }
        }
      },
      "onbeforepaste": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onbeforepaste",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onbeforepaste",
            "callType": "set"
          }
        }
      },
      "onfreeze": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onfreeze",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onfreeze",
            "callType": "set"
          }
        }
      },
      "onprerenderingchange": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onprerenderingchange",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onprerenderingchange",
            "callType": "set"
          }
        }
      },
      "onresume": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onresume",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onresume",
            "callType": "set"
          }
        }
      },
      "onsearch": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onsearch",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onsearch",
            "callType": "set"
          }
        }
      },
      "onvisibilitychange": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onvisibilitychange",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onvisibilitychange",
            "callType": "set"
          }
        }
      },
      "timeline": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "timeline",
            "callType": "get"
          }
        }
      },
      "fullscreenEnabled": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "fullscreenEnabled",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "fullscreenEnabled",
            "callType": "set"
          }
        }
      },
      "fullscreen": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "fullscreen",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "fullscreen",
            "callType": "set"
          }
        }
      },
      "onfullscreenchange": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onfullscreenchange",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onfullscreenchange",
            "callType": "set"
          }
        }
      },
      "onfullscreenerror": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onfullscreenerror",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onfullscreenerror",
            "callType": "set"
          }
        }
      },
      "webkitIsFullScreen": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "webkitIsFullScreen",
            "callType": "get"
          }
        }
      },
      "webkitCurrentFullScreenElement": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "webkitCurrentFullScreenElement",
            "callType": "get"
          }
        }
      },
      "webkitFullscreenEnabled": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "webkitFullscreenEnabled",
            "callType": "get"
          }
        }
      },
      "webkitFullscreenElement": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "webkitFullscreenElement",
            "callType": "get"
          }
        }
      },
      "onwebkitfullscreenchange": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onwebkitfullscreenchange",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onwebkitfullscreenchange",
            "callType": "set"
          }
        }
      },
      "onwebkitfullscreenerror": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onwebkitfullscreenerror",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onwebkitfullscreenerror",
            "callType": "set"
          }
        }
      },
      "rootElement": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "rootElement",
            "callType": "get"
          }
        }
      },
      "pictureInPictureEnabled": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "pictureInPictureEnabled",
            "callType": "get"
          }
        }
      },
      "onbeforexrselect": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onbeforexrselect",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onbeforexrselect",
            "callType": "set"
          }
        }
      },
      "onabort": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onabort",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onabort",
            "callType": "set"
          }
        }
      },
      "onbeforeinput": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onbeforeinput",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onbeforeinput",
            "callType": "set"
          }
        }
      },
      "onbeforematch": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onbeforematch",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onbeforematch",
            "callType": "set"
          }
        }
      },
      "onbeforetoggle": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onbeforetoggle",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onbeforetoggle",
            "callType": "set"
          }
        }
      },
      "onblur": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onblur",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onblur",
            "callType": "set"
          }
        }
      },
      "oncancel": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "oncancel",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "oncancel",
            "callType": "set"
          }
        }
      },
      "oncanplay": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "oncanplay",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "oncanplay",
            "callType": "set"
          }
        }
      },
      "oncanplaythrough": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "oncanplaythrough",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "oncanplaythrough",
            "callType": "set"
          }
        }
      },
      "onchange": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onchange",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onchange",
            "callType": "set"
          }
        }
      },
      "onclick": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onclick",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onclick",
            "callType": "set"
          }
        }
      },
      "onclose": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onclose",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onclose",
            "callType": "set"
          }
        }
      },
      "oncommand": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "oncommand",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "oncommand",
            "callType": "set"
          }
        }
      },
      "oncontentvisibilityautostatechange": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "oncontentvisibilityautostatechange",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "oncontentvisibilityautostatechange",
            "callType": "set"
          }
        }
      },
      "oncontextlost": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "oncontextlost",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "oncontextlost",
            "callType": "set"
          }
        }
      },
      "oncontextmenu": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "oncontextmenu",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "oncontextmenu",
            "callType": "set"
          }
        }
      },
      "oncontextrestored": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "oncontextrestored",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "oncontextrestored",
            "callType": "set"
          }
        }
      },
      "oncuechange": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "oncuechange",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "oncuechange",
            "callType": "set"
          }
        }
      },
      "ondblclick": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "ondblclick",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "ondblclick",
            "callType": "set"
          }
        }
      },
      "ondrag": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "ondrag",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "ondrag",
            "callType": "set"
          }
        }
      },
      "ondragend": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "ondragend",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "ondragend",
            "callType": "set"
          }
        }
      },
      "ondragenter": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "ondragenter",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "ondragenter",
            "callType": "set"
          }
        }
      },
      "ondragleave": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "ondragleave",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "ondragleave",
            "callType": "set"
          }
        }
      },
      "ondragover": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "ondragover",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "ondragover",
            "callType": "set"
          }
        }
      },
      "ondragstart": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "ondragstart",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "ondragstart",
            "callType": "set"
          }
        }
      },
      "ondrop": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "ondrop",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "ondrop",
            "callType": "set"
          }
        }
      },
      "ondurationchange": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "ondurationchange",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "ondurationchange",
            "callType": "set"
          }
        }
      },
      "onemptied": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onemptied",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onemptied",
            "callType": "set"
          }
        }
      },
      "onended": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onended",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onended",
            "callType": "set"
          }
        }
      },
      "onerror": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onerror",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onerror",
            "callType": "set"
          }
        }
      },
      "onfocus": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onfocus",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onfocus",
            "callType": "set"
          }
        }
      },
      "onformdata": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onformdata",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onformdata",
            "callType": "set"
          }
        }
      },
      "oninput": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "oninput",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "oninput",
            "callType": "set"
          }
        }
      },
      "oninvalid": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "oninvalid",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "oninvalid",
            "callType": "set"
          }
        }
      },
      "onkeydown": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onkeydown",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onkeydown",
            "callType": "set"
          }
        }
      },
      "onkeypress": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onkeypress",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onkeypress",
            "callType": "set"
          }
        }
      },
      "onkeyup": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onkeyup",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onkeyup",
            "callType": "set"
          }
        }
      },
      "onload": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onload",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onload",
            "callType": "set"
          }
        }
      },
      "onloadeddata": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onloadeddata",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onloadeddata",
            "callType": "set"
          }
        }
      },
      "onloadedmetadata": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onloadedmetadata",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onloadedmetadata",
            "callType": "set"
          }
        }
      },
      "onloadstart": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onloadstart",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onloadstart",
            "callType": "set"
          }
        }
      },
      "onmousedown": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onmousedown",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onmousedown",
            "callType": "set"
          }
        }
      },
      "onmouseenter": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": false,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onmouseenter",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onmouseenter",
            "callType": "set"
          }
        }
      },
      "onmouseleave": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": false,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onmouseleave",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onmouseleave",
            "callType": "set"
          }
        }
      },
      "onmousemove": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onmousemove",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onmousemove",
            "callType": "set"
          }
        }
      },
      "onmouseout": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onmouseout",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onmouseout",
            "callType": "set"
          }
        }
      },
      "onmouseover": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onmouseover",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onmouseover",
            "callType": "set"
          }
        }
      },
      "onmouseup": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onmouseup",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onmouseup",
            "callType": "set"
          }
        }
      },
      "onmousewheel": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onmousewheel",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onmousewheel",
            "callType": "set"
          }
        }
      },
      "onpause": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onpause",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onpause",
            "callType": "set"
          }
        }
      },
      "onplay": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onplay",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onplay",
            "callType": "set"
          }
        }
      },
      "onplaying": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onplaying",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onplaying",
            "callType": "set"
          }
        }
      },
      "onprogress": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onprogress",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onprogress",
            "callType": "set"
          }
        }
      },
      "onratechange": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onratechange",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onratechange",
            "callType": "set"
          }
        }
      },
      "onreset": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onreset",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onreset",
            "callType": "set"
          }
        }
      },
      "onresize": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onresize",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onresize",
            "callType": "set"
          }
        }
      },
      "onscroll": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onscroll",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onscroll",
            "callType": "set"
          }
        }
      },
      "onscrollend": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onscrollend",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onscrollend",
            "callType": "set"
          }
        }
      },
      "onsecuritypolicyviolation": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onsecuritypolicyviolation",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onsecuritypolicyviolation",
            "callType": "set"
          }
        }
      },
      "onseeked": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onseeked",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onseeked",
            "callType": "set"
          }
        }
      },
      "onseeking": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onseeking",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onseeking",
            "callType": "set"
          }
        }
      },
      "onselect": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onselect",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onselect",
            "callType": "set"
          }
        }
      },
      "onslotchange": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onslotchange",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onslotchange",
            "callType": "set"
          }
        }
      },
      "onstalled": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onstalled",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onstalled",
            "callType": "set"
          }
        }
      },
      "onsubmit": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onsubmit",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onsubmit",
            "callType": "set"
          }
        }
      },
      "onsuspend": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onsuspend",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onsuspend",
            "callType": "set"
          }
        }
      },
      "ontimeupdate": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "ontimeupdate",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "ontimeupdate",
            "callType": "set"
          }
        }
      },
      "ontoggle": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "ontoggle",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "ontoggle",
            "callType": "set"
          }
        }
      },
      "onvolumechange": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onvolumechange",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onvolumechange",
            "callType": "set"
          }
        }
      },
      "onwaiting": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onwaiting",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onwaiting",
            "callType": "set"
          }
        }
      },
      "onwebkitanimationend": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onwebkitanimationend",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onwebkitanimationend",
            "callType": "set"
          }
        }
      },
      "onwebkitanimationiteration": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onwebkitanimationiteration",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onwebkitanimationiteration",
            "callType": "set"
          }
        }
      },
      "onwebkitanimationstart": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onwebkitanimationstart",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onwebkitanimationstart",
            "callType": "set"
          }
        }
      },
      "onwebkittransitionend": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onwebkittransitionend",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onwebkittransitionend",
            "callType": "set"
          }
        }
      },
      "onwheel": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onwheel",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onwheel",
            "callType": "set"
          }
        }
      },
      "onauxclick": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onauxclick",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onauxclick",
            "callType": "set"
          }
        }
      },
      "ongotpointercapture": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "ongotpointercapture",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "ongotpointercapture",
            "callType": "set"
          }
        }
      },
      "onlostpointercapture": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onlostpointercapture",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onlostpointercapture",
            "callType": "set"
          }
        }
      },
      "onpointerdown": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onpointerdown",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onpointerdown",
            "callType": "set"
          }
        }
      },
      "onpointermove": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onpointermove",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onpointermove",
            "callType": "set"
          }
        }
      },
      "onpointerrawupdate": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onpointerrawupdate",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onpointerrawupdate",
            "callType": "set"
          }
        }
      },
      "onpointerup": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onpointerup",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onpointerup",
            "callType": "set"
          }
        }
      },
      "onpointercancel": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onpointercancel",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onpointercancel",
            "callType": "set"
          }
        }
      },
      "onpointerover": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onpointerover",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onpointerover",
            "callType": "set"
          }
        }
      },
      "onpointerout": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onpointerout",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onpointerout",
            "callType": "set"
          }
        }
      },
      "onpointerenter": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onpointerenter",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onpointerenter",
            "callType": "set"
          }
        }
      },
      "onpointerleave": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onpointerleave",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onpointerleave",
            "callType": "set"
          }
        }
      },
      "onselectstart": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onselectstart",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onselectstart",
            "callType": "set"
          }
        }
      },
      "onselectionchange": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onselectionchange",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onselectionchange",
            "callType": "set"
          }
        }
      },
      "onanimationend": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onanimationend",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onanimationend",
            "callType": "set"
          }
        }
      },
      "onanimationiteration": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onanimationiteration",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onanimationiteration",
            "callType": "set"
          }
        }
      },
      "onanimationstart": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onanimationstart",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onanimationstart",
            "callType": "set"
          }
        }
      },
      "ontransitionrun": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "ontransitionrun",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "ontransitionrun",
            "callType": "set"
          }
        }
      },
      "ontransitionstart": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "ontransitionstart",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "ontransitionstart",
            "callType": "set"
          }
        }
      },
      "ontransitionend": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "ontransitionend",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "ontransitionend",
            "callType": "set"
          }
        }
      },
      "ontransitioncancel": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "ontransitioncancel",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "ontransitioncancel",
            "callType": "set"
          }
        }
      },
      "oncopy": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "oncopy",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "oncopy",
            "callType": "set"
          }
        }
      },
      "oncut": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "oncut",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "oncut",
            "callType": "set"
          }
        }
      },
      "onpaste": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onpaste",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onpaste",
            "callType": "set"
          }
        }
      },
      "children": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "children",
            "callType": "get"
          }
        }
      },
      "firstElementChild": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "firstElementChild",
            "callType": "get"
          }
        }
      },
      "lastElementChild": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "lastElementChild",
            "callType": "get"
          }
        }
      },
      "childElementCount": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "childElementCount",
            "callType": "get"
          }
        }
      },
      "activeElement": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "activeElement",
            "callType": "get"
          }
        }
      },
      "styleSheets": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "styleSheets",
            "callType": "get"
          }
        }
      },
      "pointerLockElement": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "pointerLockElement",
            "callType": "get"
          }
        }
      },
      "fullscreenElement": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "fullscreenElement",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "fullscreenElement",
            "callType": "set"
          }
        }
      },
      "adoptedStyleSheets": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "adoptedStyleSheets",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "adoptedStyleSheets",
            "callType": "set"
          }
        }
      },
      "pictureInPictureElement": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "pictureInPictureElement",
            "callType": "get"
          }
        }
      },
      "fonts": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "fonts",
            "callType": "get"
          }
        }
      },
      "adoptNode": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "adoptNode",
          "callType": "apply"
        }
      },
      "append": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "append",
          "callType": "apply"
        }
      },
      "captureEvents": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "captureEvents",
          "callType": "apply"
        }
      },
      "caretPositionFromPoint": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 2,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "caretPositionFromPoint",
          "callType": "apply"
        }
      },
      "caretRangeFromPoint": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "caretRangeFromPoint",
          "callType": "apply"
        }
      },
      "clear": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "clear",
          "callType": "apply"
        }
      },
      "close": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "close",
          "callType": "apply"
        }
      },
      "createAttribute": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "createAttribute",
          "callType": "apply"
        }
      },
      "createAttributeNS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 2,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "createAttributeNS",
          "callType": "apply"
        }
      },
      "createCDATASection": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "createCDATASection",
          "callType": "apply"
        }
      },
      "createComment": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "createComment",
          "callType": "apply"
        }
      },
      "createDocumentFragment": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "createDocumentFragment",
          "callType": "apply"
        }
      },
      "createElement": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "createElement",
          "callType": "apply"
        }
      },
      "createElementNS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 2,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "createElementNS",
          "callType": "apply"
        }
      },
      "createEvent": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "createEvent",
          "callType": "apply"
        }
      },
      "createExpression": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "createExpression",
          "callType": "apply"
        }
      },
      "createNSResolver": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "createNSResolver",
          "callType": "apply"
        }
      },
      "createNodeIterator": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "createNodeIterator",
          "callType": "apply"
        }
      },
      "createProcessingInstruction": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 2,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "createProcessingInstruction",
          "callType": "apply"
        }
      },
      "createRange": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "createRange",
          "callType": "apply"
        }
      },
      "createTextNode": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "createTextNode",
          "callType": "apply"
        }
      },
      "createTreeWalker": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "createTreeWalker",
          "callType": "apply"
        }
      },
      "elementFromPoint": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 2,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "elementFromPoint",
          "callType": "apply"
        }
      },
      "elementsFromPoint": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 2,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "elementsFromPoint",
          "callType": "apply"
        }
      },
      "evaluate": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 2,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "evaluate",
          "callType": "apply"
        }
      },
      "execCommand": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "execCommand",
          "callType": "apply"
        }
      },
      "exitFullscreen": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": false,
        "dispatch": {
          "objName": "Document",
          "propName": "exitFullscreen",
          "callType": "apply"
        }
      },
      "exitPictureInPicture": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": false,
        "dispatch": {
          "objName": "Document",
          "propName": "exitPictureInPicture",
          "callType": "apply"
        }
      },
      "exitPointerLock": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "exitPointerLock",
          "callType": "apply"
        }
      },
      "getAnimations": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "getAnimations",
          "callType": "apply"
        }
      },
      "getElementById": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "getElementById",
          "callType": "apply"
        }
      },
      "getElementsByClassName": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "getElementsByClassName",
          "callType": "apply"
        }
      },
      "getElementsByName": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "getElementsByName",
          "callType": "apply"
        }
      },
      "getElementsByTagName": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "getElementsByTagName",
          "callType": "apply"
        }
      },
      "getElementsByTagNameNS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 2,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "getElementsByTagNameNS",
          "callType": "apply"
        }
      },
      "getSelection": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "getSelection",
          "callType": "apply"
        }
      },
      "hasFocus": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "hasFocus",
          "callType": "apply"
        }
      },
      "hasStorageAccess": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": false,
        "dispatch": {
          "objName": "Document",
          "propName": "hasStorageAccess",
          "callType": "apply"
        }
      },
      "hasUnpartitionedCookieAccess": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": false,
        "dispatch": {
          "objName": "Document",
          "propName": "hasUnpartitionedCookieAccess",
          "callType": "apply"
        }
      },
      "importNode": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "importNode",
          "callType": "apply"
        }
      },
      "moveBefore": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 2,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "moveBefore",
          "callType": "apply"
        }
      },
      "open": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "open",
          "callType": "apply"
        }
      },
      "prepend": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "prepend",
          "callType": "apply"
        }
      },
      "queryCommandEnabled": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "queryCommandEnabled",
          "callType": "apply"
        }
      },
      "queryCommandIndeterm": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "queryCommandIndeterm",
          "callType": "apply"
        }
      },
      "queryCommandState": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "queryCommandState",
          "callType": "apply"
        }
      },
      "queryCommandSupported": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "queryCommandSupported",
          "callType": "apply"
        }
      },
      "queryCommandValue": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "queryCommandValue",
          "callType": "apply"
        }
      },
      "querySelector": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "querySelector",
          "callType": "apply"
        }
      },
      "querySelectorAll": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "querySelectorAll",
          "callType": "apply"
        }
      },
      "releaseEvents": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "releaseEvents",
          "callType": "apply"
        }
      },
      "replaceChildren": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "replaceChildren",
          "callType": "apply"
        }
      },
      "requestStorageAccess": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": false,
        "dispatch": {
          "objName": "Document",
          "propName": "requestStorageAccess",
          "callType": "apply"
        }
      },
      "requestStorageAccessFor": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": false,
        "dispatch": {
          "objName": "Document",
          "propName": "requestStorageAccessFor",
          "callType": "apply"
        }
      },
      "startViewTransition": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "startViewTransition",
          "callType": "apply"
        }
      },
      "webkitCancelFullScreen": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "webkitCancelFullScreen",
          "callType": "apply"
        }
      },
      "webkitExitFullscreen": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "webkitExitFullscreen",
          "callType": "apply"
        }
      },
      "write": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "write",
          "callType": "apply"
        }
      },
      "writeln": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "writeln",
          "callType": "apply"
        }
      },
      "fragmentDirective": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "fragmentDirective",
            "callType": "get"
          }
        }
      },
      "browsingTopics": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": false,
        "dispatch": {
          "objName": "Document",
          "propName": "browsingTopics",
          "callType": "apply"
        }
      },
      "hasPrivateToken": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": false,
        "dispatch": {
          "objName": "Document",
          "propName": "hasPrivateToken",
          "callType": "apply"
        }
      },
      "hasRedemptionRecord": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": false,
        "dispatch": {
          "objName": "Document",
          "propName": "hasRedemptionRecord",
          "callType": "apply"
        }
      },
      "onscrollsnapchange": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onscrollsnapchange",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onscrollsnapchange",
            "callType": "set"
          }
        }
      },
      "onscrollsnapchanging": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Document",
            "propName": "onscrollsnapchanging",
            "callType": "get"
          },
          "setter": {
            "objName": "Document",
            "propName": "onscrollsnapchanging",
            "callType": "set"
          }
        }
      },
      "ariaNotify": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": true,
        "dispatch": {
          "objName": "Document",
          "propName": "ariaNotify",
          "callType": "apply"
        }
      },
      "@@toStringTag": {
        "owner": "prototype",
        "attributes": {
          "enumerable": false,
          "configurable": true,
          "writable": false
        },
        "kind": "data",
        "valueType": "string",
        "value": "Document"
      },
      "@@unscopables": {
        "owner": "prototype",
        "attributes": {
          "enumerable": false,
          "configurable": true,
          "writable": false
        },
        "kind": "data",
        "valueType": "undefined",
        "value": "undefined"
      }
    }
  };  leapenv.skeletonObjects.push(Document_type_skeleton);})(globalThis);
