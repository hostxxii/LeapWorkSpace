(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const EventTarget_type_skeleton =   {
    "name": "EventTarget.type",
    "ctorName": "EventTarget",
    "instanceName": "",
    "brand": "EventTarget",
    "ctorIllegal": false,
    "exposeCtor": true,
    "super": null,
    "props": {
      "addEventListener": {
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
          "objName": "EventTarget",
          "propName": "addEventListener",
          "callType": "apply"
        }
      },
      "dispatchEvent": {
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
          "objName": "EventTarget",
          "propName": "dispatchEvent",
          "callType": "apply"
        }
      },
      "removeEventListener": {
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
          "objName": "EventTarget",
          "propName": "removeEventListener",
          "callType": "apply"
        }
      },
      "when": {
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
          "objName": "EventTarget",
          "propName": "when",
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
        "value": "EventTarget"
      }
    }
  };  leapenv.skeletonObjects.push(EventTarget_type_skeleton);})(globalThis);
