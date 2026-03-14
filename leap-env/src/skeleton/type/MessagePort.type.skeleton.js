(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const MessagePort_type_skeleton =   {
    "name": "MessagePort.type",
    "ctorName": "MessagePort",
    "instanceName": "",
    "brand": "MessagePort",
    "ctorIllegal": true,
    "exposeCtor": true,
    "super": "EventTarget",
    "props": {
      "onmessage": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "MessagePort",
            "propName": "onmessage",
            "callType": "get"
          },
          "setter": {
            "objName": "MessagePort",
            "propName": "onmessage",
            "callType": "set"
          }
        }
      },
      "onmessageerror": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "MessagePort",
            "propName": "onmessageerror",
            "callType": "get"
          },
          "setter": {
            "objName": "MessagePort",
            "propName": "onmessageerror",
            "callType": "set"
          }
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
          "objName": "MessagePort",
          "propName": "close",
          "callType": "apply"
        }
      },
      "postMessage": {
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
          "objName": "MessagePort",
          "propName": "postMessage",
          "callType": "apply"
        }
      },
      "start": {
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
          "objName": "MessagePort",
          "propName": "start",
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
        "value": "MessagePort"
      }
    }
  };  leapenv.skeletonObjects.push(MessagePort_type_skeleton);})(globalThis);
