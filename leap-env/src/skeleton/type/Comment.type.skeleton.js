(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const Comment_type_skeleton =   {
    "name": "Comment.type",
    "ctorName": "Comment",
    "instanceName": "",
    "brand": "Comment",
    "ctorIllegal": false,
    "exposeCtor": true,
    "super": "CharacterData",
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
        "value": "Comment"
      }
    }
  };  leapenv.skeletonObjects.push(Comment_type_skeleton);})(globalThis);
