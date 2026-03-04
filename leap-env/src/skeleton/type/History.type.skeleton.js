(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const History_type_skeleton =   {
    "name": "History.type",
    "ctorName": "History",
    "instanceName": "",
    "brand": "History",
    "ctorIllegal": true,
    "exposeCtor": true,
    "super": null,
    "props": {
      "length": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "History",
            "propName": "length",
            "callType": "get"
          }
        }
      },
      "scrollRestoration": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "History",
            "propName": "scrollRestoration",
            "callType": "get"
          },
          "setter": {
            "objName": "History",
            "propName": "scrollRestoration",
            "callType": "set"
          }
        }
      },
      "state": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "History",
            "propName": "state",
            "callType": "get"
          }
        }
      },
      "back": {
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
          "objName": "History",
          "propName": "back",
          "callType": "apply"
        }
      },
      "forward": {
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
          "objName": "History",
          "propName": "forward",
          "callType": "apply"
        }
      },
      "go": {
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
          "objName": "History",
          "propName": "go",
          "callType": "apply"
        }
      },
      "pushState": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 2,
        "brandCheck": true,
        "dispatch": {
          "objName": "History",
          "propName": "pushState",
          "callType": "apply"
        }
      },
      "replaceState": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 2,
        "brandCheck": true,
        "dispatch": {
          "objName": "History",
          "propName": "replaceState",
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
        "value": "History"
      }
    }
  };  leapenv.skeletonObjects.push(History_type_skeleton);})(globalThis);
