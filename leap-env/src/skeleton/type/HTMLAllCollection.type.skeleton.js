(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const HTMLAllCollection_type_skeleton =   {
    "name": "HTMLAllCollection.type",
    "ctorName": "HTMLAllCollection",
    "instanceName": "",
    "brand": "HTMLAllCollection",
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
            "objName": "HTMLAllCollection",
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
        "length": 0,
        "brandCheck": true,
        "dispatch": {
          "objName": "HTMLAllCollection",
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
          "objName": "HTMLAllCollection",
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
        "value": "HTMLAllCollection"
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
          "objName": "HTMLAllCollection",
          "propName": "@@iterator",
          "callType": "apply"
        }
      }
    }
  };  leapenv.skeletonObjects.push(HTMLAllCollection_type_skeleton);})(globalThis);
