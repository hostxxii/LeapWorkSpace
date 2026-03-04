(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const Storage_type_skeleton =   {
    "name": "Storage.type",
    "ctorName": "Storage",
    "instanceName": "",
    "brand": "Storage",
    "ctorIllegal": true,
    "exposeCtor": true,
    "super": null,
    "props": {
      "length": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Storage",
            "propName": "length",
            "callType": "get"
          }
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
          "objName": "Storage",
          "propName": "clear",
          "callType": "apply"
        }
      },
      "getItem": {
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
          "objName": "Storage",
          "propName": "getItem",
          "callType": "apply"
        }
      },
      "key": {
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
          "objName": "Storage",
          "propName": "key",
          "callType": "apply"
        }
      },
      "removeItem": {
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
          "objName": "Storage",
          "propName": "removeItem",
          "callType": "apply"
        }
      },
      "setItem": {
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
          "objName": "Storage",
          "propName": "setItem",
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
        "value": "Storage"
      }
    }
  };  leapenv.skeletonObjects.push(Storage_type_skeleton);})(globalThis);
