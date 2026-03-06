(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const Crypto_type_skeleton =   {
    "name": "Crypto.type",
    "ctorName": "Crypto",
    "instanceName": "",
    "brand": "Crypto",
    "ctorIllegal": true,
    "exposeCtor": true,
    "super": null,
    "props": {
      "getRandomValues": {
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
          "objName": "Crypto",
          "propName": "getRandomValues",
          "callType": "apply"
        }
      },
      "subtle": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Crypto",
            "propName": "subtle",
            "callType": "get"
          }
        }
      },
      "randomUUID": {
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
          "objName": "Crypto",
          "propName": "randomUUID",
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
        "value": "Crypto"
      }
    }
  };  leapenv.skeletonObjects.push(Crypto_type_skeleton);})(globalThis);