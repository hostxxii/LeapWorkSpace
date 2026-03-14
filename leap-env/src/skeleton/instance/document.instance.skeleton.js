(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const document_instance_skeleton =   {
    "name": "document.instance",
    "instanceName": "document",
    "brand": "HTMLDocument",
    "super": "HTMLDocument",
    "ctorName": "",
    "exposeCtor": false,
    "ctorIllegal": false,
    "props": {
      "location": {
        "owner": "instance",
        "attributes": {
          "enumerable": true,
          "configurable": false
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "HTMLDocument",
            "propName": "location",
            "callType": "get"
          },
          "setter": {
            "objName": "HTMLDocument",
            "propName": "location",
            "callType": "set"
          }
        }
      }
    }
  };  leapenv.skeletonObjects.push(document_instance_skeleton);})(globalThis);
