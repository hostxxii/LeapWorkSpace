(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const HTMLDivElement_type_skeleton =   {
    "name": "HTMLDivElement.type",
    "ctorName": "HTMLDivElement",
    "instanceName": "",
    "brand": "HTMLDivElement",
    "ctorIllegal": true,
    "exposeCtor": true,
    "super": "HTMLElement",
    "props": {
      "align": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "HTMLDivElement",
            "propName": "align",
            "callType": "get"
          },
          "setter": {
            "objName": "HTMLDivElement",
            "propName": "align",
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
        "value": "HTMLDivElement"
      }
    }
  };  leapenv.skeletonObjects.push(HTMLDivElement_type_skeleton);})(globalThis);
