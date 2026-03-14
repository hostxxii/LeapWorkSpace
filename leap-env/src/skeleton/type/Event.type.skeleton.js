(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const Event_type_skeleton =   {
    "name": "Event.type",
    "ctorName": "Event",
    "instanceName": "",
    "brand": "Event",
    "ctorIllegal": false,
    "exposeCtor": true,
    "super": null,
    "props": {
      "NONE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "0"
      },
      "CAPTURING_PHASE": {
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
      "AT_TARGET": {
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
      "BUBBLING_PHASE": {
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
      "type": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Event",
            "propName": "type",
            "callType": "get"
          }
        }
      },
      "target": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Event",
            "propName": "target",
            "callType": "get"
          }
        }
      },
      "currentTarget": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Event",
            "propName": "currentTarget",
            "callType": "get"
          }
        }
      },
      "eventPhase": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Event",
            "propName": "eventPhase",
            "callType": "get"
          }
        }
      },
      "bubbles": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Event",
            "propName": "bubbles",
            "callType": "get"
          }
        }
      },
      "cancelable": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Event",
            "propName": "cancelable",
            "callType": "get"
          }
        }
      },
      "defaultPrevented": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Event",
            "propName": "defaultPrevented",
            "callType": "get"
          }
        }
      },
      "composed": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Event",
            "propName": "composed",
            "callType": "get"
          }
        }
      },
      "timeStamp": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Event",
            "propName": "timeStamp",
            "callType": "get"
          }
        }
      },
      "srcElement": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Event",
            "propName": "srcElement",
            "callType": "get"
          }
        }
      },
      "returnValue": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Event",
            "propName": "returnValue",
            "callType": "get"
          },
          "setter": {
            "objName": "Event",
            "propName": "returnValue",
            "callType": "set"
          }
        }
      },
      "cancelBubble": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Event",
            "propName": "cancelBubble",
            "callType": "get"
          },
          "setter": {
            "objName": "Event",
            "propName": "cancelBubble",
            "callType": "set"
          }
        }
      },
      "composedPath": {
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
          "objName": "Event",
          "propName": "composedPath",
          "callType": "apply"
        }
      },
      "initEvent": {
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
          "objName": "Event",
          "propName": "initEvent",
          "callType": "apply"
        }
      },
      "preventDefault": {
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
          "objName": "Event",
          "propName": "preventDefault",
          "callType": "apply"
        }
      },
      "stopImmediatePropagation": {
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
          "objName": "Event",
          "propName": "stopImmediatePropagation",
          "callType": "apply"
        }
      },
      "stopPropagation": {
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
          "objName": "Event",
          "propName": "stopPropagation",
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
        "value": "Event"
      }
    }
  };  leapenv.skeletonObjects.push(Event_type_skeleton);})(globalThis);
