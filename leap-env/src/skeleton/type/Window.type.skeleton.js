(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const Window_type_skeleton =   {
    "name": "Window.type",
    "ctorName": "Window",
    "instanceName": "",
    "brand": "Window",
    "ctorIllegal": true,
    "exposeCtor": true,
    "super": "WindowProperties",
    "props": {
      "TEMPORARY": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "0"
      },
      "PERSISTENT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "1"
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
        "value": "Window"
      }
    }
  };  leapenv.skeletonObjects.push(Window_type_skeleton);})(globalThis);
