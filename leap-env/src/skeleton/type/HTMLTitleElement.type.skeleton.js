(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const HTMLTitleElement_type_skeleton =   {
    "name": "HTMLTitleElement.type",
    "ctorName": "HTMLTitleElement",
    "instanceName": "",
    "brand": "HTMLTitleElement",
    "ctorIllegal": true,
    "exposeCtor": true,
    "super": "HTMLElement",
    "props": {
      "text": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "HTMLTitleElement",
            "propName": "text",
            "callType": "get"
          },
          "setter": {
            "objName": "HTMLTitleElement",
            "propName": "text",
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
        "value": "HTMLTitleElement"
      }
    }
  };  leapenv.skeletonObjects.push(HTMLTitleElement_type_skeleton);})(globalThis);
