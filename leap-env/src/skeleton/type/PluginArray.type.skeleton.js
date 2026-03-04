(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const PluginArray_type_skeleton =   {
    "name": "PluginArray.type",
    "ctorName": "PluginArray",
    "instanceName": "",
    "brand": "PluginArray",
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
            "objName": "PluginArray",
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
          "objName": "PluginArray",
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
          "objName": "PluginArray",
          "propName": "namedItem",
          "callType": "apply"
        }
      },
      "refresh": {
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
          "objName": "PluginArray",
          "propName": "refresh",
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
        "value": "PluginArray"
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
          "objName": "PluginArray",
          "propName": "@@iterator",
          "callType": "apply"
        }
      }
    }
  };  leapenv.skeletonObjects.push(PluginArray_type_skeleton);})(globalThis);
