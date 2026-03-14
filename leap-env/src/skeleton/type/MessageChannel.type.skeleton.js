(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const MessageChannel_type_skeleton =   {
    "name": "MessageChannel.type",
    "ctorName": "MessageChannel",
    "instanceName": "",
    "brand": "MessageChannel",
    "ctorIllegal": false,
    "exposeCtor": true,
    "super": null,
    "props": {
      "port1": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "MessageChannel",
            "propName": "port1",
            "callType": "get"
          }
        }
      },
      "port2": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "MessageChannel",
            "propName": "port2",
            "callType": "get"
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
        "value": "MessageChannel"
      }
    }
  };  leapenv.skeletonObjects.push(MessageChannel_type_skeleton);})(globalThis);
