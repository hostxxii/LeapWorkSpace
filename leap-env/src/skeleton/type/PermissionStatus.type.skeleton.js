(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const PermissionStatus_type_skeleton =   {
    "name": "PermissionStatus.type",
    "ctorName": "PermissionStatus",
    "instanceName": "",
    "brand": "PermissionStatus",
    "ctorIllegal": true,
    "exposeCtor": true,
    "super": "EventTarget",
    "props": {
      "name": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "PermissionStatus",
            "propName": "name",
            "callType": "get"
          }
        }
      },
      "state": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "PermissionStatus",
            "propName": "state",
            "callType": "get"
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
            "objName": "PermissionStatus",
            "propName": "onchange",
            "callType": "get"
          },
          "setter": {
            "objName": "PermissionStatus",
            "propName": "onchange",
            "callType": "set"
          }
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
        "value": "PermissionStatus"
      }
    }
  };  leapenv.skeletonObjects.push(PermissionStatus_type_skeleton);})(globalThis);
