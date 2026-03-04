(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const HTMLCollection_type_skeleton =   {
    "name": "HTMLCollection.type",
    "ctorName": "HTMLCollection",
    "instanceName": "",
    "brand": "HTMLCollection",
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
            "objName": "HTMLCollection",
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
          "objName": "HTMLCollection",
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
          "objName": "HTMLCollection",
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
        "value": "HTMLCollection"
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
          "objName": "HTMLCollection",
          "propName": "@@iterator",
          "callType": "apply"
        }
      }
    }
  };  leapenv.skeletonObjects.push(HTMLCollection_type_skeleton);})(globalThis);
