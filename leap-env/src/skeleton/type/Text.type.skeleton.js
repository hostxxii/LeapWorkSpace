(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const Text_type_skeleton =   {
    "name": "Text.type",
    "ctorName": "Text",
    "instanceName": "",
    "brand": "Text",
    "ctorIllegal": false,
    "exposeCtor": true,
    "super": "CharacterData",
    "props": {
      "wholeText": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Text",
            "propName": "wholeText",
            "callType": "get"
          }
        }
      },
      "assignedSlot": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Text",
            "propName": "assignedSlot",
            "callType": "get"
          }
        }
      },
      "splitText": {
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
          "objName": "Text",
          "propName": "splitText",
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
        "value": "Text"
      }
    }
  };  leapenv.skeletonObjects.push(Text_type_skeleton);})(globalThis);
