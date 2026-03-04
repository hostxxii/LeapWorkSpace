(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const NodeList_type_skeleton =   {
    "name": "NodeList.type",
    "ctorName": "NodeList",
    "instanceName": "",
    "brand": "NodeList",
    "ctorIllegal": true,
    "exposeCtor": true,
    "super": null,
    "props": {
      "entries": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": false,
        "dispatch": {
          "objName": "NodeList",
          "propName": "entries",
          "callType": "apply"
        }
      },
      "keys": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": false,
        "dispatch": {
          "objName": "NodeList",
          "propName": "keys",
          "callType": "apply"
        }
      },
      "values": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": false,
        "dispatch": {
          "objName": "NodeList",
          "propName": "values",
          "callType": "apply"
        }
      },
      "forEach": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 1,
        "brandCheck": false,
        "dispatch": {
          "objName": "NodeList",
          "propName": "forEach",
          "callType": "apply"
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
            "objName": "NodeList",
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
          "objName": "NodeList",
          "propName": "item",
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
        "value": "NodeList"
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
          "objName": "NodeList",
          "propName": "@@iterator",
          "callType": "apply"
        }
      }
    }
  };  leapenv.skeletonObjects.push(NodeList_type_skeleton);})(globalThis);
