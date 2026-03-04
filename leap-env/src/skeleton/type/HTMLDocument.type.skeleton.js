(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const HTMLDocument_type_skeleton =   {
    "name": "HTMLDocument.type",
    "ctorName": "HTMLDocument",
    "instanceName": "",
    "brand": "HTMLDocument",
    "ctorIllegal": true,
    "exposeCtor": true,
    "super": "Document",
    "props": {
      "@@toStringTag": {
        "owner": "prototype",
        "attributes": {
          "enumerable": false,
          "configurable": true,
          "writable": false
        },
        "kind": "data",
        "valueType": "string",
        "value": "HTMLDocument"
      }
    }
  };  leapenv.skeletonObjects.push(HTMLDocument_type_skeleton);})(globalThis);
