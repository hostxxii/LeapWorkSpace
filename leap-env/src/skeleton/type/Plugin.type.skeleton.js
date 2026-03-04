(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const Plugin_type_skeleton =   {
    "name": "Plugin.type",
    "ctorName": "Plugin",
    "instanceName": "",
    "brand": "Plugin",
    "ctorIllegal": true,
    "exposeCtor": true,
    "super": null,
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
            "objName": "Plugin",
            "propName": "name",
            "callType": "get"
          }
        }
      },
      "filename": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Plugin",
            "propName": "filename",
            "callType": "get"
          }
        }
      },
      "description": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Plugin",
            "propName": "description",
            "callType": "get"
          }
        }
      },
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
            "objName": "Plugin",
            "propName": "length",
            "callType": "get"
          }
        }
      },
      "item": {
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
          "objName": "Plugin",
          "propName": "item",
          "callType": "apply"
        }
      },
      "namedItem": {
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
          "objName": "Plugin",
          "propName": "namedItem",
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
        "value": "Plugin"
      },
      "@@iterator": {
        "owner": "prototype",
        "attributes": {
          "enumerable": false,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": false,
        "dispatch": {
          "objName": "Plugin",
          "propName": "@@iterator",
          "callType": "apply"
        }
      }
    }
  };  leapenv.skeletonObjects.push(Plugin_type_skeleton);})(globalThis);
