(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const HTMLParagraphElement_type_skeleton =   {
    "name": "HTMLParagraphElement.type",
    "ctorName": "HTMLParagraphElement",
    "instanceName": "",
    "brand": "HTMLParagraphElement",
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
            "objName": "HTMLParagraphElement",
            "propName": "align",
            "callType": "get"
          },
          "setter": {
            "objName": "HTMLParagraphElement",
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
        "value": "HTMLParagraphElement"
      }
    }
  };  leapenv.skeletonObjects.push(HTMLParagraphElement_type_skeleton);})(globalThis);
