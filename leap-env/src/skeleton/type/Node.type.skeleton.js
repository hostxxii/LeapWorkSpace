(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const Node_type_skeleton =   {
    "name": "Node.type",
    "ctorName": "Node",
    "instanceName": "",
    "brand": "Node",
    "ctorIllegal": true,
    "exposeCtor": true,
    "super": "EventTarget",
    "props": {
      "ELEMENT_NODE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "1"
      },
      "ATTRIBUTE_NODE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2"
      },
      "TEXT_NODE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3"
      },
      "CDATA_SECTION_NODE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "4"
      },
      "ENTITY_REFERENCE_NODE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "5"
      },
      "ENTITY_NODE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "6"
      },
      "PROCESSING_INSTRUCTION_NODE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "7"
      },
      "COMMENT_NODE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "8"
      },
      "DOCUMENT_NODE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "9"
      },
      "DOCUMENT_TYPE_NODE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "10"
      },
      "DOCUMENT_FRAGMENT_NODE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "11"
      },
      "NOTATION_NODE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "12"
      },
      "DOCUMENT_POSITION_DISCONNECTED": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "1"
      },
      "DOCUMENT_POSITION_PRECEDING": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2"
      },
      "DOCUMENT_POSITION_FOLLOWING": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "4"
      },
      "DOCUMENT_POSITION_CONTAINS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "8"
      },
      "DOCUMENT_POSITION_CONTAINED_BY": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "16"
      },
      "DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32"
      },
      "nodeType": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Node",
            "propName": "nodeType",
            "callType": "get"
          }
        }
      },
      "nodeName": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Node",
            "propName": "nodeName",
            "callType": "get"
          }
        }
      },
      "baseURI": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Node",
            "propName": "baseURI",
            "callType": "get"
          }
        }
      },
      "isConnected": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Node",
            "propName": "isConnected",
            "callType": "get"
          }
        }
      },
      "ownerDocument": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Node",
            "propName": "ownerDocument",
            "callType": "get"
          }
        }
      },
      "parentNode": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Node",
            "propName": "parentNode",
            "callType": "get"
          }
        }
      },
      "parentElement": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Node",
            "propName": "parentElement",
            "callType": "get"
          }
        }
      },
      "childNodes": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Node",
            "propName": "childNodes",
            "callType": "get"
          }
        }
      },
      "firstChild": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Node",
            "propName": "firstChild",
            "callType": "get"
          }
        }
      },
      "lastChild": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Node",
            "propName": "lastChild",
            "callType": "get"
          }
        }
      },
      "previousSibling": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Node",
            "propName": "previousSibling",
            "callType": "get"
          }
        }
      },
      "nextSibling": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Node",
            "propName": "nextSibling",
            "callType": "get"
          }
        }
      },
      "nodeValue": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Node",
            "propName": "nodeValue",
            "callType": "get"
          },
          "setter": {
            "objName": "Node",
            "propName": "nodeValue",
            "callType": "set"
          }
        }
      },
      "textContent": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Node",
            "propName": "textContent",
            "callType": "get"
          },
          "setter": {
            "objName": "Node",
            "propName": "textContent",
            "callType": "set"
          }
        }
      },
      "appendChild": {
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
          "objName": "Node",
          "propName": "appendChild",
          "callType": "apply"
        }
      },
      "cloneNode": {
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
          "objName": "Node",
          "propName": "cloneNode",
          "callType": "apply"
        }
      },
      "compareDocumentPosition": {
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
          "objName": "Node",
          "propName": "compareDocumentPosition",
          "callType": "apply"
        }
      },
      "contains": {
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
          "objName": "Node",
          "propName": "contains",
          "callType": "apply"
        }
      },
      "getRootNode": {
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
          "objName": "Node",
          "propName": "getRootNode",
          "callType": "apply"
        }
      },
      "hasChildNodes": {
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
          "objName": "Node",
          "propName": "hasChildNodes",
          "callType": "apply"
        }
      },
      "insertBefore": {
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
          "objName": "Node",
          "propName": "insertBefore",
          "callType": "apply"
        }
      },
      "isDefaultNamespace": {
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
          "objName": "Node",
          "propName": "isDefaultNamespace",
          "callType": "apply"
        }
      },
      "isEqualNode": {
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
          "objName": "Node",
          "propName": "isEqualNode",
          "callType": "apply"
        }
      },
      "isSameNode": {
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
          "objName": "Node",
          "propName": "isSameNode",
          "callType": "apply"
        }
      },
      "lookupNamespaceURI": {
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
          "objName": "Node",
          "propName": "lookupNamespaceURI",
          "callType": "apply"
        }
      },
      "lookupPrefix": {
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
          "objName": "Node",
          "propName": "lookupPrefix",
          "callType": "apply"
        }
      },
      "normalize": {
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
          "objName": "Node",
          "propName": "normalize",
          "callType": "apply"
        }
      },
      "removeChild": {
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
          "objName": "Node",
          "propName": "removeChild",
          "callType": "apply"
        }
      },
      "replaceChild": {
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
          "objName": "Node",
          "propName": "replaceChild",
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
        "value": "Node"
      }
    }
  };  leapenv.skeletonObjects.push(Node_type_skeleton);})(globalThis);
